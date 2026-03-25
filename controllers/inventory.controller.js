const Product = require('../models/Product');
const InventoryLog = require('../models/InventoryLog');
const { createAuditLog } = require('../services/audit.service');
const { emitEvent, emitToWarehouse, EVENTS } = require('../services/socket.service');
const { createNotification } = require('../services/notification.service');
const { sendLowStockAlert } = require('../services/email.service');
const { getPaginationMeta } = require('../utils/helpers');
const { deleteCacheByPattern } = require('../services/cache.service');
const User = require('../models/User');
const { z } = require('zod');

const logSchema = z.object({
  product: z.string().min(1),
  type: z.enum(['in', 'out', 'adjust', 'return', 'damaged']),
  quantity: z.number().int().min(1),
  reason: z.string().optional(),
  batch: z.string().optional(),
});

const transferSchema = z.object({
  product: z.string().min(1),
  fromWarehouse: z.string().min(1),
  toWarehouse: z.string().min(1),
  quantity: z.number().int().min(1),
  reason: z.string().optional(),
});

/**
 * POST /api/inventory/log — Stock In/Out/Adjust/Return/Damaged
 */
const createLog = async (req, res, next) => {
  try {
    const data = logSchema.parse(req.body);
    const warehouseId = req.user.warehouseId?._id || req.user.warehouseId;

    const product = await Product.findOne({ _id: data.product, ...req.warehouseFilter });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const previousQty = product.stockQty;
    let newQty;

    switch (data.type) {
      case 'in':
      case 'return':
        newQty = previousQty + data.quantity;
        break;
      case 'out':
      case 'damaged':
        if (previousQty < data.quantity) {
          return res.status(400).json({ success: false, message: 'Insufficient stock' });
        }
        newQty = previousQty - data.quantity;
        break;
      case 'adjust':
        newQty = data.quantity; // Direct set
        break;
      default:
        newQty = previousQty;
    }

    product.stockQty = newQty;
    await product.save();

    const log = await InventoryLog.create({
      product: product._id,
      warehouseId,
      type: data.type,
      quantity: data.quantity,
      previousQty,
      newQty,
      reason: data.reason || '',
      batch: data.batch || '',
      performedBy: req.user._id,
    });

    // Low stock alert — notify admins in the same warehouse
    if (newQty <= product.reorderLevel) {
      const admins = await User.find({
        role: { $in: ['admin', 'manager'] },
        warehouseId,
        isActive: true,
      }).select('_id email');

      for (const admin of admins) {
        await createNotification({
          userId: admin._id,
          title: 'Low Stock Alert',
          message: `${product.name} (SKU: ${product.sku}) stock is at ${newQty}, below reorder level of ${product.reorderLevel}`,
          type: 'low_stock',
          metadata: { productId: product._id, stockQty: newQty, reorderLevel: product.reorderLevel },
        });
      }
      emitEvent(EVENTS.ALERT_LOW_STOCK, { product: product._id, name: product.name, stockQty: newQty, reorderLevel: product.reorderLevel });

      // Send email
      const emails = admins.map((a) => a.email).filter(Boolean);
      if (emails.length > 0) sendLowStockAlert(product, emails.join(','));
    }

    emitEvent(EVENTS.STOCK_UPDATED, { product: product._id, type: data.type, previousQty, newQty });
    await deleteCacheByPattern('products:*');

    res.status(201).json({ success: true, message: 'Inventory log created', data: { log, product: { _id: product._id, stockQty: newQty } } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/inventory/transfer — Inter-warehouse transfer
 */
const transfer = async (req, res, next) => {
  try {
    const data = transferSchema.parse(req.body);
    if (data.fromWarehouse === data.toWarehouse) {
      return res.status(400).json({ success: false, message: 'Cannot transfer to same warehouse' });
    }

    const warehouseId = req.user.warehouseId?._id || req.user.warehouseId;
    const product = await Product.findOne({ _id: data.product, ...req.warehouseFilter });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    if (product.stockQty < data.quantity) {
      return res.status(400).json({ success: false, message: 'Insufficient stock for transfer' });
    }

    const previousQty = product.stockQty;
    // Stock doesn't change globally, just moves between warehouses
    const log = await InventoryLog.create({
      product: product._id,
      warehouseId,
      type: 'transfer',
      quantity: data.quantity,
      previousQty,
      newQty: previousQty,
      reason: data.reason || 'Inter-warehouse transfer',
      fromWarehouse: data.fromWarehouse,
      toWarehouse: data.toWarehouse,
      performedBy: req.user._id,
    });

    emitEvent(EVENTS.TRANSFER_INITIATED, {
      product: product._id, from: data.fromWarehouse, to: data.toWarehouse, quantity: data.quantity,
    });

    await createAuditLog({
      user: req.user, action: 'transfer', entity: 'Inventory', entityId: log._id,
      changes: { after: { from: data.fromWarehouse, to: data.toWarehouse, qty: data.quantity } }, req,
    });

    res.status(201).json({ success: true, message: 'Transfer initiated', data: { log } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/inventory/logs
 */
const getLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, product, type, startDate, endDate } = req.query;
    const filter = { ...req.warehouseFilter };
    if (product) filter.product = product;
    if (type) filter.type = type;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      InventoryLog.find(filter)
        .populate('product', 'name sku')
        .populate('warehouseId', 'name code')
        .populate('fromWarehouse', 'name code')
        .populate('toWarehouse', 'name code')
        .populate('performedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      InventoryLog.countDocuments(filter),
    ]);

    res.json({ success: true, data: { logs, pagination: getPaginationMeta(total, parseInt(page), parseInt(limit)) } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/inventory/alerts — Low stock + expiry alerts
 */
const getAlerts = async (req, res, next) => {
  try {
    const productFilter = { isActive: true, ...req.warehouseFilter };

    const lowStock = await Product.find({
      ...productFilter,
      $expr: { $lte: ['$stockQty', '$reorderLevel'] },
    }).populate('category', 'name').sort({ stockQty: 1 }).limit(50);

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringSoon = await Product.find({
      ...productFilter,
      expiryDate: { $lte: thirtyDaysFromNow, $gte: new Date() },
    }).populate('category', 'name').sort({ expiryDate: 1 }).limit(50);

    const expired = await Product.find({
      ...productFilter,
      expiryDate: { $lt: new Date() },
    }).populate('category', 'name').sort({ expiryDate: 1 }).limit(50);

    res.json({
      success: true,
      data: { lowStock, expiringSoon, expired },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { createLog, transfer, getLogs, getAlerts };

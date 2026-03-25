const PurchaseOrder = require('../models/PurchaseOrder');
const Product = require('../models/Product');
const InventoryLog = require('../models/InventoryLog');
const { createAuditLog } = require('../services/audit.service');
const { emitEvent, EVENTS } = require('../services/socket.service');
const { createNotification } = require('../services/notification.service');
const { generateDocNumber, getPaginationMeta } = require('../utils/helpers');
const User = require('../models/User');
const { z } = require('zod');

const poSchema = z.object({
  supplier: z.string().min(1),
  items: z.array(z.object({
    product: z.string().min(1),
    quantity: z.number().int().min(1),
    unitPrice: z.number().min(0),
    tax: z.number().min(0).optional(),
  })).min(1),
  deliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

const getPurchaseOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, supplier } = req.query;
    const filter = { ...req.warehouseFilter };
    if (status) filter.status = status;
    if (supplier) filter.supplier = supplier;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      PurchaseOrder.find(filter)
        .populate('supplier', 'name')
        .populate('items.product', 'name sku')
        .populate('createdBy', 'name')
        .populate('approvedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      PurchaseOrder.countDocuments(filter),
    ]);

    res.json({ success: true, data: { orders, pagination: getPaginationMeta(total, parseInt(page), parseInt(limit)) } });
  } catch (error) { next(error); }
};

const getPurchaseOrder = async (req, res, next) => {
  try {
    const order = await PurchaseOrder.findOne({ _id: req.params.id, ...req.warehouseFilter })
      .populate('supplier', 'name contactPerson email phone')
      .populate('items.product', 'name sku barcode stockQty')
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name');
    if (!order) return res.status(404).json({ success: false, message: 'Purchase order not found' });
    res.json({ success: true, data: { order } });
  } catch (error) { next(error); }
};

const createPurchaseOrder = async (req, res, next) => {
  try {
    const data = poSchema.parse(req.body);
    const warehouseId = req.user.warehouseId?._id || req.user.warehouseId;

    // Calculate totals
    data.items = data.items.map((item) => {
      const tax = item.tax || 0;
      const total = (item.quantity * item.unitPrice) * (1 + tax / 100);
      return { ...item, tax, total };
    });
    data.totalAmount = data.items.reduce((sum, item) => sum + item.total, 0);

    data.poNumber = await generateDocNumber(PurchaseOrder, 'PO', 'poNumber');
    data.createdBy = req.user._id;
    data.warehouseId = warehouseId;
    data.status = 'pending';

    const order = await PurchaseOrder.create(data);

    // Notify admins in the same warehouse for approval
    const admins = await User.find({
      role: { $in: ['admin', 'manager'] },
      warehouseId,
      isActive: true,
    }).select('_id');
    for (const admin of admins) {
      await createNotification({
        userId: admin._id,
        title: 'New Purchase Order',
        message: `Purchase Order ${order.poNumber} requires approval. Total: ₹${order.totalAmount.toFixed(2)}`,
        type: 'purchase',
        metadata: { poId: order._id },
      });
    }

    emitEvent(EVENTS.ORDER_CREATED, { order: order._id, poNumber: order.poNumber });

    await createAuditLog({ user: req.user, action: 'create', entity: 'PurchaseOrder', entityId: order._id, changes: { after: order.toObject() }, req });

    res.status(201).json({ success: true, message: 'Purchase order created', data: { order } });
  } catch (error) { next(error); }
};

const approvePurchaseOrder = async (req, res, next) => {
  try {
    const order = await PurchaseOrder.findOne({ _id: req.params.id, ...req.warehouseFilter });
    if (!order) return res.status(404).json({ success: false, message: 'Purchase order not found' });
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Cannot approve order with status: ${order.status}` });
    }

    order.status = 'approved';
    order.approvedBy = req.user._id;
    order.approvedAt = new Date();
    await order.save();

    emitEvent(EVENTS.PURCHASE_APPROVED, { order: order._id, poNumber: order.poNumber });

    await createAuditLog({ user: req.user, action: 'approve', entity: 'PurchaseOrder', entityId: order._id, req });

    res.json({ success: true, message: 'Purchase order approved', data: { order } });
  } catch (error) { next(error); }
};

const receivePurchaseOrder = async (req, res, next) => {
  try {
    const order = await PurchaseOrder.findOne({ _id: req.params.id, ...req.warehouseFilter }).populate('items.product');
    if (!order) return res.status(404).json({ success: false, message: 'Purchase order not found' });
    if (order.status !== 'approved') {
      return res.status(400).json({ success: false, message: `Cannot receive order with status: ${order.status}` });
    }

    const warehouseId = req.user.warehouseId?._id || req.user.warehouseId;

    // Update stock for each item
    for (const item of order.items) {
      const product = await Product.findById(item.product._id || item.product);
      if (product) {
        const previousQty = product.stockQty;
        product.stockQty += item.quantity;
        await product.save();

        await InventoryLog.create({
          product: product._id,
          warehouseId,
          type: 'in',
          quantity: item.quantity,
          previousQty,
          newQty: product.stockQty,
          reason: `Received from PO: ${order.poNumber}`,
          reference: order.poNumber,
          performedBy: req.user._id,
        });
      }
    }

    order.status = 'received';
    order.receivedAt = new Date();
    await order.save();

    emitEvent(EVENTS.STOCK_UPDATED, { source: 'purchase_order', poNumber: order.poNumber });

    res.json({ success: true, message: 'Purchase order received and stock updated', data: { order } });
  } catch (error) { next(error); }
};

const cancelPurchaseOrder = async (req, res, next) => {
  try {
    const order = await PurchaseOrder.findOne({ _id: req.params.id, ...req.warehouseFilter });
    if (!order) return res.status(404).json({ success: false, message: 'Purchase order not found' });
    if (['received', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel order with status: ${order.status}` });
    }

    order.status = 'cancelled';
    await order.save();

    await createAuditLog({ user: req.user, action: 'reject', entity: 'PurchaseOrder', entityId: order._id, req });

    res.json({ success: true, message: 'Purchase order cancelled', data: { order } });
  } catch (error) { next(error); }
};

module.exports = { getPurchaseOrders, getPurchaseOrder, createPurchaseOrder, approvePurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder };

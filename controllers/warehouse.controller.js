const Warehouse = require('../models/Warehouse');
const Product = require('../models/Product');
const InventoryLog = require('../models/InventoryLog');
const { createAuditLog } = require('../services/audit.service');
const { getPaginationMeta } = require('../utils/helpers');
const { z } = require('zod');

const warehouseSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  manager: z.string().optional(),
  capacity: z.number().min(0).optional(),
  zones: z.array(z.object({
    name: z.string(),
    racks: z.array(z.object({
      name: z.string(),
      shelves: z.array(z.string()).optional(),
    })).optional(),
  })).optional(),
});

/**
 * GET /api/warehouses
 * super_admin: see all; others: own warehouse only
 */
const getWarehouses = async (req, res, next) => {
  try {
    let filter = { isActive: true };
    // Non-super_admin can only see their own warehouse
    if (req.user.role !== 'super_admin') {
      const warehouseId = req.user.warehouseId?._id || req.user.warehouseId;
      filter._id = warehouseId;
    }

    const warehouses = await Warehouse.find(filter)
      .populate('manager', 'name email')
      .sort({ name: 1 });
    res.json({ success: true, data: { warehouses } });
  } catch (error) { next(error); }
};

const getWarehouse = async (req, res, next) => {
  try {
    // Non-super_admin can only view their own warehouse
    if (req.user.role !== 'super_admin') {
      const userWarehouseId = (req.user.warehouseId?._id || req.user.warehouseId)?.toString();
      if (req.params.id !== userWarehouseId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const warehouse = await Warehouse.findById(req.params.id).populate('manager', 'name email');
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });

    // Get stats
    const productCount = await Product.countDocuments({ warehouseId: warehouse._id, isActive: true });
    const totalStock = await Product.aggregate([
      { $match: { warehouseId: warehouse._id, isActive: true } },
      { $group: { _id: null, total: { $sum: '$stockQty' }, value: { $sum: { $multiply: ['$stockQty', '$sellingPrice'] } } } },
    ]);

    const recentLogs = await InventoryLog.find({ warehouseId: warehouse._id })
      .populate('product', 'name sku')
      .populate('performedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      data: {
        warehouse,
        stats: {
          productCount,
          totalStock: totalStock[0]?.total || 0,
          stockValue: totalStock[0]?.value || 0,
        },
        recentLogs,
      },
    });
  } catch (error) { next(error); }
};

/**
 * POST /api/warehouses — super_admin only (enforced by route-level RBAC)
 */
const createWarehouse = async (req, res, next) => {
  try {
    const data = warehouseSchema.parse(req.body);
    const warehouse = await Warehouse.create(data);
    await createAuditLog({ user: req.user, action: 'create', entity: 'Warehouse', entityId: warehouse._id, changes: { after: warehouse.toObject() }, req });
    res.status(201).json({ success: true, message: 'Warehouse created', data: { warehouse } });
  } catch (error) { next(error); }
};

const updateWarehouse = async (req, res, next) => {
  try {
    const data = warehouseSchema.partial().parse(req.body);
    const warehouse = await Warehouse.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });
    res.json({ success: true, message: 'Warehouse updated', data: { warehouse } });
  } catch (error) { next(error); }
};

const deleteWarehouse = async (req, res, next) => {
  try {
    const productCount = await Product.countDocuments({ warehouseId: req.params.id, isActive: true });
    if (productCount > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete warehouse with active products' });
    }
    const warehouse = await Warehouse.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });
    await createAuditLog({ user: req.user, action: 'delete', entity: 'Warehouse', entityId: warehouse._id, req });
    res.json({ success: true, message: 'Warehouse deleted' });
  } catch (error) { next(error); }
};

module.exports = { getWarehouses, getWarehouse, createWarehouse, updateWarehouse, deleteWarehouse };

const Supplier = require('../models/Supplier');
const { createAuditLog } = require('../services/audit.service');
const { getPaginationMeta } = require('../utils/helpers');
const { z } = require('zod');

const supplierSchema = z.object({
  name: z.string().min(1).max(200),
  contactPerson: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  gstNumber: z.string().optional(),
});

const getSuppliers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = { isActive: true };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [suppliers, total] = await Promise.all([
      Supplier.find(filter).sort({ name: 1 }).skip(skip).limit(parseInt(limit)),
      Supplier.countDocuments(filter),
    ]);
    res.json({ success: true, data: { suppliers, pagination: getPaginationMeta(total, parseInt(page), parseInt(limit)) } });
  } catch (error) { next(error); }
};

const getSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
    res.json({ success: true, data: { supplier } });
  } catch (error) { next(error); }
};

const createSupplier = async (req, res, next) => {
  try {
    const data = supplierSchema.parse(req.body);
    const supplier = await Supplier.create(data);
    await createAuditLog({ user: req.user, action: 'create', entity: 'Supplier', entityId: supplier._id, changes: { after: supplier.toObject() }, req });
    res.status(201).json({ success: true, message: 'Supplier created', data: { supplier } });
  } catch (error) { next(error); }
};

const updateSupplier = async (req, res, next) => {
  try {
    const data = supplierSchema.partial().parse(req.body);
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
    res.json({ success: true, message: 'Supplier updated', data: { supplier } });
  } catch (error) { next(error); }
};

const deleteSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
    await createAuditLog({ user: req.user, action: 'delete', entity: 'Supplier', entityId: supplier._id, req });
    res.json({ success: true, message: 'Supplier deleted' });
  } catch (error) { next(error); }
};

module.exports = { getSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier };

const Brand = require('../models/Brand');
const { createAuditLog } = require('../services/audit.service');
const { z } = require('zod');

const brandSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

const getBrands = async (req, res, next) => {
  try {
    const brands = await Brand.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, data: { brands } });
  } catch (error) { next(error); }
};

const getBrand = async (req, res, next) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    res.json({ success: true, data: { brand } });
  } catch (error) { next(error); }
};

const createBrand = async (req, res, next) => {
  try {
    const data = brandSchema.parse(req.body);
    const brand = await Brand.create(data);
    await createAuditLog({ user: req.user, action: 'create', entity: 'Brand', entityId: brand._id, changes: { after: brand.toObject() }, req });
    res.status(201).json({ success: true, message: 'Brand created', data: { brand } });
  } catch (error) { next(error); }
};

const updateBrand = async (req, res, next) => {
  try {
    const data = brandSchema.partial().parse(req.body);
    const brand = await Brand.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    res.json({ success: true, message: 'Brand updated', data: { brand } });
  } catch (error) { next(error); }
};

const deleteBrand = async (req, res, next) => {
  try {
    const brand = await Brand.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    await createAuditLog({ user: req.user, action: 'delete', entity: 'Brand', entityId: brand._id, req });
    res.json({ success: true, message: 'Brand deleted' });
  } catch (error) { next(error); }
};

module.exports = { getBrands, getBrand, createBrand, updateBrand, deleteBrand };

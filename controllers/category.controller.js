const Category = require('../models/Category');
const { createAuditLog } = require('../services/audit.service');
const { z } = require('zod');

const categorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

const getCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, data: { categories } });
  } catch (error) { next(error); }
};

const getCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: { category } });
  } catch (error) { next(error); }
};

const createCategory = async (req, res, next) => {
  try {
    const data = categorySchema.parse(req.body);
    const category = await Category.create(data);
    await createAuditLog({ user: req.user, action: 'create', entity: 'Category', entityId: category._id, changes: { after: category.toObject() }, req });
    res.status(201).json({ success: true, message: 'Category created', data: { category } });
  } catch (error) { next(error); }
};

const updateCategory = async (req, res, next) => {
  try {
    const data = categorySchema.partial().parse(req.body);
    const category = await Category.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, message: 'Category updated', data: { category } });
  } catch (error) { next(error); }
};

const deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    await createAuditLog({ user: req.user, action: 'delete', entity: 'Category', entityId: category._id, req });
    res.json({ success: true, message: 'Category deleted' });
  } catch (error) { next(error); }
};

module.exports = { getCategories, getCategory, createCategory, updateCategory, deleteCategory };

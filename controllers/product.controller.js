const Product = require('../models/Product');
const Category = require('../models/Category');
const { cloudinary } = require('../config/cloudinary');
const { generateSKU, generateBarcode, getPaginationMeta } = require('../utils/helpers');
const { createAuditLog } = require('../services/audit.service');
const { getCache, setCache, deleteCacheByPattern } = require('../services/cache.service');
const { emitEvent, EVENTS } = require('../services/socket.service');
const { createNotification } = require('../services/notification.service');
const { z } = require('zod');
const csv = require('csv-parser');
const { Readable } = require('stream');
const streamifier = require('streamifier');

const normalizeBarcode = (value) => String(value || '').trim();

// Helper: strip empty strings from optional ObjectId fields
const REF_FIELDS = ['brand', 'supplier', 'category'];
const cleanRefFields = (obj) => {
  for (const field of REF_FIELDS) {
    if (obj[field] === '' || obj[field] === null || obj[field] === undefined) {
      delete obj[field];
    }
  }
  return obj;
};

const productSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1),
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  brand: z.string().optional(),
  supplier: z.string().optional(),
  description: z.string().optional(),
  stockQty: z.number().min(0).optional(),
  reorderLevel: z.number().min(0).optional(),
  expiryDate: z.string().optional(),
  warehouseLocation: z.object({
    zone: z.string().optional(),
    rack: z.string().optional(),
    shelf: z.string().optional(),
  }).optional(),
});

/**
 * GET /api/products
 */
const getProducts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, brand, supplier, search, sortBy = 'createdAt', order = 'desc', lowStock } = req.query;

    // Check cache (scoped by warehouse)
    const cacheKey = `products:${req.warehouseId || 'all'}:${JSON.stringify(req.query)}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const filter = { isActive: true, ...req.warehouseFilter };
    if (category) filter.category = category;
    if (brand) filter.brand = brand;
    if (supplier) filter.supplier = supplier;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
      ];
    }
    if (lowStock === 'true') {
      filter.$expr = { $lte: ['$stockQty', '$reorderLevel'] };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name')
        .populate('brand', 'name')
        .populate('supplier', 'name')
        .populate('warehouseId', 'name code')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(parseInt(limit)),
      Product.countDocuments(filter),
    ]);

    const response = {
      success: true,
      data: { products, pagination: getPaginationMeta(total, parseInt(page), parseInt(limit)) },
    };

    await setCache(cacheKey, response, 60);
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/products/:id
 */
const getProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, ...req.warehouseFilter })
      .populate('category', 'name')
      .populate('brand', 'name')
      .populate('supplier', 'name contactPerson email phone')
      .populate('warehouseId', 'name code address');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: { product } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/products
 */
const createProduct = async (req, res, next) => {
  try {
    const data = cleanRefFields(productSchema.parse(req.body));

    // Auto-assign warehouseId from authenticated user
    data.warehouseId = req.user.warehouseId?._id || req.user.warehouseId;

    // Generate SKU
    const category = await Category.findById(data.category);
    const prefix = category ? category.name.substring(0, 3) : 'GEN';
    data.sku = generateSKU(prefix);
    data.barcode = generateBarcode();

    // Upload images to Cloudinary
    if (req.files && req.files.length > 0) {
      data.images = [];
      for (const file of req.files) {
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'invento/products', transformation: [{ width: 800, height: 800, crop: 'limit' }] },
            (error, result) => error ? reject(error) : resolve(result)
          );
          streamifier.createReadStream(file.buffer).pipe(stream);
        });
        data.images.push({ url: result.secure_url, publicId: result.public_id });
      }
    }

    const product = await Product.create(data);
    await product.populate('category', 'name');

    await createAuditLog({
      user: req.user, action: 'create', entity: 'Product', entityId: product._id,
      changes: { after: product.toObject() }, req,
    });

    await deleteCacheByPattern('products:*');
    emitEvent(EVENTS.STOCK_UPDATED, { product: product._id, action: 'created' });

    res.status(201).json({ success: true, message: 'Product created', data: { product } });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/products/:id
 */
const updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, ...req.warehouseFilter });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const before = product.toObject();

    // Handle image uploads
    if (req.files && req.files.length > 0) {
      const newImages = [];
      for (const file of req.files) {
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'invento/products', transformation: [{ width: 800, height: 800, crop: 'limit' }] },
            (error, result) => error ? reject(error) : resolve(result)
          );
          streamifier.createReadStream(file.buffer).pipe(stream);
        });
        newImages.push({ url: result.secure_url, publicId: result.public_id });
      }
      req.body.images = [...(product.images || []), ...newImages];
    }

    const updateData = cleanRefFields({ ...req.body });
    // Never allow warehouseId override from body
    delete updateData.warehouseId;
    Object.assign(product, updateData);
    await product.save();

    await createAuditLog({
      user: req.user, action: 'update', entity: 'Product', entityId: product._id,
      changes: { before, after: product.toObject() }, req,
    });

    await deleteCacheByPattern('products:*');
    res.json({ success: true, message: 'Product updated', data: { product } });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/products/:id (soft delete)
 */
const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, ...req.warehouseFilter },
      { isActive: false },
      { new: true }
    );
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    await createAuditLog({
      user: req.user, action: 'delete', entity: 'Product', entityId: product._id,
      changes: { before: { isActive: true }, after: { isActive: false } }, req,
    });

    await deleteCacheByPattern('products:*');
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/products/bulk-import (CSV)
 */
const bulkImport = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'CSV file required' });

    const warehouseId = req.user.warehouseId?._id || req.user.warehouseId;
    const products = [];
    const errors = [];
    let rowNum = 0;

    await new Promise((resolve, reject) => {
      const stream = streamifier.createReadStream(req.file.buffer);
      stream
        .pipe(csv())
        .on('data', (row) => {
          rowNum++;
          try {
            products.push({
              name: row.name,
              category: row.category,
              purchasePrice: parseFloat(row.purchasePrice) || 0,
              sellingPrice: parseFloat(row.sellingPrice) || 0,
              stockQty: parseInt(row.stockQty) || 0,
              reorderLevel: parseInt(row.reorderLevel) || 10,
              sku: generateSKU(row.category?.substring(0, 3) || 'GEN'),
              barcode: generateBarcode(),
              description: row.description || '',
              warehouseId,
            });
          } catch (err) {
            errors.push({ row: rowNum, error: err.message });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    const inserted = await Product.insertMany(products, { ordered: false }).catch((err) => {
      if (err.insertedDocs) return err.insertedDocs;
      throw err;
    });

    await deleteCacheByPattern('products:*');

    res.json({
      success: true,
      message: `Imported ${Array.isArray(inserted) ? inserted.length : 0} products`,
      data: { imported: Array.isArray(inserted) ? inserted.length : 0, errors },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/products/barcode/:barcode
 */
const getByBarcode = async (req, res, next) => {
  try {
    const normalizedBarcode = normalizeBarcode(req.params.barcode);
    const product = await Product.findOne({
      isActive: true,
      ...req.warehouseFilter,
      $or: [
        { barcode: normalizedBarcode },
        { barcode: req.params.barcode },
      ],
    })
      .populate('category', 'name')
      .populate('brand', 'name')
      .populate('supplier', 'name')
      .populate('warehouseId', 'name code');

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: { product } });
  } catch (error) {
    next(error);
  }
};

module.exports = { getProducts, getProduct, createProduct, updateProduct, deleteProduct, bulkImport, getByBarcode };

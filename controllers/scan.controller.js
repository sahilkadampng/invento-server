const Product = require('../models/Product');
const Category = require('../models/Category');
const { generateSKU, generateBarcode: generateBarcodeNumber } = require('../utils/helpers');
const { createAuditLog } = require('../services/audit.service');
const { deleteCacheByPattern } = require('../services/cache.service');
const { emitEvent, EVENTS } = require('../services/socket.service');
const { z } = require('zod');

const scanSchema = z.object({
  barcode: z.string().min(4, 'Barcode must be at least 4 characters').max(128),
});

const scanDetailsSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(200),
  category: z.string().min(1, 'Category is required'),
  purchasePrice: z.number().min(0, 'Purchase price must be at least 0'),
  sellingPrice: z.number().min(0, 'Selling price must be at least 0'),
});

/**
 * POST /api/scan
 * Receive a barcode from the camera scanner.
 *  - If product exists (in this warehouse) → increment stockQty by 1
 *  - If product is new → create with sensible defaults
 */
const processScan = async (req, res, next) => {
  try {
    const { barcode } = scanSchema.parse(req.body);
    const warehouseId = req.user.warehouseId?._id || req.user.warehouseId;

    // 1. Try to find existing product in this warehouse
    let product = await Product.findOne({ barcode, isActive: true, ...req.warehouseFilter });
    let isNew = false;

    if (product) {
      // ── Existing product → increment stock ──
      product.stockQty += 1;
      await product.save();
    } else {
      // ── New product → find/create "Uncategorized" category, then create product ──
      isNew = true;

      let category = await Category.findOne({ slug: 'uncategorized' });
      if (!category) {
        category = await Category.create({
          name: 'Uncategorized',
          description: 'Auto-created category for scanned products',
        });
      }

      product = await Product.create({
        name: 'New Product',
        barcode,
        sku: generateSKU('GEN'),
        category: category._id,
        stockQty: 1,
        purchasePrice: 0,
        sellingPrice: 0,
        description: 'Created via barcode scan',
        warehouseId,
      });
    }

    // Populate refs for the response
    await product.populate('category', 'name');

    // Audit log
    await createAuditLog({
      user: req.user,
      action: isNew ? 'create' : 'update',
      entity: 'Product',
      entityId: product._id,
      changes: {
        after: { barcode, stockQty: product.stockQty, scannedAt: new Date() },
      },
      req,
    });

    // Bust cache & emit real-time event
    await deleteCacheByPattern('products:*');
    emitEvent(EVENTS.STOCK_UPDATED, {
      product: product._id,
      action: isNew ? 'scanned_new' : 'scanned_increment',
      stockQty: product.stockQty,
    });

    res.status(isNew ? 201 : 200).json({
      success: true,
      message: isNew
        ? 'New product created from scan'
        : `Stock incremented to ${product.stockQty}`,
      data: { product, isNew },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/scan/product/:id
 * Update scanned product details so warehouse scanner users can complete
 * required business fields right after auto-creation.
 */
const updateScannedProductDetails = async (req, res, next) => {
  try {
    const { name, category, purchasePrice, sellingPrice } = scanDetailsSchema.parse(req.body);

    const product = await Product.findOne({ _id: req.params.id, isActive: true, ...req.warehouseFilter });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const categoryDoc = await Category.findOne({ _id: category, isActive: true });
    if (!categoryDoc) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }

    const before = product.toObject();

    product.name = name;
    product.category = categoryDoc._id;
    product.purchasePrice = purchasePrice;
    product.sellingPrice = sellingPrice;
    await product.save();
    await product.populate('category', 'name');

    await createAuditLog({
      user: req.user,
      action: 'update',
      entity: 'Product',
      entityId: product._id,
      changes: {
        before,
        after: {
          name: product.name,
          category: product.category,
          purchasePrice: product.purchasePrice,
          sellingPrice: product.sellingPrice,
        },
      },
      req,
    });

    await deleteCacheByPattern('products:*');
    emitEvent(EVENTS.STOCK_UPDATED, {
      product: product._id,
      action: 'scanned_details_updated',
      stockQty: product.stockQty,
    });

    res.json({
      success: true,
      message: 'Scanned product details updated',
      data: { product },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { processScan, updateScannedProductDetails };

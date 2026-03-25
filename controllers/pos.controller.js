const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const InventoryLog = require('../models/InventoryLog');
const { createAuditLog } = require('../services/audit.service');
const { emitEvent, EVENTS } = require('../services/socket.service');
const { generateDocNumber } = require('../utils/helpers');
const { z } = require('zod');

// ── Validation Schemas ────────────────────────────────────
const scanSchema = z.object({
  barcode: z.string().min(4, 'Barcode must be at least 4 characters').max(128),
});

const posInvoiceSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().min(1),
    discount: z.number().min(0).max(100).optional().default(0),
  })).min(1, 'Cart cannot be empty'),
  paymentMethod: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'other']).default('cash'),
});

/**
 * POST /api/pos/scan
 * Lookup-only — find product by barcode, return details for cart.
 * Does NOT mutate stock.
 */
const scanBarcode = async (req, res, next) => {
  try {
    const { barcode } = scanSchema.parse(req.body);
    const warehouseId = req.user.warehouseId?._id || req.user.warehouseId;

    const product = await Product.findOne({ barcode, isActive: true, ...req.warehouseFilter })
      .populate('category', 'name');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    if (product.stockQty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Out of stock',
        data: {
          product: {
            id: product._id,
            name: product.name,
            price: product.sellingPrice,
            gst: product.gst || 0,
            stock: product.stockQty,
            category: product.category?.name || '',
            barcode: product.barcode,
          },
        },
      });
    }

    res.json({
      success: true,
      data: {
        product: {
          id: product._id,
          name: product.name,
          price: product.sellingPrice,
          gst: product.gst || 0,
          stock: product.stockQty,
          category: product.category?.name || '',
          barcode: product.barcode,
          sku: product.sku,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/pos/invoice
 * Create POS invoice from cart items, deduct stock, return invoice.
 */
const createPosInvoice = async (req, res, next) => {
  try {
    const data = posInvoiceSchema.parse(req.body);
    const warehouseId = req.user.warehouseId?._id || req.user.warehouseId;

    let subtotal = 0;
    let taxAmount = 0;
    let discountAmount = 0;
    const invoiceItems = [];

    // Validate all products and calculate totals
    for (const item of data.items) {
      const product = await Product.findOne({ _id: item.productId, ...req.warehouseFilter });
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productId}`,
        });
      }

      if (!product.isActive) {
        return res.status(400).json({
          success: false,
          message: `Product is inactive: ${product.name}`,
        });
      }

      if (product.stockQty < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}. Available: ${product.stockQty}`,
        });
      }

      const unitPrice = product.sellingPrice;
      const gstRate = product.gst || 0;
      const discountRate = item.discount || 0;

      const lineSubtotal = unitPrice * item.quantity;
      const discAmt = lineSubtotal * (discountRate / 100);
      const taxableAmt = lineSubtotal - discAmt;
      const taxAmt = taxableAmt * (gstRate / 100);
      const lineTotal = taxableAmt + taxAmt;

      subtotal += lineSubtotal;
      discountAmount += discAmt;
      taxAmount += taxAmt;

      invoiceItems.push({
        product: product._id,
        name: product.name,
        sku: product.sku,
        quantity: item.quantity,
        unitPrice,
        discount: discountRate,
        tax: gstRate,
        total: lineTotal,
      });

      // Deduct stock
      const prevQty = product.stockQty;
      product.stockQty -= item.quantity;
      await product.save();

      await InventoryLog.create({
        product: product._id,
        warehouseId,
        type: 'out',
        quantity: item.quantity,
        previousQty: prevQty,
        newQty: product.stockQty,
        reason: 'POS Sale',
        performedBy: req.user._id,
      });
    }

    const totalAmount = subtotal - discountAmount + taxAmount;

    const invoice = await Invoice.create({
      invoiceNumber: await generateDocNumber(Invoice, 'INV', 'invoiceNumber'),
      warehouseId,
      customer: {
        name: 'Walk-in Customer',
      },
      items: invoiceItems,
      subtotal,
      taxAmount,
      discountAmount,
      totalAmount,
      paymentMethod: data.paymentMethod,
      paymentStatus: 'paid',
      createdBy: req.user._id,
    });

    // Emit real-time events
    emitEvent(EVENTS.INVOICE_CREATED, {
      invoice: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
    });
    emitEvent(EVENTS.STOCK_UPDATED, {
      source: 'pos',
      invoiceNumber: invoice.invoiceNumber,
    });

    // Audit log
    await createAuditLog({
      user: req.user,
      action: 'create',
      entity: 'Invoice',
      entityId: invoice._id,
      changes: { after: invoice.toObject() },
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: { invoice },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { scanBarcode, createPosInvoice };

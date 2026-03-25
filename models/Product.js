const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: 200,
  },
  sku: {
    type: String,
    unique: true,
    uppercase: true,
    index: true,
  },
  barcode: {
    type: String,
    unique: true,
    index: true,
  },
  description: {
    type: String,
    default: '',
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Category is required'],
    index: true,
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    index: true,
  },
  purchasePrice: {
    type: Number,
    required: [true, 'Purchase price is required'],
    min: 0,
  },
  sellingPrice: {
    type: Number,
    required: [true, 'Selling price is required'],
    min: 0,
  },
  gst: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  stockQty: {
    type: Number,
    default: 0,
    min: 0,
  },
  reorderLevel: {
    type: Number,
    default: 10,
    min: 0,
  },
  expiryDate: {
    type: Date,
  },
  batchNumber: {
    type: String,
    trim: true,
    default: '',
  },
  lotNumber: {
    type: String,
    trim: true,
    default: '',
  },
  manufacturingDate: {
    type: Date,
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Warehouse assignment is required'],
    index: true,
  },
  warehouseLocation: {
    zone: { type: String, default: '' },
    rack: { type: String, default: '' },
    shelf: { type: String, default: '' },
  },
  images: [{
    url: String,
    publicId: String,
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Compound index for search performance
productSchema.index({ name: 'text', sku: 'text', barcode: 'text' });
productSchema.index({ warehouseId: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);

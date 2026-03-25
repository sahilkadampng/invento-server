const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema({
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Warehouse assignment is required'],
    index: true,
  },
  poNumber: {
    type: String,
    unique: true,
    uppercase: true,
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: [true, 'Supplier is required'],
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      default: 0,
    },
  }],
  totalAmount: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'received', 'cancelled'],
    default: 'draft',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: {
    type: Date,
  },
  deliveryDate: {
    type: Date,
  },
  receivedAt: {
    type: Date,
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partial', 'paid'],
    default: 'unpaid',
  },
  notes: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

purchaseOrderSchema.index({ warehouseId: 1, createdAt: -1 });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);

const mongoose = require('mongoose');

const returnSchema = new mongoose.Schema({
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Warehouse assignment is required'],
    index: true,
  },
  returnNumber: {
    type: String,
    unique: true,
    uppercase: true,
  },
  type: {
    type: String,
    enum: ['customer_return', 'damaged', 'expired', 'write_off'],
    required: [true, 'Return type is required'],
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: String,
    sku: String,
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    reason: {
      type: String,
      default: '',
    },
    condition: {
      type: String,
      enum: ['good', 'damaged', 'expired', 'unsellable'],
      default: 'good',
    },
  }],
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
  },
  customer: {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  totalRefund: {
    type: Number,
    default: 0,
    min: 0,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'processed'],
    default: 'pending',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  processedAt: {
    type: Date,
  },
  notes: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

// Auto-generate return number
returnSchema.pre('save', async function (next) {
  if (!this.returnNumber) {
    const count = await mongoose.model('Return').countDocuments();
    this.returnNumber = `RTN-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

returnSchema.index({ warehouseId: 1, createdAt: -1 });
returnSchema.index({ status: 1, createdAt: -1 });
returnSchema.index({ type: 1 });

module.exports = mongoose.model('Return', returnSchema);

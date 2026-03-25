const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Warehouse assignment is required'],
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true,
    maxlength: 200,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: '',
  },
  phone: {
    type: String,
    trim: true,
    default: '',
  },
  address: {
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
  },
  gstNumber: {
    type: String,
    trim: true,
    uppercase: true,
    default: '',
  },
  type: {
    type: String,
    enum: ['retail', 'wholesale', 'distributor'],
    default: 'retail',
  },
  totalPurchases: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalSpent: {
    type: Number,
    default: 0,
    min: 0,
  },
  loyaltyPoints: {
    type: Number,
    default: 0,
    min: 0,
  },
  tags: [{
    type: String,
    trim: true,
  }],
  notes: {
    type: String,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

customerSchema.index({ name: 'text', email: 'text', phone: 'text' });
customerSchema.index({ warehouseId: 1, createdAt: -1 });
customerSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('Customer', customerSchema);

const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Warehouse name is required'],
    trim: true,
    maxlength: 200,
  },
  code: {
    type: String,
    unique: true,
    uppercase: true,
  },
  address: {
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    country: { type: String, default: 'India' },
  },
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  capacity: {
    type: Number,
    default: 0,
  },
  zones: [{
    name: { type: String, required: true },
    racks: [{
      name: { type: String, required: true },
      shelves: [{ type: String }],
    }],
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Warehouse', warehouseSchema);

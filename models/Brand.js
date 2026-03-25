const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Brand name is required'],
    trim: true,
    unique: true,
    maxlength: 100,
  },
  description: {
    type: String,
    default: '',
  },
  logo: {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Brand', brandSchema);

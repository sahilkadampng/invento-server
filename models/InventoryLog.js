const mongoose = require('mongoose');

const inventoryLogSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true,
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Warehouse assignment is required'],
    index: true,
  },
  type: {
    type: String,
    enum: ['in', 'out', 'adjust', 'return', 'transfer', 'damaged'],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  previousQty: {
    type: Number,
    required: true,
  },
  newQty: {
    type: Number,
    required: true,
  },
  reason: {
    type: String,
    default: '',
  },
  batch: {
    type: String,
    default: '',
  },
  reference: {
    type: String,
    default: '',
  },
  // For transfers
  fromWarehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
  },
  toWarehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

inventoryLogSchema.index({ warehouseId: 1, createdAt: -1 });
inventoryLogSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryLog', inventoryLogSchema);

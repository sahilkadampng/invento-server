const mongoose = require('mongoose');

const stockTransferSchema = new mongoose.Schema({
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Warehouse assignment is required'],
    index: true,
  },
  transferNumber: {
    type: String,
    unique: true,
    uppercase: true,
  },
  fromWarehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Source warehouse is required'],
  },
  toWarehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Destination warehouse is required'],
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
    received: {
      type: Number,
      default: 0,
      min: 0,
    },
  }],
  status: {
    type: String,
    enum: ['draft', 'in_transit', 'partial', 'completed', 'cancelled'],
    default: 'draft',
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  dispatchedAt: {
    type: Date,
  },
  receivedAt: {
    type: Date,
  },
  notes: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

// Auto-generate transfer number
stockTransferSchema.pre('save', async function (next) {
  if (!this.transferNumber) {
    const count = await mongoose.model('StockTransfer').countDocuments();
    this.transferNumber = `TRF-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

stockTransferSchema.index({ warehouseId: 1, createdAt: -1 });
stockTransferSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('StockTransfer', stockTransferSchema);

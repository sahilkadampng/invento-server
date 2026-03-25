const StockTransfer = require('../models/StockTransfer');
const Product = require('../models/Product');

// GET /api/stock-transfers
exports.getTransfers = async (req, res, next) => {
  try {
    const { page = 1, limit = 15, status, sort = '-createdAt' } = req.query;
    const query = { ...req.warehouseFilter };
    if (status) query.status = status;

    const total = await StockTransfer.countDocuments(query);
    const transfers = await StockTransfer.find(query)
      .populate('fromWarehouse', 'name code')
      .populate('toWarehouse', 'name code')
      .populate('initiatedBy', 'name')
      .populate('receivedBy', 'name')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        transfers,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/stock-transfers
exports.createTransfer = async (req, res, next) => {
  try {
    const { fromWarehouse, toWarehouse, items, notes } = req.body;
    const warehouseId = req.user.warehouseId?._id || req.user.warehouseId;

    if (fromWarehouse === toWarehouse) {
      return res.status(400).json({ success: false, message: 'Source and destination warehouse must be different' });
    }

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findOne({ _id: item.product, ...req.warehouseFilter });
        if (!product) throw new Error(`Product ${item.product} not found`);
        return { product: item.product, name: product.name, sku: product.sku, quantity: item.quantity, received: 0 };
      })
    );

    const transfer = await StockTransfer.create({
      fromWarehouse,
      toWarehouse,
      items: enrichedItems,
      notes,
      initiatedBy: req.user._id,
      warehouseId,
    });

    res.status(201).json({ success: true, data: { transfer } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/stock-transfers/:id/dispatch
exports.dispatchTransfer = async (req, res, next) => {
  try {
    const transfer = await StockTransfer.findOne({ _id: req.params.id, ...req.warehouseFilter });
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' });
    if (transfer.status !== 'draft') return res.status(400).json({ success: false, message: 'Only draft transfers can be dispatched' });

    // Deduct stock from source
    for (const item of transfer.items) {
      const product = await Product.findOne({ _id: item.product, ...req.warehouseFilter });
      if (!product || product.stockQty < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${item.name}` });
      }
      await Product.findByIdAndUpdate(item.product, { $inc: { stockQty: -item.quantity } });
    }

    transfer.status = 'in_transit';
    transfer.dispatchedAt = new Date();
    await transfer.save();

    res.json({ success: true, data: { transfer } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/stock-transfers/:id/receive
exports.receiveTransfer = async (req, res, next) => {
  try {
    const transfer = await StockTransfer.findOne({ _id: req.params.id, ...req.warehouseFilter });
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' });
    if (transfer.status !== 'in_transit' && transfer.status !== 'partial') {
      return res.status(400).json({ success: false, message: 'Transfer must be in-transit to receive' });
    }

    const { receivedItems } = req.body; // [{ product, received }]

    let allComplete = true;
    for (const ri of receivedItems || []) {
      const item = transfer.items.find(i => i.product.toString() === ri.product);
      if (item) {
        item.received = Math.min(ri.received, item.quantity);
        if (item.received < item.quantity) allComplete = false;
        // Add stock to destination
        await Product.findByIdAndUpdate(item.product, { $inc: { stockQty: item.received } });
      }
    }

    transfer.status = allComplete ? 'completed' : 'partial';
    transfer.receivedBy = req.user._id;
    transfer.receivedAt = new Date();
    await transfer.save();

    res.json({ success: true, data: { transfer } });
  } catch (err) {
    next(err);
  }
};

// GET /api/stock-transfers/stats
exports.getTransferStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const baseFilter = { ...req.warehouseFilter };

    const [total, inTransit, completedToday, draft] = await Promise.all([
      StockTransfer.countDocuments(baseFilter),
      StockTransfer.countDocuments({ ...baseFilter, status: 'in_transit' }),
      StockTransfer.countDocuments({ ...baseFilter, status: 'completed', receivedAt: { $gte: today } }),
      StockTransfer.countDocuments({ ...baseFilter, status: 'draft' }),
    ]);

    res.json({ success: true, data: { total, inTransit, completedToday, draft } });
  } catch (err) {
    next(err);
  }
};

const Return = require('../models/Return');
const Product = require('../models/Product');

// GET /api/returns
exports.getReturns = async (req, res, next) => {
  try {
    const { page = 1, limit = 15, status, type, sort = '-createdAt' } = req.query;
    const query = { ...req.warehouseFilter };
    if (status) query.status = status;
    if (type) query.type = type;

    const total = await Return.countDocuments(query);
    const returns = await Return.find(query)
      .populate('items.product', 'name sku')
      .populate('createdBy', 'name')
      .populate('processedBy', 'name')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        returns,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/returns
exports.createReturn = async (req, res, next) => {
  try {
    const { type, items, customer, invoice, totalRefund, notes } = req.body;
    const warehouseId = req.user.warehouseId?._id || req.user.warehouseId;

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findOne({ _id: item.product, ...req.warehouseFilter });
        if (!product) throw new Error(`Product ${item.product} not found`);
        return { ...item, name: product.name, sku: product.sku };
      })
    );

    const returnDoc = await Return.create({
      type,
      items: enrichedItems,
      customer,
      invoice,
      totalRefund: totalRefund || 0,
      notes,
      createdBy: req.user._id,
      warehouseId,
    });

    res.status(201).json({ success: true, data: { return: returnDoc } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/returns/:id/approve
exports.approveReturn = async (req, res, next) => {
  try {
    const returnDoc = await Return.findOne({ _id: req.params.id, ...req.warehouseFilter });
    if (!returnDoc) return res.status(404).json({ success: false, message: 'Return not found' });
    if (returnDoc.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending returns can be approved' });

    returnDoc.status = 'approved';
    returnDoc.processedBy = req.user._id;
    returnDoc.processedAt = new Date();

    // Restore stock for items in good condition (customer returns)
    for (const item of returnDoc.items) {
      if (item.condition === 'good') {
        await Product.findOneAndUpdate(
          { _id: item.product, ...req.warehouseFilter },
          { $inc: { stockQty: item.quantity } }
        );
      }
    }

    await returnDoc.save();
    res.json({ success: true, data: { return: returnDoc } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/returns/:id/reject
exports.rejectReturn = async (req, res, next) => {
  try {
    const returnDoc = await Return.findOne({ _id: req.params.id, ...req.warehouseFilter });
    if (!returnDoc) return res.status(404).json({ success: false, message: 'Return not found' });
    if (returnDoc.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending returns can be rejected' });

    returnDoc.status = 'rejected';
    returnDoc.processedBy = req.user._id;
    returnDoc.processedAt = new Date();
    if (req.body.notes) returnDoc.notes = req.body.notes;
    await returnDoc.save();

    res.json({ success: true, data: { return: returnDoc } });
  } catch (err) {
    next(err);
  }
};

// GET /api/returns/stats
exports.getReturnStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const baseFilter = { ...req.warehouseFilter };

    const [total, pending, processedToday, byType, totalRefund] = await Promise.all([
      Return.countDocuments(baseFilter),
      Return.countDocuments({ ...baseFilter, status: 'pending' }),
      Return.countDocuments({ ...baseFilter, processedAt: { $gte: today }, status: { $in: ['approved', 'processed'] } }),
      Return.aggregate([{ $match: baseFilter }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
      Return.aggregate([{ $match: { ...baseFilter, status: 'approved' } }, { $group: { _id: null, total: { $sum: '$totalRefund' } } }]),
    ]);

    res.json({
      success: true,
      data: {
        total,
        pending,
        processedToday,
        byType: byType.reduce((acc, t) => ({ ...acc, [t._id]: t.count }), {}),
        totalRefundValue: totalRefund[0]?.total || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

const Product = require('../models/Product');

// GET /api/expiry/dashboard
exports.getExpiryDashboard = async (req, res, next) => {
  try {
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const baseFilter = { isActive: true, ...req.warehouseFilter };

    const [expired, expiring7, expiring30, expiring90, byCategory] = await Promise.all([
      Product.countDocuments({ ...baseFilter, expiryDate: { $lt: now, $exists: true, $ne: null } }),
      Product.countDocuments({ ...baseFilter, expiryDate: { $gte: now, $lte: in7Days } }),
      Product.countDocuments({ ...baseFilter, expiryDate: { $gt: in7Days, $lte: in30Days } }),
      Product.countDocuments({ ...baseFilter, expiryDate: { $gt: in30Days, $lte: in90Days } }),
      Product.aggregate([
        { $match: { ...baseFilter, expiryDate: { $lte: in30Days, $exists: true, $ne: null } } },
        { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'cat' } },
        { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
        { $group: { _id: '$cat.name', count: { $sum: 1 }, totalValue: { $sum: { $multiply: ['$stockQty', '$sellingPrice'] } } } },
      ]),
    ]);

    // Total value at risk
    const atRisk = await Product.aggregate([
      { $match: { ...baseFilter, expiryDate: { $lte: in30Days, $exists: true, $ne: null } } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$stockQty', '$sellingPrice'] } } } },
    ]);

    res.json({
      success: true,
      data: {
        expired,
        expiring7Days: expiring7,
        expiring30Days: expiring30,
        expiring90Days: expiring90,
        valueAtRisk: atRisk[0]?.total || 0,
        byCategory,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/expiry/products
exports.getExpiringProducts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, urgency = 'all' } = req.query;
    const now = new Date();
    const query = { expiryDate: { $exists: true, $ne: null }, isActive: true, ...req.warehouseFilter };

    if (urgency === 'expired') {
      query.expiryDate = { ...query.expiryDate, $lt: now };
    } else if (urgency === '7days') {
      query.expiryDate = { $gte: now, $lte: new Date(now.getTime() + 7 * 86400000) };
    } else if (urgency === '30days') {
      query.expiryDate = { $gte: now, $lte: new Date(now.getTime() + 30 * 86400000) };
    } else if (urgency === '90days') {
      query.expiryDate = { $gte: now, $lte: new Date(now.getTime() + 90 * 86400000) };
    }

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('warehouseId', 'name')
      .sort('expiryDate')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const enriched = products.map((p) => {
      const daysLeft = Math.ceil((new Date(p.expiryDate) - now) / 86400000);
      return { ...p.toObject(), daysLeft, valueAtRisk: p.stockQty * p.sellingPrice };
    });

    res.json({
      success: true,
      data: {
        products: enriched,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    next(err);
  }
};

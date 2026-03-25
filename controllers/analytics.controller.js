const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const PurchaseOrder = require('../models/PurchaseOrder');
const InventoryLog = require('../models/InventoryLog');
const { getCache, setCache } = require('../services/cache.service');
const mongoose = require('mongoose');

/**
 * GET /api/analytics/dashboard — Main dashboard metrics
 */
const getDashboard = async (req, res, next) => {
  try {
    const cacheKey = `analytics:dashboard:${req.warehouseId || 'all'}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const productFilter = { isActive: true, ...req.warehouseFilter };
    const invoiceFilter = { ...req.warehouseFilter };

    const [
      totalProducts,
      lowStockCount,
      totalStockValue,
      monthlyRevenue,
      lastMonthRevenue,
      totalOrders,
      pendingPOs,
      recentSales,
      topSellers,
    ] = await Promise.all([
      Product.countDocuments(productFilter),
      Product.countDocuments({ ...productFilter, $expr: { $lte: ['$stockQty', '$reorderLevel'] } }),
      Product.aggregate([
        { $match: productFilter },
        { $group: { _id: null, value: { $sum: { $multiply: ['$stockQty', '$sellingPrice'] } } } },
      ]),
      Invoice.aggregate([
        { $match: { ...invoiceFilter, createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      Invoice.aggregate([
        { $match: { ...invoiceFilter, createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Invoice.countDocuments(invoiceFilter),
      PurchaseOrder.countDocuments({ status: 'pending', ...req.warehouseFilter }),
      Invoice.find(invoiceFilter).sort({ createdAt: -1 }).limit(5).select('invoiceNumber customer.name totalAmount createdAt'),
      Invoice.aggregate([
        { $match: invoiceFilter },
        { $unwind: '$items' },
        { $group: { _id: '$items.product', totalSold: { $sum: '$items.quantity' }, revenue: { $sum: '$items.total' } } },
        { $sort: { totalSold: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $project: { name: '$product.name', sku: '$product.sku', totalSold: 1, revenue: 1 } },
      ]),
    ]);

    const currentRevenue = monthlyRevenue[0]?.total || 0;
    const prevRevenue = lastMonthRevenue[0]?.total || 0;
    const revenueGrowth = prevRevenue ? ((currentRevenue - prevRevenue) / prevRevenue * 100).toFixed(1) : 0;

    const response = {
      success: true,
      data: {
        totalProducts,
        lowStockCount,
        totalStockValue: totalStockValue[0]?.value || 0,
        monthlyRevenue: currentRevenue,
        monthlyOrders: monthlyRevenue[0]?.count || 0,
        revenueGrowth: parseFloat(revenueGrowth),
        totalOrders,
        pendingPOs,
        recentSales,
        topSellers,
      },
    };

    await setCache(cacheKey, response, 120);
    res.json(response);
  } catch (error) { next(error); }
};

/**
 * GET /api/analytics/sales — Daily sales for chart
 */
const getSalesAnalytics = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const matchFilter = { ...req.warehouseFilter, createdAt: { $gte: startDate } };

    const salesByDay = await Invoice.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
          items: { $sum: { $size: '$items' } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const salesByMonth = await Invoice.aggregate([
      { $match: req.warehouseFilter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 12 },
    ]);

    res.json({ success: true, data: { salesByDay, salesByMonth } });
  } catch (error) { next(error); }
};

/**
 * GET /api/analytics/inventory-turnover
 */
const getInventoryTurnover = async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const matchFilter = { type: 'out', createdAt: { $gte: thirtyDaysAgo }, ...req.warehouseFilter };

    const turnover = await InventoryLog.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$product', totalSold: { $sum: '$quantity' } } },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      {
        $project: {
          name: '$product.name',
          sku: '$product.sku',
          totalSold: 1,
          currentStock: '$product.stockQty',
          turnoverRate: {
            $cond: [
              { $gt: ['$product.stockQty', 0] },
              { $divide: ['$totalSold', '$product.stockQty'] },
              0,
            ],
          },
        },
      },
      { $sort: { turnoverRate: -1 } },
      { $limit: 20 },
    ]);

    res.json({ success: true, data: { turnover } });
  } catch (error) { next(error); }
};

/**
 * GET /api/analytics/demand-forecast — Simple demand forecast based on sales velocity
 */
const getDemandForecast = async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const matchFilter = { type: 'out', createdAt: { $gte: thirtyDaysAgo }, ...req.warehouseFilter };

    const forecast = await InventoryLog.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$product', totalSold: { $sum: '$quantity' } } },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      {
        $project: {
          name: '$product.name',
          sku: '$product.sku',
          currentStock: '$product.stockQty',
          reorderLevel: '$product.reorderLevel',
          dailyAvgSales: { $divide: ['$totalSold', 30] },
          daysUntilStockout: {
            $cond: [
              { $gt: ['$totalSold', 0] },
              { $divide: [{ $multiply: ['$product.stockQty', 30] }, '$totalSold'] },
              999,
            ],
          },
          suggestedReorder: {
            $cond: [
              { $gt: ['$totalSold', 0] },
              { $ceil: { $multiply: [{ $divide: ['$totalSold', 30] }, 14] } }, // 14-day supply
              0,
            ],
          },
        },
      },
      { $sort: { daysUntilStockout: 1 } },
      { $limit: 20 },
    ]);

    res.json({ success: true, data: { forecast } });
  } catch (error) { next(error); }
};

module.exports = { getDashboard, getSalesAnalytics, getInventoryTurnover, getDemandForecast };

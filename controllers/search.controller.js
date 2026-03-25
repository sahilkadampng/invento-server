const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const { getCache, setCache } = require('../services/cache.service');

/**
 * GET /api/search?q=&type=product|sku|barcode|supplier
 */
const search = async (req, res, next) => {
  try {
    const { q, type = 'all', limit = 20 } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ success: false, message: 'Search query too short' });
    }

    const cacheKey = `search:${req.warehouseId || 'all'}:${q}:${type}:${limit}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const results = {};

    if (type === 'all' || type === 'product') {
      results.products = await Product.find({
        isActive: true,
        ...req.warehouseFilter,
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { sku: { $regex: q, $options: 'i' } },
          { barcode: { $regex: q, $options: 'i' } },
        ],
      })
        .populate('category', 'name')
        .populate('brand', 'name')
        .limit(parseInt(limit))
        .select('name sku barcode stockQty sellingPrice category brand images');
    }

    if (type === 'all' || type === 'supplier') {
      // Suppliers are global resources
      results.suppliers = await Supplier.find({
        isActive: true,
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { contactPerson: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
        ],
      })
        .limit(parseInt(limit))
        .select('name contactPerson email phone');
    }

    const response = { success: true, data: results };
    await setCache(cacheKey, response, 30); // Short TTL for search
    res.json(response);
  } catch (error) { next(error); }
};

module.exports = { search };

const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');

// GET /api/customers
exports.getCustomers = async (req, res, next) => {
  try {
    const { page = 1, limit = 15, search, type, sort = '-createdAt' } = req.query;
    const query = { ...req.warehouseFilter };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }
    if (type) query.type = type;

    const total = await Customer.countDocuments(query);
    const customers = await Customer.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/customers
exports.createCustomer = async (req, res, next) => {
  try {
    const warehouseId = req.user.warehouseId?._id || req.user.warehouseId;
    const customer = await Customer.create({ ...req.body, warehouseId });
    res.status(201).json({ success: true, data: { customer } });
  } catch (err) {
    next(err);
  }
};

// GET /api/customers/:id
exports.getCustomerById = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, ...req.warehouseFilter });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, data: { customer } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/customers/:id
exports.updateCustomer = async (req, res, next) => {
  try {
    const updateData = { ...req.body };
    delete updateData.warehouseId; // Never allow warehouseId override
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, ...req.warehouseFilter },
      updateData,
      { new: true, runValidators: true }
    );
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, data: { customer } });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/customers/:id
exports.deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOneAndDelete({ _id: req.params.id, ...req.warehouseFilter });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, message: 'Customer deleted' });
  } catch (err) {
    next(err);
  }
};

// GET /api/customers/:id/history
exports.getCustomerHistory = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, ...req.warehouseFilter });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const invoices = await Invoice.find({ 'customer.name': { $exists: true }, ...req.warehouseFilter })
      .sort('-createdAt')
      .limit(50)
      .select('invoiceNumber totalAmount paymentMethod paymentStatus createdAt items');

    // Filter by customer name match (since invoices store customer as embedded doc)
    const filtered = invoices.filter(inv =>
      inv.customer?.name?.toLowerCase() === customer.name.toLowerCase()
    );

    res.json({ success: true, data: { invoices: filtered, customer } });
  } catch (err) {
    next(err);
  }
};

// GET /api/customers/top
exports.getTopCustomers = async (req, res, next) => {
  try {
    const customers = await Customer.find({ isActive: true, ...req.warehouseFilter })
      .sort('-totalSpent')
      .limit(10)
      .select('name email phone type totalPurchases totalSpent loyaltyPoints');

    res.json({ success: true, data: { customers } });
  } catch (err) {
    next(err);
  }
};

// GET /api/customers/stats
exports.getCustomerStats = async (req, res, next) => {
  try {
    const baseFilter = { ...req.warehouseFilter };
    const [total, active, byType, totalRevenue] = await Promise.all([
      Customer.countDocuments(baseFilter),
      Customer.countDocuments({ ...baseFilter, isActive: true }),
      Customer.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      Customer.aggregate([
        { $match: baseFilter },
        { $group: { _id: null, total: { $sum: '$totalSpent' }, avgOrder: { $avg: '$totalSpent' } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        total,
        active,
        byType: byType.reduce((acc, t) => ({ ...acc, [t._id]: t.count }), {}),
        totalRevenue: totalRevenue[0]?.total || 0,
        avgOrderValue: Math.round(totalRevenue[0]?.avgOrder || 0),
      },
    });
  } catch (err) {
    next(err);
  }
};

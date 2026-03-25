const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const PurchaseOrder = require('../models/PurchaseOrder');

// Helper: Convert JSON array to CSV string
const toCSV = (data, columns) => {
  const header = columns.map((c) => c.label).join(',');
  const rows = data.map((row) =>
    columns.map((c) => {
      const val = typeof c.accessor === 'function' ? c.accessor(row) : row[c.accessor];
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    }).join(',')
  );
  return [header, ...rows].join('\n');
};

// GET /api/reports/stock
exports.getStockReport = async (req, res, next) => {
  try {
    const { format, category } = req.query;
    const query = { isActive: true, ...req.warehouseFilter };
    if (category) query.category = category;

    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('warehouseId', 'name')
      .populate('supplier', 'name')
      .sort('name');

    const report = products.map((p) => ({
      name: p.name,
      sku: p.sku || '-',
      barcode: p.barcode || '-',
      category: p.category?.name || '-',
      warehouse: p.warehouseId?.name || '-',
      supplier: p.supplier?.name || '-',
      stockQty: p.stockQty,
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
      stockValue: p.stockQty * p.purchasePrice,
      retailValue: p.stockQty * p.sellingPrice,
      reorderLevel: p.reorderLevel,
      status: p.stockQty <= 0 ? 'Out of Stock' : p.stockQty <= p.reorderLevel ? 'Low Stock' : 'In Stock',
    }));

    const summary = {
      totalProducts: report.length,
      totalStockValue: report.reduce((sum, r) => sum + r.stockValue, 0),
      totalRetailValue: report.reduce((sum, r) => sum + r.retailValue, 0),
      outOfStock: report.filter((r) => r.status === 'Out of Stock').length,
      lowStock: report.filter((r) => r.status === 'Low Stock').length,
    };

    if (format === 'csv') {
      const csv = toCSV(report, [
        { label: 'Name', accessor: 'name' }, { label: 'SKU', accessor: 'sku' },
        { label: 'Category', accessor: 'category' }, { label: 'Warehouse', accessor: 'warehouse' },
        { label: 'Stock Qty', accessor: 'stockQty' }, { label: 'Purchase Price', accessor: 'purchasePrice' },
        { label: 'Selling Price', accessor: 'sellingPrice' }, { label: 'Stock Value', accessor: 'stockValue' },
        { label: 'Status', accessor: 'status' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=stock-report.csv');
      return res.send(csv);
    }

    res.json({ success: true, data: { report, summary } });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/sales
exports.getSalesReport = async (req, res, next) => {
  try {
    const { format, startDate, endDate } = req.query;
    const query = { ...req.warehouseFilter };
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const invoices = await Invoice.find(query).sort('-createdAt').populate('items.product', 'name sku');

    const report = invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      customer: inv.customer?.name || 'Walk-in',
      items: inv.items?.length || 0,
      subtotal: inv.subtotal,
      discount: inv.discountAmount,
      tax: inv.taxAmount,
      total: inv.totalAmount,
      payment: inv.paymentMethod,
      status: inv.paymentStatus,
      date: inv.createdAt,
    }));

    const summary = {
      totalInvoices: report.length,
      totalRevenue: report.reduce((sum, r) => sum + r.total, 0),
      totalDiscount: report.reduce((sum, r) => sum + r.discount, 0),
      totalTax: report.reduce((sum, r) => sum + r.tax, 0),
      avgOrderValue: report.length > 0 ? Math.round(report.reduce((sum, r) => sum + r.total, 0) / report.length) : 0,
    };

    if (format === 'csv') {
      const csv = toCSV(report, [
        { label: 'Invoice #', accessor: 'invoiceNumber' }, { label: 'Customer', accessor: 'customer' },
        { label: 'Items', accessor: 'items' }, { label: 'Subtotal', accessor: 'subtotal' },
        { label: 'Discount', accessor: 'discount' }, { label: 'Tax', accessor: 'tax' },
        { label: 'Total', accessor: 'total' }, { label: 'Payment', accessor: 'payment' },
        { label: 'Date', accessor: (r) => new Date(r.date).toLocaleDateString('en-IN') },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.csv');
      return res.send(csv);
    }

    res.json({ success: true, data: { report, summary } });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/purchase
exports.getPurchaseReport = async (req, res, next) => {
  try {
    const { format, startDate, endDate, status } = req.query;
    const query = { ...req.warehouseFilter };
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const orders = await PurchaseOrder.find(query)
      .populate('supplier', 'name')
      .sort('-createdAt');

    const report = orders.map((po) => ({
      poNumber: po.poNumber,
      supplier: po.supplier?.name || '-',
      items: po.items?.length || 0,
      total: po.totalAmount,
      status: po.status,
      paymentStatus: po.paymentStatus,
      date: po.createdAt,
    }));

    const summary = {
      totalOrders: report.length,
      totalValue: report.reduce((sum, r) => sum + r.total, 0),
      byStatus: report.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {}),
    };

    if (format === 'csv') {
      const csv = toCSV(report, [
        { label: 'PO Number', accessor: 'poNumber' }, { label: 'Supplier', accessor: 'supplier' },
        { label: 'Items', accessor: 'items' }, { label: 'Total', accessor: 'total' },
        { label: 'Status', accessor: 'status' }, { label: 'Payment', accessor: 'paymentStatus' },
        { label: 'Date', accessor: (r) => new Date(r.date).toLocaleDateString('en-IN') },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=purchase-report.csv');
      return res.send(csv);
    }

    res.json({ success: true, data: { report, summary } });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/expiry
exports.getExpiryReport = async (req, res, next) => {
  try {
    const { format, days = 30 } = req.query;
    const now = new Date();
    const futureDate = new Date(now.getTime() + parseInt(days) * 86400000);

    const products = await Product.find({
      expiryDate: { $lte: futureDate, $exists: true, $ne: null },
      isActive: true,
      ...req.warehouseFilter,
    })
      .populate('category', 'name')
      .populate('warehouseId', 'name')
      .sort('expiryDate');

    const report = products.map((p) => {
      const daysLeft = Math.ceil((new Date(p.expiryDate) - now) / 86400000);
      return {
        name: p.name,
        sku: p.sku || '-',
        category: p.category?.name || '-',
        warehouse: p.warehouseId?.name || '-',
        stockQty: p.stockQty,
        expiryDate: p.expiryDate,
        daysLeft,
        valueAtRisk: p.stockQty * p.sellingPrice,
        status: daysLeft < 0 ? 'Expired' : daysLeft <= 7 ? 'Critical' : daysLeft <= 30 ? 'Warning' : 'Upcoming',
      };
    });

    const summary = {
      totalItems: report.length,
      totalValueAtRisk: report.reduce((sum, r) => sum + r.valueAtRisk, 0),
      expired: report.filter((r) => r.status === 'Expired').length,
      critical: report.filter((r) => r.status === 'Critical').length,
    };

    if (format === 'csv') {
      const csv = toCSV(report, [
        { label: 'Name', accessor: 'name' }, { label: 'SKU', accessor: 'sku' },
        { label: 'Category', accessor: 'category' }, { label: 'Stock', accessor: 'stockQty' },
        { label: 'Expiry Date', accessor: (r) => new Date(r.expiryDate).toLocaleDateString('en-IN') },
        { label: 'Days Left', accessor: 'daysLeft' }, { label: 'Value at Risk', accessor: 'valueAtRisk' },
        { label: 'Status', accessor: 'status' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=expiry-report.csv');
      return res.send(csv);
    }

    res.json({ success: true, data: { report, summary } });
  } catch (err) {
    next(err);
  }
};

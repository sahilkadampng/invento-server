require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/db');
const { connectRedis } = require('./config/redis');
const { configureCloudinary } = require('./config/cloudinary');
const { initSocket } = require('./config/socket');
const { setIO } = require('./services/socket.service');
const { generalLimiter } = require('./middlewares/rateLimiter');
const errorHandler = require('./middlewares/errorHandler');

// Route imports
const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/product.routes');
const categoryRoutes = require('./routes/category.routes');
const brandRoutes = require('./routes/brand.routes');
const supplierRoutes = require('./routes/supplier.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const purchaseOrderRoutes = require('./routes/purchaseOrder.routes');
const invoiceRoutes = require('./routes/invoice.routes');
const warehouseRoutes = require('./routes/warehouse.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const searchRoutes = require('./routes/search.routes');
const notificationRoutes = require('./routes/notification.routes');
const auditLogRoutes = require('./routes/auditLog.routes');
const scanRoutes = require('./routes/scan.routes');
const posRoutes = require('./routes/pos.routes');
const customerRoutes = require('./routes/customer.routes');
const returnRoutes = require('./routes/return.routes');
const stockTransferRoutes = require('./routes/stockTransfer.routes');
const expiryRoutes = require('./routes/expiry.routes');
const reportRoutes = require('./routes/report.routes');

const app = express();
const server = http.createServer(app);

// ─── Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(generalLimiter);

// ─── API Routes ───────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/stock-transfers', stockTransferRoutes);
app.use('/api/expiry', expiryRoutes);
app.use('/api/reports', reportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Invento API is running', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use(errorHandler);

// ─── Server Start ─────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Connect to Redis (optional, graceful fallback)
    connectRedis();

    // Configure Cloudinary
    configureCloudinary();

    // Initialize Socket.io
    const io = initSocket(server);
    setIO(io);

    server.listen(PORT, () => {
      console.log(`\n🚀 Invento Backend running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📦 API: http://localhost:${PORT}/api`);
      console.log(`❤️  Health: http://localhost:${PORT}/api/health\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

module.exports = { app, server };

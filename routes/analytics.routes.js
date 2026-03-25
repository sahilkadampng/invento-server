const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const authorize = require('../middlewares/rbac');
const { getDashboard, getSalesAnalytics, getInventoryTurnover, getDemandForecast } = require('../controllers/analytics.controller');

router.use(authenticate, enforceWarehouse);
router.get('/dashboard', getDashboard);
router.get('/sales', authorize('admin', 'manager'), getSalesAnalytics);
router.get('/inventory-turnover', authorize('admin', 'manager'), getInventoryTurnover);
router.get('/demand-forecast', authorize('admin', 'manager'), getDemandForecast);

module.exports = router;

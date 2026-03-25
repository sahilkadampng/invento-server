const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const authorize = require('../middlewares/rbac');
const { createLog, transfer, getLogs, getAlerts } = require('../controllers/inventory.controller');

router.use(authenticate, enforceWarehouse);
router.get('/logs', getLogs);
router.get('/alerts', getAlerts);
router.post('/log', authorize('admin', 'manager', 'warehouse_staff'), createLog);
router.post('/transfer', authorize('admin', 'manager', 'warehouse_staff'), transfer);

module.exports = router;

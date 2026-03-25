const router = require('express').Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const authorize = require('../middlewares/rbac');
const ctrl = require('../controllers/report.controller');

router.use(authenticate, enforceWarehouse);
router.use(authorize('admin', 'manager'));

router.get('/stock', ctrl.getStockReport);
router.get('/sales', ctrl.getSalesReport);
router.get('/purchase', ctrl.getPurchaseReport);
router.get('/expiry', ctrl.getExpiryReport);

module.exports = router;

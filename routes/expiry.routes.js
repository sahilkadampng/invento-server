const router = require('express').Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const authorize = require('../middlewares/rbac');
const ctrl = require('../controllers/expiry.controller');

router.use(authenticate, enforceWarehouse);

router.get('/dashboard', authorize('admin', 'manager', 'warehouse_staff'), ctrl.getExpiryDashboard);
router.get('/products', authorize('admin', 'manager', 'warehouse_staff'), ctrl.getExpiringProducts);

module.exports = router;

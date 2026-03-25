const router = require('express').Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const authorize = require('../middlewares/rbac');
const ctrl = require('../controllers/customer.controller');

router.use(authenticate, enforceWarehouse);

router.get('/stats', authorize('admin', 'manager'), ctrl.getCustomerStats);
router.get('/top', authorize('admin', 'manager'), ctrl.getTopCustomers);
router.get('/', authorize('admin', 'manager', 'billing_staff'), ctrl.getCustomers);
router.post('/', authorize('admin', 'manager', 'billing_staff'), ctrl.createCustomer);
router.get('/:id', authorize('admin', 'manager', 'billing_staff'), ctrl.getCustomerById);
router.put('/:id', authorize('admin', 'manager'), ctrl.updateCustomer);
router.delete('/:id', authorize('admin'), ctrl.deleteCustomer);
router.get('/:id/history', authorize('admin', 'manager', 'billing_staff'), ctrl.getCustomerHistory);

module.exports = router;

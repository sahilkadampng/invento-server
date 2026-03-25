const router = require('express').Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const authorize = require('../middlewares/rbac');
const ctrl = require('../controllers/return.controller');

router.use(authenticate, enforceWarehouse);

router.get('/stats', authorize('admin', 'manager'), ctrl.getReturnStats);
router.get('/', authorize('admin', 'manager', 'warehouse_staff'), ctrl.getReturns);
router.post('/', authorize('admin', 'manager', 'warehouse_staff'), ctrl.createReturn);
router.put('/:id/approve', authorize('admin', 'manager'), ctrl.approveReturn);
router.put('/:id/reject', authorize('admin', 'manager'), ctrl.rejectReturn);

module.exports = router;

const router = require('express').Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const authorize = require('../middlewares/rbac');
const ctrl = require('../controllers/stockTransfer.controller');

router.use(authenticate, enforceWarehouse);

router.get('/stats', authorize('admin', 'manager'), ctrl.getTransferStats);
router.get('/', authorize('admin', 'manager', 'warehouse_staff'), ctrl.getTransfers);
router.post('/', authorize('admin', 'manager'), ctrl.createTransfer);
router.put('/:id/dispatch', authorize('admin', 'manager', 'warehouse_staff'), ctrl.dispatchTransfer);
router.put('/:id/receive', authorize('admin', 'manager', 'warehouse_staff'), ctrl.receiveTransfer);

module.exports = router;

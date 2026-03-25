const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const authorize = require('../middlewares/rbac');
const {
  getPurchaseOrders, getPurchaseOrder, createPurchaseOrder,
  approvePurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder,
} = require('../controllers/purchaseOrder.controller');

router.use(authenticate, enforceWarehouse);
router.get('/', getPurchaseOrders);
router.get('/:id', getPurchaseOrder);
router.post('/', authorize('admin', 'manager'), createPurchaseOrder);
router.patch('/:id/approve', authorize('admin', 'manager'), approvePurchaseOrder);
router.patch('/:id/receive', authorize('admin', 'manager', 'warehouse_staff'), receivePurchaseOrder);
router.patch('/:id/cancel', authorize('admin', 'manager'), cancelPurchaseOrder);

module.exports = router;

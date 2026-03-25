const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const authorize = require('../middlewares/rbac');
const { getSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier } = require('../controllers/supplier.controller');

router.use(authenticate);
router.get('/', getSuppliers);
router.get('/:id', getSupplier);
router.post('/', authorize('admin', 'manager'), createSupplier);
router.put('/:id', authorize('admin', 'manager'), updateSupplier);
router.delete('/:id', authorize('admin'), deleteSupplier);

module.exports = router;

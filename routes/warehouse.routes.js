const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const authorize = require('../middlewares/rbac');
const { getWarehouses, getWarehouse, createWarehouse, updateWarehouse, deleteWarehouse } = require('../controllers/warehouse.controller');

router.use(authenticate, enforceWarehouse);
router.get('/', getWarehouses);
router.get('/:id', getWarehouse);
router.post('/', authorize('admin'), createWarehouse);
router.put('/:id', authorize('admin'), updateWarehouse);
router.delete('/:id', authorize('admin'), deleteWarehouse);

module.exports = router;

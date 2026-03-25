const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const authorize = require('../middlewares/rbac');
const { getBrands, getBrand, createBrand, updateBrand, deleteBrand } = require('../controllers/brand.controller');

router.use(authenticate);
router.get('/', getBrands);
router.get('/:id', getBrand);
router.post('/', authorize('admin', 'manager'), createBrand);
router.put('/:id', authorize('admin', 'manager'), updateBrand);
router.delete('/:id', authorize('admin'), deleteBrand);

module.exports = router;

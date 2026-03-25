const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const authorize = require('../middlewares/rbac');
const { getCategories, getCategory, createCategory, updateCategory, deleteCategory } = require('../controllers/category.controller');

router.use(authenticate);
router.get('/', getCategories);
router.get('/:id', getCategory);
router.post('/', authorize('admin', 'manager'), createCategory);
router.put('/:id', authorize('admin', 'manager'), updateCategory);
router.delete('/:id', authorize('admin'), deleteCategory);

module.exports = router;

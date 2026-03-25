const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const authorize = require('../middlewares/rbac');
const { upload, csvUpload } = require('../middlewares/upload');
const {
  getProducts, getProduct, createProduct, updateProduct,
  deleteProduct, bulkImport, getByBarcode,
} = require('../controllers/product.controller');

router.use(authenticate, enforceWarehouse);

router.get('/', getProducts);
router.get('/barcode/:barcode', getByBarcode);
router.get('/:id', getProduct);
router.post('/', authorize('admin', 'manager'), upload.array('images', 5), createProduct);
router.put('/:id', authorize('admin', 'manager'), upload.array('images', 5), updateProduct);
router.delete('/:id', authorize('admin'), deleteProduct);
router.post('/bulk-import', authorize('admin', 'manager'), csvUpload.single('file'), bulkImport);

module.exports = router;

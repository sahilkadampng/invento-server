const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const { processScan, updateScannedProductDetails } = require('../controllers/scan.controller');

router.use(authenticate, enforceWarehouse);

router.post('/', processScan);
router.put('/product/:id', updateScannedProductDetails);

module.exports = router;

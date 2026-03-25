const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const { scanBarcode, createPosInvoice } = require('../controllers/pos.controller');

router.use(authenticate, enforceWarehouse);

router.post('/scan', scanBarcode);
router.post('/invoice', createPosInvoice);

module.exports = router;

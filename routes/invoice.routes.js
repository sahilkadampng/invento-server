const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const authorize = require('../middlewares/rbac');
const { getInvoices, getInvoice, createInvoice, generatePDF, emailInvoice } = require('../controllers/invoice.controller');

router.use(authenticate, enforceWarehouse);
router.get('/', getInvoices);
router.get('/:id', getInvoice);
router.post('/', authorize('admin', 'manager', 'billing_staff'), createInvoice);
router.get('/:id/pdf', generatePDF);
router.post('/:id/email', authorize('admin', 'manager', 'billing_staff'), emailInvoice);

module.exports = router;

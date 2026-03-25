const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const authorize = require('../middlewares/rbac');
const { getAuditLogs } = require('../controllers/auditLog.controller');

router.use(authenticate, enforceWarehouse);
router.get('/', authorize('admin'), getAuditLogs);

module.exports = router;

const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const enforceWarehouse = require('../middlewares/enforceWarehouse');
const { search } = require('../controllers/search.controller');

router.use(authenticate, enforceWarehouse);
router.get('/', search);

module.exports = router;

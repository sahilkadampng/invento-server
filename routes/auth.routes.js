const express = require('express');
const router = express.Router();
const { signup, login, refresh, logout, getMe, getSignupMeta } = require('../controllers/auth.controller');
const authenticate = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiter');

router.get('/signup-meta', getSignupMeta);
router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

module.exports = router;

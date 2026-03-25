const User = require('../models/User');
const Warehouse = require('../models/Warehouse');
const AuditLog = require('../models/AuditLog');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../services/auth.service');
const { z } = require('zod');

// Validation schemas
const signupSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(128),
  role: z.enum(['admin', 'manager', 'warehouse_staff', 'billing_staff']).optional(),
  warehouseId: z.string().min(1, 'Warehouse is required'),
});

const superAdminSignupSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(128),
  role: z.literal('super_admin'),
  superAdminSecret: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * GET /api/auth/signup-meta
 * Public metadata required by signup UI.
 */
const getSignupMeta = async (req, res, next) => {
  try {
    const warehouses = await Warehouse.find({ isActive: true })
      .select('name code')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: { warehouses },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/signup
 */
const signup = async (req, res, next) => {
  try {
    let data;
    let warehouseId = null;

    // Check if creating super_admin
    if (req.body.role === 'super_admin') {
      data = superAdminSignupSchema.parse(req.body);
      // Validate super admin secret
      if (data.superAdminSecret !== process.env.SUPER_ADMIN_SECRET) {
        return res.status(403).json({ success: false, message: 'Invalid super admin secret' });
      }
      delete data.superAdminSecret;
    } else {
      data = signupSchema.parse(req.body);
      // Validate warehouse exists
      const warehouse = await Warehouse.findById(data.warehouseId);
      if (!warehouse || !warehouse.isActive) {
        return res.status(400).json({ success: false, message: 'Invalid or inactive warehouse' });
      }
      warehouseId = data.warehouseId;
    }

    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create(data);

    const accessToken = generateAccessToken(user._id, user.role, warehouseId);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token
    user.refreshToken = refreshToken;
    await user.save();

    // Populate warehouse for response
    await user.populate('warehouseId', 'name code');

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: user.toJSON(),
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await User.findOne({ email: data.email })
      .select('+password +refreshToken')
      .populate('warehouseId', 'name code isActive');

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(data.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check warehouse is active (non-super_admin)
    if (user.role !== 'super_admin' && user.warehouseId && !user.warehouseId.isActive) {
      return res.status(403).json({ success: false, message: 'Your warehouse is inactive. Contact administrator.' });
    }

    const warehouseId = user.warehouseId?._id || user.warehouseId || null;
    const accessToken = generateAccessToken(user._id, user.role, warehouseId);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    // Audit log
    await AuditLog.create({
      user: user._id,
      action: 'login',
      entity: 'User',
      entityId: user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toJSON(),
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/refresh
 */
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token required' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.userId).select('+refreshToken');
    
    if (!user || user.refreshToken !== refreshToken || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const warehouseId = user.warehouseId || null;
    const newAccessToken = generateAccessToken(user._id, user.role, warehouseId);
    const newRefreshToken = generateRefreshToken(user._id);

    user.refreshToken = newRefreshToken;
    await user.save();

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: '' });

    await AuditLog.create({
      user: req.user._id,
      action: 'logout',
      entity: 'User',
      entityId: req.user._id,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
};

module.exports = { signup, login, refresh, logout, getMe, getSignupMeta };

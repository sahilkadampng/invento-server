const AuditLog = require('../models/AuditLog');
const { getPaginationMeta } = require('../utils/helpers');

const getAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, action, entity, user, startDate, endDate } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (entity) filter.entity = entity;
    if (user) filter.user = user;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('user', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ success: true, data: { logs, pagination: getPaginationMeta(total, parseInt(page), parseInt(limit)) } });
  } catch (error) { next(error); }
};

module.exports = { getAuditLogs };

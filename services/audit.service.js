const AuditLog = require('../models/AuditLog');

/**
 * Create an audit log entry
 */
const createAuditLog = async ({ user, action, entity, entityId, changes, req }) => {
  try {
    await AuditLog.create({
      user: user._id || user,
      action,
      entity,
      entityId,
      changes,
      ipAddress: req?.ip || '',
      userAgent: req?.get?.('user-agent') || '',
    });
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
};

module.exports = { createAuditLog };

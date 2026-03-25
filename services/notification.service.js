const Notification = require('../models/Notification');
const { emitEvent, EVENTS } = require('./socket.service');

/**
 * Create notification and emit via socket
 */
const createNotification = async ({ userId, title, message, type = 'system', metadata = {} }) => {
  try {
    const notification = await Notification.create({
      user: userId,
      title,
      message,
      type,
      metadata,
    });

    // Emit real-time notification
    emitEvent(EVENTS.NOTIFICATION_NEW, {
      userId,
      notification,
    });

    return notification;
  } catch (error) {
    console.error('Notification error:', error.message);
    return null;
  }
};

/**
 * Create notification for multiple users
 */
const createBulkNotifications = async ({ userIds, title, message, type = 'system', metadata = {} }) => {
  try {
    const notifications = userIds.map((userId) => ({
      user: userId,
      title,
      message,
      type,
      metadata,
    }));
    await Notification.insertMany(notifications);

    // Emit to each user
    userIds.forEach((userId) => {
      emitEvent(EVENTS.NOTIFICATION_NEW, { userId, title, message, type });
    });
  } catch (error) {
    console.error('Bulk notification error:', error.message);
  }
};

module.exports = { createNotification, createBulkNotifications };

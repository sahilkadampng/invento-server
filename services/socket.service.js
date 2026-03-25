let io = null;

const setIO = (socketIO) => {
  io = socketIO;
};

/**
 * Emit a socket event to all connected clients
 */
const emitEvent = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

/**
 * Emit to specific warehouse room
 */
const emitToWarehouse = (warehouseId, event, data) => {
  if (io) {
    io.to(`warehouse:${warehouseId}`).emit(event, data);
  }
};

/**
 * Emit to specific role room
 */
const emitToRole = (role, event, data) => {
  if (io) {
    io.to(`role:${role}`).emit(event, data);
  }
};

// Event names
const EVENTS = {
  STOCK_UPDATED: 'stock:updated',
  ORDER_CREATED: 'order:created',
  PURCHASE_APPROVED: 'purchase:approved',
  TRANSFER_INITIATED: 'transfer:initiated',
  ALERT_LOW_STOCK: 'alert:lowstock',
  NOTIFICATION_NEW: 'notification:new',
  INVOICE_CREATED: 'invoice:created',
};

module.exports = { setIO, emitEvent, emitToWarehouse, emitToRole, EVENTS };

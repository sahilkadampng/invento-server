/**
 * Warehouse Isolation Middleware
 * 
 * Must be used AFTER authenticate middleware.
 * 
 * - Extracts warehouseId from req.user (set by auth middleware)
 * - Sets req.warehouseFilter for use in controller queries
 * - super_admin gets empty filter (access to all warehouses)
 * - Other roles are strictly scoped to their assigned warehouse
 * - If a non-super_admin user has no warehouseId, access is denied
 */
const enforceWarehouse = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  // Super admin bypasses warehouse restriction
  if (req.user.role === 'super_admin') {
    req.warehouseFilter = {};
    req.warehouseId = req.query._warehouseId || null; // Optional override for super_admin
    return next();
  }

  const warehouseId = req.user.warehouseId;

  if (!warehouseId) {
    return res.status(403).json({
      success: false,
      message: 'No warehouse assigned. Contact your administrator.',
    });
  }

  // Set the filter that controllers will merge into all queries
  req.warehouseFilter = { warehouseId };
  req.warehouseId = warehouseId;

  next();
};

module.exports = enforceWarehouse;

const { v4: uuidv4 } = require('uuid');

/**
 * Generate SKU: PREFIX-RANDOM (e.g., ELC-A3B2C1)
 */
const generateSKU = (categoryPrefix = 'GEN') => {
  const prefix = categoryPrefix.substring(0, 3).toUpperCase();
  const random = uuidv4().substring(0, 6).toUpperCase();
  return `${prefix}-${random}`;
};

/**
 * Generate EAN-13 barcode number
 */
const generateBarcode = () => {
  const prefix = '890'; // India country code prefix
  let barcode = prefix;
  for (let i = 0; i < 9; i++) {
    barcode += Math.floor(Math.random() * 10);
  }
  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return barcode + checkDigit;
};

/**
 * Generate auto-incrementing document number
 * e.g., PO-000001, INV-000001
 */
const generateDocNumber = async (Model, prefix, field) => {
  const lastDoc = await Model.findOne().sort({ [field]: -1 }).select(field);
  if (!lastDoc || !lastDoc[field]) {
    return `${prefix}-000001`;
  }
  const lastNum = parseInt(lastDoc[field].split('-')[1]) || 0;
  return `${prefix}-${String(lastNum + 1).padStart(6, '0')}`;
};

/**
 * Pagination helper
 */
const paginate = (query, page = 1, limit = 20) => {
  const skip = (Math.max(1, page) - 1) * limit;
  return query.skip(skip).limit(Math.min(limit, 100));
};

/**
 * Build pagination metadata
 */
const getPaginationMeta = (total, page = 1, limit = 20) => {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page: Math.max(1, page),
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

/**
 * Generate slug from string
 */
const slugify = (text) => {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
};

module.exports = {
  generateSKU,
  generateBarcode,
  generateDocNumber,
  paginate,
  getPaginationMeta,
  slugify,
};

const { ZodError } = require('zod');

/**
 * Zod validation middleware factory.
 * Usage: validate(schema, 'body') or validate(schema, 'query')
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const data = schema.parse(req[source]);
      req[source] = data; // Replace with parsed/cleaned data
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }
      next(error);
    }
  };
};

module.exports = validate;

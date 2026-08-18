'use strict';
const ApiError = require('../utils/ApiError');
const PARTS = ['body', 'query', 'params'];

const validate = (schema) => (req, res, next) => {
  for (const part of PARTS) {
    const partSchema = schema[part];
    if (!partSchema) continue;

    const { error, value } = partSchema.validate(req[part], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      // Turn Joi's detail list into a compact, client-friendly array:
      //   [{ field: 'email', message: 'email must be a valid email' }, ...]
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message.replace(/"/g, ''), // drop Joi's quote noise
      }));

      const summary =
        details.length === 1
          ? details[0].message
          : `Validation failed for ${details.length} fields`;

      if (part !== 'query') req[part] = value;

      return next(new ApiError(400, summary, details));
    }

    if (part !== 'query') req[part] = value;
  }

  return next();
};

module.exports = validate;
import { config, isProduction } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Every expected failure in the app is thrown as an ApiError. Anything else
 * that reaches the error handler is treated as a bug and logged as such.
 */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

export function notFoundHandler(req, _res, next) {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature
export function errorHandler(err, req, res, _next) {
  // Body-parser throws this when the JSON is malformed.
  if (err?.type === 'entity.parse.failed') {
    err = new ApiError(400, 'Request body is not valid JSON');
  }
  // express-rate-limit sets `status`/`statusCode` to 429.
  const status = Number(err?.status || err?.statusCode) || 500;

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} ->`, err.stack || err.message);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${status} ${err.message}`);
  }

  const body = {
    success: false,
    error: status >= 500 && isProduction ? 'Internal server error' : err.message,
  };
  if (err.details !== undefined) body.details = err.details;
  if (!isProduction && status >= 500) body.stack = err.stack;

  res.status(status).json(body);
}

/** Merge per-request metadata into the 404/error logs. */
export function attachRequestMeta(req, res, next) {
  res.setHeader('X-Device-Name', config.deviceName);
  next();
}

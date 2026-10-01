import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

/** Broad limiter applied to every /api route. */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: config.globalRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, slow down.' },
});

/** Tighter limiter for the device ingest endpoint. */
export const ingestLimiter = rateLimit({
  windowMs: 60_000,
  max: config.ingestRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Ingest rate limit exceeded.' },
});

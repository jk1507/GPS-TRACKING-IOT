import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { ApiError } from './errorHandler.js';

/** Pull a bearer token from the Authorization header (or X-API-Key). */
export function extractToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header));
  if (match) return match[1].trim();
  const alt = req.headers['x-api-key'];
  return alt ? String(alt).trim() : null;
}

/** Constant-time string comparison so we don't leak the key byte-by-byte. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Guards POST /api/location. The ESP32 must send
 *   Authorization: Bearer <API_SECRET>
 * This is the write key and must never reach a browser bundle.
 */
export function requireDeviceAuth(req, _res, next) {
  if (!config.apiSecret) {
    return next(new ApiError(500, 'API_SECRET is not configured on the server'));
  }
  const token = extractToken(req);
  if (!token || !safeEqual(token, config.apiSecret)) {
    return next(new ApiError(401, 'Missing or invalid device API key'));
  }
  return next();
}

/**
 * Guards the read endpoints used by the dashboard.
 * When DASHBOARD_API_KEY is empty (local development) reads are public on the
 * LAN; once set, the browser must send a SEPARATE read-only key.
 */
export function requireDashboardAuth(req, _res, next) {
  if (!config.dashboardApiKey) return next();
  const token = extractToken(req);
  if (!token || !safeEqual(token, config.dashboardApiKey)) {
    return next(new ApiError(401, 'Missing or invalid dashboard API key'));
  }
  return next();
}

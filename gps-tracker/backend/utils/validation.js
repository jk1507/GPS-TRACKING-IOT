import { config } from '../config/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { normalizeTimestamp } from './time.js';

function toFinite(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function optionalNumber(value, field, errors, { min, max } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const n = toFinite(value);
  if (n === null) {
    errors.push(`${field} must be a number`);
    return null;
  }
  if (min !== undefined && n < min) errors.push(`${field} must be >= ${min}`);
  if (max !== undefined && n > max) errors.push(`${field} must be <= ${max}`);
  return n;
}

/**
 * Validates the JSON body of POST /api/location and returns a clean object.
 *
 * Required: device_id, latitude, longitude, satellites
 * Optional: altitude, accuracy, speed, heading, timestamp
 *
 * @throws {ApiError} 400 when a field is missing or out of range.
 * @throws {ApiError} 422 when (0,0) is sent while REJECT_NULL_ISLAND is on.
 */
export function validateLocationPayload(body = {}) {
  const errors = [];

  const deviceId = String(body.device_id ?? '').trim();
  if (!deviceId) errors.push('device_id is required');
  else if (deviceId.length > 64) errors.push('device_id must be 64 characters or fewer');

  const latitude = toFinite(body.latitude);
  if (latitude === null) errors.push('latitude is required and must be a number');
  else if (latitude < -90 || latitude > 90) errors.push('latitude must be between -90 and 90');

  const longitude = toFinite(body.longitude);
  if (longitude === null) errors.push('longitude is required and must be a number');
  else if (longitude < -180 || longitude > 180) errors.push('longitude must be between -180 and 180');

  const satellites = toFinite(body.satellites);
  if (satellites === null) errors.push('satellites is required and must be a number');
  else if (satellites < 0 || satellites > 64) errors.push('satellites must be between 0 and 64');

  const altitude = optionalNumber(body.altitude, 'altitude', errors, { min: -500, max: 100000 });
  const accuracy = optionalNumber(body.accuracy, 'accuracy', errors, { min: 0 });
  const speed = optionalNumber(body.speed, 'speed', errors, { min: 0 });
  const heading = optionalNumber(body.heading, 'heading', errors, { min: 0, max: 360 });

  if (errors.length) {
    throw new ApiError(400, 'Invalid location payload', { errors });
  }

  // (0,0) is in the Gulf of Guinea - the classic "GPS has no fix" value.
  if (config.rejectNullIsland && latitude === 0 && longitude === 0) {
    throw new ApiError(422, 'Rejected (0,0) coordinates - device most likely has no GPS fix');
  }

  return {
    deviceId,
    latitude,
    longitude,
    altitude,
    satellites: Math.round(satellites),
    accuracy,
    speed,
    heading,
    timestamp: normalizeTimestamp(body.timestamp),
  };
}

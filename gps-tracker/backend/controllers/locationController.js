import { config } from '../config/index.js';
import { validateLocationPayload } from '../utils/validation.js';
import { resolveDateRange, clampInt } from '../utils/range.js';
import * as tracker from '../services/trackerService.js';
import * as locations from '../models/locationModel.js';

/**
 * POST /api/location
 * Called by the ESP32. Auth middleware has already verified the bearer key.
 */
export async function postLocation(req, res) {
  const payload = validateLocationPayload(req.body);
  const ipAddress = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;

  const { location, device } = await tracker.ingestLocation(payload, { ipAddress });

  res.status(201).json({
    success: true,
    message: 'Location received',
    location,
    device,
  });
}

/** GET /api/locations/latest */
export async function getLatestLocation(req, res) {
  const deviceId = req.query.device_id || config.deviceId;
  const location = await locations.getLatestLocation(deviceId);
  const device = await tracker.getDeviceStatus(deviceId);

  res.json({ success: true, location: location ?? null, device });
}

/** GET /api/locations?range=today|yesterday|7d|30d|all|from=&to=&limit=&offset= */
export async function getLocations(req, res) {
  const deviceId = req.query.device_id || config.deviceId;
  const { from, to } = resolveDateRange(req.query);
  const limit = clampInt(req.query.limit, { min: 1, max: 1000, fallback: 200 });
  const offset = clampInt(req.query.offset, { min: 0, max: 1_000_000, fallback: 0 });

  const { locations: rows, total } = await tracker.getHistory({ deviceId, from, to, limit, offset });

  res.json({
    success: true,
    device_id: deviceId,
    range: { from, to },
    pagination: { limit, offset, total, returned: rows.length },
    locations: rows,
  });
}

/** GET /api/route?range=today|from=&to=  -> polyline points + distance. */
export async function getRoute(req, res) {
  const deviceId = req.query.device_id || config.deviceId;
  const { from, to } = resolveDateRange(req.query);
  const limit = clampInt(req.query.limit, { min: 2, max: 20_000, fallback: 5_000 });

  const route = await tracker.getRoute({ deviceId, from, to, limit });

  res.json({
    success: true,
    device_id: deviceId,
    range: { from, to },
    ...route,
  });
}

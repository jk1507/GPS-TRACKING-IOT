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

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  'device_id',
  'timestamp',
  'latitude',
  'longitude',
  'altitude',
  'satellites',
  'accuracy',
  'speed',
  'heading',
  'gps_fix',
  'wifi_connected',
  'wifi_rssi',
  'geolinker_status',
  'render_status',
  'created_at',
];

/** RFC-4180 escaping: quote only when needed, double embedded quotes. */
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Page through the database instead of loading everything at once, and cap
// hard so a runaway query can never exhaust memory.
const EXPORT_PAGE_SIZE = 1000;
const EXPORT_MAX_ROWS = 200_000;

/**
 * GET /api/export?range=today|from=&to=&device_id=
 * Streams EVERY fix in the range as an Excel-friendly CSV download
 * (UTF-8 BOM + CRLF), unlike /api/locations which paginates at 1000.
 */
export async function exportLocationsCsv(req, res) {
  const deviceId = req.query.device_id || config.deviceId;
  const { from, to } = resolveDateRange(req.query);

  const safeDevice = String(deviceId).replace(/[^A-Za-z0-9_-]+/g, '_');
  const suffix = from ? `${from.slice(0, 10)}_to_${String(to ?? '').slice(0, 10)}` : 'all-time';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="gps-history-${safeDevice}-${suffix}.csv"`,
  );
  res.setHeader('Cache-Control', 'no-store');

  res.write('\uFEFF'); // BOM so Excel auto-detects UTF-8
  res.write(`${CSV_COLUMNS.join(',')}\r\n`);

  let exported = 0;
  for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += EXPORT_PAGE_SIZE) {
    const page = await locations.listLocations({
      deviceId,
      from,
      to,
      limit: EXPORT_PAGE_SIZE,
      offset,
    });

    for (const row of page) {
      res.write(`${CSV_COLUMNS.map((column) => csvEscape(row[column])).join(',')}\r\n`);
      exported += 1;
    }

    if (page.length < EXPORT_PAGE_SIZE) break;
  }

  res.end();
}

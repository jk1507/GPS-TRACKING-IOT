import { query, queryOne } from '../database/index.js';

/*
 * devices table = one row per tracker. It caches the last known position
 * and latest telemetry so GET /api/device is a single fast read.
 */

export async function ensureDevice(deviceId, name) {
  await query(
    `INSERT INTO devices (device_id, name) VALUES (?, ?)
     ON CONFLICT (device_id) DO NOTHING`,
    [deviceId, name],
  );
}

export async function touchDevice(
  deviceId,
  {
    latitude,
    longitude,
    altitude,
    satellites,
    gpsFix,
    wifiConnected,
    wifiRssi,
    geolinkerStatus,
    renderStatus,
    ipAddress,
  },
) {
  await query(
    `UPDATE devices
        SET last_seen_at          = ?,
            last_latitude         = ?,
            last_longitude        = ?,
            last_altitude         = ?,
            last_satellites       = ?,
            last_gps_fix          = ?,
            last_wifi_connected   = ?,
            last_wifi_rssi        = ?,
            last_geolinker_status = ?,
            last_render_status    = ?,
            ip_address            = COALESCE(?, ip_address),
            updated_at            = ?
      WHERE device_id = ?`,
    [
      new Date().toISOString(),
      latitude,
      longitude,
      altitude,
      satellites,
      gpsFix,
      wifiConnected,
      wifiRssi,
      geolinkerStatus,
      renderStatus,
      ipAddress ?? null,
      new Date().toISOString(),
      deviceId,
    ],
  );
}

export function getDevice(deviceId) {
  return queryOne(
    'SELECT * FROM devices WHERE device_id = ?',
    [deviceId],
  );
}

export function listDevices() {
  return query(
    'SELECT * FROM devices ORDER BY updated_at DESC',
  ).then((r) => r.rows);
}

/** First location ever recorded for a device (used for tracking duration). */
export function getFirstLocationAt(deviceId) {
  return queryOne(
    'SELECT MIN("timestamp") AS first_at FROM locations WHERE device_id = ?',
    [deviceId],
  ).then((row) => row?.first_at ?? null);
}
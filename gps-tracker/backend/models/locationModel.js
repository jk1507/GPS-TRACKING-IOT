import { query, queryOne } from '../database/index.js';
import { toNumber, toBoolean } from '../utils/time.js';

/*
 * All queries use `?` placeholders and are engine-agnostic (SQLite + Postgres).
 * Column list mirrors database/schema.*.sql.
 */

const COLUMNS =
  'id, device_id, latitude, longitude, altitude, satellites, accuracy, speed, heading, ' +
  'gps_fix, wifi_connected, wifi_rssi, geolinker_status, render_status, "timestamp", created_at';

/** Insert one fix. Returns the new row. */
export async function insertLocation(location) {
  const { rows } = await query(
    `INSERT INTO locations
       (device_id, latitude, longitude, altitude, satellites, accuracy, speed, heading,
        gps_fix, wifi_connected, wifi_rssi, geolinker_status, render_status, "timestamp", created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING ${COLUMNS}`,
    [
      location.deviceId,
      location.latitude,
      location.longitude,
      location.altitude,
      location.satellites,
      location.accuracy,
      location.speed,
      location.heading,
      location.gpsFix,
      location.wifiConnected,
      location.wifiRssi,
      location.geolinkerStatus,
      location.renderStatus,
      location.timestamp,
      new Date().toISOString(),
    ],
  );
  return normalizeRow(rows[0]);
}

/** SQLite returns 0/1 for booleans; expose real booleans to the API. */
function normalizeRow(row) {
  if (!row) return row;
  return {
    ...row,
    ...('gps_fix' in row ? { gps_fix: toBoolean(row.gps_fix) } : {}),
    ...('wifi_connected' in row ? { wifi_connected: toBoolean(row.wifi_connected) } : {}),
  };
}

export function getLatestLocation(deviceId) {
  return queryOne(
    `SELECT ${COLUMNS} FROM locations
      WHERE device_id = ?
      ORDER BY "timestamp" DESC, id DESC
      LIMIT 1`,
    [deviceId],
  ).then(normalizeRow);
}

/** Build the shared WHERE clause for filtered reads. */
function buildFilter({ deviceId, from, to }) {
  const clauses = [];
  const params = [];
  if (deviceId) {
    clauses.push('device_id = ?');
    params.push(deviceId);
  }
  if (from) {
    clauses.push('"timestamp" >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('"timestamp" <= ?');
    params.push(to);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

/** Newest-first page of history (what the History table renders). */
export async function listLocations({ deviceId, from, to, limit = 200, offset = 0 }) {
  const { where, params } = buildFilter({ deviceId, from, to });
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM locations
      ${where}
      ORDER BY "timestamp" DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows.map(normalizeRow);
}

/** Oldest-first points (what the Route polyline needs). */
export async function listRoutePoints({ deviceId, from, to, limit = 5000 }) {
  const { where, params } = buildFilter({ deviceId, from, to });
  const { rows } = await query(
    `SELECT latitude, longitude, altitude, satellites, gps_fix, "timestamp"
       FROM locations
       ${where}
       ORDER BY "timestamp" ASC, id ASC
       LIMIT ?`,
    [...params, limit],
  );
  return rows.map(normalizeRow);
}

export async function countLocations({ deviceId, from, to }) {
  const { where, params } = buildFilter({ deviceId, from, to });
  const row = await queryOne(`SELECT COUNT(*) AS total FROM locations ${where}`, params);
  return toNumber(row?.total);
}

/** Aggregate row used by the dashboard stat cards. */
export async function getLocationStats({ deviceId, from, to }) {
  const { where, params } = buildFilter({ deviceId, from, to });
  const row = await queryOne(
    `SELECT COUNT(*) AS total,
            MIN("timestamp") AS first_at,
            MAX("timestamp") AS last_at
       FROM locations
       ${where}`,
    params,
  );
  return {
    total: toNumber(row?.total),
    firstAt: row?.first_at ?? null,
    lastAt: row?.last_at ?? null,
  };
}

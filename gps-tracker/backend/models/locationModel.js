import { query, queryOne } from '../database/index.js';
import { toNumber } from '../utils/time.js';

/*
 * All queries use `?` placeholders and are engine-agnostic (SQLite + Postgres).
 * Column list mirrors database/schema.*.sql.
 */

const COLUMNS =
  'id, device_id, latitude, longitude, altitude, satellites, accuracy, speed, heading, "timestamp", created_at';

/** Insert one fix. Returns the new row. */
export async function insertLocation(location) {
  const { rows } = await query(
    `INSERT INTO locations
       (device_id, latitude, longitude, altitude, satellites, accuracy, speed, heading, "timestamp", created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      location.timestamp,
      new Date().toISOString(),
    ],
  );
  return rows[0];
}

export function getLatestLocation(deviceId) {
  return queryOne(
    `SELECT ${COLUMNS} FROM locations
      WHERE device_id = ?
      ORDER BY "timestamp" DESC, id DESC
      LIMIT 1`,
    [deviceId],
  );
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
  return rows;
}

/** Oldest-first points (what the Route polyline needs). */
export async function listRoutePoints({ deviceId, from, to, limit = 5000 }) {
  const { where, params } = buildFilter({ deviceId, from, to });
  const { rows } = await query(
    `SELECT latitude, longitude, altitude, satellites, "timestamp"
       FROM locations
       ${where}
       ORDER BY "timestamp" ASC, id ASC
       LIMIT ?`,
    [...params, limit],
  );
  return rows;
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

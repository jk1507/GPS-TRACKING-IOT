import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { pathDistanceMeters } from '../utils/geo.js';
import { secondsBetween, toNumber } from '../utils/time.js';
import * as devices from '../models/deviceModel.js';
import * as locations from '../models/locationModel.js';
import { broadcastLocation } from '../realtime/socket.js';

/**
 * Build the canonical device-status object used by every read endpoint and by
 * the WebSocket payloads.
 *
 * ONLINE = a valid fix arrived within OFFLINE_TIMEOUT_SECONDS (default 30s).
 */
export async function getDeviceStatus(deviceId = config.deviceId) {
  const device = await devices.getDevice(deviceId);
  const firstAt = device?.device_id ? await devices.getFirstLocationAt(deviceId) : null;
  const locationCount = device?.device_id ? await locations.countLocations({ deviceId }) : 0;

  const lastSeenAt = device?.last_seen_at ?? null;
  const ageSeconds = lastSeenAt ? secondsBetween(lastSeenAt) : null;
  const online = ageSeconds !== null && ageSeconds <= config.offlineTimeoutSeconds;

  return {
    device_id: deviceId,
    name: device?.name ?? config.deviceName,
    online,
    last_seen_at: lastSeenAt,
    age_seconds: ageSeconds,
    offline_timeout_seconds: config.offlineTimeoutSeconds,
    latitude: device?.last_latitude ?? null,
    longitude: device?.last_longitude ?? null,
    altitude: device?.last_altitude ?? null,
    satellites: device?.last_satellites ?? null,
    ip_address: device?.ip_address ?? null,
    location_count: locationCount,
    first_location_at: firstAt,
    tracking_duration_seconds: firstAt ? secondsBetween(firstAt) : 0,
    server_time: new Date().toISOString(),
  };
}

/**
 * Persist a validated fix, refresh the device row and fan the update out over
 * WebSocket. Called by POST /api/location.
 */
export async function ingestLocation(payload, { ipAddress } = {}) {
  await devices.ensureDevice(payload.deviceId, config.deviceName);

  const location = await locations.insertLocation(payload);

  await devices.touchDevice(payload.deviceId, {
    latitude: payload.latitude,
    longitude: payload.longitude,
    altitude: payload.altitude,
    satellites: payload.satellites,
    ipAddress,
  });

  const device = await getDeviceStatus(payload.deviceId);

  broadcastLocation(location, device);

  logger.info(
    `Fix stored for ${payload.deviceId}: ${payload.latitude.toFixed(6)}, ${payload.longitude.toFixed(6)} ` +
      `(${payload.satellites} sats)`,
  );

  return { location, device };
}

/** Paginated, range-filtered history for the History page. */
export async function getHistory({ deviceId, from, to, limit, offset }) {
  const [rows, total] = await Promise.all([
    locations.listLocations({ deviceId, from, to, limit, offset }),
    locations.countLocations({ deviceId, from, to }),
  ]);
  return { locations: rows, total };
}

/** Ordered track + derived distance/duration for the Route page. */
export async function getRoute({ deviceId, from, to, limit }) {
  const points = await locations.listRoutePoints({ deviceId, from, to, limit });
  const distanceMeters = pathDistanceMeters(points);
  const first = points[0]?.timestamp ?? null;
  const last = points[points.length - 1]?.timestamp ?? null;

  return {
    points,
    count: points.length,
    distance_meters: Math.round(distanceMeters),
    duration_seconds: first && last ? secondsBetween(first, last) : 0,
    first_at: first,
    last_at: last,
    truncated: points.length >= limit,
  };
}

/** Everything the dashboard cards need, in one round trip. */
export async function getDashboardStats({ deviceId = config.deviceId, from, to } = {}) {
  const stats = await locations.getLocationStats({ deviceId, from, to });
  const device = await getDeviceStatus(deviceId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayStats = await locations.getLocationStats({ deviceId, from: today.toISOString() });

  return {
    device,
    range: { from: from ?? null, to: to ?? null },
    locations_recorded: stats.total,
    locations_today: todayStats.total,
    first_location_at: stats.firstAt,
    last_location_at: stats.lastAt ?? device.last_seen_at,
    tracking_duration_seconds: device.tracking_duration_seconds,
    total_locations_all_time: toNumber(device.location_count),
  };
}

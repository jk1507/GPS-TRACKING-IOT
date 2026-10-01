/**
 * Thin fetch wrapper around the backend REST API.
 *
 * Base URL resolution:
 *   - development: empty -> the Vite dev proxy forwards /api to :4000
 *   - production:  VITE_API_URL (e.g. https://gps-api.example.com)
 *
 * The ESP32 write key (API_SECRET) is intentionally NOT available here. Only
 * the optional read-only dashboard key is sent from the browser.
 */

export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
export const HAS_DASHBOARD_KEY = Boolean(import.meta.env.VITE_DASHBOARD_API_KEY);

const DASHBOARD_KEY = import.meta.env.VITE_DASHBOARD_API_KEY || '';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(DASHBOARD_KEY ? { Authorization: `Bearer ${DASHBOARD_KEY}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the server. Is the backend running?');
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new ApiError(response.status, data?.error || response.statusText || 'Request failed', data?.details);
  }
  return data;
}

export function getConfig(signal) {
  return request('/api/config', { signal });
}

export function getDevice(deviceId, signal) {
  return request(`/api/device${buildQuery({ device_id: deviceId })}`, { signal });
}

export function getDevices(signal) {
  return request('/api/devices', { signal });
}

export function getLatest(deviceId, signal) {
  return request(`/api/locations/latest${buildQuery({ device_id: deviceId })}`, { signal });
}

export function getHistory({ deviceId, range, from, to, limit = 200, offset = 0, signal } = {}) {
  return request(
    `/api/locations${buildQuery({ device_id: deviceId, range, from, to, limit, offset })}`,
    { signal },
  );
}

export function getRoute({ deviceId, range, from, to, limit = 5000, signal } = {}) {
  return request(`/api/route${buildQuery({ device_id: deviceId, range, from, to, limit })}`, { signal });
}

export function getStats({ deviceId, range, from, to, signal } = {}) {
  return request(`/api/stats${buildQuery({ device_id: deviceId, range, from, to })}`, { signal });
}

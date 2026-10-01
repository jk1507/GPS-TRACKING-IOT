/**
 * The NEO-6M / ESP32 sends `"2026-09-30T21:30:00"` (no timezone). We normalise
 * every incoming timestamp to a UTC ISO-8601 string before it touches the DB,
 * so SQLite TEXT and PostgreSQL TIMESTAMPTZ stay comparable.
 */
export function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === '') {
    return new Date().toISOString();
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();

  // Treat "wall clock" strings as UTC so the device's local offset can't drift
  // stored points relative to each other.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value.trim())) {
    const naive = new Date(`${value.trim().replace(' ', 'T')}Z`);
    if (!Number.isNaN(naive.getTime())) return naive.toISOString();
  }
  return date.toISOString();
}

/** Seconds elapsed between two instants (never negative). */
export function secondsBetween(fromIso, toIso = new Date().toISOString()) {
  if (!fromIso) return 0;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / 1000));
}

/** Postgres returns bigint aggregates as strings; SQLite returns numbers. */
export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

-- ==========================================================
-- ESP32 GPS Tracker - SQLite schema (development)
-- Mirrors database/schema.postgres.sql 1:1 so the app can be
-- migrated to PostgreSQL without changing any queries.
-- ==========================================================

CREATE TABLE IF NOT EXISTS devices (
  device_id       TEXT PRIMARY KEY,
  name            TEXT    NOT NULL DEFAULT 'GPS TRACKING',
  last_seen_at    TEXT,
  last_latitude   REAL,
  last_longitude  REAL,
  last_altitude   REAL,
  last_satellites INTEGER,
  ip_address      TEXT,
  firmware        TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT    NOT NULL,
  latitude    REAL    NOT NULL,
  longitude   REAL    NOT NULL,
  altitude    REAL,
  satellites  INTEGER,
  accuracy    REAL,
  speed       REAL,
  heading     REAL,
  "timestamp" TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_locations_device_timestamp
  ON locations (device_id, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_locations_timestamp
  ON locations ("timestamp" DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

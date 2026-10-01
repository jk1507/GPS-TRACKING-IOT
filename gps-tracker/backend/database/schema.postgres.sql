-- ==========================================================
-- ESP32 GPS Tracker - PostgreSQL schema (production)
-- Column names and semantics match schema.sqlite.sql exactly.
-- ==========================================================

CREATE TABLE IF NOT EXISTS devices (
  device_id       TEXT PRIMARY KEY,
  name            TEXT        NOT NULL DEFAULT 'GPS TRACKING',
  last_seen_at    TIMESTAMPTZ,
  last_latitude   DOUBLE PRECISION,
  last_longitude  DOUBLE PRECISION,
  last_altitude   DOUBLE PRECISION,
  last_satellites INTEGER,
  ip_address      TEXT,
  firmware        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locations (
  id          BIGSERIAL PRIMARY KEY,
  device_id   TEXT             NOT NULL,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  altitude    DOUBLE PRECISION,
  satellites  INTEGER,
  accuracy    DOUBLE PRECISION,
  speed       DOUBLE PRECISION,
  heading     DOUBLE PRECISION,
  "timestamp" TIMESTAMPTZ      NOT NULL,
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_device_timestamp
  ON locations (device_id, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_locations_timestamp
  ON locations ("timestamp" DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

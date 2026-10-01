import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

function bool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 4000),
  host: process.env.HOST || '0.0.0.0',

  // Secret the ESP32 must present when uploading data.
  apiSecret: process.env.API_SECRET || '',
  // Optional read-only key for dashboards (empty = dashboards are public).
  dashboardApiKey: process.env.DASHBOARD_API_KEY || '',

  dbClient: (process.env.DB_CLIENT || 'sqlite').toLowerCase(),
  sqlitePath: path.isAbsolute(process.env.SQLITE_PATH || '')
    ? process.env.SQLITE_PATH
    : path.resolve(backendRoot, process.env.SQLITE_PATH || './data/gps-tracker.db'),
  databaseUrl: process.env.DATABASE_URL || '',

  deviceId: process.env.DEVICE_ID || 'GPS_TRACKING',
  deviceName: process.env.DEVICE_NAME || 'GPS TRACKING',
  offlineTimeoutSeconds: int(process.env.OFFLINE_TIMEOUT_SECONDS, 30),
  rejectNullIsland: bool(process.env.REJECT_NULL_ISLAND, true),

  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  ingestRateLimit: int(process.env.INGEST_RATE_LIMIT_PER_MINUTE, 120),
  globalRateLimit: int(process.env.GLOBAL_RATE_LIMIT_PER_MINUTE, 600),

  backendRoot,
};

export const isProduction = config.env === 'production';

/**
 * Fail fast on missing/invalid configuration instead of dying later at
 * runtime with a cryptic error.
 */
export function assertConfig() {
  const errors = [];

  if (!config.apiSecret || config.apiSecret.length < 16) {
    errors.push('API_SECRET is missing or too short (min 16 chars). See .env.example.');
  }
  if (!['sqlite', 'postgres', 'postgresql'].includes(config.dbClient)) {
    errors.push(`DB_CLIENT must be "sqlite" or "postgres" (got "${config.dbClient}").`);
  }
  if (config.dbClient.startsWith('postgres') && !config.databaseUrl) {
    errors.push('DB_CLIENT=postgres requires DATABASE_URL to be set.');
  }
  if (isProduction && config.corsOrigins.includes('*')) {
    // Not fatal, but noisy enough to be worth a warning.
    console.warn('[config] CORS_ORIGINS=* in production - restrict it to your dashboard origin.');
  }

  if (errors.length) {
    console.error('\nInvalid configuration:\n  - ' + errors.join('\n  - ') + '\n');
    process.exit(1);
  }
}

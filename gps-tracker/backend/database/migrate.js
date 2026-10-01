import { config, assertConfig } from '../config/index.js';
import { initDatabase, query, closeDatabase, getDialect } from './index.js';
import { logger } from '../utils/logger.js';

const VERSION = '001_init';

async function applyMigration002() {
  const dialect = getDialect();

  logger.info('Applying migration 002_gps_telemetry...');

  if (dialect === 'postgres') {
    // locations table
    await query(`
      ALTER TABLE locations
        ADD COLUMN IF NOT EXISTS gps_fix BOOLEAN,
        ADD COLUMN IF NOT EXISTS wifi_connected BOOLEAN,
        ADD COLUMN IF NOT EXISTS wifi_rssi INTEGER,
        ADD COLUMN IF NOT EXISTS geolinker_status TEXT,
        ADD COLUMN IF NOT EXISTS render_status TEXT
    `);

    // devices table - latest telemetry snapshot
    await query(`
      ALTER TABLE devices
        ADD COLUMN IF NOT EXISTS last_gps_fix BOOLEAN,
        ADD COLUMN IF NOT EXISTS last_wifi_connected BOOLEAN,
        ADD COLUMN IF NOT EXISTS last_wifi_rssi INTEGER,
        ADD COLUMN IF NOT EXISTS last_geolinker_status TEXT,
        ADD COLUMN IF NOT EXISTS last_render_status TEXT
    `);
  } else {
    // SQLite
    const columns = await query(`PRAGMA table_info(locations)`);
    const existingLocationColumns = new Set(
      columns.rows.map((row) => row.name),
    );

    const locationColumns = [
      ['gps_fix', 'INTEGER'],
      ['wifi_connected', 'INTEGER'],
      ['wifi_rssi', 'INTEGER'],
      ['geolinker_status', 'TEXT'],
      ['render_status', 'TEXT'],
    ];

    for (const [name, type] of locationColumns) {
      if (!existingLocationColumns.has(name)) {
        await query(`ALTER TABLE locations ADD COLUMN ${name} ${type}`);
      }
    }

    const deviceColumns = await query(`PRAGMA table_info(devices)`);
    const existingDeviceColumns = new Set(
      deviceColumns.rows.map((row) => row.name),
    );

    const latestDeviceColumns = [
      ['last_gps_fix', 'INTEGER'],
      ['last_wifi_connected', 'INTEGER'],
      ['last_wifi_rssi', 'INTEGER'],
      ['last_geolinker_status', 'TEXT'],
      ['last_render_status', 'TEXT'],
    ];

    for (const [name, type] of latestDeviceColumns) {
      if (!existingDeviceColumns.has(name)) {
        await query(`ALTER TABLE devices ADD COLUMN ${name} ${type}`);
      }
    }
  }

  const existing = await query(
    'SELECT version FROM schema_migrations WHERE version = ?',
    ['002_gps_telemetry'],
  );

  if (existing.rows.length === 0) {
    await query(
      'INSERT INTO schema_migrations (version) VALUES (?)',
      ['002_gps_telemetry'],
    );
  }

  logger.info('Migration 002_gps_telemetry applied successfully.');
}

async function main() {
  assertConfig();

  logger.info(`Running migrations against "${getDialect()}"...`);

  await initDatabase();

  const existing = await query(
    'SELECT version FROM schema_migrations WHERE version = ?',
    [VERSION],
  );

  if (existing.rows.length === 0) {
    await query(
      'INSERT INTO schema_migrations (version) VALUES (?)',
      [VERSION],
    );

    logger.info(`Applied migration ${VERSION}`);
  } else {
    logger.info(`Migration ${VERSION} already applied`);
  }

  await applyMigration002();

  await closeDatabase();

  logger.info(`Done (DB_CLIENT=${config.dbClient}).`);
}

main().catch(async (err) => {
  logger.error('Migration failed:', err.message);
  await closeDatabase().catch(() => {});
  process.exit(1);
});
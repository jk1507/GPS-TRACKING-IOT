import { config, assertConfig } from '../config/index.js';
import { initDatabase, query, closeDatabase, getDialect, applySchemaUpgrades } from './index.js';
import { logger } from '../utils/logger.js';

const VERSION = '001_init';

/*
 * 002_gps_telemetry is applied on every boot by initDatabase() as well, so
 * running it here just records the migration version for older databases.
 */
async function applyMigration002() {
  logger.info('Applying migration 002_gps_telemetry...');

  await applySchemaUpgrades();

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
/**
 * Applies database/schema.<dialect>.sql and records the migration.
 *
 *   npm run migrate              # uses .env (DB_CLIENT / DATABASE_URL)
 *   DB_CLIENT=postgres DATABASE_URL=... npm run migrate
 */
import { config, assertConfig } from '../config/index.js';
import { initDatabase, query, closeDatabase, getDialect } from './index.js';
import { logger } from '../utils/logger.js';

const VERSION = '001_init';

async function main() {
  assertConfig();

  logger.info(`Running migrations against "${getDialect()}"...`);
  await initDatabase();

  const existing = await query('SELECT version FROM schema_migrations WHERE version = ?', [VERSION]);

  if (existing.rows.length === 0) {
    await query('INSERT INTO schema_migrations (version) VALUES (?)', [VERSION]);
    logger.info(`Applied migration ${VERSION}`);
  } else {
    logger.info(`Migration ${VERSION} already applied`);
  }

  await closeDatabase();
  logger.info(`Done (DB_CLIENT=${config.dbClient}).`);
}

main().catch(async (err) => {
  logger.error('Migration failed:', err.message);
  await closeDatabase().catch(() => {});
  process.exit(1);
});

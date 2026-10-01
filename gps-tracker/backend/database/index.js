import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*
 * One tiny data-access layer that speaks BOTH SQLite (development) and
 * PostgreSQL (production). Every query in the app is written with `?`
 * placeholders and an awaitable API, so switching engines is a matter of
 * changing DB_CLIENT - no call sites have to change.
 */

let dialect = 'sqlite';
let sqlite = null;
let pool = null;

export function getDialect() {
  return dialect;
}

function toPgPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export function schemaFile() {
  return path.join(__dirname, dialect === 'postgres' ? 'schema.postgres.sql' : 'schema.sqlite.sql');
}

async function connectSqlite() {
  const { default: Database } = await import('better-sqlite3');

  fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });

  sqlite = new Database(config.sqlitePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  logger.info(`SQLite database ready at ${config.sqlitePath}`);
}

async function connectPostgres() {
  const { default: pg } = await import('pg');

  pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: process.env.PGSSLMODE === 'disable' || !process.env.DATABASE_URL.includes('sslmode')
      ? undefined
      : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  pool.on('error', (err) => logger.error('Postgres pool error:', err.message));

  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }

  logger.info('PostgreSQL connection pool ready');
}

/** Connect + apply the schema (idempotent, safe to run on every boot). */
export async function initDatabase() {
  dialect = config.dbClient.startsWith('postgres') ? 'postgres' : 'sqlite';

  if (dialect === 'postgres') await connectPostgres();
  else await connectSqlite();

  await runSchema();
  return { dialect };
}

/** Apply database/schema.<dialect>.sql */
export async function runSchema() {
  const sql = fs.readFileSync(schemaFile(), 'utf8');

  if (dialect === 'postgres') {
    await pool.query(sql);
  } else {
    sqlite.exec(sql);
  }

  logger.info(`Schema applied (${dialect})`);
}

/**
 * Run a parameterised statement.
 * @returns {Promise<{rows: object[], rowCount: number}>}
 */
export async function query(sql, params = []) {
  if (dialect === 'postgres') {
    const result = await pool.query(toPgPlaceholders(sql), params);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  }

  const statement = sqlite.prepare(sql);

  // `.reader === true` means the statement returns rows (SELECT / RETURNING).
  if (statement.reader) {
    const rows = statement.all(...params);
    return { rows, rowCount: rows.length };
  }

  const info = statement.run(...params);
  return { rows: [], rowCount: info.changes, lastInsertRowid: info.lastInsertRowid };
}

/** Convenience: first row or undefined. */
export async function queryOne(sql, params = []) {
  const { rows } = await query(sql, params);
  return rows[0];
}

/** Wrap several statements in a transaction (works for both engines). */
export async function transaction(fn) {
  if (dialect === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(async (sql, params = []) => {
        const res = await client.query(toPgPlaceholders(sql), params);
        return { rows: res.rows, rowCount: res.rowCount ?? 0 };
      });
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  sqlite.exec('BEGIN');
  try {
    const result = await fn((sql, params = []) => query(sql, params));
    sqlite.exec('COMMIT');
    return result;
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }
}

export async function closeDatabase() {
  if (dialect === 'postgres' && pool) {
    await pool.end();
    pool = null;
  }
  if (sqlite) {
    sqlite.close();
    sqlite = null;
  }
}

import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { config, assertConfig } from './config/index.js';
import { initDatabase, closeDatabase } from './database/index.js';
import { initRealtime, broadcastStatus } from './realtime/socket.js';
import { buildRoutes } from './routes/index.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { attachRequestMeta, notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { getDeviceStatus } from './services/trackerService.js';
import { logger } from './utils/logger.js';

function corsOrigin() {
  return config.corsOrigins.includes('*') ? true : config.corsOrigins;
}

/**
 * Watches for the online -> offline transition so connected dashboards flip to
 * OFFLINE immediately, instead of waiting for their next poll.
 */
function startOfflineWatcher() {
  let wasOnline = false;
  const timer = setInterval(async () => {
    try {
      const device = await getDeviceStatus(config.deviceId);
      if (wasOnline && !device.online) {
        logger.info(`Device ${device.device_id} went OFFLINE`);
        broadcastStatus(device);
      }
      wasOnline = device.online;
    } catch (err) {
      logger.warn('Offline watcher error:', err.message);
    }
  }, 5000);
  timer.unref?.();
  return timer;
}

async function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // This process only serves JSON + WebSocket, no HTML to protect.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors({ origin: corsOrigin(), credentials: false }));
  app.use(express.json({ limit: '32kb' }));

  app.use(
    morgan(config.env === 'production' ? 'combined' : 'dev', {
      skip: (req) => req.path === '/api/health',
    }),
  );

  app.use(attachRequestMeta);
  app.use('/api', globalLimiter);
  app.use('/api', buildRoutes());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function main() {
  assertConfig();
  await initDatabase();

  const app = await createApp();
  const server = http.createServer(app);
  initRealtime(server);
  startOfflineWatcher();

  await new Promise((resolve) => server.listen(config.port, config.host, resolve));

  const shown = config.host === '0.0.0.0' ? 'localhost' : config.host;
  logger.info('------------------------------------------------------------');
  logger.info(`ESP32 GPS Tracker backend (${config.env})`);
  logger.info(`REST API   : http://${shown}:${config.port}/api`);
  logger.info(`Ingest     : POST http://${shown}:${config.port}/api/location`);
  logger.info(`Health     : http://${shown}:${config.port}/api/health`);
  logger.info(`WebSocket  : ws://${shown}:${config.port}/socket.io`);
  logger.info(`Database   : ${config.dbClient}`);
  logger.info('------------------------------------------------------------');

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received - shutting down...`);
    server.close(() => logger.info('HTTP server closed'));
    await closeDatabase().catch((err) => logger.error('DB close error:', err.message));
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

main().catch(async (err) => {
  logger.error('Fatal startup error:', err.stack || err.message);
  await closeDatabase().catch(() => {});
  process.exit(1);
});

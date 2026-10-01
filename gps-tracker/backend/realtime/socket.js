import { Server } from 'socket.io';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let io = null;

function corsOrigin() {
  return config.corsOrigins.includes('*') ? '*' : config.corsOrigins;
}

/**
 * Attach Socket.IO to the HTTP server.
 *
 * Events emitted to clients:
 *   server:hello    { devices, server_time, offline_timeout_seconds }
 *   location:new    { location, device }
 *   device:status   { device }
 *
 * If DASHBOARD_API_KEY is set, the handshake must carry it in
 * `auth.token` or the Authorization header.
 */
export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin(), methods: ['GET', 'POST'] },
    // Keep the default transports; the Vite dev proxy forwards the upgrade.
    path: '/socket.io',
  });

  if (config.dashboardApiKey) {
    io.use((socket, next) => {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');
      if (token && token === config.dashboardApiKey) return next();
      return next(new Error('Unauthorized'));
    });
  }

  io.on('connection', (socket) => {
    logger.debug(`WebSocket client connected (${socket.id})`);

    socket.emit('server:hello', {
      device_id: config.deviceId,
      name: config.deviceName,
      offline_timeout_seconds: config.offlineTimeoutSeconds,
      server_time: new Date().toISOString(),
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`WebSocket client disconnected (${socket.id}): ${reason}`);
    });
  });

  logger.info('Socket.IO realtime layer ready');
  return io;
}

/** Push a freshly stored fix (and refreshed device status) to all clients. */
export function broadcastLocation(location, device) {
  if (!io) return;
  io.emit('location:new', { location, device, server_time: new Date().toISOString() });
}

/** Push a status-only change (e.g. offline flip detected server-side). */
export function broadcastStatus(device) {
  if (!io) return;
  io.emit('device:status', { device, server_time: new Date().toISOString() });
}

export function getIo() {
  return io;
}

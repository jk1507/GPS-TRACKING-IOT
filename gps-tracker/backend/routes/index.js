import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { query } from '../database/index.js';
import { config } from '../config/index.js';
import { getPublicConfig } from '../controllers/statsController.js';
import locationRoutes from './locationRoutes.js';
import deviceRoutes from './deviceRoutes.js';
import statsRoutes from './statsRoutes.js';

/**
 * Builds the whole `/api` surface.
 *
 *   GET  /api/health           liveness + database probe
 *   GET  /api/config           public, non-secret frontend config
 *   POST /api/location         ESP32 ingest            (device key)
 *   GET  /api/locations        history page            (dashboard key)
 *   GET  /api/locations/latest most recent fix          (dashboard key)
 *   GET  /api/route            polyline + distance      (dashboard key)
 *   GET  /api/export           full-range CSV download  (dashboard key)
 *   GET  /api/device           online/offline status    (dashboard key)
 *   GET  /api/devices          all known devices        (dashboard key)
 *   GET  /api/stats            dashboard aggregates     (dashboard key)
 */
export function buildRoutes() {
  const router = Router();

  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const started = Date.now();
      await query('SELECT 1');
      res.json({
        success: true,
        status: 'ok',
        database: { ok: true, latency_ms: Date.now() - started },
        uptime_seconds: Math.round(process.uptime()),
        device_id: config.deviceId,
        time: new Date().toISOString(),
      });
    }),
  );

  router.get('/config', getPublicConfig);
  router.use(locationRoutes);
  router.use(deviceRoutes);
  router.use(statsRoutes);

  return router;
}

export default buildRoutes;

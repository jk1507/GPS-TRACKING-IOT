import { config } from '../config/index.js';
import { resolveDateRange } from '../utils/range.js';
import * as tracker from '../services/trackerService.js';

/** GET /api/stats?range=today|7d|all */
export async function getStats(req, res) {
  const deviceId = req.query.device_id || config.deviceId;
  const { from, to } = resolveDateRange(req.query);
  const stats = await tracker.getDashboardStats({ deviceId, from, to });
  res.json({ success: true, ...stats });
}

/**
 * GET /api/config
 * Safe, non-secret values the frontend needs to render (names, timeouts).
 * Never exposes API keys.
 */
export function getPublicConfig(_req, res) {
  res.json({
    success: true,
    config: {
      device_id: config.deviceId,
      device_name: config.deviceName,
      offline_timeout_seconds: config.offlineTimeoutSeconds,
      dashboard_auth_required: Boolean(config.dashboardApiKey),
      realtime: true,
    },
  });
}

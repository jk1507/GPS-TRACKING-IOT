import { config } from '../config/index.js';
import * as tracker from '../services/trackerService.js';
import * as devices from '../models/deviceModel.js';

/** GET /api/device */
export async function getDevice(req, res) {
  const deviceId = req.query.device_id || config.deviceId;
  const device = await tracker.getDeviceStatus(deviceId);
  res.json({ success: true, device });
}

/** GET /api/devices */
export async function getDevices(_req, res) {
  const rows = await devices.listDevices();
  const enriched = await Promise.all(rows.map((row) => tracker.getDeviceStatus(row.device_id)));
  res.json({ success: true, devices: enriched });
}

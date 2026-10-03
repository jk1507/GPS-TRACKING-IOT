import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireDeviceAuth, requireDashboardAuth } from '../middleware/auth.js';
import { ingestLimiter } from '../middleware/rateLimit.js';
import * as locationController from '../controllers/locationController.js';

const router = Router();

// ESP32 ingest - write key required.
router.post('/location', ingestLimiter, requireDeviceAuth, asyncHandler(locationController.postLocation));

// Dashboard reads.
router.get('/locations/latest', requireDashboardAuth, asyncHandler(locationController.getLatestLocation));
router.get('/locations', requireDashboardAuth, asyncHandler(locationController.getLocations));
router.get('/route', requireDashboardAuth, asyncHandler(locationController.getRoute));
router.get('/export', requireDashboardAuth, asyncHandler(locationController.exportLocationsCsv));

export default router;

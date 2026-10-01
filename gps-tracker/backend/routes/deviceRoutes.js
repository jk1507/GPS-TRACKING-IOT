import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireDashboardAuth } from '../middleware/auth.js';
import * as deviceController from '../controllers/deviceController.js';

const router = Router();

router.get('/device', requireDashboardAuth, asyncHandler(deviceController.getDevice));
router.get('/devices', requireDashboardAuth, asyncHandler(deviceController.getDevices));

export default router;

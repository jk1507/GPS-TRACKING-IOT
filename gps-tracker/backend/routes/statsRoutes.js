import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireDashboardAuth } from '../middleware/auth.js';
import * as statsController from '../controllers/statsController.js';

const router = Router();

router.get('/stats', requireDashboardAuth, asyncHandler(statsController.getStats));

export default router;

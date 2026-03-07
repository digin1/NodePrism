import { Router, type Router as ExpressRouter } from 'express';
import { serverRoutes } from './servers';
import { alertRoutes } from './alerts';
import { metricRoutes } from './metrics';
import { agentRoutes } from './agents';
import { authRoutes } from './auth';
import { anomalyRoutes } from './anomalies';
import { logRoutes } from './logs';
import { eventRoutes } from './events';
import { settingsRoutes } from './settings';
import { serverGroupRoutes } from './serverGroups';
import { containerRoutes } from './containers';
import { requireAuth, optionalAuth } from '../middleware/auth';

const router: ExpressRouter = Router();

// Health check for API routes (public)
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'API routes are working' });
});

// Auth routes (public)
router.use('/auth', authRoutes);

// Agent routes (public - agents need to register without auth)
router.use('/agents', agentRoutes);
router.use('/agents/containers', containerRoutes);

// Settings routes (partially public - for login page branding)
router.use('/settings', settingsRoutes);

// Protected routes (require authentication)
router.use('/servers', optionalAuth, serverRoutes);
router.use('/containers', optionalAuth, containerRoutes);
router.use('/server-groups', optionalAuth, serverGroupRoutes);
router.use('/alerts', optionalAuth, alertRoutes);
router.use('/metrics', optionalAuth, metricRoutes);
router.use('/anomalies', optionalAuth, anomalyRoutes);
router.use('/logs', optionalAuth, logRoutes);
router.use('/events', optionalAuth, eventRoutes);

export { router as routes };

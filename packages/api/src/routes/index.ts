import { Router, type Router as ExpressRouter } from 'express';
import { serverRoutes } from './servers';
import { alertRoutes } from './alerts';
import { metricRoutes } from './metrics';
import { agentRoutes } from './agents';
import { authRoutes } from './auth';
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

// Protected routes (require authentication)
router.use('/servers', optionalAuth, serverRoutes);
router.use('/alerts', optionalAuth, alertRoutes);
router.use('/metrics', optionalAuth, metricRoutes);

export { router as routes };

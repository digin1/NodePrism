import { Router, type Router as ExpressRouter } from 'express';
import { serverRoutes } from './servers';
import { alertRoutes } from './alerts';
import { metricRoutes } from './metrics';

const router: ExpressRouter = Router();

// Health check for API routes
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'API routes are working' });
});

// Mount route modules
router.use('/servers', serverRoutes);
router.use('/alerts', alertRoutes);
router.use('/metrics', metricRoutes);

export { router as routes };

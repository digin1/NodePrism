import { Router } from 'express';

const router = Router();

// Health check for API routes
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'API routes are working' });
});

// TODO: Add route modules
// import { serverRoutes } from './servers';
// import { metricRoutes } from './metrics';
// import { alertRoutes } from './alerts';
// import { authRoutes } from './auth';
//
// router.use('/servers', serverRoutes);
// router.use('/metrics', metricRoutes);
// router.use('/alerts', alertRoutes);
// router.use('/auth', authRoutes);

export { router as routes };

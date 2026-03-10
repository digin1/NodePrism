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
import { notificationRoutes } from './notifications';
import { auditRoutes } from './audit';
import { dashboardRoutes } from './dashboards';
import { maintenanceWindowRoutes } from './maintenanceWindows';
import { incidentRoutes } from './incidents';
import { forecastingRoutes } from './forecasting';
import { uptimeRoutes } from './uptime';
import { slackInteractionRoutes } from './slackInteractions';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { webhookLimiter, metricsLimiter } from '../middleware/rateLimit';

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

// Slack interactive messages (public - Slack calls this directly)
router.use('/slack/interactions', webhookLimiter, slackInteractionRoutes);

// Settings routes (partially public - for login page branding)
router.use('/settings', settingsRoutes);

// Protected routes (require authentication)
router.use('/servers', optionalAuth, serverRoutes);
router.use('/containers', optionalAuth, containerRoutes);
router.use('/server-groups', optionalAuth, serverGroupRoutes);
router.use('/alerts', optionalAuth, alertRoutes);
router.use('/metrics', optionalAuth, metricsLimiter, metricRoutes);
router.use('/anomalies', optionalAuth, anomalyRoutes);
router.use('/logs', optionalAuth, logRoutes);
router.use('/events', optionalAuth, eventRoutes);
router.use('/notifications', optionalAuth, notificationRoutes);
router.use('/audit', auditRoutes); // auth enforced internally (ADMIN only)
router.use('/dashboards', optionalAuth, dashboardRoutes);
router.use('/maintenance-windows', optionalAuth, maintenanceWindowRoutes);
router.use('/incidents', optionalAuth, incidentRoutes);
router.use('/forecasting', optionalAuth, forecastingRoutes);
router.use('/uptime', optionalAuth, uptimeRoutes);

export { router as routes };

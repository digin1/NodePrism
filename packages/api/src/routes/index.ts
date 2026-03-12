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
import { systemStatusRoutes } from './systemStatus';
import { slackInteractionRoutes } from './slackInteractions';
import { escalationPolicyRoutes } from './escalationPolicies';
import { apiTokenRoutes } from './apiTokens';
import { postMortemRoutes } from './postMortems';
import { alertRoutingRuleRoutes } from './alertRoutingRules';
import { alertInhibitionRuleRoutes } from './alertInhibitionRules';
import { slaPolicyRoutes } from './slaPolicies';
import { statusPageRoutes } from './statusPages';
import { annotationRoutes } from './annotations';
import { compositeMonitorRoutes } from './compositeMonitors';
import { alertGroupRoutes } from './alertGroups';
import { feedRoutes } from './feeds';
import { multiStepMonitorRoutes } from './multiStepMonitors';
import { scheduledReportRoutes } from './scheduledReports';
import { onCallScheduleRoutes } from './onCallSchedules';
import { sloRoutes } from './slos';
import { snmpDeviceRoutes } from './snmpDevices';
import { retentionPolicyRoutes } from './retentionPolicies';
import { serviceDependencyRoutes } from './serviceDependencies';
import { infraChangeRoutes } from './infraChanges';
import { kubernetesRoutes } from './kubernetes';
import { syntheticCheckRoutes } from './syntheticChecks';
import { otlpRoutes } from './otlp';
import { runbookRoutes } from './runbooks';
import { rumRoutes } from './rum';
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

// RSS/Atom feeds (public)
router.use('/feeds', feedRoutes);

// OTLP trace ingestion (public - instrumented services send data here)
router.use('/otlp', otlpRoutes);

// RUM beacon (public - browser clients send data here)
router.use('/rum', rumRoutes);

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
router.use('/system-status', optionalAuth, systemStatusRoutes);
router.use('/escalation-policies', optionalAuth, escalationPolicyRoutes);
router.use('/api-tokens', optionalAuth, apiTokenRoutes);
router.use('/post-mortems', optionalAuth, postMortemRoutes);
router.use('/alert-routing-rules', optionalAuth, alertRoutingRuleRoutes);
router.use('/alert-inhibition-rules', optionalAuth, alertInhibitionRuleRoutes);
router.use('/sla-policies', optionalAuth, slaPolicyRoutes);
router.use('/annotations', optionalAuth, annotationRoutes);
router.use('/composite-monitors', optionalAuth, compositeMonitorRoutes);
router.use('/alert-groups', optionalAuth, alertGroupRoutes);
router.use('/status-pages', optionalAuth, statusPageRoutes);
router.use('/multi-step-monitors', optionalAuth, multiStepMonitorRoutes);
router.use('/scheduled-reports', optionalAuth, scheduledReportRoutes);
router.use('/on-call-schedules', optionalAuth, onCallScheduleRoutes);
router.use('/slos', optionalAuth, sloRoutes);
router.use('/snmp-devices', optionalAuth, snmpDeviceRoutes);
router.use('/retention-policies', optionalAuth, retentionPolicyRoutes);
router.use('/service-dependencies', optionalAuth, serviceDependencyRoutes);
router.use('/infra-changes', optionalAuth, infraChangeRoutes);
router.use('/kubernetes', optionalAuth, kubernetesRoutes);
router.use('/synthetic-checks', optionalAuth, syntheticCheckRoutes);
router.use('/runbooks', optionalAuth, runbookRoutes);

export { router as routes };

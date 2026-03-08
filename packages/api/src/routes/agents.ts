import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { agentLimiter } from '../middleware/rateLimit';
import { generateTargetFiles, reloadPrometheus } from '../services/targetGenerator';
import { autoLabelServer } from '../services/serverAutoLabel';

const router: ExpressRouter = Router();

// Apply lenient rate limiting for agent heartbeats/registrations
router.use(agentLimiter);

// Validation schemas
const registerAgentSchema = z.object({
  hostname: z.string().min(1),
  ipAddress: z.string().ip(),
  agentType: z.enum([
    'NODE_EXPORTER',
    'APP_AGENT',
    'MYSQL_EXPORTER',
    'POSTGRES_EXPORTER',
    'MONGODB_EXPORTER',
    'NGINX_EXPORTER',
    'APACHE_EXPORTER',
    'REDIS_EXPORTER',
    'LIBVIRT_EXPORTER',
    'LITESPEED_EXPORTER',
    'EXIM_EXPORTER',
    'CPANEL_EXPORTER',
    'PROMTAIL',
  ]),
  port: z.number().int().min(1).max(65535),
  version: z.string().default('1.0.0'),
  metadata: z.record(z.string(), z.any()).optional(),
});

const heartbeatSchema = z.object({
  agentId: z.string().uuid(),
  status: z.enum(['running', 'stopped', 'failed']).default('running'),
  metrics: z.object({
    uptime: z.number().optional(),
    memoryUsage: z.number().optional(),
    cpuUsage: z.number().optional(),
  }).optional(),
});

// POST /api/agents/register - Register a new agent (auto-creates server if needed)
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerAgentSchema.parse(req.body);

    // Find or create server by IP address
    let server = await prisma.server.findFirst({
      where: { ipAddress: data.ipAddress },
    });

    const isNewServer = !server;

    // Extract OS info from agent metadata if present
    const osInfo = data.metadata?.os || null;
    const hardwareInfo = data.metadata?.hardware || null;

    if (!server) {
      // Auto-create server
      server = await prisma.server.create({
        data: {
          hostname: data.hostname,
          ipAddress: data.ipAddress,
          status: 'ONLINE',
          environment: 'PRODUCTION',
          tags: ['auto-registered'],
          metadata: {
            autoRegistered: true,
            registeredAt: new Date().toISOString(),
            ...(osInfo && { os: osInfo }),
            ...(hardwareInfo && { hardware: hardwareInfo }),
            ...(data.metadata?.uptime !== undefined && { lastBootUptime: data.metadata.uptime }),
          },
        },
      });
      logger.info(`Auto-created server: ${server.hostname} (${server.ipAddress})`);
    } else {
      // Update hostname and merge OS info
      const existingMeta = (server.metadata as Record<string, unknown>) || {};
      const updatedMeta = {
        ...existingMeta,
        ...(osInfo && { os: osInfo }),
        ...(hardwareInfo && { hardware: hardwareInfo }),
        ...(data.metadata?.uptime !== undefined && { lastBootUptime: data.metadata.uptime }),
        lastRegisteredAt: new Date().toISOString(),
      };

      server = await prisma.server.update({
        where: { id: server.id },
        data: {
          hostname: data.hostname,
          metadata: updatedMeta,
        },
      });
    }

    // Check if this agent type already exists for this server
    let agent = await prisma.agent.findFirst({
      where: {
        serverId: server.id,
        type: data.agentType,
      },
    });

    if (agent) {
      // Update existing agent
      agent = await prisma.agent.update({
        where: { id: agent.id },
        data: {
          status: 'RUNNING',
          port: data.port,
          version: data.version,
          lastHealthCheck: new Date(),
          config: data.metadata,
        },
      });
      logger.info(`Agent re-registered: ${data.agentType} on ${server.hostname}`);
    } else {
      // Create new agent
      agent = await prisma.agent.create({
        data: {
          serverId: server.id,
          type: data.agentType,
          status: 'RUNNING',
          port: data.port,
          version: data.version,
          lastHealthCheck: new Date(),
          config: data.metadata,
        },
      });
      logger.info(`New agent registered: ${data.agentType} on ${server.hostname}`);
    }

    // Update server status to ONLINE
    await prisma.server.update({
      where: { id: server.id },
      data: { status: 'ONLINE' },
    });

    // Regenerate Prometheus targets
    try {
      await generateTargetFiles();
      await reloadPrometheus();
      logger.info('Prometheus targets regenerated after agent registration');
    } catch (err) {
      logger.warn('Failed to regenerate Prometheus targets', { error: err });
    }

    // Auto-label server type based on registered agents
    autoLabelServer(server.id).catch(() => {});

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      if (isNewServer) {
        io.emit('server:created', server);
      }
      io.emit('agent:registered', { server, agent });
    }

    res.status(201).json({
      success: true,
      data: {
        agentId: agent.id,
        serverId: server.id,
        hostname: server.hostname,
        message: isNewServer ? 'Server and agent registered' : 'Agent registered',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

// POST /api/agents/heartbeat - Agent heartbeat
router.post('/heartbeat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = heartbeatSchema.parse(req.body);

    const agent = await prisma.agent.findUnique({
      where: { id: data.agentId },
      include: { server: true },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found. Please re-register.',
        code: 'AGENT_NOT_FOUND',
      });
    }

    // Map status
    const statusMap: Record<string, string> = {
      running: 'RUNNING',
      stopped: 'STOPPED',
      failed: 'FAILED',
    };

    // Update agent
    const existingConfig = (agent.config as Record<string, unknown>) || {};
    await prisma.agent.update({
      where: { id: data.agentId },
      data: {
        status: statusMap[data.status] as any,
        lastHealthCheck: new Date(),
        config: data.metrics ? { ...existingConfig, lastMetrics: data.metrics } : agent.config ?? undefined,
      },
    });

    // Update server status based on agent health
    const allAgents = await prisma.agent.findMany({
      where: { serverId: agent.serverId },
    });

    const hasRunning = allAgents.some(a => a.status === 'RUNNING');
    const hasFailed = allAgents.some(a => a.status === 'FAILED');

    let serverStatus = 'OFFLINE';
    if (hasRunning && !hasFailed) {
      serverStatus = 'ONLINE';
    } else if (hasRunning && hasFailed) {
      serverStatus = 'WARNING';
    } else if (hasFailed) {
      serverStatus = 'CRITICAL';
    }

    await prisma.server.update({
      where: { id: agent.serverId },
      data: { status: serverStatus as any },
    });

    res.json({
      success: true,
      data: {
        acknowledged: true,
        serverStatus,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

// POST /api/agents/unregister - Unregister an agent
router.post('/unregister', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: 'agentId is required',
      });
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { server: true },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found',
      });
    }

    // Mark agent as stopped instead of deleting
    await prisma.agent.update({
      where: { id: agentId },
      data: { status: 'STOPPED' },
    });

    // Regenerate Prometheus targets
    try {
      await generateTargetFiles();
      await reloadPrometheus();
    } catch (err) {
      logger.warn('Failed to regenerate Prometheus targets', { error: err });
    }

    logger.info(`Agent unregistered: ${agent.type} on ${agent.server.hostname}`);

    const io = req.app.get('io');
    if (io) {
      io.emit('agent:unregistered', { agentId, serverId: agent.serverId });
    }

    res.json({
      success: true,
      message: 'Agent unregistered successfully',
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/agents - List all agents
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId, type, status } = req.query;

    const agents = await prisma.agent.findMany({
      where: {
        ...(serverId && { serverId: serverId as string }),
        ...(type && { type: type as any }),
        ...(status && { status: status as any }),
      },
      include: {
        server: {
          select: {
            id: true,
            hostname: true,
            ipAddress: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: agents,
      count: agents.length,
    });
  } catch (error) {
    next(error);
  }
});

// Latest versions for each agent type (source of truth for auto-update)
const LATEST_AGENT_VERSIONS: Record<string, { version: string; changelog?: string }> = {
  NODE_EXPORTER:     { version: '1.7.0', changelog: 'https://github.com/prometheus/node_exporter/releases' },
  MYSQL_EXPORTER:    { version: '0.15.1', changelog: 'https://github.com/prometheus/mysqld_exporter/releases' },
  POSTGRES_EXPORTER: { version: '0.15.0', changelog: 'https://github.com/prometheus-community/postgres_exporter/releases' },
  MONGODB_EXPORTER:  { version: '0.40.0', changelog: 'https://github.com/percona/mongodb_exporter/releases' },
  NGINX_EXPORTER:    { version: '1.1.0', changelog: 'https://github.com/nginx/nginx-prometheus-exporter/releases' },
  REDIS_EXPORTER:    { version: '1.56.0', changelog: 'https://github.com/oliver006/redis_exporter/releases' },
  PROMTAIL:          { version: '2.9.3', changelog: 'https://github.com/grafana/loki/releases' },
};

// GET /api/agents/latest-version/:type - Get latest version for agent type
router.get('/latest-version/:type', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentType = req.params.type.toUpperCase();
    const info = LATEST_AGENT_VERSIONS[agentType];

    if (!info) {
      return res.status(404).json({
        success: false,
        error: `Unknown agent type: ${req.params.type}`,
        validTypes: Object.keys(LATEST_AGENT_VERSIONS),
      });
    }

    res.json({
      success: true,
      data: {
        type: agentType,
        latestVersion: info.version,
        changelog: info.changelog,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as agentRoutes };

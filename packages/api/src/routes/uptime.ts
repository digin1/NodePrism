import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { runCheck } from '../services/uptimeService';

const router: ExpressRouter = Router();

// GET /api/uptime/stats/overview - Return aggregate stats across all monitors
// NOTE: This route must be defined BEFORE /:id to avoid "stats" being parsed as an id
router.get('/stats/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalMonitors, monitors] = await Promise.all([
      prisma.uptimeMonitor.count(),
      prisma.uptimeMonitor.findMany({
        select: { id: true },
      }),
    ]);

    // Get the latest check for each monitor to determine current up/down
    let upCount = 0;
    let downCount = 0;

    for (const monitor of monitors) {
      const latestCheck = await prisma.uptimeCheck.findFirst({
        where: { monitorId: monitor.id },
        orderBy: { checkedAt: 'desc' },
        select: { status: true },
      });

      if (latestCheck) {
        if (latestCheck.status === 'UP' || latestCheck.status === 'DEGRADED') {
          upCount++;
        } else {
          downCount++;
        }
      }
    }

    // Average response time across all checks in the last 24h
    const avgResponse = await prisma.uptimeCheck.aggregate({
      where: {
        checkedAt: { gte: twentyFourHoursAgo },
        responseTime: { not: null },
      },
      _avg: { responseTime: true },
    });

    res.json({
      success: true,
      data: {
        totalMonitors,
        upCount,
        downCount,
        averageResponseTime: Math.round(avgResponse._avg?.responseTime ?? 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/uptime - List all monitors with latest check status
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const monitors = await prisma.uptimeMonitor.findMany({
      include: {
        server: {
          select: { id: true, hostname: true, ipAddress: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich each monitor with computed fields
    const enriched = await Promise.all(
      monitors.map(async (monitor) => {
        // Latest check
        const lastCheck = await prisma.uptimeCheck.findFirst({
          where: { monitorId: monitor.id },
          orderBy: { checkedAt: 'desc' },
        });

        // Uptime percentage over the last 24 hours
        const [totalChecks, upChecks] = await Promise.all([
          prisma.uptimeCheck.count({
            where: {
              monitorId: monitor.id,
              checkedAt: { gte: twentyFourHoursAgo },
            },
          }),
          prisma.uptimeCheck.count({
            where: {
              monitorId: monitor.id,
              checkedAt: { gte: twentyFourHoursAgo },
              status: { in: ['UP', 'DEGRADED'] },
            },
          }),
        ]);

        const uptimePercentage = totalChecks > 0
          ? Math.round((upChecks / totalChecks) * 10000) / 100
          : null;

        return {
          ...monitor,
          lastCheck,
          currentStatus: lastCheck?.status ?? null,
          uptimePercentage,
        };
      })
    );

    res.json({
      success: true,
      data: enriched,
      count: enriched.length,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/uptime/:id - Get a single monitor with recent checks
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const monitor = await prisma.uptimeMonitor.findUnique({
      where: { id },
      include: {
        server: {
          select: { id: true, hostname: true, ipAddress: true },
        },
        checks: {
          orderBy: { checkedAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!monitor) {
      return res.status(404).json({
        success: false,
        error: 'Monitor not found',
      });
    }

    // Compute uptime percentage (last 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalChecks, upChecks] = await Promise.all([
      prisma.uptimeCheck.count({
        where: {
          monitorId: id,
          checkedAt: { gte: twentyFourHoursAgo },
        },
      }),
      prisma.uptimeCheck.count({
        where: {
          monitorId: id,
          checkedAt: { gte: twentyFourHoursAgo },
          status: { in: ['UP', 'DEGRADED'] },
        },
      }),
    ]);

    const uptimePercentage = totalChecks > 0
      ? Math.round((upChecks / totalChecks) * 10000) / 100
      : null;

    res.json({
      success: true,
      data: {
        ...monitor,
        uptimePercentage,
        currentStatus: monitor.checks[0]?.status ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/uptime - Create a new monitor
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, type, target, interval, timeout, method, expectedStatus, keyword, headers, enabled, serverId } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    if (!type || !['HTTP', 'HTTPS', 'TCP', 'PING', 'DNS'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type is required and must be one of: HTTP, HTTPS, TCP, PING, DNS' });
    }
    if (!target || typeof target !== 'string' || target.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'target is required' });
    }

    const monitor = await prisma.uptimeMonitor.create({
      data: {
        name: name.trim(),
        type,
        target: target.trim(),
        interval: interval ?? 60,
        timeout: timeout ?? 10,
        method: method ?? 'GET',
        expectedStatus: expectedStatus ?? null,
        keyword: keyword ?? null,
        headers: headers ?? null,
        enabled: enabled ?? true,
        serverId: serverId ?? null,
      },
    });

    logger.info(`Uptime monitor created: ${monitor.name} (${monitor.type} -> ${monitor.target})`);

    res.status(201).json({
      success: true,
      data: monitor,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/uptime/:id - Update an existing monitor
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const existing = await prisma.uptimeMonitor.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Monitor not found' });
    }

    const { name, type, target, interval, timeout, method, expectedStatus, keyword, headers, enabled, serverId } = req.body;

    const monitor = await prisma.uptimeMonitor.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(target !== undefined && { target }),
        ...(interval !== undefined && { interval }),
        ...(timeout !== undefined && { timeout }),
        ...(method !== undefined && { method }),
        ...(expectedStatus !== undefined && { expectedStatus }),
        ...(keyword !== undefined && { keyword }),
        ...(headers !== undefined && { headers }),
        ...(enabled !== undefined && { enabled }),
        ...(serverId !== undefined && { serverId }),
      },
    });

    logger.info(`Uptime monitor updated: ${monitor.name}`);

    res.json({
      success: true,
      data: monitor,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/uptime/:id - Delete a monitor and its checks
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const existing = await prisma.uptimeMonitor.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Monitor not found' });
    }

    await prisma.uptimeMonitor.delete({ where: { id } });

    logger.info(`Uptime monitor deleted: ${existing.name}`);

    res.json({
      success: true,
      message: 'Monitor deleted',
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/uptime/:id/checks - Get check history with optional time range
router.get('/:id/checks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { start, end, limit } = req.query;

    const existing = await prisma.uptimeMonitor.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Monitor not found' });
    }

    const where: any = { monitorId: id };

    if (start || end) {
      where.checkedAt = {};
      if (start) {
        where.checkedAt.gte = new Date(start as string);
      }
      if (end) {
        where.checkedAt.lte = new Date(end as string);
      }
    }

    const checks = await prisma.uptimeCheck.findMany({
      where,
      orderBy: { checkedAt: 'desc' },
      take: limit ? parseInt(limit as string, 10) : 100,
    });

    res.json({
      success: true,
      data: checks,
      count: checks.length,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/uptime/:id/test - Run a one-off check and return the result
router.post('/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const monitor = await prisma.uptimeMonitor.findUnique({ where: { id } });
    if (!monitor) {
      return res.status(404).json({ success: false, error: 'Monitor not found' });
    }

    const result = await runCheck(monitor);

    res.json({
      success: true,
      data: {
        monitorId: monitor.id,
        monitorName: monitor.name,
        ...result,
        testedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as uptimeRoutes };

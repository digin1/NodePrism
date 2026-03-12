import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';
import { randomUUID } from 'crypto';

const router: ExpressRouter = Router();

/**
 * GET /api/status-pages
 * List all status pages (auth required — applied in index.ts via optionalAuth)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pages = await prisma.statusPage.findMany({
      include: {
        components: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { subscribers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: pages });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/status-pages/public/:slug
 * PUBLIC endpoint — returns status page config + component statuses
 */
router.get('/public/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = await prisma.statusPage.findUnique({
      where: { slug: req.params.slug },
      include: {
        components: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!page || !page.isPublic) {
      return res.status(404).json({ success: false, error: 'Status page not found' });
    }

    // For each component linked to an uptime monitor, get the latest check status
    const componentsWithStatus = await Promise.all(
      page.components.map(async (comp) => {
        let currentStatus = 'operational';
        let uptimePercent: number | null = null;
        let latestResponseTime: number | null = null;

        if (comp.uptimeMonitorId) {
          // Get latest check
          const latestCheck = await prisma.uptimeCheck.findFirst({
            where: { monitorId: comp.uptimeMonitorId },
            orderBy: { checkedAt: 'desc' },
            select: { status: true, responseTime: true, checkedAt: true },
          });

          if (latestCheck) {
            if (latestCheck.status === 'DOWN') currentStatus = 'down';
            else if (latestCheck.status === 'DEGRADED') currentStatus = 'degraded';
            latestResponseTime = latestCheck.responseTime;
          }

          // Compute 90-day uptime percentage
          const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          const checks = await prisma.uptimeCheck.findMany({
            where: {
              monitorId: comp.uptimeMonitorId,
              checkedAt: { gte: ninetyDaysAgo },
            },
            select: { status: true },
          });

          if (checks.length > 0) {
            const upCount = checks.filter(c => c.status === 'UP').length;
            uptimePercent = Math.round((upCount / checks.length) * 10000) / 100;
          }
        }

        return {
          id: comp.id,
          name: comp.name,
          description: comp.description,
          sortOrder: comp.sortOrder,
          currentStatus,
          uptimePercent,
          latestResponseTime,
        };
      })
    );

    // Determine overall status
    let overallStatus = 'operational';
    if (componentsWithStatus.some(c => c.currentStatus === 'down')) {
      overallStatus = 'major_outage';
    } else if (componentsWithStatus.some(c => c.currentStatus === 'degraded')) {
      overallStatus = 'degraded';
    }

    // Get recent incidents (last 14 days)
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recentIncidents = await prisma.incident.findMany({
      where: {
        startedAt: { gte: fourteenDaysAgo },
      },
      include: {
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });

    // Get daily uptime data for components with monitors (90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const monitorIds = page.components
      .filter(c => c.uptimeMonitorId)
      .map(c => c.uptimeMonitorId as string);

    let dailyUptime: Record<string, { date: string; uptimePercent: number }[]> = {};

    if (monitorIds.length > 0) {
      // Build daily uptime for each monitor
      for (const monitorId of monitorIds) {
        const checks = await prisma.uptimeCheck.findMany({
          where: {
            monitorId,
            checkedAt: { gte: ninetyDaysAgo },
          },
          select: { status: true, checkedAt: true },
          orderBy: { checkedAt: 'asc' },
        });

        // Group by date
        const byDay: Record<string, { up: number; total: number }> = {};
        for (const check of checks) {
          const day = check.checkedAt.toISOString().slice(0, 10);
          if (!byDay[day]) byDay[day] = { up: 0, total: 0 };
          byDay[day].total++;
          if (check.status === 'UP') byDay[day].up++;
        }

        dailyUptime[monitorId] = Object.entries(byDay).map(([date, stats]) => ({
          date,
          uptimePercent: Math.round((stats.up / stats.total) * 10000) / 100,
        }));
      }
    }

    res.json({
      success: true,
      data: {
        title: page.title,
        description: page.description,
        logoUrl: page.logoUrl,
        customCss: page.customCss,
        overallStatus,
        components: componentsWithStatus,
        recentIncidents: recentIncidents.map(inc => ({
          id: inc.id,
          title: inc.title,
          description: inc.description,
          status: inc.status,
          severity: inc.severity,
          startedAt: inc.startedAt,
          resolvedAt: inc.resolvedAt,
          updates: inc.updates.map(u => ({
            id: u.id,
            message: u.message,
            status: u.status,
            createdAt: u.createdAt,
          })),
        })),
        dailyUptime,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/status-pages/public/:slug/subscribe
 * PUBLIC — Create subscriber with confirm token
 */
router.post('/public/:slug/subscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = await prisma.statusPage.findUnique({
      where: { slug: req.params.slug },
    });

    if (!page || !page.isPublic) {
      return res.status(404).json({ success: false, error: 'Status page not found' });
    }

    const { type, endpoint } = req.body;

    if (!type || !endpoint) {
      return res.status(400).json({ success: false, error: 'Missing required fields: type, endpoint' });
    }

    if (!['EMAIL', 'WEBHOOK'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Type must be EMAIL or WEBHOOK' });
    }

    // Check for existing subscriber
    const existing = await prisma.statusPageSubscriber.findFirst({
      where: { statusPageId: page.id, type, endpoint },
    });

    if (existing) {
      return res.json({ success: true, message: 'Already subscribed' });
    }

    const confirmToken = randomUUID();

    await prisma.statusPageSubscriber.create({
      data: {
        statusPageId: page.id,
        type,
        endpoint,
        confirmToken,
      },
    });

    logger.info('Status page subscriber created', { slug: req.params.slug, type, endpoint });

    res.status(201).json({
      success: true,
      message: 'Subscription created. Please confirm your subscription.',
      confirmToken,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/status-pages/public/confirm/:token
 * PUBLIC — Confirm subscription
 */
router.get('/public/confirm/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriber = await prisma.statusPageSubscriber.findUnique({
      where: { confirmToken: req.params.token },
    });

    if (!subscriber) {
      return res.status(404).json({ success: false, error: 'Invalid confirmation token' });
    }

    await prisma.statusPageSubscriber.update({
      where: { id: subscriber.id },
      data: { confirmed: true, confirmToken: null },
    });

    res.json({ success: true, message: 'Subscription confirmed' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/status-pages/public/:slug/unsubscribe
 * PUBLIC — Unsubscribe by email/endpoint
 */
router.post('/public/:slug/unsubscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = await prisma.statusPage.findUnique({
      where: { slug: req.params.slug },
    });

    if (!page) {
      return res.status(404).json({ success: false, error: 'Status page not found' });
    }

    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ success: false, error: 'Missing required field: endpoint' });
    }

    const subscriber = await prisma.statusPageSubscriber.findFirst({
      where: { statusPageId: page.id, endpoint },
    });

    if (!subscriber) {
      return res.status(404).json({ success: false, error: 'Subscriber not found' });
    }

    await prisma.statusPageSubscriber.delete({ where: { id: subscriber.id } });

    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/status-pages/:id
 * Get a single status page with components
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = await prisma.statusPage.findUnique({
      where: { id: req.params.id },
      include: {
        components: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { subscribers: true } },
      },
    });

    if (!page) {
      return res.status(404).json({ success: false, error: 'Status page not found' });
    }

    res.json({ success: true, data: page });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/status-pages
 * Create a new status page with components
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug, title, description, logoUrl, customCss, isPublic, components } = req.body;

    if (!slug || !title) {
      return res.status(400).json({ success: false, error: 'Missing required fields: slug, title' });
    }

    // Check slug uniqueness
    const existingSlug = await prisma.statusPage.findUnique({ where: { slug } });
    if (existingSlug) {
      return res.status(409).json({ success: false, error: 'A status page with this slug already exists' });
    }

    const page = await prisma.statusPage.create({
      data: {
        slug,
        title,
        ...(description !== undefined && { description }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(customCss !== undefined && { customCss }),
        ...(isPublic !== undefined && { isPublic }),
        ...(components && components.length > 0 && {
          components: {
            create: components.map((c: { name: string; description?: string; uptimeMonitorId?: string; sortOrder?: number }, i: number) => ({
              name: c.name,
              ...(c.description !== undefined && { description: c.description }),
              ...(c.uptimeMonitorId !== undefined && { uptimeMonitorId: c.uptimeMonitorId }),
              sortOrder: c.sortOrder ?? i,
            })),
          },
        }),
      },
      include: {
        components: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { subscribers: true } },
      },
    });

    audit(req, {
      action: 'status_page.create',
      entityType: 'status_page',
      entityId: page.id,
      details: { slug, title },
    });

    logger.info('Status page created', { id: page.id, slug });
    res.status(201).json({ success: true, data: page });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/status-pages/:id
 * Update a status page
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.statusPage.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Status page not found' });
    }

    const { slug, title, description, logoUrl, customCss, isPublic, components } = req.body;

    // If changing slug, check uniqueness
    if (slug && slug !== existing.slug) {
      const existingSlug = await prisma.statusPage.findUnique({ where: { slug } });
      if (existingSlug) {
        return res.status(409).json({ success: false, error: 'A status page with this slug already exists' });
      }
    }

    // If components are provided, replace them
    if (components !== undefined) {
      await prisma.statusPageComponent.deleteMany({ where: { statusPageId: req.params.id } });
      if (components.length > 0) {
        await prisma.statusPageComponent.createMany({
          data: components.map((c: { name: string; description?: string; uptimeMonitorId?: string; sortOrder?: number }, i: number) => ({
            statusPageId: req.params.id,
            name: c.name,
            description: c.description || null,
            uptimeMonitorId: c.uptimeMonitorId || null,
            sortOrder: c.sortOrder ?? i,
          })),
        });
      }
    }

    const page = await prisma.statusPage.update({
      where: { id: req.params.id },
      data: {
        ...(slug !== undefined && { slug }),
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(customCss !== undefined && { customCss }),
        ...(isPublic !== undefined && { isPublic }),
      },
      include: {
        components: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { subscribers: true } },
      },
    });

    audit(req, {
      action: 'status_page.update',
      entityType: 'status_page',
      entityId: page.id,
    });

    res.json({ success: true, data: page });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/status-pages/:id
 * Delete a status page
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.statusPage.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Status page not found' });
    }

    await prisma.statusPage.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'status_page.delete',
      entityType: 'status_page',
      entityId: req.params.id,
    });

    logger.info('Status page deleted', { id: req.params.id });
    res.json({ success: true, message: 'Status page deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as statusPageRoutes };

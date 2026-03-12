import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const router: ExpressRouter = Router();

// POST /api/rum/beacon - Public endpoint for RUM data collection
router.post('/beacon', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      sessionId,
      userAgent,
      country,
      url,
      loadTime,
      domContentLoaded,
      firstPaint,
      lcp,
      fid,
      cls,
      errorCount,
    } = req.body;

    if (!sessionId || !url) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and url are required',
      });
    }

    // Find or create session
    let session = await prisma.rumSession.findUnique({
      where: { sessionId },
    });

    if (!session) {
      session = await prisma.rumSession.create({
        data: {
          sessionId,
          userAgent: userAgent || req.headers['user-agent'] || null,
          country: country || null,
          startedAt: new Date(),
        },
      });
    }

    // Create page view
    const pageView = await prisma.rumPageView.create({
      data: {
        sessionId,
        url,
        loadTime: loadTime != null ? parseInt(loadTime) : null,
        domContentLoaded: domContentLoaded != null ? parseInt(domContentLoaded) : null,
        firstPaint: firstPaint != null ? parseInt(firstPaint) : null,
        lcp: lcp != null ? parseInt(lcp) : null,
        fid: fid != null ? parseInt(fid) : null,
        cls: cls != null ? parseFloat(cls) : null,
        errorCount: errorCount != null ? parseInt(errorCount) : 0,
        viewedAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: { pageViewId: pageView.id },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/rum/stats - Aggregate web vitals and page stats
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start, end } = req.query;

    const where: any = {};
    if (start || end) {
      where.viewedAt = {};
      if (start) where.viewedAt.gte = new Date(start as string);
      if (end) where.viewedAt.lte = new Date(end as string);
    }

    // Aggregate web vitals
    const aggregation = await prisma.rumPageView.aggregate({
      where,
      _avg: {
        lcp: true,
        fid: true,
        cls: true,
        loadTime: true,
      },
      _count: true,
    });

    // P50 and P95 load times via raw query
    const loadTimePercentiles = await prisma.$queryRaw<
      [{ p50: number | null; p95: number | null }]
    >`
      SELECT
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY load_time) as p50,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY load_time) as p95
      FROM rum_page_views
      WHERE load_time IS NOT NULL
    `;

    // Top pages by view count
    const topPages = await prisma.rumPageView.groupBy({
      by: ['url'],
      where,
      _count: true,
      _avg: { loadTime: true },
      orderBy: { _count: { url: 'desc' } },
      take: 10,
    });

    // Error rate
    const totalViews = aggregation._count;
    const errorViews = await prisma.rumPageView.count({
      where: { ...where, errorCount: { gt: 0 } },
    });
    const errorRate = totalViews > 0 ? (errorViews / totalViews) * 100 : 0;

    // Session count
    const sessionCount = await prisma.rumSession.count();

    res.json({
      success: true,
      data: {
        avgLcp: aggregation._avg.lcp ? Math.round(aggregation._avg.lcp) : null,
        avgFid: aggregation._avg.fid ? Math.round(aggregation._avg.fid) : null,
        avgCls: aggregation._avg.cls ? Math.round(aggregation._avg.cls * 1000) / 1000 : null,
        avgLoadTime: aggregation._avg.loadTime ? Math.round(aggregation._avg.loadTime) : null,
        p50LoadTime: loadTimePercentiles[0]?.p50 ? Math.round(Number(loadTimePercentiles[0].p50)) : null,
        p95LoadTime: loadTimePercentiles[0]?.p95 ? Math.round(Number(loadTimePercentiles[0].p95)) : null,
        totalPageViews: totalViews,
        errorRate: Math.round(errorRate * 100) / 100,
        sessionCount,
        topPages: topPages.map((p) => ({
          url: p.url,
          views: p._count,
          avgLoadTime: p._avg.loadTime ? Math.round(p._avg.loadTime) : null,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/rum/sessions - List sessions with page view count
router.get('/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset } = req.query;

    const sessions = await prisma.rumSession.findMany({
      include: {
        _count: { select: { pageViews: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: parseInt(limit as string) || 50,
      skip: parseInt(offset as string) || 0,
    });

    res.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    next(error);
  }
});

export { router as rumRoutes };

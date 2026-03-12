import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const router: ExpressRouter = Router();

// GET /api/scheduled-reports - List all reports
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reports = await prisma.scheduledReport.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: reports,
      count: reports.length,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/scheduled-reports/:id - Get single report
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const report = await prisma.scheduledReport.findUnique({ where: { id } });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
      });
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/scheduled-reports - Create a new report
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, type, schedule, recipients, enabled } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    if (!type || !['DAILY_SUMMARY', 'WEEKLY_SLA', 'MONTHLY_UPTIME'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type must be one of: DAILY_SUMMARY, WEEKLY_SLA, MONTHLY_UPTIME' });
    }
    if (!schedule || typeof schedule !== 'string' || schedule.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'schedule is required' });
    }

    const report = await prisma.scheduledReport.create({
      data: {
        name: name.trim(),
        type,
        schedule: schedule.trim(),
        recipients: recipients ?? { emails: [], channelIds: [] },
        enabled: enabled ?? true,
      },
    });

    logger.info(`Scheduled report created: ${report.name} (${report.type})`);

    res.status(201).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/scheduled-reports/:id - Update a report
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const existing = await prisma.scheduledReport.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    const { name, type, schedule, recipients, enabled } = req.body;

    const report = await prisma.scheduledReport.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(schedule !== undefined && { schedule }),
        ...(recipients !== undefined && { recipients }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    logger.info(`Scheduled report updated: ${report.name}`);

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/scheduled-reports/:id - Delete a report
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const existing = await prisma.scheduledReport.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    await prisma.scheduledReport.delete({ where: { id } });

    logger.info(`Scheduled report deleted: ${existing.name}`);

    res.json({
      success: true,
      message: 'Report deleted',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/scheduled-reports/:id/send - Manually trigger sending a report
router.post('/:id/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const report = await prisma.scheduledReport.findUnique({ where: { id } });
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    // Update lastSentAt
    await prisma.scheduledReport.update({
      where: { id },
      data: { lastSentAt: new Date() },
    });

    logger.info(`Scheduled report manually triggered: ${report.name} (${report.type})`);

    res.json({
      success: true,
      data: {
        reportId: id,
        reportName: report.name,
        type: report.type,
        sentAt: new Date().toISOString(),
        message: 'Report triggered successfully',
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as scheduledReportRoutes };

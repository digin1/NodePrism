import { Router, Request, Response } from 'express';
import type { Router as ExpressRouter } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { requireAuth, requireRole } from '../middleware/auth';
import { logger } from '../utils/logger';
import { getDiskUsage, getBackupStatus, runDatabaseBackup } from '../services/housekeeping';
import { generateAndSendReport } from '../services/dailyReport';
import { audit } from '../services/auditLogger';
import { encryptConfig, decryptConfig } from '../utils/encryption';

const router: ExpressRouter = Router();
const prisma = new PrismaClient();

// Uploads directory configuration
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
const LOGO_DIR = path.join(UPLOADS_DIR, 'logos');

// Ensure upload directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(LOGO_DIR)) {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
}

// Configure multer for logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, LOGO_DIR);
  },
  filename: (req, file, cb) => {
    // Use a fixed filename so we always overwrite the previous logo
    const ext = path.extname(file.originalname);
    cb(null, `logo${ext}`);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PNG, JPEG, SVG, and WebP are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

// Helper function to get or create system settings
async function getOrCreateSettings() {
  let settings = await prisma.systemSettings.findUnique({
    where: { id: 'default' },
  });

  if (!settings) {
    // Get system hostname and IP
    const hostname = os.hostname();
    const networkInterfaces = os.networkInterfaces();
    let managerIp = '';

    // Try to find a non-internal IPv4 address
    for (const interfaceName of Object.keys(networkInterfaces)) {
      const interfaces = networkInterfaces[interfaceName];
      if (interfaces) {
        for (const iface of interfaces) {
          if (iface.family === 'IPv4' && !iface.internal) {
            managerIp = iface.address;
            break;
          }
        }
      }
      if (managerIp) break;
    }

    settings = await prisma.systemSettings.create({
      data: {
        id: 'default',
        systemName: 'NodePrism',
        managerHostname: hostname,
        managerIp: managerIp,
      },
    });
  }

  return settings;
}

/**
 * GET /api/settings
 * Get system settings (public - for login page branding)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();

    res.json({
      success: true,
      data: {
        systemName: settings.systemName,
        logoUrl: settings.logoUrl || settings.logoPath,
        primaryColor: settings.primaryColor,
        managerHostname: settings.managerHostname,
        managerIp: settings.managerIp,
        timezone: settings.timezone,
        dateFormat: settings.dateFormat,
        dailyReportTime: settings.dailyReportTime,
      },
    });
  } catch (error) {
    logger.error('Failed to get system settings', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get system settings',
    });
  }
});

/**
 * GET /api/settings/all
 * Get all system settings (admin only)
 */
router.get('/all', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    logger.error('Failed to get system settings', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get system settings',
    });
  }
});

/**
 * PUT /api/settings
 * Update system settings (admin only)
 */
router.put('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const {
      systemName,
      logoUrl,
      primaryColor,
      managerHostname,
      managerIp,
      timezone,
      dateFormat,
      dailyReportTime,
    } = req.body;

    const settings = await prisma.systemSettings.upsert({
      where: { id: 'default' },
      update: {
        ...(systemName !== undefined && { systemName }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(primaryColor !== undefined && { primaryColor }),
        ...(managerHostname !== undefined && { managerHostname }),
        ...(managerIp !== undefined && { managerIp }),
        ...(timezone !== undefined && { timezone }),
        ...(dateFormat !== undefined && { dateFormat }),
        ...(dailyReportTime !== undefined && { dailyReportTime }),
      },
      create: {
        id: 'default',
        systemName: systemName || 'NodePrism',
        logoUrl,
        primaryColor: primaryColor || '#3B82F6',
        managerHostname: managerHostname || os.hostname(),
        managerIp,
        timezone: timezone || 'UTC',
        dateFormat: dateFormat || 'YYYY-MM-DD',
        dailyReportTime: dailyReportTime || '08:00',
      },
    });

    logger.info('System settings updated', { userId: req.user?.userId });
    audit(req, { action: 'settings.update', entityType: 'settings', details: req.body });

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    logger.error('Failed to update system settings', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update system settings',
    });
  }
});

/**
 * POST /api/settings/logo
 * Upload a new logo (admin only)
 */
router.post(
  '/logo',
  requireAuth,
  requireRole('ADMIN'),
  upload.single('logo'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
        });
      }

      // Build the logo URL path
      const logoPath = `/uploads/logos/${req.file.filename}`;

      // Update system settings with the new logo path
      await prisma.systemSettings.upsert({
        where: { id: 'default' },
        update: {
          logoPath: logoPath,
          logoUrl: null, // Clear external URL when uploading local file
        },
        create: {
          id: 'default',
          logoPath: logoPath,
          managerHostname: os.hostname(),
        },
      });

      logger.info('Logo uploaded', { userId: req.user?.userId, filename: req.file.filename });
      audit(req, { action: 'settings.logo_upload', entityType: 'settings' });

      res.json({
        success: true,
        data: {
          logoPath,
          message: 'Logo uploaded successfully',
        },
      });
    } catch (error) {
      logger.error('Failed to upload logo', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to upload logo',
      });
    }
  }
);

/**
 * DELETE /api/settings/logo
 * Delete the current logo (admin only)
 */
router.delete('/logo', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: 'default' },
    });

    if (settings?.logoPath) {
      // Remove the file from disk
      const filePath = path.join(UPLOADS_DIR, '..', settings.logoPath.replace('/uploads/', ''));
      const absolutePath = path.join(UPLOADS_DIR, settings.logoPath.replace('/uploads/', ''));

      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    }

    // Update settings to remove logo
    await prisma.systemSettings.update({
      where: { id: 'default' },
      data: {
        logoPath: null,
        logoUrl: null,
      },
    });

    logger.info('Logo deleted', { userId: req.user?.userId });
    audit(req, { action: 'settings.logo_delete', entityType: 'settings' });

    res.json({
      success: true,
      message: 'Logo deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete logo', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete logo',
    });
  }
});

/**
 * GET /api/settings/system-info
 * Get system hostname and IP (admin only)
 */
router.get('/system-info', requireAuth, async (req: Request, res: Response) => {
  try {
    const hostname = os.hostname();
    const networkInterfaces = os.networkInterfaces();
    const ips: string[] = [];

    // Get all non-internal IPv4 addresses
    for (const interfaceName of Object.keys(networkInterfaces)) {
      const interfaces = networkInterfaces[interfaceName];
      if (interfaces) {
        for (const iface of interfaces) {
          if (iface.family === 'IPv4' && !iface.internal) {
            ips.push(iface.address);
          }
        }
      }
    }

    const disk = getDiskUsage();

    res.json({
      success: true,
      data: {
        hostname,
        ips,
        platform: os.platform(),
        release: os.release(),
        uptime: os.uptime(),
        memory: {
          totalGB: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10,
          freeGB: Math.round(os.freemem() / (1024 * 1024 * 1024) * 10) / 10,
          usedPercent: Math.round((1 - os.freemem() / os.totalmem()) * 100),
        },
        disk,
        backup: getBackupStatus(),
      },
    });
  } catch (error) {
    logger.error('Failed to get system info', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get system info',
    });
  }
});

/**
 * POST /api/settings/backup
 * Trigger a manual database backup (admin only)
 */
router.post('/backup', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const result = await runDatabaseBackup();
    if (result) {
      audit(req, { action: 'settings.update', entityType: 'backup', details: { file: result.file } });
      res.json({ success: true, data: result });
    } else {
      res.status(500).json({ success: false, error: 'Backup failed' });
    }
  } catch (error) {
    logger.error('Manual backup failed', { error });
    res.status(500).json({ success: false, error: 'Backup failed' });
  }
});

/**
 * POST /api/settings/daily-report
 * Manually trigger the daily infrastructure report (admin only)
 */
router.post('/daily-report', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    await generateAndSendReport();
    audit(req, { action: 'settings.update', entityType: 'daily-report', details: { trigger: 'manual' } });
    res.json({ success: true, message: 'Daily report sent successfully' });
  } catch (error: any) {
    logger.error('Manual daily report failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to send daily report' });
  }
});

/**
 * GET /api/settings/export
 * Export system configuration as JSON (admin only)
 */
router.get('/export', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const [alertRules, alertTemplates, dashboards, notificationChannels, settings] = await Promise.all([
      prisma.alertRule.findMany(),
      prisma.alertTemplate.findMany(),
      prisma.dashboard.findMany(),
      prisma.notificationChannel.findMany({ select: { id: true, name: true, type: true, config: true, enabled: true } }),
      getOrCreateSettings(),
    ]);

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      alertRules: alertRules.map(r => ({
        name: r.name,
        description: r.description,
        query: r.query,
        duration: r.duration,
        severity: r.severity,
        labels: r.labels,
        annotations: r.annotations,
        enabled: r.enabled,
      })),
      alertTemplates: alertTemplates.map(t => ({
        name: t.name,
        description: t.description,
        matchLabels: t.matchLabels,
        matchHostLabels: t.matchHostLabels,
        query: t.query,
        calc: t.calc,
        units: t.units,
        warnCondition: t.warnCondition,
        critCondition: t.critCondition,
        every: t.every,
        for: t.for,
        actions: t.actions,
        enabled: t.enabled,
      })),
      dashboards: dashboards.map(d => ({
        name: d.name,
        description: d.description,
        config: d.config,
        isDefault: d.isDefault,
      })),
      notificationChannels: notificationChannels.map(c => ({
        name: c.name,
        type: c.type,
        config: decryptConfig(c.config as Record<string, unknown>),
        enabled: c.enabled,
      })),
      settings: {
        systemName: settings.systemName,
        primaryColor: settings.primaryColor,
        timezone: settings.timezone,
        dateFormat: settings.dateFormat,
        dailyReportTime: settings.dailyReportTime,
      },
    };

    audit(req, { action: 'settings.export', entityType: 'settings' });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="nodeprism-config-${new Date().toISOString().split('T')[0]}.json"`);
    res.json({ success: true, data: exportData });
  } catch (error) {
    logger.error('Failed to export config', { error });
    res.status(500).json({ success: false, error: 'Failed to export configuration' });
  }
});

/**
 * POST /api/settings/import
 * Import system configuration from JSON (admin only)
 */
router.post('/import', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { data, mode = 'skip' } = req.body; // mode: 'skip' | 'overwrite'

    if (!data || !data.version) {
      return res.status(400).json({ success: false, error: 'Invalid config file format' });
    }

    const results = { alertRules: 0, alertTemplates: 0, dashboards: 0, notificationChannels: 0, settings: false, skipped: 0 };

    // Import alert rules
    if (data.alertRules?.length) {
      for (const rule of data.alertRules) {
        const existing = await prisma.alertRule.findFirst({ where: { name: rule.name } });
        if (existing) {
          if (mode === 'overwrite') {
            await prisma.alertRule.update({ where: { id: existing.id }, data: rule });
            results.alertRules++;
          } else {
            results.skipped++;
          }
        } else {
          await prisma.alertRule.create({ data: rule });
          results.alertRules++;
        }
      }
    }

    // Import alert templates
    if (data.alertTemplates?.length) {
      for (const template of data.alertTemplates) {
        const existing = await prisma.alertTemplate.findFirst({ where: { name: template.name } });
        if (existing) {
          if (mode === 'overwrite') {
            await prisma.alertTemplate.update({ where: { id: existing.id }, data: template });
            results.alertTemplates++;
          } else {
            results.skipped++;
          }
        } else {
          await prisma.alertTemplate.create({ data: template });
          results.alertTemplates++;
        }
      }
    }

    // Import dashboards
    if (data.dashboards?.length) {
      for (const dashboard of data.dashboards) {
        const existing = await prisma.dashboard.findFirst({ where: { name: dashboard.name } });
        if (existing) {
          if (mode === 'overwrite') {
            await prisma.dashboard.update({ where: { id: existing.id }, data: dashboard });
            results.dashboards++;
          } else {
            results.skipped++;
          }
        } else {
          await prisma.dashboard.create({ data: dashboard });
          results.dashboards++;
        }
      }
    }

    // Import notification channels (encrypt secrets on import)
    if (data.notificationChannels?.length) {
      for (const channel of data.notificationChannels) {
        const encChannel = { ...channel, config: encryptConfig(channel.config as Record<string, unknown>) };
        const existing = await prisma.notificationChannel.findFirst({ where: { name: channel.name } });
        if (existing) {
          if (mode === 'overwrite') {
            await prisma.notificationChannel.update({ where: { id: existing.id }, data: encChannel });
            results.notificationChannels++;
          } else {
            results.skipped++;
          }
        } else {
          await prisma.notificationChannel.create({ data: encChannel });
          results.notificationChannels++;
        }
      }
    }

    // Import settings
    if (data.settings) {
      await prisma.systemSettings.upsert({
        where: { id: 'default' },
        update: data.settings,
        create: { id: 'default', ...data.settings },
      });
      results.settings = true;
    }

    logger.info('Config imported', { results });
    audit(req, { action: 'settings.import', entityType: 'settings', details: { mode, results } });

    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Failed to import config', { error });
    res.status(500).json({ success: false, error: 'Failed to import configuration' });
  }
});

export { router as settingsRoutes };

import { Router, Request, Response } from 'express';
import type { Router as ExpressRouter } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { requireAuth, requireRole } from '../middleware/auth';
import { logger } from '../utils/logger';

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
      },
    });

    logger.info('System settings updated', { userId: req.user?.userId });

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

    res.json({
      success: true,
      data: {
        hostname,
        ips,
        platform: os.platform(),
        release: os.release(),
        uptime: os.uptime(),
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

export { router as settingsRoutes };

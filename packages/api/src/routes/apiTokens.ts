import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';
import crypto from 'crypto';

const router: ExpressRouter = Router();

// GET / - List tokens for current user (never expose tokenHash)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokens = await prisma.apiToken.findMany({
      where: { userId: req.user!.userId },
      select: {
        id: true,
        name: true,
        permissions: true,
        expiresAt: true,
        lastUsedAt: true,
        revoked: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: tokens });
  } catch (error) {
    next(error);
  }
});

// POST / - Create a new API token
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, permissions, expiresAt } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    // Generate a random token prefixed with np_ for identification
    const rawToken = `np_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const token = await prisma.apiToken.create({
      data: {
        name,
        tokenHash,
        userId: req.user!.userId,
        permissions: permissions ?? [],
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    logger.info(`API token created: ${token.name} (${token.id})`);
    audit(req, {
      action: 'api_token.create',
      entityType: 'api_token',
      entityId: token.id,
      details: { name: token.name },
    });

    // Return the raw token ONLY in this response — it can never be retrieved again
    res.status(201).json({
      success: true,
      data: {
        id: token.id,
        name: token.name,
        permissions: token.permissions,
        expiresAt: token.expiresAt,
        createdAt: token.createdAt,
        token: rawToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /:id - Delete token (only if it belongs to current user)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.apiToken.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Token not found' });
    }

    if (existing.userId !== req.user!.userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await prisma.apiToken.delete({
      where: { id: req.params.id },
    });

    logger.info(`API token deleted: ${existing.name} (${existing.id})`);
    audit(req, {
      action: 'api_token.delete',
      entityType: 'api_token',
      entityId: req.params.id,
      details: { name: existing.name },
    });

    res.json({ success: true, message: 'Token deleted' });
  } catch (error) {
    next(error);
  }
});

// POST /:id/revoke - Revoke token (only if it belongs to current user)
router.post('/:id/revoke', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.apiToken.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Token not found' });
    }

    if (existing.userId !== req.user!.userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const token = await prisma.apiToken.update({
      where: { id: req.params.id },
      data: { revoked: true },
    });

    logger.info(`API token revoked: ${token.name} (${token.id})`);
    audit(req, {
      action: 'api_token.revoke',
      entityType: 'api_token',
      entityId: token.id,
      details: { name: token.name },
    });

    res.json({ success: true, message: 'Token revoked' });
  } catch (error) {
    next(error);
  }
});

export { router as apiTokenRoutes };

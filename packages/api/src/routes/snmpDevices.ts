import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';

const router: ExpressRouter = Router();

/**
 * GET /api/snmp-devices
 * List all SNMP devices
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const devices = await prisma.snmpDevice.findMany({
      include: {
        results: {
          orderBy: { polledAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = devices.map((device) => ({
      ...device,
      lastPollAt: device.results[0]?.polledAt ?? null,
      results: undefined,
    }));

    res.json({ success: true, data: enriched, count: enriched.length });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/snmp-devices/:id
 * Get a single device with recent poll results
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await prisma.snmpDevice.findUnique({
      where: { id: req.params.id },
      include: {
        results: {
          orderBy: { polledAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!device) {
      return res.status(404).json({ success: false, error: 'SNMP device not found' });
    }

    res.json({ success: true, data: device });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/snmp-devices
 * Create a new SNMP device
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, host, port, version, community, authConfig, oids, interval, enabled } = req.body;

    if (!name || !host) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, host' });
    }

    if (!oids || !Array.isArray(oids)) {
      return res.status(400).json({ success: false, error: 'oids must be an array' });
    }

    const device = await prisma.snmpDevice.create({
      data: {
        name,
        host,
        port: port ?? 161,
        version: version ?? '2c',
        community: community ?? null,
        authConfig: authConfig ?? null,
        oids,
        interval: interval ?? 60,
        enabled: enabled ?? true,
      },
    });

    audit(req, {
      action: 'snmp_device.create',
      entityType: 'snmp_device',
      entityId: device.id,
      details: { name, host },
    });

    logger.info('SNMP device created', { id: device.id, name, host });
    res.status(201).json({ success: true, data: device });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/snmp-devices/:id
 * Update an SNMP device
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.snmpDevice.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'SNMP device not found' });
    }

    const { name, host, port, version, community, authConfig, oids, interval, enabled } = req.body;

    const device = await prisma.snmpDevice.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(host !== undefined && { host }),
        ...(port !== undefined && { port }),
        ...(version !== undefined && { version }),
        ...(community !== undefined && { community }),
        ...(authConfig !== undefined && { authConfig }),
        ...(oids !== undefined && { oids }),
        ...(interval !== undefined && { interval }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    audit(req, {
      action: 'snmp_device.update',
      entityType: 'snmp_device',
      entityId: device.id,
    });

    res.json({ success: true, data: device });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/snmp-devices/:id
 * Delete an SNMP device and its poll results
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.snmpDevice.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'SNMP device not found' });
    }

    await prisma.snmpDevice.delete({ where: { id: req.params.id } });

    audit(req, {
      action: 'snmp_device.delete',
      entityType: 'snmp_device',
      entityId: req.params.id,
    });

    logger.info('SNMP device deleted', { id: req.params.id });
    res.json({ success: true, message: 'SNMP device deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/snmp-devices/:id/results
 * Get poll results with pagination
 */
router.get('/:id/results', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.snmpDevice.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'SNMP device not found' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const [results, total] = await Promise.all([
      prisma.snmpPollResult.findMany({
        where: { deviceId: req.params.id },
        orderBy: { polledAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.snmpPollResult.count({ where: { deviceId: req.params.id } }),
    ]);

    res.json({ success: true, data: results, count: total });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/snmp-devices/:id/poll
 * Trigger a manual poll (stub - logs intent)
 */
router.post('/:id/poll', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await prisma.snmpDevice.findUnique({ where: { id: req.params.id } });
    if (!device) {
      return res.status(404).json({ success: false, error: 'SNMP device not found' });
    }

    // Stub: In production this would call the SNMP poller service
    logger.info('Manual SNMP poll triggered (stub)', { deviceId: device.id, host: device.host });

    // Create a stub result to show the flow works
    const result = await prisma.snmpPollResult.create({
      data: {
        deviceId: device.id,
        values: { stub: true, message: 'Manual poll triggered - net-snmp package not installed' },
      },
    });

    res.json({
      success: true,
      data: result,
      message: 'Poll triggered (stub - net-snmp not installed)',
    });
  } catch (error) {
    next(error);
  }
});

export { router as snmpDeviceRoutes };

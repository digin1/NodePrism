import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { spawn } from 'child_process';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { requireAuth, requireRole } from '../middleware/auth';

const router: ExpressRouter = Router();

// GET /api/runbooks - List runbooks
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runbooks = await prisma.runbook.findMany({
      include: {
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
          },
        },
        _count: { select: { executions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = runbooks.map((rb) => ({
      ...rb,
      lastExecution: rb.executions[0] || null,
      executions: undefined,
    }));

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/runbooks - Create runbook (ADMIN only)
router.post('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, script, language, timeout, enabled } = req.body;

    if (!name || !script) {
      return res.status(400).json({
        success: false,
        error: 'name and script are required',
      });
    }

    const validLanguages = ['bash', 'python', 'node'];
    if (language && !validLanguages.includes(language)) {
      return res.status(400).json({
        success: false,
        error: `language must be one of: ${validLanguages.join(', ')}`,
      });
    }

    const runbook = await prisma.runbook.create({
      data: {
        name,
        ...(description && { description }),
        script,
        language: language || 'bash',
        timeout: timeout || 300,
        enabled: enabled !== undefined ? enabled : true,
      },
    });

    logger.info(`Runbook created: ${runbook.name}`);

    res.status(201).json({
      success: true,
      data: runbook,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/runbooks/:id - Get runbook with recent executions
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const runbook = await prisma.runbook.findUnique({
      where: { id },
      include: {
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!runbook) {
      return res.status(404).json({
        success: false,
        error: 'Runbook not found',
      });
    }

    res.json({
      success: true,
      data: runbook,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/runbooks/:id - Update runbook (ADMIN only)
router.put('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, description, script, language, timeout, enabled } = req.body;

    const existing = await prisma.runbook.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Runbook not found',
      });
    }

    if (language) {
      const validLanguages = ['bash', 'python', 'node'];
      if (!validLanguages.includes(language)) {
        return res.status(400).json({
          success: false,
          error: `language must be one of: ${validLanguages.join(', ')}`,
        });
      }
    }

    const runbook = await prisma.runbook.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(script !== undefined && { script }),
        ...(language !== undefined && { language }),
        ...(timeout !== undefined && { timeout }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    logger.info(`Runbook updated: ${runbook.name}`);

    res.json({
      success: true,
      data: runbook,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/runbooks/:id - Delete runbook (ADMIN only)
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const existing = await prisma.runbook.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Runbook not found',
      });
    }

    await prisma.runbook.delete({ where: { id } });

    logger.info(`Runbook deleted: ${existing.name}`);

    res.json({
      success: true,
      message: 'Runbook deleted',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/runbooks/:id/execute - Execute runbook manually
router.post('/:id/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { alertId, serverId } = req.body;

    const runbook = await prisma.runbook.findUnique({ where: { id } });
    if (!runbook) {
      return res.status(404).json({
        success: false,
        error: 'Runbook not found',
      });
    }

    if (!runbook.enabled) {
      return res.status(400).json({
        success: false,
        error: 'Runbook is disabled',
      });
    }

    const triggeredBy = req.user?.email || 'manual';

    // Create execution record
    const execution = await prisma.runbookExecution.create({
      data: {
        runbookId: id,
        status: 'RUNNING',
        startedAt: new Date(),
        triggeredBy,
        ...(alertId && { alertId }),
        ...(serverId && { serverId }),
      },
    });

    // Determine the command based on language
    const langMap: Record<string, string> = {
      bash: 'bash',
      python: 'python3',
      node: 'node',
    };
    const command = langMap[runbook.language] || 'bash';

    // Execute the script
    const child = spawn(command, ['-c', runbook.script], {
      timeout: runbook.timeout * 1000,
      env: {
        ...process.env,
        RUNBOOK_ID: id,
        RUNBOOK_NAME: runbook.name,
        ...(alertId && { ALERT_ID: alertId }),
        ...(serverId && { SERVER_ID: serverId }),
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', async (exitCode) => {
      const output = (stdout + (stderr ? '\n--- STDERR ---\n' + stderr : '')).slice(0, 50000);
      const status = exitCode === 0 ? 'SUCCESS' : 'FAILED';

      await prisma.runbookExecution.update({
        where: { id: execution.id },
        data: {
          status,
          output,
          exitCode,
          finishedAt: new Date(),
        },
      });

      logger.info(`Runbook execution completed: ${runbook.name} [${status}]`);
    });

    child.on('error', async (err) => {
      const isTimeout = err.message.includes('ETIMEDOUT') || (err as any).killed;
      await prisma.runbookExecution.update({
        where: { id: execution.id },
        data: {
          status: isTimeout ? 'TIMEOUT' : 'FAILED',
          output: `Error: ${err.message}\n${stdout}${stderr ? '\n--- STDERR ---\n' + stderr : ''}`.slice(0, 50000),
          exitCode: -1,
          finishedAt: new Date(),
        },
      });

      logger.error(`Runbook execution failed: ${runbook.name} - ${err.message}`);
    });

    res.status(202).json({
      success: true,
      data: {
        executionId: execution.id,
        status: 'RUNNING',
        message: 'Runbook execution started',
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/runbooks/:id/executions - Get execution history
router.get('/:id/executions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { limit } = req.query;

    const existing = await prisma.runbook.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Runbook not found',
      });
    }

    const executions = await prisma.runbookExecution.findMany({
      where: { runbookId: id },
      orderBy: { startedAt: 'desc' },
      take: parseInt(limit as string) || 50,
    });

    res.json({
      success: true,
      data: executions,
    });
  } catch (error) {
    next(error);
  }
});

export { router as runbookRoutes };

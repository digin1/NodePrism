import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router: ExpressRouter = Router();

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateGroupSchema = createGroupSchema.partial();

const moveServersSchema = z.object({
  serverIds: z.array(z.string().uuid()).min(1),
  groupId: z.string().uuid().nullable(),
});

// Helper: build nested tree from flat list
function buildTree(groups: any[]): any[] {
  const map = new Map<string, any>();
  const roots: any[] = [];

  for (const group of groups) {
    map.set(group.id, { ...group, children: [] });
  }

  for (const group of groups) {
    const node = map.get(group.id)!;
    if (group.parentId && map.has(group.parentId)) {
      map.get(group.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// Helper: get all descendant group IDs (for circular ref check)
async function getDescendantIds(groupId: string): Promise<string[]> {
  const ids: string[] = [];
  const queue = [groupId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = await prisma.serverGroup.findMany({
      where: { parentId: currentId },
      select: { id: true },
    });
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }

  return ids;
}

// GET /api/server-groups - List all groups as tree
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { flat } = req.query;

    const groups = await prisma.serverGroup.findMany({
      include: {
        _count: { select: { servers: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    res.json({
      success: true,
      data: flat === 'true' ? groups : buildTree(groups),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/server-groups/:id - Get single group with servers
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const group = await prisma.serverGroup.findUnique({
      where: { id },
      include: {
        children: {
          include: { _count: { select: { servers: true } } },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        servers: {
          include: {
            agents: true,
            _count: { select: { alerts: { where: { status: 'FIRING' } } } },
          },
        },
        _count: { select: { servers: true } },
      },
    });

    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    res.json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
});

// POST /api/server-groups - Create group
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createGroupSchema.parse(req.body);

    // Verify parent exists if specified
    if (data.parentId) {
      const parent = await prisma.serverGroup.findUnique({ where: { id: data.parentId } });
      if (!parent) {
        return res.status(400).json({ success: false, error: 'Parent group not found' });
      }
    }

    const group = await prisma.serverGroup.create({
      data: {
        name: data.name,
        description: data.description,
        parentId: data.parentId ?? null,
        sortOrder: data.sortOrder ?? 0,
      },
      include: { _count: { select: { servers: true } } },
    });

    logger.info(`Server group created: ${group.name}`);

    res.status(201).json({ success: true, data: group });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// PUT /api/server-groups/:id - Update group
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = updateGroupSchema.parse(req.body);

    // Prevent circular reference: can't set parent to self or descendant
    if (data.parentId) {
      if (data.parentId === id) {
        return res.status(400).json({ success: false, error: 'A group cannot be its own parent' });
      }
      const descendantIds = await getDescendantIds(id);
      if (descendantIds.includes(data.parentId)) {
        return res.status(400).json({ success: false, error: 'Cannot move a group under its own descendant' });
      }
    }

    const group = await prisma.serverGroup.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.parentId !== undefined && { parentId: data.parentId }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
      include: { _count: { select: { servers: true } } },
    });

    logger.info(`Server group updated: ${group.name}`);

    res.json({ success: true, data: group });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// DELETE /api/server-groups/:id - Delete group (servers become ungrouped)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Move children to parent (or root)
    const group = await prisma.serverGroup.findUnique({ where: { id } });
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    // Reparent children and ungroup servers in a transaction
    await prisma.$transaction([
      prisma.serverGroup.updateMany({
        where: { parentId: id },
        data: { parentId: group.parentId },
      }),
      prisma.server.updateMany({
        where: { groupId: id },
        data: { groupId: null },
      }),
      prisma.serverGroup.delete({ where: { id } }),
    ]);

    logger.info(`Server group deleted: ${group.name}`);

    res.json({ success: true, message: 'Group deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/server-groups/move-servers - Move servers to a group
router.post('/move-servers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverIds, groupId } = moveServersSchema.parse(req.body);

    // Verify group exists if not null
    if (groupId) {
      const group = await prisma.serverGroup.findUnique({ where: { id: groupId } });
      if (!group) {
        return res.status(400).json({ success: false, error: 'Target group not found' });
      }
    }

    await prisma.server.updateMany({
      where: { id: { in: serverIds } },
      data: { groupId },
    });

    logger.info(`Moved ${serverIds.length} server(s) to group ${groupId || 'ungrouped'}`);

    res.json({ success: true, message: `${serverIds.length} server(s) moved` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

export { router as serverGroupRoutes };

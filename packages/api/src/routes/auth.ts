import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { authLimiter } from '../middleware/rateLimit';
import bcrypt from 'bcrypt';
import { audit } from '../services/auditLogger';
import jwt from 'jsonwebtoken';

const router: ExpressRouter = Router();

// Apply strict rate limiting to auth routes
router.use(authLimiter);

const JWT_SECRET = process.env.JWT_SECRET || 'nodeprism-dev-only-secret-do-not-use-in-prod';
// 7 days in seconds (604800)
const JWT_EXPIRES_IN = 604800;

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).default('VIEWER'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /api/auth/register - Register new user
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        role: data.role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info(`User registered: ${user.email}`);
    audit(req, { action: 'auth.register', entityType: 'user', entityId: user.id, details: { email: user.email } });

    // Set httpOnly session cookie (used by nginx auth_request for Prometheus/Grafana)
    res.cookie('nodeprism_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: JWT_EXPIRES_IN * 1000,
      path: '/',
    });

    res.status(201).json({
      success: true,
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

// POST /api/auth/login - Login user
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    // Verify password
    const valid = await bcrypt.compare(data.password, user.passwordHash);

    if (!valid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info(`User logged in: ${user.email}`);
    audit(req, { action: 'auth.login', entityType: 'user', entityId: user.id, details: { email: user.email } });

    // Set httpOnly session cookie (used by nginx auth_request for Prometheus/Grafana)
    res.cookie('nodeprism_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: JWT_EXPIRES_IN * 1000,
      path: '/',
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

// GET /api/auth/me - Get current user
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; role: string };

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          lastLogin: true,
          createdAt: true,
        },
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found',
        });
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
    }
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout - Logout (client-side token removal + clear session cookie)
router.post('/logout', (req: Request, res: Response) => {
  logger.info('User logout requested');

  // Clear the httpOnly session cookie
  res.clearCookie('nodeprism_session', { path: '/' });

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

// GET /api/auth/verify-session - Verify session cookie (used by nginx auth_request)
router.get('/verify-session', (req: Request, res: Response) => {
  const token = req.cookies?.nodeprism_session;

  if (!token) {
    return res.status(401).end();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };

    // Only ADMIN and OPERATOR roles can access protected services
    if (decoded.role !== 'ADMIN' && decoded.role !== 'OPERATOR') {
      return res.status(403).end();
    }

    res.status(200).end();
  } catch {
    res.status(401).end();
  }
});

// GET /api/auth/users - List all users (admin only)
router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; role: string };

      if (decoded.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
      }

      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          lastLogin: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        success: true,
        data: users,
        count: users.length,
      });
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
    }
  } catch (error) {
    next(error);
  }
});

// PUT /api/auth/users/:id - Update user (admin only)
router.put('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };

    if (decoded.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { id } = req.params;
    const updateSchema = z.object({
      name: z.string().min(2).optional(),
      role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).optional(),
      password: z.string().min(8).optional(),
    });

    const data = updateSchema.parse(req.body);
    const updateData: Record<string, unknown> = {};

    if (data.name) updateData.name = data.name;
    if (data.role) updateData.role = data.role;
    if (data.password) updateData.passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, lastLogin: true, createdAt: true },
    });

    logger.info(`User updated: ${user.email}`);
    audit(req, { action: 'settings.update', entityType: 'user', entityId: user.id, details: { email: user.email, changes: Object.keys(updateData) } });

    res.json({ success: true, data: user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    if ((error as any)?.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    next(error);
  }
});

// DELETE /api/auth/users/:id - Delete user (admin only)
router.delete('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };

    if (decoded.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { id } = req.params;

    // Prevent self-deletion
    if (id === decoded.userId) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
    }

    const user = await prisma.user.delete({
      where: { id },
      select: { id: true, email: true, name: true },
    });

    logger.info(`User deleted: ${user.email}`);
    audit(req, { action: 'settings.update', entityType: 'user', entityId: user.id, details: { email: user.email, action: 'deleted' } });

    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    if ((error as any)?.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    next(error);
  }
});

export { router as authRoutes };

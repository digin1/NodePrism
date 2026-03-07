import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set. Using insecure default. Set JWT_SECRET in .env for production.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'nodeprism-dev-only-secret-do-not-use-in-prod';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Middleware to require authentication
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }
};

// Middleware to require specific roles
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
    }

    next();
  };
};

// Optional auth - sets user if token provided but doesn't require it
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
  } catch (error) {
    // Invalid token, but continue without auth
  }

  next();
};

// Special middleware for agent endpoints (API key or no auth)
export const agentAuth = (req: Request, res: Response, next: NextFunction) => {
  // Agents can authenticate with API key or skip auth for registration
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;

  // Allow unauthenticated agent registration/heartbeat
  // In production, you'd want to verify API keys
  if (apiKey) {
    // For now, just mark as agent request
    (req as any).isAgentRequest = true;
  }

  next();
};

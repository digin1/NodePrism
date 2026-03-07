import { z } from 'zod';

// Validation schemas (mirroring routes/auth.ts)
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

describe('Auth Validation', () => {
  describe('registerSchema', () => {
    it('should accept valid registration data', () => {
      const result = registerSchema.safeParse({
        email: 'admin@example.com',
        password: 'securepass123',
        name: 'Admin User',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = registerSchema.safeParse({
        email: 'not-an-email',
        password: 'securepass123',
        name: 'Admin',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short password', () => {
      const result = registerSchema.safeParse({
        email: 'admin@example.com',
        password: 'short',
        name: 'Admin',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty name', () => {
      const result = registerSchema.safeParse({
        email: 'admin@example.com',
        password: 'securepass123',
        name: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing fields', () => {
      const result = registerSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('should accept valid login data', () => {
      const result = loginSchema.safeParse({
        email: 'admin@example.com',
        password: 'securepass123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'bad',
        password: 'securepass123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty password', () => {
      const result = loginSchema.safeParse({
        email: 'admin@example.com',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });
});

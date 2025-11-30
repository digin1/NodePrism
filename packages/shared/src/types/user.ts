import { z } from 'zod';

export const UserRoleSchema = z.enum(['admin', 'operator', 'viewer']);

export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  role: UserRoleSchema,
  passwordHash: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastLogin: z.date().optional(),
});

export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = UserSchema.omit({
  id: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
  lastLogin: true,
}).extend({
  password: z.string().min(8),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const JWTPayloadSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  role: UserRoleSchema,
  iat: z.number(),
  exp: z.number(),
});

export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

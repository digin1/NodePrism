import { z } from 'zod';

export const ServerStatusSchema = z.enum([
  'online',
  'offline',
  'warning',
  'critical',
  'deploying',
]);

export type ServerStatus = z.infer<typeof ServerStatusSchema>;

export const ServerSchema = z.object({
  id: z.string().uuid(),
  hostname: z.string().min(1),
  ipAddress: z.string().ip(),
  sshPort: z.number().int().min(1).max(65535).default(22),
  tags: z.array(z.string()).default([]),
  environment: z.enum(['development', 'staging', 'production']).default('production'),
  region: z.string().optional(),
  status: ServerStatusSchema.default('offline'),
  lastSeen: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type Server = z.infer<typeof ServerSchema>;

export const CreateServerSchema = ServerSchema.omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  lastSeen: true,
}).extend({
  sshUsername: z.string().min(1),
  sshPassword: z.string().min(1).optional(),
  sshKeyPath: z.string().optional(),
});

export type CreateServerInput = z.infer<typeof CreateServerSchema>;

export const UpdateServerSchema = ServerSchema.partial().omit({
  id: true,
  createdAt: true,
});

export type UpdateServerInput = z.infer<typeof UpdateServerSchema>;

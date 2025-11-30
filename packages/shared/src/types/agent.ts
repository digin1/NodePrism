import { z } from 'zod';

export const AgentTypeSchema = z.enum([
  'node_exporter',
  'app_agent',
  'mysql_exporter',
  'postgres_exporter',
  'mongodb_exporter',
  'nginx_exporter',
  'apache_exporter',
  'promtail',
]);

export type AgentType = z.infer<typeof AgentTypeSchema>;

export const AgentStatusSchema = z.enum([
  'not_installed',
  'installing',
  'running',
  'stopped',
  'failed',
]);

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentSchema = z.object({
  id: z.string().uuid(),
  serverId: z.string().uuid(),
  type: AgentTypeSchema,
  status: AgentStatusSchema,
  version: z.string(),
  port: z.number().int(),
  config: z.record(z.string(), z.any()).optional(),
  lastHealthCheck: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Agent = z.infer<typeof AgentSchema>;

export const AgentConfigSchema = z.object({
  manager_url: z.string().url(),
  api_key: z.string(),
  node_exporter: z
    .object({
      enabled: z.boolean(),
      port: z.number().default(9100),
    })
    .optional(),
  app_agent: z
    .object({
      enabled: z.boolean(),
      port: z.number().default(9101),
      applications: z
        .array(
          z.object({
            name: z.string(),
            type: z.enum(['nodejs', 'python', 'java']),
            port: z.number().optional(),
            health_endpoint: z.string().optional(),
            pm2_name: z.string().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  database_exporters: z
    .object({
      mysql: z
        .object({
          enabled: z.boolean(),
          dsn: z.string(),
        })
        .optional(),
      postgres: z
        .object({
          enabled: z.boolean(),
          dsn: z.string(),
        })
        .optional(),
      mongodb: z
        .object({
          enabled: z.boolean(),
          uri: z.string(),
        })
        .optional(),
    })
    .optional(),
  logs: z
    .object({
      promtail: z.object({
        enabled: z.boolean(),
        loki_url: z.string().url(),
      }),
    })
    .optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

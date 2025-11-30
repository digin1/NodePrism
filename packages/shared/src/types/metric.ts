import { z } from 'zod';

export const MetricTypeSchema = z.enum([
  'cpu',
  'memory',
  'disk',
  'network',
  'application',
  'database',
  'custom',
]);

export type MetricType = z.infer<typeof MetricTypeSchema>;

export const MetricDataPointSchema = z.object({
  timestamp: z.number(),
  value: z.number(),
  labels: z.record(z.string(), z.string()).optional(),
});

export type MetricDataPoint = z.infer<typeof MetricDataPointSchema>;

export const MetricQuerySchema = z.object({
  serverId: z.string().uuid().optional(),
  type: MetricTypeSchema.optional(),
  start: z.number(),
  end: z.number(),
  step: z.number().optional(),
  query: z.string().optional(), // PromQL query
});

export type MetricQuery = z.infer<typeof MetricQuerySchema>;

export const MetricResponseSchema = z.object({
  metric: z.record(z.string(), z.string()),
  values: z.array(z.tuple([z.number(), z.string()])),
});

export type MetricResponse = z.infer<typeof MetricResponseSchema>;

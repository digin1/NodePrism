import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import axios from 'axios';
import { logger } from '../utils/logger';
import { agentLimiter } from '../middleware/rateLimit';

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';

const router: ExpressRouter = Router();

// Validation schemas
const containerSchema = z.object({
  containerId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['openvz', 'kvm', 'virtuozzo', 'docker', 'lxc']),
  status: z.string().default('unknown'),
  ipAddress: z.string().nullable().optional(),
  hostname: z.string().nullable().optional(),
  networkRxBytes: z.number().int().min(0).default(0),
  networkTxBytes: z.number().int().min(0).default(0),
  metadata: z.record(z.string(), z.any()).optional(),
});

const storagePoolSchema = z.object({
  name: z.string(),
  sizeBytes: z.number(),
  freeBytes: z.number(),
}).optional();

const reportContainersSchema = z.object({
  serverId: z.string().uuid(),
  containers: z.array(containerSchema),
  storagePool: storagePoolSchema,
});

// POST /api/agents/containers - Agent reports container data (public, rate-limited)
router.post('/', agentLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = reportContainersSchema.parse(req.body);

    // Verify server exists
    const server = await prisma.server.findUnique({
      where: { id: data.serverId },
    });

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    const now = new Date();
    const reportedIds: string[] = [];

    // Upsert each container
    for (const c of data.containers) {
      await prisma.virtualContainer.upsert({
        where: {
          serverId_containerId: {
            serverId: data.serverId,
            containerId: c.containerId,
          },
        },
        update: {
          name: c.name,
          type: c.type,
          status: c.status,
          ipAddress: c.ipAddress ?? null,
          hostname: c.hostname ?? null,
          networkRxBytes: BigInt(c.networkRxBytes),
          networkTxBytes: BigInt(c.networkTxBytes),
          metadata: c.metadata ?? undefined,
          lastSeen: now,
        },
        create: {
          serverId: data.serverId,
          containerId: c.containerId,
          name: c.name,
          type: c.type,
          status: c.status,
          ipAddress: c.ipAddress ?? null,
          hostname: c.hostname ?? null,
          networkRxBytes: BigInt(c.networkRxBytes),
          networkTxBytes: BigInt(c.networkTxBytes),
          metadata: c.metadata ?? undefined,
          lastSeen: now,
        },
      });
      reportedIds.push(c.containerId);
    }

    // Mark containers not in this report as stopped (they disappeared)
    if (reportedIds.length > 0) {
      await prisma.virtualContainer.updateMany({
        where: {
          serverId: data.serverId,
          containerId: { notIn: reportedIds },
          status: { not: 'stopped' },
        },
        data: { status: 'stopped' },
      });
    }

    // Save storage pool (LVM VG) info on the server metadata if provided
    if (data.storagePool) {
      const existingMeta = (server.metadata as Record<string, unknown>) || {};
      await prisma.server.update({
        where: { id: data.serverId },
        data: {
          metadata: { ...existingMeta, storagePool: data.storagePool },
        },
      });
    }

    logger.info(`Container report: ${data.containers.length} containers on ${server.hostname}`);

    const io = req.app.get('io');
    if (io) {
      io.emit('containers:updated', { serverId: data.serverId, count: data.containers.length });
    }

    res.json({
      success: true,
      data: { updated: data.containers.length },
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

// GET /api/containers/server/:serverId - Get containers for a server
router.get('/server/:serverId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;

    const containers = await prisma.virtualContainer.findMany({
      where: { serverId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });

    // Serialize BigInt to string for JSON response
    const serialized = containers.map(c => ({
      ...c,
      networkRxBytes: c.networkRxBytes.toString(),
      networkTxBytes: c.networkTxBytes.toString(),
    }));

    res.json({
      success: true,
      data: serialized,
      count: serialized.length,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/containers/:id - Get single container details
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const container = await prisma.virtualContainer.findUnique({
      where: { id: req.params.id },
      include: {
        server: {
          select: { id: true, hostname: true, ipAddress: true },
        },
      },
    });

    if (!container) {
      return res.status(404).json({ success: false, error: 'Container not found' });
    }

    res.json({
      success: true,
      data: {
        ...container,
        networkRxBytes: container.networkRxBytes.toString(),
        networkTxBytes: container.networkTxBytes.toString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/containers/server/:serverId/metrics - Get live metrics for all VMs on a server
router.get('/server/:serverId/metrics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;

    // Check if server has a libvirt exporter (KVM — metrics come from Prometheus)
    const agent = await prisma.agent.findFirst({
      where: { serverId, type: 'LIBVIRT_EXPORTER' },
      include: { server: { select: { ipAddress: true } } },
    });

    if (agent) {
      // KVM path: query Prometheus for per-domain metrics
      const queries = {
        cpuTime: `rate(libvirt_domain_info_cpu_time_seconds_total{server_id="${serverId}"}[5m]) * 100`,
        memoryUsage: `libvirt_domain_info_memory_usage_bytes{server_id="${serverId}"}`,
        memoryMax: `libvirt_domain_info_maximum_memory_bytes{server_id="${serverId}"}`,
        vCPUs: `libvirt_domain_info_virtual_cpus{server_id="${serverId}"}`,
        diskRead: `rate(libvirt_domain_block_stats_read_bytes_total{server_id="${serverId}"}[5m])`,
        diskWrite: `rate(libvirt_domain_block_stats_write_bytes_total{server_id="${serverId}"}[5m])`,
        netRx: `rate(libvirt_domain_interface_stats_receive_bytes_total{server_id="${serverId}"}[5m])`,
        netTx: `rate(libvirt_domain_interface_stats_transmit_bytes_total{server_id="${serverId}"}[5m])`,
      };

      const results = await Promise.all(
        Object.entries(queries).map(async ([metric, query]) => {
          try {
            const resp = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
              params: { query },
              timeout: 5000,
            });
            return { metric, data: resp.data?.data?.result || [] };
          } catch {
            return { metric, data: [] };
          }
        })
      );

      const domainMetrics: Record<string, Record<string, number>> = {};
      for (const { metric, data } of results) {
        for (const result of data) {
          const domain = result.metric?.domain || result.metric?.name || 'unknown';
          if (!domainMetrics[domain]) domainMetrics[domain] = {};
          domainMetrics[domain][metric] = parseFloat(result.value?.[1] || '0');
        }
      }

      const metricsArray = Object.entries(domainMetrics).map(([domain, metrics]) => ({
        domain,
        cpuPercent: metrics.cpuTime ?? null,
        memoryUsageBytes: metrics.memoryUsage ?? null,
        memoryMaxBytes: metrics.memoryMax ?? null,
        vCPUs: metrics.vCPUs ?? null,
        diskReadBytesPerSec: metrics.diskRead ?? null,
        diskWriteBytesPerSec: metrics.diskWrite ?? null,
        netRxBytesPerSec: metrics.netRx ?? null,
        netTxBytesPerSec: metrics.netTx ?? null,
      }));

      // Also fetch LVM storage pool info from Prometheus
      let storagePool: { name: string; sizeBytes: number; freeBytes: number } | null = null;
      try {
        const [vgSizeResp, vgFreeResp] = await Promise.all([
          axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
            params: { query: `nodeprism_lvm_vg_size_bytes{server_id="${serverId}"}` },
            timeout: 5000,
          }),
          axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
            params: { query: `nodeprism_lvm_vg_free_bytes{server_id="${serverId}"}` },
            timeout: 5000,
          }),
        ]);
        const sizeResult = vgSizeResp.data?.data?.result?.[0];
        const freeResult = vgFreeResp.data?.data?.result?.[0];
        if (sizeResult && freeResult) {
          storagePool = {
            name: sizeResult.metric?.vg || 'unknown',
            sizeBytes: parseFloat(sizeResult.value?.[1] || '0'),
            freeBytes: parseFloat(freeResult.value?.[1] || '0'),
          };
        }
      } catch {
        // LVM data not available — skip
      }

      return res.json({ success: true, data: metricsArray, storagePool });
    }

    // Non-Prometheus path: metrics come from container metadata (reported by agent/collector)
    const containers = await prisma.virtualContainer.findMany({
      where: { serverId },
    });

    if (containers.length === 0) {
      return res.json({ success: true, data: [], storagePool: null });
    }

    // Include containers that have any useful metadata (OpenVZ cpu/mem, or KVM vcpus/memoryKB)
    const metricsArray = containers
      .filter(c => {
        const meta = c.metadata as Record<string, unknown> | null;
        return meta && (meta.cpuPercent !== undefined || meta.memoryUsageBytes !== undefined || meta.vcpus !== undefined || meta.memoryKB !== undefined);
      })
      .map(c => {
        const meta = c.metadata as Record<string, unknown>;
        // memoryKB is stored by KVM agent (from virsh dominfo), convert to bytes
        const memMaxBytes = meta.memoryMaxBytes != null
          ? Number(meta.memoryMaxBytes)
          : meta.memoryKB != null
            ? Number(meta.memoryKB) * 1024
            : null;
        return {
          domain: c.name,
          cpuPercent: meta.cpuPercent != null ? Number(meta.cpuPercent) : null,
          memoryUsageBytes: meta.memoryUsageBytes != null ? Number(meta.memoryUsageBytes) : null,
          memoryMaxBytes: memMaxBytes,
          vCPUs: meta.vcpus != null ? Number(meta.vcpus) : null,
          diskReadBytesPerSec: null,
          diskWriteBytesPerSec: null,
          netRxBytesPerSec: meta.netRxBytesPerSec != null ? Number(meta.netRxBytesPerSec) : null,
          netTxBytesPerSec: meta.netTxBytesPerSec != null ? Number(meta.netTxBytesPerSec) : null,
        };
      });

    // Check server metadata for storage pool (from agent container reports)
    const server = await prisma.server.findUnique({ where: { id: serverId }, select: { metadata: true } });
    const serverMeta = server?.metadata as Record<string, unknown> | null;
    const storagePool = serverMeta?.storagePool as { name: string; sizeBytes: number; freeBytes: number } | null ?? null;

    res.json({ success: true, data: metricsArray, storagePool });
  } catch (error) {
    next(error);
  }
});

export { router as containerRoutes };

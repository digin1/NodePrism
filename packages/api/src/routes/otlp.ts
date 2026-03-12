import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const router: ExpressRouter = Router();

// POST /api/otlp/v1/traces - Accept OTLP JSON trace data (public endpoint)
router.post('/v1/traces', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resourceSpans } = req.body;

    if (!resourceSpans || !Array.isArray(resourceSpans)) {
      return res.status(400).json({
        success: false,
        error: 'resourceSpans array is required',
      });
    }

    const spans: {
      traceId: string;
      spanId: string;
      parentSpanId: string | null;
      operationName: string;
      serviceName: string;
      startTime: Date;
      duration: bigint;
      status: string;
      attributes: any;
      events: any;
    }[] = [];

    for (const resourceSpan of resourceSpans) {
      // Extract service name from resource attributes
      const resourceAttrs = resourceSpan.resource?.attributes || [];
      const serviceNameAttr = resourceAttrs.find(
        (attr: any) => attr.key === 'service.name'
      );
      const serviceName = serviceNameAttr?.value?.stringValue || 'unknown';

      const scopeSpans = resourceSpan.scopeSpans || [];
      for (const scopeSpan of scopeSpans) {
        const spanList = scopeSpan.spans || [];
        for (const span of spanList) {
          // OTLP sends startTimeUnixNano and endTimeUnixNano as strings
          const startNano = BigInt(span.startTimeUnixNano || '0');
          const endNano = BigInt(span.endTimeUnixNano || '0');
          const durationNano = endNano - startNano;

          // Convert attributes array to a plain object
          const attributes: Record<string, any> = {};
          if (span.attributes && Array.isArray(span.attributes)) {
            for (const attr of span.attributes) {
              if (attr.value?.stringValue !== undefined) {
                attributes[attr.key] = attr.value.stringValue;
              } else if (attr.value?.intValue !== undefined) {
                attributes[attr.key] = Number(attr.value.intValue);
              } else if (attr.value?.doubleValue !== undefined) {
                attributes[attr.key] = attr.value.doubleValue;
              } else if (attr.value?.boolValue !== undefined) {
                attributes[attr.key] = attr.value.boolValue;
              }
            }
          }

          // Determine status
          let status = 'OK';
          if (span.status) {
            if (span.status.code === 2 || span.status.code === 'STATUS_CODE_ERROR') {
              status = 'ERROR';
            } else if (span.status.code === 1 || span.status.code === 'STATUS_CODE_OK') {
              status = 'OK';
            }
          }

          spans.push({
            traceId: span.traceId,
            spanId: span.spanId,
            parentSpanId: span.parentSpanId || null,
            operationName: span.name || 'unknown',
            serviceName,
            startTime: new Date(Number(startNano / BigInt(1_000_000))),
            duration: durationNano,
            status,
            attributes: Object.keys(attributes).length > 0 ? attributes : null,
            events: span.events && span.events.length > 0 ? span.events : null,
          });
        }
      }
    }

    if (spans.length > 0) {
      await prisma.otlpSpan.createMany({ data: spans });
    }

    logger.info(`OTLP traces ingested: ${spans.length} spans`);

    res.json({
      success: true,
      message: `Ingested ${spans.length} spans`,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/otlp/services - List distinct service names
router.get('/services', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const services = await prisma.otlpSpan.findMany({
      select: { serviceName: true },
      distinct: ['serviceName'],
      orderBy: { serviceName: 'asc' },
    });

    res.json({
      success: true,
      data: services.map((s) => s.serviceName),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/otlp/traces - Search traces with filters
router.get('/traces', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serviceName, start, end, limit } = req.query;

    const where: any = {};
    if (serviceName) {
      where.serviceName = serviceName as string;
    }
    if (start || end) {
      where.startTime = {};
      if (start) where.startTime.gte = new Date(start as string);
      if (end) where.startTime.lte = new Date(end as string);
    }

    // Find matching spans first, then group by traceId
    const spans = await prisma.otlpSpan.findMany({
      where,
      orderBy: { startTime: 'desc' },
    });

    // Group by traceId
    const traceMap = new Map<
      string,
      {
        traceId: string;
        rootOperation: string;
        serviceName: string;
        startTime: Date;
        duration: string;
        spanCount: number;
      }
    >();

    for (const span of spans) {
      const existing = traceMap.get(span.traceId);
      if (!existing) {
        traceMap.set(span.traceId, {
          traceId: span.traceId,
          rootOperation: span.operationName,
          serviceName: span.serviceName,
          startTime: span.startTime,
          duration: span.duration.toString(),
          spanCount: 1,
        });
      } else {
        existing.spanCount++;
        // Use the earliest span as root
        if (span.startTime < existing.startTime) {
          existing.startTime = span.startTime;
          existing.rootOperation = span.operationName;
          existing.serviceName = span.serviceName;
        }
        // Use longest duration
        if (BigInt(span.duration) > BigInt(existing.duration)) {
          existing.duration = span.duration.toString();
        }
      }
    }

    const traces = Array.from(traceMap.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, parseInt(limit as string) || 50);

    res.json({
      success: true,
      data: traces,
      count: traces.length,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/otlp/traces/:traceId - Get all spans for a trace
router.get('/traces/:traceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { traceId } = req.params;

    const spans = await prisma.otlpSpan.findMany({
      where: { traceId },
      orderBy: { startTime: 'asc' },
    });

    if (spans.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Trace not found',
      });
    }

    // Serialize BigInt duration to string
    const serialized = spans.map((span) => ({
      ...span,
      duration: span.duration.toString(),
    }));

    res.json({
      success: true,
      data: serialized,
    });
  } catch (error) {
    next(error);
  }
});

export { router as otlpRoutes };

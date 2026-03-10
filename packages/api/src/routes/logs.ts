import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { config } from '@nodeprism/shared';
import { logger } from '../utils/logger';

const router: ExpressRouter = Router();

// Loki response types
interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][];
}

interface LokiQueryResponse {
  status: string;
  data: {
    resultType: string;
    result: LokiStream[];
  };
}

interface LokiLabelsResponse {
  status: string;
  data: string[];
}

// GET /api/logs - Query logs from Loki
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query, start, end, limit = '100', direction = 'backward' } = req.query;

    // Default query to get all logs if none provided
    const lokiQuery = query || '{job=~".+"}';

    // Default time range: last 1 hour
    const now = Date.now();
    const defaultStart = new Date(now - 60 * 60 * 1000).toISOString(); // 1 hour ago
    const defaultEnd = new Date(now).toISOString();

    const params = new URLSearchParams({
      query: lokiQuery as string,
      start: (start as string) || defaultStart,
      end: (end as string) || defaultEnd,
      limit: limit as string,
      direction: direction as string,
    });

    const lokiUrl = `${config.loki.url}/loki/api/v1/query_range?${params}`;

    logger.debug(`Querying Loki: ${lokiUrl}`);

    const response = await fetch(lokiUrl);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Loki query failed: ${response.status} ${errorText}`);
      return res.status(response.status).json({
        success: false,
        error: `Loki query failed: ${response.statusText}`,
      });
    }

    const data = (await response.json()) as LokiQueryResponse;

    // Transform Loki response to a more usable format
    const logs: Array<{
      timestamp: string;
      message: string;
      labels: Record<string, string>;
    }> = [];

    if (data.data?.result) {
      for (const stream of data.data.result) {
        const labels = stream.stream || {};
        for (const [ts, line] of stream.values || []) {
          logs.push({
            timestamp: new Date(parseInt(ts) / 1000000).toISOString(),
            message: line,
            labels,
          });
        }
      }
    }

    // Sort by timestamp (newest first if backward)
    logs.sort((a, b) => {
      const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      return direction === 'backward' ? diff : -diff;
    });

    res.json({
      success: true,
      data: logs,
      count: logs.length,
    });
  } catch (error) {
    logger.error('Error querying logs:', error);
    next(error);
  }
});

// GET /api/logs/labels - Get available label names
router.get('/labels', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const response = await fetch(`${config.loki.url}/loki/api/v1/labels`);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: 'Failed to fetch labels from Loki',
      });
    }

    const data = (await response.json()) as LokiLabelsResponse;

    res.json({
      success: true,
      data: data.data || [],
    });
  } catch (error) {
    logger.error('Error fetching labels:', error);
    next(error);
  }
});

// GET /api/logs/labels/:name/values - Get values for a specific label
router.get('/labels/:name/values', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.params;
    // Sanitize label name to prevent path traversal / SSRF
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      return res.status(400).json({ success: false, error: 'Invalid label name' });
    }
    const response = await fetch(`${config.loki.url}/loki/api/v1/label/${encodeURIComponent(name)}/values`);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Failed to fetch values for label ${name}`,
      });
    }

    const data = (await response.json()) as LokiLabelsResponse;

    res.json({
      success: true,
      data: data.data || [],
    });
  } catch (error) {
    logger.error('Error fetching label values:', error);
    next(error);
  }
});

// GET /api/logs/tail - Stream logs (SSE)
router.get('/tail', async (req: Request, res: Response) => {
  const { query = '{job=~".+"}' } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Note: For WebSocket-based tailing, you would use a WebSocket connection
    // This is a simplified polling approach
    const pollLogs = async () => {
      try {
        const now = Date.now();
        const rangeParams = new URLSearchParams({
          query: query as string,
          start: new Date(now - 5000).toISOString(),
          end: new Date(now).toISOString(),
          limit: '50',
        });

        const response = await fetch(`${config.loki.url}/loki/api/v1/query_range?${rangeParams}`);
        if (response.ok) {
          const data = (await response.json()) as LokiQueryResponse;
          if (data.data?.result?.length) {
            res.write(`data: ${JSON.stringify(data.data.result)}\n\n`);
          }
        }
      } catch (err) {
        logger.error('Tail polling error:', err);
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(pollLogs, 2000);
    pollLogs(); // Initial poll

    req.on('close', () => {
      clearInterval(interval);
    });
  } catch (error) {
    logger.error('Error setting up log tail:', error);
    res.write(`data: ${JSON.stringify({ error: 'Failed to connect to Loki' })}\n\n`);
    res.end();
  }
});

export { router as logRoutes };

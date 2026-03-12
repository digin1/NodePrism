import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const router: ExpressRouter = Router();

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toRFC822(date: Date): string {
  return date.toUTCString();
}

function toRFC3339(date: Date): string {
  return date.toISOString();
}

// GET /api/feeds/incidents.rss - RSS 2.0 feed of latest incidents
router.get('/incidents.rss', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incidents = await prisma.incident.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    const items = incidents.map((incident) => {
      const descParts = [
        `Status: ${incident.status}`,
        `Severity: ${incident.severity}`,
      ];
      if (incident.description) {
        descParts.push(incident.description);
      }
      if (incident.resolvedAt) {
        descParts.push(`Resolved at: ${incident.resolvedAt.toISOString()}`);
      }
      const description = escapeXml(descParts.join('\n'));

      return `    <item>
      <title>${escapeXml(incident.title)}</title>
      <description>${description}</description>
      <pubDate>${toRFC822(incident.startedAt)}</pubDate>
      <guid isPermaLink="false">${escapeXml(incident.id)}</guid>
    </item>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>NodePrism Incidents</title>
    <description>Latest incidents from NodePrism monitoring</description>
    <lastBuildDate>${toRFC822(new Date())}</lastBuildDate>
${items.join('\n')}
  </channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(xml);
  } catch (error) {
    logger.error('Failed to generate RSS feed', error);
    next(error);
  }
});

// GET /api/feeds/incidents.atom - Atom feed of latest incidents
router.get('/incidents.atom', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incidents = await prisma.incident.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    const entries = incidents.map((incident) => {
      const summaryParts = [
        `Status: ${incident.status}`,
        `Severity: ${incident.severity}`,
      ];
      if (incident.description) {
        summaryParts.push(incident.description);
      }
      if (incident.resolvedAt) {
        summaryParts.push(`Resolved at: ${incident.resolvedAt.toISOString()}`);
      }
      const summary = escapeXml(summaryParts.join('\n'));

      return `  <entry>
    <title>${escapeXml(incident.title)}</title>
    <id>urn:uuid:${escapeXml(incident.id)}</id>
    <updated>${toRFC3339(incident.updatedAt)}</updated>
    <published>${toRFC3339(incident.startedAt)}</published>
    <summary>${summary}</summary>
  </entry>`;
    });

    const updatedAt = incidents.length > 0
      ? toRFC3339(incidents[0].updatedAt)
      : toRFC3339(new Date());

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>NodePrism Incidents</title>
  <subtitle>Latest incidents from NodePrism monitoring</subtitle>
  <updated>${updatedAt}</updated>
  <id>urn:nodeprism:incidents</id>
${entries.join('\n')}
</feed>`;

    res.set('Content-Type', 'application/atom+xml; charset=utf-8');
    res.send(xml);
  } catch (error) {
    logger.error('Failed to generate Atom feed', error);
    next(error);
  }
});

export { router as feedRoutes };

import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

// Auto-detected type tags — these are managed automatically and should not be removed manually
const TYPE_TAGS = ['KVM', 'cPanel', 'OpenVZ'] as const;

interface DetectionResult {
  tags: string[];
}

/**
 * Detect server type based on registered agents and metadata.
 * Returns type tags that should be applied.
 */
async function detectServerType(serverId: string): Promise<DetectionResult> {
  const tags: string[] = [];

  // Get all agents for this server
  const agents = await prisma.agent.findMany({
    where: { serverId },
    select: { type: true },
  });

  const agentTypes = new Set(agents.map(a => a.type));

  // KVM: has libvirt exporter
  if (agentTypes.has('LIBVIRT_EXPORTER')) {
    tags.push('KVM');
  }

  // cPanel: has cPanel exporter
  if (agentTypes.has('CPANEL_EXPORTER')) {
    tags.push('cPanel');
  }

  // OpenVZ: check OS info or container types
  if (!tags.includes('KVM')) {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { metadata: true },
    });

    const meta = server?.metadata as Record<string, unknown> | null;
    const osInfo = meta?.os as Record<string, unknown> | null;
    const platform = (osInfo?.platform as string || '').toLowerCase();
    const distro = (osInfo?.distro as string || '').toLowerCase();

    if (platform.includes('openvz') || distro.includes('openvz')) {
      tags.push('OpenVZ');
    } else {
      // Check if server has OpenVZ containers
      const ovzContainer = await prisma.virtualContainer.findFirst({
        where: { serverId, type: 'openvz' },
        select: { id: true },
      });
      if (ovzContainer) {
        tags.push('OpenVZ');
      }
    }
  }

  return { tags };
}

/**
 * Apply auto-detected type tags to a server.
 * Preserves any user-added tags while updating the type tags.
 */
export async function autoLabelServer(serverId: string): Promise<void> {
  try {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { tags: true, hostname: true },
    });

    if (!server) return;

    const { tags: detectedTags } = await detectServerType(serverId);

    // Remove old type tags, keep user tags
    const userTags = server.tags.filter(t => !TYPE_TAGS.includes(t as typeof TYPE_TAGS[number]));

    // Merge: user tags + detected type tags (deduplicated)
    const newTags = [...new Set([...userTags, ...detectedTags])];

    // Only update if tags changed
    const tagsChanged = newTags.length !== server.tags.length ||
      newTags.some(t => !server.tags.includes(t));

    if (tagsChanged) {
      await prisma.server.update({
        where: { id: serverId },
        data: { tags: newTags },
      });
      logger.info(`Auto-labeled server ${server.hostname}: [${detectedTags.join(', ')}]`);
    }
  } catch (error) {
    logger.warn('Failed to auto-label server', { serverId, error });
  }
}

/**
 * Run auto-labeling for all servers. Call on startup.
 */
export async function autoLabelAllServers(): Promise<void> {
  try {
    const servers = await prisma.server.findMany({ select: { id: true } });
    for (const server of servers) {
      await autoLabelServer(server.id);
    }
    logger.info(`Auto-labeling complete for ${servers.length} servers`);
  } catch (error) {
    logger.error('Failed to auto-label servers', { error });
  }
}

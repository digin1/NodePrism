import axios from 'axios';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';

// ─── Types ─────────────────────────────────────────────────────

interface NodeSummary {
  serverId: string;
  hostname: string;
  ipAddress: string;
  status: string;
  totalVMs: number;
  runningVMs: number;
  stoppedContainers: StoppedContainer[];
  diskPartitions: DiskPartition[];
  lvmVGs: LvmVG[];
  memoryTotalBytes: number;
  memoryAvailBytes: number;
}

interface StoppedContainer {
  containerId: string;
  name: string;
  diskBytes: number;
}

interface DiskPartition {
  mountpoint: string;
  totalBytes: number;
  availBytes: number;
}

interface LvmVG {
  vg: string;
  totalBytes: number;
  freeBytes: number;
}

interface EximNodeStats {
  instance: string;
  hostname: string;
  delivered: number;
  received: number;
  bounced: number;
  rejected: number;
  deferred: number;
  queueSize: number;
  frozen: number;
}

// ─── Helpers ───────────────────────────────────────────────────

async function promQuery(query: string): Promise<any[]> {
  try {
    const resp = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: { query },
      timeout: 10000,
    });
    return resp.data?.data?.result || [];
  } catch (err: any) {
    logger.warn(`Daily report: Prometheus query failed: ${query.substring(0, 60)}`, { error: err.message });
    return [];
  }
}

function fmtBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || !isFinite(bytes)) return '—';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function pad(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length);
}

function padL(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : ' '.repeat(len - str.length) + str;
}

function pct(used: number, total: number): string {
  if (total <= 0 || !isFinite(used) || !isFinite(total)) return '0';
  const p = (used / total) * 100;
  return isFinite(p) ? p.toFixed(1) : '0';
}

function diskWarn(usedPct: number): string {
  if (usedPct > 90) return ' 🔴';
  if (usedPct > 80) return ' 🟡';
  return '';
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shortHost(hostname: string): string {
  return hostname.split('.')[0];
}

// ─── Data Collection ───────────────────────────────────────────

async function collectData(): Promise<{ nodes: NodeSummary[]; exim: EximNodeStats[] }> {
  const servers = await prisma.server.findMany({
    where: { status: { in: ['ONLINE', 'WARNING', 'CRITICAL'] } },
    select: { id: true, hostname: true, ipAddress: true, status: true },
    orderBy: { hostname: 'asc' },
  });

  const containers = await prisma.virtualContainer.findMany({
    select: {
      serverId: true,
      containerId: true,
      name: true,
      hostname: true,
      status: true,
      metadata: true,
    },
  });

  // Run all Prometheus queries in parallel
  const [
    memTotal, memAvail,
    fsSize, fsAvail,
    lvmSize, lvmFree,
    lvmVmDisk,
    eximDeliv, eximRecv, eximBounce, eximReject, eximDefer, eximQueue, eximFrozen,
  ] = await Promise.all([
    promQuery('node_memory_MemTotal_bytes'),
    promQuery('node_memory_MemAvailable_bytes'),
    promQuery('node_filesystem_size_bytes{fstype!~"tmpfs|fuse.*|devtmpfs|overlay|squashfs",mountpoint!~".*/cagefs-skeleton/.*|/boot.*|/snap/.*|/run/.*"}'),
    promQuery('node_filesystem_avail_bytes{fstype!~"tmpfs|fuse.*|devtmpfs|overlay|squashfs",mountpoint!~".*/cagefs-skeleton/.*|/boot.*|/snap/.*|/run/.*"}'),
    promQuery('nodeprism_lvm_vg_size_bytes'),
    promQuery('nodeprism_lvm_vg_free_bytes'),
    promQuery('nodeprism_lvm_vm_disk_bytes'),
    promQuery('exim_deliveries_today'),
    promQuery('exim_received_today'),
    promQuery('exim_bounces_today'),
    promQuery('exim_rejections_today'),
    promQuery('exim_deferred_today'),
    promQuery('exim_queue_size'),
    promQuery('exim_queue_frozen'),
  ]);

  // Helper: find metric value matching labels
  function getVal(results: any[], match: Record<string, string>): number {
    const found = results.find(r =>
      Object.entries(match).every(([k, v]) => r.metric[k] === v)
    );
    return found ? parseFloat(found.value[1]) : 0;
  }

  // Build per-node summaries
  const nodes: NodeSummary[] = [];

  for (const server of servers) {
    const srvContainers = containers.filter(c => c.serverId === server.id);
    const stopped = srvContainers.filter(c => c.status === 'stopped' || c.status === 'shutoff');

    // Stopped container details with disk sizes from LVM metrics
    const stoppedContainers: StoppedContainer[] = stopped.map(c => {
      const diskMetric = lvmVmDisk.find(r =>
        r.metric.domain === c.name || r.metric.domain === c.containerId
      );
      return {
        containerId: c.containerId,
        name: c.name || c.hostname || c.containerId,
        diskBytes: diskMetric ? parseFloat(diskMetric.value[1]) : 0,
      };
    });

    // Disk partitions (>1 GB, deduplicated by device)
    const serverFs = fsSize.filter(r =>
      r.metric.server_id === server.id ||
      r.metric.instance?.split(':')[0] === server.ipAddress
    );

    const diskPartitions: DiskPartition[] = [];
    const seenDevices = new Set<string>();
    for (const fs of serverFs) {
      const dev = fs.metric.device || fs.metric.mountpoint;
      if (seenDevices.has(dev)) continue;
      seenDevices.add(dev);

      const total = parseFloat(fs.value[1]);
      if (total < 1024 * 1024 * 1024) continue; // skip < 1 GB

      const avail = getVal(fsAvail, {
        ...(fs.metric.server_id ? { server_id: fs.metric.server_id } : { instance: fs.metric.instance }),
        mountpoint: fs.metric.mountpoint,
      });

      diskPartitions.push({ mountpoint: fs.metric.mountpoint, totalBytes: total, availBytes: avail });
    }

    // Sort: / first, /vz second, then alphabetical
    diskPartitions.sort((a, b) => {
      if (a.mountpoint === '/') return -1;
      if (b.mountpoint === '/') return 1;
      if (a.mountpoint === '/vz') return -1;
      if (b.mountpoint === '/vz') return 1;
      return a.mountpoint.localeCompare(b.mountpoint);
    });

    // LVM Volume Groups
    const serverLvm = lvmSize.filter(r => r.metric.server_id === server.id);
    const lvmVGs: LvmVG[] = serverLvm.map(r => {
      const vg = r.metric.vg || 'unknown';
      const total = parseFloat(r.value[1]);
      const free = getVal(lvmFree, { server_id: server.id, vg });
      return { vg, totalBytes: total, freeBytes: free };
    });

    // Memory
    const mTotal = getVal(memTotal, { server_id: server.id }) ||
      getVal(memTotal, { instance: `${server.ipAddress}:9100` });
    const mAvail = getVal(memAvail, { server_id: server.id }) ||
      getVal(memAvail, { instance: `${server.ipAddress}:9100` });

    nodes.push({
      serverId: server.id,
      hostname: server.hostname,
      ipAddress: server.ipAddress,
      status: server.status,
      totalVMs: srvContainers.length,
      runningVMs: srvContainers.filter(c => c.status === 'running').length,
      stoppedContainers,
      diskPartitions,
      lvmVGs,
      memoryTotalBytes: mTotal,
      memoryAvailBytes: mAvail,
    });
  }

  // Exim stats
  const eximInstances = new Set<string>();
  eximDeliv.forEach(r => eximInstances.add(r.metric.instance));

  const exim: EximNodeStats[] = [];
  for (const inst of eximInstances) {
    const hostname = eximDeliv.find(r => r.metric.instance === inst)?.metric.hostname || inst.split(':')[0];
    exim.push({
      instance: inst,
      hostname,
      delivered: getVal(eximDeliv, { instance: inst }),
      received: getVal(eximRecv, { instance: inst }),
      bounced: getVal(eximBounce, { instance: inst }),
      rejected: getVal(eximReject, { instance: inst }),
      deferred: getVal(eximDefer, { instance: inst }),
      queueSize: getVal(eximQueue, { instance: inst }),
      frozen: getVal(eximFrozen, { instance: inst }),
    });
  }

  return { nodes, exim };
}

// ─── Container Display Helper ──────────────────────────────────

/** Show meaningful name or just the ID if name is auto-generated (CT<uuid>, same as ID) */
function containerDisplay(c: StoppedContainer): string {
  const id = c.containerId;
  const name = c.name;
  // If name is just "CT" + id prefix, or identical to id, skip the name
  const isAutoName = name === id || name.startsWith('CT' + id.substring(0, 8)) || name === 'CT' + id;
  const disk = c.diskBytes > 0 ? `  _${fmtBytes(c.diskBytes)}_` : '';
  if (isAutoName) {
    return `\`${id}\`${disk}`;
  }
  return `\`${id}\`  ${name}${disk}`;
}

// ─── Slack Formatting (Block Kit) ──────────────────────────────

interface SlackReport {
  main: any[];                    // Main overview message blocks
  stoppedPerNode: {               // One message per node with stopped VMs
    node: string;
    blocks: any[];
  }[];
}

function buildSlackReport(nodes: NodeSummary[], exim: EximNodeStats[]): SlackReport {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString().split('T')[1].replace(/\.\d+Z$/, ' UTC');

  const totalStopped = nodes.reduce((s, n) => s + n.stoppedContainers.length, 0);
  const totalRecover = nodes.reduce((s, n) => s + n.stoppedContainers.reduce((a, c) => a + c.diskBytes, 0), 0);
  const totalVMs = nodes.reduce((s, n) => s + n.totalVMs, 0);
  const totalRunning = nodes.reduce((s, n) => s + n.runningVMs, 0);

  // ════════════════════════════════════════════════════════════
  // Message 1: Main overview
  // ════════════════════════════════════════════════════════════
  const main: any[] = [];

  main.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*📊  Daily Infrastructure Report*\n📅 ${dateStr}  •  🕐 ${timeStr}` },
  });
  main.push({ type: 'divider' });
  main.push({
    type: 'section',
    text: { type: 'mrkdwn', text: '*🖥️  Node Overview*' },
  });

  for (const node of nodes) {
    const name = shortHost(node.hostname);
    const statusIcon = node.status === 'ONLINE' ? '🟢' : node.status === 'WARNING' ? '🟡' : '🔴';
    const memUsed = node.memoryTotalBytes - node.memoryAvailBytes;
    const memP = pct(memUsed, node.memoryTotalBytes);

    const lines: string[] = [];
    lines.push(`${statusIcon} *${name}*  •  \`${node.ipAddress}\``);

    const vmLine = node.totalVMs > 0
      ? `*${node.runningVMs}* running${node.stoppedContainers.length > 0 ? `  •  ${node.stoppedContainers.length} stopped` : ''}`
      : '_No VMs_';
    lines.push(`├  💻  ${vmLine}`);

    if (node.memoryTotalBytes > 0) {
      const mWarn = diskWarn(parseFloat(memP));
      lines.push(`├  🧠  ${fmtBytes(memUsed)} / ${fmtBytes(node.memoryTotalBytes)}  (*${memP}%*)${mWarn}`);
    }

    const storage: string[] = [];
    for (const d of node.diskPartitions) {
      const used = d.totalBytes - d.availBytes;
      const p = parseFloat(pct(used, d.totalBytes));
      storage.push(`\`${d.mountpoint}\`  ${fmtBytes(used)} / ${fmtBytes(d.totalBytes)}  (${p.toFixed(1)}%)${diskWarn(p)}`);
    }
    for (const l of node.lvmVGs) {
      const used = l.totalBytes - l.freeBytes;
      const p = parseFloat(pct(used, l.totalBytes));
      storage.push(`LVM \`${l.vg}\`  ${fmtBytes(used)} / ${fmtBytes(l.totalBytes)}  (${p.toFixed(1)}%)${diskWarn(p)}`);
    }
    for (let i = 0; i < storage.length; i++) {
      const prefix = i === storage.length - 1 ? '└' : '├';
      lines.push(`${prefix}  💾  ${storage[i]}`);
    }

    main.push({ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } });
  }

  // Stopped containers summary line in main report
  main.push({ type: 'divider' });
  if (totalStopped > 0) {
    main.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*⏹️  Stopped Containers*  —  *${totalStopped}* total  •  ~*${fmtBytes(totalRecover)}* recoverable\n_Detailed breakdown posted below per node ↓_` },
    });
  } else {
    main.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*⏹️  Stopped Containers*\n✅  None — all containers are running' },
    });
  }

  // Exim
  if (exim.length > 0) {
    main.push({ type: 'divider' });
    main.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*📧  Exim Mail Stats (24h)*' },
    });

    let table = '```\n';
    table += pad('Host', 16) + padL('Deliv', 7) + padL('Recv', 7) + padL('Bnce', 6) + padL('Rjct', 6) + padL('Defr', 6) + padL('Queue', 6) + '\n';
    table += '─'.repeat(54) + '\n';
    for (const e of exim) {
      table += pad(shortHost(e.hostname), 16) + padL(fmtNum(e.delivered), 7) + padL(fmtNum(e.received), 7) + padL(fmtNum(e.bounced), 6) + padL(fmtNum(e.rejected), 6) + padL(fmtNum(e.deferred), 6) + padL(fmtNum(e.queueSize), 6) + '\n';
    }
    table += '```';
    main.push({ type: 'section', text: { type: 'mrkdwn', text: table } });
  }

  // Footer
  main.push({ type: 'divider' });
  main.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `NodePrism  •  ${nodes.length} nodes  •  ${totalRunning}/${totalVMs} VMs running  •  ${totalStopped} stopped`,
    }],
  });

  // ════════════════════════════════════════════════════════════
  // Separate messages: one per node with stopped containers
  // ════════════════════════════════════════════════════════════
  const stoppedPerNode: SlackReport['stoppedPerNode'] = [];

  for (const node of nodes) {
    if (node.stoppedContainers.length === 0) continue;
    const name = shortHost(node.hostname);
    const sub = node.stoppedContainers.reduce((a, c) => a + c.diskBytes, 0);

    const nodeBlocks: any[] = [];
    nodeBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⏹️  ${name}*  •  \`${node.ipAddress}\`\n${node.stoppedContainers.length} stopped containers${sub > 0 ? `  •  *${fmtBytes(sub)}* recoverable` : ''}`,
      },
    });

    // Build container list, splitting into blocks at 2800 chars
    let lines: string[] = [];
    for (const c of node.stoppedContainers) {
      const line = containerDisplay(c);
      if (lines.length > 0 && (lines.join('\n') + '\n' + line).length > 2800) {
        nodeBlocks.push({ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } });
        lines = [];
      }
      lines.push(line);
    }
    if (lines.length > 0) {
      nodeBlocks.push({ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } });
    }

    stoppedPerNode.push({ node: name, blocks: nodeBlocks });
  }

  return { main, stoppedPerNode };
}

// ─── Telegram Formatting (HTML) ────────────────────────────────

function buildTelegramHtml(nodes: NodeSummary[], exim: EximNodeStats[]): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  const L: string[] = [];

  L.push('📊 <b>Daily Infrastructure Report</b>');
  L.push(`📅 <i>${dateStr}</i>`);
  L.push('');
  L.push('━━━━━━━━━━━━━━━━━━━━━━━');
  L.push('🖥️ <b>Node Overview</b>');
  L.push('');

  for (const node of nodes) {
    const name = shortHost(node.hostname);
    const statusIcon = node.status === 'ONLINE' ? '🟢' : node.status === 'WARNING' ? '🟡' : '🔴';
    const memUsed = node.memoryTotalBytes - node.memoryAvailBytes;
    const memP = pct(memUsed, node.memoryTotalBytes);

    L.push(`${statusIcon} <b>${escapeHtml(name)}</b> • <code>${escapeHtml(node.ipAddress)}</code>`);

    // VMs
    if (node.totalVMs > 0) {
      L.push(`├ 💻 <b>${node.runningVMs}</b> running${node.stoppedContainers.length > 0 ? ` • ${node.stoppedContainers.length} stopped` : ''}`);
    }

    // Memory
    if (node.memoryTotalBytes > 0) {
      const mW = diskWarn(parseFloat(memP));
      L.push(`├ 🧠 ${fmtBytes(memUsed)} / ${fmtBytes(node.memoryTotalBytes)} (<b>${memP}%</b>)${mW}`);
    }

    // Disk + LVM
    const storage: string[] = [];
    for (const d of node.diskPartitions) {
      const used = d.totalBytes - d.availBytes;
      const p = parseFloat(pct(used, d.totalBytes));
      storage.push(`💾 <code>${escapeHtml(d.mountpoint)}</code> ${fmtBytes(used)} / ${fmtBytes(d.totalBytes)} (${p.toFixed(1)}%)${diskWarn(p)}`);
    }
    for (const l of node.lvmVGs) {
      const used = l.totalBytes - l.freeBytes;
      const p = parseFloat(pct(used, l.totalBytes));
      storage.push(`💾 LVM <code>${escapeHtml(l.vg)}</code> ${fmtBytes(used)} / ${fmtBytes(l.totalBytes)} (${p.toFixed(1)}%)${diskWarn(p)}`);
    }

    for (let i = 0; i < storage.length; i++) {
      const pfx = i === storage.length - 1 ? '└' : '├';
      L.push(`${pfx} ${storage[i]}`);
    }
    L.push('');
  }

  // ── Stopped Containers
  const totalStopped = nodes.reduce((s, n) => s + n.stoppedContainers.length, 0);
  const totalRecover = nodes.reduce((s, n) => s + n.stoppedContainers.reduce((a, c) => a + c.diskBytes, 0), 0);

  L.push('━━━━━━━━━━━━━━━━━━━━━━━');

  if (totalStopped > 0) {
    L.push(`⏹️ <b>Stopped Containers</b> — ${totalStopped} total${totalRecover > 0 ? ` • ~<b>${fmtBytes(totalRecover)}</b> recoverable` : ''}`);
    L.push('');

    for (const node of nodes) {
      if (node.stoppedContainers.length === 0) continue;
      const sub = node.stoppedContainers.reduce((a, c) => a + c.diskBytes, 0);
      L.push(`<b>${escapeHtml(shortHost(node.hostname))}</b> — ${node.stoppedContainers.length} stopped${sub > 0 ? ` • ${fmtBytes(sub)} recoverable` : ''}`);
      for (const c of node.stoppedContainers) {
        const id = c.containerId;
        const name = c.name;
        const isAutoName = name === id || name.startsWith('CT' + id.substring(0, 8)) || name === 'CT' + id;
        const disk = c.diskBytes > 0 ? `  <i>${fmtBytes(c.diskBytes)}</i>` : '';
        if (isAutoName) {
          L.push(`  • <code>${escapeHtml(id)}</code>${disk}`);
        } else {
          L.push(`  • <code>${escapeHtml(id)}</code>  ${escapeHtml(name)}${disk}`);
        }
      }
      L.push('');
    }
  } else {
    L.push('⏹️ <b>Stopped Containers</b>');
    L.push('✅ None — all containers are running');
    L.push('');
  }

  // ── Exim
  if (exim.length > 0) {
    L.push('━━━━━━━━━━━━━━━━━━━━━━━');
    L.push('📧 <b>Exim Mail Stats (24h)</b>');
    L.push('');
    L.push('<pre>');
    L.push(pad('Host', 14) + padL('Dlvr', 6) + padL('Recv', 6) + padL('Bnce', 5) + padL('Rjct', 5) + padL('Defr', 5) + padL('Q', 4));
    L.push('─'.repeat(45));
    for (const e of exim) {
      L.push(
        pad(shortHost(e.hostname), 14) +
        padL(fmtNum(e.delivered), 6) +
        padL(fmtNum(e.received), 6) +
        padL(fmtNum(e.bounced), 5) +
        padL(fmtNum(e.rejected), 5) +
        padL(fmtNum(e.deferred), 5) +
        padL(fmtNum(e.queueSize), 4)
      );
    }
    L.push('</pre>');
    L.push('');
  }

  // Footer
  const totalVMs = nodes.reduce((s, n) => s + n.totalVMs, 0);
  const totalRunning = nodes.reduce((s, n) => s + n.runningVMs, 0);
  L.push('━━━━━━━━━━━━━━━━━━━━━━━');
  L.push(`<i>NodePrism • ${nodes.length} nodes • ${totalRunning}/${totalVMs} VMs running</i>`);

  return L.join('\n');
}

// ─── Sending ───────────────────────────────────────────────────

async function postSlackBlocks(webhookUrl: string, blocks: any[]): Promise<void> {
  // Filter out empty text blocks
  const cleaned = blocks.filter(b => {
    if (b.type === 'section' && b.text) return b.text.text?.trim().length > 0;
    return true;
  });

  await axios.post(webhookUrl, { text: 'NodePrism Report', blocks: cleaned }, {
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function sendSlackReport(webhookUrl: string, report: SlackReport): Promise<void> {
  // Send main overview message
  try {
    await postSlackBlocks(webhookUrl, report.main);
  } catch (err: any) {
    logger.error('Slack report main message failed', { status: err.response?.status, body: err.response?.data });
    throw err;
  }

  // Send each node's stopped containers as a separate message
  for (const nodeMsg of report.stoppedPerNode) {
    try {
      await postSlackBlocks(webhookUrl, nodeMsg.blocks);
    } catch (err: any) {
      logger.error(`Slack report stopped containers failed for ${nodeMsg.node}`, { status: err.response?.status, body: err.response?.data });
      // Continue with other nodes even if one fails
    }
  }
}

async function sendToTelegram(botToken: string, chatId: string, html: string): Promise<void> {
  const MAX_LEN = 4096;

  if (html.length <= MAX_LEN) {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }, { timeout: 15000 });
    return;
  }

  // Split at section dividers if too long
  const divider = '━━━━━━━━━━━━━━━━━━━━━━━';
  const sections = html.split(divider);
  let chunk = '';

  for (const section of sections) {
    const candidate = chunk ? chunk + divider + section : section;
    if (candidate.length > MAX_LEN - 100 && chunk.length > 0) {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: chunk,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }, { timeout: 15000 });
      chunk = section;
    } else {
      chunk = candidate;
    }
  }

  if (chunk.trim()) {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: chunk,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }, { timeout: 15000 });
  }
}

// ─── Main Report ───────────────────────────────────────────────

export async function generateAndSendReport(): Promise<void> {
  logger.info('Generating daily infrastructure report…');

  try {
    const { nodes, exim } = await collectData();

    let sent = false;

    // Slack — dedicated report webhook
    const slackWebhook = process.env.DAILY_REPORT_SLACK_WEBHOOK;
    if (slackWebhook) {
      const report = buildSlackReport(nodes, exim);
      await sendSlackReport(slackWebhook, report);
      logger.info('Daily report sent to Slack');
      sent = true;
    }

    // Telegram — reuse existing alert channels
    const telegramChannels = await prisma.notificationChannel.findMany({
      where: { type: 'TELEGRAM', enabled: true },
    });

    for (const ch of telegramChannels) {
      const cfg = ch.config as any;
      if (cfg?.botToken && cfg?.chatId) {
        const html = buildTelegramHtml(nodes, exim);
        await sendToTelegram(cfg.botToken, cfg.chatId, html);
        logger.info(`Daily report sent to Telegram "${ch.name}"`);
        sent = true;
      }
    }

    if (!sent) {
      logger.warn('Daily report: no channels configured (set DAILY_REPORT_SLACK_WEBHOOK or add a Telegram notification channel)');
    }

    const totalVMs = nodes.reduce((s, n) => s + n.totalVMs, 0);
    logger.info(`Daily report complete: ${nodes.length} nodes, ${totalVMs} VMs, ${exim.length} exim instances`);
  } catch (err: any) {
    logger.error('Failed to generate daily report', { error: err.message, stack: err.stack });
  }
}

// ─── Scheduler ─────────────────────────────────────────────────

let reportTimeout: NodeJS.Timeout | null = null;
let reportInterval: NodeJS.Timeout | null = null;

export function startDailyReport(): void {
  const reportTime = process.env.DAILY_REPORT_TIME || '08:00'; // HH:MM in UTC
  const [hours, minutes] = reportTime.split(':').map(Number);

  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hours, minutes, 0, 0);

  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

  const msUntil = next.getTime() - now.getTime();

  logger.info(`Daily report scheduled for ${reportTime} UTC (next in ${(msUntil / 3600000).toFixed(1)}h)`);

  reportTimeout = setTimeout(() => {
    generateAndSendReport();
    reportInterval = setInterval(generateAndSendReport, 24 * 60 * 60 * 1000);
  }, msUntil);
}

export function stopDailyReport(): void {
  if (reportTimeout) { clearTimeout(reportTimeout); reportTimeout = null; }
  if (reportInterval) { clearInterval(reportInterval); reportInterval = null; }
}

import nodemailer from 'nodemailer';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────

interface AlertPayload {
  id: string;
  status: string;
  severity: string;
  message: string;
  labels: Record<string, string>;
  annotations?: Record<string, string>;
  startsAt: Date;
  endsAt?: Date | null;
  serverId?: string;
  ruleId?: string;
  templateId?: string;
  serverHostname?: string;
  serverIp?: string;
}

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
  to: string[];
}

interface SlackConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
}

interface DiscordConfig {
  webhookUrl: string;
}

interface WebhookConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  secret?: string;
}

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

interface PagerDutyConfig {
  routingKey: string;
  severity?: string;
}

// ─── Formatting Helpers ──────────────────────────────────────────────

function severityEmoji(severity: string, resolved?: boolean): string {
  if (resolved) return '✅';
  switch (severity.toUpperCase()) {
    case 'CRITICAL': return '🔴';
    case 'WARNING': return '🟡';
    case 'INFO': return '🔵';
    default: return '⚪';
  }
}

function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  if (hours < 24) return remainMin > 0 ? `${hours}h ${remainMin}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainHrs = hours % 24;
  return remainHrs > 0 ? `${days}d ${remainHrs}h` : `${days}d`;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getAppBaseUrl(): string {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

function buildIncidentUrl(alert: AlertPayload): string {
  const base = getAppBaseUrl();
  const params = new URLSearchParams();
  params.set('title', `${alert.labels?.alertname || 'Alert'}: ${alert.message}`);
  const desc = alert.annotations?.description;
  if (desc) params.set('description', desc);
  params.set('severity', alert.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING');
  if (alert.id && alert.id !== 'test-notification') params.set('alertId', alert.id);
  if (alert.serverId) params.set('serverId', alert.serverId);
  return `${base}/incidents?${params.toString()}`;
}

function buildConfigureUrl(alert: AlertPayload): string {
  const base = getAppBaseUrl();
  if (alert.templateId) return `${base}/alerts/templates?edit=${alert.templateId}`;
  if (alert.ruleId) return `${base}/alerts/rules?edit=${alert.ruleId}`;
  return `${base}/alerts`;
}

function getServerDisplay(alert: AlertPayload): { name: string; detail: string } {
  const hostname = alert.serverHostname || alert.labels?.hostname || '';
  const ip = alert.serverIp || alert.labels?.instance?.split(':')[0] || '';
  if (hostname && ip) return { name: hostname, detail: ip };
  if (hostname) return { name: hostname, detail: '' };
  if (ip) return { name: ip, detail: '' };
  return { name: alert.labels?.instance || 'Unknown', detail: '' };
}

// ─── Senders ──────────────────────────────────────────────────────────

async function sendEmail(config: EmailConfig, alert: AlertPayload): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password,
    },
  });

  const isResolved = alert.status === 'RESOLVED';
  const server = getServerDisplay(alert);
  const description = alert.annotations?.description;
  const duration = isResolved && alert.endsAt ? formatDuration(alert.startsAt, alert.endsAt) : null;

  const statusLabel = isResolved ? 'Resolved' : alert.severity;
  const subject = `${isResolved ? '✅' : severityEmoji(alert.severity)} [NodePrism ${statusLabel}] ${alert.message}`;
  const bannerColor = isResolved ? '#22c55e' : alert.severity === 'CRITICAL' ? '#ef4444' : alert.severity === 'WARNING' ? '#f59e0b' : '#3b82f6';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="padding: 20px 24px; background: ${bannerColor}; color: white; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 18px; font-weight: 600;">
          ${severityEmoji(alert.severity, isResolved)} ${isResolved ? 'Alert Resolved' : `${alert.severity} Alert`}
        </h2>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; background: #fff;">
        <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #111827;">${alert.message}</h3>
        ${description ? `<p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">${description}</p>` : ''}
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 100px;">Server</td>
            <td style="padding: 8px 0; color: #111827; font-weight: 500;">${server.name}${server.detail ? ` <span style="color: #9ca3af;">(${server.detail})</span>` : ''}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Alert</td>
            <td style="padding: 8px 0; color: #111827;">${alert.labels?.alertname || '—'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Started</td>
            <td style="padding: 8px 0; color: #111827;">${alert.startsAt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}</td>
          </tr>
          ${isResolved && alert.endsAt ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Resolved</td>
            <td style="padding: 8px 0; color: #22c55e; font-weight: 500;">${alert.endsAt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}</td>
          </tr>` : ''}
          ${duration ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Duration</td>
            <td style="padding: 8px 0; color: #111827;">${duration}</td>
          </tr>` : ''}
        </table>
        ${!isResolved ? `
        <div style="margin: 16px 0; display: flex; gap: 8px;">
          <a href="${buildIncidentUrl(alert)}" style="display: inline-block; padding: 10px 20px; background: ${bannerColor}; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">Create Incident</a>
          <a href="${buildConfigureUrl(alert)}" style="display: inline-block; padding: 10px 20px; background: #6b7280; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">Configure Alert</a>
        </div>` : ''}
        <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 16px 0;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">NodePrism Monitoring</p>
      </div>
    </div>
  `;

  const text = [
    `${severityEmoji(alert.severity, isResolved)} [${isResolved ? 'RESOLVED' : alert.severity}] ${alert.message}`,
    description ? `${description}` : null,
    `Server: ${server.name}${server.detail ? ` (${server.detail})` : ''}`,
    `Started: ${alert.startsAt.toISOString()}`,
    isResolved && alert.endsAt ? `Resolved: ${alert.endsAt.toISOString()}` : null,
    duration ? `Duration: ${duration}` : null,
  ].filter(Boolean).join('\n');

  await transporter.sendMail({
    from: config.from,
    to: config.to.join(', '),
    subject,
    html,
    text,
  });
}

async function sendSlack(config: SlackConfig, alert: AlertPayload): Promise<void> {
  const isResolved = alert.status === 'RESOLVED';
  const server = getServerDisplay(alert);
  const description = alert.annotations?.description;
  const duration = isResolved && alert.endsAt ? formatDuration(alert.startsAt, alert.endsAt) : null;
  const color = isResolved ? '#22c55e' : alert.severity === 'CRITICAL' ? '#ef4444' : alert.severity === 'WARNING' ? '#f59e0b' : '#3b82f6';

  const emoji = severityEmoji(alert.severity, isResolved);
  const statusText = isResolved ? 'Resolved' : alert.severity;

  // Build Block Kit blocks
  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${statusText}*${isResolved && duration ? `  •  _resolved after ${duration}_` : ''}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${alert.message}*${description ? `\n${description}` : ''}`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Server*\n${server.name}${server.detail ? `\n\`${server.detail}\`` : ''}`,
        },
        {
          type: 'mrkdwn',
          text: `*Alert*\n${alert.labels?.alertname || '—'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Started*\n<!date^${Math.floor(alert.startsAt.getTime() / 1000)}^{date_short_pretty} at {time}|${formatTimeAgo(alert.startsAt)}>`,
        },
        ...(isResolved && alert.endsAt ? [{
          type: 'mrkdwn',
          text: `*Resolved*\n<!date^${Math.floor(alert.endsAt.getTime() / 1000)}^{date_short_pretty} at {time}|${formatTimeAgo(alert.endsAt)}>`,
        }] : [{
          type: 'mrkdwn',
          text: `*Status*\n${isResolved ? ':white_check_mark: Resolved' : alert.severity === 'CRITICAL' ? ':rotating_light: Firing' : ':warning: Firing'}`,
        }]),
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `NodePrism Monitoring  •  ${alert.labels?.job || 'alert'}`,
        },
      ],
    },
    ...(!isResolved ? [{
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✓ Acknowledge', emoji: true },
          action_id: 'acknowledge_alert',
          value: JSON.stringify({ alertId: alert.id }),
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '🔇 Silence 1h', emoji: true },
          action_id: 'silence_alert',
          value: JSON.stringify({ alertId: alert.id, duration: 60 }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '📋 Create Incident', emoji: true },
          url: buildIncidentUrl(alert),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '⚙️ Configure', emoji: true },
          url: buildConfigureUrl(alert),
        },
      ],
    }] : []),
  ];

  const payload: Record<string, unknown> = {
    username: config.username || 'NodePrism',
    ...(config.channel && { channel: config.channel }),
    attachments: [{
      color,
      blocks,
    }],
  };

  await axios.post(config.webhookUrl, payload, { timeout: 10000 });
}

async function sendDiscord(config: DiscordConfig, alert: AlertPayload): Promise<void> {
  const isResolved = alert.status === 'RESOLVED';
  const server = getServerDisplay(alert);
  const description = alert.annotations?.description;
  const duration = isResolved && alert.endsAt ? formatDuration(alert.startsAt, alert.endsAt) : null;
  const color = isResolved ? 0x22c55e : alert.severity === 'CRITICAL' ? 0xef4444 : alert.severity === 'WARNING' ? 0xf59e0b : 0x3b82f6;

  const emoji = severityEmoji(alert.severity, isResolved);
  const statusText = isResolved ? 'Resolved' : `${alert.severity} Alert`;

  const fields = [
    { name: '🖥️ Server', value: `**${server.name}**${server.detail ? `\n\`${server.detail}\`` : ''}`, inline: true },
    { name: '🏷️ Alert', value: alert.labels?.alertname || '—', inline: true },
    { name: '🕐 Started', value: `<t:${Math.floor(alert.startsAt.getTime() / 1000)}:R>`, inline: true },
  ];
  if (isResolved && alert.endsAt) {
    fields.push({ name: '✅ Resolved', value: `<t:${Math.floor(alert.endsAt.getTime() / 1000)}:R>`, inline: true });
  }
  if (duration) {
    fields.push({ name: '⏱️ Duration', value: duration, inline: true });
  }
  if (!isResolved) {
    const links = [`[Create Incident](${buildIncidentUrl(alert)})`, `[Configure Alert](${buildConfigureUrl(alert)})`];
    fields.push({ name: '🔗 Actions', value: links.join('  •  '), inline: false });
  }

  const payload = {
    username: 'NodePrism',
    embeds: [{
      title: `${emoji} ${statusText}`,
      description: `**${alert.message}**${description ? `\n${description}` : ''}`,
      color,
      fields,
      footer: { text: 'NodePrism Monitoring' },
      timestamp: (isResolved && alert.endsAt ? alert.endsAt : alert.startsAt).toISOString(),
    }],
  };

  await axios.post(config.webhookUrl, payload, { timeout: 10000 });
}

async function sendWebhook(config: WebhookConfig, alert: AlertPayload): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  };

  if (config.secret) {
    headers['X-NodePrism-Secret'] = config.secret;
  }

  await axios({
    method: config.method || 'POST',
    url: config.url,
    headers,
    data: {
      event: 'alert',
      alert: {
        id: alert.id,
        status: alert.status,
        severity: alert.severity,
        message: alert.message,
        labels: alert.labels,
        annotations: alert.annotations,
        startsAt: alert.startsAt.toISOString(),
        endsAt: alert.endsAt?.toISOString() || null,
        server: alert.serverHostname || alert.serverIp || null,
      },
      timestamp: new Date().toISOString(),
    },
    timeout: 10000,
  });
}

async function sendTelegram(config: TelegramConfig, alert: AlertPayload): Promise<void> {
  const isResolved = alert.status === 'RESOLVED';
  const server = getServerDisplay(alert);
  const description = alert.annotations?.description;
  const duration = isResolved && alert.endsAt ? formatDuration(alert.startsAt, alert.endsAt) : null;

  const emoji = severityEmoji(alert.severity, isResolved);
  const statusText = isResolved ? 'RESOLVED' : alert.severity;

  const lines = [
    `${emoji} <b>${statusText}</b>${duration ? ` • resolved after ${duration}` : ''}`,
    '',
    `<b>${escapeHtml(alert.message)}</b>`,
    description ? `<i>${escapeHtml(description)}</i>` : null,
    '',
    `🖥️ <b>Server:</b> ${escapeHtml(server.name)}${server.detail ? ` (<code>${escapeHtml(server.detail)}</code>)` : ''}`,
    `🏷️ <b>Alert:</b> ${escapeHtml(alert.labels?.alertname || '—')}`,
    `🕐 <b>Started:</b> ${alert.startsAt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}`,
    isResolved && alert.endsAt ? `✅ <b>Resolved:</b> ${alert.endsAt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}` : null,
    duration ? `⏱️ <b>Duration:</b> ${duration}` : null,
    '',
    ...(!isResolved ? [
      `📋 <a href="${escapeHtml(buildIncidentUrl(alert))}">Create Incident</a>  •  ⚙️ <a href="${escapeHtml(buildConfigureUrl(alert))}">Configure Alert</a>`,
    ] : []),
    '',
    `<i>NodePrism Monitoring</i>`,
  ];

  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

  await axios.post(url, {
    chat_id: config.chatId,
    text: lines.filter(l => l !== null).join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }, { timeout: 10000 });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendPagerDuty(config: PagerDutyConfig, alert: AlertPayload): Promise<void> {
  const server = getServerDisplay(alert);
  const description = alert.annotations?.description;

  const payload = {
    routing_key: config.routingKey,
    event_action: alert.status === 'RESOLVED' ? 'resolve' : 'trigger',
    dedup_key: alert.id,
    payload: {
      summary: `[${alert.severity}] ${alert.message} on ${server.name}${description ? ` — ${description}` : ''}`,
      source: server.name,
      severity: (config.severity || alert.severity).toLowerCase(),
      timestamp: alert.startsAt.toISOString(),
      custom_details: {
        labels: alert.labels,
        annotations: alert.annotations,
        server_ip: server.detail || undefined,
      },
    },
  };

  await axios.post('https://events.pagerduty.com/v2/enqueue', payload, { timeout: 10000 });
}

// ─── Dispatcher ───────────────────────────────────────────────────────

const SENDER_MAP: Record<string, (config: any, alert: AlertPayload) => Promise<void>> = {
  EMAIL: sendEmail,
  SLACK: sendSlack,
  DISCORD: sendDiscord,
  WEBHOOK: sendWebhook,
  TELEGRAM: sendTelegram,
  PAGERDUTY: sendPagerDuty,
};

export async function dispatchNotifications(alert: AlertPayload): Promise<void> {
  const channels = await prisma.notificationChannel.findMany({
    where: { enabled: true },
  });

  if (channels.length === 0) return;

  const results = await Promise.allSettled(
    channels.map(async (channel) => {
      const sender = SENDER_MAP[channel.type];
      if (!sender) {
        logger.warn(`Unknown notification channel type: ${channel.type}`);
        return;
      }

      try {
        await sender(channel.config as any, alert);
        logger.info(`Notification sent via ${channel.type} channel "${channel.name}"`);

        // Log success
        await prisma.notificationLog.create({
          data: {
            channelId: channel.id,
            alertId: alert.id,
            status: 'SUCCESS',
            message: `Sent via ${channel.type}`,
          },
        }).catch(() => {}); // Don't fail if log table doesn't exist yet
      } catch (err: any) {
        logger.error(`Failed to send notification via ${channel.type} channel "${channel.name}"`, {
          error: err.message,
        });

        // Log failure
        await prisma.notificationLog.create({
          data: {
            channelId: channel.id,
            alertId: alert.id,
            status: 'FAILED',
            message: err.message?.substring(0, 500) || 'Unknown error',
          },
        }).catch(() => {});
      }
    })
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  if (failed > 0) {
    logger.warn(`Notifications: ${succeeded} sent, ${failed} failed`);
  }
}

export async function sendTestNotification(channelId: string): Promise<{ success: boolean; error?: string }> {
  const channel = await prisma.notificationChannel.findUnique({
    where: { id: channelId },
  });

  if (!channel) return { success: false, error: 'Channel not found' };

  const sender = SENDER_MAP[channel.type];
  if (!sender) return { success: false, error: `Unknown channel type: ${channel.type}` };

  // Look up a real rule to make the "Configure Alert" button work
  const sampleRule = await prisma.alertRule.findFirst({
    where: { name: 'HighCPUUsage' },
  }) || await prisma.alertRule.findFirst({ where: { enabled: true } });

  // Send a FIRING test
  const testFiring: AlertPayload = {
    id: 'test-notification',
    status: 'FIRING',
    severity: 'WARNING',
    message: 'High CPU usage on terminal4.veeblehosting.com',
    labels: { alertname: 'HighCPUUsage', instance: '108.170.55.202:9100', job: 'node-exporter' },
    annotations: { summary: 'High CPU usage on terminal4', description: 'CPU usage is above 80% (current value: 92.3%)' },
    startsAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
    ruleId: sampleRule?.id || undefined,
    serverHostname: 'terminal4.veeblehosting.com',
    serverIp: '108.170.55.202',
  };

  try {
    await sender(channel.config as any, testFiring);

    // Send a RESOLVED test after a brief delay
    const testResolved: AlertPayload = {
      ...testFiring,
      status: 'RESOLVED',
      endsAt: new Date(),
    };
    await sender(channel.config as any, testResolved);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

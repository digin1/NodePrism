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

// ─── Formatting ───────────────────────────────────────────────────────

function severityEmoji(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL': return '🔴';
    case 'WARNING': return '🟡';
    case 'INFO': return '🔵';
    default: return '⚪';
  }
}

function formatAlertText(alert: AlertPayload): string {
  const server = alert.serverHostname || alert.serverIp || alert.labels?.instance || 'Unknown';
  const status = alert.status === 'RESOLVED' ? '✅ RESOLVED' : `${severityEmoji(alert.severity)} ${alert.severity}`;
  return `[${status}] ${alert.message}\nServer: ${server}\nStarted: ${alert.startsAt.toISOString()}${alert.endsAt ? `\nEnded: ${alert.endsAt.toISOString()}` : ''}`;
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

  const server = alert.serverHostname || alert.serverIp || 'Unknown';
  const statusLabel = alert.status === 'RESOLVED' ? 'Resolved' : alert.severity;
  const subject = `[NodePrism ${statusLabel}] ${alert.message}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px;">
      <div style="padding: 16px; background: ${alert.status === 'RESOLVED' ? '#22c55e' : alert.severity === 'CRITICAL' ? '#ef4444' : '#eab308'}; color: white; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">${severityEmoji(alert.severity)} ${alert.status === 'RESOLVED' ? 'Alert Resolved' : `${alert.severity} Alert`}</h2>
      </div>
      <div style="padding: 16px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p><strong>Message:</strong> ${alert.message}</p>
        <p><strong>Server:</strong> ${server}</p>
        <p><strong>Started:</strong> ${alert.startsAt.toISOString()}</p>
        ${alert.endsAt ? `<p><strong>Resolved:</strong> ${alert.endsAt.toISOString()}</p>` : ''}
        <p><strong>Alert Name:</strong> ${alert.labels?.alertname || 'N/A'}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 12px;">Sent by NodePrism Monitoring</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: config.from,
    to: config.to.join(', '),
    subject,
    html,
    text: formatAlertText(alert),
  });
}

async function sendSlack(config: SlackConfig, alert: AlertPayload): Promise<void> {
  const server = alert.serverHostname || alert.serverIp || alert.labels?.instance || 'Unknown';
  const color = alert.status === 'RESOLVED' ? '#22c55e' : alert.severity === 'CRITICAL' ? '#ef4444' : '#eab308';

  const payload: Record<string, unknown> = {
    username: config.username || 'NodePrism',
    ...(config.channel && { channel: config.channel }),
    attachments: [{
      color,
      title: `${severityEmoji(alert.severity)} ${alert.status === 'RESOLVED' ? 'Resolved' : alert.severity}: ${alert.message}`,
      fields: [
        { title: 'Server', value: server, short: true },
        { title: 'Status', value: alert.status, short: true },
        { title: 'Started', value: alert.startsAt.toISOString(), short: true },
        ...(alert.endsAt ? [{ title: 'Ended', value: alert.endsAt.toISOString(), short: true }] : []),
      ],
      footer: 'NodePrism Monitoring',
      ts: Math.floor(alert.startsAt.getTime() / 1000),
    }],
  };

  await axios.post(config.webhookUrl, payload, { timeout: 10000 });
}

async function sendDiscord(config: DiscordConfig, alert: AlertPayload): Promise<void> {
  const server = alert.serverHostname || alert.serverIp || alert.labels?.instance || 'Unknown';
  const color = alert.status === 'RESOLVED' ? 0x22c55e : alert.severity === 'CRITICAL' ? 0xef4444 : 0xeab308;

  const payload = {
    username: 'NodePrism',
    embeds: [{
      title: `${severityEmoji(alert.severity)} ${alert.status === 'RESOLVED' ? 'Resolved' : alert.severity}: ${alert.message}`,
      color,
      fields: [
        { name: 'Server', value: server, inline: true },
        { name: 'Status', value: alert.status, inline: true },
        { name: 'Started', value: alert.startsAt.toISOString(), inline: true },
        ...(alert.endsAt ? [{ name: 'Ended', value: alert.endsAt.toISOString(), inline: true }] : []),
      ],
      footer: { text: 'NodePrism Monitoring' },
      timestamp: alert.startsAt.toISOString(),
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
  const text = formatAlertText(alert);
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

  await axios.post(url, {
    chat_id: config.chatId,
    text,
    parse_mode: 'HTML',
  }, { timeout: 10000 });
}

async function sendPagerDuty(config: PagerDutyConfig, alert: AlertPayload): Promise<void> {
  const server = alert.serverHostname || alert.serverIp || 'Unknown';

  const payload = {
    routing_key: config.routingKey,
    event_action: alert.status === 'RESOLVED' ? 'resolve' : 'trigger',
    dedup_key: alert.id,
    payload: {
      summary: `[${alert.severity}] ${alert.message} on ${server}`,
      source: server,
      severity: (config.severity || alert.severity).toLowerCase(),
      timestamp: alert.startsAt.toISOString(),
      custom_details: {
        labels: alert.labels,
        annotations: alert.annotations,
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

  const testAlert: AlertPayload = {
    id: 'test-notification',
    status: 'FIRING',
    severity: 'INFO',
    message: 'This is a test notification from NodePrism',
    labels: { alertname: 'TestNotification', instance: 'nodeprism-manager' },
    annotations: { summary: 'Test notification' },
    startsAt: new Date(),
    serverHostname: 'nodeprism-manager',
  };

  try {
    await sender(channel.config as any, testAlert);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

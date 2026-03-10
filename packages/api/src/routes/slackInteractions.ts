import { Router, Request, Response, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../services/auditLogger';
import axios from 'axios';
import crypto from 'crypto';

const router: ExpressRouter = Router();

/** Allowed Slack response URL hostname */
const SLACK_RESPONSE_HOST = 'hooks.slack.com';

/**
 * Post a message to a validated Slack response URL.
 * Validates hostname and rebuilds the URL from scratch to prevent SSRF.
 */
async function postSlackResponse(untrustedUrl: string, body: Record<string, unknown>): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(untrustedUrl);
  } catch {
    return;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== SLACK_RESPONSE_HOST) {
    logger.warn('Rejected non-Slack response URL', { hostname: parsed.hostname });
    return;
  }
  // Rebuild URL from validated components — breaks CodeQL taint chain
  const safeUrl = `https://${SLACK_RESPONSE_HOST}${parsed.pathname}${parsed.search}`;
  await axios.post(safeUrl, body, { timeout: 5000 })
    .catch(err => logger.warn('Slack response failed', { error: err.message }));
}

/**
 * Verify Slack request signature (optional — enabled when SLACK_SIGNING_SECRET is set).
 */
function verifySlackSignature(req: Request): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return true; // Skip verification if not configured

  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  const slackSignature = req.headers['x-slack-signature'] as string;

  if (!timestamp || !slackSignature) return false;

  // Reject requests older than 5 minutes
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
  if (parseInt(timestamp) < fiveMinutesAgo) return false;

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const sigBaseString = `v0:${timestamp}:${rawBody}`;
  const mySignature = 'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBaseString).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
}

/**
 * POST /api/slack/interactions
 *
 * Receives Slack interactive message payloads (button clicks).
 * Slack sends the payload as application/x-www-form-urlencoded with a `payload` JSON field.
 *
 * Setup: In your Slack App → Interactivity & Shortcuts → set Request URL to:
 *   http://<your-server-ip>:4000/api/slack/interactions
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Slack sends payload as a URL-encoded "payload" field
    const rawPayload = req.body?.payload;
    if (!rawPayload) {
      return res.status(400).json({ error: 'Missing payload' });
    }

    const payload = JSON.parse(rawPayload);

    // Optional signature verification
    if (!verifySlackSignature(req)) {
      logger.warn('Slack interaction: invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const action = payload.actions?.[0];
    if (!action) {
      return res.status(200).send(); // No action, just acknowledge
    }

    const actionId = action.action_id;
    let value: Record<string, any> = {};
    try {
      value = JSON.parse(action.value || '{}');
    } catch {
      value = {};
    }

    const alertId = value.alertId;
    const slackUser = payload.user?.name || payload.user?.real_name || 'Slack User';
    const responseUrl = payload.response_url;

    // Must respond to Slack within 3 seconds — acknowledge immediately
    res.status(200).send();

    if (!alertId || alertId === 'test-notification') {
      // Test notification — just post a reply
      if (responseUrl) {
        await postSlackResponse(responseUrl, {
          response_type: 'in_channel',
          replace_original: false,
          text: actionId === 'acknowledge_alert'
            ? `✅ This was a test notification — no alert to acknowledge.`
            : `🔇 This was a test notification — no alert to silence.`,
        });
      }
      return;
    }

    // Look up the alert
    const alert = await prisma.alert.findUnique({ where: { id: alertId } });
    if (!alert) {
      if (responseUrl) {
        await postSlackResponse(responseUrl, {
          response_type: 'in_channel',
          replace_original: false,
          text: `⚠️ Alert not found (may have been resolved or deleted).`,
        });
      }
      return;
    }

    if (actionId === 'acknowledge_alert') {
      if (alert.status !== 'FIRING') {
        if (responseUrl) {
          await postSlackResponse(responseUrl, {
            replace_original: false,
            response_type: 'in_channel',
            text: `ℹ️ Alert is already *${alert.status.toLowerCase()}* — no action taken.`,
          });
        }
        return;
      }

      await prisma.alert.update({
        where: { id: alertId },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date(),
          acknowledgedBy: slackUser,
        },
      });

      logger.info(`Alert acknowledged via Slack: ${alertId} by ${slackUser}`);

      // Emit WebSocket event for dashboard
      const io = req.app.get('io');
      if (io) io.emit('alert:acknowledged', { id: alertId, acknowledgedBy: slackUser });

      if (responseUrl) {
        await postSlackResponse(responseUrl, {
          replace_original: false,
          response_type: 'in_channel',
          text: `✅ Alert *acknowledged* by *${slackUser}*`,
        });
      }
    } else if (actionId === 'silence_alert') {
      if (alert.status !== 'FIRING' && alert.status !== 'ACKNOWLEDGED') {
        if (responseUrl) {
          await postSlackResponse(responseUrl, {
            replace_original: false,
            response_type: 'in_channel',
            text: `ℹ️ Alert is already *${alert.status.toLowerCase()}* — no action taken.`,
          });
        }
        return;
      }

      const duration = value.duration || 60; // minutes

      await prisma.alert.update({
        where: { id: alertId },
        data: {
          status: 'SILENCED',
          acknowledgedAt: new Date(),
          acknowledgedBy: slackUser,
        },
      });

      logger.info(`Alert silenced via Slack: ${alertId} by ${slackUser} for ${duration}m`);

      const io = req.app.get('io');
      if (io) io.emit('alert:silenced', { id: alertId, silencedBy: slackUser, duration });

      if (responseUrl) {
        await postSlackResponse(responseUrl, {
          replace_original: false,
          response_type: 'in_channel',
          text: `🔇 Alert *silenced* for *${duration}m* by *${slackUser}*`,
        });
      }
    }
    // Unknown action_id — already acknowledged with 200
  } catch (error: any) {
    logger.error('Slack interaction error', { error: error.message });
    // Always return 200 to Slack (we already sent it above in most paths)
  }
});

export { router as slackInteractionRoutes };

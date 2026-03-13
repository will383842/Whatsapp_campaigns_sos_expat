import 'dotenv/config';
import express from 'express';
import { connectToWhatsApp, getSocket, isConnected } from './whatsapp.js';
import { sendCampaignMessage, testSend } from './sender.js';
import logger from './logger.js';

const PORT = parseInt(process.env.PORT || '3002', 10);
const LARAVEL_API_KEY = process.env.LARAVEL_API_KEY || '';

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url, ip: req.ip }, 'Incoming request');
  next();
});

// ---------------------------------------------------------------------------
// Auth middleware (validates X-API-Key header against env variable)
// ---------------------------------------------------------------------------

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];

  if (!LARAVEL_API_KEY) {
    logger.error('LARAVEL_API_KEY is not configured — rejecting all authenticated requests');
    return res.status(500).json({ error: 'Service API key not configured' });
  }

  if (!key || key !== LARAVEL_API_KEY) {
    logger.warn({ ip: req.ip, url: req.url }, 'Unauthorized request — invalid or missing X-API-Key');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /health
 * Public endpoint. Returns WhatsApp connection status.
 */
app.get('/health', (_req, res) => {
  const sock = getSocket();
  res.json({
    status: 'ok',
    connected: isConnected(),
    phone: sock?.user?.id || null,
  });
});

/**
 * POST /send
 * Protected endpoint. Enqueues a campaign send job and responds immediately.
 *
 * Body: { message_id, targets: [{ group_wa_id, language, content }] }
 */
app.post('/send', requireApiKey, (req, res) => {
  const payload = req.body;

  if (!payload?.message_id || !Array.isArray(payload?.targets)) {
    return res.status(400).json({
      error: 'Invalid payload: message_id and targets[] are required',
    });
  }

  logger.info(
    { message_id: payload.message_id, targetCount: payload.targets.length },
    'Campaign send request received — processing asynchronously',
  );

  // Respond immediately so Laravel does not time out
  res.json({ queued: true, message_id: payload.message_id });

  // Process the campaign asynchronously (fire-and-forget)
  sendCampaignMessage(payload).catch((err) => {
    logger.error({ err: err.message, message_id: payload.message_id }, 'Unhandled error in sendCampaignMessage');
  });
});

/**
 * POST /send/test
 * Protected endpoint. Sends a single test message to a WhatsApp group.
 *
 * Body: { group_wa_id, content }
 */
app.post('/send/test', requireApiKey, async (req, res) => {
  const { group_wa_id, content } = req.body || {};

  if (!group_wa_id || !content) {
    return res.status(400).json({
      error: 'Invalid payload: group_wa_id and content are required',
    });
  }

  const result = await testSend(group_wa_id, content);

  if (result.success) {
    return res.json({ success: true, jid: result.jid });
  }

  return res.status(500).json({ success: false, jid: result.jid, error: result.error });
});

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.url}` });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled Express error');
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function start() {
  logger.info('Starting Baileys campaigns service...');

  try {
    await connectToWhatsApp();
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to connect to WhatsApp on startup — will retry on reconnect');
  }

  app.listen(PORT, '127.0.0.1', () => {
    logger.info({ port: PORT }, `HTTP server listening on 127.0.0.1:${PORT}`);
  });
}

start().catch((err) => {
  logger.error({ err: err.message }, 'Fatal error during startup');
  process.exit(1);
});

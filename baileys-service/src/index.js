import 'dotenv/config';
import express from 'express';
import { connectToWhatsApp, getSocket, isConnected, getLastQr } from './whatsapp.js';
import QRCode from 'qrcode';
import { sendCampaignMessage, testSend } from './sender.js';
import { sendWelcomeBatch } from './welcome.js';
import { getQueueStats } from './sendQueue.js';
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
 * GET /qr
 * Public endpoint. Returns QR code as HTML page for easy scanning.
 */
app.get('/qr', async (_req, res) => {
  if (isConnected()) {
    return res.send(`
      <html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#1a1a2e;">
        <div style="text-align:center;color:#4ade80;">
          <h1 style="font-size:3em;">&#10004;</h1>
          <h2>WhatsApp connecté !</h2>
          <p>L'appareil est déjà lié.</p>
        </div>
      </body></html>
    `);
  }

  const qr = getLastQr();
  if (!qr) {
    return res.send(`
      <html><head><meta http-equiv="refresh" content="3"></head>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#1a1a2e;">
        <div style="text-align:center;color:white;">
          <h2>En attente du QR code...</h2>
          <p>La page se rafraîchit automatiquement.</p>
        </div>
      </body></html>
    `);
  }

  try {
    const qrImageUrl = await QRCode.toDataURL(qr, { width: 400, margin: 2 });
    return res.send(`
      <html><head><meta http-equiv="refresh" content="20"></head>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#1a1a2e;">
        <div style="text-align:center;">
          <h2 style="color:white;">Scanner ce QR code avec WhatsApp</h2>
          <p style="color:#aaa;">Appareils connectés → Connecter un appareil → Scanner</p>
          <img src="${qrImageUrl}" style="border-radius:12px;margin:20px 0;" />
          <p style="color:#aaa;font-size:12px;">Le QR se renouvelle automatiquement. Page rafraîchie toutes les 20s.</p>
        </div>
      </body></html>
    `);
  } catch (err) {
    return res.status(500).send('Erreur génération QR: ' + err.message);
  }
});

/**
 * GET /health
 * Public endpoint. Returns WhatsApp connection status.
 */
app.get('/health', (_req, res) => {
  const sock = getSocket();
  const connected = isConnected();
  const queueStats = getQueueStats();
  const statusCode = connected ? 200 : 503;
  res.status(statusCode).json({
    status: connected ? 'ok' : 'disconnected',
    connected,
    phone: sock?.user?.id || null,
    queue: queueStats,
  });
});

/**
 * GET /groups
 * Protected endpoint. Returns all WhatsApp groups the connected account participates in.
 */
app.get('/groups', requireApiKey, async (_req, res) => {
  if (!isConnected()) {
    return res.status(503).json({ error: 'WhatsApp is not connected' });
  }

  const sock = getSocket();

  try {
    const result = await sock.groupFetchAllParticipating();
    const groups = Object.values(result).map((g) => ({
      id: g.id.replace('@g.us', ''),
      name: g.subject || '',
      member_count: g.participants?.length || 0,
      creation: g.creation || null,
      desc: g.desc || '',
      is_community: g.isCommunity || false,
      is_community_announce: g.isCommunityAnnounce || false,
      linked_parent: g.linkedParent || null,
    }));

    logger.info({ count: groups.length }, 'Fetched WhatsApp groups');
    return res.json({ success: true, count: groups.length, groups });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to fetch groups');
    return res.status(500).json({ error: 'Failed to fetch groups: ' + err.message });
  }
});

/**
 * GET /groups/:groupId/participants
 * Protected endpoint. Returns the participants of a specific group.
 */
app.get('/groups/:groupId/participants', requireApiKey, async (req, res) => {
  if (!isConnected()) {
    return res.status(503).json({ error: 'WhatsApp is not connected' });
  }

  const sock = getSocket();
  const groupJid = req.params.groupId + '@g.us';

  try {
    const metadata = await sock.groupMetadata(groupJid);
    const participants = metadata.participants.map((p) => ({
      phone: p.id.replace('@s.whatsapp.net', ''),
      admin: p.admin || null, // 'admin', 'superadmin', or null
    }));

    return res.json({
      success: true,
      group_name: metadata.subject,
      count: participants.length,
      participants,
    });
  } catch (err) {
    logger.error({ err: err.message, groupId: req.params.groupId }, 'Failed to fetch participants');
    return res.status(500).json({ error: 'Failed to fetch participants: ' + err.message });
  }
});

/**
 * POST /restart
 * Protected endpoint. Forces a reconnection to WhatsApp.
 */
app.post('/restart', requireApiKey, async (req, res) => {
  const forceNewSession = req.body?.force === true || !isConnected();
  logger.info({ forceNewSession }, 'Manual restart requested — disconnecting and reconnecting...');

  try {
    const currentSock = getSocket();
    if (currentSock) {
      currentSock.end(undefined);
    }

    // Small delay to let the socket fully close
    await new Promise((r) => setTimeout(r, 2000));

    // If force=true or disconnected, remove old auth to force fresh QR pairing
    if (forceNewSession) {
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = path.default.dirname(fileURLToPath(import.meta.url));
      const authDir = path.default.join(__dirname, '..', 'auth_info');
      if (fs.default.existsSync(authDir)) {
        // Delete contents only (not the dir itself — it may be a Docker volume mount)
        const files = fs.default.readdirSync(authDir);
        for (const file of files) {
          fs.default.rmSync(path.default.join(authDir, file), { force: true });
        }
        logger.info({ filesRemoved: files.length }, 'Cleared auth_info/ for fresh QR pairing');
      }
    }

    await connectToWhatsApp();

    return res.json({
      success: true,
      message: forceNewSession
        ? 'Session réinitialisée — scannez le QR code pour vous reconnecter.'
        : 'Reconnexion lancée.',
      connected: isConnected(),
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Restart failed');
    return res.json({
      success: true,
      message: 'Reconnexion lancée (peut prendre quelques instants)',
      connected: false,
    });
  }
});

/**
 * GET /qr/data
 * Protected endpoint. Returns QR code as base64 data URL (for embedding in dashboard).
 */
app.get('/qr/data', requireApiKey, async (_req, res) => {
  if (isConnected()) {
    return res.json({ connected: true, qr: null });
  }

  const qr = getLastQr();
  if (!qr) {
    return res.json({ connected: false, qr: null });
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(qr, { width: 400, margin: 2 });
    return res.json({ connected: false, qr: qrDataUrl });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate QR: ' + err.message });
  }
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
 * In-memory status for the lock-all operation.
 * Long-running: ~3.5 min per group = ~4 hours for 68 groups.
 */
let lockAllStatus = null;

/**
 * POST /groups/lock-all
 * Protected endpoint. Locks all groups so only admins can:
 *   - edit group info (name, description, picture)
 *   - add new members
 *
 * EXTREMELY SLOW on purpose (~3.5 min per group, ~4 hours total for 68 groups)
 * to avoid any risk of WhatsApp blocking the account.
 *
 * After locking, retrieves the invite link for each group.
 * Responds immediately. Check progress via GET /groups/lock-all/status.
 */
app.post('/groups/lock-all', requireApiKey, async (_req, res) => {
  if (!isConnected()) {
    return res.status(503).json({ error: 'WhatsApp is not connected' });
  }

  if (lockAllStatus?.running) {
    return res.json({ success: false, error: 'Lock-all already in progress', status: lockAllStatus });
  }

  const sock = getSocket();

  let groups;
  try {
    const allGroups = await sock.groupFetchAllParticipating();
    groups = Object.values(allGroups).filter(g => !g.isCommunity && !g.isCommunityAnnounce);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch groups: ' + err.message });
  }

  lockAllStatus = {
    running: true,
    total: groups.length,
    processed: 0,
    locked: 0,
    adminAdd: 0,
    inviteLinks: [],
    failed: [],
    current: null,
    startedAt: new Date().toISOString(),
  };

  // Respond immediately
  res.json({
    success: true,
    message: `Lock-all started for ${groups.length} groups. ~3.5 min/group = ~${Math.round(groups.length * 3.5)} min total. Check /groups/lock-all/status for progress.`,
    total: groups.length,
    estimatedDuration: `~${Math.round(groups.length * 3.5 / 60)} hours`,
  });

  // Process in background — EXTREMELY SLOWLY
  (async () => {
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const jid = group.id;
      const name = group.subject || jid;
      const groupWaId = jid.replace('@g.us', '');
      lockAllStatus.current = `[${i + 1}/${groups.length}] ${name}`;

      // --- Step 1: Lock group settings (only admins edit info) ---
      try {
        await sock.groupSettingUpdate(jid, 'locked');
        lockAllStatus.locked++;
        logger.info({ jid, name, step: '1/3', progress: `${i + 1}/${groups.length}` }, 'Group settings locked');
      } catch (err) {
        logger.warn({ jid, name, err: err.message }, 'Failed to lock group settings');
        lockAllStatus.failed.push({ groupWaId, name, action: 'lock', error: err.message });
      }

      // 45-75s delay before next operation
      await new Promise(r => setTimeout(r, 45_000 + Math.floor(Math.random() * 30_000)));

      // --- Step 2: Restrict member add to admins only ---
      try {
        await sock.groupMemberAddMode(jid, 'admin_add');
        lockAllStatus.adminAdd++;
        logger.info({ jid, name, step: '2/3', progress: `${i + 1}/${groups.length}` }, 'Member-add restricted to admins');
      } catch (err) {
        logger.warn({ jid, name, err: err.message }, 'Failed to set admin-add mode');
        lockAllStatus.failed.push({ groupWaId, name, action: 'admin_add', error: err.message });
      }

      // 30-60s delay before getting invite link
      await new Promise(r => setTimeout(r, 30_000 + Math.floor(Math.random() * 30_000)));

      // --- Step 3: Retrieve the invite link ---
      try {
        const inviteCode = await sock.groupInviteCode(jid);
        const inviteLink = inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : null;
        lockAllStatus.inviteLinks.push({ groupWaId, name, inviteLink, language: group.desc || '' });
        logger.info({ jid, name, inviteLink, step: '3/3' }, 'Invite link retrieved');
      } catch (err) {
        logger.warn({ jid, name, err: err.message }, 'Failed to get invite link');
        lockAllStatus.inviteLinks.push({ groupWaId, name, inviteLink: null, error: err.message });
      }

      lockAllStatus.processed++;

      // --- Long delay between groups: 60-120s ---
      if (i < groups.length - 1) {
        const groupDelay = 60_000 + Math.floor(Math.random() * 60_000);
        const elapsed = Math.round((Date.now() - new Date(lockAllStatus.startedAt).getTime()) / 60_000);
        const remaining = Math.round((groups.length - i - 1) * 3.5);
        logger.info(
          { delay: Math.round(groupDelay / 1000), elapsed: `${elapsed}min`, remaining: `~${remaining}min`, progress: `${i + 1}/${groups.length}` },
          'Waiting before next group...',
        );
        await new Promise(r => setTimeout(r, groupDelay));
      }
    }

    lockAllStatus.running = false;
    lockAllStatus.current = null;
    lockAllStatus.completedAt = new Date().toISOString();
    logger.info({
      total: lockAllStatus.total,
      locked: lockAllStatus.locked,
      adminAdd: lockAllStatus.adminAdd,
      failedCount: lockAllStatus.failed.length,
      linksRetrieved: lockAllStatus.inviteLinks.filter(l => l.inviteLink).length,
    }, 'Lock-all operation completed');
  })().catch(err => {
    lockAllStatus.running = false;
    lockAllStatus.error = err.message;
    logger.error({ err: err.message }, 'Lock-all operation failed');
  });
});

/**
 * GET /groups/lock-all/status
 * Protected endpoint. Returns the progress of the lock-all operation
 * including all invite links once completed.
 */
app.get('/groups/lock-all/status', requireApiKey, (_req, res) => {
  if (!lockAllStatus) {
    return res.json({ started: false, message: 'No lock-all operation has been started.' });
  }
  return res.json(lockAllStatus);
});

/**
 * POST /send/welcome
 * Protected endpoint. Sends a batch welcome message to a single group.
 * Called by Laravel daily cron. Goes through the global queue.
 *
 * Body: { group_wa_id, content }
 */
app.post('/send/welcome', requireApiKey, async (req, res) => {
  const { group_wa_id, content } = req.body || {};

  if (!group_wa_id || !content) {
    return res.status(400).json({
      error: 'Invalid payload: group_wa_id and content are required',
    });
  }

  const result = await sendWelcomeBatch(group_wa_id, content);

  if (result.success) {
    return res.json({ success: true, jid: result.jid });
  }

  return res.status(500).json({ success: false, jid: result.jid, error: result.error });
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, `HTTP server listening on 0.0.0.0:${PORT}`);
  });

  // Graceful shutdown
  function gracefulShutdown(signal) {
    logger.info({ signal }, 'Received %s, shutting down...', signal);
    const sock = getSocket();
    if (sock) {
      sock.end(undefined);
    }
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

start().catch((err) => {
  logger.error({ err: err.message }, 'Fatal error during startup');
  process.exit(1);
});

import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import QRCode from 'qrcode';
import { sendTelegramAlert } from './whatsapp.js';
import { sendCampaignMessage, testSend } from './sender.js';
import { sendWelcomeBatch } from './welcome.js';
import { getQueueStats } from './sendQueue.js';
import {
  initFromLaravel,
  getAllInstances,
  getInstance,
  createInstance,
  removeInstance,
  removeInstanceAndPurge,
  restartInstance,
  pauseInstance,
  resumeInstance,
  getInstanceQr,
  getInstanceHealth,
  getGlobalHealth,
  getDefaultInstance,
  getSocketForSlug,
  isAnyConnected,
  pickNextInstance,
  updateInstanceConfig,
} from './instanceManager.js';
import logger from './logger.js';

const PORT = parseInt(process.env.PORT || '3002', 10);
const LARAVEL_API_URL = process.env.LARAVEL_API_URL || 'http://localhost:8001';
const LARAVEL_API_KEY = process.env.LARAVEL_API_KEY || '';
const FIREBASE_SYNC_URL = process.env.FIREBASE_SYNC_URL || '';
const FIREBASE_SYNC_API_KEY = process.env.FIREBASE_SYNC_API_KEY || '';

const laravelClient = axios.create({
  baseURL: LARAVEL_API_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': LARAVEL_API_KEY,
  },
});

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json());

app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url, ip: req.ip }, 'Incoming request');
  next();
});

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!LARAVEL_API_KEY) {
    logger.error('LARAVEL_API_KEY not configured');
    return res.status(500).json({ error: 'Service API key not configured' });
  }
  if (!key || key !== LARAVEL_API_KEY) {
    logger.warn({ ip: req.ip, url: req.url }, 'Unauthorized request');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ===========================================================================
// INSTANCE MANAGEMENT ENDPOINTS
// ===========================================================================

/**
 * GET /instances
 * List all instances with status, phone, quota, connected.
 */
app.get('/instances', requireApiKey, (_req, res) => {
  const health = getGlobalHealth();
  return res.json(health);
});

/**
 * POST /instances
 * Create a new instance. Body: { slug, phone, dailyMax }
 */
app.post('/instances', requireApiKey, async (req, res) => {
  const { slug, phone, dailyMax } = req.body || {};
  if (!slug || !phone) {
    return res.status(400).json({ error: 'slug and phone are required' });
  }

  try {
    const instance = await createInstance(slug, phone, dailyMax || 50);
    // Wait a bit for QR to generate
    await new Promise(r => setTimeout(r, 3000));
    const qr = await getInstanceQr(slug);
    return res.json({
      success: true,
      instance: getInstanceHealth(slug),
      qr,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /instances/:slug
 * Remove an instance. ?purge=true to delete auth data.
 */
app.delete('/instances/:slug', requireApiKey, (req, res) => {
  const { slug } = req.params;
  const purge = req.query.purge === 'true';

  if (purge) {
    removeInstanceAndPurge(slug);
  } else {
    removeInstance(slug);
  }

  return res.json({ success: true, message: `Instance ${slug} removed${purge ? ' (auth purged)' : ''}` });
});

/**
 * POST /instances/:slug/restart
 * Restart an instance. Body: { force: true } for new QR.
 */
app.post('/instances/:slug/restart', requireApiKey, async (req, res) => {
  const { slug } = req.params;
  const force = req.body?.force === true;

  try {
    await restartInstance(slug, force);
    await new Promise(r => setTimeout(r, 2000));
    const qr = await getInstanceQr(slug);
    return res.json({
      success: true,
      message: force ? 'Session reset — scan QR' : 'Reconnecting...',
      instance: getInstanceHealth(slug),
      qr,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /instances/:slug/config
 * Update instance config (e.g. dailyMax). Body: { dailyMax: number }
 */
app.patch('/instances/:slug/config', requireApiKey, (req, res) => {
  try {
    updateInstanceConfig(req.params.slug, req.body);
    return res.json({ success: true, instance: getInstanceHealth(req.params.slug) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /instances/:slug/pause
 */
app.post('/instances/:slug/pause', requireApiKey, (req, res) => {
  try {
    pauseInstance(req.params.slug);
    return res.json({ success: true, instance: getInstanceHealth(req.params.slug) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /instances/:slug/resume
 */
app.post('/instances/:slug/resume', requireApiKey, (req, res) => {
  try {
    resumeInstance(req.params.slug);
    return res.json({ success: true, instance: getInstanceHealth(req.params.slug) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /instances/:slug/qr
 */
app.get('/instances/:slug/qr', requireApiKey, async (req, res) => {
  const qr = await getInstanceQr(req.params.slug);
  const inst = getInstance(req.params.slug);
  return res.json({
    connected: inst?.connected || false,
    qr,
  });
});

/**
 * GET /instances/:slug/health
 */
app.get('/instances/:slug/health', requireApiKey, (req, res) => {
  const health = getInstanceHealth(req.params.slug);
  if (!health) return res.status(404).json({ error: 'Instance not found' });
  return res.json(health);
});

// ===========================================================================
// LEGACY / EXISTING ENDPOINTS (updated for multi-instance)
// ===========================================================================

/**
 * GET /qr — Public HTML page listing QR codes for all disconnected instances.
 */
app.get('/qr', requireApiKey, async (_req, res) => {
  const allInstances = getAllInstances();
  const disconnected = allInstances.filter(i => !i.connected && i.lastQr);
  const allConnected = allInstances.every(i => i.connected);

  if (allConnected && allInstances.length > 0) {
    return res.send(`
      <html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#1a1a2e;">
        <div style="text-align:center;color:#4ade80;">
          <h1 style="font-size:3em;">&#10004;</h1>
          <h2>Toutes les instances WhatsApp sont connectées !</h2>
          <p>${allInstances.length} instance(s) active(s).</p>
        </div>
      </body></html>
    `);
  }

  if (disconnected.length === 0) {
    return res.send(`
      <html><head><meta http-equiv="refresh" content="3"></head>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#1a1a2e;">
        <div style="text-align:center;color:white;">
          <h2>En attente des QR codes...</h2>
          <p>La page se rafraîchit automatiquement.</p>
        </div>
      </body></html>
    `);
  }

  let qrHtml = '';
  for (const inst of disconnected) {
    try {
      const qrImageUrl = await QRCode.toDataURL(inst.lastQr, { width: 300, margin: 2 });
      qrHtml += `
        <div style="text-align:center;margin:20px;padding:20px;background:#16213e;border-radius:12px;">
          <h3 style="color:white;">${inst.slug} (${inst.phone})</h3>
          <img src="${qrImageUrl}" style="border-radius:8px;margin:10px 0;" />
        </div>
      `;
    } catch { /* skip */ }
  }

  return res.send(`
    <html><head><meta http-equiv="refresh" content="20"></head>
    <body style="font-family:sans-serif;background:#1a1a2e;padding:20px;">
      <h2 style="color:white;text-align:center;">Scanner les QR codes WhatsApp</h2>
      <div style="display:flex;flex-wrap:wrap;justify-content:center;">
        ${qrHtml}
      </div>
      <p style="color:#aaa;font-size:12px;text-align:center;">Page rafraîchie toutes les 20s.</p>
    </body></html>
  `);
});

/**
 * GET /health — Global health with all instances.
 */
app.get('/health', (_req, res) => {
  const global = getGlobalHealth();
  const queueStats = getQueueStats();
  const connected = global.connectedCount > 0;

  // Include legacy fields for backward compat with Laravel WhatsAppController
  const defaultInst = getDefaultInstance();
  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'disconnected',
    connected,
    phone: defaultInst?.socket?.user?.id || null,
    queue: queueStats,
    instances: global,
  });
});

/**
 * GET /qr/data — QR code data URL for default instance (legacy compat).
 */
app.get('/qr/data', requireApiKey, async (_req, res) => {
  const defaultInst = getDefaultInstance();
  if (defaultInst?.connected) {
    return res.json({ connected: true, qr: null });
  }

  // Find any instance with a QR
  const allInst = getAllInstances();
  const withQr = allInst.find(i => !i.connected && i.lastQr);
  if (!withQr) {
    return res.json({ connected: false, qr: null });
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(withQr.lastQr, { width: 400, margin: 2 });
    return res.json({ connected: false, qr: qrDataUrl, slug: withQr.slug });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate QR: ' + err.message });
  }
});

/**
 * GET /groups — Uses default instance.
 */
app.get('/groups', requireApiKey, async (req, res) => {
  const slug = req.query.instance_slug;
  const sock = getSocketForSlug(slug);
  if (!sock) {
    return res.status(503).json({ error: 'WhatsApp is not connected' });
  }

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
 */
app.get('/groups/:groupId/participants', requireApiKey, async (req, res) => {
  const sock = getSocketForSlug(req.query.instance_slug);
  if (!sock) {
    return res.status(503).json({ error: 'WhatsApp is not connected' });
  }

  const groupJid = req.params.groupId + '@g.us';
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const participants = metadata.participants.map((p) => ({
      phone: p.id.replace('@s.whatsapp.net', ''),
      admin: p.admin || null,
    }));
    return res.json({ success: true, group_name: metadata.subject, count: participants.length, participants });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch participants: ' + err.message });
  }
});

/**
 * POST /restart — Accepts optional instance_slug, otherwise restarts default.
 */
app.post('/restart', requireApiKey, async (req, res) => {
  const slug = req.body?.instance_slug;
  const force = req.body?.force === true;

  try {
    if (slug) {
      await restartInstance(slug, force);
    } else {
      // Restart default instance
      const def = getDefaultInstance();
      if (def) {
        await restartInstance(def.slug, force || !def.connected);
      } else {
        // No instances at all — try to restart all
        for (const inst of getAllInstances()) {
          await restartInstance(inst.slug, force);
        }
      }
    }

    await new Promise(r => setTimeout(r, 2000));

    return res.json({
      success: true,
      message: force ? 'Session reset — scan QR' : 'Reconnexion lancée.',
      connected: isAnyConnected(),
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Restart failed');
    return res.status(500).json({
      success: false,
      message: `Erreur de reconnexion : ${err.message}`,
      connected: false,
    });
  }
});

/**
 * POST /send — Campaign send (uses rotation via pickNextInstance in sender.js).
 */
app.post('/send', requireApiKey, (req, res) => {
  const payload = req.body;
  if (!payload?.message_id || !Array.isArray(payload?.targets)) {
    return res.status(400).json({ error: 'Invalid payload: message_id and targets[] are required' });
  }

  logger.info(
    { message_id: payload.message_id, targetCount: payload.targets.length },
    'Campaign send request received',
  );

  res.json({ queued: true, message_id: payload.message_id });

  sendCampaignMessage(payload).catch((err) => {
    logger.error({ err: err.message, message_id: payload.message_id }, 'Unhandled error in sendCampaignMessage');
  });
});

/**
 * POST /send/welcome — Uses rotation.
 */
app.post('/send/welcome', requireApiKey, async (req, res) => {
  const { group_wa_id, content } = req.body || {};
  if (!group_wa_id || !content) {
    return res.status(400).json({ error: 'group_wa_id and content are required' });
  }

  const result = await sendWelcomeBatch(group_wa_id, content);
  if (result.success) {
    return res.json({ success: true, jid: result.jid, instance_slug: result.instance_slug });
  }
  return res.status(500).json({ success: false, jid: result.jid, error: result.error });
});

/**
 * POST /send/test — Accepts optional instance_slug.
 */
app.post('/send/test', requireApiKey, async (req, res) => {
  const { group_wa_id, content, instance_slug } = req.body || {};
  if (!group_wa_id || !content) {
    return res.status(400).json({ error: 'group_wa_id and content are required' });
  }

  const result = await testSend(group_wa_id, content, instance_slug);
  if (result.success) {
    return res.json({ success: true, jid: result.jid, instance_slug: result.instance_slug });
  }
  return res.status(500).json({ success: false, jid: result.jid, error: result.error });
});

// ===========================================================================
// LOCK-ALL & ADD-ADMIN (use specific instance or default)
// ===========================================================================

async function syncInviteLinksToFirestore(rawLinks) {
  if (!FIREBASE_SYNC_URL || !FIREBASE_SYNC_API_KEY) {
    logger.warn('FIREBASE_SYNC_URL not configured — skipping Firestore sync');
    sendTelegramAlert(
      `⚠️ <b>Sync des liens WhatsApp non configurée</b>\n\n` +
      `Les liens ont bien été sauvegardés en base, mais la sync vers SOS-Expat n'est pas configurée.`,
    );
    return;
  }

  try {
    const resp = await laravelClient.get('/api/groups/firestore-links');
    const { links: firestoreLinks } = resp.data;
    if (!firestoreLinks || firestoreLinks.length === 0) {
      logger.warn('No firestore-mapped groups found');
      return;
    }

    const firebaseResp = await axios.post(FIREBASE_SYNC_URL, { links: firestoreLinks }, {
      headers: { 'Content-Type': 'application/json', 'X-API-Key': FIREBASE_SYNC_API_KEY },
      timeout: 30_000,
    });

    const { updated, total, notFound } = firebaseResp.data;
    logger.info({ updated, total }, 'Firestore invite links synced');

    if (updated > 0) {
      sendTelegramAlert(
        `✅ <b>Liens WhatsApp mis à jour sur SOS-Expat</b>\n\n` +
        `${updated} lien(s) mis à jour.\n` +
        (notFound?.length ? `⚠️ ${notFound.length} groupe(s) non associés.` : `✅ Tous les ${total} groupes à jour.`),
      );
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to sync invite links to Firestore');
    sendTelegramAlert(`⚠️ <b>Sync des liens échouée</b>\n\nErreur : ${err.message}`);
  }
}

let lockAllStatus = null;

app.post('/groups/lock-all', requireApiKey, async (req, res) => {
  const slug = req.body?.instance_slug;
  const sock = getSocketForSlug(slug);
  if (!sock) {
    return res.status(503).json({ error: 'WhatsApp is not connected' });
  }

  if (lockAllStatus?.running) {
    return res.json({ success: false, error: 'Lock-all already in progress', status: lockAllStatus });
  }

  let allowedIds;
  try {
    const { data } = await laravelClient.get('/api/groups/wa-ids');
    allowedIds = new Set(data.ids || []);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch group IDs: ' + err.message });
  }

  if (allowedIds.size === 0) {
    return res.json({ success: false, error: 'No groups found in Laravel DB' });
  }

  let groups;
  try {
    const allGroups = await sock.groupFetchAllParticipating();
    groups = Object.values(allGroups).filter(g => {
      const waId = g.id.replace('@g.us', '');
      return allowedIds.has(waId) && !g.isCommunity && !g.isCommunityAnnounce;
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch groups: ' + err.message });
  }

  lockAllStatus = {
    running: true,
    total: groups.length,
    dbTotal: allowedIds.size,
    processed: 0,
    locked: 0,
    adminAdd: 0,
    inviteLinks: [],
    failed: [],
    current: null,
    startedAt: new Date().toISOString(),
  };

  res.json({
    success: true,
    message: `Lock-all started for ${groups.length} groups. ~3.5 min/group.`,
    total: groups.length,
    estimatedDuration: `~${Math.round(groups.length * 3.5 / 60)} hours`,
  });

  (async () => {
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const jid = group.id;
      const name = group.subject || jid;
      const groupWaId = jid.replace('@g.us', '');
      lockAllStatus.current = `[${i + 1}/${groups.length}] ${name}`;

      try {
        await sock.groupSettingUpdate(jid, 'locked');
        lockAllStatus.locked++;
      } catch (err) {
        lockAllStatus.failed.push({ groupWaId, name, action: 'lock', error: err.message });
      }

      await new Promise(r => setTimeout(r, 45_000 + Math.floor(Math.random() * 30_000)));

      try {
        await sock.groupMemberAddMode(jid, 'admin_add');
        lockAllStatus.adminAdd++;
      } catch (err) {
        lockAllStatus.failed.push({ groupWaId, name, action: 'admin_add', error: err.message });
      }

      await new Promise(r => setTimeout(r, 30_000 + Math.floor(Math.random() * 30_000)));

      let inviteLink = null;
      try {
        const inviteCode = await sock.groupInviteCode(jid);
        inviteLink = inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : null;
        lockAllStatus.inviteLinks.push({ groupWaId, name, inviteLink });
      } catch (err) {
        lockAllStatus.inviteLinks.push({ groupWaId, name, inviteLink: null, error: err.message });
      }

      if (inviteLink) {
        try {
          await laravelClient.post('/api/groups/update-invite-links', {
            links: [{ whatsapp_group_id: groupWaId, invite_link: inviteLink }],
          });
        } catch { /* ignore */ }
      }

      lockAllStatus.processed++;

      if (i < groups.length - 1) {
        await new Promise(r => setTimeout(r, 20_000 + Math.floor(Math.random() * 20_000)));
      }
    }

    lockAllStatus.running = false;
    lockAllStatus.current = null;
    lockAllStatus.completedAt = new Date().toISOString();
    await syncInviteLinksToFirestore(lockAllStatus.inviteLinks);
  })().catch(err => {
    lockAllStatus.running = false;
    lockAllStatus.error = err.message;
    logger.error({ err: err.message }, 'Lock-all failed');
  });
});

app.get('/groups/lock-all/status', requireApiKey, (_req, res) => {
  if (!lockAllStatus) return res.json({ started: false });
  return res.json(lockAllStatus);
});

let addAdminStatus = null;

app.post('/groups/add-admin', requireApiKey, async (req, res) => {
  const slug = req.body?.instance_slug;
  const sock = getSocketForSlug(slug);
  if (!sock) {
    return res.status(503).json({ error: 'WhatsApp is not connected' });
  }

  if (addAdminStatus?.running) {
    return res.json({ success: false, error: 'Add-admin already in progress', status: addAdminStatus });
  }
  if (lockAllStatus?.running) {
    return res.json({ success: false, error: 'Cannot run while lock-all is in progress' });
  }

  const { phone } = req.body || {};
  if (!phone) {
    return res.status(400).json({ error: 'phone is required' });
  }

  const participantJid = phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';

  try {
    const [exists] = await sock.onWhatsApp(participantJid);
    if (!exists?.exists) {
      return res.json({ success: false, error: `+${phone} is not on WhatsApp` });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify phone: ' + err.message });
  }

  let allowedIds;
  try {
    const { data } = await laravelClient.get('/api/groups/wa-ids');
    allowedIds = new Set(data.ids || []);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch group IDs: ' + err.message });
  }

  let groups;
  try {
    const allGroups = await sock.groupFetchAllParticipating();
    const dbGroups = Object.values(allGroups).filter(g => {
      const waId = g.id.replace('@g.us', '');
      return allowedIds.has(waId) && !g.isCommunity && !g.isCommunityAnnounce;
    });
    groups = dbGroups.filter(g => !g.participants?.some(p => p.id === participantJid));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch groups: ' + err.message });
  }

  const MAX_PER_RUN = 12;
  const batch = groups.slice(0, MAX_PER_RUN);
  const remaining = groups.length - batch.length;

  addAdminStatus = {
    running: true,
    phone,
    total: groups.length,
    batchSize: batch.length,
    remainingForNextRun: remaining,
    processed: 0,
    added: 0,
    promoted: 0,
    alreadyIn: 0,
    failed: [],
    current: null,
    startedAt: new Date().toISOString(),
  };

  res.json({
    success: true,
    message: `Add-admin started for ${batch.length} groups.`,
    batchSize: batch.length,
    totalRemaining: groups.length,
    estimatedDuration: `~${Math.round(batch.length * 8)} min`,
  });

  (async () => {
    for (let i = 0; i < batch.length; i++) {
      const group = batch[i];
      const jid = group.id;
      const name = group.subject || jid;
      addAdminStatus.current = `[${i + 1}/${batch.length}] ${name}`;

      try {
        const result = await sock.groupParticipantsUpdate(jid, [participantJid], 'add');
        const status = result?.[0]?.status || 'unknown';
        if (status === '200' || status === 200) {
          addAdminStatus.added++;
        } else if (status === '409' || status === 409) {
          addAdminStatus.alreadyIn++;
        } else {
          addAdminStatus.added++;
        }
      } catch (err) {
        addAdminStatus.failed.push({ name, action: 'add', error: err.message });
        addAdminStatus.processed++;
        await new Promise(r => setTimeout(r, 120_000 + Math.floor(Math.random() * 60_000)));
        continue;
      }

      await new Promise(r => setTimeout(r, 90_000 + Math.floor(Math.random() * 60_000)));

      try {
        await sock.groupParticipantsUpdate(jid, [participantJid], 'promote');
        addAdminStatus.promoted++;
      } catch (err) {
        addAdminStatus.failed.push({ name, action: 'promote', error: err.message });
      }

      addAdminStatus.processed++;

      if (i < batch.length - 1) {
        await new Promise(r => setTimeout(r, 180_000 + Math.floor(Math.random() * 120_000)));
      }
    }

    addAdminStatus.running = false;
    addAdminStatus.current = null;
    addAdminStatus.completedAt = new Date().toISOString();
  })().catch(err => {
    addAdminStatus.running = false;
    addAdminStatus.error = err.message;
  });
});

app.get('/groups/add-admin/status', requireApiKey, (_req, res) => {
  if (!addAdminStatus) return res.json({ started: false });
  return res.json(addAdminStatus);
});

// ---------------------------------------------------------------------------
// 404 + Error handlers
// ---------------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.url}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled Express error');
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function start() {
  logger.info('Starting Baileys campaigns service (multi-instance)...');

  try {
    await initFromLaravel();
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to initialize instances');
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, `HTTP server listening on 0.0.0.0:${PORT}`);
  });

  function gracefulShutdown(signal) {
    logger.info({ signal }, 'Received %s, shutting down...', signal);
    for (const inst of getAllInstances()) {
      if (inst.socket) {
        try { inst.socket.end(undefined); } catch { /* ignore */ }
      }
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

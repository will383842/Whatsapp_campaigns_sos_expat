import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import axios from 'axios';
import QRCode from 'qrcode';
import logger from './logger.js';
import { registerWelcomeListener } from './welcome.js';
import { sendTelegramAlert } from './whatsapp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_BASE_DIR = path.join(__dirname, '..', 'auth_info');

const LARAVEL_API_URL = process.env.LARAVEL_API_URL || 'http://localhost:8001';
const LARAVEL_API_KEY = process.env.LARAVEL_API_KEY || '';

const log = logger.child({ module: 'instance-manager' });

// ---------------------------------------------------------------------------
// Anti-ban: Warmup schedule for new numbers
// ---------------------------------------------------------------------------
// New WhatsApp numbers get banned instantly if they send too many messages.
// This graduated warmup protects them during the critical first weeks.

const WARMUP_SCHEDULE = [
  { maxDays: 3,  dailyLimit: 2   },  // Days 1-3:    2 msgs/day (prove the number is alive)
  { maxDays: 7,  dailyLimit: 5   },  // Days 4-7:    5 msgs/day
  { maxDays: 14, dailyLimit: 10  },  // Days 8-14:  10 msgs/day
  { maxDays: 21, dailyLimit: 20  },  // Days 15-21: 20 msgs/day
  { maxDays: 28, dailyLimit: 35  },  // Days 22-28: 35 msgs/day
  // Days 29+: full dailyMax (warmup complete after 4 weeks)
];

/** Minimum seconds between sends FROM THE SAME INSTANCE (anti-detection) */
const PER_INSTANCE_MIN_DELAY_MS = 120_000; // 2 minutes per number

// Randomized browser fingerprints to avoid detection
const BROWSER_NAMES = [
  'Chrome', 'Firefox', 'Safari', 'Edge', 'Opera',
  'WhatsApp Web', 'Brave', 'Vivaldi',
];

/**
 * @typedef {{
 *   slug: string,
 *   phone: string,
 *   socket: import('@whiskeysockets/baileys').WASocket | null,
 *   connected: boolean,
 *   lastQr: string | null,
 *   dailySent: number,
 *   dailyMax: number,
 *   status: 'active' | 'disconnected' | 'banned' | 'paused',
 *   rotationEnabled: boolean,
 *   createdAt: Date,
 *   lastSendAt: number,
 *   authDir: string,
 *   welcomeRegistered: boolean,
 *   heartbeatInterval: ReturnType<typeof setInterval> | null,
 *   isReconnecting: boolean,
 *   disconnectReminderInterval: ReturnType<typeof setInterval> | null,
 *   lastError: string | null,
 *   banCount: number,
 * }} Instance
 */

/** @type {Map<string, Instance>} */
const instances = new Map();

/** Round-robin counter for pickNextInstance */
let rotationIndex = 0;

/** Daily date for quota reset */
let dailyDate = new Date().toISOString().slice(0, 10);

/** Group → slug affinity map (persists for the day to avoid multi-number detection) */
const groupAffinity = new Map();
let affinityDate = new Date().toISOString().slice(0, 10);
const AFFINITY_FILE = path.join(AUTH_BASE_DIR, '.group_affinity.json');

/** Load group affinity from disk on boot (survives container restarts) */
function loadAffinityFromDisk() {
  try {
    if (fs.existsSync(AFFINITY_FILE)) {
      const data = JSON.parse(fs.readFileSync(AFFINITY_FILE, 'utf-8'));
      if (data.date === affinityDate && data.entries) {
        for (const [k, v] of Object.entries(data.entries)) {
          groupAffinity.set(k, v);
        }
        log.info({ count: groupAffinity.size, date: data.date }, 'Loaded group affinity from disk');
      } else {
        log.info({ diskDate: data.date, today: affinityDate }, 'Affinity file from different day — starting fresh');
      }
    }
  } catch (err) {
    log.warn({ err: err.message }, 'Failed to load affinity from disk');
  }
}

/** Persist group affinity to disk */
function saveAffinityToDisk() {
  try {
    const data = { date: affinityDate, entries: Object.fromEntries(groupAffinity) };
    fs.writeFileSync(AFFINITY_FILE, JSON.stringify(data), 'utf-8');
  } catch (err) {
    log.warn({ err: err.message }, 'Failed to save affinity to disk');
  }
}

// Auto-save affinity every 2 minutes
setInterval(saveAffinityToDisk, 120_000);

// ---------------------------------------------------------------------------
// Auth migration: move flat auth_info files into auth_info/default/
// ---------------------------------------------------------------------------

function migrateAuthIfNeeded() {
  if (!fs.existsSync(AUTH_BASE_DIR)) {
    fs.mkdirSync(AUTH_BASE_DIR, { recursive: true });
    return;
  }

  const entries = fs.readdirSync(AUTH_BASE_DIR, { withFileTypes: true });
  const hasFiles = entries.some(e => e.isFile());
  const hasSubDirs = entries.some(e => e.isDirectory());

  if (hasFiles && !hasSubDirs) {
    const defaultDir = path.join(AUTH_BASE_DIR, 'default');
    fs.mkdirSync(defaultDir, { recursive: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        fs.renameSync(
          path.join(AUTH_BASE_DIR, entry.name),
          path.join(defaultDir, entry.name),
        );
      }
    }
    log.info({ movedFiles: entries.filter(e => e.isFile()).length }, 'Migrated flat auth_info/ to auth_info/default/');
  }
}

// ---------------------------------------------------------------------------
// Daily quota + affinity reset
// ---------------------------------------------------------------------------

function resetDailyQuotasIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyDate) {
    for (const inst of instances.values()) {
      inst.dailySent = 0;
    }
    dailyDate = today;
    log.info({ newDate: today }, 'Daily quotas reset for all instances');
  }
  // Reset group affinity daily so groups get redistributed
  if (today !== affinityDate) {
    groupAffinity.clear();
    affinityDate = today;
    saveAffinityToDisk();
  }
}

// ---------------------------------------------------------------------------
// Warmup: effective daily limit based on instance age
// ---------------------------------------------------------------------------

/**
 * Get the effective daily limit for an instance, considering warmup.
 * @param {Instance} inst
 * @returns {number}
 */
function getEffectiveDailyMax(inst) {
  const ageDays = Math.floor((Date.now() - inst.createdAt.getTime()) / (24 * 60 * 60 * 1000));

  for (const tier of WARMUP_SCHEDULE) {
    if (ageDays < tier.maxDays) {
      return Math.min(tier.dailyLimit, inst.dailyMax);
    }
  }

  return inst.dailyMax; // Past warmup period
}

/**
 * Get warmup info for display.
 * @param {Instance} inst
 * @returns {{ inWarmup: boolean, day: number, currentLimit: number, fullLimit: number, warmupEndsDay: number }}
 */
function getWarmupInfo(inst) {
  const ageDays = Math.floor((Date.now() - inst.createdAt.getTime()) / (24 * 60 * 60 * 1000));
  const effectiveMax = getEffectiveDailyMax(inst);
  const maxWarmupDay = WARMUP_SCHEDULE[WARMUP_SCHEDULE.length - 1]?.maxDays || 14;

  return {
    inWarmup: ageDays < maxWarmupDay,
    day: ageDays + 1,
    currentLimit: effectiveMax,
    fullLimit: inst.dailyMax,
    warmupEndsDay: maxWarmupDay,
  };
}

// ---------------------------------------------------------------------------
// Instance lifecycle
// ---------------------------------------------------------------------------

/**
 * Create and connect a Baileys instance.
 * @param {string} slug
 * @param {string} phone
 * @param {number} dailyMax
 * @param {boolean} rotationEnabled
 * @param {string|null} createdAtStr - ISO date from Laravel (null = now)
 * @returns {Promise<Instance>}
 */
export async function createInstance(slug, phone, dailyMax = 50, rotationEnabled = true, createdAtStr = null, initialStatus = 'disconnected') {
  if (instances.has(slug)) {
    log.warn({ slug }, 'Instance already exists, returning existing');
    return instances.get(slug);
  }

  const authDir = path.join(AUTH_BASE_DIR, slug);
  fs.mkdirSync(authDir, { recursive: true });

  /** @type {Instance} */
  const instance = {
    slug,
    phone,
    socket: null,
    connected: false,
    lastQr: null,
    dailySent: 0,
    dailyMax,
    status: initialStatus,
    rotationEnabled,
    createdAt: createdAtStr ? new Date(createdAtStr) : new Date(),
    lastSendAt: 0,
    authDir,
    welcomeRegistered: false,
    heartbeatInterval: null,
    isReconnecting: false,
    disconnectReminderInterval: null,
    lastError: null,
    banCount: 0,
  };

  instances.set(slug, instance);

  const warmup = getWarmupInfo(instance);
  if (warmup.inWarmup) {
    log.info({ slug, day: warmup.day, limit: warmup.currentLimit }, 'Instance in warmup period');
  }

  await connectInstance(instance);
  return instance;
}

/**
 * Connect (or reconnect) a specific instance.
 * @param {Instance} instance
 */
async function connectInstance(instance) {
  const { slug, authDir } = instance;

  // Don't reconnect banned instances
  if (instance.status === 'banned') {
    log.warn({ slug }, 'Instance is banned — skipping connection');
    return;
  }

  // Clean up previous socket listeners to prevent memory leaks
  if (instance.socket) {
    try {
      instance.socket.ev.removeAllListeners('connection.update');
      instance.socket.ev.removeAllListeners('creds.update');
      instance.socket.ev.removeAllListeners('group-participants.update');
    } catch { /* ignore if already closed */ }
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    // Randomized browser fingerprint to avoid detection
    const browserName = BROWSER_NAMES[Math.floor(Math.random() * BROWSER_NAMES.length)];

    const sock = makeWASocket({
      version,
      auth: state,
      browser: [browserName, 'Desktop', '10.0'],
      printQRInTerminal: false,
      logger: logger.child({ module: `baileys:${slug}` }),
      markOnlineOnConnect: false,
    });

    instance.socket = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        instance.lastQr = qr;
        log.info({ slug }, 'New QR code available');
      }

      if (connection === 'close') {
        instance.connected = false;
        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : undefined;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        // --- BAN DETECTION ---
        // Status 401 = logged out (could be ban or manual revoke)
        // Status 403 = explicitly banned
        // Status 405 = account restricted
        const isBanned = statusCode === 403 || statusCode === 405;

        // --- ZOMBIE / STREAM ERROR DETECTION ---
        // Status 428 = precondition required (stale session)
        // Status 500 = internal error (xml-not-well-formed, stream corruption)
        // These codes mean the session is corrupted and will keep failing silently.
        // Auto-purge auth so a fresh QR is generated.
        const isStreamCorrupted = statusCode === 428 || statusCode === 500;

        log.warn({ slug, statusCode, loggedOut, isBanned, isStreamCorrupted }, 'Connection closed');
        instance.lastError = `Disconnected (code: ${statusCode})`;

        if (isStreamCorrupted && !isBanned && !loggedOut) {
          log.error({ slug, statusCode }, 'STREAM CORRUPTED — auto-purging auth to prevent zombie session');
          instance.status = 'disconnected';
          instance.welcomeRegistered = false;

          sendTelegramAlert(
            `🧟 <b>Session corrompue détectée : [${slug}]</b>\n\n` +
            `Le numéro ${instance.phone} avait une session instable (code ${statusCode}).\n` +
            `→ Auth purgée automatiquement.\n` +
            `→ Un nouveau QR code est prêt.\n\n` +
            `👉 <a href="https://whatsapp.life-expat.com/whatsapp/numbers">Scanner le QR</a>`,
          );

          if (instance.socket) {
            try { instance.socket.end(undefined); } catch { /* ignore */ }
            instance.socket = null;
          }
          clearAuthForInstance(instance);
          startDisconnectReminder(instance);
          setTimeout(() => connectInstance(instance), 3000);
          return;
        }

        if (isBanned) {
          instance.status = 'banned';
          instance.banCount++;
          log.error({ slug, statusCode, banCount: instance.banCount }, 'INSTANCE BANNED by WhatsApp');
          sendTelegramAlert(
            `🚫 <b>WhatsApp [${slug}] BANNI !</b>\n\n` +
            `Le numéro ${instance.phone} a été banni par WhatsApp.\n` +
            `Bans cumulés : ${instance.banCount}\n\n` +
            `⚠️ Ce numéro est automatiquement retiré de la rotation.\n` +
            `Ne PAS réessayer immédiatement — attendez 24-48h minimum.\n\n` +
            `💡 Conseils : utilisez un numéro qui a de l'historique, réduisez le volume d'envoi.`,
          );
          // Report ban to Laravel
          try {
            await axios.patch(`${LARAVEL_API_URL}/api/whatsapp-numbers/report-ban`, {
              slug: instance.slug,
            }, {
              headers: { 'X-API-Key': LARAVEL_API_KEY },
              timeout: 5_000,
            });
          } catch { /* ignore */ }
          // Clean up socket to free memory
          if (instance.socket) {
            try { instance.socket.end(undefined); } catch { /* ignore */ }
            instance.socket = null;
          }
          if (instance.heartbeatInterval) {
            clearInterval(instance.heartbeatInterval);
            instance.heartbeatInterval = null;
          }
          // Don't reconnect — instance is dead
          return;
        }

        if (loggedOut) {
          instance.status = 'disconnected';
          instance.welcomeRegistered = false;
          sendTelegramAlert(
            `🔴 <b>WhatsApp [${slug}] déconnecté !</b>\n\n` +
            `Le numéro ${instance.phone} a été révoqué.\n` +
            `Un nouveau QR code est prêt.\n\n` +
            `👉 <a href="https://whatsapp.life-expat.com/whatsapp/numbers">Scanner le QR</a>`,
          );
          startDisconnectReminder(instance);
          clearAuthForInstance(instance);
          instance.socket = null;
          setTimeout(() => connectInstance(instance), 3000);
          return;
        }

        // Reset welcome listener so it re-registers on next connection
        instance.welcomeRegistered = false;

        if (!instance.isReconnecting) {
          instance.isReconnecting = true;
          setTimeout(async () => {
            instance.isReconnecting = false;
            try {
              await connectInstance(instance);
            } catch (err) {
              log.error({ slug, err: err.message }, 'Reconnection failed');
            }
          }, 5000);
        }
      }

      if (connection === 'open') {
        instance.connected = true;
        instance.isReconnecting = false;
        instance.lastQr = null;
        instance.lastError = null;
        if (instance.status !== 'paused') {
          instance.status = 'active';
        }

        const warmup = getWarmupInfo(instance);
        log.info({
          slug,
          user: sock?.user?.id,
          warmup: warmup.inWarmup ? `day ${warmup.day}/${warmup.warmupEndsDay}, limit: ${warmup.currentLimit}` : 'complete',
        }, 'Connected');

        stopDisconnectReminder(instance);
        sendTelegramAlert(
          `🟢 <b>WhatsApp [${slug}] connecté !</b>\n\n` +
          `Le numéro ${instance.phone} est prêt.` +
          (warmup.inWarmup
            ? `\n⏳ Warmup jour ${warmup.day}/${warmup.warmupEndsDay} — limite : ${warmup.currentLimit} msgs/jour`
            : ''),
        );

        // Register welcome listener
        if (!instance.welcomeRegistered) {
          registerWelcomeListener(sock);
          instance.welcomeRegistered = true;
        }

        // Simple heartbeat: reconnect if disconnected (no WA API calls)
        if (instance.heartbeatInterval) clearInterval(instance.heartbeatInterval);
        instance.heartbeatInterval = setInterval(() => {
          if (!instance.connected && !instance.isReconnecting && instance.status !== 'banned') {
            log.warn({ slug }, 'Heartbeat: disconnected, reconnecting...');
            connectInstance(instance);
          }
        }, 60_000);
      }

      if (connection === 'connecting') {
        log.info({ slug }, 'Connecting...');
      }
    });
  } catch (err) {
    log.error({ slug, err: err.message }, 'Failed to connect instance');
    instance.lastError = err.message;
  }
}

function clearAuthForInstance(instance) {
  try {
    if (fs.existsSync(instance.authDir)) {
      const files = fs.readdirSync(instance.authDir);
      for (const file of files) {
        fs.rmSync(path.join(instance.authDir, file), { force: true });
      }
      log.info({ slug: instance.slug, filesRemoved: files.length }, 'Cleared auth for fresh QR');
    }
  } catch (err) {
    log.error({ slug: instance.slug, err: err.message }, 'Failed to clear auth');
  }
}

function startDisconnectReminder(instance) {
  stopDisconnectReminder(instance);
  const REMINDER_MS = 6 * 60 * 60 * 1000;
  instance.disconnectReminderInterval = setInterval(() => {
    if (!instance.connected) {
      sendTelegramAlert(
        `⚠️ <b>Rappel : WhatsApp [${instance.slug}] toujours déconnecté !</b>\n\n` +
        `Le numéro ${instance.phone} n'envoie PAS de messages.\n\n` +
        `👉 <a href="https://whatsapp.life-expat.com/whatsapp/numbers">Scanner le QR</a>`,
      );
    } else {
      stopDisconnectReminder(instance);
    }
  }, REMINDER_MS);
}

function stopDisconnectReminder(instance) {
  if (instance.disconnectReminderInterval) {
    clearInterval(instance.disconnectReminderInterval);
    instance.disconnectReminderInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Remove / Purge
// ---------------------------------------------------------------------------

export function removeInstance(slug) {
  const inst = instances.get(slug);
  if (!inst) return;
  if (inst.heartbeatInterval) clearInterval(inst.heartbeatInterval);
  stopDisconnectReminder(inst);
  if (inst.socket) {
    try { inst.socket.end(undefined); } catch { /* ignore */ }
  }
  instances.delete(slug);
  log.info({ slug }, 'Instance removed (auth preserved)');
}

export function removeInstanceAndPurge(slug) {
  const inst = instances.get(slug);
  if (inst) clearAuthForInstance(inst);
  removeInstance(slug);
  const authDir = path.join(AUTH_BASE_DIR, slug);
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
  }
  log.info({ slug }, 'Instance removed and auth purged');
}

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

/** @returns {Instance | undefined} */
export function getInstance(slug) {
  return instances.get(slug);
}

/** @returns {Instance[]} */
export function getAllInstances() {
  return Array.from(instances.values());
}

/** @returns {Instance[]} Active, connected, non-banned instances */
export function getConnectedInstances() {
  return getAllInstances().filter(i => i.connected && i.status === 'active');
}

// ---------------------------------------------------------------------------
// Anti-ban: Group affinity (same group → same instance for the whole day)
// ---------------------------------------------------------------------------

/**
 * Get the assigned instance for a specific group.
 * If no assignment exists, assign the least-loaded instance.
 * This prevents a group from receiving messages from different numbers
 * on the same day, which WhatsApp detects as coordinated spam.
 *
 * @param {string} groupWaId
 * @returns {Instance | null}
 */
export function getInstanceForGroup(groupWaId) {
  resetDailyQuotasIfNeeded();

  const available = getConnectedInstances().filter(i =>
    i.rotationEnabled && i.dailySent < getEffectiveDailyMax(i),
  );
  if (available.length === 0) return null;

  // Check existing affinity
  const assignedSlug = groupAffinity.get(groupWaId);
  if (assignedSlug) {
    const inst = available.find(i => i.slug === assignedSlug);
    if (inst) return inst; // Still available, use it
    // Assigned instance no longer available — reassign below
  }

  // Assign to the instance with the least sends today (load balancing)
  available.sort((a, b) => a.dailySent - b.dailySent);
  const chosen = available[0];
  groupAffinity.set(groupWaId, chosen.slug);
  return chosen;
}

// ---------------------------------------------------------------------------
// Round-robin rotation (for non-group-specific sends like welcome)
// ---------------------------------------------------------------------------

/**
 * Pick next available instance with anti-ban protections:
 * - Must be connected + active + rotation enabled
 * - Must not exceed warmup daily limit
 * - Must respect per-instance send cooldown
 * @returns {Instance | null}
 */
export function pickNextInstance() {
  resetDailyQuotasIfNeeded();

  const now = Date.now();
  const available = getConnectedInstances().filter(i => {
    if (!i.rotationEnabled) return false;
    if (i.dailySent >= getEffectiveDailyMax(i)) return false;
    // Per-instance cooldown: don't pick if last send was too recent
    if (now - i.lastSendAt < PER_INSTANCE_MIN_DELAY_MS) return false;
    return true;
  });

  if (available.length === 0) {
    // Fallback: ignore cooldown if all are on cooldown (prevents stalls)
    const fallback = getConnectedInstances().filter(i =>
      i.rotationEnabled && i.dailySent < getEffectiveDailyMax(i),
    );
    if (fallback.length === 0) return null;
    // Pick the one whose cooldown expires soonest
    fallback.sort((a, b) => a.lastSendAt - b.lastSendAt);
    return fallback[0];
  }

  rotationIndex = rotationIndex % available.length;
  const picked = available[rotationIndex];
  rotationIndex = (rotationIndex + 1) % available.length;
  return picked;
}

/**
 * Record a send and increment counters.
 * @param {string} slug
 */
export function incrementInstanceQuota(slug) {
  const inst = instances.get(slug);
  if (inst) {
    inst.dailySent++;
    inst.lastSendAt = Date.now();
  }
}

/**
 * Update config for a running instance.
 * @param {string} slug
 * @param {{ dailyMax?: number, rotationEnabled?: boolean }} config
 */
export function updateInstanceConfig(slug, config) {
  const inst = instances.get(slug);
  if (!inst) throw new Error(`Instance ${slug} not found`);
  if (config.dailyMax !== undefined) {
    inst.dailyMax = config.dailyMax;
  }
  if (config.rotationEnabled !== undefined) {
    inst.rotationEnabled = config.rotationEnabled;
  }
  log.info({ slug, ...config }, 'Instance config updated');
}

// ---------------------------------------------------------------------------
// Restart / Pause / Resume
// ---------------------------------------------------------------------------

export async function restartInstance(slug, force = false) {
  const inst = instances.get(slug);
  if (!inst) throw new Error(`Instance ${slug} not found`);

  if (inst.socket) {
    try { inst.socket.end(undefined); } catch { /* ignore */ }
  }
  inst.socket = null;
  inst.connected = false;
  inst.welcomeRegistered = false;

  // If was banned, clear ban status on manual restart
  if (inst.status === 'banned') {
    inst.status = 'disconnected';
    log.info({ slug }, 'Ban status cleared on manual restart');
  }

  await new Promise(r => setTimeout(r, 2000));

  if (force) {
    clearAuthForInstance(inst);
  }

  await connectInstance(inst);
}

export function pauseInstance(slug) {
  const inst = instances.get(slug);
  if (!inst) throw new Error(`Instance ${slug} not found`);
  inst.status = 'paused';
  log.info({ slug }, 'Instance paused');
}

export function resumeInstance(slug) {
  const inst = instances.get(slug);
  if (!inst) throw new Error(`Instance ${slug} not found`);
  inst.status = inst.connected ? 'active' : 'disconnected';
  log.info({ slug }, 'Instance resumed');
}

// ---------------------------------------------------------------------------
// QR & Health
// ---------------------------------------------------------------------------

export async function getInstanceQr(slug) {
  const inst = instances.get(slug);
  if (!inst || !inst.lastQr) return null;
  return QRCode.toDataURL(inst.lastQr, { width: 400, margin: 2 });
}

export function getInstanceHealth(slug) {
  const inst = instances.get(slug);
  if (!inst) return null;
  resetDailyQuotasIfNeeded();
  const warmup = getWarmupInfo(inst);
  return {
    slug: inst.slug,
    phone: inst.phone,
    status: inst.status,
    connected: inst.connected,
    rotationEnabled: inst.rotationEnabled,
    dailySent: inst.dailySent,
    dailyMax: inst.dailyMax,
    effectiveDailyMax: warmup.currentLimit,
    dailyRemaining: Math.max(0, warmup.currentLimit - inst.dailySent),
    hasQr: !!inst.lastQr,
    lastError: inst.lastError,
    banCount: inst.banCount,
    warmup: {
      active: warmup.inWarmup,
      day: warmup.day,
      limit: warmup.currentLimit,
      endsDay: warmup.warmupEndsDay,
    },
  };
}

export function getGlobalHealth() {
  resetDailyQuotasIfNeeded();
  const all = getAllInstances();
  const connected = all.filter(i => i.connected);
  const active = all.filter(i => i.status === 'active' && i.connected);
  const banned = all.filter(i => i.status === 'banned');

  return {
    totalInstances: all.length,
    connectedCount: connected.length,
    activeCount: active.length,
    bannedCount: banned.length,
    totalDailySent: all.reduce((s, i) => s + i.dailySent, 0),
    totalDailyMax: all.reduce((s, i) => s + i.dailyMax, 0),
    totalEffectiveDailyMax: all.reduce((s, i) => s + getEffectiveDailyMax(i), 0),
    totalDailyRemaining: all.reduce((s, i) => s + Math.max(0, getEffectiveDailyMax(i) - i.dailySent), 0),
    instances: all.map(i => getInstanceHealth(i.slug)),
  };
}

// ---------------------------------------------------------------------------
// Global quota helpers (used by sendQueue)
// ---------------------------------------------------------------------------

export function canSendGlobally() {
  resetDailyQuotasIfNeeded();
  return getConnectedInstances().some(i => i.rotationEnabled && i.dailySent < getEffectiveDailyMax(i));
}

export function getRemainingGlobalQuota() {
  resetDailyQuotasIfNeeded();
  return getConnectedInstances()
    .filter(i => i.rotationEnabled)
    .reduce((s, i) => s + Math.max(0, getEffectiveDailyMax(i) - i.dailySent), 0);
}

// ---------------------------------------------------------------------------
// Default instance helpers
// ---------------------------------------------------------------------------

export function getDefaultInstance() {
  const def = instances.get('default');
  if (def?.connected) return def;
  return getConnectedInstances()[0] || null;
}

export function getSocketForSlug(slug) {
  if (slug) {
    const inst = instances.get(slug);
    return inst?.socket || null;
  }
  const def = getDefaultInstance();
  return def?.socket || null;
}

export function isAnyConnected() {
  return getAllInstances().some(i => i.connected);
}

// ---------------------------------------------------------------------------
// Boot: fetch active numbers from Laravel and create instances
// ---------------------------------------------------------------------------

export async function initFromLaravel() {
  migrateAuthIfNeeded();
  loadAffinityFromDisk();

  const maxRetries = 60; // 5 min
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const resp = await axios.get(`${LARAVEL_API_URL}/api/whatsapp-numbers/active`, {
        headers: { 'X-API-Key': LARAVEL_API_KEY },
        timeout: 10_000,
      });

      const numbers = resp.data?.numbers || resp.data || [];

      if (!Array.isArray(numbers) || numbers.length === 0) {
        log.warn('No active WhatsApp numbers from Laravel — creating default instance');
        await createInstance('default', process.env.WA_PHONE_NUMBER || '', 50);
        return;
      }

      log.info({ count: numbers.length }, 'Fetched active WhatsApp numbers from Laravel');

      for (const num of numbers) {
        await createInstance(
          num.slug,
          num.phone,
          num.daily_max || 50,
          num.is_rotation_enabled !== false,
          num.created_at || null,
          num.status === 'banned' ? 'banned' : 'disconnected',
        );
      }

      return;
    } catch (err) {
      log.warn({ attempt, err: err.message }, 'Failed to fetch numbers from Laravel — retrying in 5s');
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  log.error('Could not reach Laravel after max retries — starting with default instance');
  await createInstance('default', process.env.WA_PHONE_NUMBER || '', 50);
}

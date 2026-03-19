import axios from 'axios';
import { isAnyConnected, pickNextInstance, getInstanceForGroup, incrementInstanceQuota, canSendGlobally, getRemainingGlobalQuota, getInstance, getAllInstances } from './instanceManager.js';
import { sendTelegramAlert } from './whatsapp.js';
import { enqueue, CAMPAIGN_DELAY_MIN, CAMPAIGN_DELAY_MAX } from './sendQueue.js';
import logger from './logger.js';

const LARAVEL_API_URL = process.env.LARAVEL_API_URL || 'http://localhost:8001';
const LARAVEL_API_KEY = process.env.LARAVEL_API_KEY || '';

const laravelClient = axios.create({
  baseURL: LARAVEL_API_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': LARAVEL_API_KEY,
  },
});

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toGroupJid(groupWaId) {
  return groupWaId.includes('@') ? groupWaId : `${groupWaId}@g.us`;
}

async function isGroupValid(sock, jid) {
  if (!sock) return false;
  try {
    const meta = await sock.groupMetadata(jid);
    return !!meta?.id;
  } catch (err) {
    logger.warn({ jid, err: err.message }, 'Group metadata fetch failed');
    return false;
  }
}

/**
 * Report a single group send result to Laravel.
 * Includes instance_slug for multi-instance tracking.
 */
async function reportGroupResult({ message_id, group_wa_id, language, content, status, error_message, instance_slug }) {
  try {
    await laravelClient.post('/api/send/report', {
      message_id,
      group_wa_id,
      status,
      ...(language ? { language } : {}),
      ...(content ? { content_sent: content } : {}),
      ...(error_message ? { error_message } : {}),
      ...(instance_slug ? { instance_slug } : {}),
    });
    logger.debug({ message_id, group_wa_id, status, instance_slug }, 'Group result reported');
  } catch (err) {
    logger.error({ message_id, group_wa_id, status, err: err.message }, 'Failed to report group result');
  }
}

/**
 * Report campaign completion to Laravel.
 * Supports quota_exceeded_count for carry-over system.
 */
async function reportCampaignComplete({ message_id, total, sent_count, failed_count, quota_exceeded_count = 0 }) {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await laravelClient.post('/api/send/report/complete', {
        message_id,
        total,
        sent_count,
        failed_count,
        quota_exceeded_count,
      });
      logger.info({ message_id, total, sent_count, failed_count, quota_exceeded_count }, 'Campaign complete reported to Laravel');
      return;
    } catch (err) {
      if (attempt < maxRetries - 1) {
        const delay = 5000 * (attempt + 1);
        logger.warn(
          { message_id, attempt: attempt + 1, maxRetries, delay, err: err.message },
          'Failed to report campaign completion, retrying...',
        );
        await sleep(delay);
      } else {
        logger.error(
          { message_id, total, sent_count, failed_count, err: err.message },
          'CRITICAL: Failed to report campaign completion after all retries — message may be stuck in sending',
        );
      }
    }
  }
}

/**
 * Verify the WhatsApp connection is REALLY functional (not a zombie session).
 * A zombie session reports connected=true but can't actually interact with WA.
 *
 * Uses groupFetchAllParticipating() which lists the groups this number is in.
 * This works even if the number isn't in the target group — it just needs a
 * working WhatsApp connection. If it times out → zombie session.
 *
 * Cached for 60 seconds to avoid hammering WhatsApp with heavy API calls.
 *
 * NOTE: Does NOT use groupMetadata(targetJid) because that fails with
 * "forbidden" if the number isn't a member of the group (false positive).
 */
const verifyCache = new Map(); // slug → { result: true, timestamp: number }
const VERIFY_CACHE_TTL = 30_000; // 30 seconds — only cache successes

async function verifyConnectionIsReal(sock, instanceSlug) {
  // Only cache successes — failures are always re-checked
  if (instanceSlug) {
    const cached = verifyCache.get(instanceSlug);
    if (cached?.result === true && Date.now() - cached.timestamp < VERIFY_CACHE_TTL) {
      return true;
    }
  }

  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection verification timed out (8s)')), 8000)
    );
    const check = sock.groupFetchAllParticipating();
    await Promise.race([check, timeout]);
    if (instanceSlug) verifyCache.set(instanceSlug, { result: true, timestamp: Date.now() });
    return true;
  } catch (err) {
    // Differentiate zombie vs transient errors
    const isTimeout = err.message.includes('timed out');
    const isDeadSocket = err.message.includes('ECONNREFUSED') || err.message.includes('not open');

    if (isTimeout || isDeadSocket) {
      logger.error({ err: err.message, instanceSlug }, 'Connection verification FAILED — zombie session detected');
      // Clear success cache for this instance
      if (instanceSlug) verifyCache.delete(instanceSlug);
      return false;
    }

    // Transient error (rate limit, network blip) — give benefit of the doubt
    logger.warn({ err: err.message, instanceSlug }, 'Connection verification: transient error, assuming OK');
    return true;
  }
}

async function sendWithRetry(sock, jid, content, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await sock.sendMessage(jid, { text: content });

      // Verify sendMessage returned a valid message key
      if (!result?.key?.id) {
        throw new Error('sendMessage returned no message key — message likely not delivered');
      }

      return true;
    } catch (err) {
      const isRetryable = err?.message?.includes('timed out') ||
                         err?.message?.includes('connection') ||
                         err?.message?.includes('ECONNRESET');
      if (isRetryable && attempt < maxRetries) {
        const delay = 5000 * (attempt + 1);
        logger.warn({ jid, attempt, delay }, 'Retryable error, waiting...');
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Send a campaign message to a list of WhatsApp groups.
 * Uses getInstanceForGroup() for group affinity (anti-ban).
 * Reports quota_exceeded for carry-over when daily limit reached.
 */
export async function sendCampaignMessage(payload) {
  const { message_id, targets } = payload;

  if (!message_id || !Array.isArray(targets) || targets.length === 0) {
    logger.error({ payload }, 'Invalid campaign payload');
    return;
  }

  if (!isAnyConnected()) {
    logger.error({ message_id }, 'Cannot send: no WhatsApp instance connected');
    sendTelegramAlert(
      `🔴 <b>CAMPAGNE BLOQUÉE — Aucun numéro connecté !</b>\n\n` +
      `Message #${message_id} : ${targets.length} groupes ne peuvent pas être envoyés.\n` +
      `→ Tous les numéros sont déconnectés ou bannis.\n\n` +
      `<b>Action requise :</b> Connectez au moins un numéro depuis le dashboard.`,
    );
    for (const target of targets) {
      await reportGroupResult({
        message_id,
        group_wa_id: target.group_wa_id,
        language: target.language,
        content: target.content,
        status: 'failed',
        error_message: 'No WhatsApp instance connected',
      });
    }
    await reportCampaignComplete({ message_id, total: targets.length, sent_count: 0, failed_count: targets.length });
    return;
  }

  const shuffled = shuffle([...targets]);
  const remaining = getRemainingGlobalQuota();
  logger.info({ message_id, total: shuffled.length, dailyRemaining: remaining }, 'Starting campaign send');

  // PRE-SEND: Verify the connection is REALLY working (not a zombie session)
  // Use the first target group as a test — if groupMetadata fails, the whole session is broken
  const testInstance = pickNextInstance();
  if (testInstance?.socket) {
    const isReal = await verifyConnectionIsReal(testInstance.socket, testInstance.slug);
    if (!isReal) {
      logger.error({ message_id, total: shuffled.length }, 'ABORTING CAMPAIGN — zombie session detected, connection is not functional');
      sendTelegramAlert(
        `🔴 <b>CAMPAGNE AVORTÉE — Session WhatsApp zombie !</b>\n\n` +
        `Message #${message_id} : ${shuffled.length} groupes annulés.\n` +
        `→ La connexion semble active mais ne fonctionne PAS réellement.\n\n` +
        `<b>Action requise :</b> Déconnectez puis reconnectez le numéro depuis le dashboard.`,
      );
      for (const target of shuffled) {
        await reportGroupResult({
          message_id,
          group_wa_id: target.group_wa_id,
          language: target.language,
          content: target.content,
          status: 'failed',
          error_message: 'zombie_session: connection not functional',
        });
      }
      await reportCampaignComplete({ message_id, total: shuffled.length, sent_count: 0, failed_count: shuffled.length });
      return;
    }
    logger.info({ message_id }, 'Pre-send connection verification PASSED');
  }

  // If all instances at daily limit, report as quota_exceeded for carry-over
  if (!canSendGlobally()) {
    logger.warn({ message_id, total: shuffled.length }, 'All instances at daily limit — campaign DEFERRED (quota_exceeded)');
    for (const target of shuffled) {
      await reportGroupResult({
        message_id,
        group_wa_id: target.group_wa_id,
        language: target.language,
        content: target.content,
        status: 'failed',
        error_message: 'quota_exceeded',
      });
    }
    await reportCampaignComplete({
      message_id,
      total: shuffled.length,
      sent_count: 0,
      failed_count: 0,
      quota_exceeded_count: shuffled.length,
    });
    return;
  }

  let sent_count = 0;
  let failed_count = 0;
  let quota_exceeded_count = 0;

  for (let i = 0; i < shuffled.length; i++) {
    const { group_wa_id, language, content, instance_slug: preferredSlug } = shuffled[i];
    const jid = toGroupJid(group_wa_id);
    const groupIndex = i;

    // Check quota before each group — report remaining as quota_exceeded for carry-over
    if (!canSendGlobally()) {
      const remaining = shuffled.length - i;
      logger.warn({ message_id, group_wa_id, index: groupIndex + 1, total: shuffled.length }, 'All instances at limit mid-campaign — remaining deferred');
      sendTelegramAlert(
        `📊 <b>Quota journalier atteint mid-campagne</b>\n\n` +
        `Campagne message #${message_id} : ${i}/${shuffled.length} groupes envoyés.\n` +
        `→ <b>${remaining} groupes reportés au lendemain</b> (carry-over automatique).\n\n` +
        `<i>Rien à faire — les groupes restants seront envoyés demain automatiquement.</i>`,
      );
      for (let j = i; j < shuffled.length; j++) {
        quota_exceeded_count++;
        await reportGroupResult({
          message_id,
          group_wa_id: shuffled[j].group_wa_id,
          language: shuffled[j].language,
          content: shuffled[j].content,
          status: 'failed',
          error_message: 'quota_exceeded',
        });
      }
      break;
    }

    await enqueue(async () => {
      // Use assigned instance (from group's whatsapp_number_id) or fall back to affinity
      let instance = null;
      let usedFallback = false;
      if (preferredSlug) {
        instance = getInstance(preferredSlug);
        if (!instance?.connected || instance.status !== 'active') {
          logger.warn({ message_id, group_wa_id, preferredSlug }, 'Assigned instance unavailable — falling back to affinity');
          instance = null;
          usedFallback = true;
        }
      }
      if (!instance) {
        instance = getInstanceForGroup(group_wa_id);
      }

      // ALERT: fallback triggered — a group is about to receive a message from a DIFFERENT number
      if (usedFallback && instance) {
        sendTelegramAlert(
          `⚠️ <b>ANTI-BAN : Fallback déclenché !</b>\n\n` +
          `Le groupe <b>${group_wa_id}</b> est assigné au numéro <b>${preferredSlug}</b> mais celui-ci est indisponible.\n` +
          `→ Envoi via <b>${instance.slug}</b> à la place.\n\n` +
          `<i>Risque : WhatsApp pourrait détecter un changement de numéro. Vérifiez le numéro ${preferredSlug}.</i>`,
        );
      }
      if (!instance) {
        failed_count++;
        await reportGroupResult({ message_id, group_wa_id, language, content, status: 'failed', error_message: 'No available instance' });
        return;
      }

      const sock = instance.socket;
      const instanceSlug = instance.slug;

      logger.info({ message_id, group_wa_id, jid, language, instance: instanceSlug, index: groupIndex + 1, total: shuffled.length }, 'Processing group target');

      const valid = await isGroupValid(sock, jid);
      if (!valid) {
        logger.warn({ message_id, group_wa_id, jid }, 'Skipping invalid group');
        failed_count++;
        await reportGroupResult({ message_id, group_wa_id, language, content, status: 'failed', error_message: 'Group not found or not accessible', instance_slug: instanceSlug });
        return;
      }

      try {
        await sendWithRetry(sock, jid, content);
        sent_count++;
        incrementInstanceQuota(instanceSlug);
        logger.info({ message_id, group_wa_id, jid, instance: instanceSlug }, 'Message sent');
        await reportGroupResult({ message_id, group_wa_id, language, content, status: 'sent', instance_slug: instanceSlug });
      } catch (err) {
        failed_count++;
        const error_message = err?.message || String(err);
        logger.error({ message_id, group_wa_id, jid, instance: instanceSlug, err: error_message }, 'Failed to send');
        await reportGroupResult({ message_id, group_wa_id, language, content, status: 'failed', error_message, instance_slug: instanceSlug });
      }

      const delay = randomInt(CAMPAIGN_DELAY_MIN, CAMPAIGN_DELAY_MAX);
      logger.info({ delay, index: groupIndex + 1, total: shuffled.length }, `Campaign delay: ${(delay / 1000).toFixed(1)}s`);
      await sleep(delay);
    }, `campaign:${message_id}:group:${group_wa_id}`, 'normal');
  }

  await reportCampaignComplete({
    message_id,
    total: shuffled.length,
    sent_count,
    failed_count,
    quota_exceeded_count,
  });

  logger.info({ message_id, total: shuffled.length, sent_count, failed_count, quota_exceeded_count }, 'Campaign send complete');
}

/**
 * Send a single test message.
 * Optionally specify instance_slug, otherwise uses rotation.
 * If sending fails with "forbidden" (not in group), tries other instances.
 */
export async function testSend(group_wa_id, content, instanceSlug) {
  const jid = toGroupJid(group_wa_id);

  // Build list of instances to try: preferred first, then all others
  const allConnected = getAllInstances().filter(i => i.connected && i.status === 'active');

  let instancesToTry = [];
  if (instanceSlug) {
    const preferred = getInstance(instanceSlug);
    if (preferred?.connected) instancesToTry.push(preferred);
    instancesToTry.push(...allConnected.filter(i => i.slug !== instanceSlug));
  } else {
    const picked = pickNextInstance();
    if (picked) instancesToTry.push(picked);
    instancesToTry.push(...allConnected.filter(i => i.slug !== picked?.slug));
  }

  if (instancesToTry.length === 0) {
    const error = 'No WhatsApp instance available';
    logger.error({ group_wa_id }, error);
    return { success: false, jid, error };
  }

  let lastError = '';

  for (const instance of instancesToTry) {
    if (!instance?.socket) continue;

    // Verify connection is real before sending
    const isReal = await verifyConnectionIsReal(instance.socket, instance.slug);
    if (!isReal) {
      logger.warn({ group_wa_id, jid, instance: instance.slug }, 'testSend: skipping zombie instance');
      continue;
    }

    try {
      await sendWithRetry(instance.socket, jid, content);
      incrementInstanceQuota(instance.slug);
      logger.info({ group_wa_id, jid, instance: instance.slug }, 'Test message sent');
      return { success: true, jid, instance_slug: instance.slug };
    } catch (err) {
      lastError = err?.message || String(err);
      const isForbidden = lastError.includes('forbidden') || lastError.includes('not-authorized');
      logger.warn({ group_wa_id, jid, instance: instance.slug, err: lastError, isForbidden }, 'testSend: instance failed');

      // If forbidden (not in group), try next instance
      if (isForbidden && instancesToTry.indexOf(instance) < instancesToTry.length - 1) {
        logger.info({ group_wa_id, nextInstance: instancesToTry[instancesToTry.indexOf(instance) + 1]?.slug }, 'testSend: trying next instance...');
        continue;
      }

      // Non-forbidden error or last instance — give up
      break;
    }
  }

  logger.error({ group_wa_id, jid, err: lastError }, 'Test message failed on all instances');
  return { success: false, jid, error: lastError };
}

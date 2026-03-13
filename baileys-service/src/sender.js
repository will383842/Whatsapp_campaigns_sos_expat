import axios from 'axios';
import { getSocket, isConnected } from './whatsapp.js';
import logger from './logger.js';

const LARAVEL_API_URL = process.env.LARAVEL_API_URL || 'http://localhost:8001';
const LARAVEL_API_KEY = process.env.LARAVEL_API_KEY || '';

/** Minimum delay between messages in ms */
const DELAY_MIN = 30_000;
/** Maximum delay between messages in ms */
const DELAY_MAX = 60_000;

/**
 * Axios instance pre-configured with Laravel API base URL and auth header.
 */
const laravelClient = axios.create({
  baseURL: LARAVEL_API_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': LARAVEL_API_KEY,
  },
});

/**
 * Returns a random integer between min (inclusive) and max (inclusive).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Shuffle an array in-place using Fisher-Yates algorithm.
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Sleep for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the WhatsApp group JID from a raw group ID.
 * Baileys expects the format: <id>@g.us
 * If the ID already contains '@', it is returned as-is.
 * @param {string} groupWaId
 * @returns {string}
 */
function toGroupJid(groupWaId) {
  return groupWaId.includes('@') ? groupWaId : `${groupWaId}@g.us`;
}

/**
 * Verify that a group exists and is accessible by fetching its metadata.
 * Returns true if the group is valid, false otherwise.
 * @param {string} jid
 * @returns {Promise<boolean>}
 */
async function isGroupValid(jid) {
  const sock = getSocket();
  if (!sock) return false;
  try {
    const meta = await sock.groupMetadata(jid);
    return !!meta?.id;
  } catch (err) {
    logger.warn({ jid, err: err.message }, 'Group metadata fetch failed — group may be invalid');
    return false;
  }
}

/**
 * Report the result of a single group send to Laravel.
 * @param {object} params
 * @param {string|number} params.message_id
 * @param {string} params.group_wa_id
 * @param {'sent'|'failed'} params.status
 * @param {string} [params.error_message]
 */
async function reportGroupResult({ message_id, group_wa_id, status, error_message }) {
  try {
    await laravelClient.post('/api/send/report', {
      message_id,
      group_wa_id,
      status,
      ...(error_message ? { error_message } : {}),
    });
    logger.debug({ message_id, group_wa_id, status }, 'Group result reported to Laravel');
  } catch (err) {
    logger.error(
      { message_id, group_wa_id, status, err: err.message },
      'Failed to report group result to Laravel',
    );
  }
}

/**
 * Report campaign completion to Laravel.
 * @param {object} params
 * @param {string|number} params.message_id
 * @param {number} params.total
 * @param {number} params.sent_count
 * @param {number} params.failed_count
 */
async function reportCampaignComplete({ message_id, total, sent_count, failed_count }) {
  try {
    await laravelClient.post('/api/send/report/complete', {
      message_id,
      total,
      sent_count,
      failed_count,
    });
    logger.info({ message_id, total, sent_count, failed_count }, 'Campaign complete reported to Laravel');
  } catch (err) {
    logger.error(
      { message_id, err: err.message },
      'Failed to report campaign completion to Laravel',
    );
  }
}

/**
 * Send a campaign message to a list of WhatsApp groups.
 *
 * The targets are shuffled before sending to randomize the order and avoid
 * detection patterns. A random delay between DELAY_MIN and DELAY_MAX ms is
 * applied between each group send.
 *
 * @param {object} payload
 * @param {string|number} payload.message_id - Internal Laravel message ID
 * @param {Array<{group_wa_id: string, language: string, content: string}>} payload.targets
 * @returns {Promise<void>}
 */
export async function sendCampaignMessage(payload) {
  const { message_id, targets } = payload;

  if (!message_id || !Array.isArray(targets) || targets.length === 0) {
    logger.error({ payload }, 'Invalid campaign payload — missing message_id or targets');
    return;
  }

  if (!isConnected()) {
    logger.error({ message_id }, 'Cannot send campaign: WhatsApp is not connected');
    // Best-effort: report all targets as failed
    for (const target of targets) {
      await reportGroupResult({
        message_id,
        group_wa_id: target.group_wa_id,
        status: 'failed',
        error_message: 'WhatsApp socket is not connected',
      });
    }
    await reportCampaignComplete({
      message_id,
      total: targets.length,
      sent_count: 0,
      failed_count: targets.length,
    });
    return;
  }

  const sock = getSocket();

  // Shuffle targets for randomisation
  const shuffled = shuffle([...targets]);

  logger.info(
    { message_id, total: shuffled.length },
    'Starting campaign send',
  );

  let sent_count = 0;
  let failed_count = 0;

  for (let i = 0; i < shuffled.length; i++) {
    const { group_wa_id, language, content } = shuffled[i];
    const jid = toGroupJid(group_wa_id);

    logger.info(
      { message_id, group_wa_id, jid, language, index: i + 1, total: shuffled.length },
      'Processing group target',
    );

    // --- Validate group ---
    const valid = await isGroupValid(jid);
    if (!valid) {
      logger.warn({ message_id, group_wa_id, jid }, 'Skipping invalid group');
      failed_count++;
      await reportGroupResult({
        message_id,
        group_wa_id,
        status: 'failed',
        error_message: 'Group not found or not accessible',
      });
      // Still apply delay to avoid rapid-fire failures
      if (i < shuffled.length - 1) {
        const delay = randomInt(DELAY_MIN, DELAY_MAX);
        logger.debug({ delay }, 'Waiting before next group (after failure)');
        await sleep(delay);
      }
      continue;
    }

    // --- Send message ---
    try {
      await sock.sendMessage(jid, { text: content });
      sent_count++;
      logger.info({ message_id, group_wa_id, jid }, 'Message sent successfully');
      await reportGroupResult({ message_id, group_wa_id, status: 'sent' });
    } catch (err) {
      failed_count++;
      const error_message = err?.message || String(err);
      logger.error({ message_id, group_wa_id, jid, err: error_message }, 'Failed to send message to group');
      await reportGroupResult({ message_id, group_wa_id, status: 'failed', error_message });
    }

    // --- Random delay before next group (skip after last) ---
    if (i < shuffled.length - 1) {
      const delay = randomInt(DELAY_MIN, DELAY_MAX);
      logger.info(
        { delay, nextIndex: i + 2, total: shuffled.length },
        `Waiting ${(delay / 1000).toFixed(1)}s before next group`,
      );
      await sleep(delay);
    }
  }

  // --- Final report ---
  await reportCampaignComplete({
    message_id,
    total: shuffled.length,
    sent_count,
    failed_count,
  });

  logger.info(
    { message_id, total: shuffled.length, sent_count, failed_count },
    'Campaign send complete',
  );
}

/**
 * Send a single test message to a WhatsApp group.
 * No report is sent to Laravel and no delay is applied.
 *
 * @param {string} group_wa_id - Raw group ID or full JID
 * @param {string} content - Message text
 * @returns {Promise<{success: boolean, jid: string, error?: string}>}
 */
export async function testSend(group_wa_id, content) {
  if (!isConnected()) {
    const error = 'WhatsApp socket is not connected';
    logger.error({ group_wa_id }, error);
    return { success: false, jid: toGroupJid(group_wa_id), error };
  }

  const sock = getSocket();
  const jid = toGroupJid(group_wa_id);

  try {
    await sock.sendMessage(jid, { text: content });
    logger.info({ group_wa_id, jid }, 'Test message sent successfully');
    return { success: true, jid };
  } catch (err) {
    const error = err?.message || String(err);
    logger.error({ group_wa_id, jid, err: error }, 'Test message failed');
    return { success: false, jid, error };
  }
}

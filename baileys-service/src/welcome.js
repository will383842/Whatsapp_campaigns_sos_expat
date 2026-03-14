import axios from 'axios';
import { getSocket, isConnected } from './whatsapp.js';
import { enqueueAsync, WELCOME_DELAY_MIN, WELCOME_DELAY_MAX } from './sendQueue.js';
import logger from './logger.js';

const LARAVEL_API_URL = process.env.LARAVEL_API_URL || 'http://localhost:8001';
const LARAVEL_API_KEY = process.env.LARAVEL_API_KEY || '';

const log = logger.child({ module: 'welcome' });

const laravelClient = axios.create({
  baseURL: LARAVEL_API_URL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': LARAVEL_API_KEY,
  },
});

/**
 * Register the group-participants.update listener on the socket.
 * Call this after each successful connection.
 *
 * NEW APPROACH: Only save members to DB. Welcome messages are sent
 * in daily batches by Laravel cron (1 message per group per day).
 *
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 */
export function registerWelcomeListener(sock) {
  sock.ev.on('group-participants.update', async (event) => {
    const groupJid = event.id; // e.g. "120363xxx@g.us"
    const groupWaId = groupJid.replace('@g.us', '');

    // Handle "add" events (new members joining)
    if (event.action === 'add') {
      for (const participantJid of event.participants) {
        const capturedJid = participantJid;
        const capturedGroupWaId = groupWaId;

        try {
          const memberName = await getMemberName(sock, capturedJid);
          const memberPhone = capturedJid.replace('@s.whatsapp.net', '');

          log.info(
            { group: capturedGroupWaId, member: memberName, phone: memberPhone },
            'New member joined group — saving to DB (batch welcome later)',
          );

          // Save member to DB — no message sending
          await laravelClient.post('/api/welcome/check', {
            group_wa_id: capturedGroupWaId,
            member_name: memberName,
            member_phone: memberPhone,
          });
        } catch (err) {
          log.error(
            { err: err.message, group: capturedGroupWaId, participant: capturedJid },
            'Failed to save new member to DB',
          );
        }
      }
    }

    // Handle "remove" events (members leaving/kicked)
    if (event.action === 'remove') {
      for (const participantJid of event.participants) {
        try {
          const memberPhone = participantJid.replace('@s.whatsapp.net', '');

          log.info({ group: groupWaId, phone: memberPhone }, 'Member left group');

          await laravelClient.post('/api/welcome/left', {
            group_wa_id: groupWaId,
            member_phone: memberPhone,
          });
        } catch (err) {
          log.error(
            { err: err.message, group: groupWaId, participant: participantJid },
            'Failed to record member departure',
          );
        }
      }
    }
  });

  log.info('Welcome listener registered (batch mode — no immediate sends)');
}

/**
 * Send a single welcome batch message to a group via the global queue.
 * Called by Laravel daily cron via /send/welcome endpoint.
 *
 * @param {string} groupWaId - Raw group ID or full JID
 * @param {string} content - Batch welcome message text
 * @returns {Promise<{success: boolean, jid: string, error?: string}>}
 */
export async function sendWelcomeBatch(groupWaId, content) {
  if (!isConnected()) {
    const error = 'WhatsApp socket is not connected';
    log.error({ groupWaId }, error);
    return { success: false, jid: toGroupJid(groupWaId), error };
  }

  const sock = getSocket();
  const jid = toGroupJid(groupWaId);

  return new Promise((resolve) => {
    enqueueAsync(async () => {
      try {
        await sock.sendMessage(jid, { text: content });
        log.info({ groupWaId, jid }, 'Welcome batch message sent');
        resolve({ success: true, jid });
      } catch (err) {
        const error = err?.message || String(err);
        log.error({ groupWaId, jid, err: error }, 'Welcome batch message failed');
        resolve({ success: false, jid, error });
      }

      // Delay between welcome batch sends
      const delay = WELCOME_DELAY_MIN + Math.floor(Math.random() * (WELCOME_DELAY_MAX - WELCOME_DELAY_MIN));
      await new Promise((r) => setTimeout(r, delay));
    }, `welcome-batch:${groupWaId}`, 'normal', 'welcome');
  });
}

/**
 * Build the WhatsApp group JID from a raw group ID.
 * @param {string} groupWaId
 * @returns {string}
 */
function toGroupJid(groupWaId) {
  return groupWaId.includes('@') ? groupWaId : `${groupWaId}@g.us`;
}

/**
 * Try to get the member's display name (push name).
 * Falls back to phone number if unavailable.
 *
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {string} jid
 * @returns {Promise<string>}
 */
async function getMemberName(sock, jid) {
  try {
    // Try to get contact info from the store
    const contact = await sock.onWhatsApp(jid);
    if (contact?.[0]?.notify) {
      return contact[0].notify;
    }
  } catch {
    // ignore
  }

  // Try status/business profile for the name
  try {
    const profile = await sock.getBusinessProfile(jid);
    if (profile?.wid) {
      return profile.wid;
    }
  } catch {
    // ignore
  }

  // Fallback: use the phone number formatted nicely
  const phone = jid.replace('@s.whatsapp.net', '');
  return '+' + phone;
}

import axios from 'axios';
import { pickNextInstance, incrementInstanceQuota } from './instanceManager.js';
import { enqueue, WELCOME_DELAY_MIN, WELCOME_DELAY_MAX } from './sendQueue.js';
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
 * Register the group-participants.update listener on a socket.
 * Each instance calls this after successful connection.
 *
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 */
export function registerWelcomeListener(sock) {
  sock.ev.on('group-participants.update', async (event) => {
    const groupJid = event.id;
    const groupWaId = groupJid.replace('@g.us', '');

    if (event.action === 'add') {
      for (const participantJid of event.participants) {
        try {
          const memberName = await getMemberName(sock, participantJid);
          const memberPhone = participantJid.replace('@s.whatsapp.net', '');

          log.info(
            { group: groupWaId, member: memberName, phone: memberPhone },
            'New member joined — saving to DB',
          );

          await laravelClient.post('/api/welcome/check', {
            group_wa_id: groupWaId,
            member_name: memberName,
            member_phone: memberPhone,
          });
        } catch (err) {
          log.error(
            { err: err.message, group: groupWaId, participant: participantJid },
            'Failed to save new member',
          );
        }
      }
    }

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

  log.info('Welcome listener registered (batch mode)');
}

/**
 * Send a single welcome batch message to a group via the global queue.
 * Uses pickNextInstance() for multi-instance rotation.
 *
 * Uses enqueue() (awaitable) instead of enqueueAsync() to avoid hanging promises.
 *
 * @param {string} groupWaId
 * @param {string} content
 * @returns {Promise<{success: boolean, jid: string, instance_slug?: string, error?: string}>}
 */
export async function sendWelcomeBatch(groupWaId, content) {
  const jid = toGroupJid(groupWaId);

  /** @type {{success: boolean, jid: string, instance_slug?: string, error?: string}} */
  let result = { success: false, jid, error: 'Unknown error' };

  try {
    await enqueue(async () => {
      const instance = pickNextInstance();
      if (!instance?.socket) {
        log.error({ groupWaId }, 'No instance available for welcome batch');
        result = { success: false, jid, error: 'No WhatsApp instance available' };
        return;
      }

      try {
        await instance.socket.sendMessage(jid, { text: content });
        incrementInstanceQuota(instance.slug);
        log.info({ groupWaId, jid, instance: instance.slug }, 'Welcome batch sent');
        result = { success: true, jid, instance_slug: instance.slug };
      } catch (err) {
        const error = err?.message || String(err);
        log.error({ groupWaId, jid, instance: instance.slug, err: error }, 'Welcome batch failed');
        result = { success: false, jid, error };
      }

      // Delay between welcome batch sends
      const delay = WELCOME_DELAY_MIN + Math.floor(Math.random() * (WELCOME_DELAY_MAX - WELCOME_DELAY_MIN));
      await new Promise((r) => setTimeout(r, delay));
    }, `welcome-batch:${groupWaId}`, 'normal', 'welcome');
  } catch (err) {
    log.error({ groupWaId, err: err.message }, 'Welcome batch enqueue failed');
    result = { success: false, jid, error: err.message };
  }

  return result;
}

function toGroupJid(groupWaId) {
  return groupWaId.includes('@') ? groupWaId : `${groupWaId}@g.us`;
}

async function getMemberName(sock, jid) {
  try {
    const contact = await sock.onWhatsApp(jid);
    if (contact?.[0]?.notify) return contact[0].notify;
  } catch { /* ignore */ }

  try {
    const profile = await sock.getBusinessProfile(jid);
    if (profile?.wid) return profile.wid;
  } catch { /* ignore */ }

  const phone = jid.replace('@s.whatsapp.net', '');
  return '+' + phone;
}

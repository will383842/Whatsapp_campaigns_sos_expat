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
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 */
export function registerWelcomeListener(sock) {
  sock.ev.on('group-participants.update', async (event) => {
    const groupJid = event.id; // e.g. "120363xxx@g.us"
    const groupWaId = groupJid.replace('@g.us', '');

    // Handle "add" events (new members joining)
    if (event.action === 'add') {
      for (const participantJid of event.participants) {
        // Each welcome message goes through the global send queue
        // to prevent 50 concurrent sends when many members join at once
        const capturedJid = participantJid;
        const capturedGroupJid = groupJid;
        const capturedGroupWaId = groupWaId;

        enqueueAsync(async () => {
          const memberName = await getMemberName(sock, capturedJid);
          const memberPhone = capturedJid.replace('@s.whatsapp.net', '');

          log.info(
            { group: capturedGroupWaId, member: memberName, phone: memberPhone },
            'New member joined group',
          );

          // Ask Laravel — also saves member to DB
          const { data } = await laravelClient.post('/api/welcome/check', {
            group_wa_id: capturedGroupWaId,
            member_name: memberName,
            member_phone: memberPhone,
          });

          if (!data.send) {
            log.debug({ group: capturedGroupWaId, reason: data.reason }, 'Welcome skipped');
            return;
          }

          // Small delay to look natural (2-5s before sending)
          const delay = WELCOME_DELAY_MIN + Math.floor(Math.random() * (WELCOME_DELAY_MAX - WELCOME_DELAY_MIN));
          await new Promise((r) => setTimeout(r, delay));

          // Send the welcome message to the group (not DM)
          if (isConnected()) {
            await sock.sendMessage(capturedGroupJid, { text: data.message });
            log.info(
              { group: capturedGroupWaId, member: memberName },
              'Welcome message sent',
            );
          }
        }, `welcome:${capturedGroupWaId}:${capturedJid}`, 'high');
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

  log.info('Welcome listener registered');
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

import logger from './logger.js';

// Telegram alert for WhatsApp disconnection
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_ALERT_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID || '7560535072';

export async function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to send Telegram alert');
  }
}

// ---------------------------------------------------------------------------
// Legacy compatibility exports — delegate to instanceManager
// ---------------------------------------------------------------------------

import {
  getDefaultInstance,
  getSocketForSlug,
  isAnyConnected,
} from './instanceManager.js';

/**
 * @deprecated Use instanceManager.getSocketForSlug() instead
 * @returns {import('@whiskeysockets/baileys').WASocket | null}
 */
export function getSocket() {
  return getSocketForSlug();
}

/**
 * @deprecated Use instanceManager.isAnyConnected() instead
 * @returns {boolean}
 */
export function isConnected() {
  return isAnyConnected();
}

/**
 * @deprecated Use instanceManager.getInstanceQr() instead
 * @returns {string | null}
 */
export function getLastQr() {
  const def = getDefaultInstance();
  return def?.lastQr || null;
}

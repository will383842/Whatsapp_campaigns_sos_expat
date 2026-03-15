import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import logger from './logger.js';
import { registerWelcomeListener } from './welcome.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', 'auth_info');

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

function clearAuthInfo() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      const files = fs.readdirSync(AUTH_DIR);
      for (const file of files) {
        fs.rmSync(path.join(AUTH_DIR, file), { force: true });
      }
      logger.info({ filesRemoved: files.length }, 'Cleared auth_info/ for fresh QR pairing');
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to clear auth_info/');
  }
}

/** @type {import('@whiskeysockets/baileys').WASocket | null} */
let sock = null;

/** @type {boolean} */
let isReconnecting = false;

/** @type {ReturnType<typeof setInterval> | null} */
let heartbeatInterval = null;

/** @type {ReturnType<typeof setInterval> | null} */
let disconnectReminderInterval = null;

/** @type {string | null} */
let lastQrCode = null;

// Reminder every 6 hours while disconnected
const REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

function startDisconnectReminder() {
  stopDisconnectReminder();
  disconnectReminderInterval = setInterval(() => {
    if (!isConnected()) {
      sendTelegramAlert(
        '⚠️ <b>Rappel : WhatsApp Campaigns toujours déconnecté !</b>\n\n' +
        '🚫 Les campagnes WhatsApp ne sont PAS envoyées.\n' +
        'Les messages planifiés s\'accumulent sans être livrés.\n\n' +
        '👉 <a href="https://whatsapp.life-expat.com/whatsapp">Scanner le QR code maintenant</a>'
      );
      logger.warn('Sent 6h disconnect reminder via Telegram');
    } else {
      stopDisconnectReminder();
    }
  }, REMINDER_INTERVAL_MS);
  logger.info('Disconnect reminder started (every 6h)');
}

function stopDisconnectReminder() {
  if (disconnectReminderInterval) {
    clearInterval(disconnectReminderInterval);
    disconnectReminderInterval = null;
  }
}

export function getLastQr() {
  return lastQrCode;
}

/**
 * Connect (or reconnect) to WhatsApp using pairing code.
 * The phone number is read from the WA_PHONE_NUMBER environment variable.
 */
export async function connectToWhatsApp() {
  const phoneNumber = process.env.WA_PHONE_NUMBER;
  if (!phoneNumber) {
    throw new Error('WA_PHONE_NUMBER is not set in environment variables');
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  logger.info({ version, isLatest }, 'Using Baileys version');

  sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.appropriate('Campaigns SOS-Expat'),
    printQRInTerminal: false,
    logger: logger.child({ module: 'baileys' }),
    markOnlineOnConnect: false,
  });

  // If not yet registered, QR code will be provided via connection.update event
  if (!sock.authState.creds.registered) {
    logger.info('Not yet registered — QR code will be available at /qr endpoint');
    console.log('\n  *** Open https://whatsapp.life-expat.com/baileys/qr to scan the QR code ***\n');
  }

  // Persist credentials on every update
  sock.ev.on('creds.update', saveCreds);

  // Handle connection lifecycle
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      lastQrCode = qr;
      logger.info('New QR code available at /qr endpoint');
    }

    if (connection === 'close') {
      const statusCode =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : undefined;

      const loggedOut = statusCode === DisconnectReason.loggedOut;

      logger.warn(
        { statusCode, loggedOut },
        'WhatsApp connection closed',
      );

      if (loggedOut) {
        logger.error('Logged out from WhatsApp — clearing session and generating new QR...');

        // Alert admin via Telegram
        sendTelegramAlert(
          '🔴 <b>WhatsApp Campaigns déconnecté !</b>\n\n' +
          'La session WhatsApp a été révoquée.\n' +
          'Un nouveau QR code est prêt à scanner.\n\n' +
          '👉 <a href="https://whatsapp.life-expat.com/whatsapp">Scanner le QR code</a>'
        );

        // Start 6h reminder loop
        startDisconnectReminder();

        // Auto-clear old credentials and reconnect to generate fresh QR
        sock = null;
        clearAuthInfo();

        setTimeout(async () => {
          try {
            await connectToWhatsApp();
            logger.info('Fresh session started — QR code available at /qr');
          } catch (err) {
            logger.error({ err: err.message }, 'Failed to start fresh session after logout');
          }
        }, 3000);
        return;
      }

      if (!isReconnecting) {
        isReconnecting = true;
        const delay = 5000;
        logger.info({ delay }, 'Scheduling reconnection...');
        setTimeout(async () => {
          isReconnecting = false;
          try {
            await connectToWhatsApp();
          } catch (err) {
            logger.error({ err }, 'Reconnection attempt failed');
          }
        }, delay);
      }
    }

    if (connection === 'open') {
      isReconnecting = false;
      logger.info(
        { user: sock?.user?.id },
        'WhatsApp connection established',
      );

      // Stop disconnect reminders
      stopDisconnectReminder();

      // Notify admin that connection is restored
      sendTelegramAlert(
        '🟢 <b>WhatsApp Campaigns reconnecté !</b>\n\n' +
        'La connexion WhatsApp est rétablie.\n' +
        'Les campagnes peuvent être envoyées normalement.'
      );

      // Register welcome message listener for new group members
      registerWelcomeListener(sock);

      // Heartbeat — check connection every 60s (clear previous to avoid stacking)
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      heartbeatInterval = setInterval(() => {
        if (!isConnected()) {
          logger.warn('Heartbeat: WhatsApp disconnected, attempting reconnect...');
          connectToWhatsApp().catch((err) => logger.error({ err: err.message }, 'Heartbeat reconnect failed'));
        }
      }, 60000);
    }

    if (connection === 'connecting') {
      logger.info('Connecting to WhatsApp...');
    }
  });

  return sock;
}

/**
 * Returns the current socket instance (may be null if disconnected).
 * @returns {import('@whiskeysockets/baileys').WASocket | null}
 */
export function getSocket() {
  return sock;
}

/**
 * Returns true if the socket is connected and authenticated.
 * @returns {boolean}
 */
export function isConnected() {
  return !!sock?.user;
}

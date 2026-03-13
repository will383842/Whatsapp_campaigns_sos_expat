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
import logger from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', 'auth_info');

/** @type {import('@whiskeysockets/baileys').WASocket | null} */
let sock = null;

/** @type {boolean} */
let isReconnecting = false;

/** @type {ReturnType<typeof setInterval> | null} */
let heartbeatInterval = null;

/** @type {string | null} */
let lastQrCode = null;

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
        logger.error(
          'Logged out from WhatsApp. Remove auth_info/ and restart to re-pair.',
        );
        // Do NOT reconnect — operator must re-pair manually
        sock = null;
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

      // Heartbeat — check connection every 60s (clear previous to avoid stacking)
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      heartbeatInterval = setInterval(() => {
        if (!isConnected()) {
          logger.warn('Heartbeat: WhatsApp disconnected, attempting reconnect...');
          connectToWhatsApp();
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

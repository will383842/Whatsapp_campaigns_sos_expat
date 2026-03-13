import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
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
    browser: ['Campaigns SOS-Expat', 'Chrome', '120.0.0'],
    printQRInTerminal: false,
    logger: logger.child({ module: 'baileys' }),
    // Recommended for campaigns: avoid marking messages as read automatically
    markOnlineOnConnect: false,
  });

  // Request pairing code if not yet registered
  if (!sock.authState.creds.registered) {
    // Small delay to ensure the socket is ready
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const code = await sock.requestPairingCode(phoneNumber);
    logger.info({ code }, 'Pairing code — enter this in WhatsApp on your phone');
    console.log(`\n  *** PAIRING CODE: ${code} ***\n`);
  }

  // Persist credentials on every update
  sock.ev.on('creds.update', saveCreds);

  // Handle connection lifecycle
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.warn('QR code received (pairing code was not used in time). Reconnecting...');
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

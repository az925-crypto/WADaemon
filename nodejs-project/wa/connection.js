import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
} from 'baileys';
import pino from 'pino';
import { setStatus } from './state.js';

const logger = pino({ level: 'silent' });

// Pola inti diport dari ~/bot src/wa/connection.js + reconnect src/index.js:
// - requestPairingCode HANYA saat event qr datang + guard pairingRequested
//   (minta sebelum itu = kode ditolak HP)
// - browser wajib standar (custom user-agent di-reject saat pairing)
// - loggedOut -> stop, jangan reconnect; 515 restartRequired -> 1.5 dtk;
//   selain itu -> 5 dtk.
export async function createCore({ sessionDir, getPhoneNumber }) {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let version;
  try {
    version = (await fetchLatestBaileysVersion()).version;
  } catch {
    version = undefined; // pakai bawaan lib
  }

  let sock = null;
  let pairingRequested = false;
  let stopped = false;

  async function connect() {
    if (stopped) return;
    sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !state.creds.registered && !pairingRequested) {
        pairingRequested = true;
        const phone = getPhoneNumber();
        if (phone) {
          try {
            const code = await sock.requestPairingCode(phone);
            setStatus({ status: 'pairing', code: String(code || '').replace(/\s/g, ''), phoneNumber: phone });
          } catch (e) {
            pairingRequested = false; // boleh coba lagi di qr berikutnya
            setStatus({ status: 'disconnected', lastError: e?.message || String(e) });
          }
        } else {
          pairingRequested = false;
          setStatus({ status: 'unpaired' });
        }
      }

      if (connection === 'open') {
        setStatus({ status: 'connected', code: null, lastConnectedAt: Date.now(), lastError: null });
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          stopped = true;
          setStatus({ status: 'logged_out', code: null });
          return;
        }
        setStatus({ status: 'disconnected', code: null });
        if (code === DisconnectReason.restartRequired) {
          setTimeout(connect, 1500);
        } else {
          setTimeout(connect, 5000);
        }
      }
    });
  }

  await connect();

  return {
    getSock: () => sock,
    // Dipanggil POST /pair: set nomor lalu paksa siklus pairing ulang.
    async requestPair() {
      pairingRequested = false;
      if (sock) {
        try { sock.ev.flush?.(); } catch {}
      }
    },
    stop() { stopped = true; },
  };
}

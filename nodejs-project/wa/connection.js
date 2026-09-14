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
// - nodejs-mobile: 1 instance Node per proses, tapi socket WA boleh
//   di-end + connect ulang (yang tidak boleh restart adalah runtime Node).
export async function createCore({ sessionDir, getPhoneNumber, onMessage }) {
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
  let connectTimer = null;
  // Generasi koneksi: close-handler basi dari socket lama (yang di-end saat
  // requestPair/stop) tidak boleh menimpa status socket baru.
  let gen = 0;

  function scheduleReconnect(ms) {
    if (stopped) return;
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = setTimeout(() => { connectTimer = null; connect(); }, ms);
  }

  async function connect() {
    if (stopped) return;
    const my = ++gen;
    sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: true,
    });

    sock.ev.on('creds.update', saveCreds);

    if (onMessage) {
      sock.ev.on('messages.upsert', (data) => {
        try { onMessage(sock, data); } catch {}
      });
    }

    sock.ev.on('connection.update', async (update) => {
      if (my !== gen) return; // event basi dari socket yang sudah diganti
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
        // Catat nomor sesi dari sock.user agar guard /pair same-phone dan
        // UI tetap benar walau konek via auto-connect (tanpa /pair dulu).
        const me = String(sock?.user?.id || '').split(':')[0].split('@')[0].replace(/\D/g, '');
        setStatus({
          status: 'connected', code: null, lastConnectedAt: Date.now(), lastError: null,
          ...(me ? { phoneNumber: me } : {}),
        });
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          stopped = true;
          setStatus({ status: 'logged_out', code: null });
          return;
        }
        if (stopped) return;
        setStatus({ status: 'disconnected', code: null });
        if (code === DisconnectReason.restartRequired) {
          scheduleReconnect(1500);
        } else {
          scheduleReconnect(5000);
        }
      }
    });
  }

  await connect();

  return {
    getSock: () => sock,
    // Dipanggil POST /pair: reset guard lalu paksa siklus koneksi baru agar
    // event qr segar datang dan kode baru diminta (bukan menunggu qr lama
    // yang mungkin tidak akan datang lagi).
    async requestPair() {
      stopped = false;
      pairingRequested = false;
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      const old = sock;
      sock = null;
      gen++; // batalkan handler close basi milik socket lama
      try { old?.end?.(); } catch {}
      try { old?.ws?.close?.(); } catch {}
      await connect();
    },
    stop() {
      stopped = true;
      gen++; // batalkan semua handler/timeout yang masih pending
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      const old = sock;
      sock = null;
      try { old?.end?.(); } catch {}
      try { old?.ws?.close?.(); } catch {}
    },
  };
}

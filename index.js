require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@adiwajshing/baileys');

const app = express();
app.use(express.json());

const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);

// In-memory map: sessionId → sock
const sessions = new Map();

function getSessionPath(id) {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

async function startSession(id, res) {
  const authFile = getSessionPath(id);
  const { state, saveState } = useSingleFileAuthState(authFile);
  const sock = makeWASocket({ auth: state });
  sessions.set(id, sock);
  sock.ev.on('creds.update', saveState);
  sock.ev.on('connection.update', up => {
    const { connection, qr } = up;
    if (qr) res.json({ qr });
    if (connection === 'open') {
      res.json({ status: 'connected' });
    }
  });
}

app.post('/sessions/:id', (req, res) => {
  const id = req.params.id;
  if (sessions.has(id)) return res.status(400).json({ error: 'Session already exists' });
  startSession(id, res).catch(err => res.status(500).json({ error: err.message }));
});

app.get('/sessions/:id/status', (req, res) => {
  const sock = sessions.get(req.params.id);
  if (!sock) return res.json({ status: 'NOTFOUND' });
  res.json({ status: sock.user ? 'CONNECTED' : 'CREATING' });
});

app.post('/sessions/:id/send', async (req, res) => {
  const sock = sessions.get(req.params.id);
  if (!sock) return res.status(404).json({ error: 'Session not found' });
  const { to, message } = req.body;
  await sock.sendMessage(to + '@s.whatsapp.net', { text: message });
  res.json({ success: true });
});

app.delete('/sessions/:id', async (req, res) => {
  const sock = sessions.get(req.params.id);
  if (!sock) return res.status(404).json({ error: 'Session not found' });
  await sock.logout();
  sessions.delete(req.params.id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));

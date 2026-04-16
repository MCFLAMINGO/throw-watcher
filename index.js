const express   = require('express');
const cors      = require('cors');
const campaigns = require('./campaigns');
const { router: watcherRouter, startWatcher } = require('./watcher');
const authRouter = require('./auth');

const app  = express();
const PORT = process.env.PORT || 8080;

app.use(cors({
  origin: [
    'https://throw5onit.com',
    'https://www.throw5onit.com',
    'https://gsb-swarm-dashboard.vercel.app',
    'https://swarm-deploy-throw.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
  ],
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, service: 'throw-watcher', ts: new Date().toISOString() }));

/* ── Ad Campaigns ── */
app.get('/throw-watcher/campaigns', (_req, res) => {
  res.json(campaigns.getAll());
});

app.post('/throw-watcher/campaigns', (req, res) => {
  const c = campaigns.create(req.body);
  res.status(201).json(c);
});

app.put('/throw-watcher/campaigns/:id', (req, res) => {
  const c = campaigns.update(req.params.id, req.body);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});

app.delete('/throw-watcher/campaigns/:id', (req, res) => {
  const ok = campaigns.remove(req.params.id);
  res.json({ ok });
});

app.post('/throw-watcher/campaigns/:id/impression', (req, res) => {
  campaigns.recordImpression(req.params.id);
  res.json({ ok: true });
});

/* ── Broadcast push ── */
app.post('/throw-watcher/broadcast', async (req, res) => {
  const { title, body } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });
  try {
    const { sendPush, buildThrowPayload } = require('./push');
    const { getAddresses, getEntry } = require('./registry');
    const addrs = getAddresses();
    let sent = 0;
    for (const addr of addrs) {
      const entry = getEntry(addr);
      if (entry && entry.subscription) {
        const payload = JSON.stringify({ title, body, icon: '/icon-192.png', url: 'https://throw5onit.com' });
        try { await sendPush(entry.subscription, payload); sent++; } catch(_) {}
      }
    }
    res.json({ ok: true, sent, total: addrs.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
app.use('/throw-watcher', watcherRouter);
app.use('/auth', authRouter);

app.listen(PORT, () => {
  console.log(`[throw-watcher] listening on :${PORT}`);
  startWatcher();
});

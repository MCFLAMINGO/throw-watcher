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
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, service: 'throw-watcher', ts: new Date().toISOString() }));

/* ── Ad Campaigns ── */
app.get('/throw-watcher/campaigns', async (_req, res) => {
  try { res.json(await campaigns.getAll()); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/throw-watcher/campaigns', async (req, res) => {
  try {
    const c = await campaigns.create(req.body);
    res.status(201).json(c);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/throw-watcher/campaigns/:id', async (req, res) => {
  try {
    const c = await campaigns.update(req.params.id, req.body);
    if (!c) return res.status(404).json({ error: 'not found' });
    res.json(c);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/throw-watcher/campaigns/:id', async (req, res) => {
  try {
    const ok = await campaigns.remove(req.params.id);
    res.json({ ok });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/throw-watcher/campaigns/:id/impression', async (req, res) => {
  try {
    await campaigns.recordImpression(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ── MQTT Sponsor Push (retained — every new THROW load picks it up) ── */
app.post('/throw-watcher/sponsor-push', async (req, res) => {
  const { sponsor, sponsors } = req.body || {};
  if (!sponsor) return res.status(400).json({ error: 'sponsor required' });
  try {
    // Publish retained MQTT message to throw/sponsor
    // We use the mqtt npm package if available, otherwise log and return ok
    let published = false;
    try {
      const mqtt = require('mqtt');
      const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
        clientId: 'throw-watcher-push-' + Date.now(),
        connectTimeout: 5000,
      });
      await new Promise((resolve, reject) => {
        client.on('connect', () => {
          const payload = JSON.stringify({ sponsor, sponsors: sponsors || [sponsor], pushedAt: new Date().toISOString() });
          client.publish('throw/sponsor', payload, { qos: 1, retain: true }, (err) => {
            client.end();
            if (err) reject(err); else resolve(undefined);
          });
        });
        client.on('error', reject);
        setTimeout(() => reject(new Error('MQTT timeout')), 6000);
      });
      published = true;
    } catch (mqttErr) {
      console.warn('[sponsor-push] MQTT not available or failed:', mqttErr.message);
    }
    res.json({ ok: true, published, sponsor: sponsor.name });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
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

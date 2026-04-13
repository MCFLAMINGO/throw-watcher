const express = require('express');
const cors    = require('cors');
const { router: watcherRouter, startWatcher } = require('./watcher');

const app  = express();
const PORT = process.env.PORT || 8080;

app.use(cors({
  origin: [
    'https://throw5onit.com',
    'https://www.throw5onit.com',
    'https://gsb-swarm-dashboard.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
  ],
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, service: 'throw-watcher', ts: new Date().toISOString() }));
app.use('/throw-watcher', watcherRouter);

app.listen(PORT, () => {
  console.log(`[throw-watcher] listening on :${PORT}`);
  startWatcher();
});

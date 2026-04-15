const express  = require('express');
const { registerWallet, getEntry, getHandle, getSize, getAddresses } = require('./registry');
const { sendPush, buildThrowPayload, buildSentPayload, buildTestPayload, getVapidPublicKey } = require('./push');
const { recordThrow, setBlock, setStatus, getStatus, getHistory } = require('./stats');

// ─── Constants (mirror throw5onit app.js) ───────────────────────────────────
const TEMPO_RPC    = process.env.TEMPO_RPC    || 'https://tempo-mainnet.core.chainstack.com/b6e3587d839ae0350e2a75f3aac441b2';
const PATHUSD_ADDR = '0x20c0000000000000000000000000000000000000';
const USDC_ADDR    = '0x20c000000000000000000000b9537d11c60e8b50';
const TREASURY_ADDR = (process.env.TREASURY_ADDR || '0x0000000000000000000000000000000000000001').toLowerCase();

// Transfer(address,address,uint256) — keccak256
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const POLL_INTERVAL_MS = 10_000;

// ─── RPC helpers ────────────────────────────────────────────────────────────
async function rpc(method, params = []) {
  const res = await fetch(TEMPO_RPC, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

function hexToDecimal(hex) {
  return BigInt(hex);
}

function decodeAddress(topic) {
  // topics[1]/topics[2] = 32-byte padded address
  return '0x' + topic.slice(-40);
}

function decodeAmount(hex, decimals = 6) {
  const raw = BigInt(hex);
  return Number(raw) / 10 ** decimals;
}

function guessToken(contractAddr) {
  const lo = contractAddr.toLowerCase();
  if (lo === USDC_ADDR.toLowerCase()) return 'USDC.e';
  if (lo === PATHUSD_ADDR.toLowerCase()) return 'pathUSD';
  return 'TOKEN';
}

// ─── Watcher loop ────────────────────────────────────────────────────────────
let lastBlock = 0;

async function pollOnce() {
  try {
    const latestHex = await rpc('eth_blockNumber', []);
    const latest    = Number(BigInt(latestHex));

    if (lastBlock === 0) {
      lastBlock = Math.max(0, latest - 10);
    }

    if (latest <= lastBlock) return;

    const fromBlock = '0x' + (lastBlock + 1).toString(16);
    const toBlock   = '0x' + latest.toString(16);

    const logs = await rpc('eth_getLogs', [{
      address:   [USDC_ADDR, PATHUSD_ADDR],
      topics:    [TRANSFER_TOPIC],
      fromBlock,
      toBlock,
    }]);

    for (const log of logs) {
      const from   = decodeAddress(log.topics[1]);
      const to     = decodeAddress(log.topics[2]);
      const amount = decodeAmount(log.data);
      const token  = guessToken(log.address);
      const txHash = log.transactionHash;
      const blockN = Number(BigInt(log.blockNumber));
      const ts     = new Date().toISOString();

      // Skip treasury fee transfers
      if (to.toLowerCase() === TREASURY_ADDR) continue;

      const fromHandle = getHandle(from);
      const toHandle   = getHandle(to);

      recordThrow({ from, to, fromHandle, toHandle, amount, token, txHash, blockNumber: blockN, ts });

      // Push to recipient — incoming throw
      const toEntry = getEntry(to);
      if (toEntry && toEntry.subscription) {
        await sendPush(toEntry.subscription, buildThrowPayload({ amount, token, fromHandle }));
        console.log(`[watcher] push → recipient ${toHandle} ($${amount} ${token})`);
      }

      // Push to sender — on-chain confirmation
      const fromEntry = getEntry(from);
      if (fromEntry && fromEntry.subscription) {
        await sendPush(fromEntry.subscription, buildSentPayload({ amount, token, toHandle }));
        console.log(`[watcher] push → sender ${fromHandle} (confirmed $${amount} ${token})`);
      }
    }

    lastBlock = latest;
    setBlock(latest);
    setStatus('active');
  } catch (e) {
    console.error('[watcher] poll error:', e.message);
    setStatus('error');
  }
}

function startWatcher() {
  console.log('[watcher] starting — polling every 10s');
  setStatus('idle');
  // First poll slightly delayed
  setTimeout(pollOnce, 2000);
  setInterval(pollOnce, POLL_INTERVAL_MS);
}

// ─── Express router ──────────────────────────────────────────────────────────
const router = express.Router();

// POST /throw-watcher/register
router.post('/register', (req, res) => {
  const { address, subscription, handle } = req.body || {};
  if (!address || !subscription) {
    return res.status(400).json({ error: 'address and subscription required' });
  }
  registerWallet(address, subscription, handle || '');
  res.json({ ok: true });
});

// GET /throw-watcher/status
router.get('/status', (_req, res) => {
  res.json(getStatus(getSize(), getAddresses()));
});

// GET /throw-watcher/throws
router.get('/throws', (_req, res) => {
  res.json(getHistory());
});

// POST /throw-watcher/test-push
router.post('/test-push', async (req, res) => {
  const { address } = req.body || {};
  if (!address) return res.status(400).json({ error: 'address required' });
  const entry = getEntry(address);
  if (!entry) return res.status(404).json({ error: 'address not registered' });
  const ok = await sendPush(entry.subscription, buildTestPayload());
  res.json({ ok });
});

// GET /throw-watcher/vapid-public-key
router.get('/vapid-public-key', (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) return res.status(503).json({ error: 'VAPID not configured' });
  res.json({ vapidPublicKey: key });
});

module.exports = { router, startWatcher };

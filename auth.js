/**
 * THROW — Magic Link Auth
 *
 * We are a channel only. We do NOT store wallet keys or any financial data.
 * Email is used solely to send the sign-in link and as a support contact.
 *
 * Flow:
 *   POST /auth/request  { email }     → sends magic link via Resend
 *   GET  /auth/verify?token=XXX       → validates token → returns { jwt, email }
 *   POST /auth/signout  { jwt }       → invalidates session token (client clears local data)
 */

const express  = require('express');
const crypto   = require('crypto');
const router   = express.Router();

const pendingTokens = new Map(); // token → { email, expires }
const sessions      = new Map(); // jwt   → { email, expires }

const TOKEN_TTL   = 15 * 60 * 1000;       // 15 min
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

const SERVER_SECRET  = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const APP_URL        = process.env.APP_URL || 'https://throw5onit.com';
const FROM_EMAIL     = 'support@throw5onit.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// ── Helpers ────────────────────────────────────────────────────────────────

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

function makeJWT(email) {
  const payload = Buffer.from(JSON.stringify({
    email,
    exp: Date.now() + SESSION_TTL,
    iat: Date.now(),
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', SERVER_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyJWT(token) {
  try {
    const [payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SERVER_SECRET).update(payload).digest('base64url');
    if (sig !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

async function sendMagicLink(email, token) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');

  const link = `${APP_URL}?auth=${token}`;

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0a0a;color:#fff;border-radius:12px">
      <div style="font-size:2rem;font-weight:900;letter-spacing:-0.03em;margin-bottom:8px">THROW</div>
      <p style="color:#aaa;margin:0 0 24px">Digital cash. No login. Throw it like you mean it.</p>
      <a href="${link}"
         style="display:inline-block;background:#c0392b;color:#fff;font-weight:700;font-size:1.1rem;padding:16px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.02em">
        Open THROW →
      </a>
      <p style="color:#555;font-size:0.8rem;margin-top:24px">
        Link expires in 15 minutes. If you didn't request this, ignore it.<br/>
        Your wallet key lives on your device only — THROW never stores it.
      </p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from: `THROW <${FROM_EMAIL}>`, to: [email], subject: 'Your THROW sign-in link', html }),
  });

  if (!res.ok) throw new Error(`Resend: ${await res.text()}`);
}

// ── Routes ─────────────────────────────────────────────────────────────────

// POST /auth/request  { email }
router.post('/request', async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const token = makeToken();
  pendingTokens.set(token, { email, expires: Date.now() + TOKEN_TTL });

  // Prune expired tokens
  for (const [t, v] of pendingTokens) {
    if (v.expires < Date.now()) pendingTokens.delete(t);
  }

  try {
    await sendMagicLink(email, token);
    res.json({ ok: true });
  } catch (e) {
    console.error('[auth] sendMagicLink failed:', e.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// GET /auth/verify?token=XXX
// Returns identity only — no keys, no wallet data
router.get('/verify', (req, res) => {
  const token = req.query.token;
  const entry = pendingTokens.get(token);

  if (!entry || entry.expires < Date.now()) {
    return res.status(401).json({ error: 'Invalid or expired link' });
  }

  pendingTokens.delete(token);
  const jwt = makeJWT(entry.email);
  sessions.set(jwt, { email: entry.email, expires: Date.now() + SESSION_TTL });

  // Identity confirmation only — wallet key is on the device
  res.json({ ok: true, jwt, email: entry.email });
});

// POST /auth/signout  { jwt }
router.post('/signout', (req, res) => {
  sessions.delete(req.body.jwt);
  res.json({ ok: true });
});

module.exports = router;

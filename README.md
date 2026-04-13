# THROW Watcher

Node.js/Express service that watches the Tempo chain for ERC-20 Transfer events and sends Web Push notifications to registered THROW wallets.

## Setup

### 1. Generate VAPID keys (once)
```bash
npx web-push generate-vapid-keys
```
Store the output as Railway env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`

### 2. Deploy to Railway
- Create a new service in your Railway project
- Connect this repo (or the `throw-watcher/` directory)
- Set environment variables from `.env.example`
- Railway auto-detects Node.js via `package.json`

### 3. Point the THROW PWA at the watcher
In `app.js`, set:
```js
const WATCHER_URL = 'https://your-railway-service.up.railway.app';
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /throw-watcher/vapid-public-key | Returns VAPID public key for PWA subscription |
| POST | /throw-watcher/register | Register wallet + push subscription |
| GET | /throw-watcher/status | Live stats for swarm dashboard |
| GET | /throw-watcher/throws | Throw history (last 100) |
| POST | /throw-watcher/test-push | Send test push to a registered address |

## Architecture

One instance handles ~100K registered wallets. Polls Tempo `eth_getLogs` every 10s for Transfer events on USDC.e + pathUSD. Bottleneck is Chainstack RPC tier — not the Node.js process.

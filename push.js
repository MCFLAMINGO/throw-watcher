const webPush = require('web-push');

let initialized = false;

function initPush() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID keys not set — Web Push disabled');
    return;
  }
  try {
    webPush.setVapidDetails(
      VAPID_SUBJECT || 'mailto:erik@mcflamingo.com',
      VAPID_PUBLIC_KEY.trim(),
      VAPID_PRIVATE_KEY.trim()
    );
    initialized = true;
    console.log('[push] VAPID initialized');
  } catch (e) {
    console.error('[push] VAPID init failed — check key format:', e.message);
    console.error('[push] Web Push disabled — service will still run');
  }
}

async function sendPush(subscription, payload) {
  if (!initialized) {
    console.warn('[push] skipping — VAPID not initialized');
    return false;
  }
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (e) {
    console.error('[push] sendNotification error:', e.statusCode, e.message);
    return false;
  }
}

function buildThrowPayload({ amount, token, fromHandle }) {
  const amtStr = Number(amount).toFixed(2);
  return {
    title: `💸 $${amtStr} thrown to you!`,
    body:  `${fromHandle} threw you $${amtStr} ${token} — open THROW to see your balance`,
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    data:  { url: 'https://throw5onit.com' },
  };
}

function buildSentPayload({ amount, token, toHandle }) {
  const amtStr = Number(amount).toFixed(2);
  return {
    title: `✅ $${amtStr} landed!`,
    body:  `Your throw to ${toHandle} hit the chain — $${amtStr} ${token} confirmed`,
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    data:  { url: 'https://throw5onit.com' },
  };
}

function buildTestPayload() {
  return {
    title: '🎯 THROW Watcher test',
    body:  'Web Push is working — you\'re registered for THROW notifications!',
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    data:  { url: 'https://throw5onit.com' },
  };
}

function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

initPush();

module.exports = { sendPush, buildThrowPayload, buildSentPayload, buildTestPayload, getVapidPublicKey };

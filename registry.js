const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'registry.json');

// Map: address.toLowerCase() → { subscription, handle, registeredAt }
const registry = new Map();

// Load persisted data on startup
function loadRegistry() {
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      for (const [addr, data] of Object.entries(raw)) {
        registry.set(addr, data);
      }
      console.log(`[registry] loaded ${registry.size} wallets`);
    }
  } catch (e) {
    console.error('[registry] load error:', e.message);
  }
}

function saveRegistry() {
  try {
    const obj = Object.fromEntries(registry);
    fs.writeFileSync(FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('[registry] save error:', e.message);
  }
}

function registerWallet(address, subscription, handle) {
  const key = address.toLowerCase();
  registry.set(key, {
    subscription,
    handle: handle || key.slice(0, 6),
    registeredAt: new Date().toISOString(),
  });
  saveRegistry();
  console.log(`[registry] registered ${handle || key.slice(0,6)} (${key.slice(0,10)}…)`);
}

function getEntry(address) {
  return registry.get(address.toLowerCase()) || null;
}

function getHandle(address) {
  const e = getEntry(address);
  return e ? e.handle : address.slice(0, 6);
}

function getSize() {
  return registry.size;
}

loadRegistry();

module.exports = { registerWallet, getEntry, getHandle, getSize };

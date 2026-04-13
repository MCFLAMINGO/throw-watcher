// In-memory stats + throw history
const history = []; // capped at 500, newest first
const MAX_HISTORY = 500;

let throwsToday   = 0;
let throwsTotal   = 0;
let volumeToday   = 0;
let volumeTotal   = 0;
let lastThrowAt   = null;
let lastBlockChecked = 0;
let lastPollAt    = null;
let watcherStatus = 'idle';
let dayKey        = todayKey();

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function maybeResetDaily() {
  const k = todayKey();
  if (k !== dayKey) {
    throwsToday = 0;
    volumeToday = 0;
    dayKey      = k;
  }
}

function recordThrow({ from, to, fromHandle, toHandle, amount, token, txHash, blockNumber, ts }) {
  maybeResetDaily();
  const usd = parseFloat(amount) || 0;
  throwsToday++;
  throwsTotal++;
  volumeToday += usd;
  volumeTotal += usd;
  lastThrowAt = ts || new Date().toISOString();

  const entry = { from, to, fromHandle, toHandle, amount, token, txHash, blockNumber, ts: lastThrowAt };
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
}

function setBlock(n) {
  lastBlockChecked = n;
  lastPollAt = new Date().toISOString();
}

function setStatus(s) {
  watcherStatus = s;
}

function getStatus(registeredWallets, registeredAddresses) {
  maybeResetDaily();
  return {
    watcherStatus,
    registeredWallets,
    registeredAddresses: registeredAddresses || [],
    throwsToday,
    throwsTotal,
    volumeToday:  parseFloat(volumeToday.toFixed(2)),
    volumeTotal:  parseFloat(volumeTotal.toFixed(2)),
    lastThrowAt,
    lastBlockChecked,
    lastPollAt,
    recentThrows: history.slice(0, 20),
  };
}

function getHistory() {
  return history.slice(0, 100);
}

module.exports = { recordThrow, setBlock, setStatus, getStatus, getHistory };

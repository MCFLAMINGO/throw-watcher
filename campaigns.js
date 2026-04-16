const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, 'campaigns.json');
let campaigns = [];

function load() {
  try {
    if (fs.existsSync(FILE)) campaigns = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch(_) { campaigns = []; }
}
function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(campaigns, null, 2)); } catch(_) {}
}

load();

function getAll()      { return campaigns; }
function getActive()   { return campaigns.filter(c => c.status === 'active'); }
function getById(id)   { return campaigns.find(c => c.id === id); }

function create(data) {
  const c = {
    id:         crypto.randomBytes(8).toString('hex'),
    advertiser: data.advertiser || 'Unknown',
    budget:     parseFloat(data.budget)   || 0,
    cpm:        parseFloat(data.cpm)      || 0,
    copy:       (data.copy || '').slice(0, 120),
    imageUrl:   data.imageUrl || '',
    target:     data.target   || 'all',
    startDate:  data.startDate || '',
    endDate:    data.endDate   || '',
    status:     data.status    || 'active',
    impressions: 0,
    createdAt:  new Date().toISOString(),
  };
  campaigns.push(c);
  save();
  return c;
}

function update(id, patch) {
  const idx = campaigns.findIndex(c => c.id === id);
  if (idx === -1) return null;
  campaigns[idx] = { ...campaigns[idx], ...patch };
  save();
  return campaigns[idx];
}

function remove(id) {
  const before = campaigns.length;
  campaigns = campaigns.filter(c => c.id !== id);
  if (campaigns.length < before) { save(); return true; }
  return false;
}

function recordImpression(id) {
  const c = campaigns.find(c => c.id === id);
  if (c) { c.impressions = (c.impressions || 0) + 1; save(); }
}

module.exports = { getAll, getActive, getById, create, update, remove, recordImpression };

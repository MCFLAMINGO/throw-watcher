'use strict';
/**
 * campaigns.js — Postgres-backed campaign store
 * Uses the same LOCAL_INTEL_DB_URL as gsb-swarm.
 * Table: throw_campaigns (auto-created on first use)
 */

const { Pool } = require('pg');
const crypto = require('crypto');

let _pool = null;
function getPool() {
  if (!_pool) {
    const url = process.env.LOCAL_INTEL_DB_URL;
    if (!url) throw new Error('LOCAL_INTEL_DB_URL not set');
    _pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    });
    _pool.on('error', err => console.error('[campaigns] pool error:', err.message));
  }
  return _pool;
}

async function db(sql, params = []) {
  const res = await getPool().query(sql, params);
  return res.rows;
}

// ── Boot: ensure table exists ─────────────────────────────────────────────────
async function ensureTable() {
  await db(`
    CREATE TABLE IF NOT EXISTS throw_campaigns (
      id           TEXT PRIMARY KEY,
      advertiser   TEXT NOT NULL DEFAULT 'Unknown',
      budget       NUMERIC(12,2) DEFAULT 0,
      cpm          NUMERIC(10,4) DEFAULT 0,
      copy         TEXT DEFAULT '',
      image_url    TEXT DEFAULT '',
      target       TEXT DEFAULT 'all',
      start_date   TEXT DEFAULT '',
      end_date     TEXT DEFAULT '',
      status       TEXT DEFAULT 'active',
      impressions  INTEGER DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[campaigns] table ready');
}

ensureTable().catch(e => console.error('[campaigns] ensureTable failed:', e.message));

// ── CRUD ──────────────────────────────────────────────────────────────────────

function rowToObj(r) {
  return {
    id:          r.id,
    advertiser:  r.advertiser,
    budget:      parseFloat(r.budget),
    cpm:         parseFloat(r.cpm),
    copy:        r.copy,
    imageUrl:    r.image_url,
    target:      r.target,
    startDate:   r.start_date,
    endDate:     r.end_date,
    status:      r.status,
    impressions: r.impressions,
    createdAt:   r.created_at,
  };
}

async function getAll() {
  const rows = await db('SELECT * FROM throw_campaigns ORDER BY created_at DESC');
  return rows.map(rowToObj);
}

async function getActive() {
  const rows = await db("SELECT * FROM throw_campaigns WHERE status = 'active' ORDER BY created_at DESC");
  return rows.map(rowToObj);
}

async function getById(id) {
  const rows = await db('SELECT * FROM throw_campaigns WHERE id = $1', [id]);
  return rows[0] ? rowToObj(rows[0]) : null;
}

async function create(data) {
  const id = crypto.randomBytes(8).toString('hex');
  const rows = await db(
    `INSERT INTO throw_campaigns (id, advertiser, budget, cpm, copy, image_url, target, start_date, end_date, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      id,
      data.advertiser || 'Unknown',
      parseFloat(data.budget) || 0,
      parseFloat(data.cpm) || 0,
      (data.copy || '').slice(0, 120),
      data.imageUrl || '',
      data.target || 'all',
      data.startDate || '',
      data.endDate || '',
      data.status || 'active',
    ]
  );
  return rowToObj(rows[0]);
}

async function update(id, patch) {
  const fields = [];
  const vals   = [];
  let   i      = 1;
  const map = {
    advertiser: 'advertiser', budget: 'budget', cpm: 'cpm',
    copy: 'copy', imageUrl: 'image_url', target: 'target',
    startDate: 'start_date', endDate: 'end_date', status: 'status',
  };
  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = $${i++}`);
      vals.push(patch[key]);
    }
  }
  if (!fields.length) return getById(id);
  vals.push(id);
  const rows = await db(
    `UPDATE throw_campaigns SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  return rows[0] ? rowToObj(rows[0]) : null;
}

async function remove(id) {
  const rows = await db('DELETE FROM throw_campaigns WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

async function recordImpression(id) {
  await db('UPDATE throw_campaigns SET impressions = impressions + 1 WHERE id = $1', [id]);
}

module.exports = { getAll, getActive, getById, create, update, remove, recordImpression };

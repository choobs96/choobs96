// SQLite storage using Node's built-in node:sqlite (Node 22.13+). One file, no dependencies.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_FX } from '../public/shared/money.js';

const J = v => v === undefined ? null : JSON.stringify(v);
const P = s => { if (s === null || s === undefined) return undefined; try { return JSON.parse(s); } catch { return undefined; } };

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS holdings (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS holdings_account ON holdings(account_id);
    CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, date TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS tx_account_date ON transactions(account_id, date);
    CREATE TABLE IF NOT EXISTS realized (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS snapshots (date TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS overrides (key TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  return new Store(db);
}

export class Store {
  constructor(db) { this.db = db; }
  tx(fn) { this.db.exec('BEGIN'); try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }

  // ---- settings ----
  getSettings() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all();
    const s = Object.fromEntries(rows.map(r => [r.key, P(r.value)]));
    return { base: 'AUD', ...s, fx: { ...DEFAULT_FX, ...(s.fx || {}), ...(s.fxOverrides || {}) } };
  }
  setSetting(key, value) { this.db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, J(value)); }

  // ---- accounts ----
  accounts() { return this.db.prepare('SELECT data FROM accounts').all().map(r => P(r.data)); }
  account(id) { const r = this.db.prepare('SELECT data FROM accounts WHERE id = ?').get(id); return r ? P(r.data) : null; }
  putAccount(a) { this.db.prepare('INSERT INTO accounts(id, data) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(a.id, J(a)); return a; }
  patchAccount(id, patch) { const a = this.account(id); if (!a) return null; return this.putAccount({ ...a, ...patch, id }); }
  deleteAccount(id) {
    this.tx(() => {
      for (const t of ['holdings', 'transactions', 'realized']) this.db.prepare(`DELETE FROM ${t} WHERE account_id = ?`).run(id);
      this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    });
  }

  // ---- holdings: replaced wholesale per account on each sync/import ----
  holdings() {
    const ov = Object.fromEntries(this.db.prepare('SELECT key, data FROM overrides').all().map(r => [r.key, P(r.data)]));
    return this.db.prepare('SELECT data FROM holdings').all().map(r => P(r.data)).map(h => ({ ...h, ...(ov[overrideKey(h)] || {}) }));
  }
  replaceHoldings(accountId, list) {
    this.tx(() => {
      this.db.prepare('DELETE FROM holdings WHERE account_id = ?').run(accountId);
      const ins = this.db.prepare('INSERT INTO holdings(id, account_id, data) VALUES(?, ?, ?)');
      list.forEach((h, i) => { const id = h.id || `${accountId}:${h.symbol || 'x'}:${h.sub || ''}:${i}`; ins.run(id, accountId, J({ ...h, id, accountId })); });
    });
  }
  setCashBalance(accountId, ccy, amount, name) {
    const keep = this.db.prepare('SELECT data FROM holdings WHERE account_id = ?').all().map(r => P(r.data)).filter(h => !(h.cls === 'cash' && h.ccy === ccy));
    this.replaceHoldings(accountId, [...keep, { symbol: ccy, name: name || `Balance (${ccy})`, cls: 'cash', ccy, value: amount }]);
  }
  /** User-entered average cost (e.g. Binance, wallets) survives re-syncs. */
  setOverride(holding, patch) {
    const k = overrideKey(holding);
    const cur = P(this.db.prepare('SELECT data FROM overrides WHERE key = ?').get(k)?.data) || {};
    const next = { ...cur, ...patch };
    for (const key of Object.keys(next)) if (next[key] === null) delete next[key];
    if (Object.keys(next).length) this.db.prepare('INSERT INTO overrides(key, data) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data').run(k, J(next));
    else this.db.prepare('DELETE FROM overrides WHERE key = ?').run(k);
  }
  holding(id) { const r = this.db.prepare('SELECT data FROM holdings WHERE id = ?').get(id); return r ? P(r.data) : null; }

  // ---- transactions ----
  transactions({ since } = {}) {
    const rows = since ? this.db.prepare('SELECT data FROM transactions WHERE date >= ?').all(since) : this.db.prepare('SELECT data FROM transactions').all();
    return rows.map(r => P(r.data));
  }
  upsertTransactions(accountId, list) {
    let added = 0;
    this.tx(() => {
      const get = this.db.prepare('SELECT data FROM transactions WHERE id = ?');
      const ins = this.db.prepare('INSERT INTO transactions(id, account_id, date, data) VALUES(?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET date = excluded.date, data = excluded.data');
      for (const t of list) {
        const prev = P(get.get(t.id)?.data);
        if (!prev) added++;
        // keep a manual category across re-imports
        ins.run(t.id, accountId, t.date, J({ ...t, accountId, categoryOverride: prev?.categoryOverride ?? t.categoryOverride ?? null }));
      }
    });
    return added;
  }
  setTxCategory(id, category) {
    const r = this.db.prepare('SELECT data FROM transactions WHERE id = ?').get(id);
    if (!r) return null;
    const t = { ...P(r.data), categoryOverride: category || null };
    this.db.prepare('UPDATE transactions SET data = ? WHERE id = ?').run(J(t), id);
    return t;
  }

  // ---- realized P&L ----
  realized() { return this.db.prepare('SELECT data FROM realized').all().map(r => P(r.data)); }
  replaceRealized(accountId, list) {
    this.tx(() => {
      this.db.prepare('DELETE FROM realized WHERE account_id = ?').run(accountId);
      const ins = this.db.prepare('INSERT OR REPLACE INTO realized(id, account_id, data) VALUES(?, ?, ?)');
      list.forEach((r, i) => ins.run(r.id || `${accountId}:${r.date}:${r.symbol}:${i}`, accountId, J({ ...r, accountId })));
    });
  }

  // ---- snapshots ----
  snapshots() { return this.db.prepare('SELECT date, data FROM snapshots ORDER BY date').all().map(r => ({ date: r.date, ...P(r.data) })); }
  putSnapshot(date, data) { this.db.prepare('INSERT INTO snapshots(date, data) VALUES(?, ?) ON CONFLICT(date) DO UPDATE SET data = excluded.data').run(date, J(data)); }

  dataset() {
    return { accounts: this.accounts(), holdings: this.holdings(), transactions: this.transactions(), realized: this.realized(), snapshots: this.snapshots(), settings: this.getSettings() };
  }

  /** Replace everything with a dataset (used to load demo data). */
  load(data) {
    this.tx(() => {
      for (const t of ['accounts', 'holdings', 'transactions', 'realized', 'snapshots']) this.db.exec(`DELETE FROM ${t}`);
    });
    for (const a of data.accounts) this.putAccount(a);
    const byAcct = new Map();
    for (const h of data.holdings) (byAcct.get(h.accountId) || byAcct.set(h.accountId, []).get(h.accountId)).push(h);
    for (const [id, hs] of byAcct) this.replaceHoldings(id, hs);
    const txBy = new Map();
    for (const t of data.transactions) (txBy.get(t.accountId) || txBy.set(t.accountId, []).get(t.accountId)).push(t);
    for (const [id, ts] of txBy) this.upsertTransactions(id, ts);
    const rBy = new Map();
    for (const r of data.realized || []) (rBy.get(r.accountId) || rBy.set(r.accountId, []).get(r.accountId)).push(r);
    for (const [id, rs] of rBy) this.replaceRealized(id, rs);
    for (const s of data.snapshots || []) this.putSnapshot(s.date, { totalUsd: s.totalUsd, byClass: s.byClass });
    if (data.settings?.base) this.setSetting('base', data.settings.base);
  }
}

export const overrideKey = h => `${h.accountId}|${h.symbol}|${h.sub || ''}|${h.cls || ''}`;

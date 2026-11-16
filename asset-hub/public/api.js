// Talks to the Asset Hub server. When no server answers (opened as a static page),
// falls back to an in-browser demo backed by the same shared logic.
import { buildState } from './shared/state.js';
import { demoData } from './shared/demo-data.js';
import { importText } from './shared/importers.js';
import { CATEGORIES } from './shared/rules.js';
import { CURRENCIES } from './shared/money.js';

class HttpApi {
  constructor() { this.kind = 'server'; }
  async req(method, path, body) {
    const r = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { status: r.status, login: j.login });
    return j;
  }
  state(base) { return this.req('GET', '/api/state' + (base ? '?base=' + base : '')); }
  login(passcode) { return this.req('POST', '/api/login', { passcode }); }
  createAccount(b) { return this.req('POST', '/api/accounts', b); }
  patchAccount(id, b) { return this.req('PATCH', '/api/accounts/' + id, b); }
  deleteAccount(id) { return this.req('DELETE', '/api/accounts/' + id); }
  sync(id) { return this.req('POST', id ? `/api/accounts/${id}/sync` : '/api/sync'); }
  refreshFx() { return this.req('POST', '/api/fx/refresh'); }
  async importFiles(id, files, text) {
    const enc = await Promise.all([...files].map(async f => ({ name: f.name, type: f.type, data: await b64(f) })));
    return this.req('POST', `/api/accounts/${id}/import`, { files: enc, text });
  }
  commit(id, payload) { return this.req('POST', `/api/accounts/${id}/commit`, payload); }
  setAvgCost(holdingId, avgCost) { return this.req('PATCH', '/api/holdings/' + encodeURIComponent(holdingId), { avgCost }); }
  setCategory(txId, category) { return this.req('PATCH', '/api/transactions/' + encodeURIComponent(txId), { category }); }
  saveSettings(b) { return this.req('PUT', '/api/settings', b); }
}

class DemoApi {
  constructor() { this.kind = 'demo'; this.data = demoData(); this.overrides = {}; }
  meta() { return { demo: true, standalone: true, ai: false, categories: CATEGORIES, currencies: CURRENCIES, connectors: Object.fromEntries(this.data.accounts.map(a => [a.id, { kind: a.connector, ready: false }])) }; }
  dataset() { return { ...this.data, holdings: this.data.holdings.map(h => ({ ...h, ...(this.overrides[h.id] || {}) })) }; }
  async state(base) { if (base) this.data.settings.base = base; return buildState(this.dataset(), { base, meta: this.meta() }); }
  async login() { return { ok: true }; }
  async createAccount(b) { const id = (b.name || 'account').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 5); this.data.accounts.push({ id, connector: 'import', config: {}, ...b }); return { id }; }
  async patchAccount(id, b) { const a = this.data.accounts.find(x => x.id === id); Object.assign(a, b); return a; }
  async deleteAccount(id) { for (const k of ['accounts']) this.data[k] = this.data[k].filter(x => x.id !== id); for (const k of ['holdings', 'transactions', 'realized']) this.data[k] = this.data[k].filter(x => x.accountId !== id); return { ok: true }; }
  async sync() { throw new Error('Syncing needs the Asset Hub server running on your own machine. This is a demo.'); }
  async refreshFx() { throw new Error('Live rates need the server.'); }
  async importFiles(id, files, text) {
    const parts = [text || ''];
    for (const f of files) {
      if (/^text\/|csv/.test(f.type) || /\.(csv|tsv|txt)$/i.test(f.name)) parts.push(await f.text());
      else throw new Error('Reading PDFs and screenshots needs the server with an Anthropic API key. CSV files work here.');
    }
    const r = importText(parts.filter(Boolean).join('\n'), { accountId: id });
    if (!r) throw new Error("Couldn't find transactions or positions in that file.");
    return r;
  }
  async commit(id, p) {
    const a = this.data.accounts.find(x => x.id === id);
    let added = 0;
    if (p.kind === 'transactions') {
      const have = new Set(this.data.transactions.map(t => t.id));
      for (const t of p.transactions) if (!have.has(t.id)) { this.data.transactions.push({ ...t, accountId: id, ccy: a.ccy }); added++; }
      if (p.balance) this.setCash(id, a.ccy, p.balance.amount, a.name);
    } else if (p.kind === 'holdings') {
      this.data.holdings = this.data.holdings.filter(h => h.accountId !== id).concat(p.holdings.map((h, i) => ({ ...h, id: id + ':i' + i, accountId: id })));
    } else if (p.kind === 'balance') this.setCash(id, p.ccy || a.ccy, p.amount, a.name);
    a.lastImport = new Date().toISOString(); a.lastError = null;
    return { ok: true, added };
  }
  setCash(id, ccy, amount, name) {
    this.data.holdings = this.data.holdings.filter(h => !(h.accountId === id && h.cls === 'cash' && h.ccy === ccy));
    this.data.holdings.push({ id: id + ':cash:' + ccy, accountId: id, symbol: ccy, name: name + ' balance', cls: 'cash', ccy, value: +amount });
  }
  async setAvgCost(hid, avgCost) { this.overrides[hid] = { avgCost: avgCost === '' || avgCost === null ? undefined : +avgCost }; return { ok: true }; }
  async setCategory(txId, category) { const t = this.data.transactions.find(x => x.id === txId); if (t) t.categoryOverride = category || null; return t; }
  async saveSettings(b) { if (b.base) this.data.settings.base = b.base; if (b.fxOverrides) this.data.settings.fx = { ...this.data.settings.fx, ...b.fxOverrides }; return { ok: true }; }
}

function b64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(file); });
}

export async function connect() {
  if (window.ASSET_HUB_DEMO) return new DemoApi();
  try {
    const r = await fetch('/api/state', { credentials: 'same-origin' });
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) return new HttpApi();
  } catch {}
  return new DemoApi();
}

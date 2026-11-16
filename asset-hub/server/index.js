// Asset Hub server: JSON API + static PWA. Zero runtime dependencies besides the optional Anthropic SDK.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { CONNECTORS, connectorReady, syncAccount, syncAll, recordSnapshot, refreshFx } from './sync.js';
import { aiAvailable } from './ai-reader.js';
import { buildState } from '../public/shared/state.js';
import { importText } from '../public/shared/importers.js';
import { withTxIds } from '../public/shared/importers.js';
import { demoData } from '../public/shared/demo-data.js';
import { CATEGORIES } from '../public/shared/rules.js';
import { CURRENCIES } from '../public/shared/money.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLIC = join(ROOT, 'public');
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
const env = process.env;
const DEMO = env.ASSET_HUB_DEMO === '1';
const PORT = +(env.PORT || 8787);
const PASSCODE = env.APP_PASSCODE || '';
const HOST = env.HOST || (PASSCODE ? '0.0.0.0' : '127.0.0.1');
const SECRET = env.SESSION_SECRET || createHmac('sha256', 'asset-hub').update(PASSCODE || randomBytes(16)).digest('hex');

export function createApp({ store, env: e = env, demo = DEMO, fetchImpl = globalThis.fetch } = {}) {
  const deps = { env: e, fetch: fetchImpl };
  const meta = () => ({
    demo, ai: aiAvailable(e), categories: CATEGORIES, currencies: CURRENCIES,
    connectors: Object.fromEntries(store.accounts().map(a => [a.id, { kind: a.connector, ready: demo ? false : connectorReady(a, e), label: CONNECTORS[a.connector]?.name || null }])),
  });
  const state = base => buildState(store.dataset(), { base, meta: meta() });

  const routes = [
    ['GET', /^\/api\/state$/, (req, q) => state(q.get('base') || undefined)],
    ['POST', /^\/api\/accounts$/, (req, q, body) => {
      const name = String(body.name || '').trim();
      if (!name) throw httpError(400, 'Give the account a name.');
      let id = slug(body.id || name), i = 2; while (store.account(id)) id = slug(name) + '-' + i++;
      store.putAccount({ id, name, institution: body.institution || name, tier: body.tier || 'bank', ccy: body.ccy || 'AUD', connector: body.connector || 'import', config: body.config || {}, sort: 99 });
      return { id };
    }],
    ['PATCH', /^\/api\/accounts\/([\w-]+)$/, (req, q, body, [id]) => {
      const allowed = pick(body, ['name', 'institution', 'tier', 'ccy', 'connector', 'config', 'sort']);
      if (allowed.config?.addresses) allowed.config.addresses = allowed.config.addresses.map(s => String(s).trim()).filter(Boolean);
      return store.patchAccount(id, allowed) || notFound();
    }],
    ['DELETE', /^\/api\/accounts\/([\w-]+)$/, (req, q, b, [id]) => { store.deleteAccount(id); recordSnapshot(store); return { ok: true }; }],
    ['POST', /^\/api\/accounts\/([\w-]+)\/sync$/, async (req, q, b, [id]) => {
      if (demo) throw httpError(400, 'Syncing is off in demo mode.');
      const r = await syncAccount(store, id, deps); recordSnapshot(store); return r;
    }],
    ['POST', /^\/api\/sync$/, async () => { if (demo) throw httpError(400, 'Syncing is off in demo mode.'); return syncAll(store, deps); }],
    ['POST', /^\/api\/fx\/refresh$/, async () => refreshFx(store, deps)],
    ['POST', /^\/api\/accounts\/([\w-]+)\/import$/, async (req, q, body, [id]) => {
      const account = store.account(id) || notFound();
      const files = (body.files || []).map(f => ({ name: f.name, type: f.type || guessType(f.name), data: Buffer.from(f.data || '', 'base64') }));
      const textParts = [body.text || '', ...files.filter(f => /^text\/|csv|tsv/.test(f.type) || /\.(csv|tsv|txt)$/i.test(f.name)).map(f => f.data.toString('utf8'))].filter(Boolean);
      const binary = files.filter(f => !(/^text\/|csv|tsv/.test(f.type) || /\.(csv|tsv|txt)$/i.test(f.name)));
      if (textParts.length && !binary.length) {
        const r = importText(textParts.join('\n'), { accountId: id });
        if (!r) throw httpError(422, "Couldn't find transactions or positions in that file. Check it's a CSV export with a header row.");
        return r;
      }
      if (!binary.length) throw httpError(400, 'Choose a file to import.');
      const { readDocuments } = await import('./ai-reader.js');
      const out = await readDocuments(account, binary, { env: e });
      if (out.kind === 'transactions') {
        return { kind: 'transactions', format: 'Read by Claude', transactions: withTxIds(id, out.transactions.filter(t => t.date && isFinite(t.amount))), balance: out.closingBalance, warnings: out.notes ? [out.notes] : [] };
      }
      return { kind: 'holdings', format: 'Read by Claude', holdings: out.holdings, warnings: out.notes ? [out.notes] : [] };
    }],
    ['POST', /^\/api\/accounts\/([\w-]+)\/commit$/, (req, q, body, [id]) => {
      const account = store.account(id) || notFound();
      let added = 0;
      if (body.kind === 'transactions') {
        const txs = (body.transactions || []).filter(t => t.id && t.date && isFinite(t.amount)).map(t => ({ id: String(t.id), date: t.date, desc: String(t.desc || ''), amount: +t.amount, balance: t.balance ?? null, ccy: account.ccy }));
        added = store.upsertTransactions(id, txs);
        if (body.balance && isFinite(body.balance.amount)) store.setCashBalance(id, account.ccy, +body.balance.amount, `${account.name} balance`);
      } else if (body.kind === 'holdings') {
        store.replaceHoldings(id, (body.holdings || []).map(h => pick(h, ['symbol', 'name', 'cls', 'ccy', 'qty', 'price', 'value', 'cost', 'avgCost', 'exchange', 'sub'])));
      } else if (body.kind === 'balance') {
        store.setCashBalance(id, body.ccy || account.ccy, +body.amount, `${account.name} balance`);
      } else throw httpError(400, 'Nothing to save.');
      store.patchAccount(id, { lastImport: new Date().toISOString(), lastError: null });
      recordSnapshot(store);
      return { ok: true, added };
    }],
    ['PATCH', /^\/api\/holdings\/(.+)$/, (req, q, body, [id]) => {
      const h = store.holding(decodeURIComponent(id)) || notFound();
      store.setOverride(h, { avgCost: body.avgCost === '' || body.avgCost === null ? null : +body.avgCost });
      return { ok: true };
    }],
    ['PATCH', /^\/api\/transactions\/(.+)$/, (req, q, body, [id]) => store.setTxCategory(decodeURIComponent(id), body.category) || notFound()],
    ['PUT', /^\/api\/settings$/, (req, q, body) => {
      if (body.base && CURRENCIES.includes(body.base)) store.setSetting('base', body.base);
      if (body.fxOverrides && typeof body.fxOverrides === 'object') store.setSetting('fxOverrides', Object.fromEntries(Object.entries(body.fxOverrides).filter(([k, v]) => /^[A-Z]{3,5}$/.test(k) && +v > 0).map(([k, v]) => [k, +v])));
      return { ok: true };
    }],
    // Moomoo (or any script) pushes positions here with the bridge token.
    ['POST', /^\/api\/bridge\/([\w-]+)$/, (req, q, body, [id]) => {
      store.account(id) || notFound();
      store.replaceHoldings(id, (body.holdings || []).map(h => pick(h, ['symbol', 'name', 'cls', 'ccy', 'qty', 'price', 'value', 'cost', 'exchange', 'sub'])));
      if (Array.isArray(body.realized)) store.replaceRealized(id, body.realized);
      store.patchAccount(id, { lastSync: new Date().toISOString(), lastError: null });
      recordSnapshot(store);
      return { ok: true };
    }, 'bridge'],
  ];

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const body = await readJson(req, 1e4);
        if (!PASSCODE || safeEq(String(body.passcode || ''), PASSCODE)) {
          res.setHeader('Set-Cookie', `ah=${sessionToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24 * 90}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
          return json(res, 200, { ok: true });
        }
        await new Promise(r => setTimeout(r, 800));
        return json(res, 401, { error: 'Wrong passcode.' });
      }
      if (url.pathname.startsWith('/api/')) {
        for (const [method, re, fn, auth] of routes) {
          const m = url.pathname.match(re);
          if (!m || method !== req.method) continue;
          if (auth === 'bridge') { if (!e.BRIDGE_TOKEN || !safeEq(String(req.headers.authorization || ''), 'Bearer ' + e.BRIDGE_TOKEN)) return json(res, 401, { error: 'Bad bridge token.' }); }
          else if (!authed(req)) return json(res, 401, { error: 'Sign in first.', login: true });
          const body = ['POST', 'PATCH', 'PUT'].includes(method) ? await readJson(req, 40e6) : {};
          const out = await fn(req, url.searchParams, body, m.slice(1));
          return json(res, 200, out);
        }
        return json(res, 404, { error: 'Not found' });
      }
      return serveStatic(url.pathname, res);
    } catch (err) {
      const code = err.status || 500;
      if (code >= 500) console.error(err);
      return json(res, code, { error: err.message || 'Something went wrong.' });
    }
  };
}

function sessionToken() { return createHmac('sha256', SECRET).update('session:' + PASSCODE).digest('hex'); }
function authed(req) {
  if (!PASSCODE) return true;
  const c = Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')));
  return c.ah && safeEq(c.ah, sessionToken());
}
function safeEq(a, b) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
function httpError(status, message) { return Object.assign(new Error(message), { status }); }
function notFound() { throw httpError(404, 'Not found'); }
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'account';
const guessType = n => /\.pdf$/i.test(n) ? 'application/pdf' : /\.png$/i.test(n) ? 'image/png' : /\.jpe?g$/i.test(n) ? 'image/jpeg' : /\.webp$/i.test(n) ? 'image/webp' : /\.(csv|txt|tsv)$/i.test(n) ? 'text/csv' : 'application/octet-stream';
function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(httpError(413, 'That upload is too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(httpError(400, 'Bad JSON')); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
async function serveStatic(path, res) {
  let p = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
  if (p === '/' || !extname(p)) p = '/index.html';
  const file = join(PUBLIC, p);
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'Forbidden' });
  try {
    await stat(file);
    const headers = { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': p === '/sw.js' || p === '/index.html' ? 'no-cache' : 'public, max-age=300', 'x-content-type-options': 'nosniff' };
    res.writeHead(200, headers); res.end(await readFile(file));
  } catch { json(res, 404, { error: 'Not found' }); }
}

// ---------- start ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const store = openDb(DEMO ? ':memory:' : (env.DB_PATH || join(ROOT, 'data', 'asset-hub.db')));
  if (DEMO) store.load(demoData());
  else if (!store.accounts().length) console.log('No accounts yet. Open the app and add your first account, or run `npm run demo` to explore.');
  const server = createServer(createApp({ store }));
  server.listen(PORT, HOST, () => console.log(`Asset Hub ${DEMO ? '(demo) ' : ''}on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}${PASSCODE ? '' : '  (no APP_PASSCODE set: listening on this machine only)'}`));
  if (!DEMO) {
    const hours = +(env.SYNC_HOURS || 6);
    const run = () => syncAll(store, { env, fetch: globalThis.fetch }).then(r => console.log('sync', new Date().toISOString(), JSON.stringify(r))).catch(e => console.error('sync failed', e));
    setTimeout(run, 5000);
    setInterval(run, hours * 36e5);
  }
}

// Asset Hub UI. Vanilla JS, no build step.
import { connect } from './api.js';
import { fmtMoney, fmtPct, CURRENCIES } from './shared/money.js';
import { CLASSES, INVEST_CLASSES, TIERS } from './shared/portfolio.js';
import { CATEGORY_META } from './shared/rules.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem('ah:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('ah:' + k, JSON.stringify(v)); } catch {} } };

const S = {
  api: null, st: null, tab: 'home', privacy: store.get('privacy', false), range: store.get('range', '3M'), distBy: store.get('distBy', 'class'),
  investFilter: 'all', investSort: 'value', month: null, q: '', cat: null, loading: true, error: null,
};

/* ---------------- icons ---------------- */
const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  invest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/></svg>',
  accounts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeoff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

/* ---------------- formatting ---------------- */
const base = () => S.st?.summary.base || 'AUD';
const money = (v, o = {}) => S.privacy && !o.show ? '••••' : fmtMoney(v, o.ccy || base(), o);
const pct = (p, o) => fmtPct(p, o);
const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
function ago(iso) {
  if (!iso) return 'never';
  const m = (Date.now() - new Date(iso).getTime()) / 6e4;
  if (m < 2) return 'just now'; if (m < 60) return Math.round(m) + 'm ago';
  if (m < 60 * 24) return Math.round(m / 60) + 'h ago'; const d = Math.round(m / 1440); return d + (d === 1 ? ' day ago' : ' days ago');
}
const fmtDate = (d, o = { day: 'numeric', month: 'short' }) => new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-AU', o);
const monthName = k => new Date(k + '-01T00:00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
const shortMonth = k => new Date(k + '-01T00:00:00').toLocaleDateString('en-AU', { month: 'short' });
const INST_COLOR = { IBKR: '#C8102E', Moomoo: '#F57C1F', CommBank: '#E6B800', ING: '#FF6200', Maybank: '#E9B21B', DBS: '#E31B23', Binance: '#E0A800', Zerion: '#2962EF' };
const SHORT = { IBKR: 'IBKR', Moomoo: 'MOO', CommBank: 'CBA', ING: 'ING', Maybank: 'MBB', DBS: 'DBS', Binance: 'BNB', Zerion: '0x' };
const instBadge = a => badge(SHORT[a.institution] || initials(a.institution || a.name), INST_COLOR[a.institution] || 'var(--c-other)');
const initials = s => String(s || '?').replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const badge = (text, color) => `<span class="badge" style="background:${color}" aria-hidden="true">${esc(String(text).slice(0, 4))}</span>`;

/* ---------------- boot ---------------- */
async function boot() {
  applyTheme();
  S.tab = (location.hash.slice(1) || 'home');
  if (!['home', 'invest', 'cash', 'accounts'].includes(S.tab)) S.tab = 'home';
  window.addEventListener('hashchange', () => { closeSheet(true); const t = location.hash.slice(1); if (['home', 'invest', 'cash', 'accounts'].includes(t) && t !== S.tab) { S.tab = t; render(); window.scrollTo(0, 0); } });
  document.addEventListener('click', onClick);
  S.api = await connect();
  await load();
  if ('serviceWorker' in navigator && S.api.kind === 'server') navigator.serviceWorker.register('sw.js').catch(() => {});
}
function applyTheme() {}

async function load() {
  try { S.st = await S.api.state(); S.error = null; }
  catch (e) { if (e.login) return renderLogin(); S.error = e.message; }
  S.loading = false; render();
}

/* ---------------- rendering ---------------- */
function render() {
  const app = $('#app');
  if (!S.st) { app.innerHTML = `<div class="page" style="padding-top:40vh;text-align:center">${S.error ? `<div class="banner err">${esc(S.error)}</div>` : '<span class="muted">Loading…</span>'}</div>`; return; }
  const titles = { home: 'Overview', invest: 'Investments', cash: 'Cash flow', accounts: 'Accounts' };
  const page = { home: homePage, invest: investPage, cash: cashPage, accounts: accountsPage }[S.tab]();
  app.innerHTML = `
    <header class="topbar"><h1>${titles[S.tab]}</h1>
      <div class="top-actions">
        <button class="pillbtn" data-act="base" aria-label="Display currency">${esc(base())}</button>
        <button class="pillbtn iconbtn" data-act="privacy" aria-label="${S.privacy ? 'Show amounts' : 'Hide amounts'}">${S.privacy ? I.eyeoff : I.eye}</button>
      </div></header>
    <main class="page">${S.st.meta.demo ? `<div class="banner">${S.st.meta.standalone ? 'Demo with made-up numbers. Run Asset Hub on your own machine to connect real accounts.' : 'Demo data. Add your real accounts on the Accounts tab.'}</div>` : ''}${page}</main>
    <div class="tabbar"><nav aria-label="Sections">${['home', 'invest', 'cash', 'accounts'].map(t => `<a class="tab" href="#${t}" ${S.tab === t ? 'aria-current="page"' : ''}>${I[t]}<span>${{ home: 'Overview', invest: 'Invest', cash: 'Cash flow', accounts: 'Accounts' }[t]}</span></a>`).join('')}</nav></div>`;
  mountCharts();
}

/* ---------- Home ---------- */
const RANGES = { '1M': 30, '3M': 91, '6M': 182, '1Y': 365, 'All': 1e5 };
function rangeSeries() {
  const s = S.st.summary;
  const cut = new Date(Date.now() - RANGES[S.range] * 864e5).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const pts = s.history.filter(p => p.date >= cut && p.date < today);
  pts.push({ date: today, value: s.netWorth });
  return pts;
}
function homePage() {
  const s = S.st.summary, cf = S.st.cashflow;
  if (!s.accounts.length) return emptyStart();
  const pts = rangeSeries();
  const first = pts[0]?.value, ch = pts.length > 1 && first ? s.netWorth - first : null;
  const label = { '1M': 'past month', '3M': 'past 3 months', '6M': 'past 6 months', '1Y': 'past year', 'All': 'all time' }[S.range];
  const lastFull = cf.months.at(-2) || cf.months.at(-1);
  const dist = { class: s.byClass, platform: s.byPlatform, currency: s.byCurrency, region: s.byRegion }[S.distBy];
  const palette = ['#2F6FD6', '#E58A24', '#1FA394', '#D1579B', '#8F7BDB', '#0B7A5C', '#C9A227', '#5E93F0', '#7C9C93', '#A0AAA7'];
  const items = dist.map((g, i) => ({ ...g, color: S.distBy === 'class' ? g.color : palette[i % palette.length] }));
  const issues = attention();
  return `
  <section class="hero">
    <span class="eyebrow">Net worth</span>
    <span class="big">${money(s.netWorth)}</span>
    <span class="sub">${ch !== null ? `<span class="chg ${cls(ch)}">${ch >= 0 ? '▲' : '▼'} ${money(Math.abs(ch))} (${pct(ch / Math.abs(first))})</span><span>${label}</span>` : '<span>Your trend appears after a few days of data</span>'}</span>
  </section>
  <section class="card" aria-label="Net worth history">
    <div class="chart-wrap" id="nwchart"><span class="scrub" id="scrub" hidden></span>${lineChart(pts)}</div>
    <div style="display:flex;justify-content:center;margin-top:8px"><div class="seg" role="group" aria-label="Range">${Object.keys(RANGES).map(r => `<button data-act="range" data-v="${r}" aria-pressed="${S.range === r}">${r}</button>`).join('')}</div></div>
  </section>
  <section class="card"><div class="stats">
    <div class="stat"><span class="v">${money(s.assets)}</span><span class="k">Assets</span></div>
    <div class="stat"><span class="v ${s.liabilities ? 'neg' : ''}">${s.liabilities ? money(-s.liabilities) : money(0)}</span><span class="k">Loans &amp; debts</span></div>
    <div class="stat"><span class="v ${cls(s.invest.unrealized)}">${money(s.invest.unrealized, { sign: true })}</span><span class="k">Unrealised P&amp;L ${s.invest.unrealizedPct !== null ? '· ' + pct(s.invest.unrealizedPct) : ''}</span></div>
    <div class="stat"><span class="v ${cls(lastFull.net)}">${money(lastFull.net, { sign: true })}</span><span class="k">Saved in ${shortMonth(lastFull.key)}${lastFull.savingsRate !== null ? ' · ' + pct(lastFull.savingsRate, { sign: false, dp: 0 }) : ''}</span></div>
  </div></section>
  <section class="card">
    <div class="card-h"><h2>Where it is</h2></div>
    <div class="seg" role="group" aria-label="Group by" style="margin-bottom:14px">${[['class', 'Type'], ['platform', 'Platform'], ['currency', 'Currency'], ['region', 'Region']].map(([k, n]) => `<button data-act="dist" data-v="${k}" aria-pressed="${S.distBy === k}">${n}</button>`).join('')}</div>
    <div class="dist">${donut(items, s.assets)}<div class="legend">${items.slice(0, 8).map(g => `<div class="lrow"><span class="dot" style="background:${g.color}"></span><span class="nm">${esc(g.name)}</span><span class="vv">${money(g.value, { compact: true })}<small>${Math.round(g.share * 100)}%</small></span></div>`).join('')}${items.length > 8 ? `<div class="lrow"><span></span><span class="nm muted">${items.length - 8} more</span><span></span></div>` : ''}</div></div>
  </section>
  ${issues.length ? `<section class="card flush" aria-label="Needs attention"><div class="card-h" style="padding:10px 16px 0;margin:0"><h2>Needs attention</h2></div><div class="list">${issues.join('')}</div></section>` : ''}
  <section class="card flush"><div class="card-h" style="padding:10px 16px 0;margin:0"><h2>By platform</h2><a class="link" href="#accounts">All accounts</a></div><div class="list">
    ${s.byPlatform.slice(0, 6).map(g => { const a = s.accounts.find(x => x.id === g.key) || {}; return `<button class="row btn" data-act="account" data-id="${esc(g.key)}">${instBadge({ ...a, name: g.name })}<span class="t"><b>${esc(g.name)}</b><span>${Math.round(g.share * 100)}% of assets</span></span><span class="r"><b>${money(g.value)}</b></span></button>`; }).join('')}
  </div></section>`;
}
function attention() {
  const s = S.st.summary, out = [];
  for (const a of s.accounts) {
    if (a.status === 'error') out.push(issueRow(a, `Sync failed: ${a.lastError}`, 'error'));
    else if (a.status === 'empty') out.push(issueRow(a, 'Not loaded yet. Tap to connect or import.', 'empty'));
    else if (a.status === 'stale') out.push(issueRow(a, `Last updated ${ago(a.lastSync || a.lastImport)}. Import a fresh statement.`, 'stale'));
  }
  if (s.missingFx.length) out.push(`<button class="row btn" data-act="fx"><span class="badge" style="background:var(--warn)">FX</span><span class="t"><b>Missing exchange rate</b><span>No rate for ${s.missingFx.map(esc).join(', ')}. Those holdings aren't counted.</span></span><span class="r"></span></button>`);
  if (s.invest.unknownCost) out.push(`<button class="row btn" data-act="tab" data-v="invest"><span class="badge" style="background:var(--c-other)">P&amp;L</span><span class="t"><b>${s.invest.unknownCost} holding${s.invest.unknownCost > 1 ? 's' : ''} without a cost</b><span>Add an average cost to see their profit or loss.</span></span><span class="r"></span></button>`);
  return out.slice(0, 6);
}
const issueRow = (a, text, st) => `<button class="row btn" data-act="account" data-id="${esc(a.id)}">${instBadge(a)}<span class="t"><b>${esc(a.name)}</b><span class="status ${st}">${esc(text)}</span></span><span class="r"></span></button>`;
function emptyStart() {
  return `<section class="card empty"><h2 style="font-size:20px">Let's add your first account</h2><p class="help">Start with the easy ones: IBKR and Moomoo positions, then bank exports, then Binance and your wallets.</p><button class="btn-p" data-act="add">Add an account</button></section>`;
}

/* ---------- Charts ---------- */
let chartPts = [];
function lineChart(pts) {
  chartPts = pts;
  if (pts.length < 2) return `<svg viewBox="0 0 320 150" aria-hidden="true"><text x="160" y="80" text-anchor="middle" fill="var(--muted)" font-size="12">Not enough history yet</text></svg>`;
  const W = 320, H = 150, pad = 8;
  const vals = pts.map(p => p.value), lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = i => i / (pts.length - 1) * W, y = v => pad + (1 - (v - lo) / span) * (H - pad * 2 - 14);
  const d = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('L');
  const up = vals.at(-1) >= vals[0];
  const col = up ? 'var(--pos)' : 'var(--neg)';
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Net worth from ${fmtDate(pts[0].date)} to today">
    <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <path d="M${d}L${W},${H}L0,${H}Z" fill="url(#g)"/><path d="M${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <line id="cl" x1="0" x2="0" y1="0" y2="${H}" stroke="var(--muted)" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0"/>
    <circle id="cd" r="4" cx="${W}" cy="${y(vals.at(-1))}" fill="${col}" stroke="var(--surface)" stroke-width="2" vector-effect="non-scaling-stroke"/>
  </svg>`;
}
function mountCharts() {
  const wrap = $('#nwchart'); if (!wrap || chartPts.length < 2) return;
  const svg = wrap.querySelector('svg'), tip = $('#scrub'), line = $('#cl'), dot = $('#cd');
  const vals = chartPts.map(p => p.value), lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const move = ev => {
    const r = svg.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width));
    const i = Math.round(fx * (chartPts.length - 1)), p = chartPts[i];
    const X = i / (chartPts.length - 1) * 320, Y = 8 + (1 - (p.value - lo) / span) * (150 - 16 - 14);
    line.setAttribute('x1', X); line.setAttribute('x2', X); line.setAttribute('opacity', '.5');
    dot.setAttribute('cx', X); dot.setAttribute('cy', Y);
    tip.hidden = false; tip.style.left = Math.min(Math.max(fx * r.width, 60), r.width - 60) + 'px';
    tip.textContent = `${money(p.value)} · ${fmtDate(p.date)}`;
  };
  const end = () => { tip.hidden = true; line.setAttribute('opacity', '0'); const n = chartPts.length - 1; dot.setAttribute('cx', 320); dot.setAttribute('cy', 8 + (1 - (chartPts[n].value - lo) / span) * (150 - 30)); };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', end); svg.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') end(); });
}
function donut(items, total) {
  const R = 52, C = 2 * Math.PI * R; let off = 0;
  const segs = items.filter(g => g.value > 0).map(g => { const len = g.value / total * C; const s = `<circle r="${R}" cx="66" cy="66" fill="none" stroke="${g.color}" stroke-width="18" stroke-dasharray="${Math.max(0, len - 1.5)} ${C}" stroke-dashoffset="${-off}"/>`; off += len; return s; }).join('');
  return `<div class="donut"><svg viewBox="0 0 132 132" aria-hidden="true"><circle r="${R}" cx="66" cy="66" fill="none" stroke="var(--surface-2)" stroke-width="18"/>${segs}</svg><div class="center"><b>${items.length}</b><span>${{ class: 'types', platform: 'platforms', currency: 'currencies', region: 'regions' }[S.distBy]}</span></div></div>`;
}
function barChart(months, selected) {
  const W = 320, H = 150, top = 8, bottom = 18, n = months.length;
  const max = Math.max(1, ...months.map(m => Math.max(m.income, m.spending)));
  const bw = W / n, inner = Math.min(9, bw * 0.3);
  const y = v => top + (1 - v / max) * (H - top - bottom);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and spending by month">${months.map((m, i) => {
    const cx = i * bw + bw / 2, sel = m.key === selected;
    return `<g data-act="month" data-v="${m.key}" style="cursor:pointer"><rect x="${i * bw}" y="0" width="${bw}" height="${H}" fill="${sel ? 'var(--surface-2)' : 'transparent'}" rx="6"/>
      <rect x="${cx - inner - 1}" y="${y(m.income)}" width="${inner}" height="${Math.max(0, H - bottom - y(m.income))}" rx="2" fill="var(--pos)" opacity="${sel ? 1 : .55}"/>
      <rect x="${cx + 1}" y="${y(m.spending)}" width="${inner}" height="${Math.max(0, H - bottom - y(m.spending))}" rx="2" fill="var(--neg)" opacity="${sel ? 1 : .55}"/>
      <text class="lbl" x="${cx}" y="${H - 4}" text-anchor="middle" ${sel ? 'style="font-weight:700;fill:var(--ink)"' : ''}>${shortMonth(m.key)[0]}</text></g>`;
  }).join('')}</svg>`;
}

/* ---------- Invest ---------- */
function investPage() {
  const s = S.st.summary, i = s.invest;
  const inv = s.holdings.filter(h => INVEST_CLASSES.has(h.cls) && h.valueBase !== null);
  const plats = [...new Map(inv.map(h => [h.accountId, h.accountName])).entries()];
  let list = inv.filter(h => S.investFilter === 'all' || h.accountId === S.investFilter);
  const sorter = { value: (a, b) => b.valueBase - a.valueBase, pnl: (a, b) => (b.pnlBase ?? -Infinity) - (a.pnlBase ?? -Infinity), pct: (a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity) }[S.investSort];
  list = list.slice().sort(sorter);
  return `
  <section class="hero"><span class="eyebrow">Invested</span><span class="big">${money(i.value)}</span>
    <span class="sub"><span class="chg ${cls(i.unrealized)}">${money(i.unrealized, { sign: true })} (${pct(i.unrealizedPct)})</span><span>unrealised</span></span></section>
  <section class="card"><div class="stats">
    <div class="stat"><span class="v">${money(i.cost)}</span><span class="k">Cost basis${i.unknownCost ? ` · ${i.unknownCost} unknown` : ''}</span></div>
    <div class="stat"><span class="v ${cls(i.realizedYtd)}">${money(i.realizedYtd, { sign: true })}</span><span class="k">Realised in ${i.year}</span></div>
    <div class="stat"><span class="v ${cls(i.unrealized + i.realizedAll)}">${money(i.unrealized + i.realizedAll, { sign: true })}</span><span class="k">Total P&amp;L (open + closed)</span></div>
    <div class="stat"><span class="v">${s.assets ? Math.round(i.value / s.assets * 100) : 0}%</span><span class="k">of your assets</span></div>
  </div></section>
  <section class="card flush"><div class="card-h" style="padding:10px 16px 0;margin:0"><h2>By platform</h2></div><div class="list">
    ${i.byPlatform.map(p => { const a = s.accounts.find(x => x.id === p.accountId) || {}; return `<button class="row btn" data-act="ifilter" data-v="${esc(p.accountId)}">${instBadge({ ...a, name: p.name })}<span class="t"><b>${esc(p.name)}</b><span>${p.realized ? `Realised ${money(p.realized, { sign: true })}` : 'No closed trades'}${p.unknown ? ` · ${p.unknown} without cost` : ''}</span></span><span class="r"><b>${money(p.value)}</b><span class="${cls(p.pnl)}">${money(p.pnl, { sign: true, compact: true })} · ${pct(p.pnlPct)}</span></span></button>`; }).join('')}
  </div></section>
  <div class="chips" role="group" aria-label="Filter by platform"><button class="chip" data-act="ifilter" data-v="all" aria-pressed="${S.investFilter === 'all'}">All</button>${plats.map(([id, n]) => `<button class="chip" data-act="ifilter" data-v="${esc(id)}" aria-pressed="${S.investFilter === id}">${esc(n)}</button>`).join('')}</div>
  <div class="seg" role="group" aria-label="Sort">${[['value', 'Value'], ['pnl', 'P&L'], ['pct', 'P&L %']].map(([k, n]) => `<button data-act="isort" data-v="${k}" aria-pressed="${S.investSort === k}">${n}</button>`).join('')}</div>
  <section class="card flush"><div class="list">${list.map(holdingRow).join('') || '<div class="empty">No investments here yet.</div>'}</div></section>`;
}
function holdingRow(h) {
  return `<button class="row btn" data-act="holding" data-id="${esc(h.id)}">${badge(h.symbol, CLASSES[h.cls].color)}
    <span class="t"><b>${esc(h.name)}</b><span>${esc(h.accountName)}${h.sub ? ' · ' + esc(h.sub) : ''}${h.qty !== null && h.qty !== undefined ? ' · ' + esc(+(+h.qty).toPrecision(6)) : ''}</span></span>
    <span class="r"><b>${money(h.valueBase)}</b><span class="${cls(h.pnlBase)}">${h.pnlBase !== null ? `${money(h.pnlBase, { sign: true, compact: true })} · ${pct(h.pnlPct)}` : '<span class="muted">add cost</span>'}</span></span></button>`;
}

/* ---------- Cash flow ---------- */
function cashPage() {
  const cf = S.st.cashflow;
  if (!cf.transactions.length) return `<section class="card empty"><h2 style="font-size:19px">No bank transactions yet</h2><p class="help">Import a CSV from NetBank or ING, a DBS export, or a Maybank PDF statement. Spending, salary and recurring bills are worked out for you.</p><button class="btn-p" data-act="tab" data-v="accounts">Go to accounts</button></section>`;
  const months = cf.months;
  if (!S.month || !months.find(m => m.key === S.month)) S.month = ((months.at(-2) && months.at(-2).count) ? months.at(-2) : months.at(-1)).key;
  const m = months.find(x => x.key === S.month);
  const active = months.filter(x => x.count);
  const avgCat = {}; for (const mm of active) for (const c of mm.byCategory) avgCat[c.name] = (avgCat[c.name] || 0) + c.value / active.length;
  const txs = cf.transactions.filter(t => t.date.startsWith(S.month) && (!S.cat || t.category === S.cat) && (!S.q || (t.desc + ' ' + t.category + ' ' + t.accountName).toLowerCase().includes(S.q.toLowerCase())));
  const isNow = S.month === months.at(-1).key;
  return `
  <div class="chips" role="group" aria-label="Month">${[...months].reverse().filter(x => x.count).map(x => `<button class="chip" data-act="month" data-v="${x.key}" aria-pressed="${x.key === S.month}">${shortMonth(x.key)} ${x.key.slice(2, 4)}</button>`).join('')}</div>
  <section class="hero"><span class="eyebrow">${monthName(S.month)}${isNow ? ' so far' : ''}</span><span class="big ${cls(m.net)}">${money(m.net, { sign: true })}</span><span class="sub">${m.net >= 0 ? 'saved' : 'more spent than earned'}${m.savingsRate !== null && m.savingsRate > -1 ? ` · ${pct(m.savingsRate, { sign: false, dp: 0 })} of income` : ''}${isNow ? ' · salary may not have landed yet' : ''}</span></section>
  <section class="card"><div class="stats">
    <div class="stat"><span class="v pos">${money(m.income)}</span><span class="k">Income${m.salary ? ` · salary ${money(m.salary, { compact: true })}` : ''}</span></div>
    <div class="stat"><span class="v neg">${money(m.spending)}</span><span class="k">Spending · avg ${money(cf.averages.spending, { compact: true })}</span></div>
    <div class="stat"><span class="v">${money(m.invested)}</span><span class="k">Moved to investments</span></div>
    <div class="stat"><span class="v">${cf.averages.savingsRate !== null ? pct(cf.averages.savingsRate, { sign: false, dp: 0 }) : '—'}</span><span class="k">Average savings rate</span></div>
  </div></section>
  ${cf.salary ? `<section class="card"><div class="card-h"><h2>Salary</h2><span class="eyebrow">detected</span></div><p class="help" style="margin:0"><b>${esc(cf.salary.payees.join(', '))}</b> pays about <b>${money(cf.salary.monthly)}</b> a month. Last paid ${fmtDate(cf.salary.last.date, { day: 'numeric', month: 'long' })}: ${money(cf.salary.last.amountBase)}.</p></section>` : ''}
  <section class="card"><div class="card-h"><h2>12 months</h2><span class="eyebrow"><span class="sw" style="background:var(--pos)"></span> in &nbsp;<span class="sw" style="background:var(--neg)"></span> out</span></div><div class="bars">${barChart(months, S.month)}</div></section>
  <section class="card"><div class="card-h"><h2>Spending by category</h2>${S.cat ? `<button class="link" data-act="cat" data-v="">Clear filter</button>` : ''}</div>
    ${m.byCategory.length ? m.byCategory.map(c => `<button class="catrow" style="width:100%;text-align:left" data-act="cat" data-v="${esc(c.name)}"><span><span class="sw" style="background:${c.color}"></span> ${esc(c.name)}</span><span class="vv">${money(c.value)}<small>avg ${money(avgCat[c.name] || 0, { compact: true })}</small></span><span class="track"><span style="width:${c.value / m.byCategory[0].value * 100}%;background:${c.color}"></span></span></button>`).join('') : '<p class="help">No spending this month.</p>'}
  </section>
  ${cf.recurring.length ? `<section class="card flush"><div class="card-h" style="padding:10px 16px 0;margin:0"><h2>Recurring payments</h2><span class="eyebrow">${money(cf.recurring.reduce((s, r) => s + (r.perMonthBase || 0), 0))}/mo</span></div><div class="list">${cf.recurring.slice(0, 10).map(r => `<div class="row"><span class="badge" style="background:${CATEGORY_META[r.category]?.color || 'var(--c-other)'}">${esc(initials(r.payee))}</span><span class="t"><b>${esc(titleCase(r.payee))}</b><span>${esc(r.category)} · ${r.every >= 2 ? `every ${r.every} months` : 'monthly'} · last ${fmtDate(r.last)}</span></span><span class="r"><b>${money(r.perMonthBase)}</b><span class="muted">a month</span></span></div>`).join('')}</div></section>` : ''}
  <section class="card flush"><div style="padding:8px 12px"><input class="search" type="search" id="txq" placeholder="Search ${esc(monthName(S.month))}" value="${esc(S.q)}" aria-label="Search transactions"></div>
    ${S.cat ? `<div class="daygroup">Showing ${esc(S.cat)} only</div>` : ''}
    <div class="list" id="txlist">${txList(txs)}</div></section>`;
}
const titleCase = s => String(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
function txList(txs) {
  if (!txs.length) return '<div class="empty">No transactions match.</div>';
  let out = '', day = '';
  for (const t of txs.slice(0, 300)) {
    if (t.date !== day) { day = t.date; out += `<div class="daygroup">${fmtDate(t.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>`; }
    const meta = CATEGORY_META[t.category] || {};
    out += `<button class="row btn" data-act="tx" data-id="${esc(t.id)}"><span class="badge" style="background:${meta.color || 'var(--c-other)'}">${esc(initials(t.category))}</span><span class="t"><b>${esc(t.desc)}</b><span>${esc(t.category)}${t.auto ? '' : ' (you)'} · ${esc(t.accountName)}</span></span><span class="r"><b class="${t.amount > 0 ? 'pos' : ''}">${money(t.amountBase, { sign: true })}</b>${t.ccy !== base() ? `<span class="muted">${S.privacy ? '' : esc(fmtMoney(t.amount, t.ccy))}</span>` : ''}</span></button>`;
  }
  return out;
}

/* ---------- Accounts ---------- */
const METHOD = { ibkr: 'Auto · Flex', binance: 'Auto · API', zerion: 'Auto · Zerion', moomoo: 'Auto · OpenD bridge', import: 'Import', manual: 'Manual' };
function accountsPage() {
  const s = S.st.summary, server = S.api.kind === 'server' && !S.st.meta.demo;
  return `
  ${server ? `<div class="btnrow"><button class="btn-s" data-act="syncall">${'Sync all now'}</button><button class="btn-p" data-act="add">Add account</button></div>` : `<div class="btnrow"><button class="btn-p" data-act="add">Add account</button></div>`}
  ${TIERS.map(t => { const list = s.accounts.filter(a => a.tier === t.id); return `
    <div class="group-h"><span class="n">${t.n}</span><h3>${t.name}</h3><span>${{ broker: 'easiest', bank: 'file import', exchange: 'read-only key', wallet: 'public addresses' }[t.id]}</span></div>
    <section class="card flush"><div class="list">${list.map(accountRow).join('') || `<button class="row btn" data-act="add" data-tier="${t.id}"><span class="badge" style="background:var(--surface-2);color:var(--muted)">${I.plus}</span><span class="t"><b>Add ${t.name.toLowerCase().replace(/s$/, '')}</b><span>Nothing here yet</span></span><span class="r"></span></button>`}</div></section>`; }).join('')}
  <div class="group-h"><h3>Settings</h3></div>
  <section class="card flush"><div class="list">
    <button class="row btn" data-act="base"><span class="badge" style="background:var(--accent)">${esc(base())}</span><span class="t"><b>Display currency</b><span>Everything is converted to ${esc(base())}</span></span><span class="r"></span></button>
    <button class="row btn" data-act="fx"><span class="badge" style="background:var(--c-bond)">FX</span><span class="t"><b>Exchange rates</b><span>${S.st.settings.fxDate ? 'Updated ' + esc(S.st.settings.fxDate) : 'Built-in rates'}</span></span><span class="r"></span></button>
    <button class="row btn" data-act="privacy"><span class="badge" style="background:var(--c-cash)">${S.privacy ? I.eyeoff : I.eye}</span><span class="t"><b>${S.privacy ? 'Amounts hidden' : 'Hide amounts'}</b><span>For checking your balance in public</span></span><span class="r"></span></button>
  </div></section>`;
}
function accountRow(a) {
  const when = a.lastSync || a.lastImport;
  const line = a.status === 'error' ? `Sync failed` : a.status === 'empty' ? 'Not loaded yet' : `${METHOD[a.connector] || 'Import'} · ${ago(when)}`;
  return `<button class="row btn" data-act="account" data-id="${esc(a.id)}">${instBadge(a)}<span class="t"><b>${esc(a.name)}</b><span class="status ${a.status}">${esc(line)}</span></span><span class="r"><b>${a.holdingCount ? money(a.total) : '—'}</b><span class="muted">${esc(a.ccy)}</span></span></button>`;
}

/* ---------------- sheets ---------------- */
let sheetEl = null;
function openSheet(title, body, onMount) {
  closeSheet(true);
  const back = document.createElement('div'); back.className = 'sheet-back';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', title);
  sh.innerHTML = `<div class="grab"></div><div class="sh"><h2>${esc(title)}</h2><button class="pillbtn iconbtn" data-act="close" aria-label="Close">${I.close}</button></div><div class="body">${body}</div>`;
  document.body.append(back, sh);
  back.addEventListener('click', () => closeSheet());
  requestAnimationFrame(() => { back.classList.add('open'); sh.classList.add('open'); });
  sheetEl = { back, sh };
  document.body.style.overflow = 'hidden';
  onMount?.(sh);
  setTimeout(() => sh.querySelector('[data-autofocus]')?.focus(), 250);
  return sh;
}
function closeSheet(instant) {
  if (!sheetEl) return;
  const { back, sh } = sheetEl; sheetEl = null; document.body.style.overflow = '';
  if (instant) { back.remove(); sh.remove(); return; }
  back.classList.remove('open'); sh.classList.remove('open');
  setTimeout(() => { back.remove(); sh.remove(); }, 260);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

function toast(msg) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

function holdingSheet(id) {
  const h = S.st.summary.holdings.find(x => x.id === id); if (!h) return;
  const share = S.st.summary.assets ? h.valueBase / S.st.summary.assets : 0;
  openSheet(h.symbol + ' · ' + h.accountName, `
    <div class="hero" style="padding:0"><span class="big" style="font-size:32px">${money(h.valueBase)}</span><span class="sub">${h.pnlBase !== null ? `<span class="chg ${cls(h.pnlBase)}">${money(h.pnlBase, { sign: true })} (${pct(h.pnlPct)})</span><span>unrealised</span>` : '<span>Cost unknown</span>'}</span></div>
    <dl class="kv">
      <dt>Name</dt><dd>${esc(h.name)}</dd>
      <dt>Type</dt><dd>${CLASSES[h.cls].name}${h.sub ? ' · ' + esc(h.sub) : ''}</dd>
      ${h.qty !== null && h.qty !== undefined ? `<dt>Quantity</dt><dd>${esc((+h.qty).toLocaleString('en-AU', { maximumFractionDigits: 8 }))}</dd>` : ''}
      ${h.price !== null && h.price !== undefined ? `<dt>Price</dt><dd>${S.privacy ? '••••' : esc(fmtMoney(h.price, h.ccy, { dp: h.price < 1 ? 4 : 2 }))}</dd>` : ''}
      <dt>Value</dt><dd>${S.privacy ? '••••' : esc(fmtMoney(h.value, h.ccy))}</dd>
      ${h.cost !== null ? `<dt>Cost basis</dt><dd>${S.privacy ? '••••' : esc(fmtMoney(h.cost, h.ccy))}</dd>` : ''}
      <dt>Share of assets</dt><dd>${pct(share, { sign: false })}</dd>
      <dt>Region</dt><dd>${esc(h.region)}</dd>
      ${h.exchange ? `<dt>Exchange</dt><dd>${esc(h.exchange)}</dd>` : ''}
    </dl>
    ${INVEST_CLASSES.has(h.cls) && h.qty ? `<div class="field"><label for="avg">Average cost per unit (${esc(h.ccy)})</label><input class="input" id="avg" inputmode="decimal" placeholder="e.g. ${h.price ? (+h.price * 0.8).toPrecision(4) : '1.00'}" value="${h.avgCost ?? (h.cost && h.qty ? +(h.cost / h.qty).toPrecision(8) : '')}">
      <p class="help">Binance and wallets don't report what you paid. Enter it once and it's kept through every sync.</p></div>
      <div class="btnrow"><button class="btn-p" data-act="saveavg" data-id="${esc(h.id)}">Save cost</button>${h.avgCost !== undefined && h.avgCost !== null ? `<button class="btn-s" data-act="clearavg" data-id="${esc(h.id)}">Use reported cost</button>` : ''}</div>` : ''}`);
}

function txSheet(id) {
  const t = S.st.cashflow.transactions.find(x => x.id === id); if (!t) return;
  openSheet('Transaction', `
    <div class="hero" style="padding:0"><span class="big" style="font-size:30px">${money(t.amountBase, { sign: true })}</span><span class="sub">${esc(fmtDate(t.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</span></div>
    <dl class="kv"><dt>Description</dt><dd>${esc(t.desc)}</dd><dt>Account</dt><dd>${esc(t.accountName)}</dd>${t.ccy !== base() ? `<dt>Original</dt><dd>${S.privacy ? '••••' : esc(fmtMoney(t.amount, t.ccy))}</dd>` : ''}</dl>
    <div class="field"><label>Category</label><div class="catgrid">${S.st.meta.categories.map(c => `<button data-act="setcat" data-id="${esc(t.id)}" data-v="${esc(c)}" aria-pressed="${t.category === c}"><span class="sw" style="background:${CATEGORY_META[c].color}"></span>${esc(c)}</button>`).join('')}</div>
    <p class="help">${t.auto ? 'Picked automatically. Choose another to correct it; your choice is kept on re-import.' : 'You set this category.'} Transfers and Investing don't count as spending.</p></div>
    ${t.auto ? '' : `<button class="btn-s" data-act="setcat" data-id="${esc(t.id)}" data-v="">Go back to automatic</button>`}`);
}

const TEMPLATES = [
  { name: 'Interactive Brokers', institution: 'IBKR', tier: 'broker', ccy: 'USD', connector: 'ibkr' },
  { name: 'Moomoo', institution: 'Moomoo', tier: 'broker', ccy: 'USD', connector: 'moomoo' },
  { name: 'CommBank', institution: 'CommBank', tier: 'bank', ccy: 'AUD', connector: 'import' },
  { name: 'ING', institution: 'ING', tier: 'bank', ccy: 'AUD', connector: 'import' },
  { name: 'Maybank', institution: 'Maybank', tier: 'bank', ccy: 'MYR', connector: 'import' },
  { name: 'DBS', institution: 'DBS', tier: 'bank', ccy: 'SGD', connector: 'import' },
  { name: 'Binance', institution: 'Binance', tier: 'exchange', ccy: 'USD', connector: 'binance' },
  { name: 'On-chain wallets', institution: 'Zerion', tier: 'wallet', ccy: 'USD', connector: 'zerion' },
];
function addSheet(tier) {
  const existing = new Set(S.st.summary.accounts.map(a => a.institution));
  const tpl = TEMPLATES.filter(t => !tier || t.tier === tier);
  openSheet('Add account', `
    <div class="card flush" style="box-shadow:none;border:1px solid var(--line)"><div class="list">${tpl.map(t => `<button class="row btn" data-act="addtpl" data-v="${esc(t.name)}">${instBadge(t)}<span class="t"><b>${esc(t.name)}</b><span>${METHOD[t.connector]}${existing.has(t.institution) ? ' · you have one already' : ''}</span></span><span class="r"></span></button>`).join('')}</div></div>
    <h3 style="margin:6px 0 0;font-size:15px">Something else</h3>
    <div class="field"><label for="nn">Name</label><input class="input" id="nn" placeholder="e.g. Westpac, Syfe, CoinSpot"></div>
    <div class="btnrow">
      <div class="field" style="flex:1"><label for="nt">Kind</label><select class="input" id="nt">${TIERS.map(t => `<option value="${t.id}" ${t.id === (tier || 'bank') ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>
      <div class="field" style="flex:1"><label for="nc">Currency</label><select class="input" id="nc">${CURRENCIES.map(c => `<option ${c === 'AUD' ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    </div>
    <button class="btn-p" data-act="addcustom">Add</button>`);
}

function connectorHelp(a, ready) {
  const env = k => `<code>${k}</code>`;
  if (a.connector === 'ibkr') return ready ? 'Syncs automatically from your IBKR Flex Query.' : `To sync automatically, create an Activity Flex Query (Open Positions, Cash Report, Trades) and a Flex Web Service token in Client Portal, then set ${env('IBKR_FLEX_TOKEN')} and ${env('IBKR_FLEX_QUERY_ID')} in the server's <code>.env</code>. Until then, import a positions CSV or screenshot.`;
  if (a.connector === 'binance') return ready ? 'Syncs Spot, Funding and Earn with your read-only key.' : `Create an API key with only <b>Enable Reading</b> ticked, then set ${env('BINANCE_API_KEY')} and ${env('BINANCE_API_SECRET')} in <code>.env</code>. Until then, import a screenshot.`;
  if (a.connector === 'zerion') return ready ? 'Syncs every token and DeFi position for the addresses below.' : `Get a free key at developers.zerion.io and set ${env('ZERION_API_KEY')} in <code>.env</code>, then add your public addresses below. Never enter a seed phrase.`;
  if (a.connector === 'moomoo') return `Runs through OpenD on your Mac: <code>python3 bridges/moomoo_export.py</code> pushes positions here (set ${env('BRIDGE_TOKEN')}). Or import a positions screenshot or CSV.`;
  const tips = { CommBank: 'NetBank on a computer → account → Export → CSV.', ING: 'ING online banking → Transaction history → Export → CSV.', Maybank: 'Maybank2u → Statements → download the PDF.', DBS: 'digibank → account → transaction history → download, or the PDF eStatement.' };
  return (tips[a.institution] || 'Import a CSV export, a PDF statement or a screenshot.') + ' Overlapping exports are fine; duplicates are skipped.';
}

function accountSheet(id) {
  const a = S.st.summary.accounts.find(x => x.id === id); if (!a) return;
  const hs = S.st.summary.holdings.filter(h => h.accountId === id);
  const conn = S.st.meta.connectors?.[id] || {};
  const server = S.api.kind === 'server' && !S.st.meta.demo;
  const canSync = server && ['ibkr', 'binance', 'zerion'].includes(a.connector);
  const ai = S.st.meta.ai;
  openSheet(a.name, `
    <div class="hero" style="padding:0"><span class="big" style="font-size:32px">${a.holdingCount ? money(a.total) : '—'}</span>
      <span class="sub"><span class="status ${a.status}">${a.status === 'error' ? 'Sync failed' : a.status === 'empty' ? 'Not loaded yet' : 'Updated ' + ago(a.lastSync || a.lastImport)}</span><span>· ${esc(METHOD[a.connector] || 'Import')}</span></span></div>
    ${a.lastError ? `<div class="banner err">${esc(a.lastError)}</div>` : ''}
    <p class="help">${connectorHelp(a, conn.ready)}</p>
    ${canSync ? `<button class="btn-p" data-act="sync" data-id="${esc(id)}" ${conn.ready ? '' : 'disabled'}>${I.sync.replace('<svg', '<svg width="18" height="18" style="vertical-align:-4px;margin-right:6px"')}Sync now</button>` : ''}
    ${a.connector === 'zerion' ? `<div class="field"><label for="addrs">Public wallet addresses, one per line</label><textarea class="input" id="addrs" placeholder="0x… or a Solana address">${esc((a.config?.addresses || []).join('\n'))}</textarea><button class="btn-s" data-act="saveaddr" data-id="${esc(id)}">Save addresses</button></div>` : ''}
    <div class="drop" id="drop">${I.upload}<b>Import a statement or screenshot</b><span class="help">CSV${ai ? ', PDF or screenshot' : server ? ' (PDF and screenshots need ANTHROPIC_API_KEY on the server)' : ''}. Nothing is saved until you check it.</span>
      <label class="btn-s" style="cursor:pointer;flex:none">Choose file<input type="file" id="file" multiple accept=".csv,.tsv,.txt${ai ? ',.pdf,image/*' : ''}" hidden></label>
      <button class="link help" data-act="pastetoggle" style="color:var(--accent);font-weight:600">or paste text</button>
      <textarea class="input" id="paste" placeholder="Paste CSV rows here" hidden></textarea><button class="btn-s" id="pastego" data-act="pastego" data-id="${esc(id)}" hidden>Read pasted text</button>
    </div>
    <div id="importout"></div>
    ${a.tier === 'bank' ? `<div class="field"><label for="bal">Or just set the balance (${esc(a.ccy)})</label><div class="btnrow"><input class="input" id="bal" inputmode="decimal" style="flex:1" placeholder="0.00"><button class="btn-s" style="flex:none" data-act="setbal" data-id="${esc(id)}">Save</button></div></div>` : ''}
    ${hs.length ? `<div class="card flush" style="box-shadow:none;border:1px solid var(--line)"><div class="list">${hs.slice(0, 40).map(h => h.cls === 'cash' ? `<div class="row">${badge(h.ccy, CLASSES.cash.color)}<span class="t"><b>${esc(h.name)}</b><span>Cash</span></span><span class="r"><b>${money(h.valueBase)}</b>${h.ccy !== base() ? `<span class="muted">${S.privacy ? '' : esc(fmtMoney(h.value, h.ccy))}</span>` : ''}</span></div>` : holdingRow(h)).join('')}</div></div>` : ''}
    <details><summary class="help" style="cursor:pointer">Edit or delete this account</summary>
      <div style="display:grid;gap:12px;margin-top:12px">
        <div class="field"><label for="en">Name</label><input class="input" id="en" value="${esc(a.name)}"></div>
        <div class="btnrow"><div class="field" style="flex:1"><label for="et">Kind</label><select class="input" id="et">${TIERS.map(t => `<option value="${t.id}" ${t.id === a.tier ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>
        <div class="field" style="flex:1"><label for="ec">Currency</label><select class="input" id="ec">${CURRENCIES.map(c => `<option ${c === a.ccy ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
        <div class="btnrow"><button class="btn-s" data-act="saveacct" data-id="${esc(id)}">Save changes</button><button class="btn-d" data-act="delacct" data-id="${esc(id)}">Delete</button></div>
      </div></details>`, sh => {
    const drop = sh.querySelector('#drop'), file = sh.querySelector('#file');
    file.addEventListener('change', () => runImport(id, file.files));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); runImport(id, e.dataTransfer.files); });
  });
}

let pending = null;
async function runImport(id, files, text) {
  const out = $('#importout'); if (!out) return;
  out.innerHTML = `<p class="help">Reading${[...(files || [])].some(f => !/csv|text/.test(f.type)) ? ' with Claude, this can take up to a minute' : ''}…</p>`;
  try {
    const r = await S.api.importFiles(id, files || [], text);
    pending = { id, r };
    const acct = S.st.summary.accounts.find(a => a.id === id);
    if (r.kind === 'transactions') {
      const ds = r.transactions.map(t => t.date).sort();
      out.innerHTML = `<div class="banner">${esc(r.format)}: <b>${r.transactions.length}</b> transaction${r.transactions.length === 1 ? '' : 's'} from ${esc(fmtDate(ds[0]))} to ${esc(fmtDate(ds.at(-1)))}${r.balance ? `, balance <b>${S.privacy ? '••••' : esc(fmtMoney(r.balance.amount, acct.ccy))}</b> on ${esc(fmtDate(r.balance.date))}` : ''}.</div>
        ${(r.warnings || []).map(w => `<div class="banner warn">${esc(w)}</div>`).join('')}
        <div class="preview"><table><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody>${r.transactions.slice(0, 60).map(t => `<tr><td>${esc(fmtDate(t.date))}</td><td>${esc(t.desc.slice(0, 40))}</td><td class="n ${t.amount > 0 ? 'pos' : ''}">${S.privacy ? '••' : esc(fmtMoney(t.amount, acct.ccy))}</td></tr>`).join('')}</tbody></table></div>
        <div class="btnrow"><button class="btn-p" data-act="commit">Save ${r.transactions.length} transaction${r.transactions.length === 1 ? '' : 's'}</button><button class="btn-s" data-act="cancelimport">Cancel</button></div>`;
    } else {
      out.innerHTML = `<div class="banner">${esc(r.format)}: <b>${r.holdings.length}</b> positions. Saving replaces what this account holds now.</div>
        ${(r.warnings || []).map(w => `<div class="banner warn">${esc(w)}</div>`).join('')}
        <div class="preview"><table><thead><tr><th>Holding</th><th style="text-align:right">Qty</th><th style="text-align:right">Value</th><th style="text-align:right">Cost</th></tr></thead><tbody>${r.holdings.map(h => `<tr><td>${esc(h.symbol)} <span class="muted">${esc(h.cls)}</span></td><td class="n">${esc(h.qty ?? '')}</td><td class="n">${S.privacy ? '••' : esc(fmtMoney(h.value, h.ccy || acct.ccy))}</td><td class="n">${h.cost !== null && h.cost !== undefined && !S.privacy ? esc(fmtMoney(h.cost, h.ccy || acct.ccy)) : ''}</td></tr>`).join('')}</tbody></table></div>
        <div class="btnrow"><button class="btn-p" data-act="commit">Save ${r.holdings.length} positions</button><button class="btn-s" data-act="cancelimport">Cancel</button></div>`;
    }
  } catch (e) { pending = null; out.innerHTML = `<div class="banner err">${esc(e.message)}</div>`; }
}

function baseSheet() {
  openSheet('Display currency', `<div class="catgrid">${CURRENCIES.map(c => `<button data-act="setbase" data-v="${c}" aria-pressed="${c === base()}">${c}</button>`).join('')}</div><p class="help">Every balance, P&amp;L and transaction is converted at the current rates.</p>`);
}
function fxSheet() {
  const fx = S.st.settings.fx || {}, ov = S.st.settings.fxOverrides || {};
  const server = S.api.kind === 'server' && !S.st.meta.demo;
  openSheet('Exchange rates', `
    <p class="help">Units per 1 USD${S.st.settings.fxDate ? `, from central-bank reference rates on ${esc(S.st.settings.fxDate)}` : ' (built-in approximate rates)'}. Type a number to override one.</p>
    <dl class="kv">${CURRENCIES.filter(c => c !== 'USD').map(c => `<dt>${c}</dt><dd><input class="input" style="width:130px;text-align:right;padding:7px 10px" inputmode="decimal" data-fx="${c}" value="${ov[c] ?? fx[c] ?? ''}" aria-label="${c} per USD"></dd>`).join('')}</dl>
    <div class="btnrow"><button class="btn-p" data-act="savefx">Save rates</button>${server ? '<button class="btn-s" data-act="refreshfx">Get latest</button>' : ''}</div>`);
}

function renderLogin() {
  $('#app').innerHTML = `<form class="login" id="login"><h1>Asset Hub</h1><p class="help">Enter your passcode.</p><input class="input" type="password" id="pc" autocomplete="current-password" aria-label="Passcode" autofocus><button class="btn-p">Unlock</button><p class="help" id="lerr" role="alert"></p></form>`;
  $('#login').addEventListener('submit', async e => {
    e.preventDefault();
    try { await S.api.login($('#pc').value); await load(); } catch (err) { $('#lerr').textContent = err.message; }
  });
}

/* ---------------- actions ---------------- */
async function reload(msg) { S.st = await S.api.state(); render(); if (msg) toast(msg); }
const ACT = {
  close: () => closeSheet(),
  tab: d => { location.hash = d.v; },
  privacy: () => { S.privacy = !S.privacy; store.set('privacy', S.privacy); render(); if (sheetEl) closeSheet(true); },
  range: d => { S.range = d.v; store.set('range', S.range); render(); },
  dist: d => { S.distBy = d.v; store.set('distBy', S.distBy); render(); },
  ifilter: d => { S.investFilter = S.investFilter === d.v ? 'all' : d.v; if (S.tab !== 'invest') location.hash = 'invest'; else render(); },
  isort: d => { S.investSort = d.v; render(); },
  month: d => { S.month = d.v; S.cat = null; render(); },
  cat: d => { S.cat = d.v && S.cat !== d.v ? d.v : null; render(); setTimeout(() => $('#txlist')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); },
  holding: d => holdingSheet(d.id),
  tx: d => txSheet(d.id),
  account: d => accountSheet(d.id),
  add: d => addSheet(d.tier),
  base: () => baseSheet(),
  fx: () => fxSheet(),
  setbase: async d => { closeSheet(); await S.api.saveSettings({ base: d.v }); S.st = await S.api.state(d.v); render(); },
  saveavg: async d => { const v = $('#avg').value.trim(); await S.api.setAvgCost(d.id, v === '' ? null : +v); closeSheet(); reload('Cost saved'); },
  clearavg: async d => { await S.api.setAvgCost(d.id, null); closeSheet(); reload('Using the reported cost'); },
  setcat: async d => { await S.api.setCategory(d.id, d.v); closeSheet(); reload(d.v ? `Moved to ${d.v}` : 'Back to automatic'); },
  addtpl: async d => { const t = TEMPLATES.find(x => x.name === d.v); const { id } = await S.api.createAccount(t); closeSheet(true); await reload(`${t.name} added`); accountSheet(id); },
  addcustom: async () => { const name = $('#nn').value.trim(); if (!name) return $('#nn').focus(); const { id } = await S.api.createAccount({ name, institution: name, tier: $('#nt').value, ccy: $('#nc').value, connector: 'import' }); closeSheet(true); await reload(`${name} added`); accountSheet(id); },
  sync: async (d, el) => { el.disabled = true; el.textContent = 'Syncing…'; try { const r = await S.api.sync(d.id); closeSheet(); await reload(r.ok ? 'Synced' : 'Sync failed'); } catch (e) { toast(e.message); el.disabled = false; el.textContent = 'Sync now'; } },
  syncall: async (d, el) => { el.disabled = true; el.textContent = 'Syncing…'; try { await S.api.sync(); await reload('Everything synced'); } catch (e) { toast(e.message); render(); } },
  saveaddr: async d => { const addresses = $('#addrs').value.split(/[\s,]+/).filter(Boolean); const a = S.st.summary.accounts.find(x => x.id === d.id); await S.api.patchAccount(d.id, { config: { ...(a.config || {}), addresses } }); toast('Addresses saved'); },
  pastetoggle: () => { $('#paste').hidden = !$('#paste').hidden; $('#pastego').hidden = $('#paste').hidden; if (!$('#paste').hidden) $('#paste').focus(); },
  pastego: d => runImport(d.id, [], $('#paste').value),
  cancelimport: () => { pending = null; $('#importout').innerHTML = ''; },
  commit: async (d, el) => { if (!pending) return; el.disabled = true; const { id, r } = pending; const res = await S.api.commit(id, r); pending = null; closeSheet(); await reload(r.kind === 'transactions' ? `${res.added} new transaction${res.added === 1 ? '' : 's'} saved` : 'Positions saved'); },
  setbal: async d => { const v = $('#bal').value.trim(); if (v === '' || !isFinite(+v.replace(/,/g, ''))) return $('#bal').focus(); const a = S.st.summary.accounts.find(x => x.id === d.id); await S.api.commit(d.id, { kind: 'balance', amount: +v.replace(/,/g, ''), ccy: a.ccy }); closeSheet(); reload('Balance saved'); },
  saveacct: async d => { await S.api.patchAccount(d.id, { name: $('#en').value.trim() || undefined, tier: $('#et').value, ccy: $('#ec').value }); closeSheet(); reload('Saved'); },
  delacct: async (d, el) => {
    if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.textContent = 'Tap again to delete everything in it'; return; }
    await S.api.deleteAccount(d.id); closeSheet(); reload('Account deleted');
  },
  savefx: async () => { const o = {}; document.querySelectorAll('[data-fx]').forEach(i => { const v = +i.value; if (v > 0 && v !== (S.st.settings.fx || {})[i.dataset.fx]) o[i.dataset.fx] = v; }); await S.api.saveSettings({ fxOverrides: { ...(S.st.settings.fxOverrides || {}), ...o } }); closeSheet(); reload('Rates saved'); },
  refreshfx: async () => { try { await S.api.refreshFx(); closeSheet(); reload('Rates updated'); } catch (e) { toast(e.message); } },
};
async function onClick(e) {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A') return;
  e.preventDefault();
  try { await fn(el.dataset, el, e); } catch (err) { toast(err.message || 'Something went wrong'); }
}
document.addEventListener('input', e => {
  if (e.target.id === 'txq') {
    S.q = e.target.value;
    const cf = S.st.cashflow;
    const txs = cf.transactions.filter(t => t.date.startsWith(S.month) && (!S.cat || t.category === S.cat) && (!S.q || (t.desc + ' ' + t.category + ' ' + t.accountName).toLowerCase().includes(S.q.toLowerCase())));
    $('#txlist').innerHTML = txList(txs);
  }
});

boot();

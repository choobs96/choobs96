// Portfolio maths: distribution, P&L and history. Pure functions over a plain dataset,
// used by the server API and by the in-browser demo.
import { convert, normCcy } from './money.js';

export const CLASSES = {
  cash:   { name: 'Cash',          color: 'var(--c-cash)' },
  stock:  { name: 'Stocks',        color: 'var(--c-stock)' },
  etf:    { name: 'ETFs & funds',  color: 'var(--c-etf)' },
  bond:   { name: 'Bonds',         color: 'var(--c-bond)' },
  crypto: { name: 'Crypto',        color: 'var(--c-crypto)' },
  staked: { name: 'Staked & DeFi', color: 'var(--c-staked)' },
  stable: { name: 'Stablecoins',   color: 'var(--c-stable)' },
  other:  { name: 'Other',         color: 'var(--c-other)' },
  loan:   { name: 'Loans',         color: 'var(--c-loan)' },
};
export const INVEST_CLASSES = new Set(['stock', 'etf', 'bond', 'crypto', 'staked', 'stable', 'other']);
export const TIERS = [
  { id: 'broker',   n: 1, name: 'Brokers' },
  { id: 'bank',     n: 2, name: 'Banks' },
  { id: 'exchange', n: 3, name: 'Exchanges' },
  { id: 'wallet',   n: 4, name: 'Wallets' },
];

const CCY_REGION = { AUD: 'Australia', USD: 'United States', MYR: 'Malaysia', SGD: 'Singapore', HKD: 'Hong Kong', EUR: 'Europe', GBP: 'United Kingdom', CNY: 'China', JPY: 'Japan' };
const EXCH_REGION = [
  [/^(NASDAQ|NYSE|ARCA|AMEX|BATS|PINK|IEX|US)/i, 'United States'],
  [/^(ASX|CHIXAU|AU)/i, 'Australia'],
  [/^(SEHK|HKEX|HK)/i, 'Hong Kong'],
  [/^(SGX|SG)/i, 'Singapore'],
  [/^(BURSA|MYX|KLSE|MY)/i, 'Malaysia'],
];

export function regionOf(h) {
  if (h.region) return h.region;
  if (['crypto', 'staked', 'stable', 'loan'].includes(h.cls)) return 'Crypto (global)';
  if (h.cls !== 'cash' && h.exchange) {
    for (const [re, r] of EXCH_REGION) if (re.test(h.exchange)) return r;
  }
  return CCY_REGION[normCcy(h.ccy)] || 'Other';
}

export function holdingValue(h) {
  if (h.value !== null && h.value !== undefined && isFinite(h.value)) return +h.value;
  if (isFinite(h.qty) && isFinite(h.price) && h.qty !== null && h.price !== null) return h.qty * h.price;
  return null;
}
export function holdingCost(h) {
  if (h.avgCost !== null && h.avgCost !== undefined && isFinite(h.avgCost) && isFinite(h.qty)) return h.avgCost * h.qty;
  if (h.cost !== null && h.cost !== undefined && isFinite(h.cost)) return +h.cost;
  return null;
}

function group(items, keyFn, nameFn, colorFn) {
  const m = new Map();
  for (const it of items) {
    if (!it.valueBase) continue;
    const k = keyFn(it);
    const g = m.get(k) || { key: k, name: nameFn(k, it), color: colorFn ? colorFn(k, it) : null, value: 0, count: 0 };
    g.value += it.valueBase; g.count++;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.value - a.value);
}

const DAY = 864e5;
export function daysSince(iso, now = Date.now()) {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY));
}

/**
 * @param data {accounts, holdings, realized, snapshots, settings:{base, fx}}
 */
export function summarize(data, opts = {}) {
  const base = opts.base || data.settings?.base || 'AUD';
  const fx = { ...(data.settings?.fx || {}) };
  const now = opts.now || Date.now();
  const accounts = new Map((data.accounts || []).map(a => [a.id, a]));

  const holdings = (data.holdings || []).map(h => {
    const acct = accounts.get(h.accountId) || {};
    const ccy = h.ccy || acct.ccy || 'USD';
    const value = holdingValue(h);
    const cost = holdingCost(h);
    const valueBase = value === null ? null : convert(value, ccy, base, fx);
    const costBase = cost === null ? null : convert(cost, ccy, base, fx);
    const pnl = value !== null && cost !== null ? value - cost : null;
    const pnlBase = valueBase !== null && costBase !== null ? valueBase - costBase : null;
    return {
      ...h, ccy, cls: CLASSES[h.cls] ? h.cls : 'other',
      accountName: acct.name || '?', institution: acct.institution || acct.name || '?', tier: acct.tier || 'other',
      value, cost, valueBase, costBase, pnl, pnlBase,
      pnlPct: pnl !== null && cost ? pnl / Math.abs(cost) : null,
      region: regionOf({ ...h, ccy }),
      missingFx: value !== null && valueBase === null,
    };
  });

  const assets = holdings.filter(h => h.valueBase > 0).reduce((s, h) => s + h.valueBase, 0);
  const liabilities = -holdings.filter(h => h.valueBase < 0).reduce((s, h) => s + h.valueBase, 0);
  const netWorth = assets - liabilities;
  const positive = holdings.filter(h => h.valueBase > 0);

  const byClass = group(positive, h => h.cls, k => CLASSES[k].name, k => CLASSES[k].color);
  const byPlatform = group(positive, h => h.accountId, (k, h) => h.accountName);
  const byInstitution = group(positive, h => h.institution, k => k);
  const byCurrency = group(positive, h => normCcy(h.ccy), k => k);
  const byRegion = group(positive, h => h.region, k => k);
  const byTier = group(positive, h => h.tier, k => (TIERS.find(t => t.id === k)?.name || 'Other'));
  for (const arr of [byClass, byPlatform, byInstitution, byCurrency, byRegion, byTier]) for (const g of arr) g.share = assets ? g.value / assets : 0;

  // Investments and P&L
  const inv = holdings.filter(h => INVEST_CLASSES.has(h.cls) && h.valueBase !== null);
  const withCost = inv.filter(h => h.pnlBase !== null);
  const investValue = inv.reduce((s, h) => s + h.valueBase, 0);
  const costKnownValue = withCost.reduce((s, h) => s + h.valueBase, 0);
  const costTotal = withCost.reduce((s, h) => s + h.costBase, 0);
  const unrealized = withCost.reduce((s, h) => s + h.pnlBase, 0);
  const year = new Date(now).getFullYear();
  const realizedRows = (data.realized || []).map(r => ({ ...r, pnlBase: convert(r.pnl, r.ccy || accounts.get(r.accountId)?.ccy || 'USD', base, fx) })).filter(r => r.pnlBase !== null);
  const realizedYtd = realizedRows.filter(r => String(r.date).startsWith(String(year))).reduce((s, r) => s + r.pnlBase, 0);
  const realizedAll = realizedRows.reduce((s, r) => s + r.pnlBase, 0);
  const pnlByPlatform = [...new Set(inv.map(h => h.accountId))].map(id => {
    const hs = inv.filter(h => h.accountId === id), wc = hs.filter(h => h.pnlBase !== null);
    const c = wc.reduce((s, h) => s + h.costBase, 0), p = wc.reduce((s, h) => s + h.pnlBase, 0);
    return { accountId: id, name: hs[0].accountName, value: hs.reduce((s, h) => s + h.valueBase, 0), cost: c, pnl: p, pnlPct: c ? p / c : null, unknown: hs.length - wc.length,
      realized: realizedRows.filter(r => r.accountId === id).reduce((s, r) => s + r.pnlBase, 0) };
  }).sort((a, b) => b.value - a.value);
  const ranked = withCost.filter(h => Math.abs(h.valueBase) > 1).slice().sort((a, b) => b.pnlBase - a.pnlBase);

  // History (stored as USD totals; shown in the current base at today's rates)
  const snaps = (data.snapshots || []).slice().sort((a, b) => a.date < b.date ? -1 : 1)
    .map(s => ({ date: s.date, value: convert(s.totalUsd, 'USD', base, fx) })).filter(s => s.value !== null);
  const today = new Date(now).toISOString().slice(0, 10);
  const lastBefore = days => { const cut = new Date(now - days * DAY).toISOString().slice(0, 10); return [...snaps].reverse().find(s => s.date <= cut && s.date < today); };
  const change = days => { const p = lastBefore(days); return p && p.value ? { abs: netWorth - p.value, pct: (netWorth - p.value) / Math.abs(p.value), since: p.date } : null; };

  const accountsOut = [...accounts.values()].map(a => {
    const hs = holdings.filter(h => h.accountId === a.id);
    const total = hs.reduce((s, h) => s + (h.valueBase || 0), 0);
    const age = daysSince(a.lastSync || a.lastImport, now);
    const status = a.lastError ? 'error' : !hs.length ? 'empty' : age === null ? 'empty' : age > 30 ? 'stale' : age > 3 && a.connector !== 'import' && a.connector !== 'manual' ? 'behind' : 'fresh';
    return { ...a, total, holdingCount: hs.length, ageDays: age, status };
  }).sort((a, b) => (TIERS.findIndex(t => t.id === a.tier) - TIERS.findIndex(t => t.id === b.tier)) || ((a.sort ?? 99) - (b.sort ?? 99)) || a.name.localeCompare(b.name));

  return {
    base, asOf: new Date(now).toISOString(), netWorth, assets, liabilities,
    byClass, byPlatform, byInstitution, byCurrency, byRegion, byTier,
    holdings: holdings.sort((a, b) => (b.valueBase || 0) - (a.valueBase || 0)),
    invest: {
      value: investValue, costKnownValue, cost: costTotal, unrealized, unrealizedPct: costTotal ? unrealized / costTotal : null,
      unknownCost: inv.length - withCost.length, realizedYtd, realizedAll, year, byPlatform: pnlByPlatform,
      gainers: ranked.filter(h => h.pnlBase > 0).slice(0, 5), losers: ranked.filter(h => h.pnlBase < 0).reverse().slice(0, 5),
    },
    history: snaps, change: { d1: change(1), d30: change(30), d365: change(365) },
    accounts: accountsOut,
    missingFx: [...new Set(holdings.filter(h => h.missingFx).map(h => h.ccy))],
  };
}

/** Net worth in USD for storing a daily snapshot. */
export function snapshotUsd(data) {
  const s = summarize(data, { base: 'USD' });
  return { totalUsd: Math.round(s.netWorth * 100) / 100, byClass: Object.fromEntries(s.byClass.map(g => [g.key, Math.round(g.value)])) };
}

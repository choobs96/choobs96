// Runs connectors, writes results, and records a daily net-worth snapshot.
import { syncIbkr } from './connectors/ibkr.js';
import { syncBinance } from './connectors/binance.js';
import { syncZerion } from './connectors/zerion.js';
import { fetchFx } from './fx.js';
import { snapshotUsd } from '../public/shared/portfolio.js';

export const CONNECTORS = {
  ibkr: { name: 'IBKR Flex Web Service', run: syncIbkr, env: ['IBKR_FLEX_TOKEN', 'IBKR_FLEX_QUERY_ID'] },
  binance: { name: 'Binance read-only API', run: syncBinance, env: ['BINANCE_API_KEY', 'BINANCE_API_SECRET'] },
  zerion: { name: 'Zerion wallet API', run: syncZerion, env: ['ZERION_API_KEY'] },
};

export function connectorReady(account, env) {
  const c = CONNECTORS[account.connector];
  if (!c) return false;
  return c.env.every(k => env[k] || (k === 'IBKR_FLEX_TOKEN' && account.config?.token) || (k === 'IBKR_FLEX_QUERY_ID' && account.config?.queryId));
}

export async function syncAccount(store, id, deps) {
  const account = store.account(id);
  if (!account) throw new Error('No such account');
  const c = CONNECTORS[account.connector];
  if (!c) throw new Error('This account is updated by importing files, not by syncing.');
  try {
    const r = await c.run(account, deps);
    store.replaceHoldings(id, r.holdings);
    if (r.realized) store.replaceRealized(id, r.realized);
    store.patchAccount(id, { lastSync: new Date().toISOString(), lastError: null, asOf: r.asOf || null });
    return { ok: true, holdings: r.holdings.length };
  } catch (e) {
    store.patchAccount(id, { lastError: e.message, lastErrorAt: new Date().toISOString() });
    return { ok: false, error: e.message };
  }
}

export async function refreshFx(store, deps) {
  try {
    const { rates, date } = await fetchFx(deps);
    store.setSetting('fx', rates); store.setSetting('fxDate', date);
    return { ok: true, date };
  } catch (e) { return { ok: false, error: e.message }; }
}

export function recordSnapshot(store, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  store.putSnapshot(date, snapshotUsd(store.dataset()));
}

export async function syncAll(store, deps) {
  const results = { fx: await refreshFx(store, deps) };
  for (const a of store.accounts()) {
    if (!CONNECTORS[a.connector]) continue;
    if (!connectorReady(a, deps.env)) { results[a.id] = { ok: false, skipped: true }; continue; }
    results[a.id] = await syncAccount(store, a.id, deps);
  }
  recordSnapshot(store);
  return results;
}

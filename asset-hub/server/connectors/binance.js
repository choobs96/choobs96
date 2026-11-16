// Binance, read-only API key (only "Enable Reading" ticked).
import { createHmac } from 'node:crypto';

const BASE = 'https://api.binance.com';
const STABLES = new Set(['USDT', 'USDC', 'FDUSD', 'TUSD', 'DAI', 'BUSD', 'USDP', 'USDE']);
const NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', BNB: 'BNB', SOL: 'Solana', XRP: 'XRP', ADA: 'Cardano', DOGE: 'Dogecoin', USDT: 'Tether', USDC: 'USD Coin', FDUSD: 'First Digital USD' };

export function sign(query, secret) { return createHmac('sha256', secret).update(query).digest('hex'); }

export function valueBalances({ spot = [], funding = [], flexible = [], locked = [] }, prices) {
  const px = asset => STABLES.has(asset) ? 1 : prices[asset + 'USDT'] ?? prices[asset + 'FDUSD'] ?? prices[asset + 'USDC'] ?? null;
  const rows = [];
  const add = (asset, qty, sub, cls) => {
    if (!(qty > 0)) return;
    const price = px(asset);
    rows.push({ symbol: asset, name: (NAMES[asset] || asset) + (sub === 'Spot' ? '' : ` (${sub})`), cls: cls || (STABLES.has(asset) ? 'stable' : 'crypto'), ccy: 'USD', qty, price, value: price === null ? null : qty * price, sub });
  };
  // Spot shows Simple Earn flexible holdings as LD* tokens; skip them, they come from the Earn endpoint.
  for (const b of spot) if (!/^LD/.test(b.asset)) add(b.asset, +b.free + +b.locked, 'Spot');
  for (const b of funding) add(b.asset, +b.free + +b.locked + +(b.freeze || 0), 'Funding');
  for (const r of flexible) add(r.asset, +r.totalAmount, 'Earn flexible', STABLES.has(r.asset) ? 'stable' : 'staked');
  for (const r of locked) add(r.asset, +r.amount, 'Earn locked', 'staked');
  return rows;
}

export async function syncBinance(account, { env, fetch = globalThis.fetch, now = Date.now } = {}) {
  const key = env.BINANCE_API_KEY, secret = env.BINANCE_API_SECRET;
  if (!key || !secret) throw new Error('Set BINANCE_API_KEY and BINANCE_API_SECRET in .env (read-only key).');
  const signed = async (method, path, params = {}) => {
    const q = new URLSearchParams({ ...params, timestamp: String(now()), recvWindow: '10000' }).toString();
    const r = await fetch(`${BASE}${path}?${q}&signature=${sign(q, secret)}`, { method, headers: { 'X-MBX-APIKEY': key } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Binance ${path}: ${body.msg || 'HTTP ' + r.status}`);
    return body;
  };
  const [acct, funding, flex, lock, tickers] = await Promise.all([
    signed('GET', '/api/v3/account', { omitZeroBalances: 'true' }),
    signed('POST', '/sapi/v1/asset/get-funding-asset').catch(() => []),
    signed('GET', '/sapi/v1/simple-earn/flexible/position', { size: '100' }).catch(() => ({ rows: [] })),
    signed('GET', '/sapi/v1/simple-earn/locked/position', { size: '100' }).catch(() => ({ rows: [] })),
    fetch(`${BASE}/api/v3/ticker/price`).then(r => r.json()),
  ]);
  const prices = Object.fromEntries((Array.isArray(tickers) ? tickers : []).map(t => [t.symbol, +t.price]));
  const holdings = valueBalances({ spot: acct.balances || [], funding, flexible: flex.rows || [], locked: lock.rows || [] }, prices)
    .filter(h => h.value === null || h.value >= 0.5); // drop dust
  return { holdings };
}

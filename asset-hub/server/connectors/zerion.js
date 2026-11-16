// On-chain wallets via the Zerion API (public addresses only).
// https://developers.zerion.io

const BASE = 'https://api.zerion.io/v1';
const STABLES = /^(USDT|USDC|USDC\.E|DAI|FDUSD|USDE|PYUSD|TUSD|LUSD|FRAX|USDS|GHO)$/i;

export function mapPositions(json, address) {
  const out = [];
  for (const p of json.data || []) {
    const a = p.attributes || {};
    const sym = a.fungible_info?.symbol || '?';
    const type = a.position_type || 'wallet';
    const chain = p.relationships?.chain?.data?.id || '';
    const protocol = a.application_metadata?.name || a.protocol || null;
    const qty = a.quantity?.float ?? null;
    const value = a.value ?? null;
    if (value === null && qty === null) continue;
    const isLoan = type === 'loan';
    const cls = isLoan ? 'loan' : type === 'wallet' ? (STABLES.test(sym) ? 'stable' : 'crypto') : 'staked';
    out.push({
      symbol: sym, name: a.fungible_info?.name || sym, cls, ccy: 'USD',
      qty, price: a.price ?? null, value: value === null ? null : (isLoan ? -Math.abs(value) : value),
      sub: [protocol || chain, type === 'wallet' ? null : type].filter(Boolean).join(' · ') || chain,
      chain, address: address.slice(0, 6) + '…' + address.slice(-4),
    });
  }
  return out.filter(h => h.value === null || Math.abs(h.value) >= 0.5);
}

export async function syncZerion(account, { env, fetch = globalThis.fetch } = {}) {
  const key = env.ZERION_API_KEY;
  if (!key) throw new Error('Set ZERION_API_KEY in .env (free developer key).');
  const addresses = (account.config?.addresses || []).filter(a => /^0x[0-9a-fA-F]{40}$/.test(a) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a));
  if (!addresses.length) throw new Error('Add at least one public wallet address to this account.');
  const auth = 'Basic ' + Buffer.from(key + ':').toString('base64');
  const holdings = [];
  for (const addr of addresses) {
    const url = `${BASE}/wallets/${addr}/positions/?filter[positions]=no_filter&filter[trash]=only_non_trash&currency=usd&sort=value`;
    const r = await fetch(url, { headers: { Authorization: auth, accept: 'application/json' } });
    if (!r.ok) throw new Error(`Zerion ${r.status} for ${addr.slice(0, 6)}…`);
    holdings.push(...mapPositions(await r.json(), addr));
  }
  return { holdings };
}

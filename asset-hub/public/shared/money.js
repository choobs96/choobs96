// Currency maths shared by the server and the browser.
// FX is stored as "units of currency per 1 USD" (Frankfurter with base=USD).

export const CURRENCIES = ['AUD', 'USD', 'MYR', 'SGD', 'HKD', 'EUR', 'GBP', 'CNY', 'JPY'];

export const DEFAULT_FX = {
  // Approximate, mid-November 2026. Replaced by live rates on the server.
  USD: 1, AUD: 1.53, MYR: 4.25, SGD: 1.30, HKD: 7.78, EUR: 0.865, GBP: 0.76, CNY: 7.18, JPY: 152,
};

// Stablecoins are priced as USD.
const ALIASES = { USDT: 'USD', USDC: 'USD', FDUSD: 'USD', DAI: 'USD', BUSD: 'USD', TUSD: 'USD', USDE: 'USD' };

export function normCcy(c) {
  const u = String(c || '').toUpperCase().trim();
  return ALIASES[u] || u;
}

export function convert(value, from, to, rates = DEFAULT_FX) {
  if (value === null || value === undefined || !isFinite(value)) return null;
  const f = normCcy(from), t = normCcy(to);
  if (f === t) return value;
  const rf = rates[f], rt = rates[t];
  if (!rf || !rt) return null;
  return value / rf * rt;
}

export function round(n, dp = 2) {
  if (n === null || n === undefined || !isFinite(n)) return n;
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

export function fmtMoney(v, ccy, { compact = false, sign = false, dp } = {}) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const abs = Math.abs(v);
  let s;
  if (compact && abs >= 1e6) s = (abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2) + 'M';
  else if (compact && abs >= 1e4) s = (abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1) + 'k';
  else {
    const d = dp ?? (abs < 100 ? 2 : 0);
    s = abs.toLocaleString('en-AU', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  const sym = { AUD: 'A$', USD: 'US$', SGD: 'S$', MYR: 'RM', HKD: 'HK$', EUR: '€', GBP: '£', JPY: '¥', CNY: 'CN¥' }[ccy] ?? (ccy ? ccy + ' ' : '');
  const pre = v < 0 ? '−' : sign && v > 0 ? '+' : '';
  return pre + sym + s;
}

export function fmtPct(p, { sign = true, dp = 1 } = {}) {
  if (p === null || p === undefined || !isFinite(p)) return '—';
  return (p < 0 ? '−' : sign && p > 0 ? '+' : '') + Math.abs(p * 100).toFixed(dp) + '%';
}

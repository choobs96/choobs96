// Daily FX from Frankfurter (central-bank reference rates, free, no key).
import { CURRENCIES } from '../public/shared/money.js';

export async function fetchFx({ fetch = globalThis.fetch } = {}) {
  const want = CURRENCIES.filter(c => c !== 'USD').join(',');
  const urls = [`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${want}`, `https://api.frankfurter.app/latest?from=USD&to=${want}`];
  let last;
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j.rates) throw new Error('no rates');
      return { rates: { USD: 1, ...j.rates }, date: j.date };
    } catch (e) { last = e; }
  }
  throw new Error('FX update failed: ' + (last?.message || 'unknown'));
}

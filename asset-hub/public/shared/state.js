// One call that turns the raw dataset into everything the UI renders.
import { summarize } from './portfolio.js';
import { cashflow } from './cashflow.js';

export function buildState(data, { now = Date.now(), base, meta = {} } = {}) {
  const b = base || data.settings?.base || 'AUD';
  const summary = summarize(data, { base: b, now });
  const cf = cashflow(data, { base: b, now, months: 12 });
  return {
    summary,
    cashflow: { ...cf, transactions: cf.transactions.slice(0, 2000) },
    settings: { base: b, fxDate: data.settings?.fxDate || null, fx: data.settings?.fx || {}, fxOverrides: data.settings?.fxOverrides || {} },
    meta,
  };
}

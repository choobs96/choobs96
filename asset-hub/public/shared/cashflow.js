// Cash-flow analysis over bank transactions: categories, salary, transfers, recurring bills.
import { convert } from './money.js';
import { categorize, payeeKey, CATEGORY_META } from './rules.js';

const DAY = 864e5;
const toDay = s => Math.floor(new Date(s + 'T00:00:00Z').getTime() / DAY);
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Pair equal and opposite amounts between two of your own accounts within 3 days. */
export function findTransferPairs(txs) {
  const ids = new Set();
  const credits = txs.filter(t => t.amount > 0);
  const used = new Set();
  for (const d of txs) {
    if (d.amount >= 0) continue;
    const dd = toDay(d.date);
    const match = credits.find(c => !used.has(c.id) && c.accountId !== d.accountId && c.ccy === d.ccy &&
      Math.abs(c.amount + d.amount) < 0.005 && Math.abs(toDay(c.date) - dd) <= 3);
    if (match) { used.add(match.id); ids.add(match.id); ids.add(d.id); }
  }
  return ids;
}

/** Recurring credits from one payer (monthly or fortnightly, similar size) are salary. */
export function findSalaryPayees(txs) {
  const groups = new Map();
  for (const t of txs) {
    if (t.amount <= 0 || ['Transfer', 'Investing', 'Interest', 'Dividends', 'Refunds'].includes(t.category)) continue;
    const k = t.accountId + '|' + payeeKey(t.desc);
    (groups.get(k) || groups.set(k, []).get(k)).push(t);
  }
  const payees = new Set();
  for (const [k, g] of groups) {
    if (g.some(t => t.category === 'Salary')) { payees.add(k); continue; }
    if (g.length < 3) continue;
    const amts = g.map(t => t.amount), med = median(amts);
    if (med < 400) continue;
    if (amts.filter(a => Math.abs(a - med) / med <= 0.2).length < g.length * 0.75) continue;
    const days = g.map(t => toDay(t.date)).sort((a, b) => a - b);
    const gaps = days.slice(1).map((d, i) => d - days[i]);
    const gap = median(gaps);
    if ((gap >= 12 && gap <= 16) || (gap >= 26 && gap <= 35)) payees.add(k);
  }
  return payees;
}

/** Debits to the same merchant in 3+ months at a similar amount. */
const RECURRING_CATS = new Set(['Subscriptions', 'Bills & utilities', 'Rent & housing', 'Health', 'Fees & tax', 'Entertainment', 'Other', 'Transport']);
export function findRecurring(txs) {
  const groups = new Map();
  for (const t of txs) {
    if (t.amount >= 0 || !RECURRING_CATS.has(t.category)) continue;
    const k = payeeKey(t.desc);
    (groups.get(k) || groups.set(k, []).get(k)).push(t);
  }
  const out = [];
  for (const [k, g] of groups) {
    const months = new Set(g.map(t => t.date.slice(0, 7)));
    if (months.size < 3) continue;
    const med = median(g.map(t => -t.amount));
    const similar = g.filter(t => Math.abs(-t.amount - med) / med <= 0.15);
    // A bill is the same amount every time and at most a couple of times a month.
    if (similar.length < 3 || similar.length < g.length * 0.7 || g.length > months.size * 2.5) continue;
    const last = g.map(t => t.date).sort().pop();
    const total = similar.reduce((s, t) => s - t.amount, 0);
    // Spread over the whole span (a quarterly bill is a third of its amount per month).
    const sorted = [...months].sort(), [fy, fm] = sorted[0].split('-').map(Number), [ly, lm] = sorted.at(-1).split('-').map(Number);
    const gaps = sorted.slice(1).map((m, i) => { const [y1, m1] = sorted[i].split('-').map(Number), [y2, m2] = m.split('-').map(Number); return (y2 - y1) * 12 + m2 - m1; });
    const span = (ly - fy) * 12 + lm - fm + median(gaps.length ? gaps : [1]);
    out.push({ payee: k, category: g[g.length - 1].category, amount: med, ccy: g[0].ccy, months: months.size, every: median(gaps.length ? gaps : [1]), last, perMonth: total / Math.max(1, span) });
  }
  return out.sort((a, b) => b.perMonth - a.perMonth);
}

/** Classify every transaction (keeps manual overrides) and return enriched rows. */
export function classify(txsIn) {
  const txs = txsIn.map(t => ({ ...t, category: t.categoryOverride || categorize(t), auto: !t.categoryOverride }));
  const pairs = findTransferPairs(txs.filter(t => t.auto && CATEGORY_META[t.category]?.kind !== 'invest'));
  for (const t of txs) if (t.auto && pairs.has(t.id)) t.category = 'Transfer';
  const salary = findSalaryPayees(txs);
  for (const t of txs) if (t.auto && t.amount > 0 && salary.has(t.accountId + '|' + payeeKey(t.desc))) t.category = 'Salary';
  return txs;
}

export function cashflow(data, opts = {}) {
  const base = opts.base || data.settings?.base || 'AUD';
  const fx = data.settings?.fx || {};
  const now = opts.now || Date.now();
  const nMonths = opts.months || 12;
  const accounts = new Map((data.accounts || []).map(a => [a.id, a]));
  const txs = classify((data.transactions || []).map(t => ({ ...t, ccy: t.ccy || accounts.get(t.accountId)?.ccy || 'AUD' })))
    .map(t => ({ ...t, amountBase: convert(t.amount, t.ccy, base, fx), kind: CATEGORY_META[t.category]?.kind || 'spend', accountName: accounts.get(t.accountId)?.name || '?' }))
    .filter(t => t.amountBase !== null)
    .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

  const d = new Date(now);
  const monthKeys = [];
  for (let i = nMonths - 1; i >= 0; i--) { const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)); monthKeys.push(m.toISOString().slice(0, 7)); }
  const months = monthKeys.map(key => {
    const ts = txs.filter(t => t.date.startsWith(key));
    const sum = f => ts.filter(f).reduce((s, t) => s + t.amountBase, 0);
    const income = sum(t => t.kind === 'income' && t.amountBase > 0);
    const salary = sum(t => t.category === 'Salary');
    const spending = -sum(t => t.kind === 'spend');
    const invested = -sum(t => t.kind === 'invest');
    const cats = new Map();
    for (const t of ts.filter(t => t.kind === 'spend')) cats.set(t.category, (cats.get(t.category) || 0) - t.amountBase);
    return { key, income, salary, spending, invested, net: income - spending, savingsRate: income > 0 ? (income - spending) / income : null,
      byCategory: [...cats.entries()].map(([name, value]) => ({ name, value, color: CATEGORY_META[name]?.color })).filter(c => c.value > 0.005).sort((a, b) => b.value - a.value),
      count: ts.length };
  });
  const active = months.filter(m => m.count > 0);
  const avg = f => active.length ? active.reduce((s, m) => s + f(m), 0) / active.length : 0;

  const salaryTx = txs.filter(t => t.category === 'Salary');
  const lastSalary = salaryTx[0] || null;
  const salaryPayees = [...new Set(salaryTx.map(t => payeeKey(t.desc)))];

  return {
    base, months, transactions: txs,
    averages: { income: avg(m => m.income), spending: avg(m => m.spending), invested: avg(m => m.invested), savingsRate: (() => { const i = avg(m => m.income); return i ? (i - avg(m => m.spending)) / i : null; })() },
    salary: lastSalary ? { last: lastSalary, payees: salaryPayees, monthly: (() => { const w = months.filter(m => m.salary > 0); return w.length ? w.reduce((s, m) => s + m.salary, 0) / w.length : 0; })() } : null,
    recurring: findRecurring(txs).map(r => ({ ...r, perMonthBase: convert(r.perMonth, r.ccy, base, fx) })),
    range: txs.length ? { from: txs[txs.length - 1].date, to: txs[0].date } : null,
  };
}

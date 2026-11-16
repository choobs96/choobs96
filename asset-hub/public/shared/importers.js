// File importers for bank and broker exports. Pure functions, used server-side and in the demo.

export function parseCSV(text) {
  const s = String(text).replace(/^﻿/, '');
  const delim = (() => { const first = s.split(/\r?\n/).slice(0, 5).join('\n'); const c = (first.match(/,/g) || []).length, t = (first.match(/\t/g) || []).length, sc = (first.match(/;/g) || []).length; return t > c && t > sc ? '\t' : sc > c ? ';' : ','; })();
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row.map(c => c.trim()));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rows.push(row.map(c => c.trim()));
  return rows;
}

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');
function ymd(y, m, d) {
  y = +y; m = +m; d = +d;
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1990 && y < 2100)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
/** Day-first by default (AU, MY, SG). */
export function parseDate(v, order = 'dmy') {
  const s = String(v || '').trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return ymd(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return ymd(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) return order === 'mdy' ? ymd(m[3], m[1], m[2]) : ymd(m[3], m[2], m[1]);
  if ((m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,4})[a-z]*[\s-,]+(\d{2,4})/))) return MON[m[2].toLowerCase()] ? ymd(m[3], MON[m[2].toLowerCase()], m[1]) : null;
  if ((m = s.match(/^([A-Za-z]{3,4})[a-z]*\s+(\d{1,2}),?\s+(\d{4})/))) return MON[m[1].toLowerCase()] ? ymd(m[3], MON[m[1].toLowerCase()], m[2]) : null;
  return null;
}

export function parseAmount(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/\bDR\b\.?$/i.test(s)) { neg = true; s = s.replace(/\bDR\b\.?$/i, ''); }
  s = s.replace(/\bCR\b\.?$/i, '');
  const firstDigit = s.search(/\d/);
  if (firstDigit < 0) return null;
  if (/[-−]/.test(s.slice(0, firstDigit)) || /-$/.test(s)) neg = true;
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

const H = {
  date: /^(transaction date|txn date|date|posting date|posted date|trade date|value date|tarikh)$/i,
  desc: /(description|details|narrative|particulars|transaction$|payee|memo|reference|ref\d?|keterangan|merchant)/i,
  amount: /^(amount|transaction amount|amount \(\w+\)|net amount|amaun)$/i,
  debit: /(debit|withdrawal|money out|paid out|dr$)/i,
  credit: /(credit|deposit|money in|paid in|cr$)/i,
  balance: /balance|baki/i,
  symbol: /^(symbol|ticker|code|stock code|instrument|security|asset|coin)$/i,
  qty: /^(quantity|qty|position|shares|units|holding|holdings|amount held|balance)$/i,
  price: /(last price|market price|current price|mark price|^price$|^last$|close price|nominal price)/i,
  value: /(market value|mkt value|position value|^value$|total value|market val)/i,
  cost: /(cost basis|total cost|^cost$|book cost|cost value)/i,
  avg: /(avg|average|diluted cost|unit cost|cost price)/i,
  ccy: /^(currency|ccy|curr)$/i,
  name: /^(name|description|security name|stock name|asset name)$/i,
};
function findHeader(rows, need) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i].map(c => c.replace(/[:*]/g, '').trim());
    if (need.every(n => (Array.isArray(n) ? n : [n]).some(k => r.some(c => H[k].test(c))))) return i;
  }
  return -1;
}
const col = (hdr, key, exclude = []) => hdr.findIndex((c, i) => !exclude.includes(i) && H[key].test(c.replace(/[:*]/g, '').trim()));

/** Try to read bank transactions. Returns null when the file isn't a transaction list. */
export function readBankCsv(rows) {
  if (!rows.length) return null;
  // CommBank NetBank: no header, [date, signed amount, description, balance]
  const cba = rows.filter(r => r.length >= 3 && parseDate(r[0]) && parseAmount(r[1]) !== null && !parseDate(r[2]));
  if (cba.length >= Math.max(1, rows.length * 0.8) && parseDate(rows[0][0])) {
    const tx = cba.map(r => ({ date: parseDate(r[0]), amount: parseAmount(r[1]), desc: r[2], balance: r.length > 3 ? parseAmount(r[3]) : null }));
    return { format: 'CommBank CSV', transactions: tx, balance: latestBalance(tx) };
  }
  const hi = findHeader(rows, ['date', ['amount', 'debit', 'credit']]);
  if (hi < 0) return null;
  const hdr = rows[hi];
  const iDate = col(hdr, 'date');
  const iAmt = col(hdr, 'amount');
  const iDebit = iAmt < 0 ? col(hdr, 'debit') : -1;
  const iCredit = iAmt < 0 ? col(hdr, 'credit', [iDebit]) : -1;
  const iBal = col(hdr, 'balance');
  const used = new Set([iDate, iAmt, iDebit, iCredit, iBal]);
  const iDescs = hdr.map((c, i) => i).filter(i => !used.has(i) && H.desc.test(hdr[i]));
  const tx = [];
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(r[iDate]);
    if (!date) continue;
    let amount;
    if (iAmt >= 0) amount = parseAmount(r[iAmt]);
    else { const d = parseAmount(r[iDebit]) || 0, c = parseAmount(r[iCredit]) || 0; amount = Math.abs(c) - Math.abs(d); if (!r[iDebit] && !r[iCredit]) amount = null; }
    if (amount === null || !isFinite(amount)) continue;
    const desc = iDescs.map(i => r[i]).filter(Boolean).join(' · ') || '(no description)';
    tx.push({ date, amount: Math.round(amount * 100) / 100, desc, balance: iBal >= 0 ? parseAmount(r[iBal]) : null });
  }
  if (!tx.length) return null;
  const fmt = /description/i.test(hdr.join()) && iCredit >= 0 && iDebit >= 0 && iBal >= 0 && hdr.length <= 6 ? 'ING-style CSV' : 'Bank CSV';
  return { format: fmt, transactions: tx, balance: latestBalance(tx) };
}

function latestBalance(tx) {
  // Exports can be newest-first or oldest-first; take the balance on the latest date,
  // and within that date the row that appears first in a newest-first file.
  const withBal = tx.filter(t => t.balance !== null && isFinite(t.balance));
  if (!withBal.length) return null;
  const newestFirst = tx.length > 1 && tx[0].date >= tx[tx.length - 1].date;
  const maxDate = withBal.reduce((m, t) => t.date > m ? t.date : m, '');
  const sameDay = withBal.filter(t => t.date === maxDate);
  const pick = newestFirst ? sameDay[0] : sameDay[sameDay.length - 1];
  return { amount: pick.balance, date: maxDate };
}

/** Try to read a positions/holdings export (broker or exchange). */
export function readPositionsCsv(rows) {
  const hi = findHeader(rows, ['symbol', 'qty']);
  if (hi < 0) return null;
  const hdr = rows[hi];
  const i = {
    sym: col(hdr, 'symbol'), name: col(hdr, 'name'), qty: col(hdr, 'qty'), price: col(hdr, 'price'), value: col(hdr, 'value'),
    avg: col(hdr, 'avg'), ccy: col(hdr, 'ccy'),
  };
  i.cost = hdr.findIndex((c, k) => k !== i.avg && H.cost.test(c));
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const sym = (r[i.sym] || '').trim();
    if (!sym || /^(total|subtotal|cash)$/i.test(sym)) continue;
    const qty = parseAmount(r[i.qty]);
    if (qty === null) continue;
    const price = i.price >= 0 ? parseAmount(r[i.price]) : null;
    const value = i.value >= 0 ? parseAmount(r[i.value]) : (price !== null ? qty * price : null);
    const avgCost = i.avg >= 0 ? parseAmount(r[i.avg]) : null;
    const cost = i.cost >= 0 ? parseAmount(r[i.cost]) : (avgCost !== null ? avgCost * qty : null);
    out.push({ symbol: sym.toUpperCase(), name: i.name >= 0 ? r[i.name] : sym, qty, price, value, cost, ccy: i.ccy >= 0 ? (r[i.ccy] || '').toUpperCase() || null : null, cls: guessClass(sym, i.name >= 0 ? r[i.name] : '') });
  }
  return out.length ? { format: 'Positions CSV', holdings: out } : null;
}

const CRYPTO = /^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|DOT|AVAX|MATIC|POL|LINK|ATOM|TON|TRX|LTC|ARB|OP|SUI|APT|NEAR|INJ|TIA|SEI|PEPE|SHIB|WIF|BONK|ATH|JUP|PYTH|ENA|ONDO|RNDR|RENDER|FET|TAO|HYPE)$/i;
const STABLE = /^(USDT|USDC|FDUSD|DAI|TUSD|USDE|PYUSD|BUSD)$/i;
export function guessClass(sym, name = '') {
  if (STABLE.test(sym)) return 'stable';
  if (CRYPTO.test(sym)) return 'crypto';
  if (/\b(ETF|FUND|TRUST|INDEX|VANGUARD|ISHARES|BETASHARES|SPDR)\b/i.test(name) || /^(VAS|VGS|VDHG|A200|IVV|NDQ|VTS|VEU|IOZ|QUAL|SPY|VOO|QQQ|VTI|VT|SCHD|IWDA|CSPX|ES3|G3B)$/i.test(sym)) return 'etf';
  if (/\b(BOND|TREASURY|T-BILL|NOTE)\b/i.test(name)) return 'bond';
  return 'stock';
}

/** Give transactions stable ids so re-importing an overlapping export doesn't duplicate rows. */
export function withTxIds(accountId, txs) {
  const seen = new Map();
  return txs.map(t => {
    const k = `${t.date}|${t.amount.toFixed(2)}|${String(t.desc).toUpperCase().replace(/\s+/g, ' ')}`;
    const n = (seen.get(k) || 0) + 1; seen.set(k, n);
    return { ...t, id: accountId + ':' + hash(k + '|' + n) };
  });
}
export function hash(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Read any text export. */
export function importText(text, { accountId = 'acct' } = {}) {
  const rows = parseCSV(text);
  const pos = readPositionsCsv(rows);
  const bank = readBankCsv(rows);
  // A positions file has a symbol column; a bank file has dates on most rows.
  if (pos && (!bank || pos.holdings.length >= bank.transactions.length)) return { kind: 'holdings', format: pos.format, holdings: pos.holdings, warnings: [] };
  if (bank) {
    const transactions = withTxIds(accountId, bank.transactions);
    const warnings = [];
    if (bank.balance === null) warnings.push('No balance column found. Set the account balance by hand after importing.');
    return { kind: 'transactions', format: bank.format, transactions, balance: bank.balance, warnings };
  }
  return null;
}

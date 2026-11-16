import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, parseDate, parseAmount, importText, readBankCsv } from '../public/shared/importers.js';
import { classify, cashflow } from '../public/shared/cashflow.js';
import { summarize } from '../public/shared/portfolio.js';
import { convert } from '../public/shared/money.js';
import { demoData } from '../public/shared/demo-data.js';

test('csv parser handles quotes, commas and CRLF', () => {
  const rows = parseCSV('a,"b, c","d ""q"""\r\n1,2,3\r\n');
  assert.deepEqual(rows, [['a', 'b, c', 'd "q"'], ['1', '2', '3']]);
});

test('dates are day-first by default', () => {
  assert.equal(parseDate('03/04/2026'), '2026-04-03');
  assert.equal(parseDate('2026-11-05'), '2026-11-05');
  assert.equal(parseDate('20261105'), '2026-11-05');
  assert.equal(parseDate('5 Nov 2026'), '2026-11-05');
  assert.equal(parseDate('05-Nov-26'), '2026-11-05');
  assert.equal(parseDate('Nov 5, 2026'), '2026-11-05');
  assert.equal(parseDate('nonsense'), null);
});

test('amounts handle signs, brackets, DR/CR and symbols', () => {
  assert.equal(parseAmount('-12.50'), -12.5);
  assert.equal(parseAmount('(1,234.00)'), -1234);
  assert.equal(parseAmount('RM 1,000.00 DR'), -1000);
  assert.equal(parseAmount('S$45.10 CR'), 45.1);
  assert.equal(parseAmount('-$9.99'), -9.99);
  assert.equal(parseAmount('+3,000'), 3000);
  assert.equal(parseAmount(''), null);
});

test('CommBank headerless export', () => {
  const csv = `"05/11/2026","-54.20","WOOLWORTHS 1234 SYDNEY NS AUS Card xx1234 Value Date: 03/11/2026","+2,345.80"
"03/11/2026","+4,250.00","Salary ACME PTY LTD PAYROLL","+2,400.00"
"01/11/2026","-1,850.00","RAY WHITE RENT","-1,850.00"`;
  const r = importText(csv, { accountId: 'cba' });
  assert.equal(r.kind, 'transactions');
  assert.equal(r.format, 'CommBank CSV');
  assert.equal(r.transactions.length, 3);
  assert.equal(r.transactions[0].amount, -54.2);
  assert.deepEqual(r.balance, { amount: 2345.8, date: '2026-11-05' });
});

test('ING export with credit/debit columns', () => {
  const csv = `Date,Description,Credit,Debit,Balance
15/11/2026,Osko Payment To J Smith,,-25.00,5975.00
14/11/2026,Bonus Interest Credit,12.34,,6000.00`;
  const r = importText(csv, { accountId: 'ing' });
  assert.equal(r.kind, 'transactions');
  assert.equal(r.transactions[0].amount, -25);
  assert.equal(r.transactions[1].amount, 12.34);
  assert.equal(r.balance.amount, 5975);
});

test('DBS-style export with preamble rows', () => {
  const csv = `Account Details For:,POSB Savings 123-45678-9
Statement as at:,16 Nov 2026

Transaction Date,Reference,Debit Amount,Credit Amount,Transaction Ref1,Transaction Ref2
14 Nov 2026,POS,12.80,,NTUC FAIRPRICE,
13 Nov 2026,ICT,,3000.00,SALARY,ACME SG`;
  const r = readBankCsv(parseCSV(csv));
  assert.equal(r.transactions.length, 2);
  assert.equal(r.transactions[0].amount, -12.8);
  assert.match(r.transactions[0].desc, /FAIRPRICE/);
  assert.equal(r.transactions[1].amount, 3000);
});

test('positions export becomes holdings', () => {
  const csv = `Symbol,Name,Quantity,Current price,Market Value,Diluted Cost,Currency
NVDA,NVIDIA,10,180.5,1805,120,USD
VGS,Vanguard MSCI Index Intl Shares ETF,50,140,7000,110,AUD`;
  const r = importText(csv);
  assert.equal(r.kind, 'holdings');
  assert.equal(r.holdings.length, 2);
  assert.equal(r.holdings[0].cost, 1200);
  assert.equal(r.holdings[1].cls, 'etf');
});

test('re-importing an overlapping export yields the same ids', () => {
  const a = importText(`"05/11/2026","-5.00","COFFEE","100"\n"05/11/2026","-5.00","COFFEE","95"`, { accountId: 'x' });
  const b = importText(`"05/11/2026","-5.00","COFFEE","100"\n"05/11/2026","-5.00","COFFEE","95"\n"06/11/2026","-3.00","BUS","92"`, { accountId: 'x' });
  assert.notEqual(a.transactions[0].id, a.transactions[1].id);
  assert.deepEqual(a.transactions.map(t => t.id), b.transactions.slice(0, 2).map(t => t.id));
});

test('salary, transfers and categories are detected', () => {
  const tx = [];
  for (const [i, d] of ['2026-08-28', '2026-09-28', '2026-10-28', '2026-11-13'].entries())
    tx.push({ id: 's' + i, accountId: 'cba', date: d, desc: 'ACME PTY LTD 00' + i, amount: 4200 + i * 10, ccy: 'AUD' });
  tx.push({ id: 't1', accountId: 'cba', date: '2026-11-02', desc: 'Transfer out', amount: -500, ccy: 'AUD' });
  tx.push({ id: 't2', accountId: 'ing', date: '2026-11-03', desc: 'Deposit', amount: 500, ccy: 'AUD' });
  tx.push({ id: 'g', accountId: 'cba', date: '2026-11-04', desc: 'WOOLWORTHS 1234', amount: -80, ccy: 'AUD' });
  tx.push({ id: 'b', accountId: 'cba', date: '2026-11-05', desc: 'SPORTSBET PTY', amount: -50, ccy: 'AUD' });
  tx.push({ id: 'i', accountId: 'cba', date: '2026-11-06', desc: 'Interactive Brokers deposit', amount: -1000, ccy: 'AUD' });
  const c = Object.fromEntries(classify(tx).map(t => [t.id, t.category]));
  assert.equal(c.s0, 'Salary'); assert.equal(c.s3, 'Salary');
  assert.equal(c.t1, 'Transfer'); assert.equal(c.t2, 'Transfer');
  assert.equal(c.g, 'Groceries'); assert.equal(c.b, 'Betting'); assert.equal(c.i, 'Investing');
});

test('fx conversion via USD pivot', () => {
  const fx = { USD: 1, AUD: 1.5, MYR: 4.5 };
  assert.equal(convert(150, 'AUD', 'USD', fx), 100);
  assert.equal(convert(100, 'USDT', 'AUD', fx), 150);
  assert.equal(convert(450, 'MYR', 'AUD', fx), 150);
  assert.equal(convert(1, 'XYZ', 'AUD', fx), null);
});

test('portfolio summary: net worth, loans, P&L', () => {
  const data = {
    settings: { base: 'USD', fx: { USD: 1, AUD: 2 } },
    accounts: [{ id: 'a', name: 'A', tier: 'broker', ccy: 'USD' }, { id: 'w', name: 'W', tier: 'wallet', ccy: 'USD' }],
    holdings: [
      { id: 1, accountId: 'a', symbol: 'X', cls: 'stock', ccy: 'USD', qty: 10, price: 15, cost: 100 },
      { id: 2, accountId: 'a', symbol: 'CASH', cls: 'cash', ccy: 'AUD', value: 200 },
      { id: 3, accountId: 'w', symbol: 'USDC', cls: 'loan', ccy: 'USD', value: -50 },
    ],
  };
  const s = summarize(data);
  assert.equal(s.assets, 250);
  assert.equal(s.liabilities, 50);
  assert.equal(s.netWorth, 200);
  assert.equal(s.invest.unrealized, 50);
  assert.equal(s.invest.unrealizedPct, 0.5);
});

test('demo dataset summarises without missing fx', () => {
  const d = demoData(Date.UTC(2026, 10, 16));
  const s = summarize(d, { now: Date.UTC(2026, 10, 16) });
  assert.ok(s.netWorth > 0);
  assert.deepEqual(s.missingFx, []);
  const cf = cashflow(d, { now: Date.UTC(2026, 10, 16) });
  assert.ok(cf.salary, 'salary detected');
  assert.ok(cf.recurring.length > 0, 'recurring detected');
  assert.ok(cf.months.at(-1).spending > 0);
});

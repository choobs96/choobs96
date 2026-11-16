import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDb } from '../server/db.js';
import { createApp } from '../server/index.js';
import { parseFlexStatement } from '../server/connectors/ibkr.js';
import { valueBalances, sign, syncBinance } from '../server/connectors/binance.js';
import { mapPositions } from '../server/connectors/zerion.js';
import { demoData } from '../public/shared/demo-data.js';

const FLEX = `<FlexQueryResponse queryName="pos" type="AF"><FlexStatements count="1">
<FlexStatement accountId="U123" fromDate="20261113" toDate="20261113" whenGenerated="20261114;020000">
<OpenPositions>
<OpenPosition accountId="U123" currency="USD" assetCategory="STK" subCategory="COMMON" symbol="NVDA" description="NVIDIA CORP" listingExchange="NASDAQ" position="10" markPrice="180.5" positionValue="1805" costBasisMoney="1200" fifoPnlUnrealized="605" levelOfDetail="SUMMARY" />
<OpenPosition accountId="U123" currency="AUD" assetCategory="STK" subCategory="ETF" symbol="VAS" description="VANGUARD AUSTRALIAN SHARES" listingExchange="ASX" position="20" markPrice="104" positionValue="2080" costBasisMoney="1900" levelOfDetail="SUMMARY" />
<OpenPosition symbol="VAS" position="10" levelOfDetail="LOT" />
</OpenPositions>
<CashReport><CashReportCurrency currency="BASE_SUMMARY" endingCash="999" /><CashReportCurrency currency="USD" endingCash="512.25" levelOfDetail="Currency" /></CashReport>
<Trades><Trade symbol="AAPL" currency="USD" tradeDate="20260310" fifoPnlRealized="320.5" tradeID="77" /><Trade symbol="X" fifoPnlRealized="0" /></Trades>
</FlexStatement></FlexStatements></FlexQueryResponse>`;

test('IBKR flex statement parsing', () => {
  const r = parseFlexStatement(FLEX);
  assert.equal(r.holdings.length, 3);
  const nvda = r.holdings.find(h => h.symbol === 'NVDA');
  assert.equal(nvda.cost, 1200); assert.equal(nvda.cls, 'stock'); assert.equal(nvda.exchange, 'NASDAQ');
  assert.equal(r.holdings.find(h => h.symbol === 'VAS').cls, 'etf');
  assert.equal(r.holdings.find(h => h.cls === 'cash').value, 512.25);
  assert.deepEqual(r.realized, [{ date: '2026-03-10', symbol: 'AAPL', pnl: 320.5, ccy: 'USD', id: 'ibkr:77' }]);
  assert.equal(r.asOf, '2026-11-13');
});

test('Binance balances: LD tokens skipped, earn marked staked, stables at $1', () => {
  const rows = valueBalances({
    spot: [{ asset: 'BTC', free: '0.1', locked: '0' }, { asset: 'LDUSDT', free: '50', locked: '0' }, { asset: 'USDT', free: '20', locked: '0' }],
    flexible: [{ asset: 'USDT', totalAmount: '50' }], locked: [{ asset: 'ETH', amount: '1' }],
  }, { BTCUSDT: 70000, ETHUSDT: 3000 });
  assert.deepEqual(rows.map(r => [r.symbol, r.sub, r.cls, r.value]), [
    ['BTC', 'Spot', 'crypto', 7000], ['USDT', 'Spot', 'stable', 20], ['USDT', 'Earn flexible', 'stable', 50], ['ETH', 'Earn locked', 'staked', 3000],
  ]);
});

test('Binance requests are signed with HMAC-SHA256', async () => {
  assert.match(sign('a=1', 'secret'), /^[0-9a-f]{64}$/);
  const calls = [];
  const fakeFetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const path = new URL(url).pathname;
    const body = path === '/api/v3/account' ? { balances: [{ asset: 'BTC', free: '1', locked: '0' }] } : path === '/api/v3/ticker/price' ? [{ symbol: 'BTCUSDT', price: '70000' }] : path.includes('simple-earn') ? { rows: [] } : [];
    return { ok: true, json: async () => body };
  };
  const r = await syncBinance({}, { env: { BINANCE_API_KEY: 'k', BINANCE_API_SECRET: 's' }, fetch: fakeFetch, now: () => 1700000000000 });
  assert.equal(r.holdings[0].value, 70000);
  const acct = calls.find(c => c.url.includes('/api/v3/account'));
  assert.match(acct.url, /signature=[0-9a-f]{64}/);
  assert.equal(acct.opts.headers['X-MBX-APIKEY'], 'k');
});

test('Zerion positions: wallet, staked, loans negative', () => {
  const rows = mapPositions({ data: [
    { attributes: { position_type: 'wallet', quantity: { float: 2 }, value: 6000, price: 3000, fungible_info: { symbol: 'ETH', name: 'Ethereum' } }, relationships: { chain: { data: { id: 'ethereum' } } } },
    { attributes: { position_type: 'staked', quantity: { float: 1 }, value: 3000, price: 3000, fungible_info: { symbol: 'stETH', name: 'Lido' }, application_metadata: { name: 'Lido' } }, relationships: { chain: { data: { id: 'ethereum' } } } },
    { attributes: { position_type: 'loan', quantity: { float: 500 }, value: 500, price: 1, fungible_info: { symbol: 'USDC', name: 'USD Coin' }, application_metadata: { name: 'Aave' } }, relationships: { chain: { data: { id: 'base' } } } },
  ] }, '0x1234567890abcdef1234567890abcdef12345678');
  assert.deepEqual(rows.map(r => [r.symbol, r.cls, r.value, r.sub]), [['ETH', 'crypto', 6000, 'ethereum'], ['stETH', 'staked', 3000, 'Lido · staked'], ['USDC', 'loan', -500, 'Aave · loan']]);
});

async function withServer(fn, env = {}) {
  const store = openDb(':memory:');
  const srv = createServer(createApp({ store, env, demo: false }));
  await new Promise(r => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
  try { await fn(call, store); } finally { srv.close(); }
}

test('API: create account, import CSV, commit, state reflects it', async () => {
  await withServer(async (call) => {
    const { body: { id } } = await call('POST', '/api/accounts', { name: 'CommBank', tier: 'bank', ccy: 'AUD' });
    assert.equal(id, 'commbank');
    const csv = `"05/11/2026","-54.20","WOOLWORTHS 1234","+2,345.80"\n"03/11/2026","+4,250.00","ACME PAYROLL SALARY","+2,400.00"`;
    const prev = await call('POST', `/api/accounts/${id}/import`, { files: [{ name: 'cba.csv', type: 'text/csv', data: Buffer.from(csv).toString('base64') }] });
    assert.equal(prev.status, 200); assert.equal(prev.body.kind, 'transactions');
    const commit = await call('POST', `/api/accounts/${id}/commit`, prev.body);
    assert.equal(commit.body.added, 2);
    const again = await call('POST', `/api/accounts/${id}/commit`, prev.body);
    assert.equal(again.body.added, 0, 'no duplicates on re-import');
    const { body: st } = await call('GET', '/api/state');
    assert.equal(Math.round(st.summary.netWorth), 2346);
    assert.equal(st.cashflow.transactions.find(t => /WOOL/.test(t.desc)).category, 'Groceries');
    const txId = st.cashflow.transactions[0].id;
    await call('PATCH', '/api/transactions/' + encodeURIComponent(txId), { category: 'Dining' });
    const { body: st2 } = await call('GET', '/api/state');
    assert.equal(st2.cashflow.transactions.find(t => t.id === txId).category, 'Dining');
  });
});

test('API: cost override survives holdings replacement; bridge needs token', async () => {
  await withServer(async (call, store) => {
    store.load(demoData(Date.UTC(2026, 10, 16)));
    const { body: st } = await call('GET', '/api/state');
    const w = st.summary.holdings.find(h => h.symbol === 'ATH');
    assert.equal(w.cost, null);
    await call('PATCH', '/api/holdings/' + encodeURIComponent(w.id), { avgCost: 0.03 });
    store.replaceHoldings('wallets', store.holdings().filter(h => h.accountId === 'wallets').map(({ avgCost, ...h }) => h));
    const { body: st2 } = await call('GET', '/api/state');
    assert.equal(Math.round(st2.summary.holdings.find(h => h.symbol === 'ATH').cost), Math.round(52000 * 0.03));
    const bad = await call('POST', '/api/bridge/moomoo', { holdings: [] });
    assert.equal(bad.status, 401);
  }, { BRIDGE_TOKEN: 'tok' });
});

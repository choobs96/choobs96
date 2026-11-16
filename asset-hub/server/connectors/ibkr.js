// Interactive Brokers Flex Web Service (read-only token + Flex Query id).
// Docs: https://www.interactivebrokers.com/campus/ibkr-api-page/flex-web-service

const BASE = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';
const UA = 'AssetHub/0.1 (personal portfolio tracker)';

/** Parse attributes of every <Tag .../> or <Tag ...> element. */
export function elements(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b([^>]*?)/?>`, 'g');
  let m;
  while ((m = re.exec(xml))) {
    const attrs = {};
    const ar = /([A-Za-z_][\w.-]*)="([^"]*)"/g; let a;
    while ((a = ar.exec(m[1]))) attrs[a[1]] = a[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    out.push(attrs);
  }
  return out;
}
const n = v => { const x = parseFloat(v); return isFinite(x) ? x : null; };
const d8 = s => /^\d{8}/.test(s || '') ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : (s || '').slice(0, 10);

const CATEGORY = { STK: 'stock', ETF: 'etf', FUND: 'etf', BOND: 'bond', BILL: 'bond', CRYPTO: 'crypto', CASH: 'cash', OPT: 'other', FUT: 'other', WAR: 'other', CFD: 'other' };

/** Turn a Flex statement into holdings, cash and realized P&L. */
export function parseFlexStatement(xml) {
  const positions = elements(xml, 'OpenPosition')
    .filter(p => !p.levelOfDetail || p.levelOfDetail === 'SUMMARY')
    .map(p => {
      const qty = n(p.position), mult = n(p.multiplier) || 1;
      const isEtf = p.subCategory === 'ETF' || /\bETF\b/i.test(p.description || '');
      return {
        symbol: p.symbol, name: p.description || p.symbol,
        cls: isEtf ? 'etf' : (CATEGORY[p.assetCategory] || 'other'),
        ccy: p.currency, exchange: p.listingExchange || null,
        qty, price: n(p.markPrice), value: n(p.positionValue) ?? (qty !== null && n(p.markPrice) !== null ? qty * n(p.markPrice) * mult : null),
        cost: n(p.costBasisMoney), sub: p.assetCategory === 'OPT' ? 'Options' : null,
      };
    });
  const cash = elements(xml, 'CashReportCurrency')
    .filter(c => c.currency && c.currency !== 'BASE_SUMMARY' && (c.levelOfDetail ? c.levelOfDetail === 'Currency' : true))
    .map(c => ({ symbol: c.currency, name: `Cash (${c.currency})`, cls: 'cash', ccy: c.currency, value: n(c.endingCash) }))
    .filter(c => c.value !== null && Math.abs(c.value) > 0.005);
  const realized = elements(xml, 'Trade')
    .filter(t => n(t.fifoPnlRealized) && Math.abs(n(t.fifoPnlRealized)) > 0.005)
    .map(t => ({ date: d8(t.tradeDate || t.dateTime), symbol: t.symbol, pnl: n(t.fifoPnlRealized), ccy: t.currency, id: t.tradeID ? 'ibkr:' + t.tradeID : undefined }));
  const stmt = elements(xml, 'FlexStatement')[0] || {};
  return { holdings: [...positions, ...cash], realized, asOf: d8(stmt.toDate || stmt.whenGenerated) };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function syncIbkr(account, { env, fetch = globalThis.fetch, wait = sleep } = {}) {
  const token = account.config?.token || env.IBKR_FLEX_TOKEN;
  const query = account.config?.queryId || env.IBKR_FLEX_QUERY_ID;
  if (!token || !query) throw new Error('Set IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID in .env (see docs/DATA_SOURCES.md).');
  const get = async url => { const r = await fetch(url, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error(`IBKR HTTP ${r.status}`); return r.text(); };
  const sent = await get(`${BASE}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(query)}&v=3`);
  const status = (sent.match(/<Status>([^<]*)<\/Status>/) || [])[1];
  if (status !== 'Success') throw new Error('IBKR: ' + ((sent.match(/<ErrorMessage>([^<]*)<\/ErrorMessage>/) || [])[1] || 'request failed'));
  const ref = (sent.match(/<ReferenceCode>([^<]*)<\/ReferenceCode>/) || [])[1];
  const url = (sent.match(/<Url>([^<]*)<\/Url>/) || [])[1] || `${BASE}/GetStatement`;
  // The statement takes a few seconds to generate; error 1019 means "not ready yet".
  for (let attempt = 0; attempt < 8; attempt++) {
    await wait(attempt === 0 ? 3000 : 5000);
    const xml = await get(`${url}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(ref)}&v=3`);
    if (/<FlexQueryResponse/.test(xml)) return parseFlexStatement(xml);
    const code = (xml.match(/<ErrorCode>(\d+)<\/ErrorCode>/) || [])[1];
    if (code && code !== '1019' && code !== '1018') throw new Error('IBKR: ' + ((xml.match(/<ErrorMessage>([^<]*)<\/ErrorMessage>/) || [])[1] || 'error ' + code));
  }
  throw new Error('IBKR: statement was not ready after 40 seconds. Try again shortly.');
}

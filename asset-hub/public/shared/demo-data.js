// A realistic, made-up dataset so the app can be explored before any account is connected.
// Deterministic for a given "now".
import { DEFAULT_FX, convert } from './money.js';
import { snapshotUsd } from './portfolio.js';

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const DAY = 864e5;

export function demoData(now = Date.now()) {
  const r = rng(1116);
  const today = Math.floor(now / DAY) * DAY;
  const hoursAgo = h => new Date(now - h * 36e5).toISOString();

  const accounts = [
    { id: 'ibkr', name: 'Interactive Brokers', institution: 'IBKR', tier: 'broker', ccy: 'USD', connector: 'ibkr', sort: 0, lastSync: hoursAgo(6) },
    { id: 'moomoo', name: 'Moomoo', institution: 'Moomoo', tier: 'broker', ccy: 'USD', connector: 'moomoo', sort: 1, lastSync: hoursAgo(30) },
    { id: 'cba', name: 'CommBank Smart Access', institution: 'CommBank', tier: 'bank', ccy: 'AUD', connector: 'import', sort: 0, lastImport: hoursAgo(50) },
    { id: 'ing', name: 'ING Savings Maximiser', institution: 'ING', tier: 'bank', ccy: 'AUD', connector: 'import', sort: 1, lastImport: hoursAgo(50) },
    { id: 'maybank', name: 'Maybank Savings', institution: 'Maybank', tier: 'bank', ccy: 'MYR', connector: 'import', sort: 2, lastImport: hoursAgo(24 * 41) },
    { id: 'dbs', name: 'DBS Multiplier', institution: 'DBS', tier: 'bank', ccy: 'SGD', connector: 'import', sort: 3, lastImport: hoursAgo(24 * 12) },
    { id: 'binance', name: 'Binance', institution: 'Binance', tier: 'exchange', ccy: 'USD', connector: 'binance', sort: 0, lastSync: hoursAgo(2) },
    { id: 'wallets', name: 'On-chain wallets', institution: 'Zerion', tier: 'wallet', ccy: 'USD', connector: 'zerion', sort: 0, lastSync: hoursAgo(2), config: { addresses: ['0x8f3c…a91e', 'J4uX…kP2q (Solana)'] } },
  ];

  let n = 0; const H = (accountId, o) => ({ id: accountId + '-h' + (++n), accountId, ...o });
  const holdings = [
    H('ibkr', { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', cls: 'etf', ccy: 'USD', exchange: 'ARCA', qty: 42, price: 612.4, cost: 19740 }),
    H('ibkr', { symbol: 'NVDA', name: 'NVIDIA Corp', cls: 'stock', ccy: 'USD', exchange: 'NASDAQ', qty: 60, price: 182.3, cost: 6150 }),
    H('ibkr', { symbol: 'MSFT', name: 'Microsoft Corp', cls: 'stock', ccy: 'USD', exchange: 'NASDAQ', qty: 18, price: 498.1, cost: 7320 }),
    H('ibkr', { symbol: 'GOOGL', name: 'Alphabet Inc A', cls: 'stock', ccy: 'USD', exchange: 'NASDAQ', qty: 25, price: 251.7, cost: 4310 }),
    H('ibkr', { symbol: 'VAS', name: 'Vanguard Australian Shares ETF', cls: 'etf', ccy: 'AUD', exchange: 'ASX', qty: 120, price: 104.85, cost: 11280 }),
    H('ibkr', { symbol: 'GOLD', name: 'Global X Physical Gold', cls: 'etf', ccy: 'AUD', exchange: 'ASX', qty: 150, price: 49.6, cost: 5460 }),
    H('ibkr', { symbol: 'USD', name: 'Cash (USD)', cls: 'cash', ccy: 'USD', value: 2140.55 }),
    H('ibkr', { symbol: 'AUD', name: 'Cash (AUD)', cls: 'cash', ccy: 'AUD', value: 860.1 }),
    H('moomoo', { symbol: 'PLTR', name: 'Palantir Technologies', cls: 'stock', ccy: 'USD', exchange: 'NASDAQ', qty: 45, price: 172.4, cost: 3105 }),
    H('moomoo', { symbol: 'TSLA', name: 'Tesla Inc', cls: 'stock', ccy: 'USD', exchange: 'NASDAQ', qty: 8, price: 398.2, cost: 3540 }),
    H('moomoo', { symbol: 'AMD', name: 'Advanced Micro Devices', cls: 'stock', ccy: 'USD', exchange: 'NASDAQ', qty: 15, price: 236.9, cost: 2420 }),
    H('moomoo', { symbol: '00700', name: 'Tencent Holdings', cls: 'stock', ccy: 'HKD', exchange: 'SEHK', qty: 100, price: 612.5, cost: 41200 }),
    H('moomoo', { symbol: 'USD', name: 'Cash (USD)', cls: 'cash', ccy: 'USD', value: 415.2 }),
    H('cba', { symbol: 'AUD', name: 'Smart Access balance', cls: 'cash', ccy: 'AUD', value: 0 }),
    H('ing', { symbol: 'AUD', name: 'Savings Maximiser balance', cls: 'cash', ccy: 'AUD', value: 0 }),
    H('maybank', { symbol: 'MYR', name: 'Savings balance', cls: 'cash', ccy: 'MYR', value: 0 }),
    H('dbs', { symbol: 'SGD', name: 'Multiplier balance', cls: 'cash', ccy: 'SGD', value: 0 }),
    H('binance', { symbol: 'BTC', name: 'Bitcoin', cls: 'crypto', ccy: 'USD', qty: 0.182, price: 74260, avgCost: 58400, sub: 'Spot' }),
    H('binance', { symbol: 'ETH', name: 'Ethereum', cls: 'crypto', ccy: 'USD', qty: 1.95, price: 2980, avgCost: 3310, sub: 'Spot' }),
    H('binance', { symbol: 'SOL', name: 'Solana', cls: 'crypto', ccy: 'USD', qty: 28.4, price: 162.5, avgCost: 141, sub: 'Spot' }),
    H('binance', { symbol: 'ETH', name: 'Ethereum (Locked staking)', cls: 'staked', ccy: 'USD', qty: 1.2, price: 2980, avgCost: 2650, sub: 'Earn' }),
    H('binance', { symbol: 'USDT', name: 'Tether (Flexible Earn)', cls: 'stable', ccy: 'USD', qty: 3150, price: 1, avgCost: 1, sub: 'Earn' }),
    H('binance', { symbol: 'USDT', name: 'Tether (Funding)', cls: 'stable', ccy: 'USD', qty: 410.5, price: 1, avgCost: 1, sub: 'Funding' }),
    H('wallets', { symbol: 'ETH', name: 'Ethereum', cls: 'crypto', ccy: 'USD', qty: 0.84, price: 2980, sub: 'Ethereum · wallet' }),
    H('wallets', { symbol: 'stETH', name: 'Lido Staked ETH', cls: 'staked', ccy: 'USD', qty: 1.6, price: 2975, avgCost: 2410, sub: 'Lido · staked' }),
    H('wallets', { symbol: 'ATH', name: 'Aethir', cls: 'crypto', ccy: 'USD', qty: 52000, price: 0.0412, sub: 'Arbitrum · wallet' }),
    H('wallets', { symbol: 'USDC', name: 'USD Coin (Aave deposit)', cls: 'staked', ccy: 'USD', qty: 4200, price: 1, avgCost: 1, sub: 'Aave v3 · deposit' }),
    H('wallets', { symbol: 'USDC', name: 'USD Coin (Aave borrow)', cls: 'loan', ccy: 'USD', value: -1500, sub: 'Aave v3 · loan' }),
    H('wallets', { symbol: 'JitoSOL', name: 'Jito Staked SOL', cls: 'staked', ccy: 'USD', qty: 12.3, price: 196.1, avgCost: 158, sub: 'Solana · staked' }),
  ];

  // ---- Bank transactions, 13 months ----
  const tx = []; let k = 0;
  const T = (accountId, ms, desc, amount) => tx.push({ id: accountId + ':d' + (++k), accountId, date: iso(ms), desc, amount: Math.round(amount * 100) / 100 });
  const start = today - 395 * DAY;
  for (let d = start; d <= today; d += DAY) {
    const dt = new Date(d), dom = dt.getUTCDate(), dow = dt.getUTCDay();
    if (dom === 28) T('cba', d, 'ACME ANALYTICS PTY 0' + (dt.getUTCMonth() + 1), 6850 + (dt.getUTCMonth() === 6 ? 250 : 0));
    if (dom === 1 || dom === 15) T('cba', d, 'RAY WHITE SURRY HILLS RENT REF ' + (300 + dom), -1240);
    if (dow === 6) T('cba', d, (r() < 0.6 ? 'WOOLWORTHS 1124 ' : 'COLES 0832 ') + 'SYDNEY NS AUS Card xx4471', -(70 + r() * 75));
    if (dow === 3 && r() < 0.7) T('cba', d, 'ALDI STORES MARRICKVILLE', -(28 + r() * 30));
    if (r() < 0.45) { const p = ['UBER *EATS HELP.UBER.COM', 'GUZMAN Y GOMEZ CBD', 'MCDONALDS NEWTOWN', 'SPEEDOS CAFE BONDI', 'MAMAK HAYMARKET', 'STARBUCKS GEORGE ST'][Math.floor(r() * 6)]; T('cba', d, p, -(12 + r() * 38)); }
    if (dow >= 1 && dow <= 5 && r() < 0.8) T('cba', d, 'TRANSPORTFORNSW OPAL CHATSWOOD', -(4.1 + r() * 4));
    if (r() < 0.06) T('cba', d, 'UBER *TRIP SYDNEY', -(16 + r() * 30));
    if (dom === 3) T('cba', d, 'NETFLIX.COM MELBOURNE', -18.99);
    if (dom === 9) T('cba', d, 'SPOTIFY P1A2B3 SYDNEY', -13.99);
    if (dom === 12) T('cba', d, 'CLAUDE.AI SUBSCRIPTION ANTHROPIC', -32.0);
    if (dom === 18) T('cba', d, 'APPLE.COM/BILL SYDNEY', -4.49);
    if (dom === 21) T('cba', d, 'TELSTRA MOBILE BPAY', -69.0);
    if (dom === 6 && dt.getUTCMonth() % 3 === 0) T('cba', d, 'AGL SALES PTY LTD BPAY', -(210 + r() * 80));
    if (dom === 14) T('cba', d, 'MEDIBANK PRIVATE DIRECT DEBIT', -126.4);
    if (dom === 10) T('cba', d, 'ANYTIME FITNESS SURRY HILLS', -34.95);
    if (dow === 6 && r() < 0.35) T('cba', d, 'SPORTSBET PTY LTD MELBOURNE', -(20 + Math.floor(r() * 4) * 15));
    if (dow === 0 && r() < 0.12) T('cba', d, 'SPORTSBET PTY LTD WITHDRAWAL', 40 + Math.floor(r() * 6) * 20);
    if (r() < 0.07) { const p = ['KMART BROADWAY', 'JB HI-FI SYDNEY', 'UNIQLO PITT ST', 'AMAZON AU MARKETPLACE', 'BUNNINGS ALEXANDRIA', 'OFFICEWORKS'][Math.floor(r() * 6)]; T('cba', d, p, -(20 + r() * 140)); }
    if (r() < 0.02) T('cba', d, 'PRICELINE PHARMACY', -(14 + r() * 30));
    if (r() < 0.012) T('cba', d, ['JETSTAR AIRWAYS', 'AIRBNB * HM4ZK', 'QANTAS AIRWAYS', 'BOOKING.COM HOTEL'][Math.floor(r() * 4)], -(180 + r() * 520));
    if (r() < 0.02) T('cba', d, 'HOYTS ENTERTAINMENT QUAY', -(22 + r() * 25));
    if (dom === 29) { T('cba', d, 'TRANSFER TO XX5521 SAVINGS', -1500); T('ing', d + DAY, 'TRANSFER FROM XX4471', 1500); }
    if (dom === 30) T('cba', d, 'INTERACTIVE BROKERS DEPOSIT', -1200);
    if (dom === 5 && dt.getUTCMonth() % 2 === 0) T('cba', d, 'BINANCE AUSTRALIA PAYID', -500);
    if (dom === 20 && dt.getUTCMonth() % 2 === 1) T('cba', d, 'MOOMOO AU FUNDING', -600);
    if (dom === Math.min(28, new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()) && dom === 28) T('ing', d, 'BONUS INTEREST CREDIT', 88 + (d - start) / DAY * 0.12);
    if (dom === 25) T('maybank', d, 'IBG TRANSFER FROM CHOO FAMILY', r() < 0.3 ? 500 : 0);
    if (dom === 27) T('maybank', d, 'HIBAH/INTEREST CREDIT', 6.2 + r() * 2);
    if (dom === 8 && r() < 0.5) T('maybank', d, 'MAXIS POSTPAID AUTO DEBIT', -88);
    if (dom === 2) T('dbs', d, 'INTEREST EARNED', 8 + r() * 4);
    if (dom === 16 && r() < 0.25) T('dbs', d, 'GRAB* SINGAPORE', -(15 + r() * 25));
  }
  const transactions = tx.filter(t => t.amount !== 0);

  // Bank balances consistent with the flows
  const flows = id => transactions.filter(t => t.accountId === id).reduce((s, t) => s + t.amount, 0);
  // Pick today's balances, then work out what the opening balances must have been.
  const closing = { cba: 4862.35, ing: 38410.2, maybank: 18950.4, dbs: 9890.75 };
  for (const h of holdings) if (closing[h.accountId] !== undefined) h.value = closing[h.accountId];
  void flows;

  const realized = [
    { accountId: 'ibkr', date: iso(today - 200 * DAY), symbol: 'AAPL', pnl: 1180.4, ccy: 'USD' },
    { accountId: 'ibkr', date: iso(today - 95 * DAY), symbol: 'META', pnl: 2240.0, ccy: 'USD' },
    { accountId: 'ibkr', date: iso(today - 40 * DAY), symbol: 'INTC', pnl: -410.75, ccy: 'USD' },
    { accountId: 'moomoo', date: iso(today - 60 * DAY), symbol: 'COIN', pnl: 615.0, ccy: 'USD' },
    { accountId: 'binance', date: iso(today - 120 * DAY), symbol: 'DOGE', pnl: -230.0, ccy: 'USD' },
  ];

  const settings = { base: 'AUD', fx: { ...DEFAULT_FX }, fxDate: iso(today) };
  const data = { accounts, holdings, transactions, realized, settings, snapshots: [] };

  // ---- Net-worth history: walk backwards from today with market noise and monthly savings ----
  const end = snapshotUsd(data).totalUsd;
  const snaps = []; let v = end;
  for (let i = 0; i <= 365; i++) {
    const d = today - i * DAY;
    snaps.push({ date: iso(d), totalUsd: Math.round(v) });
    const shock = (r() - 0.5) * 0.018 + (i > 25 && i < 60 ? 0.0025 : -0.0006); // a drawdown about a month ago
    v = v / (1 + shock);
    if (new Date(d).getUTCDate() === 28) v -= convert(2600, 'AUD', 'USD', settings.fx);
  }
  data.snapshots = snaps.reverse();
  return data;
}

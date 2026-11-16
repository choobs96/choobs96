# Data sources: how Asset Hub gets your numbers

Each source is ranked by how much effort it takes to set up, and how fresh the data ends up.
"Auto" means the server pulls it on a schedule. "Import" means you drop in a file (CSV, PDF, screenshot) when you want to refresh.

| # | Source | Method | Gives you | Effort | Freshness |
|---|--------|--------|-----------|--------|-----------|
| 1 | IBKR | **Auto** – Flex Web Service (read-only token) | Positions, cost basis, unrealized + realized P&L, cash by currency, trades, dividends | Low | Daily (Flex data updates after close) |
| 2 | Moomoo | **Auto** – OpenD + `moomoo-api` bridge script, or **Import** positions CSV/screenshot | Positions, cost, P&L, cash | Medium (OpenD must run on your Mac) | On demand |
| 3 | CommBank, ING (AU) | **Import** CSV from NetBank / ING online banking. Optional: CDR open banking via an accredited aggregator (Basiq) | Balances + transactions → spending, salary | Low (import) / High (CDR) | When you import |
| 4 | Maybank (MY) | **Import** PDF statement or screenshot (AI reader) | Balance + transactions | Low | Monthly |
| 5 | DBS (SG) | **Import** transaction CSV (digibank, last ~6 months) or PDF eStatement (AI reader) | Balance + transactions | Low | When you import |
| 6 | Binance | **Auto** – read-only API key (HMAC-signed) | Spot, Funding, Simple Earn flexible + locked, prices | Low | Every sync |
| 7 | On-chain wallets | **Auto** – Zerion API (free dev key) with your public addresses | Tokens + DeFi (staked, deposits, LP, rewards, loans) across EVM chains and Solana | Low | Every sync |
| – | FX rates | **Auto** – Frankfurter (central-bank reference rates, no key) | AUD/USD/MYR/SGD/HKD… | None | Daily |

No source ever needs a password, seed phrase or trading permission. Every key is read-only and stays on your own server.

---

## 1. Interactive Brokers – Flex Web Service

**Setup (5 minutes, desktop browser):**
1. Client Portal → **Performance & Reports → Flex Queries** → create an **Activity Flex Query**.
   - Sections: **Open Positions** (include `symbol, description, assetCategory, currency, position, markPrice, positionValue, costBasisMoney, fifoPnlUnrealized, fxRateToBase, listingExchange`), **Cash Report** (per currency, `endingCash`), **Trades** (optional, for realized P&L), **Change in NAV** (optional).
   - Format **XML**, period **Last Business Day**. Date format `yyyyMMdd` (European formats aren't supported by most parsers).
2. **Flex Web Service Configuration** → enable it and generate a **token** (valid up to 1 year).
3. Note the **Query ID**. Put both in `.env` as `IBKR_FLEX_TOKEN` and `IBKR_FLEX_QUERY_ID`.

**How it works:** two calls.
- `GET https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest?t=TOKEN&q=QUERY_ID&v=3` → XML with `<Status>Success</Status>` and a `<ReferenceCode>`.
- `GET https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement?t=TOKEN&q=REFERENCE_CODE&v=3` → the statement XML. If it isn't ready yet you get error code `1019`; the connector waits and retries.
- Limits: 1 request/second, 10/minute per token. A User-Agent header is required.

Sources: [IBKR Flex Web Service](https://www.interactivebrokers.com/campus/ibkr-api-page/flex-web-service), [SendRequest](https://www.interactivebrokers.com/docs/web-api/flex-web-service/using-flex-web-service/make-request-to-send-request), [field reference used by community parsers](https://docs.rs/crate/ib-flex/0.1.7/source/FLEX_SETUP.md).

## 2. Moomoo – OpenD bridge (or import)

Moomoo has no cloud API for personal data. Its OpenAPI runs through **OpenD**, a gateway app you log in to on your own computer.

**Option A, auto:** install OpenD on the Mac mini, log in once, then run `python3 bridges/moomoo_export.py` (uses `pip install moomoo-api`). It calls `position_list_query(refresh_cache=True)` and `accinfo_query()` for each market and POSTs the result to Asset Hub. Schedule it with `cron` or `launchd`.

**Option B, import:** screenshot the positions list in the app (one per market), or export positions from the desktop app as CSV, and drop it into the Moomoo account in Asset Hub.

Sources: [Get Positions (moomoo OpenAPI)](https://open.moomoo.com/api/trading/account/get-positions), [position_list_query](https://openapi.futunn.com/futu-api-doc/en/trade/get-position-list.html).

## 3. CommBank & ING (Australia)

**Import (recommended to start):**
- **CommBank:** NetBank on a desktop browser → account → transaction list → **Export → CSV**. The file has no header: `date, amount, description, balance`. The app can't export; NetBank exports cover roughly the last 1–2 years.
- **ING:** online banking (desktop) → account → **Transaction history** → set the range → **Export → CSV**. Columns are `Date, Description, Credit, Debit, Balance`, with day-first dates.

Asset Hub detects both formats automatically, de-duplicates overlapping exports, and takes the latest balance from the file.

**Auto (optional, later): CDR open banking.** Both banks share data under Australia's Consumer Data Right, but only to *accredited* recipients. A personal app can't be accredited, so it has to go through an aggregator such as **Basiq** (pay-per-connection; their pricing page says the first 100 connections a month are free, and a free sandbox exists). You'd create a Basiq app, consent once per bank, and the connector pulls accounts and transactions. Consents expire (max 12 months) and need renewing.

Sources: [CommBank open banking](https://www.commbank.com.au/banking/open-banking.html), [ING open banking](https://www.ing.com.au/open-banking.html), [Basiq pricing](https://basiq.io/pricing.html), [CommBank CSV notes](https://statement-converter.pages.dev/blog/how-to-download-commbank-statement-csv).

## 4. Maybank (Malaysia)

There is no personal API and no CSV export in Maybank2u or MAE. Download the monthly **PDF statement** from Maybank2u, or screenshot the account summary, and drop it into the Maybank account. Asset Hub's AI reader (Claude, using your own `ANTHROPIC_API_KEY`) turns it into transactions and a closing balance, which you review before saving.

Sources: [Maybank statement converter notes](https://maybankconverter.vercel.app).

## 5. DBS (Singapore)

DBS's APIs are for businesses only. For personal accounts:
- digibank online → account → **transaction history** (up to 6 months) → download, or
- digibank app → **eDocuments → eStatement** (PDF).

CSV goes through the CSV importer with column auto-detection; PDF goes through the AI reader.

Sources: [DBS transaction details](https://www.dbs.com.sg/i-bank/support/bank-deposit-accounts-account-transactions.html), [DBS statement notes](https://statementdecoder-web.onrender.com/convert/dbs).

## 6. Binance – read-only API key

**Setup:** Binance → **API Management** → create a key. Leave **only "Enable Reading"** ticked (no trading, no withdrawals), and restrict it to your server's IP if it has a fixed one. Put it in `.env` as `BINANCE_API_KEY` / `BINANCE_API_SECRET`.

**Endpoints used (all signed `USER_DATA`, read-only):**
- `GET /api/v3/account` – Spot balances.
- `POST /sapi/v1/asset/get-funding-asset` – Funding wallet.
- `GET /sapi/v1/simple-earn/flexible/position` and `/locked/position` – Earn and staking (shown as *Staked*).
- `GET /api/v3/ticker/price` – public prices to value everything in USDT.

**P&L:** Binance doesn't report cost basis. Asset Hub lets you enter an average cost per coin once (edit the holding), and computes P&L from that. A future connector can rebuild cost from `GET /api/v3/myTrades` per symbol.

Sources: [Simple Earn flexible position](https://developers.binance.com/docs/simple_earn/flexible-locked/account/Get-Flexible-Product-Position), [locked position](https://developers.binance.com/docs/simple_earn/account/Get-Locked-Product-Position), [wallet balance](https://developers.binance.com/docs/wallet/asset/query-user-wallet-balance), [funding wallet](https://developers.binance.com/docs/wallet/asset/funding-wallet).

## 7. On-chain wallets – Zerion API

You only ever give **public addresses**. Never a seed phrase or private key.

**Setup:** get a free developer key at [developers.zerion.io](https://developers.zerion.io) (free tier is a few thousand requests a day, plenty for a few wallets synced a few times a day). Put it in `.env` as `ZERION_API_KEY`, then add each address to the "On-chain wallets" account in Asset Hub.

**Endpoint:** `GET https://api.zerion.io/v1/wallets/{address}/positions/?filter[positions]=no_filter&currency=usd` returns every token and DeFi position across chains, each with `position_type` (`wallet`, `deposit`, `staked`, `locked`, `reward`, `loan`), quantity, price and value. Loans count as negative.

Alternatives: DeBank Cloud (paid units, no free tier, more protocol coverage), Moralis (free testing tier).

Sources: [Zerion API pricing](https://developers.zerion.io/pricing.md), [DeBank vs Zerion](https://zerion.io/blog/debank-vs-zerion-a-comprehensive-comparison/).

## FX rates and prices

- **FX:** [Frankfurter](https://frankfurter.dev) – free, no key, daily central-bank reference rates. Cached for a day; falls back to the last known rates (or your own overrides in Settings).
- **Stock prices:** come from the broker (IBKR mark price, Moomoo nominal price).
- **Crypto prices:** Binance tickers and Zerion values. CoinGecko's free Demo key (about 100 calls/min, 10k/month) is an optional fallback for tokens neither covers.

## Spending and salary

Bank transactions are categorised by keyword rules (groceries, dining, transport, bills, rent, shopping, travel, investing transfers…), which you can extend in `server/rules.json`. Income is detected as:
- **Salary:** credits from the same payer that repeat roughly monthly or fortnightly with similar amounts, or that say SALARY / PAYROLL / GAJI.
- **Transfers between your own accounts** (and to IBKR, Moomoo, Binance) are excluded from spending, so moving money isn't counted as spending it.

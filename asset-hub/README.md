# Asset Hub

A self-hosted web app that works like a phone app. It shows everything you own in one place:

- **Overview:** net worth, its trend, and where your money sits by type, platform, currency and region.
- **Investments:** unrealised and realised P&L per holding and per platform (IBKR, Moomoo, Binance, wallets).
- **Cash flow:** salary detection, income vs spending, spending by category, recurring bills, and searchable transactions you can re-categorise.
- **Accounts:** every source, ordered from easiest to hardest to connect, with sync status and file import.

It runs on your own machine (a Mac mini at home is ideal). Install it on your iPhone with *Share → Add to Home Screen*: no App Store, no $99 developer fee.

How each source is read, and why: **[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)**.

| Source | How it updates |
|---|---|
| IBKR | Automatic, through a Flex Query token |
| Moomoo | Automatic through OpenD and `bridges/moomoo_export.py`, or a screenshot or CSV |
| CommBank, ING | CSV export from online banking |
| Maybank, DBS | PDF statement or screenshot (read by Claude), or CSV |
| Binance | Automatic, through a read-only API key |
| Wallets | Automatic, through the Zerion API with your public addresses |

## Try it

```bash
npm install
npm run demo          # made-up data, nothing saved
open http://localhost:8787
```

## Run it for real (Mac mini + Tailscale)

1. Needs Node 22.13 or newer (`brew install node`).
2. `cp .env.example .env` and fill in what you use. Set `APP_PASSCODE`; without it the server only listens on the Mac itself.
3. `npm install && npm start`. Data lives in `data/asset-hub.db` (SQLite). Back it up like any file.
4. Install Tailscale on the Mac and the iPhone. Open `http://<mac-tailscale-name>:8787` in Safari, enter the passcode, then **Share → Add to Home Screen**.
5. To keep it running, use `launchd`, `pm2`, or simply `tmux`.

Then, in the app's **Accounts** tab:
1. **IBKR:** add it; it syncs every `SYNC_HOURS` (default 6) once the Flex token is set.
2. **Moomoo:** run the bridge on the Mac where OpenD is logged in:
   `ASSET_HUB_URL=http://127.0.0.1:8787 BRIDGE_TOKEN=... python3 bridges/moomoo_export.py` (put it in cron).
3. **Banks:** export CSVs, then import them in the account. Re-importing overlapping ranges is safe.
4. **Binance and wallets:** set the keys, then add your public addresses to the wallets account.

### Why HTTPS isn't strictly needed

Tailscale encrypts traffic between your devices, so plain HTTP over the tailnet is private. For a proper `https://` address (which also enables offline caching on iOS), run `tailscale serve 8787` and use the `https://<mac>.<tailnet>.ts.net` URL it prints.

## Security

- Every credential is **read-only** and lives only in `.env` on your machine. The browser never sees an API key.
- Wallets use **public addresses only**. The app never asks for a seed phrase.
- The passcode sets an HttpOnly, SameSite=Strict session cookie. The Moomoo bridge uses its own token.
- Screenshots and PDFs are sent to Claude only when you import them and have set `ANTHROPIC_API_KEY`.

## Development

```bash
npm test              # parsers, connectors (with fake HTTP), P&L, cash flow, API
npm run build:demo    # single-file demo build in dist/
```

The project is plain Node with no build step. Its only dependency is `@anthropic-ai/sdk`, used by the PDF and screenshot reader.

```
server/           HTTP API, SQLite store, sync scheduler
server/connectors IBKR Flex, Binance, Zerion
public/           the PWA (vanilla JS), service worker, manifest
public/shared/    logic shared by server and browser: P&L, cash flow, importers, rules
bridges/          Moomoo OpenD export script
docs/             data source research
```

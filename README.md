# wheel.desk

A personal trading dashboard for the wheel strategy (cash-secured puts + covered calls). Screens watchlist tickers against technical criteria, tracks open positions, and surfaces actionable signals.

## Running

Requires an HTTP server (ES modules don't work over `file://`):

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## First-time setup

On first load you'll be prompted for:
1. **Apps Script URL** — the deployed URL of your Google Apps Script web app (backs all data storage)
2. **Secret key** — a shared secret configured in your Apps Script

Both are stored in `localStorage` on that device only and never hardcoded anywhere in this repo.

## Features

- **Signals** — four types: CSP entry (all 4 criteria met), Covered Call opportunity, Roll (strike breached), Early Close (50%+ premium captured)
- **Positions** — tracks share lots (grouped by ticker with weighted-avg cost basis) and open short options with live P&L
- **Watchlist** — tickers screened live against IVR, RSI, Stochastic, and moving average
- **Criteria** — all screening thresholds are configurable and synced to your sheet
- **Cross-device sync** — Google Sheets is the source of truth; pulls every 5 minutes automatically

Market data (quotes, indicators, option prices) comes from Yahoo Finance. IVR is approximated from HV30 — not real IV rank. Always verify in your broker before trading.

## Structure

```
index.html              — markup only
src/
  styles/main.css       — all styles
  scripts/
    state.js            — shared app state (S object)
    ui.js               — modals, nav, toast, market clock
    sheets.js           — Google Sheets read/write
    market.js           — Yahoo Finance fetches + indicator calculations
    render.js           — all DOM rendering + detail modals
    screener.js         — signal generation logic
    positions.js        — position CRUD + form helpers
    watchlist.js        — watchlist CRUD
    criteria.js         — criteria form read/write
    auth.js             — login/setup gate
    boot.js             — boot sequence + sync
    app.js              — entry point, event wiring
```

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step. Because the app uses ES modules (`type="module"`), it must be served over HTTP — `file://` won't work:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

On first load the password gate requires: (1) a Google Apps Script deployment URL, and (2) a secret key — both stored in `localStorage`, never in the source.

## File structure

```
index.html              — HTML shell (no inline JS or CSS)
src/
  styles/
    main.css            — all styles
  scripts/
    state.js            — S (global state), LS constants, getSheetUrl/getSecret/isConfigured
    ui.js               — toast, modals, nav switching, market clock, setSyncStatus
    sheets.js           — sheetRead, sheetWriteViaGet (Google Apps Script API)
    market.js           — fetchQ (Yahoo Finance + indicators), fetchOptionPrice, suggestStrike
    render.js           — dte, renderSigs, renderWatch, renderPositions, detail modals
    criteria.js         — saveCrit, applyCrit
    screener.js         — runScreener, refreshOptionPrices
    positions.js        — savePos, editPos, delPos, togglePF, resetPF, addShareLot
    watchlist.js        — addWatch, removeWatch
    auth.js             — doSetup, doLogin, showSetupForm, showLoginForm, resetCredentials
    boot.js             — boot(), syncFromSheet()
    app.js              — entry point: addEventListener wiring, window.* bindings, startup
```

## Architecture

**ES module app**: no bundler, no framework — pure vanilla JS split across 12 modules loaded as `type="module"`. The dependency graph is strictly acyclic:

```
state ← ui ← sheets ← criteria
                ↑
state ← market ← render ← screener ← positions, watchlist, boot
                                               ↑
                                             auth → boot
                                               ↑
                                             app (entry point)
```

### Global state

One object `S` in `src/scripts/state.js` holds all runtime state:

```js
S = { watchlist, positions, signals, criteria, lastRefresh, editId }
```

Every render function reads from `S` and writes to the DOM. Mutations to `S` are always followed by the relevant `render*()` call and a `sheetWriteViaGet()` to persist.

### Data persistence — Google Sheets

All user data (watchlist, positions, signals, criteria) is stored in a Google Sheet via a Google Apps Script web app:

- **Reads**: `GET ?secret=…&action=read` → returns JSON
- **Writes**: `GET ?secret=…&action=write&data=<urlencoded JSON>` — `sheetWriteViaGet()` — used everywhere because Apps Script CORS handling is simpler for GET
- A `sheetWrite()` POST variant also exists but is not the primary path

Credentials (`wd_sheet_url`, `wd_secret`, `wd_authed`) are stored in `localStorage` only.

### Market data — Yahoo Finance

`fetchQ(ticker)` fetches 1-year daily OHLCV from `query1.finance.yahoo.com/v8/finance/chart/…` and derives:
- **RSI-14** — standard Wilder smoothing approximation over last 16 closes
- **Stochastic %K** — 14-period high/low range
- **HV30** — 21-day log-return volatility annualized
- **IVR estimate** — `HV30 × 1.25 + pctFromHigh × 0.15` (not real IV rank)
- **MA check** — price vs. N-period SMA (default 200)

`fetchOptionPrice(ticker, type, strike, expiry)` fetches live bid/ask midpoint from `query1.finance.yahoo.com/v7/finance/options/…`, trying multiple expiry offsets (±1–2 days) then falling back to scanning all available expiration dates.

### Screener (`runScreener`)

Iterates all watchlist tickers + position tickers sequentially (350 ms delay between fetches to avoid rate-limiting), then evaluates four signal types:

| Signal | Trigger |
|--------|---------|
| `csp` | All 4 criteria met (IVR, RSI, Stoch, MA) on a watchlist ticker with no open option |
| `cc` | Ticker has ≥100 shares, IVR ≥ `ccIvr`, no open call |
| `roll` | Short put/call whose current price > collected premium (strike breached) |
| `close` | Premium captured ≥ `closePct`% and DTE elapsed < `closeDtePct`% |

Partial CSP signals (2–3/4 criteria) are also surfaced with lower priority.

### Pages / tabs

| ID | Tab |
|----|-----|
| `pg-signals` | Trading signals |
| `pg-positions` | Share lots + open short options |
| `pg-watchlist` | Tickers to screen |
| `pg-criteria` | Configurable screening parameters |

Tab switching: `switchTab()` (top tab bar) and `switchPage()` (bottom nav) both update `.active` classes and control FAB visibility.

### Modals

Overlays use `.overlay` / `.open` CSS classes. `openModal(id)` / `closeModal(id)`. Clicking the backdrop closes the modal. The FAB (`+` button) opens the Add Watchlist or Add Position modal depending on the active page.

### Auto-refresh schedule (in `boot.js`)

Three intervals start after login: screener every 20 min during market hours (9:30–16:00 ET weekdays), option price refresh hourly during market hours, and `syncFromSheet` every 5 min to catch edits from other devices.

### `window.*` bindings

Because dynamically-generated `innerHTML` uses onclick strings (e.g. `onclick="removeWatch('AAPL')"`), the functions those strings call must live on `window`. `app.js` attaches them explicitly:

```
window.openModal, closeModal, removeWatch, showDetail, showPosDetail,
showShareGroupDetail, editPos, addShareLot
```

All other interactions use `addEventListener` wired in `app.js`.

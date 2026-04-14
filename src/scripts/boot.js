import { S } from './state.js';
import { showToast, updateMkt } from './ui.js';
import { sheetRead } from './sheets.js';
import { applyCrit } from './criteria.js';
import { renderWatch, renderPositions, renderSigs } from './render.js';
import { runScreener, refreshOptionPrices } from './screener.js';

// ─── SYNC FROM SHEET ─────────────────────────────────────────────────────────
// Pull the latest data from Google Sheets and re-render all pages.
// Called on ⇩ button press, on boot, and on the 5-minute auto-sync timer.
export async function syncFromSheet() {
  showToast('Pulling from Google Sheets…', '');
  const data = await sheetRead();
  if (!data) return;

  // Merge watchlist — preserve live market data that lives only in memory.
  if (Array.isArray(data.watchlist)) {
    S.watchlist = data.watchlist.map(w => {
      const existing = S.watchlist.find(x => x.ticker === w.ticker);
      return {
        ticker:   String(w.ticker),
        addedAt:  w.addedAt || Date.now(),
        liveData: existing?.liveData || null
      };
    });
  }

  if (Array.isArray(data.positions)) {
    S.positions = data.positions.map(p => ({
      id:       Number(p.id) || Date.now(),
      ticker:   String(p.ticker || ''),
      type:     String(p.type   || 'shares'),
      qty:      Number(p.qty)  || 0,
      cost:     Number(p.cost) || 0,
      strike:   p.strike  !== '' && p.strike  !== null ? Number(p.strike)  : undefined,
      expiry:   p.expiry  || '',
      prem:     p.prem    !== '' && p.prem    !== null ? Number(p.prem)    : undefined,
      curPrem:  p.curPrem !== '' && p.curPrem !== null && p.curPrem !== undefined
                  ? Number(p.curPrem) : undefined,
      notes:    p.notes    || '',
      enteredAt: Number(p.enteredAt) || Date.now()
    }));
  }

  if (data.criteria && typeof data.criteria === 'object') {
    const c = data.criteria;
    S.criteria = {
      ivr:        Number(c.ivr)        || 50,
      stoch:      Number(c.stoch)      || 20,
      rsi:        Number(c.rsi)        || 35,
      ma:         Number(c.ma)         || 200,
      earn:       Number(c.earn)       || 30,
      delta:      Number(c.delta)      || 30,
      dteMin:     Number(c.dteMin)     || 21,
      dteMax:     Number(c.dteMax)     || 45,
      shares:     Number(c.shares)     || 100,
      ccIvr:      Number(c.ccIvr)      || 30,
      ccDelta:    Number(c.ccDelta)    || 20,
      ccDteMin:   Number(c.ccDteMin)   || 21,
      ccDteMax:   Number(c.ccDteMax)   || 35,
      closePct:   Number(c.closePct)   || 50,
      closeDtePct: Number(c.closeDtePct) || 50
    };
  }

  applyCrit();
  renderWatch();
  renderPositions();
  renderSigs();
  showToast('Synced from Google Sheets ✓', 'ok');
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
// Called once after the user authenticates. Loads data from Google Sheets,
// populates the UI, then starts the background timers.
export async function boot() {
  updateMkt();
  setInterval(updateMkt, 30000);

  const data = await sheetRead();
  if (data) {
    if (Array.isArray(data.watchlist)) {
      S.watchlist = data.watchlist.map(w => ({
        ticker:   String(w.ticker || ''),
        addedAt:  w.addedAt || Date.now(),
        liveData: null
      }));
    }
    if (Array.isArray(data.positions)) {
      S.positions = data.positions.filter(p => p.ticker).map(p => ({
        id:       Number(p.id) || Date.now(),
        ticker:   String(p.ticker),
        type:     String(p.type   || 'shares'),
        qty:      Number(p.qty)  || 0,
        cost:     Number(p.cost) || 0,
        strike:   p.strike  !== '' && p.strike  !== null ? Number(p.strike)  : undefined,
        expiry:   p.expiry  || '',
        prem:     p.prem    !== '' && p.prem    !== null ? Number(p.prem)    : undefined,
        curPrem:  p.curPrem !== '' && p.curPrem !== null && p.curPrem !== undefined
                    ? Number(p.curPrem) : undefined,
        notes:    p.notes    || '',
        enteredAt: Number(p.enteredAt) || Date.now()
      }));
    }
    if (data.criteria && typeof data.criteria === 'object' && Object.keys(data.criteria).length > 0) {
      const c = data.criteria;
      S.criteria = {
        ivr:        Number(c.ivr)        || 50,
        stoch:      Number(c.stoch)      || 20,
        rsi:        Number(c.rsi)        || 35,
        ma:         Number(c.ma)         || 200,
        earn:       Number(c.earn)       || 30,
        delta:      Number(c.delta)      || 30,
        dteMin:     Number(c.dteMin)     || 21,
        dteMax:     Number(c.dteMax)     || 45,
        shares:     Number(c.shares)     || 100,
        ccIvr:      Number(c.ccIvr)      || 30,
        ccDelta:    Number(c.ccDelta)    || 20,
        ccDteMin:   Number(c.ccDteMin)   || 21,
        ccDteMax:   Number(c.ccDteMax)   || 35,
        closePct:   Number(c.closePct)   || 50,
        closeDtePct: Number(c.closeDtePct) || 50
      };
    }
  }

  applyCrit();
  renderWatch();
  renderPositions();
  renderSigs();

  document.getElementById('boot').style.display = 'none';
  document.getElementById('fab').style.display  = 'none';

  // Full screener — every 20 minutes during market hours.
  setInterval(() => {
    const et   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const d    = et.getDay(), mins = et.getHours() * 60 + et.getMinutes();
    if (d >= 1 && d <= 5 && mins >= 570 && mins < 960) runScreener();
  }, 20 * 60 * 1000);

  // Options price refresh — hourly during market hours (silent, positions only).
  setInterval(() => {
    const et   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const d    = et.getDay(), mins = et.getHours() * 60 + et.getMinutes();
    if (d >= 1 && d <= 5 && mins >= 570 && mins < 960) refreshOptionPrices(false);
  }, 60 * 60 * 1000);

  // Pull from Sheets every 5 min to catch edits made on other devices.
  setInterval(syncFromSheet, 5 * 60 * 1000);
}

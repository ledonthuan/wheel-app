// ─── LOCAL STORAGE KEYS ──────────────────────────────────────────────────────
export const LS_URL_KEY     = 'wd_sheet_url';
export const LS_SECRET_KEY  = 'wd_secret';
export const LS_AUTH_KEY    = 'wd_authed';
export const LS_SESSION_KEY = 'wd_session';

export function getSheetUrl()  { return localStorage.getItem(LS_URL_KEY)    || ''; }
export function getSecret()    { return localStorage.getItem(LS_SECRET_KEY) || ''; }
export function isConfigured() { return !!getSheetUrl() && !!getSecret(); }

// ─── APPLICATION STATE ───────────────────────────────────────────────────────
// Single mutable object shared across all modules via ES module reference.
// All modules receive the same object reference — mutations are visible globally.
export const S = {
  watchlist:   [],
  positions:   [],
  signals:     [],
  criteria: {
    ivr: 50, stoch: 20, rsi: 35, ma: 200, earn: 30,
    delta: 30, dteMin: 21, dteMax: 45,
    shares: 100, ccIvr: 30, ccDelta: 20, ccDteMin: 21, ccDteMax: 35,
    closePct: 50, closeDtePct: 50
  },
  lastRefresh: null,
  editId:      null
};

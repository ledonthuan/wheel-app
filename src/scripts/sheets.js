import { S, getSheetUrl, getSecret } from './state.js';
import { setSyncStatus, showToast } from './ui.js';

// ─── READ ─────────────────────────────────────────────────────────────────────
export async function sheetRead() {
  setSyncStatus('syncing', 'pulling…');
  try {
    const url  = `${getSheetUrl()}?secret=${encodeURIComponent(getSecret())}&action=read`;
    const r    = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    setSyncStatus('synced', 'synced');
    return data;
  } catch (e) {
    setSyncStatus('error', 'sync error');
    showToast('⚠ Could not reach Google Sheets — ' + e.message, 'err');
    return null;
  }
}

// ─── WRITE (POST) ─────────────────────────────────────────────────────────────
// Kept for completeness. sheetWriteViaGet is the primary write path because
// Apps Script handles GET-based writes more predictably across all browsers.
export async function sheetWrite() {
  setSyncStatus('syncing', 'saving…');
  try {
    const r = await fetch(getSheetUrl(), {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ secret: getSecret(), action: 'write', ...buildPayload() })
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { ok: true }; }
    if (data.error) throw new Error(data.error);
    setSyncStatus('synced', 'saved ✓');
    showToast('Saved to Google Sheets', 'ok');
  } catch (e) {
    setSyncStatus('error', 'save failed');
    showToast('⚠ Save failed — ' + e.message, 'err');
  }
}

// ─── WRITE (GET) ─────────────────────────────────────────────────────────────
// Primary write method. Apps Script requires the payload as a URL parameter
// because CORS pre-flight on POST is unreliable in the deployed Apps Script env.
export async function sheetWriteViaGet() {
  setSyncStatus('syncing', 'saving…');
  try {
    const payload = JSON.stringify(buildPayload());
    const url = `${getSheetUrl()}?secret=${encodeURIComponent(getSecret())}&action=write&data=${encodeURIComponent(payload)}`;
    const r   = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { ok: true }; }
    if (data && data.error) throw new Error(data.error);
    setSyncStatus('synced', 'saved ✓');
    showToast('Saved to Google Sheets', 'ok');
  } catch (e) {
    setSyncStatus('error', 'save failed');
    showToast('⚠ Save failed — ' + e.message, 'err');
  }
}

// ─── PAYLOAD BUILDER ─────────────────────────────────────────────────────────
// Strips runtime-only fields (_liveCurPrem, liveData, etc.) before persisting.
function buildPayload() {
  return {
    watchlist: S.watchlist.map(w => ({ ticker: w.ticker, addedAt: w.addedAt })),
    positions: S.positions.map(p => ({
      id:        p.id,
      ticker:    p.ticker,
      type:      p.type,
      qty:       p.qty,
      cost:      p.cost,
      strike:    p.strike  !== undefined ? p.strike  : '',
      expiry:    p.expiry  || '',
      prem:      p.prem    !== undefined ? p.prem    : '',
      curPrem:   p.curPrem !== undefined ? p.curPrem : '',
      notes:     p.notes   || '',
      enteredAt: p.enteredAt || ''
    })),
    criteria: S.criteria,
    signals: S.signals.map(sig => ({
      id: sig.id, type: sig.type, ticker: sig.ticker,
      suggestion: sig.suggestion, ts: sig.ts
    }))
  };
}

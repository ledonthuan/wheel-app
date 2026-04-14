import { S } from './state.js';
import { sheetWriteViaGet } from './sheets.js';

// ─── SAVE ─────────────────────────────────────────────────────────────────────
// Reads all criteria inputs from the DOM and persists them to S + Google Sheets.
export function saveCrit() {
  S.criteria = {
    ivr:        +document.getElementById('c-ivr').value,
    stoch:      +document.getElementById('c-stoch').value,
    rsi:        +document.getElementById('c-rsi').value,
    ma:         +document.getElementById('c-ma').value,
    earn:       +document.getElementById('c-earn').value,
    delta:      +document.getElementById('c-delta').value,
    dteMin:     +document.getElementById('c-dte-min').value,
    dteMax:     +document.getElementById('c-dte-max').value,
    shares:     +document.getElementById('c-shares').value,
    ccIvr:      +document.getElementById('c-cc-ivr').value,
    ccDelta:    +document.getElementById('c-cc-delta').value,
    ccDteMin:   +document.getElementById('c-cc-dte-min').value,
    ccDteMax:   +document.getElementById('c-cc-dte-max').value,
    closePct:   +document.getElementById('c-close-pct').value,
    closeDtePct: +document.getElementById('c-close-dte').value
  };
  sheetWriteViaGet();
}

// ─── APPLY ────────────────────────────────────────────────────────────────────
// Writes current S.criteria values back into the criteria form inputs.
export function applyCrit() {
  const c = S.criteria;
  document.getElementById('c-ivr').value        = c.ivr;
  document.getElementById('c-stoch').value      = c.stoch;
  document.getElementById('c-rsi').value        = c.rsi;
  document.getElementById('c-ma').value         = c.ma;
  document.getElementById('c-earn').value       = c.earn;
  document.getElementById('c-delta').value      = c.delta;
  document.getElementById('c-dte-min').value    = c.dteMin;
  document.getElementById('c-dte-max').value    = c.dteMax;
  document.getElementById('c-shares').value     = c.shares;
  document.getElementById('c-cc-ivr').value     = c.ccIvr;
  document.getElementById('c-cc-delta').value   = c.ccDelta;
  document.getElementById('c-cc-dte-min').value = c.ccDteMin;
  document.getElementById('c-cc-dte-max').value = c.ccDteMax;
  document.getElementById('c-close-pct').value  = c.closePct;
  document.getElementById('c-close-dte').value  = c.closeDtePct;
}

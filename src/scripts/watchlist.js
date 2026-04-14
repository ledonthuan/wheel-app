import { S } from './state.js';
import { closeModal } from './ui.js';
import { sheetWriteViaGet } from './sheets.js';
import { runScreener } from './screener.js';
import { renderWatch, renderSigs } from './render.js';

// ─── ADD ──────────────────────────────────────────────────────────────────────
export function addWatch() {
  const ticker = document.getElementById('w-ticker').value.trim().toUpperCase();
  if (!ticker) return;
  if (S.watchlist.find(w => w.ticker === ticker)) {
    alert('Already watching ' + ticker);
    return;
  }
  S.watchlist.push({ ticker, addedAt: Date.now(), liveData: null });
  document.getElementById('w-ticker').value = '';
  closeModal('modal-watch');
  sheetWriteViaGet();
  renderWatch();
  runScreener();
}

// ─── REMOVE ───────────────────────────────────────────────────────────────────
// Called from the × button in dynamically rendered watchlist cards.
// Exposed to window by app.js.
export function removeWatch(ticker) {
  S.watchlist = S.watchlist.filter(w => w.ticker !== ticker);
  sheetWriteViaGet();
  renderWatch();
  renderSigs();
}

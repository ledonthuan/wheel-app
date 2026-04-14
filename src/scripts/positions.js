import { S } from './state.js';
import { openModal, closeModal } from './ui.js';
import { sheetWriteViaGet } from './sheets.js';
import { runScreener } from './screener.js';
import { renderPositions } from './render.js';

// ─── FORM HELPERS ─────────────────────────────────────────────────────────────

// Show or hide the options-only fields section based on position type.
export function togglePF() {
  const type  = document.getElementById('p-type').value;
  const isOpt = type !== 'shares';
  document.getElementById('p-opt-fields').style.display = isOpt ? 'block' : 'none';
  document.getElementById('p-cost-row').style.display   = isOpt ? 'none'  : 'block';
}

// Reset all add/edit position form fields to their blank defaults.
export function resetPF() {
  ['p-ticker', 'p-qty', 'p-cost', 'p-strike', 'p-prem', 'p-curprem', 'p-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('p-type').value    = 'shares';
  document.getElementById('p-expiry').value  = '';
  document.getElementById('p-opendate').value = '';
  document.getElementById('p-opt-fields').style.display = 'none';
  document.getElementById('p-cost-row').style.display   = 'block';
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function savePos() {
  const ticker = document.getElementById('p-ticker').value.trim().toUpperCase();
  const type   = document.getElementById('p-type').value;
  const qty    = parseFloat(document.getElementById('p-qty').value);

  if (!ticker || !qty) { alert('Ticker and quantity are required.'); return; }

  const openDateVal = document.getElementById('p-opendate').value;
  const enteredAt   = openDateVal
    ? new Date(openDateVal + 'T12:00:00').getTime()
    : S.editId
      ? (S.positions.find(p => p.id === S.editId)?.enteredAt || Date.now())
      : Date.now();

  const pos = {
    id: S.editId || Date.now(),
    ticker, type, qty,
    notes: document.getElementById('p-notes').value.trim(),
    enteredAt
  };

  if (type === 'shares') {
    const cost = parseFloat(document.getElementById('p-cost').value);
    pos.cost = isNaN(cost) ? 0 : cost; // cost is optional for shares
  } else {
    pos.strike = parseFloat(document.getElementById('p-strike').value) || 0;
    pos.expiry = document.getElementById('p-expiry').value || '';
    const prem = parseFloat(document.getElementById('p-prem').value);
    if (isNaN(prem)) { alert('Premium collected is required.'); return; }
    pos.prem = prem;
    pos.cost = prem; // keep cost in sync for backward compatibility
    const cp = parseFloat(document.getElementById('p-curprem').value);
    if (!isNaN(cp)) pos.curPrem = cp;
  }

  if (S.editId) {
    const i = S.positions.findIndex(p => p.id === S.editId);
    if (i !== -1) S.positions[i] = pos;
  } else {
    S.positions.push(pos);
  }

  closeModal('modal-pos');
  sheetWriteViaGet();
  renderPositions();
  runScreener();
}

export function editPos(id) {
  const pos = S.positions.find(p => p.id === id);
  if (!pos) return;

  S.editId = id;
  document.getElementById('pos-mtitle').textContent = 'Edit Position';
  document.getElementById('del-btn').style.display  = 'block';

  // Set type first so we know whether to show option fields.
  document.getElementById('p-type').value = pos.type;

  // Force opt-fields visible BEFORE setting values — browsers can silently
  // drop values set into hidden date/number inputs on some platforms.
  const isOpt = pos.type !== 'shares';
  document.getElementById('p-opt-fields').style.display = isOpt ? 'block' : 'none';
  document.getElementById('p-cost-row').style.display   = isOpt ? 'none'  : 'block';

  document.getElementById('p-ticker').value   = pos.ticker;
  document.getElementById('p-qty').value      = pos.qty;
  document.getElementById('p-notes').value    = pos.notes || '';
  document.getElementById('p-opendate').value = pos.enteredAt
    ? new Date(pos.enteredAt).toISOString().slice(0, 10) : '';

  if (isOpt) {
    document.getElementById('p-strike').value  = pos.strike  != null ? pos.strike  : '';
    document.getElementById('p-expiry').value  = pos.expiry  || '';
    document.getElementById('p-prem').value    = pos.prem    != null ? pos.prem    : '';
    document.getElementById('p-curprem').value = pos.curPrem != null ? pos.curPrem : '';
    document.getElementById('p-cost').value    = '';
  } else {
    document.getElementById('p-cost').value    = pos.cost   != null ? pos.cost   : '';
    document.getElementById('p-strike').value  = '';
    document.getElementById('p-expiry').value  = '';
    document.getElementById('p-prem').value    = '';
    document.getElementById('p-curprem').value = '';
  }

  openModal('modal-pos');
}

export function delPos() {
  if (!confirm('Remove this position?')) return;
  S.positions = S.positions.filter(p => p.id !== S.editId);
  closeModal('modal-pos');
  sheetWriteViaGet();
  renderPositions();
  runScreener();
}

// ─── ADD SHARE LOT ────────────────────────────────────────────────────────────
// Called from the "Add Another Lot" button inside the share-group detail modal.
// Exposed to window by app.js so it can be used in dynamically rendered onclick.
export function addShareLot(ticker) {
  closeModal('modal-detail');
  S.editId = null;
  resetPF();
  document.getElementById('pos-mtitle').textContent       = 'Add Shares';
  document.getElementById('p-ticker').value               = ticker;
  document.getElementById('p-type').value                 = 'shares';
  document.getElementById('p-opt-fields').style.display   = 'none';
  document.getElementById('p-cost-row').style.display     = 'block';
  openModal('modal-pos');
}

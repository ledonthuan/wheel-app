/**
 * app.js — Entry point for Wheel.desk
 *
 * Responsibilities:
 *  1. Wire all static HTML elements to their handler functions via addEventListener
 *     (replaces inline onclick/onchange attributes in the HTML).
 *  2. Expose functions to window that are called from dynamically-generated
 *     innerHTML onclick strings (render.js template literals).
 *  3. Run the startup decision tree (setup / login / auto-boot).
 */

import { S, isConfigured, LS_SESSION_KEY } from './state.js';
import { openModal, closeModal, switchTab, switchPage, initModalBackdrops } from './ui.js';
import { runScreener } from './screener.js';
import { saveCrit } from './criteria.js';
import { savePos, editPos, delPos, togglePF, resetPF, addShareLot } from './positions.js';
import { addWatch, removeWatch } from './watchlist.js';
import { showDetail, showPosDetail, showShareGroupDetail } from './render.js';
import { doSetup, doLogin, showSetupForm, showLoginForm, resetCredentials } from './auth.js';
import { boot, syncFromSheet } from './boot.js';

// ─── EXPOSE TO WINDOW ────────────────────────────────────────────────────────
// These functions are referenced by name in dynamically-generated innerHTML
// onclick strings (template literals in render.js). ES module scope is not
// accessible from inline onclick attributes, so we attach them explicitly.
window.openModal            = openModal;
window.closeModal           = closeModal;
window.removeWatch          = removeWatch;
window.showDetail           = showDetail;
window.showPosDetail        = showPosDetail;
window.showShareGroupDetail = showShareGroupDetail;
window.editPos              = editPos;
window.addShareLot          = addShareLot;

// ─── STATIC EVENT LISTENERS ──────────────────────────────────────────────────
// All onclick/onchange attributes have been removed from index.html.
// Everything is wired up here after the DOM is ready.

// Header buttons
document.getElementById('btn-sync').addEventListener('click', syncFromSheet);
document.getElementById('rfbtn').addEventListener('click', runScreener);
document.getElementById('btn-help').addEventListener('click', () => openModal('modal-help'));

// Tab bar — delegate to the same switchTab() logic
document.querySelectorAll('.tab').forEach(tab =>
  tab.addEventListener('click', () => switchTab(tab))
);

// Bottom navigation
document.querySelectorAll('.bni').forEach(nav =>
  nav.addEventListener('click', () => switchPage(nav.dataset.page, nav))
);

// FAB (+ button)
document.getElementById('fab').addEventListener('click', () => {
  const pid = document.querySelector('.page.active').id;
  if (pid === 'pg-watchlist') {
    openModal('modal-watch');
  } else if (pid === 'pg-positions') {
    S.editId = null;
    resetPF();
    document.getElementById('pos-mtitle').textContent = 'Add Position';
    document.getElementById('del-btn').style.display  = 'none';
    openModal('modal-pos');
  }
});

// Auth gate — setup form
document.getElementById('pw-setup-btn').addEventListener('click', () => doSetup(boot));
document.getElementById('pw-url-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSetup(boot);
});
document.getElementById('pw-secret-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSetup(boot);
});

// Auth gate — login form
document.getElementById('pw-login-btn').addEventListener('click', () => doLogin(boot));
document.getElementById('pw-login-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin(boot);
});
document.getElementById('pw-reset-btn').addEventListener('click', resetCredentials);

// Watchlist modal
document.getElementById('btn-add-watch').addEventListener('click', addWatch);
document.getElementById('btn-cancel-watch').addEventListener('click', () => closeModal('modal-watch'));

// Position modal
document.getElementById('p-type').addEventListener('change', togglePF);
document.getElementById('btn-save-pos').addEventListener('click', savePos);
document.getElementById('btn-cancel-pos').addEventListener('click', () => closeModal('modal-pos'));
document.getElementById('del-btn').addEventListener('click', delPos);

// Criteria inputs — save on any change
document.querySelectorAll('.sinput').forEach(input =>
  input.addEventListener('change', saveCrit)
);

// Criteria page action buttons
document.getElementById('btn-run-screener').addEventListener('click', runScreener);
document.getElementById('btn-sync-sheet').addEventListener('click', syncFromSheet);

// Help modal close
document.getElementById('btn-close-help').addEventListener('click', () => closeModal('modal-help'));

// Modal backdrop clicks
initModalBackdrops();

// ─── STARTUP DECISION TREE ───────────────────────────────────────────────────
// 1. No credentials stored          → first time on this device → show setup form
// 2. Credentials + active session   → skip gate, boot directly
// 3. Credentials + no active session → returning user, new tab → show login form

if (!isConfigured()) {
  document.getElementById('boot').style.display = 'none';
  showSetupForm();
} else if (localStorage.getItem(LS_SESSION_KEY) === '1') {
  document.getElementById('pw-gate').classList.add('hidden');
  boot();
} else {
  document.getElementById('boot').style.display = 'none';
  showLoginForm();
}

// ─── SYNC STATUS ─────────────────────────────────────────────────────────────
export function setSyncStatus(state, msg) {
  const el = document.getElementById('sync-status');
  el.className = 'sync-status ' + state;
  const icons = { synced: '⬡', syncing: '↻', error: '⚠', idle: '⬡' };
  el.textContent = (icons[state] || '') + ' ' + msg;
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
let toastTimer;
export function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '') + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── MODALS ──────────────────────────────────────────────────────────────────
export function openModal(id)  { document.getElementById(id).classList.add('open'); }
export function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close any modal when the backdrop (overlay) is clicked.
export function initModalBackdrops() {
  document.querySelectorAll('.overlay').forEach(m =>
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); })
  );
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
export function switchTab(el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const pid = el.dataset.page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pid).classList.add('active');
  fabV(pid);
}

export function switchPage(pid, nav) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pid).classList.add('active');
  document.querySelectorAll('.bni').forEach(n => n.classList.remove('active'));
  nav.classList.add('active');
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.page === pid)
  );
  fabV(pid);
}

// Show or hide the FAB depending on which page is active.
// Signals page has no FAB; all other pages show it.
export function fabV(pid) {
  document.getElementById('fab').style.display = pid === 'pg-signals' ? 'none' : 'flex';
}

// ─── MARKET CLOCK ────────────────────────────────────────────────────────────
// Displays current market status (open/closed/weekend) in the header.
// Market hours: 9:30–16:00 ET on weekdays (minutes 570–960).
export function updateMkt() {
  const et   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = et.getDay();
  const mins = et.getHours() * 60 + et.getMinutes();
  const wd   = day >= 1 && day <= 5;
  const open = wd && mins >= 570 && mins < 960;

  document.getElementById('mkt-dot').className = 'dot' + (open ? '' : ' off');
  const t = document.getElementById('mkt-txt');
  if (open) {
    const remaining = 960 - mins;
    t.textContent = `Open · ${Math.floor(remaining / 60)}h ${remaining % 60}m`;
  } else {
    t.textContent = wd ? 'Market closed' : 'Weekend';
  }
}

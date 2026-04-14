import { LS_URL_KEY, LS_SECRET_KEY, LS_SESSION_KEY, getSheetUrl, getSecret } from './state.js';

// ─── FORM DISPLAY ─────────────────────────────────────────────────────────────

export function showSetupForm() {
  document.getElementById('pw-sub').textContent               = 'First-time setup — enter your Google Sheet credentials';
  document.getElementById('pw-setup-card').style.display      = 'flex';
  document.getElementById('pw-login-card').style.display      = 'none';
  document.getElementById('pw-url-input').focus();
}

export function showLoginForm() {
  document.getElementById('pw-sub').textContent               = 'personal trading dashboard';
  document.getElementById('pw-setup-card').style.display      = 'none';
  document.getElementById('pw-login-card').style.display      = 'flex';
  document.getElementById('pw-login-input').focus();
}

// ─── SETUP (first time) ──────────────────────────────────────────────────────
// Validates the Apps Script URL + secret by making a live test read before
// storing anything. Credentials are saved to localStorage on that device only.
export async function doSetup(bootFn) {
  const url    = document.getElementById('pw-url-input').value.trim();
  const secret = document.getElementById('pw-secret-input').value.trim();
  const err    = document.getElementById('pw-err');
  err.textContent = '';

  if (!url || !url.startsWith('https://script.google.com')) {
    err.textContent = 'Enter a valid Apps Script URL (starts with https://script.google.com)';
    return;
  }
  if (!secret) {
    err.textContent = 'Secret key cannot be empty';
    return;
  }

  err.textContent = 'Testing connection…';

  try {
    const testUrl = `${url}?secret=${encodeURIComponent(secret)}&action=read`;
    const r       = await fetch(testUrl, { signal: AbortSignal.timeout(12000) });
    const data    = await r.json();
    if (data.error && data.error === 'unauthorized') {
      err.textContent = '✗ Wrong secret key — check your Apps Script and try again';
      return;
    }
    // Any non-error response (including empty sheet) means credentials are valid.
  } catch (e) {
    err.textContent = '✗ Could not reach your Apps Script — check the URL and try again';
    return;
  }

  localStorage.setItem(LS_URL_KEY,    url);
  localStorage.setItem(LS_SECRET_KEY, secret);
  localStorage.setItem(LS_SESSION_KEY, '1');

  document.getElementById('pw-gate').classList.add('hidden');
  bootFn();
}

// ─── LOGIN (returning user) ───────────────────────────────────────────────────
// Compares the entered secret against the one already stored in localStorage.
// No network request needed — the secret is already persisted locally.
export function doLogin(bootFn) {
  const secret = document.getElementById('pw-login-input').value.trim();
  const err    = document.getElementById('pw-login-err');
  err.textContent = '';

  if (!secret) { err.textContent = 'Enter your secret key'; return; }

  if (secret !== getSecret()) {
    err.textContent = 'Incorrect secret key';
    const input = document.getElementById('pw-login-input');
    input.value = '';
    input.style.borderColor = 'var(--r)';
    setTimeout(() => { input.style.borderColor = ''; }, 1200);
    input.focus();
    return;
  }

  localStorage.setItem(LS_SESSION_KEY, '1');
  document.getElementById('pw-gate').classList.add('hidden');
  bootFn();
}

// ─── RESET ────────────────────────────────────────────────────────────────────
export function resetCredentials() {
  if (!confirm('This will clear your saved URL and secret key from this device. You will need to re-enter them. Continue?')) return;
  localStorage.removeItem(LS_URL_KEY);
  localStorage.removeItem(LS_SECRET_KEY);
  localStorage.removeItem(LS_SESSION_KEY);
  showSetupForm();
}

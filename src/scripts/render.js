import { S } from './state.js';
import { openModal } from './ui.js';

// ─── UTILITY ─────────────────────────────────────────────────────────────────

// Days-to-expiry from an ISO date string (YYYY-MM-DD).
// Uses noon-local time to avoid off-by-one from timezone shifts.
export function dte(expiry) {
  if (!expiry) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((new Date(expiry + 'T12:00:00') - now) / 86400000);
}

// ─── WATCHLIST ────────────────────────────────────────────────────────────────
export function renderWatch() {
  const c  = document.getElementById('watch-container');
  c.style.display = 'grid';
  c.style.gridTemplateColumns = 'repeat(2,1fr)';
  c.style.gap = '8px';
  document.getElementById('bdg-watch').textContent = S.watchlist.length;

  if (!S.watchlist.length) {
    c.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🔭</div><div class="empty-title">No tickers</div><div class="empty-sub">Tap + to add a ticker to screen.</div></div>';
    return;
  }

  const cr = S.criteria;
  c.innerHTML = S.watchlist.map(w => {
    const d = w.liveData;
    let pills = '', st = 'waiting', stTxt = '';
    if (!d) {
      pills = '<span class="cpill warn" style="font-size:9px;padding:2px 5px">Tap ↻ to screen</span>';
      stTxt = '⏳ No data yet — tap ↻ above';
    } else {
      const chks = [
        { l: `IVR ${d.ivrEst !== null ? d.ivrEst + '%' : '?'}`,         ok: d.ivrEst  !== null && d.ivrEst  >= cr.ivr   },
        { l: `RSI ${d.rsiEst !== null ? d.rsiEst.toFixed(0) : '?'}`,    ok: d.rsiEst  !== null && d.rsiEst  <= cr.rsi   },
        { l: `Stoch ${d.stochEst !== null ? d.stochEst.toFixed(0) : '?'}`, ok: d.stochEst !== null && d.stochEst <= cr.stoch },
        { l: `${cr.ma}MA`, ok: d.aboveMa !== false },
      ];
      pills = chks.map(ch =>
        `<span class="cpill ${ch.ok ? 'pass' : 'fail'}" style="font-size:9px;padding:2px 5px">${ch.ok ? '✓' : '✗'} ${ch.l}</span>`
      ).join('');
      const passCount = chks.filter(ch => ch.ok).length;
      if (passCount === 4)      { st = 'ready';   stTxt = '✓ CSP ready'; }
      else if (passCount >= 2)  { st = 'partial'; stTxt = `${passCount}/4 met`; }
      else                      { st = 'waiting'; stTxt = `${passCount}/4 met`; }
    }

    const price = d && d.price ? `$${d.price.toFixed(2)}` : '—';
    const chg   = d && d.chg1d !== null
      ? `<span style="color:var(--${d.chg1d >= 0 ? 'g' : 'r'})">${d.chg1d >= 0 ? '+' : ''}${d.chg1d.toFixed(1)}%</span>`
      : '';

    return `<div class="witem" style="flex-direction:column;align-items:flex-start;gap:6px;padding:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
        <div class="wtkr" style="font-size:15px;min-width:auto">${w.ticker}</div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--mu2)">${price} ${chg}</span>
          <div class="wdel" onclick="removeWatch('${w.ticker}')" style="font-size:16px">×</div>
        </div>
      </div>
      <div class="wcrit" style="gap:3px">${pills}</div>
      <div class="wst ${st}" style="font-size:10px">${stTxt}</div>
    </div>`;
  }).join('');
}

// ─── POSITIONS ────────────────────────────────────────────────────────────────
export function renderPositions() {
  const c = document.getElementById('pos-container');
  c.style.display = 'block';
  c.style.gridTemplateColumns = '';
  c.style.gap = '';

  document.getElementById('bdg-pos').textContent = S.positions.length;

  if (!S.positions.length) {
    c.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">No positions</div><div class="empty-sub">Tap + to add shares or an open short option.</div></div>';
    return;
  }

  // Group shares by ticker to show a weighted-average cost basis row per ticker.
  const shareGroups = {};
  for (const pos of S.positions.filter(p => p.type === 'shares')) {
    if (!shareGroups[pos.ticker]) {
      shareGroups[pos.ticker] = { ticker: pos.ticker, lots: [], totalQty: 0, totalCost: 0 };
    }
    shareGroups[pos.ticker].lots.push(pos);
    shareGroups[pos.ticker].totalQty  += pos.qty;
    shareGroups[pos.ticker].totalCost += (pos.cost || 0) * pos.qty;
  }

  const optPositions = S.positions.filter(p => p.type !== 'shares');
  let html = '';

  // ── Shares section ──────────────────────────────────────────────────────────
  const shareKeys = Object.keys(shareGroups);
  if (shareKeys.length) {
    html += `<div class="pos-section-hdr"><span style="background:var(--bl)"></span>Shares</div>
    <div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rr);overflow:hidden;margin-bottom:12px">
    <table class="pos-table">
      <thead><tr>
        <th>Ticker</th><th>Shares</th><th>Avg Cost</th><th>Mkt Price</th><th>Lots</th>
      </tr></thead>
      <tbody>`;

    for (const key of shareKeys.sort()) {
      const g        = shareGroups[key];
      const avgCost  = g.totalQty > 0 ? g.totalCost / g.totalQty : 0;
      const avgCostStr = avgCost > 0 ? `$${avgCost.toFixed(2)}` : '—';
      const liveQ    = S.watchlist.find(w => w.ticker === g.ticker)?.liveData;
      const mktPrice = liveQ?.price ? `$${liveQ.price.toFixed(2)}` : '—';
      const lotLabel = `${g.lots.length} lot${g.lots.length > 1 ? 's' : ''}`;

      html += `<tr onclick="showShareGroupDetail('${g.ticker}')">
        <td><div class="pos-ticker-cell">
          <div class="pos-ticker-name">${g.ticker}</div>
          <span class="pos-type-pill shares">Shares</span>
        </div></td>
        <td style="font-family:var(--mono);font-weight:700;color:var(--g)">${g.totalQty}</td>
        <td style="font-family:var(--mono)">${avgCostStr}</td>
        <td style="font-family:var(--mono)">${mktPrice}</td>
        <td><span class="pos-lot-badge">${lotLabel}</span></td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
  }

  // ── Options section ─────────────────────────────────────────────────────────
  if (optPositions.length) {
    html += `<div class="pos-section-hdr"><span style="background:var(--g)"></span>Open Options</div>
    <div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rr);overflow:hidden;margin-bottom:12px">
    <table class="pos-table">
      <thead><tr>
        <th>Ticker</th><th>Type</th><th>Strike</th><th>Expiry</th>
        <th>DTE</th><th>Collected</th><th>Current</th><th>P&amp;L</th><th>%Cap</th>
      </tr></thead>
      <tbody>`;

    for (const pos of optPositions.sort((a, b) => a.ticker.localeCompare(b.ticker))) {
      const days           = dte(pos.expiry);
      const effectiveCurPrem = pos._liveCurPrem != null ? pos._liveCurPrem : pos.curPrem;
      const isLive         = pos._liveCurPrem != null;
      const pnl            = effectiveCurPrem != null && pos.prem
        ? (pos.prem - effectiveCurPrem) * pos.qty * 100 : null;
      const pctCap         = effectiveCurPrem != null && pos.prem
        ? Math.round((1 - effectiveCurPrem / pos.prem) * 100) : null;
      const isPut          = pos.type === 'short_put';
      const pnlColor       = pnl === null ? '' : pnl >= 0 ? 'color:var(--g)' : 'color:var(--r)';
      const dteColor       = days !== null && days <= 7 ? 'color:var(--r)'
                           : days !== null && days <= 14 ? 'color:var(--a)' : '';
      const curStr         = effectiveCurPrem != null
        ? `$${effectiveCurPrem.toFixed(2)}<span style="font-size:8px;color:var(--${isLive ? 'g' : 'mu'})"> ${isLive ? '●' : '○'}</span>`
        : '—';
      const pctCapStr      = pctCap !== null
        ? `<span style="color:var(--${pctCap >= 50 ? 'g' : 'mu2'})">${pctCap}%</span>`
        : '—';

      html += `<tr onclick="showPosDetail(${pos.id})">
        <td><div class="pos-ticker-cell"><div class="pos-ticker-name">${pos.ticker}</div></div></td>
        <td><span class="pos-type-pill ${isPut ? 'put' : 'call'}">${isPut ? 'Put' : 'Call'}</span></td>
        <td style="font-family:var(--mono);color:var(--bl)">$${pos.strike || '—'}</td>
        <td style="font-family:var(--mono);font-size:11px">${pos.expiry || '—'}</td>
        <td style="font-family:var(--mono);${dteColor}">${days !== null ? days + 'd' : '—'}</td>
        <td style="font-family:var(--mono);color:var(--g)">$${pos.prem ? pos.prem.toFixed(2) : '—'}</td>
        <td style="font-family:var(--mono)">${curStr}</td>
        <td style="font-family:var(--mono);${pnlColor}">${pnl !== null ? (pnl >= 0 ? '+' : '') + ' $' + Math.abs(pnl).toFixed(0) : '—'}</td>
        <td>${pctCapStr}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
  }

  c.innerHTML = html;
}

// ─── SIGNALS ─────────────────────────────────────────────────────────────────
export function renderSigs() {
  const c = document.getElementById('sig-container');
  c.style.display = 'grid';
  c.style.gridTemplateColumns = 'repeat(2,1fr)';
  c.style.gap = '8px';

  const act  = S.signals.filter(s => s.type === 'roll' || s.type === 'close');
  const csp  = S.signals.filter(s => s.type === 'csp' && !s.partial);
  const cspP = S.signals.filter(s => s.type === 'csp' &&  s.partial);
  const cc   = S.signals.filter(s => s.type === 'cc');

  document.getElementById('bdg-sig').textContent  = act.length + csp.length + cc.length;
  document.getElementById('s-act').textContent    = act.length;
  document.getElementById('s-csp').textContent    = csp.length;
  document.getElementById('s-cc').textContent     = cc.length;
  document.getElementById('s-close').textContent  = act.filter(s => s.type === 'close').length;

  if (!S.signals.length && !S.lastRefresh) {
    c.innerHTML = '<div class="empty"><div class="empty-icon">📡</div><div class="empty-title">No signals yet</div><div class="empty-sub">Add tickers to your watchlist and positions, then tap ↻.</div></div>';
    return;
  }
  if (!S.signals.length && S.lastRefresh) {
    c.innerHTML = '<div class="empty"><div class="empty-icon">✓</div><div class="empty-title">No signals right now</div><div class="empty-sub">None of your tickers meet criteria. Auto-refreshes every 20 min during market hours.</div></div>';
    return;
  }

  let html = '';
  if (act.length)  html += `<div class="slabel" style="grid-column:1/-1">⚡ Action Required</div>`                      + act.map(sigCard).join('');
  if (cc.length)   html += `<div class="slabel" style="grid-column:1/-1">🟢 Covered Call Opportunities</div>`            + cc.map(sigCard).join('');
  if (csp.length)  html += `<div class="slabel" style="grid-column:1/-1">🔵 CSP Entry — All Criteria Met</div>`         + csp.map(sigCard).join('');
  if (cspP.length) html += `<div class="slabel" style="grid-column:1/-1;color:var(--a)">○ Watching — Partial Criteria</div>` + cspP.map(sigCard).join('');

  if (S.lastRefresh) {
    const ago = Math.round((Date.now() - S.lastRefresh) / 60000);
    html += `<div style="grid-column:1/-1;text-align:center;font-size:10px;color:var(--mu);padding:14px 0">Last screened ${ago < 1 ? 'just now' : ago + 'm ago'} · auto-refreshes every 20m during market hours</div>`;
  }
  c.innerHTML = html;
}

// Builds the HTML for a single signal card.
function sigCard(s) {
  const lbl   = { csp: 'CSP', cc: 'Cov. Call', roll: 'Roll', close: 'Close' }[s.type];
  const chgC  = s.chg > 0 ? 'g' : s.chg < 0 ? 'r' : 'mu2';
  const chgStr = s.chg !== null && s.chg !== undefined
    ? `<span style="color:var(--${chgC})">${s.chg > 0 ? '+' : ''}${s.chg.toFixed(1)}%</span>`
    : '';
  const priceS = s.price ? `$${s.price.toFixed(2)}` : '—';
  const pills  = (s.chks || []).map(ch =>
    `<span class="cpill ${ch.ok ? 'pass' : 'fail'}" style="font-size:9px;padding:2px 6px">${ch.ok ? '✓' : '✗'} ${ch.l}</span>`
  ).join('');

  let mets = '';
  if (s.type === 'csp' && !s.partial)
    mets = `<div class="mgrid c2" style="margin-bottom:6px"><div class="met"><div class="met-l">Strike</div><div class="met-v b" style="font-size:11px">$${s.strike}</div></div><div class="met"><div class="met-l">DTE</div><div class="met-v" style="font-size:11px">${s.dteTarget}d</div></div></div>`;
  else if (s.type === 'cc')
    mets = `<div class="mgrid c2" style="margin-bottom:6px"><div class="met"><div class="met-l">Strike</div><div class="met-v g" style="font-size:11px">$${s.strike}</div></div><div class="met"><div class="met-l">DTE</div><div class="met-v" style="font-size:11px">${s.dteTarget}d</div></div></div>`;
  else if (s.type === 'roll')
    mets = `<div class="mgrid c2" style="margin-bottom:6px"><div class="met"><div class="met-l">Strike</div><div class="met-v r" style="font-size:11px">$${s.strike}</div></div><div class="met"><div class="met-l">DTE</div><div class="met-v a" style="font-size:11px">${s.days}d</div></div></div>`;
  else if (s.type === 'close')
    mets = `<div class="mgrid c2" style="margin-bottom:6px"><div class="met"><div class="met-l">Captured</div><div class="met-v g" style="font-size:11px">${s.pctCap}%</div></div><div class="met"><div class="met-l">DTE</div><div class="met-v a" style="font-size:11px">${s.days}d</div></div></div>`;

  return `<div class="scard ${s.type}${s.partial ? ' partial' : ''}" style="padding:10px 10px 8px;margin-bottom:0" onclick="showDetail('${s.id}')">
    <div class="ctop" style="margin-bottom:6px">
      <div class="tblk"><div class="tkr" style="font-size:14px">${s.ticker}</div><div class="tkr-sub" style="font-size:10px">${priceS} ${chgStr}</div></div>
      <div class="stbdg ${s.type}" style="font-size:8px;padding:2px 6px">${lbl}</div>
    </div>
    <div class="cpills" style="margin-bottom:6px;gap:3px">${pills}</div>
    ${mets}
    <div class="sugg" style="font-size:10px;padding:6px 8px;line-height:1.45">${s.suggestion}</div>
  </div>`;
}

// ─── SIGNAL DETAIL MODAL ─────────────────────────────────────────────────────
export function showDetail(id) {
  const s = S.signals.find(sig => sig.id === id);
  if (!s) return;

  const lbl = { csp: 'Cash-Secured Put', cc: 'Covered Call', roll: 'Roll Position', close: 'Buy to Close' }[s.type];
  let html = `<div class="mtitle">${s.ticker} · ${lbl}</div>`;
  html += `<div class="dsec"><div class="dlbl">Suggested Action</div><div class="sugg" style="margin:0">${s.suggestion}</div></div>`;

  if (s.type === 'csp' && !s.partial) {
    html += `<div class="dsec"><div class="dlbl">Technical Snapshot</div><div class="mgrid c3">
      <div class="met"><div class="met-l">IVR (est.)</div><div class="met-v b">${s.ivr !== null ? s.ivr + '%' : '—'}</div></div>
      <div class="met"><div class="met-l">RSI-14</div><div class="met-v">${s.rsi !== null ? s.rsi.toFixed(0) : '—'}</div></div>
      <div class="met"><div class="met-l">Stoch %K</div><div class="met-v">${s.stoch !== null ? s.stoch.toFixed(0) : '—'}</div></div>
    </div></div>`;
  }

  if ((s.type === 'csp' && !s.partial) || s.type === 'cc') {
    const contracts = s.contracts || 1;
    const total     = s.premEst ? (parseFloat(s.premEst) * contracts * 100).toFixed(0) : null;
    html += `<div class="dsec"><div class="dlbl">Premium Estimate</div><div class="dgrid">
      <div class="met"><div class="met-l">Per contract (est.)</div><div class="met-v g">${s.premEst ? '$' + s.premEst : '—'}</div></div>
      <div class="met"><div class="met-l">Total (${contracts} contract${contracts > 1 ? 's' : ''})</div><div class="met-v g">${total ? '$' + total : '—'}</div></div>
    </div><div class="mhint" style="margin-top:8px;margin-bottom:0">Uses HV30. Verify actual chain in Fidelity before placing the order.</div></div>`;
  }

  if (s.type === 'roll' || s.type === 'close') {
    const posId = parseInt(s.id.replace('roll-', '').replace('close-', ''));
    const pos   = S.positions.find(p => p.id === posId);
    html += `<div class="dsec"><div class="dlbl">Position Details</div><div class="mgrid c2">
      <div class="met"><div class="met-l">Strike</div><div class="met-v b">$${s.strike}</div></div>
      <div class="met"><div class="met-l">DTE left</div><div class="met-v a">${s.days}d</div></div>
      <div class="met"><div class="met-l">Expiry</div><div class="met-v">${pos?.expiry || '—'}</div></div>
      <div class="met"><div class="met-l">% elapsed</div><div class="met-v">${s.pctT !== null && s.pctT !== '—' ? s.pctT + '%' : '—'}</div></div>
      ${s.pctCap !== null ? `<div class="met"><div class="met-l">Premium captured</div><div class="met-v g">${s.pctCap}%</div></div>` : ''}
      ${pos?.prem ? `<div class="met"><div class="met-l">Collected</div><div class="met-v g">$${Number(pos.prem).toFixed(2)}</div></div>` : ''}
    </div></div>`;
  }

  html += `<div class="dsec"><div class="dlbl">Criteria Check</div><div class="cpills">${(s.chks || []).map(ch => `<span class="cpill ${ch.ok ? 'pass' : 'fail'}">${ch.ok ? '✓' : '✗'} ${ch.l}</span>`).join('')}</div></div>`;
  html += `<button class="btn-s" onclick="closeModal('modal-detail')">Close</button>`;
  document.getElementById('modal-detail-body').innerHTML = html;
  openModal('modal-detail');
}

// ─── POSITION DETAIL MODAL — SHARES GROUP ────────────────────────────────────
export function showShareGroupDetail(ticker) {
  const lots = S.positions.filter(p => p.type === 'shares' && p.ticker === ticker);
  if (!lots.length) return;

  const totalQty   = lots.reduce((sum, p) => sum + p.qty, 0);
  const totalCost  = lots.reduce((sum, p) => sum + (p.cost || 0) * p.qty, 0);
  const avgCost    = totalQty > 0 ? totalCost / totalQty : 0;
  const liveQ      = S.watchlist.find(w => w.ticker === ticker)?.liveData;
  const mktPrice   = liveQ?.price || null;
  const unrealPnl  = mktPrice && avgCost > 0 ? (mktPrice - avgCost) * totalQty : null;
  const pnlCls     = unrealPnl === null ? '' : unrealPnl >= 0 ? 'color:var(--g)' : 'color:var(--r)';
  const contracts  = Math.floor(totalQty / 100);

  let html = `<div class="mtitle">${ticker} · Shares</div>`;

  html += `<div class="dsec"><div class="dlbl">Summary</div><div class="mgrid c2">
    <div class="met"><div class="met-l">Total shares</div><div class="met-v g" style="font-size:18px">${totalQty}</div></div>
    <div class="met"><div class="met-l">Avg cost basis</div><div class="met-v" style="font-family:var(--mono)">${avgCost > 0 ? '$' + avgCost.toFixed(2) : '—'}</div></div>
    <div class="met"><div class="met-l">Market price</div><div class="met-v" style="font-family:var(--mono)">${mktPrice ? '$' + mktPrice.toFixed(2) : '—'}</div></div>
    <div class="met"><div class="met-l">Unrealized P&L</div><div class="met-v" style="font-family:var(--mono);${pnlCls}">${unrealPnl !== null ? (unrealPnl >= 0 ? '+' : '') + '$' + Math.abs(unrealPnl).toFixed(0) : '—'}</div></div>
    <div class="met"><div class="met-l">Covered call capacity</div><div class="met-v b">${contracts} contract${contracts !== 1 ? 's' : ''}</div></div>
    <div class="met"><div class="met-l">Lots</div><div class="met-v">${lots.length}</div></div>
  </div></div>`;

  html += `<div class="dsec"><div class="dlbl">Purchase Log</div>
  <table class="lot-table">
    <thead><tr><th>Date</th><th>Shares</th><th>Cost/sh</th><th>Total</th><th></th></tr></thead>
    <tbody>`;

  for (const lot of lots.sort((a, b) => (a.enteredAt || 0) - (b.enteredAt || 0))) {
    const dateStr  = lot.enteredAt ? new Date(lot.enteredAt).toLocaleDateString() : '—';
    const costStr  = lot.cost > 0 ? '$' + Number(lot.cost).toFixed(2) : '—';
    const totalStr = lot.cost > 0 ? '$' + (lot.cost * lot.qty).toFixed(0) : '—';
    html += `<tr>
      <td>${dateStr}</td>
      <td>${lot.qty}</td>
      <td>${costStr}</td>
      <td>${totalStr}</td>
      <td><button class="lot-edit-btn" onclick="event.stopPropagation();closeModal('modal-detail');editPos(${lot.id})">Edit</button></td>
    </tr>`;
  }
  html += `</tbody></table></div>`;

  if (lots.some(l => l.notes)) {
    html += `<div class="dsec"><div class="dlbl">Notes</div>`;
    for (const lot of lots.filter(l => l.notes)) {
      html += `<div style="font-size:12px;color:var(--mu2);font-style:italic;margin-bottom:4px">${lot.notes}</div>`;
    }
    html += `</div>`;
  }

  // addShareLot() is a named function in positions.js, exposed to window by app.js.
  html += `<button class="btn-p" onclick="addShareLot('${ticker}')" style="margin-bottom:0">+ Add Another Lot</button>`;
  html += `<button class="btn-s" onclick="closeModal('modal-detail')">Close</button>`;

  document.getElementById('modal-detail-body').innerHTML = html;
  openModal('modal-detail');
}

// ─── POSITION DETAIL MODAL — SINGLE OPTION ───────────────────────────────────
export function showPosDetail(id) {
  const pos = S.positions.find(p => p.id === id);
  if (!pos) return;

  const typeLabel      = { shares: 'Shares (Long)', short_put: 'Short Put', short_call: 'Short Call' }[pos.type] || pos.type;
  const days           = dte(pos.expiry);
  const effectiveCurPrem = pos._liveCurPrem != null ? pos._liveCurPrem : pos.curPrem;
  const isLive         = pos._liveCurPrem != null;
  const pnl            = effectiveCurPrem != null && pos.prem
    ? (pos.prem - effectiveCurPrem) * pos.qty * 100 : null;
  const pnlCls         = pnl === null ? '' : pnl >= 0 ? 'pos' : 'neg';

  let html = `<div class="mtitle">${pos.ticker} · ${typeLabel}</div>`;

  if (pos.type === 'shares') {
    const costDisplay = pos.cost != null && !isNaN(pos.cost) && pos.cost > 0
      ? `$${Number(pos.cost).toFixed(2)}` : '—';
    html += `<div class="dsec"><div class="dlbl">Position</div><div class="mgrid c2">
      <div class="met"><div class="met-l">Shares</div><div class="met-v g">${pos.qty}</div></div>
      <div class="met"><div class="met-l">Cost basis</div><div class="met-v">${costDisplay}</div></div>
      <div class="met"><div class="met-l">Open date</div><div class="met-v">${pos.enteredAt ? new Date(pos.enteredAt).toLocaleDateString() : '—'}</div></div>
    </div></div>`;
  } else {
    let origDte = null;
    if (pos.expiry && pos.enteredAt && pos.enteredAt > 0) {
      const calc = Math.round((new Date(pos.expiry + 'T12:00:00') - new Date(pos.enteredAt)) / 86400000);
      if (!isNaN(calc) && calc > 0) origDte = calc;
    }
    const pctCap  = effectiveCurPrem != null && pos.prem ? Math.round((1 - effectiveCurPrem / pos.prem) * 100) : null;
    const pctTime = days !== null && origDte ? Math.max(0, Math.round((1 - days / origDte) * 100)) : null;

    html += `<div class="dsec"><div class="dlbl">Option Details</div><div class="mgrid c2">
      <div class="met"><div class="met-l">Strike</div><div class="met-v b">$${pos.strike || '—'}</div></div>
      <div class="met"><div class="met-l">Expiry</div><div class="met-v">${pos.expiry || '—'}</div></div>
      <div class="met"><div class="met-l">DTE remaining</div><div class="met-v ${days !== null && days <= 7 ? 'r' : 'a'}">${days !== null ? days + ' days' : '—'}</div></div>
      <div class="met"><div class="met-l">Open date</div><div class="met-v">${pos.enteredAt ? new Date(pos.enteredAt).toLocaleDateString() : '—'}</div></div>
      <div class="met"><div class="met-l">Premium collected</div><div class="met-v g">$${pos.prem ? Number(pos.prem).toFixed(2) : '—'}</div></div>
      <div class="met"><div class="met-l">Current price <span style="font-size:8px;color:var(--${isLive ? 'g' : 'mu'})">${isLive ? '● live' : '○ manual'}</span></div><div class="met-v">${effectiveCurPrem != null ? '$' + Number(effectiveCurPrem).toFixed(2) : '—'}</div></div>
    </div></div>`;

    html += `<div class="dsec"><div class="dlbl">P&amp;L</div><div class="mgrid c2">
      <div class="met"><div class="met-l">Unrealized P&amp;L</div><div class="ppnl ${pnlCls}" style="font-size:14px">${pnl !== null ? (pnl >= 0 ? '+' : '') + '$' + Math.abs(pnl).toFixed(0) : '—'}</div></div>
      <div class="met"><div class="met-l">Contracts</div><div class="met-v">${pos.qty}</div></div>
    </div></div>`;

    if (pctCap !== null || pctTime !== null) {
      html += `<div class="dsec"><div class="dlbl">Progress</div>`;
      if (pctCap  !== null) html += `<div class="prow" style="margin-bottom:8px"><div class="plbl">Premium captured</div><div class="pbar"><div class="pfill" style="width:${Math.min(pctCap, 100)}%;background:var(--g)"></div></div><div class="ppct">${pctCap}%</div></div>`;
      if (pctTime !== null) html += `<div class="prow"><div class="plbl">Time elapsed</div><div class="pbar"><div class="pfill" style="width:${Math.min(pctTime, 100)}%;background:var(--mu)"></div></div><div class="ppct">${pctTime}%</div></div>`;
      html += `</div>`;
    }
  }

  if (pos.notes) html += `<div class="dsec"><div class="dlbl">Notes</div><div style="font-size:13px;color:var(--mu2);font-style:italic">${pos.notes}</div></div>`;
  html += `<button class="btn-p" onclick="closeModal('modal-detail');editPos(${id})" style="margin-bottom:0">Edit Position</button>`;
  html += `<button class="btn-s" onclick="closeModal('modal-detail')">Close</button>`;
  document.getElementById('modal-detail-body').innerHTML = html;
  openModal('modal-detail');
}

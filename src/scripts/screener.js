import { S } from './state.js';
import { showToast } from './ui.js';
import { sheetWriteViaGet } from './sheets.js';
import { fetchQ, fetchOptionPrice, suggestStrike } from './market.js';
import { dte, renderWatch, renderPositions, renderSigs } from './render.js';

// ─── OPTION PRICE REFRESH ─────────────────────────────────────────────────────
// Fetches live bid/ask midpoints for all open short positions and re-renders.
// Called hourly during market hours and as part of every full screener run.
// Pass silent=true to suppress toasts (used when called from runScreener).
export async function refreshOptionPrices(silent = false) {
  const optPositions = S.positions.filter(p => p.type !== 'shares' && p.expiry && p.strike);
  if (!optPositions.length) return;

  if (!silent) showToast('Refreshing options prices…', '');

  let updated = 0;
  for (const pos of optPositions) {
    const livePrice = await fetchOptionPrice(pos.ticker, pos.type, pos.strike, pos.expiry);
    if (livePrice !== null) {
      pos._liveCurPrem   = livePrice;
      pos._liveCurPremTs = Date.now();
      updated++;
    }
    await new Promise(r => setTimeout(r, 450)); // gentle rate limiting
  }

  renderPositions();
  renderSigs();

  if (!silent && updated > 0)  showToast(`Options prices updated (${updated} position${updated > 1 ? 's' : ''})`, 'ok');
  if (!silent && updated === 0) showToast('No live prices found — Yahoo chain unavailable', 'err');
}

// ─── MAIN SCREENER ────────────────────────────────────────────────────────────
// Fetches quotes for all watchlist + position tickers sequentially (350 ms
// delay between fetches to avoid Yahoo rate limits), then evaluates four signal
// types: CSP entry, Covered Call, Roll, and Early Close.
export async function runScreener() {
  const btn = document.getElementById('rfbtn');
  btn.innerHTML = '<span class="spinner"></span>';
  btn.style.pointerEvents = 'none';

  const tickers = [...new Set([
    ...S.watchlist.map(w => w.ticker),
    ...S.positions.map(p => p.ticker)
  ])];

  if (!tickers.length) {
    btn.innerHTML = '↻';
    btn.style.pointerEvents = '';
    return;
  }

  showToast(`Fetching ${tickers.length} ticker${tickers.length > 1 ? 's' : ''}…`, '');

  // Fetch all quotes sequentially to stay within Yahoo rate limits.
  const qmap = {};
  for (const t of tickers) {
    qmap[t] = await fetchQ(t);
    await new Promise(r => setTimeout(r, 350));
  }

  await refreshOptionPrices(true);

  S.watchlist = S.watchlist.map(w => ({ ...w, liveData: qmap[w.ticker] || w.liveData }));
  renderWatch();

  const cr   = S.criteria;
  const sigs = [];

  // ── CSP entry signals ────────────────────────────────────────────────────────
  for (const w of S.watchlist) {
    const q = qmap[w.ticker];
    if (!q) continue;

    const ivrOk   = q.ivrEst   !== null && q.ivrEst   >= cr.ivr;
    const rsiOk   = q.rsiEst   !== null && q.rsiEst   <= cr.rsi;
    const stochOk = q.stochEst !== null && q.stochEst <= cr.stoch;
    const maOk    = q.aboveMa  !== false;
    const hasOpt  = S.positions.find(p => p.ticker === w.ticker && p.type !== 'shares');

    const chks = [
      { l: `IVR ${q.ivrEst   !== null ? q.ivrEst + '%'          : '?'}`, ok: ivrOk,   tgt: `≥${cr.ivr}%`   },
      { l: `RSI ${q.rsiEst   !== null ? q.rsiEst.toFixed(0)     : '?'}`, ok: rsiOk,   tgt: `<${cr.rsi}`    },
      { l: `Stoch ${q.stochEst !== null ? q.stochEst.toFixed(0) : '?'}`, ok: stochOk, tgt: `<${cr.stoch}`  },
      { l: `${cr.ma}MA`,                                                   ok: maOk,    tgt: 'Above'         },
    ];

    const allOk = ivrOk && rsiOk && stochOk && maOk;
    const passN = chks.filter(c => c.ok).length;

    if (!hasOpt) {
      if (allOk) {
        const strike  = suggestStrike(q.price, cr.delta, 'put');
        const dteT    = Math.round((cr.dteMin + cr.dteMax) / 2);
        const premEst = q.hv30
          ? (q.price * (q.hv30 / 100) * Math.sqrt(dteT / 365) * 0.4).toFixed(2)
          : null;
        sigs.push({
          id: `csp-${w.ticker}`, type: 'csp', ticker: w.ticker,
          price: q.price, chg: q.chg1d, strike, dteTarget: dteT, premEst,
          ivr: q.ivrEst, rsi: q.rsiEst, stoch: q.stochEst, chks,
          suggestion: `Sell ${dteT}d $${strike} put${premEst ? ` · est. ~$${premEst}/contract` : ''}`,
          ts: Date.now()
        });
      } else if (passN >= 2) {
        sigs.push({
          id: `csp-p-${w.ticker}`, type: 'csp', ticker: w.ticker,
          price: q.price, chg: q.chg1d, chks, partial: true, passN,
          suggestion: `${passN}/4 criteria met · Waiting: ${chks.filter(c => !c.ok).map(c => c.l + ' (need ' + c.tgt + ')').join(', ')}`,
          ts: Date.now()
        });
      }
    }
  }

  // ── Covered Call signals ─────────────────────────────────────────────────────
  // Only fire when holding at least 100 shares (enough for 1 full contract).
  const CC_MIN_SHARES = 100;
  for (const pos of S.positions.filter(p => p.type === 'shares' && p.qty >= CC_MIN_SHARES)) {
    const q = qmap[pos.ticker];
    if (!q) continue;

    const ivrOk   = q.ivrEst !== null && q.ivrEst >= cr.ccIvr;
    const hasCall = S.positions.find(p => p.ticker === pos.ticker && p.type === 'short_call');
    const contracts = Math.floor(pos.qty / 100);

    if (ivrOk && !hasCall && contracts >= 1) {
      const strike  = suggestStrike(q.price, cr.ccDelta, 'call');
      const dteT    = Math.round((cr.ccDteMin + cr.ccDteMax) / 2);
      const premEst = q.hv30
        ? (q.price * (q.hv30 / 100) * Math.sqrt(dteT / 365) * 0.35).toFixed(2)
        : null;
      sigs.push({
        id: `cc-${pos.id}`, type: 'cc', ticker: pos.ticker,
        price: q.price, chg: q.chg1d, strike, dteTarget: dteT, premEst,
        contracts, sharesOwned: pos.qty, ivr: q.ivrEst,
        chks: [
          { l: `${pos.qty} shares (${contracts} contract${contracts > 1 ? 's' : ''})`, ok: true },
          { l: `IVR ${q.ivrEst !== null ? q.ivrEst + '%' : '?'}`, ok: ivrOk }
        ],
        suggestion: `Sell ${contracts} x ${dteT}d $${strike} call${premEst ? ` · est. ~$${premEst}/contract · ~$${(parseFloat(premEst) * contracts * 100).toFixed(0)} total` : ''}`,
        ts: Date.now()
      });
    }
  }

  // ── Roll & Early Close signals ───────────────────────────────────────────────
  for (const pos of S.positions.filter(p => p.type !== 'shares')) {
    const q    = qmap[pos.ticker];
    const days = dte(pos.expiry);
    if (days === null) continue;

    // origDte: days between open date and expiry, used to compute % time elapsed.
    let origDte = null;
    if (pos.expiry && pos.enteredAt && pos.enteredAt > 0) {
      const calc = Math.round((new Date(pos.expiry + 'T12:00:00') - new Date(pos.enteredAt)) / 86400000);
      if (!isNaN(calc) && calc > 0) origDte = calc;
    }
    if (!origDte) origDte = pos.origDte || null;

    const pctT = origDte && origDte > 0
      ? Math.max(0, Math.round((1 - days / origDte) * 100))
      : null;

    // Prefer live-fetched price, fall back to manually entered curPrem.
    const effectiveCurPrem = pos._liveCurPrem !== undefined && pos._liveCurPrem !== null
      ? pos._liveCurPrem
      : pos.curPrem;

    const pctCap     = effectiveCurPrem !== undefined && effectiveCurPrem !== null && pos.prem
      ? Math.round((1 - effectiveCurPrem / pos.prem) * 100)
      : null;
    const putBr      = q && pos.type === 'short_put'  && q.price < pos.strike;
    const callBr     = q && pos.type === 'short_call' && q.price > pos.strike;
    const earlyClose = pctCap !== null && pctCap >= cr.closePct && pctT !== null && pctT < cr.closeDtePct;

    if (putBr || callBr) {
      sigs.push({
        id: `roll-${pos.id}`, type: 'roll', ticker: pos.ticker,
        price: q?.price, chg: q?.chg1d,
        strike: pos.strike, days, pctT: pctT ?? '—', pctCap,
        chks: [{ l: 'Strike breached', ok: false }],
        suggestion: putBr
          ? `Price $${q.price.toFixed(2)} < strike $${pos.strike} · Roll down & out to next expiry`
          : `Price $${q.price.toFixed(2)} > strike $${pos.strike} · Roll up & out or accept assignment`,
        ts: Date.now()
      });
    } else if (earlyClose) {
      sigs.push({
        id: `close-${pos.id}`, type: 'close', ticker: pos.ticker,
        price: q?.price, chg: q?.chg1d,
        strike: pos.strike, days, pctT, pctCap,
        chks: [{ l: `${pctCap}% captured`, ok: true }, { l: `${pctT}% elapsed`, ok: true }],
        suggestion: `${pctCap}% of premium captured · ${pctT}% of time elapsed · Buy to close & redeploy capital`,
        ts: Date.now()
      });
    }
  }

  S.signals     = sigs;
  S.lastRefresh = Date.now();
  sheetWriteViaGet();
  renderSigs();
  renderPositions();

  btn.innerHTML = '↻';
  btn.style.pointerEvents = '';
}

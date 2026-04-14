import { S } from './state.js';

// ─── STOCK QUOTE + INDICATORS ─────────────────────────────────────────────────
// Fetches 1-year daily OHLCV from Yahoo Finance and derives the technical
// indicators used by the screener. All values are approximations from daily data.
export async function fetchQ(ticker) {
  try {
    const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`;
    const r    = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const data = await r.json();
    const res  = data.chart?.result?.[0];
    if (!res) return null;

    const meta   = res.meta;
    const price  = meta.regularMarketPrice;
    const prev   = meta.chartPreviousClose || meta.previousClose || price;
    const chg1d  = prev ? ((price - prev) / prev * 100) : null;
    const q0     = res.indicators?.quote?.[0] || {};
    const closes = (q0.close || []).filter(v => v !== null);
    const highs  = (q0.high  || []).filter(v => v !== null);
    const lows   = (q0.low   || []).filter(v => v !== null);

    // ── Moving average check ──────────────────────────────────────────────────
    let aboveMa = null;
    const maPeriod = S.criteria.ma || 200;
    if (closes.length >= maPeriod) {
      const ma = closes.slice(-maPeriod).reduce((a, b) => a + b, 0) / maPeriod;
      aboveMa = price > ma;
    } else if (closes.length >= 20) {
      const ma = closes.reduce((a, b) => a + b, 0) / closes.length;
      aboveMa = price > ma;
    }

    // ── RSI-14 (Wilder approximation) ─────────────────────────────────────────
    let rsiEst = null;
    if (closes.length >= 16) {
      const changes = closes.slice(-16).map((c, i, a) => i === 0 ? 0 : c - a[i - 1]).slice(1);
      const avgGain = changes.filter(x => x > 0).reduce((a, b) => a + b, 0) / 14;
      const avgLoss = Math.abs(changes.filter(x => x <= 0).reduce((a, b) => a + b, 0)) / 14;
      rsiEst = avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1));
    }

    // ── Stochastic %K (14-period) ─────────────────────────────────────────────
    let stochEst = null;
    if (highs.length >= 14 && lows.length >= 14) {
      const rh = highs.slice(-14), rl = lows.slice(-14);
      const hh = Math.max(...rh), ll = Math.min(...rl);
      stochEst = hh === ll ? 50 : parseFloat(((price - ll) / (hh - ll) * 100).toFixed(1));
    } else if (closes.length >= 14) {
      const rc = closes.slice(-14);
      const hh = Math.max(...rc), ll = Math.min(...rc);
      stochEst = hh === ll ? 50 : parseFloat(((price - ll) / (hh - ll) * 100).toFixed(1));
    }

    // ── HV30 → IVR estimate ───────────────────────────────────────────────────
    // IVR is approximated from 21-day log-return volatility (≈ HV30) scaled by
    // distance from the 52-week high. Not real IV rank — verify in your broker.
    let ivrEst = null, hv30 = null;
    if (closes.length >= 22) {
      const rc   = closes.slice(-22);
      const rets = rc.slice(1).map((c, i) => Math.log(c / rc[i]));
      const mn   = rets.reduce((a, b) => a + b, 0) / rets.length;
      const vr   = rets.reduce((a, b) => a + (b - mn) ** 2, 0) / rets.length;
      hv30 = Math.sqrt(vr * 252) * 100;
      const h52      = meta.fiftyTwoWeekHigh || price;
      const l52      = meta.fiftyTwoWeekLow  || price;
      const pctFrHigh = (h52 - price) / ((h52 - l52) || 1) * 100;
      ivrEst = Math.min(99, Math.round(hv30 * 1.25 + pctFrHigh * 0.15));
    }

    return { price, chg1d, aboveMa, rsiEst, stochEst, ivrEst, hv30 };
  } catch (e) {
    return null;
  }
}

// ─── LIVE OPTION PRICE ────────────────────────────────────────────────────────
// Fetches the bid/ask midpoint for a specific option contract from Yahoo Finance.
// Tries multiple expiry-date offsets (±2 days) then falls back to scanning
// all available expiration dates. Returns null if no price can be found.
export async function fetchOptionPrice(ticker, type, strike, expiry) {
  if (!ticker || !strike) return null;

  const contractType = type === 'short_put' ? 'puts' : 'calls';

  function findContract(contracts) {
    if (!contracts || !contracts.length) return null;
    return (
      contracts.find(c => Math.abs(c.strike - strike) < 0.01)  ||
      contracts.find(c => Math.abs(c.strike - strike) <= 0.50) ||
      contracts.find(c => Math.abs(c.strike - strike) <= 1.00) ||
      null
    );
  }

  function priceFromContract(c) {
    if (!c) return null;
    const bid = c.bid ?? null, ask = c.ask ?? null;
    if (bid !== null && ask !== null && bid > 0 && ask > 0) {
      return parseFloat(((bid + ask) / 2).toFixed(2));
    }
    if (c.lastPrice && c.lastPrice > 0) return parseFloat(c.lastPrice.toFixed(2));
    return null;
  }

  // Strategy 1: fetch with specific expiry date (try ±2 day offsets)
  if (expiry) {
    const baseMs  = new Date(expiry + 'T12:00:00').getTime();
    const offsets = [0, 86400000, -86400000, 172800000]; // 0, +1d, -1d, +2d
    for (const offset of offsets) {
      try {
        const ts  = Math.floor((baseMs + offset) / 1000);
        const url = `https://query1.finance.yahoo.com/v7/finance/options/${ticker}?date=${ts}`;
        const r   = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) continue;
        const data  = await r.json();
        const opts  = data?.optionChain?.result?.[0]?.options?.[0];
        if (!opts) continue;
        const match = findContract(opts[contractType] || []);
        const price = priceFromContract(match);
        if (price !== null) return price;
      } catch (e) { continue; }
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Strategy 2: fetch without a date (Yahoo returns nearest chain),
  // then scan all available expiry dates for our strike.
  try {
    const url    = `https://query1.finance.yahoo.com/v7/finance/options/${ticker}`;
    const r      = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const data   = await r.json();
      const result = data?.optionChain?.result?.[0];
      if (result) {
        const opts  = result.options?.[0];
        if (opts) {
          const match = findContract(opts[contractType] || []);
          const price = priceFromContract(match);
          if (price !== null) return price;
        }
        if (expiry && result.expirationDates) {
          for (const ts of result.expirationDates) {
            try {
              const url2 = `https://query1.finance.yahoo.com/v7/finance/options/${ticker}?date=${ts}`;
              const r2   = await fetch(url2, { signal: AbortSignal.timeout(8000) });
              if (!r2.ok) continue;
              const d2   = await r2.json();
              const opts2 = d2?.optionChain?.result?.[0]?.options?.[0];
              if (!opts2) continue;
              const match2 = findContract(opts2[contractType] || []);
              const price2 = priceFromContract(match2);
              if (price2 !== null) return price2;
            } catch (e) { continue; }
            await new Promise(r => setTimeout(r, 200));
          }
        }
      }
    }
  } catch (e) {}

  return null;
}

// ─── STRIKE SUGGESTION ───────────────────────────────────────────────────────
// Approximates an OTM strike at roughly the target delta using a simple
// percentage-from-price heuristic. Not a real delta calculation.
export function suggestStrike(price, delta, type) {
  const pct = delta === 30 ? 0.07
            : delta === 20 ? 0.10
            : delta === 15 ? 0.13
            : (delta / 100) * 0.25;
  if (type === 'put') return Math.floor((price * (1 - pct)) / 0.5) * 0.5;
  return Math.ceil((price * (1 + pct)) / 0.5) * 0.5;
}

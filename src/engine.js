// ─── Trading Engine ───────────────────────────────────────────────────────────
// Precios reales: Binance WS (BTC, ETH) + Yahoo Finance (acciones, índices, oro)

const INITIAL_CAPITAL = 5000;

const ASSETS = {
  BTC:   { name: "Bitcoin",    symbol: "BTC",  type: "crypto",    fallback: 67000 },
  ETH:   { name: "Ethereum",   symbol: "ETH",  type: "crypto",    fallback: 3500  },
  SP500: { name: "S&P 500",    symbol: "SPX",  type: "index",     fallback: 5200  },
  NVDA:  { name: "NVIDIA",     symbol: "NVDA", type: "stock",     fallback: 875   },
  AMZN:  { name: "Amazon",     symbol: "AMZN", type: "stock",     fallback: 190   },
  MSFT:  { name: "Microsoft",  symbol: "MSFT", type: "stock",     fallback: 420   },
  TSLA:  { name: "Tesla",      symbol: "TSLA", type: "stock",     fallback: 215   },
  GOLD:  { name: "Gold",       symbol: "XAU",  type: "commodity", fallback: 2340  },
};

class TradingEngine {
  constructor() {
    this.capital = INITIAL_CAPITAL;
    this.portfolio = {};
    this.trades = [];
    this.priceHistory = {};
    this.performance = [];
    this.totalTrades = 0;
    this.winningTrades = 0;
    this.tick = 0;
    this.priceSource = {};

    for (const [key, asset] of Object.entries(ASSETS)) {
      this.portfolio[key] = { shares: 0, avgCost: 0 };
      this.priceHistory[key] = [asset.fallback];
      this.priceSource[key] = "fallback";
    }

    this.recordPerformance();
  }

  ingestPrice(key, price) {
    if (!this.priceHistory[key]) return;
    const last = this.priceHistory[key][this.priceHistory[key].length - 1];
    if (last > 0 && Math.abs(price - last) / last > 0.20) {
      console.warn(`[Engine] Outlier ignorado ${key}: ${last} -> ${price}`);
      return;
    }
    this.priceHistory[key].push(parseFloat(price));
    if (this.priceHistory[key].length > 500) this.priceHistory[key].shift();
    this.priceSource[key] = "real";
  }

  getCurrentPrices() {
    const prices = {};
    for (const key of Object.keys(ASSETS)) {
      prices[key] = this.priceHistory[key][this.priceHistory[key].length - 1];
    }
    return prices;
  }

  getPortfolioValue() {
    const prices = this.getCurrentPrices();
    let invested = 0;
    for (const [key, pos] of Object.entries(this.portfolio)) {
      invested += pos.shares * prices[key];
    }
    return this.capital + invested;
  }

  smaCross(key, shortPeriod = 5, longPeriod = 20) {
    const h = this.priceHistory[key];
    if (h.length < longPeriod) return "hold";
    const smaShort = h.slice(-shortPeriod).reduce((a, b) => a + b) / shortPeriod;
    const smaLong  = h.slice(-longPeriod).reduce((a, b) => a + b) / longPeriod;
    if (smaShort > smaLong * 1.002) return "buy";
    if (smaShort < smaLong * 0.998) return "sell";
    return "hold";
  }

  rsi(key, period = 14) {
    const h = this.priceHistory[key];
    if (h.length < period + 1) return 50;
    const changes = h.slice(-period - 1).map((v, i, arr) => i > 0 ? v - arr[i - 1] : 0).slice(1);
    const gains  = changes.filter(c => c > 0);
    const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
    const avgGain = gains.length  ? gains.reduce((a, b) => a + b)  / period : 0;
    const avgLoss = losses.length ? losses.reduce((a, b) => a + b) / period : 0;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
  }

  momentum(key, period = 10) {
    const h = this.priceHistory[key];
    if (h.length < period) return 0;
    return (h[h.length - 1] - h[h.length - period]) / h[h.length - period];
  }

  bollingerBands(key, period = 20) {
    const h = this.priceHistory[key];
    if (h.length < period) return { signal: "hold" };
    const slice = h.slice(-period);
    const mean  = slice.reduce((a, b) => a + b) / period;
    const std   = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
    const price = h[h.length - 1];
    if (price < mean - 2 * std) return { signal: "buy" };
    if (price > mean + 2 * std) return { signal: "sell" };
    return { signal: "hold" };
  }

  getSignal(key) {
    const sma    = this.smaCross(key);
    const rsiVal = this.rsi(key);
    const mom    = this.momentum(key);
    const bb     = this.bollingerBands(key);

    let score = 0;
    const reasons = [];

    if (sma === "buy")  { score += 2; reasons.push("SMA cruce alcista"); }
    if (sma === "sell") { score -= 2; reasons.push("SMA cruce bajista"); }
    if (rsiVal < 30) { score += 2; reasons.push(`RSI sobrevendido (${rsiVal.toFixed(0)})`); }
    if (rsiVal > 70) { score -= 2; reasons.push(`RSI sobrecomprado (${rsiVal.toFixed(0)})`); }
    if (mom >  0.02) { score += 1; reasons.push("momentum positivo"); }
    if (mom < -0.02) { score -= 1; reasons.push("momentum negativo"); }
    if (bb.signal === "buy")  { score += 1; reasons.push("BB banda inferior"); }
    if (bb.signal === "sell") { score -= 1; reasons.push("BB banda superior"); }

    return { score, reasons, rsi: rsiVal, momentum: mom };
  }

  executeBuy(key, reason) {
    const price = this.getCurrentPrices()[key];
    const totalValue = this.getPortfolioValue();
    const currentPositionValue = this.portfolio[key].shares * price;
    const maxPosition = totalValue * 0.15;
    const tradeSize = Math.min(totalValue * 0.05, maxPosition - currentPositionValue);

    if (tradeSize < 10 || this.capital < tradeSize) return null;

    const shares = tradeSize / price;
    const cost   = shares * price;

    this.capital -= cost;
    const pos = this.portfolio[key];
    const totalShares = pos.shares + shares;
    pos.avgCost = (pos.shares * pos.avgCost + cost) / totalShares;
    pos.shares  = totalShares;

    const trade = {
      id: ++this.totalTrades,
      time: new Date().toISOString(),
      type: "BUY",
      asset: key,
      name: ASSETS[key].name,
      shares: parseFloat(shares.toFixed(6)),
      price,
      value: parseFloat(cost.toFixed(2)),
      reason,
      pnl: null,
      source: this.priceSource[key],
    };
    this.trades.unshift(trade);
    if (this.trades.length > 200) this.trades.pop();
    return trade;
  }

  executeSell(key, reason) {
    const pos = this.portfolio[key];
    if (pos.shares <= 0) return null;

    const price  = this.getCurrentPrices()[key];
    const value  = pos.shares * price;
    const pnl    = value - pos.shares * pos.avgCost;
    const pnlPct = ((price - pos.avgCost) / pos.avgCost * 100).toFixed(2);

    if (pnl > 0) this.winningTrades++;
    this.capital += value;

    const trade = {
      id: ++this.totalTrades,
      time: new Date().toISOString(),
      type: "SELL",
      asset: key,
      name: ASSETS[key].name,
      shares: parseFloat(pos.shares.toFixed(6)),
      price,
      value: parseFloat(value.toFixed(2)),
      reason,
      pnl: parseFloat(pnl.toFixed(2)),
      pnlPct,
      source: this.priceSource[key],
    };

    pos.shares  = 0;
    pos.avgCost = 0;

    this.trades.unshift(trade);
    if (this.trades.length > 200) this.trades.pop();
    return trade;
  }

  tick_update() {
    this.tick++;
    const executed = [];

    for (const [key, pos] of Object.entries(this.portfolio)) {
      if (pos.shares > 0) {
        const price  = this.getCurrentPrices()[key];
        const change = (price - pos.avgCost) / pos.avgCost;
        if (change < -0.08) {
          const t = this.executeSell(key, "stop-loss automatico");
          if (t) executed.push(t);
        } else if (change > 0.12) {
          const t = this.executeSell(key, "take-profit automatico");
          if (t) executed.push(t);
        }
      }
    }

    if (this.tick % 3 === 0) {
      for (const key of Object.keys(ASSETS)) {
        if (this.priceHistory[key].length < 20) continue;
        const { score, reasons } = this.getSignal(key);
        if (score >= 3) {
          const t = this.executeBuy(key, reasons.join(", "));
          if (t) executed.push(t);
        } else if (score <= -3 && this.portfolio[key].shares > 0) {
          const t = this.executeSell(key, reasons.join(", "));
          if (t) executed.push(t);
        }
      }
    }

    this.recordPerformance();
    return executed;
  }

  recordPerformance() {
    this.performance.push({
      time: Date.now(),
      value: parseFloat(this.getPortfolioValue().toFixed(2)),
    });
    if (this.performance.length > 1000) this.performance.shift();
  }

  getState() {
    const prices     = this.getCurrentPrices();
    const totalValue = this.getPortfolioValue();
    const pnl        = totalValue - INITIAL_CAPITAL;
    const pnlPct     = (pnl / INITIAL_CAPITAL * 100).toFixed(2);

    const positions = Object.entries(this.portfolio)
      .filter(([, pos]) => pos.shares > 0)
      .map(([key, pos]) => {
        const price     = prices[key];
        const value     = pos.shares * price;
        const posPnl    = value - pos.shares * pos.avgCost;
        const posPnlPct = ((price - pos.avgCost) / pos.avgCost * 100).toFixed(2);
        return {
          key, name: ASSETS[key].name, type: ASSETS[key].type,
          shares: pos.shares, avgCost: pos.avgCost, price,
          value: parseFloat(value.toFixed(2)),
          pnl: parseFloat(posPnl.toFixed(2)),
          pnlPct: posPnlPct,
          source: this.priceSource[key],
        };
      });

    const assets = Object.entries(ASSETS).map(([key, asset]) => {
      const price   = prices[key];
      const history = this.priceHistory[key].slice(-50);
      const ref     = history[Math.max(0, history.length - 24)];
      const change24h = ref > 0 ? ((price - ref) / ref * 100).toFixed(2) : "0.00";
      const { score, rsi, momentum } = this.getSignal(key);
      return {
        key, name: asset.name, symbol: asset.symbol, type: asset.type,
        price, change24h,
        rsi: parseFloat(rsi.toFixed(1)),
        momentum: parseFloat((momentum * 100).toFixed(2)),
        signal: score >= 3 ? "BUY" : score <= -3 ? "SELL" : "HOLD",
        score,
        history: history.slice(-20),
        source: this.priceSource[key],
        samples: this.priceHistory[key].length,
      };
    });

    return {
      capital: parseFloat(this.capital.toFixed(2)),
      totalValue: parseFloat(totalValue.toFixed(2)),
      pnl: parseFloat(pnl.toFixed(2)),
      pnlPct, positions, assets,
      trades: this.trades.slice(0, 20),
      performance: this.performance.slice(-200),
      totalTrades: this.totalTrades,
      winRate: this.totalTrades > 0
        ? ((this.winningTrades / this.totalTrades) * 100).toFixed(1) : "0.0",
      tick: this.tick,
    };
  }
}

module.exports = { TradingEngine, ASSETS, INITIAL_CAPITAL };
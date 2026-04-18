// ─── Price Fetcher ────────────────────────────────────────────────────────────
// Binance WebSocket → BTC, ETH (tiempo real)
// Yahoo Finance API → acciones, índices, oro (cada 60s, sin dependencias)

const WebSocket = require("ws");
const https = require("https");

const YAHOO_SYMBOLS = {
  SP500: "%5EGSPC",
  NVDA:  "NVDA",
  AMZN:  "AMZN",
  MSFT:  "MSFT",
  TSLA:  "TSLA",
  GOLD:  "GC%3DF",
};

const BINANCE_PAIRS = {
  BTC: "btcusdt",
  ETH: "ethusdt",
};

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("JSON parse error: " + data.slice(0, 100))); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

class PriceFetcher {
  constructor(onPrice) {
    this.onPrice = onPrice;
    this.lastPrices = {};
    this._binanceWs = null;
    this._yahooInterval = null;
  }

  async start() {
    await this._fetchYahoo();
    this._startBinanceWs();
    this._yahooInterval = setInterval(() => this._fetchYahoo(), 60_000);
    console.log("[PriceFetcher] Iniciado — Binance WS + Yahoo Finance");
  }

  stop() {
    if (this._binanceWs) this._binanceWs.terminate();
    if (this._yahooInterval) clearInterval(this._yahooInterval);
  }

  async _fetchYahoo() {
    const symbols = Object.values(YAHOO_SYMBOLS).join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,symbol`;

    try {
      const json = await httpsGet(url);
      const quotes = json?.quoteResponse?.result ?? [];

      // Build reverse map from encoded symbol → key
      const reverseMap = {};
      for (const [key, encoded] of Object.entries(YAHOO_SYMBOLS)) {
        const decoded = decodeURIComponent(encoded);
        reverseMap[decoded] = key;
      }

      for (const q of quotes) {
        const key = reverseMap[q.symbol];
        if (!key) continue;
        const price = q.regularMarketPrice;
        if (price && price > 0) {
          this.lastPrices[key] = price;
          this.onPrice(key, price);
        }
      }
      console.log(`[Yahoo] Actualizados: ${quotes.map(q => q.symbol).join(", ")}`);
    } catch (err) {
      console.warn("[Yahoo] Error:", err.message);
    }
  }

  _startBinanceWs() {
    const streams = Object.values(BINANCE_PAIRS).map(p => `${p}@trade`).join("/");
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    const connect = () => {
      const ws = new WebSocket(url);
      this._binanceWs = ws;

      ws.on("open", () => {
        console.log("[Binance WS] Conectado — BTC y ETH en tiempo real");
      });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw);
          const data = msg.data;
          if (!data || data.e !== "trade") return;
          const price = parseFloat(data.p);
          if (!price || isNaN(price)) return;
          for (const [key, pair] of Object.entries(BINANCE_PAIRS)) {
            if (data.s === pair.toUpperCase()) {
              this.lastPrices[key] = price;
              this.onPrice(key, price);
            }
          }
        } catch (_) {}
      });

      ws.on("close", () => {
        console.warn("[Binance WS] Desconectado — reconectando en 5s...");
        setTimeout(connect, 5000);
      });

      ws.on("error", (err) => {
        console.warn("[Binance WS] Error:", err.message);
        ws.terminate();
      });
    };

    connect();
  }
}

module.exports = { PriceFetcher };
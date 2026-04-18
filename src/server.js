const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");
const path = require("path");
const { TradingEngine } = require("./engine");
const { PriceFetcher } = require("./prices");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const engine = new TradingEngine();
const fetcher = new PriceFetcher((key, price) => {
  engine.ingestPrice(key, price);
});

const publicDir = path.resolve(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("/", (req, res) => res.sendFile(path.join(publicDir, "index.html")));
app.get("/api/state", (req, res) => res.json(engine.getState()));

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((c) => { if (c.readyState === 1) c.send(msg); });
}

// Precio en tiempo real → push inmediato al dashboard (solo crypto via Binance)
const _origIngest = engine.ingestPrice.bind(engine);
engine.ingestPrice = (key, price) => {
  _origIngest(key, price);
  // Para crypto (llega tick a tick) hacemos push directo del precio
  if (["BTC", "ETH"].includes(key)) {
    broadcast({ type: "price", key, price });
  }
};

// Loop de estrategias cada 5 segundos
setInterval(() => {
  const executed = engine.tick_update();
  const state = engine.getState();
  broadcast({ type: "state", data: state });
  if (executed.length > 0) broadcast({ type: "trades", data: executed });
}, 5000);

wss.on("connection", (ws) => {
  console.log("[WS] Cliente conectado");
  ws.send(JSON.stringify({ type: "state", data: engine.getState() }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`\n  Trading Bot → http://localhost:${PORT}\n`);
  await fetcher.start();
});
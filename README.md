# Poly Markets — Paper Trading Bot

Bot de paper trading para [Polymarket](https://polymarket.com) enfocado en activos financieros reales: Bitcoin, Gold, S&P 500, Tesla, Nvidia y más. Opera con **dinero virtual** ($10,000) para entrenar estrategias antes de arriesgar capital real.

Dashboard web con estética iOS glassmorphism, fondo de montaña SVG y actualización en tiempo real.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?style=flat&logo=express&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat)

---

## Features

- **4 estrategias automáticas** — Momentum, Contrarian, Arbitraje, News/Eventos
- **15 activos financieros** — BTC, ETH, Gold, S&P 500, Nasdaq, Apple, Tesla, Nvidia, Oil, Fed...
- **Portfolio virtual** — $10,000 de balance inicial, hasta 8 posiciones abiertas simultáneas
- **Dashboard en tiempo real** — actualización cada 5 segundos, sin recargar
- **Sin dependencias de frontend** — HTML + CSS + JS vanilla puro
- **Cero auth requerida** — usa la API pública de Polymarket

---

## Instalación

```bash
git clone https://github.com/tuusuario/polymarket-bot
cd polymarket-bot
npm install express
node server.js
```

Abre [http://localhost:3000](http://localhost:3000)

> Requiere **Node.js 18+**

---

## Uso

1. Pulsa **Iniciar bot** en el header
2. El bot analiza mercados de Polymarket cada 60 segundos
3. Abre posiciones automáticamente cuando detecta señales
4. Cierra con **+15% take-profit** o **-10% stop-loss**
5. Monitoriza resultados en el dashboard

---

## Estrategias

| Estrategia | Lógica |
|---|---|
| **Momentum** | YES entre 20–45% con volumen alto — mercado infravalorado |
| **Contrarian** | YES > 82% o < 12% — apuesta a la reversión a la media |
| **Arbitraje** | YES+NO < 0.97 — gap de pricing o mercados duplicados |
| **News/Eventos** | Alta liquidez + YES entre 55–75% — catalizador de evento |

---

## Estructura

```
polymarket-bot/
├── server.js        ← Backend: bot + API REST
├── package.json
└── public/
    ├── index.html   ← Dashboard UI
    └── app.js       ← Lógica del frontend
```

---

## Pasar a dinero real

Cuando el bot lleve 2+ semanas con win rate >55%, la transición requiere API key de Polymarket CLOB + wallet de Polygon (MATIC). Más info en la documentación.

> ⚠️ El trading conlleva riesgo de pérdida. Nunca inviertas más de lo que puedas perder.

---

MIT License

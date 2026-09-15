# cursor-demo-sandbox
Sandbox for Cursor Cloud Agent demos + Cloudflare Pages preview URLs

## Preview page

Cloudflare Pages serves [`index.html`](index.html) from the repo root as the clickable preview homepage.

## Paper TA board

Phone-friendly technical-analysis page at [`/ta/`](ta/). Default symbol is `BINANCE:BTCUSDT` (changeable). It shows a buy / sell / neutral consensus plus a few oscillator and moving-average rows.

**Paper only** — no live orders, no exchange keys, no TradingView login. When the browser can reach public Binance klines, the board is labeled **Live**. If that request is blocked, it falls back to a labeled **Demo** walk so the page still works as a static Pages site. No Worker is required.

Open production: https://cursor-demo-sandbox.pages.dev/ta/

PR preview URLs follow Cloudflare Pages: `https://<hash>.cursor-demo-sandbox.pages.dev/ta/`

(function () {
  const DEFAULT_SYMBOL = "BINANCE:BTCUSDT";
  const LIMIT = 200;
  const ENDPOINTS = [
    "https://api.binance.com/api/v3/klines",
    "https://data-api.binance.vision/api/v3/klines",
    "https://api.binance.us/api/v3/klines",
  ];

  const form = document.getElementById("symbol-form");
  const input = document.getElementById("symbol");
  const chips = document.getElementById("chips");
  const intervals = document.getElementById("intervals");
  const badge = document.getElementById("data-badge");
  const meta = document.getElementById("meta");
  const consensusEl = document.getElementById("consensus");
  const callEl = document.getElementById("call");
  const countsEl = document.getElementById("counts");
  const oscRows = document.getElementById("osc-rows");
  const maRows = document.getElementById("ma-rows");
  const spark = document.getElementById("spark");

  let interval = "1h";

  function parseSymbol(raw) {
    const text = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
    const parts = text.split(":");
    const ticker = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    const exchange = parts.length > 1 ? parts[0] : "BINANCE";
    const pair = ticker.replace(/[^A-Z0-9]/g, "") || "BTCUSDT";
    return {
      display: exchange + ":" + pair,
      pair: pair,
    };
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(seed) {
    let a = seed || 1;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedPrice(pair) {
    if (pair.startsWith("BTC")) return 68000;
    if (pair.startsWith("ETH")) return 3550;
    if (pair.startsWith("SOL")) return 148;
    if (pair.startsWith("BNB")) return 590;
    return 100 + (hash(pair) % 900);
  }

  function demoCandles(pair, tf) {
    const rand = rng(hash(pair + ":" + tf));
    const step = { "15m": 15 * 60e3, "1h": 3600e3, "4h": 4 * 3600e3, "1d": 86400e3 }[tf] || 3600e3;
    let price = seedPrice(pair);
    const now = Date.now();
    const candles = [];
    for (let i = LIMIT; i >= 1; i--) {
      const drift = (rand() - 0.48) * price * 0.012;
      const open = price;
      const close = Math.max(0.01, price + drift);
      const high = Math.max(open, close) * (1 + rand() * 0.004);
      const low = Math.min(open, close) * (1 - rand() * 0.004);
      candles.push({
        t: now - i * step,
        o: open,
        h: high,
        l: low,
        c: close,
        v: 50 + rand() * 400,
      });
      price = close;
    }
    return candles;
  }

  function parseKlines(rows) {
    return rows.map(function (row) {
      return {
        t: row[0],
        o: +row[1],
        h: +row[2],
        l: +row[3],
        c: +row[4],
        v: +row[5],
      };
    });
  }

  async function fetchLive(pair, tf) {
    let lastErr = null;
    for (let i = 0; i < ENDPOINTS.length; i++) {
      const url = ENDPOINTS[i] + "?symbol=" + encodeURIComponent(pair) + "&interval=" + tf + "&limit=" + LIMIT;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          lastErr = new Error("HTTP " + res.status);
          continue;
        }
        const json = await res.json();
        if (!Array.isArray(json) || !json.length) {
          lastErr = new Error("empty");
          continue;
        }
        return parseKlines(json);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("live fetch failed");
  }

  function sma(values, len) {
    if (values.length < len) return null;
    let sum = 0;
    for (let i = values.length - len; i < values.length; i++) sum += values[i];
    return sum / len;
  }

  function ema(values, len) {
    if (values.length < len) return null;
    const k = 2 / (len + 1);
    let prev = 0;
    for (let i = 0; i < len; i++) prev += values[i];
    prev /= len;
    for (let i = len; i < values.length; i++) prev = values[i] * k + prev * (1 - k);
    return prev;
  }

  function rsi(closes, len) {
    if (closes.length <= len) return null;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= len; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) gain += d;
      else loss -= d;
    }
    gain /= len;
    loss /= len;
    for (let i = len + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      const g = d > 0 ? d : 0;
      const l = d < 0 ? -d : 0;
      gain = (gain * (len - 1) + g) / len;
      loss = (loss * (len - 1) + l) / len;
    }
    if (loss === 0) return 100;
    return 100 - 100 / (1 + gain / loss);
  }

  function macdHist(closes) {
    if (closes.length < 35) return null;
    const e12 = [];
    const e26 = [];
    const k12 = 2 / 13;
    const k26 = 2 / 27;
    let p12 = sma(closes.slice(0, 12), 12);
    let p26 = sma(closes.slice(0, 26), 26);
    if (p12 == null || p26 == null) return null;
    for (let i = 0; i < closes.length; i++) {
      if (i < 12) e12.push(null);
      else if (i === 12) e12.push(p12);
      else {
        p12 = closes[i] * k12 + p12 * (1 - k12);
        e12.push(p12);
      }
      if (i < 26) e26.push(null);
      else if (i === 26) e26.push(p26);
      else {
        p26 = closes[i] * k26 + p26 * (1 - k26);
        e26.push(p26);
      }
    }
    const line = [];
    for (let i = 0; i < closes.length; i++) {
      line.push(e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null);
    }
    const valid = line.filter(function (v) { return v != null; });
    const signal = ema(valid, 9);
    if (signal == null) return null;
    return valid[valid.length - 1] - signal;
  }

  function stoch(candles, len) {
    if (candles.length < len) return null;
    const slice = candles.slice(-len);
    let hi = -Infinity;
    let lo = Infinity;
    for (let i = 0; i < slice.length; i++) {
      hi = Math.max(hi, slice[i].h);
      lo = Math.min(lo, slice[i].l);
    }
    if (hi === lo) return 50;
    return 100 * ((slice[slice.length - 1].c - lo) / (hi - lo));
  }

  function cci(candles, len) {
    if (candles.length < len) return null;
    const tps = candles.map(function (c) { return (c.h + c.l + c.c) / 3; });
    const slice = tps.slice(-len);
    const mean = sma(slice, len);
    let dev = 0;
    for (let i = 0; i < slice.length; i++) dev += Math.abs(slice[i] - mean);
    dev /= len;
    if (dev === 0) return 0;
    return (slice[slice.length - 1] - mean) / (0.015 * dev);
  }

  function williams(candles, len) {
    const k = stoch(candles, len);
    return k == null ? null : k - 100;
  }

  function momentum(closes, len) {
    if (closes.length <= len) return null;
    return closes[closes.length - 1] - closes[closes.length - 1 - len];
  }

  function fmt(n, digits) {
    if (n == null || !isFinite(n)) return "—";
    const abs = Math.abs(n);
    const d = digits != null ? digits : abs >= 1000 ? 1 : abs >= 10 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }

  function priceSignal(price, ma) {
    if (price == null || ma == null) return "neutral";
    if (price > ma) return "buy";
    if (price < ma) return "sell";
    return "neutral";
  }

  function oscSignal(kind, value) {
    if (value == null) return "neutral";
    if (kind === "rsi" || kind === "stoch") {
      if (value < 30) return "buy";
      if (value > 70) return "sell";
      return "neutral";
    }
    if (kind === "cci") {
      if (value < -100) return "buy";
      if (value > 100) return "sell";
      return "neutral";
    }
    if (kind === "willr") {
      if (value < -80) return "buy";
      if (value > -20) return "sell";
      return "neutral";
    }
    if (kind === "macd" || kind === "mom") {
      if (value > 0) return "buy";
      if (value < 0) return "sell";
      return "neutral";
    }
    return "neutral";
  }

  function renderRows(el, rows) {
    el.innerHTML = rows.map(function (row) {
      return (
        "<li><span class=\"name\">" + row.name + "</span>" +
        "<span class=\"val\">" + row.val + "</span>" +
        "<span class=\"sig sig-" + row.signal + "\">" + row.signal + "</span></li>"
      );
    }).join("");
  }

  function drawSpark(closes, signal) {
    if (!closes.length) {
      spark.innerHTML = "";
      return;
    }
    const w = 320;
    const h = 64;
    const min = Math.min.apply(null, closes);
    const max = Math.max.apply(null, closes);
    const span = max - min || 1;
    const pts = closes.map(function (c, i) {
      const x = (i / (closes.length - 1)) * w;
      const y = h - 4 - ((c - min) / span) * (h - 8);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    const color = signal === "sell" ? "#f23645" : signal === "buy" ? "#089981" : "#c1a25b";
    spark.innerHTML =
      "<polyline fill=\"none\" stroke=\"" + color + "\" stroke-width=\"2\" points=\"" + pts + "\" />";
  }

  function analyze(candles) {
    const closes = candles.map(function (c) { return c.c; });
    const last = closes[closes.length - 1];
    const osc = [
      { name: "RSI (14)", val: fmt(rsi(closes, 14), 1), signal: oscSignal("rsi", rsi(closes, 14)) },
      { name: "Stoch %K (14)", val: fmt(stoch(candles, 14), 1), signal: oscSignal("stoch", stoch(candles, 14)) },
      { name: "CCI (20)", val: fmt(cci(candles, 20), 1), signal: oscSignal("cci", cci(candles, 20)) },
      { name: "Williams %R", val: fmt(williams(candles, 14), 1), signal: oscSignal("willr", williams(candles, 14)) },
      { name: "MACD hist", val: fmt(macdHist(closes), 3), signal: oscSignal("macd", macdHist(closes)) },
      { name: "Momentum (10)", val: fmt(momentum(closes, 10), 2), signal: oscSignal("mom", momentum(closes, 10)) },
    ];
    const mas = [
      { name: "EMA (10)", val: fmt(ema(closes, 10)), signal: priceSignal(last, ema(closes, 10)) },
      { name: "SMA (20)", val: fmt(sma(closes, 20)), signal: priceSignal(last, sma(closes, 20)) },
      { name: "SMA (50)", val: fmt(sma(closes, 50)), signal: priceSignal(last, sma(closes, 50)) },
      { name: "EMA (50)", val: fmt(ema(closes, 50)), signal: priceSignal(last, ema(closes, 50)) },
      { name: "SMA (200)", val: fmt(sma(closes, 200)), signal: priceSignal(last, sma(closes, 200)) },
    ];
    const all = osc.concat(mas);
    const buy = all.filter(function (r) { return r.signal === "buy"; }).length;
    const sell = all.filter(function (r) { return r.signal === "sell"; }).length;
    const neu = all.filter(function (r) { return r.signal === "neutral"; }).length;
    let call = "Neutral";
    if (buy > sell && buy > neu) call = "Buy";
    else if (sell > buy && sell > neu) call = "Sell";
    return { osc: osc, mas: mas, buy: buy, sell: sell, neu: neu, call: call, last: last, closes: closes };
  }

  function setBadge(kind, label) {
    badge.className = "badge badge-" + kind;
    badge.textContent = label;
  }

  function syncChips(display) {
    chips.querySelectorAll("button").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-symbol") === display);
    });
  }

  function render(display, result, source, note) {
    document.title = "Paper TA · " + display;
    consensusEl.className = "consensus is-" + result.call.toLowerCase();
    callEl.textContent = result.call;
    countsEl.textContent = result.buy + " buy · " + result.neu + " neutral · " + result.sell + " sell";
    document.getElementById("bar-buy").style.flex = String(result.buy);
    document.getElementById("bar-neu").style.flex = String(result.neu);
    document.getElementById("bar-sell").style.flex = String(result.sell);
    renderRows(oscRows, result.osc);
    renderRows(maRows, result.mas);
    drawSpark(result.closes, result.call.toLowerCase());
    setBadge(source === "live" ? "live" : "demo", source === "live" ? "Live" : "Demo");
    const price = fmt(result.last, result.last >= 100 ? 2 : 4);
    meta.textContent = display + " · " + interval.toUpperCase() + " · last " + price + " · " + note;
  }

  async function load(raw) {
    const parsed = parseSymbol(raw);
    input.value = parsed.display;
    syncChips(parsed.display);
    const url = new URL(location.href);
    url.searchParams.set("symbol", parsed.display);
    url.searchParams.set("interval", interval);
    history.replaceState(null, "", url);
    setBadge("wait", "Loading");
    meta.textContent = "Trying public Binance candles…";
    try {
      const candles = await fetchLive(parsed.pair, interval);
      render(parsed.display, analyze(candles), "live", "public Binance klines, no API key");
    } catch (err) {
      const candles = demoCandles(parsed.pair, interval);
      render(
        parsed.display,
        analyze(candles),
        "demo",
        "live feed blocked — labeled demo walk"
      );
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    load(input.value);
  });

  chips.addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-symbol]");
    if (!btn) return;
    load(btn.getAttribute("data-symbol"));
  });

  intervals.addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-interval]");
    if (!btn) return;
    interval = btn.getAttribute("data-interval");
    intervals.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("is-on", b === btn);
    });
    load(input.value);
  });

  const params = new URLSearchParams(location.search);
  if (params.get("interval") && /^(15m|1h|4h|1d)$/.test(params.get("interval"))) {
    interval = params.get("interval");
    intervals.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-interval") === interval);
    });
  }
  load(params.get("symbol") || DEFAULT_SYMBOL);
})();

/* Salle d'analyse — moteur Stockfish 19 lite et file d'analyse */
"use strict";
(function () {
  class Engine {
    constructor() {
      this.handler = null; this.busy = false; this.chain = Promise.resolve(); this.mpv = 0; this.failed = false;
      try { this.w = new Worker("engine/stockfish-19-lite-single.js"); }
      catch (e) { this.failed = true; this.ready = Promise.reject(e); this.ready.catch(() => {}); return; }
      this.w.onmessage = e => { const l = String(e.data); if (this.handler) this.handler(l); };
      this.w.onerror = () => { this.failed = true; };
      this.ready = new Promise((res, rej) => {
        const to = setTimeout(() => rej(new Error("Le moteur ne répond pas.")), 30000);
        this.handler = l => { if (l === "readyok") { clearTimeout(to); this.handler = null; res(); } };
        ["uci", "setoption name Hash value 32", "isready"].forEach(c => this.w.postMessage(c));
      });
      this.ready.catch(() => { this.failed = true; });
    }
    analyze(fen, depth, multipv) {
      const job = this.chain.then(() => this.ready).then(() => new Promise(res => {
        const lines = {}; this.busy = true;
        if (this.mpv !== multipv) { this.w.postMessage("setoption name MultiPV value " + multipv); this.mpv = multipv; }
        this.handler = l => {
          if (l.startsWith("info") && l.includes(" pv ") && l.includes(" score ") && !l.includes("bound")) {
            const mp = +(l.match(/ multipv (\d+)/) || [0, 1])[1];
            const sc = l.match(/ score (cp|mate) (-?\d+)/);
            const pv = l.split(" pv ")[1].trim().split(/\s+/);
            if (sc) lines[mp] = { cp: sc[1] === "cp" ? +sc[2] : null, mate: sc[1] === "mate" ? +sc[2] : null, pv };
          } else if (l.startsWith("bestmove")) {
            this.busy = false; this.handler = null;
            const b = l.split(/\s+/)[1]; res({ lines, best: (b && b !== "(none)") ? b : null });
          }
        };
        this.w.postMessage("position fen " + fen);
        this.w.postMessage("go depth " + depth);
      }));
      this.chain = job.catch(() => {});
      return job;
    }
    stop() { if (this.busy && this.w) this.w.postMessage("stop"); }
  }
  let engine = null;
  SA.engine = () => engine || (engine = new Engine());

  /* Évalue une position ; tout est ramené au point de vue des blancs */
  SA.evalPosition = async function (fen, depth, multipv) {
    const g = new Chess(fen), stm = g.turn();
    if (g.in_checkmate()) return { w: stm === "w" ? 0 : 100, cp: null, m: null, b: null, pv: [], t: "mate" };
    if (g.in_draw() || g.in_stalemate()) return { w: 50, cp: 0, m: null, b: null, pv: [], t: "draw" };
    const r = await SA.engine().analyze(fen, depth, multipv);
    const s = stm === "w" ? 1 : -1;
    const conv = x => {
      if (!x) return null;
      const cp = x.cp != null ? x.cp * s : null, m = x.mate != null ? x.mate * s : null;
      const w = m != null ? (m > 0 ? 100 : m < 0 ? 0 : (stm === "w" ? 0 : 100)) : SA.winFromCp(cp);
      return { cp, m, w, pv: x.pv };
    };
    const a = conv(r.lines[1]) || { cp: 0, m: null, w: 50, pv: [] }, b2 = conv(r.lines[2]);
    return { w: Math.round(a.w * 100) / 100, cp: a.cp, m: a.m, b: r.best, pv: (a.pv || []).slice(0, 10), w2: b2 ? Math.round(b2.w * 100) / 100 : null, t: null };
  };

  /* Analyse complète d'une partie */
  SA.analyzeGame = async function (game, depth, onProgress, cancelled) {
    const p = SA.parsePgn(game.pgn);
    const book = SA.bookInfo(p.moves);
    const data = { evals: [], cls: [], moves: p.moves, fens: p.fens, bookPlies: book.k };
    const N = p.fens.length;
    for (let i = 0; i < N; i++) {
      if (cancelled && cancelled()) return null;
      data.evals[i] = await SA.evalPosition(p.fens[i], depth, 2);
      if (i > 0) data.cls[i - 1] = SA.classify(i - 1, data);
      onProgress && onProgress((i + 1) / N);
    }
    const sum = SA.summarize(data.cls);
    return Object.assign({ v: 1, cv: SA.CLS_VERSION, depth, evals: data.evals, cls: data.cls, bookPlies: book.k, bookName: book.k >= 2 ? book.name : "", at: Date.now() }, sum);
  };

  /* File d'analyse : une partie à la fois, l'écran reste allumé pendant le calcul */
  const listeners = new Set();
  const Q = SA.queue = { ids: [], current: null, progress: 0, waitingCharge: false, error: null,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const emit = () => listeners.forEach(fn => { try { fn(Q); } catch (e) {} });
  let running = false, wakeLock = null, cancelId = null;

  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); }
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) {}
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && running) keepAwake(true); });

  async function waitForCharge() {
    if (!SA.settings.chargeOnly || !navigator.getBattery) return;
    let bat; try { bat = await navigator.getBattery(); } catch (e) { return; }
    if (bat.charging) return;
    Q.waitingCharge = true; emit();
    await new Promise(res => { const h = () => { if (bat.charging || !SA.settings.chargeOnly) { bat.removeEventListener("chargingchange", h); clearInterval(t); res(); } }; bat.addEventListener("chargingchange", h); const t = setInterval(h, 3000); });
    Q.waitingCharge = false; emit();
  }

  async function run() {
    if (running) return; running = true; keepAwake(true);
    while (Q.ids.length) {
      const id = Q.ids[0];
      const game = await SA.db.get(id);
      if (!game) { Q.ids.shift(); continue; }
      const manual = game.source === "libre" || game.source === "pgn";
      if (!manual) await waitForCharge();
      Q.current = id; Q.progress = 0; Q.error = null; emit();
      cancelId = null;
      try {
        const an = await SA.analyzeGame(game, SA.settings.depth, f => { Q.progress = f; emit(); }, () => cancelId === id);
        if (an) { const fresh = await SA.db.get(id); if (fresh) { fresh.analysis = an; await SA.db.put(fresh); } }
      } catch (e) {
        Q.error = { id, message: e.message || String(e) };
        const fresh = await SA.db.get(id); if (fresh) { fresh.error = e.message || String(e); await SA.db.put(fresh); }
      }
      Q.ids = Q.ids.filter(x => x !== id); Q.current = null; Q.progress = 0; emit();
    }
    running = false; keepAwake(false); emit();
  }
  Q.add = (ids, front) => {
    ids = ids.filter(id => id !== Q.current && !Q.ids.includes(id));
    Q.ids = front ? [Q.ids[0] === Q.current ? Q.ids[0] : null, ...ids, ...Q.ids.slice(Q.ids[0] === Q.current ? 1 : 0)].filter(Boolean) : Q.ids.concat(ids);
    emit(); run();
  };
  Q.cancel = id => {
    if (id === Q.current) { cancelId = id; SA.engine().stop(); }
    Q.ids = Q.ids.filter(x => x !== id || x === Q.current); emit();
  };
  Q.cancelAll = () => { const cur = Q.current; Q.ids = cur ? [cur] : []; if (cur) Q.cancel(cur); emit(); };
  Q.has = id => Q.ids.includes(id);
})();

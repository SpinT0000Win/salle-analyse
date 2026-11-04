/* Salle d'analyse — outils communs : réglages, stockage, PGN, classification */
"use strict";
const SA = window.SA = {};

/* ---------- Petits outils ---------- */
SA.$ = (s, r) => (r || document).querySelector(s);
SA.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
SA.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
SA.fmtNum = (v, d = 1) => v == null || isNaN(v) ? "—" : v.toFixed(d).replace(".", ",");
SA.fmtDate = ms => new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
SA.monthLabel = ms => { const s = new Date(ms).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return s.charAt(0).toUpperCase() + s.slice(1); };

/* ---------- Réglages (sur le téléphone) ---------- */
const SETTINGS_KEY = "sa.settings.v1";
const DEFAULTS = { cc: "", li: "", speeds: ["rapid"], depth: 16, chargeOnly: false, onboarded: false };
SA.settings = (() => {
  try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); }
  catch (e) { return Object.assign({}, DEFAULTS); }
})();
SA.saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SA.settings)); } catch (e) {} };
SA.accounts = () => {
  const a = [];
  if (SA.settings.cc) a.push("chesscom:" + SA.settings.cc.toLowerCase());
  if (SA.settings.li) a.push("lichess:" + SA.settings.li.toLowerCase());
  return a;
};
SA.SPEEDS = { rapid: "Rapide", blitz: "Blitz", classical: "Longue" };

/* ---------- Base IndexedDB ---------- */
SA.db = (() => {
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open("salle-analyse", 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("games")) d.createObjectStore("games", { keyPath: "id" }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction("games", mode); const st = t.objectStore("games");
      let out; const p = fn(st); if (p) p.onsuccess = () => { out = p.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  return {
    all: () => tx("readonly", st => st.getAll()),
    get: id => tx("readonly", st => st.get(id)),
    put: g => tx("readwrite", st => st.put(g)),
    putMany: gs => tx("readwrite", st => { gs.forEach(g => st.put(g)); return null; }),
    del: id => tx("readwrite", st => st.delete(id)),
    delMany: ids => tx("readwrite", st => { ids.forEach(id => st.delete(id)); return null; }),
    clear: () => tx("readwrite", st => st.clear())
  };
})();

/* Parties visibles : comptes actuels + PGN ajoutés à la liste, filtrées par cadence */
SA.visibleGames = async () => {
  const acc = SA.accounts(), sp = SA.settings.speeds;
  const all = await SA.db.all();
  return all.filter(g => {
    if (g.source === "pgn") return g.inList;
    if (g.source === "libre") return false;
    return acc.includes(g.account) && sp.includes(g.speed);
  }).sort((a, b) => b.date - a.date);
};

/* ---------- PGN ---------- */
SA.parsePgn = function (text) {
  text = String(text || "").replace(/\r/g, "").replace(/^﻿/, "");
  const headers = {};
  text.replace(/\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g, (_, k, v) => { headers[k] = v; return ""; });
  let mt = text.replace(/\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g, " ");
  const clocks = [];
  mt = mt.replace(/\{([^}]*)\}/g, (m, c) => { const k = c.match(/\[%clk\s+([\d:.]+)\]/); return k ? ` __CLK${k[1]}__ ` : " "; });
  let prev; do { prev = mt; mt = mt.replace(/\([^()]*\)/g, " "); } while (prev !== mt);
  mt = mt.replace(/\$\d+/g, " ").replace(/0-0-0/g, "O-O-O").replace(/0-0(?!-)/g, "O-O");
  const g = new Chess();
  if (headers.FEN && !g.load(headers.FEN)) throw new Error("La position de départ (FEN) du PGN est illisible.");
  const fens = [g.fen()], moves = [];
  for (let tok of mt.split(/\s+/)) {
    if (!tok) continue;
    const ck = tok.match(/^__CLK([\d:.]+)__$/);
    if (ck) { const p = ck[1].split(":").map(Number); let s = 0; p.forEach(x => s = s * 60 + x); clocks[moves.length - 1] = s; continue; }
    tok = tok.replace(/^\d+\.+/, "");
    if (!tok || /^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(tok)) continue;
    tok = tok.replace(/[!?]+$/, "");
    const m = g.move(tok, { sloppy: true });
    if (!m) throw new Error(`Coup illisible : « ${tok} » (demi-coup ${moves.length + 1}).`);
    moves.push({ san: m.san, from: m.from, to: m.to, promotion: m.promotion, color: m.color, captured: m.captured, piece: m.piece });
    fens.push(g.fen());
  }
  return { headers, fens, moves, clocks };
};
SA.splitPgns = text => {
  const parts = String(text || "").replace(/\r/g, "").split(/\n(?=\[Event\s)/);
  return parts.map(s => s.trim()).filter(s => s.length > 0);
};

/* ---------- Théorie (ouvertures courantes) ---------- */
const BOOK = [
  ["Partie espagnole", "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7"], ["Espagnole, défense berlinoise", "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4"],
  ["Partie italienne", "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3"], ["Défense des deux cavaliers", "e4 e5 Nf3 Nc6 Bc4 Nf6 d3"],
  ["Partie écossaise", "e4 e5 Nf3 Nc6 d4 exd4 Nxd4"], ["Défense Philidor", "e4 e5 Nf3 d6 d4"],
  ["Défense russe (Petrov)", "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4"], ["Gambit du roi", "e4 e5 f4 exf4"], ["Partie viennoise", "e4 e5 Nc3 Nf6"],
  ["Sicilienne Najdorf", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6"], ["Sicilienne ouverte", "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3"],
  ["Sicilienne Taimanov", "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6"], ["Sicilienne fermée", "e4 c5 Nc3 Nc6 g3"], ["Sicilienne Alapine", "e4 c5 c3 Nf6 e5 Nd5"],
  ["Défense française", "e4 e6 d4 d5 Nc3 Nf6"], ["Française, avance", "e4 e6 d4 d5 e5 c5 c3 Nc6"],
  ["Défense Caro-Kann", "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5"], ["Caro-Kann, avance", "e4 c6 d4 d5 e5 Bf5"],
  ["Défense scandinave", "e4 d5 exd5 Qxd5 Nc3 Qa5"], ["Défense Pirc", "e4 d6 d4 Nf6 Nc3 g6"], ["Défense Alekhine", "e4 Nf6 e5 Nd5 d4 d6"],
  ["Défense moderne", "e4 g6 d4 Bg7 Nc3 d6"], ["Gambit dame refusé", "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7"], ["Gambit dame accepté", "d4 d5 c4 dxc4 Nf3 Nf6 e3"],
  ["Défense slave", "d4 d5 c4 c6 Nf3 Nf6 Nc3"], ["Système de Londres", "d4 d5 Bf4 Nf6 e3 e6 Nf3"], ["Système de Londres", "d4 Nf6 Bf4 d5 e3"],
  ["Défense est-indienne", "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O"], ["Défense nimzo-indienne", "d4 Nf6 c4 e6 Nc3 Bb4"],
  ["Défense ouest-indienne", "d4 Nf6 c4 e6 Nf3 b6"], ["Défense Grünfeld", "d4 Nf6 c4 g6 Nc3 d5"], ["Gambit Benko", "d4 Nf6 c4 c5 d5 b5"],
  ["Défense hollandaise", "d4 f5 c4 Nf6 g3"], ["Partie anglaise", "c4 e5 Nc3 Nf6"], ["Anglaise symétrique", "c4 c5 Nc3 Nc6"], ["Ouverture Réti", "Nf3 d5 g3 Nf6"]
].map(([n, l]) => ({ name: n, line: l.split(" ") }));
SA.bookInfo = moves => {
  const sans = moves.map(m => m.san.replace(/[+#]/g, ""));
  let best = { k: 0, name: "" };
  for (const b of BOOK) { let k = 0; while (k < b.line.length && k < sans.length && sans[k] === b.line[k]) k++; if (k > best.k) best = { k, name: b.name }; }
  return best;
};

/* ---------- Évaluation, classification ---------- */
SA.CLS = {
  brilliant: { lab: "Brillant", sym: "!!", col: "#1ba7a1", say: s => `${s} est un coup brillant : un sacrifice qui tient.` },
  great: { lab: "Très bon coup", sym: "!", col: "#5b8bb4", say: s => `${s} est un très bon coup, le seul qui garde l'avantage.` },
  best: { lab: "Meilleur coup", sym: "★", col: "#7fb24a", say: s => `${s} est le meilleur coup.` },
  excellent: { lab: "Excellent", sym: "✓", col: "#93b84a", say: s => `${s} est excellent.` },
  good: { lab: "Bon", sym: "✓", col: "#8fa889", say: s => `${s} est un bon coup.` },
  book: { lab: "Théorie", sym: "Th", col: "#a6845f", say: s => `${s} est un coup de théorie.` },
  inaccuracy: { lab: "Imprécision", sym: "?!", col: "#e8b83f", say: s => `${s} est une imprécision.` },
  mistake: { lab: "Erreur", sym: "?", col: "#e3862a", say: s => `${s} est une erreur.` },
  miss: { lab: "Occasion manquée", sym: "✕", col: "#e2604c", say: s => `${s} laisse passer l'occasion de punir la faute adverse.` },
  blunder: { lab: "Gaffe", sym: "??", col: "#d9443e", say: s => `${s} est une gaffe.` }
};
SA.ORDER = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder"];
SA.winFromCp = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
SA.pov = (w, c) => c === "w" ? w : 100 - w;
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
SA.material = (fen, c) => { let m = 0; for (const ch of fen.split(" ")[0]) { const l = ch.toLowerCase(); if (VAL[l] != null) m += ((ch === l ? "b" : "w") === c ? 1 : -1) * VAL[l]; } return m; };
/* Échange statique sur une case : gain matériel maximal pour le camp au trait,
   en jouant toujours la plus petite pièce qui peut prendre (reprises comprises) */
const SEEV = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
SA.see = (fen, sq) => {
  const g = new Chess(fen), first = g.get(sq);
  if (!first) return 0;
  const gains = []; let onSq = SEEV[first.type];
  for (let n = 0; n < 32; n++) {
    const caps = g.moves({ verbose: true }).filter(m => m.to === sq && m.captured);
    if (!caps.length) break;
    caps.sort((a, b) => SEEV[a.piece] - SEEV[b.piece]);
    const m = caps[0];
    gains.push(onSq);
    onSq = SEEV[m.promotion || m.piece];
    g.move(m);
  }
  let v = 0;
  for (let i = gains.length - 1; i >= 0; i--) v = Math.max(0, gains[i] - v);
  return v;
};
/* Bilan matériel d'un coup : ce qu'il gagne tout de suite, moins ce que l'adversaire
   peut ensuite gagner au mieux sur une seule case. net <= -2 : vrai sacrifice. */
/* Vrai sacrifice : on suit la ligne du moteur après le coup (réponse adverse puis notre reprise).
   Si l'adversaire prend du matériel et qu'on reste en déficit d'au moins 2 points après notre reprise,
   c'est un sacrifice. Un échange normal (il prend, on reprend) s'équilibre et ne compte pas. */
SA.sacrifice = (fenBefore, fenAfter, m, pv) => {
  let worst = 0;
  if (pv && pv.length) {
    const g = new Chess(fenAfter);
    const reply = g.move(SA.uciObj(pv[0]));
    if (reply && reply.captured) {
      if (pv[1]) g.move(SA.uciObj(pv[1]));
      worst = Math.min(worst, SA.material(g.fen(), m.color) - SA.material(fenBefore, m.color));
    }
  }
  /* La pièce jouée elle-même atterrit en prise (sacrifice offert, même si le moteur ne le prend pas) */
  if (m.piece !== "p" && m.piece !== "k") {
    const gained = (m.captured ? VAL[m.captured] : 0) + (m.promotion ? VAL[m.promotion] - 1 : 0);
    worst = Math.min(worst, gained - SA.see(fenAfter, m.to));
  }
  return worst;
};
SA.CLS_VERSION = 2;
SA.phaseOf = (fen, ply) => {
  let np = 0, q = 0;
  for (const ch of fen.split(" ")[0]) { const l = ch.toLowerCase(); if ("nbrq".includes(l)) np += VAL[l]; if (l === "q") q++; }
  if (np <= 13 || (q === 0 && np <= 20)) return "end";
  return ply < 20 ? "open" : "mid";
};
SA.uciObj = u => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const FIG = { K: "R", Q: "D", R: "T", B: "F", N: "C" };
SA.fr = san => san ? san.replace(/[KQRBN](?=[a-h1-8x]|$)/g, m => FIG[m]).replace(/=([QRBN])/, (m, p) => "=" + FIG[p]) : "";
SA.uciToSan = (fen, u) => { if (!u) return null; const g = new Chess(fen); const m = g.move(SA.uciObj(u)); return m ? m.san : null; };
SA.pvToSan = (fen, pv, max) => { const g = new Chess(fen); const out = []; for (const u of (pv || []).slice(0, max)) { const m = g.move(SA.uciObj(u)); if (!m) break; out.push(m); } return out; };
SA.fmtEval = e => {
  if (!e) return "…";
  if (e.t === "mate") return e.w === 100 ? "1-0" : "0-1";
  if (e.t === "draw") return "½-½";
  if (e.m != null) return (e.m > 0 ? "M" : "−M") + Math.abs(e.m);
  const v = (e.cp || 0) / 100; return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(Math.abs(v) >= 10 ? 0 : 1).replace(".", ",");
};

/* Classe le coup i (de fens[i] à fens[i+1]) à partir des évaluations stockées */
SA.classify = function (i, data) {
  const { evals, moves, fens, bookPlies, cls } = data;
  const before = evals[i], after = evals[i + 1], m = moves[i];
  if (!before || !after) return null;
  const c = m.color, wb = SA.pov(before.w, c), wa = SA.pov(after.w, c);
  const uci = m.from + m.to + (m.promotion || "");
  const sgn = c === "w" ? 1 : -1;
  const hadMate = before.m != null && before.m * sgn > 0;
  const stillMate = after.t === "mate" || (after.m != null && after.m * sgn > 0);
  let loss = Math.max(0, wb - wa);
  if (before.b && uci === before.b) loss = 0;
  else if (hadMate && stillMate) loss = Math.min(loss, 1.5);
  else if (hadMate && after.cp != null && after.cp * sgn >= 300) loss = Math.min(loss, 4.9);
  let k;
  if (i < bookPlies) k = "book";
  else if ((before.b && uci === before.b) || loss <= 0.5) {
    k = "best";
    const matingNow = after.t === "mate" || (after.m != null && after.m * sgn > 0);
    const choices = new Chess(fens[i]).moves().length;
    if (choices > 1 && wa >= 50 && (wb < 95 || matingNow) && SA.sacrifice(fens[i], fens[i + 1], m, after.pv) <= -2) k = "brilliant";
    else if (before.w2 != null && uci === before.b && !hadMate && !after.t) {
      const w2 = SA.pov(before.w2, c);
      const recapture = i > 0 && m.captured && moves[i - 1].to === m.to && moves[i - 1].captured;
      if (wb - w2 >= 15 && w2 < 80 && !recapture) k = "great";
    }
  }
  else if (loss < 2) k = "excellent"; else if (loss < 5) k = "good"; else if (loss < 10) k = "inaccuracy"; else if (loss < 20) k = "mistake"; else k = "blunder";
  if ((k === "mistake" || k === "blunder") && i > 0 && cls[i - 1] && ["mistake", "blunder"].includes(cls[i - 1].k)) k = "miss";
  const acc = k === "book" ? 100 : Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
  return { k, loss: Math.round(loss * 10) / 10, acc: Math.round(acc * 10) / 10, ph: SA.phaseOf(fens[i], i), c };
};

/* Résumé d'une analyse : précisions et compteurs par camp */
SA.summarize = cls => {
  const s = { w: { acc: 0, n: 0, cnt: {} }, b: { acc: 0, n: 0, cnt: {} } };
  cls.forEach(x => { if (!x) return; const p = s[x.c]; p.acc += x.acc; p.n++; p.cnt[x.k] = (p.cnt[x.k] || 0) + 1; });
  return { accW: s.w.n ? s.w.acc / s.w.n : null, accB: s.b.n ? s.b.acc / s.b.n : null, cntW: s.w.cnt, cntB: s.b.cnt };
};

/* Reclasse une analyse existante à partir de ses évaluations (sans moteur) */
SA.reclassify = game => {
  const a = game.analysis, p = SA.parsePgn(game.pgn);
  const data = { evals: a.evals, cls: [], moves: p.moves, fens: p.fens, bookPlies: a.bookPlies || 0 };
  for (let i = 0; i < p.moves.length; i++) data.cls[i] = SA.classify(i, data);
  Object.assign(a, { cls: data.cls, cv: SA.CLS_VERSION }, SA.summarize(data.cls));
  return game;
};
SA.migrated = (async () => {
  try {
    const old = (await SA.db.all()).filter(g => g.analysis && g.analysis.cv !== SA.CLS_VERSION);
    const done = [];
    for (const g of old) { try { done.push(SA.reclassify(g)); } catch (e) {} }
    if (done.length) await SA.db.putMany(done);
  } catch (e) {}
})();

/* Résultat du point de vue du joueur */
SA.outcome = g => {
  if (!g.userColor || !g.result) return null;
  if (g.result === "1/2-1/2") return "N";
  return (g.result === "1-0") === (g.userColor === "w") ? "V" : "D";
};

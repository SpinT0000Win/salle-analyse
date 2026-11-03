/* Salle d'analyse — import des parties publiques chess.com et Lichess */
"use strict";
(function () {
  const NET_ERR = "Le site n'a pas répondu. Vérifie ta connexion puis réessaie.";

  async function getJson(url, opts) {
    let r;
    try { r = await fetch(url, opts); } catch (e) { throw new Error(NET_ERR); }
    if (r.status === 404) { const e = new Error("introuvable"); e.notFound = true; throw e; }
    if (r.status === 429) throw new Error("Le site limite les requêtes. Réessaie dans une minute.");
    if (!r.ok) throw new Error(NET_ERR + ` (code ${r.status})`);
    return r;
  }

  /* Vérifie qu'un pseudo existe ; renvoie le pseudo tel qu'écrit par le site */
  async function checkUser(site, name) {
    name = name.trim();
    try {
      if (site === "chesscom") {
        const r = await getJson(`https://api.chess.com/pub/player/${encodeURIComponent(name.toLowerCase())}`);
        const j = await r.json(); return j.username || name;
      } else {
        const r = await getJson(`https://lichess.org/api/user/${encodeURIComponent(name)}`);
        const j = await r.json(); if (j.disabled) throw new Error("Ce compte Lichess est fermé."); return j.username || name;
      }
    } catch (e) {
      if (e.notFound) throw new Error(`Aucun joueur « ${name} » sur ${site === "chesscom" ? "chess.com" : "Lichess"}.`);
      throw e;
    }
  }

  function headerOf(pgn, k) { const m = String(pgn || "").match(new RegExp(`\\[${k}\\s+"([^"]*)"\\]`)); return m ? m[1] : ""; }
  function ccOpening(g) {
    const url = g.eco || headerOf(g.pgn, "ECOUrl");
    if (!url) return "";
    const slug = decodeURIComponent(url.split("/openings/")[1] || "").replace(/\.\.\..*$/, "");
    return slug.replace(/-/g, " ").replace(/\s+\d+\..*$/, "").trim();
  }
  const DRAWS = ["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"];

  async function fetchChesscom(user, speeds, months, onStep) {
    const r = await getJson(`https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`);
    const arch = (await r.json()).archives || [];
    const pick = arch.slice(-months).reverse();
    const out = [];
    for (let i = 0; i < pick.length; i++) {
      onStep && onStep(`chess.com : mois ${i + 1} sur ${pick.length}…`);
      const j = await (await getJson(pick[i])).json();
      for (const g of (j.games || [])) {
        if (g.rules !== "chess" || !g.pgn) continue;
        const speed = g.time_class === "rapid" ? "rapid" : g.time_class === "blitz" ? "blitz" : (g.time_class === "classical" ? "classical" : null);
        if (!speed || !speeds.includes(speed)) continue;
        const me = user.toLowerCase();
        const userColor = (g.white.username || "").toLowerCase() === me ? "w" : (g.black.username || "").toLowerCase() === me ? "b" : null;
        let result = "1/2-1/2";
        if (g.white.result === "win") result = "1-0"; else if (g.black.result === "win") result = "0-1";
        else if (!DRAWS.includes(g.white.result) && !DRAWS.includes(g.black.result)) result = headerOf(g.pgn, "Result") || "*";
        const tc = String(g.time_control || "").split("+");
        out.push({
          id: "cc:" + (g.uuid || g.url), source: "chesscom", account: "chesscom:" + me, speed,
          pgn: g.pgn, url: g.url, date: (g.end_time || 0) * 1000,
          white: g.white.username, black: g.black.username, whiteElo: g.white.rating, blackElo: g.black.rating,
          userColor, result, opening: ccOpening(g),
          tc: tc[0] ? `${Math.round(+tc[0] / 60)}+${tc[1] || 0}` : "", rated: !!g.rated, analysis: null, inList: true
        });
      }
    }
    return out;
  }

  async function fetchLichess(user, speeds, max, onStep) {
    onStep && onStep("Lichess : récupération…");
    const perf = speeds.filter(s => ["rapid", "blitz", "classical"].includes(s)).join(",");
    if (!perf) return [];
    const url = `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${max}&perfType=${perf}&pgnInJson=true&clocks=true&opening=true&sort=dateDesc`;
    const r = await getJson(url, { headers: { Accept: "application/x-ndjson" } });
    const text = await r.text();
    const me = user.toLowerCase(), out = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let g; try { g = JSON.parse(line); } catch (e) { continue; }
      if (g.variant !== "standard" || !g.pgn || ["aborted", "noStart", "created", "started"].includes(g.status)) continue;
      if (!speeds.includes(g.speed)) continue;
      const wn = g.players.white.user ? g.players.white.user.name : "Anonyme";
      const bn = g.players.black.user ? g.players.black.user.name : "Anonyme";
      const userColor = wn.toLowerCase() === me ? "w" : bn.toLowerCase() === me ? "b" : null;
      const result = g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "1/2-1/2";
      out.push({
        id: "li:" + g.id, source: "lichess", account: "lichess:" + me, speed: g.speed,
        pgn: g.pgn, url: "https://lichess.org/" + g.id, date: g.lastMoveAt || g.createdAt,
        white: wn, black: bn, whiteElo: g.players.white.rating, blackElo: g.players.black.rating,
        userColor, result, opening: g.opening ? g.opening.name : "",
        tc: g.clock ? `${Math.round(g.clock.initial / 60)}+${g.clock.increment}` : "", rated: !!g.rated, analysis: null, inList: true
      });
    }
    return out;
  }

  /* Récupère et enregistre les nouvelles parties ; garde les analyses existantes */
  async function sync(onStep) {
    const s = SA.settings, found = [], errors = [];
    if (s.cc) { try { found.push(...await fetchChesscom(s.cc, s.speeds, 3, onStep)); } catch (e) { errors.push("chess.com : " + e.message); } }
    if (s.li) { try { found.push(...await fetchLichess(s.li, s.speeds, 100, onStep)); } catch (e) { errors.push("Lichess : " + e.message); } }
    const existing = new Map((await SA.db.all()).map(g => [g.id, g]));
    const fresh = found.filter(g => !existing.has(g.id));
    if (fresh.length) await SA.db.putMany(fresh);
    return { added: fresh.length, total: found.length, errors };
  }

  SA.api = { checkUser, sync };
})();

/* Salle d'analyse — écrans et navigation */
"use strict";
(function () {
  const { $, $$, esc, fmtNum } = SA;
  const Q = SA.queue;
  const IC = {
    gear: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
    back: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    search: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    list: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    chart: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18M6 16l4-5 3 3 5-7"/></svg>',
    sync: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
    lock: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="color:var(--faint)"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    upload: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>',
    flip: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/></svg>',
    ext: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
  };
  const LOGO = '<svg viewBox="0 0 40 40" aria-hidden="true"><use href="assets/pieces.svg#bn"/></svg>';
  const SITE = { chesscom: "chess.com", lichess: "Lichess", pgn: "PGN ajouté", libre: "Analyse libre" };
  const SEC_PER_POS = { 14: 0.8, 16: 2, 18: 5 };

  /* ---------- Toast, boîte de dialogue ---------- */
  let toastT = null;
  SA.toast = msg => { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3800); };
  SA.dialog = ({ title, body, buttons }) => new Promise(res => {
    const w = $("#dialog");
    w.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h3 id="dlg-t">${esc(title)}</h3><p class="sub">${body}</p><div class="btns">${buttons.map((b, i) => `<button type="button" class="btn ${b.primary ? "primary" : b.danger ? "danger" : "ghost"}" data-i="${i}">${esc(b.label)}</button>`).join("")}</div></div>`;
    w.hidden = false;
    const done = v => { w.hidden = true; w.innerHTML = ""; res(v); };
    w.onclick = e => { const b = e.target.closest("button[data-i]"); if (b) done(buttons[+b.dataset.i].value); else if (e.target === w) done(null); };
    const first = w.querySelector("button"); first && first.focus();
  });

  /* ---------- Outils d'affichage ---------- */
  const opponent = g => g.userColor === "w" ? { name: g.black, elo: g.blackElo } : g.userColor === "b" ? { name: g.white, elo: g.whiteElo } : null;
  const userAcc = g => g.analysis && g.userColor ? (g.userColor === "w" ? g.analysis.accW : g.analysis.accB) : null;
  const userCnt = g => g.analysis && g.userColor ? (g.userColor === "w" ? g.analysis.cntW : g.analysis.cntB) || {} : null;
  const gaffes = g => { const c = userCnt(g); return c ? (c.blunder || 0) + (c.miss || 0) : null; };
  const RES_TXT = { V: "victoire", D: "défaite", N: "nulle" };
  function gameMeta(g) { return [SITE[g.source] || "", g.tc, g.opening].filter(Boolean).join(" · "); }
  function estimateMin(n) { return Math.max(1, Math.round(n * 70 * (SEC_PER_POS[SA.settings.depth] || 2) / 60)); }
  function back(fallback) { if (history.length > 1 && SA._navigated) history.back(); else location.hash = fallback; }

  /* ---------- Routeur ---------- */
  let cleanup = null;
  const TABS = { "": "home", parties: "parties", libre: "libre", bilan: "bilan" };
  async function route() {
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    const h = location.hash.replace(/^#\/?/, "");
    const [name, ...rest] = h.split("/");
    const views = { "": home, comptes, parties, partie, libre, bilan, reglages };
    const fn = views[name] || home;
    const tab = TABS[name];
    $(".app").classList.toggle("has-tabs", !!tab || !views[name]);
    $("#tabs").hidden = !(tab || !views[name]);
    $$("#tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === (tab || "home")));
    await SA.migrated;
    const v = $("#view"); v.innerHTML = ""; window.scrollTo(0, 0);
    try { cleanup = await fn(v, decodeURIComponent(rest.join("/"))) || null; }
    catch (e) { v.innerHTML = `<div class="empty"><p>Un problème est survenu : ${esc(e.message)}</p><a class="btn" href="#/">Retour à l'accueil</a></div>`; }
  }
  window.addEventListener("hashchange", () => { SA._navigated = true; route(); });
  window.addEventListener("DOMContentLoaded", route);
  if (document.readyState !== "loading") setTimeout(route, 0);

  /* ================= Accueil ================= */
  async function home(v) {
    const acc = SA.accounts();
    const games = acc.length ? await SA.visibleGames() : [];
    const analyzed = games.filter(g => g.analysis).length;
    v.innerHTML = `
      <div class="brand"><div class="logo">${LOGO}</div><div class="name">Salle d'analyse</div><a class="icon-btn" href="#/reglages" aria-label="Réglages">${IC.gear}</a></div>
      <h1 class="big" style="margin:14px 0 4px">Que veux-tu faire ?</h1>
      <a class="home-card" href="#/libre"><div class="ico">${IC.search}</div><div><div class="t">Analyser une partie</div><div class="d">Colle un PGN, importe un fichier ou saisis une position. Rien à configurer.</div></div></a>
      <a class="home-card lead" href="${acc.length ? "#/parties" : "#/comptes"}"><div class="ico">${IC.list}</div><div><div class="t">Mes parties</div><div class="d">Tes parties chess.com et Lichess. Tu choisis lesquelles analyser.</div>
        ${acc.length ? `<div class="note">${games.length} partie${games.length > 1 ? "s" : ""} · ${analyzed} analysée${analyzed > 1 ? "s" : ""}</div>` : `<div class="cta">Indique tes pseudos pour commencer ›</div>`}</div></a>
      <a class="home-card" href="#/bilan"><div class="ico">${IC.chart}</div><div><div class="t">Mon bilan</div><div class="d">Tes points faibles et quoi travailler, à partir de tes parties analysées.</div>
        <div class="note">${analyzed >= 20 ? `${analyzed} parties analysées` : "Fiable à partir de 20 parties analysées"}</div></div></a>
      <p class="small" style="margin-top:auto;padding-top:12px">Stockfish 19 tourne sur ton téléphone, uniquement quand tu lances une analyse. Tes données restent sur cet appareil.</p>`;
  }

  /* ================= Comptes ================= */
  async function comptes(v) {
    const s = SA.settings; let speeds = s.speeds.slice();
    v.innerHTML = `
      <div class="topbar"><button type="button" class="icon-btn" id="bk" aria-label="Retour">${IC.back}</button></div>
      <h1>Tes comptes</h1>
      <p class="sub">Pour retrouver tes parties publiques. Un seul des deux suffit.</p>
      <form id="f" style="display:flex;flex-direction:column;gap:16px" novalidate>
        <div class="field"><label for="cc">Pseudo chess.com</label><input class="input" id="cc" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ton pseudo chess.com" value="${esc(s.cc)}"></div>
        <div class="field"><label for="li">Pseudo Lichess</label><input class="input" id="li" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ton pseudo Lichess" value="${esc(s.li)}"></div>
        <div class="field"><span class="lbl">Cadences à afficher</span>
          <div class="chips" id="sp">${Object.entries(SA.SPEEDS).map(([k, l]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${speeds.includes(k)}">${l}</button>`).join("")}</div>
          <p class="small">Selon la classification de chaque site.</p></div>
        <p class="err" id="er" role="alert"></p>
        <p class="small">Seules tes parties publiques sont récupérées. Aucune analyse ne démarre sans ton accord.</p>
        <button class="btn primary block" id="go" type="submit">${s.onboarded ? "Enregistrer" : "Voir mes parties"}</button>
      </form>`;
    $("#bk").onclick = () => back(s.onboarded ? "#/reglages" : "#/");
    $("#sp").onclick = e => { const b = e.target.closest("[data-k]"); if (!b) return; const k = b.dataset.k; speeds = speeds.includes(k) ? speeds.filter(x => x !== k) : speeds.concat(k); b.setAttribute("aria-pressed", speeds.includes(k)); };
    $("#f").onsubmit = async e => {
      e.preventDefault();
      const er = $("#er"), go = $("#go"); er.textContent = "";
      const cc = $("#cc").value.trim(), li = $("#li").value.trim();
      if (!cc && !li) { er.textContent = "Indique au moins un pseudo."; return; }
      if (!speeds.length) { er.textContent = "Choisis au moins une cadence."; return; }
      go.disabled = true; go.textContent = "Vérification…";
      let ccName = "", liName = "";
      try {
        ccName = !cc ? "" : cc.toLowerCase() === s.cc.toLowerCase() ? s.cc : await SA.api.checkUser("chesscom", cc);
        liName = !li ? "" : li.toLowerCase() === s.li.toLowerCase() ? s.li : await SA.api.checkUser("lichess", li);
      } catch (x) { er.textContent = x.message; go.disabled = false; go.textContent = s.onboarded ? "Enregistrer" : "Voir mes parties"; return; }
      const oldAcc = SA.accounts();
      const newAcc = []; if (ccName) newAcc.push("chesscom:" + ccName.toLowerCase()); if (liName) newAcc.push("lichess:" + liName.toLowerCase());
      const removed = oldAcc.filter(a => !newAcc.includes(a));
      if (removed.length) {
        const all = await SA.db.all();
        const aff = all.filter(g => removed.includes(g.account));
        if (aff.length) {
          const nA = aff.filter(g => g.analysis).length;
          const names = removed.map(a => `« ${a.split(":")[1]} »`).join(" et ");
          const ch = await SA.dialog({ title: "Changer de compte ?", body: `${aff.length > 1 ? `Les ${aff.length} parties liées` : "La partie liée"} à ${esc(names)}${nA ? `, dont ${nA} analysée${nA > 1 ? "s" : ""},` : ""} ${aff.length > 1 ? "seront mises" : "sera mise"} de côté. Elles réapparaîtront si tu remets ce pseudo.`,
            buttons: [{ label: "Garder les analyses", value: "keep", primary: true }, { label: "Les supprimer", value: "del", danger: true }, { label: "Annuler", value: null }] });
          if (!ch) { go.disabled = false; go.textContent = s.onboarded ? "Enregistrer" : "Voir mes parties"; return; }
          if (ch === "del") await SA.db.delMany(aff.map(g => g.id));
        }
      }
      const speedsChanged = speeds.join() !== s.speeds.join();
      Object.assign(s, { cc: ccName, li: liName, speeds, onboarded: true }); SA.saveSettings();
      if (removed.length || newAcc.some(a => !oldAcc.includes(a)) || speedsChanged) SA.lastSync = 0;
      location.hash = "#/parties";
    };
  }

  /* ================= Mes parties ================= */
  const sel = new Set(); let partiesTab = "all"; let syncing = false;
  async function doSync(statusEl) {
    if (syncing) return; syncing = true;
    const say = t => { if (statusEl) statusEl.textContent = t; };
    say("Récupération de tes parties…");
    try {
      const r = await SA.api.sync(say);
      SA.lastSync = Date.now();
      if (r.errors.length) { say(r.errors.join(" ")); }
      else say(r.added ? `${r.added} nouvelle${r.added > 1 ? "s" : ""} partie${r.added > 1 ? "s" : ""}.` : "À jour.");
    } catch (e) { say(e.message); }
    syncing = false;
  }
  async function parties(v) {
    if (!SA.accounts().length) { location.replace("#/comptes"); return; }
    v.innerHTML = `
      <div class="topbar"><h1 class="grow">Mes parties</h1><button type="button" class="icon-btn" id="sy" aria-label="Récupérer les nouvelles parties">${IC.sync}</button></div>
      <p class="small" id="st" aria-live="polite"></p>
      <div class="seg" role="tablist" aria-label="Filtre" id="tb"></div>
      <div style="display:flex;flex-direction:column;gap:6px"><h2>Sélection rapide</h2>
        <div class="chips scroll" id="qs"><button type="button" class="chip sm" data-q="last">10 dernières</button><button type="button" class="chip sm" data-q="loss">Défaites de la semaine</button><button type="button" class="chip sm" data-q="rand">5 au hasard</button><button type="button" class="chip sm" data-q="none">Tout désélectionner</button></div></div>
      <div id="ls"></div><div id="ab" class="actionbar" hidden><div></div></div>`;
    let games = [];
    const load = async () => { games = await SA.visibleGames(); draw(); };
    const isTodo = g => !g.analysis && g.id !== Q.current && !Q.has(g.id);
    function draw() {
      const todo = games.filter(g => !g.analysis), done = games.filter(g => g.analysis);
      $("#tb").innerHTML = [["all", "Toutes", games.length], ["todo", "À analyser", todo.length], ["done", "Analysées", done.length]]
        .map(([k, l, n]) => `<button type="button" role="tab" data-t="${k}" aria-selected="${partiesTab === k}">${l} · ${n}</button>`).join("");
      const list = partiesTab === "todo" ? todo : partiesTab === "done" ? done : games;
      if (!games.length) { $("#ls").innerHTML = `<div class="empty"><p>${syncing ? "Récupération en cours…" : "Aucune partie trouvée pour ces cadences sur les 3 derniers mois (chess.com) et les 100 dernières parties (Lichess)."}</p><a class="btn ghost" href="#/comptes">Vérifier mes comptes</a></div>`; }
      else if (!list.length) { $("#ls").innerHTML = `<div class="empty"><p>Aucune partie ici.</p></div>`; }
      else {
        let html = "", lastM = "";
        for (const g of list) {
          const m = SA.monthLabel(g.date || Date.now()); if (m !== lastM) { html += `<div class="month">${esc(m)}</div>`; lastM = m; }
          const o = SA.outcome(g) || "X", opp = opponent(g);
          let state;
          if (g.analysis) state = `<span class="done-ic" aria-label="Analysée">${IC.check}</span>`;
          else if (g.id === Q.current) state = `<span class="ring" aria-label="Analyse en cours"></span>`;
          else if (Q.has(g.id)) state = `<span class="queued" aria-label="En attente d'analyse"></span>`;
          else state = `<input type="checkbox" data-sel="${esc(g.id)}" aria-label="Sélectionner pour l'analyse" ${sel.has(g.id) ? "checked" : ""}>`;
          const a = userAcc(g), gf = gaffes(g);
          let right;
          if (g.analysis) right = `<span class="acc">${a != null ? fmtNum(a) : "—"}</span><span class="err-n${gf ? " bad" : ""}">${gf == null ? "" : gf ? `${gf} gaffe${gf > 1 ? "s" : ""}` : "0 gaffe"}</span>`;
          else if (g.id === Q.current) right = `<span class="acc na" data-pct>${Math.round(Q.progress * 100)} %</span><span class="err-n">en cours</span>`;
          else right = `<span class="acc na">—</span><span class="err-n">${Q.has(g.id) ? "en attente" : g.error ? "échec" : "à analyser"}</span>`;
          html += `<div class="game" data-id="${esc(g.id)}"><span class="state">${state}</span><span class="res ${o}">${o === "X" ? "–" : o}</span>
            <span class="who"><span class="opp">${opp ? `${esc(opp.name)} <span>(${opp.elo || "?"})</span>` : `${esc(g.white)} – ${esc(g.black)}`}</span><span class="meta">${esc(gameMeta(g))}</span></span>
            <span class="score">${right}</span></div>`;
        }
        $("#ls").innerHTML = html;
      }
      drawBar();
    }
    function drawBar() {
      const ab = $("#ab"), box = ab.firstElementChild;
      const pending = (Q.current ? 1 : 0) + Q.ids.filter(x => x !== Q.current).length;
      if (sel.size) {
        ab.hidden = false;
        box.innerHTML = `<span class="grow"><b>${sel.size} partie${sel.size > 1 ? "s" : ""} sélectionnée${sel.size > 1 ? "s" : ""}</b><span>environ ${estimateMin(sel.size)} min · profondeur ${SA.settings.depth}</span></span><button type="button" class="btn primary" id="an">${pending ? "Ajouter" : "Analyser"}</button>`;
        $("#an").onclick = () => { Q.add(Array.from(sel)); sel.clear(); draw(); };
      } else if (pending) {
        ab.hidden = false;
        box.innerHTML = `<span class="grow"><b>${Q.waitingCharge ? "En attente du chargeur" : `Analyse en cours · ${pending} restante${pending > 1 ? "s" : ""}`}</b><div class="prog" style="margin-top:6px"><i id="pb" style="width:${Math.round(Q.progress * 100)}%"></i></div></span><button type="button" class="btn ghost" id="stop">Arrêter</button>`;
        $("#stop").onclick = () => { Q.cancelAll(); SA.toast("Analyse arrêtée."); };
      } else ab.hidden = true;
    }
    $("#tb").onclick = e => { const b = e.target.closest("[data-t]"); if (b) { partiesTab = b.dataset.t; draw(); } };
    $("#ls").onclick = e => {
      const cb = e.target.closest("[data-sel]");
      if (cb) { const id = cb.dataset.sel; cb.checked ? sel.add(id) : sel.delete(id); drawBar(); return; }
      if (e.target.closest(".state")) return;
      const row = e.target.closest(".game"); if (row) location.hash = "#/partie/" + encodeURIComponent(row.dataset.id);
    };
    $("#qs").onclick = e => {
      const b = e.target.closest("[data-q]"); if (!b) return;
      const todo = games.filter(isTodo); let pick = [];
      if (b.dataset.q === "last") pick = todo.slice(0, 10);
      else if (b.dataset.q === "loss") pick = todo.filter(g => SA.outcome(g) === "D" && g.date > Date.now() - 7 * 864e5);
      else if (b.dataset.q === "rand") pick = todo.slice().sort(() => Math.random() - .5).slice(0, 5);
      else { sel.clear(); draw(); return; }
      if (!pick.length) { SA.toast("Aucune partie à analyser ne correspond."); return; }
      sel.clear(); pick.forEach(g => sel.add(g.id)); draw();
    };
    $("#sy").onclick = async () => { $("#sy").firstElementChild.classList.add("spin"); await doSync($("#st")); $("#sy").firstElementChild.classList.remove("spin"); await load(); };
    let lastCur = Q.current, lastLen = Q.ids.length;
    const off = Q.on(() => {
      if (Q.current !== lastCur || Q.ids.length !== lastLen) { lastCur = Q.current; lastLen = Q.ids.length; load(); }
      else { const pb = $("#pb"); if (pb) pb.style.width = Math.round(Q.progress * 100) + "%"; const pc = $("[data-pct]"); if (pc) pc.textContent = Math.round(Q.progress * 100) + " %"; if (!sel.size) drawBar(); }
    });
    await load();
    if (!SA.lastSync || Date.now() - SA.lastSync > 10 * 60e3) { await doSync($("#st")); await load(); }
    else $("#st").textContent = "";
    return off;
  }

  /* ================= Analyse d'une partie ================= */
  async function partie(v, id) {
    let game = await SA.db.get(id);
    if (!game) { v.innerHTML = `<div class="empty"><p>Partie introuvable.</p><a class="btn" href="#/parties">Mes parties</a></div>`; return; }
    let P; try { P = SA.parsePgn(game.pgn); } catch (e) { v.innerHTML = `<div class="empty"><p>${esc(e.message)}</p><a class="btn" href="#/">Accueil</a></div>`; return; }
    const st = { ply: 0, flipped: game.userColor === "b", variant: null };
    const vcache = new Map(); let vtoken = 0;
    const o = SA.outcome(game), opp = opponent(game);
    const title = opp ? `contre ${esc(opp.name)} <span style="color:var(--muted);font-weight:400">(${opp.elo || "?"})</span>` : `${esc(game.white)} – ${esc(game.black)}`;
    v.innerHTML = `
      <div class="topbar"><button type="button" class="icon-btn" id="bk" aria-label="Retour">${IC.back}</button>
        <div class="grow"><div style="font-weight:600;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
        <div class="small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc([SITE[game.source], game.tc, game.opening || "", o ? RES_TXT[o] : game.result && game.result !== "*" ? game.result : ""].filter(Boolean).join(" · "))}</div></div>
        ${game.url ? `<a class="icon-btn" href="${esc(game.url)}" target="_blank" rel="noopener" aria-label="Voir sur le site">${IC.ext}</a>` : ""}</div>
      <div class="pills" id="pl"></div>
      <div class="boardwrap"><div class="evalbar" id="eb"><i></i></div><div id="bd"></div></div>
      <div class="variant" id="vr" hidden></div>
      <div class="comment" id="cm"></div>
      <svg class="graph" id="gr" role="img" aria-label="Courbe d'avantage de la partie"></svg>
      <div class="moves" id="mv"></div>
      <div class="navrow">
        <button type="button" class="btn" id="b0" aria-label="Début">⏮</button><button type="button" class="btn" id="b1" aria-label="Coup précédent">◀</button>
        <button type="button" class="btn" id="b2" aria-label="Coup suivant">▶</button><button type="button" class="btn" id="b3" aria-label="Fin">⏭</button>
        <button type="button" class="btn" id="b4" aria-label="Retourner l'échiquier">${IC.flip}</button></div>
      <p class="small" style="text-align:center">Touche une pièce pour explorer une variante.</p>`;
    const board = new SA.Board($("#bd"));
    $("#bk").onclick = () => back("#/parties");
    const A = () => game.analysis;
    const N = P.moves.length;

    function drawPills() {
      const a = A(); const pl = $("#pl");
      if (!a || !N) { pl.innerHTML = ""; return; }
      if (game.userColor) {
        const me = game.userColor === "w" ? a.accW : a.accB, him = game.userColor === "w" ? a.accB : a.accW;
        pl.innerHTML = `<div class="pill"><span>Toi · ${game.userColor === "w" ? "blancs" : "noirs"}</span><b>${fmtNum(me)}</b></div><div class="pill"><span>Adversaire</span><b>${fmtNum(him)}</b></div>`;
      } else pl.innerHTML = `<div class="pill"><span>Blancs</span><b>${fmtNum(a.accW)}</b></div><div class="pill"><span>Noirs</span><b>${fmtNum(a.accB)}</b></div>`;
    }
    function curEval() {
      if (st.variant) return vcache.get(st.variant.fens[st.variant.i]) || null;
      return A() ? A().evals[st.ply] : null;
    }
    function drawBoard() {
      const a = A();
      if (st.variant) {
        const V = st.variant, fen = V.fens[V.i], e = vcache.get(fen);
        board.render({ fen, flipped: st.flipped, last: V.i > 0 ? V.moves[V.i - 1] : null, arrows: e && e.b ? [{ ...SA.uciObj(e.b), color: "#7fb24a" }] : [], interactive: true, onMove: playMove });
      } else {
        const last = st.ply > 0 ? P.moves[st.ply - 1] : null;
        const c = a && st.ply > 0 ? a.cls[st.ply - 1] : null;
        const arrows = [];
        if (c && !["best", "brilliant", "great", "book"].includes(c.k) && a.evals[st.ply - 1] && a.evals[st.ply - 1].b) arrows.push({ ...SA.uciObj(a.evals[st.ply - 1].b), color: "#7fb24a" });
        board.render({ fen: P.fens[st.ply], flipped: st.flipped, last, badge: c && last ? { sq: last.to, k: c.k } : null, arrows, interactive: true, onMove: playMove });
      }
      const e = curEval(), eb = $("#eb");
      eb.classList.toggle("flip", st.flipped); eb.firstElementChild.style.height = (e ? e.w : 50) + "%";
      eb.setAttribute("aria-label", "Évaluation " + (e ? SA.fmtEval(e) : "inconnue"));
    }
    function pvText(fen, pv) {
      const ms = SA.pvToSan(fen, pv, 8); if (!ms.length) return "";
      let n = +fen.split(" ")[5], w = fen.split(" ")[1] === "w", s = "";
      ms.forEach((m, i) => { if (w) s += n + ". "; else if (i === 0) s += n + "… "; s += SA.fr(m.san) + " "; if (!w) n++; w = !w; });
      return s.trim();
    }
    function drawComment() {
      const cm = $("#cm"), a = A();
      const vr = $("#vr");
      if (st.variant) {
        const V = st.variant, fen = V.fens[V.i], e = vcache.get(fen);
        vr.hidden = false;
        vr.innerHTML = `<span class="grow">Variante · ${V.moves.length} coup${V.moves.length > 1 ? "s" : ""} depuis le coup ${Math.ceil(V.base / 2) || 1}</span><button type="button" class="btn ghost" id="vx" style="min-height:40px">Revenir à la partie</button>`;
        $("#vx").onclick = () => { st.variant = null; drawAll(); };
        cm.innerHTML = e ? `<span class="b ev">${esc(SA.fmtEval(e))}</span><div class="grow"><div class="t">Évaluation : ${esc(SA.fmtEval(e))}</div>${e.b ? `<div class="s">Meilleur coup : <b>${esc(SA.fr(SA.uciToSan(fen, e.b)))}</b></div><div class="pvline">${esc(pvText(fen, e.pv))}</div>` : `<div class="s">${e.t === "mate" ? "Échec et mat." : "Partie nulle."}</div>`}</div>`
          : `<span class="b" style="background:var(--raise)"><span class="ring" style="width:16px;height:16px;border-width:2px"></span></span><div class="grow"><div class="t">Le moteur réfléchit…</div><div class="s">Stockfish évalue cette position.</div></div>`;
        return;
      }
      vr.hidden = true;
      if (!a) {
        const cur = Q.current === game.id, queued = Q.has(game.id);
        cm.innerHTML = cur || queued
          ? `<span class="b" style="background:var(--raise)"><span class="ring" style="width:16px;height:16px;border-width:2px"></span></span><div class="grow"><div class="t">${cur ? `Analyse en cours · <span id="pp">${Math.round(Q.progress * 100)}</span> %` : "En attente d'analyse"}</div><div class="s">Stockfish 19 · profondeur ${SA.settings.depth}. Garde l'appli ouverte.</div></div>`
          : `<div class="grow"><div class="t">${game.error ? "L'analyse a échoué" : "Partie pas encore analysée"}</div><div class="s">${game.error ? esc(game.error) : `Environ ${estimateMin(1)} min à profondeur ${SA.settings.depth}.`}</div><button type="button" class="btn primary" id="go" style="margin-top:10px">Analyser cette partie</button></div>`;
        const go = $("#go"); if (go) go.onclick = () => { Q.add([game.id], true); drawComment(); };
        return;
      }
      if (!N) {
        const e = a.evals[0];
        cm.innerHTML = `<div class="grow"><div class="t">Évaluation : ${esc(SA.fmtEval(e))}</div>${e && e.b ? `<div class="s">Meilleur coup : <b>${esc(SA.fr(SA.uciToSan(P.fens[0], e.b)))}</b></div><div class="pvline">${esc(pvText(P.fens[0], e.pv))}</div>` : ""}</div>`;
        return;
      }
      if (st.ply === 0) {
        cm.innerHTML = `<div class="grow"><div class="t">Position de départ</div><div class="s">${esc(game.opening || a.bookName || "")}${(game.opening || a.bookName) ? ". " : ""}Avance avec ▶ ou touche un coup.</div></div>`;
        return;
      }
      const m = P.moves[st.ply - 1], c = a.cls[st.ply - 1], ev = a.evals[st.ply], evb = a.evals[st.ply - 1];
      const san = SA.fr(m.san);
      if (!c) { cm.innerHTML = `<div class="grow"><div class="t">${esc(san)}</div></div>`; return; }
      let sub = `Évaluation : ${SA.fmtEval(evb)} → ${SA.fmtEval(ev)}`;
      if (!["best", "brilliant", "great", "book"].includes(c.k) && evb && evb.b) { const bs = SA.uciToSan(P.fens[st.ply - 1], evb.b); if (bs) sub = `Le meilleur coup était <b>${esc(SA.fr(bs))}</b>. ` + sub; }
      const line = ev && ev.pv && ev.pv.length ? `<div class="pvline">Suite du moteur : ${esc(pvText(P.fens[st.ply], ev.pv))}</div>` : "";
      cm.innerHTML = `<span class="b" style="background:${SA.CLS[c.k].col}">${SA.CLS[c.k].sym}</span><div class="grow"><div class="t">${esc(SA.CLS[c.k].say(san))}</div><div class="s">${sub}</div>${line}</div>`;
    }
    function drawGraph() {
      const svg = $("#gr"), a = A();
      if (!a || N < 2) { svg.style.display = "none"; return; }
      svg.style.display = "";
      const W = svg.clientWidth || 358, H = 56; svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const X = i => i / N * W, Y = w => (1 - w / 100) * H;
      const pts = a.evals.map((e, i) => e ? `${X(i).toFixed(1)},${Y(e.w).toFixed(1)}` : null).filter(Boolean);
      let s = `<rect width="${W}" height="${H}" fill="var(--graph-bg)"/><polygon fill="var(--graph-fill)" points="0,${H} ${pts.join(" ")} ${X(N).toFixed(1)},${H}"/>`;
      s += `<line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="var(--graph-mid)" stroke-dasharray="3 3"/>`;
      s += `<line x1="${X(st.ply)}" x2="${X(st.ply)}" y1="0" y2="${H}" stroke="var(--accent)" stroke-width="2"/>`;
      a.cls.forEach((c, i) => { if (c && ["brilliant", "great", "mistake", "miss", "blunder"].includes(c.k) && a.evals[i + 1]) s += `<circle cx="${X(i + 1)}" cy="${Y(a.evals[i + 1].w)}" r="4" fill="${SA.CLS[c.k].col}" stroke="var(--graph-bg)" stroke-width="1.5"/>`; });
      svg.innerHTML = s;
    }
    function drawMoves() {
      const a = A(); let h = "";
      const n0 = +P.fens[0].split(" ")[5];
      P.moves.forEach((m, i) => {
        const num = n0 + Math.floor((i + (P.moves[0].color === "b" ? 1 : 0)) / 2);
        if (m.color === "w") h += `<span class="n">${num}.</span>`; else if (i === 0) h += `<span class="n">${num}…</span>`;
        const c = a && a.cls[i];
        const mk = c && ["brilliant", "great", "inaccuracy", "mistake", "miss", "blunder"].includes(c.k) ? `<span class="mk" style="background:${SA.CLS[c.k].col}" title="${SA.CLS[c.k].lab}"></span>` : "";
        h += `<button type="button" data-p="${i + 1}" class="${!st.variant && st.ply === i + 1 ? "on" : ""}">${esc(SA.fr(m.san))}${mk}</button>`;
      });
      const mv = $("#mv"); mv.innerHTML = h || `<span class="small">Position sans coups.</span>`;
      const on = mv.querySelector(".on"); if (on) { const t = on.offsetTop - mv.offsetTop; if (t < mv.scrollTop || t > mv.scrollTop + mv.clientHeight - 30) mv.scrollTop = t - 40; }
    }
    function drawAll() { drawPills(); drawBoard(); drawComment(); drawGraph(); drawMoves(); }
    function go(p) {
      if (st.variant) { const V = st.variant; V.i = Math.max(0, Math.min(V.moves.length, p)); if (V.i === 0) { st.ply = V.base; st.variant = null; } evalVariant(); drawAll(); return; }
      st.ply = Math.max(0, Math.min(N, p)); drawAll();
    }
    const cur = () => st.variant ? st.variant.i : st.ply;
    const end = () => st.variant ? st.variant.moves.length : N;
    function playMove(mv) {
      const fen = st.variant ? st.variant.fens[st.variant.i] : P.fens[st.ply];
      const g = new Chess(fen); const m = g.move(mv); if (!m) return;
      if (!st.variant && st.ply < N && P.moves[st.ply].from === m.from && P.moves[st.ply].to === m.to && (P.moves[st.ply].promotion || "") === (m.promotion || "")) { go(st.ply + 1); return; }
      if (!st.variant) st.variant = { base: st.ply, moves: [], fens: [fen], i: 0 };
      const V = st.variant; V.moves = V.moves.slice(0, V.i); V.fens = V.fens.slice(0, V.i + 1);
      V.moves.push({ from: m.from, to: m.to, san: m.san }); V.fens.push(g.fen()); V.i++;
      evalVariant(); drawAll();
    }
    async function evalVariant() {
      if (!st.variant) return;
      const fen = st.variant.fens[st.variant.i]; if (vcache.has(fen)) return;
      const tok = ++vtoken;
      try { const e = await SA.evalPosition(fen, Math.min(SA.settings.depth, 16), 1); vcache.set(fen, e); } catch (e) { return; }
      if (tok === vtoken && st.variant && st.variant.fens[st.variant.i] === fen) { drawBoard(); drawComment(); }
    }
    $("#b0").onclick = () => go(0); $("#b1").onclick = () => go(cur() - 1); $("#b2").onclick = () => go(cur() + 1); $("#b3").onclick = () => go(end());
    $("#b4").onclick = () => { st.flipped = !st.flipped; drawBoard(); };
    $("#mv").onclick = e => { const b = e.target.closest("[data-p]"); if (b) { st.variant = null; go(+b.dataset.p); } };
    $("#gr").onclick = e => { const r = e.currentTarget.getBoundingClientRect(); st.variant = null; go(Math.round((e.clientX - r.left) / r.width * N)); };
    const key = e => { if (e.target.closest("input,textarea,select")) return; if (e.key === "ArrowLeft") { go(cur() - 1); e.preventDefault(); } else if (e.key === "ArrowRight") { go(cur() + 1); e.preventDefault(); } };
    document.addEventListener("keydown", key);
    const ro = window.ResizeObserver ? new ResizeObserver(() => drawGraph()) : null; if (ro) ro.observe($("#gr"));
    let wasCur = Q.current === game.id;
    const off = Q.on(async () => {
      const isCur = Q.current === game.id;
      if (isCur) { const pp = $("#pp"); if (pp) pp.textContent = Math.round(Q.progress * 100); else if (!A() && !st.variant) drawComment(); }
      if (wasCur && !isCur) { game = await SA.db.get(game.id) || game; drawAll(); }
      wasCur = isCur;
    });
    drawAll();
    return () => { off(); document.removeEventListener("keydown", key); if (ro) ro.disconnect(); };
  }

  /* ================= Analyse libre ================= */
  let libreTab = "pgn";
  async function libre(v) {
    v.innerHTML = `
      <h1>Analyse libre</h1>
      <p class="sub">N'importe quelle partie ou position, sans toucher à tes statistiques.</p>
      <div class="seg" role="tablist" aria-label="Source" id="tb"></div>
      <div id="pn" style="display:flex;flex-direction:column;gap:14px"></div>`;
    const draw = async () => {
      $("#tb").innerHTML = [["pgn", "PGN"], ["fen", "Position FEN"], ["hist", "Historique"]].map(([k, l]) => `<button type="button" role="tab" data-t="${k}" aria-selected="${libreTab === k}">${l}</button>`).join("");
      const pn = $("#pn");
      if (libreTab === "pgn") {
        pn.innerHTML = `
          <div class="field"><label for="pg">Colle le PGN de la partie</label><textarea class="input" id="pg" spellcheck="false" placeholder="[Event &quot;Tournoi du club&quot;]&#10;1. e4 e5 2. Nf3 Nc6 3. Bb5 …"></textarea></div>
          <input type="file" id="fi" accept=".pgn,.txt,application/x-chess-pgn,text/plain" hidden>
          <button type="button" class="btn ghost" id="fb" style="border-style:dashed">${IC.upload}Importer un fichier .pgn</button>
          <label class="check-row" for="ad"><span style="display:flex;flex-direction:column"><b style="font-size:14px">Ajouter à mes parties</b><span class="small">Pour tes parties en club ou en tournoi : elles compteront dans ton bilan.</span></span><input type="checkbox" id="ad"></label>
          <div class="field" id="cw" hidden><label for="co">Tu jouais avec</label><select class="input" id="co"><option value="">Détecter d'après les pseudos</option><option value="w">les blancs</option><option value="b">les noirs</option></select></div>
          <p class="err" id="er" role="alert"></p>
          <button type="button" class="btn primary block" id="go">Analyser</button>`;
        $("#fb").onclick = () => $("#fi").click();
        $("#fi").onchange = async () => { const f = $("#fi").files[0]; if (!f) return; $("#pg").value = await f.text(); const n = SA.splitPgns($("#pg").value).length; SA.toast(n > 1 ? `Fichier de ${n} parties chargé.` : "Fichier chargé."); };
        $("#ad").onchange = () => { $("#cw").hidden = !$("#ad").checked; };
        $("#go").onclick = analyzePgn;
      } else if (libreTab === "fen") {
        pn.innerHTML = `
          <div class="field"><label for="fe">Position au format FEN</label><input class="input mono" id="fe" spellcheck="false" autocapitalize="off" placeholder="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" style="font-size:13px"></div>
          <p class="small">Tu pourras ensuite jouer des coups depuis cette position et voir l'avis du moteur.</p>
          <p class="err" id="er" role="alert"></p>
          <button type="button" class="btn primary block" id="go">Analyser la position</button>`;
        $("#go").onclick = analyzeFen;
      } else {
        const all = (await SA.db.all()).filter(g => g.source === "libre" || (g.source === "pgn")).sort((a, b) => (b.added || b.date) - (a.added || a.date)).slice(0, 30);
        pn.innerHTML = all.length ? `<div>${all.map(g => `<div class="game" data-id="${esc(g.id)}"><span class="who"><span class="opp">${esc(g.white)} – ${esc(g.black)}</span><span class="meta">${esc([SITE[g.source], g.analysis ? "analysée" : "non analysée", SA.fmtDate(g.added || g.date)].join(" · "))}</span></span></div>`).join("")}</div>
          <a class="btn ghost" href="#/parties">Choisir parmi mes parties chess.com et Lichess</a>
          <button type="button" class="btn danger" id="cl">Effacer l'historique d'analyse libre</button>`
          : `<div class="empty"><p>Aucune analyse libre pour l'instant.</p><a class="btn ghost" href="#/parties">Choisir parmi mes parties</a></div>`;
        pn.onclick = e => { const r = e.target.closest(".game"); if (r) location.hash = "#/partie/" + encodeURIComponent(r.dataset.id); };
        const cl = $("#cl"); if (cl) cl.onclick = async () => { const ok = await SA.dialog({ title: "Effacer l'historique ?", body: "Les analyses libres seront supprimées. Les parties ajoutées à « Mes parties » sont conservées.", buttons: [{ label: "Effacer", value: true, danger: true }, { label: "Annuler", value: false }] }); if (ok) { await SA.db.delMany(all.filter(g => g.source === "libre").map(g => g.id)); draw(); } };
      }
    };
    function mkGame(text, p, source, i, color) {
      const h = p.headers, now = Date.now();
      const d = (h.UTCDate || h.Date || "").match(/^(\d{4})\.(\d{2})\.(\d{2})/);
      const pseudos = [SA.settings.cc, SA.settings.li].filter(Boolean).map(x => x.toLowerCase());
      let userColor = color || null;
      if (!userColor) { if (pseudos.includes((h.White || "").toLowerCase())) userColor = "w"; else if (pseudos.includes((h.Black || "").toLowerCase())) userColor = "b"; }
      const tc = (h.TimeControl || "").match(/^(\d+)(?:\+(\d+))?$/);
      return { id: `${source}:${now}-${i}`, source, account: null, speed: null, pgn: text,
        white: h.White && h.White !== "?" ? h.White : "Blancs", black: h.Black && h.Black !== "?" ? h.Black : "Noirs",
        whiteElo: +h.WhiteElo || null, blackElo: +h.BlackElo || null, userColor, result: h.Result || "*",
        date: d ? Date.UTC(+d[1], +d[2] - 1, +d[3]) : now, added: now,
        opening: h.Opening || SA.bookInfo(p.moves).name || "", tc: tc ? `${Math.round(+tc[1] / 60)}+${tc[2] || 0}` : "",
        url: h.Site && /^https?:\/\//.test(h.Site) ? h.Site : "", inList: source === "pgn", inStats: source === "pgn", analysis: null };
    }
    async function analyzePgn() {
      const er = $("#er"); er.textContent = "";
      const texts = SA.splitPgns($("#pg").value);
      if (!texts.length) { er.textContent = "Colle un PGN ou importe un fichier."; return; }
      const ok = [], bad = [];
      texts.forEach((t, i) => { try { const p = SA.parsePgn(t); if (!p.moves.length) throw new Error("aucun coup"); ok.push({ t, p }); } catch (e) { bad.push(`partie ${i + 1} : ${e.message}`); } });
      if (!ok.length) { er.textContent = bad[0] || "PGN illisible."; return; }
      const add = $("#ad").checked, color = $("#co") ? $("#co").value : "";
      const games = (add ? ok : ok.slice(0, 1)).map((x, i) => mkGame(x.t, x.p, add ? "pgn" : "libre", i, color));
      await SA.db.putMany(games);
      Q.add([games[0].id], true);
      if (add) SA.toast(`${games.length} partie${games.length > 1 ? "s" : ""} ajoutée${games.length > 1 ? "s" : ""} à « Mes parties »${bad.length ? ` (${bad.length} illisible${bad.length > 1 ? "s" : ""})` : ""}.`);
      else if (ok.length > 1) SA.toast("Fichier de plusieurs parties : seule la première est analysée. Coche « Ajouter à mes parties » pour toutes les garder.");
      location.hash = "#/partie/" + encodeURIComponent(games[0].id);
    }
    async function analyzeFen() {
      const er = $("#er"); er.textContent = "";
      const fen = $("#fe").value.trim(); const g = new Chess();
      if (!fen || !g.load(fen)) { er.textContent = "Cette position FEN n'est pas valide."; return; }
      const text = `[White "Position"]\n[Black "FEN"]\n[SetUp "1"]\n[FEN "${g.fen()}"]\n\n*`;
      const game = mkGame(text, SA.parsePgn(text), "libre", 0, "");
      await SA.db.put(game); Q.add([game.id], true);
      location.hash = "#/partie/" + encodeURIComponent(game.id);
    }
    $("#tb").onclick = e => { const b = e.target.closest("[data-t]"); if (b) { libreTab = b.dataset.t; draw(); } };
    await draw();
  }

  /* ================= Bilan ================= */
  function openingFamily(name) {
    if (!name) return "";
    let s = name.split(":")[0].trim();
    const m = s.match(/^(.*?\b(Game|Defense|Defence|Opening|Attack|Gambit|System|Partie|Défense|Ouverture|Système|Gambit))\b/i);
    if (m) s = m[1]; else s = s.split(" ").slice(0, 3).join(" ");
    return s;
  }
  async function bilan(v) {
    const sp = SA.settings.speeds.map(k => SA.SPEEDS[k]).join(" · ");
    const games = (await SA.visibleGames()).filter(g => g.source !== "pgn" || g.inStats !== false);
    const mine = games.filter(g => g.userColor);
    const an = mine.filter(g => g.analysis);
    const N = an.length;
    const todo = mine.filter(g => !g.analysis && g.id !== Q.current && !Q.has(g.id));
    const pending = (Q.current ? 1 : 0) + Q.ids.filter(x => x !== Q.current).length;
    const need = N < 20 ? Math.min(20 - N, todo.length) : Math.min(10, todo.length);
    let html = `<div class="topbar"><h1 class="grow">Mon bilan</h1><span class="chip sm" style="display:inline-flex;align-items:center;cursor:default;min-height:30px">${esc(sp || "—")}</span></div>`;
    if (!SA.accounts().length && !games.length) {
      v.innerHTML = html + `<div class="empty"><p>Ton bilan se construit à partir de tes parties. Commence par indiquer tes pseudos.</p><a class="btn primary" href="#/comptes">Indiquer mes pseudos</a></div>`; return;
    }
    html += `<div class="card" style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:15px">Basé sur ${N} partie${N > 1 ? "s" : ""} analysée${N > 1 ? "s" : ""}</b><span class="mono small">${Math.min(N, 20)} / 20</span></div>
      <div class="prog"><i style="width:${Math.min(100, N / 20 * 100)}%"></i></div>
      <p class="sub" style="font-size:13px">${N < 20 ? `Encore ${20 - N} partie${20 - N > 1 ? "s" : ""} avant des conclusions fiables. Pour un bilan juste, complète avec tes parties récentes ou prises au hasard, pas seulement celles que tu as choisies.` : "Assez de parties pour des tendances fiables. Analyser tes nouvelles parties garde le bilan à jour."}</p>
      ${pending ? `<p class="small">${pending} partie${pending > 1 ? "s" : ""} en cours d'analyse. <a href="#/parties">Voir</a></p>` : ""}
      ${need ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn primary" id="rc" style="flex:1.4">Analyser les ${need} récentes</button><button type="button" class="btn ghost" id="rd" style="flex:1">Au hasard</button></div>` : (todo.length ? "" : `<p class="small">Toutes tes parties récupérées sont analysées.</p>`)}
    </div>`;
    if (N) {
      const accs = an.map(userAcc).filter(x => x != null);
      const avgAcc = accs.reduce((a, b) => a + b, 0) / (accs.length || 1);
      let bl = 0, mi = 0; const ph = { open: 0, mid: 0, end: 0 };
      an.forEach(g => { const c = userCnt(g); bl += (c.blunder || 0) + (c.miss || 0); mi += c.mistake || 0; g.analysis.cls.forEach(x => { if (x && x.c === g.userColor && (x.k === "blunder" || x.k === "miss")) ph[x.ph] = (ph[x.ph] || 0) + 1; }); });
      const maxPh = Math.max(1, ph.open, ph.mid, ph.end);
      const res = { V: 0, N: 0, D: 0 }; mine.forEach(g => { const o = SA.outcome(g); if (o) res[o]++; });
      const fam = new Map();
      mine.forEach(g => { const f = openingFamily(g.opening); if (!f) return; const k = f + "|" + g.userColor; const x = fam.get(k) || { name: f, c: g.userColor, n: 0, pts: 0, acc: [], }; x.n++; const o = SA.outcome(g); x.pts += o === "V" ? 1 : o === "N" ? .5 : 0; const a = userAcc(g); if (a != null) x.acc.push(a); fam.set(k, x); });
      const tops = Array.from(fam.values()).sort((a, b) => b.n - a.n).slice(0, 6);
      html += `<div class="section-title"><h2>${N < 20 ? "Aperçu provisoire" : "Tendances"}</h2></div>
        <div class="stats2">
          <div class="stat"><div class="k">Précision moyenne</div><div class="v">${fmtNum(avgAcc)}</div></div>
          <div class="stat"><div class="k">Gaffes par partie</div><div class="v">${fmtNum(bl / N)}</div></div>
          <div class="stat"><div class="k">Erreurs par partie</div><div class="v">${fmtNum(mi / N)}</div></div>
          <div class="stat"><div class="k">Résultats (${mine.length} parties)</div><div class="v" style="font-size:20px;padding-top:6px"><span style="color:var(--win)">${res.V}</span> · ${res.N} · <span style="color:var(--loss)">${res.D}</span></div></div>
        </div>
        <div class="card" style="display:flex;flex-direction:column;gap:10px"><b style="font-size:13px">Où tombent tes gaffes</b>
          <div class="bars">${[["open", "Ouverture"], ["mid", "Milieu de jeu"], ["end", "Finale"]].map(([k, l]) => `<div><span>${l}</span><span class="tr"><i style="width:${ph[k] / maxPh * 100}%"></i></span><span class="c">${ph[k]}</span></div>`).join("")}</div>
          <p class="small">Gaffes et occasions manquées, sur tes coups uniquement.</p></div>`;
      if (tops.length) html += `<div class="card" style="overflow-x:auto"><table class="otable"><thead><tr><th>Ouverture</th><th>Parties</th><th>Score</th><th>Précision</th></tr></thead><tbody>${tops.map(t => `<tr><td title="${esc(t.name)}">${esc(t.name)} <span class="small">(${t.c === "w" ? "blancs" : "noirs"})</span></td><td>${t.n}</td><td>${Math.round(t.pts / t.n * 100)} %</td><td>${t.acc.length ? fmtNum(t.acc.reduce((a, b) => a + b, 0) / t.acc.length) : "—"}</td></tr>`).join("")}</tbody></table></div>`;
    }
    html += `<div class="locked">${IC.lock}<div style="display:flex;flex-direction:column;gap:2px"><b style="font-size:14px;color:var(--ink2)">Tes axes de travail</b><span class="small">Prochaine version : priorités, exercices tirés de tes erreurs, ouvertures à revoir. Ils s'appuieront sur au moins 20 parties analysées.</span></div></div>`;
    v.innerHTML = html;
    const rc = $("#rc"), rd = $("#rd");
    if (rc) rc.onclick = () => { Q.add(todo.slice(0, need).map(g => g.id)); SA.toast(`${need} partie${need > 1 ? "s" : ""} ajoutée${need > 1 ? "s" : ""} à la file d'analyse.`); location.hash = "#/parties"; };
    if (rd) rd.onclick = () => { Q.add(todo.slice().sort(() => Math.random() - .5).slice(0, need).map(g => g.id)); SA.toast(`${need} partie${need > 1 ? "s" : ""} au hasard ajoutée${need > 1 ? "s" : ""} à la file.`); location.hash = "#/parties"; };
  }

  /* ================= Réglages ================= */
  async function reglages(v) {
    const s = SA.settings, hasBat = !!navigator.getBattery;
    v.innerHTML = `
      <div class="topbar"><button type="button" class="icon-btn" id="bk" aria-label="Retour">${IC.back}</button><h1 class="grow">Réglages</h1></div>
      <h2>Comptes</h2>
      <div class="list-group"><div><span>chess.com</span><span class="sub">${esc(s.cc || "—")}</span></div><div><span>Lichess</span><span class="sub">${esc(s.li || "—")}</span></div>
        <a href="#/comptes" style="text-decoration:none;color:var(--accent);font-weight:600">Modifier mes comptes</a></div>
      <h2>Cadences analysées</h2>
      <div class="list-group" id="sp">${Object.entries(SA.SPEEDS).map(([k, l]) => `<label for="s-${k}" style="cursor:pointer"><span>${l}</span><input type="checkbox" id="s-${k}" data-k="${k}" ${s.speeds.includes(k) ? "checked" : ""} style="width:22px;height:22px;accent-color:var(--accent)"></label>`).join("")}</div>
      <h2>Moteur</h2>
      <div class="list-group">
        <label for="dp"><span>Profondeur</span><select id="dp" class="input" style="width:auto;min-height:38px;font-size:14px"><option value="14">14 · rapide</option><option value="16">16 · standard</option><option value="18">18 · précise</option></select></label>
        <label for="ch" style="cursor:pointer"><span style="display:flex;flex-direction:column"><span>Analyser seulement en charge</span><span class="small">${hasBat ? "Ménage la batterie pour les analyses en lot" : "Non pris en charge par ce navigateur"}</span></span><input type="checkbox" id="ch" ${s.chargeOnly ? "checked" : ""} ${hasBat ? "" : "disabled"} style="width:22px;height:22px;accent-color:var(--accent);flex:none"></label>
      </div>
      <h2>Sauvegarde</h2>
      <div style="display:flex;gap:8px"><button type="button" class="btn" id="ex" style="flex:1">Exporter</button><button type="button" class="btn" id="im" style="flex:1">Restaurer</button><input type="file" id="fi" accept=".json,application/json" hidden></div>
      <p class="small">Tes analyses ne sont stockées que sur ce téléphone. Exporte une sauvegarde avant de changer d'appareil ou de vider les données du navigateur.</p>
      <button type="button" class="btn danger" id="rz">Tout effacer</button>
      <h2>À propos</h2>
      <p class="small">Moteur : Stockfish 19 lite (stockfish.js de Nathan Rugg), licence GPLv3 — <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noopener">code source</a>. Pièces : Cburnett (Wikimedia Commons), licence CC BY-SA 3.0. Règles : chess.js (licence BSD). Données : API publiques de chess.com et de Lichess.</p>`;
    $("#bk").onclick = () => back("#/");
    $("#dp").value = String(s.depth);
    $("#dp").onchange = e => { s.depth = +e.target.value; SA.saveSettings(); SA.toast("Profondeur enregistrée. Elle s'applique aux prochaines analyses."); };
    $("#ch").onchange = e => { s.chargeOnly = e.target.checked; SA.saveSettings(); };
    $("#sp").onchange = e => {
      const k = e.target.dataset.k; if (!k) return;
      const next = e.target.checked ? s.speeds.concat(k) : s.speeds.filter(x => x !== k);
      if (!next.length) { e.target.checked = true; SA.toast("Garde au moins une cadence."); return; }
      s.speeds = next; SA.saveSettings(); SA.lastSync = 0;
    };
    $("#ex").onclick = async () => {
      const data = { app: "salle-analyse", v: 1, exported: new Date().toISOString(), settings: s, games: await SA.db.all() };
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `salle-analyse-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      SA.toast(`Sauvegarde exportée : ${data.games.length} parties.`);
    };
    $("#im").onclick = () => $("#fi").click();
    $("#fi").onchange = async () => {
      const f = $("#fi").files[0]; if (!f) return;
      let data; try { data = JSON.parse(await f.text()); } catch (e) { SA.toast("Ce fichier n'est pas une sauvegarde valide."); return; }
      if (data.app !== "salle-analyse" || !Array.isArray(data.games)) { SA.toast("Ce fichier n'est pas une sauvegarde de Salle d'analyse."); return; }
      const ok = await SA.dialog({ title: "Restaurer la sauvegarde ?", body: `${data.games.length} parties seront ajoutées à celles du téléphone, et tes réglages seront remplacés par ceux de la sauvegarde.`, buttons: [{ label: "Restaurer", value: true, primary: true }, { label: "Annuler", value: false }] });
      if (!ok) return;
      await SA.db.putMany(data.games);
      if (data.settings) { Object.assign(s, data.settings); SA.saveSettings(); }
      SA.toast("Sauvegarde restaurée."); route();
    };
    $("#rz").onclick = async () => {
      const ok = await SA.dialog({ title: "Tout effacer ?", body: "Tes pseudos, tes parties et toutes les analyses seront supprimés de ce téléphone. Exporte une sauvegarde avant si tu veux les garder.", buttons: [{ label: "Tout effacer", value: true, danger: true }, { label: "Annuler", value: false }] });
      if (!ok) return;
      Q.cancelAll(); await SA.db.clear(); try { localStorage.clear(); } catch (e) {}
      location.hash = "#/"; location.reload();
    };
  }
})();

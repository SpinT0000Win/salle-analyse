/* Salle d'analyse — échiquier (affichage + coups au toucher pour explorer) */
"use strict";
(function () {
  const PIECES = "assets/pieces.svg";

  function sqXY(sq, flipped) {
    const f = sq.charCodeAt(0) - 97, r = +sq[1];
    return { x: (flipped ? 7 - f : f) + .5, y: (flipped ? r - 1 : 8 - r) + .5 };
  }
  function arrowSvg(from, to, color, flipped) {
    const a = sqXY(from, flipped), b = sqXY(to, flipped);
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux;
    const tip = { x: b.x - ux * .1, y: b.y - uy * .1 }, head = .42, base = { x: tip.x - ux * head, y: tip.y - uy * head }, st = { x: a.x + ux * .18, y: a.y + uy * .18 }, w = .075, hw = .22;
    const P = [[st.x + px * w, st.y + py * w], [base.x + px * w, base.y + py * w], [base.x + px * hw, base.y + py * hw], [tip.x, tip.y], [base.x - px * hw, base.y - py * hw], [base.x - px * w, base.y - py * w], [st.x - px * w, st.y - py * w]];
    return `<polygon points="${P.map(p => p[0].toFixed(3) + "," + p[1].toFixed(3)).join(" ")}" fill="${color}" opacity=".85"/>`;
  }

  /* opts : fen, flipped, last {from,to}, badge {sq,k}, arrows [{from,to,color}], interactive, onMove(move) */
  SA.Board = class {
    constructor(el) {
      this.el = el; this.sel = null; this.opts = {};
      el.classList.add("board");
      el.addEventListener("click", e => this.click(e));
    }
    render(opts) {
      if (opts) { this.opts = opts; if (opts.fen !== this._fen) { this.sel = null; this._fen = opts.fen; } }
      const o = this.opts, g = new Chess(o.fen), bd = g.board();
      const targets = this.sel ? g.moves({ square: this.sel, verbose: true }).map(m => m.to) : [];
      let html = "";
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const f = o.flipped ? 7 - col : col, r = o.flipped ? row + 1 : 8 - row;
        const sq = String.fromCharCode(97 + f) + r, p = bd[8 - r][f];
        const cls = ["sq", (f + r) % 2 === 0 ? "l" : "d"];
        let style = "";
        if (o.last && (sq === o.last.from || sq === o.last.to)) { cls.push("hl"); if (o.badge && o.badge.k) style = ` style="--hlc:${SA.CLS[o.badge.k].col}"`; }
        if (sq === this.sel) cls.push("selsq");
        let inner = "";
        if (col === 0) inner += `<span class="coord rk">${r}</span>`;
        if (row === 7) inner += `<span class="coord fl">${String.fromCharCode(97 + f)}</span>`;
        if (p) inner += `<svg class="pc" viewBox="0 0 40 40" aria-hidden="true"><use href="${PIECES}#${p.color}${p.type}"/></svg>`;
        if (targets.includes(sq)) inner += `<span class="${p ? "cap" : "dot"}"></span>`;
        if (o.badge && o.badge.sq === sq && o.badge.k) inner += `<span class="bsq" style="background:${SA.CLS[o.badge.k].col}">${SA.CLS[o.badge.k].sym}</span>`;
        html += `<div class="${cls.join(" ")}" data-sq="${sq}"${style}>${inner}</div>`;
      }
      const ar = (o.arrows || []).map(a => arrowSvg(a.from, a.to, a.color, o.flipped)).join("");
      html += `<svg class="arrows" viewBox="0 0 8 8" aria-hidden="true">${ar}</svg>`;
      this.el.innerHTML = html;
    }
    click(e) {
      const o = this.opts; if (!o.interactive) return;
      const cell = e.target.closest("[data-sq]"); if (!cell) return;
      const sq = cell.dataset.sq, g = new Chess(o.fen);
      if (this.sel) {
        const mv = g.moves({ square: this.sel, verbose: true }).find(m => m.to === sq);
        if (mv) { const from = this.sel; this.sel = null; o.onMove && o.onMove({ from, to: sq, promotion: mv.flags.includes("p") ? "q" : undefined }); return; }
      }
      const p = g.get(sq);
      this.sel = (p && p.color === g.turn() && sq !== this.sel) ? sq : null;
      this.render();
    }
  };
})();

/* ---------- the end of a game against a character: resign, then a short summary before the full review ----------
   The card counts your best moments with a quick Stockfish pass (depth 12). The full Game review searches deeper, so its
   numbers can differ; the card says so. */
const ENDC = (() => {
  const KINDS = [["brilliant", "Brilliant", "!!"], ["great", "Great", "!"], ["best", "Best", "★"], ["excellent", "Excellent", "✓"], ["good", "Good", "✓"], ["inaccuracy", "Inaccuracy", "?!"], ["mistake", "Mistake", "?"], ["blunder", "Blunder", "??"]];
  let engine = null;
  const cache = new Map();
  const look = (fen) => {
    if (!cache.has(fen)) { engine = engine || mkSf(); cache.set(fen, engine.analyse(fen, { depth: 12, ms: 500, multipv: 2 })); }
    return cache.get(fen);
  };
  /* grade your own moves; me = "w" or "b" */
  async function grade(startFen, H, me, alive) {
    const c = new Chess(); c.load(startFen); const n = {}; KINDS.forEach(([k]) => { n[k] = 0; }); let moves = 0;
    for (const x of H) {
      const before = c.fen(), m = c.move({ from: x.from, to: x.to, promotion: x.promotion }); if (!m) break;
      if (m.color !== me) continue; if (!alive()) return null;
      const a = await look(before); if (!a.length) continue; moves++;
      const win = winOf(a[0]), second = a[1] ? winOf(a[1]) : win, uci = m.from + m.to + (m.promotion || "");
      let after; if (c.game_over()) after = c.in_checkmate() ? 100 : 50; else { const b = await look(c.fen()); after = b.length ? 100 - winOf(b[0]) : win; }
      const best = a[0].pv[0] === uci, loss = best ? 0 : Math.max(0, win - after), off = TALK.offered(before, c.fen(), m);
      const k = off && (VAL_(m.captured) < VAL_(off.piece)) && loss <= 2 && after >= 45 && win < 95 ? "brilliant"
        : best && win - second >= 25 && !m.captured ? "great" : best ? "best" : loss < 2 ? "excellent" : loss < 5 ? "good" : loss < 10 ? "inaccuracy" : loss < 20 ? "mistake" : "blunder";
      n[k]++;
    }
    return { n, moves };
  }
  const VAL_ = (p) => ({ p: 1, n: 3, b: 3, r: 5, q: 9 })[p] || 0;
  /* the three tiles shown: your finest first, and if the game went badly, the worst thing in it */
  function tiles(n) {
    const good = KINDS.slice(0, 5).filter(([k]) => n[k]), bad = KINDS.slice(5).reverse().filter(([k]) => n[k]);
    const pick = [...good.slice(0, bad.length ? 2 : 3), ...bad.slice(0, 1)];
    return (pick.length ? pick : KINDS.slice(2, 5)).slice(0, 3).map(([k, name, mark]) => `<div class="ectile ${k}"><b><i>${mark}</i>${n[k]}</b><small>${name}</small></div>`).join("");
  }
  function card(o) {
    if (st.hideEnd) return "";
    const head = o.won ? "You won!" : o.lost ? "You lost" : "A draw", why = o.why.charAt(0).toUpperCase() + o.why.slice(1), H = live.c.history();
    const coach = endCoach(o.won ? "win" : o.lost ? "loss" : "draw");
    const stats = st.stats ? (st.stats.moves ? tiles(st.stats.n) : "") : H.length ? `<p class="ecwait">Checking your moves…</p>` : "";
    return `<div class="endov ecwrap ${o.won ? "win" : o.lost ? "loss" : "draw"}"><div class="eccard" role="dialog" aria-label="Game over">
      <button type="button" class="ecx" data-ecx aria-label="Close and look at the board">×</button>
      <h3>${o.won ? ic("trophy") : ""}${head}</h3><p class="ecwhy">${esc(why)}</p>${coach || ""}
      <div class="ectiles">${stats}</div>${st.stats && st.stats.moves ? `<p class="ecnote">A quick look at your ${st.stats.moves} moves. The review checks deeper.</p>` : ""}
      ${H.length ? `<button class="btn ecreview" id="aiReview" type="button">★ Game review</button>` : ""}
      <div class="ecrow"><button class="btn ghost" id="aiNew" type="button">New game</button><button class="btn ghost" id="aiAgain" type="button">Rematch</button></div></div></div>`;
  }
  /* what sits under the board */
  function controls() {
    if (!st.over) { const armed = st.resignArm && performance.now() - st.resignArm < 4000; return `<button class="btn ghost ${armed ? "armed" : ""}" data-resign type="button" ${live.c.history().length ? "" : "disabled"}>${ic("flag")}${armed ? "Tap again to resign" : "Resign"}</button>`; }
    return st.hideEnd ? `<button class="btn" id="aiReview" type="button">Game review</button><button class="btn ghost" id="aiAgain" type="button">Rematch</button>` : "";
  }
  function start() {
    if (st.grading || !st.over || !live.c.history().length) return; st.grading = true;
    const me = st, L = live, fen = L.c.header().FEN || new Chess().fen();
    grade(fen, L.c.history({ verbose: true }), L.color, () => st === me && live === L).then((r) => { if (r && st === me && live === L) { me.stats = r; aiPaint(); } }).catch(() => { if (st === me && live === L) { me.stats = { n: {}, moves: 0 }; aiPaint(); } });
  }
  function resign() {
    if (!st || st.game !== "ai" || st.over || !live) return;
    const rec = store.get("ai_rec", { w: 0, d: 0, l: 0 }); rec.l++; store.set("ai_rec", rec);
    st.over = { won: false, lost: true, why: "by resignation" }; st.think = false; live.lock = true; live.sel = null; live.targets = []; live.caps = []; document.getElementById("promo")?.remove(); clearInterval(st.timer);
    try { Snd.end(false); } catch (e) { /* quiet */ } aiPaint();
  }
  document.addEventListener("click", (e) => {
    const q = (s) => e.target.closest && e.target.closest(s);
    if (q("[data-resign]")) { if (st.resignArm && performance.now() - st.resignArm < 4000) return resign(); st.resignArm = performance.now(); const me = st; aiPaint(); setTimeout(() => { if (st === me && !st.over && st.game === "ai") aiPaint(); }, 4100); return; }
    if (q("[data-ecx]")) { st.hideEnd = true; aiPaint(); }
  });
  const s = document.createElement("style"); s.textContent = `
.endov.ecwrap{justify-content:flex-start;padding:8px;gap:0;overflow-y:auto;background:rgba(8,12,10,.55)}
.eccard{position:relative;margin:auto;width:min(100%,360px);display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:14px;background:#26251f;color:#fff;box-shadow:0 22px 60px -18px #000;text-align:center}
.eccard h3{display:flex;align-items:center;justify-content:center;gap:8px;margin:0;font:800 26px/1.1 Fraunces,serif;color:#fff}.eccard h3 .ic{color:var(--gold);width:26px;height:26px}
.eccard .ecwhy{margin:0;color:#c8c6bd;font-weight:700;font-size:13px}.eccard .endcoach{margin:0;display:flex;align-items:center;gap:8px;text-align:left;background:none;padding:0}.eccard .endcoach>span:last-child{flex:1;min-width:0;background:#fff;color:#1d1c18;border-radius:12px;padding:8px 10px;font-size:13px;line-height:1.35}.eccard .endcoach>span:last-child b{display:block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6b665a}
.ecx{position:absolute;top:6px;right:8px;border:0;background:none;color:#c8c6bd;font:700 24px/1 inherit;cursor:pointer;padding:4px 6px}
.ectiles{display:flex;gap:8px;justify-content:center;min-height:52px;align-items:stretch}.ectile{flex:1;min-width:0;border-radius:10px;background:#34332c;padding:7px 4px}.ectile b{display:flex;gap:5px;align-items:center;justify-content:center;font-size:17px}.ectile i{font:800 10px/17px Inter,sans-serif;font-style:normal;width:17px;height:17px;border-radius:50%;background:currentColor}.ectile i{color:#fff;background:var(--k)}.ectile small{display:block;font-weight:700;font-size:12px;color:var(--k)}
.ectile.brilliant{--k:#1baca6}.ectile.great{--k:#5c8bb0}.ectile.best{--k:#81b64c}.ectile.excellent{--k:#96bc4b}.ectile.good{--k:#97af8b}.ectile.inaccuracy{--k:#f0c15c}.ectile.mistake{--k:#e6912c}.ectile.blunder{--k:#e0453f}
.ecwait,.ecnote{margin:0;color:#a9a69c;font-size:12px;align-self:center}
.eccard .ecreview{width:100%;justify-content:center;background:#81b64c!important;color:#fff!important;font-size:18px;padding:12px;border:0;box-shadow:0 4px 0 #5d8537}.ecrow{display:flex;gap:8px}.ecrow .btn{flex:1;justify-content:center}
[data-resign]{display:inline-flex;align-items:center;gap:6px}[data-resign].armed{border-color:var(--bad);color:var(--bad)}[data-resign]:disabled{opacity:.45;cursor:default}
@media (max-width:520px){.eccard{padding:10px;gap:6px}.eccard h3{font-size:20px}.eccard .botbf.sm{width:36px;height:36px}.eccard .endcoach>span:last-child{font-size:12px;padding:6px 8px}.eccard .ecreview{font-size:15px;padding:9px}.ectiles{min-height:44px}.ecnote{display:none}.eccard .endcoach{display:none}}`; document.head.appendChild(s);
  return { card, controls, start, resign, grade, tiles };
})();

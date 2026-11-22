/* Chess extras (injected after the main game code, so LESSONS, GO, live, Sf and the board helpers exist).
   1. More puzzle themes: twelve more lessons from themes the puzzle set already has plenty of.
   2. Endgame trainer: seven textbook endings against full-strength Stockfish. Win the won ones (mate, or queen the pawn and keep
      the queen) or hold the drawn ones, within a move limit. Every starting position was checked with Stockfish: the wins are
      wins and the holds are draws with correct defence.
   3. Guess the famous game: replay a classic from the winner's side. Each move you guess: the real move scores 3, a move
      Stockfish rates about as good scores 1, and the real move is then played either way. */
LESSONS.push(
  { id: "attract", theme: "attraction", ic: "target", name: "Attraction", tag: "Lure a piece onto a fatal square.", intro: "Attraction drags an enemy piece, often the king, onto a square where it gets hit. Usually it starts with a sacrifice. Find the lure." },
  { id: "clear", theme: "clearance", ic: "arrow", name: "Clearance", tag: "Get your own piece out of the way.", intro: "Sometimes your own piece is in the way. Move it with tempo, and the line or square behind it opens up for something stronger." },
  { id: "zwisch", theme: "intermezzo", ic: "bolt", name: "In-between moves", tag: "Don't recapture yet: there's something better first.", intro: "An in-between move, or zwischenzug, is a surprise inserted before the obvious reply. A check or a threat first, then take back." },
  { id: "quiet", theme: "quietMove", ic: "eye", name: "Quiet moves", tag: "No check, no capture, and still winning.", intro: "The hardest moves to see don't check or capture anything. They just quietly set up a threat that can't be stopped." },
  { id: "defend", theme: "defensiveMove", ic: "warn", name: "Defence", tag: "Find the only move that saves you.", intro: "Not every puzzle is an attack. Here something is threatened, and only one move holds. Look at what your opponent wants first." },
  { id: "trap", theme: "trappedPiece", ic: "target", name: "Trapped pieces", tag: "A piece with nowhere to run.", intro: "A piece with no safe squares is as good as lost. Attack it and win it, or spot when one of yours is about to be caught." },
  { id: "zug", theme: "zugzwang", ic: "puzzle", name: "Zugzwang", tag: "Every move makes it worse for them.", intro: "Zugzwang: your opponent would love to pass, but has to move, and every move loses something. Find the move that hands them the turn." },
  { id: "kattack", theme: "kingsideAttack", ic: "swords", name: "King attacks", tag: "Break open the castled king.", intro: "The king has castled and thinks it's safe. Bring the pieces, break the pawn cover, and finish the job." },
  { id: "dcheck", theme: "discoveredCheck", ic: "eye", name: "Discovered checks", tag: "Move one piece, check with another.", intro: "A discovered check is a free move: the king must deal with the check, so the piece that moved can grab anything it likes." },
  { id: "rookeg", theme: "rookEndgame", ic: "puzzle", name: "Rook endgames", tag: "The most common ending of all.", intro: "Rook endings come up more than any other. Active rooks, cut-off kings and passed pawns: find the precise move." },
  { id: "mate3", theme: "mateIn3", ic: "crown", name: "Mate in three", tag: "Three forcing moves to checkmate.", intro: "Mate in three. Checks, captures and threats only. Find the first move and the rest should follow." },
  { id: "advpawn", theme: "advancedPawn", ic: "crown", name: "Advanced pawns", tag: "A pawn one step from glory.", intro: "A pawn deep in enemy territory changes everything. Push it, protect it, or deflect whatever is stopping it." }
);

/* ---------- 2. Endgame trainer ---------- */
const ETS = [
  { id: "kq", name: "Queen mate", fen: "8/8/8/4k3/8/8/8/4K2Q w - - 0 1", goal: "mate", lim: 20, tag: "King and queen against a lone king.", tip: "Use the queen to shrink the king's box a knight's move away, bring your own king up, and never leave it without a move (that's stalemate)." },
  { id: "kr", name: "Rook mate", fen: "8/8/8/4k3/8/8/8/R3K3 w - - 0 1", goal: "mate", lim: 35, tag: "King and rook against a lone king.", tip: "Cut the king off with the rook, walk your king up to face it, then check along the edge. When kings face each other, the rook checks." },
  { id: "kp6", name: "King on the sixth", fen: "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1", goal: "queen", lim: 15, tag: "King in front of the pawn wins.", tip: "With your king on the sixth rank in front of the pawn, this is always a win. Keep the king ahead and push only when it's safe from stalemate." },
  { id: "keysq", name: "Key squares", fen: "4k3/8/8/3K4/3P4/8/8/8 w - - 0 1", goal: "queen", lim: 20, tag: "Only two moves win. Find them.", tip: "Get your king to a key square two ranks in front of the pawn (c6, d6 or e6) before pushing. Push too early and it's a draw." },
  { id: "lucena", name: "Lucena position", fen: "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1", goal: "queen", lim: 25, tag: "The most famous winning rook ending.", tip: "'Build a bridge': bring the rook to the fourth rank, then walk the king out. When the checks come, the rook blocks on the fourth." },
  { id: "phil", name: "Philidor defence", fen: "4k3/7R/8/4PK2/8/8/8/r7 b - - 0 1", goal: "hold", lim: 25, me: "b", tag: "Hold the draw a rook down a pawn.", tip: "Put your rook on the third rank (your sixth from White's side) to keep the king out. When the pawn advances, swing the rook behind it and check from far away." },
  { id: "kpdef", name: "Stop the pawn", fen: "8/8/8/8/4k3/8/4PK2/8 b - - 0 1", goal: "hold", lim: 25, me: "b", tag: "King against king and pawn: take the opposition.", tip: "Stay in front of the pawn and face the white king with one square between you (the opposition). Never step back to a square that lets it past." },
];
function etMenu() {
  clearInterval(st.timer); live = null; st = { game: "egm" }; $("#app").className = "fresh";
  const done = (id) => store.get("eg_" + id, 0);
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="learn">← Learn</button></div><h2 style="font-size:32px">${ic("crown")}Endgame trainer</h2><p class="sub">Seven endings every player should know, against Stockfish at full strength. Win the won ones inside the move limit, or hold the drawn ones. ${ETS.filter((e) => done(e.id)).length} of ${ETS.length} mastered.</p>
    <div class="cpgrid">${ETS.map((e, k) => `<button class="cpcard gpk egcard ${done(e.id) ? "done" : ""}" type="button" data-et="${k}" style="animation-delay:${k * 60}ms"><span class="egmini">${etMini(e.fen)}</span><b class="cpcname">${e.name}</b><span class="fine">${e.tag}</span><span class="cpwinner">${done(e.id) ? ic("trophy") + "Mastered" : (e.goal === "mate" ? "Checkmate" : e.goal === "queen" ? "Queen the pawn" : "Hold the draw") + ` · ${e.lim} moves`}</span></button>`).join("")}</div>`;
  scrollTo({ top: 0, behavior: "instant" });
}
const ET_GLYPH = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
function etMini(fen) { const rows = fen.split(" ")[0].split("/"); let h = ""; rows.forEach((r, y) => { let x = 0; for (const ch of r) { if (/\d/.test(ch)) { for (let i = 0; i < +ch; i++, x++) h += `<i class="${(x + y) % 2 ? "d" : ""}"></i>`; } else { h += `<i class="${(x + y) % 2 ? "d" : ""}"><b class="${ch === ch.toUpperCase() ? "w" : "k"}">${ET_GLYPH[ch]}</b></i>`; x++; } } }); return `<span class="egb">${h}</span>`; }
function etStart(k) {
  clearInterval(st.timer); const E = ETS[k], c = new Chess(E.fen), me = E.me || "w";
  st = { game: "et", k, E, n: 0, msg: E.tip, over: null, think: false, hint: null };
  live = { c, color: me, sel: null, targets: [], last: null, lock: false, refresh: etPaint, onMove: () => { st.n++; st.hint = null; if (etCheck()) return; etReply(); } };
  $("#app").className = "fresh"; etPaint(); if (c.turn() !== me) etReply();
}
function etMaterial(c, color) { const out = {}; c.board().flat().forEach((p) => { if (p && p.color === color) out[p.type] = (out[p.type] || 0) + 1; }); return out; }
function etCheck() {
  const E = st.E, c = live.c, me = live.color, opp = me === "w" ? "b" : "w", mine = etMaterial(c, me), theirs = etMaterial(c, opp);
  let res = null;
  if (c.in_checkmate()) res = c.turn() === opp ? ["win", "Checkmate. That's how it's done."] : ["loss", "You got mated. Try again: the tip above has the plan."];
  else if (c.in_stalemate()) res = ["loss", "Stalemate! The king had no moves and wasn't in check, so it's a draw. Always leave it a square."];
  else if (E.goal === "mate" && (c.insufficient_material() || !mine.q && !mine.r)) res = ["loss", "Without your heavy piece there's no mate left."];
  else if (E.goal === "queen" && !mine.p && !mine.q) res = ["loss", "The pawn is gone, and so is the win."];
  else if (E.goal === "queen" && mine.q && c.turn() === me) res = ["win", "Promoted and the queen is safe. The rest is the queen mate you already know."];
  else if (E.goal === "hold" && theirs.q) res = ["loss", "They got a queen. Try again: keep your king in front, or your rook checking from far."];
  else if (E.goal === "hold" && !mine.r && E.id === "phil") res = ["loss", "You lost the rook. Keep it away from the enemy king."];
  else if (E.goal === "hold" && (c.in_draw() || c.insufficient_material())) res = ["win", "A dead draw. You held it."];
  else if (st.n >= E.lim && c.turn() === me) res = E.goal === "hold" ? ["win", `${E.lim} moves and still standing. That's the draw.`] : ["loss", `Out of moves: ${E.lim} wasn't enough this time. Look at the tip and try a straighter route.`];
  if (!res) return false;
  st.over = { won: res[0] === "win", lost: res[0] === "loss", why: res[1] }; live.lock = true;
  if (st.over.won) { store.set("eg_" + E.id, 1); try { Snd.end(true); } catch (e) { /* quiet */ } } else { try { Snd.end(false); } catch (e) { /* quiet */ } }
  etPaint(); return true;
}
function etReply() {
  const me = st, L = live; L.lock = true; st.think = true; etPaint();
  Sf.analyse(L.c.fen(), { multipv: 1, depth: 16, ms: 700 }).then((l) => {
    if (st !== me || live !== L) return; const m = l.length ? L.c.move(uciMv(l[0].pv[0])) : null; st.think = false; L.lock = false;
    if (m) { L.last = [m.from, m.to]; Snd.move(m, L.c); } if (!etCheck()) etPaint();
  }).catch(() => { if (st !== me) return; st.think = false; st.msg = "Stockfish couldn't load. The trainer needs an internet connection the first time (about 1.5 MB)."; etPaint(); });
}
async function etHint() {
  if (!live || live.lock || st.over) return; const me = st; st.hint = "…"; etPaint();
  try { const l = await Sf.analyse(live.c.fen(), { multipv: 1, depth: 18, ms: 900 }); if (st !== me) return; const c2 = new Chess(live.c.fen()), m = c2.move(uciMv(l[0].pv[0])); st.hint = m ? m.san : null; } catch (e) { st.hint = null; }
  etPaint();
}
function etPaint() {
  const E = st.E, L = live, c = L.c, o = st.over, opp = L.color === "w" ? "b" : "w", left = Math.max(0, E.lim - st.n);
  const bars = { top: pbar("robot", "Stockfish", "Full strength", c, opp, 0), bottom: pbar("user", "You", L.color === "w" ? "White" : "Black", c, L.color, 0) };
  const over = o ? `<div class="endov ${o.won ? "win" : "loss"}">${o.won ? Array.from({ length: 22 }, (_, i) => `<i class="conf" style="left:${(i * 37) % 100}%;background:${["#e8c35a", "#5ee6a8", "#ff8a3d", "#fff"][i % 4]};animation-delay:${(i % 9) * 0.18}s"></i>`).join("") : ""}<h3>${o.won ? (E.goal === "hold" ? "Held!" : "Won!") : "Not this time"}</h3><p class="fine" style="color:#ddd">${esc(o.why)}</p><div class="row" style="justify-content:center"><button class="btn" data-et="${st.k}">${o.won ? "Play it again" : "Try again"}</button><button class="btn ghost" data-go="et">All endings</button></div></div>` : "";
  const goal = E.goal === "mate" ? "Checkmate" : E.goal === "queen" ? "Queen the pawn" : "Hold the draw";
  liveRender(`<div class="crumbs"><button class="btn ghost" data-go="et">← Endings</button></div>` + backRow(E.name, "crown", `${goal} · <b class="num">${left}</b> move${left === 1 ? "" : "s"} left`),
    `<div class="egtip"><b>${ic("bulb")}Plan</b> ${esc(st.msg)}</div><div class="row" style="justify-content:center;margin-top:8px"><span class="fine">${st.think ? "Stockfish is thinking…" : c.in_check() ? "Check!" : o ? "" : "Your move."}</span><button class="btn ghost" id="etHint" type="button" ${st.think || o ? "disabled" : ""}>${st.hint && st.hint !== "…" ? "Try " + esc(st.hint) : st.hint === "…" ? "Thinking…" : "Hint"}</button><button class="btn ghost" data-et="${st.k}" type="button">Restart</button></div>`, bars, { over }); $("#app").classList.add("egmode");
}

/* ---------- 3. Guess the famous game ---------- */
function fgMenu() {
  clearInterval(st.timer); live = null; st = { game: "fgm" }; $("#app").className = "fresh";
  const ks = Object.keys(OPEN_GAMES);
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="learn">← Learn</button></div><h2 style="font-size:32px">${ic("book")}Guess the famous game</h2><p class="sub">Play through a classic from the winner's chair. Guess each move: the real one scores 3, and a move Stockfish rates about as good scores 1. Then the real move is played and the game goes on.</p>
    <div class="cpgrid">${ks.map((k, i) => { const G = OPEN_GAMES[k], b = store.get("fg_" + k, null); return `<button class="cpcard gpk" type="button" data-fg="${k}" style="animation-delay:${i * 60}ms"><span class="gpki">${ic("crown")}</span><b class="cpcname">${esc(G.title)}</b><span class="fine">${esc(G.who)} · ${esc(G.when)}</span>${b ? `<span class="cpwinner">${ic("trophy")}Best ${b.pts} of ${b.max}</span>` : ""}</button>`; }).join("")}</div>`;
  scrollTo({ top: 0, behavior: "instant" });
}
function fgStart(k) {
  const G = OPEN_GAMES[k], full = new Chess(); if (!G || !full.load_pgn(G.pgn)) return; const mv = full.history({ verbose: true });
  const res = (G.pgn.match(/(1-0|0-1|1\/2-1\/2)\s*$/) || [])[1], winner = res === "0-1" ? "b" : res === "1-0" ? "w" : full.in_checkmate() ? (full.turn() === "w" ? "b" : "w") : "w";
  clearInterval(st.timer); const c = new Chess();
  st = { game: "fg", k, G, mv, i: 0, me: winner, pts: 0, max: mv.filter((_, j) => (j % 2 === 0 ? "w" : "b") === winner).length * 3, got: 0, msg: `You're ${winner === "w" ? "White" : "Black"}: ${esc(G.names[winner === "w" ? 0 : 1])}. ${esc(G.note)}`, ok: "", over: null, busy: false, log: [] };
  live = { c, color: winner, sel: null, targets: [], last: null, lock: false, refresh: fgPaint, onMove: (m) => fgGuess(m) };
  $("#app").className = "fresh"; fgPaint(); fgAuto();
}
function fgAuto() {   /* play the other side's real moves until it's your turn */
  const L = live, me = st; if (!L || st.game !== "fg") return;
  if (st.i >= st.mv.length) return fgEnd();
  if (L.c.turn() === st.me) { L.lock = false; return fgPaint(); }
  L.lock = true; setTimeout(() => { if (st !== me || live !== L) return; const r = st.mv[st.i++], m = L.c.move(r.san); L.last = [m.from, m.to]; Snd.move(m, L.c); fgPaint(); fgAuto(); }, 650);
}
async function fgGuess(m) {
  const L = live, me = st, real = st.mv[st.i]; L.lock = true;
  if (m.san === real.san) { st.pts += 3; st.got++; st.ok = "good"; st.msg = `<b>${esc(m.san)}!</b> Exactly what ${esc(st.G.names[st.me === "w" ? 0 : 1])} played. +3`; st.log.push(3); st.i++; fgPaint(); return setTimeout(() => { if (st === me) fgAuto(); }, 500); }
  const fenMine = L.c.fen(); L.c.undo(); const fenBefore = L.c.fen(), r2 = new Chess(fenBefore); r2.move(real.san); st.msg = "Checking your move with Stockfish…"; fgPaint();
  let pts = 0, gap = null; try { const [a, b] = await Promise.all([Sf.analyse(fenMine, { multipv: 1, depth: 12, ms: 500 }), Sf.analyse(r2.fen(), { multipv: 1, depth: 12, ms: 500 })]);
    const val = (l) => (l[0].mate != null ? (l[0].mate > 0 ? 10000 : -10000) : l[0].cp); gap = val(a) - val(b); if (gap <= 40) pts = 1; } catch (e) { /* engine missing: no partial credit */ }
  if (st !== me) return; st.pts += pts; st.log.push(pts); st.ok = pts ? "close" : "bad";
  st.msg = pts ? `${esc(m.san)} is about as good, says Stockfish. +1. The game went <b>${esc(real.san)}</b>.` : `${esc(m.san)} wasn't it${gap != null && gap > 300 ? ", and Stockfish doesn't like it" : ""}. The game went <b>${esc(real.san)}</b>.`;
  const rm = L.c.move(real.san); L.last = [rm.from, rm.to]; Snd.move(rm, L.c); st.i++; fgPaint(); setTimeout(() => { if (st === me) fgAuto(); }, 900);
}
function fgEnd() {
  const prev = store.get("fg_" + st.k, null); if (!prev || st.pts > prev.pts) store.set("fg_" + st.k, { pts: st.pts, max: st.max });
  const pct = st.max ? st.pts / st.max : 0; st.over = { won: pct >= 0.5, why: `${st.got} of ${st.max / 3} moves exactly right · ${st.pts} of ${st.max} points${prev ? ` · your best ${Math.max(prev.pts, st.pts)}` : ""}` }; live.lock = true;
  try { Snd.end(pct >= 0.5); } catch (e) { /* quiet */ } fgPaint();
}
function fgPaint() {
  const L = live, c = L.c, o = st.over, G = st.G, opp = L.color === "w" ? "b" : "w", nm = (s) => G.names[s === "w" ? 0 : 1];
  const bars = { top: pbar("user", esc(nm(opp)), opp === "w" ? "White" : "Black", c, opp, 0), bottom: pbar("user", "You as " + esc(nm(L.color)), L.color === "w" ? "White" : "Black", c, L.color, 0) };
  const dots = st.log.map((p) => `<i class="fgd p${p}"></i>`).join("");
  const over = o ? `<div class="endov ${o.won ? "win" : "draw"}">${o.won ? Array.from({ length: 22 }, (_, i) => `<i class="conf" style="left:${(i * 37) % 100}%;background:${["#e8c35a", "#5ee6a8", "#ff8a3d", "#fff"][i % 4]};animation-delay:${(i % 9) * 0.18}s"></i>`).join("") : ""}<h3>${esc(G.title)}</h3><p class="fine" style="color:#ddd">${esc(o.why)}</p><div class="row" style="justify-content:center"><button class="btn" data-fg="${st.k}">Play it again</button><button class="btn ghost" data-go="famous">Other games</button></div></div>` : "";
  liveRender(`<div class="crumbs"><button class="btn ghost" data-go="famous">← Famous games</button></div>` + backRow(esc(G.title), "book", `<b class="num">${st.pts}</b> of ${st.max} · move ${Math.ceil((st.i + 1) / 2)}`),
    `<div class="egtip fg-${st.ok}">${st.msg}</div><div class="fgdots">${dots}</div><div class="row" style="justify-content:center;margin-top:6px"><span class="fine">${o ? "" : c.turn() === L.color && !L.lock ? "Your guess: what did they play?" : "…"}</span></div>`, bars, { over });
}
GO.et = etMenu; GO.famous = fgMenu;
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-et],[data-fg],#etHint"); if (!t) return;
  if (t.id === "etHint") return etHint();
  e.stopPropagation(); try { Snd.tick(); } catch (x) { /* quiet */ }
  if (t.dataset.et != null) return pageTo(() => { fresh(); etStart(+t.dataset.et); }, $("#app"));
  if (t.dataset.fg != null) return pageTo(() => { fresh(); fgStart(t.dataset.fg); }, $("#app"));
}, true);
(() => { const s = document.createElement("style"); s.textContent = `
.egb{display:grid;grid-template-columns:repeat(8,1fr);width:120px;height:120px;border-radius:10px;overflow:hidden;box-shadow:0 6px 16px -8px #000;margin-bottom:6px}.egb i{background:#efe3c8;position:relative;display:grid;place-items:center}.egb i.d{background:#a5825a}
.egb b{font-size:15px;line-height:1;font-weight:400}.egb b.w{color:#fff;text-shadow:0 0 1px #000,0 0 1px #000}.egb b.k{color:#111}
.egmode .mat .mp{display:none}.egcard.done{box-shadow:0 0 0 2px var(--gold,#e8c35a) inset}
.egtip{margin-top:10px;padding:10px 12px;border-radius:12px;background:var(--surface,#ffffff10);border:1px solid var(--line,#ffffff22);font-size:14px;line-height:1.45}.egtip b{margin-right:4px}.egtip .ic{width:16px;height:16px;vertical-align:-3px}
.egtip.fg-good{border-color:#5ee6a8;background:color-mix(in srgb,#5ee6a8 14%,transparent)}.egtip.fg-close{border-color:#e8c35a;background:color-mix(in srgb,#e8c35a 14%,transparent)}.egtip.fg-bad{border-color:#ff8a8a;background:color-mix(in srgb,#ff8a8a 10%,transparent)}
.fgdots{display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin-top:8px}.fgd{width:10px;height:10px;border-radius:50%;background:#ff8a8a;animation:fgPop .35s cubic-bezier(.2,1.6,.4,1)}.fgd.p1{background:#e8c35a}.fgd.p3{background:#5ee6a8}@keyframes fgPop{from{transform:scale(0)}}`; document.head.appendChild(s); })();

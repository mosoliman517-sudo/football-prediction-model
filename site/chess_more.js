/* Chess: three more ways to train (injected after chess_extras.js and chess_home.js, so GO, live, st, puzzleLoad, liveRender exist).
   1. Puzzle rush: three minutes, as many real puzzles as you can, three strikes and you're out. Puzzles get harder as you solve them
      and a little easier when you miss. Your best is kept, and goes on the leaderboards.
   2. Practise my mistakes: in a game review (your own game from Lichess or chess.com, or any PGN) a button turns each of your
      mistakes and blunders into a puzzle: the position where you went wrong, and the engine's better move to find. The deck is kept
      on this device; a puzzle leaves the deck once you solve it.
   3. Opening repertoire: pick opening lines (from the opening stories) as White or Black and drill them. Each line has a box from 1
      to 5 (spaced repetition): play it without a slip and it moves up and comes back later (1, 3, 7, 14 then 30 days); slip and it drops
      back. A badge says how many lines are due. */

/* ---------- 1. Puzzle rush ---------- */
const RUSH = { ms: 180000 };
const rushFmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
function rushMenu() {
  clearInterval(st.timer); live = null; rvStop(); st = { game: "rushm" }; $("#app").className = "fresh";
  const best = bestOf("rush");
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="games">← Games</button></div><div class="card" style="max-width:640px"><h2>${ic("bolt")}Puzzle rush</h2><p class="sub">Three minutes. Solve as many real puzzles as you can. Three wrong moves and it's over. Puzzles get harder as you solve them.</p>
    <div class="tiles"><div class="tile"><small>Your best</small><b class="num">${best}</b></div><div class="tile"><small>Time</small><b class="num">3:00</b></div><div class="tile"><small>Strikes</small><b class="num">3</b></div></div>
    <div class="row" style="margin-top:14px"><button class="btn" id="rushGo" type="button">Start</button><button class="btn ghost" data-go="board">Leaderboards</button></div></div>`;
}
function rushStart() {
  clearInterval(st.timer); st = { game: "rush", t0: performance.now(), left: RUSH.ms, solved: 0, strikes: 0, target: 900, over: false, seen: new Set(), msg: "" };
  st.timer = setInterval(rushTick, 250); rushNext();
}
function rushNext() {
  if (st.game !== "rush" || st.over) return;
  let pool = PZ.filter((p) => p.moves.length <= 4 && Math.abs(p.rating - st.target) <= 150 && !st.seen.has(p.fen)); if (pool.length < 4) pool = PZ.filter((p) => Math.abs(p.rating - st.target) <= 350 && !st.seen.has(p.fen)); if (!pool.length) pool = PZ;
  const p = rnd(pool); st.seen.add(p.fen); puzzleLoad(p); st.msg = ""; rushPaint();
}
function rushTick() {
  if (st.game !== "rush" || st.over) return clearInterval(st.timer);
  st.left = RUSH.ms - (performance.now() - st.t0); const c = document.getElementById("rushClk"), b = document.getElementById("rushBar");
  if (c) { c.textContent = rushFmt(st.left); c.classList.toggle("low", st.left < 20000); } if (b) b.style.width = Math.max(0, (st.left / RUSH.ms) * 100) + "%";
  if (st.left <= 0) rushEnd("time");
}
function rushPaint() {
  const s = st, pz = s.pz, side = live.c.turn() === "w" ? "White" : "Black";
  liveRender(`<div class="crumbs"><button class="btn ghost" data-go="rush">← Rush</button></div><div class="row" style="justify-content:space-between"><h2>${ic("bolt")}Puzzle rush</h2><span class="num rushclk" id="rushClk">${rushFmt(s.left)}</span></div><div class="rushbar"><i id="rushBar" style="width:${Math.max(0, (s.left / RUSH.ms) * 100)}%"></i></div>`,
    `<div class="row" style="justify-content:space-between;margin-top:8px"><span>Solved <b class="num">${s.solved}</b></span><span class="rushx" aria-label="${3 - s.strikes} strikes left">${[0, 1, 2].map((i) => `<i class="${i < s.strikes ? "on" : ""}"></i>`).join("")}</span></div><p class="sub" style="margin:6px 0 0">${side} to move. ${esc(s.msg || "Find the best move.")}</p>`);
}
function rushEnd(why) {
  if (st.over) return; st.over = true; clearInterval(st.timer); if (live) live.lock = true; const before = bestOf("rush"), n = st.solved; bump("rush", n);
  try { Snd.end(n >= 5); } catch (e) { /* quiet */ }
  liveRender(`<div class="crumbs"><button class="btn ghost" data-go="rush">← Rush</button></div>${backRow("Puzzle rush", "bolt", why === "time" ? "Time's up" : "Three strikes")}`,
    `<div class="tiles" style="margin:10px 0"><div class="tile"><small>Solved</small><b class="num">${n}</b></div><div class="tile"><small>Best</small><b class="num">${Math.max(before, n)}</b></div><div class="tile"><small>Reached</small><b class="num">${st.target}</b></div></div><p class="sub">${n > before ? "A new personal best!" : n === 0 ? "Zero this time. The first few are the easiest, so settle in." : "Your best is " + before + ". One more try?"}</p><div class="row"><button class="btn" id="rushGo" type="button">Play again</button><button class="btn ghost" data-go="board">Leaderboards</button></div>`);
}

/* ---------- 2. Practise my mistakes ---------- */
const MYPZ = { key: "mypz", load() { return store.get(this.key, []); }, save(a) { store.set(this.key, a.slice(-60)); } };
function mypzFromReview() {
  if (typeof rv === "undefined" || !rv || !rv.data) return 0; const me = rv.color || "w", old = MYPZ.load(), seen = new Set(old.map((p) => p.fen)), add = [];
  rv.data.forEach((d, idx) => {
    const i = idx + 1; if (!d || !["mistake", "blunder", "miss"].includes(d.cls) || i < 2) return; if ((i % 2 === 1 ? "w" : "b") !== me) return;
    const a = rv.pos[i - 1], best = a && a.lines && a.lines[0] && a.lines[0].pv[0], prev = rv.mv[i - 2]; if (!best || !prev || !rv.fen[i - 2] || seen.has(rv.fen[i - 2])) return;
    seen.add(rv.fen[i - 2]); add.push({ fen: rv.fen[i - 2], moves: [prev.from + prev.to + (prev.promotion || ""), best], rating: 0, themes: ["mistake"], played: rv.sans ? rv.sans[i - 1] : "", move: Math.ceil(i / 2), cls: d.cls });
  });
  if (add.length) MYPZ.save(old.concat(add)); return add.length;
}
function mypzMenu() {
  clearInterval(st.timer); live = null; rvStop(); st = { game: "mypzm" }; $("#app").className = "fresh"; const n = MYPZ.load().length;
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="games">← Games</button></div><div class="card" style="max-width:640px"><h2>${ic("target")}Practise my mistakes</h2><p class="sub">Your own mistakes and blunders, turned into puzzles: the position where you went wrong, and the move to find instead. Add them from <b>Game review</b>: load a game, let it finish analysing, then press "Turn my mistakes into puzzles".</p>
    <div class="tiles"><div class="tile"><small>Puzzles waiting</small><b class="num">${n}</b></div></div><div class="row" style="margin-top:14px">${n ? '<button class="btn" id="mypzGo" type="button">Start</button><button class="btn ghost" id="mypzClear" type="button">Clear all</button>' : ""}<button class="btn ${n ? "ghost" : ""}" data-go="review">Review a game</button></div></div>`;
}
function mypzStart() {
  const list = shuffle(MYPZ.load()); if (!list.length) return mypzMenu(); clearInterval(st.timer); st = { game: "mypz", list, k: 0, ok: 0, miss: 0, msg: "" }; mypzNext();
}
function mypzNext() { if (st.k >= st.list.length) return mypzDone(); puzzleLoad(st.list[st.k]); st.msg = ""; mypzPaint(); }
function mypzPaint(res) {
  const p = st.list[st.k]; if (!p) return;
  liveRender(`<div class="crumbs"><button class="btn ghost" data-go="mypz">← My mistakes</button></div>${backRow("Practise my mistakes", "target", `Puzzle ${st.k + 1} of ${st.list.length} · ${st.ok} solved`)}`,
    `<p class="sub" style="margin:8px 0 0">In your game, on move ${p.move}, you played <b>${esc(p.played || "a different move")}</b> (a ${esc(p.cls || "mistake")}). ${res ? res : `Find the better move for ${live.c.turn() === "w" ? "White" : "Black"}.`}</p>${res ? `<div class="row" style="margin-top:8px"><button class="btn" id="mypzNext" type="button">${st.k + 1 >= st.list.length ? "Finish" : "Next"}</button></div>` : ""}`);
}
function mypzDone() { liveRender(`<div class="crumbs"><button class="btn ghost" data-go="mypz">← My mistakes</button></div>${backRow("Practise my mistakes", "target", "Done")}`, `<div class="tiles" style="margin:10px 0"><div class="tile"><small>Solved</small><b class="num">${st.ok}</b></div><div class="tile"><small>Still to learn</small><b class="num">${MYPZ.load().length}</b></div></div><p class="sub">${st.ok ? "Solved puzzles leave the deck. " : ""}The rest come back next time.</p><div class="row"><button class="btn" data-go="mypz">Back</button></div>`); }

/* ---------- 3. Opening repertoire ---------- */
const REP = { key: "rep", gaps: [0, 1, 3, 7, 14, 30], load() { return store.get(this.key, []); }, save(a) { store.set(this.key, a); }, due(r) { return !r.due || r.due <= Date.now(); } };
const repSans = (line) => String(line).trim().split(/\s+/).filter(Boolean);
function repMenu(msg) {
  clearInterval(st.timer); live = null; rvStop(); st = { game: "repm" }; $("#app").className = "fresh";
  const lines = REP.load(), due = lines.filter((r) => REP.due(r)), when = (r) => (REP.due(r) ? "due now" : "due in " + Math.max(1, Math.ceil((r.due - Date.now()) / 864e5)) + " day" + (Math.ceil((r.due - Date.now()) / 864e5) > 1 ? "s" : ""));
  const opts = OPEN_STORY.filter((s) => repSans(s.line).length >= 6 && !/Bongcloud/i.test(s.name)).map((s, i) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="learn">← Learn</button></div><div class="card" style="max-width:720px"><h2>${ic("book")}Opening repertoire</h2><p class="sub">Pick opening lines to learn, then drill them. A line you play without a slip moves up a box and comes back later; a slip sends it back. ${esc(msg || "")}</p>
    <div class="row" style="gap:8px;flex-wrap:wrap"><select id="repOpen" aria-label="Opening">${opts}</select><select id="repCol" aria-label="You play"><option value="w">as White</option><option value="b">as Black</option></select><button class="btn" id="repAdd" type="button">Add line</button></div>
    ${lines.length ? `<h3 style="margin-top:16px">Your lines <span class="fine">${due.length} due</span></h3><div class="replist">${lines.map((r, i) => `<div class="reprow ${REP.due(r) ? "due" : ""}"><div><b>${esc(r.name)}</b><small>${r.color === "w" ? "White" : "Black"} · ${repSans(r.line).length} moves</small></div><span class="repbox" title="Box ${r.box} of 5">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= r.box ? "on" : ""}"></i>`).join("")}</span><span class="fine">${when(r)}</span><button class="btn ghost" data-repgo="${i}" type="button">Drill</button><button class="btn ghost" data-repdel="${i}" type="button" aria-label="Remove ${esc(r.name)}">✕</button></div>`).join("")}</div><div class="row" style="margin-top:12px">${due.length ? `<button class="btn" id="repDue" type="button">Drill ${due.length} due</button>` : '<span class="fine">Nothing due. Come back later, or drill any line above.</span>'}</div>` : '<p class="fine" style="margin-top:12px">No lines yet. Add one above to start.</p>'}</div>`;
}
function repStart(i) {
  const r = REP.load()[i]; if (!r) return repMenu(); clearInterval(st.timer);
  const sans = repSans(r.line), c = new Chess(); st = { game: "rep", idx: i, r, sans, ply: 0, slips: 0, tries: 0, msg: "", done: false };
  live = { c, color: r.color, sel: null, targets: [], last: null, lock: true, refresh: repPaint, onMove: (mv) => repMove(mv) }; $("#app").className = "fresh"; repPaint(); repAuto();
}
function repAuto() {
  const L = live, me = st; if (!L || st.game !== "rep" || st.done) return;
  if (st.ply >= st.sans.length) return repFinish();
  if (L.c.turn() === st.r.color) { L.lock = false; return repPaint(); }
  L.lock = true; setTimeout(() => { if (st !== me || live !== L) return; const m = L.c.move(st.sans[st.ply]); if (!m) return; st.ply++; L.last = [m.from, m.to]; Snd.move(m, L.c); repPaint(); repAuto(); }, 600);
}
function repMove(mv) {
  const want = st.sans[st.ply], got = mv.san.replace(/[+#]/g, ""); live.lock = true;
  if (got === want.replace(/[+#]/g, "")) { st.ply++; st.tries = 0; st.msg = ""; repPaint(); return setTimeout(repAuto, 300); }
  live.c.undo(); live.last = null; st.slips++; st.tries++;
  if (st.tries >= 2) { const m = live.c.move(want); st.msg = `The line plays ${want} here.`; st.ply++; st.tries = 0; if (m) { live.last = [m.from, m.to]; Snd.move(m, live.c); } repPaint(); return setTimeout(repAuto, 900); }
  st.msg = "That's not the line. Try again."; live.lock = false; repPaint();
}
function repFinish() {
  st.done = true; live.lock = true; const all = REP.load(), r = all[st.idx]; if (!r) return; const perfect = st.slips === 0;
  r.box = perfect ? Math.min(5, (r.box || 0) + 1) : Math.max(1, (r.box || 1) - 1); r.due = Date.now() + REP.gaps[r.box] * 864e5; r.n = (r.n || 0) + 1; REP.save(all);
  try { Snd.end(perfect); } catch (e) { /* quiet */ }
  const next = all.findIndex((x, k) => k !== st.idx && REP.due(x));
  liveRender(`<div class="crumbs"><button class="btn ghost" data-go="rep">← Repertoire</button></div>${backRow(esc(r.name), "book", r.color === "w" ? "as White" : "as Black")}`, `<p class="sub"><b>${perfect ? "Perfect!" : st.slips + " slip" + (st.slips > 1 ? "s" : "") + "."}</b> ${perfect ? `Box ${r.box} of 5` : "Back to box " + r.box}: it comes back in ${REP.gaps[r.box] || "a few"} day${REP.gaps[r.box] === 1 ? "" : "s"}.</p><div class="row">${next >= 0 ? `<button class="btn" data-repgo="${next}" type="button">Next due line</button>` : ""}<button class="btn ${next >= 0 ? "ghost" : ""}" data-repgo="${st.idx}" type="button">Again</button><button class="btn ghost" data-go="rep">Back</button></div>`);
}
function repPaint() {
  if (st.game !== "rep" || !st.r) return; const r = st.r;
  liveRender(`<div class="crumbs"><button class="btn ghost" data-go="rep">← Repertoire</button></div>${backRow(esc(r.name), "book", `Move ${Math.floor(st.ply / 2) + 1} of ${Math.ceil(st.sans.length / 2)} · ${r.color === "w" ? "White" : "Black"}`)}`,
    `<p class="sub" style="margin:8px 0 0">${st.done ? "" : esc(st.msg || (live.c.turn() === r.color ? "Your move: play the line." : "Opponent is moving…"))}</p><p class="fine">${st.slips ? st.slips + " slip" + (st.slips > 1 ? "s" : "") + " so far" : "No slips yet"}</p>`);
}

/* ---------- wiring ---------- */
GO.rush = rushMenu; GO.mypz = mypzMenu; GO.rep = repMenu;
if (!BOARDS.some((b) => b[0] === "rush")) BOARDS.push(["rush", "Puzzle rush", "puzzles solved"]);
{ const pe = puzzleEnd; puzzleEnd = function (pz) {
    if (st.game === "rush") {
      if (st.over) return; const ok = pz.ok; setTimeout(() => { const b = document.getElementById("bd"); if (b) { b.classList.remove("flashok", "flashbad"); void b.offsetWidth; b.classList.add(ok ? "flashok" : "flashbad"); } }, 30);
      if (ok) { st.solved++; st.target += 70; } else { st.strikes++; st.target = Math.max(600, st.target - 60); }
      live.lock = true; rushPaint(); if (st.strikes >= 3) return void setTimeout(() => rushEnd("strikes"), 900);
      return void setTimeout(() => { if (st.game === "rush" && !st.over) rushNext(); }, ok ? 450 : 1200);
    }
    if (st.game === "mypz") {
      setTimeout(() => { const b = document.getElementById("bd"); if (b) { b.classList.remove("flashok", "flashbad"); void b.offsetWidth; b.classList.add(pz.ok ? "flashok" : "flashbad"); } }, 30);
      const p = st.list[st.k]; if (pz.ok) { st.ok++; MYPZ.save(MYPZ.load().filter((x) => x.fen !== p.fen)); }
      return mypzPaint(pz.ok ? "<b>Solved!</b> That's the move the engine wanted. It leaves your deck." : esc(st.msg || "Not that one."));
    }
    return pe.apply(this, arguments);
  }; }
{ const pp = puzzlePaint; puzzlePaint = function () { if (st.game === "rush") return rushPaint(); if (st.game === "mypz") return mypzPaint(st.pz && st.pz.done ? (st.pz.ok ? "<b>Solved!</b>" : esc(st.msg || "")) : undefined); return pp.apply(this, arguments); }; }
{ const rs = rvSummary; rvSummary = function () { const out = rs.apply(this, arguments); try { const c = rvEl("rvCounts"); if (c && !document.getElementById("mypzBtn")) c.insertAdjacentHTML("afterend", '<div class="row" style="margin-top:8px"><button type="button" class="btn ghost" id="mypzBtn">Turn my mistakes into puzzles</button><span class="fine" id="mypzMsg"></span></div>'); } catch (e) { /* summary not on screen */ } return out; }; }
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("#rushGo,#mypzGo,#mypzNext,#mypzClear,#mypzBtn,#repAdd,#repDue,[data-repgo],[data-repdel]"); if (!t) return;
  e.stopPropagation(); try { Snd.tick(); } catch (x) { /* quiet */ }
  if (t.id === "rushGo") return rushStart();
  if (t.id === "mypzGo") return mypzStart();
  if (t.id === "mypzNext") { st.k++; return mypzNext(); }
  if (t.id === "mypzClear") { MYPZ.save([]); return mypzMenu(); }
  if (t.id === "mypzBtn") { const n = mypzFromReview(), m = document.getElementById("mypzMsg"); if (m) m.innerHTML = n ? `${n} puzzle${n > 1 ? "s" : ""} added. <a href="#" data-go="mypz" onclick="return false">Practise now</a>` : "No new mistakes to add (finish the analysis first, or there are none for your side)."; return; }
  if (t.id === "repAdd") { const name = document.getElementById("repOpen").value, col = document.getElementById("repCol").value, s = OPEN_STORY.find((x) => x.name === name), a = REP.load(); if (!s) return; if (a.some((x) => x.name === name && x.color === col)) return repMenu("That line is already in your repertoire."); a.push({ name, color: col, line: s.line, box: 0, due: 0, n: 0 }); REP.save(a); return repMenu(`Added ${name}.`); }
  if (t.id === "repDue") { const i = REP.load().findIndex((r) => REP.due(r)); return i >= 0 ? repStart(i) : repMenu(); }
  if (t.dataset.repgo != null) return repStart(+t.dataset.repgo);
  if (t.dataset.repdel != null) { const a = REP.load(); a.splice(+t.dataset.repdel, 1); REP.save(a); return repMenu(); }
}, true);
{ const c0 = cggItems; cggItems = function () { const a = c0.apply(this, arguments), nm = REP.load().filter((r) => REP.due(r)).length, my = MYPZ.load().length;
    a.push({ id: "rush", name: "Puzzle rush", tag: "Three minutes, as many puzzles as you can, three strikes and you're out.", ic: "bolt", attr: 'data-go="rush"', t: new Set(["quiz"]) },
      { id: "mypz", name: "Practise my mistakes", tag: my ? `${my} of your own mistakes, turned into puzzles.` : "Turn the mistakes in your own games into puzzles (from Game review).", ic: "target", attr: 'data-go="mypz"', t: new Set(["train"]) },
      { id: "rep", name: "Opening repertoire", tag: nm ? `${nm} line${nm > 1 ? "s" : ""} due to drill.` : "Pick opening lines and drill them with spaced repetition.", ic: "book", attr: 'data-go="rep"', t: new Set(["train"]) });
    return a; }; }
(() => { const s = document.createElement("style"); s.textContent = `
.rushclk{font-size:30px}.rushclk.low{color:#ff6b6b;animation:rushPulse .6s infinite alternate}@keyframes rushPulse{to{opacity:.55}}.rushbar{height:8px;border-radius:99px;background:color-mix(in srgb,var(--ink) 12%,transparent);overflow:hidden;margin:4px 0}.rushbar i{display:block;height:100%;background:linear-gradient(90deg,var(--gold,#c79a3a),#5ee6a8);transition:width .25s linear}
.rushx{display:flex;gap:6px}.rushx i{width:16px;height:16px;border-radius:50%;border:2px solid color-mix(in srgb,var(--ink) 30%,transparent)}.rushx i.on{background:#ff6b6b;border-color:#ff6b6b}
.replist{display:grid;gap:8px;margin-top:8px}.reprow{display:grid;grid-template-columns:1fr auto auto auto auto;gap:10px;align-items:center;padding:10px 12px;border-radius:14px;border:1px solid var(--line);background:var(--panel2)}.reprow.due{border-color:var(--gold,#c79a3a)}.reprow small{display:block;opacity:.7}
.repbox{display:flex;gap:3px}.repbox i{width:8px;height:18px;border-radius:3px;background:color-mix(in srgb,var(--ink) 15%,transparent)}.repbox i.on{background:#5ee6a8}
@media (max-width:640px){.reprow{grid-template-columns:1fr auto auto}.reprow .fine,.repbox{display:none}}`; document.head.appendChild(s); })();

/* ---------- 4. Replay finished online games ----------
   Every online game you finish (a win, a loss, a draw by agreement or on time) is kept on this device (the last 20). "Play a friend"
   lists them, and Replay opens the game in the game review: move by move, graded by the engine, with the opening named. */
const OLH = { key: "olhist", load() { return store.get(this.key, []); }, save(a) { store.set(this.key, a.slice(-20)); } };
{ const oo = olOver; olOver = function (res, why) {
    const was = !!(OG && OG.over), out = oo.apply(this, arguments);
    try { if (!was && OG && OG.over && OG.c.history().length >= 2) { const all = OLH.load(); all.push({ at: Date.now(), names: OG.names, me: OG.me, res, why: String(why || ""), moves: OG.c.history() }); OLH.save(all); } } catch (e) { /* history is a bonus */ }
    return out; }; }
{ const om = olMenu; olMenu = function () {
    const out = om.apply(this, arguments);
    try { const h = OLH.load().slice().reverse(); if (h.length && !document.getElementById("olHist")) document.getElementById("app").insertAdjacentHTML("beforeend", `<div class="card" id="olHist" style="max-width:640px;margin-top:12px"><h3>${ic("clock")}Your finished games</h3><div class="replist">${h.map((g, i) => `<div class="reprow olh"><div><b>${esc(g.names[0])} vs ${esc(g.names[1])}</b><small>${new Date(g.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · ${Math.ceil(g.moves.length / 2)} moves · you ${g.res === "win" ? "won" : g.res === "loss" ? "lost" : "drew"} (${esc(g.why)})</small></div><button class="btn ghost" data-olreplay="${OLH.load().length - 1 - i}" type="button">Replay</button></div>`).join("")}</div></div>`); } catch (e) { /* no history shown */ }
    return out; }; GO.online = olMenu; }   /* GO holds its own reference, so point it at the wrapped menu */
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-olreplay]"); if (!b) return; e.stopPropagation(); const g = OLH.load()[+b.dataset.olreplay]; if (!g) return;
  const white = g.me === "w", result = g.res === "draw" ? "1/2-1/2" : (g.res === "win") === white ? "1-0" : "0-1"; try { Snd.tick(); } catch (x) { /* quiet */ } reviewStart(g.moves, g.me, { from: "online", names: g.names, result }); }, true);

/* ---------- 5. Watch a friend's online game live ----------
   A spectator joins the same room as a third, view-only party: it asks the host for the game so far (names, moves, clocks), then
   applies every move, resignation, draw and flag it hears, with ticking clocks. It never sends a move. The host gets a "Watch link"
   chip while a game is on, and "Play a friend" has a "Watch a game" box for a room code. Like every room, the 4-letter code is the only
   secret. */
const CW = {
  c: null, names: ["White", "Black"], ms: { w: 0, b: 0 }, last: 0, over: null, hostColor: "w", tc: 1, tm: null, n: 0, seen: new Set(),
  link(code) { return `${location.origin}${location.pathname}#watch-${code}`; },
  start(code) {
    rvStop(); clearInterval(st.timer); olClose(); this.stop(true); live = null; st = { game: "watch" }; this.over = null; this.c = null; this.got = false;
    olOpen("watch", code); this.ids = null; OL.welcomed = true; this.id = Math.random().toString(36).slice(2, 8); $("#app").className = "fresh";
    $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="online">← Leave</button></div><div class="card" style="max-width:640px"><h2>${ic("eye")}Watching room ${esc(code)}</h2><p class="sub" id="cwMsg">Looking for the game…</p><p class="fine">View only. You can't move or message.</p></div>`;
    const say = () => { if (OL && OL.role === "watch") olSend({ k: "watchhello", id: this.id }); }; say(); this.hi = setInterval(() => { if (!OL || OL.role !== "watch") return clearInterval(this.hi); if (!this.got) { say(); const m = document.getElementById("cwMsg"), secs = Math.round((Date.now() - OL.since) / 1000); if (m) m.textContent = !olLinked() ? (secs > 12 ? "Could not reach the room server. Check your connection." : "Connecting to the room server…") : secs > 20 ? `Connected, but nobody is hosting ${code}. Check the code, and that the game is still on.` : "Looking for the game…"; } else say(); }, 3000);
  },
  stop(quiet) { clearInterval(this.hi); clearInterval(this.tm); if (!quiet && OL && OL.role === "watch") { olSend({ k: "watchbye", id: this.id }); olClose(); } },
  sync(m) {
    this.got = true; this.names = m.names || this.names; this.hostColor = m.hostColor || "w"; this.tc = m.tc != null ? m.tc : 1; this.c = new Chess(); (m.sans || []).forEach((s) => this.c.move(s)); this.ms = m.ms || { w: OL_TC[this.tc][1] * 1000, b: OL_TC[this.tc][1] * 1000 }; this.last = performance.now(); this.over = null;
    if (m.over) { const hn = this.names[m.me === "w" ? 0 : 1], gn = this.names[m.me === "w" ? 1 : 0], why = String(m.over.why || "").replace(/^You\b/, hn).replace(/^Your (opponent|friend)\b/, gn);   /* the host wrote it as "you": say who */
      this.finish(m.over.res === "win" ? m.me : m.over.res === "loss" ? (m.me === "w" ? "b" : "w") : null, why); } else if (this.c.game_over()) this.endCheck();
    live = { c: this.c, color: "w", sel: null, targets: [], caps: [], last: null, lock: true, refresh: () => CW.paint(), onMove() {} }; st = { game: "watch" }; clearInterval(this.tm); this.tm = setInterval(() => CW.tick(), 200); this.paint();
  },
  who(role) { return role === "host" ? this.hostColor : this.hostColor === "w" ? "b" : "w"; },
  finish(winner, why) { if (this.over) return; this.over = { winner, why }; clearInterval(this.tm); try { Snd.end(true); } catch (e) { /* quiet */ } this.paint(); },
  endCheck() { const c = this.c; if (!c.game_over()) return; if (c.in_checkmate()) this.finish(c.turn() === "w" ? "b" : "w", "Checkmate"); else this.finish(null, c.in_stalemate() ? "Stalemate" : c.insufficient_material() ? "Insufficient material" : c.in_threefold_repetition() ? "Repetition" : "The 50-move rule"); },
  recv(m) {
    if (!m || m.from === "watch") return; if (m.i) { if (this.seen.has(m.i)) return; this.seen.add(m.i); if (this.seen.size > 300) this.seen = new Set([...this.seen].slice(-100)); }
    if (m.k === "watchsync") { this.ids = m.ids || null; return this.sync(m); }
    if (this.ids && m.pid && m.pid !== this.ids[m.from]) return;   /* not one of the two seated players */
    if (!this.got || !this.c) return;
    if (m.k === "move") { if (m.ply !== this.c.history().length + 1) return; const mv = this.c.move({ from: m.a, to: m.b, promotion: m.promo || "q" }); if (!mv) return; if (m.ms != null) this.ms[mv.color] = m.ms; this.last = performance.now(); live.last = [mv.from, mv.to]; try { Snd.move(mv, this.c); } catch (e) { /* quiet */ } this.paint(); this.endCheck(); }
    else if (m.k === "resign") this.finish(this.who(m.from) === "w" ? "b" : "w", "Resignation");
    else if (m.k === "flag") this.finish(this.who(m.from) === "w" ? "b" : "w", "Ran out of time");
    else if (m.k === "leave") this.finish(this.who(m.from) === "w" ? "b" : "w", "The other player left");
    else if (m.k === "drawyes") this.finish(null, "Draw agreed");
  },
  tick() {
    if (!this.c || this.over || this.c.history().length < 2) return; const now = performance.now(), dt = now - this.last; this.last = now; const t = this.c.turn(); this.ms[t] = Math.max(0, this.ms[t] - dt);
    document.querySelectorAll("[data-clk-side]").forEach((el) => { const v = this.ms[el.dataset.clkSide]; el.textContent = fmtClk(Math.max(0, v)); el.classList.toggle("low", v < 20000); });
  },
  paint() {
    if (st.game !== "watch" || !this.c || !live) return; const c = this.c, o = this.over, nm = (s) => esc(this.names[s === "w" ? 0 : 1]);
    const bars = { top: pbar("user", nm("b"), "Black", c, "b", Math.max(1, this.ms.b)), bottom: pbar("user", nm("w"), "White", c, "w", Math.max(1, this.ms.w)) };
    const over = o ? `<div class="endov ${o.winner ? "win" : "draw"}"><h3>${o.winner ? esc(this.names[o.winner === "w" ? 0 : 1]) + " wins" : "A draw"}</h3><p class="fine" style="color:#ddd">${esc(o.why)}</p><div class="row" style="justify-content:center"><button class="btn" data-go="online">Leave</button></div></div>` : "";
    liveRender(`<div class="crumbs"><button class="btn ghost" data-go="online">← Leave</button></div><div class="row" style="justify-content:space-between"><h2>${ic("eye")}Watching live</h2><span class="fine">Room ${OL ? OL.code : ""} · ${OL_TC[this.tc][0]} · view only</span></div>`, `<div class="row" style="justify-content:center;margin-top:8px"><span class="fine">${o ? "" : c.in_check() ? "Check!" : (c.turn() === "w" ? nm("w") : nm("b")) + " to move"}</span></div>`, bars, { over });
  },
  /* host side */
  syncMsg() { const g = OG; return { k: "watchsync", ids: { host: olPid(), guest: OL.guestId }, names: g.names, hostColor: OL.hostColor, tc: g.tc, sans: g.c.history(), ms: g.ms, me: g.me, over: g.over }; },
  hostHello(m) { this.w = this.w || new Map(); this.w.set(m.id || "w", Date.now()); if (OG) olSend(this.syncMsg()); else olSend({ k: "waiting" }); this.chip(); },
  count() { const now = Date.now(); (this.w || new Map()).forEach((t, k) => { if (now - t > 70000) this.w.delete(k); }); return this.w ? this.w.size : 0; },
  chip() {
    const show = OL && OL.role === "host" && OG && !OG.over; let c = document.getElementById("cwChip"); if (!show) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement("div"); c.id = "cwChip"; c.className = "cwchip"; document.body.appendChild(c); }
    const n = this.count(); c.innerHTML = `<button type="button" class="btn ghost" id="cwCopy">${n ? "👁 " + n + " watching" : "Watch link"}</button><small>Anyone with the room code can watch</small>`;
  },
};
{ const or = olRecv; olRecv = function (m) {
    if (OL && OL.role === "watch") return CW.recv(m);
    if (OL && OL.role === "host" && m && (m.k === "watchhello" || m.k === "watchbye")) { if (m.i) { if (OL.seen.has(m.i)) return; OL.seen.add(m.i); } if (m.k === "watchbye") { if (CW.w) CW.w.delete(m.id || "w"); return CW.chip(); } return CW.hostHello(m); }
    return or.apply(this, arguments); }; }
{ const ob = olBegin; olBegin = function () { const r = ob.apply(this, arguments); try { if (OL && OL.role === "host" && CW.count()) olSend(CW.syncMsg()); } catch (e) { /* no watchers */ } return r; }; }
setInterval(() => { try { CW.chip(); } catch (e) { /* quiet */ } }, 1500);
GO.watch = () => { olMenu(); };
{ const om2 = olMenu; olMenu = function () { const out = om2.apply(this, arguments); try { if (!document.getElementById("cwBox")) document.getElementById("app").insertAdjacentHTML("beforeend", `<div class="card" id="cwBox" style="max-width:640px;margin-top:12px"><h3>${ic("eye")}Watch a game</h3><p class="fine">A friend is playing online? Type their room code to watch live, view only. Or open the watch link they send you.</p><div class="row"><input id="cwCode" maxlength="4" placeholder="Room code" autocapitalize="characters" aria-label="Room code to watch" style="text-transform:uppercase;width:150px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;color:var(--ink);padding:11px 12px;font:700 18px Inter;letter-spacing:.2em"><button class="btn ghost" id="cwGo" type="button">Watch</button></div></div>`); } catch (e) { /* no box */ } return out; }; GO.online = olMenu; }
document.addEventListener("click", (e) => {
  const g = e.target.closest && e.target.closest("#cwGo,#cwCopy"); if (!g) return; e.stopPropagation();
  if (g.id === "cwGo") { const v = (document.getElementById("cwCode").value || "").trim().toUpperCase(); if (!/^[A-Z]{4}$/.test(v)) { return; } return CW.start(v); }
  if (g.id === "cwCopy" && OL) { const url = CW.link(OL.code); (async () => { try { if (navigator.share) { await navigator.share({ title: "ballknowledge chess", text: "Watch my chess game live:", url }); return; } } catch (x) { return; } try { await navigator.clipboard.writeText(url); } catch (x) { prompt("Copy this link:", url); } })(); }
}, true);
const cwDeep = () => { const m = /^#watch-([A-Za-z]{4})$/.exec(location.hash); if (!m) return; const code = m[1].toUpperCase(); history.replaceState(null, "", location.pathname); CW.start(code); };
setTimeout(cwDeep, 900); addEventListener("hashchange", cwDeep);
(() => { const s = document.createElement("style"); s.textContent = `.cwchip{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:9000;display:flex;flex-direction:column;gap:2px;padding:6px 8px;border-radius:14px;background:#141b17ee;border:1px solid #ffffff2a;color:#f4f1ea}.cwchip small{font-size:10px;opacity:.65}.cwchip .btn{padding:6px 12px}`; document.head.appendChild(s); })();

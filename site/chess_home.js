/* The chess front page, given the same rich treatment as football's (injected after the main code, with chess_extras.js).
   - Hero: the title and two quick buttons on one side; on the other a real board replaying a famous game on a loop
     (pieces slide, captures fade, the last move glows), with the game's name and year underneath.
   - Today: the three daily challenges with done ticks and your streak, plus the weekly cup.
   - Your coaches: Pip, Bishop Bea and Queen Vera, each with a face, a line of their own and a Play button.
   - New: the endgame trainer, Guess the famous game and the lessons.
   - Then the stats and the sections, as before. */
const HB = { timer: null, game: null, i: 0, els: {} };
function heroBoard() { let sq = ""; for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) sq += `<i class="${(r + f) % 2 ? "d" : "l"}" data-hs="${"abcdefgh"[f]}${8 - r}"></i>`; return `<div class="hbw"><div class="hbb" id="heroBoard">${sq}<div class="hbp" id="hbPieces"></div></div><div class="hbcap" id="hbCap"></div></div>`; }
const heroXY = (s) => ({ x: "abcdefgh".indexOf(s[0]) * 12.5, y: (8 - +s[1]) * 12.5 });
function heroPlace(el, s) { const p = heroXY(s); el.style.left = p.x + "%"; el.style.top = p.y + "%"; }
function heroSetup() {
  const box = document.getElementById("hbPieces"); if (!box) return; box.innerHTML = ""; HB.els = {};
  const c = new Chess(); c.board().forEach((row, r) => row.forEach((p, f) => { if (!p) return; const s = "abcdefgh"[f] + (8 - r), el = document.createElement("b"); el.className = `pc pc-${p.color}${p.type}`; heroPlace(el, s); box.appendChild(el); HB.els[s] = el; }));
}
function heroNext() {
  const ks = Object.keys(OPEN_GAMES); const k = ks[Math.floor(Math.random() * ks.length)], G = OPEN_GAMES[k], c = new Chess(); if (!c.load_pgn(G.pgn)) return;
  HB.game = { k, G, mv: c.history({ verbose: true }) }; HB.i = 0; heroSetup();
  const cap = document.getElementById("hbCap"); if (cap) cap.innerHTML = `<b>${esc(G.title)}</b><span>${esc(G.when)} · <button type="button" class="hblink" data-fg="${k}">Guess every move</button></span>`;
  document.querySelectorAll("#heroBoard i.hl").forEach((x) => x.classList.remove("hl"));
}
function heroStep() {
  if (!document.getElementById("heroBoard")) { clearInterval(HB.timer); HB.timer = null; return; }
  if (!HB.game || HB.i >= HB.game.mv.length) { if (HB.game && HB.i >= HB.game.mv.length && !HB.pause) { HB.pause = 1; return; } HB.pause = 0; return heroNext(); }
  const m = HB.game.mv[HB.i++], E = HB.els, kill = (s) => { const x = E[s]; if (x) { x.classList.add("gone"); setTimeout(() => x.remove(), 400); delete E[s]; } };
  if (m.flags.includes("e")) kill(m.to[0] + m.from[1]); else if (m.captured) kill(m.to);
  const el = E[m.from]; if (el) { delete E[m.from]; E[m.to] = el; heroPlace(el, m.to); if (m.promotion) setTimeout(() => { el.className = `pc pc-${m.color}${m.promotion}`; }, 300); }
  if (m.flags.includes("k") || m.flags.includes("q")) { const r = m.color === "w" ? "1" : "8", [rf, rt] = m.flags.includes("k") ? ["h" + r, "f" + r] : ["a" + r, "d" + r], re = E[rf]; if (re) { delete E[rf]; E[rt] = re; heroPlace(re, rt); } }
  document.querySelectorAll("#heroBoard i.hl").forEach((x) => x.classList.remove("hl")); [m.from, m.to].forEach((s) => { const q = document.querySelector(`#heroBoard [data-hs="${s}"]`); if (q) q.classList.add("hl"); });
}
function home() {
  try { CH.v = "home"; cpClose(); RKS.prof = null; } catch (e) { /* not set up yet */ }
  rvStop(); olClose(); clearInterval(st.timer); live = null; st = {}; clearInterval(HB.timer);
  const key = todayK(), d = dGet(key), streak = dStreak(), wk = wkMine(), mastered = (typeof ETS !== "undefined" ? ETS : []).filter((e) => store.get("eg_" + e.id, 0)).length;
  const coach = (id, lv, mood) => { const C = COACHES[id], L = (COACH_LINES[id] || {}), pool = L.start || [], line = pool.length ? pool[Math.floor(Math.random() * pool.length)] : C.blurb; return `<div class="chc c-${id}"><span class="chface">${oppFace(id, mood)}</span><div class="chtxt"><b>${esc(C.name)}</b><small>${esc(C.blurb)}</small><q>${esc(line)}</q></div><button class="btn" type="button" data-hlv="${lv}">Play ${esc(C.name.split(" ").pop())}</button></div>`; };
  $("#app").innerHTML = `<div class="hero hero2"><div class="wall" aria-hidden="true">${wallHTML()}</div>
    <div class="h2l"><div class="sec" style="margin-top:0">${ic("crown")}Chess, predicted and played</div><h1>ball<em>knowledge</em></h1><p class="sub" style="font-size:17px;max-width:520px">Out-call a model on real games, guess a grandmaster's next move, solve puzzles and test your level. Everything comes from real data; nothing is made up.</p>
      <div class="row h2cta"><button class="btn" type="button" data-go="dp">${ic("bolt")}Today's puzzle</button><button class="btn ghost" type="button" data-go="ai">${ic("robot")}Play a character</button></div></div>
    <div class="h2r">${heroBoard()}</div></div>
    <div class="statstrip" id="statstrip"><div><b class="cu" data-to="${PZ.length}">${PZ.length}</b><span>real puzzles</span></div><div><b class="cu" data-to="${EM.length}">${EM.length}</b><span>top-level games</span></div><div><b class="cu" data-to="${PLAYERS.length}">${PLAYERS.length}</b><span>players profiled</span></div><div><b class="cu" data-to="${Math.round(S.acc * 1000) / 10}" data-dec="1" data-suf="%">${pct(S.acc, 1)}</b><span>model accuracy</span></div></div>
    <div class="hsec"><h2>${ic("clock")}Today</h2>${streak ? `<span class="hflame">🔥 ${streak}-day streak</span>` : ""}</div>
    <div class="htoday">${DAILIES.map(([k, n, icn, tag, go, fmt], i) => { const v = d[k]; return `<button class="ht ${v != null ? "done" : ""}" type="button" data-go="${go}" style="--d:${i * 80}ms"><span class="hti">${ic(icn)}</span><b>${n}</b><small>${v != null ? esc(fmt(v)) : esc(tag)}</small><span class="htk">${v != null ? "✓" : "Play"}</span></button>`; }).join("")}
      <button class="ht wk ${wk ? "done" : ""}" type="button" data-go="wk" style="--d:240ms"><span class="hti">${ic("trophy")}</span><b>Weekly cup</b><small>${wk ? `Your score: ${wk.score}` : "Five puzzles, one attempt, same for everyone."}</small><span class="htk">${wk ? "✓" : "Play"}</span></button></div>
    <div class="hsec"><h2>${ic("robot")}Your coaches</h2><span class="fine">Pick who sits across the board</span></div>
    <div class="hcoach">${coach("pip", 1, "happy")}${coach("bea", 4, "calm")}${coach("vera", 8, "calm")}</div>
    <div class="hsec"><h2>${ic("swords")}Opponents</h2><button class="btn ghost" type="button" data-go="ai">All eight</button></div>
    <div class="hbots">${typeof BOTS !== "undefined" ? BOTS.map((b, i) => `<button class="hbot" type="button" data-hlv="${i + 1}" title="${esc(b.tag)}"><span class="hbf">${b.id === "council" ? oppFace("vera", "happy") : oppFace(b.id, "calm")}</span><b>${esc(b.name.replace("Mikel ", ""))}</b><small class="num">${BOT_ELO[b.id]}</small></button>`).join("") : ""}</div>
    <div class="hsec"><h2>${ic("bolt")}New</h2></div>
    <div class="hnew"><button class="hn" type="button" data-go="et"><span class="hnb">${typeof etMini === "function" ? etMini("1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1") : ""}</span><div><b>Endgame trainer</b><small>Seven endings every player should know, against full-strength Stockfish.${mastered ? ` ${mastered} mastered.` : ""}</small></div></button>
      <button class="hn" type="button" data-go="famous"><span class="hnb">${typeof etMini === "function" ? etMini("r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4") : ""}</span><div><b>Guess the famous game</b><small>The Opera Game, the Immortal, Fischer's Game of the Century: guess every move.</small></div></button>
      <button class="hn" type="button" data-go="learn"><span class="hnb hnic">${ic("book")}</span><div><b>${LESSONS.length} lessons</b><small>Forks, pins, zugzwang, in-between moves and more, each a short set of real puzzles.</small></div></button></div>
    <div class="hsec"><h2>${ic("compass")}Explore</h2></div>
    <div class="doors"><button class="door" data-go="games"><div class="di">${ic("puzzle")}</div><div class="dname">Games</div><div class="dtag">The originals, Beat the model and the daily challenges, all in one place.</div></button><button class="door" data-go="learn"><div class="di">${ic("book")}</div><div class="dname">Learn</div><div class="dtag">An opening explorer with master games and fun facts, lessons, endgames and famous games.</div></button><button class="door" data-go="review"><div class="di">${ic("eye")}</div><div class="dname">Game review</div><div class="dtag">Your own games from Lichess or chess.com, or any PGN, graded move by move by Stockfish 17 with your coach.</div></button><button class="door" data-go="model"><div class="di">${ic("chart")}</div><div class="dname">Our model</div><div class="dtag">How it works, how good it really is, and a lookup for any player or tournament.</div></button>${(RK.lists.open || []).length ? `<button class="door" data-go="rank"><div class="di">${ic("chart")}</div><div class="dname">World rankings</div><div class="dtag">The FIDE top 100, men and women, classical, rapid and blitz. Tap anyone for their profile.</div></button>` : ""}<button class="door" data-go="champ"><div class="di">${ic("crown")}</div><div class="dname">Championships</div><div class="dtag">The World Championship match, women's titles and the reigning champions.</div></button><button class="door" data-go="board"><div class="di">${ic("trophy")}</div><div class="dname">Leaderboards</div><div class="dtag">Best scores from signed-in players, for every game.</div></button></div>`;
  cuRun($("#app")); heroNext(); HB.pause = 0;
  if (!(typeof REDUCED !== "undefined" && REDUCED)) HB.timer = setInterval(heroStep, 1300);
  document.querySelectorAll(".door").forEach((b) => { b.addEventListener("pointermove", (e) => { const r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; b.style.transform = `perspective(700px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateY(-2px)`; b.style.setProperty("--mx", (x + 0.5) * 100 + "%"); b.style.setProperty("--my", (y + 0.5) * 100 + "%"); }); b.addEventListener("pointerleave", () => { b.style.transform = ""; }); });
}
GO.home = home;
document.addEventListener("click", (e) => { const t = e.target.closest && e.target.closest("[data-hlv]"); if (!t) return; e.stopPropagation(); try { Snd.tick(); } catch (x) { /* quiet */ } store.set("ai_level", +t.dataset.hlv); pageTo(() => { fresh(); aiStart(+t.dataset.hlv); }, $("#app")); }, true);
(() => { const s = document.createElement("style"); s.textContent = `
.hero2{display:grid;grid-template-columns:1.25fr 1fr;gap:22px;align-items:center}.h2cta{margin-top:14px;gap:8px}.h2cta .ic{width:18px;height:18px;margin-right:6px;vertical-align:-3px}
.hbw{display:flex;flex-direction:column;align-items:center;gap:8px}.hbb{position:relative;display:grid;grid-template-columns:repeat(8,1fr);width:min(100%,340px);aspect-ratio:1;border-radius:14px;overflow:hidden;box-shadow:0 24px 50px -22px #000,0 0 0 6px color-mix(in srgb,var(--panel2) 80%,transparent);transform:perspective(900px) rotateX(8deg) rotateY(-8deg);transition:transform .6s}
.hbb:hover{transform:none}.hbb i{display:block}.hbb i.l{background:var(--sq-l,#efe3c8)}.hbb i.d{background:var(--sq-d,#a5825a)}.hbb i.hl{box-shadow:inset 0 0 0 100px color-mix(in srgb,#f5d24a 45%,transparent)}
.hbp{position:absolute;inset:0;pointer-events:none}.hbp .pc{position:absolute;width:12.5%;height:12.5%;background-size:88%;background-position:center;background-repeat:no-repeat;transition:left .55s cubic-bezier(.3,1.2,.5,1),top .55s cubic-bezier(.3,1.2,.5,1),opacity .35s,transform .35s;filter:drop-shadow(0 3px 2px #0005)}.hbp .pc.gone{opacity:0;transform:scale(.4)}
.hbcap{text-align:center;font-size:13px;line-height:1.4}.hbcap b{display:block;font-family:var(--serif,Georgia);font-size:17px}.hblink{background:none;border:0;padding:0;font:inherit;color:var(--gold,#c79a3a);text-decoration:underline;cursor:pointer}
.hsec{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:26px 0 10px}.hsec h2{margin:0;font-size:26px}.hsec h2 .ic{width:22px;height:22px;margin-right:8px;vertical-align:-3px}.hflame{font-weight:700;padding:4px 12px;border-radius:999px;background:linear-gradient(90deg,#ff8a3d33,#ffd23f33);border:1px solid #ff8a3d66}
.htoday{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.ht{position:relative;text-align:left;font:inherit;color:inherit;cursor:pointer;display:flex;flex-direction:column;gap:4px;padding:14px;border-radius:18px;border:1px solid var(--line);background:linear-gradient(160deg,var(--panel2),var(--panel));animation:fadein .4s both;animation-delay:var(--d);transition:transform .2s}
.ht:hover{transform:translateY(-3px)}.hti{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--gold,#c79a3a) 22%,transparent)}.hti .ic{width:20px;height:20px}.ht b{font-size:16px}.ht small{opacity:.75;font-size:12.5px;line-height:1.35}
.htk{position:absolute;top:12px;right:12px;font:700 12px var(--mono,monospace);padding:3px 9px;border-radius:999px;background:var(--gold,#c79a3a);color:#111}.ht.done{border-color:#5ee6a8aa}.ht.done .htk{background:#5ee6a8}
.hcoach{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.chc{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:16px;border-radius:20px;border:1px solid var(--line);background:radial-gradient(120% 80% at 50% 0%,var(--chtint) 0%,transparent 60%),linear-gradient(180deg,var(--panel2),var(--panel))}
.chc.c-pip{--chtint:#f2c14e44}.chc.c-bea{--chtint:#5ee6a840}.chc.c-vera{--chtint:#b78cff44}.chface{width:92px;height:92px;display:grid;place-items:center;animation:chBob 3.2s ease-in-out infinite}.chc.c-bea .chface{animation-delay:-1s}.chc.c-vera .chface{animation-delay:-2s}.chface svg{width:100%;height:100%}@keyframes chBob{50%{transform:translateY(-5px)}}
.chtxt b{font-family:var(--serif,Georgia);font-size:19px;display:block}.chtxt small{opacity:.7;font-size:12px;display:block}.chtxt q{display:block;margin-top:8px;font-style:italic;font-size:13.5px;line-height:1.4}
.hnew{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.hn{display:flex;gap:12px;align-items:center;text-align:left;font:inherit;color:inherit;cursor:pointer;padding:12px;border-radius:18px;border:1px solid var(--line);background:linear-gradient(160deg,var(--panel2),var(--panel));transition:transform .2s}.hn:hover{transform:translateY(-3px)}
.hn b{display:block;font-size:16px}.hn small{opacity:.75;font-size:12.5px;line-height:1.35}.hnb .egb{width:84px;height:84px;margin:0}.hnb .egb b{font-size:10px}.hnic{width:84px;height:84px;border-radius:12px;display:grid;place-items:center;flex:0 0 auto;background:color-mix(in srgb,var(--gold,#c79a3a) 22%,transparent)}.hnic .ic{width:36px;height:36px}
.door::before{content:"";position:absolute;inset:0;background:radial-gradient(240px circle at var(--mx,50%) var(--my,50%),color-mix(in srgb,var(--gold,#c79a3a) 22%,transparent),transparent 60%);opacity:0;transition:opacity .25s;pointer-events:none}.door:hover::before{opacity:1}
@media (max-width:760px){.hero2{grid-template-columns:1fr}.hbb{width:min(100%,300px)}.htoday{grid-template-columns:repeat(2,1fr)}.hcoach,.hnew{grid-template-columns:1fr}.chc{flex-direction:row;text-align:left}.chface{width:64px;height:64px;flex:0 0 auto}}
@media (prefers-reduced-motion:reduce){.chface,.ht{animation:none}.hbb{transform:none}}`; document.head.appendChild(s); })();
/* ---------- the Games page, redesigned like football's and basketball's: every chess game on one page with filter chips
   (Puzzles and quizzes, Predict, Daily, Play someone, Train) and a search box, instead of folders. ---------- */
const CGG = { f: "all", q: "" };
const CGG_F = [["all", "All games"], ["quiz", "Puzzles & quizzes"], ["predict", "Predict"], ["daily", "Daily"], ["play", "Play someone"], ["train", "Train"]];
function cggItems() {
  const out = CG.filter((x) => x.id !== "review").map((x) => ({ id: x.id, name: x.name, tag: x.tag, modes: x.modes, ic: x.ic, attr: `data-intro="${x.id}"`, t: new Set([x.g === "model" ? "predict" : ["ai", "online"].includes(x.id) ? "play" : ["trainer", "open", "endg", "elo"].includes(x.id) ? "train" : "quiz"]) }));
  DAILIES.forEach(([k, n, icn, tag, go]) => out.push({ id: go, name: n, tag, ic: icn, attr: `data-go="${go}"`, t: new Set(["daily", "quiz"]) }));
  out.push({ id: "wk", name: "Weekly cup", tag: "Five puzzles, the same for everyone this week. One attempt, faster solves score more.", ic: "trophy", attr: 'data-go="wk"', t: new Set(["daily", "quiz"]) });
  out.push({ id: "sim", name: "Simulate a match", tag: "Pick anyone, from Carlsen to your friend on chess.com, and play 1,000 games against them in a second.", ic: "swords", attr: 'data-go="sim"', t: new Set(["play"]) });
  out.push({ id: "et", name: "Endgame trainer", tag: "Seven endings every player should know, against full-strength Stockfish.", ic: "crown", attr: 'data-go="et"', t: new Set(["train"]) });
  out.push({ id: "famous", name: "Guess the famous game", tag: "Replay the Opera Game, the Immortal and more from the winner's chair.", ic: "book", attr: 'data-go="famous"', t: new Set(["train", "quiz"]) });
  out.push({ id: "learn", name: `${LESSONS.length} lessons`, tag: "Forks, pins, zugzwang and more, each a short set of real puzzles.", ic: "book", attr: 'data-go="learn"', t: new Set(["train"]) });
  return out;
}
function gamesPage() {
  clearInterval(st.timer); live = null; rvStop(); st = { game: "games" }; $("#app").className = "fresh";
  const all = cggItems(), q = CGG.q.trim().toLowerCase(), list = all.filter((x) => (CGG.f === "all" || x.t.has(CGG.f)) && (!q || (x.name + " " + x.tag).toLowerCase().includes(q)));
  const lab = (k) => (CGG_F.find((f) => f[0] === k) || [, k])[1].replace("Puzzles & quizzes", "Puzzle");
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="home">← Menu</button></div><div class="cgghead"><div><h2 style="font-size:32px;margin:0">${ic("puzzle")}Play</h2><p class="sub" style="margin:4px 0 0">${all.length} games. Tap one to start.</p></div><label class="cggs">${ic("search")}<input id="cggQ" type="search" placeholder="Find a game" aria-label="Find a game" value="${esc(CGG.q)}" autocomplete="off"></label></div>
    <div class="chips cggf">${CGG_F.map(([k, n]) => `<button type="button" class="chip ${CGG.f === k ? "on" : ""}" data-cggf="${k}" aria-pressed="${CGG.f === k}">${n} <small>${k === "all" ? all.length : all.filter((x) => x.t.has(k)).length}</small></button>`).join("")}</div>
    ${diffBar ? diffBar() : ""}
    <div class="hubgrid">${list.map((x, k) => `<button class="gcard" ${x.attr} style="animation-delay:${Math.min(k, 12) * 40}ms"><div class="gi"><div class="di">${ic(x.ic || "puzzle")}</div></div><div class="gname">${esc(x.name)}</div><div class="cggt">${[...x.t].map((t) => `<span class="t-${t}">${esc(lab(t))}</span>`).join("")}</div><div class="gtag">${esc(x.tag || "")}</div></button>`).join("") || `<p class="fine">No game matches "${esc(CGG.q)}".</p>`}</div>`;
  const i = document.getElementById("cggQ"); if (i && CGG.focus) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); CGG.focus = false; }
  scrollTo({ top: 0, behavior: "instant" });
}
GO.games = gamesPage;
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-cggf]"); if (!b) return; e.stopPropagation(); CGG.f = b.dataset.cggf; try { Snd.tick(); } catch (x) { /* quiet */ } gamesPage(); }, true);
document.addEventListener("input", (e) => { if (e.target.id !== "cggQ") return; CGG.q = e.target.value; CGG.focus = true; gamesPage(); });
(() => { const s = document.createElement("style"); s.textContent = `.cgghead{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.cggs{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:14px;border:1px solid var(--line);background:var(--panel2);min-width:min(260px,100%)}.cggs .ic{width:18px;height:18px;opacity:.6}.cggs input{border:0;background:transparent;color:var(--ink);font:inherit;outline:none;width:100%}.cggs:focus-within{border-color:var(--gold)}
.cggf{margin-bottom:12px}.cggf small{opacity:.6;font-weight:700;margin-left:3px}.cggt{display:flex;gap:4px;flex-wrap:wrap;margin:2px 0 4px}.cggt span{font:700 10px/1 var(--mono,monospace);letter-spacing:.06em;text-transform:uppercase;padding:4px 7px;border-radius:999px;background:color-mix(in srgb,var(--ink) 8%,transparent)}
.cggt .t-quiz{background:color-mix(in srgb,#7c5cff 22%,transparent)}.cggt .t-predict{background:color-mix(in srgb,#1fa463 24%,transparent)}.cggt .t-daily{background:color-mix(in srgb,#f2c14e 30%,transparent)}.cggt .t-play{background:color-mix(in srgb,#ff8a3d 26%,transparent)}.cggt .t-train{background:color-mix(in srgb,#38bdf8 26%,transparent)}`; document.head.appendChild(s); })();

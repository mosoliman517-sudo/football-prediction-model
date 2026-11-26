/* ---------- ranks, badges and achievements, as in football and basketball ----------
   Everything is earned from things that really happen here: games against the characters, puzzles, dailies, quiz streaks,
   reviews and friend games. A watcher looks at the page's state every couple of seconds, so the games themselves are
   untouched. Games started from a set-up position earn experience but no achievements. */
const PROG = (() => {
  const TIERS = [["Common", "#9aa3b2"], ["Uncommon", "#4ade80"], ["Rare", "#38bdf8"], ["Epic", "#c084fc"], ["Legendary", "#fbbf24"]];
  const LEVELS = [["Pawn", 0], ["Knight", 150], ["Bishop", 400], ["Rook", 900], ["Queen", 1800], ["King", 3200], ["Grandmaster", 5500]];
  /* id, name, how, tier 0..4, icon */
  const ACH = [
    ["first", "First move", "Finish a game against a character", 0, "flag"], ["win1", "Off the mark", "Beat any character", 0, "trophy"],
    ["beat_pip", "Pawn taken", "Beat Pip", 0, "swords"], ["beat_berserker", "Fire put out", "Beat the Berserker", 2, "swords"], ["beat_bea", "Out-positioned", "Beat Bishop Bea", 2, "swords"], ["beat_trader", "Bad deal for him", "Beat the Trader", 2, "swords"],
    ["beat_escaped", "Back to the ward", "Beat the Escaped", 3, "swords"], ["beat_council", "Overruled", "Beat the Council", 3, "swords"], ["beat_vera", "Regicide", "Beat Queen Vera", 3, "crown"], ["beat_arteta", "Through the wall", "Beat Arteta", 4, "crown"], ["all8", "Clean sweep", "Beat all eight characters", 4, "crown"],
    ["draw1", "Honours even", "Draw with a character", 1, "flag"], ["games25", "Regular", "Finish 25 games against characters", 2, "robot"],
    ["mate", "Checkmate", "Win by checkmate", 0, "target"], ["quick", "Miniature", "Checkmate in 25 moves or fewer", 3, "bolt"], ["marathon", "Long haul", "Play a game of 60 moves or more", 1, "clock"],
    ["castle", "Tucked in", "Castle and win", 0, "flag"], ["promote", "Coronation", "Promote a pawn", 1, "crown"], ["under", "Odd choice", "Win after promoting to something other than a queen", 3, "bulb"], ["queenless", "Who needs her", "Win after losing your queen", 3, "eye"],
    ["brill", "Brilliancy", "Play a brilliant move against a character", 3, "bulb"], ["clean", "Spotless", "20 moves or more with no mistake or blunder", 2, "eye"],
    ["pz10", "Warmed up", "Solve 10 puzzles", 1, "puzzle"], ["pz100", "Tactician", "Solve 100 puzzles", 3, "puzzle"],
    ["daily1", "Today's work", "Complete a daily challenge", 0, "clock"], ["daily3", "Full house", "All three dailies in one day", 1, "clock"],
    ["streak3", "Warming up", "Three days in a row", 0, "bolt"], ["streak7", "Seven-day run", "Seven days in a row", 2, "bolt"], ["streak30", "Ever present", "Thirty days in a row", 4, "bolt"],
    ["quiz5", "On a roll", "A streak of 5 in a guessing game", 1, "brain"], ["quiz15", "Unstoppable", "A streak of 15 in a guessing game", 3, "brain"],
    ["review1", "Film session", "Open a game review", 0, "chart"], ["friend", "Good company", "Finish a game against a friend", 1, "user"],
  ];
  const AVATARS = ["pip", "vera", "bea", "arteta", "escaped", "berserker", "trader"];
  const load = () => ({ xp: 0, ach: {}, days: {}, badges: [], beat: {}, pz: 0, avatar: "", ...store.get("prof", {}) });
  const save = (p) => { store.set("prof", p); if (Cloud.signedIn) { clearTimeout(save.t); save.t = setTimeout(() => Cloud.push(), 2500); } };
  const level = (xp) => { let i = 0; LEVELS.forEach(([, t], k) => { if (xp >= t) i = k; }); const next = LEVELS[i + 1]; return { i, name: LEVELS[i][0], from: LEVELS[i][1], to: next ? next[1] : null, next: next ? next[0] : null }; };
  const def = (id) => ACH.find((a) => a[0] === id);
  const badge = (id, big) => { const a = def(id); return a ? `<span class="pgb t${a[3]} ${big ? "big" : ""}" title="${esc(a[1])} · ${TIERS[a[3]][0]}">${ic(a[4])}</span>` : ""; };
  const worn = (p) => (p.badges || []).filter((id) => p.ach[id]).slice(0, 3);

  /* ---- earning ---- */
  const queue = [];
  function toast(html) {
    queue.push(html); if (queue.length > 1) return;
    const next = () => { const t = Object.assign(document.body.appendChild(document.createElement("div")), { className: "pgtoast" }); t.setAttribute("role", "status"); t.innerHTML = queue[0]; setTimeout(() => { t.remove(); queue.shift(); if (queue.length) next(); }, queue.length > 3 ? 1600 : 3200); };
    next();
  }
  function add(p, xp) {
    if (!xp) return; const before = level(p.xp).i; p.xp += xp; const day = todayK(); p.days[day] = (p.days[day] || 0) + 1;
    const now = level(p.xp); if (now.i > before) toast(`<b>Rank up</b><span>You are now a ${esc(now.name)}</span>`);
  }
  function give(p, id) { if (p.ach[id] || !def(id)) return false; const a = def(id); p.ach[id] = todayK(); toast(`${badge(id, true)}<span><b>Achievement unlocked</b>${esc(a[1])}: ${esc(a[2])}</span>`); return true; }

  function gameOver(p) {
    const o = st.over, B = botOf(st.level), H = live.c.history({ verbose: true }), me = live.color, custom = !!live.c.header().FEN, moves = Math.ceil(H.length / 2);
    if (H.length < 10 && o.why === "by resignation") return;   /* resigning at once earns nothing */
    const elo = BOT_ELO[B.id] || 1000;
    add(p, o.won ? 80 + Math.round(elo / 50) : o.lost ? 20 : 40);
    if (custom) return;
    give(p, "first");
    if (!o.won && !o.lost) give(p, "draw1");
    if (moves >= 60) give(p, "marathon");
    const mine = H.filter((m) => m.color === me);
    if (mine.some((m) => m.promotion)) give(p, "promote");
    if (!o.won) return;
    p.beat[B.id] = 1; give(p, "win1"); give(p, "beat_" + B.id); if (BOTS.every((b) => p.beat[b.id])) give(p, "all8");
    if (o.why === "by checkmate") { give(p, "mate"); if (moves <= 25) give(p, "quick"); }
    if (mine.some((m) => m.flags.includes("k") || m.flags.includes("q"))) give(p, "castle");
    if (mine.some((m) => m.promotion && m.promotion !== "q")) give(p, "under");
    if (H.some((m) => m.color !== me && m.captured === "q")) give(p, "queenless");
  }

  function tick() {
    if (typeof st === "undefined" || typeof Cloud === "undefined") return;
    const p = load(), was = JSON.stringify(p);
    if (st.game === "ai" && st.over && live && !st.progDone) { st.progDone = true; gameOver(p); }
    if (st.game === "ai" && st.over && st.stats && st.stats.moves && !st.progStats && live && !live.c.header().FEN) { st.progStats = true; const n = st.stats.n; if (n.brilliant) give(p, "brill"); if (st.stats.moves >= 20 && !n.mistake && !n.blunder) give(p, "clean"); }
    if (st.pz && st.pz.done && !st.pz.progDone) { st.pz.progDone = true; if (st.pz.ok) { p.pz++; add(p, 8); } }
    if (st.q && st.q.chosen != null && !st.q.progDone && st.streak > 0) { st.q.progDone = true; add(p, 3); }
    if (st.game === "review" && !st.progDone) { st.progDone = true; add(p, 10); give(p, "review1"); }
    if (typeof OG !== "undefined" && OG && OG.over && !OG.progDone) { OG.progDone = true; add(p, 30); give(p, "friend"); }
    /* things that are simply true by now */
    const rec = store.get("ai_rec", { w: 0, d: 0, l: 0 }), total = rec.w + rec.d + rec.l;
    if (total > 0) give(p, "first"); if (rec.w > 0) give(p, "win1"); if (total >= 25) give(p, "games25");
    if (p.pz >= 10) give(p, "pz10"); if (p.pz >= 100) give(p, "pz100");
    const done = Object.keys(dGet(todayK())).length, seenDaily = p.dailyDay === todayK() ? p.dailyN : 0;
    if (done > seenDaily) { add(p, 20 * (done - seenDaily)); p.dailyDay = todayK(); p.dailyN = done; }
    if (done >= 1) give(p, "daily1"); if (done >= 3) give(p, "daily3");
    const streak = dStreak(); if (streak >= 3) give(p, "streak3"); if (streak >= 7) give(p, "streak7"); if (streak >= 30) give(p, "streak30");
    const quiz = Math.max(...["next", "recog", "blunder", "open", "mate"].map((k) => bestOf(k))); if (quiz >= 5) give(p, "quiz5"); if (quiz >= 15) give(p, "quiz15");
    if (JSON.stringify(p) !== was) save(p);
  }

  /* ---- the profile page ---- */
  const face = (av) => oppFace(AVATARS.includes(av) ? av : coachId(), "happy");
  function calendar(p) {
    const cells = []; const now = Date.now();
    for (let k = 83; k >= 0; k--) { const key = new Date(now - k * 864e5).toISOString().slice(0, 10), n = p.days[key] || 0; cells.push(`<i class="d${n === 0 ? 0 : n < 3 ? 1 : n < 8 ? 2 : 3}" title="${key}: ${n}"></i>`); }
    return `<div class="pgcal">${cells.join("")}</div><p class="fine">Each square is a day over the last 12 weeks; brighter means more done.</p>`;
  }
  const dayRun = (p) => { let s = 0; for (let k = 0; k < 400; k++) { const key = new Date(Date.now() - k * 864e5).toISOString().slice(0, 10); if (p.days[key]) s++; else if (k > 0) break; } return s; };
  function page() {
    tick(); uxPage("me");
    const p = load(), lv = level(p.xp), pct = lv.to ? Math.round((100 * (p.xp - lv.from)) / (lv.to - lv.from)) : 100, got = ACH.filter((a) => p.ach[a[0]]).length;
    const rec = store.get("ai_rec", { w: 0, d: 0, l: 0 }), played = rec.w + rec.d + rec.l, bests = BOARDS.map(([k, n, unit]) => [n, bestOf(k), unit]).filter((x) => x[1] > 0), w = worn(p);
    const slots = [0, 1, 2].map((i) => (w[i] ? `<button type="button" class="pgslot on" data-pgwear="${w[i]}" title="Tap to take off">${badge(w[i], true)}<small>${esc(def(w[i])[1])}</small></button>` : `<span class="pgslot"><i></i><small>Empty</small></span>`)).join("");
    const grid = [...ACH].sort((a, b) => !!p.ach[b[0]] - !!p.ach[a[0]] || b[3] - a[3]).map(([id, n, d, t]) => `<button type="button" class="pgach t${t} ${p.ach[id] ? "on" : ""} ${w.includes(id) ? "worn" : ""}" ${p.ach[id] ? `data-pgwear="${id}"` : "disabled"}>${badge(id)}<b>${esc(n)}</b><small>${esc(d)}</small><em>${TIERS[t][0]}${w.includes(id) ? " · worn" : ""}</em></button>`).join("");
    const next = ACH.filter((a) => !p.ach[a[0]]).sort((a, b) => a[3] - b[3]).slice(0, 3);
    $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="home">← Menu</button></div>
    <div class="card uxpage"><div class="pghero"><span class="pgav">${face(p.avatar)}</span><div class="pgwho"><h2>${esc(Cloud.signedIn ? Cloud.nick || "Your account" : "Guest")} <span class="pgbs">${w.map((id) => badge(id)).join("")}</span></h2><p><b class="pgrank">${esc(lv.name)}</b> · level ${lv.i + 1} · ${p.xp.toLocaleString()} XP</p><div class="pgbar"><i style="width:${pct}%"></i></div><p class="fine">${lv.next ? `${(lv.to - p.xp).toLocaleString()} XP to ${esc(lv.next)}` : "Top rank"}</p></div><button type="button" class="btn ghost" data-uxopen="settings">Settings</button></div>
      <div class="tiles"><div class="tile"><small>Against the characters</small><b>${rec.w}-${rec.d}-${rec.l}</b><span class="fine">${played ? "won, drawn, lost" : "no games finished yet"}</span></div><div class="tile"><small>Day streak</small><b>${dayRun(p)}</b><span class="fine">days</span></div><div class="tile"><small>Achievements</small><b>${got}</b><span class="fine">of ${ACH.length}</span></div><div class="tile"><small>Puzzles solved</small><b>${p.pz}</b><span class="fine">since this update</span></div></div></div>
    <div class="card uxpage"><h3>Badges <span class="fine">${w.length} of 3 worn</span></h3><p class="fine">Tap an unlocked achievement to wear it. Worn badges show by your name on this page and under the board.</p><div class="pgslots">${slots}</div>${next.length ? `<p class="fine">Next up: ${next.map((a) => `${esc(a[1])} (${esc(a[2].toLowerCase())})`).join("; ")}.</p>` : ""}</div>
    <div class="card uxpage"><h3>Achievements <span class="fine">${got} of ${ACH.length}</span></h3><div class="pggrid">${grid}</div></div>
    <div class="card uxpage"><h3>Your picture</h3><div class="pgavs">${AVATARS.map((a) => `<button type="button" class="pgavopt ${p.avatar === a ? "on" : ""}" data-pgav="${a}" aria-label="${a}">${oppFace(a, "calm")}</button>`).join("")}</div><h3>Streak calendar</h3>${calendar(p)}
      <h3>Your best scores</h3>${bests.length ? `<table class="tb"><tbody>${bests.map(([n, v, u]) => `<tr><td>${esc(n)}</td><td><b>${v}</b> <span class="fine">${esc(u)}</span></td></tr>`).join("")}</tbody></table>` : `<p class="fine">Nothing yet. Finish a game and your best score shows here.</p>`}
      <div class="row"><button type="button" class="btn ghost" data-go="board">${ic("trophy")}Leaderboards</button></div><h3>Account</h3>${uxAccount()}</div>`;
  }
  document.addEventListener("click", (e) => {
    const q = (s) => e.target.closest && e.target.closest(s);
    const wear = q("[data-pgwear]"), av = q("[data-pgav]"); if (!wear && !av) return;
    const p = load(), top = window.scrollY;
    if (wear) { const id = wear.dataset.pgwear; let w = worn(p); w = w.includes(id) ? w.filter((x) => x !== id) : [...w, id].slice(-3); p.badges = w; }
    if (av) p.avatar = av.dataset.pgav;
    save(p); page(); window.scrollTo(0, top);
  });
  /* your name under the board, with the badges you wear */
  const youName = () => { const p = load(); return `${esc(Cloud.signedIn && Cloud.nick ? Cloud.nick : "You")} <span class="pgbs">${worn(p).map((id) => badge(id)).join("")}</span>`; };
  /* kept with your account when signed in: experience and achievements are merged, never lost */
  const merge = (a, b) => ({ ...a, ...b, xp: Math.max(a.xp || 0, b.xp || 0), pz: Math.max(a.pz || 0, b.pz || 0), ach: { ...(b.ach || {}), ...(a.ach || {}) }, days: { ...(b.days || {}), ...(a.days || {}) }, beat: { ...(b.beat || {}), ...(a.beat || {}) }, badges: (a.badges && a.badges.length ? a.badges : b.badges) || [], avatar: a.avatar || b.avatar || "" });
  const _bests = Cloud.bests.bind(Cloud); Cloud.bests = () => ({ ..._bests(), prof: load() });
  const _pull = Cloud.pull.bind(Cloud);
  Cloud.pull = async function () {
    await _pull(); const t = await this.token(); if (!t) return;
    try { const r = await fetch(`${this.cfg.url}/rest/v1/progress?select=data`, { headers: this.hdr(t) }); if (!r.ok) return; const rows = await r.json(), d = rows[0] && rows[0].data; if (d && d.prof) store.set("prof", merge(load(), d.prof)); } catch (e) { /* offline */ }
  };
  const s = document.createElement("style"); s.textContent = `
.pghero{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.pgav{width:110px;height:120px;flex:none}.pgav svg{width:100%!important;height:100%!important}.pgwho{flex:1;min-width:190px}.pgwho h2{margin:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pgwho p{margin:4px 0}.pgrank{color:var(--gold)}
.pgbar{height:12px;border-radius:99px;background:var(--line);overflow:hidden;max-width:420px}.pgbar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gold),#ff8a3d);transition:width .8s}
.pgb{--bc:#9aa3b2;display:inline-grid;place-items:center;width:22px;height:22px;flex:none;border-radius:7px;color:var(--bc);background:color-mix(in srgb,var(--bc) 20%,transparent);border:1.5px solid color-mix(in srgb,var(--bc) 60%,transparent);vertical-align:middle}.pgb .ic{width:13px;height:13px}.pgb.big{width:42px;height:42px;border-radius:12px}.pgb.big .ic{width:24px;height:24px}
.t1{--bc:#35c46a}.t2{--bc:#2f9fe0}.t3{--bc:#a66cf0}.t4{--bc:#d99a12}.pgb.t3,.pgb.t4{box-shadow:0 0 12px -2px var(--bc)}.pgbs{display:inline-flex;gap:4px}
.pgslots{display:flex;gap:10px;flex-wrap:wrap}.pgslot{width:96px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border-radius:14px;border:1.5px dashed var(--line);background:none;color:var(--ink);font:inherit;text-align:center}.pgslot.on{border-style:solid;background:var(--panel2);cursor:pointer}.pgslot i{width:42px;height:42px;border-radius:12px;background:var(--line);opacity:.5}
.pggrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.pgach{--bc:#9aa3b2;display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;padding:10px;border-radius:14px;border:1.5px solid var(--line);background:var(--panel2);color:var(--ink);font:inherit}.pgach.t1{--bc:#35c46a}.pgach.t2{--bc:#2f9fe0}.pgach.t3{--bc:#a66cf0}.pgach.t4{--bc:#d99a12}.pgach:disabled{opacity:.5}.pgach.on{cursor:pointer;border-color:color-mix(in srgb,var(--bc) 70%,transparent)}.pgach.worn{box-shadow:0 0 0 2px var(--bc)}.pgach small{color:var(--muted);line-height:1.3}.pgach em{font:700 10px var(--mono);font-style:normal;letter-spacing:.1em;text-transform:uppercase;color:var(--bc)}
.pgavs{display:flex;gap:8px;flex-wrap:wrap}.pgavopt{width:64px;height:72px;padding:4px;border-radius:14px;border:2px solid var(--line);background:var(--panel2);cursor:pointer}.pgavopt.on{border-color:var(--gold)}.pgavopt svg{width:100%!important;height:100%!important}
.pgcal{display:grid;grid-template-rows:repeat(7,12px);grid-auto-flow:column;grid-auto-columns:12px;gap:3px;overflow-x:auto;padding:4px 0}.pgcal i{border-radius:3px;background:var(--line)}.pgcal i.d1{background:color-mix(in srgb,var(--gold) 40%,var(--line))}.pgcal i.d2{background:color-mix(in srgb,var(--gold) 70%,var(--line))}.pgcal i.d3{background:var(--gold)}
.pgtoast{position:fixed;left:50%;top:max(14px,env(safe-area-inset-top));transform:translateX(-50%);z-index:100000;display:flex;gap:10px;align-items:center;max-width:min(380px,92vw);padding:10px 14px;border-radius:14px;background:#26251f;color:#fff;border:1.5px solid var(--gold);box-shadow:0 18px 40px -12px #000;font-size:13px;animation:pgin .35s cubic-bezier(.2,1.3,.4,1)}.pgtoast b{display:block}@keyframes pgin{from{opacity:0;transform:translate(-50%,-16px)}}`; document.head.appendChild(s);
  setInterval(() => { try { tick(); } catch (e) { /* progress never breaks a game */ } }, 2000);
  return { ACH, LEVELS, level, load, save, tick, page, youName, badge };
})();
myPage = function () { PROG.page(); };

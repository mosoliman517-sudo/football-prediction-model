/* The FIDE World Championship hub (Gukesh vs Sindarov, Geneva, 24 Nov to 11 Dec 2026): one page for the whole match.
   Tabs: Live (the board, clocks, Stockfish, Pip), Schedule (all 14 games, local time, add to calendar), Score (the match
   score game by game), Players (ratings side by side, odds from ratings, head to head), Openings (what has been played,
   open any of it in the explorer), Games (every game so far: replay, full review, play it off).
   On the live board: "Analyse this position" opens the review's explore mode (engine lines, play your own moves, every move
   graded) on the position you are looking at; "Play from here" plays it out against Stockfish; "Full review" grades the game.
   Everything comes from the Lichess broadcast of the match (moves, clocks and Stockfish evals, every 15 seconds while a game
   is on); nothing is made up, and a game that has not started shows no moves. */
const WH = { tour: "qfkdt8mn", d: null, games: {}, tab: "live", at: 0 };
const whWho = (n) => (/gukesh/i.test(n || "") ? "g" : /sindarov/i.test(n || "") ? "s" : "");
const whPts = (r, side) => (r === "1/2-1/2" ? 0.5 : (r === "1-0") === (side === "White") ? 1 : r === "0-1" || r === "1-0" ? 0 : null);
function whOpening(sans) { const bm = bookMap(); let name = "", k0 = 0; for (let k = 1; k <= Math.min(sans.length, 30); k++) { const n = bm.get(sans.slice(0, k).join(" ")); if (n) { name = n; k0 = k; } } return { name, k: k0 }; }
async function whFetch(force) {
  if (!force && WH.d && Date.now() - WH.at < 12000) return;
  WH.d = await liJson(`${LI}/${WH.tour}`); WH.at = Date.now(); const now = Date.now();
  await Promise.all(WH.d.rounds.filter((r) => r.ongoing || r.finished || r.startsAt <= now).map(async (r) => {
    const have = WH.games[r.id]; if (have && r.finished && have.fin) return;
    try { const txt = await (await fetch(`${LI}/round/${r.id}.pgn`)).text(), gs = txt.split(/\n\n(?=\[Event )/).map((x) => x.trim()).filter(Boolean).map(liParse); WH.games[r.id] = { g: gs[0] || null, fin: !!r.finished }; } catch (e) { /* keep what we had */ }
  }));
}
function whInfo() {
  const rounds = (WH.d ? WH.d.rounds : []).map((r, i) => { const G = (WH.games[r.id] || {}).g, h = G ? G.h : null, sans = G ? G.mv.map((m) => m.san) : [], res = h && h.Result && h.Result !== "*" ? h.Result : "";
    return { i: i + 1, r, G, h, sans, res, white: h ? whWho(h.White) : "", live: !!r.ongoing, done: !!r.finished || !!res }; });
  const first = rounds.find((x) => x.white), w1 = first ? (first.i % 2 === 1 ? first.white : first.white === "g" ? "s" : "g") : "";   /* who had White in game 1 */
  rounds.forEach((x) => { if (!x.white && w1) x.white = x.i % 2 === 1 ? w1 : w1 === "g" ? "s" : "g"; });
  const pts = { g: 0, s: 0 }; rounds.forEach((x) => { if (x.res && x.white) { const b = x.white === "g" ? "s" : "g"; if (x.res === "1/2-1/2") { pts.g += 0.5; pts.s += 0.5; } else if (x.res === "1-0") pts[x.white] += 1; else if (x.res === "0-1") pts[b] += 1; } });
  return { rounds, pts, played: rounds.filter((x) => x.res).length };
}
const whRes = (r) => (r === "1/2-1/2" ? "½–½" : r);
const whName = (k) => (k === "g" ? "Gukesh" : k === "s" ? "Sindarov" : "TBC");
function whHero(info) {
  const gk = cpP(CP_ID.gukesh), sn = cpP(CP_ID.sindarov), live = info.rounds.find((x) => x.live), next = WH.d && WH.d.rounds.find((r) => !r.finished && !r.ongoing && r.startsAt > Date.now());
  const face = (p, k) => `<button class="cpside" type="button" data-cpp="${CP_ID[k]}">${cpFace(p, "big")}<b>${esc(cpName(p))}</b><span class="cpmeta">${cpFed(p)}</span>${p && p.std ? `<span class="cprat"><span><b class="num">${p.std}</b><small>Classical</small></span></span>` : ""}</button>`;
  const status = live ? `<span class="lvbadge on">● LIVE</span> Game ${live.i} is being played now` : info.played >= 1 && info.played < 14 && next ? `Game ${info.played} finished · next: ${esc(next.name)}, ${new Date(next.startsAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : info.played >= 14 ? "All 14 games played" : next ? `${esc(next.name)} starts ${new Date(next.startsAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "";
  return `<div class="card cphero"><h2>${ic("crown")}FIDE World Championship 2026</h2><div class="cpvsrow">${face(gk, "gukesh")}<span class="cpvsbig whscore num">${info.played || live ? `${info.pts.g}<small> – </small>${info.pts.s}` : "VS"}</span>${face(sn, "sindarov")}</div><p class="whstat">${status}</p><div class="cpfacts"><span>${ic("flag")}Geneva, Switzerland</span><span>${ic("clock")}24 Nov – 11 Dec 2026</span><span>${ic("swords")}14 classical games, first to 7½</span><span>${ic("bolt")}120 min + 30 min, +30 s a move from move 41</span></div></div>`;
}
const WH_TABS = [["live", "Live board"], ["sched", "Schedule"], ["score", "Score"], ["players", "Players"], ["open", "Openings"], ["games", "Games"]];
function wccHub(app) {
  app.className = "fresh"; app.innerHTML = `${cpBack()}<div id="whTop"></div><div class="cptabs" role="tablist" id="whTabs">${WH_TABS.map(([k, n]) => `<button class="chip ${WH.tab === k ? "on" : ""}" type="button" role="tab" aria-selected="${WH.tab === k}" data-wht="${k}">${n}</button>`).join("")}</div><div id="whBody"></div>`;
  $("#whTop").innerHTML = whHero(whInfo()); whTab(WH.tab, true);
  whFetch().then(() => { if ($("#whTop")) { $("#whTop").innerHTML = whHero(whInfo()); if (WH.tab !== "live") whTab(WH.tab, true); } }).catch(() => { const b = $("#whBody"); if (b && WH.tab !== "live") b.insertAdjacentHTML("afterbegin", `<p class="fine">Could not reach Lichess for the latest games. Showing what is saved.</p>`); });
  clearInterval(WH.t); WH.t = setInterval(() => { if (!$("#whTop")) return clearInterval(WH.t); whFetch(true).then(() => { $("#whTop").innerHTML = whHero(whInfo()); if (WH.tab !== "live") whTab(WH.tab, true); }).catch(() => {}); }, 30000);
}
function whTab(k, quiet) {
  WH.tab = k; document.querySelectorAll("[data-wht]").forEach((x) => { x.classList.toggle("on", x.dataset.wht === k); x.setAttribute("aria-selected", x.dataset.wht === k); }); const b = $("#whBody"); if (!b) return; const info = whInfo();
  if (k === "live") { b.innerHTML = `<div id="wccLive" class="card lvcard" style="margin-top:12px"></div><div id="whOpLine"></div>`; const pk = WH.pick; WH.pick = null; const lv = document.getElementById("wccLive"); if (pk) wccShow(pk.id, pk.name, !!pk.ongoing, lv).catch(() => { lv.innerHTML = `<p class="fine">Could not load that game.</p>`; }); else wccLive(WH.tour, lv); return; }
  if (WL) clearInterval(WL.timer);
  b.innerHTML = `<div style="margin-top:12px">${{ sched: whSched, score: whScore, players: whPlayers, open: whOpen, games: whGames }[k](info)}</div>`; void quiet;
}
function whSched(info) {
  const ics = WH.d ? `<button class="btn ghost" type="button" data-whics>${ic("clock")}Add all games to my calendar</button>` : "";
  const rows = info.rounds.map((x, k) => { const r = x.r, prev = k ? info.rounds[k - 1].r.startsAt : null, rest = prev && r.startsAt - prev > 1.5 * 864e5, d = new Date(r.startsAt);
    const local = d.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), gva = d.toLocaleTimeString("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
    const st = x.live ? `<span class="lvbadge on">● LIVE</span>` : x.res ? `<span class="cpres r${x.res === "1/2-1/2" ? "D" : "W"}">${whRes(x.res)}</span>` : d.getTime() > Date.now() ? `<span class="fine">upcoming</span>` : `<span class="fine">starting</span>`;
    return `${rest ? `<div class="fine whrest">Rest day</div>` : ""}<${x.done || x.live ? `button type="button" data-whround="${r.id}"` : "div"} class="cpgame ${x.done || x.live ? "" : "static"}"><span class="cpcol2"><b>${esc(r.name)}</b><span class="fine">${local} · ${gva} in Geneva</span></span><span class="cpcol2"><span class="fine">${x.white ? `${whName(x.white)} has White` : "Colours to be confirmed"}</span></span>${st}</${x.done || x.live ? "button" : "div"}>`; }).join("");
  return `<div class="row" style="margin-bottom:8px">${ics}</div><p class="fine">Times are in your own time zone, with Geneva time beside them. The organisers can move a start time; the schedule follows the Lichess broadcast. Tap a game that has started to open it.</p><div class="cpgames">${rows || '<p class="fine">Loading the schedule…</p>'}</div>`;
}
function whScore(info) {
  const need = 7.5, bar = (p) => `<div class="h2hbar"><i style="flex:${Math.max(p, 0.001)};background:var(--gold)"></i><i style="flex:${Math.max(need - p, 0.001)};background:var(--line)"></i></div>`;
  const cells = info.rounds.map((x) => { const g = x.white === "g", cl = x.res ? (x.res === "1/2-1/2" ? "D" : (x.res === "1-0") === g ? "G" : "S") : ""; return `<div class="whcell ${cl}${x.live ? " live" : ""}" title="${esc(x.r.name)}"><small>${x.i}</small><b>${x.res ? whRes(x.res) : x.live ? "●" : "–"}</b><span>${x.white ? whName(x.white).slice(0, 3) + " W" : ""}</span></div>`; }).join("");
  const left = 14 - info.played;
  return `<div class="card"><div class="h2hrec"><span class="sW"><b class="num">${info.pts.g}</b><small>Gukesh</small></span><span class="sD"><b class="num">${info.rounds.filter((x) => x.res === "1/2-1/2").length}</b><small>Draws</small></span><span class="sL"><b class="num">${info.pts.s}</b><small>Sindarov</small></span></div>
    <p class="fine">Gukesh ${bar(info.pts.g)}Sindarov ${bar(info.pts.s)}First to 7½ points wins the title. ${left > 0 ? `${left} game${left > 1 ? "s" : ""} left.` : "All games are done."} If it is 7–7 after 14 games, a tiebreak decides it (rapid, then blitz, then Armageddon).</p></div>
    <div class="card" style="margin-top:12px"><h3 style="margin:0 0 8px">${ic("chart")}Game by game</h3><div class="whgrid">${cells}</div><p class="fine">Gold: Gukesh won. Green: Sindarov won. Grey: draw. The letters show who had White.</p></div>`;
}
function whPlayers() {
  const a = cpP(CP_ID.gukesh), b = cpP(CP_ID.sindarov); if (!a || !b) return `<p class="fine">Player data is missing.</p>`;
  const rows = [["Classical", "std"], ["Rapid", "rap"], ["Blitz", "blz"], ["Peak", "peak"]].filter(([, k]) => a[k] || b[k]).map(([l, k]) => [l, a[k], b[k]]); rows.push(["Age", rkAge(a), rkAge(b)]);
  const gap = (a.std || 0) - (b.std || 0), E = (a.std && b.std) ? 1 / (1 + Math.pow(10, -(gap) / 400)) : null;
  return `<div class="card"><table class="rvph h2ht"><tr><th></th><th>${esc(cpName(a))}</th><th>${esc(cpName(b))}</th></tr>${rows.map(([l, x, y]) => `<tr><td>${l}</td><td>${x == null ? "—" : x}</td><td>${y == null ? "—" : y}</td></tr>`).join("")}</table></div>
    ${E != null ? `<div class="card" style="margin-top:12px"><h3 style="margin:0 0 6px">${ic("chart")}What the ratings say</h3><p>By classical rating alone, ${esc(cpName(gap >= 0 ? a : b).split(" ").pop())} is expected to score ${Math.round(100 * Math.max(E, 1 - E))}% of the points in a long match (rating gap ${Math.abs(gap)}). That is only the Elo formula: it ignores form, preparation and the colours, and between players this close most games are drawn, so treat it as a gentle lean, not a forecast.</p></div>` : ""}
    <div class="row" style="margin-top:12px"><button class="btn" type="button" data-rkp="${CP_ID.gukesh}">${esc(cpName(a))}: full profile</button><button class="btn" type="button" data-rkp="${CP_ID.sindarov}">${esc(cpName(b))}: full profile</button><button class="btn ghost" type="button" data-whh2h>${ic("swords")}Head to head: all their games</button></div>`;
}
function whOpen(info) {
  const rows = info.rounds.filter((x) => x.sans.length >= 2).map((x) => ({ x, o: whOpening(x.sans) }));
  if (!rows.length) return `<div class="card"><p>No game has started yet, so there is no opening to show. When Game 1 begins, each game's opening appears here: its name, how many moves were theory, and a button that opens the position in the opening explorer to see what the masters played from there.</p></div>`;
  const cnt = {}; rows.forEach((r) => { if (r.o.name) cnt[r.o.name] = (cnt[r.o.name] || 0) + 1; });
  return `<div class="cpgames">${rows.map(({ x, o }) => `<div class="cpgame static"><span class="cpcol2"><b>${esc(x.r.name)}: ${esc(o.name || "No standard opening name")}</b><span class="fine">${x.sans.slice(0, 8).join(" ")}${x.sans.length > 8 ? " …" : ""} · ${o.k ? `theory for ${Math.ceil(o.k / 2)} move${o.k > 2 ? "s" : ""}` : "left the book early"}${cnt[o.name] > 1 ? ` · played ${cnt[o.name]} times` : ""}</span></span><button class="btn ghost" type="button" data-whop="${x.r.id}">${ic("compass")}Explore</button></div>`).join("")}</div><p class="fine">Names come from the site's opening list (${(OPEN || []).length} lines). Explore opens the master-game database from the position the game left theory.</p>`;
}
function whGames(info) {
  const rows = info.rounds.filter((x) => x.sans.length);
  if (!rows.length) return `<div class="card"><p>No games yet. Game 1 is on ${WH.d ? new Date(WH.d.rounds[0].startsAt).toLocaleString([], { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "24 November"}.</p></div>`;
  return `<div class="cpgames">${rows.map((x) => `<div class="cpgame static"><span class="cpcol2"><b>${esc(x.r.name)}: ${esc(whName(x.white))} (White) vs ${esc(whName(x.white === "g" ? "s" : "g"))}</b><span class="fine">${x.sans.length} plies · ${x.live ? "● live now" : whRes(x.res) || "unfinished"} · ${esc(whOpening(x.sans).name || "")}</span></span><span class="row"><button class="btn ghost" type="button" data-whround="${x.r.id}">${ic("play")}Replay</button><button class="btn ghost" type="button" data-whrev="${x.r.id}">${ic("chart")}Review</button><button class="btn ghost" type="button" data-whplay="${x.r.id}">${ic("robot")}Play off</button></span></div>`).join("")}</div>`;
}
function whIcs() {
  const z = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""), L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ballknowledge//WCC//EN"];
  WH.d.rounds.forEach((r) => L.push("BEGIN:VEVENT", `UID:${r.id}@ballknowledge`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(r.startsAt)}`, `DTEND:${z(r.startsAt + 5 * 36e5)}`, `SUMMARY:World Championship ${r.name}: Gukesh vs Sindarov`, "LOCATION:Geneva, Switzerland", "END:VEVENT"));
  L.push("END:VCALENDAR"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([L.join("\r\n")], { type: "text/calendar" })); a.download = "world-championship-2026.ics"; document.body.appendChild(a); a.click(); a.remove(); toast("Calendar file saved. Game lengths are about 5 hours.");
}
function whSans(id, upTo) { const x = whInfo().rounds.find((r) => r.r.id === id); return x && x.G ? { x, sans: x.sans.slice(0, upTo == null ? undefined : upTo) } : null; }
document.addEventListener("click", (e) => {
  if (st.game !== "champ" || CH.v !== "wcc") return; const t = e.target.closest && e.target.closest("[data-wht],[data-whround],[data-whrev],[data-whplay],[data-whop],[data-whics],[data-whh2h],[data-whan]"); if (!t) return;
  if (t.dataset.wht) { e.stopPropagation(); return whTab(t.dataset.wht); }
  if (t.dataset.whics != null) { e.stopPropagation(); return whIcs(); }
  if (t.dataset.whh2h != null) { e.stopPropagation(); return h2hPage(CP_ID.gukesh, CP_ID.sindarov); }
  if (t.dataset.whround) { e.stopPropagation(); WH.tab = "live"; WH.pick = WH.d.rounds.find((x) => x.id === t.dataset.whround); return wccHub($("#app")); }
  const id = t.dataset.whrev || t.dataset.whplay || t.dataset.whop, S = id ? whSans(id) : null;
  if (t.dataset.whrev && S) { e.stopPropagation(); return reviewStart(S.sans, "w", { from: "champ", names: [S.x.h.White, S.x.h.Black], result: S.x.h.Result }); }
  if (t.dataset.whplay && S) { e.stopPropagation(); const c = new Chess(); S.sans.forEach((s) => c.move(s, { sloppy: true })); st.clock = 0; return aiStart(6, c.turn(), c.fen()); }
  if (t.dataset.whop && S) { e.stopPropagation(); const o = whOpening(S.sans); EX.sans = S.sans.slice(0, Math.max(o.k, 2)); EX.sel = null; EX.tab = "name"; EX.quiz = null; st = { game: "x" }; return explorerPage(); }
  if (t.dataset.whan != null && WL) { e.stopPropagation(); clearInterval(WL.timer); const g = WL.g, ply = WL.ply == null ? g.mv.length : WL.ply, sans = g.mv.map((m) => m.san); reviewStart(sans, "w", { from: "champ", names: [g.h.White || "White", g.h.Black || "Black"], result: g.h.Result }); setTimeout(() => { try { rvGo(ply, { sound: false }); rvxStart(); } catch (x) { /* review not ready */ } }, 500); }
}, true);
/* the live board gets an "Analyse this position" button and the opening's name */
setTimeout(() => {
  if (typeof wccPaint !== "function") return; const p0 = wccPaint;
  try { wccPaint = function () { p0.apply(this, arguments); try { const el = WL.el, row = el.querySelector("[data-lvplay]") ? el.querySelector("[data-lvplay]").parentNode : el.querySelector("[data-lvrev]") ? el.querySelector("[data-lvrev]").parentNode : null;
    if (row && !row.querySelector("[data-whan]")) row.insertAdjacentHTML("afterbegin", `<button class="btn" data-whan type="button">${ic("compass")}Analyse this position</button>`);
    const ply = WL.ply == null ? WL.g.mv.length : WL.ply, o = whOpening(WL.g.mv.slice(0, ply).map((m) => m.san)), ol = document.getElementById("whOpLine"); if (ol) ol.innerHTML = o.name ? `<p class="fine" style="margin:8px 2px">${ic("book")}Opening: <b>${esc(o.name)}</b></p>` : ""; } catch (e) { /* plain board */ } }; } catch (e) { /* skip */ }
}, 0);
(() => { const s = document.createElement("style"); s.textContent = `.whscore{font-size:40px;display:flex;align-items:baseline;gap:4px}.whscore small{opacity:.5;font-size:24px}.whstat{margin:12px 0 0;text-align:center;font-weight:600}.whrest{margin:10px 0 2px;text-transform:uppercase;letter-spacing:.12em;font-size:11px}
.whgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}.whcell{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 2px;border-radius:12px;border:1px solid var(--line);background:var(--surface)}.whcell small{opacity:.6;font-size:11px}.whcell b{font-size:18px}.whcell span{font-size:10px;opacity:.7}
.whcell.G{background:color-mix(in srgb,var(--gold) 28%,var(--surface))}.whcell.S{background:color-mix(in srgb,var(--ok) 28%,var(--surface))}.whcell.D{background:color-mix(in srgb,var(--muted) 25%,var(--surface))}.whcell.live{outline:2px solid #ff4d4d}
@media(max-width:520px){.whgrid{grid-template-columns:repeat(4,1fr)}.whscore{font-size:30px}}`; document.head.appendChild(s); })();

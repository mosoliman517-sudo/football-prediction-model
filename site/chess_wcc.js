/* The FIDE World Championship hub (Gukesh vs Sindarov, Geneva, 24 Nov to 11 Dec 2026): one cinematic page for the whole match.
   Header: both players face to face with animated ratings, the live match score, a 14-game progress strip and a ticking
   countdown ring to the next game. Tabs: Live (board, clocks, Stockfish, plus an evaluation graph you can drag through the game
   and its biggest swings), Schedule (a timeline of all 14 games in your time zone), Score (tug of war and points-needed rings),
   Players (animated side-by-side bars), Openings, Games (every game with its own evaluation sparkline).
   On the live board: "Analyse this position" opens the review's explore mode (engine lines, your own moves, every move graded);
   "Play from here" plays it out against Stockfish; "Full review" grades the whole game.
   Everything comes from the Lichess broadcast of the match (moves, clocks, Stockfish evals, every 15 to 30 seconds while a game
   is on); nothing is made up, and a game that has not started shows no moves. Animations stop with "reduce motion". */
const WH = { tour: "qfkdt8mn", d: null, games: {}, tab: "live", at: 0, cd: null };
const whWho = (n) => (/gukesh/i.test(n || "") ? "g" : /sindarov/i.test(n || "") ? "s" : "");
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
const whWhen = (t, o) => new Date(t).toLocaleString([], o || { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/* win chance (white's, 0 to 100) for every ply from the broadcast's Stockfish evals; null where an eval is missing */
const whSeries = (G) => (G ? G.mv.map((m) => { const c = liCp(m.ev); return c == null ? null : wpct(c); }) : []);
function whSpark(G, o = {}) {
  const S = whSeries(G).map((v, i, a) => (v == null ? (i ? a[i - 1] : 50) : v)), N = S.length; if (N < 2) return "";
  const W = 300, H = o.h || 60, xs = (i) => ((i + 1) / N) * W, dev = Math.max(12, Math.max(...S.map((v) => Math.abs(v - 50))) * 1.15), ys = (v) => H / 2 - ((v - 50) / dev) * (H / 2), pts = S.map((v, i) => [xs(i), ys(v)]), line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" "), mid = H / 2;
  const id = "g" + Math.random().toString(36).slice(2, 7);
  return `<svg class="whspark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f1ea" stop-opacity=".9"/><stop offset=".5" stop-color="#f4f1ea" stop-opacity=".12"/><stop offset=".5" stop-color="#101512" stop-opacity=".12"/><stop offset="1" stop-color="#101512" stop-opacity=".9"/></linearGradient></defs><path d="${line} L ${W} ${H} L ${xs(0)} ${H} Z" fill="url(#${id})" opacity=".55"/><line x1="0" y1="${mid}" x2="${W}" y2="${mid}" stroke="currentColor" stroke-opacity=".3" stroke-dasharray="3 4"/><path class="whline" d="${line}" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linejoin="round" pathLength="1"/></svg>`;
}
function whRing(frac, size, inner, cls = "") {
  const r = 46, c = 2 * Math.PI * r; return `<div class="whring ${cls}" style="width:${size}px;height:${size}px"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width="7"/><circle class="whring-p" cx="50" cy="50" r="${r}" fill="none" stroke="var(--gold)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - Math.max(0, Math.min(1, frac)))).toFixed(1)}" transform="rotate(-90 50 50)" style="--c:${c.toFixed(1)}"/></svg><div class="whring-i">${inner}</div></div>`;
}
function whHero(info) {
  const gk = cpP(CP_ID.gukesh), sn = cpP(CP_ID.sindarov), live = info.rounds.find((x) => x.live), rs = WH.d ? WH.d.rounds : [], now = Date.now(), next = rs.find((r) => !r.finished && !r.ongoing && r.startsAt > now), nextI = next ? rs.indexOf(next) : -1;
  const face = (p, k, role) => `<button class="whplayer ${k}" type="button" data-cpp="${CP_ID[k === "g" ? "gukesh" : "sindarov"]}"><span class="whrole">${role}</span><span class="whpic" style="--img:url(img/${k === "g" ? "gukesh" : "sindarov"}.jpg)">${cpFace(p, "big")}</span><b>${esc(cpName(p))}</b><span class="cpmeta">${cpFed(p)}</span>${p && p.std ? `<span class="whelo"><b class="num" data-count="${p.std}">${p.std}</b><small>classical</small></span>` : ""}</button>`;
  const seg = info.rounds.length ? info.rounds : Array.from({ length: 14 }, (_, i) => ({ i: i + 1, r: { id: "", name: "Game " + (i + 1) } }));
  const strip = seg.map((x) => { const g = x.white === "g", cl = x.res ? (x.res === "1/2-1/2" ? "d" : (x.res === "1-0") === g ? "wg" : "ws") : x.live ? "live" : x.r.id && nextI === x.i - 1 ? "next" : ""; return `<button type="button" class="whseg ${cl}" ${x.done || x.live ? `data-whround="${x.r.id}"` : "disabled"} title="${esc(x.r.name)}${x.res ? ": " + whRes(x.res) : x.live ? ": live" : ""}"><small>${x.i}</small></button>`; }).join("");
  let status;
  if (live) { const L = live.G, n = L ? L.mv.length : 0, last = L && L.mv[n - 1], cp = last ? liCp(last.ev) : null; status = `<div class="whlive"><span class="lvbadge on">● LIVE</span><b>Game ${live.i}</b><span>${n ? `move ${Math.ceil(n / 2)}` : "about to begin"}</span>${cp != null ? `<span class="num whev ${cp >= 0 ? "w" : "b"}">${cp > 0 ? "+" : ""}${(cp / 100).toFixed(1)}</span>` : ""}<button class="btn" type="button" data-whround="${live.r.id}">Watch now</button></div>`; }
  else if (info.played >= 14 || (!next && info.played)) status = `<div class="whlive"><b>The match is over</b></div>`;
  else if (next) { const prev = nextI ? rs[nextI - 1].startsAt : next.startsAt - 864e5, frac = (now - prev) / (next.startsAt - prev); status = `<div class="whcd">${whRing(frac, 118, `<b class="num" data-cd="${next.startsAt}">--:--:--</b><small>to go</small>`)}<div><b>${esc(next.name)}</b><span>${whWhen(next.startsAt)}</span><small class="fine">${info.played ? `After ${info.played} game${info.played > 1 ? "s" : ""}: ${info.pts.g} – ${info.pts.s}` : "The match begins"}</small></div></div>`; }
  else status = "";
  const sc = info.played || live ? `<span class="whscore num"><b data-count="${info.pts.g}" data-dec="1">${info.pts.g}</b><i>:</i><b data-count="${info.pts.s}" data-dec="1">${info.pts.s}</b></span>` : `<span class="whvs">VS</span>`;
  return `<section class="whhero" aria-label="World Championship match">
    <i class="whcity" aria-hidden="true"></i><div class="whbg" aria-hidden="true"><i class="p p1">♔</i><i class="p p2">♞</i><i class="p p3">♛</i><i class="p p4">♝</i><i class="p p5">♜</i><i class="p p6">♟</i></div>
    <p class="whkick">FIDE · Geneva · 24 Nov – 11 Dec 2026</p><h2 class="whtitle">World Chess Championship</h2>
    <div class="whface-off">${face(gk, "g", "Defending champion")}<div class="whmid">${sc}<small class="whfirst">first to 7½</small></div>${face(sn, "s", "Challenger")}</div>
    <div class="whstrip" role="group" aria-label="The 14 games">${strip}</div><div class="whstat">${status}</div>
    <div class="whticker" aria-hidden="true"><div><span>14 classical games</span><span>120 min + 30 min after move 40, +30 s a move from move 41</span><span>First to 7½ points</span><span>Level at 7–7: rapid, blitz, then Armageddon</span><span>Live from Lichess every 15 seconds</span><span>14 classical games</span><span>120 min + 30 min after move 40, +30 s a move from move 41</span><span>First to 7½ points</span><span>Level at 7–7: rapid, blitz, then Armageddon</span><span>Live from Lichess every 15 seconds</span></div></div>
  <p class="whcred">Photos via Wikimedia Commons: Gukesh by Frans Peeters (CC BY-SA 2.0), Sindarov by Stefan64 (CC BY-SA 3.0), Lake Geneva by karlheinz klingbeil (CC BY 4.0).</p></section>`;
}
const WH_TABS = [["live", "Live board", "bolt"], ["sched", "Schedule", "clock"], ["score", "Score", "trophy"], ["players", "Players", "crown"], ["open", "Openings", "book"], ["games", "Games", "chart"]];
function whAnimate(root) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  (root || document).querySelectorAll("[data-count]").forEach((el) => { if (el.dataset.done) return; el.dataset.done = 1; const to = +el.dataset.count, dec = el.dataset.dec ? 1 : 0, t0 = performance.now(), from = dec ? 0 : Math.max(0, to - 120); const f = (t) => { const k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3); el.textContent = (from + (to - from) * e).toFixed(dec); if (k < 1) requestAnimationFrame(f); else el.textContent = dec ? to.toFixed(1).replace(/\.0$/, "") : to; }; requestAnimationFrame(f); });
}
function whTick() { document.querySelectorAll("[data-cd]").forEach((el) => { const t = +el.dataset.cd - Date.now(); if (t <= 0) { el.textContent = "starting"; return; } const d = Math.floor(t / 864e5), h = Math.floor((t % 864e5) / 36e5), m = Math.floor((t % 36e5) / 6e4), s = Math.floor((t % 6e4) / 1e3), p = (n) => String(n).padStart(2, "0"); el.textContent = (d ? d + "d " : "") + p(h) + ":" + p(m) + ":" + p(s); }); }
function wccHub(app) {
  app.className = "fresh"; app.innerHTML = `${cpBack()}<div id="whTop"></div><div class="whtabs" role="tablist" id="whTabs">${WH_TABS.map(([k, n, i]) => `<button class="whtab ${WH.tab === k ? "on" : ""}" type="button" role="tab" aria-selected="${WH.tab === k}" data-wht="${k}">${ic(i)}<span>${n}</span></button>`).join("")}</div><div id="whBody" class="whbody"></div>`;
  const top = () => { const t = $("#whTop"); if (!t) return; t.innerHTML = whHero(whInfo()); whAnimate(t); whTick(); };
  top(); whTab(WH.tab, true);
  whFetch().then(() => { top(); if (WH.tab !== "live") whTab(WH.tab, true); }).catch(() => { const b = $("#whBody"); if (b && WH.tab !== "live") b.insertAdjacentHTML("afterbegin", `<p class="fine">Could not reach Lichess for the latest games. Showing what is saved.</p>`); });
  clearInterval(WH.t); WH.t = setInterval(() => { if (!$("#whTop")) { clearInterval(WH.t); clearInterval(WH.cd); return; } whFetch(true).then(() => { top(); if (WH.tab !== "live") whTab(WH.tab, true); }).catch(() => {}); }, 30000);
  clearInterval(WH.cd); WH.cd = setInterval(whTick, 1000);
}
function whTab(k, quiet) {
  WH.tab = k; document.querySelectorAll("[data-wht]").forEach((x) => { x.classList.toggle("on", x.dataset.wht === k); x.setAttribute("aria-selected", x.dataset.wht === k); }); const b = $("#whBody"); if (!b) return; const info = whInfo();
  if (k === "live") { b.innerHTML = `<div id="whGraph"></div><div id="wccLive" class="card lvcard whlivecard"></div><div id="whOpLine"></div>`; const pk = WH.pick; WH.pick = null; const lv = document.getElementById("wccLive"); if (pk) wccShow(pk.id, pk.name, !!pk.ongoing, lv).catch(() => { lv.innerHTML = `<p class="fine">Could not load that game.</p>`; }); else wccLive(WH.tour, lv); return; }
  if (WL) clearInterval(WL.timer);
  b.innerHTML = `<div class="whpane">${{ sched: whSched, score: whScore, players: whPlayers, open: whOpen, games: whGames }[k](info)}</div>`; whAnimate(b); whTick(); void quiet;
}
/* the evaluation graph on the live board: drag or tap to jump, with the game's biggest swings as shortcuts */
function whGraph() {
  const box = document.getElementById("whGraph"); if (!box || !WL || !WL.g) return; const G = WL.g, S = whSeries(G).map((v, i, a) => (v == null ? (i ? a[i - 1] : 50) : v)), N = S.length;
  if (N < 4) { box.innerHTML = ""; return; } const ply = WL.ply == null ? N : WL.ply, swings = S.map((v, i) => [i + 1, Math.abs(v - (i ? S[i - 1] : 50))]).sort((a, b) => b[1] - a[1]).slice(0, 3).filter((x) => x[1] >= 8).sort((a, b) => a[0] - b[0]);
  const cx = (ply / N) * 100;
  box.innerHTML = `<div class="card whgraph"><div class="whgh"><b>${ic("chart")}Who is winning, move by move</b><button type="button" class="chip ${PIPV.on ? "on" : ""}" data-whvoice>${PIPV.on ? "🔊" : "🔇"} Pip says each move</button><span class="fine">Stockfish's view from the broadcast. White up when the line is above the dotted middle (the height is zoomed to fit this game). Drag to scrub.</span></div>
    <div class="whgw" data-whg>${whSpark(G, { h: 90 })}<i class="whcur" style="left:${cx}%"></i></div>
    ${swings.length ? `<div class="whsw"><span class="fine">Biggest swings:</span>${swings.map(([p, d]) => `<button type="button" class="chip" data-whjump="${p}">${Math.ceil(p / 2)}${p % 2 ? "." : "..."} ${esc(G.mv[p - 1].san)} <small>${Math.round(d)}%</small></button>`).join("")}</div>` : ""}</div>`;
}
function whSched(info) {
  const next = info.rounds.find((x) => !x.done && !x.live), ics = WH.d ? `<button class="btn ghost" type="button" data-whics>${ic("clock")}Add all games to my calendar</button>` : "";
  const rows = info.rounds.map((x, k) => { const r = x.r, prev = k ? info.rounds[k - 1].r.startsAt : null, rest = prev && r.startsAt - prev > 1.5 * 864e5, d = new Date(r.startsAt), clickable = x.done || x.live;
    const gva = d.toLocaleTimeString("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" }), cl = x.live ? "live" : x.res ? "done" : next && next.i === x.i ? "next" : "";
    const st = x.live ? `<span class="lvbadge on">● LIVE</span>` : x.res ? `<span class="whres ${x.res === "1/2-1/2" ? "d" : "w"}">${whRes(x.res)}</span>` : cl === "next" ? `<span class="fine">next · <b class="num" data-cd="${r.startsAt}"></b></span>` : `<span class="fine">upcoming</span>`;
    return `${rest ? `<div class="whrest"><span>rest day</span></div>` : ""}<${clickable ? `button type="button" data-whround="${r.id}"` : "div"} class="whnode ${cl}" style="--k:${k}"><i class="whdot"></i><span class="whn"><b>${esc(r.name)}</b><span class="fine">${whWhen(r.startsAt)} · ${gva} in Geneva</span></span><span class="fine whcol">${x.white ? `${whName(x.white)} has White` : "colours drawn at the start"}</span>${st}</${clickable ? "button" : "div"}>`; }).join("");
  return `<div class="row" style="margin-bottom:8px">${ics}</div><p class="fine">Times are shown in your own time zone, with Geneva beside them. The organisers can move a start time; this follows the Lichess broadcast. Tap a game that has started to open it.</p><div class="whtl">${rows || '<p class="fine">Loading the schedule…</p>'}</div>`;
}
function whScore(info) {
  const need = 7.5, left = 14 - info.played, dr = info.rounds.filter((x) => x.res === "1/2-1/2").length, lead = info.pts.g - info.pts.s, tot = Math.max(info.pts.g + info.pts.s, 0.001);
  const ring = (k, p) => `<div class="whpr">${whRing(p / need, 118, `<b class="num" data-count="${p}" data-dec="1">${p}</b><small>of 7½</small>`, k)}<b>${whName(k)}</b><span class="fine">${p >= need ? "champion" : `needs ${need - p} more`}</span></div>`;
  const cells = info.rounds.map((x) => { const g = x.white === "g", cl = x.res ? (x.res === "1/2-1/2" ? "D" : (x.res === "1-0") === g ? "G" : "S") : ""; return `<button type="button" class="whcell ${cl}${x.live ? " live" : ""}" style="--k:${x.i}" ${x.done || x.live ? `data-whround="${x.r.id}"` : "disabled"} title="${esc(x.r.name)}"><small>${x.i}</small><b>${x.res ? whRes(x.res) : x.live ? "●" : "–"}</b><span>${x.white ? whName(x.white).slice(0, 3) + " · W" : ""}</span></button>`; }).join("");
  return `<div class="card whcard"><div class="whrings">${ring("g", info.pts.g)}<div class="whtug"><div class="whtugbar"><i class="g" style="width:${(info.pts.g / tot) * 100}%"></i><i class="s" style="width:${(info.pts.s / tot) * 100}%"></i></div><b>${info.played ? (lead === 0 ? "All square" : `${whName(lead > 0 ? "g" : "s")} leads by ${Math.abs(lead)}`) : "Level before the first move"}</b><span class="fine">${dr} draw${dr === 1 ? "" : "s"} · ${left} game${left === 1 ? "" : "s"} left</span></div>${ring("s", info.pts.s)}</div>
    <p class="fine">First to 7½ points wins the title. If it is 7–7 after 14 games, a tiebreak decides it (rapid, then blitz, then Armageddon).</p></div>
    <div class="card whcard" style="margin-top:12px"><h3 style="margin:0 0 10px">${ic("chart")}Game by game</h3><div class="whgrid">${cells}</div><p class="fine">Gold: Gukesh won. Green: Sindarov won. Grey: draw. The letters show who had White. Tap a game to open it.</p></div>`;
}
function whPlayers() {
  const a = cpP(CP_ID.gukesh), b = cpP(CP_ID.sindarov); if (!a || !b) return `<p class="fine">Player data is missing.</p>`;
  const rows = [["Classical", "std"], ["Rapid", "rap"], ["Blitz", "blz"], ["Peak classical", "peak"]].filter(([, k]) => a[k] || b[k]).map(([l, k]) => [l, a[k], b[k]]);
  const bar = ([l, x, y]) => { const lo = Math.min(x || 9e9, y || 9e9) - 150, hi = Math.max(x || 0, y || 0) + 30, wx = x ? ((x - lo) / (hi - lo)) * 100 : 0, wy = y ? ((y - lo) / (hi - lo)) * 100 : 0; return `<div class="whbar"><span class="num ${x > y ? "lead" : ""}">${x == null ? "—" : x}</span><div class="whbt"><i class="g" style="width:${wx}%"></i><i class="s" style="width:${wy}%"></i><small>${l}</small></div><span class="num ${y > x ? "lead" : ""}">${y == null ? "—" : y}</span></div>`; };
  const gap = (a.std || 0) - (b.std || 0), E = a.std && b.std ? 1 / (1 + Math.pow(10, -gap / 400)) : null, ea = E != null ? Math.round(E * 100) : null;
  return `<div class="card whcard"><div class="whcmp"><div class="whph g">${cpFace(a, "big")}<b>${esc(cpName(a))}</b><span class="fine">${cpFed(a)} · ${rkAge(a)} years old</span></div><div class="whph s">${cpFace(b, "big")}<b>${esc(cpName(b))}</b><span class="fine">${cpFed(b)} · ${rkAge(b)} years old</span></div></div>${rows.map(bar).join("")}</div>
    ${E != null ? `<div class="card whcard" style="margin-top:12px"><h3 style="margin:0 0 8px">${ic("chart")}What the ratings say</h3><div class="whodds"><i class="g" style="width:${ea}%"><b>${ea}%</b></i><i class="s" style="width:${100 - ea}%"><b>${100 - ea}%</b></i></div><p class="fine">Expected share of the points by classical rating alone (gap ${Math.abs(gap)}). It is just the Elo formula: it ignores form, preparation and colours, and between players this close most games are drawn, so treat it as a gentle lean, not a forecast.</p></div>` : ""}
    <div class="row" style="margin-top:12px"><button class="btn" type="button" data-rkp="${CP_ID.gukesh}">${esc(cpName(a))}: full profile</button><button class="btn" type="button" data-rkp="${CP_ID.sindarov}">${esc(cpName(b))}: full profile</button><button class="btn ghost" type="button" data-whh2h>${ic("swords")}Head to head: all their games</button></div>`;
}
function whOpen(info) {
  const rows = info.rounds.filter((x) => x.sans.length >= 2).map((x) => ({ x, o: whOpening(x.sans) }));
  if (!rows.length) return `<div class="card whcard"><p>No game has started yet, so there is no opening to show. When Game 1 begins, each game's opening appears here: its name, how long it stayed in theory, and a button that opens the position in the explorer to see what the masters played from there.</p></div>`;
  const cnt = {}; rows.forEach((r) => { if (r.o.name) cnt[r.o.name] = (cnt[r.o.name] || 0) + 1; });
  return `<div class="whcards">${rows.map(({ x, o }, k) => { const n = x.sans.length, tp = n ? Math.min(100, (o.k / n) * 100) : 0; return `<div class="card whcard whop" style="--k:${k}"><span class="whkick2">${esc(x.r.name)} · ${whName(x.white)} had White</span><h3>${esc(o.name || "No standard opening name")}</h3><div class="whmoves">${x.sans.slice(0, 12).map((s, j) => `<span class="${j < o.k ? "bk" : ""}">${j % 2 ? "" : `<small>${j / 2 + 1}.</small>`}${esc(s)}</span>`).join("")}${n > 12 ? "<span>…</span>" : ""}</div><div class="whtheory"><i style="width:${tp}%"></i></div><p class="fine">${o.k ? `Theory for ${Math.ceil(o.k / 2)} move${o.k > 2 ? "s" : ""} (highlighted), then their own ideas.` : "Left the known lines straight away."}${cnt[o.name] > 1 ? ` Played ${cnt[o.name]} times in this match.` : ""}</p><button class="btn ghost" type="button" data-whop="${x.r.id}">${ic("compass")}Explore this opening</button></div>`; }).join("")}</div><p class="fine">Names come from the site's opening list (${(OPEN || []).length} lines). Explore opens the master-game database from the position where the game left theory.</p>`;
}
function whGames(info) {
  const rows = info.rounds.filter((x) => x.sans.length);
  if (!rows.length) return `<div class="card whcard"><p>No games yet. Game 1 is on ${WH.d ? whWhen(WH.d.rounds[0].startsAt, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "24 November"}.</p></div>`;
  return `<div class="whcards">${rows.map((x, k) => `<div class="card whcard whgame" style="--k:${k}"><div class="whgt"><b>${esc(x.r.name)}</b><span class="${x.live ? "lvbadge on" : "whres " + (x.res === "1/2-1/2" ? "d" : "w")}">${x.live ? "● LIVE" : whRes(x.res) || "unfinished"}</span></div><p class="fine">${esc(whName(x.white))} (White) vs ${esc(whName(x.white === "g" ? "s" : "g"))} · ${Math.ceil(x.sans.length / 2)} moves${whOpening(x.sans).name ? " · " + esc(whOpening(x.sans).name) : ""}</p>${whSpark(x.G, { h: 48 })}<div class="row"><button class="btn ghost" type="button" data-whround="${x.r.id}">${ic("play")}Replay</button><button class="btn ghost" type="button" data-whrev="${x.r.id}">${ic("chart")}Review</button><button class="btn ghost" type="button" data-whplay="${x.r.id}">${ic("robot")}Play off</button></div></div>`).join("")}</div>`;
}
function whIcs() {
  const z = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""), L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ballknowledge//WCC//EN"];
  WH.d.rounds.forEach((r) => L.push("BEGIN:VEVENT", `UID:${r.id}@ballknowledge`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(r.startsAt)}`, `DTEND:${z(r.startsAt + 5 * 36e5)}`, `SUMMARY:World Championship ${r.name}: Gukesh vs Sindarov`, "LOCATION:Geneva, Switzerland", "END:VEVENT"));
  L.push("END:VCALENDAR"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([L.join("\r\n")], { type: "text/calendar" })); a.download = "world-championship-2026.ics"; document.body.appendChild(a); a.click(); a.remove(); toast("Calendar file saved. Game lengths are about 5 hours.");
}
function whSans(id, upTo) { const x = whInfo().rounds.find((r) => r.r.id === id); return x && x.G ? { x, sans: x.sans.slice(0, upTo == null ? undefined : upTo) } : null; }
document.addEventListener("click", (e) => {
  if (st.game !== "champ" || CH.v !== "wcc") return; const t = e.target.closest && e.target.closest("[data-wht],[data-whround],[data-whrev],[data-whplay],[data-whop],[data-whics],[data-whh2h],[data-whan],[data-whjump],[data-whvoice]"); if (!t) return;
  if (t.dataset.whvoice != null) { e.stopPropagation(); PIPV.on = !PIPV.on; try { localStorage.setItem("bk_pip_voice", PIPV.on ? "1" : "0"); } catch (x) { /* private */ } if (!PIPV.on) AIVoice.stop(); else WH.said = ""; whGraph(); if (PIPV.on) whSpeak(); return; }
  if (t.dataset.wht) { e.stopPropagation(); return whTab(t.dataset.wht); }
  if (t.dataset.whics != null) { e.stopPropagation(); return whIcs(); }
  if (t.dataset.whh2h != null) { e.stopPropagation(); return h2hPage(CP_ID.gukesh, CP_ID.sindarov); }
  if (t.dataset.whjump && WL) { e.stopPropagation(); WL.ply = Math.min(WL.g.mv.length, +t.dataset.whjump); if (WL.ply === WL.g.mv.length) WL.ply = null; return wccPaint(); }
  if (t.dataset.whround) { e.stopPropagation(); WH.tab = "live"; WH.pick = WH.d.rounds.find((x) => x.id === t.dataset.whround); wccHub($("#app")); return scrollTo({ top: 0, behavior: "smooth" }); }
  const id = t.dataset.whrev || t.dataset.whplay || t.dataset.whop, S = id ? whSans(id) : null;
  if (t.dataset.whrev && S) { e.stopPropagation(); return reviewStart(S.sans, "w", { from: "champ", names: [S.x.h.White, S.x.h.Black], result: S.x.h.Result }); }
  if (t.dataset.whplay && S) { e.stopPropagation(); const c = new Chess(); S.sans.forEach((s) => c.move(s, { sloppy: true })); st.clock = 0; return aiStart(6, c.turn(), c.fen()); }
  if (t.dataset.whop && S) { e.stopPropagation(); const o = whOpening(S.sans); EX.sans = S.sans.slice(0, Math.max(o.k, 2)); EX.sel = null; EX.tab = "name"; EX.quiz = null; st = { game: "x" }; return explorerPage(); }
  if (t.dataset.whan != null && WL) { e.stopPropagation(); clearInterval(WL.timer); const g = WL.g, ply = WL.ply == null ? g.mv.length : WL.ply, sans = g.mv.map((m) => m.san); reviewStart(sans, "w", { from: "champ", names: [g.h.White || "White", g.h.Black || "Black"], result: g.h.Result }); setTimeout(() => { try { rvGo(ply, { sound: false }); rvxStart(); } catch (x) { /* review not ready */ } }, 500); }
}, true);
/* scrub the evaluation graph */
(() => { let down = false; const at = (e) => { const w = e.target.closest && e.target.closest("[data-whg]"); if (!w || !WL || !WL.g) return; const r = w.getBoundingClientRect(), N = WL.g.mv.length, p = Math.max(0, Math.min(N, Math.round(((e.clientX - r.left) / r.width) * N))); WL.ply = p === N ? null : p; wccPaint(); };
  document.addEventListener("pointerdown", (e) => { if (e.target.closest && e.target.closest("[data-whg]")) { down = true; at(e); } }); document.addEventListener("pointermove", (e) => { if (down) at(e); }); document.addEventListener("pointerup", () => { down = false; }); })();
/* the coach says his line aloud for the move on the board (same text as the one shown, so its recorded clip plays) */
function whCls(g, ply) { const cur = g.mv[ply - 1]; if (!cur) return "start"; const cp = liCp(cur.ev), prev = ply > 1 ? liCp(g.mv[ply - 2].ev) : 20, white = ply % 2 === 1, pov = (x) => (white ? x : 100 - x), loss = cp != null && prev != null ? Math.max(0, pov(wpct(prev)) - pov(wpct(cp))) : 0; return cur.san.endsWith("#") ? "mate" : loss < 2 ? "good" : loss < 6 ? "excellent" : loss < 11 ? "inaccuracy" : loss < 21 ? "mistake" : "blunder"; }
function whSpeak() { if (!WL || !WL.g) return; const ply = WL.ply == null ? WL.g.mv.length : WL.ply, key = WL.round + ":" + ply; if (!ply || WH.said === key) return; WH.said = key; clearTimeout(WH.say); WH.say = setTimeout(() => { try { if (WL && (WL.ply == null ? WL.g.mv.length : WL.ply) === ply) pipSay(pipPick(whCls(WL.g, ply), ply)); } catch (e) { /* quiet */ } }, 600); }
/* the live board gets an "Analyse this position" button, the opening's name and the graph */
setTimeout(() => {
  if (typeof wccPaint !== "function") return; const p0 = wccPaint;
  try { wccPaint = function () { p0.apply(this, arguments); try { const el = WL.el, row = el.querySelector("[data-lvplay]") ? el.querySelector("[data-lvplay]").parentNode : el.querySelector("[data-lvrev]") ? el.querySelector("[data-lvrev]").parentNode : null;
    if (row && !row.querySelector("[data-whan]")) row.insertAdjacentHTML("afterbegin", `<button class="btn" data-whan type="button">${ic("compass")}Analyse this position</button>`);
    const ply = WL.ply == null ? WL.g.mv.length : WL.ply, o = whOpening(WL.g.mv.slice(0, ply).map((m) => m.san)), ol = document.getElementById("whOpLine"); if (ol) ol.innerHTML = o.name ? `<p class="fine" style="margin:8px 2px">${ic("book")}Opening: <b>${esc(o.name)}</b></p>` : ""; whGraph(); whSpeak(); } catch (e) { /* plain board */ } }; } catch (e) { /* skip */ }
}, 0);
(() => { const s = document.createElement("style"); s.textContent = `
.whhero{position:relative;overflow:hidden;border-radius:26px;padding:26px 18px 0;color:#f4f1ea;background:radial-gradient(120% 90% at 20% 0%,#2a3a5e 0%,transparent 60%),radial-gradient(100% 80% at 85% 10%,#5a3a1a 0%,transparent 55%),linear-gradient(160deg,#0d1220,#171109 70%);border:1px solid #ffffff22;box-shadow:0 30px 70px -34px #000,inset 0 1px 0 #ffffff22;isolation:isolate}
.whhero:before{content:"";position:absolute;inset:0;z-index:-1;opacity:.14;background:conic-gradient(#fff 25%,transparent 0 50%,#fff 0 75%,transparent 0) 0 0/46px 46px;mask:radial-gradient(70% 70% at 50% 40%,#000,transparent);-webkit-mask:radial-gradient(70% 70% at 50% 40%,#000,transparent);animation:whdrift 40s linear infinite}
.whhero:after{content:"";position:absolute;top:-30%;left:-40%;width:50%;height:160%;z-index:-1;background:linear-gradient(100deg,transparent,#ffffff1c,transparent);transform:rotate(12deg);animation:whsweep 9s ease-in-out infinite}
@keyframes whdrift{to{background-position:92px 46px}}@keyframes whsweep{0%{left:-50%}55%,100%{left:120%}}
.whbg .p{position:absolute;font-style:normal;color:#ffffff;opacity:.07;font-size:90px;line-height:1;animation:whfloat 12s ease-in-out infinite;pointer-events:none}.whbg .p1{left:3%;top:6%}.whbg .p2{right:4%;top:14%;animation-delay:-3s;font-size:110px}.whbg .p3{left:16%;bottom:24%;animation-delay:-6s;font-size:70px}.whbg .p4{right:18%;bottom:30%;animation-delay:-8s;font-size:80px}.whbg .p5{left:44%;top:4%;animation-delay:-4s;font-size:60px}.whbg .p6{right:42%;bottom:20%;animation-delay:-9s;font-size:60px}
@keyframes whfloat{50%{transform:translateY(-14px) rotate(4deg)}}
.whkick{margin:0;text-align:center;font:700 11px/1 var(--mono);letter-spacing:.28em;text-transform:uppercase;color:#e8c35a}
.whtitle{margin:8px 0 18px;text-align:center;font-size:clamp(26px,5.4vw,44px);line-height:1.05;letter-spacing:.02em;background:linear-gradient(90deg,#f4f1ea 0%,#e8c35a 40%,#f4f1ea 60%,#e8c35a 100%);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:whshine 7s linear infinite}
@keyframes whshine{to{background-position:-220% 0}}
.whface-off{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px}
.whplayer{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:14px 8px;border-radius:20px;border:1px solid #ffffff26;background:linear-gradient(180deg,#ffffff14,#ffffff05);color:inherit;font:inherit;cursor:pointer;transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s,border-color .35s;animation:whin .8s cubic-bezier(.2,.8,.2,1) both}
.whplayer.s{animation-delay:.12s}.whplayer:hover{transform:translateY(-6px) scale(1.02);border-color:#e8c35a99;box-shadow:0 22px 40px -22px #e8c35a}
@keyframes whin{from{opacity:0;transform:translateY(22px) scale(.96)}}

.whrole{font:700 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:#e8c35a}.whplayer b{font-size:clamp(15px,3.4vw,20px)}
.whelo{display:flex;flex-direction:column;align-items:center}.whelo b{font-size:30px;color:#e8c35a}.whelo small{font-size:10px;letter-spacing:.12em;text-transform:uppercase;opacity:.7}
.whmid{display:flex;flex-direction:column;align-items:center;gap:4px}.whscore{display:flex;align-items:center;gap:6px;font-size:clamp(34px,8vw,60px);font-weight:800;text-shadow:0 0 30px #e8c35a88}.whscore i{opacity:.5;font-style:normal}.whvs{font:800 clamp(22px,5vw,34px)/1 var(--mono);color:#e8c35a;letter-spacing:.1em}.whfirst{font:700 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;opacity:.65}
.whstrip{display:flex;gap:5px;margin:18px 0 8px;justify-content:center;flex-wrap:wrap}.whseg{width:30px;height:30px;border-radius:9px;border:1px solid #ffffff33;background:#ffffff0d;color:#f4f1ea;font:700 11px var(--mono);cursor:pointer;transition:transform .2s,background .2s;display:grid;place-items:center}.whseg:disabled{cursor:default;opacity:.55}.whseg:not(:disabled):hover{transform:translateY(-3px)}
.whseg.wg{background:#e8c35a;color:#1a1306;border-color:#e8c35a}.whseg.ws{background:#4fc27a;color:#06210f;border-color:#4fc27a}.whseg.d{background:#8a8f99;color:#10131a;border-color:#8a8f99}.whseg.live{background:#ff4d4d;border-color:#ff4d4d;animation:whpulse 1.4s infinite}.whseg.next{border-color:#e8c35a;box-shadow:0 0 0 0 #e8c35a99;animation:whpulse2 2s infinite;opacity:1}
@keyframes whpulse{70%{box-shadow:0 0 0 10px #ff4d4d00}}@keyframes whpulse2{70%{box-shadow:0 0 0 9px #e8c35a00}}
.whstat{display:flex;justify-content:center;padding:8px 0 16px;min-height:40px}.whlive{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center}.whev{padding:3px 9px;border-radius:99px;font-weight:800}.whev.w{background:#f4f1ea;color:#101512}.whev.b{background:#101512;color:#f4f1ea;border:1px solid #ffffff44}
.whcd{display:flex;align-items:center;gap:14px;text-align:left}.whcd>div{display:flex;flex-direction:column;gap:2px}.whcd b{font-size:20px}.whcd span{opacity:.85}
.whring{position:relative;display:grid;place-items:center}.whring svg{position:absolute;inset:0;width:100%;height:100%}.whring-p{animation:whdraw 1.6s cubic-bezier(.2,.8,.2,1) both}@keyframes whdraw{from{stroke-dashoffset:var(--c)}}.whring-i{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05}.whring-i b{font-size:19px}.whcd .whring-i b{font-size:15px;letter-spacing:-.01em}.whring-i small{font-size:9px;letter-spacing:.12em;text-transform:uppercase;opacity:.65}
.whticker{margin:0 -18px;border-top:1px solid #ffffff22;background:#00000033;overflow:hidden;white-space:nowrap}.whticker>div{display:inline-flex;gap:34px;padding:9px 0;animation:whtick 46s linear infinite;font:600 12px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:#e8c35add}.whticker span:before{content:"♞";margin-right:10px;opacity:.6}@keyframes whtick{to{transform:translateX(-50%)}}
.whtabs{position:sticky;top:0;z-index:20;display:flex;gap:6px;overflow-x:auto;padding:10px 2px;margin:14px 0 4px;background:linear-gradient(var(--bg,var(--panel)) 70%,transparent);scrollbar-width:none}.whtabs::-webkit-scrollbar{display:none}
.whtab{display:flex;align-items:center;gap:7px;padding:10px 16px;border-radius:99px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:700 14px var(--font,inherit);cursor:pointer;white-space:nowrap;transition:transform .2s,background .25s,color .25s,box-shadow .25s}.whtab:hover{transform:translateY(-2px)}.whtab.on{background:linear-gradient(135deg,#e8c35a,#c99a2e);color:#1a1306;border-color:transparent;box-shadow:0 10px 24px -12px #e8c35a}
.whbody{animation:whfade .45s ease both}.whpane{animation:whfade .45s ease both}@keyframes whfade{from{opacity:0;transform:translateY(10px)}}
.whcard{animation:whfade .5s ease both}.whcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px}.whcards .whcard{animation-delay:calc(var(--k)*70ms)}
.whgraph{margin-bottom:12px}.whgh{display:flex;flex-direction:column;gap:2px;margin-bottom:8px}.whgw{position:relative;border-radius:12px;overflow:hidden;background:#0d1220;color:#f4f1ea;cursor:ew-resize;touch-action:none}.whspark{display:block;width:100%;height:100%}.whgw .whspark{height:90px}.whline{stroke-dasharray:1;stroke-dashoffset:0;animation:whdrawl 1.8s ease both}@keyframes whdrawl{from{stroke-dashoffset:1}}
.whcur{position:absolute;top:0;bottom:0;width:2px;background:#e8c35a;box-shadow:0 0 12px #e8c35a;transform:translateX(-1px);pointer-events:none}.whsw{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}
.whlivecard{animation:whfade .5s ease both}
.whtl{position:relative;display:flex;flex-direction:column;gap:8px;padding-left:22px}.whtl:before{content:"";position:absolute;left:8px;top:6px;bottom:6px;width:2px;background:linear-gradient(var(--gold),var(--line));border-radius:2px}
.whnode{position:relative;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:10px;padding:12px 14px;border-radius:16px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;text-align:left;animation:whin .6s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--k)*45ms)}button.whnode{cursor:pointer}button.whnode:hover{transform:translateX(4px);border-color:var(--gold)}
.whdot{position:absolute;left:-19px;top:50%;width:12px;height:12px;border-radius:50%;background:var(--surface);border:2px solid var(--line);transform:translateY(-50%)}.whnode.done .whdot{background:var(--gold);border-color:var(--gold)}.whnode.live{border-color:#ff4d4d}.whnode.live .whdot{background:#ff4d4d;border-color:#ff4d4d;animation:whpulse 1.4s infinite}.whnode.next{border-color:var(--gold);background:linear-gradient(100deg,color-mix(in srgb,var(--gold) 14%,transparent),transparent 70%),var(--surface)}.whnode.next .whdot{border-color:var(--gold);animation:whpulse2 2s infinite}
.whn{display:flex;flex-direction:column;gap:2px}.whrest{margin:4px 0 4px 6px;font:700 10px var(--mono);letter-spacing:.16em;text-transform:uppercase;opacity:.55}
.whres{padding:4px 10px;border-radius:99px;font:800 13px var(--mono);background:var(--gold);color:#1a1306}.whres.d{background:var(--muted);color:var(--ink)}
@media(max-width:560px){.whnode{grid-template-columns:1fr auto}.whcol{display:none}.whface-off{grid-template-columns:1fr 1fr}.whmid{grid-column:1/3;grid-row:1;flex-direction:row;justify-content:center;gap:12px}.whplayer{padding:12px 6px}.whgrid{grid-template-columns:repeat(4,1fr)!important}}
.whrings{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px}.whpr{display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center}.whpr b{font-size:16px}.whring-i .num{font-size:28px}.whring.s .whring-p{stroke:#4fc27a}
.whtug{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}.whtugbar{display:flex;width:100%;height:14px;border-radius:99px;overflow:hidden;background:var(--line)}.whtugbar i{height:100%;transition:width 1s cubic-bezier(.2,.8,.2,1)}.whtugbar .g{background:#e8c35a}.whtugbar .s{background:#4fc27a}
@media(max-width:560px){.whrings{grid-template-columns:1fr 1fr}.whtug{grid-column:1/3;grid-row:2}}
.whgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}.whcell{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 2px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;animation:whin .5s ease both;animation-delay:calc(var(--k)*40ms);transition:transform .2s}.whcell:not(:disabled){cursor:pointer}.whcell:not(:disabled):hover{transform:translateY(-4px)}.whcell small{opacity:.6;font-size:11px}.whcell b{font-size:18px}.whcell span{font-size:10px;opacity:.7}
.whcell.G{background:color-mix(in srgb,#e8c35a 38%,var(--surface))}.whcell.S{background:color-mix(in srgb,#4fc27a 38%,var(--surface))}.whcell.D{background:color-mix(in srgb,var(--muted) 28%,var(--surface))}.whcell.live{outline:2px solid #ff4d4d;animation:whpulse 1.4s infinite}
.whcmp{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}.whph{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}.whph b{font-size:18px}
.whbar{display:grid;grid-template-columns:54px 1fr 54px;align-items:center;gap:10px;margin:10px 0}.whbar .num{font-size:20px;font-weight:700;text-align:center;opacity:.7}.whbar .num.lead{opacity:1;color:var(--gold)}.whbt{position:relative;display:flex;flex-direction:column;gap:4px}.whbt i{display:block;height:9px;border-radius:99px;transition:width 1.2s cubic-bezier(.2,.8,.2,1);animation:whgrow 1.2s cubic-bezier(.2,.8,.2,1) both}.whbt .g{background:#e8c35a}.whbt .s{background:#4fc27a}.whbt small{text-align:center;font:700 10px var(--mono);letter-spacing:.14em;text-transform:uppercase;opacity:.6}@keyframes whgrow{from{width:0!important}}
.whodds{display:flex;height:34px;border-radius:99px;overflow:hidden}.whodds i{display:flex;align-items:center;justify-content:center;font-style:normal;animation:whgrow 1.2s cubic-bezier(.2,.8,.2,1) both}.whodds .g{background:#e8c35a;color:#1a1306}.whodds .s{background:#4fc27a;color:#06210f}
.whkick2{font:700 10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}.whop h3,.whgame h3{margin:6px 0}.whop h3{font-size:20px}.whmoves{display:flex;flex-wrap:wrap;gap:4px 8px;font:600 14px var(--mono);margin:8px 0}.whmoves small{opacity:.5;margin-right:2px}.whmoves .bk{color:var(--gold)}.whtheory{height:6px;border-radius:99px;background:var(--line);overflow:hidden}.whtheory i{display:block;height:100%;background:linear-gradient(90deg,#e8c35a,#4fc27a);animation:whgrow 1.2s ease both}
.whgt{display:flex;justify-content:space-between;align-items:center}.whgame .whspark{height:48px;width:100%;margin:8px 0;border-radius:10px;background:#0d1220;color:#f4f1ea}

.whcity{position:absolute;inset:0;z-index:-2;background:url(img/geneva.jpg) center 60%/cover;opacity:.5;animation:whken 36s ease-in-out infinite alternate}@keyframes whken{to{transform:scale(1.12) translateX(-2%)}}
.whhero{background:linear-gradient(180deg,#0d1220cc 0%,#0d122080 35%,#0d1220f2 100%),radial-gradient(100% 80% at 85% 10%,#5a3a1a66 0%,transparent 55%),#0d1220!important}
.whplayer .whpic{position:relative;display:grid;place-items:center;width:100%;aspect-ratio:3/4;max-height:330px;border-radius:16px;overflow:hidden;background:#0d1220}.whplayer .whpic .cpf{opacity:.6}.whplayer .whpic:after{content:"";position:absolute;inset:0;background:var(--img) center 15%/cover;-webkit-mask:linear-gradient(#000 62%,transparent);mask:linear-gradient(#000 62%,transparent);transition:transform .8s cubic-bezier(.2,.8,.2,1)}.whplayer:hover .whpic:after{transform:scale(1.07)}
.whplayer.g .whpic:after{background-position:center 12%}.whplayer.s .whpic:after{background-position:center 20%}
.whcred{margin:0 -4px;padding:8px 4px 10px;font-size:10px;opacity:.55;text-align:center}
@media(prefers-reduced-motion:reduce){.whcity{animation:none}}
@media(prefers-reduced-motion:reduce){.whhero:before,.whhero:after,.whbg .p,.whtitle,.whplayer,.whplayer .whface,.whplayer .whface .cpf,.whticker>div,.whseg.live,.whseg.next,.whring-p,.whbody,.whpane,.whcard,.whnode,.whcell,.whline,.whbt i,.whodds i,.whtheory i{animation:none!important}.whtitle{color:#e8c35a;background:none}}`; document.head.appendChild(s); })();

/* the championship on the chess home screen: a banner above everything, live score and countdown */
function whBannerHTML() {
  const info = whInfo(), gk = cpP(CP_ID.gukesh), sn = cpP(CP_ID.sindarov), live = info.rounds.find((x) => x.live), rs = WH.d ? WH.d.rounds : [], next = rs.find((r) => !r.finished && !r.ongoing && r.startsAt > Date.now());
  const line = live ? `<span class="lvbadge on">● LIVE</span> Game ${live.i} is on now` : next ? `${esc(next.name)} · ${whWhen(next.startsAt)} · <b class="num" data-cd="${next.startsAt}"></b>` : info.played >= 14 ? "The match is over" : "24 Nov – 11 Dec · Geneva";
  return `<button type="button" class="whbanner" data-whhome aria-label="Open the World Championship"><i class="whbn-bg" aria-hidden="true"></i><span class="whbn-k">${ic("crown")} World Chess Championship · live</span>
    <span class="whbn-row"><span class="whbn-p">${cpFace(gk)}<b>Gukesh</b></span><span class="whbn-s num">${info.played || live ? `${info.pts.g}<i>:</i>${info.pts.s}` : "VS"}</span><span class="whbn-p">${cpFace(sn)}<b>Sindarov</b></span></span>
    <span class="whbn-l">${line}</span><span class="whbn-go">Open the match: live board, analysis, schedule, openings →</span></button>`;
}
function whBanner() {
  const app = document.getElementById("app"); if (!app || document.getElementById("whBannerBox") || !document.querySelector(".hero2")) return;
  app.insertAdjacentHTML("afterbegin", `<div id="whBannerBox">${whBannerHTML()}</div>`); whTick();
  whFetch().then(() => { const b = document.getElementById("whBannerBox"); if (b) { b.innerHTML = whBannerHTML(); whTick(); } }).catch(() => {});
  clearInterval(WH.hb); WH.hb = setInterval(() => { const b = document.getElementById("whBannerBox"); if (!b) return clearInterval(WH.hb); whTick(); }, 1000);
}
setTimeout(() => {
  if (typeof home === "function") { const h0 = home; try { home = function () { h0.apply(this, arguments); whBanner(); }; GO.home = home; } catch (e) { /* skip */ } }
  if (document.querySelector(".hero2")) whBanner();
}, 0);
document.addEventListener("click", (e) => { const t = e.target.closest && e.target.closest("[data-whhome]"); if (!t) return; e.stopPropagation(); try { Snd.tick(); } catch (x) { /* quiet */ } CH.v = "wcc"; WH.tab = "live"; champPage("wcc"); scrollTo({ top: 0 }); }, true);
(() => { const s = document.createElement("style"); s.textContent = `
#whBannerBox{margin-bottom:14px}.whbanner{position:relative;overflow:hidden;display:grid;gap:8px;width:100%;text-align:center;padding:16px 14px;border-radius:22px;border:1px solid #ffffff2a;color:#f4f1ea;font:inherit;cursor:pointer;background:radial-gradient(120% 120% at 15% 0%,#2a3a5e,transparent 60%),radial-gradient(100% 100% at 90% 0%,#5a3a1a,transparent 55%),#0d1220;box-shadow:0 24px 50px -28px #000;transition:transform .3s,box-shadow .3s;isolation:isolate}.whbanner:hover{transform:translateY(-3px);box-shadow:0 30px 56px -26px #e8c35a}
.whbn-bg{position:absolute;inset:0;z-index:-1;opacity:.14;background:conic-gradient(#fff 25%,transparent 0 50%,#fff 0 75%,transparent 0) 0 0/40px 40px;mask:radial-gradient(80% 80% at 50% 30%,#000,transparent);-webkit-mask:radial-gradient(80% 80% at 50% 30%,#000,transparent);animation:whdrift 40s linear infinite}
.whbn-k{font:700 11px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:#e8c35a}.whbn-k .ic{width:14px;height:14px;vertical-align:-2px}.whbn-row{display:flex;align-items:center;justify-content:center;gap:14px}.whbn-p{display:flex;flex-direction:column;align-items:center;gap:4px}.whbn-p b{font-size:15px}.whbn-s{font-size:34px;font-weight:800;text-shadow:0 0 24px #e8c35a88}.whbn-s i{opacity:.5;font-style:normal;margin:0 4px}.whbn-l{font-size:14px;opacity:.9}.whbn-go{font:700 12px var(--mono);letter-spacing:.06em;color:#e8c35a}
@media(prefers-reduced-motion:reduce){.whbn-bg{animation:none}}`; document.head.appendChild(s); })();

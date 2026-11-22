/* =====================================================================================================================
   ballknowledge BASKETBALL overlay. Injected by src/63_build_nba_arena.py into site/nba_template.html just before the site boots.
   It replaces or extends the football code above it (same single-page engine: accounts, online rooms, difficulty, buzzers).
   Data rules: only what the box scores (2001-02 on) and Wikidata really say. Nothing is guessed.
   ===================================================================================================================== */
const SPORT = "nba";
const COVER = "2001-02";                                   // the box scores start with this season, so every "career" fact says "since 2001-02"
const ftIn = (cm) => { const i = Math.round(cm / 2.54); return `${Math.floor(i / 12)} ft ${i % 12} in`; };
Object.assign(POSICON, { Guard: "<svg class=ic><use href=#i-gear></use></svg>", Forward: "<svg class=ic><use href=#i-shield></use></svg>", Center: "<svg class=ic><use href=#i-ball></use></svg>" });
Object.assign(POSNAME, { Guard: "Guards", Forward: "Forwards", Center: "Centers" });
const AWN = { MVP: "NBA MVP", FMVP: "Finals MVP", DPOY: "Defensive Player of the Year", ROY: "Rookie of the Year", "6MOY": "Sixth Man of the Year", MIP: "Most Improved Player" };
const ordSeason = (s) => s;                                  // "2011-12" is already how fans write a season
const POSLONG = (p) => (p.sub || p.pos || "player").toLowerCase();
const natOf = (p) => p.nat || "";
/* the data files every season under today's franchise name; in text that names a season, use the name the team had then
   (Ray Allen's 2006-07 was with the Seattle SuperSonics, not the Thunder) */
const nbEra = (team, season) => { const y = +String(season || "").slice(0, 4); if (!y) return team; if (team === "Thunder" && y < 2008) return "SuperSonics"; if (team === "Pelicans" && y < 2013) return "Hornets"; if (team === "Hornets" && y >= 2004 && y < 2014) return "Bobcats"; return team; };
const nbSeasonOf = (d) => { const t = new Date(d); return isNaN(t) ? "" : String(t.getUTCMonth() >= 7 ? t.getUTCFullYear() : t.getUTCFullYear() - 1); };
const nbEraSpan = (team, from, to) => { const a = nbEra(team, from), b = nbEra(team, to); return a === b ? a : `${a}/${b}`; };
const bestLine = (b, unit) => (b ? `${b.avg} ${unit} a game in ${b.season} (${nbEra(b.team, b.season)})` : "");
const PLAYOFF_ROUND = ["Missed the playoffs", "Lost in the first round", "Lost in the second round", "Lost in the conference finals", "Reached the NBA Finals but lost", "Won the NBA title"];

/* ---------- clue ladders, hardest first ---------- */
function playerClues(p) {
  const a = ageOf(p), prevT = (p.cr && p.cr.length ? p.cr.filter(([t]) => !sameClub(t, p.club)).map(([t, f, to]) => ({ t, n: nbEraSpan(t, f, to) })) : p.hist.filter((c) => !sameClub(c, p.club)).map((t) => ({ t, n: t }))).filter((c, i, arr) => arr.findIndex((x) => x.n === c.n) === i).slice(-3), prev = prevT.map((x) => x.n), cl = [];
  if (p.city || p.bc) cl.push(["Birthplace", `Born in ${p.city ? p.city + (p.bc && p.bc !== p.city ? ", " + p.bc : "") : p.bc}`, flagOf(p.bc || p.nat)]);
  if (p.h) cl.push(["Height", `${ftIn(p.h)} tall (${Math.round(p.h)} cm)`]);
  cl.push(["Age", `${a} years old (born ${p.dob.slice(0, 4)})`]);
  if (p.bp && p.bp.avg >= 10) cl.push(["Scoring", `Best scoring season since ${COVER}: ${bestLine(p.bp, "points")}`]);
  if (p.br && p.br.avg >= 6) cl.push(["Rebounding", `Best rebounding season since ${COVER}: ${bestLine(p.br, "rebounds")}`]);
  if (p.ba && p.ba.avg >= 4.5) cl.push(["Passing", `Best passing season since ${COVER}: ${bestLine(p.ba, "assists")}`]);
  if (p.pts >= 5000) cl.push(["Career", `${p.pts.toLocaleString("en-US")} points, ${p.reb.toLocaleString("en-US")} rebounds and ${p.ast.toLocaleString("en-US")} assists since ${COVER}`]);
  if ((p.aw || []).length) cl.push(["Awards", `Won ${Object.entries(p.aw.reduce((m, [k, s]) => { (m[k] = m[k] || []).push(s); return m; }, {})).map(([k, v]) => `${AWN[k]} (${v.join(", ")})`).join("; ")}`, "<svg class=ic><use href=#i-medal></use></svg>"]);
  if ((p.ti || []).length) cl.push(["Titles", `NBA champion ${p.ti.length > 1 ? p.ti.length + " times" : "once"}: ${p.ti.map((t) => `${nbEra(t.team, t.season)} ${t.season}`).join(", ")}`, "<svg class=ic><use href=#i-trophy></use></svg>"]);
  cl.push(["Position", `${p.sub || p.pos}`, POSICON[p.pos] || ""]);
  cl.push(["Nationality", p.nat || p.bc, flagOf(p.nat || p.bc)]);
  if (prev.length) cl.push(["Earlier teams", `Previously with ${prev.join(", ")}`, prevT.map((x) => clubBadgeFor(x.t, "sm")).join("")]);
  if (p.club) cl.push(["Team", `${p.active ? "Plays for" : "Last team:"} ${p.club}`, clubBadgeFor(p.club, "sm")]);
  cl.push(["Name", `${p.n.split(" ").length} word${p.n.split(" ").length > 1 ? "s" : ""}, ${p.n.replace(/ /g, "").length} letters, starts with ${p.n[0]}`]);
  return cl;
}
function careerClues(p) {
  const cl = [], seen = [];
  p.cr.forEach(([team, from, to], i) => cl.push([i === 0 ? "Started" : `Move ${i}`, i === 0 ? `Career began with the ${nbEraSpan(team, from, to)}` : `Then the ${nbEraSpan(team, from, to)}`, clubBadgeFor(team, "sm")]));
  cl.push(["Age", `${ageOf(p)} years old`]); cl.push(["Nationality", p.nat || p.bc, flagOf(p.nat || p.bc)]); cl.push(["Position", p.sub || p.pos, POSICON[p.pos] || ""]);
  cl.push(["Name", `Starts with ${p.n[0]}, ${p.n.replace(/ /g, "").length} letters`]);
  return cl;
}
function clubClues(e) {
  const r = e.row, f = QZ.clubs[e.n] || {}, cl = [], po = r[7] | 0;
  cl.push(["Defence", `Allowed ${r[3].toFixed(1)} points a game in ${e.season}`]); cl.push(["Attack", `Scored ${r[2].toFixed(1)} points a game`]); cl.push(["Record", `${r[4]} wins and ${r[6]} losses`]);
  cl.push(["Ranking", `Ended ${ordn(e.pos)} of ${lgOf(e.lg).tables[e.season].length} teams by wins`]);
  cl.push(["Playoffs", PLAYOFF_ROUND[po] || PLAYOFF_ROUND[0], "<svg class=ic><use href=#i-trophy></use></svg>"]);
  if (f.titles) cl.push(["Titles", `${f.titles} NBA title${f.titles === 1 ? "" : "s"} since ${COVER}`]);
  if (f.loc) cl.push(["City", `Based in ${f.loc}`]);
  cl.push(["Name", `${e.n.replace(/ /g, "").length} letters, starts with ${e.n[0]}`]);
  return cl;
}
function scrambleClues(r) {
  const name = r.kind === "player" ? r.p.n : r.e.n, words = name.split(/\s+/), kindWord = r.kind === "player" ? "an NBA player" : "an NBA team";
  const pattern = words.map((w) => [...w.replace(/[^\p{L}'-]/gu, "")].map(() => "_").join(" ")).join("    "), first = words.map((w) => w[0].toUpperCase()).join(" ");
  const extra = r.kind === "player" ? `${r.p.nat ? r.p.nat + " " : ""}${POSLONG(r.p)}` : `based in ${(QZ.clubs[r.e.n] || {}).loc || "the USA"}`;
  return [["Letters", r.scr], ["It is…", kindWord], ["Shape", pattern], ["Starts with", first], ["Extra hint", extra]];
}
QDEF.scramble.mk = (scope) => {
  const kind = rnd(["player", "player", "club"]);
  if (kind === "player") { const p = rnd(playerPool(scope, (q) => q.hist.length >= 2 && playerOK(q))); return { kind, p, scr: scrambleName(p.n) }; }
  const names = clubList(scope).filter((c) => clubOK(c.n)), c = rnd(names.length ? names : clubList(scope)); return { kind, e: { n: c.n, lg: c.lg }, scr: scrambleName(c.n) };
};
QDEF.career.mk = (scope) => ({ p: rnd(playerPool(scope, (p) => !p.partial && p.cr.length >= 3 && playerOK(p))) });
QDEF.who.mk = (scope) => ({ p: rnd(playerPool(scope, (p) => p.hist.length >= 2 && playerOK(p))) });   // legends count too, otherwise Easy had only 30 players
QDEF.club.name = "Name that team"; QDEF.blur.name = "Logo blur";

/* ---------- tic-tac-toe categories: only facts the data really holds ---------- */
const NBA_TEAMS_FULL = () => Object.keys(QZ.clubs);
function tttCategories(pool, scope) {
  const F = {}, add = (c) => { (F[c.fam] || (F[c.fam] = [])).push(c); }, count = (f) => pool.filter(f).length;
  const teams = {}, nats = {}; pool.forEach((p) => { new Set(p.hist).forEach((c) => { teams[c] = (teams[c] || 0) + 1; }); if (p.nat) nats[p.nat] = (nats[p.nat] || 0) + 1; });
  Object.entries(teams).filter(([c, n]) => n >= 25 && CREST[c]).forEach(([c]) => add({ id: "club:" + c, fam: "club", label: `Played for the ${c}${({ Thunder: " (or SuperSonics)", Pelicans: " (or New Orleans Hornets)", Hornets: " (or Bobcats)" })[c] || ""}`, icon: badge(c, "md"), test: (p) => p.hist.includes(c) }));   /* the franchise counts under its old names too, and the label says so */
  Object.entries(nats).filter(([n, v]) => v >= 8 && n !== "United States").forEach(([n]) => add({ id: "nat:" + n, fam: "nat", label: `${n} players`, icon: `<span class="cflag">${flagOf(n) || "<svg class=ic><use href=#i-globe></use></svg>"}</span>`, test: (p) => p.nat === n }));
  const usa = (p) => p.nat === "United States", abroad = (p) => p.nat && p.nat !== "United States";
  if (count(usa) >= 60) add({ id: "nat:usa", fam: "nat", label: "American players", icon: `<span class="cflag">${flagOf("United States")}</span>`, test: usa });
  if (count(abroad) >= 40) add({ id: "nat:abroad", fam: "nat", label: "Born outside the USA", icon: ico("globe"), test: abroad });
  /* titles: a player counts if he played in the playoffs for the champion (box scores, 2001-02 on) */
  const anyT = (p) => (p.ti || []).length > 0; if (count(anyT) >= 30) add({ id: "ti:any", fam: "trophy", label: `NBA champion (${COVER} on)`, icon: ico("trophy"), test: anyT });
  const two = (p) => (p.ti || []).length >= 2; if (count(two) >= 18) add({ id: "ti:two", fam: "trophy", label: `Won 2 or more titles (${COVER} on)`, icon: ico("trophy"), test: two });
  const champTeams = {}; pool.forEach((p) => (p.ti || []).forEach((t) => { champTeams[t.team] = champTeams[t.team] || new Set(); champTeams[t.team].add(p.id); }));
  Object.entries(champTeams).filter(([, s]) => s.size >= 9).forEach(([team]) => add({ id: "ti:" + team, fam: "trophy", label: `Won a title with the ${team}`, icon: badge(team, "md"), test: (p) => (p.ti || []).some((t) => t.team === team) }));
  /* teammates: stars and everyone who shared a team with them for a season (30+ games each) */
  const starCount = {}; pool.forEach((p) => (p.tm || []).forEach((id) => { starCount[id] = (starCount[id] || 0) + 1; }));
  Object.entries(starCount).filter(([, n]) => n >= 20).forEach(([id]) => { const st = QZ.players.find((x) => x.id === +id); if (st) add({ id: "tm:" + id, fam: "mate", label: `Teammate of ${st.n} (30+ games in a season)`, icon: faceOf(st.n) ? `<span class="badge md hface"><img src="${faceOf(st.n)}" alt=""></span>` : ico("handshake"), test: (p) => (p.tm || []).includes(+id) }); });
  /* career shape */
  [["t4", "Played for 4 or more teams", (p) => new Set(p.hist).size >= 4, "suitcase"], ["t6", "Played for 6 or more teams", (p) => new Set(p.hist).size >= 6, "suitcase"], ["one", "Spent 8+ seasons with one team", (p) => p.cr.some(([, a, b]) => +b.slice(0, 4) - +a.slice(0, 4) >= 7) && new Set(p.hist).size === 1, "anchor"]]
    .forEach(([id, label, f, ic]) => { if (count(f) >= 25) add({ id: "cr:" + id, fam: "career", label, icon: ico(ic), test: f }); });
  /* stats: best season since 2001-02 (the label says so) */
  [["p25", "Averaged 25+ points in a season", (p) => p.bp && p.bp.avg >= 25, "ball"], ["p20", "Averaged 20+ points in a season", (p) => p.bp && p.bp.avg >= 20, "ball"], ["r10", "Averaged 10+ rebounds in a season", (p) => p.br && p.br.avg >= 10, "gear"], ["a8", "Averaged 8+ assists in a season", (p) => p.ba && p.ba.avg >= 8, "handshake"], ["s2", "Averaged 1.8+ steals in a season", (p) => p.bs && p.bs.avg >= 1.8, "bolt"], ["b2", "Averaged 1.8+ blocks in a season", (p) => p.bb && p.bb.avg >= 1.8, "shield"], ["k20", "20,000+ career points", (p) => p.pts >= 20000, "gem"]]
    .forEach(([id, label, f, ic]) => { if (count(f) >= 15) add({ id: "st:" + id, fam: "stat", label: label + (id === "k20" ? ` (since ${COVER})` : ` (${COVER} on)`), icon: ico(ic), test: f }); });
  [["age30", "Aged 30 or over", (p) => ageOf(p) >= 30, "hourglass"], ["age25", "Aged 25 or under", (p) => ageOf(p) <= 25, "sprout"], ["b80", "Born in the 1980s", (p) => p.dob >= "1980" && p.dob < "1990", "calendar"], ["b90", "Born in the 1990s", (p) => p.dob >= "1990" && p.dob < "2000", "calendar"], ["b00", "Born in the 2000s", (p) => p.dob >= "2000" && p.dob < "2010", "calendar"], ["act", "Currently in the NBA", (p) => p.active, "bolt"]]
    .forEach(([id, label, f, ic]) => { if (count(f) >= 25) add({ id: "age:" + id, fam: "age", label, icon: ico(ic), test: f }); });
  [["h7", "6 ft 10 in or taller", (p) => p.h >= 208, "ruler"], ["h6", "6 ft 4 in or shorter", (p) => p.h > 0 && p.h <= 193, "ruler"], ["h5", "6 ft 1 in or shorter", (p) => p.h > 0 && p.h <= 186, "ruler"]]
    .forEach(([id, label, f, ic]) => { if (count(f) >= 25) add({ id: "h:" + id, fam: "height", label, icon: ico(ic), test: f }); });
  const ln = {}; pool.forEach((p) => { const L = qnorm(p.n)[0]; if (L) ln[L] = (ln[L] || 0) + 1; });
  Object.entries(ln).filter(([L, n]) => /[a-z]/.test(L) && n >= 45).forEach(([L]) => add({ id: "L:" + L, fam: "letter", label: `Name starts with ${L.toUpperCase()}`, icon: `<span class="cflag"><b>${L.toUpperCase()}</b></span>`, test: (p) => qnorm(p.n)[0] === L }));
  ["Guard", "Forward", "Center"].forEach((k) => add({ id: "pos:" + k, fam: "pos", label: POSNAME[k], icon: `<span class="cflag">${POSICON[k]}</span>`, test: (p) => p.pos === k }));
  ["Point Guard", "Shooting Guard", "Small Forward", "Power Forward"].forEach((s) => { if (count((p) => p.sub === s) >= 40) add({ id: "sub:" + s, fam: "pos", label: s + "s", icon: ico(/Guard/.test(s) ? "gear" : "shield"), test: (p) => p.sub === s }); });
  Object.keys(AWN).forEach((k) => { const f = (p) => (p.aw || []).some((x) => x[0] === k); if (count(f) >= 5) add({ id: "aw:" + k, fam: "award", label: `Won ${AWN[k]} (${COVER} on)`, icon: ico("medal"), test: f }); });
  const anyA = (p) => (p.aw || []).length > 0; if (count(anyA) >= 10) add({ id: "aw:any", fam: "award", label: `Won a major award (${COVER} on)`, icon: ico("medal"), test: anyA });
  return F;
}
function factsOf(p) { return [p.nat, p.sub || p.pos, p.club ? (p.active ? "now with the " : "last with the ") + p.club : "", `${new Set(p.hist).size} team${new Set(p.hist).size === 1 ? "" : "s"} since ${COVER}`].filter(Boolean).join(" · "); }
Object.keys(LGLABEL).forEach((k) => delete LGLABEL[k]);

/* ---------- front page ---------- */
function renderHome() {
  const hero = (DATA.hero || []).filter((x) => x.img);
  const tiles = hero.map((x) => `<div class="wtile"><img src="${x.img}" alt="${esc(x.n)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"><span>${esc(x.n)}</span></div>`);
  const rows = [0, 1, 2].map((r) => { const list = tiles.filter((_, i) => i % 3 === r); const run = list.concat(list); return `<div class="wrow ${r === 1 ? "rev" : ""}" style="--sp:${70 + r * 18}s">${run.join("")}</div>`; });
  $("#photowall").innerHTML = rows.join("");
  const clubs = Object.keys(CREST), faces = (seed) => [0, 1, 2].map((j) => badge(clubs[hash(seed + j) % clubs.length], "md")).join("");
  $("#doors").innerHTML = `<button type="button" class="door" data-door="games"><div class="gfaces">${faces("g")}</div><div class="dname">Games</div><div class="dtag">Who am I, career paths, team roulette, tic-tac-toe and more, with real NBA careers. Solo or against a friend.</div><span class="dgo">Play</span></button>`;
  $("#ribbon").innerHTML = `<span><b class="num">${QZ.players.length.toLocaleString()}</b> players</span><span><b class="num">30</b> teams</span><span><b class="num">${Object.keys(LG.NBA.tables).length}</b> seasons of box scores</span>`;
}
function renderHub() {
  heroQueue = [];
  const g = S.hubGroup, clubs = Object.keys(CREST), pick = (k) => [0, 1, 2].map((j) => clubs[hash(`nba-${k}-${j}`) % clubs.length]);
  const card = (x, k) => `<button type="button" class="gcard" data-game="${x.id}" style="--d:${k * 60}ms"><div class="gfaces">${x.faces ? x.faces(pick(k)) : pick(k).map((t) => badge(t, "md")).join("")}</div><div class="gname">${x.name}</div><div class="gmodes">${x.modes || "Solo"}</div><div class="gtag">${x.tag}</div><div class="grec">${recordLine(S.code, x.id)}</div></button>`;
  if (g === "ranked") { renderRanked(); return; }
  if (g === "bk") { $("#room").innerHTML = `<h2 class="sec"><svg class=ic><use href=#i-ball></use></svg> ballknowledge originals</h2><p class="secsub">Players, teams and careers from 25 seasons of NBA box scores. Pick a difficulty, then play solo or against a friend.</p><div class="hub">${QUIZ_GAMES.map((x, k) => card(x, k)).join("")}</div>`; return; }
  $("#room").innerHTML = `<h2 class="sec"><svg class=ic><use href=#i-compass></use></svg> What do you want to play?</h2><p class="secsub">Pick a place to play.</p><div class="groups">
    <button type="button" class="gpick" data-group="bk" style="--d:0ms"><div class="gfaces">${heroFaces(4)}</div><div class="gname">ballknowledge originals</div><div class="gtag">Who am I?, career paths, team roulette, tic-tac-toe and more. Four difficulty levels, solo streaks or two-player duels.</div><span class="dgo">Play</span></button>
    <button type="button" class="gpick" data-group="model" style="--d:80ms"><div class="gfaces">${pick(1).map((x) => badge(x, "md")).join("")}</div><div class="gname">Beat the Model</div><div class="gtag">Call real NBA games against a prediction model that never saw them: winners and margins, a daily five, rapid fire and a playoff bracket.</div><span class="dgo">Play</span></button>
    <button type="button" class="gpick" data-group="ranked" style="--d:160ms"><div class="gfaces"><span class="rkbig"><svg class=ic><use href=#i-trophy></use></svg></span><span class="rkbig"><svg class=ic><use href=#i-live></use></svg></span></div><div class="gname">Play online</div><div class="gtag">Ranked matches against real people, a public lobby and a leaderboard.</div><span class="dgo">Play</span></button></div>`;
}
/* the NBA has one league: no league chips, and the football-only sections are not offered */
function renderScope() { $("#scope").innerHTML = ""; }
QUIZ_GAMES.length = 0;
QUIZ_GAMES.push(
  { id: "who", name: "Who am I?", modes: "Solo streak · 2 players", tag: "A mystery player. Clues go from obscure to obvious. Buzz in early for more points.", faces: () => heroFaces(3) },
  { id: "career", name: "Career path", modes: "Solo streak · 2 players", tag: "Every team he played for, in order. Name the player.", faces: () => heroFaces(3) },
  { id: "club", name: "Name that team", modes: "Solo streak · 2 players", tag: "Points, wins and a playoff run. Which team is it?" },
  { id: "blur", name: "Logo blur", modes: "Solo streak · 2 players", tag: "A blurry logo that sharpens by the second." },
  { id: "finish", name: "Where did they finish?", modes: "Solo streak · 2 players", tag: "A team, a season, a slider. How close can you get?" },
  { id: "scramble", name: "Scramble", modes: "Solo streak · 2 players", tag: "A player or team with the letters shuffled. Unscramble it before your rival does." },
  { id: "roulette", name: "Team roulette", modes: "2 players · one device or two", tag: "A team appears. Take turns naming players who played for it. First to blank loses.", faces: () => heroFaces(2) },
  { id: "ttt", name: "Basketball tic-tac-toe", modes: "2 players · one device or two", tag: "Name a player who fits the row and the column. Three in a row wins.", faces: () => heroFaces(2) },
);
GAMES.length = 0;

/* ---------- wording: how-to cards, tips, difficulty notes, leaderboards, achievements ---------- */
["g:call", "g:daily", "g:matchday", "g:upset", "g:table", "g:hol", "g:challenge", "g:value", "g:rapid", "g:bracket", "g:iconic", "g:xi", "live", "replay", "race"].forEach((k) => delete HOWTO[k]);
Object.assign(HOWTO, {
  "g:who": ["Who am I?", ["What you do", "A mystery NBA player. Clues start hard (where he was born, his height) and get easier (his team). Press Buzz when you think you know, then type the name and press Enter. A last name or a small typo is fine."], ["Scoring", "Up to 1,000 points, falling as more clues appear. A wrong guess costs 150."], ["Solo or duel", "Solo: keep a streak going. Two players: the first to buzz and answer right takes the points."], ["Good to know", `Stats and titles come from real box scores and only count from ${COVER} on, and the clues say so.`], ["Tip", "New to this? Choose Easy: it only asks about superstars."]],
  "g:career": ["Career path", ["What you do", "You see every team a player has played for, in order. Name the player."], ["Scoring", "Up to 1,000 points, falling over time. A wrong guess costs 150."], ["Good to know", `Only players whose whole career is covered by the data (they started in 2002-03 or later) are asked, so no team is ever missing.`]],
  "g:club": ["Name that team", ["What you do", "Guess the team from one real season: points scored and allowed, wins and losses, how far they went in the playoffs, then bigger hints like the city."], ["Scoring", "Up to 1,000 points, falling over time. A wrong guess costs 150."]],
  "g:blur": ["Logo blur", ["What you do", "A team logo starts very blurry and gets sharper every few seconds. Name the team."], ["Scoring", "The sharper the logo, the fewer points. Guess early to score more."]],
  "g:finish": ["Where did they finish?", ["What you do", "A team and a season appear. Slide to where you think it finished among the 30 teams, ranked by wins."], ["Scoring", "The closer you are, the more you score. Solo: your run continues while you stay within a few places."], ["Two players", "You each slide in turn without seeing the other's guess. Closest wins the round."]],
  "g:roulette": ["Team roulette", ["What you do", "A team appears. Two players take turns naming someone who has played for it since 2001-02."], ["You lose a round if", "you name someone who never played there, repeat a name, or run out of time."], ["Winning", "The first to win two rounds takes the match."]],
  "g:scramble": ["Scramble", ["What you do", "A player or a team appears as big shuffled letters, each word shuffled on its own. Buzz in when you know it and type the real name."], ["Hints", "Hints do not arrive on their own. Press Hint when you want one; in a two-player round a hint only appears once both players have asked. Each hint takes a little off the points."], ["Two players", "Same round on one device or two. A wrong answer costs 150 points and locks you out of that round."]],
  "g:ttt": ["Basketball tic-tac-toe", ["What you do", "Claim a square by naming a player who fits both its row and its column, for example 'played for the Lakers' and 'Spanish'."], ["Rules", "Nobody can be used twice, and a wrong answer loses your turn. Three in a row wins."], ["Good to know", `Stat and title categories only count from ${COVER} on, and say so.`]],
  "ranked": ["Ranked", ["What it is", "Play real people online. Create a lobby and others can join from the list."], ["Public or private", "Public lobbies change your rating. A private lobby with a code is for friends and never changes it."], ["Your rating", "Everyone starts at 1,000 Elo. Beating a higher-rated player earns more. Ranks run from Bronze up to Legend."], ["Separate from football", "Your basketball rating, badges and friends are their own, apart from your football ones."]],
});
SPLASH_TIPS.length = 0;
SPLASH_TIPS.push("Buzz early in a quiz: points fall from 1,000 toward 100 as the clues arrive.", "Hard counts 1.4x and Elite ball knowledge counts 2x on your solo scores.", "In two-player mode, player 1 buzzes with A and player 2 with L.", "Public Ranked lobbies change your Elo; private code rooms never do.", "Press Enter to submit: a last name or a small typo is accepted.", "Elite asks only about the obscure players and the smaller teams.", "Team roulette: a wrong name, a repeat or a timeout loses the round.", "Tic-tac-toe has categories for titles, teammates, stats and nationalities.", "Your progress saves to your account automatically after every round.", "Every stat on this site comes from real box scores, 2001-02 on.", "Where did they finish? gets harder fast on Elite: you get one place of margin.", "Invite a friend with a link: create a room and copy it.", "Friends see your Elo and your favourite player and team.", "Come back every day: streaks fill the calendar on your profile.", "Easy only asks about superstars and the biggest teams.", "A wrong buzz costs 150 points, so be sure.");
Object.assign(DIFFNOTE, { easy: "Superstars and the biggest teams, slow clues, forgiving margins. Scores count 0.6x.", medium: "Well-known players and top teams. Scores count 1x.", hard: "Rotation players and mid-table teams, faster clues, tighter margins. Scores count 1.4x.", elite: "Deep cuts: the obscure players and smaller teams only, fast clues, almost no margin. Scores count 2x." });
const NBA_BOARD = [["xp", "Overall XP", "XP earned"], ["who", "Who am I?", "points"], ["career", "Career path", "points"], ["club", "Name that team", "points"], ["blur", "Logo blur", "points"], ["finish", "Where did they finish?", "points"], ["scramble", "Scramble", "points"], ["ttt", "Tic-tac-toe", "wins"]];
BOARD_GAMES.length = 0; BOARD_GAMES.push(...NBA_BOARD);
RK_GAMES.length = 0; RK_GAMES.push(["who", "Who am I?"], ["career", "Career path"], ["club", "Name that team"], ["blur", "Logo blur"], ["finish", "Where did they finish?"], ["scramble", "Scramble"], ["ttt", "Basketball tic-tac-toe"], ["roulette", "Team roulette"]);
BK_LABELS.length = 0; BK_LABELS.push("Who am I?", "Career path", "Name that team", "Logo blur", "Where did they finish?", "Basketball tic-tac-toe", "Team roulette", "Scramble");
{ const keep = new Set(["flame3", "flame7", "captain", "quizmaster", "tttwin", "splash_all", "splash_10", "splash_rare", "splash_leg", "first_buzz", "speed", "elite_win", "hat3", "streak10q", "night", "early", "social", "avatar", "fav", "ranked_first", "ranked_win", "ranked5", "elo1200", "alldiff", "rounds100", "squad", "curious", "scramble10", "login7", "login30"]);
  const rest = ACH.filter((a) => keep.has(a[0])); ACH.length = 0; ACH.push(...rest);
  ACH.forEach((a) => { if (a[0] === "squad") a[1] = "Full roster"; if (a[0] === "tttwin") a[2] = "Beat the computer at basketball tic-tac-toe"; if (a[0] === "squad") a[2] = `Play all ${QUIZ_GAMES.length} ballknowledge originals`; if (a[0] === "captain") a[2] = "Reach the Captain rank"; }); }
CHANGELOG.v = "2026-12-03"; CHANGELOG.items.length = 0;
CHANGELOG.items.push(["Basketball", "ballknowledge now has an NBA side: players, teams and careers from 25 seasons of real box scores. Your football and basketball profiles, ratings and leaderboards are completely separate."], ["Honest limits", `Stats, titles and teammates only count from ${COVER} on. Careers that began earlier are left out of Career path.`]);

/* =====================================================================================================================
   Beat the Model, basketball edition. The model is an Elo rating (with margin-of-victory, home court and back-to-back rest)
   that only ever saw games played BEFORE the one you are calling (src/65_nba_model.py). Row: [date, home, away, hs, as, pHome, expMargin, recH, recA, type, season]
   ===================================================================================================================== */
const NM = DATA.nbaModel || { games: [], summary: { overall: {} }, series: {}, po_elo: {} };
const NBO = NM.summary.overall || {};
const nbDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const seasonLab = (y) => `${y - 1}-${String(y).slice(2)}`;
const nbModelPick = (g) => (g[5] >= 0.5 ? "h" : "a");
const nbModelMargin = (g) => Math.max(1, Math.round(Math.abs(g[6])));
const nbReal = (g) => ({ win: g[3] > g[4] ? "h" : "a", margin: Math.abs(g[3] - g[4]) });
const nbPts = (ok, err) => (ok ? 2 + (err <= 3 ? 2 : err <= 7 ? 1 : 0) : 0);
const nbTeamName = (t) => (QZ.clubs[t] ? QZ.clubs[t].full : t);
const nbLogo = (t, c = "xl") => badge(t, c);
Object.assign(HOWTO, {
  "g:nbcall": ["Call it", ["What you do", "A real NBA game from the past appears with both teams' records going in. Pick the winner, then say by how many points. You can't see the score."], ["Scoring", "2 points for the right winner, plus up to 2 more if your margin is close (within 3 points: 2, within 7: 1). The model plays the same games and scores the same way."], ["Good to know", "Teams appear under today's names, so the 2009 Hornets show as the Pelicans and the Sonics as the Thunder."], ["The model", `An Elo rating that only ever saw games played before this one. It picks the right winner about ${Math.round((NBO.acc || 0.66) * 100)} times in 100; always picking the home team gets about ${Math.round((NBO.home || 0.586) * 100)}.`]],
  "g:nbdaily": ["Daily 5", ["What you do", "Five real games, the same for everyone today. Pick the winner and the margin for each."], ["Scoring", "Same as Call it. Come back tomorrow for a fresh five."], ["Tip", "Share your score with a friend and see who did better."]],
  "g:nbrapid": ["Rapid fire", ["What you do", "A real game appears. Tap the team you think won, as fast as you can, for 60 seconds."], ["The model", "It calls the same games. Whoever gets more right wins."], ["Tip", "You can use the left and right arrow keys: left for the away team, right for the home team."]],
  "g:nbbracket": ["Bracket buster", ["What you do", "A real NBA playoffs. In every round pick who wins each series, then lock the round in. The next round uses the real winners."], ["The model", "A plain Elo rating, from every game before the playoffs, picks the higher-rated team."], ["Scoring", "A first-round series is worth 1 point, the second round 2, the conference finals 3 and the Finals 4."]],
});
["nbcall", "nbdaily", "nbrapid", "nbbracket"].forEach((id) => { GAME_IDS.push(id); MODEL_IDS.push(id); });
GAMES.push(
  { id: "nbcall", name: "Call it", modes: "Solo, against the model", tag: "Five real NBA games. Pick the winner and the margin, then see what the model said." },
  { id: "nbdaily", name: "Daily 5", modes: "Solo, against the model", tag: "The same five games for everyone today. Beat the model and share your result." },
  { id: "nbrapid", name: "Rapid fire", modes: "Solo, against the model", tag: "60 seconds. Tap the winner of as many real games as you can." },
  { id: "nbbracket", name: "Bracket buster", modes: "Solo, against the model", tag: "A real NBA playoffs. Pick every series, round by round, against an Elo model." },
);
BOARD_GAMES.push(["nbcall", "Call it", "points (of 20)"], ["nbdaily", "Daily 5", "points (of 20)"], ["nbrapid", "Rapid fire", "best run, winners right"], ["nbbracket", "Bracket buster", "best points"]);
BK_LABELS.push("Call it", "Daily 5", "Rapid fire", "Bracket buster");
const NB_TITLE = { nbcall: "Call it", nbdaily: "Daily 5", nbrapid: "Rapid fire", nbbracket: "Bracket buster" };
const nbGames = () => NM.games;
function nbItems(n, rng) { const all = nbGames(), out = [], seen = new Set(); let guard = 0; while (out.length < n && guard++ < 500) { const g = all[Math.floor(rng() * all.length)]; if (!g || seen.has(g[0] + g[1])) continue; if (g[9] === 3 && rng() > 0.35) continue; seen.add(g[0] + g[1]); out.push(g); } return out; }
const nbSide = (g, k, rev, pick) => { const t = k === "h" ? g[1] : g[2], rec = k === "h" ? g[7] : g[8], real = rev ? nbReal(g).win : null, cls = rev ? (real === k ? "ans" : pick === k ? "wrong" : "") : pick === k ? "sel" : "";
  return `<button type="button" class="holc ${cls}" data-nbteam="${k}" ${rev ? "disabled" : ""}>${nbLogo(t)}<b>${esc(t)}</b><span class="fine">${k === "h" ? "Home" : "Away"} · ${esc(rec)}</span>${rev ? `<span class="num holv">${k === "h" ? g[3] : g[4]}</span>` : ""}</button>`; };
function nbStart(game) {
  const daily = game === "nbdaily", key = "nbd_" + todayKey();
  if (daily && store.items[key]) { S.nb = { game, phase: "done", ...store.items[key], again: false }; return; }
  const rng = daily ? mulberry(hash("nbd" + todayKey())) : Math.random;
  S.nb = { game, round: 0, rounds: game === "nbrapid" ? 999 : 5, items: nbItems(game === "nbrapid" ? 400 : 5, rng), you: 0, mod: 0, ypts: 0, mpts: 0, phase: game === "nbrapid" ? "intro" : "ask", pick: null, margin: 8, log: [], streak: 0, best: 0, n: 0, left: 60 };
  if (game === "nbbracket") S.nb = nbBracketNew(); else if (game !== "nbrapid") S.nb.round = 1;
}
function renderNB() {
  const g = S.game;
  if (!S.nb || S.nb.game !== g) { if (S.nb && S.nb.timer) clearInterval(S.nb.timer); nbStart(g); }
  const s = S.nb; if (g === "nbrapid") return renderNBRapid(); if (g === "nbbracket") return renderNBBracket();
  if (s.phase === "done") return renderNBDone();
  const it = s.items[s.round - 1], hud = `<div class="qhud"><span class="label">Game ${s.round} of ${s.rounds}</span><span class="num qscore"><small>You</small> <b>${s.ypts}</b></span><span class="num qscore"><small>Model</small> <b>${s.mpts}</b></span></div>`;
  const ctx = `<div class="fine" style="text-align:center">${esc(nbDate(it[0]))} · ${seasonLab(it[10])} ${it[9] === 3 ? "· Playoffs" : "· Regular season"}</div>`;
  if (s.phase === "reveal") {
    const real = nbReal(it), mp = nbModelPick(it), mm = nbModelMargin(it), you = s.last.you, mod = s.last.mod, pwin = Math.round(100 * (mp === "h" ? it[5] : 1 - it[5]));
    $("#room").innerHTML = `<div class="card">${gamesBar(NB_TITLE[g])}${hud}${ctx}<div class="holpair">${nbSide(it, "a", true, s.pick)}<span class="vs">at</span>${nbSide(it, "h", true, s.pick)}</div>
      <div class="rcard on" style="margin-top:12px"><div class="label">${esc(real.win === "h" ? it[1] : it[2])} won by ${real.margin}</div><div class="verdicts" style="margin-top:10px">
        <div class="vd ${you > 0 ? "ok" : "no"}"><span class="label">You</span><b class="num">${esc(s.pick === "h" ? it[1] : it[2])} by ${s.margin}</b><span class="fine">+${you} point${you === 1 ? "" : "s"}</span></div>
        <div class="vd ${mod > 0 ? "ok" : "no"}"><span class="label">Model (${pwin}% ${esc(mp === "h" ? it[1] : it[2])})</span><b class="num">${esc(mp === "h" ? it[1] : it[2])} by ${mm}</b><span class="fine">+${mod} point${mod === 1 ? "" : "s"}</span></div></div></div>
      <div class="row" style="margin-top:12px"><button class="btn" id="nbNext" type="button">${s.round >= s.rounds ? "See the final score" : "Next game"}</button></div></div>`; return;
  }
  $("#room").innerHTML = `<div class="card">${gamesBar(NB_TITLE[g])}${hud}${ctx}<div class="holpair">${nbSide(it, "a", false, s.pick)}<span class="vs">at</span>${nbSide(it, "h", false, s.pick)}</div>
    ${s.pick ? `<div class="sliderbox" style="margin-top:12px"><b>${esc(s.pick === "h" ? it[1] : it[2])} win by <span class="num" id="nbMv">${s.margin}</span> points</b><input type="range" id="nbMargin" min="1" max="35" value="${s.margin}" aria-label="Winning margin"><div class="row fine" style="justify-content:space-between"><span>1</span><span>35</span></div></div><div class="row" style="margin-top:12px"><button class="btn" id="nbLock" type="button">Lock it in</button></div>` : `<p class="fine" style="text-align:center;margin-top:12px">Tap the team you think won.</p>`}</div>`;
}
function nbLock() {
  const s = S.nb, it = s.items[s.round - 1]; if (!s.pick) return; const real = nbReal(it), mp = nbModelPick(it), mm = nbModelMargin(it);
  const you = nbPts(s.pick === real.win, Math.abs(s.margin - real.margin)), mod = nbPts(mp === real.win, Math.abs(mm - real.margin));
  s.ypts += you; s.mpts += mod; s.last = { you, mod }; s.log.push([it[0], it[1], it[2], s.pick === "h" ? it[1] : it[2], s.margin, you, mod]); s.phase = "reveal"; Snd.lock(); renderNB();
  setTimeout(() => { you >= 4 ? (Snd.win(), confetti()) : you > 0 ? Snd.right() : Snd.wrong(); }, 350);
}
function nbNext() { const s = S.nb; if (s.round >= s.rounds) return nbFinish(); s.round++; s.pick = null; s.margin = 8; s.phase = "ask"; renderNB(); }
function nbFinish() {
  const s = S.nb, g = s.game, label = NB_TITLE[g]; s.phase = "done"; s.final = { ypts: s.ypts, mpts: s.mpts, log: s.log };
  if (g === "nbdaily") lockIn("nbd_" + todayKey(), s.final);
  const bk = `nbbest_${g}`, cur = store.items[bk] || { best: 0 }; if (s.ypts > cur.best) lockIn(bk, { best: s.ypts });
  reward(10 + s.ypts * 2 + (s.ypts > s.mpts ? 10 : 0), label, null); Board.submit({ game: g, league: "all", score: s.ypts }); renderNB();
  if (s.ypts > s.mpts) { Snd.win(); confetti(); }
}
function renderNBDone() {
  const s = S.nb, f = s.final || s, win = f.ypts > f.mpts, tie = f.ypts === f.mpts;
  $("#room").innerHTML = `<div class="card">${gamesBar(NB_TITLE[s.game])}<div class="rcard on"><div class="label">Final score</div><b style="font-size:26px">${win ? "You beat the model" : tie ? "A tie with the model" : "The model won"}</b>
    <div class="tiles" style="margin-top:10px"><div class="tile"><b class="num">${f.ypts}</b><small>you, of 20</small></div><div class="tile"><b class="num">${f.mpts}</b><small>model</small></div></div>
    <div class="lb" style="margin-top:10px">${(f.log || []).map((r) => `<div class="lbrow"><span class="fine">${esc(nbDate(r[0]))}</span><span>${esc(r[2])} at ${esc(r[1])}</span><span class="fine">You: ${esc(r[3])} by ${r[4]} (+${r[5]}) · Model +${r[6]}</span></div>`).join("")}</div></div>
    <div class="row" style="margin-top:12px">${s.game === "nbdaily" ? '<span class="fine">Come back tomorrow for a fresh five.</span>' : '<button class="btn" id="nbAgain" type="button">Play again</button>'}<button class="btn ghost" id="nbShare" type="button">Copy my result</button></div></div>`;
}
/* ---- Rapid fire ---- */
function renderNBRapid() {
  const s = S.nb;
  if (s.phase === "intro") { $("#room").innerHTML = `<div class="card">${gamesBar("Rapid fire")}<h2 style="margin-top:6px">Rapid fire</h2><p class="sub">60 seconds. A real game appears: tap the team you think won, as fast as you can. The model calls the same games. Whoever is right more often wins.</p><div class="row" style="margin-top:14px"><button class="btn" id="nbRpStart" type="button">Start</button></div></div>`; return; }
  if (s.phase === "done") { const win = s.you > s.mod, tie = s.you === s.mod; $("#room").innerHTML = `<div class="card">${gamesBar("Rapid fire")}<div class="rcard on"><div class="label">Time</div><b style="font-size:26px">${win ? "You beat the model" : tie ? "A tie with the model" : "The model won"}</b><div class="tiles" style="margin-top:10px"><div class="tile"><b class="num">${s.you}</b><small>you right of ${s.n}</small></div><div class="tile"><b class="num">${s.mod}</b><small>model right</small></div><div class="tile"><b class="num">${s.best}</b><small>best streak</small></div><div class="tile"><b class="num">${s.n ? Math.round((100 * s.you) / s.n) : 0}%</b><small>your accuracy</small></div></div></div><div class="row" style="margin-top:12px"><button class="btn" id="nbRpStart" type="button">Go again</button></div></div>`; return; }
  const it = s.items[s.n % s.items.length];
  $("#room").innerHTML = `<div class="card">${gamesBar("Rapid fire")}<div class="qhud"><span class="label">You ${s.you} · Model ${s.mod}${s.streak > 1 ? ` · streak ${s.streak}` : ""}</span><b class="num" id="nbRpTime">${s.left}</b></div>
    ${s.lastMsg ? `<div class="rplast ${s.lastOk ? "ok" : "bad"}">${esc(s.lastMsg)}</div>` : '<div class="rplast">&nbsp;</div>'}
    <div class="fine" style="text-align:center">${esc(nbDate(it[0]))} · ${seasonLab(it[10])}</div><div class="holpair">${nbSide(it, "a", false, null)}<span class="vs">at</span>${nbSide(it, "h", false, null)}</div><p class="fine" style="text-align:center;margin-top:8px">Keys: left arrow for away, right arrow for home</p></div>`;
}
function nbRapidStart() { const s = S.nb; s.items = nbItems(400, Math.random); Object.assign(s, { phase: "play", you: 0, mod: 0, n: 0, streak: 0, best: 0, left: 60, lastMsg: "" }); renderNB(); clearInterval(s.timer); s.timer = setInterval(() => { if (S.nb !== s || S.game !== "nbrapid") { clearInterval(s.timer); return; } s.left--; const el = $("#nbRpTime"); if (el) el.textContent = s.left; if (s.left <= 0) { clearInterval(s.timer); s.phase = "done"; const k = "nbbest_nbrapid", cur = store.items[k] || { best: 0 }; if (s.you > cur.best) lockIn(k, { best: s.you }); reward(10 + s.you, "Rapid fire", null); Board.submit({ game: "nbrapid", league: "all", score: s.you }); renderNB(); s.you > s.mod ? (Snd.win(), confetti()) : Snd.lock(); } }, 1000); }
function nbRapidPick(k) { const s = S.nb; if (!s || s.phase !== "play") return; const it = s.items[s.n % s.items.length], real = nbReal(it).win, ok = real === k, mo = nbModelPick(it) === real; s.n++; if (ok) { s.you++; s.streak++; s.best = Math.max(s.best, s.streak); Snd.tick(); } else { s.streak = 0; Snd.wrong(); } if (mo) s.mod++; s.lastOk = ok; s.lastMsg = `${ok ? "Right" : "Wrong"}: ${real === "h" ? it[1] : it[2]} won ${Math.max(it[3], it[4])}-${Math.min(it[3], it[4])}`; renderNB(); }
/* ---- Bracket buster ---- */
function nbBracketNew() {
  const seasons = Object.keys(NM.series).filter((y) => NM.series[y] && NM.series[y].length === 15), y = rnd(seasons), list = NM.series[y], r1 = list.filter((x) => x.round === 1);
  return { game: "nbbracket", season: +y, list, round: 1, picks: {}, phase: "ask", you: 0, mod: 0, log: [], matchups: r1.map((x) => [x.a, x.b]) };
}
function renderNBBracket() {
  const s = S.nb, pe = (NM.po_elo || {})[s.season] || {}, names = s.round <= 4 ? ["First round", "Second round", "Conference finals", "NBA Finals"][s.round - 1] : "";
  const hud = `<div class="qhud"><span class="label">${seasonLab(s.season)} playoffs · ${names}</span><span class="num qscore"><small>You</small> <b>${s.you}</b></span><span class="num qscore"><small>Model</small> <b>${s.mod}</b></span></div>`;
  if (s.phase === "done") { const win = s.you > s.mod, tie = s.you === s.mod; $("#room").innerHTML = `<div class="card">${gamesBar("Bracket buster")}${hud}<div class="rcard on"><div class="label">Final score</div><b style="font-size:26px">${win ? "You beat the model" : tie ? "A tie with the model" : "The model won"}</b><div class="tiles" style="margin-top:10px"><div class="tile"><b class="num">${s.you}</b><small>you, of 26</small></div><div class="tile"><b class="num">${s.mod}</b><small>model</small></div></div></div><div class="row" style="margin-top:12px"><button class="btn" id="nbAgain" type="button">Another year</button></div></div>`; return; }
  const rows = s.matchups.map(([a, b], i) => { const ta = teamById(a), tb = teamById(b), pk = s.picks[i], real = s.phase === "reveal" ? s.cur[i].win : null, mpk = (pe[ta] || 1500) >= (pe[tb] || 1500) ? ta : tb;
    const btn = (t) => { const cls = real ? (real === t ? "ans" : pk === t ? "wrong" : "") : pk === t ? "sel" : ""; return `<button type="button" class="holc ${cls}" data-nbser="${i}|${esc(t)}" ${real ? "disabled" : ""}>${nbLogo(t, "md")}<b>${esc(t)}</b>${real ? '<span class="fine">' + (t === mpk ? "model pick" : "") + "</span>" : `<span class="fine">Elo ${pe[t] || ""}</span>`}</button>`; };
    return `<div class="holpair" style="margin-bottom:8px">${btn(ta)}<span class="vs">v</span>${btn(tb)}</div>`; }).join("");
  const all = Object.keys(s.picks).length === s.matchups.length;
  $("#room").innerHTML = `<div class="card">${gamesBar("Bracket buster")}${hud}${rows}<div class="row" style="margin-top:12px">${s.phase === "reveal" ? `<button class="btn" id="nbRound" type="button">${s.round >= 4 ? "See the final score" : "Next round"}</button>` : `<button class="btn" id="nbRoundLock" type="button" ${all ? "" : "disabled"}>Lock the round in</button>`}</div></div>`;
}
const teamById = (id) => (QZ.byId || (QZ.byId = Object.fromEntries(Object.entries(QZ.clubs).map(([n, f]) => [f.cid, n]))))[id];
function nbRoundLock() {
  const s = S.nb, pe = (NM.po_elo || {})[s.season] || {}; s.cur = s.matchups.map(([a, b]) => { const x = s.list.find((z) => z.round === s.round && ((z.a === a && z.b === b) || (z.a === b && z.b === a))); return { win: teamById(x.win) }; });
  s.matchups.forEach(([a, b], i) => { const ta = teamById(a), tb = teamById(b), real = s.cur[i].win, mpk = (pe[ta] || 1500) >= (pe[tb] || 1500) ? ta : tb; if (s.picks[i] === real) s.you += s.round; if (mpk === real) s.mod += s.round; });
  s.phase = "reveal"; Snd.lock(); renderNB(); setTimeout(() => Snd.right(), 300);
}
function nbRoundNext() {
  const s = S.nb; if (s.round >= 4) { s.phase = "done"; const k = "nbbest_nbbracket", cur = store.items[k] || { best: 0 }; if (s.you > cur.best) lockIn(k, { best: s.you }); reward(15 + s.you * 2 + (s.you > s.mod ? 10 : 0), "Bracket buster", null); Board.submit({ game: "nbbracket", league: "all", score: s.you }); renderNB(); if (s.you > s.mod) { Snd.win(); confetti(); } return; }
  const next = s.list.filter((x) => x.round === s.round + 1).map((x) => [x.a, x.b]);   // the real pairings for the next round
  s.round++; s.matchups = next; s.picks = {}; s.phase = "ask"; renderNB();
}
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-nbteam],[data-nbser],#nbLock,#nbNext,#nbAgain,#nbShare,#nbRpStart,#nbRound,#nbRoundLock"); if (!t || !NB_TITLE[S.game]) return;
  const s = S.nb; if (!s) return;
  if (t.dataset.nbteam) { if (S.game === "nbrapid") return nbRapidPick(t.dataset.nbteam); if (s.phase !== "ask") return; s.pick = t.dataset.nbteam; Snd.tick(); return renderNB(); }
  if (t.dataset.nbser) { const [i, name] = t.dataset.nbser.split("|"); if (s.phase !== "ask") return; s.picks[+i] = name; Snd.tick(); return renderNB(); }
  if (t.id === "nbLock") return nbLock(); if (t.id === "nbNext") return nbNext(); if (t.id === "nbRpStart") return nbRapidStart();
  if (t.id === "nbRoundLock") return nbRoundLock(); if (t.id === "nbRound") return nbRoundNext();
  if (t.id === "nbAgain") { S.nb = null; return renderNB(); }
  if (t.id === "nbShare") { const f = s.final || s, txt = `ballknowledge basketball · ${NB_TITLE[s.game]}: me ${f.ypts} vs model ${f.mpts}. Can you beat it?`; try { navigator.clipboard.writeText(txt + " " + location.href.split("#")[0]).then(() => toast("Copied")); } catch (err) { toast(txt); } }
});
document.addEventListener("input", (e) => { if (e.target.id === "nbMargin" && S.nb) { S.nb.margin = +e.target.value; const v = $("#nbMv"); if (v) v.textContent = S.nb.margin; } });
document.addEventListener("keydown", (e) => { if (S.game === "nbrapid" && S.nb && S.nb.phase === "play" && !/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ""))) { if (e.key === "ArrowLeft") { e.preventDefault(); nbRapidPick("a"); } else if (e.key === "ArrowRight") { e.preventDefault(); nbRapidPick("h"); } } });
addEventListener("hashchange", () => { if (S.nb && S.nb.timer && S.game !== "nbrapid") clearInterval(S.nb.timer); });

/* ---------- hub, play room and record lines with the model games ---------- */
function renderPlayRoom() {
  stopTheatre();
  if (S.game) S.hubGroup = S.rk ? "ranked" : MODEL_IDS.includes(S.game) ? "model" : "bk";
  if (!S.game) return renderHub();
  stopQuiz();
  if (NB_TITLE[S.game]) return renderNB();
  if (QDEF[S.game]) { if (!Q.s || Q.s.game !== S.game || Q.s.scope !== S.code) newQuiz(S.game, "solo", S.code); else renderQuiz(); return; }
  ({ finish: renderFinish, roulette: renderRoulette, ttt: renderTTT })[S.game]();
}
function recordLine(c, id) {
  if (id === "who" || id === "career" || id === "club" || id === "blur" || id === "finish" || id === "scramble" || id === "dropped") { const b = store.items[`best_${id}_${c}_${S.diff}`]; return b ? `best ${b.best} (${S.diff})` : "not played yet"; }
  if (NB_TITLE[id]) { const b = store.items[`nbbest_${id}`]; return b ? `best ${b.best}` : "not played yet"; }
  return "";
}
{ const hubOld = renderHub;
  renderHub = function () {
    if (S.hubGroup === "model") { const clubs = Object.keys(CREST), pick = (k) => [0, 1, 2].map((j) => clubs[hash(`nbm-${k}-${j}`) % clubs.length]);
      $("#room").innerHTML = `<h2 class="sec"><svg class=ic><use href=#i-trophy></use></svg> Beat the Model</h2><p class="secsub">Real NBA games and a model that never saw them. Over ${(NBO.n || 0).toLocaleString()} games it picked ${Math.round((NBO.acc || 0) * 1000) / 10}% of winners right (always picking the home team: ${Math.round((NBO.home || 0) * 1000) / 10}%).</p><div class="hub">${GAMES.map((x, k) => `<button type="button" class="gcard" data-game="${x.id}" style="--d:${k * 60}ms"><div class="gfaces">${pick(k).map((t) => badge(t, "md")).join("")}</div><div class="gname">${x.name}</div><div class="gmodes">${x.modes}</div><div class="gtag">${x.tag}</div><div class="grec">${recordLine(S.code, x.id)}</div></button>`).join("")}</div>`; return; }
    hubOld();
  };
}

/* =====================================================================================================================
   Call it, version 2: predict the final score and who wins each quarter (real quarter scores exist from about 2019-20 on).
   Points: right winner 2, each quarter right 1 (a tied quarter scores nobody), score error (both teams added up) <=8: 3, <=16: 2, <=28: 1. Max 9 a game.
   ===================================================================================================================== */
const NBQ = NM.quarters || {};
const nbScorePts = (hs, as_, gh, ga, qp, real) => {
  const win = hs > as_ ? "h" : as_ > hs ? "a" : null, rw = real.hs > real.as ? "h" : "a", err = Math.abs(hs - real.hs) + Math.abs(as_ - real.as);
  let q = 0; qp.forEach((k, i) => { const a = real.q[0][i], b = real.q[1][i]; if (a !== b && k === (a > b ? "h" : "a")) q++; });
  const w = win === rw ? 2 : 0, sc = err <= 8 ? 3 : err <= 16 ? 2 : err <= 28 ? 1 : 0;
  return { total: w + q + sc, w, q, sc, err };
};
const nbRealOf = (g) => ({ hs: g[3], as: g[4], q: g[13] });
Object.assign(HOWTO, {
  "g:nbcall": ["Call it", ["What you do", "A real NBA game from the past appears with both teams' records going in. Predict the final score and tap who wins each quarter. You can't see the result."], ["Scoring", "Up to 9 points a game: 2 for the right winner, 1 for each quarter you get right (a tied quarter scores nobody), and up to 3 for how close your score is (both teams' points added up: within 8 points: 3, within 16: 2, within 28: 1). The model plays the same games and scores the same way."], ["Good to know", `Quarter scores exist only from ${seasonLab(NBQ.from || 2020)} on, so older games aren't used. Teams appear under today's names.`], ["The model", `A rating that only ever saw games before this one. Over ${(NBQ.n || 0).toLocaleString()} games its scores were off by ${NBQ.score_err || "?"} points (both teams added up) and it picked ${Math.round((NBQ.q_acc || 0) * 1000) / 10}% of quarter winners.`]],
  "g:nbdaily": ["Daily 5", ["What you do", "Five real games, the same for everyone today. Predict each score and quarter winners."], ["Scoring", "Same as Call it: up to 9 a game, 45 in all."], ["Tip", "Share your score with a friend and see who did better."]],
});
HOWTO["g:nbbracket"][3] = ["Good to know", "Teams appear under today's names, so the 2009 Hornets show as the Pelicans."];
GAMES.find((x) => x.id === "nbcall").tag = "Five real NBA games. Predict the score and who wins each quarter, then see what the model said.";
GAMES.find((x) => x.id === "nbdaily").tag = "The same five games for everyone today: score and quarters. Beat the model and share your result.";
BOARD_GAMES.forEach((b) => { if (b[0] === "nbcall" || b[0] === "nbdaily") b[2] = "points (of 45)"; });
function nbStart(game) {
  const daily = game === "nbdaily", key = "nbd_" + todayKey();
  if (daily && store.items[key]) { S.nb = { game, phase: "done", ...store.items[key] }; return; }
  if (game === "nbbracket") { S.nb = nbBracketNew(); return; }
  const rng = daily ? mulberry(hash("nbd" + todayKey())) : Math.random;
  S.nb = { game, round: 1, rounds: game === "nbrapid" ? 999 : 5, items: nbItems(game === "nbrapid" ? 400 : 5, rng), ypts: 0, mpts: 0, phase: game === "nbrapid" ? "intro" : "ask", log: [], you: 0, mod: 0, n: 0, streak: 0, best: 0, left: 60 };
  nbResetGuess(S.nb);
}
const nbResetGuess = (s) => { s.gh = 110; s.ga = 108; s.qp = [null, null, null, null]; };
function renderNB() {
  const g = S.game;
  if (!S.nb || S.nb.game !== g) { if (S.nb && S.nb.timer) clearInterval(S.nb.timer); nbStart(g); }
  const s = S.nb; if (g === "nbrapid") return renderNBRapid(); if (g === "nbbracket") return renderNBBracket();
  if (s.phase === "done") return renderNBDone();
  const it = s.items[s.round - 1], H = it[1], A = it[2], hud = `<div class="qhud"><span class="label">Game ${s.round} of ${s.rounds}</span><span class="num qscore"><small>You</small> <b>${s.ypts}</b></span><span class="num qscore"><small>Model</small> <b>${s.mpts}</b></span></div>`;
  const ctx = `<div class="fine" style="text-align:center">${esc(nbDate(it[0]))} · ${seasonLab(it[10])} ${it[9] === 3 ? "· Playoffs" : "· Regular season"}</div>`;
  const head = (rev) => `<div class="nbscore"><div class="nbtm">${nbLogo(A, "xl")}<b>${esc(A)}</b><span class="fine">Away · ${esc(it[8])}</span></div><div class="nbvs">at</div><div class="nbtm">${nbLogo(H, "xl")}<b>${esc(H)}</b><span class="fine">Home · ${esc(it[7])}</span></div></div>`;
  if (s.phase === "reveal") {
    const r = s.last, real = nbRealOf(it), mp = s.mpred;
    const qrow = (i) => { const a = real.q[1][i], h = real.q[0][i], w = h > a ? "h" : a > h ? "a" : "t"; const mark = (k) => (k === "t" || w === "t" ? "–" : k === w ? "✓" : "✗"); return `<tr><td>Q${i + 1}</td><td class="num">${a}</td><td class="num">${h}</td><td>${w === "t" ? "tie" : esc(w === "h" ? H : A)}</td><td>${s.qp[i] === "h" ? esc(H) : esc(A)} ${mark(s.qp[i])}</td><td>${mp.q[i] === "h" ? esc(H) : esc(A)} ${mark(mp.q[i])}</td></tr>`; };
    $("#room").innerHTML = `<div class="card">${gamesBar(NB_TITLE[g])}${hud}${ctx}${head()}
      <div class="rcard on" style="margin-top:12px"><div class="label">Final: ${esc(A)} ${real.as} – ${real.hs} ${esc(H)}${(real.q[0].reduce((a, b) => a + b, 0) !== real.hs) ? " (overtime)" : ""}</div>
      <div class="nbtable"><table><thead><tr><th></th><th>${esc(A)}</th><th>${esc(H)}</th><th>Won by</th><th>You</th><th>Model</th></tr></thead><tbody>${[0, 1, 2, 3].map(qrow).join("")}</tbody></table></div>
      <div class="verdicts" style="margin-top:10px"><div class="vd ${r.you.total >= r.mod.total ? "ok" : "no"}"><span class="label">You: ${esc(A)} ${s.ga} – ${s.gh} ${esc(H)}</span><b class="num">+${r.you.total}</b><span class="fine">winner ${r.you.w}, quarters ${r.you.q}, score ${r.you.sc} (off by ${r.you.err})</span></div>
      <div class="vd ${r.mod.total >= r.you.total ? "ok" : "no"}"><span class="label">Model: ${esc(A)} ${Math.round(it[12])} – ${Math.round(it[11])} ${esc(H)}</span><b class="num">+${r.mod.total}</b><span class="fine">winner ${r.mod.w}, quarters ${r.mod.q}, score ${r.mod.sc} (off by ${r.mod.err})</span></div></div></div>
      <div class="row" style="margin-top:12px"><button class="btn" id="nbNext" type="button">${s.round >= s.rounds ? "See the final score" : "Next game"}</button></div></div>`; return;
  }
  const step = (k, v) => `<div class="nbstep"><button type="button" class="btn ghost" data-nbstep="${k}|-1" aria-label="minus one">−</button><input class="num" id="nbS${k}" inputmode="numeric" value="${v}" aria-label="${k === "h" ? H : A} points"><button type="button" class="btn ghost" data-nbstep="${k}|1" aria-label="plus one">+</button></div>`;
  const qbtn = (i, k) => `<button type="button" class="holc nbq ${s.qp[i] === k ? "sel" : ""}" data-nbq="${i}|${k}">${nbLogo(k === "h" ? H : A, "sm")}<b>${esc(k === "h" ? H : A)}</b></button>`;
  const ready = s.qp.every(Boolean) && s.gh !== s.ga;
  $("#room").innerHTML = `<div class="card">${gamesBar(NB_TITLE[g])}${hud}${ctx}${head()}
    <div class="label" style="margin:12px 0 6px">Final score</div><div class="nbscore"><div class="nbtm">${step("a", s.ga)}</div><div class="nbvs">–</div><div class="nbtm">${step("h", s.gh)}</div></div>
    <div class="label" style="margin:12px 0 6px">Who wins each quarter?</div>${[0, 1, 2, 3].map((i) => `<div class="nbqrow"><span class="num">Q${i + 1}</span>${qbtn(i, "a")}${qbtn(i, "h")}</div>`).join("")}
    <div class="row" style="margin-top:12px"><button class="btn" id="nbLock" type="button" ${ready ? "" : "disabled"}>Lock it in</button>${ready ? "" : `<span class="fine">${s.gh === s.ga ? "Someone has to win: change a score. " : ""}${s.qp.every(Boolean) ? "" : "Pick all four quarters."}</span>`}</div></div>`;
}
function nbLock() {
  const s = S.nb, it = s.items[s.round - 1]; if (!s.qp.every(Boolean) || s.gh === s.ga) return; const real = nbRealOf(it);
  const mp = { gh: Math.round(it[11]), ga: Math.round(it[12]), q: [0, 1, 2, 3].map(() => (it[6] > 0 ? "h" : "a")) }; if (mp.gh === mp.ga) it[6] > 0 ? mp.gh++ : mp.ga++;
  const you = nbScorePts(s.gh, s.ga, s.gh, s.ga, s.qp, real), mod = nbScorePts(mp.gh, mp.ga, mp.gh, mp.ga, mp.q, real);
  s.ypts += you.total; s.mpts += mod.total; s.last = { you, mod }; s.mpred = mp; s.log.push([it[0], it[1], it[2], `${s.ga}-${s.gh}`, you.err, you.total, mod.total, `${real.as}-${real.hs}`]); s.phase = "reveal"; Snd.lock(); renderNB();
  setTimeout(() => { you.total >= 7 ? (Snd.win(), confetti()) : you.total > 0 ? Snd.right() : Snd.wrong(); }, 350);
}
function nbNext() { const s = S.nb; if (s.round >= s.rounds) return nbFinish(); s.round++; nbResetGuess(s); s.phase = "ask"; renderNB(); }
function renderNBDone() {
  const s = S.nb, f = s.final || s, win = f.ypts > f.mpts, tie = f.ypts === f.mpts;
  $("#room").innerHTML = `<div class="card">${gamesBar(NB_TITLE[s.game])}<div class="rcard on"><div class="label">Final score</div><b style="font-size:26px">${win ? "You beat the model" : tie ? "A tie with the model" : "The model won"}</b>
    <div class="tiles" style="margin-top:10px"><div class="tile"><b class="num">${f.ypts}</b><small>you, of 45</small></div><div class="tile"><b class="num">${f.mpts}</b><small>model</small></div></div>
    <div class="lb" style="margin-top:10px">${(f.log || []).map((r) => `<div class="lbrow"><span class="fine">${esc(nbDate(r[0]))}</span><span>${esc(r[2])} at ${esc(r[1])}: real ${esc(r[7])}</span><span class="fine">You ${esc(r[3])} (+${r[5]}) · Model +${r[6]}</span></div>`).join("")}</div></div>
    <div class="row" style="margin-top:12px">${s.game === "nbdaily" ? '<span class="fine">Come back tomorrow for a fresh five.</span>' : '<button class="btn" id="nbAgain" type="button">Play again</button>'}<button class="btn ghost" id="nbShare" type="button">Copy my result</button></div></div>`;
}
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-nbstep],[data-nbq]"); if (!t || !S.nb || S.nb.phase !== "ask" || !NB_TITLE[S.game]) return; const s = S.nb;
  if (t.dataset.nbstep) { const [k, d] = t.dataset.nbstep.split("|"), key = k === "h" ? "gh" : "ga"; s[key] = Math.max(60, Math.min(170, s[key] + +d)); Snd.tick(); return renderNB(); }
  if (t.dataset.nbq) { const [i, k] = t.dataset.nbq.split("|"); s.qp[+i] = k; Snd.tick(); return renderNB(); }
});
document.addEventListener("change", (e) => { const m = /^nbS([ha])$/.exec(e.target.id || ""); if (m && S.nb) { const v = Math.max(60, Math.min(170, parseInt(e.target.value, 10) || 100)); S.nb[m[1] === "h" ? "gh" : "ga"] = v; renderNB(); } });

/* =====================================================================================================================
   The basketball look: hardwood, a hoop that swishes, jersey type, scoreboard numbers. (Football keeps its floodlit stadium.)
   ===================================================================================================================== */
{ const css = document.createElement("style"); css.textContent = `
:root{--display:"Anton","Barlow Condensed",Impact,sans-serif}
:root[data-league]{--display:"Anton","Barlow Condensed",Impact,sans-serif}
body{background:var(--bg)}
body::before{content:"";position:fixed;inset:0;z-index:-2;pointer-events:none;background:repeating-linear-gradient(90deg,rgba(255,170,90,.035) 0 2px,transparent 2px 64px),radial-gradient(1100px 520px at 50% -8%,rgba(255,138,61,.16),transparent 70%);transform:translateZ(0)}
.stadium{contain:strict;will-change:transform}
h1,h2,h3,.dname,.gname,.name,.big,.big2,.bigpos{font-family:var(--display);letter-spacing:.015em;text-transform:uppercase;font-weight:400}
h1{font-size:clamp(54px,11vw,110px);line-height:.95}
h1 em{font-style:normal;color:var(--accent);text-shadow:0 3px 0 rgba(0,0,0,.35)}
.label,.gmodes,.qhud .label{font-family:"Barlow Condensed",var(--body);letter-spacing:.12em;text-transform:uppercase}
.num{font-family:"Barlow Condensed",var(--mono);font-weight:700;letter-spacing:.02em}
.card,.gcard,.door,.gpick,.rcard,.howcard{border-radius:14px;border:1px solid color-mix(in srgb,var(--accent) 22%,var(--line));background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 92%,#fff 3%),var(--surface))}
.gcard,.door,.gpick{position:relative;overflow:hidden;transition:transform .28s cubic-bezier(.3,1.6,.5,1),border-color .2s,box-shadow .2s}
.gcard::after,.door::after,.gpick::after{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:repeating-linear-gradient(90deg,var(--accent) 0 14px,transparent 14px 20px);opacity:.85}
.gcard:hover,.door:hover,.gpick:hover{transform:translateY(-6px) scale(1.015);border-color:var(--accent);box-shadow:0 18px 40px -18px var(--accent)}
.gcard:active,.door:active,.gpick:active{transform:translateY(2px) scale(.985)}
.btn{border-radius:10px;font-family:"Barlow Condensed",var(--body);font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:1.02em;transition:transform .2s cubic-bezier(.3,1.7,.5,1)}
.btn:hover{transform:translateY(-2px)}.btn:active{transform:translateY(2px) scale(.97)}
.chip[aria-pressed=true]{background:var(--accent);color:var(--on-accent)}
.badge.hface img{object-fit:cover}
.photowall .wtile{border-radius:12px}
#scorebox{display:none}
.homehero h1{animation:nbdrop .9s cubic-bezier(.3,1.5,.5,1) both}
@keyframes nbdrop{0%{transform:translateY(-60px) scaleY(1.15);opacity:0}55%{transform:translateY(0) scaleY(.9)}75%{transform:translateY(-12px) scaleY(1.04)}100%{transform:none;opacity:1}}
.gcard:hover .gfaces .badge,.door:hover .gfaces .badge,.gpick:hover .gfaces .badge{animation:nbhop 1.1s ease-in-out infinite}.gcard:hover .gfaces .badge:nth-child(2){animation-delay:.12s}.gcard:hover .gfaces .badge:nth-child(3){animation-delay:.24s}
@keyframes nbhop{0%,100%{transform:translateY(0)}12%{transform:translateY(-8px)}24%{transform:translateY(0) scale(1.04,.94)}30%{transform:none}}
.nbscore{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;background:#0a0603;border:2px solid color-mix(in srgb,var(--accent) 50%,#000);border-radius:12px;padding:12px}
.nbtm{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}.nbtm b{font-family:var(--display);text-transform:uppercase;font-weight:400;letter-spacing:.03em;font-size:20px}
.nbvs{font:700 22px "Barlow Condensed",sans-serif;color:var(--muted)}
.nbstep{display:flex;align-items:center;gap:6px}.nbstep input{width:88px;text-align:center;font-size:44px;line-height:1;background:transparent;border:0;border-bottom:3px solid var(--accent);color:#ffd23f;text-shadow:0 0 14px rgba(255,138,61,.55)}
.nbstep .btn{width:38px;height:38px;padding:0;font-size:22px}
@media (max-width:480px){.nbstep{gap:3px}.nbstep input{width:58px;font-size:32px}.nbstep .btn{width:30px;height:30px;font-size:18px}.nbscore{gap:6px}}
.nbqrow{display:grid;grid-template-columns:34px 1fr 1fr;gap:8px;align-items:center;margin-bottom:6px}
.nbq{flex-direction:row;gap:8px;padding:8px 10px;min-height:0}.nbq b{font-size:15px}.nbq.sel{outline:3px solid var(--accent);background:color-mix(in srgb,var(--accent) 18%,var(--surface))}
.nbtable{overflow-x:auto}.nbtable table{width:100%;border-collapse:collapse;font-size:14px}.nbtable th{font:600 12px "Barlow Condensed",sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:left;padding:4px 6px}.nbtable td{padding:6px;border-top:1px solid var(--line)}
.nbbars{display:grid;gap:6px}.nbbar{display:grid;grid-template-columns:78px 1fr 56px;gap:8px;align-items:center;font-size:14px}.nbbar i{display:block;height:12px;border-radius:3px;background:var(--line);overflow:hidden}.nbbar b{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));width:var(--w);transform-origin:left;animation:nbgrow .9s cubic-bezier(.2,.9,.3,1) both}
@keyframes nbgrow{from{transform:scaleX(0)}}
.nbrate{display:grid;grid-template-columns:28px 40px 1fr 60px;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--line)}
.court-rim{animation:none}.nbnet{transform-origin:50% 0;animation:nbswish 2.4s ease-in-out infinite}
@keyframes nbswish{0%,52%,100%{transform:scaleY(1) scaleX(1)}58%{transform:scaleY(1.22) scaleX(.9)}66%{transform:scaleY(.92) scaleX(1.06)}74%{transform:none}}
.nbball{animation:nbball 2.4s cubic-bezier(.35,.1,.55,1) infinite}
@keyframes nbball{0%{transform:translate(-340px,150px)}30%{transform:translate(-170px,-60px)}52%{transform:translate(0,40px)}58%{transform:translate(0,95px)}74%{transform:translate(-28px,215px)}84%{transform:translate(-48px,150px)}100%{transform:translate(-340px,150px)}}
@media(prefers-reduced-motion:reduce){.nbball,.nbnet,.gfaces .badge,.homehero h1{animation:none}}
:root[data-motion=reduced] .nbball,:root[data-motion=reduced] .nbnet,:root[data-motion=reduced] .gfaces .badge{animation:none}
`; document.head.appendChild(css); }
function paintStadium(code) {
  const el = $("#stadium"); if (!el) return; const r = mulberry(hash("court" + code)), W = 1200, H = 360;
  let crowd = ""; for (let k = 0; k < 56; k++) { const x = r() * W, y = 150 + r() * 70, col = r() < 0.3 ? "var(--accent)" : r() < 0.5 ? "var(--accent2)" : "#fff"; crowd += `<circle class="fan" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.6 + r() * 2).toFixed(1)}" fill="${col}" style="animation-delay:${(r() * 3).toFixed(2)}s;animation-duration:${(1.4 + r() * 2).toFixed(2)}s"/>`; }
  const net = [0, 1, 2, 3, 4].map((i) => `<path d="M${960 + i * 20} 156 L${970 + i * 15} 205" stroke="#fff" stroke-opacity=".8" stroke-width="2" fill="none"/>`).join("") + `<path d="M964 172h72M968 188h64" stroke="#fff" stroke-opacity=".6" stroke-width="2" fill="none"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs><linearGradient id="floor" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8a5a2b"/><stop offset="1" stop-color="#4a2c12"/></linearGradient></defs>
    ${crowd}
    <path d="M0 ${H} L0 250 L${W} 250 L${W} ${H}Z" fill="url(#floor)" opacity=".9"/>
    <g stroke="#ffe9c9" stroke-opacity=".55" stroke-width="3" fill="none"><path d="M0 252H${W}"/><ellipse cx="420" cy="300" rx="120" ry="30"/><path d="M60 ${H}L180 252M${W - 60} ${H}L${W - 180} 252"/><path d="M860 252L820 ${H}M1140 252L1180 ${H}"/><ellipse cx="1000" cy="300" rx="90" ry="22"/></g>
    <rect x="996" y="96" width="8" height="160" fill="#2b2b2b"/><rect x="940" y="70" width="120" height="76" rx="6" fill="#f5f5f5" fill-opacity=".92" stroke="#bbb" stroke-width="3"/><rect x="975" y="108" width="50" height="34" fill="none" stroke="#e8542e" stroke-width="3"/>
    <g class="nbnet">${net}</g><ellipse cx="1000" cy="156" rx="42" ry="7" fill="none" stroke="#ff6a1a" stroke-width="5"/>
    <g transform="translate(1000 0)"><g class="nbball"><circle r="17" fill="#ff7a1a" stroke="#6b2f08" stroke-width="2"/><path d="M-17 0H17M0-17V17M-12-12Q0 0 -12 12M12-12Q0 0 12 12" stroke="#6b2f08" stroke-width="1.6" fill="none"/></g></g></svg>`;
}

/* ---------- Our model (replaces the football About page) ---------- */
ABOUT_TABS.length = 0; ABOUT_TABS.push(["how", "How the model works"], ["acc", "How good is it?"], ["rate", "Team ratings"], ["limits", "Honest limits and sources"], ["road", "Roadmap and votes"]);
ROADMAP.length = 0; ROADMAP.push(["done", "Basketball beta", "Players, teams and careers from 25 seasons of box scores, plus Beat the Model."], ["next", "Starting five", "Name the five who started a Finals game."], ["next", "Who did it", "Who led the scoring in a famous game?"], ["next", "NBA awards", "Needs a complete source for MVPs, Finals MVPs and more."], ["later", "Higher or lower", "Two players, one stat."]);
{ const aboutOld = renderAboutPage;
  renderAboutPage = function () {
    if (!ABOUT_TABS.some((t) => t[0] === S.abTab)) S.abTab = "how";
    if (S.abTab === "road") return aboutOld();
    const el = $("#aboutPage"), tab = S.abTab, per = NM.summary.perSeason || {}, o = NBO;
    const nav = `<div class="scope" style="padding:2px 0">${ABOUT_TABS.map(([k, n]) => `<button type="button" class="chip" data-abtab="${k}" aria-pressed="${tab === k}">${n}</button>`).join("")}</div>`;
    let body = "";
    if (tab === "how") body = `${String((DATA.about || {}).why || "").trim() ? `<div class="card abx"><h2><svg class=ic><use href=#i-ball></use></svg> Why this exists</h2><div class="abwhy">${esc(String(DATA.about.why).trim()).split(/\n\s*\n/).map((p) => `<p>${p}</p>`).join("")}<div class="fine">In the owner's words.</div></div></div>` : ""}<div class="card abx"><h2><svg class=ic><use href=#i-gear></use></svg> How the model works</h2>
      <p>Every team has a <b>rating</b>, a single number that says how good it is. Everyone starts at 1,500. After each game the winner's rating goes up and the loser's goes down. Beat a strong team, or win by a lot, and it moves more. This is called an <b>Elo rating</b>.</p>
      <h3>What it adds</h3><ul><li><b>Home court.</b> The home team gets a boost worth about 70 rating points.</li><li><b>Tired legs.</b> A team playing the second night of a back-to-back gets a small penalty.</li><li><b>New seasons.</b> Ratings slide a quarter of the way back toward average each summer, because rosters change.</li></ul>
      <h3>From a rating to a score</h3><p>The rating gap gives a predicted <b>margin</b>. Each team's recent scoring and defence give a predicted <b>total</b>. Together they make a predicted score for both teams. To call a <b>quarter</b>, the model picks the team it expects to lead: a quarter is about a quarter of the game, so it mostly follows the favourite.</p>
      <h3>The rule that keeps it honest</h3><p>When the model predicts a game it only uses games played <b>before</b> it. It never sees the result, so beating it means something.</p></div>`;
    else if (tab === "acc") {
      const seasons = Object.keys(per).filter((y) => +y >= 2003 && +y <= 2026).sort(), pct = (v) => Math.round(v * 1000) / 10;
      body = `<div class="card abx"><h2><svg class=ic><use href=#i-trophy></use></svg> How good is it?</h2><div class="tiles"><div class="tile"><b class="num">${pct(o.acc || 0)}%</b><small>winners right, ${(o.n || 0).toLocaleString()} games</small></div><div class="tile"><b class="num">${pct(o.home || 0)}%</b><small>always pick the home team</small></div><div class="tile"><b class="num">${NBQ.score_err || "?"}</b><small>points off, both teams added up</small></div><div class="tile"><b class="num">${pct(NBQ.q_acc || 0)}%</b><small>quarter winners right</small></div></div>
      <p class="fine" style="margin-top:10px">Every number is from games the model had never seen. Basketball has a lot of luck in it, so even good models are wrong about one winner in three. A season here is named by the year it ends, and the model uses earlier seasons only.</p>
      <h3>Winners right, by season</h3><div class="nbbars">${seasons.map((y) => `<div class="nbbar"><span class="fine">${seasonLab(+y)}</span><i><b style="--w:${pct(per[y].acc) * 1.3}%"></b></i><em class="num">${pct(per[y].acc)}%</em></div>`).join("")}</div></div>`;
    } else if (tab === "rate") {
      const list = Object.entries(NM.elo || {}).sort((a, b) => b[1] - a[1]), top = list[0] ? list[0][1] : 1700, lo = list.length ? list[list.length - 1][1] : 1300;
      body = `<div class="card abx"><h2><svg class=ic><use href=#i-rank></use></svg> Team ratings</h2><p class="fine">The model's rating for every team after the latest game in the data. Higher means stronger.</p>${list.map(([t, v], i) => `<div class="nbrate"><span class="num">${i + 1}</span>${badge(t, "sm")}<span>${esc(t)}</span><b class="num">${v}</b></div>`).join("")}</div>`;
    } else body = `<div class="card abx"><h2><svg class=ic><use href=#i-shield></use></svg> Honest limits and sources</h2><ul>
      <li><b>Box scores.</b> Players, teams, scores and titles come from ESPN box scores (via the sportsdataverse project), from the 2001-02 season on. Nothing earlier is used, so career totals say "since 2001-02", and careers that began earlier are left out of Career path.</li>
      <li><b>Bios.</b> Birth dates, heights, birthplaces and nationalities come from Wikidata. If a player has none, he is left out of games that need them.</li>
      <li><b>Quarters.</b> Real quarter scores exist from about ${seasonLab(NBQ.from || 2020)} on, so score and quarter games use those seasons only.</li>
      <li><b>Titles.</b> A player counts as a champion if he played in the playoffs for the title team.</li>
      <li><b>Awards.</b> MVP, Finals MVP, Defensive Player, Rookie, Sixth Man and Most Improved winners for 2001-02 on come from Wikipedia's winner lists and are matched to players by name; any it could not match are left out, never guessed.</li>
      <li><b>Names.</b> Teams appear under today's names, so the Sonics show as the Thunder.</li>
      <li><b>Not affiliated.</b> Team logos and player photos belong to their owners. This is an independent student project, not endorsed by the NBA, any team or any player.</li></ul>
      <p class="fine">Built by moisback22. The model is simple on purpose: it can be explained in a minute, and its accuracy is shown above, not hidden.</p></div>`;
    el.innerHTML = `<nav class="crumbs"><button class="back" data-crumb="menu" type="button">← Menu</button><div class="trail"><span class="crumb cur">Our model</span></div></nav>${nav}${body}`;
  };
}
{ const homeOld = renderHome;
  renderHome = function () { homeOld(); const d = $("#doors"); if (d && !d.querySelector('[data-door="about"]')) d.insertAdjacentHTML("beforeend", `<button type="button" class="door" data-door="about"><div class="gfaces"><span class="rkbig"><svg class=ic><use href=#i-bulb></use></svg></span></div><div class="dname">Our model</div><div class="dtag">How the prediction model works, how good it really is, team ratings, and what the data does not cover.</div><span class="dgo">Read</span></button>`); };
}

/* =====================================================================================================================
   More NBA games: Who dropped it? (a hidden stat line), Starting five, Higher or lower.  All from real box scores.
   ===================================================================================================================== */
const NBX = DATA.nbaXI || [], NBPERF = DATA.nbaPerf || [];
const PBYID = Object.fromEntries(QZ.players.map((p) => [p.id, p]));
const espnFace = (id) => `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${id}.png&w=112&h=82`;
/* ---- Who dropped it? (runs on the shared quiz engine: solo, two players, online) ---- */
function droppedClues(r) {
  const g = r.g, p = r.p, cl = [];
  cl.push(["Stat line", `${g.pts} points, ${g.reb} rebounds and ${g.ast} assists`]);
  cl.push(["Shooting", `${g.fg[0]} of ${g.fg[1]} from the field, ${g.tp[0]} of ${g.tp[1]} from three, in ${g.min} minutes`]);
  if (g.stl >= 3 || g.blk >= 3) cl.push(["Defence", `${g.stl} steal${g.stl === 1 ? "" : "s"} and ${g.blk} block${g.blk === 1 ? "" : "s"}`]);
  cl.push(["Game", `${g.home ? "At home against" : "On the road at"} the ${nbEra(g.opp, nbSeasonOf(g.date))}${g.po ? " in the playoffs" : ""}, ${nbDate(g.date)}`]);
  cl.push(["Result", `${g.won ? "Won" : "Lost"} ${Math.max(...g.score)}-${Math.min(...g.score)}`]);
  if (p.h) cl.push(["Height", `${ftIn(p.h)} tall`]);
  cl.push(["Position", p.sub || p.pos, POSICON[p.pos] || ""]);
  cl.push(["Nationality", p.nat || p.bc, flagOf(p.nat || p.bc)]);
  cl.push(["Team", `Played for the ${nbEra(g.team, nbSeasonOf(g.date))}`, clubBadgeFor(g.team, "sm")]);
  cl.push(["Name", `${p.n.split(" ").length} words, ${p.n.replace(/ /g, "").length} letters, starts with ${p.n[0]}`]);
  return cl;
}
QDEF.dropped = { name: "Who dropped it?", unit: "player", rounds: 5, clueS: 6, mk: (scope) => { const pool = NBPERF.filter((g) => PBYID[g.pid] && playerOK(PBYID[g.pid])); const g = rnd(pool.length >= 150 ? pool : NBPERF.filter((x) => PBYID[x.pid] && poolOK(PBYID[x.pid]))); /* Elite alone has few big games, so it also draws from the wider pool */ return { p: PBYID[g.pid], g }; }, clues: (r) => droppedClues(r), ans: (r) => ({ kind: "player", id: r.p.id, name: r.p.n }) };
/* ---- Starting five ---- */
function nbxStart() {
  const row = rnd(NBX), t = rnd(row.teams), o = row.teams.find((x) => x !== t);
  S.nbx = { row, t, o, slots: t.starters.map(() => null), wrong: 0, hints: 0, phase: "play", score: 0 };
}
function renderXI5() {
  if (!S.nbx) nbxStart(); const s = S.nbx, r = s.row, t = s.t, o = s.o, filled = s.slots.filter(Boolean).length;
  const slot = (st, i) => { const f = s.slots[i], hint = s.hints > 0 || s.phase === "done"; return `<div class="nbslot ${f ? "got" : s.phase === "done" ? "miss" : ""}"><span class="fine">${esc(st.pos || "")}</span>${f || s.phase === "done" ? `<img src="${espnFace(st.id)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()"><b>${esc(st.n)}</b>` : `<span class="num nbq">${hint ? esc(st.n[0]) + " " + "_ ".repeat(Math.max(1, st.n.split(" ").slice(-1)[0].length - 1)) : "?"}</span>`}</div>`; };
  $("#room").innerHTML = `<div class="card">${gamesBar("Starting five")}<div class="qhud"><span class="label">${esc(r.label)} · ${esc(r.season)}</span><span class="num qscore"><small>Score</small> <b>${Math.max(0, filled * 100 - s.wrong * 20 - s.hints * 30)}</b></span></div>
    <div class="nbscore"><div class="nbtm">${nbLogo(t.team, "xl")}<b>${esc(t.team)}</b><span class="fine">${t.side === "home" ? "Home" : "Away"} · ${t.score}</span></div><div class="nbvs">${t.won ? "beat" : "lost to"}</div><div class="nbtm">${nbLogo(o.team, "xl")}<b>${esc(o.team)}</b><span class="fine">${o.score}</span></div></div>
    <p class="sub" style="margin-top:10px">${nbDate(r.date)}. Name the five players who started for the ${esc(t.team)}.</p><div class="nbslots">${t.starters.map(slot).join("")}</div>
    ${s.phase === "done" ? `<div class="row" style="margin-top:12px"><b>${filled === 5 ? "All five!" : filled + " of 5"}</b><button class="btn" id="nbxNext" type="button">Next game</button></div>` : `<div class="row" style="margin-top:12px"><input id="nbxIn" autocomplete="off" placeholder="Type a surname and press Enter" aria-label="Player name" style="flex:1"><button class="btn" id="nbxGo" type="button">Guess</button><button class="btn ghost" id="nbxHint" type="button">Hint (−30)</button><button class="btn ghost" id="nbxGive" type="button">Give up</button></div><p class="fine" id="nbxMsg">${s.msg || "&nbsp;"}</p>`}</div>`;
  const i = $("#nbxIn"); if (i) i.focus();
}
function nbxGuess() {
  const s = S.nbx, i = $("#nbxIn"); if (!s || s.phase !== "play" || !i || !i.value.trim()) return; const v = i.value.trim(), idx = s.t.starters.findIndex((st, k) => !s.slots[k] && nameMatch(v, st.n));
  if (idx >= 0) { s.slots[idx] = s.t.starters[idx].n; s.msg = ""; Snd.right(); } else { s.wrong++; s.msg = `Not a starter in this game (−20).`; Snd.wrong(); }
  if (s.slots.every(Boolean)) nbxEnd(); else renderXI5();
}
function nbxEnd() { const s = S.nbx; s.phase = "done"; const sc = Math.max(0, s.slots.filter(Boolean).length * 100 - s.wrong * 20 - s.hints * 30); s.score = sc; const k = "nbbest_nbxi", cur = store.items[k] || { best: 0 }; if (sc > cur.best) lockIn(k, { best: sc }); reward(10 + Math.round(sc / 25), "Starting five", null); Board.submit({ game: "nbxi", league: "all", score: sc }); if (sc >= 500) { Snd.win(); confetti(); } renderXI5(); }
/* ---- Higher or lower ---- */
const NBH = [["pts", "career points since 2001-02", (p) => p.pts], ["reb", "career rebounds since 2001-02", (p) => p.reb], ["ast", "career assists since 2001-02", (p) => p.ast], ["gp", "regular-season games played since 2001-02", (p) => p.gp], ["bp", "best scoring season since 2001-02 (points a game)", (p) => (p.bp ? p.bp.avg : 0)]];
function nbhPair() {
  const m = rnd(NBH), pool = playerPool("ALL", (p) => playerOK(p) && m[2](p) > 0), ratio = { easy: 1.6, medium: 1.3, hard: 1.12, elite: 1.04 }[S.diff] || 1.3, seen = S.nbhSeen = S.nbhSeen || [];
  for (let t = 0; t < 400; t++) { const a = rnd(pool), b = rnd(pool), va = m[2](a), vb = m[2](b); if (a.id !== b.id && va !== vb && Math.max(va, vb) / Math.min(va, vb) >= ratio && (t > 250 || (!seen.includes(a.id) && !seen.includes(b.id)))) { seen.push(a.id, b.id); S.nbhSeen = seen.slice(-60); return { m, a, b, va, vb, win: va > vb ? "a" : "b", chosen: null }; } }
  return null;
}
function renderHOL2() {
  const s = S.nbh = S.nbh || { streak: 0, q: nbhPair() }; if (!s.q) s.q = nbhPair(); const q = s.q, best = (store.items["nbbest_nbhol"] || { best: 0 }).best;
  if (!q) { $("#room").innerHTML = `<div class="card">${gamesBar("Higher or lower")}<p class="sub">Not enough players at this level.</p></div>`; return; }
  const side = (p, k, v) => { const rev = q.chosen != null, cls = rev ? (q.win === k ? "ans" : q.chosen === k ? "wrong" : "") : ""; return `<button type="button" class="holc ${cls}" data-nbh="${k}" ${rev ? "disabled" : ""}>${playerPic(p, "xl")}<b>${esc(p.n)}</b><span class="fine">${esc(p.sub || p.pos)} · ${esc(p.club || "")}</span><span class="num holv" data-v="${v}">${rev ? Math.round(v * 10) / 10 : "?"}</span></button>`; };
  $("#room").innerHTML = `<div class="card">${gamesBar("Higher or lower")}<p class="sub">Who has more: <b>${q.m[1]}</b>?</p><div class="holpair">${side(q.a, "a", q.va)}<span class="vs">or</span>${side(q.b, "b", q.vb)}</div>
    ${q.chosen != null ? `<div class="row" style="margin-top:14px"><b class="${q.chosen === q.win ? "up" : "down"}">${q.chosen === q.win ? "Right!" : "Wrong."} Streak ${s.streak}</b><button class="btn" id="nbhNext" type="button">${q.chosen === q.win ? "Next" : "Try again"}</button></div>` : `<p class="fine" style="margin-top:10px">Streak ${s.streak} · best ${best}</p>`}</div>`;
}
function nbhAnswer(k) {
  const s = S.nbh, q = s.q; if (!q || q.chosen != null) return; q.chosen = k; const ok = k === q.win; s.streak = ok ? s.streak + 1 : 0;
  const cur = store.items["nbbest_nbhol"] || { best: 0 }; if (s.streak > cur.best) lockIn("nbbest_nbhol", { best: s.streak });
  reward(5 + (ok ? 5 + 2 * Math.min(s.streak, 10) : 0), "Higher or lower", null); if (ok) Board.submit({ game: "nbhol", league: "all", score: s.streak });
  Snd.flip(); renderHOL2(); setTimeout(() => { ok ? (s.streak >= 5 ? Snd.win() : Snd.right()) : Snd.wrong(); if (ok && s.streak >= 5 && s.streak % 5 === 0) confetti(); }, 450);
}
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-nbh],#nbhNext,#nbxGo,#nbxHint,#nbxGive,#nbxNext"); if (!t) return;
  if (S.game === "nbhol") { if (t.dataset.nbh) return nbhAnswer(t.dataset.nbh); if (t.id === "nbhNext") { S.nbh.q = null; return renderHOL2(); } }
  if (S.game === "nbxi" && S.nbx) { if (t.id === "nbxGo") return nbxGuess(); if (t.id === "nbxHint") { S.nbx.hints = Math.min(3, S.nbx.hints + 1); return renderXI5(); } if (t.id === "nbxGive") return nbxEnd(); if (t.id === "nbxNext") { S.nbx = null; return renderXI5(); } }
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "nbxIn") { e.preventDefault(); nbxGuess(); } });
{ const old = renderNB; renderNB = function () { if (S.game === "nbxi") return renderXI5(); if (S.game === "nbhol") return renderHOL2(); old(); }; }
{ const css = document.createElement("style"); css.textContent = `.nbslots{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:10px}.nbslot{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border-radius:12px;border:1px dashed var(--line);min-height:128px;justify-content:center;text-align:center}.nbslot.got{border-style:solid;border-color:var(--ok);background:color-mix(in srgb,var(--ok) 12%,var(--surface))}.nbslot.miss{border-color:var(--bad)}.nbslot img{width:56px;height:56px;border-radius:50%;object-fit:cover;object-position:top;background:var(--surface2)}.nbslot b{font-size:13px}`; document.head.appendChild(css); }
Object.assign(NB_TITLE, { nbxi: "Starting five", nbhol: "Higher or lower" });
["dropped", "nbxi", "nbhol"].forEach((id) => GAME_IDS.push(id));
QUIZ_GAMES.push(
  { id: "dropped", name: "Who dropped it?", modes: "Solo streak · 2 players", tag: "A real stat line with the name hidden: points, rebounds, assists. Clues get easier. Who was it?", faces: () => heroFaces(2) },
  { id: "nbxi", name: "Starting five", modes: "Solo", tag: "A Finals clincher or a Game 7. Name the five who started.", faces: () => heroFaces(3) },
  { id: "nbhol", name: "Higher or lower", modes: "Solo streak", tag: "Two players, one stat. Who has more? Keep the streak alive.", faces: () => heroFaces(2) },
);
Object.assign(HOWTO, {
  "g:dropped": ["Who dropped it?", ["What you do", "A real box-score line from a real game, with the player hidden. The first clue is the stat line; later clues add the game, his height, his team and more. Buzz when you know it and type the name."], ["Scoring", "Up to 1,000 points, falling as clues appear. A wrong guess costs 150."], ["Good to know", `Only big games count: 45+ points, triple-doubles, 24+ rebounds, 20+ assists and similar, from ${COVER} on.`]],
  "g:nbxi": ["Starting five", ["What you do", "A Game 7 or a conference finals or Finals clincher, and one of its teams. Type the surnames of the five players who started."], ["Scoring", "100 per player, minus 20 per wrong guess and 30 per hint. A hint shows each missing player's first letter."], ["Good to know", `Starters come from the real box score. Games are from ${COVER} on.`]],
  "g:nbhol": ["Higher or lower", ["What you do", "Two players and one stat. Pick the one with more. Easy compares superstars with big gaps; Elite compares close numbers."], ["Scoring", "Each right answer grows your streak. One wrong answer ends it."], ["Good to know", `Career numbers count games since ${COVER} only, for both players.`]],
});
BOARD_GAMES.push(["dropped", "Who dropped it?", "points"], ["nbxi", "Starting five", "best score"], ["nbhol", "Higher or lower", "best streak"]);
RK_GAMES.push(["dropped", "Who dropped it?"]);
BK_LABELS.push("Who dropped it?", "Starting five", "Higher or lower");

/* =====================================================================================================================
   Higher or lower, version 2: many kinds of question, and "fewer" as often as "more", so the famous or the better team
   is not always the answer. Players, seasons, titles, height, age and whole teams.
   ===================================================================================================================== */
const NBH_DIFF = (a, b, c, d) => ({ easy: a, medium: b, hard: c, elite: d })[S.diff] || b;
const nbhSeasons = () => Object.keys(LG.NBA.tables).filter((s) => s >= "2003-04");
function nbhFind(pool, val, minRatio, minAbs, tries = 500) {
  const seen = (S.nbhSeen = S.nbhSeen || []);
  for (let t = 0; t < tries; t++) { const a = rnd(pool), b = rnd(pool); if (a === b) continue; const va = val(a), vb = val(b), hi = Math.max(va, vb), lo = Math.min(va, vb); if (va === vb) continue; if (lo > 0 && hi / lo < minRatio) continue; if (hi - lo < minAbs) continue; const ka = a.id || a[0], kb = b.id || b[0]; if (t < 300 && (seen.includes(ka + "|" + kb) || seen.includes(kb + "|" + ka))) continue; seen.push(ka + "|" + kb); S.nbhSeen = seen.slice(-80); return { a, b, va, vb }; }
  return null;
}
const NBH_KINDS = [
  () => { const m = rnd([["pts", "career points", (p) => p.pts], ["reb", "career rebounds", (p) => p.reb], ["ast", "career assists", (p) => p.ast], ["gp", "regular-season games played", (p) => p.gp]]), more = Math.random() < 0.5, pool = playerPool("ALL", (p) => playerOK(p) && m[2](p) > 0), r = nbhFind(pool, m[2], NBH_DIFF(1.7, 1.35, 1.15, 1.05), 0); return r && { ...r, text: `Who has ${more ? "more" : "fewer"} ${m[1]} since ${COVER}?`, more, fmt: (v) => Math.round(v).toLocaleString("en-US") }; },
  () => { const m = rnd([["points", 1, 1.5], ["rebounds", 2, 1], ["assists", 3, 1], ["steals", 4, 0.3], ["blocks", 5, 0.3]]), s = rnd(nbhSeasons()), more = Math.random() < 0.5, pool = playerPool("ALL", (p) => playerOK(p) && p.ss && p.ss[s] && p.ss[s][m[1]] > 0), r = nbhFind(pool, (p) => p.ss[s][m[1]], NBH_DIFF(1.6, 1.3, 1.15, 1.07), m[2]); return r && { ...r, text: `Who averaged ${more ? "more" : "fewer"} ${m[0]} a game in ${s}?`, more, fmt: (v) => v.toFixed(1), ctx: (x) => `${x.club ? "" : ""}` }; },
  () => { const more = Math.random() < 0.7, pool = playerPool("ALL", (p) => poolOK(p)), r = nbhFind(pool, (p) => (p.ti || []).length, 1, 1); return r && Math.max(r.va, r.vb) >= 1 && { ...r, text: `Who has won ${more ? "more" : "fewer"} NBA titles since ${COVER}?`, more, fmt: (v) => String(Math.round(v)) }; },
  () => { const more = Math.random() < 0.5, pool = playerPool("ALL", (p) => playerOK(p) && p.h), r = nbhFind(pool, (p) => p.h, 1, NBH_DIFF(12, 8, 5, 3)); return r && { ...r, text: `Who is ${more ? "taller" : "shorter"}?`, more, fmt: (v) => `${ftIn(v)} (${Math.round(v)} cm)` }; },
  () => { const more = Math.random() < 0.5, pool = playerPool("ALL", (p) => playerOK(p)), r = nbhFind(pool, (p) => Date.parse(p.dob) / 31557600000 + 1970, 1, NBH_DIFF(8, 5, 3, 1)); return r && { ...r, text: `Who is ${more ? "younger" : "older"}?`, more: more, fmt: (v) => `born ${Math.floor(v)}`, flip: true }; },
  () => { const s = rnd(nbhSeasons()), rows = LG.NBA.tables[s], m = rnd([["won", "won", 1, (r) => r[4], NBH_DIFF(14, 9, 5, 3), "games"], ["scored", "scored", 2, (r) => r[2], NBH_DIFF(6, 4, 2.5, 1.5), "points a game"], ["allowed", "allowed", 3, (r) => r[3], NBH_DIFF(6, 4, 2.5, 1.5), "points a game"]]), more = Math.random() < 0.5, r = nbhFind(rows.filter((x) => clubOK(x[0])), m[3], 1, m[4]); return r && { ...r, team: true, text: `Which team ${m[1]} ${more ? "more" : "fewer"} ${m[5]} in ${s}?`, more, fmt: (v) => (m[2] === 1 ? String(v) : v.toFixed(1)) }; },
];
const NBH_W = [3, 6, 1, 2, 2, 4];
function nbhPair() {
  for (let t = 0; t < 40; t++) { let k = Math.random() * NBH_W.reduce((a, b) => a + b, 0), i = 0; while ((k -= NBH_W[i]) > 0) i++; if (i === S.nbhLast && t < 20) continue; const q = NBH_KINDS[i](); if (q) { S.nbhLast = i; const better = q.va > q.vb ? "a" : "b", worse = better === "a" ? "b" : "a"; q.win = q.more ? better : worse; q.chosen = null; return q; } }
  return null;
}
function renderHOL2() {
  const s = S.nbh = S.nbh || { streak: 0, q: null }; if (!s.q) s.q = nbhPair(); const q = s.q, best = (store.items["nbbest_nbhol"] || { best: 0 }).best;
  if (!q) { $("#room").innerHTML = `<div class="card">${gamesBar("Higher or lower")}<p class="sub">Not enough players at this level.</p></div>`; return; }
  const side = (x, k, v) => { const rev = q.chosen != null, cls = rev ? (q.win === k ? "ans" : q.chosen === k ? "wrong" : "") : "", pic = q.team ? badge(x[0], "xl") : playerPic(x, "xl"), nm = q.team ? x[0] : x.n, sub = q.team ? "" : `${esc(x.sub || x.pos)} · ${esc(x.club || "")}`;
    return `<button type="button" class="holc ${cls}" data-nbh="${k}" ${rev ? "disabled" : ""}>${pic}<b>${esc(nm)}</b><span class="fine">${sub}</span><span class="num holv">${rev ? q.fmt(v) : "?"}</span></button>`; };
  $("#room").innerHTML = `<div class="card">${gamesBar("Higher or lower")}<p class="sub" style="font-size:18px"><b>${esc(q.text)}</b></p><div class="holpair">${side(q.a, "a", q.va)}<span class="vs">or</span>${side(q.b, "b", q.vb)}</div>
    ${q.chosen != null ? `<div class="row" style="margin-top:14px"><b class="${q.chosen === q.win ? "up" : "down"}">${q.chosen === q.win ? "Right!" : "Wrong."} Streak ${s.streak}</b><button class="btn" id="nbhNext" type="button">${q.chosen === q.win ? "Next" : "Try again"}</button></div>` : `<p class="fine" style="margin-top:10px">Streak ${s.streak} · best ${best}</p>`}</div>`;
}
HOWTO["g:nbhol"] = ["Higher or lower", ["What you do", "Two players or two teams and one question. It changes every round: more or fewer points in a season, career totals, titles, height, age, or a team's wins. Read the question, it can ask for the lower one."], ["Scoring", "Each right answer grows your streak. One wrong answer ends it."], ["Good to know", `Career numbers count games since ${COVER} only, for both players.`]];

/* =====================================================================================================================
   Discover (basketball): one fun fact, one spotlight player and one question a day, the same for everyone. All computed from the data.
   ===================================================================================================================== */
function nbFacts() {
  const P = QZ.players, top = (f, n = 1) => P.slice().sort((a, b) => f(b) - f(a)).slice(0, n), rows = [];
  Object.entries(LG.NBA.tables).forEach(([s, t]) => t.forEach((r) => rows.push({ s, r })));
  const f = [], c = top((p) => p.pts)[0], r = top((p) => p.reb)[0], a = top((p) => p.ast)[0], m = top((p) => new Set(p.hist).size)[0], w = rows.slice().sort((x, y) => y.r[4] - x.r[4])[0], hs = rows.slice().sort((x, y) => y.r[2] - x.r[2])[0], ds = rows.slice().sort((x, y) => x.r[3] - y.r[3])[0];
  f.push(`${c.n} has scored the most points since ${COVER}: ${c.pts.toLocaleString("en-US")}.`, `${r.n} leads the rebounding since ${COVER} with ${r.reb.toLocaleString("en-US")}.`, `${a.n} has the most assists since ${COVER}: ${a.ast.toLocaleString("en-US")}.`, `${m.n} has played for ${new Set(m.hist).size} different teams since ${COVER}, more than anyone else in the data.`,
    `The best regular season since ${COVER} by wins: the ${w.r[0]} in ${w.s} with ${w.r[4]}.`, `The highest-scoring team season since ${COVER}: the ${hs.r[0]} in ${hs.s}, ${hs.r[2].toFixed(1)} points a game.`, `The stingiest defence since ${COVER}: the ${ds.r[0]} in ${ds.s}, allowing ${ds.r[3].toFixed(1)} points a game.`);
  const tall = top((p) => p.h || 0)[0]; f.push(`${tall.n} is the tallest player in the data at ${ftIn(tall.h)}.`);
  const ti = top((p) => (p.ti || []).length)[0]; if (ti && (ti.ti || []).length) f.push(`${ti.n} has won the most titles since ${COVER}: ${ti.ti.length}.`);
  return f;
}
function renderDiscover() {
  const day = todayKey(), rng = mulberry(hash("nbdisc" + day)), el = $("#discPage"), facts = nbFacts(), fact = facts[Math.floor(rng() * facts.length)];
  const spot = QZ.players.filter((p) => playerOK({ ...p }) || true).filter((p) => FAME.get(p.id) < 400)[Math.floor(rng() * 400)] || QZ.players[0];
  const seasons = Object.keys(NM.series || {}).filter((y) => +y >= 2003).sort(), y = seasons[Math.floor(rng() * seasons.length)], champ = ((NM.series[y] || []).slice(-1)[0] || {}).win, champName = champ ? teamById(champ) : null;
  const opts = champName ? shuffle([champName, ...shuffle(Object.keys(QZ.clubs).filter((n) => n !== champName)).slice(0, 3)]) : [], saved = store.items["dq_" + day];
  const sline = [spot.sub || spot.pos, spot.nat ? "from " + spot.nat : "", spot.active ? `plays for the ${spot.club}` : `last played for the ${spot.club}`, spot.bp ? `best scoring season: ${spot.bp.avg} points a game (${spot.bp.season})` : ""].filter(Boolean).join(" · ");
  el.innerHTML = `<nav class="crumbs"><button class="back" data-crumb="menu" type="button">← Menu</button><div class="trail"><span class="crumb cur">Discover</span></div></nav>
    <div class="card abx"><div class="label">Today</div><h2><svg class=ic><use href=#i-bulb></use></svg> Fun fact</h2><p style="font-size:18px">${esc(fact)}</p></div>
    <div class="card abx"><div class="label">Spotlight</div><div class="row" style="gap:14px">${playerPic(spot, "xl")}<div><h3 style="font-size:28px">${esc(spot.n)}</h3><div class="fine">${esc(sline)}</div></div></div></div>
    ${champName ? `<div class="card abx"><div class="label">Question of the day</div><h3>Who won the NBA title in ${seasonLab(+y)}?</h3><div class="holpair" style="flex-wrap:wrap">${opts.map((n) => `<button type="button" class="holc ${saved ? (n === champName ? "ans" : saved.pick === n ? "wrong" : "") : ""}" data-nbdq="${esc(n)}" ${saved ? "disabled" : ""}>${badge(n, "md")}<b>${esc(n)}</b></button>`).join("")}</div>${saved ? `<p class="fine" style="margin-top:8px">${saved.pick === champName ? "Right!" : "Not quite."} It was the ${esc(champName)}. Come back tomorrow.</p>` : ""}</div>` : ""}`;
  el._champ = champName;
}
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-nbdq]"); if (!b) return; const day = todayKey(), el = $("#discPage"); if (store.items["dq_" + day]) return; const pick = b.dataset.nbdq, ok = pick === el._champ; lockIn("dq_" + day, { pick }); reward(ok ? 15 : 5, "Daily question", null); ok ? (Snd.win(), confetti()) : Snd.wrong(); renderDiscover(); });
{ const homeOld2 = renderHome; renderHome = function () { homeOld2(); const d = $("#doors"); if (d && !d.querySelector('[data-door="discover"]')) d.insertAdjacentHTML("beforeend", `<button type="button" class="door" data-door="discover"><div class="gfaces"><span class="rkbig"><svg class=ic><use href=#i-compass></use></svg></span></div><div class="dname">Discover</div><div class="dtag">A fun fact, a spotlight player and a question, new every day.</div><span class="dgo">Open</span></button>`); }; }
/* basketball text is English only for now, so the football-only language picker is hidden */
{ const css = document.createElement("style"); css.textContent = `[data-lang],#langRow{display:none!important}`; document.head.appendChild(css); }

/* ---------- Odd one out: three of these four fit, one does not ---------- */
function nboNew() {
  const kinds = [
    () => { const teams = Object.keys(QZ.clubs).filter((t) => clubOK(t)), t = rnd(teams), pool = playerPool("ALL", (p) => playerOK(p)), yes = shuffle(pool.filter((p) => p.hist.includes(t))).slice(0, 3), no = rnd(pool.filter((p) => !p.hist.includes(t) && !p.partial)); return yes.length === 3 && no && { text: `Which of these players never played for the ${t} (since ${COVER})?`, yes, no, why: `${no.n} never played for the ${t}.` }; },
    () => { const pool = playerPool("ALL", (p) => playerOK(p)), yes = shuffle(pool.filter((p) => (p.ti || []).length)).slice(0, 3), no = rnd(pool.filter((p) => !(p.ti || []).length && p.gp > 700)); return yes.length === 3 && no && { text: `Which of these players has never won an NBA title (since ${COVER})?`, yes, no, why: `${no.n} has no title since ${COVER}.` }; },
    () => { const pool = playerPool("ALL", (p) => playerOK(p) && p.bp), yes = shuffle(pool.filter((p) => p.bp.avg >= 22)).slice(0, 3), no = rnd(pool.filter((p) => p.bp.avg < 14)); return yes.length === 3 && no && { text: `Which of these players never averaged 22+ points in a season (since ${COVER})?`, yes, no, why: `${no.n}'s best was ${no.bp.avg}.` }; },
  ];
  for (let t = 0; t < 40; t++) { const q = rnd(kinds)(); if (q) { q.opts = shuffle([...q.yes, q.no]); q.chosen = null; return q; } }
  return null;
}
function renderODD() {
  const s = S.nbo = S.nbo || { streak: 0, q: null }; if (!s.q) s.q = nboNew(); const q = s.q, best = (store.items["nbbest_nbodd"] || { best: 0 }).best;
  if (!q) { $("#room").innerHTML = `<div class="card">${gamesBar("Odd one out")}<p class="sub">Not enough players at this level.</p></div>`; return; }
  $("#room").innerHTML = `<div class="card">${gamesBar("Odd one out")}<p class="sub" style="font-size:18px"><b>${esc(q.text)}</b></p><div class="holpair" style="flex-wrap:wrap">${q.opts.map((p) => { const rev = q.chosen != null, cls = rev ? (p === q.no ? "ans" : p === q.chosen ? "wrong" : "") : ""; return `<button type="button" class="holc ${cls}" data-nbo="${p.id}" ${rev ? "disabled" : ""}>${playerPic(p, "xl")}<b>${esc(p.n)}</b><span class="fine">${esc(p.sub || p.pos)}</span></button>`; }).join("")}</div>
    ${q.chosen != null ? `<div class="row" style="margin-top:14px"><b class="${q.chosen === q.no ? "up" : "down"}">${q.chosen === q.no ? "Right!" : "Wrong."} ${esc(q.why)} Streak ${s.streak}</b><button class="btn" id="nboNext" type="button">${q.chosen === q.no ? "Next" : "Try again"}</button></div>` : `<p class="fine" style="margin-top:10px">Streak ${s.streak} · best ${best}</p>`}</div>`;
}
document.addEventListener("click", (e) => { if (S.game !== "nbodd") return; const t = e.target.closest && e.target.closest("[data-nbo],#nboNext"); if (!t) return; const s = S.nbo;
  if (t.id === "nboNext") { s.q = null; return renderODD(); }
  const q = s.q; if (q.chosen != null) return; q.chosen = q.opts.find((p) => String(p.id) === t.dataset.nbo); const ok = q.chosen === q.no; s.streak = ok ? s.streak + 1 : 0;
  const cur = store.items["nbbest_nbodd"] || { best: 0 }; if (s.streak > cur.best) lockIn("nbbest_nbodd", { best: s.streak }); reward(5 + (ok ? 5 + 2 * Math.min(s.streak, 10) : 0), "Odd one out", null); if (ok) Board.submit({ game: "nbodd", league: "all", score: s.streak });
  Snd.flip(); renderODD(); setTimeout(() => { ok ? Snd.right() : Snd.wrong(); if (ok && s.streak % 5 === 0) confetti(); }, 400); });
{ const old2 = renderNB; renderNB = function () { if (S.game === "nbodd") return renderODD(); old2(); }; }
NB_TITLE.nbodd = "Odd one out"; GAME_IDS.push("nbodd");
QUIZ_GAMES.push({ id: "nbodd", name: "Odd one out", modes: "Solo streak", tag: "Four players, one does not belong. Who never played for the team, never won a title, never scored 22 a night?", faces: () => heroFaces(3) });
HOWTO["g:nbodd"] = ["Odd one out", ["What you do", "Three of the four players fit the question and one does not. Tap the odd one out."], ["Scoring", "Each right answer grows your streak. One wrong answer ends it."], ["Good to know", `Everything counts from ${COVER} on only, and the question says so.`]];
BOARD_GAMES.push(["nbodd", "Odd one out", "best streak"]); BK_LABELS.push("Odd one out");

/* =====================================================================================================================
   Speed: lighter visuals on slow devices, scoreboard look, team colours, more motion.
   ===================================================================================================================== */
{ const css = document.createElement("style"); css.textContent = `
:root[data-perf=low] .stadium,:root[data-perf=low] #fx,:root[data-perf=low] .photowall,:root[data-perf=low] body::before{display:none!important}
:root[data-perf=low] *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;backdrop-filter:none!important}
.nbstep input,.nbvs,.qhud .qscore b,#nbRpTime,.nbtable td.num,.nbscore .nbpts{font-family:"Orbitron","Barlow Condensed",monospace;font-weight:900;letter-spacing:.04em}
.nbstep input{color:#ffb21f;text-shadow:0 0 10px rgba(255,150,20,.7)}
.nbscore{box-shadow:inset 0 0 0 1px rgba(255,255,255,.05),0 10px 30px -14px #000}
.nbpts{font-size:34px;color:#ffb21f;text-shadow:0 0 12px rgba(255,150,20,.65);line-height:1}
#nbRpTime{display:inline-block;min-width:64px;text-align:center;font-size:34px;color:#ff5a2a;background:#0a0603;border:2px solid #3a1d0e;border-radius:10px;padding:2px 10px;text-shadow:0 0 12px rgba(255,90,40,.8)}
.nbq.sel{box-shadow:0 0 0 3px var(--accent),0 0 22px -4px var(--accent)}
#room>.card,#room .gcard{animation:nbin .45s cubic-bezier(.2,.9,.3,1) both}
@keyframes nbin{from{opacity:0;transform:translateY(14px) scale(.985)}}
.holc.ans{animation:nbwin .6s cubic-bezier(.3,1.6,.5,1)}.holc.wrong{animation:nbshake .4s}
@keyframes nbwin{0%{transform:scale(1)}40%{transform:scale(1.07)}100%{transform:scale(1)}}@keyframes nbshake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
`; document.head.appendChild(css); }
/* team colours: the matchup scoreboard glows in both teams' colours, and favourite-team themes use real team colours */
const nbLum = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
const nbCol = (team) => { const c = (DATA.colors || {})[team]; if (!c) return "#ff8a3d"; return nbLum(c[0]) < 70 && c[1] ? c[1] : c[0]; };
const nbBoard = (away, home) => `background:linear-gradient(90deg,color-mix(in srgb,${nbCol(away)} 38%,#0a0603),#0a0603 38%,#0a0603 62%,color-mix(in srgb,${nbCol(home)} 38%,#0a0603));border-color:color-mix(in srgb,${nbCol(home)} 60%,#000)`;
{ const old = renderNB; renderNB = function () { old(); const s = S.nb; if (!s || !s.items) { if (S.game === "nbxi" && S.nbx) tint(S.nbx.t.team, S.nbx.o.team); return; } const it = s.items[s.round - 1]; if (it && S.game !== "nbrapid") tint(it[2], it[1]); else if (it && S.game === "nbrapid") tint(it[2], it[1]); };
  function tint(a, h) { const el = document.querySelector("#room .nbscore"); if (el) el.setAttribute("style", nbBoard(a, h)); const r = document.documentElement; r.style.setProperty("--accent", nbCol(h)); }
}
/* count-up on the revealed final score */
{ const old2 = renderNB; renderNB = function () { old2(); document.querySelectorAll("#room .rcard .label").forEach((l) => { if (!/^Final:/.test(l.textContent)) return; }); const t = $("#nbRpTime"); if (t) t.classList.add("nbclock"); }; }
/* slow device? measure the frame rate for two seconds while the page is in view, and only switch to lighter visuals if it is clearly low (under 30 fps). A hidden tab is never measured, because browsers slow those down on purpose. */
setTimeout(() => { if (matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) return; let n = 0, t0 = performance.now(), aborted = false; const vis = () => { if (document.hidden) aborted = true; }; document.addEventListener("visibilitychange", vis);
  const f = (t) => { n++; if (aborted) return; if (t - t0 < 2500) requestAnimationFrame(f); else { document.removeEventListener("visibilitychange", vis); const fps = n * 1000 / (t - t0); if (fps < 30 && !document.documentElement.dataset.perf) { document.documentElement.dataset.perf = "low"; try { toast("Switched to lighter visuals to keep things smooth"); } catch (e) { /* ok */ } } } }; requestAnimationFrame(f); }, 3500);
{ const css = document.createElement("style"); css.textContent = `.lhead .flag,#lFlag{display:none!important}.bar a.pill{color:var(--muted);text-decoration:none;white-space:nowrap}.bar a.pill:hover{color:var(--ink)}`; document.head.appendChild(css); }

const _icss = document.createElement("style"); _icss.textContent = `h2 svg.ic,h3 svg.ic,.sec svg.ic{color:var(--accent);width:1.1em;height:1.1em;vertical-align:-.15em}`; document.head.appendChild(_icss);

/* =====================================================================================================================
   Our model > Look up: a player's season-by-season history, or a team's seasons and how each ended.
   ===================================================================================================================== */
ABOUT_TABS.unshift(["look", "Look up a player or team"]);
const nbSeasonsLeft = (cr, s) => { const hit = (cr || []).find(([, a, b]) => a <= s && s <= b); return hit ? hit[0] : ""; };
function nbLkSearch(q) { const n = qnorm(q); if (n.length < 2) return []; const out = [];
  Object.keys(QZ.clubs).forEach((t) => { const f = QZ.clubs[t]; if (qnorm(t + " " + (f.full || "") + " " + (f.loc || "")).includes(n)) out.push({ k: "t|" + t, label: f.full || t, sub: "team", s: 0 }); });
  QZ.players.forEach((p) => { const nm = qnorm(p.n); if (nm.includes(n)) out.push({ k: "p|" + p.id, label: p.n, sub: `${p.club || ""} · ${p.first.slice(0, 4)}-${p.last.slice(0, 4)}`, s: nm.startsWith(n) || qnorm(p.n.split(" ").slice(-1)[0]).startsWith(n) ? 0 : 1, f: p.rk }); });
  return out.sort((a, b) => a.s - b.s || (a.f || 0) - (b.f || 0)).slice(0, 8); }
function nbLkPlayer(id) {
  const p = PBYID[id]; if (!p) return ""; const seasons = Object.keys(p.ss || {}).sort(), row = (s) => { const v = p.ss[s]; return `<tr><td>${s}</td><td>${esc(nbSeasonsLeft(p.cr, s))}</td><td>${v[0]}</td><td><b>${v[1]}</b></td><td>${v[2]}</td><td>${v[3]}</td><td>${v[4]}</td><td>${v[5]}</td></tr>`; };
  const aw = (p.aw || []).reduce((m, [k, s]) => { (m[k] = m[k] || []).push(s); return m; }, {}), best = seasons.slice().sort((a, b) => p.ss[b][1] - p.ss[a][1])[0];
  return `<div class="card abx" style="margin-top:12px"><div class="row" style="gap:14px">${playerPic(p, "xl")}<div><h3 style="font-size:28px;margin:0">${esc(p.n)}</h3><div class="fine">${[p.sub || p.pos, p.nat, p.h ? ftIn(p.h) : "", "born " + p.dob.slice(0, 4), p.active ? "plays for the " + p.club : "last team: " + p.club].filter(Boolean).join(" · ")}</div></div></div>
  <div class="tiles"><div class="tile"><b class="num">${p.gp.toLocaleString("en-US")}</b><small>games since ${COVER}</small></div><div class="tile"><b class="num">${p.pts.toLocaleString("en-US")}</b><small>points</small></div><div class="tile"><b class="num">${p.reb.toLocaleString("en-US")}</b><small>rebounds</small></div><div class="tile"><b class="num">${p.ast.toLocaleString("en-US")}</b><small>assists</small></div>${(p.ti || []).length ? `<div class="tile"><b class="num">${p.ti.length}</b><small>titles</small></div>` : ""}${best ? `<div class="tile"><b class="num">${p.ss[best][1]}</b><small>best scoring season (${best})</small></div>` : ""}</div>
  ${(p.ti || []).length ? `<p><b>Champion:</b> ${p.ti.map((t) => `${esc(t.team)} ${t.season}`).join(", ")}</p>` : ""}${Object.keys(aw).length ? `<p><b>Awards:</b> ${Object.entries(aw).map(([k, v]) => `${AWN[k]} (${v.join(", ")})`).join("; ")}</p>` : ""}
  <div style="overflow-x:auto"><table class="nbtb"><tr><th>Season</th><th>Team</th><th>GP</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th></tr>${seasons.map(row).join("")}</table></div>
  <p class="fine" style="margin-top:8px">Per-game averages for seasons with 20+ games, ${COVER} on. Anything before ${COVER} is not in the data${p.partial ? ", so this career is only partly shown" : ""}.</p></div>`;
}
const NB_EXP = (() => { const m = {}; (NM.games || []).forEach((g) => { if (g[9] !== 2) return; const s = seasonLab(g[10]); [[g[1], g[5]], [g[2], 1 - g[5]]].forEach(([t, e]) => { const k = s + "|" + t; (m[k] = m[k] || { e: 0, n: 0 }); m[k].e += e; m[k].n++; }); }); return m; })();
function nbLkTeam(t) {
  const f = QZ.clubs[t]; if (!f) return ""; const rows = Object.entries(LG.NBA.tables).map(([s, tb]) => { const i = tb.findIndex((r) => r[0] === t); return i < 0 ? null : { s, r: tb[i], pos: i + 1 }; }).filter(Boolean);
  const champs = rows.filter((x) => (x.r[7] | 0) === 5).map((x) => x.s), best = rows.slice().sort((a, b) => b.r[4] - a.r[4])[0];
  return `<div class="card abx" style="margin-top:12px"><div class="row" style="gap:14px">${badge(t, "xl")}<div><h3 style="font-size:28px;margin:0">${esc(f.full || t)}</h3><div class="fine">${esc(f.loc || "")} · ${rows.length} seasons in the data</div></div></div>
  <div class="tiles"><div class="tile"><b class="num">${champs.length}</b><small>titles since ${COVER}</small></div>${best ? `<div class="tile"><b class="num">${best.r[4]}-${best.r[6]}</b><small>best record (${best.s})</small></div>` : ""}<div class="tile"><b class="num">${rows.filter((x) => (x.r[7] | 0) > 0).length}</b><small>playoff seasons</small></div></div>${champs.length ? `<p><b>Champions:</b> ${champs.join(", ")}</p>` : ""}
  <div style="overflow-x:auto"><table class="nbtb"><tr><th>Season</th><th>Record</th><th>Model expected wins</th><th>Rank</th><th>PPG</th><th>Opp PPG</th><th>How it ended</th></tr>${rows.map((x) => { const ex = NB_EXP[x.s + "|" + t]; const full = ex && ex.n === x.r[4] + x.r[6]; return `<tr><td>${x.s}</td><td><b>${x.r[4]}-${x.r[6]}</b></td><td>${full ? ex.e.toFixed(1) : ""}</td><td>${ordn(x.pos)}</td><td>${x.r[2].toFixed(1)}</td><td>${x.r[3].toFixed(1)}</td><td>${PLAYOFF_ROUND[x.r[7] | 0]}</td></tr>`; }).join("")}</table></div>
  <p class="fine" style="margin-top:8px">Rank is by wins among the 30 teams. Seasons with fewer than 60 games in the data are left out. "Model expected wins" is the sum of the model\'s win chances for the season, shown only where our data holds every game of it (2019-20 on). ${f.old && f.old.length ? "Earlier names: " + esc(f.old.join(", ")) + "." : ""}</p></div>`;
}
{ const css = document.createElement("style"); css.textContent = `.nbtb{width:100%;border-collapse:collapse;font-size:14px}.nbtb th{font:600 12px "Barlow Condensed",sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:left;padding:6px}.nbtb td{padding:6px;border-top:1px solid var(--line);white-space:nowrap}`; document.head.appendChild(css); }
{ const old = renderAboutPage; renderAboutPage = function () {
    if (S.abTab !== "look") return old();
    const nav = `<div class="scope" style="padding:2px 0">${ABOUT_TABS.map(([k, n]) => `<button type="button" class="chip" data-abtab="${k}" aria-pressed="${S.abTab === k}">${n}</button>`).join("")}</div>`;
    $("#aboutPage").innerHTML = `<nav class="crumbs"><button class="back" data-crumb="menu" type="button">← Menu</button><div class="trail"><span class="crumb cur">Our model</span></div></nav>${nav}<div class="card abx"><h2><svg class=ic><use href=#i-search></use></svg> Look up a player or team</h2><p class="sub">Type a name. You get a player's season-by-season numbers, titles and awards, or a team's seasons and how each one ended.</p><input class="t" id="nbLk" aria-label="Look up a player or team" placeholder="e.g. LeBron, Curry, Celtics, Spurs" autocomplete="off" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:var(--surface2);color:var(--ink);font:inherit"><div class="hub" id="nbLkSug" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px"></div></div><div id="nbLkRes"></div>`;
  }; }
S.abTab = "look";
document.addEventListener("input", (e) => { if (e.target.id !== "nbLk") return; $("#nbLkSug").innerHTML = nbLkSearch(e.target.value).map((x) => `<button type="button" class="chip" data-nbl="${esc(x.k)}">${esc(x.label)} <span class="fine">${esc(x.sub)}</span></button>`).join(""); });
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-nbl]"); if (!b) return; const [k, v] = b.dataset.nbl.split("|"); $("#nbLkRes").innerHTML = k === "p" ? nbLkPlayer(+v) : nbLkTeam(v); $("#nbLkRes").scrollIntoView({ behavior: "smooth", block: "nearest" }); });

/* ---------- basketball sound effects: a swish for a right answer, a buzzer for a wrong one, a crowd swell for a win ---------- */
{ const n = Snd._n;
  Snd.swish = () => n.run((t) => { n.noise(t, 0.28, 2500, 7000, 0.05, 1.5); n.note(96, t + 0.02, 0.16, "sine", 0.025); n.note(103, t + 0.06, 0.16, "sine", 0.02); });
  Snd.buzzer = () => n.run((t) => { n.note(43, t, 0.5, "sawtooth", 0.07); n.note(43.2, t, 0.5, "square", 0.03); n.noise(t, 0.5, 200, 400, 0.03, 0.5); });
  Snd.crowd = () => n.run((t) => { n.noise(t, 1.6, 400, 1400, 0.045, 0.4); n.noise(t + 0.4, 1.4, 900, 2400, 0.025, 0.4); });
  const r = Snd.right, w = Snd.wrong, wi = Snd.win; Snd.right = function () { r.apply(Snd, arguments); Snd.swish(); }; Snd.wrong = function () { w.apply(Snd, arguments); Snd.buzzer(); }; Snd.win = function () { wi.apply(Snd, arguments); Snd.crowd(); };
}

/* =====================================================================================================================
   Three more games with three different mechanics:
   Rank the five (put five players in order), Career timeline (place each stint on a line of seasons),
   Over or under (bet against the model's line with a bankroll).
   ===================================================================================================================== */
{ const css = document.createElement("style"); css.textContent = `.holc{position:relative}.rkn{position:absolute;top:8px;left:8px;min-width:30px;height:30px;border-radius:50%;background:var(--accent,#ff7a1a);color:#111;font:800 16px/30px Inter,sans-serif;text-align:center;box-shadow:0 4px 12px #0008;animation:rkpop .25s cubic-bezier(.3,1.6,.5,1)}@keyframes rkpop{from{transform:scale(.2)}}.holc.rkok{outline:3px solid #5ee6a8}.holc.rkno{outline:3px solid #ff6b7f}.tlrow{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center;padding:10px 0;border-top:1px solid var(--line,#ffffff22)}.tlrow input[type=range]{width:100%;grid-column:1/-1}.tlrow .tv{font:700 15px Inter,sans-serif}.tlrow .tn{display:flex;gap:10px;align-items:center}.ouline{font:800 44px/1 Inter,sans-serif;letter-spacing:-.03em}.oubank{font:800 26px Inter,sans-serif}`; document.head.appendChild(css); }
const nbEnd = (title, score, outOf, key, rows, again) => { const cur = store.items["nbbest_" + key] || { best: 0 }; if (score > cur.best) lockIn("nbbest_" + key, { best: score }); Board.submit({ game: key, league: "all", score }); reward(15 + Math.round(score / 10), title, null);
  return `<div class="card">${gamesBar(title)}<div class="tiles"><div class="tile"><small>Score</small><b>${score}</b><span class="fine">of ${outOf}</span></div><div class="tile"><small>Best</small><b>${Math.max(score, cur.best)}</b></div></div>${rows}<div class="row" style="margin-top:12px"><button class="btn" id="nbAgain" type="button">Play again</button></div></div>`; };

/* ---------- Rank the five ---------- */
const NBR_KINDS = [
  ["career points", (p) => p.pts, (v) => v.toLocaleString("en-US")], ["career rebounds", (p) => p.reb, (v) => v.toLocaleString("en-US")], ["career assists", (p) => p.ast, (v) => v.toLocaleString("en-US")],
  ["regular-season games played", (p) => p.gp, (v) => v.toLocaleString("en-US")], ["best scoring season, in points a game", (p) => p.bp && p.bp.avg, (v) => v.toFixed(1)], ["height", (p) => p.h, (v) => `${ftIn(v)} (${Math.round(v)} cm)`],
];
function nbrNew() {
  const gap = NBH_DIFF(1.4, 1.18, 1.07, 1.02), span = NBH_DIFF(1, .5, .2, .08);
  for (let t = 0; t < 160; t++) {
    const k = rnd(NBR_KINDS), pool = playerPool("ALL", (p) => playerOK(p) && k[1](p) > 0).sort((a, b) => k[1](a) - k[1](b)); if (pool.length < 12) continue;
    const w = Math.max(5, Math.floor(pool.length * span)), start = Math.floor(Math.random() * (pool.length - w + 1)), pick = shuffle(pool.slice(start, start + w)).slice(0, 5).sort((a, b) => k[1](a) - k[1](b)); let ok = true;
    for (let i = 1; i < 5; i++) if (k[1](pick[i]) / k[1](pick[i - 1]) < (t > 100 ? 1.01 : gap)) ok = false;
    if (ok) return { k, items: shuffle(pick), truth: pick.slice().reverse(), order: [], done: false };
  }
  return null;
}
function renderRANK() {
  const s = S.nbr = S.nbr || { round: 0, score: 0, log: [], q: null }; if (!s.q) { s.q = nbrNew(); s.round++; } const q = s.q;
  if (!q) { $("#room").innerHTML = `<div class="card">${gamesBar("Rank the five")}<p class="sub">Not enough players at this level.</p></div>`; return; }
  const cards = q.items.map((p) => { const n = q.order.indexOf(p) + 1, tr = q.truth.indexOf(p), rev = q.done; return `<button type="button" class="holc ${rev ? (tr === q.order.indexOf(p) ? "rkok" : "rkno") : ""}" data-nbr="${p.id}" ${rev ? "disabled" : ""}>${playerPic(p, "xl")}<b>${esc(p.n)}</b><span class="fine">${esc(p.sub || p.pos)} · ${esc(p.club || "")}</span>${rev ? `<span class="num holv">${q.k[2](q.k[1](p))}</span><span class="fine">#${tr + 1}</span>` : ""}${n ? `<span class="rkn">${n}</span>` : ""}</button>`; }).join("");
  const pts = q.done ? q.pts : 0;
  $("#room").innerHTML = `<div class="card">${gamesBar("Rank the five")}<div class="row" style="justify-content:space-between"><span class="fine">Round ${s.round} of 5</span><span class="fine num">${s.score} points</span></div><p class="sub" style="font-size:18px"><b>Tap the players from the most to the fewest: ${esc(q.k[0])}.</b></p><div class="holpair" style="flex-wrap:wrap">${cards}</div>
    <div class="row" style="margin-top:14px">${q.done ? `<b>+${pts} points</b><button class="btn" id="nbrNext" type="button">${s.round >= 5 ? "See results" : "Next round"}</button>` : `<button class="btn ghost" id="nbrReset" type="button">Start over</button><button class="btn" id="nbrCheck" type="button" ${q.order.length < 5 ? "disabled" : ""}>Check my order</button>`}</div></div>`;
}
document.addEventListener("click", (e) => {
  if (S.game !== "nbrank") return; const t = e.target.closest && e.target.closest("[data-nbr],#nbrReset,#nbrCheck,#nbrNext,#nbAgain"); if (!t) return; const s = S.nbr, q = s && s.q;
  if (t.id === "nbAgain") { S.nbr = null; return renderRANK(); }
  if (t.id === "nbrNext") { if (s.round >= 5) { $("#room").innerHTML = nbEnd("Rank the five", s.score, 500, "nbrank", `<table class="tb"><tr><th>Round</th><th>Stat</th><th>Points</th></tr>${s.log.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r[0])}</td><td>${r[1]}</td></tr>`).join("")}</table>`); return; } s.q = null; return renderRANK(); }
  if (!q) return; if (t.id === "nbrReset") { q.order = []; return renderRANK(); }
  if (t.id === "nbrCheck") { const off = q.order.reduce((a, p, i) => a + Math.abs(i - q.truth.indexOf(p)), 0); q.pts = Math.round(100 * (1 - off / 12)); q.done = true; s.score += q.pts; s.log.push([q.k[0], q.pts]); Snd.flip(); renderRANK(); setTimeout(() => { q.pts >= 80 ? Snd.right() : Snd.wrong(); if (q.pts === 100) confetti(); }, 350); return; }
  if (q.done) return; const p = q.items.find((x) => String(x.id) === t.dataset.nbr), i = q.order.indexOf(p); if (i >= 0) q.order.splice(i, 1); else q.order.push(p); Snd.tick && Snd.tick(); renderRANK();
});

/* ---------- Career timeline ---------- */
const nbtYear = (s) => +String(s).slice(0, 4);
function nbtNew() {
  const mn = NBH_DIFF(3, 4, 5, 5); let pool = playerPool("ALL", (p) => playerOK(p) && !p.partial && p.cr && p.cr.length >= mn && p.cr.length <= 8); if (pool.length < 6) pool = playerPool("ALL", (p) => !p.partial && p.cr && p.cr.length >= 3 && p.cr.length <= 8);
  if (!pool.length) return null; const p = rnd(pool), stints = p.cr.map(([team, from, to]) => ({ team, from: nbtYear(from), to: nbtYear(to) })), y0 = stints[0].from, y1 = stints[stints.length - 1].from;
  const lo = NBH_DIFF(y0, y0, 2001, 2001), hi = NBH_DIFF(y1, y1, 2026, 2026), tol = NBH_DIFF(5, 4, 3, 2);
  return { p, stints, lo, hi, tol, guess: stints.map((s, i) => (i === 0 && S.diff === "easy" ? s.from : Math.round((lo + hi) / 2))), done: false };
}
function renderTIME() {
  const s = S.nbt = S.nbt || { round: 0, score: 0, log: [], q: null }; if (!s.q) { s.q = nbtNew(); s.round++; } const q = s.q;
  if (!q) { $("#room").innerHTML = `<div class="card">${gamesBar("Career timeline")}<p class="sub">Not enough players at this level.</p></div>`; return; }
  const rows = q.stints.map((x, i) => { const locked = i === 0 && S.diff === "easy", g = q.guess[i], er = q.done ? Math.abs(g - x.from) : 0; return `<div class="tlrow"><span class="tn">${clubBadgeFor(x.team, "sm")}<b>${esc(x.team)}</b></span><span class="tv" id="tlv${i}">${q.done ? `<span class="${er === 0 ? "up" : er <= 1 ? "" : "down"}">you ${seasonLab(g + 1)} · actual ${seasonLab(x.from + 1)}</span>` : `joined ${seasonLab(g + 1)}${locked ? " (given)" : ""}`}</span>${q.done ? "" : `<input type="range" data-tl="${i}" min="${q.lo}" max="${q.hi}" value="${g}" ${locked ? "disabled" : ""}>`}</div>`; }).join("");
  $("#room").innerHTML = `<div class="card">${gamesBar("Career timeline")}<div class="row" style="justify-content:space-between"><span class="fine">Round ${s.round} of 5</span><span class="fine num">${s.score} points</span></div><div class="row" style="gap:14px;margin:8px 0">${playerPic(q.p, "xl")}<div><h3 style="font-size:26px">${esc(q.p.n)}</h3><div class="fine">${esc(q.p.sub || q.p.pos)} · ${q.stints.length} stints with teams</div></div></div><p class="sub">Slide each team to the season he joined it. Within ${q.tol - 1} seasons still earns points.</p>${rows}
    <div class="row" style="margin-top:12px">${q.done ? `<b>+${q.pts} points</b><button class="btn" id="nbtNext" type="button">${s.round >= 5 ? "See results" : "Next player"}</button>` : `<span class="fine">Closer is better.</span><button class="btn" id="nbtLock" type="button">Lock it in</button>`}</div></div>`;
}
document.addEventListener("input", (e) => { const r = e.target.closest && e.target.closest("[data-tl]"); if (!r || S.game !== "nbtime" || !S.nbt || !S.nbt.q) return; const i = +r.dataset.tl; S.nbt.q.guess[i] = +r.value; const l = document.getElementById("tlv" + i); if (l) l.textContent = "joined " + seasonLab(+r.value + 1); });
document.addEventListener("click", (e) => {
  if (S.game !== "nbtime") return; const t = e.target.closest && e.target.closest("#nbtLock,#nbtNext,#nbAgain"); if (!t) return; const s = S.nbt, q = s && s.q;
  if (t.id === "nbAgain") { S.nbt = null; return renderTIME(); }
  if (t.id === "nbtNext") { if (s.round >= 5) { $("#room").innerHTML = nbEnd("Career timeline", s.score, 500, "nbtime", `<table class="tb"><tr><th>Round</th><th>Player</th><th>Points</th></tr>${s.log.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r[0])}</td><td>${r[1]}</td></tr>`).join("")}</table>`); return; } s.q = null; return renderTIME(); }
  if (t.id === "nbtLock" && q && !q.done) { const sc = q.stints.map((x, i) => Math.max(0, 1 - Math.abs(q.guess[i] - x.from) / q.tol)); q.pts = Math.round(100 * sc.reduce((a, b) => a + b, 0) / sc.length); q.done = true; s.score += q.pts; s.log.push([q.p.n, q.pts]); Snd.flip(); renderTIME(); setTimeout(() => { q.pts >= 70 ? Snd.right() : Snd.wrong(); if (q.pts >= 95) confetti(); }, 350); }
});

/* ---------- Over or under: bet against the model's line ---------- */
const nbuGames = () => NM.games.filter((g) => typeof g[11] === "number" && typeof g[12] === "number" && g[3] > 0);
function nbuNew() {
  const pool = nbuGames(), spread = Math.random() < 0.45, tight = S.diff === "elite", wide = 7;
  for (let t = 0; t < 300; t++) {
    const g = rnd(pool), line = spread ? Math.floor(g[11] - g[12]) + 0.5 : Math.floor(g[11] + g[12]) + 0.5, real = spread ? g[3] - g[4] : g[3] + g[4], d = Math.abs(real - line); if (tight ? d > 4 : t < 200 && S.diff === "hard" && d < 2) continue;
    return { g, spread, line, real, over: real > line, pick: null, stake: 100 };
  }
  return null;
}
function renderOU() {
  const s = S.nbu = S.nbu || { round: 0, bank: 1000, log: [], q: null }; if (!s.q) { s.q = nbuNew(); s.round++; } const q = s.q, g = q.g, ctx = S.diff === "easy" || S.diff === "medium";
  const tbl = (LG.NBA.tables[seasonLab(g[10])] || []), row = (n) => tbl.find((r) => r[0] === n), line = (n) => { const r = row(n); return r ? `${esc(n)}: scores ${r[2].toFixed(1)}, allows ${r[3].toFixed(1)} a game` : esc(n); };
  const stakes = [100, 250, 500].filter((v) => v <= s.bank || v === 100), sign = q.line > 0 ? "-" : "+";
  const ask = q.spread ? `Do the <b>${esc(g[1])}</b> win by more than <b>${Math.abs(q.line)}</b>?` : `Will the two teams score more than <b>${q.line}</b> points together?`, yes = q.spread ? "Cover" : "Over", no = q.spread ? "Don't cover" : "Under";
  const resTxt = q.pick ? `${esc(g[1])} ${g[3]}, ${esc(g[2])} ${g[4]} · ${q.spread ? "margin " + (g[3] - g[4] > 0 ? "+" : "") + (g[3] - g[4]) : "total " + (g[3] + g[4])}` : "";
  $("#room").innerHTML = `<div class="card">${gamesBar("Over or under")}<div class="row" style="justify-content:space-between"><span class="fine">Game ${s.round} of 10</span><span class="oubank num">${s.bank} coins</span></div>
    <div class="row" style="gap:14px;justify-content:center;margin:10px 0">${badge(g[1], "xl")}<span class="vs">at home vs</span>${badge(g[2], "xl")}</div><div class="fine" style="text-align:center">${esc(nbDate(g[0]))} · ${esc(g[1])} vs ${esc(g[2])}</div>
    <div style="text-align:center;margin:10px 0"><div class="label">The model's line</div><div class="ouline">${q.spread ? `${esc(g[1])} ${sign}${Math.abs(q.line)}` : q.line}</div></div><p class="sub" style="text-align:center">${ask}</p>
    ${ctx ? `<p class="fine" style="text-align:center">${line(g[1])}<br>${line(g[2])} <span>(season averages)</span></p>` : ""}
    ${q.pick ? `<div class="rcard on" style="text-align:center"><b class="${q.pick === (q.over ? "y" : "n") ? "up" : "down"}">${q.pick === (q.over ? "y" : "n") ? "+" : "-"}${q.stake} coins</b> · it was ${q.over ? yes : no}<br><span class="fine">${resTxt}</span></div><div class="row" style="margin-top:12px;justify-content:center"><button class="btn" id="nbuNext" type="button">${s.round >= 10 || s.bank < 100 ? "See results" : "Next game"}</button></div>`
    : `<div class="row" style="justify-content:center;margin:8px 0"><span class="fine">Stake</span>${stakes.map((v) => `<button type="button" class="chip" data-nbustake="${v}" aria-pressed="${q.stake === v}">${v}</button>`).join("")}</div><div class="row" style="justify-content:center;gap:12px"><button class="btn" data-nbu="y" type="button">${yes}</button><button class="btn" data-nbu="n" type="button">${no}</button></div>`}</div>`;
}
document.addEventListener("click", (e) => {
  if (S.game !== "nbou") return; const t = e.target.closest && e.target.closest("[data-nbu],[data-nbustake],#nbuNext,#nbAgain"); if (!t) return; const s = S.nbu, q = s && s.q;
  if (t.id === "nbAgain") { S.nbu = null; return renderOU(); }
  if (t.id === "nbuNext") { if (s.round >= 10 || s.bank < 100) { $("#room").innerHTML = nbEnd("Over or under", s.bank, 3000, "nbou", `<table class="tb"><tr><th>Game</th><th>Bet</th><th>Result</th></tr>${s.log.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r[0])}</td><td>${r[1]}</td></tr>`).join("")}</table><p class="fine" style="margin-top:8px">The line is our model's own predicted score for each real game, so on average it is fair: no edge either way.</p>`); return; } s.q = null; return renderOU(); }
  if (!q || q.pick) return; if (t.dataset.nbustake) { q.stake = Math.min(+t.dataset.nbustake, Math.max(100, s.bank)); return renderOU(); }
  if (t.dataset.nbu) { q.pick = t.dataset.nbu; q.stake = Math.min(q.stake, Math.max(100, s.bank)); const win = q.pick === (q.over ? "y" : "n"); s.bank += win ? q.stake : -q.stake; if (s.bank < 0) s.bank = 0; s.log.push([`${q.pick === "y" ? (q.spread ? "Cover" : "Over") : (q.spread ? "Don't cover" : "Under")} ${q.stake}`, `${win ? "+" : "-"}${q.stake}`]); Snd.flip(); renderOU(); setTimeout(() => { win ? Snd.right() : Snd.wrong(); }, 350); }
});
{ const old3 = renderNB; renderNB = function () { if (S.game === "nbrank") return renderRANK(); if (S.game === "nbtime") return renderTIME(); if (S.game === "nbou") return renderOU(); old3(); }; }
Object.assign(NB_TITLE, { nbrank: "Rank the five", nbtime: "Career timeline", nbou: "Over or under" }); ["nbrank", "nbtime", "nbou"].forEach((id) => GAME_IDS.push(id)); MODEL_IDS.push("nbou");
QUIZ_GAMES.push({ id: "nbrank", name: "Rank the five", modes: "Solo · 5 rounds", tag: "Five players and one stat. Tap them in order, most to fewest. Closer to the truth scores more.", faces: () => heroFaces(3) },
  { id: "nbtime", name: "Career timeline", modes: "Solo · 5 players", tag: "A player's teams, shuffled. Slide each one to the season he joined it.", faces: () => heroFaces(2) });
GAMES.push({ id: "nbou", name: "Over or under", modes: "Solo, against the model", tag: "The model sets a line for a real game. Bet over or under with a bankroll that grows or shrinks." });
Object.assign(HOWTO, {
  "g:nbrank": ["Rank the five", ["What you do", "Five players and one stat, like career points or height. Tap them from the highest to the lowest, then check."], ["Scoring", "Up to 100 a round. Every place you are off costs points. Five rounds."], ["Difficulty", "Easy has big gaps between the players. Elite picks players whose numbers are almost the same."]],
  "g:nbtime": ["Career timeline", ["What you do", "A player and the teams he played for, out of order. Slide each team to the season he joined it."], ["Scoring", "Exactly right is full points for that team. Each season you are off loses some, and easy is more forgiving."], ["Good to know", "Careers before 2001-02 are only partly in the data, so those players are left out."]],
  "g:nbou": ["Over or under", ["What you do", "A real past game and a line from our model: its predicted total points, or the predicted margin. Choose over or under (cover or don't cover) and a stake."], ["Scoring", "You start with 1,000 coins and play 10 games. A right call wins your stake, a wrong one loses it."], ["Good to know", "The line is the model's own prediction, so it is fair on average. Easy and medium show each team's season averages. Elite only uses close calls."]],
});
BOARD_GAMES.push(["nbrank", "Rank the five", "best score (of 500)"], ["nbtime", "Career timeline", "best score (of 500)"], ["nbou", "Over or under", "best bankroll"]); BK_LABELS.push("Rank the five", "Career timeline", "Over or under");

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
const ordSeason = (s) => s;                                  // "2011-12" is already how fans write a season
const POSLONG = (p) => (p.sub || p.pos || "player").toLowerCase();
const natOf = (p) => p.nat || "";
const bestLine = (b, unit) => (b ? `${b.avg} ${unit} a game in ${b.season} (${b.team})` : "");
const PLAYOFF_ROUND = ["Missed the playoffs", "Lost in the first round", "Lost in the second round", "Lost in the conference finals", "Reached the NBA Finals but lost", "Won the NBA title"];

/* ---------- clue ladders, hardest first ---------- */
function playerClues(p) {
  const a = ageOf(p), prev = p.hist.filter((c) => c !== p.club).filter((c, i, arr) => arr.indexOf(c) === i).slice(-3), cl = [];
  if (p.city || p.bc) cl.push(["Birthplace", `Born in ${p.city ? p.city + (p.bc && p.bc !== p.city ? ", " + p.bc : "") : p.bc}`, flagOf(p.bc || p.nat)]);
  if (p.h) cl.push(["Height", `${ftIn(p.h)} tall (${Math.round(p.h)} cm)`]);
  cl.push(["Age", `${a} years old (born ${p.dob.slice(0, 4)})`]);
  if (p.bp && p.bp.avg >= 10) cl.push(["Scoring", `Best scoring season since ${COVER}: ${bestLine(p.bp, "points")}`]);
  if (p.br && p.br.avg >= 6) cl.push(["Rebounding", `Best rebounding season since ${COVER}: ${bestLine(p.br, "rebounds")}`]);
  if (p.ba && p.ba.avg >= 4.5) cl.push(["Passing", `Best passing season since ${COVER}: ${bestLine(p.ba, "assists")}`]);
  if (p.pts >= 5000) cl.push(["Career", `${p.pts.toLocaleString("en-US")} points, ${p.reb.toLocaleString("en-US")} rebounds and ${p.ast.toLocaleString("en-US")} assists since ${COVER}`]);
  if ((p.ti || []).length) cl.push(["Titles", `NBA champion ${p.ti.length > 1 ? p.ti.length + " times" : "once"}: ${p.ti.map((t) => `${t.team} ${t.season}`).join(", ")}`, "<svg class=ic><use href=#i-trophy></use></svg>"]);
  cl.push(["Position", `${p.sub || p.pos}`, POSICON[p.pos] || ""]);
  cl.push(["Nationality", p.nat || p.bc, flagOf(p.nat || p.bc)]);
  if (prev.length) cl.push(["Earlier teams", `Previously with ${prev.join(", ")}`, prev.map((c) => clubBadgeFor(c, "sm")).join("")]);
  if (p.club) cl.push(["Team", `${p.active ? "Plays for" : "Last team:"} ${p.club}`, clubBadgeFor(p.club, "sm")]);
  cl.push(["Name", `${p.n.split(" ").length} word${p.n.split(" ").length > 1 ? "s" : ""}, ${p.n.replace(/ /g, "").length} letters, starts with ${p.n[0]}`]);
  return cl;
}
function careerClues(p) {
  const cl = [], seen = [];
  p.cr.forEach(([team, from, to], i) => cl.push([i === 0 ? "Started" : `Move ${i}`, i === 0 ? `Career began with the ${team}` : `Then the ${team}`, clubBadgeFor(team, "sm")]));
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
QDEF.club.name = "Name that team"; QDEF.blur.name = "Logo blur";

/* ---------- tic-tac-toe categories: only facts the data really holds ---------- */
const NBA_TEAMS_FULL = () => Object.keys(QZ.clubs);
function tttCategories(pool, scope) {
  const F = {}, add = (c) => { (F[c.fam] || (F[c.fam] = [])).push(c); }, count = (f) => pool.filter(f).length;
  const teams = {}, nats = {}; pool.forEach((p) => { new Set(p.hist).forEach((c) => { teams[c] = (teams[c] || 0) + 1; }); if (p.nat) nats[p.nat] = (nats[p.nat] || 0) + 1; });
  Object.entries(teams).filter(([c, n]) => n >= 25 && CREST[c]).forEach(([c]) => add({ id: "club:" + c, fam: "club", label: `Played for the ${c}`, icon: badge(c, "md"), test: (p) => p.hist.includes(c) }));
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
  if (g === "bk") { $("#room").innerHTML = `<h2 class="sec">ballknowledge originals</h2><p class="secsub">Players, teams and careers from 25 seasons of NBA box scores. Pick a difficulty, then play solo or against a friend.</p><div class="hub">${QUIZ_GAMES.map((x, k) => card(x, k)).join("")}</div>`; return; }
  $("#room").innerHTML = `<h2 class="sec">What do you want to play?</h2><p class="secsub">Pick a place to play.</p><div class="groups">
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
  ACH.forEach((a) => { if (a[0] === "tttwin") a[2] = "Beat the computer at basketball tic-tac-toe"; if (a[0] === "squad") a[2] = `Play all ${QUIZ_GAMES.length} ballknowledge originals`; if (a[0] === "captain") a[2] = "Reach the Captain rank"; }); }
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
  if (id === "who" || id === "career" || id === "club" || id === "blur" || id === "finish" || id === "scramble") { const b = store.items[`best_${id}_${c}_${S.diff}`]; return b ? `best ${b.best} (${S.diff})` : "not played yet"; }
  if (NB_TITLE[id]) { const b = store.items[`nbbest_${id}`]; return b ? `best ${b.best}` : "not played yet"; }
  return "";
}
{ const hubOld = renderHub;
  renderHub = function () {
    if (S.hubGroup === "model") { const clubs = Object.keys(CREST), pick = (k) => [0, 1, 2].map((j) => clubs[hash(`nbm-${k}-${j}`) % clubs.length]);
      $("#room").innerHTML = `<h2 class="sec">Beat the Model</h2><p class="secsub">Real NBA games and a model that never saw them. Over ${(NBO.n || 0).toLocaleString()} games it picked ${Math.round((NBO.acc || 0) * 1000) / 10}% of winners right (always picking the home team: ${Math.round((NBO.home || 0) * 1000) / 10}%).</p><div class="hub">${GAMES.map((x, k) => `<button type="button" class="gcard" data-game="${x.id}" style="--d:${k * 60}ms"><div class="gfaces">${pick(k).map((t) => badge(t, "md")).join("")}</div><div class="gname">${x.name}</div><div class="gmodes">${x.modes}</div><div class="gtag">${x.tag}</div><div class="grec">${recordLine(S.code, x.id)}</div></button>`).join("")}</div>`; return; }
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
body{background:
  repeating-linear-gradient(90deg,rgba(255,170,90,.035) 0 2px,transparent 2px 64px),
  repeating-linear-gradient(0deg,rgba(0,0,0,.10) 0 1px,transparent 1px 7px),
  radial-gradient(1100px 520px at 50% -8%,rgba(255,138,61,.16),transparent 70%),var(--bg)}
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
.gfaces .badge{animation:nbhop 2.8s ease-in-out infinite}.gfaces .badge:nth-child(2){animation-delay:.25s}.gfaces .badge:nth-child(3){animation-delay:.5s}
@keyframes nbhop{0%,100%{transform:translateY(0)}12%{transform:translateY(-8px)}24%{transform:translateY(0) scale(1.04,.94)}30%{transform:none}}
.nbscore{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;background:#0a0603;border:2px solid color-mix(in srgb,var(--accent) 50%,#000);border-radius:12px;padding:12px}
.nbtm{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}.nbtm b{font-family:var(--display);text-transform:uppercase;font-weight:400;letter-spacing:.03em;font-size:20px}
.nbvs{font:700 22px "Barlow Condensed",sans-serif;color:var(--muted)}
.nbstep{display:flex;align-items:center;gap:6px}.nbstep input{width:88px;text-align:center;font-size:44px;line-height:1;background:transparent;border:0;border-bottom:3px solid var(--accent);color:#ffd23f;text-shadow:0 0 14px rgba(255,138,61,.55)}
.nbstep .btn{width:38px;height:38px;padding:0;font-size:22px}
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
  let crowd = ""; for (let k = 0; k < 150; k++) { const x = r() * W, y = 150 + r() * 70, col = r() < 0.3 ? "var(--accent)" : r() < 0.5 ? "var(--accent2)" : "#fff"; crowd += `<circle class="fan" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.6 + r() * 2).toFixed(1)}" fill="${col}" style="animation-delay:${(r() * 3).toFixed(2)}s;animation-duration:${(1.4 + r() * 2).toFixed(2)}s"/>`; }
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
    if (tab === "how") body = `<div class="card abx"><h2>How the model works</h2>
      <p>Every team has a <b>rating</b>, a single number that says how good it is. Everyone starts at 1,500. After each game the winner's rating goes up and the loser's goes down. Beat a strong team, or win by a lot, and it moves more. This is called an <b>Elo rating</b>.</p>
      <h3>What it adds</h3><ul><li><b>Home court.</b> The home team gets a boost worth about 70 rating points.</li><li><b>Tired legs.</b> A team playing the second night of a back-to-back gets a small penalty.</li><li><b>New seasons.</b> Ratings slide a quarter of the way back toward average each summer, because rosters change.</li></ul>
      <h3>From a rating to a score</h3><p>The rating gap gives a predicted <b>margin</b>. Each team's recent scoring and defence give a predicted <b>total</b>. Together they make a predicted score for both teams. To call a <b>quarter</b>, the model picks the team it expects to lead: a quarter is about a quarter of the game, so it mostly follows the favourite.</p>
      <h3>The rule that keeps it honest</h3><p>When the model predicts a game it only uses games played <b>before</b> it. It never sees the result, so beating it means something.</p></div>`;
    else if (tab === "acc") {
      const seasons = Object.keys(per).filter((y) => +y >= 2003 && +y <= 2026).sort(), pct = (v) => Math.round(v * 1000) / 10;
      body = `<div class="card abx"><h2>How good is it?</h2><div class="tiles"><div class="tile"><b class="num">${pct(o.acc || 0)}%</b><small>winners right, ${(o.n || 0).toLocaleString()} games</small></div><div class="tile"><b class="num">${pct(o.home || 0)}%</b><small>always pick the home team</small></div><div class="tile"><b class="num">${NBQ.score_err || "?"}</b><small>points off, both teams added up</small></div><div class="tile"><b class="num">${pct(NBQ.q_acc || 0)}%</b><small>quarter winners right</small></div></div>
      <p class="fine" style="margin-top:10px">Every number is from games the model had never seen. Basketball has a lot of luck in it, so even good models are wrong about one winner in three. A season here is named by the year it ends, and the model uses earlier seasons only.</p>
      <h3>Winners right, by season</h3><div class="nbbars">${seasons.map((y) => `<div class="nbbar"><span class="fine">${seasonLab(+y)}</span><i><b style="--w:${pct(per[y].acc) * 1.3}%"></b></i><em class="num">${pct(per[y].acc)}%</em></div>`).join("")}</div></div>`;
    } else if (tab === "rate") {
      const list = Object.entries(NM.elo || {}).sort((a, b) => b[1] - a[1]), top = list[0] ? list[0][1] : 1700, lo = list.length ? list[list.length - 1][1] : 1300;
      body = `<div class="card abx"><h2>Team ratings</h2><p class="fine">The model's rating for every team after the latest game in the data. Higher means stronger.</p>${list.map(([t, v], i) => `<div class="nbrate"><span class="num">${i + 1}</span>${badge(t, "sm")}<span>${esc(t)}</span><b class="num">${v}</b></div>`).join("")}</div>`;
    } else body = `<div class="card abx"><h2>Honest limits and sources</h2><ul>
      <li><b>Box scores.</b> Players, teams, scores and titles come from ESPN box scores (via the sportsdataverse project), from the 2001-02 season on. Nothing earlier is used, so career totals say "since 2001-02", and careers that began earlier are left out of Career path.</li>
      <li><b>Bios.</b> Birth dates, heights, birthplaces and nationalities come from Wikidata. If a player has none, he is left out of games that need them.</li>
      <li><b>Quarters.</b> Real quarter scores exist from about ${seasonLab(NBQ.from || 2020)} on, so score and quarter games use those seasons only.</li>
      <li><b>Titles.</b> A player counts as a champion if he played in the playoffs for the title team.</li>
      <li><b>Awards.</b> MVPs and other awards are not used yet: the free source I found was incomplete, and a wrong answer is worse than none.</li>
      <li><b>Names.</b> Teams appear under today's names, so the Sonics show as the Thunder.</li>
      <li><b>Not affiliated.</b> Team logos and player photos belong to their owners. This is an independent student project, not endorsed by the NBA, any team or any player.</li></ul>
      <p class="fine">Built by moisback22. The model is simple on purpose: it can be explained in a minute, and its accuracy is shown above, not hidden.</p></div>`;
    el.innerHTML = `<nav class="crumbs"><button class="back" data-crumb="menu" type="button">← Menu</button><div class="trail"><span class="crumb cur">Our model</span></div></nav>${nav}${body}`;
  };
}
{ const homeOld = renderHome;
  renderHome = function () { homeOld(); const d = $("#doors"); if (d && !d.querySelector('[data-door="about"]')) d.insertAdjacentHTML("beforeend", `<button type="button" class="door" data-door="about"><div class="gfaces"><span class="rkbig"><svg class=ic><use href=#i-bulb></use></svg></span></div><div class="dname">Our model</div><div class="dtag">How the prediction model works, how good it really is, team ratings, and what the data does not cover.</div><span class="dgo">Read</span></button>`); };
}

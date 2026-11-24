
const DATA = window.__BK_DATA;
/* ---------- What you play most (shared by football, basketball, chess and the sport picker) ----------
   Kept only in this browser (localStorage "bk_usage"); nothing is sent anywhere. Each key holds a score that halves
   every 14 days, so what you play now counts more than what you played last month. Keys: "s:fb" (a sport),
   "fb:who" (a game in a sport). Lists are only reordered once you have played at least three times, so a new
   visitor sees the hand-picked order. */
const Usage = (() => {
  const K = "bk_usage", HL = 14 * 864e5, MIN = 3;
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || "{}") || {}; } catch (e) { return {}; } };
  const save = (u) => { try { localStorage.setItem(K, JSON.stringify(u)); } catch (e) { /* private mode */ } };
  const decay = (x, now) => (x ? x.s * Math.pow(0.5, (now - x.t) / HL) : 0);
  function add(key, w) { const u = load(), now = Date.now(), x = u[key]; u[key] = { s: decay(x, now) + w, t: now, n: ((x && x.n) || 0) + (w >= 1 ? 1 : 0) }; save(u); }
  return {
    play(sport, game, w = 1) { add("s:" + sport, w); if (game) add(sport + ":" + game, w); },
    count(key) { const x = load()[key]; return (x && x.n) || 0; },
    /* list sorted by what you play, plus the favourite (played 3+ times) and one game to try next (never played) */
    order(list, sport, idOf = (x) => x.id) {
      const u = load(), now = Date.now(), rows = list.map((x, i) => { const k = u[sport + ":" + idOf(x)]; return { x, i, s: decay(k, now), n: (k && k.n) || 0 }; });
      const total = rows.reduce((a, r) => a + r.n, 0);
      if (total < MIN) return { list: list.slice(), fav: null, next: null };
      rows.sort((a, b) => b.s - a.s || a.i - b.i);
      const fav = rows[0].n >= MIN ? idOf(rows[0].x) : null, nx = rows.find((r) => !r.n);
      return { list: rows.map((r) => r.x), fav, next: nx ? idOf(nx.x) : null };
    },
    sports() { const u = load(), now = Date.now(); return ["fb", "bb", "ch"].map((s) => ({ s, v: decay(u["s:" + s], now), n: (u["s:" + s] && u["s:" + s].n) || 0 })).sort((a, b) => b.v - a.v); },
  };
})();
/* ---------- AI voice (Kokoro, voice af_heart) ----------
   Every line the site speaks is fixed text, so the clips are made once by src/80_make_voice.py and served as MP3s
   from /voice/ (index.json maps the exact text to a file). A line with no clip, or a page opened without /voice/,
   falls back to the device's own voice. */
const AIVoice = (() => {
  const BASE = "../voice/";
  let map = null, cur = null;
  const load = () => map || (map = fetch(BASE + "index.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  const norm = (t) => String(t).replace(/\s+/g, " ").trim();
  const generic = (t) => norm(t).replace(/^Welcome[^.]*\./, "Welcome.");   // the tour greets you by name; the clip does not
  function stop() { if (cur) { try { cur.pause(); } catch (e) { /* gone */ } cur = null; } }
  /* resolves to the Audio element, or null when there is no clip for this text */
  async function play(text, o = {}) {
    const m = await load(), v = o.voice ? o.voice + "|" : "", f = (v && (m[v + norm(text)] || m[v + generic(text)])) || (!o.voice || o.voice === "af_heart" ? m[norm(text)] || m[generic(text)] : null); if (!f) return null;   // each character has its own voice
    stop(); const a = new Audio(BASE + f); a.volume = o.volume == null ? 1 : o.volume; cur = a;
    const end = () => { if (cur === a) cur = null; if (o.onend) o.onend(); };
    a.onended = end; a.onerror = end;
    if (!o.paused) a.play().catch(end);
    return a;
  }
  return { play, stop, pause() { if (cur) cur.pause(); }, resume() { if (cur) cur.play().catch(() => {}); }, preload: load };
})();
/* One display name everywhere. Football, basketball and chess keep their own profile tables (public, nba, chess schemas in the
   same Supabase project), so a rename used to change only one of them and each page kept showing its own old name. Now:
   - a rename in any sport is saved to all three;
   - the football (public) name is the master: every page reads it after signing in and adopts it if its own copy differs;
   - nobody gets a name made from their email without being asked: with no name yet, a small window asks you to pick one
     (your email's first part is only the suggestion). Shared by all three pages (each build includes this file). */
const NameSync = {
  hdr(cfg, t, schema) { const h = { apikey: cfg.key, Authorization: "Bearer " + t, "Content-Type": "application/json" }; if (schema !== "public") { h["Accept-Profile"] = schema; h["Content-Profile"] = schema; } return h; },
  async master(cfg, t) { try { const r = await fetch(`${cfg.url}/rest/v1/profiles?select=nick`, { headers: this.hdr(cfg, t, "public") }); if (!r.ok) return null; const j = await r.json(); return (j && j[0] && j[0].nick) || null; } catch (e) { return null; } },
  async own(cfg, t, schema) { try { const r = await fetch(`${cfg.url}/rest/v1/profiles?select=nick`, { headers: this.hdr(cfg, t, schema) }); if (!r.ok) return null; const j = await r.json(); return (j && j[0] && j[0].nick) || null; } catch (e) { return null; } },
  /* saves the name in all three sports; returns each schema's answer ("ok", "taken", "invalid" or null when unreachable) */
  async setAll(cfg, t, nick) {
    const out = {}; await Promise.all(["public", "chess", "nba"].map(async (s) => { try { const r = await fetch(`${cfg.url}/rest/v1/rpc/set_nickname`, { method: "POST", headers: this.hdr(cfg, t, s), body: JSON.stringify({ p_nick: nick }) }); out[s] = r.ok ? await r.json() : null; } catch (e) { out[s] = null; } }));
    try { localStorage.setItem("bk_name_all", nick); } catch (e) { /* storage blocked */ }
    return out;
  },
  suggest(email) { return ((email || "player").split("@")[0].replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "player").padEnd(3, "x"); },
  /* asks for a name; save(nick) must return { ok } or { error } */
  ask(suggestion, save) {
    if (document.getElementById("nsAsk")) return; const m = document.createElement("div"); m.id = "nsAsk";
    m.innerHTML = `<div class="nsbox" role="dialog" aria-label="Choose your display name"><h2>Pick your name</h2><p>This is how you appear on leaderboards, in lobbies and to friends, in every sport. You can change it later in your profile.</p><input id="nsIn" maxlength="16" value="${String(suggestion).replace(/[^A-Za-z0-9 _.-]/g, "")}" aria-label="Display name"><div class="nsmsg" id="nsMsg"></div><div class="nsrow"><button type="button" id="nsGo">Save my name</button></div></div>`;
    document.body.appendChild(m); const inp = m.querySelector("#nsIn"); setTimeout(() => { inp.focus(); inp.select(); }, 50);
    const go = async () => { const v = inp.value.trim(), msg = m.querySelector("#nsMsg"); if (!/^[A-Za-z0-9 _.-]{3,16}$/.test(v)) { msg.textContent = "Use 3 to 16 letters, numbers, spaces, dots, dashes or underscores."; return; } msg.textContent = "Saving…"; const r = await save(v); if (r && r.ok) { m.remove(); } else msg.textContent = (r && r.error) || "That name is taken. Try another."; };
    m.querySelector("#nsGo").onclick = go; inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  },
};
(() => { const s = document.createElement("style"); s.textContent = "#nsAsk{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62);padding:16px;animation:nsIn .25s ease-out}#nsAsk .nsbox{width:min(420px,100%);background:#141b17;color:#f4f1ea;border:2px solid var(--accent,var(--gold,#f2c14e));border-radius:20px;padding:22px;box-shadow:0 24px 60px -20px #000}#nsAsk h2{margin:0 0 6px;font-size:26px}#nsAsk p{margin:0 0 12px;opacity:.8;font-size:14px;line-height:1.45}#nsAsk input{width:100%;box-sizing:border-box;font:700 20px inherit;padding:12px 14px;border-radius:12px;border:1px solid var(--line,#ffffff33);background:rgba(0,0,0,.25);color:inherit}#nsAsk .nsmsg{min-height:20px;font-size:13px;margin:8px 0;color:#ff9a8a}#nsAsk .nsrow{display:flex;justify-content:flex-end}#nsAsk button{font:700 15px inherit;padding:10px 18px;border-radius:12px;border:0;background:var(--accent,var(--gold,#f2c14e));color:#111;cursor:pointer}@keyframes nsIn{from{opacity:0}}"; document.head.appendChild(s); })();
/* Chess coaches: Pip (a pawn six squares from his dream), Queen Vera (a retired queen, elegant and blunt) and Bishop Bea
   (a calm diagonal thinker). Each has lines for every move grade, the start and end of a review, and results. */
const COACHES = {
  pip: { name: "Pip", voice: "am_liam", blurb: "A pawn who has spent his whole life six squares from becoming a queen." },
  vera: { name: "Queen Vera", voice: "bf_isabella", blurb: "A retired queen. Elegant, blunt, and allergic to blunders." },
  bea: { name: "Bishop Bea", voice: "bf_alice", blurb: "A calm diagonal thinker with long-range advice." },
};
const COACH_LINES = {
  vera: {
    brilliant: ["Brilliant. You gave up material and took the whole position. I approve, and I rarely approve.", "Now that is chess. A sacrifice with a purpose. Most people only sacrifice by accident.", "Exquisite. I once gave myself up for a move like that. Worth it."],
    great: ["The only move, and you found it. Composure under pressure. Very queenly.", "Great move. Everything else lost. You didn't flinch.", "One door was open and you walked straight through it. Good."],
    best: ["Best move. As expected. Do continue.", "Correct. I'd have played it myself, of course.", "The engine agrees with you. So do I. Don't let it go to your head."],
    excellent: ["Excellent. Not perfect, but perfectly respectable.", "Very good. A whisker from best. I'll allow it.", "Fine move. Elegant enough."],
    good: ["Good. Serviceable. Like a sensible pair of shoes.", "Acceptable. There was better, but this won't embarrass you.", "A decent move. Decent is underrated."],
    book: ["Book move. Everyone plays it. That's not an insult. Mostly.", "Theory. Centuries of players before you agreed. Carry on.", "Still in the book. The real game starts when you leave it."],
    forced: ["Only one legal move. Even a queen sometimes has no choice.", "Forced. Nothing to decide. Rest your mind for the next one."],
    inaccuracy: ["An inaccuracy. Sloppy, darling. Tighten it up.", "Not quite. Small slips become big problems. Ask any king.", "Hmm. A better move existed. They usually do."],
    mistake: ["A mistake. I've seen worse. Not often, but I have.", "That cost you. Learn it, then never do it again.", "Mistake. Pride before the fall, as they say. Stand up straight and continue."],
    miss: ["They handed you a gift and you returned it. Unacceptable. Look again.", "A miss. Your opponent slipped and you didn't punish it. Next time, pounce.", "You missed it. Opportunities are rude. They rarely come back."],
    blunder: ["A blunder. I'm going to pretend I didn't see that. I saw it.", "Oh no. No, no, no. Take a breath. Then never do that again.", "Blunder. Every great player has made one like it. The great ones made it once."],
    start: ["I'm Queen Vera. I've seen every opening and survived most of them. Show me your game.", "Let's see what you've done. Be honest with yourself. I will be."],
    mate: ["Checkmate. Game over. Always end with a flourish.", "Mate. Clean. That's how it's done."],
    great_game: ["Superb. That's a game I'd hang in the palace.", "Strong chess. You played like royalty today."],
    ok_game: ["A respectable game. Some sparkle, some smudges. Polish the smudges.", "Decent work. Not a coronation, but not a disaster either."],
    rough_game: ["A rough one. Even queens fall. What matters is how you rise.", "Not your day. Study it, then put it behind you. Dignity is a choice."],
    win: ["You won. As you should.", "Victory. Accept it graciously."],
    loss: ["A loss. Hold your head high anyway. Then go and get better."],
    draw: ["A draw. Peace treaties have their place."],
  },
  bea: {
    brilliant: ["Brilliant. You saw the long diagonal of the position. Few do.", "A beautiful sacrifice. Letting go can open every line.", "That move will be remembered. It didn't look safe. It was right."],
    great: ["A great move. Only one path held, and you walked it calmly.", "The only good move. Patience found it.", "Great. You didn't rush. You saw it."],
    best: ["Best move. Clear sight, clear choice.", "The top move. Some days the right path is obvious. Enjoy those days.", "Best. Quiet, correct, peaceful."],
    excellent: ["Excellent. Nearly the best. Nearly is a lovely place to be.", "Very good. A small improvement existed, but this is wise.", "Excellent move. Keep that calm."],
    good: ["Good. A sound move. Sound moves add up.", "A reasonable choice. There was a slightly brighter path.", "Good. Not every move needs to shine."],
    book: ["Book. Walk the old roads first. Then find your own.", "A known move. There's comfort in a well-worn path.", "Theory. Learn it, so that one day you can leave it with purpose."],
    forced: ["Only one move was possible. Some paths choose us.", "Forced. Accept it, and look ahead."],
    inaccuracy: ["An inaccuracy. A small step off the diagonal. Find your way back.", "Not the best. Look further down the board next time.", "A slight slip. Gentle now. Breathe and look again."],
    mistake: ["A mistake. It happens to all of us. What matters is what you notice now.", "That cost something. Let it teach you, not hurt you.", "Mistake. Every line has a lesson in it. This one too."],
    miss: ["You missed a chance. Opportunities sometimes whisper. Learn to listen.", "Your opponent opened a door. Next time, step through.", "A miss. Look at checks, captures and threats. The answer is often there."],
    blunder: ["A blunder. Be kind to yourself. Then look closely at why.", "That one hurt. Even the longest diagonal has a dark square.", "Blunder. Pause. Every master has a game like this in their past."],
    start: ["I'm Bishop Bea. Let's look at your game slowly, one diagonal at a time.", "Let's walk through it together. No rush. The board isn't going anywhere."],
    mate: ["Checkmate. The game is complete.", "Mate. A quiet ending to a loud story."],
    great_game: ["A lovely game. You saw far today.", "Wonderful play. That's the calm I like to see."],
    ok_game: ["A balanced game. Some light, some shadow. Like life.", "Not bad at all. A few lessons to take with you."],
    rough_game: ["A difficult game. Difficult games teach the most.", "It didn't go your way. That's alright. Come back with fresh eyes."],
    win: ["A win. Well played. Enjoy it, quietly."],
    loss: ["A loss. It is only a step on a long road."],
    draw: ["A draw. Balance has its own beauty."],
  },
  pip: {
    forced: ["Only one legal move. I know that feeling. Pawns only ever have one way to go.", "Forced. No choice at all. Some days are like that."],
    win: ["You won! I'm going to tell every pawn I know."],
    loss: ["A loss. I've lost more games than I can count, and I still get up every morning and step forward."],
    draw: ["A draw. Nobody won, nobody lost. Sometimes that's exactly right."],
  },
};

/* Fun facts the coach shares while you are still in the opening book (matched against the opening's name). */
const OPEN_FACTS = [
  [/Bongcloud/i, "Fun fact: Magnus Carlsen and Hikaru Nakamura both played the Bongcloud against each other in 2021, as a joke, in a real tournament."],
  [/Fried Liver/i, "Fun fact: the Fried Liver Attack is named after the Italian fegatello, because Black's king gets cooked in the middle of the board."],
  [/Stafford/i, "Fun fact: the Stafford Gambit was a forgotten trap until streamer Eric Rosen made it famous online."],
  [/Caro-Kann/i, "Fun fact: the Caro-Kann is named after Horatio Caro and Marcus Kann, who analysed it in the 1880s."],
  [/Najdorf/i, "Fun fact: the Najdorf is named after Miguel Najdorf, and it was the favourite weapon of both Fischer and Kasparov."],
  [/Dragon/i, "Fun fact: the Dragon got its name because Black's pawns look like the Draco constellation."],
  [/Sicilian/i, "Fun fact: the Sicilian is the most popular answer to e4 among top players. Italian writers described it back in the 1500s."],
  [/Berlin/i, "Fun fact: Kramnik used the Berlin Defence, the Berlin Wall, to take the world title from Kasparov in 2000."],
  [/Ruy Lopez|Spanish/i, "Fun fact: the Ruy Lopez is named after Ruy Lopez de Segura, a Spanish priest who wrote about it in 1561."],
  [/Evans Gambit/i, "Fun fact: the Evans Gambit was invented by Captain William Evans, a Welsh sea captain, in the 1820s."],
  [/Giuoco Piano|Italian Game/i, "Fun fact: Giuoco Piano means the quiet game in Italian. It's one of the oldest openings there is."],
  [/French/i, "Fun fact: the French Defence is named after a correspondence match in 1834, when Paris played it against London."],
  [/Scotch/i, "Fun fact: the Scotch Game is named after a correspondence match between Edinburgh and London in 1824."],
  [/Petrov|Russian Game/i, "Fun fact: the Petrov is named after Alexander Petrov, a Russian master from the 1800s."],
  [/Philidor/i, "Fun fact: Philidor was the best player of the 1700s, and also a famous opera composer."],
  [/King's Gambit/i, "Fun fact: the Immortal Game, Anderssen against Kieseritzky in 1851, started with the King's Gambit."],
  [/Vienna/i, "Fun fact: the Vienna Game is named after the players of Vienna who studied it in the 1850s."],
  [/Danish/i, "Fun fact: the Danish Gambit was popular with Danish players in the 1830s. White can give away two pawns in it."],
  [/Scandinavian/i, "Fun fact: one of the oldest recorded games of modern chess, from Valencia in 1475, starts with the Scandinavian."],
  [/Alekhine/i, "Fun fact: world champion Alexander Alekhine brought this defence to top-level chess in 1921."],
  [/Pirc/i, "Fun fact: the Pirc is named after Vasja Pirc, a Slovenian grandmaster."],
  [/Queen's Gambit Declined|Queen's Gambit Accepted|Queen's Gambit/i, "Fun fact: the Queen's Gambit is over five hundred years old. A Netflix show made the name famous again in 2020."],
  [/Slav/i, "Fun fact: the Slav was developed by many Slavic masters, which is how it got its name."],
  [/Catalan/i, "Fun fact: the Catalan was introduced at a tournament in Barcelona in 1929, in Catalonia."],
  [/Nimzo-Indian/i, "Fun fact: the Nimzo-Indian is named after Aron Nimzowitsch, one of the most original thinkers chess has ever had."],
  [/King's Indian/i, "Fun fact: the King's Indian was a favourite of both Bobby Fischer and Garry Kasparov."],
  [/Gr.nfeld/i, "Fun fact: the Grunfeld is named after Ernst Grunfeld, who played it in 1922."],
  [/Benko/i, "Fun fact: the Benko Gambit is named after Pal Benko, who gave up his place in a Candidates tournament so Fischer could play."],
  [/Benoni/i, "Fun fact: Benoni comes from an 1825 book. In Hebrew it means son of my sorrow."],
  [/Budapest/i, "Fun fact: the Budapest Gambit was first played at a tournament in Budapest in 1896."],
  [/Dutch/i, "Fun fact: the Dutch Defence was recommended by Elias Stein, a Dutch player, in 1789."],
  [/English/i, "Fun fact: the English Opening is named after Howard Staunton, who played it against Saint-Amant in 1843."],
  [/London/i, "Fun fact: the London System is named after the London tournament of 1922."],
  [/Trompowsky/i, "Fun fact: the Trompowsky is named after Octavio Trompowsky, a Brazilian champion."],
  [/Englund/i, "Fun fact: the Englund Gambit is named after Fritz Englund, a Swedish player. It sets a nasty queen trap."],
];
const openFact = (name) => { const f = OPEN_FACTS.find(([re]) => re.test(name || "")); return f ? f[1] : null; };

/* More lines: deep sacrifice lines on brilliant moves (by the piece offered), and extra lines for every grade. */
const MORE_COACH = {
  pip: {
    brilliant_q: ["You sacrificed your queen to save the game. Just like letting go of someone you never wanted to lose.", "You gave up your queen. The most powerful piece on the board, gone, so everything else could live. I think about that a lot.", "Queen sacrifice. Sometimes the strongest thing you have is the thing you have to let go."],
    brilliant_r: ["You gave up a rook to break through. Some walls only come down when you give something up.", "A rook sacrifice. Brave. Most people hold on to what they have, even when it's holding them back."],
    brilliant_minor: ["You let your piece go so the rest could move forward. That's love, in chess form.", "A sacrifice that works. You didn't lose a piece. You invested it."],
    underpromo: ["You could have been a queen, and you chose to be a knight. Sometimes the smaller role is the right one.", "Underpromotion. Not every dream has to be the biggest one to be the right one."],
    best: ["Best move. If I keep watching you, maybe I'll finally get there too.", "That's the move. Clean. Like a fresh square."],
    good: ["Good. You're steady. Steady gets you to the end of the board.", "Solid move. Not every step has to be a leap."],
    inaccuracy: ["A little off. That's fine. I've been a little off my whole life and I'm still here.", "Not the best, but not the end of the world. I'd know. I've seen the end of the board. From a distance."],
    mistake: ["A mistake. It stings. But nobody gets better without a few of these.", "That one cost you. Look at it, then let it go. Carrying it won't help the next move."],
    blunder: ["A blunder. It's okay to be disappointed. Just don't stay there.", "Ouch. You'll remember this one. That's how it teaches you."],
  },
  vera: {
    brilliant_q: ["You sacrificed your queen to win the game. Darling, I know exactly how that feels. It was worth it.", "A queen sacrifice. I've done it myself. You don't lose a queen, you spend one.", "You gave up the queen for the crown. Some things are bigger than any one piece. Even me."],
    brilliant_r: ["A rook for the attack. Ruthless. I adore it.", "You threw a rook at the problem and it worked. Elegant brutality."],
    brilliant_minor: ["A piece offered, and the trap is set. Delicious.", "You gave up a piece and gained the position. That's what we call a bargain."],
    underpromo: ["You turned down becoming a queen. I'm insulted. And impressed.", "An underpromotion. Humility, at exactly the right moment."],
    best: ["Best. Naturally.", "Correct. Keep the standard up."],
    good: ["Good enough to keep, not good enough to frame.", "A fine move. Not a brilliant one. Fine is fine."],
    mistake: ["A mistake. We do not dwell. We correct.", "That was beneath you. Next move, rise."],
    blunder: ["Dreadful. Absolutely dreadful. Now, chin up, we carry on.", "A blunder. I'll allow one per game. That was it."],
  },
  bea: {
    brilliant_q: ["You sacrificed your queen to save the game. Sometimes letting go is the bravest move there is.", "The queen is gone, and the game is won. Love sometimes looks like loss from close up.", "You gave up the thing you valued most, for something bigger. That is rare, on the board and off it."],
    brilliant_r: ["A rook given for a path forward. Some doors only open when you give something up.", "You let a rook go and the whole board opened. Release can be power."],
    brilliant_minor: ["A piece offered with purpose. Not every loss is a loss.", "You let something go, and it came back as the game. Remember that feeling."],
    underpromo: ["You chose the knight over the crown. The right path isn't always the grandest one.", "An underpromotion. Wisdom is knowing what you need, not what looks best."],
    best: ["Best. Calm and clear.", "The right move. Quiet confidence."],
    good: ["A good move. Good moves, one after another, become good games.", "Sound. Keep breathing, keep seeing."],
    mistake: ["A mistake. Be gentle with yourself. Then be curious.", "That cost you something. Ask why, not who."],
    blunder: ["A blunder. One move doesn't define a player. What comes next does.", "Painful. Sit with it for a moment, then move on."],
  },
};
Object.entries(MORE_COACH).forEach(([c, groups]) => { COACH_LINES[c] = COACH_LINES[c] || {}; Object.entries(groups).forEach(([k, L]) => { COACH_LINES[c][k] = [...(COACH_LINES[c][k] || []), ...L]; }); });

/* A third helping for the coaches: more for every grade, so a long review doesn't repeat. */
const MORE_COACH2 = {
  pip: {
    brilliant: ["Brilliant! I want to be a move like that when I grow up.", "That was beautiful. I'm a pawn and I'm crying.", "Brilliant. Most people never find a move like that. You just did.", "You saw what nobody else would. That's the whole game."],
    brilliant_q: ["You gave up your queen and won anyway. Sometimes losing the thing you love most is how you win.", "The queen walked away so the king could live. Some goodbyes are the bravest moves."],
    great: ["Great move. Everything was on the line and you held it together.", "That's the only move, and you found it. I'd have panicked.", "Great find. When it matters most, you were steady.", "The one good move in a bad spot. That's what champions do."],
    best: ["Best move. I'm taking notes.", "That's it. The engine and I both approve.", "Best move. You're making this look easy.", "Top move. Keep stacking these."],
    excellent: ["Excellent. Nearly perfect, and nearly perfect is pretty amazing.", "Excellent move. The difference from best is tiny.", "Very good. I'd be proud of that one."],
    good: ["Good. Not flashy, but it keeps you walking forward.", "A good move. Like a pawn step. Small, but it counts.", "Good choice. Steady wins more games than people think."],
    book: ["Book move. Thousands of players have walked this road before you.", "Still in the opening book. You're following the footsteps of legends.", "Known theory. Nice to know where you're going for a while."],
    inaccuracy: ["A small slip. Nobody's perfect. I'm literally a pawn.", "Inaccuracy. The better move was quieter. Look again.", "A little off. Next time, take one extra breath.", "Not quite the best. You'll spot it next time."],
    mistake: ["A mistake. It's alright. Look at what you missed and keep going.", "That cost you a bit. Every mistake is a lesson in disguise. A rude one.", "Mistake. Pawns can't go backwards, but you can learn backwards.", "That one stings. Let it teach you, then let it go."],
    miss: ["Missed chance! Your opponent gave you something and you didn't take it.", "You missed the punishment. Next time, check what they just left behind.", "A miss. The door was open for a moment. Look for open doors."],
    blunder: ["Oh no. A blunder. Deep breath. It's one move in a long life.", "Blunder. We've all done it. I once walked into a fork on my first day.", "That's a big one. Remember this feeling. It makes you careful.", "Blunder. It's not the end of you. It's the end of that idea."],
    great_game: ["What a game. I'm going to tell the whole back rank about you.", "That was brilliant chess. If I ever reach the end of the board, it'll be because of games like this."],
    ok_game: ["A decent game. Some gems, some slips. That's real chess.", "Not bad. You played like someone who's getting better. Because you are."],
    rough_game: ["A hard one. Every chess player has a pile of these. It's how they got good.", "Tough game. Tomorrow's board is clean. Come back to it."],
    start: ["Pip again! Let's see your game. I promise to be honest and kind."],
    win: ["You won! I'm doing a little hop!"],
    loss: ["You lost. That's okay. Pawns lose all the time, and we keep marching."],
  },
  vera: {
    brilliant: ["Brilliant. You have taste. I'll allow you into the palace.", "A move worthy of royalty. Don't let it go to your head. Actually, do.", "Brilliant. I've watched kings fall to less elegant moves.", "Magnificent. That's the kind of move they paint portraits of."],
    brilliant_q: ["You gave up your queen. Darling, I've done it too. Sometimes love means letting go of power.", "A queen sacrifice. Brave. Reckless. Correct. My favourite combination."],
    great: ["Great move. Under pressure, you stayed elegant.", "The only move. Found. Like a queen finds a gap in the defence.", "Great. One door, and you opened it gracefully.", "Excellent nerve. I admire nerve."],
    best: ["Best move. Of course.", "Correct. Keep it up.", "Best. You're starting to play like me.", "Top move. The court approves."],
    excellent: ["Excellent. A touch less than best, but very respectable.", "Very good. I'm almost satisfied.", "Excellent. Poised and precise."],
    good: ["Good. Sensible. Rather like a well-made glove.", "A good move. Not dazzling. Fine.", "Good. The kingdom is stable."],
    book: ["Book. The classics, darling.", "Theory. Even I studied it once. Briefly.", "A known move. Tradition has its charms."],
    inaccuracy: ["An inaccuracy. Sloppy. Fix your posture and try again.", "Not quite. I expected better. I always expect better.", "Inaccurate. A queen would never.", "Hmm. That wasn't the move. Pay attention."],
    mistake: ["A mistake. Disappointing, but recoverable.", "That cost you. Think before you move, not after.", "A mistake. Shall we pretend it didn't happen? No. Learn from it.", "Mistake. Even royalty trips on the stairs. Get up."],
    miss: ["You missed it. They practically handed you the crown.", "A miss. Opportunities do not wait for the indecisive.", "Missed. Next time, strike when they stumble."],
    blunder: ["A blunder. I'm speechless. And I am never speechless.", "Dreadful. Truly dreadful. Now, compose yourself.", "Blunder. That's the sort of thing that ends dynasties.", "Oh dear. That will be in the history books. Not kindly."],
    great_game: ["A superb game. I'd invite you to dinner.", "Royal chess. Well done, really well done."],
    ok_game: ["A respectable effort. Room to improve, as always.", "Decent. Not a triumph, not a tragedy."],
    rough_game: ["A rough game. Even queens have bad days. Mine was in 1874.", "Not your finest. Tomorrow, be finer."],
    start: ["Queen Vera, at your service. Reluctantly. Show me the game."],
    win: ["Victory. As it should be."],
    loss: ["A loss. Chin up, crown on, try again."],
  },
  bea: {
    brilliant: ["Brilliant. You saw the long diagonal of the whole position.", "A brilliant move. There's quiet genius in you.", "Beautiful. That move will stay with you.", "Brilliant. Sometimes the best ideas come from stillness."],
    brilliant_q: ["You gave up your queen for the win. Letting go of what you love can set everything else free.", "The queen is gone, and the game is saved. Some sacrifices are acts of faith."],
    great: ["A great move. Calm under pressure.", "The only path, and you found it with patience.", "Great. You saw clearly when it mattered.", "Great move. Stillness, then action."],
    best: ["Best. Clear and simple.", "The best move. Peaceful precision.", "Best. Well seen.", "Top choice. Quietly correct."],
    excellent: ["Excellent. Almost the best. Almost is a lovely place.", "Very good. A small improvement existed, nothing more.", "Excellent. Keep that calm."],
    good: ["Good. Sound and steady.", "A good move. Not every step must shine.", "Good. Solid ground."],
    book: ["Book. Walk the old roads first.", "A known move. There's wisdom in the well-trodden path.", "Theory. Many minds made this road for you."],
    inaccuracy: ["A small slip. Gently now.", "Not quite. Look along the longer lines.", "An inaccuracy. The better move was quieter.", "A little off course. Return to the diagonal."],
    mistake: ["A mistake. Be kind to yourself, and curious.", "That cost something. Ask what you didn't see.", "A mistake. Every master's path is full of them.", "Mistake. Let it be a teacher, not a weight."],
    miss: ["You missed a chance. Listen for the whispers of the position.", "A miss. When your opponent stumbles, look for what they left behind.", "Missed. Next time, check every capture."],
    blunder: ["A blunder. It hurts. Sit with it, then rise.", "Blunder. The darkest square is still part of the board.", "That one was painful. Pain is information.", "Blunder. Be gentle. Then be careful."],
    great_game: ["A lovely game. You saw far today.", "Wonderful chess. Peace and precision."],
    ok_game: ["A balanced game. Light and shadow.", "A fair game, with lessons to carry."],
    rough_game: ["A difficult game. Difficulty is a teacher.", "It didn't go well. Rest, and return with fresh eyes."],
    start: ["Bishop Bea. Let's look slowly, move by move."],
    win: ["A win. Well played. Enjoy it quietly."],
    loss: ["A loss. A step on a long road."],
  },
};
Object.entries(MORE_COACH2).forEach(([c, groups]) => { COACH_LINES[c] = COACH_LINES[c] || {}; Object.entries(groups).forEach(([k, L]) => { COACH_LINES[c][k] = [...(COACH_LINES[c][k] || []), ...L]; }); });
/* Opening stories: where each name comes from, what the opening is about, a main line that goes past the first few moves,
   fun facts, and a famous game. Lines and games are checked move by move with chess.js before every build is trusted
   (see the README); the classic games with a full score all end in checkmate, which a wrong move could not survive.
   Order matters: the first pattern that matches an opening's name wins, so specific variations come before families. */
const OPEN_STORY = [
  { re: /^English Opening/i, name: "English Opening", origin: "Named after Howard Staunton, the leading English player, who used 1.c4 in his famous match against Pierre Saint-Amant in 1843.", idea: "White controls d5 from the side and often plays a reversed Sicilian, with an extra move.", line: "c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7", facts: ["Staunton also gave his name to the standard chess pieces, the Staunton design, still used in every tournament today."] },
  { re: /Bongcloud/i, name: "Bongcloud", origin: "The name is an internet joke: an online meme of the 2010s for the worst-looking way to treat your king.", idea: "There is no idea. You walk the king forward on move two and give up castling. It is a joke opening, and that is the point.", line: "e4 e5 Ke2", facts: ["Magnus Carlsen and Hikaru Nakamura both opened with the Bongcloud against each other in 2021, in a real online event, and agreed a quick draw."] },
  { re: /Fried Liver/i, name: "Fried Liver Attack", origin: "Named after the Italian dish fegatello, because Black's king gets cooked in the middle of the board. It is one of the oldest traps on record: Giulio Cesare Polerio analysed it in the late 1500s.", idea: "White gives up a knight on f7 to drag Black's king into the open, then piles in with the queen and the rest of the army.", line: "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3", facts: ["Black avoids it with 5...Na5 instead of 5...Nxd5, and then White has to prove the pawn sacrifice was worth it.", "At club level it wins games every day. At master level it almost never appears, because 5...Na5 is well known."] },
  { re: /Italian Game: Two Knights|^Two Knights/i, name: "Two Knights Defence", origin: "Named for Black's two knights, both out by move three. It goes back to the 1500s.", idea: "Black ignores the threat to f7 and counterattacks in the centre. If White grabs with 4.Ng5, Black gives a pawn for fast development.", line: "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6", facts: ["Siegbert Tarrasch, one of the great teachers, called 4.Ng5 a 'bungler's move' because it moves the same piece twice to attack one pawn. Masters still play it."] },
  { re: /Evans Gambit/i, name: "Evans Gambit", origin: "Invented by Captain William Evans, a Welsh sea captain, in the 1820s. It was the height of fashion for decades.", idea: "White gives the b-pawn to gain time: c3 and d4 follow with tempo, building a big centre while Black's bishop runs around.", line: "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O", facts: ["Garry Kasparov revived it to beat Viswanathan Anand in a short, sharp game at Riga in 1995.", "The Evergreen Game, Anderssen against Dufresne in 1852, came out of an Evans Gambit."], game: "evergreen" },
  { re: /Giuoco Piano|Italian Game/i, name: "Italian Game", origin: "Giuoco Piano means 'the quiet game' in Italian. Gioachino Greco published games with it around 1620, which makes it one of the oldest openings still played at the top.", idea: "Develop fast, aim the bishop at f7, castle. In the modern 'very quiet' version, White plays c3 and d3 and slowly builds pressure.", line: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a5", facts: ["For years top players called it too harmless. In the 2010s it came back as a slow, deep opening, and now it is everywhere at elite level.", "The slow modern version is nicknamed Giuoco Pianissimo: 'the very quiet game'."] },
  { re: /Ruy Lopez: Berlin/i, name: "Berlin Defence", origin: "Analysed by players in Berlin in the 1800s. It got its nickname, the Berlin Wall, in 2000.", idea: "Black heads for an early queen trade. Black's king loses castling, but the position is so solid that White struggles to win.", line: "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8", facts: ["Vladimir Kramnik used the Berlin to take the world title from Kasparov in London 2000. Kasparov did not win a single game in that match.", "After the queens come off, the position is called the Berlin endgame. It looks dull and is fiendishly deep."] },
  { re: /Ruy Lopez.*Marshall|Marshall Attack/i, name: "Marshall Attack", origin: "Named after Frank Marshall, the American champion, who unveiled it against José Raúl Capablanca in New York in 1918.", idea: "Black gives up a pawn on move eight for a direct attack on White's king, with the pieces flooding the kingside.", line: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5 exd5 Nxd5 Nxe5 Nxe5 Rxe5 c6", facts: ["The legend is that Marshall kept it secret for years to spring on Capablanca. Capablanca defended calmly and won anyway.", "Today it is so well analysed that many top players with White avoid it, with 8.a4 or 8.h3."] },
  { re: /^Ruy Lopez|^Spanish Game/i, name: "Ruy Lopez", origin: "Named after Ruy López de Segura, a Spanish priest who wrote about it in his book of 1561. Many call it the Spanish Game.", idea: "The bishop pins nothing yet, but it pressures the knight that defends e5. White plays a long game: slow pressure, a strong centre, and a later attack.", line: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3", facts: ["3...a6 is called the Morphy Defence, after Paul Morphy, the American genius of the 1850s.", "The Ruy Lopez has been a main weapon of nearly every world champion. Players call it the 'torture opening' because the pressure can last for 60 moves."] },
  { re: /^Scotch Game/i, name: "Scotch Game", origin: "Named after a correspondence match between Edinburgh and London in 1824, where the Edinburgh side played it.", idea: "White opens the centre at once with d4 and gets free piece play, without the slow build-up of the Ruy Lopez.", line: "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4", facts: ["Kasparov brought it back to the top by playing it against Anatoly Karpov in their 1990 world championship match."] },
  { re: /Petrov|Russian Game/i, name: "Petrov Defence", origin: "Named after Alexander Petrov, the leading Russian master of the early 1800s. It is also called the Russian Game.", idea: "Black copies White and counterattacks e4 instead of defending e5. The result is symmetrical and very solid.", line: "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6 O-O Be7", facts: ["The classic trap: 3...Nxe4? 4.Qe2 Nf6?? 5.Nc6+, a discovered check that wins Black's queen. That is why Black plays 3...d6 first.", "It has a reputation for being drawish, which is exactly why world title challengers have used it as Black."] },
  { re: /^Philidor Defen[cs]e/i, name: "Philidor Defence", origin: "Named after François-André Danican Philidor, the best player of the 1700s, who recommended 2...d6 in his book of 1749. He was also a famous opera composer.", idea: "Black defends e5 with a pawn and keeps a compact, slightly cramped position.", line: "e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 O-O O-O", facts: ["Philidor wrote that 'pawns are the soul of chess', one of the most quoted lines in the game.", "Two of the most famous short games ever, Légal's mate and Morphy's Opera Game, came out of the Philidor."], game: "opera" },
  { re: /King's Gambit/i, name: "King's Gambit", origin: "Played since at least the 1500s, and the favourite of the Romantic era of the 1800s, when attacking was everything.", idea: "White offers the f-pawn to rip open the f-file and build a big centre. Black usually grabs the pawn and fights back.", line: "e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5 Nf6 Bc4 d5 exd5 Bd6", facts: ["Boris Spassky beat a young Bobby Fischer with the King's Gambit in 1960. Fischer went home and wrote an article called 'A Bust to the King's Gambit'.", "The Immortal Game, Anderssen against Kieseritzky in 1851, started with the King's Gambit."], game: "immortal" },
  { re: /^Vienna Game/i, name: "Vienna Game", origin: "Named after the players of Vienna who studied it in the mid-1800s.", idea: "White develops the queen's knight first and often follows with f4, a King's Gambit with an extra piece out.", line: "e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7 d4 O-O", facts: ["One branch, the Steinitz Gambit, has White's king walk out on move five on purpose. Wilhelm Steinitz, the first world champion, loved it."] },
  { re: /Danish/i, name: "Danish Gambit", origin: "Named after Danish players who popularised it in the 1830s.", idea: "White gives up two pawns for two bishops raking across the board at Black's king.", line: "e4 e5 d4 exd4 c3 dxc3 Bc4 cxb2 Bxb2 d5 Bxd5 Nf6", facts: ["Black's cleanest answer is to give one pawn back with ...d5, which kills most of White's attack."] },
  { re: /Stafford/i, name: "Stafford Gambit", origin: "Named after Stafford, an English player of the 1800s. It was a forgotten curiosity until streamer Eric Rosen made it famous online.", idea: "Black gives a pawn and sets one trap after another, hoping White grabs the wrong thing.", line: "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5", facts: ["With accurate play White is simply better. Online, against someone who has never seen it, it wins a lot."] },
  { re: /^Sicilian.*Najdorf/i, name: "Najdorf Sicilian", origin: "Named after Miguel Najdorf, a Polish-born grandmaster who was playing for Poland at the 1939 Olympiad in Buenos Aires when World War II broke out. He stayed in Argentina for the rest of his life.", idea: "The little move 5...a6 keeps White's pieces off b5 and prepares ...e5 or ...b5. Black plays for a win with sharp, unbalanced positions.", line: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O", facts: ["It was the favourite weapon of both Bobby Fischer and Garry Kasparov.", "The Najdorf may be the most deeply analysed opening in chess. Some lines are memorised past move 30."] },
  { re: /^Sicilian.*Dragon/i, name: "Dragon Sicilian", origin: "Named by Fyodor Dus-Chotimirsky, a Russian master and amateur astronomer, around 1900: Black's pawns on d6, e7, f7, g6 and h7 reminded him of the constellation Draco.", idea: "Black fianchettoes the bishop on g7, where it breathes fire down the long diagonal. White castles queenside and races a pawn storm at Black's king.", line: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O", facts: ["The white set-up with f3, Qd2 and queenside castling is the Yugoslav Attack. White's plan is summed up by an old joke: open the h-file, sacrifice, sacrifice, mate.", "Both sides attack opposite kings, so one tempo often decides the game."] },
  { re: /^Sicilian.*(Sveshnikov|Pelikan)/i, name: "Sveshnikov Sicilian", origin: "Named after Evgeny Sveshnikov, the Russian grandmaster who turned it into a serious system in the 1970s. It is also called the Lasker-Pelikan.", idea: "Black plays ...e5 and accepts a hole on d5, in exchange for activity and the bishop pair.", line: "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5", facts: ["Magnus Carlsen played the Sveshnikov again and again against Fabiano Caruana in their 2018 world championship match."] },
  { re: /^Sicilian/i, name: "Sicilian Defence", origin: "Italian writers described it in the late 1500s, and it is named after the island of Sicily. It only became the main answer to 1.e4 in the 20th century.", idea: "Black answers e4 with a wing pawn. The position is unbalanced from move one: White usually gets attacking chances, and Black gets a central pawn majority and counterplay.", line: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3", facts: ["It is the most popular answer to 1.e4 among masters, and the best scoring for Black.", "Once White trades the d-pawn for Black's c-pawn, Black has two central pawns against one. That long-term edge is the reason the Sicilian works."] },
  { re: /^French.*Winawer/i, name: "French Winawer", origin: "Named after Szymon Winawer, a Polish master of the 1800s.", idea: "Black pins the knight, gives up the bishop for it and wrecks White's pawns. White gets the bishop pair and attacks the kingside.", line: "e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4", facts: ["Mikhail Botvinnik, world champion for most of 1948 to 1963, was one of its great champions."] },
  { re: /^French Defen[cs]e/i, name: "French Defence", origin: "Named after a correspondence match in 1834, when the Paris side played it against London and won.", idea: "Black builds a solid wall with e6 and d5. The light-squared bishop is often stuck behind it, and the whole game turns on breaking White's centre with ...c5 and ...f6.", line: "e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O", facts: ["Black's bishop on c8 is known as the 'French bishop', and freeing it is half the battle.", "Aron Nimzowitsch championed the Advance variation, where White pushes e5 at once."] },
  { re: /^Caro-Kann/i, name: "Caro-Kann Defence", origin: "Named after Horatio Caro, an English player, and Marcus Kann, an Austrian, who analysed it in the 1880s.", idea: "Like the French, but Black's light-squared bishop gets out before ...e6. Solid, with few weaknesses: Black plans to defend well and win the endgame.", line: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3", facts: ["Kasparov chose the Caro-Kann in the deciding sixth game against the computer Deep Blue in 1997, and lost in 19 moves. It was the first match a world champion lost to a computer.", "Mikhail Botvinnik relied on it in his world title matches in the 1950s and 1960s."] },
  { re: /^Scandinavian|^Cent(er|re) Counter/i, name: "Scandinavian Defence", origin: "Named after Scandinavian players who analysed it in the 1800s. It is one of the oldest openings of all: a game from Valencia in 1475, among the first recorded games of modern chess, starts with it.", idea: "Black challenges e4 at once. The queen comes out early and has to dodge attacks, but Black gets a simple, healthy position.", line: "e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5", facts: ["It is also called the Centre Counter Defence."] },
  { re: /Alekhine Defen[cs]e/i, name: "Alekhine's Defence", origin: "World champion Alexander Alekhine brought it to top-level chess in 1921.", idea: "Black invites White's pawns forward, chasing the knight, and then attacks the overextended centre. Provocation as a strategy.", line: "e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O Be7", facts: ["Bobby Fischer played it in game 13 of his 1972 match against Boris Spassky, and won."] },
  { re: /^Pirc/i, name: "Pirc Defence", origin: "Named after Vasja Pirc, the Slovenian grandmaster who analysed it in the mid-1900s.", idea: "Black lets White build a big centre, then attacks it from the side with a fianchettoed bishop and pawn breaks.", line: "e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O Bd3", facts: ["Kasparov's most famous win, against Veselin Topalov at Wijk aan Zee in 1999, came out of a Pirc. It is often called Kasparov's Immortal."] },
  { re: /Queen's Gambit Declined/i, name: "Queen's Gambit Declined", origin: "Declining the gambit with ...e6 has been the classical answer for more than a century.", idea: "Black holds the d5 point with ...e6 and develops calmly, then frees the game with ...c5 or ...e5.", line: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6", facts: ["In the 1927 world championship match between Capablanca and Alekhine, nearly every game was a Queen's Gambit Declined.", "Game 6 of Fischer against Spassky in 1972 was a Queen's Gambit Declined. It was so beautiful that Spassky stood and applauded."] },
  { re: /Queen's Gambit Accepted/i, name: "Queen's Gambit Accepted", origin: "Taking the pawn is as old as the gambit itself, more than 500 years.", idea: "Black takes on c4 but doesn't try to keep the pawn. Black uses the time to strike back at the centre with ...c5.", line: "d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6", facts: ["It isn't a real gambit: White can almost always win the pawn back. That's why Black doesn't hang on to it."] },
  { re: /Semi-Slav|Meran/i, name: "Semi-Slav", origin: "A blend of the Slav (...c6) and the Queen's Gambit Declined (...e6). The Meran variation is named after the Merano tournament of 1924.", idea: "Black builds a solid triangle of pawns and keeps the option of taking on c4 and expanding with ...b5.", line: "d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5 Bd3", facts: ["The Botvinnik variation of the Semi-Slav is one of the sharpest lines in all of chess, with both sides sacrificing material on move ten."] },
  { re: /Slav Defen[cs]e/i, name: "Slav Defence", origin: "Named after the many Slavic masters who developed it in the early 1900s.", idea: "Black supports d5 with the c-pawn instead of the e-pawn, so the light-squared bishop can still get out.", line: "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O", facts: ["It was a main battleground in the Alekhine against Euwe world championship matches of the 1930s."] },
  { re: /Queen's Gambit/i, name: "Queen's Gambit", origin: "It is over 500 years old: it appears in the Göttingen manuscript from around 1490. A Netflix show made the name famous again in 2020.", idea: "White offers the c-pawn to pull Black's d-pawn away from the centre.", line: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7", facts: ["It isn't a true gambit: if Black takes, White can nearly always win the pawn back."] },
  { re: /^Nimzo-Indian/i, name: "Nimzo-Indian Defence", origin: "Named after Aron Nimzowitsch, author of the classic book My System (1925), who made it famous.", idea: "Black pins the knight to stop e4, and will often give up the bishop to double White's pawns. Control of the light squares is everything.", line: "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O", facts: ["It is one of the most respected defences of all. Almost every world champion has played it with Black.", "'Indian' openings are the ones where a bishop goes to the wing early or the centre is fought from a distance."] },
  { re: /^Queen's Indian/i, name: "Queen's Indian Defence", origin: "Named in the 1920s, when the hypermodern players gave the Indian openings their names.", idea: "Black fianchettoes the queen's bishop to b7 to control e4 from a distance.", line: "d4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+ Bd2 Be7", facts: ["It is famous for being solid. The modern ...Ba6 idea attacks c4 and makes White commit."] },
  { re: /King's Indian Defen[cs]e/i, name: "King's Indian Defence", origin: "Named in the 1920s. It became a top-level weapon in the late 1940s and 1950s, when Soviet players such as David Bronstein and Isaac Boleslavsky showed how dynamic it is.", idea: "Black lets White take the whole centre, then hits back with ...e5 or ...c5 and often a pawn storm at White's king.", line: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7", facts: ["Bobby Fischer and Garry Kasparov both used it as a main weapon with Black.", "In the main line both sides attack on opposite wings, a race where counting moves matters more than material."] },
  { re: /^Gr[üu]nfeld/i, name: "Grünfeld Defence", origin: "Named after Ernst Grünfeld, an Austrian grandmaster, who introduced it in 1922.", idea: "Black lets White build a huge pawn centre, then attacks it with pieces and the bishop on g7.", line: "d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Bc4 c5 Ne2 Nc6", facts: ["Thirteen-year-old Bobby Fischer beat Donald Byrne with it in New York in 1956, in a game known as the Game of the Century."], game: "century" },
  { re: /Benko|Volga/i, name: "Benko Gambit", origin: "Named after Pal Benko, the Hungarian-American grandmaster who popularised it. In Russia it is called the Volga Gambit.", idea: "Black gives a pawn for lasting pressure along the a- and b-files.", line: "d4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 Bxa6 Nc3 d6 e4 Bxf1 Kxf1 g6", facts: ["Benko gave up his own place in the 1970 Interzonal so Bobby Fischer could play in it. Fischer went on to become world champion."] },
  { re: /Benoni Defen[cs]e/i, name: "Benoni Defence", origin: "From a book of 1825 by Aaron Reinganum called Ben-Oni, Hebrew for 'son of sorrow'.", idea: "Black accepts a space disadvantage for an unbalanced pawn structure, a bishop on g7 and queenside counterplay.", line: "d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7 Be2 O-O", facts: ["Fischer scored his first ever win against Spassky with a Modern Benoni, in game 3 of their 1972 match.", "Mikhail Tal, the magician from Riga, loved its tactics."] },
  { re: /^Dutch Defen[cs]e/i, name: "Dutch Defence", origin: "Named after Elias Stein, a Dutch player who recommended it in a book in 1789.", idea: "Black plays ...f5 to grab e4 and prepare a kingside attack, at the cost of loosening the king.", line: "d4 f5 g3 Nf6 Bg2 e6 Nf3 Be7 O-O O-O c4 d6 Nc3", facts: ["Edward Lasker beat George Thomas in London in 1912 with a queen sacrifice and a king hunt that dragged Black's king all the way to g1. It started from a Dutch."], game: "lasker" },
  { re: /Catalan Opening/i, name: "Catalan Opening", origin: "Named after Catalonia: the organisers of the Barcelona tournament of 1929 asked for a new opening, and Savielly Tartakower obliged.", idea: "A Queen's Gambit with the bishop fianchettoed on g2, where it presses on Black's queenside for the whole game.", line: "d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6 Qxc4 b5 Qc2 Bb7", facts: ["Viswanathan Anand used it to win key games against Veselin Topalov in their 2010 world championship match."] },
  { re: /London System/i, name: "London System", origin: "Named after the London tournament of 1922, where several players used the Bf4 set-up.", idea: "A system more than an opening: d4, Bf4, e3, c3 and Nf3, almost whatever Black does. Easy to learn, hard to crack.", line: "d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O Bd3", facts: ["For years it was seen as a beginner's opening. Then Magnus Carlsen played it at the top level in the 2010s and everyone copied him."] },
  { re: /Trompowsky/i, name: "Trompowsky Attack", origin: "Named after Octávio Trompowsky, the Brazilian champion of the 1930s and 1940s.", idea: "White pins or attacks the knight on move two, threatening to wreck Black's pawns before any theory starts.", line: "d4 Nf6 Bg5 Ne4 Bf4 c5 f3 Qa5+ c3 Nf6", facts: ["It is a favourite surprise weapon: Black's usual Indian set-ups don't work in the same way."] },
  { re: /Budapest/i, name: "Budapest Gambit", origin: "Named after the city of Budapest, where Hungarian masters developed it at the start of the 1900s.", idea: "Black gives the e-pawn and hunts it back with the knight from g4, getting quick, active piece play.", line: "d4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 Nf3 Bb4+ Nbd2 Qe7 e3 Ngxe5", facts: ["It is rare at the top, but a dangerous surprise at club level, where White often grabs the wrong pawn."] },
  { re: /^R[ée]ti Opening/i, name: "Réti Opening", origin: "Named after Richard Réti, a leader of the hypermodern school of the 1920s.", idea: "Control the centre from a distance: Nf3, c4 and a fianchettoed bishop, and only later strike with pawns.", line: "Nf3 d5 c4 e6 g3 Nf6 Bg2 Be7 O-O O-O b3", facts: ["Réti used it to beat José Raúl Capablanca in New York in 1924. It was Capablanca's first loss in eight years."] },
  { re: /^Bird Opening|Bird's Opening/i, name: "Bird's Opening", origin: "Named after Henry Bird, an English master who played 1.f4 for decades in the 1800s.", idea: "A Dutch Defence with colours reversed: White grabs e5 and aims at the kingside.", line: "f4 d5 Nf3 Nf6 e3 g6 b3 Bg7 Bb2 O-O Be2", facts: ["The trap to know: after 1...e5 2.fxe5 d6 3.exd6 Bxd6, careless play by White can allow a fast mate with ...Qh4+."] },
  { re: /Hippopotamus/i, name: "Hippopotamus", origin: "Named for how it looks: Black sits in a heavy, low shell on the first three ranks, like a hippo in a river.", idea: "Black ignores the centre at first, sets up all pieces behind the pawns, and waits for White to overreach.", line: "e4 g6 d4 Bg7 Nc3 d6 Be3 a6 Qd2 b5", facts: ["It is rare at the top but loved online, because it can be played against almost anything."] },
];

/* Classic games, each one checked to replay legally to its final position (all end in checkmate). */
const OPEN_GAMES = {
  opera: { title: "The Opera Game", who: "Paul Morphy vs Duke Karl of Brunswick and Count Isouard", when: "Paris, 1858", note: "Morphy played it in a box at the Paris opera house during a performance, against two noblemen consulting together. Every move develops with a threat, and it ends with a queen sacrifice and mate on d8.", names: ["Morphy", "Duke & Count"], pgn: "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#" },
  legal: { title: "Légal's mate", who: "Kermur de Légal vs Saint Brie", when: "Paris, around 1750", note: "Légal 'blunders' his queen, then mates with three minor pieces. The trap still catches club players today.", names: ["Légal", "Saint Brie"], pgn: "1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5#" },
  immortal: { title: "The Immortal Game", who: "Adolf Anderssen vs Lionel Kieseritzky", when: "London, 1851", note: "Anderssen gave up both rooks, a bishop and then his queen, and mated with three minor pieces. It was a casual game played during the first international tournament.", names: ["Anderssen", "Kieseritzky"], pgn: "1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7#" },
  evergreen: { title: "The Evergreen Game", who: "Adolf Anderssen vs Jean Dufresne", when: "Berlin, 1852", note: "Wilhelm Steinitz called it 'the evergreen in Anderssen's laurel wreath'. A rook sacrifice, a queen sacrifice and a bishop mate.", names: ["Anderssen", "Dufresne"], pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7#" },
  century: { title: "The Game of the Century", who: "Donald Byrne vs Bobby Fischer", when: "New York, 1956", note: "Fischer was 13. On move 17 he gave up his queen for a whirlwind of pieces, and the game ended with Black's rook, bishops and knight mating White's king.", names: ["Byrne", "Fischer"], pgn: "1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O 5. Bf4 d5 6. Qb3 dxc4 7. Qxc4 c6 8. e4 Nbd7 9. Rd1 Nb6 10. Qc5 Bg4 11. Bg5 Na4 12. Qa3 Nxc3 13. bxc3 Nxe4 14. Bxe7 Qb6 15. Bc4 Nxc3 16. Bc5 Rfe8+ 17. Kf1 Be6 18. Bxb6 Bxc4+ 19. Kg1 Ne2+ 20. Kf1 Nxd4+ 21. Kg1 Ne2+ 22. Kf1 Nc3+ 23. Kg1 axb6 24. Qb4 Ra4 25. Qxb6 Nxd1 26. h3 Rxa2 27. Kh2 Nxf2 28. Re1 Rxe1 29. Qd8+ Bf8 30. Nxe1 Bd5 31. Nf3 Ne4 32. Qb8 b5 33. h4 h5 34. Ne5 Kg7 35. Kg1 Bc5+ 36. Kf1 Ng3+ 37. Ke1 Bb4+ 38. Kd1 Bb3+ 39. Kc1 Ne2+ 40. Kb1 Nc3+ 41. Kc1 Rc2#" },
  lasker: { title: "The king hunt", who: "Edward Lasker vs George Alan Thomas", when: "London, 1912", note: "Lasker sacrificed his queen on h7, then chased Black's king with checks all the way from g8 to g1, and mated with a quiet king move.", names: ["Ed. Lasker", "Thomas"], pgn: "1. d4 e6 2. Nf3 f5 3. Nc3 Nf6 4. Bg5 Be7 5. Bxf6 Bxf6 6. e4 fxe4 7. Nxe4 b6 8. Ne5 O-O 9. Bd3 Bb7 10. Qh5 Qe7 11. Qxh7+ Kxh7 12. Nxf6+ Kh6 13. Neg4+ Kg5 14. h4+ Kf4 15. g3+ Kf3 16. Be2+ Kg2 17. Rh2+ Kg1 18. Kd2#" },
  reti: { title: "Réti's miniature", who: "Richard Réti vs Savielly Tartakower", when: "Vienna, 1910", note: "A queen sacrifice on d8 drags the king out, and two bishop moves finish it in eleven moves.", names: ["Réti", "Tartakower"], pgn: "1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Qd3 e5 6. dxe5 Qa5+ 7. Bd2 Qxe5 8. O-O-O Nxe4 9. Qd8+ Kxd8 10. Bg5+ Kc7 11. Bd8#" },
};
OPEN_STORY.find((s) => s.name === "Caro-Kann Defence").game = "reti";
const openStory = (name) => (name ? OPEN_STORY.find((s) => s.re.test(name)) || null : null);
/* Install ballknowledge as an app, from any sport page (each build includes this file).
   Chrome, Edge and Android offer a real install prompt: we keep it and show a small "Get the app" chip from your second day of
   playing (never on the first visit, never once installed, and "Not now" hides it for two weeks). iPhone and iPad have no
   prompt, so the chip opens two steps: Share, then Add to Home Screen. Installed, the site opens full screen with its own icon,
   and the pages you've visited work offline (the service worker keeps them). */
const Install = {
  dp: null,
  standalone() { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; },
  ios() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); },
  days() { try { const k = "bk_visit_days", d = JSON.parse(localStorage.getItem(k) || "[]"), t = new Date().toISOString().slice(0, 10); if (!d.includes(t)) { d.push(t); localStorage.setItem(k, JSON.stringify(d.slice(-30))); } return d.length; } catch (e) { return 1; } },
  snoozed() { try { return Date.now() < +(localStorage.getItem("bk_install_snooze") || 0); } catch (e) { return false; } },
  show() {
    if (this.standalone() || this.snoozed() || document.getElementById("bkInst") || location.protocol !== "https:" && !/localhost|127\.0\.0\.1/.test(location.hostname)) return;
    if (!this.dp && !this.ios()) return;
    const c = document.createElement("div"); c.id = "bkInst";
    c.innerHTML = `<img src="${location.pathname.split("/").length > 2 ? "../" : ""}icon-192.png" alt=""><div><b>Get the app</b><small>Full screen, its own icon, works offline.</small></div><button type="button" class="bkiGo">Install</button><button type="button" class="bkiX" aria-label="Not now">✕</button>`;
    document.body.appendChild(c);
    c.querySelector(".bkiX").onclick = () => { try { localStorage.setItem("bk_install_snooze", Date.now() + 14 * 864e5); } catch (e) { /* blocked */ } c.classList.add("out"); setTimeout(() => c.remove(), 300); };
    c.querySelector(".bkiGo").onclick = () => {
      if (this.dp) { this.dp.prompt(); this.dp.userChoice.then((r) => { if (r && r.outcome === "accepted") c.remove(); this.dp = null; }); return; }
      const m = document.createElement("div"); m.id = "bkInstIos"; m.innerHTML = `<div class="bkib"><h3>Add ballknowledge to your Home Screen</h3><ol><li>Tap the <b>Share</b> button <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8"/></svg> in Safari's toolbar.</li><li>Scroll and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol><button type="button">Got it</button></div>`;
      document.body.appendChild(m); m.onclick = (e) => { if (e.target === m || e.target.tagName === "BUTTON") m.remove(); };
    };
  },
  init() {
    const n = this.days();
    addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); this.dp = e; if (n >= 2) setTimeout(() => this.show(), 8000); });
    addEventListener("appinstalled", () => { const c = document.getElementById("bkInst"); if (c) c.remove(); });
    if (this.ios() && n >= 2) setTimeout(() => this.show(), 8000);
  },
};
Install.init();
(() => { const s = document.createElement("style"); s.textContent = `
#bkInst{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9000;display:flex;align-items:center;gap:10px;padding:10px 10px 10px 12px;border-radius:18px;background:#141b17f2;color:#f4f1ea;border:1px solid #ffffff2a;box-shadow:0 18px 40px -14px #000;width:min(440px,calc(100% - 32px));backdrop-filter:blur(10px);animation:bkiIn .5s cubic-bezier(.2,1.3,.4,1)}
#bkInst.out{opacity:0;transform:translate(-50%,20px);transition:.3s}#bkInst img{width:40px;height:40px;border-radius:10px}#bkInst div{flex:1;min-width:0}#bkInst b{display:block;font-size:15px}#bkInst small{font-size:12px;opacity:.75}
#bkInst .bkiGo{font:700 14px inherit;padding:9px 14px;border-radius:12px;border:0;background:var(--accent,#f2c14e);color:#111;cursor:pointer}#bkInst .bkiX{background:none;border:0;color:inherit;opacity:.6;font-size:16px;cursor:pointer;padding:6px}
@keyframes bkiIn{from{opacity:0;transform:translate(-50%,30px)}}
#bkInstIos{position:fixed;inset:0;z-index:100001;background:#000a;display:flex;align-items:flex-end;justify-content:center;padding:16px}#bkInstIos .bkib{background:#141b17;color:#f4f1ea;border-radius:20px;padding:18px 20px;width:min(440px,100%);border:1px solid #ffffff2a}
#bkInstIos h3{margin:0 0 8px;font-size:19px}#bkInstIos ol{margin:0 0 12px;padding-left:20px;line-height:1.7}#bkInstIos svg{vertical-align:-3px}#bkInstIos button{font:700 15px inherit;padding:10px 18px;border-radius:12px;border:0;background:var(--accent,#f2c14e);color:#111}`; document.head.appendChild(s); })();
/* Accessibility: a "Skip to content" button, the first thing keyboard users reach, shown only when focused. It's a button
   rather than a #link because the sites route by the address hash. It moves focus to the visible main area. */
(() => {
  const go = () => { const t = [...document.querySelectorAll("#league:not([hidden]) #room, #league:not([hidden]), #home:not([hidden]), #profilePage:not([hidden]), main, #app")].find((x) => x.offsetParent !== null || x.tagName === "MAIN"); if (!t) return; if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: false }); };
  const add = () => { if (document.getElementById("bkSkip")) return; const b = document.createElement("button"); b.id = "bkSkip"; b.type = "button"; b.textContent = "Skip to content"; b.onclick = go; document.body.prepend(b); };
  if (document.body) add(); else addEventListener("DOMContentLoaded", add);
  const s = document.createElement("style"); s.textContent = "#bkSkip{position:fixed;left:12px;top:-60px;z-index:100002;padding:10px 16px;border-radius:12px;border:0;background:var(--accent,#f2c14e);color:#111;font:700 15px system-ui,sans-serif;transition:top .2s}#bkSkip:focus{top:12px;outline:3px solid #fff;outline-offset:2px}[tabindex='-1']:focus{outline:none}"; document.head.appendChild(s);
})();
/* generated by src/95_site_index.py: every game and main page in all three sports, for search */
const SITE_INDEX = [{"s":"football","k":"Game","n":"Who am I?","u":"football/#games-all-leagues-who","d":"A mystery player. Clues go from obscure to obvious. Buzz in early for more points."},{"s":"football","k":"Game","n":"Career path","u":"football/#games-all-leagues-career","d":"Every club he played for, in order. Name the player."},{"s":"football","k":"Game","n":"Name that club","u":"football/#games-all-leagues-club","d":"Goals, wins and a stadium size. Which club is it?"},{"s":"football","k":"Game","n":"Badge blur","u":"football/#games-all-leagues-blur","d":"A blurry badge that sharpens by the second."},{"s":"football","k":"Game","n":"Where did they finish?","u":"football/#games-all-leagues-finish","d":"A club, a season, a slider. How close can you get?"},{"s":"football","k":"Game","n":"Market value","u":"football/#games-all-leagues-value","d":"Who is worth more, a player or a squad? Or both of you guess a value and the closest wins."},{"s":"football","k":"Game","n":"Club roulette","u":"football/#games-all-leagues-roulette","d":"A club appears. Take turns naming players who played for it. First to blank loses."},{"s":"football","k":"Game","n":"Starting XI","u":"football/#games-all-leagues-xi","d":"Champions League and cup finals, Champions League semi-finals and the biggest league games. Name the eleven wh"},{"s":"football","k":"Game","n":"Who did it","u":"football/#games-all-leagues-iconic","d":"A big match and its highlights by minute. Name the scorers, assisters, penalty takers and who was sent off."},{"s":"football","k":"Game","n":"Scramble","u":"football/#games-all-leagues-scramble","d":"A club, player or manager with the letters shuffled. Unscramble it before your rival does."},{"s":"football","k":"Game","n":"Football tic-tac-toe","u":"football/#games-all-leagues-ttt","d":"Name a player who fits the row and the column. Three in a row wins."},{"s":"football","k":"Game","n":"Call it","u":"football/#games-all-leagues-call","d":"One real match. Lock in your call, watch the model's match play out, then see what really happened."},{"s":"football","k":"Game","n":"Daily 5","u":"football/#games-all-leagues-daily","d":"The same five matches for everyone today. Beat the model and share your result."},{"s":"football","k":"Game","n":"Matchday","u":"football/#games-all-leagues-matchday","d":"Call a whole round at once and watch the results land one by one."},{"s":"football","k":"Game","n":"Rapid fire","u":"football/#games-all-leagues-rapid","d":"60 seconds. Call as many real matches as you can and beat the model on the same ones."},{"s":"football","k":"Game","n":"Bracket buster","u":"football/#games-all-leagues-bracket","d":"A real Champions League knockout. Pick every tie, round by round, against an Elo model."},{"s":"football","k":"Game","n":"Spot the upset","u":"football/#games-all-leagues-upset","d":"Five real results. Which one did the model think was least likely?"},{"s":"football","k":"Game","n":"Guess the table","u":"football/#games-all-leagues-table","d":"Rebuild a final table from last season's, then see you against the model."},{"s":"football","k":"Game","n":"Higher or lower","u":"football/#games-all-leagues-hol","d":"Two clubs, one number. Keep the streak alive."},{"s":"football","k":"Game","n":"Challenge a friend","u":"football/#games-all-leagues-challenge","d":"Five matches, one link. Send it and see who does better."},{"s":"basketball","k":"Game","n":"Who am I?","u":"basketball/#games-nba-who","d":"A mystery player. Clues go from obscure to obvious. Buzz in early for more points."},{"s":"basketball","k":"Game","n":"Career path","u":"basketball/#games-nba-career","d":"Every team he played for, in order. Name the player."},{"s":"basketball","k":"Game","n":"Name that team","u":"basketball/#games-nba-club","d":"Points, wins and a playoff run. Which team is it?"},{"s":"basketball","k":"Game","n":"Logo blur","u":"basketball/#games-nba-blur","d":"A blurry logo that sharpens by the second."},{"s":"basketball","k":"Game","n":"Where did they finish?","u":"basketball/#games-nba-finish","d":"A team, a season, a slider. How close can you get?"},{"s":"basketball","k":"Game","n":"Scramble","u":"basketball/#games-nba-scramble","d":"A player or team with the letters shuffled. Unscramble it before your rival does."},{"s":"basketball","k":"Game","n":"Team roulette","u":"basketball/#games-nba-roulette","d":"A team appears. Take turns naming players who played for it. First to blank loses."},{"s":"basketball","k":"Game","n":"Basketball tic-tac-toe","u":"basketball/#games-nba-ttt","d":"Name a player who fits the row and the column. Three in a row wins."},{"s":"basketball","k":"Game","n":"Who dropped it?","u":"basketball/#games-nba-dropped","d":"A real stat line with the name hidden: points, rebounds, assists. Clues get easier. Who was it?"},{"s":"basketball","k":"Game","n":"Starting five","u":"basketball/#games-nba-nbxi","d":"A Finals clincher or a Game 7. Name the five who started."},{"s":"basketball","k":"Game","n":"Higher or lower","u":"basketball/#games-nba-nbhol","d":"Two players, one stat. Who has more? Keep the streak alive."},{"s":"basketball","k":"Game","n":"Odd one out","u":"basketball/#games-nba-nbodd","d":"Four players, one does not belong. Who never played for the team, never won a title, never scored 22 a night?"},{"s":"basketball","k":"Game","n":"Rank the five","u":"basketball/#games-nba-nbrank","d":"Five players and one stat. Tap them in order, most to fewest. Closer to the truth scores more."},{"s":"basketball","k":"Game","n":"Career timeline","u":"basketball/#games-nba-nbtime","d":"A player's teams, shuffled. Slide each one to the season he joined it."},{"s":"basketball","k":"Game","n":"Call it","u":"basketball/#games-nba-nbcall","d":"Five real NBA games. Pick the winner and the margin, then see what the model said."},{"s":"basketball","k":"Game","n":"Daily 5","u":"basketball/#games-nba-nbdaily","d":"The same five games for everyone today. Beat the model and share your result."},{"s":"basketball","k":"Game","n":"Rapid fire","u":"basketball/#games-nba-nbrapid","d":"60 seconds. Tap the winner of as many real games as you can."},{"s":"basketball","k":"Game","n":"Bracket buster","u":"basketball/#games-nba-nbbracket","d":"A real NBA playoffs. Pick every series, round by round, against an Elo model."},{"s":"basketball","k":"Game","n":"Over or under","u":"basketball/#games-nba-nbou","d":"The model sets a line for a real game. Bet over or under with a bankroll that grows or shrinks."},{"s":"chess","k":"Game","n":"Call it","u":"chess/#go-call","d":"Two ratings and a time control: who wins, and how long does it last?"},{"s":"chess","k":"Game","n":"Predict who won","u":"chess/#go-elite","d":"Real games from the biggest events. Pick the result against the model."},{"s":"chess","k":"Game","n":"Guess the next move","u":"chess/#go-next","d":"A position from a real top-level game. Which move did the player choose?"},{"s":"chess","k":"Game","n":"Recognize the game","u":"chess/#go-recog","d":"The first moves of a real game. Who was playing?"},{"s":"chess","k":"Game","n":"Blunder or fine?","u":"chess/#go-blunder","d":"A move, graded by Stockfish. Blunder, mistake, inaccuracy or fine?"},{"s":"chess","k":"Game","n":"Name the opening","u":"chess/#go-open","d":"A position on the board. Sicilian, Ruy Lopez, King's Indian?"},{"s":"chess","k":"Game","n":"Pip's opening gym","u":"chess/#go-trainer","d":"Pip plays a random opening and you get a random colour. Play the best lines: slip, and Pip stops you and shows"},{"s":"chess","k":"Game","n":"Mate puzzles","u":"chess/#go-mate","d":"Real puzzles: checkmate in 1, 2 or 3."},{"s":"chess","k":"Game","n":"Estimate my Elo","u":"chess/#go-elo","d":"Puzzles that adapt to you, then an estimate of your level."},{"s":"chess","k":"Game","n":"Review a game","u":"chess/#go-review","d":"Every move graded, with an evaluation graph and the engine's preferred move."},{"s":"chess","k":"Game","n":"Play the coaches","u":"chess/#go-ai","d":"Seven levels, from Pip warming up to all three coaches thinking together. Can you beat them?"},{"s":"chess","k":"Game","n":"Who is this player?","u":"chess/#go-who","d":"Clues appear on their own. Buzz when you know the grandmaster."},{"s":"chess","k":"Game","n":"Play a friend","u":"chess/#go-online","d":"Share a room code, pick a clock and play live. Resign, offer a draw, rematch and review the game after."},{"s":"chess","k":"Game","n":"Human bar","u":"chess/#go-hbar","d":"Drag the evaluation bar to where Stockfish puts the position. The closest guess scores most."},{"s":"chess","k":"Game","n":"Spot the tactic","u":"chess/#go-tact","d":"Tap every piece you could win for free before the clock runs out."},{"s":"chess","k":"Game","n":"Endgame verdict","u":"chess/#go-endg","d":"Win, draw or lose with best play? Call it, then play it out against Stockfish."},{"s":"chess","k":"Game","n":"Blindfold memory","u":"chess/#go-blind","d":"A position flashes up, then vanishes. Rebuild every piece from memory."},{"s":"football","k":"Page","n":"Games","u":"football/#games","d":"Every football game in one place"},{"s":"football","k":"Page","n":"Leaderboard","u":"football/#games-all-leagues-boards","d":"Seasons and all-time Elo"},{"s":"football","k":"Page","n":"Ranked online","u":"football/#games-all-leagues-ranked","d":"Play real people for Elo"},{"s":"football","k":"Page","n":"Weekly tournament","u":"football/#games-all-leagues-weekly","d":"Predict this week's real scores"},{"s":"football","k":"Page","n":"Live scores","u":"football/#games-all-leagues-live","d":"Today's matches"},{"s":"football","k":"Page","n":"Our model","u":"football/#lab","d":"How the prediction model works"},{"s":"football","k":"Page","n":"Title race","u":"football/#lab-premier-league-race","d":"Who wins the league"},{"s":"football","k":"Page","n":"Time machine","u":"football/#lab-premier-league-replay","d":"A season replayed beside the model"},{"s":"football","k":"Page","n":"Profile","u":"football/#profile","d":"Your stats, badges and friends"},{"s":"football","k":"Page","n":"Sticker album","u":"football/#album","d":"Collect every club and player"},{"s":"football","k":"Page","n":"Settings","u":"football/#settings","d":"Look, sidekick and sound"},{"s":"basketball","k":"Page","n":"Games","u":"basketball/#games","d":"Every basketball game in one place"},{"s":"basketball","k":"Page","n":"Leaderboard","u":"basketball/#games-nba-boards","d":"Seasons and all-time Elo"},{"s":"basketball","k":"Page","n":"Ranked online","u":"basketball/#games-nba-ranked","d":"Play real people for Elo"},{"s":"basketball","k":"Page","n":"Our model","u":"basketball/#lab","d":"How the NBA model works"},{"s":"basketball","k":"Page","n":"Profile","u":"basketball/#profile","d":"Your stats, badges and friends"},{"s":"basketball","k":"Page","n":"Settings","u":"basketball/#settings","d":"Look, sidekick and sound"},{"s":"chess","k":"Page","n":"Games","u":"chess/#go-games","d":"Every chess game"},{"s":"chess","k":"Page","n":"Daily challenges","u":"chess/#go-daily","d":"A puzzle, a bar and a tactic every day"},{"s":"chess","k":"Page","n":"Learn","u":"chess/#go-learn","d":"Lessons, openings, endgames"},{"s":"chess","k":"Page","n":"Opening explorer","u":"chess/#go-explorer","d":"Master games for any opening"},{"s":"chess","k":"Page","n":"Endgame trainer","u":"chess/#go-et","d":"Seven endings against Stockfish"},{"s":"chess","k":"Page","n":"Guess the famous game","u":"chess/#go-famous","d":"Replay the classics move by move"},{"s":"chess","k":"Page","n":"Weekly cup","u":"chess/#go-wk","d":"Five puzzles, the same for everyone"},{"s":"chess","k":"Page","n":"Puzzle rush","u":"chess/#go-rush","d":"Three minutes, as many puzzles as you can"},{"s":"chess","k":"Page","n":"Practise my mistakes","u":"chess/#go-mypz","d":"Your own blunders as puzzles"},{"s":"chess","k":"Page","n":"Opening repertoire","u":"chess/#go-rep","d":"Drill opening lines with spaced repetition"},{"s":"chess","k":"Page","n":"World rankings","u":"chess/#go-rank","d":"The FIDE top 100"},{"s":"chess","k":"Page","n":"Championships","u":"chess/#go-champ","d":"World titles and the current match"},{"s":"chess","k":"Page","n":"Simulate a match","u":"chess/#go-sim","d":"Anyone against anyone, 1,000 games"},{"s":"chess","k":"Page","n":"Leaderboards","u":"chess/#go-board","d":"Best scores"}];
/* Search across all three sports (each build includes this file after site_index.js).
   - Football and basketball keep their own search (games, pages, players, clubs) and now also list matching games and pages
     from the other two sports, labelled by sport.
   - Chess gets a Search button in its header that finds games and pages in all three sports.
   - Chess pages can be opened from a link (chess/#go-<page>), which is what the search results use. */
const SPORT_HERE = /basketball/.test(location.pathname) ? "basketball" : /chess/.test(location.pathname) ? "chess" : "football";
const SPORT_ICON = { football: "⚽", basketball: "🏀", chess: "♞" };
const siteHits = (q, others) => { const n = (q || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); if (n.length < 2 || typeof SITE_INDEX === "undefined") return []; return SITE_INDEX.filter((x) => (!others || x.s !== SPORT_HERE) && (x.n + " " + x.d).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(n)); };
const siteGo = (x) => { const base = location.pathname.replace(/(football|basketball|chess)\/[^/]*$/, ""); location.href = base + x.u; };
setTimeout(() => {
  if (typeof searchItems !== "function") return; const prev = searchItems;
  try { searchItems = function (q) { const own = prev(q); const more = siteHits(q, true).slice(0, 6).map((x) => ({ ic: `<span style="font-size:18px">${SPORT_ICON[x.s]}</span>`, name: x.n, sub: `${x.k} · ${x.s[0].toUpperCase() + x.s.slice(1)}`, fn: () => siteGo(x) })); return own.slice(0, 12 - Math.min(more.length, 4)).concat(more).slice(0, 14); }; } catch (e) { /* keep the old search */ }
}, 0);
/* chess: a Search button and a simple search box over the whole index */
if (SPORT_HERE === "chess") {
  const openSS = () => {
    if (document.getElementById("ssBox")) return; const el = document.createElement("div"); el.id = "ssBox"; el.innerHTML = `<div class="ssIn" role="dialog" aria-label="Search"><input id="ssQ" placeholder="Search games and pages in every sport…" aria-label="Search" autocomplete="off"><div id="ssRes"></div><div class="fine">↑ ↓ to move · Enter to open · Esc to close</div></div>`; document.body.appendChild(el);
    let sel = 0, items = []; const paint = () => { const q = document.getElementById("ssQ").value; items = q.trim().length < 2 ? SITE_INDEX.filter((x) => x.s === "chess").slice(0, 10) : siteHits(q, false).sort((a, b) => (a.s === "chess" ? -1 : 0) - (b.s === "chess" ? -1 : 0)).slice(0, 14); sel = Math.min(sel, Math.max(0, items.length - 1));
      document.getElementById("ssRes").innerHTML = items.length ? items.map((x, i) => `<button type="button" class="ssR ${i === sel ? "on" : ""}" data-ss="${i}"><span>${SPORT_ICON[x.s]}</span><b>${esc(x.n)}</b><small>${esc(x.k)}${x.s !== "chess" ? " · " + x.s : ""} · ${esc(x.d)}</small></button>`).join("") : '<div class="fine" style="padding:12px">Nothing found.</div>'; };
    const close = () => el.remove(), pick = (i) => { const x = items[i]; if (!x) return; close(); siteGo(x); };
    el.addEventListener("click", (e) => { const b = e.target.closest("[data-ss]"); if (b) pick(+b.dataset.ss); else if (e.target === el) close(); });
    const q = document.getElementById("ssQ"); q.addEventListener("input", () => { sel = 0; paint(); }); q.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paint(); } else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); } else if (e.key === "Enter") pick(sel); else if (e.key === "Escape") close(); });
    paint(); q.focus();
  };
  const addBtn = () => { const bar = document.querySelector(".bar"); if (!bar || document.getElementById("ssBtn")) return; const ref = bar.querySelector("#sndBtn") || bar.lastElementChild; const b = document.createElement("button"); b.id = "ssBtn"; b.type = "button"; b.className = "pill"; b.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg> Search'; b.onclick = openSS; ref.parentNode.insertBefore(b, ref); };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", addBtn); else setTimeout(addBtn, 0);
  addEventListener("keydown", (e) => { if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openSS(); } });
  const deep = () => { const m = /^#go-([a-z]+)$/.exec(location.hash); if (m && typeof GO !== "undefined" && GO[m[1]]) { try { live = null; clearInterval(st.timer); } catch (e) { /* not started */ } GO[m[1]](); history.replaceState(null, "", location.pathname); } };
  setTimeout(deep, 700); addEventListener("hashchange", deep);
  const s = document.createElement("style"); s.textContent = `#ssBox{position:fixed;inset:0;z-index:9800;background:#0009;display:flex;justify-content:center;align-items:flex-start;padding:10vh 16px 16px}.ssIn{width:min(560px,100%);background:var(--panel,#fff);color:var(--ink);border:1px solid var(--line);border-radius:18px;padding:12px;box-shadow:0 30px 70px -20px #000}
#ssQ{width:100%;box-sizing:border-box;font:600 18px inherit;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:var(--panel2,#fff);color:var(--ink)}#ssRes{display:flex;flex-direction:column;gap:4px;margin:10px 0;max-height:60vh;overflow:auto}
.ssR{display:grid;grid-template-columns:28px 1fr;grid-template-rows:auto auto;column-gap:8px;text-align:left;padding:8px 10px;border-radius:10px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}.ssR span{grid-row:1/3;font-size:20px;align-self:center}.ssR small{opacity:.7;font-size:12px}.ssR.on,.ssR:hover{background:color-mix(in srgb,var(--gold,#c79a3a) 16%,transparent)}`; document.head.appendChild(s);
}

const $ = (s, r = document) => r.querySelector(s), esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const rnd = (a) => a[Math.floor(Math.random() * a.length)], shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const store = { get(k, d) { try { const v = localStorage.getItem("bkc_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem("bkc_" + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } } };
const M = DATA.model, S = M.summary, GAMES = M.games, OPEN = DATA.openings, PLAYERS = DATA.players, E = DATA.elite, EV = DATA.evals, PZ = DATA.puzzles, EM = DATA.eliteMoves;
const PIECE = { wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙", bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟" };
const ordn = (k) => k + (["th", "st", "nd", "rd"][k % 10 > 3 || (k > 10 && k < 14) ? 0 : k % 10]);
const pct = (v, d = 1) => (Math.round(v * 10 ** (d + 2)) / 10 ** d).toFixed(d) + "%";
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const nice = (n) => { const m = /^(.+?),\s*(.+)$/.exec(n || ""); return m ? m[2] + " " + m[1] : n; };
/* ---------- icons: small line drawings so the page reads as a game, not a data sheet ---------- */
const P_ = { trophy: "M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0V2Z", target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", bolt: "M13 2 3 14h9l-1 8 10-12h-9l1-8Z", book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z", chart: "M3 3v18h18M7 15v3M12 9v9M17 5v13", clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2", crown: "M2 18 4 7l5 5 3-8 3 8 5-5 2 11ZM4 21h16", bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z", puzzle: "M19.4 13a2 2 0 0 0-2.4-2.2V8a1 1 0 0 0-1-1h-2.8A2 2 0 1 0 9.4 5.2V4H4v5.2h1.2A2 2 0 1 1 5.2 13H4v7h7v-1.2a2 2 0 1 1 4 0V20h5v-5.2a2 2 0 0 0-.6-1.8Z", robot: "M12 8V4M8 2h8M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2ZM9 14h.01M15 14h.01M2 14h1M21 14h1", eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", warn: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01", arrow: "M5 12h14M12 5l7 7-7 7", compass: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM16 8l-2 6-6 2 2-6 6-2Z", brain: "M9.5 2A2.5 2.5 0 0 0 7 4.5 3 3 0 0 0 4 7.5c0 1 .5 1.800 1.200 2.400A3 3 0 0 0 4 12.500a3 3 0 0 0 1.500 2.600A3 3 0 0 0 8 19a3 3 0 0 0 4 1V4.500A2.500 2.500 0 0 0 9.500 2ZM14.500 2A2.500 2.500 0 0 1 17 4.500a3 3 0 0 1 3 3c0 1-.500 1.800-1.200 2.400A3 3 0 0 1 20 12.500a3 3 0 0 1-1.500 2.600A3 3 0 0 1 16 19a3 3 0 0 1-4 1", user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", flag: "M4 22V4M4 4h12l-2 4 2 4H4", swords: "M14.500 17.500 3 6V3h3l11.500 11.500M13 19l6-6M16 16l4 4M19 21l2-2M14.500 6.500 18 3h3v3l-3.500 3.500M5 14l4 4M7 17l-3 3M3 19l2 2" };
const ic = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${P_[n] || P_.target}"/></svg>`;
const paintSnd = () => { $("#sndBtn").innerHTML = `<svg class="ic" viewBox="0 0 24 24"><path d="${Snd.on ? "M11 5 6 9H2v6h4l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" : "M11 5 6 9H2v6h4l5 4V5ZM22 9l-6 6M16 9l6 6"}"/></svg>${Snd.on ? "Sound" : "Muted"}`; };
$("#logo").innerHTML = ic("crown"); $("#compass").innerHTML = ic("compass");
let st = {};
/* ---------- the board (drawn, and clickable when a game needs moves) ---------- */
function boardHTML(c, o = {}) {
  const b = c.board(), order = o.flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]; let h = "";
  order.forEach((r, ri) => order.forEach((f, fi) => { const p = b[r][f], sq = "abcdefgh"[f] + (8 - r), own = o.play && p && o.color && p.color === o.color;
    h += `<i data-sq="${sq}" ${own ? 'data-own="1"' : ""} class="${(r + f) % 2 ? "d" : "l"} ${o.sel === sq ? "sel" : ""} ${o.targets && o.targets.includes(sq) ? "tgt" : ""} ${o.caps && o.caps.includes(sq) ? "cap" : ""} ${o.last && o.last.includes(sq) ? "last" : ""}">${p ? `<b class="pcz pc-${p.color}${p.type}"></b>` : ""}${fi === 0 ? `<span class="co r">${8 - r}</span>` : ""}${ri === 7 ? `<span class="co f">${"abcdefgh"[f]}</span>` : ""}</i>`; }));
  return `<div class="board ${o.play ? "play" : ""}" id="bd">${h}</div>`;
}
const fenOf = (sans) => { const c = new Chess(); for (const s of sans) if (!c.move(s)) break; return c; };
const sideName = (c) => (c.turn() === "w" ? "White" : "Black");
/* ---------- difficulty ---------- */
const DIFFS = [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"], ["elite", "Elite"]];
const DNOTE = { easy: "The famous names, the best-known openings, clear favourites and puzzles up to about 1300.", medium: "Well-known players and openings, puzzles from 1200 to 1800.", hard: "Deeper names, rarer openings, close games, puzzles from 1700 to 2200 and more answer choices.", elite: "Deep cuts: lesser-known players and openings, near coin-flip games, puzzles over 2100 and six answer choices." };
let DIFF = store.get("diff", "medium"); if (!DNOTE[DIFF]) DIFF = "medium";
const diffBar = () => `<div class="chips" role="group" aria-label="Difficulty">${DIFFS.map(([k, n]) => `<button class="chip ${DIFF === k ? "on" : ""}" data-diff="${k}" type="button">${n}</button>`).join("")}</div><p class="fine" id="dnote">${DNOTE[DIFF]}</p>`;
const dpick = (a, b, c, d) => ({ easy: a, medium: b, hard: c, elite: d })[DIFF];
/* ---------- the games, grouped like the other sports ---------- */
const CG = [
  { id: "call", g: "model", ic: "target", name: "Call it", modes: "Solo, against the model", tag: "Two ratings and a time control: who wins, and how long does it last?", best: "call" },
  { id: "elite", g: "model", ic: "trophy", name: "Predict who won", modes: "Solo, against the model", tag: "Real games from the biggest events. Pick the result against the model.", best: "elite" },
  { id: "next", g: "bk", ic: "arrow", name: "Guess the next move", modes: "Solo streak", tag: "A position from a real top-level game. Which move did the player choose?", best: "next" },
  { id: "recog", g: "bk", ic: "eye", name: "Recognize the game", modes: "Solo streak", tag: "The first moves of a real game. Who was playing?", best: "recog" },
  { id: "blunder", g: "bk", ic: "warn", name: "Blunder or fine?", modes: "Solo streak", tag: "A move, graded by Stockfish. Blunder, mistake, inaccuracy or fine?", best: "blunder" },
  { id: "open", g: "bk", ic: "book", name: "Name the opening", modes: "Solo streak", tag: "A position on the board. Sicilian, Ruy Lopez, King's Indian?", best: "open" },
  { id: "trainer", g: "bk", ic: "bulb", name: "Pip's opening gym", modes: "Solo vs Pip", tag: "Pip plays a random opening and you get a random colour. Play the best lines: slip, and Pip stops you and shows the move.", best: "trainer" },
  { id: "mate", g: "bk", ic: "bolt", name: "Mate puzzles", modes: "Solo streak", tag: "Real puzzles: checkmate in 1, 2 or 3.", best: "mate" },
  { id: "elo", g: "bk", ic: "brain", name: "Estimate my Elo", modes: "Solo · 10 puzzles", tag: "Puzzles that adapt to you, then an estimate of your level.", best: "elo" },
  { id: "review", g: "bk", ic: "chart", name: "Review a game", modes: "Paste a PGN or use a real game", tag: "Every move graded, with an evaluation graph and the engine's preferred move.", best: "none" },
  { id: "ai", g: "bk", ic: "robot", name: "Play the coaches", modes: "Solo vs Pip, Bea or Vera", tag: "Seven levels, from Pip warming up to all three coaches thinking together. Can you beat them?", best: "ai_rec" },
  { id: "who", g: "bk", ic: "user", name: "Who is this player?", modes: "Solo · 5 rounds", tag: "Clues appear on their own. Buzz when you know the grandmaster.", best: "who", faces: true },
  { id: "online", g: "bk", ic: "user", name: "Play a friend", modes: "2 players · two devices", tag: "Share a room code, pick a clock and play live. Resign, offer a draw, rematch and review the game after.", best: "none" },
  { id: "hbar", g: "bk", ic: "chart", name: "Human bar", modes: "Solo · 5 positions", tag: "Drag the evaluation bar to where Stockfish puts the position. The closest guess scores most.", best: "hbar" },
  { id: "tact", g: "bk", ic: "target", name: "Spot the tactic", modes: "Solo · 6 positions, timed", tag: "Tap every piece you could win for free before the clock runs out.", best: "tact" },
  { id: "endg", g: "bk", ic: "crown", name: "Endgame verdict", modes: "Solo · 5 endgames", tag: "Win, draw or lose with best play? Call it, then play it out against Stockfish.", best: "endg" },
  { id: "blind", g: "bk", ic: "eye", name: "Blindfold memory", modes: "Solo · 5 boards", tag: "A position flashes up, then vanishes. Rebuild every piece from memory.", best: "blind" },
];
const CGALL = CG.map((x) => ({ ...x })), VERSOF = {}, VERSNAME = {};
[{ lead: "next", name: "Position quiz", tag: "Four ways to read a real position: the next move, who played it, blunder or fine, or the opening's name.", vers: [["next", "Next move"], ["recog", "Who played it"], ["blunder", "Blunder or fine?"], ["open", "Name the opening"]] },
 { lead: "mate", name: "Puzzles", tag: "Real Lichess puzzles: checkmate in 1, 2 or 3, or let ten puzzles estimate your level.", vers: [["mate", "Mate puzzles"], ["elo", "Estimate my Elo"]] },
 { lead: "call", name: "Call it", tag: "Predict a result against the model: from two ratings, or from the real games of the biggest events.", vers: [["call", "From ratings"], ["elite", "Real games"]] }].forEach((g) => {
  const lead = CG.find((x) => x.id === g.lead); g.vers.forEach(([id, l]) => { VERSOF[id] = g; VERSNAME[id] = l; });
  g.vers.forEach(([id]) => { if (id !== g.lead) CG.splice(CG.findIndex((x) => x.id === id), 1); }); lead.name = g.name; lead.tag = g.tag; lead.modes = g.vers.length + " versions";
});
const faces = (n) => shuffle(PLAYERS.filter((p) => p.img).slice(0, 60)).slice(0, n).map((p) => `<img class="pf" src="${esc(p.img.replace("http://", "https://"))}?width=120" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`).join("");
const recLine = (x) => { if (x.id === "ai") { const r = store.get("ai_rec", null); return r ? `record ${r.w}-${r.d}-${r.l}` : "not played yet"; } const b = bestOf(x.best); return b ? `best ${b}` : "not played yet"; };
function wallHTML() { const tiles = PLAYERS.filter((p) => p.img).slice(0, 30).map((p) => `<img class="wt" src="${esc(p.img.replace("http://", "https://"))}?width=120" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`); return [0, 1, 2].map((r) => { const list = tiles.filter((_, i) => i % 3 === r); return `<div class="wrow ${r === 1 ? "rev" : ""}">${list.concat(list).join("")}</div>`; }).join(""); }
function cuRun(root) {
  const els = (root || document).querySelectorAll(".cu[data-to]"); if (!els.length || matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.getAttribute("data-perf") === "low") return;
  const run = (el) => { const end = +el.dataset.to, dec = +(el.dataset.dec || 0), suf = el.dataset.suf || "", t0 = performance.now(), step = (now) => { const k = Math.min(1, (now - t0) / 1100), e = 1 - Math.pow(1 - k, 3), v = end * e; el.textContent = (dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-US")) + suf; if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  const io = new IntersectionObserver((es) => { es.forEach((x) => { if (x.isIntersecting) { io.disconnect(); els.forEach(run); } }); }, { threshold: 0.4 }); io.observe(els[0].parentElement.parentElement);
}
let sy = false; addEventListener("scroll", () => { if (sy) return; sy = true; requestAnimationFrame(() => { document.documentElement.style.setProperty("--sy", Math.min(scrollY, 800)); sy = false; }); }, { passive: true });
function home() {
  try { CH.v = "home"; cpClose(); RKS.prof = null; } catch (e) { /* not set up yet */ }
  rvStop(); olClose(); clearInterval(st.timer); live = null; st = {}; $("#app").innerHTML = `<div class="hero"><div class="wall" aria-hidden="true">${wallHTML()}</div><div class="sec" style="margin-top:0">${ic("crown")}Chess, predicted and played</div><h1>ball<em>knowledge</em></h1><p class="sub" style="font-size:17px;max-width:600px">Out-call a model on real games, guess a grandmaster's next move, solve puzzles and test your level. Everything comes from real data; nothing is made up.</p>
    <div class="statstrip" id="statstrip"><div><b class="cu" data-to="${PZ.length}">${PZ.length}</b><span>real puzzles</span></div><div><b class="cu" data-to="${EM.length}">${EM.length}</b><span>top-level games</span></div><div><b class="cu" data-to="${PLAYERS.length}">${PLAYERS.length}</b><span>players profiled</span></div><div><b class="cu" data-to="${Math.round(S.acc * 1000) / 10}" data-dec="1" data-suf="%">${pct(S.acc, 1)}</b><span>model accuracy</span></div></div>
    <div class="doors"><button class="door" data-go="games"><div class="di">${ic("puzzle")}</div><div class="dname">Games</div><div class="dtag">The originals, Beat the model and the daily challenges, all in one place.</div></button><button class="door" data-go="learn"><div class="di">${ic("book")}</div><div class="dname">Learn</div><div class="dtag">An opening explorer with master games and fun facts, and short lessons with your coach.</div></button><button class="door" data-go="review"><div class="di">${ic("eye")}</div><div class="dname">Game review</div><div class="dtag">Your own games from Lichess or chess.com, or any PGN, graded move by move by Stockfish 17 with your coach.</div></button><button class="door" data-go="model"><div class="di">${ic("chart")}</div><div class="dname">Our model</div><div class="dtag">How it works, how good it really is, and a lookup for any player or tournament.</div></button>${(RK.lists.open || []).length ? `<button class="door" data-go="rank"><div class="di">${ic("chart")}</div><div class="dname">World rankings</div><div class="dtag">The FIDE top 100, men and women, classical, rapid and blitz. Tap anyone for their profile.</div></button>` : ""}<button class="door" data-go="champ"><div class="di">${ic("crown")}</div><div class="dname">Championships</div><div class="dtag">Firouzja's Total Chess title, the World Championship match from 24 November, women's titles and the reigning champions.</div></button><button class="door" data-go="board"><div class="di">${ic("trophy")}</div><div class="dname">Leaderboards</div><div class="dtag">Best scores from signed-in players, for every game.</div></button></div></div>`;
  cuRun($("#app"));
}
function hub(g) {
  clearInterval(st.timer); live = null; st = { hub: g }; const ord = Usage.order(CG.filter((x) => x.g === g && x.id !== "review"), "ch"), list = ord.list;   // the review has its own door now
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="games">← Games</button></div><h2 style="font-size:32px">${ic(g === "model" ? "target" : "puzzle")}${g === "model" ? "Beat the model" : "ballknowledge originals"}</h2><p class="sub">${g === "model" ? `Real games and a model that never saw them. On everyday games it picks ${pct(S.acc)} of results right (always White: ${pct(S.white)}).` : "Pick a difficulty, then a game."}</p>${diffBar()}<div class="hubgrid">${list.map((x, k) => `<button class="gcard" data-intro="${x.id}" style="animation-delay:${k * 50}ms"><div class="gi">${x.faces ? faces(3) : `<div class="di">${ic(x.ic)}</div>`}</div>${x.id === ord.fav ? '<span class="gfav">Your go-to</span>' : x.id === ord.next ? '<span class="gfav try">Try next</span>' : ""}<div class="gname">${x.name}</div><div class="gmodes">${x.modes}</div><div class="gtag">${x.tag}</div><div class="grec">${recLine(x)}</div></button>`).join("")}</div>`;
}
function intro(id) {
  const x0 = CGALL.find((y) => y.id === id), gp = VERSOF[id], x = gp ? { ...x0, name: VERSNAME[id] } : x0; clearInterval(st.timer); live = null; st = { hub: x.g, intro: id };
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-hub="${x.g}">← Back</button></div><div class="card"><h2>${ic(x.ic)}${x.name}</h2><p class="sub">${x.tag}</p>${gp ? `<div class="chips" role="group" aria-label="Version">${gp.vers.map(([vid, l]) => `<button class="chip ${vid === id ? "on" : ""}" data-intro="${vid}" type="button">${l}</button>`).join("")}</div>` : ""}${id === "ai" || id === "online" ? "" : diffBar()}${id === "ai" ? `<p class="fine">Pick the AI's level inside the game.</p>` : ""}<div class="row"><button class="btn" data-go="${id}">Start</button><span class="fine">${recLine(x)}</span></div></div>`;
}
/* every game screen gets a back button to where it was opened from (the daily challenges, or its games section) */
const chBack = () => { try { const g = st && st.game; if (!g || ["et", "fg", "egm", "fgm", "rush", "rushm", "mypz", "mypzm", "rep", "repm"].includes(g)) return ""; if (st.daily) return `<div class="crumbs chback"><button class="btn ghost" data-go="daily">← Daily challenges</button></div>`; const x = (typeof CG !== "undefined" ? CG : []).find((c) => c.id === g); return x ? `<div class="crumbs chback"><button class="btn ghost" data-hub="${x.g}">← ${x.g === "model" ? "Beat the model" : "Games"}</button></div>` : `<div class="crumbs chback"><button class="btn ghost" data-go="games">← Games</button></div>`; } catch (e) { return ""; } };
const backRow = (title, i, extra = "") => `${chBack()}<div class="row" style="justify-content:space-between"><h2>${ic(i)}${title}</h2><span class="fine">${extra}</span></div>`;
const bestOf = (k) => store.get("best_" + k, 0), bump = (k, v) => { if (v > bestOf(k)) { store.set("best_" + k, v); Cloud.submit(k, v); } };
/* ---------- Call it (rating model, Lichess sample) ---------- */
const LEN = ["Short (under 30 moves)", "Medium (30 to 50)", "Long (over 50 moves)"], lenOf = (p) => (p < 60 ? 0 : p < 100 ? 1 : 2), RES = ["Black wins", "Draw", "White wins"];
function callStart() { const gap = (x) => Math.abs(x[0] - x[1]), pool = GAMES.filter((x) => (DIFF === "easy" ? gap(x) >= 200 && gap(x) <= 500 : DIFF === "medium" ? gap(x) >= 90 && gap(x) < 250 : DIFF === "hard" ? gap(x) >= 30 && gap(x) < 120 : gap(x) < 50)); st = { game: "call", items: shuffle(pool.length >= 20 ? pool : GAMES.filter((x) => gap(x) <= 400)).slice(0, 5), i: 0, you: 0, mod: 0, pick: null, len: null, phase: "ask" }; callRender(); }
function callRender() {
  const s = st, g = s.items[s.i], [we, be, res, base, inc, speed, plies, eco, opening, pw, pd, pb, pl, term] = g;
  const hud = `<div class="row" style="justify-content:space-between"><b>Game ${s.i + 1} of 5</b><span class="fine">You ${s.you} · Model ${s.mod}</span></div>`;
  const head = `<div class="players"><div class="side w"><span class="sq"></span><b>White</b><div class="big">${we}</div></div><div class="vs">${ic("clock")}<br>${speed}<br>${base / 60 >= 1 ? base / 60 + " min" : base + " s"}${inc ? " + " + inc + " s" : ""}</div><div class="side b"><span class="sq"></span><b>Black</b><div class="big">${be}</div></div></div>`;
  if (s.phase === "ask") { $("#app").innerHTML = `<div class="card">${hud}${backRow("Call it", "target")}<p class="sub">A real rated game from Lichess you have not seen. Who wins, and how long does it last?</p>${head}<h3>${ic("flag")}Result</h3><div class="opts">${RES.map((r, k) => `<button class="opt ${s.pick === k ? "sel" : ""}" data-r="${k}">${r}</button>`).join("")}</div><h3>${ic("clock")}Length</h3><div class="opts">${LEN.map((r, k) => `<button class="opt ${s.len === k ? "sel" : ""}" data-l="${k}">${r}</button>`).join("")}</div><div class="row"><button class="btn" id="lock" ${s.pick != null && s.len != null ? "" : "disabled"}>Lock it in</button></div></div>`; return; }
  const realR = res === 1 ? 2 : res === 0 ? 0 : 1, realL = lenOf(plies), mR = [pb, pd, pw].indexOf(Math.max(pb, pd, pw)), mL = pl.indexOf(Math.max(...pl)), y = (s.pick === realR ? 2 : 0) + (s.len === realL ? 1 : 0), m = (mR === realR ? 2 : 0) + (mL === realL ? 1 : 0);
  $("#app").innerHTML = `<div class="card">${hud}${head}<div class="card" style="background:var(--panel)"><div class="label fine">Real result</div><h3 style="margin-top:2px">${RES[realR]}, ${Math.round(plies / 2)} moves${term === "Time forfeit" ? " (on time)" : ""}</h3><p class="fine">${esc(opening || eco)}</p><div class="bar2"><b class="b" style="width:${pb * 100}%"></b><b class="dr" style="width:${pd * 100}%"></b><b class="w" style="width:${pw * 100}%"></b></div><p class="fine" style="margin-top:6px">Model: White ${Math.round(pw * 100)}% · Draw ${Math.round(pd * 100)}% · Black ${Math.round(pb * 100)}%</p><div class="tiles"><div class="tile"><small>You</small><b>+${y}</b><span class="fine">${RES[s.pick]}, ${LEN[s.len].split(" ")[0].toLowerCase()}</span></div><div class="tile"><small>Model</small><b>+${m}</b><span class="fine">${RES[mR]}, ${LEN[mL].split(" ")[0].toLowerCase()}</span></div></div></div><div class="row" style="margin-top:12px"><button class="btn" id="next">${s.i >= 4 ? "See the final score" : "Next game"}</button></div></div>`;
  s.y = y; s.m = m;
}
function callLock() { const s = st, g = s.items[s.i], res = g[2], realR = res === 1 ? 2 : res === 0 ? 0 : 1; s.you += (s.pick === realR ? 2 : 0) + (s.len === lenOf(g[6]) ? 1 : 0); s.mod += ([g[11], g[10], g[9]].indexOf(Math.max(g[9], g[10], g[11])) === realR ? 2 : 0) + (g[12].indexOf(Math.max(...g[12])) === lenOf(g[6]) ? 1 : 0); s.phase = "reveal"; callRender(); }
function finish(title, you, mod, outOf, key, again) { bump(key, you); $("#app").innerHTML = `<div class="card"><h2>${ic("trophy")}${you > mod ? "You beat the model" : you === mod ? "A tie with the model" : "The model won"}</h2><div class="tiles"><div class="tile"><small>You, of ${outOf}</small><b>${you}</b></div><div class="tile"><small>Model</small><b>${mod}</b></div><div class="tile"><small>Your best</small><b>${bestOf(key)}</b></div></div><div class="row"><button class="btn" data-go="${again}">Play again</button><button class="btn ghost" data-go="home">Menu</button></div></div>`; }
function callNext() { const s = st; if (s.i >= 4) return finish("Call it", s.you, s.mod, 15, "call", "call"); s.i++; s.pick = null; s.len = null; s.phase = "ask"; callRender(); }
/* ---------- Predict who won (elite games) ---------- */
function eliteStart() {
  const gap = (x) => Math.abs(x.we - x.be), ok = (x) => (DIFF === "easy" ? gap(x) >= 100 : DIFF === "medium" ? gap(x) >= 40 && gap(x) < 140 : DIFF === "hard" ? gap(x) < 90 : gap(x) < 35);
  const all = E.games.filter((g) => g.moves && g.moves.length >= 44); let pool = all.filter(ok); if (pool.length < 6) pool = all;
  st = { game: "elite", items: shuffle(pool).slice(0, 3), i: 0, you: 0, mod: 0 }; eliteGame();
}
const CHK = [0, 20, 40], PTS = [3, 2, 1], leanOf = (ev) => (ev > 0.5 ? 2 : ev < -0.5 ? 0 : 1);
function eliteGame() {
  clearInterval(st.timer); const g = st.items[st.i]; Object.assign(st, { g, stage: 0, ply: 0, picks: [null, null, null], mpicks: [null, null, null], evs: [0, 0, 0], done: false });
  live = { c: new Chess(), color: "w", watch: true, sel: null, targets: [], last: null, lock: true, refresh() {}, onMove() {} }; st.mpicks[0] = g.p.indexOf(Math.max(...g.p)) === 0 ? 2 : g.p.indexOf(Math.max(...g.p)) === 1 ? 1 : 0; $("#app").className = "fresh"; eliteAsk();
}
function eliteBars() {
  const g = st.g, c = live.c, face = (n) => { const b = PBIO[norm(nice(n))]; return b && b.img ? `<img class="photo" style="width:34px;height:34px;border-width:2px" src="${esc(b.img.replace("http://", "https://"))}?width=80" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ic("user"); };
  const bar = (n, r, col) => `<div class="pbar"><div class="av" style="overflow:hidden">${face(n)}</div><div class="nm"><span><b>${esc(nice(n))}</b><small>${r}</small></span><span>${matHTML(c, col)}</span></div></div>`;
  return { top: bar(g.black, g.be, "b"), bottom: bar(g.white, g.we, "w") };
}
function eliteAsk() {
  const g = st.g, s = st.stage, ev = evalPos(live.c) / 100, mv = Math.ceil(st.ply / 2), pickRow = (cur) => `<div class="opts">${RES.map((r, k) => `<button class="opt ${cur === k ? "sel" : ""}" data-ep="${k}">${r}</button>`).join("")}</div>`;
  if (s > 0) { st.evs[s] = ev; st.mpicks[s] = leanOf(ev); }
  const top = `${chBack()}<div class="row" style="justify-content:space-between"><h2>${ic("trophy")}Predict who won</h2><span class="fine">Game ${st.i + 1} of 3 · you ${st.you} · model ${st.mod}</span></div><p class="fine" style="margin:0">${esc(g.event)}${/^\d{4}-/.test(g.date) ? " · " + esc(g.date) : ""}</p>`;
  const msg = s === 0 ? `<p class="sub">Before a single move: who wins? A correct call now is worth <b>3 points</b>.</p>${pickRow(st.picks[0])}<p class="fine">The model gives White ${Math.round(g.p[0] * 100)}%, Draw ${Math.round(g.p[1] * 100)}%, Black ${Math.round(g.p[2] * 100)}% (it never trained on this game).</p>` : `<p class="sub"><b>Move ${mv}.</b> The engine's evaluation: <b>${ev > 0 ? "White +" + ev.toFixed(1) : ev < 0 ? "Black +" + (-ev).toFixed(1) : "equal"}</b>. Who wins now? Worth <b>${PTS[s]} point${PTS[s] === 1 ? "" : "s"}</b>.</p>${pickRow(st.picks[s])}`;
  liveRender(top, `<div class="evrow">${s > 0 ? `<div class="evbar2"><i style="width:${wcOf(ev * 100).toFixed(0)}%"></i></div>` : ""}</div>${msg}`, eliteBars());
}
function eliteRun() {
  const g = st.g; clearInterval(st.timer); const target = st.stage < 2 ? CHK[st.stage + 1] : g.moves.length;
  liveRender(`<div class="row" style="justify-content:space-between"><h2>${ic("trophy")}Predict who won</h2><span class="fine">Game ${st.i + 1} of 3 · you ${st.you} · model ${st.mod}</span></div>`, `<div class="row" style="justify-content:center;margin-top:8px"><span class="fine" id="plyTxt">Watching the game…</span><button class="btn ghost" id="eskip">Skip ahead</button></div>`, eliteBars());
  st.timer = setInterval(() => { if (st.game !== "elite") return clearInterval(st.timer); if (st.ply >= target) { clearInterval(st.timer); if (st.stage < 2) { st.stage++; return eliteAsk(); } return eliteReveal(); } const m = live.c.move(g.moves[st.ply]); live.last = [m.from, m.to]; Snd.move(m, live.c); st.ply++; liveRender(`<div class="row" style="justify-content:space-between"><h2>${ic("trophy")}Predict who won</h2><span class="fine">Game ${st.i + 1} of 3 · you ${st.you} · model ${st.mod}</span></div>`, `<div class="row" style="justify-content:center;margin-top:8px"><span class="fine">Move ${Math.ceil(st.ply / 2)}</span><button class="btn ghost" id="eskip">Skip ahead</button></div>`, eliteBars()); }, 520);
}
function eliteReveal() {
  const g = st.g, real = g.result === "1-0" ? 2 : g.result === "0-1" ? 0 : 1; let y = 0, m = 0; for (let k = 0; k < 3; k++) { if (st.picks[k] === real) y += PTS[k]; if (st.mpicks[k] === real) m += PTS[k]; } st.you += y; st.mod += m; Snd.end(y >= m);
  const won = y > m, over = `<div class="endov ${won ? "win" : y === m ? "draw" : "loss"}">${won ? Array.from({ length: 22 }, (_, i) => `<i class="conf" style="left:${(i * 41) % 100}%;background:${["#e8c35a", "#5ee6a8", "#ff8a3d", "#fff"][i % 4]};animation-delay:${(i % 8) * 0.2}s"></i>`).join("") : ""}${endTop(won ? "win" : y === m ? "draw" : "loss")}<h3>${real === 2 ? "White won" : real === 0 ? "Black won" : "A draw"}</h3><p class="fine" style="color:#ddd">${esc(nice(g.white))} ${g.result === "1/2-1/2" ? "½-½" : g.result} ${esc(nice(g.black))} · ${Math.ceil(g.plies / 2)} moves</p><p style="margin:0">You <b>+${y}</b> · Model <b>+${m}</b></p><div class="row" style="justify-content:center"><button class="btn" id="enextg">${st.i >= 2 ? "See the final score" : "Next game"}</button></div></div>`;
  liveRender(`<div class="row" style="justify-content:space-between"><h2>${ic("trophy")}Predict who won</h2><span class="fine">Game ${st.i + 1} of 3 · you ${st.you} · model ${st.mod}</span></div>`, `<p class="fine" style="text-align:center">Your calls: ${st.picks.map((p, k) => (p == null ? "–" : RES[p].split(" ")[0]) + (p === real ? " ✓" : "")).join(" · ")}</p>`, eliteBars(), { over });
}


/* ---------- Guess the next move / Recognize the game (elite games with full moves) ---------- */
function nextStart() { st = { game: "next", streak: 0 }; nextQ(); }
function nextQ() {
  const g = rnd(EM), lo = dpick(8, 14, 20, 28), hi = dpick(26, 56, 76, 88), ply = lo + Math.floor(Math.random() * Math.max(4, Math.min(hi, g.moves.length - 2) - lo)), c = fenOf(g.moves.slice(0, ply)), real = g.moves[ply], nOpt = dpick(3, 4, 5, 6) - 1, legal = c.moves().filter((m) => m !== real);
  const plaus = legal.filter((m) => /x|\+/.test(m) || /^[NBRQ]/.test(m)), dist = shuffle(DIFF === "elite" || DIFF === "hard" ? plaus : legal).slice(0, nOpt);
  while (dist.length < nOpt && dist.length < legal.length) { const m = rnd(legal); if (!dist.includes(m)) dist.push(m); }
  const lastMv = (() => { const h = c.history({ verbose: true }); return h.length ? [h[h.length - 1].from, h[h.length - 1].to] : null; })();
  st.q = { g, ply, c, real, opts: shuffle([real, ...dist]), chosen: null, last: lastMv }; nextRender();
}
function nextRender() {
  const q = st.q, g = q.g, who = q.c.turn() === "w" ? g.white : g.black, rev = q.chosen != null;
  $("#app").innerHTML = `<div class="card">${backRow("Guess the next move", "arrow", `Streak ${st.streak} · best ${bestOf("next")}`)}<p class="sub"><b>${esc(nice(who))}</b> (${q.c.turn() === "w" ? "White" : "Black"}) is to move at move ${Math.floor(q.ply / 2) + 1}. ${esc(g.event)}, ${esc(g.date.slice(0, 4))}. What did they play?</p>${boardHTML(q.c, { flip: q.c.turn() === "b", last: q.last })}
  <div class="opts">${q.opts.map((m, k) => `<button class="opt ${rev ? (m === q.real ? "ok" : m === q.chosen ? "no" : "") : ""}" data-nm="${k}" ${rev ? "disabled" : ""}>${esc(m)}</button>`).join("")}</div>${rev ? `<div class="row"><b>${q.chosen === q.real ? "Yes!" : "It was " + esc(q.real) + "."}</b><span class="fine">${esc(nice(g.white))} v ${esc(nice(g.black))}, ${esc(g.result)}</span><button class="btn" id="nmnext">Next</button></div>` : ""}</div>`;
}
const FREQ = (() => { const m = {}; EM.forEach((g) => { m[g.white] = (m[g.white] || 0) + 1; m[g.black] = (m[g.black] || 0) + 1; }); return Object.keys(m).sort((a, b) => m[b] - m[a]); })();
function recogStart() { st = { game: "recog", streak: 0 }; recogQ(); }
function recogQ() {
  const g = rnd(EM), color = Math.random() < 0.5 ? "white" : "black", ans = g[color], k = dpick(3, 4, 5, 6) - 1, plies = dpick(20, 16, 12, 8), famous = (DIFF === "easy" ? FREQ.slice(0, 40) : DIFF === "medium" ? FREQ.slice(0, 120) : FREQ), names = shuffle(famous.filter((n) => n !== ans && n !== g[color === "white" ? "black" : "white"])).slice(0, k), c = fenOf(g.moves.slice(0, plies));
  st.q = { g, color, ans, c, plies, opts: shuffle([ans, ...names]), chosen: null }; recogRender();
}
function recogRender() {
  const q = st.q, g = q.g, rev = q.chosen != null, other = q.color === "white" ? g.black : g.white;
  $("#app").innerHTML = `<div class="card">${backRow("Recognize the game", "eye", `Streak ${st.streak} · best ${bestOf("recog")}`)}<p class="sub">The first ${q.plies / 2} moves of a real game from ${esc(g.kind)}. Who played ${q.color === "white" ? "White" : "Black"}?${rev ? ` (${esc(g.event)}, ${esc(g.date)})` : ""}</p>${boardHTML(q.c, {})}<div class="moves">${g.moves.slice(0, q.plies).map((m, i) => (i % 2 ? "" : Math.floor(i / 2) + 1 + ". ") + m).join(" ")}</div>
  <div class="opts">${q.opts.map((n, k) => `<button class="opt ${rev ? (n === q.ans ? "ok" : n === q.chosen ? "no" : "") : ""}" data-rc="${k}" ${rev ? "disabled" : ""}>${esc(nice(n))}</button>`).join("")}</div>${rev ? `<div class="row"><b>${q.chosen === q.ans ? "Yes!" : "It was " + esc(nice(q.ans)) + "."}</b><span class="fine">against ${esc(nice(other))}</span><button class="btn" id="rcnext">Next</button></div>` : ""}</div>`;
}
/* ---------- Blunder or fine? (real Stockfish evaluations from Lichess games) ---------- */
const CLS = [["blunder", "Blunder"], ["mistake", "Mistake"], ["inaccuracy", "Inaccuracy"], ["fine", "Fine"]];
function blunderStart() { st = { game: "blunder", streak: 0 }; blunderQ(); }
function blunderQ() { const ok = DIFF === "easy" ? (q) => q.cls === "blunder" || q.cls === "fine" : DIFF === "medium" ? (q) => q.cls !== "inaccuracy" : DIFF === "hard" ? () => true : (q) => q.elo >= 1900; let q; for (let k = 0; k < 60; k++) { q = rnd(EV); if (ok(q)) break; } st.q = { ...q, c: fenOf(q.moves.slice(0, -1)), chosen: null, kinds: DIFF === "easy" ? ["blunder", "fine"] : DIFF === "medium" ? ["blunder", "mistake", "fine"] : ["blunder", "mistake", "inaccuracy", "fine"] }; blunderRender(); }
function blunderRender() {
  const q = st.q, rev = q.chosen != null, side = q.c.turn() === "w" ? "White" : "Black";
  $("#app").innerHTML = `<div class="card">${backRow("Blunder or fine?", "warn", `Streak ${st.streak} · best ${bestOf("blunder")}`)}<p class="sub">${side} (a ${q.elo}-rated game) plays <b>${esc(q.san)}</b>. Stockfish checked it. How good was it?</p>${boardHTML(q.c, { flip: q.c.turn() === "b" })}<div class="opts">${CLS.filter(([k]) => q.kinds.includes(k)).map(([k, n]) => `<button class="opt ${rev ? (k === q.cls ? "ok" : k === q.chosen ? "no" : "") : ""}" data-bl="${k}" ${rev ? "disabled" : ""}>${n}</button>`).join("")}</div>
  ${rev ? `<div class="row"><b>${q.chosen === q.cls ? "Right!" : "It was " + CLS.find((x) => x[0] === q.cls)[1].toLowerCase() + "."}</b><span class="fine">The evaluation fell by ${(Math.max(0, q.loss) / 100).toFixed(1)} pawns.</span><button class="btn" id="blnext">Next</button></div>` : `<p class="fine">Blunder: loses 3+ pawns of evaluation. Mistake: 1.5 to 3. Inaccuracy: 0.7 to 1.5. Fine: under 0.25.</p>`}</div>`;
}
/* ---------- Opening quiz and trainer ---------- */
function openStart() { st = { game: "open", streak: 0 }; openNext(); }
function openNext() {
  const sorted = OPEN.slice().sort((a, b) => b.n - a.n), pool = DIFF === "easy" ? sorted.slice(0, 60) : DIFF === "medium" ? sorted.slice(0, 200) : DIFF === "hard" ? sorted : sorted.slice(-260), o = rnd(pool), fam = (n) => n.split(":")[0], same = OPEN.filter((x) => x.name !== o.name && x.eco[0] === o.eco[0]), others = shuffle(same.filter((x) => fam(x.name) !== fam(o.name))).slice(0, 2).concat(shuffle(same.filter((x) => fam(x.name) === fam(o.name))).slice(0, DIFF === "easy" ? 0 : 1));
  while (others.length < dpick(2, 3, 3, 3)) others.push(rnd(OPEN.filter((x) => x.name !== o.name && !others.includes(x))));
  st.q = { o, opts: shuffle([o, ...others.slice(0, dpick(2, 3, 3, 3))]), chosen: null, c: (() => { const c = new Chess(); c.load_pgn(o.pgn); return c; })() }; openRender();
}
function openRender() {
  const q = st.q, o = q.o, rev = q.chosen != null;
  $("#app").innerHTML = `<div class="card">${backRow("Name the opening", "book", `Streak ${st.streak} · best ${bestOf("open")}`)}${boardHTML(q.c, {})}<div class="moves">${esc(o.pgn)}</div><div class="opts">${q.opts.map((x, k) => `<button class="opt ${rev ? (x === o ? "ok" : x === q.chosen ? "no" : "") : ""}" data-o="${k}" ${rev ? "disabled" : ""}>${esc(x.name)}</button>`).join("")}</div>${rev ? `<div class="row"><b>${q.chosen === o ? "Right!" : "It was " + esc(o.name) + "."}</b><span class="fine">ECO ${esc(o.eco)} · played in ${o.n.toLocaleString()} of the sample's games</span><button class="btn" id="onext">${q.chosen === o ? "Next" : "Try again"}</button></div>` : ""}</div>`;
}
/* interactive boards: click a piece, click a square */
const Mix = Object.assign({ fx: 1, music: 0.6, voice: 0.9, say: false }, store.get("mix", {}));
const Snd = { ctx: null, master: null, mg: null, on: store.get("snd", true), mus: store.get("mus", true), timer: null, step: 0, nextT: 0,
  init() { if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return true; } try { const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = c.createGain(); const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7000; const dl = c.createDelay(); dl.delayTime.value = 0.22; const fb = c.createGain(); fb.gain.value = 0.3; const wet = c.createGain(); wet.gain.value = 0.2; this.master.connect(lp); lp.connect(c.destination); lp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(c.destination); this.mg = c.createGain(); this.mg.gain.value = 0.0001; this.mg.connect(this.master); this.remix(); return true; } catch (e) { return false; } },
  remix() { if (this.master) this.master.gain.value = this.on ? Mix.fx : 0; if (this.mg && this.timer) this.mg.gain.setTargetAtTime(Mix.music * 0.9, this.ctx.currentTime, 0.1); store.set("mix", Mix); },
  tone(f, d, v, type, when, dest) { if (!this.on || !this.init()) return; try { const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + (when || 0); o.type = type || "triangle"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v || 0.12, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + d + 0.02); } catch (e) { /* no audio */ } },
  noise(d, f0, f1, v, when) { if (!this.on || !this.init()) return; try { const c = this.ctx, t0 = c.currentTime + (when || 0), len = Math.floor(c.sampleRate * d), b = c.createBuffer(1, len, c.sampleRate), x = b.getChannelData(0); for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2); const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + d); const g = c.createGain(); g.gain.value = v; s.connect(f); f.connect(g); g.connect(this.master); s.start(t0); } catch (e) { /* no audio */ } },
  buzz(ms) { try { if (this.on && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) { /* no haptics */ } },
  /* every kind of move has its own sound, and none of them talks: a wooden tap, a sharper clack for a capture, two taps and a slide
     for castling, a rising sparkle for a promotion, a short two-note alert for check, and a deep hit with a falling chord for mate */
  tap(when = 0, pitch = 1) { this.noise(0.035, 2600 * pitch, 1300 * pitch, 0.07, when); this.tone(200 * pitch, 0.07, 0.1, "sine", when); },
  move(mv, c) {
    if (!this.on) return; const fl = (mv && mv.flags) || "", cap = mv && (mv.captured || /e/.test(fl)), castle = /[kq]/.test(fl), promo = mv && mv.promotion;
    const mate = c && c.in_checkmate && c.in_checkmate(), check = !mate && c && c.in_check && c.in_check();
    if (castle) { this.tap(0, 1); this.noise(0.16, 700, 1900, 0.025, 0.03); this.tap(0.11, 0.85); this.buzz([8, 60, 8]); }
    else if (cap) { this.noise(0.08, 3400, 900, 0.1); this.tone(140, 0.14, 0.17, "triangle"); this.tone(1250, 0.025, 0.035, "square"); this.buzz(18); }
    else { this.tap(); this.buzz(8); }
    if (promo) [523, 659, 784, 1047].forEach((f, k) => { this.tone(f, 0.16, 0.08, "sine", 0.08 + k * 0.06); if (k === 3) this.noise(0.25, 5000, 9000, 0.02, 0.26); });
    if (mate) { this.tone(82, 0.9, 0.22, "sine", 0.1); this.noise(0.5, 300, 120, 0.05, 0.1); [392, 330, 262, 196].forEach((f, k) => this.tone(f, 0.55, 0.11, "triangle", 0.25 + k * 0.14)); this.noise(1.4, 1800, 5000, 0.015, 0.4); this.buzz([30, 60, 90]); }
    else if (check) { this.tone(880, 0.09, 0.07, "sine", 0.07); this.tone(1175, 0.12, 0.07, "sine", 0.15); this.buzz(20); }
  },
  end(win) { if (!this.on) return; [0, 0.12, 0.24, 0.36].forEach((d, k) => this.tone(win ? [392, 494, 659, 784][k] : [330, 262, 220, 196][k], 0.34, 0.14, "triangle", d)); if (win) this.noise(1.2, 600, 2200, 0.04); this.buzz(win ? [20, 40, 20] : 60); },
  ok() { if (this.on) { this.tone(523, 0.12, 0.12); this.tone(784, 0.18, 0.12, "triangle", 0.1); } this.buzz(15); }, bad() { if (this.on) { this.tone(160, 0.25, 0.15, "sawtooth"); } this.buzz(50); }, tick() { this.tone(900, 0.03, 0.06, "sine"); },
  /* a calm generative piano-like loop: slow arpeggios over four chords, played live, nothing is downloaded */
  musicStart() { if (!this.on || !this.mus || !this.init()) return; if (!this.timer) { this.step = 0; this.nextT = this.ctx.currentTime + 0.1; this.timer = setInterval(() => this.sched(), 300); this.sched(); } this.mg.gain.cancelScheduledValues(this.ctx.currentTime); this.mg.gain.setTargetAtTime(Mix.music * 0.9, this.ctx.currentTime, 0.6); },
  musicStop() { if (this.mg && this.ctx) { this.mg.gain.cancelScheduledValues(this.ctx.currentTime); this.mg.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25); } clearInterval(this.timer); this.timer = null; },
  sched() { const spb = 60 / 66, CH = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]], c = this.ctx; if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.05; while (this.nextT < c.currentTime + 1.2) { const ch = CH[this.step % 4], t0 = this.nextT, f = (n) => 440 * Math.pow(2, (n - 69) / 12); [0, 1, 2, 3, 2, 1, 3, 2].forEach((k, i) => { const tt = t0 + i * spb / 2; this.tone(f(ch[k] + (i % 5 === 4 ? 12 : 0)), spb * 1.6, 0.03, "sine", tt - c.currentTime, this.mg); this.tone(f(ch[k]) * 2, spb * 0.6, 0.008, "triangle", tt - c.currentTime, this.mg); }); this.tone(f(ch[0] - 12), spb * 3.5, 0.05, "sine", t0 - c.currentTime, this.mg); this.step++; this.nextT += spb * 4; } } };
const Voice = { say(text) { const kk = { "You win": "win", "You lost": "loss", "Draw": "draw", "Checkmate": "mate" }[text], cl = kk && coachId() !== "pip" && COACH_LINES[coachId()][kk], pp = cl ? [kk === "loss" ? "sad" : kk === "draw" ? "calm" : "wow", cl[0]] : typeof PIP_POP !== "undefined" && PIP_POP[text]; if (pp) { pipPop(pp[1], pp[0]); if (Mix.say && Snd.on && PIPV.on) { AIVoice.play(pp[1], { voice: COACHES[coachId()].voice, volume: Mix.voice }).then((a) => { if (!a) AIVoice.play(text, { voice: COACHES[coachId()].voice, volume: Mix.voice }); }); } return; } if (!Mix.say || !Snd.on) return; AIVoice.play(text, { voice: COACHES[coachId()].voice, volume: Mix.voice }); }   /* recorded clips only, never the device voice */, device(text) { if (!window.speechSynthesis) return; try { const u = new SpeechSynthesisUtterance(text), vs = speechSynthesis.getVoices(); u.volume = Mix.voice; u.rate = 1.02; const v = vs.find((x) => /^en/i.test(x.lang) && /Samantha|Google US|Daniel|Natural|Aria|Alex/i.test(x.name)) || vs.find((x) => /^en/i.test(x.lang)); if (v) u.voice = v; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* no voice */ } } };
document.addEventListener("visibilitychange", () => { if (!Snd.ctx) return; if (document.hidden) Snd.ctx.suspend(); else if (Snd.on) Snd.ctx.resume(); });
document.addEventListener("pointerdown", () => { if (Snd.on && Snd.mus && !Snd.timer) Snd.musicStart(); }, { once: true });
let live = null;   // { c, color, onMove(move) -> bool, sel, targets, last }
function liveRender(extraTop, extraBottom, bars, opts = {}) {
  const L = live, app = $("#app"); if (!L.id) L.id = ++LIVEID; let card = app.querySelector("[data-live]");
  const bo = { flip: L.color === "b", play: !L.watch, color: L.color, sel: L.sel, targets: L.targets, caps: L.caps, last: L.last };
  if (!card || card.dataset.live !== String(L.id)) {
    app.innerHTML = `<div class="card" data-live="${L.id}"><div id="lvTop"></div><div id="lvMoves"></div><div id="lvB1"></div><div class="lvwrap" id="lvWrap"><div id="lvBoard">${boardHTML(L.c, bo)}</div><div id="lvOver"></div></div><div id="lvB2"></div><div id="lvBottom"></div></div>`; L.flipped = bo.flip; L.lastKey = (L.last || []).join();
  } else if (L.flipped !== bo.flip) { $("#lvBoard").innerHTML = boardHTML(L.c, bo); L.flipped = bo.flip; } else boardUpdate(L.c, bo, L);
  setPart("lvTop", extraTop); setPart("lvB1", bars ? bars.top : ""); setPart("lvB2", bars ? bars.bottom : ""); setPart("lvBottom", extraBottom); setPart("lvOver", opts.over || "");
  if (opts.moves !== false) { const h = movesHTML(L.c); const el = $("#lvMoves"); if (el && el._h !== h) { el.className = "mvbar"; el.innerHTML = h; el._h = h; el.scrollLeft = el.scrollWidth; } } else { const el = $("#lvMoves"); if (el) el.innerHTML = ""; }
}
const setPart = (id, h) => { const el = document.getElementById(id); if (el && el._h !== h) { el.innerHTML = h; el._h = h; } };
let LIVEID = 0;
const sqEl = (sq) => document.querySelector('#bd [data-sq="' + sq + '"]');
function boardUpdate(c, o, L) {
  document.querySelectorAll("#bd i").forEach((el) => {
    const sq = el.dataset.sq, p = c.get(sq), dark = el.classList.contains("d"), own = o.play && p && o.color && p.color === o.color;
    const cls = (dark ? "d" : "l") + (o.sel === sq ? " sel" : "") + (o.targets && o.targets.includes(sq) ? " tgt" : "") + (o.caps && o.caps.includes(sq) ? " cap" : "") + (o.last && o.last.includes(sq) ? " last" : "");
    if (el.className !== cls) el.className = cls; if (own) { if (el.dataset.own !== "1") el.dataset.own = "1"; } else if (el.dataset.own) delete el.dataset.own;
    let pz = el.querySelector(".pcz"); const want = p ? "pcz pc-" + p.color + p.type : "";
    if (!p) { if (pz) pz.remove(); } else if (!pz) { pz = document.createElement("b"); pz.className = want; el.insertBefore(pz, el.firstChild); } else if (pz.className.replace(" slide", "") !== want) pz.className = want;
  });
  const key = (o.last || []).join();
  if (L && key !== L.lastKey) { mkClear(document.getElementById("bd")); L.lastKey = key; if (o.last && !L.skipAnim) { const [a, b] = o.last, from = sqEl(a), to = sqEl(b), pz = to && to.querySelector(".pcz"); if (from && pz) { const fr = from.getBoundingClientRect(), tr = to.getBoundingClientRect(); pz.style.transform = `translate(${fr.left - tr.left}px,${fr.top - tr.top}px)`; pz.getBoundingClientRect(); pz.classList.add("slide"); pz.style.transform = "none"; setTimeout(() => { pz.classList.remove("slide"); }, 220); } } L.skipAnim = false; }
}
/* the list of moves, and the material count */
function movesHTML(c, cur) { const h = c.history(); let s = ""; h.forEach((m, i) => { if (i % 2 === 0) s += `<span class="n">${i / 2 + 1}.</span>`; s += `<span class="m ${cur === i + 1 || (cur == null && i === h.length - 1) ? "cur" : ""}" ${cur != null ? `data-ply="${i + 1}"` : ""}>${esc(m)}</span>`; }); return s; }
const PV = { p: 1, n: 3, b: 3, r: 5, q: 9 };
function matHTML(c, side) { const start = { p: 8, n: 2, b: 2, r: 2, q: 1 }, have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } }; c.board().forEach((r) => r.forEach((p) => { if (p && p.type !== "k") have[p.color][p.type]++; }));
  const other = side === "w" ? "b" : "w", took = ["q", "r", "b", "n", "p"].map((k) => Math.max(0, start[k] - have[other][k] - (k === "p" ? 0 : 0))), score = (col) => Object.keys(PV).reduce((a, k) => a + PV[k] * have[col][k], 0), diff = score(side) - score(other);
  const icons = ["q", "r", "b", "n", "p"].map((k, i) => `<b class="mp pc-${other}${k}"></b>`.repeat(took[i])).join(""); return `<span class="mat">${icons}${diff > 0 ? `<b>+${diff}</b>` : ""}</span>`; }
const fmtClk = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const pbar = (icn, name, sub, c, side, clk) => `<div class="pbar"><div class="av">${icn === "robot" && st && st.game === "ai" && st.level ? `<span class="pbface">${oppFace(LVC[st.level], st.think ? "hmm" : "calm")}</span>` : ic(icn)}</div><div class="nm"><span><b>${name}</b><small>${sub}</small></span><span>${matHTML(c, side)}</span></div>${clk ? `<span class="clk" data-clk-side="${side}">${fmtClk(clk)}</span>` : ""}</div>`;
function liveClick(sq) {
  if (live && document.querySelector(".dghost")) live.skipAnim = true;
  const L = live; if (!L || L.lock) return; const c = L.c, p = c.get(sq);
  if (L.sel && L.targets.includes(sq)) { const mv = c.move({ from: L.sel, to: sq, promotion: "q" }); L.sel = null; L.targets = []; L.caps = []; if (mv) { L.last = [mv.from, mv.to]; Snd.move(mv, c); L.onMove(mv); } return; }
  if (p && p.color === L.color) { L.sel = sq; const ms = c.moves({ square: sq, verbose: true }); L.targets = ms.map((m) => m.to); L.caps = ms.filter((m) => m.captured || /e/.test(m.flags)).map((m) => m.to); L.refresh(); } else { L.sel = null; L.targets = []; L.caps = []; L.refresh(); }
}
/* ---------- Pip's opening gym: Pip plays a random opening (its main line, then real master choices), you get a random colour.
   Masters' moves and anything Stockfish calls fine are accepted; a real mistake is taken back and Pip shows what to play. ---------- */
function trainerStart() { gymStart(); }
const GYM_LEN = 10;   /* moves you play per opening */
/* the opening's name as the game goes: a banner when it changes, the trail of names, and Pip tells the story of each new family */
function gymName(me, nm) {
  if (!nm || nm === me.name) return; const fam = (x) => (x || "").split(":")[0].trim(), newFam = fam(nm) !== fam(me.name); me.name = nm; me.trail = me.trail || [];
  const parts = nm.split(/:\s*|,\s*/); me.trail = parts; me.flash = Date.now();
  const S = openStory(nm); if (newFam && S && me.told !== S.name) { me.told = S.name; me.story = S.origin; me.storyTill = me.moves + 2; setTimeout(() => { if (st === me) pipSay(S.origin); }, 900); }
}
/* the engine's verdict on the position, for the bar under the name */
function gymEval(me) { const fen = live.c.fen(); if (live.c.game_over()) return; Sf.analyse(fen, { depth: 12, ms: 700 }).then((l) => { if (st !== me || !live || live.c.fen() !== fen || !l.length) return; me.ev = lineW(l[0], live.c.turn()); gymPaintEval(); }).catch(() => {}); }
function gymPaintEval() {
  const me = st, el = document.getElementById("gymEv"); if (!el || !me.ev) return; const w = me.ev.w, mineW = live.color === "w" ? w : 100 - w;
  el.querySelector(".gevw").style.width = w + "%"; el.querySelector(".gevt").textContent = fmtEv(me.ev); el.querySelector(".gevt").className = "gevt " + (w >= 50 ? "onw" : "onb");
  el.querySelector(".gevs").textContent = mineW >= 70 ? "You're doing great" : mineW >= 55 ? "You're a bit better" : mineW > 45 ? "Level" : mineW > 30 ? "Pip is a bit better" : "Pip is clearly better";
}
function gymStart() {
  clearInterval(st.timer); const pool = OPEN_STORY.filter((s) => !/Bongcloud/.test(s.name)), S = pool[Math.floor(Math.random() * pool.length)], color = Math.random() < 0.5 ? "w" : "b", tot = store.get("gym_tot", { n: 0, book: 0 });
  st = { game: "gym", S, line: S.line.split(" "), color, moves: 0, sc: { book: 0, ok: 0, fix: 0 }, msg: `Let's go. I picked an opening and you're ${color === "w" ? "White" : "Black"}. Play the best lines you know. If you slip, I'll stop you and show you the move.`, mood: "happy", hint: null, name: "", over: false, tot };
  live = { c: new Chess(), color, sel: null, targets: [], last: null, lock: false, refresh: gymPaint, onMove: gymUser };
  $("#app").className = "fresh"; gymPaint(); pipSay(pipPick("start", 1)); if (color === "b") gymPip();
}
const gymPick = (moves) => { const ok = moves.filter((m, k) => k === 0 || (m.white + m.draws + m.black) / moves.reduce((a, x) => a + x.white + x.draws + x.black, 0) >= 0.06), w = ok.map((m) => m.white + m.draws + m.black), t = w.reduce((a, b) => a + b, 0); let r = Math.random() * t; for (let k = 0; k < ok.length; k++) { r -= w[k]; if (r <= 0) return ok[k]; } return ok[0]; };
async function gymPip() {
  const me = st, L = live, c = L.c; L.lock = true; st.think = true; gymPaint(); const fen = c.fen(), h = c.history();
  const onLine = h.length < me.line.length && h.every((m, k) => m === me.line[k]); let san = onLine ? me.line[h.length] : null;
  const d = await exFetch(fen); if (st !== me || live !== L) return; if (d && d.opening && d.opening.name) gymName(me, d.opening.name);
  if (!san && d && d.moves.length) san = gymPick(d.moves).san;
  if (!san) { const ln = await Sf.analyse(fen, { depth: 12, ms: 900 }).catch(() => []); if (st !== me || live !== L) return; if (ln.length) san = uciSan(fen, ln[0].pv[0]); }
  await new Promise((r) => setTimeout(r, 450)); if (st !== me || live !== L) return;
  const m = san ? c.move(san) : null; st.think = false; if (!m) { L.lock = false; return gymPaint(); }
  L.last = [m.from, m.to]; Snd.move(m, c); L.lock = false; const d2 = EX.cache[c.fen()]; if (d2 && d2.opening && d2.opening.name) gymName(me, d2.opening.name); gymEval(me);
  if (c.game_over()) return gymEnd(); gymPaint(); exFetch(c.fen()).then((d3) => { if (st === me && d3 && d3.opening && d3.opening.name && d3.opening.name !== me.name) { gymName(me, d3.opening.name); gymPaint(); } });   /* warm the cache for your reply */
}
async function gymUser(mv) {
  const me = st, L = live, c = L.c; L.lock = true; const back = c.undo(), fenB = c.fen(); c.move(back); const fenA = c.fen(), san = mv.san; mkClear(document.getElementById("bd"));
  if (me.hint) { if (san === me.hint.san) { me.hint = null; me.sc.fix++; me.say = "best"; me.msg = `${san}. That's the one. Now you'll remember it.`; me.mood = "happy"; return gymAccept(me); } c.undo(); L.last = null; me.msg = `Not that either. Play ${me.hint.san}: follow the arrow.`; me.mood = "hmm"; L.lock = false; gymPaint(); return gymArrow(); }
  me.msg = "Checking your move…"; me.mood = "hmm"; gymPaint();
  const d = await exFetch(fenB); if (st !== me) return; const tot = d ? d.moves.reduce((a, x) => a + x.white + x.draws + x.black, 0) : 0, hit = d && d.moves.find((x) => x.san === san), n = hit ? hit.white + hit.draws + hit.black : 0;
  if (hit && n >= 10 && n / tot >= 0.02) { me.sc.book++; me.msg = `${san}: theory. ${n.toLocaleString()} master games went this way${hit === d.moves[0] ? ", it's their favourite" : ""}.`; me.mood = "happy"; me.say = "best"; return gymAccept(me); }
  const [a, b] = await Promise.all([Sf.analyse(fenB, { multipv: 3, depth: 14, ms: 1500 }), Sf.analyse(fenA, { multipv: 1, depth: 14, ms: 1200 })].map((p) => p.catch(() => null))); if (st !== me) return;
  if (!a || !a.length) { me.sc.ok++; me.msg = `${san}. I couldn't check it with the engine, so it counts.`; return gymAccept(me); }
  const tb = new Chess(fenB).turn(), la = a.map((x) => lineW(x, tb)), pov = (w) => (tb === "w" ? w : 100 - w), uci = mv.from + mv.to + (mv.promotion || ""), inTop = la.find((x) => x.pv[0] === uci);
  const after = inTop ? pov(inTop.w) : b && b.length ? pov(lineW(b[0], new Chess(fenA).turn()).w) : pov(la[0].w), loss = Math.max(0, pov(la[0].w) - after);
  if (loss <= 4) { me.sc.ok++; me.msg = `${san}. Not the main theory, but it's fine: the engine barely minds.`; me.mood = "calm"; me.say = "good"; return gymAccept(me); }
  const best = d && d.moves.length && d.moves[0].white + d.moves[0].draws + d.moves[0].black >= 10 ? d.moves[0].san : uciSan(fenB, la[0].pv[0]), bm = new Chess(fenB).move(best);
  c.undo(); L.last = null; me.hint = { san: best, from: bm.from, to: bm.to }; me.mood = loss > 15 ? "shock" : "sad";
  me.msg = `Stop! ${san} ${loss > 15 ? "is a real mistake" : "isn't good here"}: it costs about ${Math.round(loss)}% of your winning chances. ${d && d.moves[0] && d.moves[0].san === best ? "Masters play" : "The engine wants"} ${best}. Your turn: play it.`;
  try { Snd.bad(); } catch (e) { /* quiet */ } pipSay(pipPick(loss > 15 ? "blunder" : "mistake", me.moves)); L.lock = false; gymPaint(); gymArrow();
}
function gymArrow() { const H = st.hint, bd = document.getElementById("bd"); if (!H || !bd) return; const f = live.color === "b"; mkToggle(mkSvg(bd), rvSq(H.from, f), rvSq(H.to, f), "b"); }
function gymAccept(me) { me.moves++; { const dd = EX.cache[live.c.fen()]; if (dd && dd.opening && dd.opening.name) gymName(me, dd.opening.name); else exFetch(live.c.fen()).then((d4) => { if (st === me && d4 && d4.opening && d4.opening.name) { gymName(me, d4.opening.name); gymPaint(); } }); } gymEval(me); pipSay(pipPick(me.say || "good", me.moves)); if (me.moves >= GYM_LEN || live.c.game_over()) return gymEnd(); live.lock = false; gymPaint(); gymPip(); }
function gymEnd() {
  const me = st; me.over = true; live.lock = true; const s = me.sc, tot = me.tot; tot.n++; tot.book += s.book; store.set("gym_tot", tot);
  me.mood = s.fix === 0 ? "wow" : s.fix <= 2 ? "happy" : "calm"; me.msg = s.fix === 0 ? `Clean! ${s.book} theory moves and not one slip. You know the ${me.S.name}.` : `Done. ${s.book} theory moves, ${s.ok} fine ones, and ${s.fix} I had to fix. Next time those ${s.fix} will be automatic.`;
  if (s.fix === 0) Snd.end(true); pipSay(pipPick(s.fix === 0 ? "great_game" : s.fix <= 2 ? "ok_game" : "rough_game", tot.n)); gymPaint();
}
function gymPaint() {
  const me = st, L = live; if (!L || me.game !== "gym") return; const c = L.c, opp = L.color === "w" ? "b" : "w";
  const bars = { top: `<div class="pbar"><div class="av"><span class="pbface">${pipSVGRaw(me.think ? "hmm" : me.mood === "shock" ? "shock" : "calm")}</span></div><div class="nm"><span><b>Pip</b><small>${me.think ? "choosing a move…" : opp === "w" ? "White" : "Black"}</small></span><span>${matHTML(c, opp)}</span></div></div>`, bottom: pbar("user", "You", L.color === "w" ? "White" : "Black", c, L.color, 0) };
  const named = me.name || (c.history().length ? "" : "");
  const top = backRow("Pip's opening gym", "bulb", `Move ${Math.min(me.moves + 1, GYM_LEN)} of ${GYM_LEN} · ${me.tot.n} done`) + `<div class="gymname ${me.flash && Date.now() - me.flash < 1500 ? "flash" : ""}">${named ? `<span class="gymtrail">${(me.trail || [named]).map((x, k, A) => `<b class="${k === A.length - 1 ? "last" : ""}">${esc(x)}</b>`).join('<i>›</i>')}</span>` : `<span class="fine">Which opening is Pip playing? It will appear here.</span>`}<span class="gymsc"><i class="cls book">${RVC.book[1]}</i>${me.sc.book} <i class="cls best">✓</i>${me.sc.ok} <i class="cls mistake">?</i>${me.sc.fix}</span></div><div class="gymev" id="gymEv" title="Stockfish\'s evaluation"><span class="gevbar"><i class="gevw" style="width:${me.ev ? me.ev.w : 50}%"></i></span><b class="gevt">${me.ev ? fmtEv(me.ev) : "0.0"}</b><span class="gevs fine">${me.ev ? "" : "Level"}</span></div><div class="pipbox">${pipSVGRaw(me.mood)}<div class="pipsay"><b>Pip</b>${esc(me.msg)}${me.story && me.moves < (me.storyTill || 0) ? `<span class="gymstory"><b>${esc(me.told || "")}</b> ${esc(me.story)}</span>` : ""}</div></div>`;
  const bottom = `<div class="row" style="justify-content:center;margin-top:8px">${me.hint && !me.over ? `<button class="btn" id="gymDo" type="button">${ic("bulb")}Play ${esc(me.hint.san)} for me</button>` : ""}${me.over ? `<button class="btn" id="gymNext" type="button">${ic("arrow")}Next opening</button><button class="btn ghost" id="gymEx" type="button">${ic("compass")}Explore this opening</button>` : `<button class="btn ghost" id="gymNext" type="button">New opening</button>`}</div>`;
  liveRender(top, bottom, bars); gymPaintEval();
}
document.addEventListener("click", (e) => {
  if (st.game !== "gym") return; const t = e.target.closest && e.target.closest("#gymDo,#gymNext,#gymEx"); if (!t) return;
  if (t.id === "gymNext") return gymStart();
  if (t.id === "gymEx") { EX.sans = live.c.history(); EX.sel = null; EX.tab = "name"; EX.quiz = null; st = { game: "x" }; return explorerPage(); }
  if (t.id === "gymDo" && st.hint && !live.lock) { const m = live.c.move(st.hint.san); if (m) { live.last = [m.from, m.to]; Snd.move(m, live.c); gymUser(m); } }
});
function trainerNext() {
  const nm = (x) => (x.pgn.match(/\d+\./g) || []).length, o = rnd(OPEN.filter((x) => (DIFF === "easy" ? nm(x) >= 2 && nm(x) <= 3 : DIFF === "medium" ? nm(x) >= 3 && nm(x) <= 5 : DIFF === "hard" ? nm(x) >= 5 : nm(x) >= 6))), ref = new Chess(); ref.load_pgn(o.pgn); const book = ref.history(), color = Math.random() < 0.5 ? "w" : "b", c = new Chess();
  st.o = o; st.book = book; st.i = 0; st.wrong = 0;
  live = { c, color, sel: null, targets: [], last: null, lock: false, refresh: trainerPaint, onMove: (mv) => { if (mv.san === book[st.i]) { st.i++; autoBook(); } else { c.undo(); st.wrong++; live.last = null; st.msg = `Not the book move. Hint: ${book[st.i]}`; trainerPaint(); document.querySelector(".board").classList.add("shake"); } } };
  st.msg = ""; autoBook(true);
}
function autoBook(first) {
  const c = live.c, pc = () => c.turn() === live.color;
  const step = () => { if (st.game !== "trainer" || !st.book || !live) return; if (st.i >= st.book.length) { st.done++; st.msg = `That is the ${st.o.name}.`; live.lock = true; return trainerPaint(); } if (!pc()) { const mv = c.move(st.book[st.i]); live.last = [mv.from, mv.to]; st.i++; trainerPaint(); setTimeout(step, 420); } else trainerPaint(); };
  setTimeout(step, first ? 100 : 350);
}
function trainerPaint() { const done = st.i >= st.book.length; liveRender(backRow("Opening trainer", "bulb", `Completed ${st.done}`) + `<p class="sub">Play the <b>${esc(st.o.name)}</b> (${esc(st.o.eco)}) as ${live.color === "w" ? "White" : "Black"}. Click a piece, then a square. ${done ? "" : `Move ${Math.floor(st.i / 2) + 1}.`}</p>`, `<div class="row"><span class="fine">${esc(st.msg || "")}</span>${done ? '<button class="btn" id="trnext">Next opening</button>' : '<button class="btn ghost" id="trhint">Hint</button>'}</div>`); }
/* ---------- puzzles: mate in N and the Elo estimate ---------- */
function puzzleLoad(p) {
  const c = new Chess(p.fen), f = p.moves[0]; c.move({ from: f.slice(0, 2), to: f.slice(2, 4), promotion: f[4] });
  const pz = { p, i: 1, done: false, ok: null };
  live = { c, color: c.turn(), sel: null, targets: [], last: [f.slice(0, 2), f.slice(2, 4)], lock: false, refresh: () => puzzlePaint(), onMove: (mv) => puzzleMove(mv, pz) }; st.pz = pz; return pz;
}
/* puzzles: a right move that gives up material (a piece of 3 or more left where it can be taken for less, or taken for free) or the
   right underpromotion is marked Brilliant, like in the review */
function pzBrill(c, mv) {
  if (mv.promotion && mv.promotion !== "q") return { kind: "underpromo", txt: `Brilliant!! Promoting to a ${{ n: "knight", r: "rook", b: "bishop" }[mv.promotion]}, not a queen.` };
  const V = PV[mv.promotion || mv.piece] || 0, got = mv.captured ? PV[mv.captured] || 0 : 0; if (V < 3 || V - got < 2) return null;
  const caps = c.moves({ verbose: true }).filter((m) => m.to === mv.to && m.captured); if (!caps.length) return null;
  const cheapest = Math.min(...caps.map((m) => PV[m.piece] || 0)), take = caps.find((m) => (PV[m.piece] || 0) === cheapest);
  const t = new Chess(c.fen()); t.move(take); const back = t.moves({ verbose: true }).some((m) => m.to === mv.to && m.captured);
  if (back && cheapest >= V) return null;   /* a fair trade, not a sacrifice */
  const name = { q: "queen", r: "rook", b: "bishop", n: "knight" }[mv.promotion || mv.piece];
  return { kind: mv.piece === "q" ? "brilliant_q" : mv.piece === "r" ? "brilliant_r" : "brilliant_minor", txt: `Brilliant!! You offered your ${name}.` };
}
function pzBadge(sq) { const w = document.getElementById("lvWrap"); if (!w) return; const [c, r] = rvSq(sq, live.color === "b"); const b = document.createElement("span"); b.className = "sqb cls brilliant pzbr"; b.textContent = "!!"; b.style.left = (c + 1) * 12.5 + "%"; b.style.top = r * 12.5 + "%"; w.appendChild(b); setTimeout(() => b.remove(), 2600); }
function puzzleMove(mv, pz) {
  const want = pz.p.moves[pz.i], got = mv.from + mv.to + (mv.promotion && want.length > 4 ? mv.promotion : ""), mates = live.c.in_checkmate();
  if (got === want || (mates && /mate/.test(pz.p.themes.join(" ")))) { const br = pzBrill(live.c, mv); if (br) { pz.brill = (pz.brill || 0) + 1; st.msg = br.txt; setTimeout(() => pzBadge(mv.to), 60); try { Snd.end(true); } catch (e) { /* quiet */ } pipPop(pipPick(br.kind, pz.i), "wow"); pipSay(pipPick(br.kind, pz.i)); } pz.i++; if (pz.i >= pz.p.moves.length || mates) { pz.done = true; pz.ok = pz.fail ? false : true; live.lock = true; return puzzleEnd(pz); } live.lock = true; puzzlePaint(); setTimeout(() => { const o = pz.p.moves[pz.i]; const m2 = live.c.move({ from: o.slice(0, 2), to: o.slice(2, 4), promotion: o[4] }); live.last = [m2.from, m2.to]; pz.i++; live.lock = false; puzzlePaint(); }, 450); }
  else { live.c.undo(); pz.fail = true; pz.done = true; pz.ok = false; live.lock = true; live.last = null; st.msg = `Not that one. The answer was ${solSAN(pz)}.`; puzzleEnd(pz); }
}
function solSAN(pz) { const c = new Chess(pz.p.fen), m0 = pz.p.moves[0]; c.move({ from: m0.slice(0, 2), to: m0.slice(2, 4), promotion: m0[4] }); const m = pz.p.moves[1], r = c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }); return r ? r.san : m; }
function puzzlePaint() { const pz = st.pz, g = st.game; const top = g === "lesson" ? backRow(st.L.name, st.L.ic, `Puzzle ${st.i + 1} of 3 · ${st.ok} solved`) + `<div class="pipbox">${pipSVG("calm")}<div class="pipsay"><b>${esc(coachName())}</b>${esc(st.i === 0 ? st.L.intro : "Next one. Same idea, a little harder.")}</div></div>` : g === "wk" ? backRow("Weekly cup", "trophy", `Puzzle ${st.k + 1} of 5 · ${st.score} points`) : st.daily ? backRow("Daily puzzle", "bolt", "Same for everyone today") : g === "mate" ? backRow("Mate puzzles", "bolt", `Streak ${st.streak} · best ${bestOf("mate")}`) + `<div class="row" style="margin-bottom:6px">${[1, 2, 3].map((n) => `<button class="btn ${st.n === n ? "" : "ghost"}" data-mn="${n}">Mate in ${n}</button>`).join("")}</div>` : backRow("Estimate my Elo", "brain", `Puzzle ${st.k + 1} of ${st.total}`); liveRender(top + `<p class="sub">${sideName(live.c)} to move${g === "mate" && !st.daily ? ` and mate in ${st.n}` : ""}. Click a piece, then a square.${g === "elo" ? "" : ""}</p>`, `<div class="row"><span class="fine">${esc(st.msg || "")}</span></div>`, null, { moves: false }); }
function mateStart(n) { st = { game: "mate", streak: st.streak || 0, n: n || 2 }; mateNext(); }
const pzBand = (p) => (DIFF === "easy" ? p.rating < 1300 : DIFF === "medium" ? p.rating >= 1200 && p.rating < 1800 : DIFF === "hard" ? p.rating >= 1700 && p.rating < 2200 : p.rating >= 2100);
function mateNext() { let pool = PZ.filter((p) => p.themes.includes("mateIn" + st.n) && pzBand(p)); if (pool.length < 5) pool = PZ.filter((p) => p.themes.includes("mateIn" + st.n)); puzzleLoad(rnd(pool)); st.msg = ""; puzzlePaint(); }
/* ---------- Weekly cup: five puzzles, the same for everyone this week, one attempt; faster solves score more ---------- */
const WK_T = [1300, 1600, 1900, 2200, 2500];
function wkSet() {
  let h = 2166136261; for (const ch of "wk" + weekK()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const r = () => { h = (Math.imul(h ^ (h >>> 15), 2246822519) >>> 0) ^ 0x9e3779b9; return (h >>> 0) / 4294967296; }, used = new Set();
  return WK_T.map((t) => { const pool = PZ.filter((p) => !used.has(p.fen)).sort((a, b) => Math.abs(a.rating - t) - Math.abs(b.rating - t)).slice(0, 25), p = pool[Math.floor(r() * pool.length)]; used.add(p.fen); return p; });
}
const wkMine = () => store.get("wk_" + weekK(), null);
function wkStart() { if (wkMine()) return wkResult(); st = { game: "wk", set: wkSet(), k: 0, score: 0, log: [] }; wkNext(); }
function wkNext() { puzzleLoad(st.set[st.k]); st.t0 = performance.now(); st.msg = ""; puzzlePaint(); }
function wkAfter(pz) {
  const secs = (performance.now() - st.t0) / 1000, pts = pz.ok ? 100 + Math.max(0, Math.round(100 - secs * 2)) : 0; st.score += pts; st.log.push([pz.p.rating, pz.ok, Math.round(secs), pts]); st.k++;
  if (st.k >= WK_T.length) { store.set("wk_" + weekK(), { score: st.score, log: st.log }); if (Cloud.signedIn) Cloud.submit("wk", st.score); if (st.score >= 700) Snd.end(true); return wkResult(); }
  liveRender(backRow("Weekly cup", "trophy", `Puzzle ${st.k} of 5 · ${st.score} points`) + `<p class="sub"><b>${pz.ok ? `Solved in ${Math.round(secs)} s: +${pts}` : "Missed it."}</b> ${esc(st.msg || "")}</p>`, `<div class="row"><button class="btn" id="wknext" type="button">Next puzzle</button></div>`);
}
function wkResult() {
  const me = wkMine() || { score: 0, log: [] }; clearInterval(st.timer); live = null; st = { game: "wkres" };
  $("#app").className = "fresh"; $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="games">← Games</button></div><div class="card"><h2>${ic("trophy")}Weekly cup</h2><p class="sub">Five puzzles, the same for everyone this week, from about 1300 to 2500. One attempt; a solve scores 100 plus up to 100 for speed.</p>
    <div class="tiles"><div class="tile"><small>Your score</small><b>${me.score}</b><span class="fine">of 1000</span></div><div class="tile"><small>Solved</small><b>${me.log.filter((x) => x[1]).length}</b><span class="fine">of 5</span></div></div>
    <div class="cpgames" style="margin-top:10px">${me.log.map(([r, ok, sec, pts], k) => `<div class="cpgame static"><span class="cpres r${ok ? "W" : "L"}">${ok ? "+" + pts : "Miss"}</span><span class="cpcol2"><b>Puzzle ${k + 1}</b><span class="fine">rated ${r}${ok ? ` · ${sec} s` : ""}</span></span></div>`).join("")}</div>
    <h3 style="margin:16px 0 6px">${ic("chart")}This week's table</h3><div id="wkRows"><p class="fine"><span class="spin"></span> Loading…</p></div><p class="fine">A new cup starts every Monday.${Cloud.signedIn ? "" : " Sign in to put your score on the table."}</p></div>`;
  Cloud.top("wk", "week").then((rows) => { const el = document.getElementById("wkRows"); if (!el) return; el.innerHTML = rows == null ? `<p class="fine">The online table is not switched on yet; your score is saved on this device.</p>` : !rows.length ? `<p class="fine">Nobody is on the table yet this week.</p>` : `<table class="tb"><tr><th>#</th><th>Player</th><th>Points</th></tr>${rows.slice(0, 20).map((r, i) => `<tr class="${r.nick === Cloud.nick ? "me" : ""}"><td>${i + 1}</td><td>${esc(r.nick)}</td><td>${Math.round(+r.value)}</td></tr>`).join("")}</table>`; });
}
document.addEventListener("click", (e) => { if (e.target.id === "wknext" && st.game === "wk") wkNext(); });
function puzzleEnd(pz) {
  setTimeout(() => { const b = document.getElementById("bd"); if (b) { b.classList.remove("flashok", "flashbad"); void b.offsetWidth; b.classList.add(pz.ok ? "flashok" : "flashbad"); } }, 30);
  if (st.game === "wk") return wkAfter(pz);
  if (st.game === "lesson") return lessonAfter(pz);
  if (st.daily) { dailyMark("p", pz.ok ? 1 : 0); liveRender(backRow("Daily puzzle", "bolt", "") + `<p class="sub"><b>${pz.ok ? "Solved!" : "Missed it."}</b> A new puzzle arrives tomorrow.</p>`, `<div class="row"><button class="btn" data-go="daily">Back to daily</button></div>`); return; }
  if (st.game === "mate") { st.streak = pz.ok ? st.streak + 1 : 0; bump("mate", st.streak); st.msg = pz.ok ? "Checkmate!" : st.msg; liveRender(backRow("Mate puzzles", "bolt", `Streak ${st.streak} · best ${bestOf("mate")}`) + `<p class="sub"><b>${pz.ok ? "Solved!" : "Missed it."}</b></p>`, `<div class="row"><span class="fine">${esc(st.msg || "")}</span><button class="btn" id="mnext">Next puzzle</button></div>`); }
  else eloAfter(pz);
}
function eloStart() { st = { game: "elo", R: 1200, k: 0, total: 10, used: new Set(), log: [] }; eloNext(); }
function eloNext() { const R = st.R, pool = PZ.filter((p) => !st.used.has(p.fen)).sort((a, b) => Math.abs(a.rating - R) - Math.abs(b.rating - R)).slice(0, 12), p = rnd(pool); st.used.add(p.fen); puzzleLoad(p); st.msg = ""; puzzlePaint(); }
function eloAfter(pz) {
  const p = pz.p, exp = 1 / (1 + 10 ** ((p.rating - st.R) / 400)), K = [120, 110, 100, 90, 80, 70, 60, 55, 50, 45][st.k] || 45; st.R = Math.round(st.R + K * ((pz.ok ? 1 : 0) - exp)); st.log.push([p.rating, pz.ok]); st.k++;
  if (st.k >= st.total) { bump("elo", st.R); $("#app").innerHTML = `<div class="card"><h2>${ic("brain")}Your estimated level</h2><div class="tiles"><div class="tile"><small>Puzzle rating</small><b>${st.R}</b></div><div class="tile"><small>Solved</small><b>${st.log.filter((x) => x[1]).length} / ${st.total}</b></div><div class="tile"><small>Best estimate</small><b>${bestOf("elo")}</b></div></div><table class="tb"><tr><th>Puzzle rating</th><th>Result</th></tr>${st.log.map(([r, ok]) => `<tr><td>${r}</td><td>${ok ? "Solved" : "Missed"}</td></tr>`).join("")}</table><p class="fine" style="margin-top:10px">This is an estimate on the Lichess puzzle scale from ${st.total} puzzles, so it can be off by 200 points or more. It is not a FIDE or Lichess game rating.</p><div class="row"><button class="btn" data-go="elo">Try again</button><button class="btn ghost" data-go="home">Menu</button></div></div>`; return; }
  liveRender(backRow("Estimate my Elo", "brain", `Puzzle ${st.k} of ${st.total}`) + `<p class="sub"><b>${pz.ok ? "Solved." : "Missed."}</b> The next puzzle is ${pz.ok ? "harder" : "easier"}.</p>`, `<div class="row"><span class="fine">${esc(st.msg || "")}</span><button class="btn" id="enext2">Next puzzle</button></div>`);
}
/* ---------- Play my AI: a small engine (material plus a little position sense, searched 1 to 3 moves deep) ---------- */
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
function evalPos(c) { if (c.in_checkmate()) return c.turn() === "w" ? -99999 : 99999; if (c.in_draw()) return 0; let s = 0; const b = c.board(); for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = b[r][f]; if (!p) continue; const cen = 3.5 - Math.abs(3.5 - f) + 3.5 - Math.abs(3.5 - r), v = VAL[p.type] + (p.type === "p" ? (p.color === "w" ? 6 - r : r - 1) * 6 : p.type === "n" || p.type === "b" ? cen * 7 : 0); s += p.color === "w" ? v : -v; } return s; }
function negamax(c, d, a, b) { if (d === 0 || c.game_over()) return (c.turn() === "w" ? 1 : -1) * evalPos(c); let best = -1e9; const ms = c.moves({ verbose: true }).sort((x, y) => (y.captured ? VAL[y.captured] : 0) - (x.captured ? VAL[x.captured] : 0)); for (const m of ms) { c.move(m); const v = -negamax(c, d - 1, -b, -a); c.undo(); if (v > best) best = v; if (best > a) a = best; if (a >= b) break; } return best; }
function engineMove(c, level) { const ms = c.moves({ verbose: true }); if (level === 1) { const caps = ms.filter((m) => m.captured); return Math.random() < 0.6 && caps.length ? rnd(caps) : rnd(ms); } const d = level === 2 ? 2 : 3; let best = -1e9, pick = []; for (const m of shuffle(ms)) { c.move(m); const v = -negamax(c, d - 1, -1e9, 1e9); c.undo(); if (v > best + 3) { best = v; pick = [m]; } else if (Math.abs(v - best) <= 3) pick.push(m); } return rnd(pick); }

/* ---------- the engine runs in a Web Worker, so thinking never freezes the page ---------- */
const ENGINE_SRC = () => `importScripts("https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js");const VAL=${JSON.stringify(VAL)};const rnd=${rnd.toString()};const shuffle=${shuffle.toString()};${evalPos.toString()}
${negamax.toString()}
${engineMove.toString()}
const wc=(cp)=>50+50*(2/(1+Math.exp(-0.00368208*Math.max(-1000,Math.min(1000,cp))))-1);
self.onmessage=(e)=>{const d=e.data;if(d.type==="move"){const c=new Chess(d.fen);const m=engineMove(c,d.level);postMessage({type:"move",from:m.from,to:m.to,promotion:m.promotion});}
else if(d.type==="review"){const c=new Chess(),out=[];for(let i=0;i<d.sans.length;i++){const ms=c.moves({verbose:true}),sc=ms.map((m)=>{c.move(m);const v=-negamax(c,1,-1e9,1e9);c.undo();return [m,v];});const best=Math.max.apply(null,sc.map((s)=>s[1])),pl=sc.find((s)=>s[0].san===d.sans[i]),bm=sc.find((s)=>s[1]===best)[0];out.push({san:d.sans[i],best:best,played:pl?pl[1]:best,bestSan:bm.san});c.move(d.sans[i]);postMessage({type:"prog",p:i+1,n:d.sans.length});}postMessage({type:"review",out:out});}};`;
let worker = null, workerCb = null;
function engineWorker() { if (worker !== null) return worker; try { worker = new Worker(URL.createObjectURL(new Blob([ENGINE_SRC()], { type: "text/javascript" }))); worker.onmessage = (e) => { if (workerCb) workerCb(e.data); }; worker.onerror = () => { worker = false; }; } catch (err) { worker = false; } return worker; }
function askEngine(msg, cb) { const w = engineWorker(); if (w) { workerCb = cb; w.postMessage(msg); return; } setTimeout(() => { if (msg.type === "move") { const c = new Chess(msg.fen), m = engineMove(c, msg.level); cb({ type: "move", from: m.from, to: m.to, promotion: m.promotion }); } else cb({ type: "review", out: [] }); }, 30); }
const LVL = { 1: "Pip, warming up", 2: "Pip", 3: "Bishop Bea, gently", 4: "Bishop Bea", 5: "Queen Vera", 6: "Queen Vera, ruthless", 7: "The Council" };
const LVC = { 1: "pip", 2: "pip", 3: "bea", 4: "bea", 5: "vera", 6: "vera", 7: "vera" };   /* who sits across the board at each level */
const oppFace = (id, mood = "calm") => (id === "pip" ? pipSVGRaw(mood) : COACH_SVG[id](mood));
const SFL = { 4: [3, 6, 300], 5: [8, 8, 500], 6: [14, 10, 800], 7: [20, 14, 2000] };
function aiStart(){}
function aiEnd(){}
function aiPaint(){}

function aiMenu() {
  clearInterval(st.timer); live = null; st = { game: "ai", level: store.get("ai_level", 2), color: store.get("ai_color", "w"), clock: store.get("ai_clock", 0) };
  const o = [[1, LVL[1], "Pip only just learned how the pieces move. He looks no moves ahead and grabs whatever he can."], [2, LVL[2], "Pip on a good day: he looks two moves ahead."], [3, LVL[3], "Bea takes it easy on you: three moves ahead, no mercy for loose pieces."], [4, LVL[4], "Bea for real. Roughly a 1400 club player."], [5, LVL[5], "Vera at her club. Roughly a strong club player, about 1900."], [6, LVL[6], "Vera does not do friendly games. Roughly a master, about 2400."], [7, LVL[7], "Pip, Bea and Vera thinking together at full strength. Plan for a long defence."]];
  $("#app").className = "fresh"; $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-hub="bk">← Back</button></div><div class="card"><h2>${ic("robot")}Play the coaches</h2><p class="sub">Choose your opponent. Pip and gentle Bea think with a small engine written for this site; from Bea upward they think with Stockfish, the free open-source engine, held back to different strengths (the ratings are rough guesses). It downloads once, about 1.5 MB.</p><div class="opps">${o.map(([l, n, d]) => `<button class="opp ${st.level === l ? "on" : ""}" data-lv="${l}"><div class="av oppface">${l === 7 ? `<span class="council">${["pip", "bea", "vera"].map((id) => oppFace(id, "happy")).join("")}</span>` : oppFace(LVC[l], l % 2 ? "happy" : "calm")}</div><b>${n}</b><span class="fine">${d}</span></button>`).join("")}</div><h3>${ic("clock")}Clock</h3><div class="chips">${[[0, "No clock"], [180, "3 min"], [300, "5 min"], [600, "10 min"]].map(([s, n]) => `<button class="chip ${(st.clock || 0) === s ? "on" : ""}" data-clk="${s}" type="button">${n}</button>`).join("")}</div><h3>${ic("flag")}You play</h3><div class="chips">${[["w", "White"], ["b", "Black"], ["r", "Random"]].map(([k, n]) => `<button class="chip ${st.color === k ? "on" : ""}" data-col="${k}" type="button">${n}</button>`).join("")}</div><div class="row"><button class="btn" id="aiGo">Start the game</button></div></div>`;
}
function aiStart(level, color, fen) {
  const clockSecs = st.clock || 0; clearInterval(st.timer); const c = fen ? new Chess(fen) : new Chess(); /* fen: play on from a position (the live board's "Play from here") */ level = level || store.get("ai_level", 2); color = color || store.get("ai_color", "w"); store.set("ai_level", level); store.set("ai_color", color); const me = color === "r" ? (Math.random() < 0.5 ? "w" : "b") : color;
  st = { game: "ai", level, msg: "", me, over: null, think: false, clockSecs, ms: { w: clockSecs * 1000, b: clockSecs * 1000 }, last: performance.now() };
  live = { c, color: me, sel: null, targets: [], last: null, lock: false, refresh: aiPaint, onMove: () => { if (st.clockSecs) { const now = performance.now(); st.ms[live.color] -= now - st.last; st.last = now; } if (aiEnd()) return; aiThink(); } };
  $("#app").className = "fresh"; aiPaint(); if (clockSecs) st.timer = setInterval(aiTick, 200); if (c.turn() !== me) aiThink();
}
function aiThink() { if (st.level >= 4) return aiThinkSf(); live.lock = true; st.think = true; aiPaint(); setTimeout(() => { if (!live || st.game !== "ai") return; askEngine({ type: "move", fen: live.c.fen(), level: st.level }, (r) => { if (!live || st.game !== "ai" || r.type !== "move") return; const m = live.c.move({ from: r.from, to: r.to, promotion: r.promotion || "q" }); live.last = [m.from, m.to]; Snd.move(m, live.c); st.think = false; live.lock = false; if (!aiEnd()) aiPaint(); }); }, 200); }

function aiThinkSf() {
  const me = st, L = live, [skill, depth, ms] = SFL[st.level]; L.lock = true; st.think = true; aiPaint();
  Sf.analyse(L.c.fen(), { skill, depth, ms }).then((l) => {
    if (st !== me || live !== L) return; const m = l.length ? L.c.move(uciMv(l[0].pv[0])) : null; if (!m) { st.think = false; L.lock = false; return aiPaint(); }
    L.last = [m.from, m.to]; Snd.move(m, L.c); st.think = false; L.lock = false; if (!aiEnd()) aiPaint();
  }).catch(() => { if (st !== me) return; me.msg = "Stockfish could not load, so the small engine took over."; me.level = 3; aiThink(); });
}
function aiTick() { if (st.game !== "ai" || !live || st.over) return clearInterval(st.timer); const now = performance.now(), turn = live.c.turn(); st.ms[turn] -= now - st.last; st.last = now; document.querySelectorAll("[data-clk-side]").forEach((el) => { el.textContent = fmtClk(st.ms[el.dataset.clkSide]); el.classList.toggle("low", st.ms[el.dataset.clkSide] < 20000); });
  if (st.ms[turn] <= 0) { st.ms[turn] = 0; const youLost = turn === live.color, rec = store.get("ai_rec", { w: 0, d: 0, l: 0 }); youLost ? rec.l++ : rec.w++; store.set("ai_rec", rec); st.over = { won: !youLost, lost: youLost, why: "on time" }; live.lock = true; clearInterval(st.timer); Snd.end(!youLost); aiPaint(); } }
function aiEnd() {
  const c = live.c; if (!c.game_over()) return false; const rec = store.get("ai_rec", { w: 0, d: 0, l: 0 }), mate = c.in_checkmate(), won = mate && c.turn() !== live.color, lost = mate && c.turn() === live.color;
  won ? rec.w++ : lost ? rec.l++ : rec.d++; store.set("ai_rec", rec); st.over = { won, lost, why: mate ? "by checkmate" : c.in_stalemate() ? "by stalemate" : c.insufficient_material() ? "by insufficient material" : c.in_threefold_repetition() ? "by repetition" : "by the 50-move rule" }; live.lock = true; Snd.end(won); Voice.say(won ? "You win" : lost ? "You lost" : "Draw"); aiPaint(); return true;
}
function aiPaint() {
  const rec = store.get("ai_rec", { w: 0, d: 0, l: 0 }), L = live, c = L.c, opp = L.color === "w" ? "b" : "w", o = st.over;
  const bars = { top: pbar("robot", LVL[st.level], st.level >= 4 ? "Thinks with Stockfish" : "Thinks with a small engine", c, opp, st.clockSecs ? st.ms[opp] : 0), bottom: pbar("user", "You", L.color === "w" ? "White" : "Black", c, L.color, st.clockSecs ? st.ms[L.color] : 0) };
  const over = o ? `<div class="endov ${o.won ? "win" : o.lost ? "loss" : "draw"}">${o.won ? Array.from({ length: 26 }, (_, i) => `<i class="conf" style="left:${(i * 37) % 100}%;background:${["#e8c35a", "#5ee6a8", "#ff8a3d", "#fff"][i % 4]};animation-delay:${(i % 9) * 0.18}s"></i>`).join("") : ""}${endTop(o.won ? "win" : o.lost ? "loss" : "draw")}<h3>${o.won ? "You win!" : o.lost ? "You lost" : "A draw"}</h3><p class="fine" style="color:#ddd">${o.why}</p>${endCoach(o.won ? "win" : o.lost ? "loss" : "draw")}<div class="row" style="justify-content:center"><button class="btn" id="aiReview">${ic("chart")}Game review</button><button class="btn ghost" id="aiAgain">Rematch</button><button class="btn ghost" data-go="home">Menu</button></div></div>` : "";
  liveRender(backRow("Play the coaches", "robot", `Record ${rec.w}-${rec.d}-${rec.l}`), `<div class="row" style="justify-content:center;margin-top:8px"><span class="fine">${st.think ? `${esc(LVL[st.level].split(",")[0])} is thinking…` : c.in_check() ? "Check!" : o ? "" : L.color === c.turn() ? "Your move." : ""}</span><button class="btn ghost" id="aiNew">New game</button></div>`, bars, { over });
}
/* ---------- Game review: real Stockfish (version 10, loaded from a CDN on first use), move by move ---------- */
const SF_URL = "https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js";
/* Stockfish 17.1 lite (NNUE, single-threaded, GPL-3, docs/engine/), served from this site; Stockfish 10 from the CDN is the fallback */
const SF17_URL = new URL("../engine/stockfish-17.1-lite-single.js", location.href).href;
let SF_MODERN = location.protocol !== "file:";
const mkSf = () => {
  let w = null, dead = false, cur = null, ready = null, pend = 0; const queue = [];
  const boot = () => {
    if (ready) return ready;
    ready = new Promise((res) => {
      const legacy = () => new Worker(URL.createObjectURL(new Blob([`importScripts("${SF_URL}");`], { type: "text/javascript" })));
      let modern = SF_MODERN; try { w = modern ? new Worker(SF17_URL) : legacy(); } catch (e) { try { modern = SF_MODERN = false; w = legacy(); } catch (e2) { dead = true; return res(false); } }
      const fallback = () => { if (!modern) return false; modern = SF_MODERN = false; try { w.terminate(); } catch (e) { /* gone */ } ready = null; boot().then(res); return true; };   // Stockfish 17 missing (private copy) or refused: use Stockfish 10
      const to = setTimeout(() => { if (!fallback()) { dead = true; res(false); } }, modern ? 20000 : 30000);
      w.onmessage = (e) => { const s = String(e.data); if (s === "uciok") { if (modern) w.postMessage("setoption name Hash value 32"); else { w.postMessage("setoption name Contempt value 0"); w.postMessage("setoption name Analysis Contempt value Off"); } w.postMessage("isready"); } else if (s === "readyok") { clearTimeout(to); res(true); } else onLine(s); };
      w.onerror = () => { clearTimeout(to); if (fallback()) return; dead = true; res(false); if (cur) { const c = cur; cur = null; c.rej(new Error("engine")); } };
      w.postMessage("uci");
    });
    return ready;
  };
  function onLine(s) {
    if (!cur) return;
    if (s.startsWith("info") && / pv /.test(s)) {
      const mp = +((s.match(/multipv (\d+)/) || [0, 1])[1]), d = +((s.match(/ depth (\d+)/) || [0, 0])[1]), sc = s.match(/score (cp|mate) (-?\d+)/), pv = s.split(" pv ")[1].trim().split(" ");
      if (sc) cur.lines[mp - 1] = { cp: sc[1] === "cp" ? +sc[2] : null, mate: sc[1] === "mate" ? +sc[2] : null, pv, depth: d };
    } else if (s.startsWith("bestmove")) { const c = cur; cur = null; c.res(c.lines.filter(Boolean)); next(); }
  }
  function next() {
    if (cur || !queue.length || dead) return; cur = queue.shift();
    w.postMessage("setoption name Skill Level value " + (cur.o.skill == null ? 20 : cur.o.skill)); w.postMessage("setoption name MultiPV value " + cur.o.multipv); w.postMessage("position fen " + cur.fen); w.postMessage("go " + (cur.o.depth ? "depth " + cur.o.depth + " " : "") + "movetime " + (cur.o.ms || 400));
  }
  return {
    load: () => pend,
    analyse(fen, o = {}) { pend++; return boot().then((ok) => { if (!ok) { pend--; throw new Error("engine"); } return new Promise((res, rej) => { queue.push({ fen, o: { multipv: 1, ...o }, lines: [], res: (v) => { pend--; res(v); }, rej: (e) => { pend--; rej(e); } }); next(); }); }, (e) => { pend--; throw e; }); },
    stopAll() { queue.splice(0).forEach((x) => x.rej(new Error("stop"))); if (cur && w) w.postMessage("stop"); },
  };
};
const Sf = (() => {
  const n = Math.max(1, Math.min(innerWidth < 700 ? 2 : 3, (navigator.hardwareConcurrency || 4) - 2)), ws = Array.from({ length: n }, mkSf);
  return { analyse(fen, o) { return ws.reduce((a, b) => (b.load() < a.load() ? b : a)).analyse(fen, o); }, stopAll() { ws.forEach((x) => x.stopAll()); } };
})();
const MATE_CP = 100000;
const wpct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1);
const lineW = (ln, turn) => { const sg = turn === "w" ? 1 : -1; if (ln.mate != null) { const m = sg * ln.mate; return { mate: m, cp: m > 0 ? MATE_CP - m : -MATE_CP - m, w: m > 0 ? 100 : 0, pv: ln.pv, depth: ln.depth }; } const cp = sg * ln.cp; return { mate: null, cp, w: wpct(cp), pv: ln.pv, depth: ln.depth }; };
const fmtEv = (e) => (!e ? "…" : e.term ? e.term : e.mate != null ? (e.mate > 0 ? "M" : "-M") + Math.abs(e.mate) : (e.cp > 0 ? "+" : e.cp < 0 ? "-" : "") + Math.abs(e.cp / 100).toFixed(1));
const RVC = { brilliant: ["Brilliant", "!!", "a brilliant move"], great: ["Great move", "!", "a great move"], best: ["Best", "★", "the best move"], excellent: ["Excellent", "✓", "an excellent move"], good: ["Good", "✓", "a good move"], book: ["Book", `<svg class="bkic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5c-.8 0-1.5.5-1.5 1.2V5.5Z" fill="currentColor"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5.5 1.5 1.2V5.5Z" fill="currentColor" opacity=".8"/></svg>`, "a book move"], inaccuracy: ["Inaccuracy", "?!", "an inaccuracy"], mistake: ["Mistake", "?", "a mistake"], miss: ["Miss", "✗", "a miss"], blunder: ["Blunder", "??", "a blunder"], forced: ["Forced", "□", "the only legal move"] };
const RVORDER = ["brilliant", "great", "best", "excellent", "good", "book", "forced", "inaccuracy", "mistake", "miss", "blunder"];
const uciMv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const uciSan = (fen, u) => { const m = new Chess(fen).move(uciMv(u)); return m ? m.san : u; };
const matOf = (c, col) => { let s = 0; c.board().forEach((r) => r.forEach((p) => { if (p && p.type !== "k") s += (p.color === col ? 1 : -1) * PV[p.type]; })); return s; };
function rvGain(fen, pv, plies, col) { const c = new Chess(fen), m0 = matOf(c, col); for (let k = 0; k < plies && k < pv.length; k++) if (!c.move(uciMv(pv[k]))) break; return matOf(c, col) - m0; }
function pvLine(fen, pv, n) {
  const c = new Chess(fen); let num = +fen.split(" ")[5] || 1, w = c.turn() === "w"; const out = [];
  for (let k = 0; k < Math.min(n, pv.length); k++) { const m = c.move(uciMv(pv[k])); if (!m) break; out.push((w ? num + ". " : k === 0 ? num + "... " : "") + m.san); if (!w) num++; w = !w; }
  return out.join(" ");
}
let BOOKMAP = null;
function bookMap() {
  if (BOOKMAP) return BOOKMAP; BOOKMAP = new Map();
  OPEN.forEach((o) => { const t = (o.pgn || "").replace(/\d+\./g, " ").split(/\s+/).filter(Boolean); for (let k = 1; k <= t.length; k++) { const key = t.slice(0, k).join(" "); if (!BOOKMAP.has(key) || k === t.length) BOOKMAP.set(key, o.name); } });
  return BOOKMAP;
}
const LOOKS = [["auto", "Auto"], ["cyber", "Cyber"], ["classic", "Classic"], ["light", "Light"]], lookNow = () => { try { return localStorage.getItem("bkc_look") || "auto"; } catch (e) { return "auto"; } };
/* ---------- first visit: pick a look (the Look button at the top changes it later) ---------- */
const CTP = [["cyber", "Cyber", "Neon glow on a dark board", ["#0a0f1f", "#3ef2ff", "#141b33"]], ["classic", "Classic", "Gold and deep green, like a club at night", ["#0e1411", "#e8c35a", "#16201b"]], ["light", "Light", "Warm paper and ink", ["#f2efe7", "#9a6200", "#fffdf8"]]];
function chessThemePick() {
  let picked = "1"; try { picked = localStorage.getItem("bkc_picked"); } catch (e) { /* blocked */ } if (picked) return;
  const m = Object.assign(document.body.appendChild(document.createElement("div")), { id: "ctp", className: "cmodal" });
  m.innerHTML = `<div class="sheet" style="max-width:560px"><h2>${ic("crown")}Pick your look</h2><div class="ctpip">${pipSVG("happy")}<div class="pipsay"><b>${esc(coachName())}</b>${esc(pipPick("start", 0))}</div></div><p class="fine">Tap a look to preview it. The Look button at the top changes it any time.</p><div class="tpgrid">${CTP.map(([k, n, d, c]) => `<button type="button" class="tpopt" data-ctp="${k}" aria-pressed="${lookNow() === k}"><span class="tpprev" style="--a:${c[0]};--b:${c[1]};--c:${c[2]}"><i></i><i></i><i></i></span><b>${n}</b><small>${d}</small></button>`).join("")}</div><h3 style="margin:16px 0 0">Pick your coach</h3><div class="tpgrid">${Object.entries(COACHES).map(([k, c]) => `<button type="button" class="tpopt" data-coach="${k}" aria-pressed="${coachId() === k}"><span class="tpprev" style="display:grid;place-items:center;background:var(--panel)">${k === "pip" ? pipSVGRaw("happy") : COACH_SVG[k]("happy")}</span><b>${c.name}</b><small>${c.blurb}</small></button>`).join("")}</div><label class="tpauto"><input type="checkbox" id="ctpAuto"> Follow my device's light and dark mode</label><div class="row" style="margin-top:12px"><button class="btn" id="ctpGo" type="button">Let's go</button></div></div>`;
}
document.addEventListener("click", (e) => {
  const o = e.target.closest && e.target.closest("[data-ctp]");
  if (o) { const k = o.dataset.ctp; try { localStorage.setItem("bkc_look", k); } catch (er) { /* blocked */ } document.documentElement.setAttribute("data-theme", lookResolve(k)); thPaint(); document.querySelectorAll("[data-ctp]").forEach((x) => x.setAttribute("aria-pressed", x === o)); return; }
  const co = e.target.closest && e.target.closest("[data-coach]"); if (co) { try { localStorage.setItem("bkc_coach", co.dataset.coach); } catch (er) { /* blocked */ } document.querySelectorAll("[data-coach]").forEach((x) => x.setAttribute("aria-pressed", x === co)); const pk = document.querySelector("#ctp .ctpip"); if (pk) pk.innerHTML = `${pipSVG("happy")}<div class="pipsay"><b>${esc(coachName())}</b>${esc(pipPick("start", 0))}</div>`; pipSay(pipPick("start", 0)); return; }
  if (e.target.id === "ctpGo") { if (document.getElementById("ctpAuto")?.checked) { try { localStorage.setItem("bkc_look", "auto"); } catch (er) { /* blocked */ } document.documentElement.setAttribute("data-theme", lookResolve("auto")); thPaint(); } try { localStorage.setItem("bkc_picked", "1"); } catch (er) { /* blocked */ } document.getElementById("ctp")?.remove(); }
});
const thPaint = () => { const l = document.getElementById("thLab"); if (l) l.textContent = "Look: " + (LOOKS.find((x) => x[0] === lookNow()) || LOOKS[0])[1]; };
try { matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (lookNow() === "auto") { document.documentElement.setAttribute("data-theme", lookResolve("auto")); } }); } catch (e) { /* old browser */ }
{ const L = document.createElement("div"); L.id = "cyb"; L.innerHTML = "<i></i>"; document.body.appendChild(L); thPaint(); }
let rv = null, RVTOK = 0;
function rvStop() { if (!rv) return; clearInterval(rv.timer); RVTOK++; Sf.stopAll(); rv = null; }
function reviewStart(sans, color, o = {}) {
  clearInterval(st.timer); live = null; rvStop(); st = { game: "review" };
  const c = new Chess(), mv = [], fen = [c.fen()]; for (const s of sans) { const m = c.move(s); if (!m) break; mv.push(m); fen.push(c.fen()); }
  const bm = bookMap(), book = [false], openName = [""]; { let name = ""; for (let i = 1; i <= mv.length; i++) { const nm = i <= 24 ? bm.get(mv.slice(0, i).map((m) => m.san).join(" ")) : null; if (nm) name = nm; book[i] = !!nm; openName[i] = name; } }
  rv = { speed: o.speed || "", sans: mv.map((m) => m.san), mv, fen, N: mv.length, color: color || "w", flip: color === "b", names: o.names || ["White", "Black"], from: o.from || "pgn", result: o.result || "", i: 0, pos: [], data: [], book, openName, tok: ++RVTOK, showBest: store.get("rv_best", true), c: new Chess(), L: { lastKey: "", skipAnim: true, flipped: false }, done: false, failed: false, timer: null };
  $("#app").className = "fresh"; rvShell(); rvGo(0, { sound: false }); rvAnalyse(rv.tok); rvTheory(rv.tok);
}
/* theory from the masters database: a move counts as book while at least 5 master games played it from that position */
async function rvTheory(tok) {
  rv.mN = rv.mN || {}; let name = "";
  for (let i = 1; i <= Math.min(rv.N, 60); i++) {
    if (!rv || rv.tok !== tok) return; const d = await exFetch(rv.fen[i - 1]); if (!rv || rv.tok !== tok) return; if (!d) return;
    const m = d.moves.find((x) => x.san === rv.sans[i - 1]), n = m ? m.white + m.draws + m.black : 0; if (n < 5) break;
    rv.mN[i] = n; if (m.opening && m.opening.name) name = m.opening.name; const was = rv.book[i]; rv.book[i] = true; if (name) rv.openName[i] = name;
    if (!was && rv.pos[i] && rv.pos[i - 1] && rv.data[i - 1]) { rv.data[i - 1] = rvDerive(i); rvList(i); }
  }
  if (!rv || rv.tok !== tok) return; const lb = rv.book.lastIndexOf(true); for (let i = lb + 1; i <= rv.N; i++) if (name) rv.openName[i] = name;   /* the deepest name carries on */
  rv.theoryDone = true; rvSummary(); rvGraph(); const co = rvEl("rvCoach"); if (co) co._h = null; rvPaint(); if (rv.done) rvReport();
}
async function rvAnalyse(tok) {
  const jobs = rv.fen.map((fen) => (new Chess(fen).game_over() ? null : Sf.analyse(fen, SF_MODERN ? { multipv: 3, depth: 18, ms: 4000 } : { multipv: 2, depth: 12, ms: 2200 }).catch(() => "fail")));
  for (let i = 0; i <= rv.N; i++) {
    if (!rv || rv.tok !== tok) return;
    const c = new Chess(rv.fen[i]); let pos;
    if (c.in_checkmate()) { const whiteWon = c.turn() === "b"; pos = { lines: [], ev: { mate: 0, cp: whiteWon ? MATE_CP : -MATE_CP, w: whiteWon ? 100 : 0, term: whiteWon ? "1-0" : "0-1" } }; }
    else if (c.game_over()) pos = { lines: [], ev: { mate: null, cp: 0, w: 50, term: "½-½" } };
    else {
      const ln = await jobs[i]; if (!rv || rv.tok !== tok) return;
      if (ln === "fail" || !ln.length) { rv.failed = true; rvProg(); return; }
      const lines = ln.map((x) => lineW(x, c.turn())); pos = { lines, ev: lines[0] };
    }
    rv.pos[i] = pos; if (i > 0) rv.data[i - 1] = rvDerive(i);
    rvProg(); rvList(i); rvGraph(); rvSummary(); if (i === rv.i || i === rv.i + 1) rvPaint();
  }
  if (rv && rv.tok === tok) { rv.done = true; rvProg(); rvSummary(); rvTab("report"); const l = rv.data.filter((x) => x && x.cls !== "book"), a = l.length ? l.reduce((q, x) => q + x.acc, 0) / l.length : 0; pipSay(pipPick(a >= 85 ? "great_game" : a >= 70 ? "ok_game" : "rough_game", rv.N)); }
}
function rvSac(i) {
  const c = new Chess(rv.fen[i - 1]), col = i % 2 === 1 ? "w" : "b", m0 = matOf(c, col); c.move(rv.mv[i - 1]);
  const pv = rv.pos[i].lines[0] ? rv.pos[i].lines[0].pv : []; for (let k = 0; k < 2 && k < pv.length; k++) if (!c.move(uciMv(pv[k]))) break;
  return m0 - matOf(c, col);
}
/* ---------- Pip, the ballknowledge coach ----------
   A pawn who has spent his whole life six squares from promotion. Funny on the surface, a little deeper underneath.
   His spoken lines are a fixed bank (src/voice_lines.json "pip") turned into Kokoro clips by src/80_make_voice.py,
   so he speaks instantly; the move explanation underneath stays written. */
const PIP = {
  brilliant: ["Brilliant! You gave something up and got more back. I think about that a lot. Sometimes you have to let go of something to move forward.", "Wow. A sacrifice that works. I'd sacrifice myself too, if it meant something.", "That is the kind of move people remember. Most of us just want to be remembered for one good move."],
  great: ["Great move. The only one that worked. Funny how often there's only one right door, and we spend years knocking on the others.", "Only move, and you found it. Under pressure, too. Be proud of that one.", "Great find. Everything else lost something. You didn't."],
  best: ["Best move. Even the engine nods. I'm just a pawn, but I know greatness when I see it. Usually from very far down the board.", "Top choice. Clean and correct. If life had an engine, I'd want it to say that about me.", "Best move. No notes. I wish someone said that to me once."],
  excellent: ["Excellent. Not perfect, but honestly, who is?", "Very close to best. Close is good. Close is where most of us live.", "Excellent move. Tiny bit better existed, but you're doing great."],
  good: ["Good move. Solid. Like me. Nobody notices solid until it's gone.", "A good, honest move. Not flashy. Flashy is overrated.", "Good. Not the best, but it keeps everything together."],
  book: ["Book move. People have played this for a hundred years. Following the path is fine. Just don't forget you can leave it.", "Still in the book. Everyone starts by copying someone.", "Theory. Safe and known. The interesting part of your story starts later."],
  inaccuracy: ["An inaccuracy. Small slips add up. Ask me how I know. I've been one square from promotion for six years.", "Hmm. Not quite. It's fine, nobody plays a whole game without a wobble.", "A little inaccurate. The better move was hiding. They usually are."],
  mistake: ["A mistake. It's okay. Pawns can't move backwards, so I've learned to just keep going.", "Ouch, a mistake. The board doesn't hold grudges. Try not to either.", "That one hurt a bit. Mistakes are just the board's way of teaching. Rude teacher, though."],
  miss: ["A miss! The chance was right there. Most chances don't knock twice. But some do. Stay ready.", "You missed it. Your opponent gave you a gift and you left it on the table. We all do that, more than we admit.", "Missed chance. Don't beat yourself up. Look at it, learn it, and next time you'll see it."],
  blunder: ["Oof. A blunder. I've seen pawns cry over less. Breathe. It's only a game. Mostly.", "Blunder. One move, and everything changes. Strange how fragile things are.", "That's a blunder. Don't close the review. The players who get better are the ones who look at moments like this."],
  start: ["Hi, I'm Pip. I'm a pawn. My dream is to reach the other side and become a queen. Let's look at your game while I keep walking.", "Pip here. Let's go through it together, one move at a time. That's how I do everything."],
  mate: ["Checkmate. Somewhere a king is lying down very quietly.", "And that's mate. Games end. That's what makes them matter."],
  great_game: ["What a game. If I played like that, I'd already be a queen.", "That was strong chess. Remember how this felt. You'll need it on the bad days."],
  ok_game: ["A decent game, with some good and some not so good. Pretty much like everything else.", "Not bad at all. A few slips, but you kept walking. That's the whole trick."],
  rough_game: ["Rough game. But every grandmaster lost hundreds of these. The only real loss is never looking back at it, and you're looking back right now.", "That one didn't go well. That's okay. I've been stuck on the same square for years, and I'm still here."],
};
const coachId = () => { try { const c = localStorage.getItem("bkc_coach"); return COACHES[c] ? c : "pip"; } catch (e) { return "pip"; } };
const coachName = () => COACHES[coachId()].name;
const pipPick = (k, seed) => { const c = coachId(), L = c === "pip" ? [...(PIP[k] || []), ...((COACH_LINES.pip || {})[k] || [])] : (COACH_LINES[c] || {})[k] || []; const A = L.length ? L : c === "pip" ? PIP.good : COACH_LINES[c].good; return A[Math.abs(seed | 0) % A.length]; };
/* one fun fact per opening, the first time its name shows up in the review */
const storyFact = (f) => (f.startsWith("Fun fact") ? f : "Fun fact: " + f);   /* the exact wording the voice clips were made from */
function rvFact(i) {   /* book moves walk through the opening's story: the name, the idea, then the facts and a famous game, a new one each move */
  const nm = rv.openName[i]; if (!nm) return null; rv.storyAt = rv.storyAt || {}; if (rv.storyAt[i] !== undefined) return rv.storyAt[i];
  const S = openStory(nm); let items;
  if (S) { const G = S.game && OPEN_GAMES[S.game]; items = [S.origin, "The idea: " + S.idea, ...S.facts.map(storyFact), ...(G ? [`A famous game in this opening: ${G.title}, ${G.who}, ${G.when}. ${G.note}`] : [])]; }
  else { const f = openFact(nm); items = f ? [f] : []; }
  rv.storyK = rv.storyK || {}; const key = S ? S.name : nm, k = rv.storyK[key] || 0; rv.storyK[key] = k + 1;
  return (rv.storyAt[i] = items[k] || null);
}
const rvLineKey = (d) => { if (d.san.endsWith("#")) return "mate"; if (d.cls !== "brilliant") return d.cls; const sc = (rv.sac || {})[d.i] || {}; return sc.under ? "underpromo" : sc.piece === "q" ? "brilliant_q" : sc.piece === "r" ? "brilliant_r" : sc.piece ? "brilliant_minor" : "brilliant"; };
const PIP_MOOD = { brilliant: "wow", great: "wow", best: "happy", excellent: "happy", good: "calm", book: "calm", inaccuracy: "hmm", mistake: "sad", miss: "hmm", blunder: "shock", start: "happy", mate: "wow", great_game: "wow", ok_game: "calm", rough_game: "sad" };
function coachFace(mood, cx, cy) { const ink = "#2a1a08", e = { happy: `<path d="M${cx - 12} ${cy}q4 -5 8 0M${cx + 4} ${cy}q4 -5 8 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`, wow: `<circle cx="${cx - 8}" cy="${cy}" r="4.5" fill="${ink}"/><circle cx="${cx + 8}" cy="${cy}" r="4.5" fill="${ink}"/>`, shock: `<circle cx="${cx - 8}" cy="${cy}" r="5" fill="#fff" stroke="${ink}" stroke-width="2"/><circle cx="${cx + 8}" cy="${cy}" r="5" fill="#fff" stroke="${ink}" stroke-width="2"/>`, sad: `<path d="M${cx - 12} ${cy - 1}q4 3 8 1M${cx + 4} ${cy}q4 2 8 -1" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`, hmm: `<circle cx="${cx - 8}" cy="${cy}" r="3" fill="${ink}"/><circle cx="${cx + 8}" cy="${cy}" r="3" fill="${ink}"/><path d="M${cx + 4} ${cy - 8}l9 -2" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`, calm: `<circle cx="${cx - 8}" cy="${cy}" r="3" fill="${ink}"/><circle cx="${cx + 8}" cy="${cy}" r="3" fill="${ink}"/>` }[mood] || "", m = { happy: `<path d="M${cx - 8} ${cy + 10}q8 8 16 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`, wow: `<ellipse cx="${cx}" cy="${cy + 12}" rx="5" ry="6" fill="${ink}"/>`, shock: `<ellipse cx="${cx}" cy="${cy + 13}" rx="4" ry="5" fill="${ink}"/>`, sad: `<path d="M${cx - 7} ${cy + 15}q7 -6 14 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`, hmm: `<path d="M${cx - 6} ${cy + 12}h11" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`, calm: `<path d="M${cx - 6} ${cy + 11}q6 4 12 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>` }[mood] || ""; return e + m; }
const COACH_SVG = {
  vera: (md) => `<svg class="pip ${md}" viewBox="0 0 100 120" aria-hidden="true"><defs><linearGradient id="vrg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f6e7ff"/><stop offset="1" stop-color="#b48be0"/></linearGradient></defs><ellipse cx="50" cy="114" rx="30" ry="5" fill="#000" opacity=".18"/><path d="M20 108h60l-6-14H26z" fill="url(#vrg)" stroke="#4b2a6e" stroke-width="2.5"/><path d="M28 94c2-14 8-22 10-30h24c2 8 8 16 10 30z" fill="url(#vrg)" stroke="#4b2a6e" stroke-width="2.5"/><circle cx="50" cy="50" r="24" fill="url(#vrg)" stroke="#4b2a6e" stroke-width="2.5"/><path d="M26 34l6-18 9 12 9-16 9 16 9-12 6 18z" fill="#f2c14e" stroke="#7a5a10" stroke-width="2.5" stroke-linejoin="round"/>${[32, 41, 50, 59, 68].map((x, k) => `<circle cx="${x}" cy="${k % 2 ? 22 : 16}" r="3" fill="#e84a5f"/>`).join("")}${coachFace(md, 50, 50)}</svg>`,
  bea: (md) => `<svg class="pip ${md}" viewBox="0 0 100 120" aria-hidden="true"><defs><linearGradient id="bag" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#e9fbf3"/><stop offset="1" stop-color="#7cc6a5"/></linearGradient></defs><ellipse cx="50" cy="114" rx="30" ry="5" fill="#000" opacity=".18"/><path d="M22 108h56l-6-14H28z" fill="url(#bag)" stroke="#1f5a45" stroke-width="2.5"/><path d="M32 94c0-12 6-20 8-26h20c2 6 8 14 8 26z" fill="url(#bag)" stroke="#1f5a45" stroke-width="2.5"/><path d="M50 10c18 10 26 26 24 42c-2 14-12 20-24 20s-22-6-24-20c-2-16 6-32 24-42z" fill="url(#bag)" stroke="#1f5a45" stroke-width="2.5"/><path d="M58 18l-14 22" stroke="#1f5a45" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="8" r="5" fill="url(#bag)" stroke="#1f5a45" stroke-width="2.5"/>${coachFace(md, 50, 50)}</svg>`,
};
function pipSVGRaw(mood) { const c = localStorage.getItem("bkc_coach"); try { localStorage.setItem("bkc_coach", "pip"); return pipSVG(mood); } finally { try { if (c) localStorage.setItem("bkc_coach", c); else localStorage.removeItem("bkc_coach"); } catch (e) { /* blocked */ } } }
function pipSVG(mood = "calm") {
  if (coachId() !== "pip") return COACH_SVG[coachId()](mood);
  const eyes = { happy: '<path d="M38 50q4-5 8 0M54 50q4-5 8 0" class="pe"/>', wow: '<circle cx="42" cy="49" r="4.5" class="pf"/><circle cx="58" cy="49" r="4.5" class="pf"/><circle cx="43.5" cy="47.5" r="1.5" fill="#fff"/><circle cx="59.5" cy="47.5" r="1.5" fill="#fff"/>', shock: '<circle cx="42" cy="49" r="5" fill="#fff" class="pe"/><circle cx="58" cy="49" r="5" fill="#fff" class="pe"/><circle cx="42" cy="50" r="2" class="pf"/><circle cx="58" cy="50" r="2" class="pf"/>', sad: '<path d="M38 48q4 3 8 1M54 49q4 2 8-1" class="pe"/>', hmm: '<circle cx="42" cy="49" r="3" class="pf"/><circle cx="58" cy="49" r="3" class="pf"/><path d="M54 42l9-2" class="pe"/>', calm: '<circle cx="42" cy="49" r="3" class="pf"/><circle cx="58" cy="49" r="3" class="pf"/>' }[mood] || "";
  const mouth = { happy: '<path d="M42 60q8 8 16 0" class="pe"/>', wow: '<ellipse cx="50" cy="61" rx="5" ry="6" class="pf"/>', shock: '<ellipse cx="50" cy="62" rx="4" ry="5" class="pf"/>', sad: '<path d="M43 64q7-6 14 0" class="pe"/>', hmm: '<path d="M44 62h11" class="pe"/>', calm: '<path d="M44 60q6 4 12 0" class="pe"/>' }[mood] || "";
  const cheeks = mood === "happy" || mood === "wow" ? '<circle cx="36" cy="57" r="4" fill="#ff9a8a" opacity=".55"/><circle cx="64" cy="57" r="4" fill="#ff9a8a" opacity=".55"/>' : "";
  const tear = mood === "sad" ? '<path d="M61 53q2 4 0 6q-2-2 0-6z" fill="#7cc6ff"/>' : "";
  const sweat = mood === "shock" ? '<path d="M70 38q3 5 0 7q-3-2 0-7z" fill="#7cc6ff"/>' : "";
  return `<svg class="pip ${mood}" viewBox="0 0 100 120" aria-hidden="true"><defs><linearGradient id="pipg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff3cf"/><stop offset="1" stop-color="#e8c35a"/></linearGradient></defs>
    <ellipse cx="50" cy="114" rx="30" ry="5" fill="#000" opacity=".18"/>
    <path d="M22 108h56l-6-14H28z" fill="url(#pipg)" stroke="#6b4e10" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M30 94c2-12 8-18 8-18h24s6 6 8 18z" fill="url(#pipg)" stroke="#6b4e10" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="50" cy="52" r="26" fill="url(#pipg)" stroke="#6b4e10" stroke-width="2.5"/>
    <path d="M28 40q22-22 44 0" fill="none" stroke="#c0392b" stroke-width="5" stroke-linecap="round"/><path d="M68 39l10 10" stroke="#c0392b" stroke-width="5" stroke-linecap="round"/>
    ${cheeks}${eyes}${mouth}${tear}${sweat}</svg>`;
}
/* Pip pops into the corner on results across the chess page */
const PIP_POP = { "You win": ["wow", "You won! I'm going to tell every pawn I know."], "You lost": ["sad", "A loss. I've lost more games than I can count, and I still get up every morning and step forward."], "Draw": ["calm", "A draw. Nobody won, nobody lost. Sometimes that's exactly right."], "Checkmate": ["wow", "Checkmate. Somewhere a king is lying down very quietly."], "All three dailies done": ["happy", "All three dailies done! Same time tomorrow? I'll save you a square."] };
let pipT = null;
function pipPop(text, mood = "happy") {
  let el = document.getElementById("pipc"); if (!el) { el = Object.assign(document.body.appendChild(document.createElement("div")), { id: "pipc" }); el.setAttribute("role", "status"); el.addEventListener("click", () => el.classList.remove("on")); }
  el.innerHTML = `${pipSVG(mood)}<div class="pipsay"><b>${esc(coachName())}</b>${esc(text)}</div>`; el.classList.add("on", "talk"); clearTimeout(pipT); pipT = setTimeout(() => { el.classList.remove("talk"); el.innerHTML = pipSVG("calm"); }, Math.min(10000, 3200 + text.length * 50));
}
/* ---------- moments: a burst on right answers, a shake on wrong ones, streak banners and the end of a game ---------- */
const CFX = (() => {
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches; let px = innerWidth / 2, py = innerHeight / 2, lastStreak = 0;
  addEventListener("pointerdown", (e) => { px = e.clientX; py = e.clientY; }, { capture: true, passive: true });
  const add = (cls, html, at, ms) => { const e = document.createElement("div"); e.className = cls; e.innerHTML = html; e.setAttribute("aria-hidden", "true"); if (at) { e.style.left = at[0] + "px"; e.style.top = at[1] + "px"; } document.body.appendChild(e); setTimeout(() => e.remove(), ms); };
  const cols = ["--ok", "--gold", "--light", "--ok"];
  const burst = () => { let h = "<b></b>"; for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, d = 60 + Math.random() * 70; h += `<i style="--c:var(${cols[k % 4]});--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d).toFixed(0)}px"></i>`; } add("fx-burst", h, [px, py], 900); };
  const confetti = () => { let h = ""; for (let k = 0; k < 44; k++) h += `<i style="left:${(Math.random() * 100).toFixed(1)}%;--c:var(${cols[k % 4]});--x:${((Math.random() - 0.5) * 240).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;animation-delay:${(Math.random() * 0.4).toFixed(2)}s"></i>`; add("fx-conf", h, null, 2800); };
  const shake = () => { const el = document.querySelector("#app > .card") || document.querySelector("#app .card"); if (!el) return; el.classList.remove("fx-shake"); void el.offsetWidth; el.classList.add("fx-shake"); setTimeout(() => el.classList.remove("fx-shake"), 520); };
  const banner = (a, b) => { document.querySelectorAll(".fx-banner").forEach((e) => e.remove()); add("fx-banner", `${a}<small>${b}</small>`, null, 2000); confetti(); };
  const M = { 3: ["3 in a row", "Heating up"], 5: ["5 in a row", "On fire"], 10: ["10 in a row", "Unstoppable"], 15: ["15 in a row", "Grandmaster vibes"], 20: ["20 in a row", "Legendary"] };
  const api = {
    right() { if (RM) return; burst(); setTimeout(() => { const n = st && st.streak; if (n && n !== lastStreak && (M[n] || (n > 20 && n % 5 === 0))) { lastStreak = n; const m = M[n] || [n + " in a row", "Legendary"]; banner(m[0], m[1]); pipPop(pipPick("great", n), "wow"); } else if (!n) lastStreak = 0; }, 30); },
    wrong() { lastStreak = 0; shake(); },
    end(win) { if (win) { if (!RM) confetti(); } else shake(); },
  };
  const ok0 = Snd.ok.bind(Snd), bad0 = Snd.bad.bind(Snd), end0 = Snd.end.bind(Snd);
  Snd.ok = function () { api.right(); return ok0(); }; Snd.bad = function () { api.wrong(); return bad0(); }; Snd.end = function (w) { api.end(w); return end0(w); };
  return api;
})();
/* the coach waits in the corner from the start, like the sidekicks in the other sports; the review shows it in its panel instead */
setInterval(() => { let el = document.getElementById("pipc"); if (!el) { if (!document.getElementById("app") || document.getElementById("splash") || document.getElementById("ctp")) return; el = Object.assign(document.body.appendChild(document.createElement("div")), { id: "pipc" }); el.setAttribute("role", "status"); el.addEventListener("click", () => el.classList.remove("talk")); el.innerHTML = pipSVG("calm"); el.classList.add("on"); }
  el.classList.toggle("hide", typeof st !== "undefined" && (st.game === "review" || st.game === "sim")); if (!el.classList.contains("talk") && el.dataset.coach !== coachId()) { el.dataset.coach = coachId(); el.innerHTML = pipSVG("calm"); } }, 1000);
const PIPV = { on: (() => { try { return localStorage.getItem("bk_pip_voice") !== "0"; } catch (e) { return true; } })() };
function pipSay(text) { if (!PIPV.on) return; try { if (Snd && Snd.on === false) return; } catch (e) { /* no sound object */ } AIVoice.play(text, { voice: COACHES[coachId()].voice, volume: 0.95 }); }
/* ---------- the game report: estimated rating, phases, key moments ---------- */
const RV_ELO = [[0, 100], [40, 400], [50, 700], [60, 1000], [70, 1350], [75, 1550], [80, 1800], [85, 2050], [90, 2350], [93, 2550], [95, 2700], [97, 2850], [99, 3000]];
/* Game rating from average centipawn loss (ACPL): rating ~ 3100 x e^(-ACPL/100), a regression that fits rated games
   from about 800 to 2800. Book and forced moves are left out; with few moves the estimate is pulled toward 1500,
   because a handful of moves can't prove much. */
/* Game rating, calibrated on 63,815 real Lichess games with Stockfish evaluations (src/85): a quality score from the
   average loss and the shares of blunders (300+), mistakes (100-299) and slips (50-99), turned into a rating by
   percentile (a game among the best 10% gets the rating of the top 10% of players at that speed). Near-flawless long games
   are extended upward with the typical-loss-by-rating curve, since the sample has few players above 2500. Short games are
   pulled toward the middle. The scale is Lichess's. */
const RCAL = DATA.ratecal || null;
const rvSpeed = () => { const s = String(rv.speed || "").toLowerCase(); return s.includes("bullet") ? "Bullet" : s.includes("blitz") ? "Blitz" : s.includes("classical") || s.includes("daily") || s.includes("correspondence") ? "Classical" : "Rapid"; };
function rvRate(list) {
  if (!RCAL) return rvEloCpl0(list); const L = list.filter((x) => x.cpl != null && Math.ceil(x.i / 2) > RCAL.book && x.cls !== "forced" && Math.abs(x.cpb) < 300); if (L.length < 4) return null;   /* only moves made while the game was in the balance */
  const n = L.length, acpl = L.reduce((a, x) => a + x.cpl, 0) / n, sh = (lo, hi) => L.filter((x) => x.cpl >= lo && x.cpl < hi).length / n, b = sh(300, 1e9), m = sh(100, 300), sl = sh(50, 100), sp = rvSpeed(), c = RCAL.coef;
  const q = c[0] + c[1] * Math.log(acpl + 5) + c[2] * b + c[3] * m + c[4] * sl + RCAL.speeds.slice(1).reduce((a, s2, k) => a + (s2 === sp ? c[5 + k] : 0), 0);
  const M = RCAL.maps[sp] || RCAL.maps.Rapid, qs = M.q, rs = M.r; let k = 0; while (k < 99 && qs[k + 1] < q) k++;
  let pct = q <= qs[0] ? 0 : q >= qs[100] ? 100 : k + Math.max(0, Math.min(1, (q - qs[k]) / ((qs[k + 1] - qs[k]) || 1)));
  pct = 50 + (pct - 50) * (n / (n + 8)); const j = Math.min(99, Math.floor(pct)); let r = rs[j] + (rs[j + 1] - rs[j]) * (pct - j);
  const cv = (RCAL.curve[sp] || RCAL.curve.Rapid).slice().sort((x, y) => x[0] - y[0]);
  if (n >= 20 && acpl < 15 && b === 0 && m === 0 && cv.length > 3) { const [r1, a1] = cv[cv.length - 1], [r0, a0] = cv[cv.length - 4], slope = (r1 - r0) / ((a0 - a1) || 1); r = Math.max(r, Math.min(2900, r1 + (a1 - acpl) * slope)); }
  let lo = r - 270, hi = r + 270, mid = r; const SPR = RCAL.spread;
  if (SPR && SPR.length > 2) { const x = Math.max(SPR[0][0], Math.min(SPR[SPR.length - 1][0], r)); let k2 = 0; while (k2 < SPR.length - 2 && SPR[k2 + 1][0] < x) k2++; const [c0, ...a] = SPR[k2], [c1, ...b2] = SPR[k2 + 1], t = (x - c0) / ((c1 - c0) || 1), at = (j) => a[j] + (b2[j] - a[j]) * t, sh = r - x; lo = at(0) + sh; mid = at(1) + sh; hi = at(2) + sh; }   /* where 80% of real players who played like this are rated */
  if (n < 6) { lo = mid - (mid - lo) * 1.3; hi = mid + (hi - mid) * 1.3; }   /* very few contested moves: wider still */
  return { elo: Math.round(mid / 25) * 25, acpl: Math.round(acpl), lo: Math.round(lo / 50) * 50, hi: Math.round(hi / 50) * 50, n };
}
function rvEloCpl(list) { return rvEloCpl0(list); }
function rvEloCpl0(list) { const L = list.filter((x) => x.cls !== "book" && x.cls !== "forced" && x.cpl != null); if (L.length < 4) return null; const acpl = L.reduce((a, x) => a + x.cpl, 0) / L.length, raw = 3100 * Math.exp(-acpl / 100), w = L.length / (L.length + 10); return { elo: Math.round((w * raw + (1 - w) * 1500) / 50) * 50, acpl: Math.round(acpl) }; }
function rvElo(acc) { for (let k = 1; k < RV_ELO.length; k++) if (acc <= RV_ELO[k][0]) { const [a0, e0] = RV_ELO[k - 1], [a1, e1] = RV_ELO[k]; return Math.round((e0 + (e1 - e0) * (acc - a0) / (a1 - a0)) / 50) * 50; } return 3000; }
const rvNP = (fen) => { let s = 0; for (const ch of fen.split(" ")[0]) s += { q: 9, r: 5, b: 3, n: 3, Q: 9, R: 5, B: 3, N: 3 }[ch] || 0; return s; };
function rvPhaseOf(i) { const lastBook = rv.book.lastIndexOf(true); if (rvNP(rv.fen[i - 1]) <= 26) return "end"; return i <= Math.min(30, Math.max(lastBook, 16)) ? "open" : "mid"; }
const RV_PH = [["open", "Opening"], ["mid", "Middlegame"], ["end", "Endgame"]];
const rvGrade = (a) => (a == null ? null : a >= 95 ? "best" : a >= 88 ? "excellent" : a >= 78 ? "good" : a >= 65 ? "inaccuracy" : a >= 50 ? "mistake" : "blunder");
/* the report's opening card: how far the game followed theory, where it left the main line, the story, and doors to explore it */
function rvOpeningHTML() {
  const lastBook = rv.book.lastIndexOf(true); if (lastBook < 1) return ""; const nm = rv.openName[lastBook], S = openStory(nm), G = S && S.game && OPEN_GAMES[S.game];
  let dev = ""; if (S) { const L = S.line.split(" "); let k = 0; while (k < L.length && k < rv.N && rv.sans[k] === L[k]) k++; dev = k >= L.length ? `You followed the main line all the way, ${Math.ceil(L.length / 2)} moves deep.` : k >= rv.N ? "" : k >= 2 ? `You followed the main line until move ${Math.ceil((k + 1) / 2)}, where ${esc(rv.sans[k])} was played. The main line goes ${Math.ceil((k + 1) / 2)}${k % 2 ? "..." : "."} ${esc(L[k])}.` : ""; }
  return `<div class="rvop"><span class="label">${ic("book")}Opening</span><b>${esc(nm)}</b><p class="fine">In known theory for ${Math.ceil(lastBook / 2)} move${lastBook > 2 ? "s" : ""}. ${dev}</p>${S ? `<p>${esc(S.origin)}</p>` : ""}<div class="row"><button class="btn ghost" type="button" data-rvop="explore">${ic("compass")}Explore this opening</button>${G ? `<button class="btn ghost" type="button" data-rvop="game:${S.game}">${ic("trophy")}${esc(G.title)}</button>` : ""}</div></div>`;
}
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-rvop]"); if (!t || !rv) return; const v = t.dataset.rvop;
  if (v === "explore") { const lb = rv.book.lastIndexOf(true); EX.sans = rv.sans.slice(0, Math.max(lb, 0)); EX.sel = null; EX.tab = "name"; EX.quiz = null; rvStop(); st = { game: "x" }; return explorerPage(); }
  if (v.startsWith("game:")) { st = { game: "x" }; return exClassic(v.slice(5), false); }
});
function rvReport() {
  const el = rvEl("rvRep"); if (!el) return; if (!rv.done) { el.innerHTML = ""; return; }
  const side = (w) => rv.data.filter((x) => x && x.white === w && x.cls !== "book"), accOf = (l) => (l.length ? l.reduce((s, x) => s + x.acc, 0) / l.length : null);
  const P = [true, false].map((w) => { const l = side(w), a = accOf(l); return { w, n: l.length, acc: a, elo: (rvRate(l) || {}).elo || null, acpl: (rvRate(l) || {}).acpl, lo: (rvRate(l) || {}).lo, hi: (rvRate(l) || {}).hi, ph: RV_PH.map(([k]) => accOf(l.filter((x) => rvPhaseOf(x.i) === k))) }; });
  const moments = rv.data.filter((x) => x && x.cls !== "book").sort((a, b) => b.loss - a.loss).slice(0, 3).filter((x) => x.loss >= 8);
  const shine = rv.data.filter((x) => x && (x.cls === "brilliant" || x.cls === "great")).slice(0, 3);
  const notes = [];
  P.forEach((p) => { const nm = esc(rv.names[p.w ? 0 : 1]); const ph = RV_PH.map(([k, n], j) => [n, p.ph[j]]).filter((x) => x[1] != null); if (ph.length > 1) { const best = ph.reduce((a, b) => (b[1] > a[1] ? b : a)), worst = ph.reduce((a, b) => (b[1] < a[1] ? b : a)); if (best[0] !== worst[0]) notes.push(`${nm} was strongest in the ${best[0].toLowerCase()} (${Math.round(best[1])}%) and weakest in the ${worst[0].toLowerCase()} (${Math.round(worst[1])}%).`); } });
  const swing = rv.data.find((x) => x && x.before >= 85 && x.after < 60); if (swing) notes.push(`${esc(rv.names[swing.white ? 0 : 1])} had a winning position and let it slip with ${Math.ceil(swing.i / 2)}${swing.white ? "." : "..."} ${esc(swing.san)}.`);
  const cnt = (w, k) => rv.data.filter((x) => x && x.white === w && x.cls === k).length;
  [true, false].forEach((w) => { const b = cnt(w, "blunder"); if (!b && P[w ? 0 : 1].n >= 10) notes.push(`${esc(rv.names[w ? 0 : 1])} made no blunders.`); });
  el.innerHTML = `<div class="rvrep"><div class="rvelo">${P.map((p) => `<div class="rvel ${p.w ? "" : "dk"}"><small>${esc(rv.names[p.w ? 0 : 1])}</small><b class="num">${p.elo == null ? "—" : p.elo}</b>${p.elo == null ? '<span class="fine" style="font-size:11px">decided too early to judge</span>' : ""}<span>game rating${p.lo ? ` · likely ${p.lo}–${p.hi}` : ""}</span></div>`).join("")}</div>
    <table class="rvph"><tr><th></th>${P.map((p) => `<th>${p.w ? "White" : "Black"}</th>`).join("")}</tr>${RV_PH.map(([k, n], j) => `<tr><td>${n}</td>${P.map((p) => { const g = rvGrade(p.ph[j]); return `<td>${g ? `<i class="cls ${g}" title="${Math.round(p.ph[j])}% accuracy">${RVC[g][1]}</i>` : '<span class="fine">—</span>'}</td>`; }).join("")}</tr>`).join("")}</table>
    ${notes.length ? `<ul class="rvnotes">${notes.slice(0, 4).map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}
    ${moments.length || shine.length ? `<div class="rvkm"><span class="label">Key moments</span>${[...shine, ...moments].map((x) => `<button type="button" class="rvkmb" data-ply="${x.i}"><i class="cls ${x.cls}">${RVC[x.cls][1]}</i>${Math.ceil(x.i / 2)}${x.white ? "." : "..."} ${esc(x.san)}</button>`).join("")}</div>` : ""}
    ${rvOpeningHTML()}
    ${(() => { const me = P[rv.color === "b" ? 1 : 0]; pipRemember(me.acc, me.elo); return pipMemoryHTML(me.acc); })()}
    <p class="fine">Game rating (Lichess scale, ${rvSpeed().toLowerCase()}) is calibrated on 63,815 real rated games: how much each move gives away while the game is still in the balance and how often you blunder, matched to the ratings of players who play like that. One game is a weak signal: the range is where 80% of real players who played a game like this are rated, so it is wide on purpose, and it pulls strong and weak players toward the middle. Your average over several reviews is the number to trust. Phases: opening while in theory or the first moves, endgame once most pieces are off.</p></div>`;
}
/* ---------- review, part two: engine lines, retry a mistake, your own games, and Pip's memory ---------- */
function rvEngineHTML(i) {
  const pos = rv.pos[i]; if (!pos || !pos.lines || !pos.lines.length) return "";
  const fen = rv.fen[i], c = new Chess(fen); if (c.game_over()) return "";
  return `<div class="rveng"><div class="rvengh"><span class="label">Engine</span><span class="fine">depth ${pos.lines[0].depth || "?"}</span></div>${pos.lines.slice(0, 3).map((l, k) => `<div class="rvel2 ${k ? "" : "top"}"><b class="rvev ${l.cp >= 0 ? "w" : "b"}">${fmtEv(l)}</b><span class="pvl">${esc(pvLine(fen, l.pv, 8))}</span></div>`).join("")}</div>`;
}
/* retry: put the position back before the mistake and let the player look for something better */
function rvRetry() {
  const i = rv.i, d = rv.data[i - 1]; if (!d) return; if (rv.timer) rvPlay();
  rv.retry = { i, tries: 0, sel: null, c: new Chess(rv.fen[i - 1]), best: d.best };
  const L = rv.pos[i - 1].lines, w = (x) => (d.white ? x.w : 100 - x.w); rv.retry.ok = new Set(L.filter((x) => w(L[0]) - w(x) <= 3).map((x) => x.pv[0]));
  rvRetryPaint(`Your turn. ${d.san} was ${RVC[d.cls][2]}. Find a better move for ${d.white ? "White" : "Black"}.`, "hmm");
}
function rvRetryPaint(msg, mood, extra = "") {
  const R = rv.retry, targets = R.sel ? R.c.moves({ square: R.sel, verbose: true }).map((m) => m.to) : [];
  mkClear(document.getElementById("bd")); rvEl("rvBoard").innerHTML = boardHTML(R.c, { flip: rv.flip, sel: R.sel, targets }); rv.L.lastKey = "";
  setPart("rvOv", ""); setPart("rvCoach", `<div class="pipbox">${pipSVG(mood)}<div class="pipsay"><b>${esc(coachName())}</b>${esc(msg)}</div></div>${extra}<div class="row"><button class="btn ghost" data-rv="retryshow" type="button">${ic("bulb")}Show me</button><button class="btn ghost" data-rv="retryend" type="button">Back to the game</button></div>`);
}
function rvRetryClick(sq) {
  const R = rv.retry, p = R.c.get(sq);
  if (R.sel && R.c.moves({ square: R.sel, verbose: true }).some((m) => m.to === sq)) {
    const m = R.c.move({ from: R.sel, to: sq, promotion: "q" }), uci = m.from + m.to + (m.promotion || ""); R.sel = null;
    if (R.ok.has(uci) || uci === R.best) { try { Snd.move && Snd.move(m, R.c); } catch (e) { /* quiet */ } const L = rv.pos[R.i - 1].lines.find((x) => x.pv[0] === uci) || rv.pos[R.i - 1].lines[0]; rvRetryPaint(`That's it! ${m.san} keeps everything together.`, "wow", `<p class="fine">The line: <span class="pvl">${esc(pvLine(rv.fen[R.i - 1], L.pv, 8))}</span></p>`); pipSay(pipPick("best", R.i)); return; }
    R.tries++; R.c.undo(); try { Snd.wrong && Snd.wrong(); } catch (e) { /* quiet */ }
    if (R.tries >= 3) return rvRetryShow(`Three tries. Here it is: `);
    return rvRetryPaint(`${m.san}? Not quite. ${["Look again. What is the opponent threatening?", "Closer. Checks, captures, threats, in that order.", "One more try."][R.tries - 1]}`, "hmm");
  }
  R.sel = p && p.color === R.c.turn() ? sq : null; rvRetryPaint(`Your turn. Find a better move for ${R.c.turn() === "w" ? "White" : "Black"}.`, "calm");
}
function rvRetryShow(pre = "") { const R = rv.retry, L = rv.pos[R.i - 1].lines[0], san = uciSan(rv.fen[R.i - 1], L.pv[0]); R.sel = null; const c = new Chess(rv.fen[R.i - 1]); c.move(uciMv(L.pv[0])); R.c = c; rvRetryPaint(`${pre}${san} was the move.`, "calm", `<p class="fine">The line: <span class="pvl">${esc(pvLine(rv.fen[R.i - 1], L.pv, 8))}</span></p>`); }
function rvRetryEnd() { rv.retry = null; mkClear(document.getElementById("bd")); rvEl("rvBoard").innerHTML = boardHTML(rv.c, { flip: rv.flip, last: rv.i ? [rv.mv[rv.i - 1].from, rv.mv[rv.i - 1].to] : null }); rv.L.flipped = rv.flip; rvPaint(); }
document.addEventListener("click", (e) => { if (!rv || !rv.retry || (rv.pen && rv.pen.on)) return; const sq = e.target.closest && e.target.closest("#rvBoard [data-sq]"); if (sq) { e.stopPropagation(); rvRetryClick(sq.dataset.sq); } }, true);

/* explore: play any moves from the position on the board; Stockfish grades each one as it lands, on its own engine so it never waits behind the review */
let RVX_SF = null; const rvxSf = () => (RVX_SF = RVX_SF || mkSf());
function rvxAn(fen) {
  rv.xc = rv.xc || {}; if (rv.xc[fen]) return rv.xc[fen]; const c = new Chess(fen);
  if (c.in_checkmate()) { const ww = c.turn() === "b"; return (rv.xc[fen] = Promise.resolve({ lines: [], ev: { mate: 0, cp: ww ? MATE_CP : -MATE_CP, w: ww ? 100 : 0, term: ww ? "1-0" : "0-1" } })); }
  if (c.game_over()) return (rv.xc[fen] = Promise.resolve({ lines: [], ev: { mate: null, cp: 0, w: 50, term: "½-½" } }));
  const k = rv.fen.indexOf(fen), have = k >= 0 && rv.pos[k] && rv.pos[k].lines && rv.pos[k].lines.length ? rv.pos[k] : null; if (have) return (rv.xc[fen] = Promise.resolve(have));
  return (rv.xc[fen] = rvxSf().analyse(fen, SF_MODERN ? { multipv: 3, depth: 16, ms: 2500 } : { multipv: 2, depth: 12, ms: 1800 }).then((ln) => { const lines = ln.map((x) => lineW(x, c.turn())); return { lines, ev: lines[0] }; }).catch(() => { delete rv.xc[fen]; return null; }));
}
function rvxStart() {
  if (!rv) return; if (rv.timer) rvPlay(); if (rv.retry) rvRetryEnd(); const f0 = rv.fen[rv.i];
  rv.ex = { base: rv.i, f0, c: new Chess(f0), sel: null, steps: [], tok: 0 }; rvTab("moves"); rvxAn(f0); rvxPaint(); rvEl("rvCoach").scrollIntoView({ block: "nearest", behavior: "smooth" }); pipSay(pipPick("start", rv.i + 3));
}
function rvxGrade(st0, fenB, uci, a, b, recap) {
  const white = new Chess(fenB).turn() === "w", pov = (w) => (white ? w : 100 - w), L = a.lines || [], inTop = L.find((x) => x.pv[0] === uci), best = L[0] ? L[0].pv[0] : uci;
  const before = pov(a.ev.w); let after = inTop ? pov(inTop.w) : pov(b.ev.w); if (!inTop && L.length >= 2) after = Math.min(after, pov(L[L.length - 1].w)); if (b.ev.term) after = pov(b.ev.w);
  const loss = Math.max(0, before - after), isBest = uci === best || loss < 0.6, second = L[1] ? pov(L[1].w) : null, nLegal = new Chess(fenB).moves().length;
  let cls = nLegal === 1 ? "forced" : isBest ? "best" : loss <= 2 ? "excellent" : loss <= 5 ? "good" : loss <= 10 ? "inaccuracy" : loss <= 20 ? "mistake" : "blunder";
  if (cls === "best" && second != null && pov(L[0].w) - second >= 10 && after >= 30 && after <= 97 && !recap) cls = "great";   /* the only move that holds */
  Object.assign(st0, { cls, loss, before, after, best, isBest, bestSan: uciSan(fenB, best), white });
}
function rvxMove(m) {
  const X = rv.ex, fenB = X.c.fen(), mv = X.c.move(m); if (!mv) return; X.sel = null; const uci = mv.from + mv.to + (mv.promotion || ""), fenA = X.c.fen();
  X.steps.push({ san: mv.san, uci, fenB, fenA, from: mv.from, to: mv.to, cap: !!mv.captured, cls: null }); const stp = X.steps[X.steps.length - 1], tok = ++X.tok;
  try { Snd.move && Snd.move(mv, X.c); } catch (e) { /* quiet */ } rvxPaint();
  Promise.all([rvxAn(fenB), rvxAn(fenA)]).then(([a, b]) => {
    if (!rv || rv.ex !== X || X.steps.indexOf(stp) < 0) return; if (!a || !b) { stp.cls = "err"; return rvxPaint(); }
    const pv0 = X.steps[X.steps.indexOf(stp) - 1], recap = !!(mv.captured && (pv0 ? pv0.cap && pv0.to === mv.to : X.base && rv.mv[X.base - 1].captured && rv.mv[X.base - 1].to === mv.to)); rvxGrade(stp, fenB, uci, a, b, recap); stp.evA = b.ev; stp.evB = a.ev;
    if (X.steps[X.steps.length - 1] === stp) { rvxPaint(); if (tok === X.tok) { clearTimeout(rv.pipT); rv.pipT = setTimeout(() => { if (rv && rv.ex === X && X.tok === tok) pipSay(pipPick(stp.cls === "forced" ? "good" : stp.cls, X.steps.length * 5 + rv.i)); }, 500); } }
    else rvxPaint();
  });
}
function rvxPaint() {
  const X = rv && rv.ex; if (!X || !rvEl("rvCoach")) return; rvEl("rvXBtn")?.classList.add("on"); const f = rv.flip, c = X.c, last = X.steps[X.steps.length - 1], targets = X.sel ? c.moves({ square: X.sel, verbose: true }).map((m) => m.to) : [];
  if (X.painted !== c.fen()) { mkClear(document.getElementById("bd")); X.painted = c.fen(); if (rv.pen && rv.pen.from) { rv.pen.from = null; rvPenUI(); } } rvEl("rvBoard").innerHTML = boardHTML(c, { flip: f, sel: X.sel, targets, last: last ? [last.from, last.to] : X.base ? [rv.mv[X.base - 1].from, rv.mv[X.base - 1].to] : null }); rv.L.lastKey = ""; if (rv.pen && rv.pen.from) { const [pc0, pr0] = rv.pen.from, q0 = "abcdefgh"[f ? 7 - pc0 : pc0] + (f ? pr0 + 1 : 8 - pr0); document.querySelector(`#rvBoard [data-sq=${q0}]`)?.classList.add("penfrom"); }
  const fen = c.fen(), cachedP = rv.xc && rv.xc[fen]; let ov = "";
  if (last && last.cls && last.cls !== "err") { const [tc, tr] = rvSq(last.to, f), r = RVC[last.cls]; ov += `<span class="sqb cls ${last.cls}" style="left:${(tc + 1) * 12.5}%;top:${tr * 12.5}%">${r[1]}</span>`; }
  setPart("rvOv", ov);
  const num = (fenX) => { const p = fenX.split(" "); return +p[5] + (p[1] === "w" ? "." : "..."); };
  const chips = X.steps.map((s2, k) => `<span class="rvxs ${s2.cls || "wait"}" title="${s2.cls && RVC[s2.cls] ? RVC[s2.cls][0] : "Stockfish is looking"}">${k === 0 || s2.fenB.split(" ")[1] === "w" ? `<small>${num(s2.fenB)}</small>` : ""}${esc(s2.san)}${s2.cls && RVC[s2.cls] ? `<i class="cls ${s2.cls}">${RVC[s2.cls][1]}</i>` : s2.cls === "err" ? "<i>!</i>" : '<i><span class="spin"></span></i>'}</span>`).join("");
  let body;
  if (!last) body = `<p class="fine">Tap a piece, then a square. Any move for either side. Stockfish grades every move the moment it lands, and the game itself is left as it was.</p>`;
  else if (!last.cls) body = `<div class="coachhd"><b>${num(last.fenB)} ${esc(last.san)}</b></div><p class="fine"><span class="spin"></span> Stockfish is grading this move…</p>`;
  else if (last.cls === "err") body = `<p class="fine">Stockfish could not grade this move. It needs an internet connection the first time.</p>`;
  else { const r = RVC[last.cls], bad = ["inaccuracy", "mistake", "blunder"].includes(last.cls); body = `<div class="coachhd"><i class="cls big ${last.cls}">${r[1]}</i><div><b>${num(last.fenB)} ${esc(last.san)}</b> <span class="cname ${last.cls}">is ${r[2]}</span></div><span class="evtxt">${fmtEv(last.evB)} → ${fmtEv(last.evA)}</span></div><div class="wc"><span>Winning chance</span><b>${Math.round(last.before)}% → ${Math.round(last.after)}%</b></div>${last.isBest ? "" : `<p class="fine">Best was <b>${esc(last.bestSan)}</b>${bad ? "" : ", but this is close"}.</p>`}`; }
  const pk = last && last.cls && last.cls !== "err" ? (last.cls === "forced" ? "good" : last.cls) : "start";
  if (!rvEl("rvxPip")) setPart("rvCoach", `<div class="rvxhd"><b>${ic("compass")}Explore</b><span class="fine">from ${X.base ? `after ${Math.ceil(X.base / 2)}${X.base % 2 ? "." : "..."} ${esc(rv.sans[X.base - 1])}` : "the start"}</span></div><div id="rvxPip"></div><div id="rvxLine"></div><div id="rvxBody"></div><div id="rvxEng"></div><div id="rvxBtns"></div>`);   /* parts update on their own, so nothing replays its entrance */
  setPart("rvxPip", `<div class="pipbox">${pipSVG(PIP_MOOD[pk] || "calm")}<div class="pipsay"><b>${esc(coachName())}</b>${esc(pipPick(pk, X.steps.length * 5 + rv.i))}</div></div>`);
  setPart("rvxLine", chips ? `<div class="rvxline">${chips}</div>` : ""); setPart("rvxBody", body);
  setPart("rvxBtns", `<div class="row rvxbtns"><button class="btn ghost" data-rv="xundo" type="button" ${X.steps.length ? "" : "disabled"}>↶ Undo</button><button class="btn ghost" data-rv="xeng" type="button" ${c.game_over() ? "disabled" : ""}>${ic("bolt")}Engine move</button><button class="btn ghost" data-rv="xreset" type="button" ${X.steps.length ? "" : "disabled"}>⟲ Reset</button><button class="btn" data-rv="xend" type="button">Back to the game</button></div>`);
  const tok = X.tok; (cachedP || rvxAn(fen)).then((p) => {
    if (!p || !rv || rv.ex !== X) return; rv.xd = rv.xd || {}; rv.xd[fen] = 1; if (X.c.fen() !== fen) return; const W = p.ev.w, evl = rvEl("rvEvL"); rvEl("rvEvI").style.height = W + "%"; evl.textContent = fmtEv(p.ev); evl.className = "evl " + ((W >= 50) === f ? "top" : "bot") + (W >= 50 ? " onw" : " onb");
    const e2 = rvEl("rvxEng"); if (e2 && p.lines.length) setPart("rvxEng", `<div class="rveng"><div class="rvengh"><span class="label">Engine</span><span class="fine">depth ${p.lines[0].depth || "?"}</span></div>${p.lines.slice(0, 3).map((l, k) => `<div class="rvel2 ${k ? "" : "top"}"><b class="rvev ${l.cp >= 0 ? "w" : "b"}">${fmtEv(l)}</b><span class="pvl">${esc(pvLine(fen, l.pv, 8))}</span></div>`).join("")}</div>`);
    else if (e2) setPart("rvxEng", ""); void tok;
  });
  if (!(rv.xd && rv.xd[fen])) setPart("rvxEng", c.game_over() ? "" : `<p class="fine"><span class="spin"></span> Stockfish is looking at this position…</p>`);
}
function rvxClick(sq) {
  const X = rv.ex, c = X.c, p = c.get(sq);
  if (X.sel && c.moves({ square: X.sel, verbose: true }).some((m) => m.to === sq)) { const pr = c.moves({ square: X.sel, verbose: true }).find((m) => m.to === sq); return rvxMove({ from: X.sel, to: sq, promotion: pr.promotion ? "q" : undefined }); }
  X.sel = p && p.color === c.turn() && X.sel !== sq ? sq : null; rvxPaint();
}
function rvxEngine() { const X = rv.ex, fen = X.c.fen(); if (X.c.game_over() || X.busy) return; X.busy = true; rvxAn(fen).then((p) => { X.busy = false; if (!p || !rv || rv.ex !== X || X.c.fen() !== fen || !p.lines.length) return; rvxMove(uciMv(p.lines[0].pv[0])); }); }
function rvxUndo() { const X = rv.ex; if (!X.steps.length) return; X.steps.pop(); X.c.undo(); X.sel = null; X.tok++; rvxPaint(); }
function rvxReset() { const X = rv.ex; X.steps = []; X.c = new Chess(X.f0); X.sel = null; X.tok++; rvxPaint(); }
function rvxEnd() { if (!rv || !rv.ex) return; rv.ex = null; rvEl("rvXBtn")?.classList.remove("on"); if (RVX_SF) RVX_SF.stopAll(); mkClear(document.getElementById("bd")); rvEl("rvBoard").innerHTML = boardHTML(rv.c, { flip: rv.flip, last: rv.i ? [rv.mv[rv.i - 1].from, rv.mv[rv.i - 1].to] : null }); rv.L.lastKey = ""; rv.L.flipped = rv.flip; rv._h = null; const co = rvEl("rvCoach"); if (co) { co._h = null; co.innerHTML = ""; } rvPaint(); }
document.addEventListener("click", (e) => { if (!rv || !rv.ex || (rv.pen && rv.pen.on)) return; const sq = e.target.closest && e.target.closest("#rvBoard [data-sq]"); if (sq) { e.stopPropagation(); rvxClick(sq.dataset.sq); } }, true);

/* draw: a pen for arrows and square marks that works with taps (phones included); right-drag still works on a mouse */
function rvPenUI() { const P = rv && rv.pen, b = rvEl("rvPenBtn"); if (b) b.classList.toggle("on", !!(P && P.on)); setPart("rvPenBar", P && P.on ? `<div class="penbar"><span class="fine">${P.from ? "Now tap where the arrow ends (the same square marks it)." : "Tap a square, then another, to draw an arrow."}</span><span class="pencols">${Object.entries(MKC).map(([k, c]) => `<button type="button" class="pencol ${P.k === k ? "on" : ""}" data-pen="${k}" style="background:${c}" aria-label="${MKN[k]}" title="${MKN[k]}"></button>`).join("")}</span><button class="btn ghost" data-pen="clear" type="button">Clear</button></div>` : ""); }
function rvPenToggle() { if (!rv) return; rv.pen = rv.pen && rv.pen.on ? { on: false, k: rv.pen.k } : { on: true, k: (rv.pen && rv.pen.k) || "g", from: null }; document.querySelectorAll("#rvBoard .penfrom").forEach((x) => x.classList.remove("penfrom")); rvPenUI(); }
document.addEventListener("click", (e) => {
  if (!rv || !rvEl("rvBoard")) return; const pc = e.target.closest && e.target.closest("[data-pen]");
  if (pc) { const v = pc.dataset.pen; if (v === "clear") mkClear(document.getElementById("bd")); else rv.pen.k = v; return rvPenUI(); }
  if (!rv.pen || !rv.pen.on) return; const sq = e.target.closest && e.target.closest("#rvBoard [data-sq]"); if (!sq) return; e.stopPropagation(); e.preventDefault();
  const P = rv.pen, cell = rvSq(sq.dataset.sq, rv.flip);
  if (!P.from) { P.from = cell; sq.classList.add("penfrom"); return rvPenUI(); }
  document.querySelectorAll("#rvBoard .penfrom").forEach((x) => x.classList.remove("penfrom")); mkToggle(mkSvg(document.getElementById("bd")), P.from, cell, P.k); P.from = null; try { navigator.vibrate && navigator.vibrate(10); } catch (er) { /* none */ } rvPenUI();
}, true);

/* Pip remembers: your own reviewed games, kept in this browser */
const PIPH_KEY = "bkc_pip_hist";
const pipHist = () => { try { return JSON.parse(localStorage.getItem(PIPH_KEY) || "[]"); } catch (e) { return []; } };
const rvOwn = () => rv && ["import", "pgn", "ai", "online", "friend"].includes(rv.from);
function pipRemember(acc, elo) { if (!rvOwn() || acc == null || rv.saved) return; rv.saved = true; const h = pipHist(); h.push({ at: Date.now(), acc: Math.round(acc), elo, res: rv.result || "", vs: rv.names[rv.color === "w" ? 1 : 0] }); try { localStorage.setItem(PIPH_KEY, JSON.stringify(h.slice(-60))); } catch (e) { /* storage full */ } }
function pipMemoryHTML(acc) {
  if (!rvOwn()) return ""; const h = pipHist(); if (h.length < 2) return `<div class="pipmem"><b>${esc(coachName())} remembers</b><span class="fine">This is the first game I've seen from you. Review a few more and I'll start spotting patterns.</span></div>`;
  const prev = h.slice(0, -1), avg = prev.reduce((s, x) => s + x.acc, 0) / prev.length, diff = Math.round(acc - avg), best = Math.max(...prev.map((x) => x.acc));
  const pts = h.slice(-20), W = 240, H = 46, X = (k) => (pts.length < 2 ? W / 2 : (k / (pts.length - 1)) * (W - 8) + 4), Y = (a) => H - 4 - (a / 100) * (H - 8);
  const say = acc > best ? `Your most accurate game yet: ${Math.round(acc)}%. I'm writing this one on my square.` : diff >= 5 ? `${diff} points above your average of ${Math.round(avg)}%. You're improving, and I can see it.` : diff <= -5 ? `${-diff} points below your average. Off days happen. What matters is the next game.` : `Right around your average of ${Math.round(avg)}%. Steady. Steady is how pawns get to the other side.`;
  const er = h.filter((x) => x.elo), last = er.slice(-10), avgR = last.length ? Math.round(last.reduce((q, x) => q + x.elo, 0) / last.length / 25) * 25 : null, eloTxt = er.length >= 2 ? `<span class="fine">Your average game rating over your last ${last.length} reviewed games: <b>${avgR}</b> (single games swing a lot; this is the steadier number). Best single game: ${Math.max(...er.map((x) => x.elo))}.</span>` : "";
  return `<div class="pipmem"><b>${esc(coachName())} remembers · ${h.length} games</b>${eloTxt}<svg viewBox="0 0 ${W} ${H}" class="pipspark"><polyline points="${pts.map((x, k) => `${X(k).toFixed(1)},${Y(x.acc).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linejoin="round"/>${pts.map((x, k) => `<circle cx="${X(k).toFixed(1)}" cy="${Y(x.acc).toFixed(1)}" r="${k === pts.length - 1 ? 4 : 2}" fill="${k === pts.length - 1 ? "var(--ok)" : "var(--gold)"}"/>`).join("")}</svg><span>${esc(say)}</span></div>`;
}

/* your own games from Lichess or chess.com (both public APIs, no sign-in) */
let IMP = [];
const impUser = () => { try { return JSON.parse(localStorage.getItem("bkc_imp") || "{}"); } catch (e) { return {}; } };
async function impLoad(site, user) {
  const el = $("#impList"); if (!el) return; user = user.trim(); if (!/^[\w-]{2,30}$/.test(user)) { el.innerHTML = `<p class="fine">That doesn't look like a username.</p>`; return; }
  try { localStorage.setItem("bkc_imp", JSON.stringify({ site, user })); } catch (e) { /* blocked */ }
  el.innerHTML = `<p class="fine"><span class="spin"></span> Loading ${esc(user)}'s recent games from ${site === "li" ? "Lichess" : "chess.com"}…</p>`;
  try {
    if (site === "li") {
      const r = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=20&pgnInJson=true&opening=true&clocks=false&evals=false`, { headers: { Accept: "application/x-ndjson" } }); if (!r.ok) throw new Error(r.status);
      IMP = (await r.text()).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((g) => g.variant === "standard" && g.pgn).map((g) => { const w = g.players.white, b = g.players.black, wn = (w.user && w.user.name) || (w.aiLevel ? "Stockfish " + w.aiLevel : "White"), bn = (b.user && b.user.name) || (b.aiLevel ? "Stockfish " + b.aiLevel : "Black"); return { pgn: g.pgn, w: wn, b: bn, wr: w.rating, br: b.rating, res: g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "1/2-1/2", at: g.createdAt, tc: g.speed, op: g.opening && g.opening.name, me: wn.toLowerCase() === user.toLowerCase() ? "w" : "b" }; });
    } else {
      const a = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`); if (!a.ok) throw new Error(a.status); const arch = (await a.json()).archives || [];
      let games = []; for (const u of arch.slice(-2).reverse()) { const r = await fetch(u); if (r.ok) games = games.concat(((await r.json()).games || []).reverse()); if (games.length >= 20) break; }
      IMP = games.filter((g) => g.rules === "chess" && g.pgn).slice(0, 20).map((g) => { const wr = g.white.result, res = wr === "win" ? "1-0" : g.black.result === "win" ? "0-1" : "1/2-1/2"; return { pgn: g.pgn, w: g.white.username, b: g.black.username, wr: g.white.rating, br: g.black.rating, res, at: g.end_time * 1000, tc: g.time_class, op: ((g.pgn.match(/\[ECOUrl "[^"]*\/([^"]*)"/) || [])[1] || "").replace(/-/g, " "), me: g.white.username.toLowerCase() === user.toLowerCase() ? "w" : "b" }; });
    }
    if (!IMP.length) { el.innerHTML = `<p class="fine">No standard games found for ${esc(user)}.</p>`; return; }
    el.innerHTML = `<div class="cpgames">${IMP.map((g, k) => { const mine = g.me === "w", r = g.res === "1/2-1/2" ? "D" : (g.res === "1-0") === mine ? "W" : "L"; return `<button class="cpgame" type="button" data-imp="${k}"><span class="cpres r${r}">${r === "W" ? "Win" : r === "D" ? "Draw" : "Loss"}</span><span class="cpcol2"><b>vs ${esc(mine ? g.b : g.w)} ${(mine ? g.br : g.wr) ? `<small class="fine">(${mine ? g.br : g.wr})</small>` : ""}</b><span class="fine">${new Date(g.at).toLocaleDateString()} · ${esc(g.tc || "")} · ${mine ? "White" : "Black"}${g.op ? " · " + esc(g.op.slice(0, 40)) : ""}</span></span>${ic("arrow")}</button>`; }).join("")}</div>`;
  } catch (e) { el.innerHTML = `<p class="fine"><b>Could not load games.</b> Check the username, or try again in a minute.</p>`; }
}
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-impsite],[data-imp]"); if (!t) return;
  if (t.dataset.impsite) { document.querySelectorAll("[data-impsite]").forEach((x) => x.classList.toggle("on", x === t)); return impLoad(t.dataset.impsite, ($("#impUser") || {}).value || ""); }
  const g = IMP[+t.dataset.imp]; if (!g) return; const c = new Chess(); c.load_pgn(g.pgn, { sloppy: true }); const sans = c.history(); if (sans.length < 2) return;
  reviewStart(sans, g.me, { from: "import", names: [g.w, g.b], result: g.res, speed: g.tc });
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "impUser") { const s = (document.querySelector("[data-impsite].on") || {}).dataset; impLoad((s && s.impsite) || "li", e.target.value); } });

/* Grading, chess.com style: the cost of a move is the winning chance it gives up (expected points x 100).
   A move that is one of Stockfish's top lines is scored from that same search, so the best move and the played move
   are compared at the same depth; other moves use the search after the move, capped at the worst top line. */
/* A sacrifice is material offered, not only material the engine's main line loses: after the move, can the opponent
   capture something and come out a knight or more ahead, even after our best recapture? (10.Ne5 in Legal's mate
   leaves the queen hanging; the engine's main line never takes it, because taking it walks into mate.) */
const SACV = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function rvSacInfo(i) {
  const col = i % 2 === 1 ? "w" : "b", m0 = matOf(new Chess(rv.fen[i - 1]), col), c = new Chess(rv.fen[i]); let worst = matOf(c, col), piece = null, take = null, mate = null;
  for (const m of c.moves({ verbose: true })) {
    if (!m.captured) continue; c.move(m); let best = matOf(c, col), mt = null;
    for (const r of c.moves({ verbose: true })) { c.move(r); if (c.in_checkmate()) mt = r.san; if (r.captured) best = Math.max(best, matOf(c, col)); c.undo(); if (mt) break; }
    if (mt) best = Math.max(best, m0 + 99);   // taking it walks into mate: the offer is free
    if (best < worst || (mt && !take && SACV[m.captured] >= 3)) { if (best < worst) worst = best; piece = m.captured; take = m.san; mate = mt; }
    c.undo();
  }
  const drop = m0 - Math.min(worst, matOf(new Chess(rv.fen[i]), col) - (piece ? SACV[piece] : 0) + (mate ? 0 : 0));
  if (piece) return { drop, piece, take, mate };
  /* a poisoned offer: a piece of ours (a knight or more) that can be taken and leaves us two or more points down at that moment, but
     where every such capture runs into a reply that wins it all back and more (Bxf7+ Kxf7?? Qxd8). Declining it is just a win. */
  const c2 = new Chess(rv.fen[i]); let bait = null, ok = true;
  for (const m of c2.moves({ verbose: true })) {
    if (!m.captured || SACV[m.captured] < 3) continue; if (rv.mv[i - 3] && rv.mv[i - 3].to === m.to) continue;   /* the piece offered last move is still hanging: not a new sacrifice */
    c2.move(m); if (c2.moves({ verbose: true }).some((r) => r.captured && r.to === m.to)) { c2.undo(); continue; }   /* we can simply take back on that square: a defended piece, an exchange, not a sacrifice */
    const def = m0 - matOf(c2, col);
    if (def >= 2) {
      let top = -99; for (const r of c2.moves({ verbose: true })) { c2.move(r); let v = matOf(c2, col); for (const o of c2.moves({ verbose: true })) if (o.captured) { c2.move(o); v = Math.min(v, matOf(c2, col)); c2.undo(); } top = Math.max(top, v); c2.undo(); }
      const L = (rv.pos[i] && rv.pos[i].lines) || [], ln = L.find((x) => x.pv[0] === m.from + m.to + (m.promotion || "")), mine = ln ? (col === "w" ? ln.w : 100 - ln.w) : null;   /* engine view of their capture */
      if (top >= m0 + 2 || (L.length && (ln ? mine >= 60 : true))) bait = bait || { piece: m.captured, take: m.san, drop: def }; else ok = false;
    }
    c2.undo();
  }
  return ok && bait ? { drop: bait.drop, piece: bait.piece, take: bait.take, mate: null, bait: true } : { drop, piece, take, mate };
}
function rvDerive(i) {
  const a = rv.pos[i - 1], b = rv.pos[i], white = i % 2 === 1, mv = rv.mv[i - 1], pov = (w) => (white ? w : 100 - w), prev = rv.data[i - 2];
  const played = mv.from + mv.to + (mv.promotion || ""), L = a.lines || [], bestUci = L[0] ? L[0].pv[0] : played, inTop = L.find((x) => x.pv[0] === played);
  const before = pov(a.ev.w); let after = inTop ? pov(inTop.w) : pov(b.ev.w); if (!inTop && L.length >= 2) after = Math.min(after, pov(L[L.length - 1].w)); if (b.ev.term) after = pov(b.ev.w);
  const sg = white ? 1 : -1, cpB = sg * a.ev.cp, cpA = sg * (inTop ? inTop.cp : b.ev.cp), pawns = Math.max(0, Math.min(99, (cpB - cpA) / 100)), clampCp = (x) => Math.max(-800, Math.min(800, x)), cpl = Math.max(0, clampCp(cpB) - clampCp(cpA)), cpb = clampCp(cpB);   /* centipawn loss, with both sides clamped to +-8 pawns */
  const loss = Math.max(0, before - after), isBest = played === bestUci || loss < 0.6, second = L[1] ? pov(L[1].w) : null, nLegal = new Chess(rv.fen[i - 1]).moves().length;
  let cls = isBest ? "best" : loss <= 2 ? "excellent" : loss <= 5 ? "good" : loss <= 10 ? "inaccuracy" : loss <= 20 ? "mistake" : "blunder";
  const recapture = rv.mv[i - 2] && rv.mv[i - 2].captured && mv.to === rv.mv[i - 2].to;
  if (nLegal === 1) cls = "forced";
  else if (rv.book[i] && loss <= 6) cls = "book";
  else {
    if (prev && prev.loss >= 10 && (prev.cls === "mistake" || prev.cls === "blunder" || prev.cls === "miss") && (cls === "inaccuracy" || cls === "mistake" || (cls === "blunder" && loss < 30))) cls = "miss";   // they slipped and you let them off
    if (cls === "best" && second != null && pov(L[0].w) - second >= 10 && after >= 30 && after <= 97 && !recapture) cls = "great";   // the only move that holds
    const mates = b.ev.mate != null && pov(b.ev.w) >= 99.9, sac = rvSacInfo(i), good = cls === "best" || cls === "great" || loss <= 2;
    if (good && sac.piece && SACV[sac.piece] >= 3 && sac.drop >= 2 && (after >= 45 || mates) && !recapture && (before < 92 || sac.bait)) { cls = "brilliant"; rv.sac = rv.sac || {}; rv.sac[i] = sac; }   // a sound sacrifice of a knight or more
    if (good && mv.promotion && mv.promotion !== "q" && nLegal > 1) { cls = "brilliant"; rv.sac = rv.sac || {}; rv.sac[i] = { under: mv.promotion }; }   // the right underpromotion
  }
  const acc = cls === "forced" || cls === "book" ? 100 : Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
  return { i, white, san: mv.san, cls, loss, pawns, cpl, cpb, acc, before, after, second, best: bestUci, isBest, bestSan: uciSan(rv.fen[i - 1], bestUci) };
}
function rvTab(t) { const r = document.querySelector(".rvright"); if (!r) return; r.dataset.tab = t; document.querySelectorAll("[data-rvtab].chip").forEach((x) => x.classList.toggle("on", x.dataset.rvtab === t)); }
document.addEventListener("click", (e) => { const t = e.target.closest && e.target.closest("[data-rvtab]"); if (!t || !rvActive()) return; rvTab(t.dataset.rvtab); if (t.classList.contains("rvstart") && rv.i === 0) rvGo(1); });
function rvExplain(d) {
  if (d.why) return d.why;
  const i = d.i, a = rv.pos[i - 1], b = rv.pos[i], mv = rv.mv[i - 1], mover = d.white ? "w" : "b", fenA = rv.fen[i - 1], fenB = rv.fen[i];
  const nm = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen" }, pct = (x) => Math.round(x) + "%", bs = d.bestSan, san = mv.san;
  const mateFor = (e, white) => e.mate != null && (white ? e.mate > 0 : e.mate < 0);
  let t;
  if (d.cls === "book") t = `A known opening move${rv.openName[i] ? ": " + rv.openName[i] : ""}.`;
  else if (d.cls === "brilliant") { const sc = (rv.sac || {})[i] || {}; t = sc.under ? `Promoting to a ${nm[sc.under]} instead of a queen, and it is the right call. Underpromotions like this are rare and beautiful.` : sc.piece ? `${san} offers your ${nm[sc.piece]}${sc.take ? ` (${sc.take} takes it)` : ""}, ${sc.bait ? `but taking it loses: they get punished and you win back more than you gave` : sc.mate ? `but then ${sc.mate} is checkmate` : `yet Stockfish says you are still ${pct(d.after)} to win`}. A real sacrifice.` : `${san} gives up material, yet the position stays sound (${pct(d.after)} winning chances).`; }
  else if (d.cls === "great") t = `The only move that keeps your advantage. The next best option drops your winning chances from ${pct(d.before)} to ${pct(d.second)}.`;
  else if (d.cls === "best") t = `The engine's top choice${mv.captured ? `, taking the ${nm[mv.captured]}` : ""}${san.endsWith("#") ? " and checkmating." : san.endsWith("+") ? " with check." : "."}${b.ev.mate != null && mateFor(b.ev, d.white) ? ` It forces checkmate in ${Math.abs(b.ev.mate)}.` : ""}`;
  else if (d.cls === "forced") t = "The only legal move, so there was nothing to choose.";
  else if (d.cls === "excellent" || d.cls === "good") t = `${d.cls === "excellent" ? "Very close to the best" : "A reasonable move"}, giving up ${d.pawns.toFixed(1)} of a pawn. ${bs} was stronger.`;
  else {
    const why = [];
    if (b.ev.mate != null && mateFor(b.ev, !d.white) && !(a.ev.mate != null && mateFor(a.ev, !d.white))) why.push(`This allows a forced checkmate in ${Math.abs(b.ev.mate)}.`);
    if (a.ev.mate != null && mateFor(a.ev, d.white) && !(b.ev.mate != null && mateFor(b.ev, d.white))) why.push(`You had checkmate in ${Math.abs(a.ev.mate)}. ${bs} was winning on the spot.`);
    if (!why.length && b.lines[0]) {
      const g = rvGain(fenB, b.lines[0].pv, 2, mover);
      const sc = rvSacInfo(i); if (sc.piece && SACV[sc.piece] >= 3 && sc.drop >= 2 && !sc.mate) why.push(`A sacrifice, but not a sound one: after ${sc.take} you are simply ${sc.drop >= 5 ? "a lot of material" : "a piece"} down, and Stockfish finds no way to win it back.`);
      if (!why.length && g <= -2.5) { const rc = new Chess(fenB), rm = rc.move(uciMv(b.lines[0].pv[0])); why.push(rm && rm.captured ? (rm.to === mv.to ? `The ${nm[mv.piece] || "piece"} you just moved can be taken by ${rm.san}.` : `${rm.san} wins your ${nm[rm.captured]} on ${rm.to}.`) : `${rm ? rm.san : "The reply"} creates a threat that costs you about ${Math.abs(g)} points of material.`); }
    }
    if (!why.length && a.lines[0]) { const g = rvGain(fenA, a.lines[0].pv, 3, mover); if (g >= 2.5) why.push(`${bs} would have won material: ${pvLine(fenA, a.lines[0].pv, 4)}.`); }
    if (!why.length) why.push(`The evaluation slips from ${fmtEv(a.ev)} to ${fmtEv(b.ev)}, and ${bs} kept more of your position.`);
    t = (d.cls === "miss" ? "Your opponent had just slipped, and this lets them off the hook. " : "") + why[0];
  }
  if ((d.cls === "best" || d.cls === "great" || d.cls === "brilliant") && b.lines && b.lines[0] && !(b.ev.mate != null)) { const opp = b.lines[0].pv, g = rvGain(fenB, opp, 4, mover); if (g >= 2) t += ` It wins material: ${pvLine(fenB, opp, 4)}.`; }
  return (d.why = t);
}
const rvEl = (id) => document.getElementById(id);
const rvSq = (sq, flip) => { const f = "abcdefgh".indexOf(sq[0]), r = 8 - +sq[1]; return [flip ? 7 - f : f, flip ? 7 - r : r]; };
function rvShell() {
  const f = rv.flip, bar = (side) => `<div class="pbar rvp" id="rvP${side}"></div>`;
  $("#app").innerHTML = `<div class="card rvcard" data-rvcard><div class="row" style="justify-content:space-between"><h2>${ic("chart")}Game review</h2><button class="btn ghost" id="rvBack" type="button">Back</button></div>
  <div class="rvgrid"><div class="rvleft">${bar("T")}<div class="rvbd"><div class="evv ${f ? "flip" : ""}" id="rvEv" title="Stockfish evaluation"><i id="rvEvI"></i><b class="evl" id="rvEvL">0.0</b></div><div class="lvwrap" id="rvWrap"><div id="rvBoard">${boardHTML(rv.c, { flip: f })}</div><div class="rvov" id="rvOv"></div></div></div>${bar("B")}
    <div class="rvbtns"><button class="btn ghost" data-rv="0" type="button" title="Start (Home)">⏮</button><button class="btn ghost" data-rv="-1" type="button" title="Back (←)">◀</button><button class="btn" data-rv="play" id="rvPlay" type="button" title="Play (Space)">▶ Play</button><button class="btn ghost" data-rv="1" type="button" title="Forward (→)">▶</button><button class="btn ghost" data-rv="9999" type="button" title="End">⏭</button><button class="btn ghost" data-rv="best" id="rvBestBtn" type="button" title="Show the best move (B)">${ic("bulb")}</button><button class="btn ghost" data-rv="flip" type="button" title="Flip the board (F)">⇅</button><button class="btn ghost" id="rvPenBtn" data-rv="pen" type="button" title="Draw arrows and mark squares (D)">✎ Draw</button><button class="btn ghost" data-rv="xstart" id="rvXBtn" type="button" title="Explore: play your own moves (E)">${ic("compass")}Explore</button><button class="btn ghost ${PIPV.on ? "on" : ""}" data-rv="pipv" id="rvPipV" type="button" title="Pip's voice">🔊</button></div><div id="rvPenBar"></div><p class="fine" style="text-align:center;margin:0">Arrow keys step through the game. Space plays it. Explore (E) lets you try your own moves. Draw (D) puts arrows on the board; with a mouse, right-drag also draws in orange (hold Shift for red, Ctrl blue, Alt purple).</p></div>
  <div class="rvright" data-tab="moves"><div id="rvProg" class="rvprog"></div><div class="rvtabs"><button type="button" class="chip on" data-rvtab="moves">${ic("arrow")}Moves</button><button type="button" class="chip" data-rvtab="report">${ic("chart")}Game report</button></div><div class="rvt-report"><div class="rvacc" id="rvAcc"></div><div id="rvRep"></div><div id="rvCounts"></div><button class="btn rvstart" type="button" data-rvtab="moves">${ic("arrow")}Start the review</button></div><svg class="rvgraph" id="rvGraph" viewBox="0 0 300 80" preserveAspectRatio="none"><rect width="300" height="80" fill="#262421"/><path id="rvArea" fill="#e9e6df" opacity=".92"/><line x1="0" y1="40" x2="300" y2="40" stroke="#6b6761" stroke-width=".5"/><g id="rvDots"></g><line id="rvCur" y1="0" y2="80" stroke="#e8c35a" stroke-width="1.2"/></svg>
    <div class="rvcoach" id="rvCoach"></div><div class="rvlist" id="rvList">${Array.from({ length: Math.ceil(rv.N / 2) }, (_, k) => `<div class="rvrow"><span class="n">${k + 1}</span>${[0, 1].map((s) => { const p = k * 2 + s + 1; return p <= rv.N ? `<span class="m" data-ply="${p}" id="rvM${p}">${esc(rv.sans[p - 1])}</span>` : "<span></span>"; }).join("")}</div>`).join("")}</div>
    <p class="fine">Engine: ${SF_MODERN ? "Stockfish 17.1 (neural-network evaluation, running in your browser, about 16 moves deep)" : "Stockfish 10 (running in your browser, about 12 moves deep)"}. Stockfish is free software under the GPL; source at <a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noopener">github.com/official-stockfish</a>. Grades come from how much each move changes your winning chances. Accuracy uses the same formula as Lichess.</p></div></div></div>`;
  rv.L.lastKey = ""; rv.L.flipped = f; rvProg(); rvSummary(); rvGraph();
}
function rvProg() {
  const el = rvEl("rvProg"); if (!el) return; const n = rv.pos.filter(Boolean).length, tot = rv.N + 1;
  el.innerHTML = rv.failed ? `<b>Stockfish could not load.</b> It needs an internet connection to download the engine (about 1.5 MB). <button class="btn" data-rv="retry" type="button">Try again</button>` : rv.done ? `<span class="fine">${ic("chart")} Analysis complete</span>` : `<div class="row" style="justify-content:space-between"><span class="fine"><span class="spin"></span> Analysing with Stockfish… ${n} of ${tot}</span></div><div class="progress"><i style="width:${100 * n / tot}%"></i></div>`;
}
function rvList(i) {
  const d = rv.data[i - 1], el = d && rvEl("rvM" + i); if (!el) return; const r = RVC[d.cls];
  el.innerHTML = `${esc(d.san)}<i class="cls ${d.cls}">${r[1]}</i>`;
}
function rvSummary() {
  const acc = (w) => { const m = rv.data.filter((x) => x && x.white === w); return m.length ? Math.round(m.reduce((s, x) => s + x.acc, 0) / m.length) : null; }, cnt = (w, k) => rv.data.filter((x) => x && x.white === w && x.cls === k).length;
  const a = rvEl("rvAcc"), c = rvEl("rvCounts"); if (!a) return;
  const A = acc(true), B = acc(false), nm = (s) => esc(rv.names[s]);
  a.innerHTML = `<div class="accb"><small>${nm(0)}</small><b>${A == null ? "…" : A}</b><span>accuracy</span></div><div class="accb dk"><small>${nm(1)}</small><b>${B == null ? "…" : B}</b><span>accuracy</span></div>`;
  c.innerHTML = `<table class="rvtab">${RVORDER.filter((k) => cnt(true, k) + cnt(false, k) > 0 || ["best", "inaccuracy", "mistake", "blunder"].includes(k)).map((k) => `<tr><td><i class="cls ${k}">${RVC[k][1]}</i> ${RVC[k][0]}</td><td>${cnt(true, k)}</td><td>${cnt(false, k)}</td></tr>`).join("")}</table>`;
  rvReport();
}
function rvGraph() {
  const area = rvEl("rvArea"); if (!area) return; const N = Math.max(1, rv.N), pts = [];
  for (let i = 0; i <= rv.N; i++) { const p = rv.pos[i]; if (!p) break; pts.push([i / N * 300, 80 - p.ev.w * 0.8]); }
  if (!pts.length) { area.setAttribute("d", ""); return; }
  area.setAttribute("d", `M0,80 ${pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")} L${pts[pts.length - 1][0].toFixed(1)},80 Z`);
  rvEl("rvDots").innerHTML = rv.data.map((d, k) => (d && ["blunder", "mistake", "miss", "inaccuracy", "brilliant", "great"].includes(d.cls) && pts[k + 1] ? `<circle cx="${pts[k + 1][0].toFixed(1)}" cy="${pts[k + 1][1].toFixed(1)}" r="1.7" class="gd ${d.cls}"/>` : "")).join("");
}
function rvGo(i, o = {}) {
  if (!rv) return; if (rv.ex) rvxEnd(); if (rv.retry) rvRetryEnd(); i = Math.max(0, Math.min(rv.N, i)); const prev = rv.i, step = i === prev + 1 && o.sound !== false; rv.i = i; rv.c.load(rv.fen[i]);
  rv.L.skipAnim = !(i === prev + 1); if (i !== prev) mkClear(document.getElementById("bd")); boardUpdate(rv.c, { play: false, last: i ? [rv.mv[i - 1].from, rv.mv[i - 1].to] : null }, rv.L);
  if (step && typeof Snd !== "undefined") Snd.move(rv.mv[i - 1], rv.c);
  rvPaint();
  clearTimeout(rv.pipT); if (step && !rv.timer) { const d = rv.data[i - 1]; if (d) rv.pipT = setTimeout(() => { if (rv && rv.i === i) pipSay((d.cls === "book" && rvFact(i)) || pipPick(rvLineKey(d), i * 7 + rv.N)); }, 900); }   // a beat after the move lands
}
function rvPaint() {
  if (!rv || !rvEl("rvCoach") || rv.retry || rv.ex) return; const i = rv.i, d = i ? rv.data[i - 1] : null, pos = rv.pos[i], c = rv.c, f = rv.flip;
  const W = pos ? pos.ev.w : 50, evl = rvEl("rvEvL"); rvEl("rvEvI").style.height = W + "%"; evl.textContent = fmtEv(pos && pos.ev); evl.className = "evl " + ((W >= 50) === f ? "top" : "bot") + (W >= 50 ? " onw" : " onb");
  const bar = (side, sd) => setPart("rvP" + side, `<div class="av">${ic(sd === "w" ? "crown" : "user")}</div><div class="nm"><span><b>${esc(rv.names[sd === "w" ? 0 : 1])}</b><small>${sd === "w" ? "White" : "Black"}</small></span><span>${matHTML(c, sd)}</span></div>`);
  bar("T", f ? "w" : "b"); bar("B", f ? "b" : "w");
  document.querySelectorAll("#rvList .m.cur").forEach((x) => x.classList.remove("cur")); const cm = i ? rvEl("rvM" + i) : null;
  if (cm) { cm.classList.add("cur"); const L = rvEl("rvList"), top = cm.offsetTop - L.offsetTop; if (top < L.scrollTop + 8 || top > L.scrollTop + L.clientHeight - 40) L.scrollTop = top - L.clientHeight / 2; }
  rvEl("rvCur").setAttribute("x1", (i / Math.max(1, rv.N) * 300).toFixed(1)); rvEl("rvCur").setAttribute("x2", (i / Math.max(1, rv.N) * 300).toFixed(1));
  rvEl("rvBestBtn").classList.toggle("on", rv.showBest); rvEl("rvPlay").textContent = rv.timer ? "⏸ Pause" : "▶ Play";
  let coach, ov = "";
  const pk = !i ? "start" : d ? rvLineKey(d) : null, fact = d && d.cls === "book" ? rvFact(i) : null, line = fact || (pk ? pipPick(pk, i * 7 + rv.N) : ""), pipHTML = pk ? `<div class="pipbox">${pipSVG(PIP_MOOD[pk] || (pk.startsWith("brilliant") || pk === "underpromo" ? "wow" : "calm"))}<div class="pipsay"><b>${esc(coachName())}</b>${esc(line)}</div></div>` : "";
  if (!i) coach = `<div class="coachhd"><b>Start of the game</b>${rv.result ? `<span class="fine">Result ${esc(rv.result)}</span>` : ""}</div><p class="fine">Step through with the arrow keys or the buttons. Each move gets a grade and, when it is a mistake, an explanation and the better line.</p>`;
  else if (!d) coach = `<div class="coachhd"><b>${Math.ceil(i / 2)}${i % 2 ? "." : "..."} ${esc(rv.sans[i - 1])}</b></div><p class="fine"><span class="spin"></span> Stockfish is still looking at this move…</p>`;
  else {
    const r = RVC[d.cls], bad = ["inaccuracy", "mistake", "miss", "blunder"].includes(d.cls), a = rv.pos[i - 1], b = pos;
    coach = `<div class="coachhd"><i class="cls big ${d.cls}">${r[1]}</i><div><b>${Math.ceil(i / 2)}${d.white ? "." : "..."} ${esc(d.san)}</b> <span class="cname ${d.cls}">is ${r[2]}</span></div><span class="evtxt">${fmtEv(a.ev)} → ${fmtEv(b.ev)}</span></div><p>${esc(rvExplain(d))}</p>${d.cls === "book" && rv.mN && rv.mN[i] ? `<p class="fine">${ic("book")}Played in ${rv.mN[i].toLocaleString()} master games from this position.</p>` : ""}${bad && !d.isBest ? `<button class="btn rvretry" data-rv="retry1" type="button">${ic("target")}Retry: find a better move</button>` : ""}${bad && !d.isBest ? `<p class="fine">Best was <b>${esc(d.bestSan)}</b>${a.lines[0] ? `: <span class="pvl">${esc(pvLine(rv.fen[i - 1], a.lines[0].pv, 6))}</span>` : ""}</p>` : ""}${d.cls !== "book" && d.cls !== "forced" ? `<div class="wc"><span>Winning chance</span><b>${Math.round(d.before)}% → ${Math.round(d.after)}%</b></div><div class="wc"><span>Cost of this move</span><b>${d.isBest ? "nothing" : `${d.pawns.toFixed(1)} pawns · ${Math.round(d.loss)}%`}</b></div>${!d.isBest && !bad ? `<p class="fine">Best was <b>${esc(d.bestSan)}</b>.</p>` : ""}` : ""}`;
    const [tc, tr] = rvSq(rv.mv[i - 1].to, f);
    ov += `<span class="sqb cls ${d.cls}" style="left:${(tc + 1) * 12.5}%;top:${tr * 12.5}%">${r[1]}</span>`;
    if (bad && !d.isBest && rv.showBest) {
      const [x1, y1] = rvSq(d.best.slice(0, 2), f), [x2, y2] = rvSq(d.best.slice(2, 4), f);
      ov = `<svg viewBox="0 0 8 8">${mkArrow(x1, y1, x2, y2, "#2f86ff", { op: .88 })}</svg>` + ov;   /* the better move, in blue: it reads on both square colours */
    }
  }
  setPart("rvCoach", pipHTML + coach + rvEngineHTML(i)); setPart("rvOv", ov);
}
function rvFlip() { rv.flip = !rv.flip; rvEl("rvEv").classList.toggle("flip", rv.flip); mkClear(document.getElementById("bd")); rvEl("rvBoard").innerHTML = boardHTML(rv.c, { flip: rv.flip, last: rv.i ? [rv.mv[rv.i - 1].from, rv.mv[rv.i - 1].to] : null }); rv.L.flipped = rv.flip; rvPaint(); }
function rvPlay() { if (rv.timer) { clearInterval(rv.timer); rv.timer = null; } else { if (rv.i >= rv.N) rvGo(0, { sound: false }); rv.timer = setInterval(() => { if (!rv || rv.i >= rv.N) { if (rv) { clearInterval(rv.timer); rv.timer = null; rvPaint(); } return; } rvGo(rv.i + 1); }, 1100); } rvPaint(); }
const rvActive = () => rv && rvEl("rvList");
document.addEventListener("keydown", (e) => {
  if (!rvActive() || rv.retry || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "")) return; const k = e.key; if (k === "d" || k === "D") return rvPenToggle(); if (rv.ex) { if (k === "Escape" || k === "e" || k === "E") rvxEnd(); else if (k === "ArrowLeft" || k === "Backspace") { e.preventDefault(); rvxUndo(); } return; } if (k === "e" || k === "E") return rvxStart();
  if (k === "ArrowRight") { e.preventDefault(); rvGo(rv.i + 1); } else if (k === "ArrowLeft") { e.preventDefault(); rvGo(rv.i - 1); } else if (k === "Home") { e.preventDefault(); rvGo(0); } else if (k === "End") { e.preventDefault(); rvGo(rv.N); }
  else if (k === " ") { e.preventDefault(); rvPlay(); } else if (k === "f" || k === "F") rvFlip(); else if (k === "b" || k === "B") { rv.showBest = !rv.showBest; store.set("rv_best", rv.showBest); rvPaint(); }
});
document.addEventListener("pointerdown", (e) => {
  const g = e.target.closest && e.target.closest("#rvGraph"); if (!g || !rvActive()) return;
  const go = (ev) => { const r = g.getBoundingClientRect(); rvGo(Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * rv.N), { sound: false }); };
  go(e); const mv = (ev) => go(ev), up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); }; addEventListener("pointermove", mv); addEventListener("pointerup", up);
});
/* ---------- Who is this player? (like the football quiz: clues appear on their own, buzz when you know it) ---------- */
function whoMatch(t, full) { const a = norm(t), b = norm(full); if (!a) return false; if (a === b) return true; const parts = b.split(" "), last = parts[parts.length - 1]; if (a === last && last.length >= 4) return true; if (parts.length > 1 && a === parts[0] + " " + last) return true; const lev = (x, y) => { const d = Array.from({ length: x.length + 1 }, (_, i) => [i]); for (let j = 1; j <= y.length; j++) d[0][j] = j; for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)); return d[x.length][y.length]; }; return (a.length >= 5 && lev(a, last) <= 1) || (a.length >= 8 && lev(a, b) <= 2); }
const WHO_EVERY = 5;                                       // seconds between clues
function whoStart() { clearInterval(st.timer); st = { game: "who", round: 0, rounds: 5, score: 0, streak: 0, best: 0, timer: null, used: new Set() }; whoNext(); }
function whoNext() {
  clearInterval(st.timer); st.round++; if (st.round > st.rounds) return whoEnd();
  let p; for (let k = 0; k < 30; k++) { p = rnd(DIFF === "easy" ? PLAYERS.slice(0, 30) : DIFF === "medium" ? PLAYERS.slice(0, 80) : DIFF === "hard" ? PLAYERS.slice(0, 170) : PLAYERS.slice(100)); if (!st.used.has(p.n)) break; } st.used.add(p.n);
  const age = new Date().getFullYear() - p.born, cl = [];
  cl.push(["Born", "clock", `In ${p.born}`]); if (p.country) cl.push(["Country", "flag", p.country]); cl.push(["Peak rating", "chart", `${p.peak} (the very best are above 2800)`]);
  cl.push(["Status", "clock", p.died ? `Died in ${p.died}, aged ${p.died - p.born}` : `Still alive, ${age} years old`]); if (p.champ) cl.push(["Title", "crown", "A former World Chess Champion"]);
  cl.push(["Name", "user", `${p.n.split(" ").length} words, ${p.n.replace(/ /g, "").length} letters, starts with ${p.n[0]}`]); if (p.img) cl.push(["Photo", "eye", "IMG"]);
  st.q = { p, cl, shown: 1, t: 0, phase: "play", pen: 0, msg: "", ans: 0, pts: 0 }; whoRender(); st.timer = setInterval(whoTick, 1000);
}
const whoWorth = (q) => Math.max(100, Math.round(1000 - 900 * (q.t / (WHO_EVERY * q.cl.length))));
function whoTick() {
  const q = st.q; if (!q || st.game !== "who") return clearInterval(st.timer);
  if (q.phase === "play") { q.t++; if (q.t % WHO_EVERY === 0) { if (q.shown < q.cl.length) q.shown++; else return whoEndRound(false, "Time is up."); } whoPaint(); }
  else if (q.phase === "answer") { q.ans--; if (q.ans <= 0) { q.pen += 150; q.msg = "Too slow (−150)."; q.phase = "play"; whoRender(); } else { const m = $("#whoAns"); if (m) m.textContent = q.ans; } }
}
function whoClues(q) { const p = q.p; return q.cl.slice(0, q.shown).map(([l, i, t]) => `<div class="clue"><span class="label">${ic(i)}${l}</span>${t === "IMG" ? `<img class="photo" src="${esc(p.img.replace("http://", "https://"))}?width=300" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span>${esc(t)}</span>`}</div>`).join(""); }
function whoPaint() { const q = st.q, el = $("#whoClues"); if (!el) return; el.innerHTML = whoClues(q); const m = $("#whoMeter"); if (m) m.style.width = Math.max(0, 100 - (q.t / (WHO_EVERY * q.cl.length)) * 100) + "%"; const w = $("#whoWorth"); if (w) w.textContent = Math.max(0, whoWorth(q) - q.pen); }
function whoRender() {
  const q = st.q, p = q.p;
  if (q.phase === "done") { $("#app").innerHTML = `<div class="card">${backRow("Who is this player?", "user", `Round ${st.round} of ${st.rounds} · score ${st.score}`)}<div class="clues">${q.cl.map(([l, i, t]) => `<div class="clue"><span class="label">${ic(i)}${l}</span>${t === "IMG" ? `<img class="photo" src="${esc(p.img.replace("http://", "https://"))}?width=300" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span>${esc(t)}</span>`}</div>`).join("")}</div><div class="card" style="background:var(--panel)"><h3 style="margin-top:0">${q.won ? ic("trophy") + "Yes, " : ""}${esc(p.n)}${q.won ? "!" : ""}</h3><p class="fine">${esc(q.msg)}</p><b style="font:800 30px Fraunces,serif;color:var(--gold)">+${q.pts}</b></div><div class="row" style="margin-top:12px"><button class="btn" id="wnext">${st.round >= st.rounds ? "See the final score" : "Next player"}</button></div></div>`; return; }
  $("#app").innerHTML = `<div class="card">${backRow("Who is this player?", "user", `Round ${st.round} of ${st.rounds} · score ${st.score}`)}<p class="sub">A new clue appears every ${WHO_EVERY} seconds. Buzz when you know who it is: the sooner you are right, the more you score.</p>
    <div class="row" style="justify-content:space-between"><span class="fine">Worth <b id="whoWorth" style="color:var(--gold);font-size:18px">${Math.max(0, whoWorth(q) - q.pen)}</b> points now</span><span class="fine">Wrong guess: −150</span></div><div class="meter"><i id="whoMeter" style="width:${Math.max(0, 100 - (q.t / (WHO_EVERY * q.cl.length)) * 100)}%"></i></div>
    <div class="clues" id="whoClues">${whoClues(q)}</div>
    ${q.phase === "answer" ? `<div class="row"><input class="t" id="win" placeholder="Type a name, a surname is fine" autocomplete="off"><button class="btn" id="wgo">Answer</button><span class="fine"><b id="whoAns">${q.ans}</b> s</span></div><p class="fine">${esc(q.msg)}</p>` : `<button class="buzz" id="wbuzz" type="button">${ic("bolt")}BUZZ <small>space bar</small></button><p class="fine">${esc(q.msg)}</p>`}</div>`;
  const i = $("#win"); if (i) i.focus();
}
function whoBuzz() { const q = st.q; if (!q || q.phase !== "play") return; q.phase = "answer"; q.ans = 15; q.msg = ""; whoRender(); }
function whoGuess() {
  const q = st.q, v = ($("#win") || {}).value || ""; if (q.phase !== "answer" || !v.trim()) return;
  if (whoMatch(v, q.p.n)) { q.pts = Math.max(0, whoWorth(q) - q.pen); st.score += q.pts; st.streak++; st.best = Math.max(st.best, st.streak); whoEndRound(true, `Answered with ${q.shown} clue${q.shown === 1 ? "" : "s"} showing.`); }
  else { q.pen += 150; q.msg = "Not him (−150). Keep watching the clues."; q.phase = "play"; whoRender(); }
}
function whoEndRound(won, msg) { clearInterval(st.timer); const q = st.q; q.phase = "done"; q.won = won; q.msg = msg; if (!won) { st.streak = 0; q.pts = 0; } whoRender(); }
function whoEnd() { clearInterval(st.timer); bump("who", st.score); $("#app").innerHTML = `<div class="card"><h2>${ic("trophy")}Final score</h2><div class="tiles"><div class="tile"><small>Score</small><b>${st.score}</b></div><div class="tile"><small>Best streak</small><b>${st.best}</b></div><div class="tile"><small>Your best score</small><b>${bestOf("who")}</b></div></div><div class="row"><button class="btn" data-go="who">Play again</button><button class="btn ghost" data-go="home">Menu</button></div></div>`; }
function countUp(root) { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; (root || document).querySelectorAll(".tile b").forEach((el) => { const m = /^([\d,]+(?:\.\d+)?)(%?)$/.exec(el.textContent.trim()); if (!m) return; const end = parseFloat(m[1].replace(/,/g, "")), dec = (m[1].split(".")[1] || "").length, t0 = performance.now(); (function f(ts) { const k = Math.min(1, (ts - t0) / 800), e = 1 - Math.pow(1 - k, 3); el.textContent = (end * e).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[2]; if (k < 1 && el.isConnected) requestAnimationFrame(f); })(t0); }); }
/* ---------- look up a player or a tournament ---------- */
const LK = DATA.lookup, LKP = LK.players, LKE = LK.events, LKG = LK.games;
const LKN = new Array(LKP.length).fill(0); LKG.forEach((g) => { LKN[g[2]]++; LKN[g[3]]++; });
const PBIO = (() => { const m = {}; PLAYERS.forEach((p) => { m[norm(p.n)] = p; }); return m; })();
const resFor = (g, i) => (g[4] === 2 ? "D" : (g[4] === 1) === (g[2] === i) ? "W" : "L");
const scoreOf = (r) => (r === "W" ? 1 : r === "D" ? 0.5 : 0);
const lkCard = () => `<div class="card"><h2>${ic("eye")}Look up a player or a tournament</h2><p class="sub">Type a name or an event. You get how a player did at the biggest events, or how a tournament ended.</p><div class="row"><input class="t" id="lkIn" aria-label="Look up a player or tournament" placeholder="e.g. Carlsen, Candidates, Tata Steel" autocomplete="off"></div><div class="opts" id="lkSug"></div><div id="lkRes"></div></div>`;
function lkSearch(q) { const n = norm(q); if (n.length < 2) return []; const out = [];
  LKP.forEach((name, i) => { const nm = norm(nice(name)); if (LKN[i] >= 4 && nm.includes(n)) out.push({ k: "p" + i, label: nice(name), sub: `${LKN[i]} games`, s: nm.startsWith(n) || nm.split(" ").some((w) => w.startsWith(n)) ? 0 : 1, f: -LKN[i] }); });
  LKE.forEach((e, i) => { if (norm(e.n + " " + e.kind).includes(n)) out.push({ k: "e" + i, label: e.n, sub: e.kind, s: 0, f: 0 }); });
  return out.sort((a, b) => a.s - b.s || a.f - b.f).slice(0, 8); }
function lkPlayer(i) {
  const name = nice(LKP[i]), G = LKG.filter((g) => g[2] === i || g[3] === i), bio = PBIO[norm(name)], by = new Map(); let w = 0, d = 0, l = 0, ex = 0;
  G.forEach((g) => { const r = resFor(g, i), e = by.get(g[0]) || { ev: g[0], w: 0, d: 0, l: 0, n: 0, opp: 0, date: "" }; e[r.toLowerCase()]++; e.n++; e.opp += g[2] === i ? g[6] : g[5]; if (g[1] && (!e.date || g[1] < e.date)) e.date = g[1]; by.set(g[0], e); if (r === "W") w++; else if (r === "D") d++; else l++; const ew = (g[9] == null ? 500 : g[9]) / 1000; ex += g[2] === i ? ew : 1 - ew; });
  const evs = [...by.values()].sort((a, b) => (a.date || "9") < (b.date || "9") ? -1 : 1), dated = G.filter((g) => g[1]).sort((a, b) => (a[1] < b[1] ? -1 : 1)), recent = dated.slice(-10).reverse(), scored = w + d / 2;
  let cum = 0, cumE = 0; const pts = dated.map((g) => { const r = resFor(g, i), ew = (g[9] == null ? 500 : g[9]) / 1000; cum += scoreOf(r); cumE += g[2] === i ? ew : 1 - ew; return [cum, cumE]; }), top = Math.max(1, ...pts.map((p) => Math.max(p[0], p[1]))), X = (k) => (pts.length < 2 ? 0 : k / (pts.length - 1) * 300).toFixed(1), Y = (v) => (66 - v / top * 60).toFixed(1);
  const spark = pts.length > 3 ? `<svg class="spark" viewBox="0 0 300 70" preserveAspectRatio="none"><polyline fill="none" stroke="#8a8f8c" stroke-width="1.4" stroke-dasharray="3 3" points="${pts.map((p, k) => X(k) + "," + Y(p[1])).join(" ")}"/><polyline fill="none" stroke="#e8c35a" stroke-width="2" points="${pts.map((p, k) => X(k) + "," + Y(p[0])).join(" ")}"/></svg><p class="fine" style="margin:2px 0 0">Gold: points scored over time. Dashed: what the model expected.</p>` : "";
  const best = evs.filter((e) => e.n >= 5).sort((a, b) => (b.w + b.d / 2) / b.n - (a.w + a.d / 2) / a.n)[0], N = G.length;
  const row = (e) => `<tr><td>${esc(LKE[e.ev].n)}</td><td>${e.date ? esc(e.date.slice(0, 7)) : ""}</td><td>${e.n}</td><td>${e.w}-${e.d}-${e.l}</td><td>${pct((e.w + e.d / 2) / e.n, 0)}</td><td>${Math.round(e.opp / e.n)}</td></tr>`;
  return `<div class="card" style="background:var(--panel);margin-top:12px"><div class="phead">${bio && bio.img ? `<img class="photo" src="${esc(bio.img.replace("http://", "https://"))}?width=240" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : avatar(LKP[i], 84)}<div><h3 style="margin:0;font-size:26px">${esc(name)}</h3><p class="fine" style="margin:2px 0 0">${bio ? [bio.country, `born ${bio.born}`, `peak rating ${bio.peak}`, bio.champ ? "former World Champion" : "", bio.died ? `died ${bio.died}` : ""].filter(Boolean).join(" · ") : "No profile in our player list (peak rating under 2600 or not on Wikidata)."}</p></div></div>
  <div class="wdl"><i class="w" style="width:${w / N * 100}%"></i><i class="d" style="width:${d / N * 100}%"></i><i class="l" style="width:${l / N * 100}%"></i></div><p class="fine" style="margin:0">${w} wins · ${d} draws · ${l} losses</p>
  <div class="tiles"><div class="tile"><small>Games in our data</small><b>${N}</b></div><div class="tile"><small>Score</small><b>${(scored / N * 100).toFixed(0)}%</b></div><div class="tile"><small>Points scored</small><b>${scored}</b><span class="fine">model expected ${ex.toFixed(1)}</span></div>${best ? `<div class="tile"><small>Best event (5+ games)</small><b style="font-size:16px">${esc(LKE[best.ev].n)}</b><span class="fine">${pct((best.w + best.d / 2) / best.n, 0)}</span></div>` : ""}</div>
  ${spark}<h3>${ic("trophy")}Events</h3><table class="tb"><tr><th>Event</th><th>When</th><th>Games</th><th>W-D-L</th><th>Score</th><th>Avg opponent</th></tr>${evs.map(row).join("")}</table>
  ${recent.length ? `<h3>${ic("clock")}Latest games</h3><table class="tb">${recent.map((g) => `<tr><td>${esc(g[1])}</td><td>${g[2] === i ? "White" : "Black"} vs ${esc(nice(LKP[g[2] === i ? g[3] : g[2]]))}</td><td><b>${resFor(g, i)}</b></td><td class="fine">${esc(LKE[g[0]].n)}</td></tr>`).join("")}</table>` : ""}
  <p class="fine" style="margin-top:8px">Only games from the events and months in our data. A player's full career is much longer. "Model expected" uses a model that never saw the event.</p></div>`;
}
function avatar(name, size) { const b = PBIO[norm(nice(name))], s = size || 34, init = nice(name).split(" ").map((w) => w[0]).slice(0, 2).join(""); return b && b.img ? `<img class="av2" style="width:${s}px;height:${s}px" src="${esc(b.img.replace("http://", "https://"))}?width=${s * 2}" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=&quot;av2 ini&quot; style=&quot;width:${s}px;height:${s}px&quot;>${esc(init)}</span>'">` : `<span class="av2 ini" style="width:${s}px;height:${s}px">${esc(init)}</span>`; }
function lkEvent(ei) {
  const E_ = LKE[ei], G = LKG.filter((g) => g[0] === ei), real = new Map(), exp = new Map(), cnt = new Map(), rating = new Map(); let d0 = "", d1 = "";
  G.forEach((g) => { const sw = g[4] === 1 ? 1 : g[4] === 2 ? 0.5 : 0, ew = (g[9] == null ? 500 : g[9]) / 1000; [[g[2], sw, ew, g[5]], [g[3], 1 - sw, 1 - ew, g[6]]].forEach(([p, s, e, r]) => { real.set(p, (real.get(p) || 0) + s); exp.set(p, (exp.get(p) || 0) + e); cnt.set(p, (cnt.get(p) || 0) + 1); rating.set(p, r); }); if (g[1]) { if (!d0 || g[1] < d0) d0 = g[1]; if (!d1 || g[1] > d1) d1 = g[1]; } });
  const players = [...real.keys()], byReal = players.slice().sort((a, b) => real.get(b) - real.get(a) || cnt.get(a) - cnt.get(b)), byExp = players.slice().sort((a, b) => exp.get(b) - exp.get(a) || cnt.get(a) - cnt.get(b));
  const rr = new Map(byReal.map((p, k) => [p, k + 1])), er = new Map(byExp.map((p, k) => [p, k + 1])), big = players.length > 24 || /Cup|Rapid|Blitz/.test(E_.n + E_.kind), N = big ? 10 : players.length, showR = byReal.slice(0, N), showE = byExp.slice(0, N);
  const mx = Math.max(...[...real.values(), ...[...exp.values()]]), err = byReal.slice(0, N).reduce((a, p) => a + Math.abs(rr.get(p) - er.get(p)), 0) / N, podHit = byReal.slice(0, 3).filter((p) => byExp.slice(0, 3).includes(p)).length;
  const row = (p, k, val, other, kind) => `<div class="prow" style="--d:${k * 55}ms"><span class="rk">${k + 1}</span>${avatar(LKP[p], 34)}<div class="pn"><b>${esc(nice(LKP[p]))}</b><div class="pb"><i style="--w:${(val / mx * 100).toFixed(1)}%"></i></div></div><div class="pv"><b>${val % 1 ? val.toFixed(1) : val}</b><small>${kind === "real" ? `model had ${ordn(other)}` : `really ${ordn(other)}`}</small></div></div>`;
  const pod = byReal.slice(0, 3), podOrder = [pod[1], pod[0], pod[2]].filter((x) => x != null), medal = ["🥈", "🥇", "🥉"];
  const gl = (g) => `<tr><td class="fine">${esc(g[7] || "")}</td><td>${esc(nice(LKP[g[2]]))}</td><td><b>${g[4] === 1 ? "1-0" : g[4] === 0 ? "0-1" : "½-½"}</b></td><td>${esc(nice(LKP[g[3]]))}</td><td class="fine">${g[8]} moves</td></tr>`;
  const roundSort = (a, b) => (+a[7] || 0) - (+b[7] || 0) || (a[1] < b[1] ? -1 : 1), games = G.slice().sort(roundSort), last = G.filter((g) => g[1]).sort((a, b) => (a[1] < b[1] ? 1 : -1)).slice(0, 10);
  return `<div class="evhead"><div class="evic">${ic("trophy")}</div><div><h3 style="margin:0;font-size:24px">${esc(E_.n)}</h3><p class="fine" style="margin:0">${esc(E_.kind)} · ${d0 ? esc(d0) + (d1 !== d0 ? " to " + esc(d1) : "") : "dates not given"} · ${G.length} games · ${players.length} players</p></div></div>
  <div class="tiles"><div class="tile"><small>Winner (most points)</small><b style="font-size:20px">${esc(nice(LKP[byReal[0]]))}</b></div><div class="tile"><small>Model's pick</small><b style="font-size:20px;${byExp[0] === byReal[0] ? "color:var(--ok)" : ""}">${esc(nice(LKP[byExp[0]]))}</b><span class="fine">${byExp[0] === byReal[0] ? "got it right" : "missed"}</span></div><div class="tile"><small>Podium names right</small><b>${podHit}/3</b></div><div class="tile"><small>Average rank miss</small><b>${err.toFixed(1)}</b><span class="fine">places</span></div></div>
  ${big ? `<p class="fine">A big or knockout event: points below are from the games in our data and are <b>not</b> the final result. Showing the top ${N}.</p>` : ""}
  <div class="podium">${podOrder.map((p, k) => `<div class="pod p${[2, 1, 3][k]}" style="--d:${k * 140}ms">${avatar(LKP[p], 64)}<b>${esc((() => { const parts = nice(LKP[p]).split(" "); return parts[parts.length - 1].length <= 2 ? parts[0] : parts[parts.length - 1]; })())}</b><span>${medal[k]} ${real.get(p)}</span><div class="step"></div></div>`).join("")}</div>
  <div class="vs2"><div><h3>${ic("chart")}Real table</h3>${showR.map((p, k) => row(p, k, real.get(p), er.get(p), "real")).join("")}</div><div><h3>${ic("brain")}Model's predicted table</h3>${showE.map((p, k) => row(p, k, +exp.get(p).toFixed(1), rr.get(p), "pred")).join("")}<p class="fine">Expected points added up over every game, from a model trained on the <b>other</b> events. It never saw this one.</p></div></div>
  <details style="margin-top:12px"><summary class="fine" style="cursor:pointer">${big ? "Latest games" : "All games"}</summary><div style="max-height:360px;overflow:auto"><table class="tb">${(big ? last : games).map(gl).join("")}</table></div></details>
  <p class="fine" style="margin-top:8px">Built from the games in our data (Lichess broadcasts). If a round is missing from the broadcast, it is missing here too, so check the game count.</p>`;
}
document.addEventListener("input", (e) => { if (e.target.id !== "lkIn") return; const r = lkSearch(e.target.value); $("#lkSug").innerHTML = r.map((x) => `<button class="opt" data-lk="${x.k}" type="button">${esc(x.label)}<br><span class="fine">${esc(x.sub)}</span></button>`).join(""); });
/* ---------- Our model ---------- */
function modelPage() { setTimeout(() => countUp($("#app")), 60);
  const by = S.bySpeed, es = E.summary;
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="home">← Menu</button></div>${lkCard()}<div class="card" style="margin-top:12px"><h2>${ic("chart")}Our model</h2>
  <h3>${ic("bulb")}What it does</h3><p>Given two players' ratings and the time control, it estimates the chance of a White win, a draw and a Black win, and how long the game lasts. It is a logistic regression: a simple way of turning the rating gap into probabilities. It learns from 80% of the games and is scored only on the other 20%, which it never saw.</p>
  <h3>${ic("target")}Everyday games (Lichess, January 2024)</h3><div class="tiles"><div class="tile"><small>Result right</small><b>${pct(S.acc)}</b></div><div class="tile"><small>Always pick White</small><b>${pct(S.white)}</b></div><div class="tile"><small>Always pick the higher rating</small><b>${pct(S.higher)}</b></div><div class="tile"><small>Length bucket right</small><b>${pct(S.len_acc)}</b><span class="fine">guessing the commonest: ${pct(S.len_base)}</span></div></div>
  <p class="fine">Tested on ${S.n.toLocaleString()} unseen games. Most opponents are within 100 rating points, so results are close to coin flips and the edge is small.</p>
  <table class="tb"><tr><th>Speed</th><th>Games</th><th>Model</th><th>Higher rating</th></tr>${Object.entries(by).map(([k, v]) => `<tr><td>${k}</td><td>${v.n.toLocaleString()}</td><td>${pct(v.acc)}</td><td>${pct(v.higher)}</td></tr>`).join("")}</table>
  <h3>${ic("trophy")}The biggest events</h3><div class="tiles"><div class="tile"><small>Result right</small><b>${pct(es.acc)}</b></div><div class="tile"><small>Always pick White</small><b>${pct(es.white)}</b></div><div class="tile"><small>Higher rating wins</small><b>${pct(es.higher)}</b></div><div class="tile"><small>Games drawn</small><b>${pct(es.draw)}</b></div></div>
  <p class="fine">Separate model for elite games, scored on ${es.n.toLocaleString()} unseen games (it learned from ${es.train.toLocaleString()}). Events: ${es.events.map(esc).join("; ")}. Only the World Championship match, the Candidates, Norway Chess, Tata Steel Masters, the FIDE World Rapid and Blitz Championships and the World Cup are used; qualifiers, team events and side tournaments are left out.</p>
  <table class="tb"><tr><th>Event</th><th>Test games</th><th>Model</th><th>Drawn</th></tr>${Object.entries(es.byEvent).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}</td><td>${pct(v.acc)}</td><td>${pct(v.draw)}</td></tr>`).join("")}</table>
  <h3>${ic("warn")}Honest limits</h3><ul><li>Everyday games: one month (January 2024), a 250 MB slice of the standard rated games. Lichess players, not tournament chess.</li><li>Elite games: Lichess's official broadcast feeds for 14 chosen months from 2023 to 2026. The World Championship has only the 2024 match (14 games) and the Candidates only 2024 and 2026, so those results are too few to say much; the page shows the counts.</li><li>Blunder or fine?: Stockfish's own evaluations stored in about 70,000 Lichess games. A move is a blunder if the evaluation fell by 3 pawns or more. <b>"Brilliant" moves are not included</b>: they need multi-line engine analysis I do not have.</li><li>Estimate my Elo uses Lichess puzzle ratings, not game ratings, and ten puzzles only.</li><li>Play my AI is a small home-made engine, not Stockfish.</li><li>Player facts come from Wikidata and only cover players with a peak rating of 2600 or more.</li></ul></div>`;
}
/* ---------- events ---------- */
/* page transitions: the browser's own view transitions where it has them, a short fade-in otherwise; never during a match or with Reduce motion */
function pageTo(fn, box) {
  const calm = (typeof REDUCED !== "undefined" && REDUCED) || document.hidden || (typeof live !== "undefined" && live && !live.watch && st && st.game === "ai" && !st.over);
  if (!calm && document.startViewTransition) { try { const vt = document.startViewTransition(() => { fn(); }); [vt.ready, vt.finished, vt.updateCallbackDone].forEach((x) => x && x.catch(() => {})); return; }   /* an overlapping transition is skipped on purpose; don't report it as an error */ catch (e) { /* fall through */ } }
  fn(); if (calm) return; const els = box ? [box] : [...document.querySelectorAll("#home:not([hidden]), #lobby:not([hidden]), #league:not([hidden]), #profilePage:not([hidden]), #setPage:not([hidden]), #aboutPage:not([hidden]), #discPage:not([hidden])")].slice(0, 2); els.forEach((x) => { if (!x) return; x.classList.remove("pgin"); void x.offsetWidth; x.classList.add("pgin"); });
}
function fresh() { if (typeof rvStop === "function") rvStop(); if (typeof olClose === "function") olClose(); const a = $("#app"); a.className = "fresh"; clearTimeout(fresh.t); fresh.t = setTimeout(() => { a.className = ""; }, 500); }
function reviewIntro() {
  rvStop(); clearInterval(st.timer); live = null; st = { game: "reviewIntro" };
  $("#app").className = "fresh"; $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="home">← Menu</button></div><div class="card"><h2>${ic("chart")}Review a game</h2><p class="sub">Paste a game in PGN or just the moves (like <span class="fine">1. e4 e5 2. Nf3 Nc6</span>), or take a real game between top players.</p><textarea id="pgnIn" aria-label="Paste a game in PGN" rows="6" placeholder="Paste your PGN here" style="width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:12px;color:var(--ink);padding:12px;font:13px ui-monospace,Menlo,monospace"></textarea><p class="fine" id="pgnMsg"></p><div class="row"><button class="btn" id="pgnGo">Review it</button><button class="btn ghost" id="pgnElite">Use a real top-level game</button></div></div><div class="card" style="margin-top:12px"><h3 style="margin:0 0 6px">${ic("user")}Your own games</h3><p class="fine" style="margin-top:0">Type your username and pick the site. Your last 20 games appear; tap one and Pip reviews it with you.</p><div class="row"><input class="t" id="impUser" aria-label="Lichess or chess.com username" placeholder="Username" value="${esc(impUser().user || "")}" autocomplete="off" style="flex:1;min-width:160px"><button class="chip ${impUser().site !== "cc" ? "on" : ""}" data-impsite="li" type="button">Lichess</button><button class="chip ${impUser().site === "cc" ? "on" : ""}" data-impsite="cc" type="button">Chess.com</button></div><div id="impList" style="margin-top:10px"></div></div>`;
  const iu = impUser(); if (iu.user) impLoad(iu.site || "li", iu.user);   // your games come back where you left them
}
/* =====================================================================================================================
   Four games with four different mechanics:
   Human bar (drag the evaluation bar), Spot the tactic (tap free pieces against a clock), Blindfold memory (rebuild a board
   from memory), Endgame verdict (call the result, then play it out against Stockfish).
   ===================================================================================================================== */
const cpFromW = (w) => { const x = Math.max(0.5, Math.min(99.5, w)); return Math.round(-Math.log(2 / ((x - 50) / 50 + 1) - 1) / 0.00368208); };
const evTxt = (cp) => (cp > 0 ? "+" : cp < 0 ? "-" : "") + Math.abs(cp / 100).toFixed(1);
/* ---------- the finale for chess: a trophy that pops in (gold win, silver draw, bronze otherwise), light rays and confetti on a win,
   numbers that count up, and your coach reacting with a line ---------- */
const CH_TROPHY = (tone) => `<svg viewBox="0 0 64 64" class="fintro ${tone}" aria-hidden="true"><defs><linearGradient id="cfg-${tone}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${tone === "gold" ? "#ffe27a" : tone === "silver" ? "#f2f4f8" : "#e7b07a"}"/><stop offset="1" stop-color="${tone === "gold" ? "#d49a12" : tone === "silver" ? "#9aa3b2" : "#a8642c"}"/></linearGradient></defs><path d="M18 8h28v12a14 14 0 0 1-28 0z" fill="url(#cfg-${tone})" stroke="#0006" stroke-width="2"/><path d="M18 12H9a9 9 0 0 0 11 12M46 12h9a9 9 0 0 1-11 12" fill="none" stroke="url(#cfg-${tone})" stroke-width="4" stroke-linecap="round"/><rect x="29" y="33" width="6" height="11" fill="url(#cfg-${tone})"/><rect x="20" y="44" width="24" height="8" rx="2" fill="url(#cfg-${tone})" stroke="#0006" stroke-width="2"/><path d="M27 15l5-3 5 3-2 6h-6z" fill="#fff" opacity=".55"/></svg>`;
const endCoach = (res) => { const k = res === "win" ? "great_game" : res === "draw" ? "ok_game" : "rough_game"; return `<div class="endcoach">${pipSVG(res === "win" ? "wow" : res === "draw" ? "calm" : "sad")}<span><b>${esc(coachName())}</b>${esc(pipPick(k, Date.now() % 97))}</span></div>`; };
const endTop = (res) => `<div class="endrays"></div>${CH_TROPHY(res === "win" ? "gold" : res === "draw" ? "silver" : "bronze")}`;
function chCount() { document.querySelectorAll(".chnum").forEach((el, i) => { const to = +el.dataset.to || 0; setTimeout(() => { const t0 = performance.now(); (function f(t) { const k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3); if (!el.isConnected) return; el.textContent = Math.round(to * e).toLocaleString(); if (k < 1) requestAnimationFrame(f); else el.classList.add("land"); })(t0); }, 250 + i * 150); }); }
const sumCard = (title, icn, score, outOf, key, rows, again) => { const prev = bestOf(key); bump(key, score); const pct = outOf ? score / outOf : 0, res = pct >= 0.6 ? "win" : pct >= 0.35 ? "draw" : "loss", best = score > prev && score > 0; setTimeout(() => { chCount(); if (res === "win") { try { Snd.end(true); } catch (e) { /* quiet */ } } }, 30); return `<div class="card">${backRow(title, icn, "")}<div class="chfin ${res}">${endTop(res)}<div class="finkick">Final score</div><div class="chfinv">${res === "win" ? "Brilliant run." : res === "draw" ? "Solid." : "Keep at it."}${best ? ' <span class="newbest">New best!</span>' : ""}</div><div class="tiles chtiles"><div class="tile"><small>Score</small><b class="chnum" data-to="${score}">0</b><span class="fine">of ${outOf}</span></div><div class="tile"><small>Best</small><b class="chnum" data-to="${Math.max(prev, score)}">0</b></div></div>${endCoach(res)}</div>${rows}<div class="row" style="margin-top:12px;justify-content:center"><button class="btn" data-go="${again}">Play again</button><button class="btn ghost" data-hub="bk">All games</button></div></div>`; };
const needNet = (title) => `<div class="card">${backRow(title, "warn", "")}<p class="sub"><b>Stockfish could not load.</b> This game needs an internet connection to download the engine (about 1.5 MB).</p><div class="row"><button class="btn" data-go="${st.game}">Try again</button><button class="btn ghost" data-hub="bk">Back</button></div></div>`;

/* ---------- Human bar ---------- */
function hbCand() { const g = rnd(EM.filter((x) => x.moves.length >= 44)), ply = 14 + Math.floor(Math.random() * Math.min(44, g.moves.length - 16)), c = fenOf(g.moves.slice(0, ply)); return c.game_over() ? hbCand() : { fen: c.fen(), g, ply }; }
async function hbPick() {
  const band = dpick([240, 900], [110, 320], [40, 160], [0, 80]);
  const res = (await Promise.all(Array.from({ length: 4 }, hbCand).map((c) => Sf.analyse(c.fen, { multipv: 1, depth: 11, ms: 1800 }).then((l) => (l.length ? { c, ev: lineW(l[0], new Chess(c.fen).turn()), l } : null)).catch(() => null)))).filter(Boolean);
  if (!res.length) throw new Error("engine");
  const dist = (r) => { const a = Math.min(1000, Math.abs(r.ev.cp)); return a < band[0] ? band[0] - a : a > band[1] ? a - band[1] : 0; };
  return res.sort((x, y) => dist(x) - dist(y))[0];
}
function hbStart() { st = { game: "hbar", round: 0, score: 0, rounds: 5, log: [] }; hbNext(); }
async function hbNext() {
  const me = st; me.round++; me.phase = "load"; me.cur = null; hbPaint();
  try { me.cur = await (me.pre || hbPick()); } catch (e) { if (st === me) $("#app").innerHTML = needNet("Human bar"); return; }
  if (st !== me) return; me.pre = me.round < me.rounds ? hbPick().catch(() => null) : null; me.gw = 50; me.phase = "ask"; hbPaint();
}
function hbPaint() {
  const s = st, cur = s.cur, c = new Chess(cur ? cur.c.fen : undefined), head = backRow("Human bar", "chart", `Round ${s.round} of ${s.rounds} · ${s.score} points`);
  const turn = cur ? sideName(c) : "";
  let msg, btn;
  if (s.phase === "load") { msg = `<p class="sub"><span class="spin"></span> Stockfish is choosing a position…</p>`; btn = ""; }
  else if (s.phase === "ask") { msg = `<p class="sub">${turn} to move. Drag the bar to where you think Stockfish puts this position. Top is Black winning, bottom is White winning.</p>`; btn = `<div class="row"><b class="num" id="hbVal">${evTxt(cpFromW(s.gw))}</b><button class="btn" id="hbLock" type="button">Lock it in</button></div>`; }
  else {
    const t = cur.ev, d = Math.abs(s.gw - t.w), pts = s.pts;
    msg = `<p class="sub"><b>${d < 6 ? "Spot on." : d < 15 ? "Close." : d < 30 ? "A bit off." : "Way off."}</b> Stockfish says <b>${fmtEv(t)}</b> (White's winning chances ${Math.round(t.w)}%). You said <b>${evTxt(cpFromW(s.gw))}</b>. <span class="fine">Best line: ${esc(pvLine(cur.c.fen, cur.l[0].pv, 5))}</span></p>`;
    btn = `<div class="row"><b>+${pts}</b><button class="btn" id="hbNext" type="button">${s.daily ? "Back to daily" : s.round >= s.rounds ? "See results" : "Next position"}</button></div>`;
  }
  $("#app").innerHTML = `<div class="card rvcard" style="max-width:640px">${head}${msg}<div class="rvbd"><div class="evv hb" id="hbBar"><i id="hbFill" style="height:${s.phase === "reveal" ? s.gw : s.gw || 50}%"></i>${s.phase === "reveal" ? `<u class="evm" style="bottom:${cur.ev.w}%"></u>` : ""}</div><div class="lvwrap" id="rvWrap">${s.phase === "load" ? `<div class="board" style="opacity:.45"></div>` : boardHTML(c, {})}</div></div>${btn}</div>`;
}
document.addEventListener("pointerdown", (e) => {
  const bar = e.target.closest && e.target.closest("#hbBar"); if (!bar || st.game !== "hbar" || st.phase !== "ask") return;
  const set = (ev) => { const r = bar.getBoundingClientRect(), w = Math.max(0, Math.min(100, 100 - 100 * (ev.clientY - r.top) / r.height)); st.gw = w; $("#hbFill").style.height = w + "%"; $("#hbVal").textContent = evTxt(cpFromW(w)); };
  set(e); const mv = (ev) => set(ev), up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); }; addEventListener("pointermove", mv); addEventListener("pointerup", up);
});
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("button"); if (!t || st.game !== "hbar") return;
  if (t.id === "hbLock") { const d = Math.abs(st.gw - st.cur.ev.w); st.pts = Math.max(0, Math.round(100 - d * 3)); st.score += st.pts; st.phase = "reveal"; st.log.push([evTxt(cpFromW(st.gw)), fmtEv(st.cur.ev), st.pts]); Snd.ok && Snd.ok(); hbPaint(); }
  else if (t.id === "hbNext") { if (st.daily) { dailyMark("h", st.score); return dailyPage(); } if (st.round >= st.rounds) $("#app").innerHTML = sumCard("Human bar", "chart", st.score, 500, "hbar", `<table class="tb"><tr><th>Round</th><th>You</th><th>Stockfish</th><th>Points</th></tr>${st.log.map((r, i) => `<tr><td>${i + 1}</td><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table><p class="fine" style="margin-top:8px">Stockfish 10, searched to about 11 moves deep, so close calls can differ from a stronger engine.</p>`, "hbar"); else hbNext(); }
});

/* ---------- Spot the tactic ---------- */
function freeSquares(c, minNet) {
  const out = new Set();
  c.moves({ verbose: true }).forEach((m) => {
    if (!m.captured || m.captured === "k" || m.promotion || /e/.test(m.flags) || out.has(m.to)) return;
    const val = VAL[m.captured]; c.move(m); const recap = c.moves({ verbose: true }).some((x) => x.to === m.to && x.captured); c.undo();
    if (val - (recap ? VAL[m.piece] : 0) >= minNet) out.add(m.to);
  });
  return [...out];
}
function tactPos(minNet) {
  const pool = shuffle(PZ.filter((p) => pzBand(p)).concat(PZ.slice(0, 200)));
  for (let k = 0; k < pool.length && k < 700; k++) { const p = pool[k], c = new Chess(p.fen), f = p.moves[0]; c.move(uciMv(f)); const free = freeSquares(c, minNet); if (free.length) return { c, free, last: [f.slice(0, 2), f.slice(2, 4)] }; }
  return null;
}
function tactStart() { st = { game: "tact", round: 0, score: 0, rounds: 6, log: [], minNet: dpick(300, 200, 100, 100), secs: dpick(30, 22, 16, 12) }; tactNext(); }
function tactNext() {
  const s = st; s.round++; s.pos = s.daily ? seeded(todayK() + "t", () => tactPos(s.minNet)) : tactPos(s.minNet); if (!s.pos) { $("#app").innerHTML = `<div class="card">${backRow("Spot the tactic", "target", "")}<p class="sub">I could not find a position. Try again.</p><button class="btn" data-go="tact">Retry</button></div>`; return; }
  s.marks = new Set(); s.phase = "ask"; s.left = s.secs * 1000; s.t0 = Date.now(); clearInterval(s.timer); s.timer = setInterval(tactTick, 100); tactPaint();
}
function tactTick() { const s = st; if (s.game !== "tact" || s.phase !== "ask") return clearInterval(s.timer); s.left = Math.max(0, s.secs * 1000 - (Date.now() - s.t0)); const b = $("#tbar"), l = $("#tleft"); if (b) b.style.width = (100 * s.left / (s.secs * 1000)) + "%"; if (l) l.textContent = Math.ceil(s.left / 1000) + "s"; if (s.left <= 0) tactReveal(); }
function tactPaint() {
  const s = st, c = s.pos.c, side = sideName(c), foe = side === "White" ? "Black" : "White";
  $("#app").innerHTML = `<div class="card rvcard" style="max-width:640px">${backRow("Spot the tactic", "target", `Position ${s.round} of ${s.rounds} · ${s.score} points`)}<p class="sub">${side} to move. Tap every ${foe} piece you could win for free: nothing can take it back, or it is worth more than the piece that takes it. Then press Done.</p><div class="meter"><i id="tbar" style="width:100%"></i></div><div class="lvwrap" id="rvWrap">${boardHTML(c, { flip: c.turn() === "b", last: s.pos.last })}</div><div class="row" style="justify-content:space-between;margin-top:8px"><span class="fine">Free pieces: ${s.pos.free.length > 1 ? "more than one" : "at least one"} · <b id="tleft">${s.secs}s</b></span><button class="btn" id="tactDone" type="button">Done</button></div></div>`;
}
function tactReveal() {
  const s = st; if (s.phase !== "ask") return; s.phase = "reveal"; clearInterval(s.timer);
  const free = new Set(s.pos.free), hit = [...s.marks].filter((x) => free.has(x)), bad = [...s.marks].filter((x) => !free.has(x)), miss = s.pos.free.filter((x) => !s.marks.has(x));
  const bonus = !bad.length && !miss.length ? Math.round(40 * s.left / (s.secs * 1000)) : 0, pts = Math.max(0, hit.length * 100 - bad.length * 60 + bonus); s.score += pts; s.log.push([hit.length, free.size, bad.length, pts]);
  document.querySelectorAll("#rvWrap i[data-sq]").forEach((el) => { const q = el.dataset.sq; el.classList.remove("mk"); if (hit.includes(q)) el.classList.add("hit"); else if (bad.includes(q)) el.classList.add("fp"); else if (miss.includes(q)) el.classList.add("ms"); });
  const row = document.querySelector("#app .row:last-child"); row.innerHTML = `<span><b>+${pts}</b> · ${hit.length} of ${free.size} found${bad.length ? `, ${bad.length} wrong` : ""}${bonus ? `, +${bonus} speed` : ""}</span><button class="btn" id="tactNext" type="button">${s.daily ? "Back to daily" : s.round >= s.rounds ? "See results" : "Next position"}</button>`;
  Snd.ok && (!bad.length && !miss.length ? Snd.ok() : 0);
}
document.addEventListener("click", (e) => {
  if (st.game !== "tact") return; const sq = e.target.closest && e.target.closest("#rvWrap i[data-sq]");
  if (sq && st.phase === "ask") { const q = sq.dataset.sq; if (st.marks.has(q)) { st.marks.delete(q); sq.classList.remove("mk"); } else { st.marks.add(q); sq.classList.add("mk"); } return; }
  const t = e.target.closest && e.target.closest("button"); if (!t) return;
  if (t.id === "tactDone") tactReveal(); else if (t.id === "tactNext") { if (st.daily) { dailyMark("t", st.score); return dailyPage(); } if (st.round >= st.rounds) $("#app").innerHTML = sumCard("Spot the tactic", "target", st.score, 6 * 340, "tact", `<table class="tb"><tr><th>Position</th><th>Found</th><th>Wrong taps</th><th>Points</th></tr>${st.log.map((r, i) => `<tr><td>${i + 1}</td><td>${r[0]} / ${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join("")}</table>`, "tact"); else tactNext(); }
});

/* ---------- Blindfold memory ---------- */
const BL_PCS = ["wk", "wq", "wr", "wb", "wn", "wp", "bk", "bq", "br", "bb", "bn", "bp"];
function blindPos() {
  const n = dpick(6 + Math.floor(Math.random() * 3), 10 + Math.floor(Math.random() * 4), 15 + Math.floor(Math.random() * 5), 22 + Math.floor(Math.random() * 4)), g = rnd(EM.filter((x) => x.moves.length >= 40)), c = fenOf(g.moves.slice(0, dpick(36, 30, 26, 18)));
  const list = []; c.board().forEach((r, ri) => r.forEach((p, fi) => { if (p) list.push({ sq: "abcdefgh"[fi] + (8 - ri), p }); }));
  const keep = shuffle(list.filter((x) => x.p.type !== "k")).slice(0, Math.max(0, n - 2)).concat(list.filter((x) => x.p.type === "k")), b = new Chess(); b.clear(); keep.forEach((x) => b.put(x.p, x.sq));
  return { c: b, n: keep.length };
}
function blindStart() { st = { game: "blind", round: 0, score: 0, rounds: 5, log: [] }; blindNext(); }
function blindNext() {
  const s = st; s.round++; s.pos = blindPos(); s.cb = new Chess(); s.cb.clear(); s.tool = "wp"; s.phase = "show"; s.secs = dpick(14, 10, 8, 7); s.t0 = Date.now(); clearInterval(s.timer); s.timer = setInterval(() => { const left = s.secs * 1000 - (Date.now() - s.t0), b = $("#tbar"); if (b) b.style.width = Math.max(0, 100 * left / (s.secs * 1000)) + "%"; if (left <= 0) { clearInterval(s.timer); blindBuild(); } }, 100); blindPaint();
}
function blindBuild() { st.phase = "build"; blindPaint(); }
function blindPaint() {
  const s = st, head = backRow("Blindfold memory", "eye", `Board ${s.round} of ${s.rounds} · ${s.score} points`);
  if (s.phase === "show") { $("#app").innerHTML = `<div class="card rvcard" style="max-width:640px">${head}<p class="sub">Memorise the ${s.pos.n} pieces. The board disappears when the bar runs out.</p><div class="meter"><i id="tbar" style="width:100%"></i></div><div class="lvwrap" id="rvWrap">${boardHTML(s.pos.c, {})}</div><div class="row"><button class="btn ghost" id="blSkip" type="button">I have it</button></div></div>`; return; }
  const pal = [...BL_PCS.map((k) => `<button type="button" class="pal ${s.tool === k ? "on" : ""}" data-pal="${k}" title="${k}"><b class="pcz pc-${k}"></b></button>`), `<button type="button" class="pal ${s.tool === "x" ? "on" : ""}" data-pal="x" title="Erase">✕</button>`].join("");
  if (s.phase === "build") { $("#app").innerHTML = `<div class="card rvcard" style="max-width:640px">${head}<p class="sub">Rebuild the position. Pick a piece, then tap squares. There were <b>${s.pos.n}</b> pieces.</p><div class="lvwrap" id="rvWrap">${boardHTML(s.cb, {})}</div><div class="pals">${pal}</div><div class="row"><span class="fine">${s.cb.board().flat().filter(Boolean).length} placed</span><button class="btn" id="blDone" type="button">Check it</button></div></div>`; return; }
  const want = {}, got = {}; s.pos.c.board().forEach((r, ri) => r.forEach((p, fi) => { if (p) want["abcdefgh"[fi] + (8 - ri)] = p.color + p.type; })); s.cb.board().forEach((r, ri) => r.forEach((p, fi) => { if (p) got["abcdefgh"[fi] + (8 - ri)] = p.color + p.type; }));
  $("#app").innerHTML = `<div class="card rvcard" style="max-width:640px">${head}<p class="sub"><b>${s.ok} of ${s.pos.n} right</b>${s.extra ? `, ${s.extra} in the wrong place` : ""}. Green is correct, red is wrong, amber is what you missed. Points: <b>+${s.pts}</b></p><div class="lvwrap" id="rvWrap">${boardHTML(s.cb, {})}</div><div class="row"><span></span><button class="btn" id="blNext" type="button">${s.round >= s.rounds ? "See results" : "Next board"}</button></div></div>`;
  document.querySelectorAll("#rvWrap i[data-sq]").forEach((el) => { const q = el.dataset.sq; if (got[q] && got[q] === want[q]) el.classList.add("hit"); else if (got[q]) el.classList.add("fp"); else if (want[q]) { el.classList.add("ms"); el.insertAdjacentHTML("afterbegin", `<b class="pcz pc-${want[q]}" style="opacity:.55"></b>`); } });
}
document.addEventListener("click", (e) => {
  if (st.game !== "blind") return; const t = e.target.closest && e.target.closest("button"), sq = e.target.closest && e.target.closest("#rvWrap i[data-sq]");
  if (sq && st.phase === "build") { const q = sq.dataset.sq, cur = st.cb.get(q), want = st.tool; if (want === "x" || (cur && cur.color + cur.type === want)) st.cb.remove(q); else st.cb.put({ color: want[0], type: want[1] }, q); const keep = $("#rvWrap"); keep.innerHTML = boardHTML(st.cb, {}); const f = $("#app .fine"); if (f) f.textContent = st.cb.board().flat().filter(Boolean).length + " placed"; return; }
  if (!t) return;
  if (t.dataset.pal) { st.tool = t.dataset.pal; document.querySelectorAll(".pal").forEach((x) => x.classList.toggle("on", x.dataset.pal === st.tool)); return; }
  if (t.id === "blSkip") { clearInterval(st.timer); blindBuild(); }
  else if (t.id === "blDone") { const want = {}, got = {}; st.pos.c.board().forEach((r, ri) => r.forEach((p, fi) => { if (p) want["abcdefgh"[fi] + (8 - ri)] = p.color + p.type; })); st.cb.board().forEach((r, ri) => r.forEach((p, fi) => { if (p) got["abcdefgh"[fi] + (8 - ri)] = p.color + p.type; })); st.ok = Object.keys(got).filter((q) => got[q] === want[q]).length; st.extra = Object.keys(got).length - st.ok; st.pts = Math.round(100 * Math.max(0, st.ok - 0.5 * st.extra) / st.pos.n); st.score += st.pts; st.log.push([st.ok, st.pos.n, st.extra, st.pts]); st.phase = "reveal"; blindPaint(); }
  else if (t.id === "blNext") { if (st.round >= st.rounds) $("#app").innerHTML = sumCard("Blindfold memory", "eye", st.score, 500, "blind", `<table class="tb"><tr><th>Board</th><th>Right</th><th>Misplaced</th><th>Points</th></tr>${st.log.map((r, i) => `<tr><td>${i + 1}</td><td>${r[0]} / ${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join("")}</table>`, "blind"); else blindNext(); }
});

/* ---------- Endgame verdict: call the result, then play it out against Stockfish ---------- */
function egCand() { const g = rnd(EM.filter((x) => x.moves.length >= 70)), c = fenOf(g.moves.slice(0, g.moves.length - Math.floor(Math.random() * 14))); return { fen: c.fen(), n: c.board().flat().filter(Boolean).length, over: c.game_over() }; }
async function egPick() {
  const want = rnd(["w", "d", "b"]), cands = []; for (let k = 0; k < 60 && cands.length < 4; k++) { const x = egCand(); if (!x.over && x.n <= dpick(7, 9, 11, 13) && x.n >= 3) cands.push(x); }
  if (!cands.length) throw new Error("none");
  const res = (await Promise.all(cands.map((c) => Sf.analyse(c.fen, { depth: 14, ms: 2500 }).then((l) => (l.length ? { c, ev: lineW(l[0], new Chess(c.fen).turn()), l } : null)).catch(() => null)))).filter(Boolean);
  if (!res.length) throw new Error("engine");
  const vd = (r) => (r.ev.cp >= 150 ? "w" : r.ev.cp <= -150 ? "b" : Math.abs(r.ev.cp) <= 50 ? "d" : null), ok = res.filter((r) => vd(r)); const pick = ok.find((r) => vd(r) === want) || ok[0]; if (!pick) return egPick(); pick.v = vd(pick); return pick;
}
function egStart() { st = { game: "endg", round: 0, score: 0, rounds: 5, log: [] }; egNext(); }
async function egNext() {
  const me = st; me.round++; me.phase = "load"; me.cur = null; live = null; egPaint();
  try { me.cur = await (me.pre || egPick()); } catch (e) { if (st === me) $("#app").innerHTML = needNet("Endgame verdict"); return; }
  if (st !== me) return; me.pre = me.round < me.rounds ? egPick().catch(() => null) : null; me.phase = "ask"; egPaint();
}
const EGV = { w: "White wins", d: "Draw", b: "Black wins" };
function egPaint() {
  const s = st, cur = s.cur, c = new Chess(cur ? cur.c.fen : undefined), head = backRow("Endgame verdict", "crown", `Endgame ${s.round} of ${s.rounds} · ${s.score} points`);
  if (s.phase === "load") { $("#app").innerHTML = `<div class="card rvcard" style="max-width:640px">${head}<p class="sub"><span class="spin"></span> Stockfish is finding an endgame…</p></div>`; return; }
  if (s.phase === "play") { liveRender(head + `<p class="sub">You are ${sideName(c)}. Stockfish plays the other side. Click a piece, then a square.</p>`, `<div class="row"><span class="fine">${esc(s.msg || "Stockfish thinks quickly, so be careful.")}</span><button class="btn ghost" id="egStop" type="button">Stop</button></div>`, null, { moves: false }); return; }
  const info = s.phase === "ask" ? `<p class="sub">${sideName(c)} to move. With best play, how does this end?</p><div class="row">${["w", "d", "b"].map((k) => `<button class="btn ghost" data-egv="${k}" type="button">${EGV[k]}</button>`).join("")}</div>` : `<p class="sub"><b>${s.pick === cur.v ? "Right." : "Not quite."}</b> Stockfish says <b>${EGV[cur.v]}</b> (${fmtEv(cur.ev)}). You said ${EGV[s.pick]}. <span class="fine">Best line: ${esc(pvLine(cur.c.fen, cur.l[0].pv, 6))}</span></p><div class="row"><button class="btn" id="egPlay" type="button">Play it out</button><button class="btn ghost" id="egNext" type="button">${s.round >= s.rounds ? "See results" : "Next endgame"}</button></div>${s.result ? `<p class="fine">${esc(s.result)}</p>` : ""}`;
  $("#app").innerHTML = `<div class="card rvcard" style="max-width:640px">${head}<div class="lvwrap" id="rvWrap">${boardHTML(c, { flip: c.turn() === "b" })}</div>${info}</div>`;
}
function egEndPlay(msg) { live = null; st.result = msg; st.phase = "reveal"; egPaint(); }
function egMachine() {
  const L = live; if (!L) return; const c = L.c; if (c.game_over()) return egEndPlay(c.in_checkmate() ? (c.turn() === L.color ? "Stockfish checkmated you." : "You checkmated Stockfish!") : "The game ended in a draw."); if (c.history().length >= 80) return egEndPlay("Stopped after 40 moves each.");
  L.lock = true; st.msg = "Stockfish is thinking…"; egPaint();
  Sf.analyse(c.fen(), { depth: 9, ms: 400 }).then((l) => { if (live !== L) return; const m = l.length ? c.move(uciMv(l[0].pv[0])) : null; L.lock = false; if (m) { L.last = [m.from, m.to]; Snd.move(m, c); } st.msg = ""; if (c.game_over() || c.history().length >= 80) return egMachine(); egPaint(); }).catch(() => egEndPlay("Stockfish stopped responding."));
}
document.addEventListener("click", (e) => {
  if (st.game !== "endg") return; const t = e.target.closest && e.target.closest("button"); if (!t) return;
  if (t.dataset.egv) { st.pick = t.dataset.egv; const ok = st.pick === st.cur.v; st.pts = ok ? 100 : 0; st.score += st.pts; st.log.push([EGV[st.pick], EGV[st.cur.v], fmtEv(st.cur.ev), st.pts]); st.phase = "reveal"; egPaint(); }
  else if (t.id === "egPlay") { const c = new Chess(st.cur.c.fen); st.phase = "play"; st.msg = ""; live = { c, color: c.turn(), sel: null, targets: [], caps: [], last: null, lock: false, refresh: () => egPaint(), onMove: () => { egMachine(); } }; egPaint(); }
  else if (t.id === "egStop") egEndPlay("You stopped the game.");
  else if (t.id === "egNext") { live = null; if (st.round >= st.rounds) $("#app").innerHTML = sumCard("Endgame verdict", "crown", st.score, 500, "endg", `<table class="tb"><tr><th>#</th><th>You said</th><th>Stockfish</th><th>Eval</th><th>Points</th></tr>${st.log.map((r, i) => `<tr><td>${i + 1}</td><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join("")}</table>`, "endg"); else { st.result = ""; egNext(); } }
});

/* =====================================================================================================================
   Chess accounts and leaderboards (a separate `chess` schema in the same Supabase project; logins are shared with the other sports),
   and the Daily challenges page (three things, the same for everyone today, with a streak).
   ===================================================================================================================== */
const mb32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hashS = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const seeded = (key, fn) => { const o = Math.random; Math.random = mb32(hashS(key)); try { return fn(); } finally { Math.random = o; } };
const todayK = () => new Date().toISOString().slice(0, 10);
const weekK = (d = new Date()) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() * 100 + Math.ceil(((t - y) / 864e5 + 1) / 7); };
const Cloud = {
  cfg: DATA.board || null, session: null, nick: store.get("nick", ""), live: null,
  get on() { return !!(this.cfg && this.cfg.url && this.cfg.key); },
  get signedIn() { return !!(this.session && this.session.user); },
  hdr(t) { return { apikey: this.cfg.key, Authorization: "Bearer " + (t || this.cfg.key), "Content-Type": "application/json", "Accept-Profile": "chess", "Content-Profile": "chess" }; },
  authHdr(t) { return { apikey: this.cfg.key, Authorization: "Bearer " + (t || this.cfg.key), "Content-Type": "application/json" }; },
  load() { try { const s = JSON.parse(localStorage.getItem("arena-session") || "null"); if (s && s.refresh_token) this.session = s; } catch (e) { /* storage unavailable */ } },
  persist() { try { if (this.session) localStorage.setItem("arena-session", JSON.stringify(this.session)); else localStorage.removeItem("arena-session"); } catch (e) { /* storage unavailable */ } },
  take(j) { if (!j || !j.access_token) return false; this.session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: { id: j.user.id, email: j.user.email } }; this.persist(); return true; },
  async auth(path, body) { const r = await fetch(`${this.cfg.url}/auth/v1/${path}`, { method: "POST", headers: this.authHdr(), body: JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch (e) { /* empty body */ } return { ok: r.ok, j }; },
  err(j) { return (j && (j.error_description || j.msg || j.message)) || "Something went wrong. Please try again."; },
  async token() { if (!this.session) return null; if (this.session.expires_at - 60 > Date.now() / 1000) return this.session.access_token; const { ok, j } = await this.auth("token?grant_type=refresh_token", { refresh_token: this.session.refresh_token }); if (ok && this.take(j)) return this.session.access_token; this.session = null; this.persist(); acctPaint(); return null; },
  async signUp(email, pw) { const { ok, j } = await this.auth("signup", { email, password: pw }); if (!ok) return { error: this.err(j) }; if (this.take(j)) { await this.after(); return { ok: true }; } return { ok: true, confirm: true }; },
  async signIn(email, pw) { const { ok, j } = await this.auth("token?grant_type=password", { email, password: pw }); if (!ok || !this.take(j)) return { error: this.err(j) }; await this.after(); return { ok: true }; },
  async signOut() { try { if (this.session) await fetch(`${this.cfg.url}/auth/v1/logout`, { method: "POST", headers: this.authHdr(this.session.access_token) }); } catch (e) { /* offline */ } this.session = null; this.persist(); this.nick = ""; store.set("nick", ""); acctPaint(); },
  async rpc(fn, args, tok) { try { const r = await fetch(`${this.cfg.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: this.hdr(tok), body: JSON.stringify(args || {}) }); if (!r.ok) { this.live = false; return null; } this.live = true; const t = await r.text(); return t ? JSON.parse(t) : null; } catch (e) { this.live = false; return null; } },
  async setNick(n) { const t = await this.token(); if (!t) return { error: "Please sign in first." }; const all = await NameSync.setAll(this.cfg, t, n), j = all.chess; if (j === "ok") { this.nick = n; store.set("nick", n); acctPaint(); return { ok: true }; } if (j == null) return { error: "Leaderboards are not switched on yet. Your nickname will work once they are." }; return { error: j === "taken" ? "That nickname is taken. Try another." : "Use 3 to 16 letters, numbers, spaces, dots, dashes or underscores." }; },   /* saved in all three sports at once */
  async syncName() {   /* adopt the master (football) name; with no name anywhere, ask for one */
    const t = await this.token(); if (!t) return; const master = await NameSync.master(this.cfg, t);
    if (master) { if (this.nick !== master) { this.nick = master; store.set("nick", master); acctPaint(); } const mine = await NameSync.own(this.cfg, t, "chess"); if (mine !== master) await this.setNick(master); return; }
    const mine = await NameSync.own(this.cfg, t, "chess"); if (mine) { this.nick = mine; store.set("nick", mine); acctPaint(); await NameSync.setAll(this.cfg, t, mine); return; }
    NameSync.ask(NameSync.suggest(this.session.user.email), (v) => this.setNick(v));
  },
  async after() { await this.pull(); acctPaint(); await this.syncName(); await this.push(); },
  bests() { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("bkc_best_")) { try { o[k.slice(4)] = JSON.parse(localStorage.getItem(k)); } catch (e) { /* skip */ } } } return o; },
  async pull() { const t = await this.token(); if (!t) return; try { const r = await fetch(`${this.cfg.url}/rest/v1/progress?select=data`, { headers: this.hdr(t) }); if (!r.ok) return; const rows = await r.json(); const d = rows[0] && rows[0].data; if (d && d.look && !localStorage.getItem("bkc_look")) { try { localStorage.setItem("bkc_look", d.look); document.documentElement.setAttribute("data-theme", lookResolve(d.look)); thPaint(); } catch (e) { /* ignore */ } } if (d) Object.entries(d).forEach(([k, v]) => { if (k.startsWith("best_") && typeof v === "number" && v > store.get(k, 0)) store.set(k, v); }); } catch (e) { /* offline */ } },
  async push() { const t = await this.token(); if (!t) return; try { await fetch(`${this.cfg.url}/rest/v1/progress`, { method: "POST", headers: { ...this.hdr(t), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: this.session.user.id, data: { ...this.bests(), look: lookNow() }, updated_at: new Date().toISOString() }) }); } catch (e) { /* offline */ } },
  async submit(game, score) {
    if (!this.on || !this.signedIn || !/^[a-z0-9_]{2,24}$/.test(game)) return; const t = await this.token(); if (!t) return;
    try { await fetch(`${this.cfg.url}/rest/v1/results`, { method: "POST", headers: { ...this.hdr(t), Prefer: "return=minimal" }, body: JSON.stringify({ game, score, week: weekK(), day: todayK() }) }); clearTimeout(this.pt); this.pt = setTimeout(() => this.push(), 3000); } catch (e) { /* offline: the best stays on this device */ }
  },
  async top(game, period) { return this.on ? this.rpc("leaderboard", { p_game: game, p_period: period, p_week: weekK(), p_day: todayK() }) : null; },
};
Cloud.load();
function acctPaint() { const b = document.getElementById("acctLab"); if (b) b.textContent = Cloud.signedIn ? (Cloud.nick || "Account") : "Sign in"; }
function acctModal(mode) {
  const up = mode === "up", m = document.getElementById("cmodal") || Object.assign(document.body.appendChild(document.createElement("div")), { id: "cmodal", className: "cmodal" });
  if (!Cloud.on) { m.innerHTML = `<div class="sheet"><h2>${ic("user")}Accounts</h2><p class="sub">Accounts are not switched on for this copy of the site, so your results stay on this device.</p><div class="row"><button class="btn" data-cm="close" type="button">OK</button></div></div>`; m.hidden = false; return; }
  if (Cloud.signedIn) { m.innerHTML = `<div class="sheet"><h2>${ic("user")}${esc(Cloud.nick || "Your account")}</h2><p class="fine">Signed in as ${esc(Cloud.session.user.email)}. Your best scores sync to your chess profile and appear on the leaderboards.</p><label class="fine">Nickname</label><div class="row"><input id="cNick" value="${esc(Cloud.nick)}" maxlength="16" placeholder="3 to 16 characters"><button class="btn" data-cm="nick" type="button">Save</button></div><p class="fine" id="cMsg"></p><div class="row"><button class="btn ghost" data-cm="out" type="button">Sign out</button><button class="btn ghost" data-cm="close" type="button">Close</button></div></div>`; m.hidden = false; return; }
  m.innerHTML = `<div class="sheet"><h2>${ic("user")}${up ? "Create an account" : "Sign in"}</h2><p class="fine">Your football, basketball and chess profiles are separate, but one login works for all of them. Guests can keep playing without one.</p><div class="authf"><input id="cEmail" type="email" autocomplete="email" placeholder="Email"><input id="cPass" type="password" autocomplete="${up ? "new-password" : "current-password"}" placeholder="Password (6 or more characters)"></div><p class="fine" id="cMsg"></p><div class="row"><button class="btn" data-cm="${up ? "up" : "in"}" type="button">${up ? "Create account" : "Sign in"}</button><button class="btn ghost" data-cm="${up ? "swin" : "swup"}" type="button">${up ? "I have an account" : "Create an account"}</button><button class="btn ghost" data-cm="close" type="button">Cancel</button></div></div>`; m.hidden = false;
}
document.addEventListener("click", async (e) => {
  const t = e.target.closest && e.target.closest("[data-cm],#acctBtn"); if (!t) return; if (t.id === "acctBtn") return acctModal(Cloud.signedIn ? "in" : "in");
  const k = t.dataset.cm, m = document.getElementById("cmodal"), msg = document.getElementById("cMsg");
  if (k === "close") { m.hidden = true; return; } if (k === "swup") return acctModal("up"); if (k === "swin") return acctModal("in");
  if (k === "out") { await Cloud.signOut(); m.hidden = true; return; }
  if (k === "nick") { const v = (document.getElementById("cNick").value || "").trim(); msg.textContent = "Saving…"; const r = await Cloud.setNick(v); if (r.ok) { Cloud.push && Cloud.push(); acctModal("in"); const m2 = document.getElementById("cMsg"); if (m2) m2.textContent = `Saved. You are ${v} now.`; } else msg.textContent = r.error; return; }
  if (k === "in" || k === "up") {
    const email = (document.getElementById("cEmail").value || "").trim(), pw = document.getElementById("cPass").value || "";
    if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = "Please enter a valid email address."; return; } if (pw.length < 6) { msg.textContent = "The password needs at least 6 characters."; return; }
    t.disabled = true; msg.textContent = "One moment…"; const r = k === "up" ? await Cloud.signUp(email, pw) : await Cloud.signIn(email, pw); t.disabled = false;
    if (r.error) { msg.textContent = r.error; return; } if (r.confirm) { msg.textContent = "Check your email to confirm the account, then sign in."; return; } m.hidden = true; if (st.game === "board") boardPage();
  }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { const m = document.getElementById("cmodal"); if (m) m.hidden = true; } });

/* ---------- Leaderboards ---------- */
const BOARDS = [["hbar", "Human bar", "points (of 500)"], ["tact", "Spot the tactic", "points"], ["blind", "Blindfold memory", "points (of 500)"], ["endg", "Endgame verdict", "points (of 500)"], ["next", "Next move", "best streak"], ["recog", "Who played it", "best streak"], ["blunder", "Blunder or fine?", "best streak"], ["open", "Name the opening", "best streak"], ["mate", "Mate puzzles", "best streak"], ["elo", "Estimate my Elo", "best estimate"], ["call", "Call it", "points ahead"], ["elite", "Real games", "points"], ["who", "Who is this player?", "points"]];
function boardPage(game, period) {
  clearInterval(st.timer); live = null; rvStop(); game = game || (st.game === "board" && st.bg) || "hbar"; period = period || (st.game === "board" && st.bp) || "all"; st = { game: "board", bg: game, bp: period };
  const nm = (BOARDS.find((x) => x[0] === game) || [])[1] || game;
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="home">← Menu</button></div><h2 style="font-size:32px">${ic("trophy")}Leaderboards</h2><div class="chips"><button class="chip" data-go="rank" type="button">${ic("chart")}World (FIDE top 100)</button><button class="chip on" type="button">${ic("user")}Players on this site</button></div><p class="sub">Best scores from signed-in players. Each game has its own board.</p>
    <div class="chips">${BOARDS.map(([id, n]) => `<button class="chip ${id === game ? "on" : ""}" data-bg="${id}" type="button">${n}</button>`).join("")}</div><div class="chips">${[["all", "All time"], ["week", "This week"], ["day", "Today"]].map(([id, n]) => `<button class="chip ${id === period ? "on" : ""}" data-bp="${id}" type="button">${n}</button>`).join("")}</div>
    <div class="card" id="bdRows"><p class="fine"><span class="spin"></span> Loading ${esc(nm)}…</p></div>`;
  Cloud.top(game, period).then((rows) => {
    const el = document.getElementById("bdRows"); if (!el || st.game !== "board" || st.bg !== game || st.bp !== period) return;
    if (rows == null) { el.innerHTML = `<p class="sub"><b>Leaderboards are not switched on yet.</b> Once the chess database is set up, signed-in players' best scores appear here. Your own bests are still saved on this device.</p>`; return; }
    if (!rows.length) { el.innerHTML = `<p class="sub">Nobody has a score here yet. ${Cloud.signedIn ? "Be the first." : "Sign in and be the first."}</p>`; return; }
    el.innerHTML = `<table class="tb"><tr><th>#</th><th>Player</th><th>${esc((BOARDS.find((x) => x[0] === game) || [, , "score"])[2])}</th></tr>${rows.map((r, i) => `<tr class="${r.nick === Cloud.nick ? "me" : ""}"><td>${i + 1}</td><td>${esc(r.nick)}</td><td>${Math.round(+r.value)}</td></tr>`).join("")}</table>`;
  });
}
document.addEventListener("click", (e) => { const t = e.target.closest && e.target.closest("[data-bg],[data-bp]"); if (!t || st.game !== "board") return; boardPage(t.dataset.bg || st.bg, t.dataset.bp || st.bp); });

/* ---------- Daily challenges: three things, the same for everyone today ---------- */
const dGet = (k) => store.get("daily_" + k, {});
function dailyMark(id, val) { const k = todayK(), d = dGet(k); if (d[id] != null) return; d[id] = val; store.set("daily_" + k, d); Cloud.submit("daily_" + id, val); const left = DAILIES.filter((x) => d[x[0]] == null).length; Voice.say(left ? "Daily done. " + left + " to go" : "All three dailies done"); }
function dStreak() { let s = 0; const now = Date.now(); for (let k = 0; k < 400; k++) { const key = new Date(now - k * 864e5).toISOString().slice(0, 10); if (Object.keys(dGet(key)).length) s++; else if (k > 0) break; } return s; }
const DAILIES = [["p", "Daily puzzle", "bolt", "Today's puzzle, the same for everyone. Find the winning moves.", "dp", (v) => (v ? "Solved" : "Missed")], ["h", "Daily bar", "chart", "One position. Drag the bar to Stockfish's evaluation.", "dh", (v) => v + " / 100"], ["t", "Daily tactic", "target", "One position. Tap every piece you could win for free.", "dt", (v) => v + " points"]];
function gamesPage() {
  clearInterval(st.timer); live = null; rvStop(); st = { game: "games" }; const key = todayK(), d = dGet(key), done = DAILIES.filter((x) => d[x[0]] != null).length, streak = dStreak();
  const card = (attr, icon, name, tag, meta, k) => `<button class="cpcard gpk" type="button" ${attr} style="animation-delay:${k * 70}ms"><span class="gpki">${ic(icon)}</span><b class="cpcname">${name}</b><span class="fine">${tag}</span>${meta ? `<span class="cpwinner">${meta}</span>` : ""}</button>`;
  $("#app").className = "fresh";
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="home">← Menu</button></div><h2 style="font-size:32px">${ic("puzzle")}Games</h2><p class="sub">Pick where to play.</p><div class="cpgrid">
    ${card('data-hub="bk"', "puzzle", "ballknowledge originals", "Puzzles, openings, the next move, blunders, a game against my AI and more.", `${CG.filter((x) => x.g === "bk" && x.id !== "review").length} games`, 0)}
    ${card('data-hub="model"', "target", "Beat the model", "Call real games against a model that never saw them, from everyday play to the biggest events.", `${CG.filter((x) => x.g === "model").length} game${CG.filter((x) => x.g === "model").length === 1 ? "" : "s"}`, 1)}
    ${card('data-go="daily"', "clock", "Daily challenges", "A puzzle, a position to judge and a tactic to spot, new every day.", `${done} of ${DAILIES.length} today${streak ? ` · ${streak}-day streak` : ""}`, 2)}
    ${card('data-go="sim"', "swords", "Simulate a match", "Pick anyone, from Carlsen to your friend on chess.com, and play 1,000 games against them in a second.", "New", 4)}
    ${card('data-go="wk"', "trophy", "Weekly cup", "Five puzzles, the same for everyone this week. One attempt, faster solves score more.", wkMine() ? `Your score: ${wkMine().score}` : "Not played yet this week", 3)}</div>`;
  scrollTo({ top: 0, behavior: "instant" });
}
function dailyPage() {
  clearInterval(st.timer); live = null; rvStop(); st = { game: "daily" }; const key = todayK(), d = dGet(key), n = DAILIES.filter((x) => d[x[0]] != null).length, streak = dStreak();
  const dots = Array.from({ length: 14 }, (_, i) => { const k = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10), c = Object.keys(dGet(k)).length; return `<i class="dd ${c >= 3 ? "full" : c ? "some" : ""} ${k === key ? "today" : ""}" title="${k}: ${c} of 3"></i>`; }).join("");
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="games">← Games</button></div><h2 style="font-size:32px">${ic("clock")}Daily challenges</h2><p class="sub">Three short challenges, the same for everyone, new every day. Do any one to keep your streak.</p>
    <div class="card"><div class="row" style="justify-content:space-between"><div><div class="label">Streak</div><div class="bigstreak"><span class="flame">🔥</span> <b class="num">${streak}</b> day${streak === 1 ? "" : "s"}</div></div><div style="text-align:right"><div class="label">Today</div><b class="num" style="font-size:28px">${n} / 3</b></div></div><div class="dots">${dots}</div></div>
    <div class="hubgrid" style="margin-top:12px">${DAILIES.map(([id, name, icn, tag, go, fmt]) => `<button class="gcard ${d[id] != null ? "done" : ""}" data-go="${go}"><div class="gi"><div class="di">${ic(icn)}</div></div><div class="gname">${name}</div><div class="gtag">${tag}</div><div class="grec">${d[id] != null ? "Done · " + fmt(d[id]) : "Play"}</div></button>`).join("")}</div>
    <div class="row" style="margin-top:12px"><button class="btn ghost" id="dShare" type="button">Copy today's result</button><span class="fine" id="dMsg"></span></div>`;
}
document.addEventListener("click", (e) => { const t = e.target.closest && e.target.closest("#dShare"); if (!t) return; const d = dGet(todayK()), txt = `ballknowledge chess daily ${todayK()}: ` + DAILIES.map(([id, name, , , , fmt]) => `${name} ${d[id] != null ? fmt(d[id]) : "-"}`).join(" · ") + ` · streak ${dStreak()}`; const done = (ok) => { const m = document.getElementById("dMsg"); if (m) m.textContent = ok ? "Copied." : txt; }; try { navigator.clipboard.writeText(txt).then(() => done(true), () => done(false)); } catch (err) { done(false); } });
const dpStart = () => { const key = todayK(), pool = PZ.filter((p) => p.rating >= 1100 && p.rating < 1900 && p.themes.some((x) => /^mateIn[123]$/.test(x))); st = { game: "mate", streak: 0, n: 0, daily: "p" }; puzzleLoad(seeded(key + "p", () => rnd(pool))); st.msg = ""; puzzlePaint(); };
const dhStart = () => { st = { game: "hbar", round: 0, score: 0, rounds: 1, log: [], daily: "h" }; st.pre = seeded(todayK() + "h", () => hbPick()); hbNext(); };
const dtStart = () => { st = { game: "tact", round: 0, score: 0, rounds: 1, log: [], minNet: 200, secs: 25, daily: "t" }; tactNext(); };

acctPaint(); if (Cloud.signedIn) Cloud.pull().then(() => { acctPaint(); return Cloud.syncName(); });
/* =====================================================================================================================
   Play a friend: a room code, a clock, resign, draw offers, rematch and a review afterwards.
   Messages travel over free public MQTT brokers (and BroadcastChannel for two tabs on one device), the same way the other sports do two-device play.
   ===================================================================================================================== */
function mqttConnect(url, topic, onMsg, onState) {
  const enc = new TextEncoder(), dec = new TextDecoder(), st = { open: false, ws: null, ping: null, stopped: false, tries: 0 }; let buf = new Uint8Array(0);
  const str = (s) => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
  const rl = (n) => { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n) d |= 128; o.push(d); } while (n); return o; };
  const pkt = (hdr, body) => { const b = Uint8Array.from(body); return Uint8Array.from([hdr, ...rl(b.length), ...b]); };
  const cat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
  function connect() {
    let ws; try { ws = new WebSocket(url, "mqtt"); } catch (e) { retry(); return; }
    st.ws = ws; ws.binaryType = "arraybuffer"; buf = new Uint8Array(0);
    ws.onopen = () => {
      ws.send(pkt(0x10, [...str("MQTT"), 4, 2, 0, 60, ...str("bk" + Math.random().toString(36).slice(2, 10))]));
      ws.send(pkt(0x82, [0, 1, ...str(topic), 0]));
      st.ping = setInterval(() => { try { ws.send(Uint8Array.from([0xC0, 0])); } catch (e) { /* closed */ } }, 30000);
    };
    ws.onmessage = (ev) => {
      buf = cat(buf, new Uint8Array(ev.data));
      while (buf.length >= 2) {
        let i = 1, mul = 1, len = 0, b; do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; } while (b & 128);
        if (buf.length < i + len) return;
        const hdr = buf[0], body = buf.slice(i, i + len); buf = buf.slice(i + len);
        if (hdr >> 4 === 2) { st.open = true; st.tries = 0; if (onState) onState(true); }
        else if (hdr >> 4 === 3) { const tl = (body[0] << 8) | body[1], off = 2 + tl + (((hdr >> 1) & 3) ? 2 : 0); try { onMsg(JSON.parse(dec.decode(body.slice(off)))); } catch (e) { /* not ours */ } }
      }
    };
    ws.onclose = () => { const was = st.open; st.open = false; clearInterval(st.ping); if (was && onState) onState(false); retry(); };
    ws.onerror = () => { /* onclose follows */ };
  }
  function retry() { if (st.stopped) return; st.tries++; setTimeout(() => { if (!st.stopped) connect(); }, Math.min(8000, 800 * st.tries)); }
  st.send = (obj) => { if (!st.open) return; const tb = str(topic), pb = enc.encode(JSON.stringify(obj)); try { st.ws.send(pkt(0x30, [...tb, ...pb])); } catch (e) { /* closed */ } };
  st.close = () => { st.stopped = true; clearInterval(st.ping); try { st.ws.close(); } catch (e) { /* ignore */ } st.open = false; };
  connect(); return st;
}

const OL_BROKERS = ["wss://broker.hivemq.com:8884/mqtt", "wss://broker.emqx.io:8084/mqtt", "wss://test.mosquitto.org:8081"];
const OL_TC = [["1+0", 60, 0], ["3+2", 180, 2], ["5+0", 300, 0], ["10+0", 600, 0]];
let OL = null, OG = null;
const olNick = () => (Cloud.nick || store.get("ol_nick", "") || "Guest");
function olSend(m) { if (!OL) return; m.from = OL.role; m.i = Math.random().toString(36).slice(2); try { OL.bc && OL.bc.postMessage(m); } catch (e) { /* closed */ } OL.mq.forEach((q) => q.send(m)); }
function olOpen(role, code) {
  olClose(); OL = { role, code, seen: new Set(), mq: [], bc: null, since: Date.now(), welcomed: false };
  try { OL.bc = new BroadcastChannel("bkc-" + code); OL.bc.onmessage = (e) => olRecv(e.data); } catch (e) { OL.bc = null; }
  OL.mq = OL_BROKERS.map((u) => mqttConnect(u, "ballknowledge/chess/v1/" + code, (m) => olRecv(m), () => olStatus()));
  OL.sti = setInterval(olStatus, 1000);
}
function olClose() {
  if (OL) { if (OG && !OG.over && OL.welcomed) olSend({ k: "leave" }); clearInterval(OL.sti); clearInterval(OL.hi); try { OL.bc && OL.bc.close(); } catch (e) { /* ignore */ } OL.mq.forEach((q) => q.close()); }
  if (OG) clearInterval(OG.timer); OL = null; OG = null;
}
const olLinked = () => (OL ? OL.mq.filter((q) => q.open).length : 0);
function olStatus() {
  const el = document.getElementById("olStatus"); if (!el || !OL) return; const secs = Math.round((Date.now() - OL.since) / 1000);
  if (OL.role === "host") el.innerHTML = olLinked() ? `Room <b class="num" style="font-size:24px">${OL.code}</b> is open. Waiting for your friend…` : secs > 12 ? "Could not reach the room server. Check your connection and try again." : "Connecting to the room server…";
  else el.textContent = !olLinked() ? (secs > 12 ? "Could not reach the room server. Check your connection and try again." : "Connecting to the room server…") : secs > 20 ? `Connected, but nobody is hosting ${OL.code}. Check the code with your friend.` : "Connected. Waiting for the host…";
}
function olMenu(joinCode) {
  rvStop(); clearInterval(st.timer); live = null; olClose(); st = { game: "online", tc: store.get("ol_tc", 1), col: store.get("ol_col", "r") };
  $("#app").className = "fresh"; $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-hub="bk">← Back</button></div><div class="card" style="max-width:640px"><h2>${ic("user")}Play a friend</h2><p class="sub">Two devices (or two tabs), one room code. Moves arrive live, with a clock.</p>
    <h3>${ic("clock")}Time control</h3><div class="chips">${OL_TC.map((x, i) => `<button class="chip ${st.tc === i ? "on" : ""}" data-oltc="${i}" type="button">${x[0]}</button>`).join("")}</div><p class="fine">Minutes plus seconds added per move. The clock starts after each side's first move.</p>
    <h3>${ic("flag")}You play</h3><div class="chips">${[["w", "White"], ["b", "Black"], ["r", "Random"]].map(([k, n]) => `<button class="chip ${st.col === k ? "on" : ""}" data-olcol="${k}" type="button">${n}</button>`).join("")}</div>
    <div class="row" style="margin-top:12px"><button class="btn" id="olCreate" type="button">Create a room</button></div>
    <h3 style="margin-top:18px">Or join a friend</h3><div class="row"><input id="olCode" maxlength="4" placeholder="Room code" autocapitalize="characters" value="${esc(joinCode || "")}" style="text-transform:uppercase;width:150px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;color:var(--ink);padding:11px 12px;font:700 18px Inter;letter-spacing:.2em"><button class="btn" id="olJoin" type="button">Join</button></div><p class="fine" id="olMsg"></p></div>`;
  if (joinCode && /^[A-Z]{4}$/.test(joinCode)) setTimeout(() => olJoin(joinCode), 50);
}
function olCreate() {
  const code = Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join(""), tc = st.tc, col = st.col === "r" ? (Math.random() < 0.5 ? "w" : "b") : st.col; store.set("ol_tc", tc); store.set("ol_col", st.col);
  olOpen("host", code); OL.tc = tc; OL.hostColor = col; const link = location.origin + location.pathname + "#join-" + code;
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="online">← Cancel</button></div><div class="card" style="max-width:640px"><h2>${ic("user")}Your room</h2><p class="sub" id="olStatus"></p><div class="bigcode">${code}</div><p class="fine">Tell your friend the code, or send this link:</p><div class="row"><input readonly value="${esc(link)}" id="olLink" style="flex:1;min-width:0;background:var(--panel2);border:1px solid var(--line);border-radius:10px;color:var(--ink);padding:10px;font:13px ui-monospace,Menlo,monospace"><button class="btn" id="olCopy" type="button">Copy</button></div><p class="fine">You play ${col === "w" ? "White" : "Black"} · ${OL_TC[tc][0]}</p></div>`; olStatus();
}
function olJoin(code) {
  code = (code || document.getElementById("olCode").value || "").trim().toUpperCase(); if (!/^[A-Z]{4}$/.test(code)) { const m = document.getElementById("olMsg"); if (m) m.textContent = "Room codes are four letters."; return; }
  olOpen("guest", code); $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="online">← Cancel</button></div><div class="card" style="max-width:640px"><h2>${ic("user")}Joining ${code}</h2><p class="sub" id="olStatus"></p></div>`; olStatus();
  const hello = () => { if (OL && !OL.welcomed) olSend({ k: "hello", nick: olNick() }); }; OL.hi = setInterval(hello, 2000); setTimeout(hello, 1200);
}
function olRecv(m) {
  if (!OL || !m || m.from === OL.role) return; if (m.i) { if (OL.seen.has(m.i)) return; OL.seen.add(m.i); if (OL.seen.size > 300) OL.seen = new Set([...OL.seen].slice(-100)); }
  if (OL.role === "host" && m.k === "hello") { OL.welcomed = true; OL.guestNick = m.nick || "Guest"; const g = OG, sans = g ? g.c.history() : [], ms = g ? g.ms : null; olSend({ k: "welcome", tc: OL.tc, hostColor: OL.hostColor, nick: olNick(), sans, ms }); if (!OG) olBegin(OL.hostColor, OL.tc, [olNick(), OL.guestNick]); return; }
  if (OL.role === "guest" && m.k === "welcome") { if (OL.welcomed && OG) return; OL.welcomed = true; clearInterval(OL.hi); OL.hostNick = m.nick || "Host"; if (!OG) olBegin(m.hostColor === "w" ? "b" : "w", m.tc, [m.hostColor === "w" ? OL.hostNick : olNick(), m.hostColor === "w" ? olNick() : OL.hostNick]); if (m.sans && m.sans.length && OG && OG.c.history().length < m.sans.length) { OG.c.reset(); m.sans.forEach((s) => OG.c.move(s)); if (m.ms) OG.ms = m.ms; OG.last = performance.now(); olPaint(); } return; }
  if (!OG) return;
  if (m.k === "move") { const c = OG.c; if (m.ply !== c.history().length + 1) return; const mv = c.move({ from: m.a, to: m.b, promotion: m.promo || "q" }); if (!mv) return; if (m.ms != null) OG.ms[mv.color] = m.ms; OG.last = performance.now(); live.last = [mv.from, mv.to]; live.sel = null; live.targets = []; Snd.move(mv, c); OG.offerIn = false; olCheckEnd(); olPaint(); }
  else if (m.k === "resign") olOver("win", "Your opponent resigned");
  else if (m.k === "flag") olOver("win", "Your opponent ran out of time");
  else if (m.k === "leave") { if (!OG.over) olOver("win", "Your opponent left the game"); }
  else if (m.k === "draw") { OG.offerIn = true; olPaint(); }
  else if (m.k === "drawyes") olOver("draw", "Draw agreed");
  else if (m.k === "drawno") { OG.offerOut = false; OG.msg = "Draw declined."; olPaint(); }
  else if (m.k === "rematch") { OG.rmIn = true; if (OG.rmOut && OL.role === "host") olRematch(); else olPaint(); }
  else if (m.k === "newgame") { if (OL.role === "guest") olBegin(m.hostColor === "w" ? "b" : "w", m.tc, m.names); }
}
function olBegin(me, tc, names) {
  const base = OL_TC[tc][1] * 1000; clearInterval(OG && OG.timer); live = { c: new Chess(), color: me, sel: null, targets: [], caps: [], last: null, lock: false, refresh: olPaint, onMove: olOnMove };
  OG = { c: live.c, me, tc, inc: OL_TC[tc][2] * 1000, ms: { w: base, b: base }, last: performance.now(), over: null, names, offerIn: false, offerOut: false, rmIn: false, rmOut: false, msg: "" }; OG.timer = setInterval(olTick, 200);
  st = { game: "online" }; $("#app").className = "fresh"; olPaint();
}
function olRunning() { return OG && !OG.over && OG.c.history().length >= 2; }
function olTick() {
  if (!OG || OG.over) return; const now = performance.now(), dt = now - OG.last; OG.last = now; if (!olRunning()) return; const turn = OG.c.turn(); OG.ms[turn] -= dt;
  document.querySelectorAll("[data-clk-side]").forEach((el) => { const v = OG.ms[el.dataset.clkSide]; el.textContent = fmtClk(Math.max(0, v)); el.classList.toggle("low", v < 20000); });
  if (OG.ms[turn] <= 0) { OG.ms[turn] = 0; if (turn === OG.me) { olSend({ k: "flag" }); olOver("loss", "You ran out of time"); } else if (!OG.grace) OG.grace = setTimeout(() => { if (OG && !OG.over && OG.ms[OG.c.turn()] <= 0) olOver("win", "Your opponent ran out of time"); }, 3000); }
}
function olOnMove(mv) {
  const c = OG.c, n = c.history().length; if (n > 2) { OG.ms[mv.color] -= performance.now() - OG.last; OG.ms[mv.color] += OG.inc; } OG.last = performance.now(); OG.offerIn = false;
  olSend({ k: "move", ply: n, a: mv.from, b: mv.to, promo: mv.promotion || null, ms: OG.ms[mv.color] }); olCheckEnd(); olPaint();
}
function olCheckEnd() {
  const c = OG.c; if (!c.game_over()) return; const mate = c.in_checkmate(), me = OG.me;
  if (mate) olOver(c.turn() === me ? "loss" : "win", "Checkmate"); else olOver("draw", c.in_stalemate() ? "Stalemate" : c.insufficient_material() ? "Insufficient material" : c.in_threefold_repetition() ? "Repetition" : "The 50-move rule");
}
function olOver(res, why) { if (!OG || OG.over) return; OG.over = { res, why }; live.lock = true; Snd.end(res === "win"); Voice.say(res === "win" ? "You win" : res === "loss" ? "You lost" : "Draw"); olPaint(); }
function olRematch() { const hc = OL.hostColor === "w" ? "b" : "w"; OL.hostColor = hc; const me = OL.role === "host" ? hc : (hc === "w" ? "b" : "w"), names = hc === "w" ? [olNick(), OL.guestNick] : [OL.guestNick, olNick()]; olSend({ k: "newgame", hostColor: hc, tc: OG.tc, names }); olBegin(me, OG.tc, names); }
function olPaint() {
  if (!OG || !live) return; const L = live, c = OG.c, me = OG.me, opp = me === "w" ? "b" : "w", o = OG.over, nm = (s) => OG.names[s === "w" ? 0 : 1];
  const bars = { top: pbar("user", esc(nm(opp)), opp === "w" ? "White" : "Black", c, opp, Math.max(1, OG.ms[opp])), bottom: pbar("user", esc(nm(me)) + " (you)", me === "w" ? "White" : "Black", c, me, Math.max(1, OG.ms[me])) };
  const over = o ? `<div class="endov ${o.res === "win" ? "win" : o.res === "loss" ? "loss" : "draw"}">${o.res === "win" ? Array.from({ length: 26 }, (_, i) => `<i class="conf" style="left:${(i * 37) % 100}%;background:${["#e8c35a", "#5ee6a8", "#ff8a3d", "#fff"][i % 4]};animation-delay:${(i % 9) * 0.18}s"></i>`).join("") : ""}${endTop(o.res)}<h3>${o.res === "win" ? "You win!" : o.res === "loss" ? "You lost" : "A draw"}</h3><p class="fine" style="color:#ddd">${o.why}</p>${endCoach(o.res)}<div class="row" style="justify-content:center"><button class="btn" id="olReview" type="button">${ic("chart")}Game review</button><button class="btn ghost" id="olRm" type="button">${OG.rmIn ? "Accept rematch" : OG.rmOut ? "Waiting…" : "Rematch"}</button><button class="btn ghost" data-go="online" type="button">Menu</button></div></div>` : "";
  const status = o ? "" : OG.msg || (c.in_check() ? "Check!" : c.turn() === me ? "Your move." : "Waiting for your friend…");
  const ctl = o ? "" : OG.offerIn ? `<span class="fine">Your friend offers a draw.</span><button class="btn" id="olDrawYes" type="button">Accept</button><button class="btn ghost" id="olDrawNo" type="button">Decline</button>` : `<button class="btn ghost" id="olDraw" type="button" ${OG.offerOut ? "disabled" : ""}>${OG.offerOut ? "Draw offered" : "Offer a draw"}</button><button class="btn ghost" id="olResign" type="button">Resign</button>`;
  liveRender(backRow("Play a friend", "user", `Room ${OL ? OL.code : ""} · ${OL_TC[OG.tc][0]}`), `<div class="row" style="justify-content:center;margin-top:8px"><span class="fine">${status}</span>${ctl}</div>`, bars, { over });
}
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("button"); if (!t) return;
  if (t.dataset.oltc != null) { st.tc = +t.dataset.oltc; document.querySelectorAll("[data-oltc]").forEach((x) => x.classList.toggle("on", x.dataset.oltc === t.dataset.oltc)); return; }
  if (t.dataset.olcol) { st.col = t.dataset.olcol; document.querySelectorAll("[data-olcol]").forEach((x) => x.classList.toggle("on", x.dataset.olcol === t.dataset.olcol)); return; }
  if (t.id === "olCreate") return olCreate(); if (t.id === "olJoin") return olJoin();
  if (t.id === "olCopy") { const i = document.getElementById("olLink"); i.select(); try { navigator.clipboard.writeText(i.value); t.textContent = "Copied"; } catch (err) { /* selected instead */ } return; }
  if (!OG) return;
  if (t.id === "olResign") { olSend({ k: "resign" }); olOver("loss", "You resigned"); }
  else if (t.id === "olDraw") { OG.offerOut = true; olSend({ k: "draw" }); olPaint(); }
  else if (t.id === "olDrawYes") { olSend({ k: "drawyes" }); olOver("draw", "Draw agreed"); }
  else if (t.id === "olDrawNo") { OG.offerIn = false; olSend({ k: "drawno" }); olPaint(); }
  else if (t.id === "olRm") { if (OG.rmOut) return; OG.rmOut = true; olSend({ k: "rematch" }); if (OG.rmIn && OL.role === "host") olRematch(); else olPaint(); }
  else if (t.id === "olReview") { const sans = OG.c.history(); if (sans.length < 4) { OG.msg = "The game is too short to review."; return olPaint(); } clearInterval(OG.timer); return reviewStart(sans, OG.me, { from: "online", names: OG.names }); }
});
document.addEventListener("input", (e) => { if (e.target.id === "olCode") e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ""); });
addEventListener("pagehide", () => { if (OL && OG && !OG.over) olSend({ k: "leave" }); });

if (/^#join-[A-Za-z]{4}$/.test(location.hash)) { const jc = location.hash.slice(6).toUpperCase(); setTimeout(() => olMenu(jc), 800); }
/* ---------- Arrows and square marks, like chess.com: right-drag draws an arrow, right-click marks a square (Shift red, Ctrl blue, Alt yellow), left-click clears ---------- */
const MKC = { g: "#ff9a1f", r: "#f03e52", b: "#2f86ff", y: "#a66bff" }, MKN = { g: "Orange", r: "Red", b: "Blue", y: "Purple" };   /* none of them green or cream, so they stand out on both square colours */
/* one arrow, in square units (0-8): a dark outline under a bright body, a rounded head, and an L for knight jumps (long leg first) */
function mkArrow(c1, r1, c2, r2, col, o = {}) {
  const ax = c1 + .5, ay = r1 + .5, bx = c2 + .5, by = r2 + .5, adx = Math.abs(c2 - c1), ady = Math.abs(r2 - r1), knight = (adx === 1 && ady === 2) || (adx === 2 && ady === 1);
  const pts = knight ? [[ax, ay], ady === 2 ? [ax, by] : [bx, ay], [bx, by]] : [[ax, ay], [bx, by]];
  const [px, py] = pts[pts.length - 2], dx = bx - px, dy = by - py, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, hl = .44, hw = .3, tipx = bx - ux * .06, tipy = by - uy * .06, bsx = tipx - ux * hl, bsy = tipy - uy * hl;
  const [sx0, sy0] = pts[0], [nx, ny] = pts[1], l0 = Math.hypot(nx - sx0, ny - sy0) || 1, start = [sx0 + (nx - sx0) / l0 * .22, sy0 + (ny - sy0) / l0 * .22];
  const body = [start, ...pts.slice(1, -1), [bsx + ux * .02, bsy + uy * .02]].map((p) => p[0].toFixed(3) + "," + p[1].toFixed(3)).join(" "), head = `${tipx},${tipy} ${bsx - uy * hw},${bsy + ux * hw} ${bsx + uy * hw},${bsy - ux * hw}`, w = o.w || .16;
  return `<g opacity="${o.op || .92}"><polyline points="${body}" fill="none" stroke="#0b0f0d" stroke-opacity=".55" stroke-width="${w + .07}" stroke-linecap="round" stroke-linejoin="round"/><polygon points="${head}" fill="#0b0f0d" fill-opacity=".55" stroke="#0b0f0d" stroke-opacity=".55" stroke-width=".07" stroke-linejoin="round"/><polyline points="${body}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/><polygon points="${head}" fill="${col}" stroke="${col}" stroke-width=".04" stroke-linejoin="round"/></g>`;
}
function mkSvg(bd) {
  const wrap = bd.closest(".lvwrap") || bd.parentElement; let svg = wrap.querySelector(":scope > .mk");
  if (!svg) { svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "mk"); svg.setAttribute("viewBox", "0 0 8 8"); svg.setAttribute("preserveAspectRatio", "none"); svg._m = { sq: [], ar: [] }; wrap.appendChild(svg); }
  return svg;
}
function mkDraw(svg) {
  const m = svg._m; let h = "";
  m.sq.forEach(([c, r, k]) => { h += `<rect x="${c + .07}" y="${r + .07}" width=".86" height=".86" rx=".14" fill="${MKC[k]}" fill-opacity=".22" stroke="${MKC[k]}" stroke-width=".09"/>`; });   /* a ring with a soft fill: the piece stays readable */
  m.ar.forEach(([c1, r1, c2, r2, k]) => { h += mkArrow(c1, r1, c2, r2, MKC[k]); });
  svg.innerHTML = h;
}
function mkClear(bd) { const w = bd && (bd.closest(".lvwrap") || bd.parentElement), svg = w && w.querySelector(":scope > .mk"); if (svg && (svg._m.sq.length || svg._m.ar.length)) { svg._m = { sq: [], ar: [] }; svg.innerHTML = ""; } }
const mkCell = (bd, e) => { const r = bd.getBoundingClientRect(), c = Math.floor((e.clientX - r.left) / r.width * 8), q = Math.floor((e.clientY - r.top) / r.height * 8); return c < 0 || c > 7 || q < 0 || q > 7 ? null : [c, q]; };
const mkKind = (e) => (e.shiftKey ? "r" : e.ctrlKey || e.metaKey ? "b" : e.altKey ? "y" : "g");
function mkToggle(svg, a, b, k) {
  const m = svg._m;
  if (a[0] === b[0] && a[1] === b[1]) { const i = m.sq.findIndex((x) => x[0] === a[0] && x[1] === a[1]); if (i >= 0) { const same = m.sq[i][2] === k; m.sq.splice(i, 1); if (same) return mkDraw(svg); } m.sq.push([a[0], a[1], k]); }
  else { const i = m.ar.findIndex((x) => x[0] === a[0] && x[1] === a[1] && x[2] === b[0] && x[3] === b[1]); if (i >= 0) { const same = m.ar[i][4] === k; m.ar.splice(i, 1); if (same) return mkDraw(svg); } m.ar.push([a[0], a[1], b[0], b[1], k]); }
  mkDraw(svg);
}
document.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest(".board")) e.preventDefault(); });
document.addEventListener("pointerdown", (e) => {
  const bd = e.target.closest && e.target.closest(".board"); if (!bd) return;
  if (rv && rv.pen && rv.pen.on && bd.closest("#rvBoard")) return;   /* the pen handles taps itself */
  if (e.button === 0 && e.pointerType === "mouse") { mkClear(bd); return; }
  const start = mkCell(bd, e); if (!start) return;
  if (e.button === 2) {
    const svg = mkSvg(bd), up = (ev) => { removeEventListener("pointerup", up); const end = mkCell(bd, ev); if (end) mkToggle(svg, start, end, mkKind(ev)); }; addEventListener("pointerup", up); return;
  }
  if (e.pointerType === "touch") { const svg = mkSvg(bd); let moved = false; const mv = (ev) => { if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 10) { moved = true; clearTimeout(tm); } }, tm = setTimeout(() => { if (!moved) { mkToggle(svg, start, start, "g"); try { navigator.vibrate && navigator.vibrate(15); } catch (er) { /* none */ } } cleanup(); }, 450), cleanup = () => { clearTimeout(tm); removeEventListener("pointermove", mv); removeEventListener("pointerup", cleanup); }; addEventListener("pointermove", mv); addEventListener("pointerup", cleanup); }
});
/* =====================================================================================================================
   Championships: the Total Chess World Championship Tour pilot (Budapest, 10 to 20 November 2026), the FIDE World Championship match
   (Gukesh v Sindarov, Geneva), the women's side, and the reigning champions. Games come live from the Lichess broadcast API (open, no key).
   Facts that are written here were read from the sources listed on the page on 20 November 2026 (Total Chess final result added 21 November from Wikipedia and ETV Bharat); nothing is guessed.
   ===================================================================================================================== */
const LI = "https://lichess.org/api/broadcast";
const liJson = async (u) => { const r = await fetch(u, { headers: { Accept: "application/json" } }); if (!r.ok) throw new Error("http " + r.status); return r.json(); };
const TC_TOURS = [["6PTzCQFL", "Finals"], ["qEXour3L", "Semifinals"], ["9lqCcStZ", "Group A"], ["h7DnvIHQ", "Group B"], ["UPwHJSZj", "Group C"], ["OW6wzikj", "Group D"], ["WbAxpbqH", "Blitz tiebreak"]];
const TC_GROUPS = { "Group A": [["Firouzja", 15], ["Duda", 14], ["van Foreest", 14], ["Aronian", 11], ["Hong", 11], ["Abdusattorov", 9]], "Group B": [["Caruana", 17], ["Le Quang Liem", 14], ["Rapport", 11], ["Keymer", 10], ["Artemiev", 10], ["Praggnanandhaa", 7]], "Group C": [["Giri", 15], ["Nepomniachtchi", 13], ["Martirosyan", 13], ["Mamedyarov", 11], ["Carlsen", 9], ["Mishra", 8]], "Group D": [["Vachier-Lagrave", 17], ["Niemann", 16], ["Erigaisi", 16], ["So", 13], ["Assaubayeva", 10], ["Vaishali Rameshbabu", 7]] };
/* ---------- Championships, laid out by section: Open and Women, each with its tournaments and its champions ----------
   Total Chess data is a snapshot of the Lichess broadcast (src/78_champ_data.py); photos, federations and ratings come
   from Lichess's FIDE player API, with the photo credit shown on each player. */
const CP = DATA.champ || { players: {}, stages: [] };
const CP_ID = { firouzja: "12573981", giri: "24116068", caruana: "2020009", mvl: "623539", carlsen: "1503014", gukesh: "46616543", sindarov: "14205483", ju: "8603006", vaishali: "5091756", gory: "4147103", bibi: "13708694" };
const CP_ISO = { FRA: "FR", POL: "PL", NED: "NL", USA: "US", UZB: "UZ", VIE: "VN", HUN: "HU", GER: "DE", IND: "IN", ARM: "AM", AZE: "AZ", NOR: "NO", KAZ: "KZ", CHN: "CN" };
const CP_NAME = { "12401137": "Le Quang Liem", "5091756": "Vaishali Rameshbabu", "35009192": "Arjun Erigaisi", "25059530": "Praggnanandhaa R", "46616543": "Gukesh D", "2093596": "Hans Niemann", "13306553": "Haik Martirosyan", "8603006": "Ju Wenjun", "1039784": "Jorden van Foreest", "14205483": "Javokhir Sindarov" };   // how these players are usually written
Object.entries(CP.players).forEach(([k, p]) => { p.id = k; });
const cpP = (id) => CP.players[id] || null;
const cpName = (p) => (!p ? "?" : CP_NAME[p.id] || (p.n.includes(", ") ? p.n.split(", ").reverse().join(" ") : p.n));
const cpInit = (p) => cpName(p).split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const cpFlag = (p) => { if (!p || !p.fed) return ""; const iso = CP_ISO[p.fed]; return iso ? `<span class="cpflag" title="${p.fed}">${String.fromCodePoint(...[...iso].map((c) => 127397 + c.charCodeAt(0)))}</span>` : `<span class="cpfid" title="Plays under the FIDE flag">FIDE</span>`; };
const cpFace = (p, cls = "") => `<span class="cpf ${cls}" data-i="${p ? cpInit(p) : "?"}">${p && p.sm ? `<img src="${esc(cls.includes("big") ? p.img || p.sm : p.sm)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="cpImgErr(this)">` : ""}</span>`;
function cpImgErr(im) { if (im.dataset.r) return im.remove(); im.dataset.r = 1; const u = im.src; setTimeout(() => { im.src = ""; im.src = u; }, 1500 + Math.random() * 1500); }   // one retry: Lichess sometimes throttles a burst of photos
const cpFed = (p) => (p && p.fed ? cpFlag(p) + (CP_ISO[p.fed] ? p.fed : "") : "");
const cpWho = (id, extra = "") => { const p = cpP(id); return `<span class="cpwho">${cpFace(p)}<span class="cpnm">${cpFlag(p)}${esc(cpName(p))}${extra}</span></span>`; };
const cpStage = (sid) => { if (String(sid).startsWith("ev:")) { const e = evById(sid.slice(3)); return e ? { id: sid, name: e.name, games: e.games } : { games: [] }; } return CP.stages.find((x) => x.id === sid) || { games: [] }; };
const cpRes = (g, id) => (g.r === "1/2-1/2" ? "D" : (g.r === "1-0") === (g.w === id) ? "W" : g.r === "*" ? "" : "L");
const CP_KIND = { classical: ["Classical", "clock"], rapid: ["Rapid", "bolt"], blitz: ["Blitz", "bolt"], armageddon: ["Armageddon", "swords"] };

function cpTable(games, scoring, order) {
  const t = {};
  games.forEach((g) => [g.w, g.b].forEach((id) => { const r = cpRes(g, id); if (!r) return; const x = t[id] || (t[id] = { id, W: 0, D: 0, L: 0, pts: 0, form: [] }); x[r]++; x.pts += scoring[r]; x.form.push(r); }));
  const qn = (x) => x.toLowerCase().replace(/[^a-z]/g, ""), oi = (id) => (order ? order.findIndex((n) => qn(cpName(cpP(id))).includes(qn(n))) : 0);
  return Object.values(t).sort((a, b) => b.pts - a.pts || oi(a.id) - oi(b.id) || b.W - a.W);
}
const cpDots = (form) => `<span class="cpdots">${form.slice(-5).map((r) => `<i class="d${r}"></i>`).join("")}</span>`;
const cpTableHTML = (rows, opts = {}) => `<table class="cpt"><thead><tr><th>#</th><th>Player</th><th title="Wins">W</th><th title="Draws">D</th><th title="Losses">L</th><th class="cpform-h">Form</th><th>Pts</th></tr></thead><tbody>${rows.map((x, i) => `<tr class="${i < (opts.q || 0) ? "q" : ""}" data-cpp="${x.id}" tabindex="0"><td class="num">${i + 1}</td><td>${cpWho(x.id)}</td><td class="num">${x.W}</td><td class="num">${x.D}</td><td class="num">${x.L}</td><td class="cpform-h">${cpDots(x.form)}</td><td class="num"><b>${x.pts % 1 ? x.pts.toFixed(1) : x.pts}</b></td></tr>`).join("")}</tbody></table>`;

/* the six knockout brackets: semifinal pairs come from the Semifinals broadcast, the final and third-place pairs from the Finals one */
function cpMatches(sid) { const m = {}; cpStage(sid).games.forEach((g, i) => { const k = [g.w, g.b].sort().join("|"), x = m[k] || (m[k] = { key: sid + ":" + k, ids: k.split("|"), games: [], bd: 99 }); x.games.push(i); x.bd = Math.min(x.bd, g.bd || 99); }); return Object.values(m); }
function cpBrackets() {
  const semis = cpMatches("semi"), fins = cpMatches("final"), out = [];
  for (let k = 1; k <= 6; k++) {
    const sm = semis.filter((m) => m.bd === 2 * k - 1 || m.bd === 2 * k), fin = fins.find((m) => m.bd === 2 * k - 1), third = fins.find((m) => m.bd === 2 * k);
    out.push({ k, sm, fin, third, inFinal: new Set(fin ? fin.ids : []) });
  }
  return out;
}
function cpMatchTile(m, label, win) {
  if (!m) return "";
  const st = cpStage(m.key.split(":")[0]), gs = m.games.map((i) => st.games[i]), rec = (id) => { const r = { W: 0, D: 0, L: 0 }; gs.forEach((g) => { const x = cpRes(g, id); if (x) r[x]++; }); return r; };
  return `<button class="cpmatch" type="button" data-cpm="${m.key}"><span class="cplab">${label}</span>${m.ids.map((id) => { const r = rec(id); return `<span class="cpmrow ${win === id ? "win" : ""}">${cpFace(cpP(id))}<span class="cpnm">${cpFlag(cpP(id))}${esc(cpName(cpP(id)))}</span><span class="num cpwdl">${r.W}<small>W</small> ${r.D}<small>D</small></span>${win === id ? ic("trophy") : ""}</span>`; }).join("")}</button>`;
}

const CP_EVENTS = {
  open: [
    { v: "tc", name: "Total Chess Tour Pilot", where: "Budapest", when: "10–20 Nov 2026", badge: ["done", "Finished"], faces: ["firouzja", "giri", "caruana"], win: "firouzja" },
    { v: "wcc", name: "World Championship", where: "Geneva", when: "24 Nov – 11 Dec 2026", badge: ["soon", "Starts 24 Nov"], faces: ["gukesh", "sindarov"], vs: true },
    { v: "cho", name: "Reigning champions", where: "Classical, rapid, blitz, freestyle", when: "As of Nov 2026", badge: ["info", "Titles"], faces: ["gukesh", "carlsen", "firouzja"] },
  ],
  women: [
    { v: "wwc", name: "Women's World Championship", where: "Host to be announced", when: "Dates not confirmed", badge: ["soon", "Upcoming"], faces: ["ju", "vaishali"], vs: true },
    { v: "chw", name: "Reigning champions", where: "Classical, rapid, blitz", when: "As of Nov 2026", badge: ["info", "Titles"], faces: ["ju", "gory", "bibi"] },
  ],
};
const cpCard = (e) => `<button class="cpcard" type="button" data-cpv="${e.v}"><span class="cpbadge ${e.badge[0]}">${e.badge[1]}</span><span class="cpfaces ${e.vs ? "vs" : ""}">${e.faces.map((f, i) => (e.vs && i ? '<b class="cpvs">vs</b>' : "") + cpFace(cpP(CP_ID[f]), "md")).join("")}</span><b class="cpcname">${e.name}</b><span class="cpmeta">${ic("flag")}${e.where}</span><span class="cpmeta">${ic("clock")}${e.when}</span>${e.win ? `<span class="cpwinner">${ic("trophy")}${esc(cpName(cpP(CP_ID[e.win])))}</span>` : ""}</button>`;

let CH = { v: "home", stage: "groups", tour: "6PTzCQFL", round: null, games: [] };
const chLink = (u, t) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;
const cpBack = (to = "home", label = "Championships") => `<div class="crumbs"><button class="btn ghost" ${to === "menu" ? 'data-go="home"' : `data-cpv="${to}"`}>← ${label}</button></div>`;
function champPage(v) {
  rvStop(); olClose(); clearInterval(st.timer); live = null; st = { game: "champ" }; if (typeof v === "string") CH.v = v; const app = $("#app"); app.className = "fresh";
  if (CH.v === "home") app.innerHTML = `${cpBack("menu", "Menu")}<h2 style="font-size:32px">${ic("crown")}Championships</h2>
    <div class="cpsec"><h3>${ic("crown")}Open</h3><span class="fine">Open to everyone; nearly every player is a man.</span></div><div class="cpgrid">${CP_EVENTS.open.map(cpCard).join("")}${evCards("open")}${rkCard("open")}</div>
    <div class="cpsec"><h3>${ic("crown")}Women</h3><span class="fine">Titles only women can play for.</span></div><div class="cpgrid">${CP_EVENTS.women.map(cpCard).join("")}${evCards("women")}${rkCard("women")}</div>`;
  else if (CH.v === "tc") app.innerHTML = cpBack() + cpTC();
  else if (CH.v.startsWith("ev:")) app.innerHTML = cpBack() + evPage(CH.v.slice(3));
  else if (CH.v === "wcc") { app.innerHTML = cpBack() + cpVs("gukesh", "sindarov", "FIDE World Championship", [["flag", "Geneva, Switzerland"], ["clock", "24 Nov – 11 Dec 2026"], ["swords", "14 classical games"], ["bolt", "120 min + 30 min, +30 s from move 41"]], `Gukesh defends the title against Sindarov, who won the 2026 Candidates. Tiebreaks if it is level. Dates follow the Lichess broadcast schedule; check ${chLink("https://worldchampionship.fide.com/", "FIDE")} for changes.`, ["Defending champion", "Challenger"]) + `<div id="wccLive" class="card lvcard" style="margin-top:12px"></div><div id="chLive" class="card" style="margin-top:12px"></div>`; wccLive("qfkdt8mn", document.getElementById("wccLive")); chLoadTour("qfkdt8mn"); }
  else if (CH.v === "wwc") app.innerHTML = cpBack() + cpVs("ju", "vaishali", "Women's World Championship", [["flag", "Host to be announced"], ["clock", "Dates not confirmed"], ["swords", "12 games"], ["trophy", "Vaishali won the Candidates, 8.5/14"]], `Sources disagree on the dates and FIDE lists them as to be announced, so there are no games to show yet. ${chLink("https://www.fide.com/vaishali-conquers-womens-candidates-to-set-up-world-title-showdown-against-ju-wenjun/", "FIDE")} · ${chLink("https://en.wikipedia.org/wiki/Women%27s_World_Chess_Championship_2026", "Wikipedia")}`, ["Champion", "Challenger"]);
  else if (CH.v === "cho") app.innerHTML = cpBack() + cpChamps("Open champions", [["gukesh", ["Classical"], "Defends against Sindarov from 24 November"], ["carlsen", ["Rapid", "Blitz", "Freestyle"], "2025 World Rapid and Blitz; first FIDE Freestyle title, Feb 2026"], ["firouzja", ["Total Chess pilot"], "Won the Budapest pilot on Armageddon, Nov 2026"]], `The World Rapid and Blitz are in December, so those can change. Sources: ${chLink("https://en.chessbase.com/post/world-rapid-blitz-2025-5", "ChessBase")}, ${chLink("https://en.chessbase.com/post/freestyle-chess-wc-2026-3", "ChessBase on Freestyle")}, ${chLink("https://www.chess.com/news/view/geneva-gukesh-sindarov-2026-fide-world-championship", "chess.com")}, ${chLink("https://en.wikipedia.org/wiki/Total_Chess_World_Championship_2026", "Wikipedia")}.`);
  else if (CH.v === "chw") app.innerHTML = cpBack() + cpChamps("Women's champions", [["ju", ["Classical"], "Challenger: Vaishali Rameshbabu, dates not confirmed"], ["gory", ["Rapid"], "Won the 2025 Women's World Rapid"], ["bibi", ["Blitz"], "Won the 2025 Women's World Blitz, her third"]], `The World Rapid and Blitz are in December, so those can change. Sources: ${chLink("https://en.chessbase.com/post/world-rapid-blitz-2025-5", "ChessBase")}, ${chLink("https://www.fide.com/vaishali-conquers-womens-candidates-to-set-up-world-title-showdown-against-ju-wenjun/", "FIDE")}.`);
  scrollTo({ top: 0, behavior: "instant" });
}
function cpVs(a, b, title, facts, note, roles) {
  const side = (k, role) => { const p = cpP(CP_ID[k]); return `<button class="cpside" type="button" data-cpp="${CP_ID[k]}">${cpFace(p, "big")}<span class="cprole">${role}</span><b>${esc(cpName(p))}</b><span class="cpmeta">${cpFed(p)}</span>${p && p.std ? `<span class="cprat"><span><b class="num">${p.std}</b><small>Classical</small></span></span>` : ""}</button>`; };
  return `<div class="card cphero"><h2>${title}</h2><div class="cpvsrow">${side(a, roles[0])}<span class="cpvsbig">VS</span>${side(b, roles[1])}</div><div class="cpfacts">${facts.map(([i, t]) => `<span>${ic(i)}${t}</span>`).join("")}</div><p class="fine" style="margin:12px 0 0">${note}</p></div>`;
}
function cpChamps(title, rows, note) {
  return `<h2 style="font-size:30px">${ic("trophy")}${title}</h2><div class="cpchamps">${rows.map(([k, titles, line]) => { const p = cpP(CP_ID[k]); return `<button class="cpchamp" type="button" data-cpp="${CP_ID[k]}">${cpFace(p, "big")}<span class="cptitles">${titles.map((t) => `<span>${ic("crown")}${t}</span>`).join("")}</span><b>${esc(cpName(p))}</b><span class="cpmeta">${cpFed(p)}</span><span class="fine">${line}</span></button>`; }).join("")}</div><p class="fine" style="margin-top:12px">${note}</p>`;
}
function cpTC() {
  const pod = [["giri", "2", "Runner-up"], ["firouzja", "1", "Champion"], ["caruana", "3", "Third"]];
  const tabs = [["groups", "Groups"], ["ko", "Knockouts"], ["blitz", "Opening blitz"]];
  return `<div class="card cphero"><span class="cpbadge done">Finished</span><h2>Total Chess Tour Pilot</h2><div class="cpfacts"><span>${ic("flag")}Budapest</span><span>${ic("clock")}10–20 Nov 2026</span><span>${ic("user")}24 players</span><span>${ic("trophy")}$650,000</span><span>${ic("bolt")}Classical, rapid, blitz</span></div>
    <div class="cppodium">${pod.map(([k, n, l]) => `<button class="cppod p${n}" type="button" data-cpp="${CP_ID[k]}">${cpFace(cpP(CP_ID[k]), "big")}<span class="cpmedal">${n}</span><b>${esc(cpName(cpP(CP_ID[k])))}</b><span class="fine">${l}</span><span class="cpstep"></span></button>`).join("")}</div>
    <p class="fine" style="margin:10px 0 0">Firouzja and Giri won a day each in the final, so it went to Armageddon: Firouzja held a draw with Black and won on draw odds. Caruana beat Vachier-Lagrave for third. ${chLink("https://en.wikipedia.org/wiki/Total_Chess_World_Championship_2026", "Wikipedia")} · ${chLink("https://www.etvbharat.com/en/sports/total-chess-world-championship-tour-pilot-alireza-firouzja-triumphs-in-budapest-enn26112101045", "ETV Bharat")}</p></div>
    <div class="cptabs" role="tablist">${tabs.map(([k, n]) => `<button class="chip ${CH.stage === k ? "on" : ""}" type="button" role="tab" aria-selected="${CH.stage === k}" data-cpstage="${k}">${n}</button>`).join("")}</div><div id="cpBody">${cpStageHTML()}</div>`;
}
function cpStageHTML() {
  if (CH.stage === "groups") return `<p class="fine cphint">${ic("arrow")}Four groups of six, each player meeting the others twice in Fast Classical (3 points a win, 1 a draw). Group winners went to the title bracket. Tap a player for their games.</p><div class="cpgroups">${["A", "B", "C", "D"].map((g) => `<div class="card cpgroup"><h3>Group ${g}</h3>${cpTableHTML(cpTable(cpStage(g).games, { W: 3, D: 1, L: 0 }, TC_GROUPS["Group " + g].map((r) => r[0])), { q: 1 })}</div>`).join("")}</div>`;
  if (CH.stage === "blitz") return `<p class="fine cphint">${ic("arrow")}The opening 9-round blitz Swiss (1 point a win, ½ a draw). Tap a player for their games.</p><div class="card">${cpTableHTML(cpTable(cpStage("blitz").games, { W: 1, D: 0.5, L: 0 }), { q: 1 })}</div>`;
  const names = ["Title bracket (group winners)", "Second places", "Third places", "Fourth places", "Fifth places", "Sixth places"];
  return `<p class="fine cphint">${ic("arrow")}Each group place had its own bracket. A match is two days of 4 blitz, 2 rapid and 1 Fast Classical game, with Armageddon if level. Tap a match for its games.</p><div class="cpbrackets">${cpBrackets().map((b) => `<div class="card cpbracket ${b.k === 1 ? "title" : ""}"><h3>${b.k === 1 ? ic("crown") : ""}${names[b.k - 1]}</h3><div class="cpbr"><div class="cpcol"><span class="cplab2">Semifinals</span>${b.sm.map((m) => cpMatchTile(m, "", m.ids.find((id) => b.inFinal.has(id)))).join("")}</div><div class="cpcol"><span class="cplab2">Final</span>${cpMatchTile(b.fin, "", b.k === 1 ? CP_ID.firouzja : null)}<span class="cplab2">Third place</span>${cpMatchTile(b.third, "", b.k === 1 ? CP_ID.caruana : null)}</div></div></div>`).join("")}</div>`;
}
function cpGameRow(sid, i, me) {
  const st = cpStage(sid), g = st.games[i], opp = g.w === me ? g.b : g.w, r = cpRes(g, me), k = CP_KIND[g.tc] || ["", "clock"];
  return `<button class="cpgame" type="button" data-cpg="${sid}|${i}"><span class="cpres r${r}">${r === "W" ? "Win" : r === "D" ? "Draw" : r === "L" ? "Loss" : "…"}</span><span class="cpcol2">${me ? cpWho(opp) : `${cpWho(g.w)}<span class="fine">v</span>${cpWho(g.b)}`}<span class="fine">${st.name}${g.rd ? " · round " + +g.rd : ""} · ${ic(k[1])}${k[0]} · ${me ? (g.w === me ? "White" : "Black") : g.r.replace("1/2-1/2", "½-½")}</span></span>${me ? eloTag(eloDelta(g, me)) : ""}${ic("arrow")}</button>`;
}
function cpSheet(html) { cpClose(); const m = document.body.appendChild(document.createElement("div")); m.className = "cpov"; m.id = "cpov"; m.innerHTML = `<div class="cpsheet" role="dialog" aria-modal="true"><button class="cpx" type="button" data-cpclose aria-label="Close">×</button>${html}</div>`; requestAnimationFrame(() => m.classList.add("on")); }
function cpClose() { const m = document.getElementById("cpov"); if (m) m.remove(); }
function cpPlayer(id) {
  const p = cpP(id); if (!p) return; const mine = [];
  CP.stages.forEach((s) => s.games.forEach((g, i) => { if (g.w === id || g.b === id) mine.push([s.id, i, g]); }));
  const all = { W: 0, D: 0, L: 0 }; mine.forEach(([, , g]) => { const r = cpRes(g, id); if (r) all[r]++; }); const n = all.W + all.D + all.L;
  const byStage = CP.stages.map((s) => [s, mine.filter((x) => x[0] === s.id).reverse()]).filter(([, l]) => l.length).reverse();   // newest first
  cpSheet(`<div class="cphead">${cpFace(p, "big")}<div><h2>${esc(cpName(p))}</h2><div class="cpmeta">${cpFed(p)}${p.t ? " · " + p.t : ""}${p.y ? " · born " + p.y : ""}</div><div class="cprat">${[["Classical", p.std], ["Rapid", p.rap], ["Blitz", p.blz]].filter((x) => x[1]).map(([k, v]) => `<span><b class="num">${v}</b><small>${k}</small></span>`).join("")}</div></div></div>
    ${n ? `<div class="cpstats"><span><b class="num">${n}</b><small>Games</small></span><span class="sW"><b class="num">${all.W}</b><small>Wins</small></span><span class="sD"><b class="num">${all.D}</b><small>Draws</small></span><span class="sL"><b class="num">${all.L}</b><small>Losses</small></span><span><b class="num">${Math.round((100 * (all.W + all.D / 2)) / n)}%</b><small>Score</small></span></div><div class="fine" style="margin-bottom:4px">Every game, first to last</div><div class="cpstrip">${mine.map(([, , g]) => `<i class="d${cpRes(g, id)}"></i>`).join("")}</div>
    ${byStage.map(([s, l]) => `<h4 class="cpsh">${s.name}<span class="fine">${l.filter((x) => cpRes(x[2], id) === "W").length}W ${l.filter((x) => cpRes(x[2], id) === "D").length}D ${l.filter((x) => cpRes(x[2], id) === "L").length}L</span></h4><div class="cpgames">${l.map(([sid, i]) => cpGameRow(sid, i, id)).join("")}</div>`).join("")}` : `<p class="fine">Did not play in the Total Chess pilot.</p>`}
    ${RK.players[id] ? `<button class="btn cpprof" type="button" data-cpprof="${id}">${ic("user")}Full profile, ratings and history</button>` : ""}${p.cr ? `<p class="fine cpcredit">Photo: ${esc(p.cr.replace(/<[^>]*>/g, ""))}</p>` : ""}`);
}
function cpMatch(key) {
  const [sid, pair] = key.split(":"), ids = pair.split("|"), st = cpStage(sid), m = cpMatches(sid).find((x) => x.key === key); if (!m) return;
  cpSheet(`<div class="cpvsrow sm">${ids.map((id, k) => (k ? '<span class="cpvsbig">VS</span>' : "") + `<button class="cpside" type="button" data-cpp="${id}">${cpFace(cpP(id), "big")}<b>${esc(cpName(cpP(id)))}</b></button>`).join("")}</div><h4 class="cpsh">${st.name}<span class="fine">${m.games.length} games</span></h4><div class="cpgames">${m.games.map((i) => cpGameRow(sid, i, ids[0])).join("")}</div><p class="fine">Results are from ${esc(cpName(cpP(ids[0])))}'s side.</p>`);
}
document.addEventListener("click", (e) => {
  if (st.game !== "champ" && st.game !== "rank") return;
  const t = e.target.closest && e.target.closest("[data-cpv],[data-cpstage],[data-cpp],[data-cpm],[data-cpg],[data-cpclose],.cpov"); if (!t) return;
  if (t.classList.contains("cpov") && e.target !== t) return;
  if (t.dataset.cpclose != null || t.classList.contains("cpov")) return cpClose();
  try { Snd.tick && Snd.tick(); } catch (er) { /* quiet */ }
  if (t.dataset.cpv) { cpClose(); return champPage(t.dataset.cpv); }
  if (t.dataset.cpstage) { CH.stage = t.dataset.cpstage; document.querySelectorAll("[data-cpstage]").forEach((x) => { x.classList.toggle("on", x === t); x.setAttribute("aria-selected", x === t); }); $("#cpBody").innerHTML = cpStageHTML(); return; }
  if (t.dataset.cpp) return cpPlayer(t.dataset.cpp);
  if (t.dataset.cpm) return cpMatch(t.dataset.cpm);
  if (t.dataset.cpg) { const [sid, i] = t.dataset.cpg.split("|"), g = cpStage(sid).games[+i], c = new Chess(); c.load_pgn(g.m, { sloppy: true }); const sans = c.history(); if (sans.length < 2) return; cpClose(); reviewStart(sans, "w", { from: st.game === "rank" ? "rank" : "champ", names: [cpName(cpP(g.w)), cpName(cpP(g.b))], result: g.r }); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cpClose(); if (e.key === "Enter" && st.game === "champ" && e.target.dataset && e.target.dataset.cpp) cpPlayer(e.target.dataset.cpp); });

/* ---------- World rankings and player profiles ----------
   The official FIDE top-100 lists (src/79_chess_ratings.py): open and women, classical, rapid and blitz, with each
   player's monthly FIDE rating history. Photos from Lichess's FIDE API. Profiles add what this site knows: Total Chess
   games (src/78) and the elite-games records behind the lookup. */
const RK = DATA.ratings || { lists: {}, players: {} };
Object.entries(RK.players).forEach(([k, p]) => { p.id = k; if (!CP.players[k]) CP.players[k] = p; });
const RK_LIST = { open: ["open", "open_rapid", "open_blitz"], women: ["women", "women_rapid", "women_blitz"] };
const RK_TC = [["Classical", "std", 1], ["Rapid", "rap", 2], ["Blitz", "blz", 3]];
const RK_TITLES = {   // sourced world titles, as on the Championships page (November 2026)
  "46616543": [["World Champion", "Classical"]], "1503014": [["World Champion", "Rapid"], ["World Champion", "Blitz"], ["World Champion", "Freestyle"]], "12573981": [["Total Chess", "Pilot winner, Budapest 2026"]],
  "8603006": [["Women's World Champion", "Classical"]], "4147103": [["Women's World Champion", "Rapid"]], "13708694": [["Women's World Champion", "Blitz"]],
};
let RKS = { sec: "open", tc: 0, q: "", prof: null, per: 12 };
const RK_PER = [[1, "1 month"], [3, "3 months"], [6, "6 months"], [12, "1 year"], [60, "5 years"]];
const rkCard = (sec) => { const rows = (RK.lists[sec] || []).slice(0, 3); if (!rows.length) return ""; return `<button class="cpcard" type="button" data-rksec="${sec}"><span class="cpbadge info">FIDE top 100</span><span class="cpfaces">${rows.map((r) => cpFace(RK.players[r[1]], "md")).join("")}</span><b class="cpcname">${sec === "open" ? "Men's rankings" : "Women's rankings"}</b><span class="cpmeta">${ic("chart")}Classical, rapid and blitz</span><span class="cpmeta">${ic("clock")}${esc(RK.list || "")}</span><span class="cpwinner">${ic("trophy")}#1 ${esc(cpName(RK.players[rows[0][1]]))} · ${rows[0][2]}</span></button>`; };
const rkAge = (p) => (p.y ? 2026 - p.y : null);
const rkPlace = (fid) => { const out = []; Object.entries(RK.lists).forEach(([k, rows]) => { const r = rows.find((x) => x[1] === fid); if (r) out.push([k, r[0], r[2]]); }); return out; };
const rkLabel = (k) => ({ open: "World", open_rapid: "World rapid", open_blitz: "World blitz", women: "Women", women_rapid: "Women rapid", women_blitz: "Women blitz" }[k] || k);
function rkTrend(p, col = 1, months = 12) { const h = (p.h || []).filter((x) => x[col]); if (h.length < 2) return null; const last = h[h.length - 1], [y, m] = last[0].split("-").map(Number), t = (y * 12 + m - 1) - months, ts = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`, prev = [...h].reverse().find((x) => x[0] <= ts); return prev ? last[col] - prev[col] : null; }
const rkDelta = (d, lab = "12 months") => (d == null ? `<span class="rkd" title="No rating ${lab} ago">new</span>` : `<span class="rkd ${d > 0 ? "up" : d < 0 ? "dn" : ""}" title="Change over ${lab}">${d > 0 ? "▲" : d < 0 ? "▼" : "•"}${Math.abs(d) || ""}</span>`);

function rankPage(sec, tc) {
  rvStop(); olClose(); clearInterval(st.timer); live = null; cpClose(); st = { game: "rank" }; RKS.prof = null; if (sec) RKS.sec = sec; if (tc != null) RKS.tc = tc;
  const key = RK_LIST[RKS.sec][RKS.tc], rows = RK.lists[key] || [], [tcName, tcKey] = RK_TC[RKS.tc];
  $("#app").className = "fresh";
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="home">← Menu</button></div><h2 style="font-size:32px">${ic("chart")}World rankings</h2><p class="sub">The official FIDE top 100, ${esc(RK.list || "")}. Tap a player for their profile.</p>
    <div class="rkbar"><div class="chips" role="tablist">${[["open", "Men"], ["women", "Women"]].map(([k, n]) => `<button class="chip ${k === RKS.sec ? "on" : ""}" type="button" data-rksec="${k}">${n}</button>`).join("")}</div><div class="chips">${RK_TC.map(([n], i) => `<button class="chip ${i === RKS.tc ? "on" : ""}" type="button" data-rktc="${i}">${n}</button>`).join("")}</div><div class="chips rkper"><span class="fine">Change over</span>${RK_PER.map(([m, n]) => `<button class="chip ${m === RKS.per ? "on" : ""}" type="button" data-rkper="${m}">${n}</button>`).join("")}</div><input class="t rkq" id="rkQ" placeholder="Find a player" value="${esc(RKS.q)}" autocomplete="off" aria-label="Find a player"></div>
    ${rows.length ? `<div class="rkpod">${rows.slice(0, 3).map((r, i) => { const p = RK.players[r[1]] || {}; return `<button class="rkpc p${i + 1}" type="button" data-rkp="${r[1]}"><span class="rkn">#${r[0]}</span>${cpFace(p, "big")}<b>${esc(cpName(p))}</b><span class="cpmeta">${cpFed(p)}${p.t ? " · " + p.t : ""}</span><span class="rkr num">${r[2]}</span><span class="fine">${tcName}</span></button>`; }).join("")}</div>
    <div class="card rklist" id="rkRows">${rkRows(rows, tcKey)}</div>` : `<div class="card"><p class="fine">This list is not in the data yet.</p></div>`}
    <p class="fine" style="margin-top:10px">Source: ${chLink("https://ratings.fide.com/top_lists.phtml", "FIDE ratings")}; photos via ${chLink("https://lichess.org/fide", "Lichess")} (credits on each profile). “Men” is FIDE's open list, which anyone can enter. ▲▼ is the FIDE rating change over the period you pick.</p>`;
  scrollTo({ top: 0, behavior: "instant" });
}
function rkRows(rows, tcKey) {
  const q = norm(RKS.q || ""), col = { std: 1, rap: 2, blz: 3 }[tcKey];
  const list = rows.filter((r) => !q || norm(cpName(RK.players[r[1]] || {})).includes(q));
  return list.length ? list.map((r) => { const p = RK.players[r[1]] || {}; return `<button class="rkrow ${r[0] <= 10 ? "top" : ""}" type="button" data-rkp="${r[1]}"><span class="rkn num">${r[0]}</span>${cpFace(p)}<span class="rknm"><b>${cpFlag(p)}${esc(cpName(p))}</b><small>${p.t || ""}${rkAge(p) ? " · " + rkAge(p) + " yrs" : ""}${p.fed ? " · " + p.fed : ""}</small></span>${rkDelta(rkTrend(p, col, RKS.per), (RK_PER.find((x) => x[0] === RKS.per) || [])[1])}<span class="rkr num">${r[2]}</span></button>`; }).join("") : `<p class="fine">No player matches “${esc(RKS.q)}”.</p>`;
}

/* the profile */
const rkKey = (n) => norm(n || "").split(/\s+/).filter(Boolean).sort().join(" ");
const LKIDX = (() => { const m = new Map(); LKP.forEach((n, i) => { const k = rkKey(nice(n).replace(/,/g, " ")); if (!m.has(k) || LKN[i] > LKN[m.get(k)]) m.set(k, i); }); return m; })();
function rkChart(p, col) {
  const h = (p.h || []).filter((x) => x[col]); if (h.length < 3) return `<p class="fine">Not enough rating history for a chart.</p>`;
  const W = 640, Hh = 200, vals = h.map((x) => x[col]), lo = Math.floor((Math.min(...vals) - 20) / 50) * 50, hi = Math.ceil((Math.max(...vals) + 20) / 50) * 50;
  const X = (i) => 34 + (i / (h.length - 1)) * (W - 44), Y = (v) => 12 + (1 - (v - lo) / (hi - lo)) * (Hh - 34);
  const line = h.map((x, i) => `${X(i).toFixed(1)},${Y(x[col]).toFixed(1)}`).join(" "), pk = vals.indexOf(Math.max(...vals)), last = h.length - 1;
  const years = [...new Set(h.map((x) => x[0].slice(0, 4)))], step = Math.ceil(years.length / 7), ticks = years.filter((_, i) => i % step === 0).map((y) => [y, h.findIndex((x) => x[0].startsWith(y))]);
  const grid = []; for (let v = lo; v <= hi; v += (hi - lo) > 400 ? 100 : 50) grid.push(v);
  return `<svg class="rkchart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Rating history"><defs><linearGradient id="rkg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".35"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>
    ${grid.map((v) => `<line x1="34" x2="${W - 10}" y1="${Y(v)}" y2="${Y(v)}" class="rkgl"/><text x="28" y="${Y(v) + 4}" class="rkax" text-anchor="end">${v}</text>`).join("")}
    ${ticks.map(([y, i]) => `<text x="${X(i)}" y="${Hh - 6}" class="rkax" text-anchor="middle">${y}</text>`).join("")}
    <polygon points="${X(0)},${Hh - 22} ${line} ${X(last)},${Hh - 22}" fill="url(#rkg)"/><polyline points="${line}" class="rkline"/>
    <circle cx="${X(pk)}" cy="${Y(vals[pk])}" r="5" class="rkpk"/><text x="${Math.min(X(pk), W - 60)}" y="${Math.max(Y(vals[pk]) - 10, 12)}" class="rklab" text-anchor="middle">Peak ${vals[pk]}</text>
    <circle cx="${X(last)}" cy="${Y(vals[last])}" r="4" class="rknow"/></svg>`;
}
function rkMilestones(p) {
  const out = (RK_TITLES[p.id] || []).map(([a, b]) => ["crown", a, b, true]);
  const bio = PBIO[norm(cpName(p))]; if (bio && bio.champ && !out.some((x) => x[1] === "World Champion" && x[2] === "Classical")) out.push(["crown", "World Champion", "Classical, past", true]);
  rkPlace(p.id).forEach(([k, r]) => { if (r <= 10) out.push(["trophy", rkLabel(k) + " #" + r, "FIDE " + (RK.list || ""), r === 1]); });
  const h = (p.h || []).filter((x) => x[1]); [2800, 2700].forEach((t) => { const f = h.find((x) => x[1] >= t); if (f && !out.some((x) => x[1].endsWith("club"))) out.push(["bolt", t + " club", "Since " + f[0].slice(0, 4), false]); });
  if (p.peak) out.push(["chart", "Peak " + p.peak, "Classical, " + (p.peakAt || "").replace(/-(\d\d)$/, (m, mm) => " " + ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+mm]), false]);
  const tc = CP.stages.length && rkTcFinish(p.id); if (tc) out.push(["swords", "Total Chess pilot", tc, tc.startsWith("1st")]);
  if (p.t) out.push(["user", p.t === "GM" ? "Grandmaster" : p.t === "IM" ? "International Master" : p.t === "WGM" ? "Woman Grandmaster" : p.t, "FIDE title", false]);
  return out;
}
function rkTcFinish(fid) { if (!CP.stages.some((s) => s.games.some((g) => g.w === fid || g.b === fid))) return null; const pod = { [CP_ID.firouzja]: "1st, champion", [CP_ID.giri]: "2nd", [CP_ID.caruana]: "3rd", [CP_ID.mvl]: "4th" }; return pod[fid] || "Played"; }
function rkRecent(p) {
  const rows = [];
  CP.stages.forEach((s) => s.games.forEach((g, i) => { if (g.w === p.id || g.b === p.id) rows.push({ d: (g.d || "").replace(/\./g, "-"), ev: "Total Chess · " + s.name, opp: g.w === p.id ? g.b : g.w, r: cpRes(g, p.id), col: g.w === p.id ? "White" : "Black", tc: g.tc, ref: s.id + "|" + i }); }));
  const li = LKIDX.get(rkKey(cpName(p))); if (li != null) LKG.forEach((g) => { if ((g[2] === li || g[3] === li) && g[1]) rows.push({ d: g[1], ev: LKE[g[0]].n, oppName: nice(LKP[g[2] === li ? g[3] : g[2]]), r: resFor(g, li), col: g[2] === li ? "White" : "Black" }); });
  rows.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0)); return { rows: rows.slice(0, 12), li };
}
function profPage(fid) {
  const p = RK.players[fid] || CP.players[fid]; if (!p) return; rvStop(); olClose(); clearInterval(st.timer); live = null; cpClose(); st = { game: "rank", prof: fid }; RKS.prof = fid;
  const places = rkPlace(fid), ms = rkMilestones(p), rec = rkRecent(p), form = rec.rows.slice(0, 10);
  const tiles = RK_TC.map(([n, k, col]) => { const d = rkTrend(p, col); return p[k] ? `<div class="rktile"><small>${n}</small><b class="num">${p[k]}</b>${rkDelta(d)}</div>` : ""; }).join("");
  $("#app").className = "fresh";
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-rkback>← Rankings</button></div>
    <div class="card rkhero">${cpFace(p, "big")}<div class="rkhi"><h2>${esc(cpName(p))}</h2><div class="cpmeta">${cpFed(p)}${p.t ? " · " + p.t : ""}${rkAge(p) ? " · " + rkAge(p) + " years old" : ""}</div>
      <div class="rkplaces">${places.length ? places.map(([k, r]) => `<span class="${r <= 3 ? "gold" : ""}">${rkLabel(k)} <b>#${r}</b></span>`).join("") : '<span>Outside the FIDE top 100</span>'}</div><button class="btn ghost h2hbtn" type="button" data-h2ha="${fid}">${ic("swords")}Head to head</button></div></div>
    <div class="rktiles">${tiles}</div>
    <div class="card rkchg"><h3>${ic("chart")}Rating change</h3><table class="rvph"><tr><th></th>${RK_PER.map(([, n]) => `<th>${n}</th>`).join("")}</tr>${RK_TC.filter(([, k]) => p[k]).map(([n, , col]) => `<tr><td>${n}</td>${RK_PER.map(([m]) => { const d = rkTrend(p, col, m); return `<td>${d == null ? '<span class="fine">—</span>' : rkDelta(d)}</td>`; }).join("")}</tr>`).join("")}</table></div>
    <div class="card"><div class="rkch"><h3>${ic("chart")}Rating history</h3><div class="chips">${RK_TC.map(([n], i) => `<button class="chip ${i === 0 ? "on" : ""}" type="button" data-rkch="${i + 1}">${n}</button>`).join("")}</div></div><div id="rkChart">${rkChart(p, 1)}</div></div>
    ${ms.length ? `<h3 class="rksh">${ic("trophy")}Titles and milestones</h3><div class="rkms">${ms.map(([i, a, b, gold]) => `<div class="rkm ${gold ? "gold" : ""}">${ic(i)}<b>${esc(a)}</b><small>${esc(b)}</small></div>`).join("")}</div>` : ""}
    <h3 class="rksh">${ic("clock")}Recent results ${form.length ? `<span class="cpdots big">${form.slice().reverse().map((x) => `<i class="d${x.r}"></i>`).join("")}</span>` : ""}</h3>
    ${rec.rows.length ? `<div class="cpgames">${rec.rows.map((x) => { const o = x.opp ? cpP(x.opp) : null; return `<${x.ref ? `button type="button" data-cpg="${x.ref}"` : "div"} class="cpgame ${x.ref ? "" : "static"}"><span class="cpres r${x.r}">${x.r === "W" ? "Win" : x.r === "D" ? "Draw" : "Loss"}</span><span class="cpcol2">${o ? cpWho(x.opp) : `<span class="cpwho"><span class="cpnm">${esc(x.oppName || "")}</span></span>`}<span class="fine">${esc(x.ev)} · ${x.d} · ${x.col}</span></span>${x.ref ? ic("arrow") : ""}</${x.ref ? "button" : "div"}>`; }).join("")}</div>` : `<p class="fine">No games for this player in the site's records yet.</p>`}
    ${rec.li != null ? `<h3 class="rksh">${ic("eye")}At the biggest events</h3><div class="card" id="rkLk">${lkPlayer(rec.li)}</div>` : ""}
    <p class="fine" style="margin-top:12px">Ratings and history: ${chLink("https://ratings.fide.com/profile/" + fid, "FIDE profile")}.${p.cr ? " Photo: " + esc(p.cr.replace(/<[^>]*>/g, "")) : ""}</p>`;
  countUp($("#app")); scrollTo({ top: 0, behavior: "instant" });
}
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-rksec],[data-rktc],[data-rkper],[data-rkp],[data-rkch],[data-rkback],[data-cpprof]"); if (!t) return;
  try { Snd.tick && Snd.tick(); } catch (er) { /* quiet */ }
  if (t.dataset.rksec) return rankPage(t.dataset.rksec);
  if (t.dataset.rktc) return rankPage(null, +t.dataset.rktc);
  if (t.dataset.rkper) { RKS.per = +t.dataset.rkper; return rankPage(); }
  if (t.dataset.rkp) return profPage(t.dataset.rkp);
  if (t.dataset.cpprof) return profPage(t.dataset.cpprof);
  if (t.dataset.rkback != null) return rankPage();
  if (t.dataset.rkch) { document.querySelectorAll("[data-rkch]").forEach((x) => x.classList.toggle("on", x === t)); const p = RK.players[st.prof] || CP.players[st.prof]; $("#rkChart").innerHTML = rkChart(p, +t.dataset.rkch); }
});
document.addEventListener("input", (e) => { if (e.target.id === "rkQ") { RKS.q = e.target.value; const key = RK_LIST[RKS.sec][RKS.tc]; $("#rkRows").innerHTML = rkRows(RK.lists[key] || [], RK_TC[RKS.tc][1]); } });

/* ---------- 2026 tournaments (src/81_chess_events.py): standings, rounds, every game with its rating change ---------- */
const EVD = DATA.events || { events: [], players: {} };
Object.entries(EVD.players || {}).forEach(([k, p]) => { p.id = k; if (!CP.players[k]) CP.players[k] = p; });
const EVS = EVD.events || [];
const evById = (id) => EVS.find((e) => e.id === id);
/* FIDE rating change for one game: K 10 at 2400+ in classical (20 below), 20 in rapid and blitz; Armageddon is not rated */
function eloDelta(g, me) {
  if (g.r === "*" || g.tc === "armageddon") return null; const white = g.w === me, R = +(white ? g.we : g.be), O = +(white ? g.be : g.we); if (!R || !O) return null;
  const S = g.r === "1/2-1/2" ? 0.5 : (g.r === "1-0") === white ? 1 : 0, d = Math.max(-400, Math.min(400, O - R)), E = 1 / (1 + Math.pow(10, d / 400)), K = g.tc === "classical" ? (R >= 2400 ? 10 : 20) : 20;
  return Math.round(K * (S - E) * 10) / 10;
}
const eloTag = (v) => (v == null ? "" : `<span class="rkd ${v > 0 ? "up" : v < 0 ? "dn" : ""}" title="FIDE rating change for this game">${v > 0 ? "+" : ""}${v.toFixed(1)}</span>`);
const evDates = (e) => { const f = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString([], { day: "numeric", month: "short" }) : ""); return e.from ? `${f(e.from)} – ${f(e.to)} ${e.to ? e.to.slice(0, 4) : ""}` : ""; };
/* a tie on points settled by a playoff: the winner of the last decisive playoff game (a drawn Armageddon goes to Black) */
function evPlayoffWinner(e) { const po = e.games.filter((g) => g.st === "Playoff" && g.r !== "*"); for (let k = po.length - 1; k >= 0; k--) { const g = po[k]; if (g.r === "1-0") return g.w; if (g.r === "0-1") return g.b; if (g.tc === "armageddon") return g.b; } return null; }
const evTop = (e) => { if (e.scoring === "ko") { const st = evKO(e), f = st[st.length - 1], fm = f && f.list.find((m) => m.label === "Final"); if (e.koWin && fm) { const tp = f.list.find((m) => m.label === "Third place"); return [fm.win, fm.ids.find((p) => p !== fm.win), ...(tp ? [tp.win] : [])]; } return [...new Set((f ? f.list : []).flatMap((m) => m.ids))]; } const ids = e.table.map((r) => r[0]), pw = evPlayoffWinner(e); return pw && ids.includes(pw) ? [pw, ...ids.filter((x) => x !== pw)] : ids; };
function evWinner(e) { if (!e.done) return null; if (e.scoring === "ko") { if (!e.koWin) return null; const id = evTop(e)[0]; return id ? cpName(cpP(id)) : null; } const t = e.table; if (!t.length) return null; const pw = evPlayoffWinner(e); if (pw) return cpName(cpP(pw)) + " (playoff)"; const top = t.filter((r) => r[1] === t[0][1]); return top.length === 1 ? cpName(cpP(top[0][0])) : "Shared: " + top.map((r) => cpName(cpP(r[0])).split(" ").pop()).join(", "); }
const evCard = (e) => `<button class="cpcard" type="button" data-cpv="ev:${e.id}"><span class="cpbadge ${e.done ? "done" : "soon"}">${e.done ? "Finished" : "In progress"}</span><span class="cpfaces">${evTop(e).slice(0, 3).map((id) => cpFace(cpP(id), "md")).join("")}</span><b class="cpcname">${esc(e.name)}</b><span class="cpmeta">${ic("flag")}${esc((e.site || "").replace(/,\s*\w\w$/, ""))}</span><span class="cpmeta">${ic("clock")}${evDates(e)}</span>${evWinner(e) ? `<span class="cpwinner">${ic("trophy")}${esc(evWinner(e))}</span>` : ""}</button>`;
const evCards = (sec) => EVS.filter((e) => e.sec === sec).sort((a, b) => (a.to < b.to ? 1 : -1)).map(evCard).join("");
function evPage(id) {
  const e = evById(id); if (!e) return champPage("home"); CH.ev = id; CH.evTab = CH.evTab || "table";
  const ko = e.scoring === "ko", top = evTop(e).slice(0, 3), pod = ko && !e.koWin ? [] : [[top[1], "2"], [top[0], "1"], [top[2], "3"]].filter((x) => x[0]);
  return `<div class="card cphero"><span class="cpbadge ${e.done ? "done" : "soon"}">${e.done ? "Finished" : "In progress"}</span><h2>${esc(e.name)}</h2><div class="cpfacts"><span>${ic("flag")}${esc(e.site || "")}</span><span>${ic("clock")}${evDates(e)}</span><span>${ic("user")}${new Set(e.games.flatMap((g) => [g.w, g.b])).size} players</span><span>${ic("swords")}${e.games.length} games</span></div>
    ${pod.length && e.done ? `<div class="cppodium">${pod.map(([pid, n]) => `<button class="cppod p${n}" type="button" data-evp="${pid}">${cpFace(cpP(pid), "big")}<span class="cpmedal">${n}</span><b>${esc(cpName(cpP(pid)))}</b><span class="fine">${ko ? ["", "Champion", "Runner-up", "Third"][+n] : (e.table.find((r) => r[0] === pid) || [])[1] + " pts"}</span><span class="cpstep"></span></button>`).join("")}</div>` : ""}
    <p class="fine" style="margin:10px 0 0">${esc(e.fmt)} Standings are by points; official tiebreaks are not applied. Games from the ${chLink("https://lichess.org/broadcast", "Lichess broadcast")}.</p></div>
    <div class="cptabs">${(ko ? [["rounds", "Matches"]] : [["table", "Standings"], ["rounds", "Rounds"]]).map(([k, n]) => `<button class="chip ${(ko ? "rounds" : CH.evTab) === k ? "on" : ""}" type="button" data-evtab="${k}">${n}</button>`).join("")}</div><div id="evBody">${ko ? evKOHTML(e) : CH.evTab === "table" ? evTable(e) : evRounds(e)}</div>`;
}
function evTable(e) {
  const first = {}, sum = {}; e.games.forEach((g) => { [g.w, g.b].forEach((p) => { if (!first[p]) first[p] = +(p === g.w ? g.we : g.be); const v = eloDelta(g, p); if (v != null) sum[p] = (sum[p] || 0) + v; }); });
  return `<div class="card"><table class="cpt"><thead><tr><th>#</th><th>Player</th><th title="Rating at the start">Elo</th><th>W</th><th>D</th><th>L</th><th title="Rating change over the event">±</th><th>Pts</th></tr></thead><tbody>${e.table.map(([p, pts, W, D, L], i) => `<tr class="${i === 0 ? "q" : ""}" data-evp="${p}" tabindex="0"><td class="num">${i + 1}</td><td>${cpWho(p)}</td><td class="num">${first[p] || ""}</td><td class="num">${W}</td><td class="num">${D}</td><td class="num">${L}</td><td>${eloTag(sum[p] == null ? null : Math.round(sum[p] * 10) / 10)}</td><td class="num"><b>${pts % 1 ? pts.toFixed(1) : pts}</b></td></tr>`).join("")}</tbody></table></div>`;
}
function evRounds(e) {
  const rounds = [...new Set(e.games.map((g) => (g.st ? g.st + " · " : "") + "Round " + g.rd))];
  const cur = CH.evRound && rounds.includes(CH.evRound) ? CH.evRound : rounds[rounds.length - 1]; CH.evRound = cur;
  const list = e.games.map((g, i) => [g, i]).filter(([g]) => (g.st ? g.st + " · " : "") + "Round " + g.rd === cur);
  return `<div class="chips evrounds">${rounds.map((r) => `<button class="chip ${r === cur ? "on" : ""}" type="button" data-evround="${esc(r)}">${esc(r.replace("Round ", "R"))}</button>`).join("")}</div><div class="cpgames">${list.map(([g, i]) => evGameRow(e, g, i)).join("")}</div>`;
}
function evGameRow(e, g, i) {
  const k = CP_KIND[g.tc] || ["", "clock"], res = g.r === "1/2-1/2" ? "½–½" : g.r === "*" ? "live" : g.r.replace("-", "–");
  return `<button class="evg" type="button" data-cpg="ev:${e.id}|${i}"><span class="evside">${cpWho(g.w)}${eloTag(eloDelta(g, g.w))}</span><span class="evres">${res}<small>${ic(k[1])}${k[0]}</small></span><span class="evside r">${eloTag(eloDelta(g, g.b))}${cpWho(g.b)}</span></button>`;
}
/* knockouts: matches per stage, the match score over every game (classical and tiebreaks), and the winner */
function evKO(e) {
  const stages = []; e.games.forEach((g, i) => { let st = stages.find((x) => x.name === g.st); if (!st) stages.push((st = { name: g.st, m: {} })); const k = [g.w, g.b].sort().join("|"), m = st.m[k] || (st.m[k] = { key: e.id + "§" + g.st + "§" + k, ids: k.split("|"), pts: {}, games: [] }); m.games.push(i); [g.w, g.b].forEach((p) => { m.pts[p] = (m.pts[p] || 0) + (g.r === "1/2-1/2" ? 0.5 : (g.r === "1-0") === (p === g.w) && g.r !== "*" ? 1 : 0); }); m.last = g; });
  stages.forEach((st) => { st.list = Object.values(st.m); st.list.forEach((m) => { const [a, b] = m.ids; m.win = m.pts[a] !== m.pts[b] ? (m.pts[a] > m.pts[b] ? a : b) : null; if (!m.win) { for (let k = m.games.length - 1; k >= 0; k--) { const g = e.games[m.games[k]]; if (g.r === "1-0") { m.win = g.w; break; } if (g.r === "0-1") { m.win = g.b; break; } } } }); });
  const fin = stages[stages.length - 1], semi = stages[stages.length - 2];
  if (fin && semi && fin.list.length === 2) { const sw = new Set(semi.list.map((m) => m.win)); fin.list.sort((x, y) => (y.ids.every((p) => sw.has(p)) ? 1 : 0) - (x.ids.every((p) => sw.has(p)) ? 1 : 0)); fin.list[0].label = "Final"; fin.list[1].label = "Third place"; }
  return stages;
}
function evKOHTML(e) {
  const stages = evKO(e);
  return `<div class="kocols">${stages.map((st) => `<div class="kocol"><span class="cplab2">${esc(st.name)}</span>${st.list.map((m) => `<button class="cpmatch" type="button" data-evm="${esc(m.key)}">${m.label ? `<span class="cplab">${m.label}</span>` : ""}${m.ids.map((p) => { const w = e.koWin && m.win === p; return `<span class="cpmrow ${w ? "win" : ""}">${cpFace(cpP(p))}<span class="cpnm">${cpFlag(cpP(p))}${esc(cpName(cpP(p)))}</span><span class="num kosc">${m.pts[p] % 1 ? m.pts[p].toFixed(1) : m.pts[p]}</span>${w && m.label === "Final" ? ic("trophy") : ""}</span>`; }).join("")}</button>`).join("")}</div>`).join("")}</div>${e.koWin ? "" : '<p class="fine">Match scores count every game equally; the event\'s own scoring weights classical, rapid and blitz differently, so no winner is marked here.</p>'}`;
}
function evMatchSheet(key) {
  const [eid, stn, pair] = key.split("§"), e = evById(eid); if (!e) return; const m = evKO(e).find((x) => x.name === stn).m[pair], [a, b] = m.ids;
  cpSheet(`<div class="cpvsrow sm">${[a, b].map((id, k) => (k ? '<span class="cpvsbig">VS</span>' : "") + `<button class="cpside" type="button" data-cpprof="${RK.players[id] ? id : ""}" ${RK.players[id] ? "" : "disabled"}>${cpFace(cpP(id), "big")}<b>${esc(cpName(cpP(id)))}</b><span class="rktile" style="padding:4px 12px"><b class="num">${m.pts[id] % 1 ? m.pts[id].toFixed(1) : m.pts[id]}</b></span></button>`).join("")}</div><h4 class="cpsh">${esc(e.name)} · ${esc(stn)}${m.label ? " · " + m.label : ""}<span class="fine">${m.games.length} games</span></h4><div class="cpgames">${m.games.map((i) => evGameRow(e, e.games[i], i)).join("")}</div>`);
}
function evPlayer(eid, pid) {
  const e = evById(eid), p = cpP(pid); if (!e || !p) return; const mine = e.games.map((g, i) => [g, i]).filter(([g]) => g.w === pid || g.b === pid);
  const rec = { W: 0, D: 0, L: 0 }; let tot = 0; mine.forEach(([g]) => { const r = cpRes(g, pid); if (r && g.tc !== "armageddon") rec[r]++; const v = eloDelta(g, pid); if (v != null) tot += v; });
  const row = e.table.findIndex((r) => r[0] === pid);
  cpSheet(`<div class="cphead">${cpFace(p, "big")}<div><h2>${esc(cpName(p))}</h2><div class="cpmeta">${cpFed(p)}${p.t ? " · " + p.t : ""}</div><div class="cprat">${row >= 0 ? `<span><b class="num">${row + 1}</b><small>Place</small></span>` : ""}<span><b class="num">${rec.W}-${rec.D}-${rec.L}</b><small>W-D-L</small></span><span><b class="num">${tot > 0 ? "+" : ""}${tot.toFixed(1)}</b><small>Rating</small></span></div></div></div>
    <h4 class="cpsh">${esc(e.name)}<span class="fine">${mine.length} games</span></h4><div class="cpgames">${mine.slice().reverse().map(([g, i]) => { const r = cpRes(g, pid), opp = g.w === pid ? g.b : g.w, kk = CP_KIND[g.tc] || ["", "clock"]; return `<button class="cpgame" type="button" data-cpg="ev:${e.id}|${i}"><span class="cpres r${r}">${r === "W" ? "Win" : r === "D" ? "Draw" : r === "L" ? "Loss" : "…"}</span><span class="cpcol2">${cpWho(opp)}<span class="fine">${g.st ? esc(g.st) + " · " : ""}round ${esc(g.rd)} · ${ic(kk[1])}${kk[0]} · ${g.w === pid ? "White" : "Black"}</span></span>${eloTag(eloDelta(g, pid))}${ic("arrow")}</button>`; }).join("")}</div>
    ${RK.players[pid] ? `<button class="btn cpprof" type="button" data-cpprof="${pid}">${ic("user")}Full profile, ratings and history</button>` : ""}${p.cr ? `<p class="fine cpcredit">Photo: ${esc(p.cr.replace(/<[^>]*>/g, ""))}</p>` : ""}`);
}
document.addEventListener("click", (ev) => {
  if (st.game !== "champ") return; const t = ev.target.closest && ev.target.closest("[data-evtab],[data-evround],[data-evp],[data-evm]"); if (!t) return; if (t.dataset.evm) return evMatchSheet(t.dataset.evm);
  const e = evById(CH.ev); if (!e) return;
  if (t.dataset.evtab) { CH.evTab = t.dataset.evtab; document.querySelectorAll("[data-evtab]").forEach((x) => x.classList.toggle("on", x === t)); $("#evBody").innerHTML = CH.evTab === "table" ? evTable(e) : evRounds(e); return; }
  if (t.dataset.evround) { CH.evRound = t.dataset.evround; $("#evBody").innerHTML = evRounds(e); return; }
  if (t.dataset.evp) return evPlayer(e.id, t.dataset.evp);
});

/* ---------- head-to-head: any two players, every game between them that this site has ---------- */
function h2hGames(a, b) {
  const out = [], pa = cpP(a), pb = cpP(b);
  EVS.forEach((e) => e.games.forEach((g, i) => { if ((g.w === a && g.b === b) || (g.w === b && g.b === a)) out.push({ d: g.d || e.from || "", ev: e.name + (g.st ? " · " + g.st : ""), w: g.w, r: g.r, tc: g.tc, ref: "ev:" + e.id + "|" + i }); }));
  CP.stages.forEach((s) => s.games.forEach((g, i) => { if ((g.w === a && g.b === b) || (g.w === b && g.b === a)) out.push({ d: (g.d || "").replace(/\./g, "-"), ev: "Total Chess · " + s.name, w: g.w, r: g.r, tc: g.tc, ref: s.id + "|" + i }); }));
  const ia = LKIDX.get(rkKey(cpName(pa))), ib = LKIDX.get(rkKey(cpName(pb)));
  if (ia != null && ib != null) LKG.forEach((g) => { if ((g[2] === ia && g[3] === ib) || (g[2] === ib && g[3] === ia)) out.push({ d: g[1] || "", ev: LKE[g[0]].n, w: g[2] === ia ? a : b, r: g[4] === 2 ? "1/2-1/2" : g[4] === 1 ? "1-0" : "0-1", tc: /Blitz/i.test(LKE[g[0]].kind + LKE[g[0]].n) ? "blitz" : /Rapid/i.test(LKE[g[0]].kind + LKE[g[0]].n) ? "rapid" : "classical" }); });
  return out.sort((x, y) => (x.d < y.d ? 1 : -1));
}
function h2hChart(pa, pb) {
  const ha = (pa.h || []).filter((x) => x[1]), hb = (pb.h || []).filter((x) => x[1]); if (ha.length < 3 || hb.length < 3) return "";
  const from = ha[0][0] > hb[0][0] ? ha[0][0] : hb[0][0], A = ha.filter((x) => x[0] >= from), B = hb.filter((x) => x[0] >= from); if (A.length < 3 || B.length < 3) return "";
  const months = [...new Set([...A, ...B].map((x) => x[0]))].sort(), idx = new Map(months.map((m, k) => [m, k])), vals = [...A, ...B].map((x) => x[1]);
  const W = 640, H = 190, lo = Math.floor((Math.min(...vals) - 20) / 50) * 50, hi = Math.ceil((Math.max(...vals) + 20) / 50) * 50, X = (m) => 34 + (idx.get(m) / Math.max(1, months.length - 1)) * (W - 44), Y = (v) => 10 + (1 - (v - lo) / (hi - lo)) * (H - 32);
  const line = (L) => L.map((x) => `${X(x[0]).toFixed(1)},${Y(x[1]).toFixed(1)}`).join(" "), years = [...new Set(months.map((m) => m.slice(0, 4)))], step = Math.ceil(years.length / 7);
  return `<svg class="rkchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rating histories">${[lo, (lo + hi) / 2, hi].map((v) => `<line x1="34" x2="${W - 10}" y1="${Y(v)}" y2="${Y(v)}" class="rkgl"/><text x="28" y="${Y(v) + 4}" class="rkax" text-anchor="end">${Math.round(v)}</text>`).join("")}${years.filter((_, k) => k % step === 0).map((y) => `<text x="${X(months.find((m) => m.startsWith(y)))}" y="${H - 6}" class="rkax" text-anchor="middle">${y}</text>`).join("")}<polyline points="${line(A)}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linejoin="round"/><polyline points="${line(B)}" fill="none" stroke="var(--ok)" stroke-width="2.5" stroke-linejoin="round"/></svg><div class="h2hleg"><span><i style="background:var(--gold)"></i>${esc(cpName(pa))}</span><span><i style="background:var(--ok)"></i>${esc(cpName(pb))}</span></div>`;
}
function h2hPage(a, b) {
  const pa = RK.players[a] || cpP(a), pb = RK.players[b] || cpP(b); /* the rankings copy carries the rating history */ if (!pa || !pb) return; rvStop(); olClose(); clearInterval(st.timer); live = null; cpClose(); st = { game: "rank", h2h: [a, b] }; RKS.prof = a;
  const G = h2hGames(a, b), rec = { W: 0, D: 0, L: 0 }; G.forEach((g) => { if (g.r === "*" || g.tc === "armageddon") return; const r = g.r === "1/2-1/2" ? "D" : (g.r === "1-0") === (g.w === a) ? "W" : "L"; rec[r]++; });
  const n = rec.W + rec.D + rec.L, rows = [["Classical", "std"], ["Rapid", "rap"], ["Blitz", "blz"], ["Peak", "peak"]].filter(([, k]) => pa[k] || pb[k]).map(([lab, k]) => [lab, pa[k], pb[k]]);
  const rankOf = (id) => { const r = (RK.lists.open || []).find((x) => x[1] === id) || (RK.lists.women || []).find((x) => x[1] === id); return r ? r[0] : null; };
  rows.push(["World rank", rankOf(a), rankOf(b), true], ["Age", rkAge(pa), rkAge(pb), true]);
  const cell = (v, o, low) => `<td class="${v != null && o != null && v !== o && (low ? v < o : v > o) ? "better" : ""}">${v == null ? "—" : v}</td>`;
  $("#app").className = "fresh";
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-rkp="${a}">← ${esc(cpName(pa))}</button></div>
    <div class="card cphero"><h2>Head to head</h2><div class="cpvsrow">${[a, b].map((id, k) => (k ? '<span class="cpvsbig">VS</span>' : "") + `<button class="cpside" type="button" data-rkp="${id}">${cpFace(cpP(id), "big")}<b>${esc(cpName(cpP(id)))}</b><span class="cpmeta">${cpFed(cpP(id))}</span></button>`).join("")}</div>
    ${n ? `<div class="h2hrec"><span class="sW"><b class="num">${rec.W}</b><small>${esc(cpName(pa).split(" ").pop())} wins</small></span><span class="sD"><b class="num">${rec.D}</b><small>Draws</small></span><span class="sL"><b class="num">${rec.L}</b><small>${esc(cpName(pb).split(" ").pop())} wins</small></span></div><div class="h2hbar"><i style="flex:${rec.W || 0.001};background:var(--gold)"></i><i style="flex:${rec.D || 0.001};background:var(--muted)"></i><i style="flex:${rec.L || 0.001};background:var(--ok)"></i></div>` : `<p class="fine">No games between them in this site's records (the 2025 and 2026 events, Total Chess and the elite-games archive).</p>`}</div>
    <div class="card"><table class="rvph h2ht"><tr><th></th><th>${esc(cpName(pa))}</th><th>${esc(cpName(pb))}</th></tr>${rows.map(([l, x, y, low]) => `<tr><td>${l}</td>${cell(x, y, low)}${cell(y, x, low)}</tr>`).join("")}</table></div>
    ${h2hChart(pa, pb) ? `<div class="card" style="margin-top:12px"><h3 style="margin:0 0 4px">${ic("chart")}Classical rating, side by side</h3>${h2hChart(pa, pb)}</div>` : ""}
    ${G.length ? `<h3 class="rksh">${ic("swords")}Their games</h3><div class="cpgames">${G.map((g) => { const r = g.r === "1/2-1/2" ? "D" : g.r === "*" ? "" : (g.r === "1-0") === (g.w === a) ? "W" : "L", k = CP_KIND[g.tc] || ["", "clock"]; return `<${g.ref ? `button type="button" data-cpg="${g.ref}"` : "div"} class="cpgame ${g.ref ? "" : "static"}"><span class="cpres r${r}">${r === "W" ? esc(cpName(pa).split(" ").pop()) : r === "L" ? esc(cpName(pb).split(" ").pop()) : r === "D" ? "Draw" : "…"}</span><span class="cpcol2"><b>${esc(g.ev)}</b><span class="fine">${esc(g.d)} · ${ic(k[1])}${k[0]} · ${esc(cpName(cpP(g.w)))} had White</span></span>${g.ref ? ic("arrow") : ""}</${g.ref ? "button" : "div"}>`; }).join("")}</div>` : ""}`;
  scrollTo({ top: 0, behavior: "instant" });
}
function h2hPick(a) {
  const all = Object.values(RK.players).filter((p) => p.id !== a).sort((x, y) => (y.std || 0) - (x.std || 0));
  cpSheet(`<h3>${ic("swords")}Compare ${esc(cpName(cpP(a)))} with…</h3><input class="t" id="h2hQ" placeholder="Find a player" autocomplete="off" style="width:100%;margin:6px 0 10px"><div class="cpgames" id="h2hL" data-a="${a}">${h2hList(all, "")}</div>`);
  setTimeout(() => { const q = document.getElementById("h2hQ"); if (q) q.focus(); }, 50);
}
const h2hList = (all, q) => all.filter((p) => !q || norm(cpName(p)).includes(norm(q))).slice(0, 40).map((p) => `<button class="cpgame" type="button" data-h2hb="${p.id}">${cpWho(p.id, `<small class="fine"> · ${p.std || ""}</small>`)}${ic("arrow")}</button>`).join("");
document.addEventListener("input", (e) => { if (e.target.id === "h2hQ") { const L = document.getElementById("h2hL"), a = L.dataset.a; L.innerHTML = h2hList(Object.values(RK.players).filter((p) => p.id !== a).sort((x, y) => (y.std || 0) - (x.std || 0)), e.target.value); } });
document.addEventListener("click", (e) => { const t = e.target.closest && e.target.closest("[data-h2ha],[data-h2hb]"); if (!t) return; if (t.dataset.h2ha) return h2hPick(t.dataset.h2ha); const a = document.getElementById("h2hL").dataset.a; return h2hPage(a, t.dataset.h2hb); });

/* ---------- live board for a broadcast (the World Championship): board, eval bar, clocks, moves, Pip ----------
   Lichess puts Stockfish's evaluation and both clocks in every broadcast move ([%eval] [%clk]); the page polls the
   round's PGN every 15 seconds while it is being played. */
function liParse(pgn) {
  const h = Object.fromEntries([...pgn.matchAll(/^\[(\w+) "(.*)"\]$/gm)].map((m) => [m[1], m[2]])), body = pgn.replace(/^\[.*\]$/gm, " "), mv = [];
  for (const m of body.matchAll(/(\{[^}]*\})|(\d+\.(?:\.\.)?)|([^\s{}]+)/g)) {
    if (m[1]) { const L = mv[mv.length - 1]; if (!L) continue; const e = m[1].match(/%eval ([#\-\d.]+)/), c = m[1].match(/%clk ([\d:]+)/); if (e) L.ev = e[1]; if (c) L.clk = c[1]; }
    else if (m[3] && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(m[3])) mv.push({ san: m[3] });
  }
  return { h, mv };
}
const liCp = (e) => (e == null ? null : e[0] === "#" ? (e[1] === "-" ? -MATE_CP : MATE_CP) : Math.round(parseFloat(e) * 100));
let WL = null;
async function wccLive(tourId, el) {
  if (!el) return; el.innerHTML = `<p class="fine"><span class="spin"></span> Checking the live board…</p>`;
  try {
    const d = await liJson(`${LI}/${tourId}`), rounds = d.rounds || [], now = Date.now();
    const on = rounds.find((r) => r.ongoing), done = rounds.filter((r) => r.finished), next = rounds.find((r) => !r.finished && !r.ongoing && r.startsAt > now);
    const pick = on || done[done.length - 1];
    if (!pick) { const t = next ? next.startsAt - now : 0, dd = Math.floor(t / 864e5), hh = Math.floor((t % 864e5) / 36e5), mm = Math.floor((t % 36e5) / 6e4); el.innerHTML = `<div class="lvsoon">${pipSVG("happy")}<div><b>${next ? esc(next.name) + " starts in" : "No game yet"}</b>${next ? `<div class="lvcount num">${dd}d ${hh}h ${mm}m</div><span class="fine">${new Date(next.startsAt).toLocaleString([], { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</span>` : ""}<p class="fine">When it starts, this board goes live: moves, clocks, Stockfish's evaluation and Pip's take, every 15 seconds.</p></div></div>`; return; }
    await wccShow(pick.id, pick.name, !!pick.ongoing, el);
  } catch (e) { el.innerHTML = `<p class="fine">Could not reach Lichess for the live board.</p>`; }
}
async function wccShow(roundId, name, ongoing, el, board = 0) {
  clearInterval(WL && WL.timer); const keep = WL && WL.round === roundId && WL.ply != null && WL.ply < WL.g.mv.length ? WL.ply : null;
  const txt = await (await fetch(`${LI}/round/${roundId}.pgn`)).text(), games = txt.split(/\n\n(?=\[Event )/).map((x) => x.trim()).filter(Boolean).map(liParse);
  if (!games.length) { el.innerHTML = `<p class="fine">${esc(name)}: no moves yet.</p>`; return; }
  WL = { round: roundId, name, ongoing, games, board: Math.min(board, games.length - 1), el, timer: null }; WL.g = WL.games[WL.board]; WL.ply = keep != null ? keep : null;
  wccPaint();
  if (ongoing) WL.timer = setInterval(() => { if (!document.body.contains(el)) return clearInterval(WL.timer); wccShow(roundId, name, true, el, WL.board).catch(() => {}); }, 15000);
}
function wccPaint() {
  const { g, el } = WL, N = g.mv.length, ply = WL.ply == null ? N : WL.ply, c = new Chess(), fens = [c.fen()], moves = [];
  for (const m of g.mv) { const r = c.move(m.san, { sloppy: true }); if (!r) break; moves.push(r); fens.push(c.fen()); }
  const show = new Chess(fens[Math.min(ply, fens.length - 1)]), cur = g.mv[ply - 1], cp = cur ? liCp(cur.ev) : 20, W = cp == null ? 50 : wpct(cp);
  const prev = ply > 1 ? liCp(g.mv[ply - 2].ev) : 20, white = ply % 2 === 1, pov = (x) => (white ? x : 100 - x), loss = cur && cp != null && prev != null ? Math.max(0, pov(wpct(prev)) - pov(wpct(cp))) : 0;
  const cls = !cur ? "start" : cur.san.endsWith("#") ? "mate" : loss < 2 ? "good" : loss < 6 ? "excellent" : loss < 11 ? "inaccuracy" : loss < 21 ? "mistake" : "blunder";
  const clkOf = (side) => { for (let k = ply - 1; k >= 0; k--) if ((k % 2 === 0) === (side === "White") && g.mv[k].clk) return g.mv[k].clk; return ""; };
  const who = (k) => { const id = g.h[k + "FideId"], p = id ? cpP(id) : null; return `<div class="lvp">${p ? cpFace(p) : ""}<b>${esc(p ? cpName(p) : (g.h[k] || k))}</b>${g.h[k + "Elo"] ? `<small class="fine">${g.h[k + "Elo"]}</small>` : ""}<span class="lvclk num">${esc(clkOf(k))}</span></div>`; };
  const res = g.h.Result && g.h.Result !== "*" ? g.h.Result.replace("1/2-1/2", "½–½") : WL.ongoing ? "LIVE" : "";
  el.innerHTML = `<div class="lvhead"><b>${esc(WL.name)}</b>${res ? `<span class="lvbadge ${res === "LIVE" ? "on" : ""}">${res === "LIVE" ? "● LIVE" : res}</span>` : ""}${WL.games.length > 1 ? `<div class="chips">${WL.games.map((x, k) => `<button class="chip ${k === WL.board ? "on" : ""}" type="button" data-lvb="${k}">${esc((x.h.White || "").split(",")[0])}–${esc((x.h.Black || "").split(",")[0])}</button>`).join("")}</div>` : ""}</div>
    <div class="lvgrid"><div>${who("Black")}<div class="rvbd"><div class="evv" title="Stockfish's evaluation, from the broadcast"><i style="height:${W}%"></i><b class="evl ${W >= 50 ? "bot onw" : "top onb"}">${cur && cur.ev ? (cur.ev[0] === "#" ? "M" + cur.ev.replace("#", "").replace("-", "") : (cp > 0 ? "+" : "") + (cp / 100).toFixed(1)) : "0.0"}</b></div><div class="lvwrap">${boardHTML(show, { last: ply ? [moves[ply - 1].from, moves[ply - 1].to] : null })}</div></div>${who("White")}
    <div class="rvbtns"><button class="btn ghost" data-lvp="0" type="button">⏮</button><button class="btn ghost" data-lvp="${ply - 1}" type="button">◀</button><button class="btn ghost" data-lvp="${ply + 1}" type="button">▶</button><button class="btn" data-lvp="${N}" type="button">${WL.ongoing ? "Latest" : "⏭"}</button></div></div>
    <div><div class="pipbox">${pipSVG(PIP_MOOD[cls] || "calm")}<div class="pipsay"><b>${esc(coachName())}</b>${esc(cur ? `${Math.ceil(ply / 2)}${white ? "." : "..."} ${cur.san}. ` + pipPick(cls, ply) : PIP.start[1])}</div></div>
    <div class="rvlist lvmoves">${Array.from({ length: Math.ceil(N / 2) }, (_, k) => `<div class="rvrow"><span class="n">${k + 1}</span>${[0, 1].map((s) => { const p = k * 2 + s + 1; return p <= N ? `<span class="m ${p === ply ? "cur" : ""}" data-lvp="${p}">${esc(g.mv[p - 1].san)}</span>` : "<span></span>"; }).join("")}</div>`).join("")}</div>
    <div class="row" style="margin-top:10px">${N > 1 ? `<button class="btn" data-lvrev type="button">${ic("chart")}Full review</button>` : ""}${!show.game_over() ? `<button class="btn ghost" data-lvplay type="button">${ic("robot")}Play from here vs Stockfish</button>` : ""}</div></div></div>`;
  const ml = el.querySelector(".lvmoves .cur"); if (ml) ml.scrollIntoView({ block: "nearest" });
}
document.addEventListener("click", (e) => {
  if (!WL || !WL.el || !document.body.contains(WL.el)) return; const t = e.target.closest && e.target.closest("[data-lvp],[data-lvb],[data-lvrev],[data-lvplay]"); if (!t || !WL.el.contains(t)) return;
  if (t.dataset.lvp != null) { WL.ply = Math.max(0, Math.min(WL.g.mv.length, +t.dataset.lvp)); if (WL.ply === WL.g.mv.length) WL.ply = null; return wccPaint(); }
  if (t.dataset.lvb != null) { WL.board = +t.dataset.lvb; WL.g = WL.games[WL.board]; WL.ply = null; return wccPaint(); }
  if (t.dataset.lvplay != null) { clearInterval(WL.timer); const c = new Chess(); const n = WL.ply == null ? WL.g.mv.length : WL.ply; for (let k = 0; k < n; k++) if (!c.move(WL.g.mv[k].san, { sloppy: true })) break; st.clock = 0; return aiStart(6, c.turn(), c.fen()); }
  if (t.dataset.lvrev != null) { clearInterval(WL.timer); const g = WL.g, c = new Chess(); const sans = []; for (const m of g.mv) { if (!c.move(m.san, { sloppy: true })) break; sans.push(m.san); } reviewStart(sans, "w", { from: "champ", names: [g.h.White || "White", g.h.Black || "Black"], result: g.h.Result }); }
});

/* ---------- Simulate a match: you against anyone, 1,000 games ----------
   Win chances come from the Elo formula; draw rates come from real games at the same level, speed and rating gap
   (src/84: 810,453 Lichess games for club level, elite events above 2600). Lichess, chess.com and FIDE ratings are
   different scales, so a number is treated as a number. */
const SIMT = (DATA.sim || { table: {} }).table;
const SIM_TC = [["Classical", "std", "Classical"], ["Rapid", "rap", "Rapid"], ["Blitz", "blz", "Blitz"]];
let SIM = { tc: 0, me: null, opp: null, res: null };
function simCell(speed, avg, gapAbs) {
  const t = SIMT[speed] || {}, gaps = [800, 500, 250, 100, 0], gb = String(gaps.find((g) => g <= gapAbs) || 0), pts = [];
  Object.entries(t).forEach(([bd, row]) => { const c = row[gb] || row[Object.keys(row).sort((a, b) => Math.abs(+a - +gb) - Math.abs(+b - +gb))[0]]; if (c) pts.push([+bd + 100, c[2]]); });
  pts.sort((a, b) => a[0] - b[0]); if (!pts.length) return 0.06;
  if (avg <= pts[0][0]) return pts[0][1]; if (avg >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let k = 1; k < pts.length; k++) if (avg <= pts[k][0]) { const [a0, d0] = pts[k - 1], [a1, d1] = pts[k]; return d0 + (d1 - d0) * (avg - a0) / (a1 - a0); }
  return 0.06;
}
function simProbs(me, opp, speed, meWhite) {
  const adv = meWhite ? 20 : -20, E = 1 / (1 + Math.pow(10, (opp - me - adv) / 400)), D = Math.min(simCell(speed, (me + opp) / 2, Math.abs(me - opp)), 2 * Math.min(E, 1 - E));
  return [Math.max(0, E - D / 2), D, Math.max(0, 1 - E - D / 2)];
}
function simRun(me, opp, speed, n = 1000) {
  const out = []; let W = 0, D = 0, L = 0;
  for (let k = 0; k < n; k++) { const [w, d] = simProbs(me, opp, speed, k % 2 === 0), r = Math.random(); const x = r < w ? "W" : r < w + d ? "D" : "L"; out.push(x); if (x === "W") W++; else if (x === "D") D++; else L++; }
  const reps = []; for (let k = 0; k < 300; k++) { let w = 0; for (let j = 0; j < n; j++) { const [pw] = simProbs(me, opp, speed, j % 2 === 0); if (Math.random() < pw) w++; } reps.push(w); } reps.sort((a, b) => a - b);
  return { out, W, D, L, lo: reps[Math.floor(reps.length * 0.05)], hi: reps[Math.floor(reps.length * 0.95)], exp: Math.round(n * (simProbs(me, opp, speed, true)[0] + simProbs(me, opp, speed, false)[0]) / 2) };
}
async function simFetch(site, user, key) {
  user = user.trim(); if (!/^[\w-]{2,30}$/.test(user)) return { error: "That doesn't look like a username." };
  try {
    if (site === "li") { const r = await fetch(`https://lichess.org/api/user/${encodeURIComponent(user)}`); if (!r.ok) throw 0; const j = await r.json(), p = j.perfs || {}; const v = (p[{ std: "classical", rap: "rapid", blz: "blitz" }[key]] || p.rapid || p.blitz || {}).rating; return v ? { name: j.username, rating: v, note: "Lichess" } : { error: "No rating in that time control." }; }
    const r = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/stats`); if (!r.ok) throw 0; const j = await r.json(), k = { std: "chess_rapid", rap: "chess_rapid", blz: "chess_blitz" }[key], v = ((j[k] || j.chess_rapid || j.chess_blitz || {}).last || {}).rating; return v ? { name: user, rating: v, note: "chess.com" } : { error: "No rating in that time control." };
  } catch (e) { return { error: "Could not find that player." }; }
}
function simPage() {
  rvStop(); clearInterval(st.timer); live = null; st = { game: "sim" }; const [tcName, tcKey] = SIM_TC[SIM.tc];
  const side = (who, label) => { const p = who && who.fid ? cpP(who.fid) || RK.players[who.fid] : null; return `<div class="simside"><span class="cprole">${label}</span>${p ? cpFace(p, "big") : `<span class="cpf big" data-i="${who ? esc((who.name || "?").slice(0, 2).toUpperCase()) : "?"}"></span>`}<b>${who ? esc(who.name) : "Not picked yet"}</b>${who ? `<span class="rkr num">${who.rating}</span><span class="fine">${esc(who.note || tcName)}</span>` : ""}</div>`; };
  $("#app").className = "fresh";
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="games">← Games</button></div><div class="card cphero"><h2>${ic("swords")}Simulate a match</h2><p class="sub">Pick an opponent, from the world's top 100 or any Lichess or chess.com player, and play 1,000 games against them in a second.</p>
    <div class="chips" style="justify-content:center">${SIM_TC.map(([n], i) => `<button class="chip ${i === SIM.tc ? "on" : ""}" type="button" data-simtc="${i}">${n}</button>`).join("")}</div>
    <div class="cpvsrow">${side(SIM.me, "You")}<span class="cpvsbig">VS</span>${side(SIM.opp, "Opponent")}</div>
    <div class="simgo"><button class="btn" type="button" id="simGo" ${SIM.me && SIM.opp ? "" : "disabled"}>${ic("bolt")}Play 1,000 games</button></div></div>
    <div id="simOut"></div>
    <div class="simpick"><div class="card"><h3>${ic("user")}You</h3><div class="row"><input class="t" id="simMeR" aria-label="Your rating" type="number" min="100" max="3500" placeholder="Your rating" value="${SIM.me ? SIM.me.rating : ""}" style="max-width:140px"><button class="btn ghost" type="button" data-simme="num">Use this rating</button></div><p class="fine">Or fetch it:</p><div class="row"><input class="t" id="simMeU" aria-label="Your Lichess or chess.com username" placeholder="Your username" value="${esc((impUser() || {}).user || "")}" style="flex:1;min-width:120px"><button class="chip" type="button" data-simme="li">Lichess</button><button class="chip" type="button" data-simme="cc">Chess.com</button></div><p class="fine" id="simMeMsg"></p></div>
    <div class="card"><h3>${ic("trophy")}Opponent</h3><div class="row"><input class="t" id="simOppU" aria-label="Opponent's Lichess or chess.com username" placeholder="Any username" style="flex:1;min-width:120px"><button class="chip" type="button" data-simopp="li">Lichess</button><button class="chip" type="button" data-simopp="cc">Chess.com</button></div><p class="fine" id="simOppMsg"></p><input class="t" id="simQ" aria-label="Search for a player" placeholder="Or find a top-100 player" autocomplete="off" style="width:100%;margin:6px 0"><div class="cpgames simlist" id="simList">${simList("")}</div></div></div>
    <p class="fine" style="margin-top:10px">How it works: your chances in each game come from the Elo formula (with a small edge for White, colours alternating); draw rates come from real games at the same level, speed and rating gap (810,453 Lichess games, plus elite events above 2600). Lichess, chess.com and FIDE ratings are different scales, so mixing them is only a rough guide.</p>`;
  if (SIM.res) simShow();
}
const simList = (q) => { const [, k] = SIM_TC[SIM.tc], rows = [...(RK.lists[{ std: "open", rap: "open_rapid", blz: "open_blitz" }[k]] || []), ...(RK.lists[{ std: "women", rap: "women_rapid", blz: "women_blitz" }[k]] || [])]; const seen = new Set(); return rows.filter((r) => { if (seen.has(r[1])) return false; seen.add(r[1]); const p = RK.players[r[1]]; return p && (!q || norm(cpName(p)).includes(norm(q))); }).sort((a, b) => b[2] - a[2]).slice(0, 30).map((r) => `<button class="cpgame" type="button" data-simfide="${r[1]}">${cpWho(r[1], `<small class="fine"> · ${r[2]}</small>`)}${ic("arrow")}</button>`).join(""); };
function simShow() {
  const el = $("#simOut"), R = SIM.res; if (!el || !R) return; const me = SIM.me, op = SIM.opp, mePts = R.W + R.D / 2;
  const verdict = R.W === 0 && R.D === 0 ? `A player rated ${me.rating} loses all 1,000 games against ${op.rating}.` : `A player rated ${me.rating} would win about ${R.exp} of 1,000 games against ${op.rating}${R.lo !== R.hi ? ` (anywhere from ${R.lo} to ${R.hi} in 9 matches out of 10)` : ""}.`;
  const mood = mePts > 500 ? "wow" : mePts > 300 ? "happy" : mePts > 50 ? "calm" : "sad";
  el.innerHTML = `<div class="card simres"><div class="simnums"><span class="sW"><b class="num" data-to="${R.W}">0</b><small>Wins</small></span><span class="sD"><b class="num" data-to="${R.D}">0</b><small>Draws</small></span><span class="sL"><b class="num" data-to="${R.L}">0</b><small>Losses</small></span></div>
    <div class="h2hbar"><i style="flex:${R.W || 0.001};background:var(--ok)"></i><i style="flex:${R.D || 0.001};background:var(--muted)"></i><i style="flex:${R.L || 0.001};background:var(--bad)"></i></div>
    <div class="simgrid" id="simGrid"></div><p class="sub" style="text-align:center;margin:10px 0 0"><b>${esc(verdict)}</b></p>
    <div class="pipbox" style="margin-top:10px">${pipSVG(mood)}<div class="pipsay"><b>${esc(coachName())}</b>${esc(simLine(mePts, op))}</div></div></div>`;
  const g = $("#simGrid"); let k = 0; const step = () => { if (!g || !document.body.contains(g)) return; let h = ""; for (let j = 0; j < 50 && k < R.out.length; j++, k++) h += `<i class="r${R.out[k]}"></i>`; g.insertAdjacentHTML("beforeend", h); if (k < R.out.length) requestAnimationFrame(step); }; step();
  el.querySelectorAll("[data-to]").forEach((b) => { const to = +b.dataset.to, t0 = performance.now(); (function f(t) { const q = Math.min(1, (t - t0) / 900); b.textContent = Math.round(to * (1 - Math.pow(1 - q, 3))); if (q < 1) requestAnimationFrame(f); })(t0); });
  if (mePts > 500) CFX.end(true);
}
function simLine(pts, op) {
  if (pts >= 700) return "You'd crush them. Maybe it's time to find a tougher opponent. Or a mirror.";
  if (pts >= 500) return "You'd come out on top. Not by much, but a win is a win.";
  if (pts >= 300) return "A real fight. You'd take plenty of games off them. That's how you get better.";
  if (pts >= 50) return "Tough. But every win in there is a story you'd tell for years.";
  if (pts >= 1) return `A handful of games out of a thousand. Against ${op.name}, honestly, that's something.`;
  return "Zero. Not one. But every player at the top started exactly where you are now.";
}
document.addEventListener("click", async (e) => {
  if (st.game !== "sim") return; const t = e.target.closest && e.target.closest("[data-simtc],[data-simme],[data-simopp],[data-simfide],#simGo"); if (!t) return; const [, key] = SIM_TC[SIM.tc];
  if (t.dataset.simtc) { SIM.tc = +t.dataset.simtc; SIM.res = null; if (SIM.opp && SIM.opp.fid) { const p = RK.players[SIM.opp.fid]; const k2 = SIM_TC[SIM.tc][1]; if (p && p[k2]) SIM.opp.rating = p[k2]; } return simPage(); }
  if (t.dataset.simme) { const m = $("#simMeMsg"); if (t.dataset.simme === "num") { const v = +$("#simMeR").value; if (!(v >= 100 && v <= 3500)) { m.textContent = "Type a rating between 100 and 3500."; return; } SIM.me = { name: "You", rating: v, note: "your rating" }; SIM.res = null; return simPage(); } m.textContent = "Looking it up…"; const r = await simFetch(t.dataset.simme, $("#simMeU").value, key); if (r.error) { m.textContent = r.error; return; } SIM.me = { name: r.name, rating: r.rating, note: r.note }; SIM.res = null; return simPage(); }
  if (t.dataset.simopp) { const m = $("#simOppMsg"); m.textContent = "Looking it up…"; const r = await simFetch(t.dataset.simopp, $("#simOppU").value, key); if (r.error) { m.textContent = r.error; return; } SIM.opp = { name: r.name, rating: r.rating, note: r.note }; SIM.res = null; return simPage(); }
  if (t.dataset.simfide) { const p = RK.players[t.dataset.simfide]; SIM.opp = { fid: t.dataset.simfide, name: cpName(p), rating: p[key] || p.std, note: "FIDE " + SIM_TC[SIM.tc][0].toLowerCase() }; SIM.res = null; return simPage(); }
  if (t.id === "simGo") { if (!SIM.me || !SIM.opp) return; SIM.res = simRun(SIM.me.rating, SIM.opp.rating, SIM_TC[SIM.tc][2]); try { Snd.tick(); } catch (er) { /* quiet */ } simShow(); $("#simOut").scrollIntoView({ behavior: "smooth", block: "start" }); }
});
document.addEventListener("input", (e) => { if (e.target.id === "simQ") $("#simList").innerHTML = simList(e.target.value); });

/* ---------- Learn: an opening explorer (Lichess masters database, live) and short lessons with your coach ---------- */
const OPST = DATA.openstats || {};
let EX = { sans: [], cache: {} };
function learnPage() {
  rvStop(); clearInterval(st.timer); live = null; st = { game: "learn" }; $("#app").className = "fresh";
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="home">← Menu</button></div><h2 style="font-size:32px">${ic("book")}Learn</h2><div class="pipbox">${pipSVG("happy")}<div class="pipsay"><b>${esc(coachName())}</b>${esc(LESSON_HELLO[coachId()] || LESSON_HELLO.pip)}</div></div>
    <div class="cpgrid"><button class="cpcard gpk" type="button" data-go="explorer"><span class="gpki">${ic("compass")}</span><b class="cpcname">Opening explorer</b><span class="fine">Step through any opening and see how masters and club players score with each move, with a fun fact for the big ones.</span></button>
    <button class="cpcard gpk" type="button" data-go="et"><span class="gpki">${ic("crown")}</span><b class="cpcname">Endgame trainer</b><span class="fine">Seven endings every player should know, against Stockfish at full strength. Win them, or hold the draw.</span>${(() => { const n = (typeof ETS !== "undefined" ? ETS : []).filter((e) => store.get("eg_" + e.id, 0)).length; return n ? `<span class="cpwinner">${ic("trophy")}${n} mastered</span>` : '<span class="cpwinner">New</span>'; })()}</button>
    <button class="cpcard gpk" type="button" data-go="famous"><span class="gpki">${ic("book")}</span><b class="cpcname">Guess the famous game</b><span class="fine">Sit in Morphy's chair at the opera, or Fischer's at 13. Guess every move of a classic.</span><span class="cpwinner">New</span></button>
    ${LESSONS.map((l, k) => `<button class="cpcard gpk" type="button" data-lesson="${k}"><span class="gpki">${ic(l.ic)}</span><b class="cpcname">${l.name}</b><span class="fine">${l.tag}</span>${store.get("lesson_" + l.id, 0) ? `<span class="cpwinner">${ic("trophy")}Done: ${store.get("lesson_" + l.id, 0)}/3</span>` : ""}</button>`).join("")}</div>`;
  scrollTo({ top: 0, behavior: "instant" });
}
const LESSON_HELLO = { pip: "Every master started by learning one trick at a time. Pick one. I'll walk it with you.", vera: "Lessons, darling. Short ones. Pick a topic and do try to keep up.", bea: "Choose a lesson. We'll go slowly, and you'll see more than you think." };
const LESSONS = [
  { id: "fork", theme: "fork", ic: "swords", name: "Forks", tag: "One piece attacks two things at once.", intro: "A fork is one piece attacking two things at once. Knights are the kings of forks. Find the move that hits two targets." },
  { id: "pin", theme: "pin", ic: "target", name: "Pins", tag: "Pin a piece to something more valuable behind it.", intro: "A pin freezes a piece, because moving it would expose something more valuable behind it. Find the pin, or use it." },
  { id: "skewer", theme: "skewer", ic: "arrow", name: "Skewers", tag: "Attack the big piece; win the one behind it.", intro: "A skewer is a pin turned around. Attack the valuable piece first, and when it moves, take what was behind it." },
  { id: "disc", theme: "discoveredAttack", ic: "eye", name: "Discovered attacks", tag: "Move one piece to unleash another.", intro: "Move one piece out of the way, and the piece behind it attacks. Two threats from one move. Look for the hidden line." },
  { id: "backrank", theme: "backRankMate", ic: "crown", name: "Back-rank mates", tag: "When the king is trapped behind its own pawns.", intro: "A king hiding behind its own pawns can be mated on the back rank. Find the rook or queen that lands there." },
  { id: "mate1", theme: "mateIn1", ic: "crown", name: "Mate in one", tag: "Find the checkmate. One move.", intro: "Checkmate in one move. Look at every check first. One of them ends the game." },
  { id: "mate2", theme: "mateIn2", ic: "crown", name: "Mate in two", tag: "A forcing move, then checkmate.", intro: "Mate in two. Start with a check or a sacrifice that leaves no choice, then finish it." },
  { id: "sac", theme: "sacrifice", ic: "bolt", name: "Sacrifices", tag: "Give something up to get more back.", intro: "Sometimes you have to give something up to get what you want. Find the sacrifice that breaks the position open." },
  { id: "hang", theme: "hangingPiece", ic: "warn", name: "Free pieces", tag: "Spot what your opponent left unprotected.", intro: "Before anything clever, check for free pieces. Something is unprotected. Take it." },
  { id: "deflect", theme: "deflection", ic: "arrow", name: "Deflection", tag: "Pull a defender away from its job.", intro: "A defender can only do one job. Pull it away with a check or a capture, and what it guarded falls." },
  { id: "promo", theme: "promotion", ic: "crown", name: "Promotion", tag: "Push the pawn all the way.", intro: "A pawn that reaches the end becomes a queen. Usually. Find the way to promote, or to stop it." },
  { id: "pawneg", theme: "pawnEndgame", ic: "puzzle", name: "Pawn endgames", tag: "Kings and pawns, where every tempo counts.", intro: "In pawn endgames, every single move counts. Count carefully, use your king, and look for the breakthrough." },
];
function lessonStart(k) {
  const L = LESSONS[k], pool = PZ.filter((p) => p.themes.includes(L.theme)), pick = [1000, 1400, 1800].map((t) => pool.slice().sort((a, b) => Math.abs(a.rating - t) - Math.abs(b.rating - t))[Math.floor(Math.random() * 4)]).filter(Boolean);
  st = { game: "lesson", L, k, set: pick, i: 0, ok: 0 }; pipSay(L.intro); lessonNext();
}
function lessonNext() { puzzleLoad(st.set[st.i]); st.msg = ""; puzzlePaint(); }
function lessonAfter(pz) {
  st.ok += pz.ok ? 1 : 0; st.i++; const done = st.i >= st.set.length;
  if (done) { store.set("lesson_" + st.L.id, Math.max(store.get("lesson_" + st.L.id, 0), st.ok)); if (st.ok === 3) Snd.end(true); }
  const line = pz.ok ? pipPick(st.ok === 3 && done ? "great_game" : "best", st.i) : pipPick("mistake", st.i);
  liveRender(backRow(st.L.name, st.L.ic, `Puzzle ${Math.min(st.i, 3)} of 3 · ${st.ok} solved`) + `<div class="pipbox">${pipSVG(pz.ok ? "wow" : "sad")}<div class="pipsay"><b>${esc(coachName())}</b>${esc(pz.ok ? line : (st.msg || "") + " " + line)}</div></div>`, `<div class="row">${done ? `<b>${st.ok} of 3.</b><button class="btn" data-lesson="${st.k}" type="button">Again</button><button class="btn ghost" data-go="learn" type="button">All lessons</button>` : `<button class="btn" id="lsnNext" type="button">Next puzzle</button>`}</div>`);
  pipSay(line);
}
const exChess = () => { const c = new Chess(); EX.sans.forEach((m) => c.move(m)); return c; };
const exLast = (c) => { const h = c.history({ verbose: true }), m = h[h.length - 1]; return m ? [m.from, m.to] : null; };
const exNum = (k) => (k % 2 === 0 ? `${k / 2 + 1}.` : "");
async function exFetch(fen) {
  let d = EX.cache[fen]; if (d) return d;
  try { const r = await fetch(`https://explorer.lichess.org/masters?fen=${encodeURIComponent(fen)}&moves=12&topGames=4`); d = r.ok ? await r.json() : null; if (d) EX.cache[fen] = d; } catch (e) { d = null; }
  return d;
}
/* the story tabs: where the name comes from, the idea, the main line (watch it or step into it), fun facts and a famous game */
function exStoryHTML(S) {
  if (!S) return ""; const tab = EX.tab || "name", line = S.line.split(" "), on = EX.sans.length <= line.length && EX.sans.every((m, k) => m === line[k]), G = S.game && OPEN_GAMES[S.game], fk = (EX.fact || 0) % S.facts.length;
  const tabs = [["name", "book", "The name"], ["idea", "bulb", "The idea"], ["line", "arrow", "Main line"], ["facts", "star", `Fun facts`]].concat(G ? [["game", "trophy", "Famous game"]] : []);
  let body;
  if (tab === "name") body = `<p>${esc(S.origin)}</p>`;
  else if (tab === "idea") body = `<p>${esc(S.idea)}</p>`;
  else if (tab === "line") body = `<div class="exml">${line.map((m, k) => `<button type="button" class="exmv ${on && k < EX.sans.length ? "done" : ""} ${on && k === EX.sans.length ? "next" : ""}" data-ex="to:${k + 1}">${exNum(k) ? `<small>${exNum(k)}</small>` : ""}${esc(m)}</button>`).join("")}</div><p class="fine">${on ? (EX.sans.length >= line.length ? "You are at the end of the main line. From here, masters go their own way: check the moves on the right." : `The highlighted move is next. ${line.length - EX.sans.length} moves of theory to go.`) : "You have left this main line. Tap any move to jump back into it."}</p><div class="row"><button class="btn" type="button" data-ex="play">${ic("arrow")}${EX.timer ? "Pause" : on && EX.sans.length >= line.length ? "Replay the main line" : on && EX.sans.length ? "Keep playing it" : "Play the main line"}</button></div>`;
  else if (tab === "facts") body = `<div class="exfact" key="${fk}"><b class="exfn">${fk + 1}/${S.facts.length}</b><p>${esc(S.facts[fk])}</p></div>${S.facts.length > 1 ? `<button class="btn ghost" type="button" data-ex="fact">${ic("star")}Another one</button>` : ""}`;
  else if (tab === "game" && G) body = `<div class="exgame"><div class="exgt">${ic("trophy")}<div><b>${esc(G.title)}</b><span class="fine">${esc(G.who)} · ${esc(G.when)}</span></div></div><p>${esc(G.note)}</p><div class="row"><button class="btn" type="button" data-ex="game:${S.game}">${ic("chart")}Replay it with the coach</button><button class="btn ghost" type="button" data-ex="gamehere:${S.game}">${ic("arrow")}Play it on this board</button></div></div>`;
  return `<div class="exstory"><div class="chips exstabs">${tabs.map(([k, i, n]) => `<button type="button" class="chip ${tab === k ? "on" : ""}" data-ex="tab:${k}">${ic(i)}${n}</button>`).join("")}</div><div class="exsbody">${body}</div></div>`;
}
function exQuizHTML(d) {
  const Q = EX.quiz; if (!Q) return "";
  return `<div class="exquiz"><div class="exqh"><b>${ic("target")}Guess the master move</b><span class="exqs num">${Q.pts} pts · ${Q.n} played${Q.streak >= 2 ? ` · streak ${Q.streak}` : ""}</span></div>${Q.msg ? `<p class="exqmsg ${Q.ok}">${Q.msg}</p>` : `<p class="fine">${d && d.moves.length ? `Play the move you think masters chose most often here, on the board. Top move 3 points, second or third 1 point.` : "Masters never reached this position. Go back or reset."}</p>`}</div>`;
}
async function explorerPage() {
  if (st.game !== "explorer") { rvStop(); clearInterval(st.timer); live = null; st = { game: "explorer" }; }
  const c = exChess(), fen = c.fen(), first = !$("#exApp");
  if (first) {
    $("#app").className = "fresh";
    $("#app").innerHTML = `<div id="exApp"><div class="crumbs"><button class="btn ghost" data-go="learn">← Learn</button></div><div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">${ic("compass")}Opening explorer</h2><button class="btn ghost ${EX.quiz ? "on" : ""}" type="button" data-ex="quiz" id="exQuizBtn">${ic("target")}Guess the master move</button></div><div class="exgrid"><div><div class="lvwrap exboard" id="exBoard"></div><div class="rvbtns"><button class="btn ghost" data-ex="reset" type="button">⏮ Start</button><button class="btn ghost" data-ex="back" type="button" id="exBackBtn">◀ Back</button></div><p class="fine exline" id="exLine"></p></div>
      <div><div id="exName"></div><div id="exStory"></div><div id="exQuiz"></div><div id="exMoves"></div><div id="exTop"></div></div></div><p class="fine">Master games and top games from the ${chLink("https://lichess.org/analysis#explorer", "Lichess opening explorer")} (over-the-board games, 2200+). Club results are from 810,453 rated Lichess games in this site's data. Opening stories, main lines and classic games are written for this site; every line and game is checked move by move.</p></div></div>`;
    scrollTo({ top: 0, behavior: "instant" });
  }
  $("#exQuizBtn").classList.toggle("on", !!EX.quiz);
  $("#exBoard").innerHTML = boardHTML(c, { sel: EX.sel, targets: EX.sel ? c.moves({ square: EX.sel, verbose: true }).map((m) => m.to) : [], last: exLast(c) });
  $("#exBackBtn").disabled = !EX.sans.length; $("#exLine").textContent = EX.sans.length ? pvLineSans(EX.sans) : "The starting position. Pick a move, or open a story below.";
  const S0 = openStory(EX.lastName); setPart("exStory", exStoryHTML(S0));
  if (EX.timer) return;   /* while the main line plays itself, only the board and the line move */
  if (!EX.cache[fen]) { setPart("exMoves", `<p class="fine"><span class="spin"></span> Asking the masters database…</p>`); setPart("exTop", ""); }
  const d = await exFetch(fen); if (st.game !== "explorer" || exChess().fen() !== fen) return;
  if (!d) { setPart("exMoves", `<p class="fine">Could not reach the explorer. Try again in a moment.</p>`); return; }
  const name = (d.opening && d.opening.name) || (EX.sans.length ? EX.lastName || "" : ""); if (name !== EX.lastName) { EX.lastName = name; EX.fact = 0; }
  const fam = name.split(":")[0].trim(), cs = OPST[fam], S = openStory(name);
  setPart("exName", name ? `<h3 style="margin:0 0 4px">${esc(name)}${d.opening && d.opening.eco ? ` <span class="fine">${d.opening.eco}</span>` : ""}</h3>${cs ? `<div class="exclub fine">Club level (${cs[0].toLocaleString()} games, average ${cs[4]}): White ${Math.round(cs[1] * 100)}% · draw ${Math.round(cs[2] * 100)}% · Black ${Math.round(cs[3] * 100)}%</div>` : ""}` : "");
  setPart("exStory", exStoryHTML(S));
  if (S && EX.saidStory !== S.name) { EX.saidStory = S.name; pipSay(S.origin); }
  setPart("exQuiz", exQuizHTML(d));
  const tot = (m) => m.white + m.draws + m.black;
  setPart("exMoves", EX.quiz ? `<div class="extable exhide">${d.moves.slice(0, 5).map(() => `<div class="exrow"><b>?</b><span class="exbar"><i class="d" style="width:100%"></i></span></div>`).join("")}</div>` : d.moves.length ? `<div class="label" style="margin-top:12px">What masters play here</div><div class="extable">${d.moves.map((m) => { const n = tot(m), w = (100 * m.white) / n, dr = (100 * m.draws) / n, b = 100 - w - dr; return `<button class="exrow" type="button" data-exm="${esc(m.san)}"><b>${esc(m.san)}</b><span class="fine num">${n.toLocaleString()}</span><span class="exbar"><i class="w" style="width:${w}%">${w >= 22 ? Math.round(w) + "%" : ""}</i><i class="d" style="width:${dr}%">${dr >= 22 ? Math.round(dr) + "%" : ""}</i><i class="b" style="width:${b}%">${b >= 22 ? Math.round(b) + "%" : ""}</i></span><span class="fine num">${m.averageRating || ""}</span></button>`; }).join("")}</div>` : `<p class="fine">No master games reach this position. You've left the book.</p>`);
  const tg = (d.topGames || []).slice(0, 4);
  setPart("exTop", tg.length && !EX.quiz ? `<div class="label" style="margin-top:14px">Top games from this position</div><div class="extop">${tg.map((g) => `<button type="button" class="extg" data-ex="mg:${esc(g.id)}"><span><b>${esc(g.white.name)}</b> <small class="num">${g.white.rating || ""}</small></span><span class="extr ${g.winner || "draw"}">${g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "½-½"}</span><span><b>${esc(g.black.name)}</b> <small class="num">${g.black.rating || ""}</small></span><span class="fine">${g.year}</span></button>`).join("")}</div><p class="fine">Tap a game to replay it with the coach.</p>` : "");
}
/* the main line plays itself, one move every 0.9 s, from where you are (or from the start if you have left it) */
function exPlayLine() {
  const S = openStory(EX.lastName); if (!S) return; if (EX.timer) { clearInterval(EX.timer); EX.timer = null; return explorerPage(); }
  const line = S.line.split(" "); if (!(EX.sans.length < line.length && EX.sans.every((m, k) => m === line[k]))) EX.sans = [];
  EX.sel = null; EX.timer = setInterval(() => {
    if (st.game !== "explorer" || !$("#exBoard")) { clearInterval(EX.timer); EX.timer = null; return; }
    if (EX.sans.length >= line.length) { clearInterval(EX.timer); EX.timer = null; return explorerPage(); }
    const c = exChess(), m = c.move(line[EX.sans.length]); if (!m) { clearInterval(EX.timer); EX.timer = null; return explorerPage(); }
    EX.sans.push(m.san); try { Snd.move(m, c); } catch (er) { /* quiet */ } explorerPage();
  }, 900); explorerPage();
}
function exGuess(m) {
  const Q = EX.quiz, c0 = exChess(), d = EX.cache[c0.fen()]; if (!d || !d.moves.length) return;
  const tot = d.moves.reduce((a, x) => a + x.white + x.draws + x.black, 0), k = d.moves.findIndex((x) => x.san === m.san), pct = (x) => Math.round((100 * (x.white + x.draws + x.black)) / tot), top = d.moves[0];
  const pts = k === 0 ? 3 : k === 1 || k === 2 ? 1 : 0; Q.pts += pts; Q.n++; Q.streak = k === 0 ? Q.streak + 1 : 0; Q.ok = k === 0 ? "good" : pts ? "close" : "bad";
  Q.msg = k === 0 ? `${esc(m.san)}! That's the masters' favourite here (${pct(top)}% of games). +3` : k > 0 ? `${esc(m.san)} is played in ${pct(d.moves[k])}% of master games, number ${k + 1} here. Their favourite is <b>${esc(top.san)}</b> (${pct(top)}%).${pts ? " +1" : ""}` : `Masters never played ${esc(m.san)} here. Their favourite is <b>${esc(top.san)}</b> (${pct(top)}%).`;
  try { k === 0 ? Snd.ok() : pts ? Snd.tick() : Snd.bad(); } catch (er) { /* quiet */ }
  if (k === 0 && Q.streak >= 3) pipSay(pipPick("great", Q.n)); else if (k < 0) pipSay(pipPick("inaccuracy", Q.n));
  EX.sans.push(top.san); explorerPage();   /* the game goes on with the masters' main move, so you keep learning the theory */
  clearTimeout(EX.qT); EX.qT = setTimeout(() => { if (EX.quiz && st.game === "explorer") { EX.quiz.msg = ""; explorerPage(); } }, 3200);
}
async function exMasterGame(id) {
  try { const r = await fetch(`https://explorer.lichess.org/masters/pgn/${encodeURIComponent(id)}`); const pgn = r.ok ? await r.text() : ""; const c = new Chess(); if (!pgn || !c.load_pgn(pgn, { sloppy: true })) throw new Error("pgn");
    const h = (k) => (pgn.match(new RegExp(`\\[${k} "([^"]*)"\\]`)) || [])[1] || ""; clearInterval(EX.timer); EX.timer = null;
    reviewStart(c.history(), "w", { from: "explorer", names: [h("White") || "White", h("Black") || "Black"], result: h("Result") }); }
  catch (e) { setPart("exTop", `<p class="fine">Could not load that game from Lichess. Try again in a moment.</p>`); }
}
function exClassic(k, here) {
  const G = OPEN_GAMES[k], c = new Chess(); if (!G || !c.load_pgn(G.pgn)) return; clearInterval(EX.timer); EX.timer = null;
  if (here) { const S = openStory(EX.lastName), all = c.history(); EX.sans = []; EX.sel = null; EX.timer = setInterval(() => { if (st.game !== "explorer" || !$("#exBoard") || EX.sans.length >= all.length) { clearInterval(EX.timer); EX.timer = null; if (st.game === "explorer") explorerPage(); return; } const cc = exChess(), m = cc.move(all[EX.sans.length]); EX.sans.push(m.san); try { Snd.move(m, cc); } catch (er) { /* quiet */ } explorerPage(); }, 1000); void S; return explorerPage(); }
  reviewStart(c.history(), "w", { from: "explorer", names: G.names, result: (G.pgn.match(/(1-0|0-1|1\/2-1\/2)\s*$/) || [])[1] || (c.in_checkmate() ? (c.turn() === "b" ? "1-0" : "0-1") : "") });
}
document.addEventListener("click", (e) => {   /* tap a piece, then a square: any legal move works, in or out of the book */
  if (st.game !== "explorer") return; const sq = e.target.closest && e.target.closest(".exboard [data-sq]"); if (!sq) return; if (EX.timer) { clearInterval(EX.timer); EX.timer = null; }
  const c = exChess(), to = sq.dataset.sq, p = c.get(to);
  if (EX.sel) { const m = c.move({ from: EX.sel, to, promotion: "q" }); EX.sel = null; if (m) { if (EX.quiz) return exGuess(m); EX.sans.push(m.san); try { Snd.move(m, c); } catch (er) { /* quiet */ } return explorerPage(); } }
  EX.sel = p && p.color === c.turn() ? to : null; explorerPage();
});
const pvLineSans = (sans) => sans.map((m, k) => (k % 2 === 0 ? `${k / 2 + 1}. ` : "") + m).join(" ");
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-lesson],[data-exm],[data-ex],#lsnNext"); if (!t) return;
  if (t.dataset.lesson != null) return lessonStart(+t.dataset.lesson);
  if (t.id === "lsnNext" && st.game === "lesson") return lessonNext();
  const stop = () => { if (EX.timer) { clearInterval(EX.timer); EX.timer = null; } };
  if (t.dataset.exm) { stop(); if (EX.quiz) { const c = exChess(), m = c.move(t.dataset.exm); if (m) return exGuess(m); } EX.sans.push(t.dataset.exm); try { Snd.tick(); } catch (er) { /* quiet */ } return explorerPage(); }
  const v = t.dataset.ex; if (!v) return;
  if (v === "back") { stop(); EX.sel = null; EX.sans.pop(); return explorerPage(); }
  if (v === "reset") { stop(); EX.sans = []; EX.sel = null; return explorerPage(); }
  if (v === "play") return exPlayLine();
  if (v === "fact") { EX.fact = (EX.fact || 0) + 1; const S = openStory(EX.lastName); if (S) pipSay(storyFact(S.facts[EX.fact % S.facts.length])); return explorerPage(); }
  if (v === "quiz") { stop(); EX.quiz = EX.quiz ? null : { pts: 0, n: 0, streak: 0, msg: "" }; return explorerPage(); }
  if (v.startsWith("tab:")) { EX.tab = v.slice(4); const S = openStory(EX.lastName); if (S && EX.tab !== "line") pipSay(EX.tab === "name" ? S.origin : EX.tab === "idea" ? "The idea: " + S.idea : EX.tab === "facts" ? storyFact(S.facts[(EX.fact || 0) % S.facts.length]) : ""); return explorerPage(); }
  if (v.startsWith("to:")) { stop(); const S = openStory(EX.lastName); if (S) { EX.sans = S.line.split(" ").slice(0, +v.slice(3)); EX.sel = null; } return explorerPage(); }
  if (v.startsWith("mg:")) return exMasterGame(v.slice(3));
  if (v.startsWith("game:")) return exClassic(v.slice(5), false);
  if (v.startsWith("gamehere:")) return exClassic(v.slice(9), true);
});

async function chLoadTour(id) {
  const el = document.getElementById("chLive"); if (!el) return; el.innerHTML = `<p class="fine"><span class="spin"></span> Loading from Lichess…</p>`;
  try {
    const d = await liJson(`${LI}/${id}`); if (document.getElementById("chLive") !== el) return; const rounds = d.rounds || [], now = Date.now();
    const state = (r) => (r.finished ? "done" : r.ongoing ? "live" : r.startsAt && r.startsAt < now ? "played" : "soon"), fmt = (ms) => (ms ? new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
    const def = CH.round && rounds.find((r) => r.id === CH.round) ? CH.round : d.defaultRoundId || (rounds[0] && rounds[0].id); CH.round = def;
    el.innerHTML = `<div class="label">${esc(d.tour.name)}</div><div class="chips" id="chRounds">${rounds.map((r) => `<button class="chip ${r.id === def ? "on" : ""}" data-chround="${r.id}" type="button" title="${fmt(r.startsAt)}">${esc(r.name)}${state(r) === "live" ? " ●" : ""}</button>`).join("")}</div><div id="chGames"></div>`;
    if (def) chLoadRound(def, rounds.find((r) => r.id === def));
  } catch (e) { el.innerHTML = `<p class="sub"><b>Could not reach Lichess.</b> This page needs an internet connection. <button class="btn" data-chtour="${id}" type="button">Try again</button></p>`; }
}
async function chLoadRound(id, r) {
  const el = document.getElementById("chGames"); if (!el) return; CH.round = id; document.querySelectorAll("#chRounds .chip").forEach((x) => x.classList.toggle("on", x.dataset.chround === id));
  const when = r && r.startsAt ? new Date(r.startsAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  el.innerHTML = `<p class="fine"><span class="spin"></span> Loading games…</p>`;
  try {
    const res = await fetch(`${LI}/round/${id}.pgn`); if (!res.ok) throw new Error("http"); const txt = await res.text(); if (document.getElementById("chGames") !== el) return;
    const games = txt.split(/\n\n(?=\[Event )/).map((g) => g.trim()).filter(Boolean).map((pgn) => { const c = new Chess(); const ok = c.load_pgn(pgn, { sloppy: true }); const h = c.header(); return { ok, sans: ok ? c.history() : [], w: h.White || "White", b: h.Black || "Black", res: h.Result || "*", tc: h.TimeControl || "" }; });
    CH.games = games;
    el.innerHTML = games.length ? `<div class="fine" style="margin:6px 0">${when ? "Starts " + esc(when) + " · " : ""}Press a game to step through it and run the Stockfish review.</div><div class="chgames">${games.map((g, i) => `<button class="chg" type="button" data-chg="${i}" ${g.sans.length < 2 ? "disabled" : ""}><span>${esc(g.w)}</span><b>${g.res === "1-0" ? "1-0" : g.res === "0-1" ? "0-1" : g.res === "1/2-1/2" ? "½-½" : g.sans.length ? "live" : "…"}</b><span>${esc(g.b)}</span><small>${g.sans.length ? Math.ceil(g.sans.length / 2) + " moves" : "not started"}</small></button>`).join("")}</div><button class="btn ghost" data-chround="${id}" type="button" style="margin-top:8px">Refresh</button>` : `<p class="fine">${when ? "Scheduled for " + esc(when) + ". " : ""}No games have been published for this round yet.</p>`;
  } catch (e) { el.innerHTML = `<p class="sub"><b>Could not load the games.</b> <button class="btn" data-chround="${id}" type="button">Try again</button></p>`; }
}
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-chround],[data-chg]"); if (!t || st.game !== "champ") return;
  if (t.dataset.chround) return chLoadRound(t.dataset.chround, null);
  if (t.dataset.chg != null) { const g = CH.games[+t.dataset.chg]; if (g && g.sans.length >= 2) reviewStart(g.sans, "w", { from: "champ", names: [g.w, g.b], result: g.res }); }
});

const GO = { learn: learnPage, explorer: () => explorerPage(), sim: () => simPage(), games: gamesPage, wk: wkStart, champ: () => champPage(), rank: () => (RKS.prof ? profPage(RKS.prof) : rankPage()), online: olMenu, daily: dailyPage, board: () => boardPage(), dp: dpStart, dh: dhStart, dt: dtStart, hbar: hbStart, tact: tactStart, endg: egStart, blind: blindStart, call: callStart, elite: eliteStart, next: nextStart, recog: recogStart, blunder: blunderStart, open: openStart, trainer: trainerStart, mate: () => mateStart(2), elo: eloStart, ai: aiMenu, review: reviewIntro, who: whoStart, model: modelPage, home };
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
      <div class="row h2cta"><button class="btn" type="button" data-go="dp">${ic("bolt")}Today's puzzle</button><button class="btn ghost" type="button" data-go="ai">${ic("robot")}Play a coach</button></div></div>
    <div class="h2r">${heroBoard()}</div></div>
    <div class="statstrip" id="statstrip"><div><b class="cu" data-to="${PZ.length}">${PZ.length}</b><span>real puzzles</span></div><div><b class="cu" data-to="${EM.length}">${EM.length}</b><span>top-level games</span></div><div><b class="cu" data-to="${PLAYERS.length}">${PLAYERS.length}</b><span>players profiled</span></div><div><b class="cu" data-to="${Math.round(S.acc * 1000) / 10}" data-dec="1" data-suf="%">${pct(S.acc, 1)}</b><span>model accuracy</span></div></div>
    <div class="hsec"><h2>${ic("clock")}Today</h2>${streak ? `<span class="hflame">🔥 ${streak}-day streak</span>` : ""}</div>
    <div class="htoday">${DAILIES.map(([k, n, icn, tag, go, fmt], i) => { const v = d[k]; return `<button class="ht ${v != null ? "done" : ""}" type="button" data-go="${go}" style="--d:${i * 80}ms"><span class="hti">${ic(icn)}</span><b>${n}</b><small>${v != null ? esc(fmt(v)) : esc(tag)}</small><span class="htk">${v != null ? "✓" : "Play"}</span></button>`; }).join("")}
      <button class="ht wk ${wk ? "done" : ""}" type="button" data-go="wk" style="--d:240ms"><span class="hti">${ic("trophy")}</span><b>Weekly cup</b><small>${wk ? `Your score: ${wk.score}` : "Five puzzles, one attempt, same for everyone."}</small><span class="htk">${wk ? "✓" : "Play"}</span></button></div>
    <div class="hsec"><h2>${ic("robot")}Your coaches</h2><span class="fine">Pick who sits across the board</span></div>
    <div class="hcoach">${coach("pip", 2, "happy")}${coach("bea", 4, "calm")}${coach("vera", 6, "calm")}</div>
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
    olOpen("watch", code); OL.welcomed = true; this.id = Math.random().toString(36).slice(2, 8); $("#app").className = "fresh";
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
    if (m.k === "watchsync") return this.sync(m);
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
  syncMsg() { const g = OG; return { k: "watchsync", names: g.names, hostColor: OL.hostColor, tc: g.tc, sans: g.c.history(), ms: g.ms, me: g.me, over: g.over }; },
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

document.addEventListener("click", (e) => {
  const mvp = e.target.closest && e.target.closest("[data-ply]"); if (mvp && rvActive()) { rvGo(+mvp.dataset.ply, { sound: false }); return; }
  const sq = e.target.closest && e.target.closest("[data-sq]"); if (sq && live && document.querySelector(".board.play")) return liveClick(sq.dataset.sq);
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.lk) { const k = t.dataset.lk; $("#lkRes").innerHTML = k[0] === "p" ? lkPlayer(+k.slice(1)) : `<div class="card" style="background:var(--panel);margin-top:12px">${lkEvent(+k.slice(1))}</div>`; countUp($("#lkRes")); $("#lkRes").scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }
  if (t.dataset.lv) { st.level = +t.dataset.lv; store.set("ai_level", st.level); document.querySelectorAll("[data-lv]").forEach((x) => x.classList.toggle("on", x.dataset.lv === t.dataset.lv)); return; }
  if (t.dataset.clk != null) { st.clock = +t.dataset.clk; store.set("ai_clock", st.clock); document.querySelectorAll("[data-clk]").forEach((x) => x.classList.toggle("on", x.dataset.clk === t.dataset.clk)); return; }
  if (t.dataset.col) { st.color = t.dataset.col; store.set("ai_color", st.color); document.querySelectorAll("[data-col]").forEach((x) => x.classList.toggle("on", x.dataset.col === t.dataset.col)); return; }
  if (t.id === "pgnGo") { const c = new Chess(), txt = $("#pgnIn").value.trim(); if (!txt || !(c.load_pgn(txt, { sloppy: true }) || c.load_pgn("1. " + txt.replace(/^1\.\s*/, ""), { sloppy: true }))) { $("#pgnMsg").textContent = "I could not read that game. Paste a PGN or a list of moves."; return; } const sans = c.history(), h = c.header(); if (sans.length < 4) { $("#pgnMsg").textContent = "The game is too short to review."; return; } const tcm = /^(\d+)(?:\+(\d+))?/.exec(h.TimeControl || ""), est = tcm ? +tcm[1] + 40 * (+tcm[2] || 0) : 0, speed = !tcm ? "" : est < 180 ? "bullet" : est < 480 ? "blitz" : est < 1500 ? "rapid" : "classical"; return reviewStart(sans.slice(0, 200), "w", { from: "pgn", names: [h.White || "White", h.Black || "Black"], result: h.Result || "", speed }); }
  if (t.id === "pgnElite") { const g = rnd(EM); return reviewStart(g.moves.slice(0, 90), "w", { from: "elite", names: [g.white, g.black], result: g.result }); }
  if (t.id === "aiGo") return aiStart(st.level, st.color);
  if (t.id === "aiAgain" || t.id === "aiNew") return aiMenu();
  if (t.id === "aiReview") return reviewStart(live.c.history(), live.color, { from: "ai", names: live.color === "w" ? ["You", "My engine"] : ["My engine", "You"] });
  if (t.id === "rvBack") { const was = rv && rv.from; rvStop(); return was === "explorer" ? explorerPage() : was === "ai" ? aiMenu() : was === "online" ? olMenu() : was === "champ" ? champPage() : was === "rank" ? GO.rank() : reviewIntro(); }
  if (t.dataset.rv != null && t.dataset.rv !== "" && rvActive()) { const v = t.dataset.rv; if (v === "play") return rvPlay(); if (v === "best") { rv.showBest = !rv.showBest; store.set("rv_best", rv.showBest); return rvPaint(); } if (v === "flip") return rvFlip(); if (v === "pen") return rvPenToggle(); if (v === "xstart") return rv.ex ? rvxEnd() : rvxStart(); if (v === "xundo") return rvxUndo(); if (v === "xeng") return rvxEngine(); if (v === "xreset") return rvxReset(); if (v === "xend") return rvxEnd(); if (v === "retry1") return rvRetry(); if (v === "retryshow") return rvRetryShow(); if (v === "retryend") return rvRetryEnd(); if (v === "pipv") { PIPV.on = !PIPV.on; try { localStorage.setItem("bk_pip_voice", PIPV.on ? "1" : "0"); } catch (e) { /* private */ } if (!PIPV.on) AIVoice.stop(); t.classList.toggle("on", PIPV.on); return; } if (v === "retry") { const f = rv.from, sans = rv.sans, col = rv.color, nm = rv.names, rs = rv.result; return reviewStart(sans, col, { from: f, names: nm, result: rs }); } return rvGo(v === "0" ? 0 : v === "9999" ? rv.N : rv.i + +v, { sound: v === "1" }); }
  if (t.dataset.diff) { DIFF = t.dataset.diff; store.set("diff", DIFF); document.querySelectorAll("[data-diff]").forEach((x) => x.classList.toggle("on", x.dataset.diff === DIFF)); const n = $("#dnote"); if (n) n.textContent = DNOTE[DIFF]; return; }
  if (t.dataset.hub) { fresh(); return hub(t.dataset.hub); }
  if (t.dataset.intro) { fresh(); Usage.play("ch", t.dataset.intro); return intro(t.dataset.intro); }
  if (t.id === "thBtn") { const nx = LOOKS[(LOOKS.findIndex((x) => x[0] === lookNow()) + 1) % LOOKS.length][0]; document.documentElement.setAttribute("data-theme", lookResolve(nx)); try { localStorage.setItem("bkc_look", nx); } catch (e) { /* storage blocked */ } thPaint(); if (Cloud.signedIn) Cloud.push(); return; }
  if (t.id === "sndBtn") { const m = document.getElementById("mixPop"); if (m) { m.remove(); return; } const sl = (id, l, v) => `<label class="fine" style="display:grid;grid-template-columns:70px 1fr 38px;gap:8px;align-items:center;margin:6px 0">${l}<input type="range" id="${id}" min="0" max="100" value="${Math.round(v * 100)}"><span id="${id}V">${Math.round(v * 100)}%</span></label>`; const d = document.createElement("div"); d.id = "mixPop"; d.className = "card"; d.setAttribute("style", "position:fixed;right:12px;top:58px;z-index:9000;width:min(300px,92vw);box-shadow:0 18px 50px -12px #000"); d.innerHTML = `<h3 style="margin-top:0">${ic("bolt")}Sound</h3><div class="row"><button class="chip ${Snd.on ? "on" : ""}" data-snd="1" type="button">Sound ${Snd.on ? "on" : "off"}</button><button class="chip ${Snd.mus ? "on" : ""}" data-mus="1" type="button">Music ${Snd.mus ? "on" : "off"}</button><button class="chip ${Mix.say ? "on" : ""}" data-say="1" type="button">Voice ${Mix.say ? "on" : "off"}</button></div>${sl("mxFx", "Effects", Mix.fx)}${sl("mxMus", "Music", Mix.music)}${sl("mxVoice", "Voice", Mix.voice)}<p class="fine" style="margin:6px 0 0">All sounds are made live in your browser.</p>`; document.body.appendChild(d); return; }
  if (t.dataset.snd) { Snd.on = !Snd.on; store.set("snd", Snd.on); Snd.init(); Snd.remix(); if (!Snd.on) Snd.musicStop(); else Snd.ok(); paintSnd(); t.classList.toggle("on", Snd.on); t.textContent = "Sound " + (Snd.on ? "on" : "off"); return; }
  if (t.dataset.mus) { Snd.mus = !Snd.mus; store.set("mus", Snd.mus); Snd.mus ? Snd.musicStart() : Snd.musicStop(); t.classList.toggle("on", Snd.mus); t.textContent = "Music " + (Snd.mus ? "on" : "off"); return; }
  if (t.dataset.say) { Mix.say = !Mix.say; Snd.remix(); t.classList.toggle("on", Mix.say); t.textContent = "Voice " + (Mix.say ? "on" : "off"); if (Mix.say) Voice.say("Let's play"); return; }
  if (t.id === "home") { live = null; clearInterval(st.timer); fresh(); return home(); }
  if (t.dataset.go) { live = null; clearInterval(st.timer); return pageTo(() => { fresh(); GO[t.dataset.go](); }, $("#app")); }
  const g = st.game;
  if (g === "call") { if (t.dataset.r != null) { st.pick = +t.dataset.r; return callRender(); } if (t.dataset.l != null) { st.len = +t.dataset.l; return callRender(); } if (t.id === "lock") return callLock(); if (t.id === "next") return callNext(); }
  if (g === "elite") { if (t.dataset.ep != null) { const k = st.stage; st.picks[k] = +t.dataset.ep; Snd.tick && 0; return eliteRun(); } if (t.id === "eskip") { const g2 = st.g, tg = st.stage < 2 ? CHK[st.stage + 1] : g2.moves.length; while (st.ply < tg) { const m = live.c.move(g2.moves[st.ply]); live.last = [m.from, m.to]; st.ply++; } st.skipAnim = true; clearInterval(st.timer); if (st.stage < 2) { st.stage++; return eliteAsk(); } return eliteReveal(); } if (t.id === "enextg") { if (st.i >= 2) return finish("Predict who won", st.you, st.mod, 18, "elite", "elite"); st.i++; return eliteGame(); } }
  if (g === "next") { if (t.dataset.nm != null && st.q.chosen == null) { st.q.chosen = st.q.opts[+t.dataset.nm]; st.streak = st.q.chosen === st.q.real ? st.streak + 1 : 0; st.q.chosen === st.q.real ? Snd.ok() : Snd.bad(); bump("next", st.streak); return nextRender(); } if (t.id === "nmnext") return nextQ(); }
  if (g === "recog") { if (t.dataset.rc != null && st.q.chosen == null) { st.q.chosen = st.q.opts[+t.dataset.rc]; st.streak = st.q.chosen === st.q.ans ? st.streak + 1 : 0; bump("recog", st.streak); return recogRender(); } if (t.id === "rcnext") return recogQ(); }
  if (g === "blunder") { if (t.dataset.bl && st.q.chosen == null) { st.q.chosen = t.dataset.bl; st.streak = st.q.chosen === st.q.cls ? st.streak + 1 : 0; bump("blunder", st.streak); return blunderRender(); } if (t.id === "blnext") return blunderQ(); }
  if (g === "open") { if (t.dataset.o != null && st.q.chosen == null) { st.q.chosen = st.q.opts[+t.dataset.o]; st.streak = st.q.chosen === st.q.o ? st.streak + 1 : 0; st.q.chosen === st.q.o ? Snd.ok() : Snd.bad(); bump("open", st.streak); return openRender(); } if (t.id === "onext") { if (st.q.chosen !== st.q.o) st.streak = 0; return openNext(); } }
  if (g === "trainer") { if (t.id === "trnext") return trainerNext(); if (t.id === "trhint") { st.msg = `Hint: ${st.book[st.i]}`; return trainerPaint(); } }
  if (g === "mate") { if (t.dataset.mn) { st.n = +t.dataset.mn; return mateNext(); } if (t.id === "mnext") return mateNext(); }
  if (g === "elo" && t.id === "enext2") return eloNext();
  if (g === "ai" && t.dataset.ai) return aiStart(+t.dataset.ai);
  if (g === "who") { if (t.id === "wgo") return whoGuess(); if (t.id === "wbuzz") return whoBuzz(); if (t.id === "wnext") return whoNext(); }
});
document.addEventListener("pointerdown", (e) => {
  const el = e.target.closest && e.target.closest(".board.play [data-own]"); if (!el || !live || live.lock || e.button > 0) return; const s = el.dataset.sq, p = live.c.get(s); if (!p) return;
  liveClick(s); const g = document.createElement("div"); g.className = "dghost pc-" + p.color + p.type; document.body.appendChild(g); const mv = (ev) => { g.style.left = ev.clientX + "px"; g.style.top = ev.clientY + "px"; }; mv(e);
  const q0 = document.querySelector('[data-sq="' + s + '"] .pcz'); if (q0) q0.style.opacity = 0.25;
  const up = (ev) => { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); g.remove(); const x = document.elementFromPoint(ev.clientX, ev.clientY), tt = x && x.closest && x.closest("[data-sq]"); if (tt && tt.dataset.sq !== s) { liveClick(tt.dataset.sq); } else { const q = document.querySelector('[data-sq="' + s + '"] .pcz'); if (q) q.style.opacity = 1; } };
  document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up); e.preventDefault();
});
document.addEventListener("input", (e) => { const k = { mxFx: "fx", mxMus: "music", mxVoice: "voice" }[e.target.id]; if (!k) return; Mix[k] = e.target.value / 100; const l = document.getElementById(e.target.id + "V"); if (l) l.textContent = e.target.value + "%"; Snd.remix(); });
document.addEventListener("click", (e) => { const m = document.getElementById("mixPop"); if (m && !m.contains(e.target) && e.target.id !== "sndBtn" && !e.target.closest("#sndBtn")) m.remove(); });
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "win") { e.preventDefault(); whoGuess(); } else if (e.code === "Space" && st.game === "who" && st.q && st.q.phase === "play" && !/INPUT|TEXTAREA/.test(e.target.tagName || "")) { e.preventDefault(); whoBuzz(); } });
paintSnd();

/* ---------- loading screens: a collectible card each time, with rarities ---------- */
const CS_TIPS = ["Buzz early in Who is this player?: points fall as the clues arrive.", "Predict who won: a correct call before move 1 is worth 3 points.", "Review a game: paste any PGN and every move gets a grade.", "Play my AI with a clock to practise blitz.", "Mate puzzles come from real Lichess puzzles, rated by thousands of solves.", "In Blunder or fine?, Stockfish's own verdict is hidden until you answer.", "Estimate my Elo adapts to your answers: ten puzzles, one estimate.", "The model has never seen the tournament you look up.", "Every top-level game in Guess the next move is real.", "Drag a piece or click it and then the square."];
const csSeen = () => store.get("splash", {});
function csCatalog() { const pl = PLAYERS.filter((p) => p.img), com = pl.filter((p) => !p.champ).slice(0, 60), unc = pl.filter((p) => p.champ).slice(0, 14), big = EM.map((g, i) => [g, i]).filter(([g]) => ["World Championship", "Candidates", "Norway Chess", "Tata Steel"].includes(g.kind) && g.moves.length >= 50).slice(0, 30), mate = PZ.filter((p) => p.rating >= 1700 && p.themes.some((x) => /mateIn[23]/.test(x))).slice(0, 14);
  return { com, unc, big, mate }; }
function csNotebook() { const rows = PLAYERS.slice(0, 7); return `<div class="sp-notebook"><div class="nb-paper"><svg class="nb-pencil" viewBox="0 0 48 48"><path d="M6 42l4-12 24-24a4 4 0 0 1 6 0l2 2a4 4 0 0 1 0 6L18 38 6 42z" fill="#f2c14e" stroke="#7a5a10" stroke-width="2"/><path d="M6 42l4-12 8 8z" fill="#f3d8b0" stroke="#7a5a10" stroke-width="2"/><path d="M6 42l2-6 4 4z" fill="#333"/></svg><div class="nb-title">Power rankings</div><div class="nb-sub">highest peak ratings in our data</div><ol>${rows.map((p, i) => `<li style="--i:${i}"><b>${i + 1}. ${esc(p.n)}</b><span>${p.peak}</span></li>`).join("")}</ol><div class="nb-note">Before the models, there was a notebook: power rankings built from nothing but watching and counting.</div></div></div>`; }
function csCard(p, unc) { const init = p.n.split(" ").map((w) => w[0]).slice(0, 2).join(""); return `<div class="cs-poster ${unc ? "cs-unc" : ""}"><div class="cs-bgname">${esc(p.n.split(" ").slice(-1)[0])}</div>${unc ? `<div class="cs-crown">${ic("crown")}</div>` : ""}${p.img ? `<img class="cs-photo" src="${esc(p.img.replace("http://", "https://"))}?width=420" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;cs-photo ini&quot;>${esc(init)}</div>'">` : `<div class="cs-photo ini">${esc(init)}</div>`}<div class="cs-name">${esc(p.n)}</div><div class="cs-sub">${unc ? "World Champion · " : ""}peak rating ${p.peak}${p.country ? " · " + esc(p.country) : ""}</div></div>`; }
function runSplash() {
  const sp = $("#splash"); if (!sp) return; $("#spLogo").innerHTML = ic("crown"); const cat = csCatalog(), local = location.hostname === "localhost", r = local && /[?&]secret\b/.test(location.search) ? 0 : (local ? ({ legendary: 0.03, rare: 0.15, uncommon: 0.4, common: 0.9 })[new URLSearchParams(location.search).get("splash")] : undefined) ?? Math.random(), seen = csSeen();
  const kind = r < 0.012 ? "secret" : r < 0.07 ? "legendary" : r < 0.25 ? "rare" : r < 0.5 ? "uncommon" : "common"; let id, name, rar, html = "";
  if (kind === "secret") { id = "s:notebook"; name = "The Notebook"; rar = "Secret"; html = csNotebook(); }
  else if (kind === "legendary" && cat.mate.length) { const p = rnd(cat.mate), n = +(p.themes.find((x) => /mateIn/.test(x)) || "mateIn2").slice(-1); id = "z:" + p.fen.slice(0, 24); name = `Mate in ${n}`; rar = "Legendary"; html = `<div class="cs-leg"><div class="cs-bd" id="csBd"></div><div class="cs-cap"><b>Mate in ${n}</b>A real puzzle rated ${p.rating} on Lichess. Watch the solution.</div></div>`; sp._pz = p; }
  else if (kind === "rare" && cat.big.length) { const [g, gi] = rnd(cat.big), ply = 24 + Math.floor(Math.random() * Math.min(40, g.moves.length - 26)), c = fenOf(g.moves.slice(0, ply)), h = c.history({ verbose: true }), lm = h.length ? [h[h.length - 1].from, h[h.length - 1].to] : null; id = "g:" + gi; const sn = (n) => { const w = nice(n).split(" "); return w[w.length - 1].length <= 2 ? w[0] : w[w.length - 1]; }; name = sn(g.white) + " v " + sn(g.black); rar = "Rare"; html = `<div class="cs-leg" style="animation:none"><div class="cs-bd">${boardHTML(c, { last: lm })}</div><div class="cs-cap"><b>${esc(nice(g.white))} v ${esc(nice(g.black))}</b>${esc(g.event)} · after move ${Math.floor(ply / 2)} · ${g.result === "1/2-1/2" ? "½-½" : g.result}</div></div>`; }
  else if (kind === "uncommon" && cat.unc.length) { const p = rnd(cat.unc); id = "c:" + p.n; name = p.n; rar = "Uncommon"; html = csCard(p, true); }
  else { const p = rnd(cat.com); id = "p:" + p.n; name = p.n; rar = "Common"; html = csCard(p, false); }
  $("#csArt").innerHTML = html; $("#csName").textContent = name; const rr = $("#csRar"); rr.textContent = rar; rr.className = "rar r-" + rar.toLowerCase(); sp.className = "k-" + kind; $("#csTip").textContent = rnd(CS_TIPS);
  const total = cat.com.length + cat.unc.length + cat.big.length + cat.mate.length + (seen["s:notebook"] || id === "s:notebook" ? 1 : 0), fresh = !seen[id]; seen[id] = (seen[id] || 0) + 1; store.set("splash", seen); const n = Object.keys(seen).length; if (fresh) $("#csNew").textContent = `New! ${n} of ${total}`;
  if (kind === "secret") setTimeout(() => { try { Snd.ok(); } catch (e) { /* ok */ } }, 1600);
  const dur = kind === "secret" ? 10500 : kind === "common" ? 2300 : 3600; $("#csBar").animate([{ width: "0%" }, { width: "100%" }], { duration: dur, fill: "forwards", easing: "linear" });
  if (sp._pz) { const p = sp._pz, c = new Chess(p.fen), bd = $("#csBd"), draw = (last) => { bd.innerHTML = boardHTML(c, { last }); }, mv = (u) => { const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); draw(m ? [m.from, m.to] : null); }; draw(null); let k = 0; const step = () => { if (!document.body.contains(bd) || k >= p.moves.length) return; mv(p.moves[k++]); setTimeout(step, 900); }; setTimeout(step, 700); }
  let closed = false; const hide = () => { if (closed) return; closed = true; sp.classList.add("out"); setTimeout(() => { sp.remove(); chessThemePick(); }, 700); }; sp.addEventListener("click", hide); setTimeout(hide, dur);
}
home();
runSplash();
/* slow device? measure two seconds while the tab is visible, and switch to lighter visuals only if it is clearly low */
setTimeout(() => { if (matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) return; let n = 0, t0 = performance.now(), aborted = false; const vis = () => { if (document.hidden) aborted = true; }; document.addEventListener("visibilitychange", vis); const f = (ts) => { n++; if (aborted) return; if (ts - t0 < 2500) requestAnimationFrame(f); else { document.removeEventListener("visibilitychange", vis); if (n * 1000 / (ts - t0) < 30) document.documentElement.dataset.perf = "low"; } }; requestAnimationFrame(f); }, 3000);

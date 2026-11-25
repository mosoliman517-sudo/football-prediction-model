
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
  const load = () => map || (map = fetch(BASE + "index.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
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
/* Ranked seasons, shared by football and basketball (each build includes this file).
   A season is a calendar month (UTC). Everyone starts each season on 1000 season points, and every ranked result moves them by
   the same amount it moves your Elo (the database adds up this month's rating history: season_board / my_season in
   online/schema_v13.sql). Lifetime Elo is untouched and still used for matchmaking.
   Rewards: when a season ends, the page reads where you finished and unlocks an achievement (Season regular for 10+ games,
   Top 10, Podium, Champion) and keeps the finish in your trophy cabinet. */
const Season = {
  month(d) { d = d || new Date(); return d.toISOString().slice(0, 7); },
  prev() { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return this.month(d); },
  name(m) { const [y, mo] = m.split("-"); return new Date(Date.UTC(+y, +mo - 1, 1)).toLocaleString(undefined, { month: "long", timeZone: "UTC" }) + " " + y; },
  ends() { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); },
  left() { const s = Math.max(0, (this.ends() - Date.now()) / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; },
  missing: false,
  async board(m) {   /* public: works signed out too; a 404 means schema_v13.sql has not been run yet */
    try { const t = Account.signedIn ? await Account.token() : null; const r = await fetch(`${Board.cfg.url}/rest/v1/rpc/season_board`, { method: "POST", headers: t ? Account.hdr(t) : Board.headers(), body: JSON.stringify({ p_month: m }) }); if (r.status === 404) { this.missing = true; return null; } return r.ok ? await r.json() : null; } catch (e) { return null; }
  },
  async mine(m) { const r = await Ranked.rpc("my_season", { p_month: m }); return r && r[0] ? r[0] : null; },
  tier(f) { if (!f || f.games < 1) return null; if (f.place === 1 && f.players >= 3) return ["champ", "Champion"]; if (f.place <= 3 && f.players >= 5) return ["podium", "Podium"]; if (f.place <= 10 && f.players >= 12) return ["top10", "Top 10"]; if (f.games >= 10) return ["regular", "Season regular"]; return ["played", "Took part"]; },
  /* once per finished season: read the final standing, keep it in the cabinet and unlock the reward */
  async reward() {
    if (!Account.signedIn || Board.mode !== "rest") return; const pm = this.prev(), p = prof(); p.rseasons = p.rseasons || {};
    if (p.rseasons[pm] !== undefined) return;
    const f = await this.mine(pm); if (this.missing) return;
    p.rseasons[pm] = f ? { place: f.place, players: f.players, pts: f.pts, games: f.games, wins: f.wins } : 0; saveProf(p);
    if (!f) return; const t = this.tier(f);
    if (f.games >= 10) award("season_regular"); if (t && ["top10", "podium", "champ"].includes(t[0])) award("season_top10"); if (t && ["podium", "champ"].includes(t[0])) award("season_podium"); if (t && t[0] === "champ") award("season_champ");
    try { toast(`<b>${esc(this.name(pm))} season over</b><br>You finished ${ord(f.place)} of ${f.players} with ${f.pts} points.`, "ach"); } catch (e) { /* no toast yet */ }
  },
  cabinet() {
    const s = prof().rseasons || {}, ks = Object.keys(s).filter((k) => s[k]).sort().reverse();
    if (!ks.length) return "";
    return `<div class="sncab"><h3>Trophy cabinet</h3><div class="sncabrow">${ks.map((k) => { const f = s[k], t = this.tier(f) || ["played", "Took part"]; return `<div class="sntro ${t[0]}" title="${esc(t[1])}"><span class="sntroic">${SN_CUP(t[0])}</span><b>${esc(this.name(k))}</b><small>${ord(f.place)} of ${f.players} · ${f.pts} pts</small></div>`; }).join("")}</div></div>`;
  },
  async render(box) {
    const m = this.month(), me = prof().nick;
    box.innerHTML = `<div class="snhero"><div class="snglow"></div><div><div class="snkick">Season</div><h2 class="snname">${esc(this.name(m))}</h2><div class="fine">Everyone starts on 1000. Ranked results move your season points like your Elo. Ends in <b class="num" id="snLeft">${this.left()}</b>.</div></div><div class="snme" id="snMe">${skelRows(1)}</div></div>
      <div class="snrew">${[["regular", "Season regular", "10 ranked games"], ["top10", "Top 10", "with 12+ players"], ["podium", "Podium", "top 3 with 5+ players"], ["champ", "Champion", "first place"]].map(([k, n, d]) => `<div class="snr ${k}"><span>${SN_CUP(k)}</span><b>${n}</b><small>${d}</small></div>`).join("")}</div>
      <div id="snBoard" class="lbx">${skelRows(5)}</div>${this.cabinet()}`;
    clearInterval(this.iv); this.iv = setInterval(() => { const el = document.getElementById("snLeft"); if (!el) return clearInterval(this.iv); el.textContent = this.left(); }, 30000);
    const [rows, mine] = await Promise.all([this.board(m), Account.signedIn ? this.mine(m) : null]);
    const b = document.getElementById("snBoard"), mb = document.getElementById("snMe"); if (!b) return;
    if (mb) mb.innerHTML = !Account.signedIn ? '<div class="fine">Sign in to play the season.</div>' : mine ? `<b class="num snpts">${mine.pts}</b><small>${ord(mine.place)} of ${mine.players}<br>${mine.games} played · ${mine.wins} won</small>` : '<b class="num snpts">1000</b><small>Not ranked yet<br>play a ranked match</small>';
    if (!rows) { b.innerHTML = this.missing ? '<div class="fine">Seasons need the latest database update (online/schema_v13.sql).</div>' : '<div class="fine">Could not load the season. Try again in a moment.</div>'; return; }
    if (!rows.length) { b.innerHTML = emptyState(SN_CUP("champ"), "The season has just started", "Nobody has played a ranked match this month yet. Win the first one and you're top of the table.", `<button type="button" class="btn" ${/basketball/.test(location.pathname) ? 'data-nbgroup="ranked"' : 'data-group-go="ranked"'}>Play a ranked match</button>`); return; }
    const pod = rows.slice(0, 3), order = pod.length === 3 ? [1, 0, 2] : pod.map((_, i) => i);
    b.innerHTML = `<div class="snpod">${order.map((i) => { const r = pod[i]; return `<div class="snpp p${i + 1} ${r.nick === me ? "me" : ""}" data-pc="${esc(r.nick)}" tabindex="0" role="button" aria-haspopup="dialog" style="--d:${120 + i * 140}ms">${i === 0 ? '<span class="sncrown">👑</span>' : ""}${avatarHTML(r.avatar, "lg", r.nick)}<b>${esc(r.nick)}</b><span class="num">${r.pts}</span><div class="snstep">${i + 1}</div></div>`; }).join("")}</div>`
      + rows.slice(3).map((r, i) => `<div class="lbrow ${r.nick === me ? "me" : ""}" data-pc="${esc(r.nick)}" tabindex="0" role="button" aria-haspopup="dialog"><b class="num">${i + 4}</b><span>${avatarHTML(r.avatar, "xs", r.nick)}${esc(r.nick)}${badgesHTML(r.badges)}${r.nick === me ? " (you)" : ""}</span><span class="num">${r.pts}</span><span class="fine num">${r.wins}W ${r.games - r.wins}L</span></div>`).join("");
  },
};
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const SN_CUP = (k) => { const c = { champ: ["#ffe27a", "#d49a12"], podium: ["#f2f4f8", "#9aa3b2"], top10: ["#e7b07a", "#a8642c"], regular: ["#9fe3c4", "#2f9e6e"], played: ["#c9d1e0", "#6c7690"] }[k] || ["#ccc", "#888"]; return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="sn-${k}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs><path d="M18 8h28v12a14 14 0 0 1-28 0z" fill="url(#sn-${k})" stroke="#0006" stroke-width="2"/><path d="M18 12h-8a8 8 0 0 0 9 10M46 12h8a8 8 0 0 1-9 10" fill="none" stroke="url(#sn-${k})" stroke-width="4"/><rect x="28" y="33" width="8" height="12" fill="url(#sn-${k})"/><rect x="20" y="45" width="24" height="8" rx="2" fill="url(#sn-${k})" stroke="#0006" stroke-width="2"/></svg>`; };
(() => { const s = document.createElement("style"); s.textContent = `
.snhero{position:relative;overflow:hidden;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:18px;border-radius:20px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent,#f2c14e) 22%,transparent),transparent 70%),var(--surface,#ffffff10);border:1px solid var(--line,#ffffff22)}
.snglow{position:absolute;inset:-40% -10% auto auto;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--accent,#f2c14e) 45%,transparent),transparent 65%);animation:snPulse 5s ease-in-out infinite;pointer-events:none}
@keyframes snPulse{50%{transform:scale(1.15);opacity:.7}}
.snkick{font:700 12px var(--mono,monospace);letter-spacing:.14em;text-transform:uppercase;opacity:.75}.snname{margin:2px 0 6px;font-size:30px}
.snme{position:relative;min-width:150px;text-align:right;display:flex;gap:10px;align-items:center;justify-content:flex-end}.snme small{opacity:.8;font-size:12px;line-height:1.35;text-align:left}.snpts{font-size:38px;color:var(--accent,#f2c14e)}
.snrew{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.snr{display:flex;flex-direction:column;align-items:center;text-align:center;padding:10px 6px;border-radius:14px;background:var(--surface,#ffffff10);border:1px solid var(--line,#ffffff22)}.snr span svg{width:34px;height:34px}.snr b{font-size:13px}.snr small{font-size:11px;opacity:.7}
.snpod{display:flex;align-items:flex-end;justify-content:center;gap:10px;margin:8px 0 14px}.snpp{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;width:min(30%,150px);animation:snUp .6s cubic-bezier(.2,1.4,.4,1) both;animation-delay:var(--d)}.snpp b{font-size:14px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.snpp .num{font-weight:800}
.snstep{width:100%;border-radius:12px 12px 4px 4px;display:grid;place-items:center;font:800 26px var(--mono,monospace);color:#111}.p1 .snstep{height:92px;background:linear-gradient(#ffe27a,#d49a12)}.p2 .snstep{height:66px;background:linear-gradient(#f2f4f8,#9aa3b2)}.p3 .snstep{height:48px;background:linear-gradient(#e7b07a,#a8642c)}
.snpp{padding-top:26px}.snpp .av{width:58px;height:58px;font-size:24px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:var(--surface,#ffffff18);border:3px solid #9aa3b2;box-shadow:0 8px 20px -10px #000}.snpp .av img{width:100%;height:100%;object-fit:cover}.p1 .av{width:72px;height:72px;border-color:#d49a12;box-shadow:0 0 0 4px color-mix(in srgb,#ffe27a 35%,transparent),0 10px 26px -10px #000}.p3 .av{border-color:#a8642c}.sncrown{top:0}
.snpp.me b{color:var(--accent,#f2c14e)}.sncrown{position:absolute;top:-22px;font-size:24px;animation:snBob 2s ease-in-out infinite}@keyframes snBob{50%{transform:translateY(-4px) rotate(-6deg)}}@keyframes snUp{from{opacity:0;transform:translateY(30px)}}
.sncab{margin-top:16px}.sncab h3{font-size:20px;margin:0 0 8px}.sncabrow{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px}.sntro{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;text-align:center;padding:10px 12px;border-radius:14px;background:var(--surface,#ffffff10);border:1px solid var(--line,#ffffff22);min-width:118px}.sntroic svg{width:44px;height:44px}.sntro small{opacity:.75;font-size:11px}.sntro.champ{box-shadow:0 0 0 2px #d49a12 inset}
.bktabs{display:flex;gap:6px;margin:0 0 12px}
@media (max-width:520px){.snrew{grid-template-columns:repeat(2,1fr)}.snname{font-size:24px}.snme{text-align:left;justify-content:flex-start}}
@media (prefers-reduced-motion:reduce){.snglow,.sncrown,.snpp{animation:none}}`; document.head.appendChild(s); })();
/* ---------- season nudges: a card on the home screen (countdown, your place and points, the player just above you) and a note
   when someone has passed you since your last visit. Football and basketball both show it; it hides without the database. ---------- */
Season.nudge = async function () {
  if (typeof Board === "undefined" || Board.mode !== "rest") return; const col = document.querySelector("#homeToday .htcol"); if (!col || document.getElementById("htSeason")) return;
  const card = document.createElement("button"); card.type = "button"; card.className = "htcard htsmall htseason"; card.id = "htSeason"; card.dataset.snGo = "1";
  const m = this.month(); card.innerHTML = `<span class="htlabel">${SN_CUP("champ")} ${esc(this.name(m))} season</span><span class="fine">Ends in <b class="num">${this.left()}</b></span>`; col.prepend(card);
  if (!Account.signedIn) { card.insertAdjacentHTML("beforeend", '<span class="fine">Everyone starts on 1000. Sign in and win ranked games to climb.</span>'); return; }
  const [mine, rows] = await Promise.all([this.mine(m), this.board(m)]); if (!card.isConnected) return;
  if (!mine) { card.insertAdjacentHTML("beforeend", `<span class="htmatch"><b class="num">1000</b><small>not ranked yet: one ranked game puts you on the table${rows && rows.length ? ` with ${rows.length} other${rows.length === 1 ? "" : "s"}` : ""}</small></span>`); return; }
  const me = prof().nick, i = rows ? rows.findIndex((r) => r.nick === me) : -1, above = i > 0 ? rows[i - 1] : null;
  card.insertAdjacentHTML("beforeend", `<span class="htmatch"><b class="htbig num">${ord(mine.place)}</b><small>of ${mine.players} · <b class="num">${mine.pts}</b> pts</small></span><span class="fine">${above ? `${esc(above.nick)} is ${above.pts - mine.pts} point${above.pts - mine.pts === 1 ? "" : "s"} ahead` : mine.place === 1 ? "You're top. Stay there." : ""}</span>`);
  try { const k = "bk_sn_place_" + (typeof SPORT_KEY !== "undefined" ? SPORT_KEY : location.pathname.split("/")[1]) + "_" + m, was = +localStorage.getItem(k) || 0; localStorage.setItem(k, mine.place);
    if (was && mine.place > was && above) toast(`<b>${esc(above.nick)} passed you</b><br>You're ${ord(mine.place)} in the ${esc(this.name(m))} season now, ${above.pts - mine.pts} behind. Win one back.`); } catch (e) { /* storage blocked */ }
};
setTimeout(() => {
  if (typeof renderHome !== "function") return; const prev = renderHome;
  try { renderHome = function () { prev.apply(this, arguments); setTimeout(() => Season.nudge(), 50); }; } catch (e) { return; }
  if (document.getElementById("homeToday")) Season.nudge();
}, 0);
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-sn-go]"); if (!b) return; try { Snd.tick(); } catch (x) { /* quiet */ } S.btab = "season"; const slug = /basketball/.test(location.pathname) ? "nba" : "all-leagues"; go("games-" + slug + "-boards"); });
(() => { const s = document.createElement("style"); s.textContent = `.htseason .htlabel svg{width:18px;height:18px}.htseason{border-color:color-mix(in srgb,#d49a12 60%,var(--line))}.htseason .htbig{font-size:34px;color:var(--accent)}`; document.head.appendChild(s); })();
/* Your numbers in every sport, on one card in the football and basketball profiles (each build includes this file).
   All three sports live on the same site, so this reads each one's saved progress from this browser (football
   "arena-plays-v1", basketball "arena-nba-plays-v1", chess "bkc_*") and, when you're signed in, each ranked Elo from its own
   database schema. Nothing is estimated: a sport you haven't played says so.
   Also the player card: tap a name on a leaderboard or in Friends to see that player's public profile (online/schema_v14.sql). */
const AllStats = {
  read(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  sport(key) {
    const items = this.read(key); if (!items) return null;
    const p = items.profile || {}, plays = Object.entries(items).filter(([k]) => k.startsWith("p_")).map(([, v]) => v).filter((x) => x && x.res);
    let cur = 0, best = 0, yr = 0, mr = 0; plays.slice().sort((a, b) => (a.at < b.at ? -1 : 1)).forEach((x) => { if (x.pick === x.res) { yr++; cur++; best = Math.max(best, cur); } else cur = 0; if (x.mpick === x.res) mr++; });
    const days = Object.keys(p.days || {}).filter((d) => p.days[d] > 0);
    return { rounds: p.rounds || 0, xp: p.xp || 0, ach: Object.keys(p.ach || {}).length, n: plays.length, yr, mr, best, days: days.length, since: days.sort()[0] || null };
  },
  chess() {
    const g = (k, d) => { const v = this.read("bkc_" + k); return v == null ? d : v; };
    const rec = g("ai_rec", null), gym = g("gym_tot", null), bests = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("bkc_best_")) bests[k.slice(9)] = +this.read(k) || 0; } } catch (e) { /* blocked */ }
    if (!rec && !gym && !Object.keys(bests).length) return null;
    return { rec, gym, bests };
  },
  pct(a, n) { return n ? Math.round((a / n) * 100) + "%" : "–"; },
  tile(v, l) { return `<div class="asT"><b class="num">${v}</b><small>${l}</small></div>`; },
  html() {
    const fb = this.sport("arena-plays-v1"), bb = this.sport("arena-nba-plays-v1"), ch = this.chess();
    const ball = (s, name, cls, elo) => `<div class="asS ${cls}"><div class="asH"><span class="asIc">${cls === "fb" ? "⚽" : "🏀"}</span><b>${name}</b><span class="asElo" data-aselo="${elo}">Elo –</span></div>${s ? `<div class="asG">${this.tile(s.rounds.toLocaleString(), "rounds played")}${this.tile(s.n ? this.pct(s.yr, s.n) : "–", s.n ? `your calls right (${s.n})` : "no predictions yet")}${this.tile(s.n ? this.pct(s.mr, s.n) : "–", "the model on the same")}${this.tile(s.best, "best run of right calls")}${this.tile(s.days, "days played")}${this.tile(s.ach, "achievements")}</div>${s.n ? `<div class="asBar"><i style="--w:${(s.yr / s.n) * 100}%"></i><i class="m" style="--w:${(s.mr / s.n) * 100}%"></i></div><div class="fine">${s.yr > s.mr ? "You're ahead of the model." : s.yr === s.mr ? "Dead level with the model." : `The model leads by ${s.mr - s.yr}.`}</div>` : ""}` : '<div class="fine">Not played in this browser yet.</div>'}</div>`;
    const chessBox = `<div class="asS ch"><div class="asH"><span class="asIc">♞</span><b>Chess</b></div>${ch ? `<div class="asG">${ch.rec ? this.tile(`${ch.rec.w}-${ch.rec.d}-${ch.rec.l}`, "vs the coaches (W-D-L)") : this.tile("–", "no games vs the coaches")}${ch.gym ? this.tile(ch.gym.n, "opening gym lines") + this.tile(ch.gym.book, "book moves found") : ""}${Object.entries(ch.bests).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => this.tile(v, "best " + k.replace(/_/g, " "))).join("")}</div>` : '<div class="fine">Not played in this browser yet.</div>'}</div>`;
    setTimeout(() => this.elo(), 0);
    return `<div class="card asCard"><h3>Across every sport</h3><div class="asW">${ball(fb, "Football", "fb", "public")}${ball(bb, "Basketball", "bb", "nba")}${chessBox}</div><div class="row" style="margin-top:8px;align-items:center;gap:10px"><div class="fine" style="flex:1">From this browser's saved progress; ranked Elo comes from your account.</div><button type="button" class="btn ghost" data-mylink="1">Copy my profile link</button></div></div>`;
  },
  async elo() {
    if (typeof Account === "undefined" || !Account.signedIn || typeof Board === "undefined" || Board.mode !== "rest") return; const t = await Account.token(); if (!t) return;
    for (const s of ["public", "nba"]) { const el = document.querySelector(`[data-aselo="${s}"]`); if (!el) continue; try { const r = await fetch(`${Board.cfg.url}/rest/v1/rpc/my_rating`, { method: "POST", headers: NameSync.hdr(Board.cfg, t, s), body: "{}" }); const j = r.ok ? await r.json() : null; el.textContent = j && j[0] && j[0].games ? `Elo ${j[0].elo}` : "unranked"; } catch (e) { /* offline */ } }
  },
};
/* ---------- player card: anyone's public profile ---------- */
const PCard = {
  async open(nick) {
    if (typeof modal !== "function") return; modal(`<div class="pcBox"><div class="pcTop"><div class="skel" style="height:90px"></div></div></div>`);
    let r = null; try { const t = Account.signedIn ? await Account.token() : null; const x = await fetch(`${Board.cfg.url}/rest/v1/rpc/player_card`, { method: "POST", headers: t ? Account.hdr(t) : Board.headers(), body: JSON.stringify({ p_nick: nick }) }); r = x.status === 404 ? "missing" : x.ok ? ((await x.json())[0] || "none") : null; } catch (e) { r = null; }
    const box = document.querySelector(".pcBox"); if (!box) return;
    if (r === "missing") { box.innerHTML = `<h2>${esc(nick)}</h2><p class="fine">Player cards need the latest database update (online/schema_v14.sql).</p><div class="row"><button class="btn ghost" id="modalClose" type="button">Close</button></div>`; return; }
    if (r === "none") { box.innerHTML = `<h2>${esc(nick)}</h2><p class="fine">No player with that name here. They may be on another sport, or have changed it.</p><div class="row"><button class="btn ghost" id="modalClose" type="button">Close</button></div>`; return; }
    if (!r) { box.innerHTML = `<h2>${esc(nick)}</h2><p class="fine">Couldn't load this player. Try again in a moment.</p><div class="row"><button class="btn ghost" id="modalClose" type="button">Close</button></div>`; return; }
    const on = r.last_seen && Date.now() - new Date(r.last_seen) < 180000, form = (r.form || []).slice(-10);
    box.innerHTML = `<div class="pcTop"><div class="pcAv ${on ? "on" : ""}">${avatarHTML(r.avatar, "xl", r.nick)}</div><div><h2>${esc(r.nick)}${badgesHTML(r.badges)}</h2><div class="fine">${on ? '<span class="pcDot"></span>Online now' : r.last_seen ? "Last seen " + new Date(r.last_seen).toLocaleDateString() : ""}</div><div class="pcRank">${rankTag(r.elo)} <b class="num">${r.elo}</b> Elo · ${esc(rankOf(r.elo).name)}</div></div></div>
      <div class="asG">${AllStats.tile(r.games, "ranked games")}${AllStats.tile(AllStats.pct(r.wins, r.games), "won")}${AllStats.tile(r.season_pts != null ? r.season_pts : "–", "season points")}${AllStats.tile(r.season_place ? ord(r.season_place) : "–", "this season")}</div>
      ${form.length ? `<div class="pcForm"><span class="fine">Last ${form.length}</span>${form.map((d) => `<i class="${d > 0 ? "w" : d < 0 ? "l" : "d"}" title="${d > 0 ? "+" : ""}${d}">${d > 0 ? "W" : d < 0 ? "L" : "D"}</i>`).join("")}</div>` : ""}
      ${r.fav_player || r.fav_team ? `<div class="fine" style="margin-top:8px">${r.fav_player ? "Favourite player: <b>" + esc(r.fav_player) + "</b>" : ""}${r.fav_player && r.fav_team ? " · " : ""}${r.fav_team ? "Supports <b>" + esc(r.fav_team) + "</b>" : ""}</div>` : ""}
      <div id="pcH2H" class="pcH2H"></div>
      <div class="row" style="margin-top:14px">${r.nick !== prof().nick && Account.signedIn ? `<button class="btn" data-pcadd="${esc(r.nick)}" type="button">Add friend</button><button class="btn ghost" data-pcchal="${esc(r.nick)}" type="button">Challenge</button>` : ""}<button class="btn ghost" id="modalClose" type="button">Close</button></div>`;
    if (Account.signedIn && r.nick !== prof().nick) PCard.h2h(r.nick);
  },
  /* your lifetime ranked record against this player, per game (online/schema_v15.sql) */
  async h2h(nick) {
    const rows = await Ranked.rpc("head_to_head", { p_nick: nick }), el = document.getElementById("pcH2H"); if (!el) return;
    if (rows === null) return;   /* the function is not installed yet: show nothing rather than an error */
    if (!rows.length) { el.innerHTML = `<div class="fine">You haven't played ${esc(nick)} in ranked yet.</div>`; return; }
    const w = rows.reduce((a, x) => a + x.wins, 0), l = rows.reduce((a, x) => a + x.losses, 0), d = rows.reduce((a, x) => a + x.draws, 0), lead = w > l ? "You lead" : w < l ? esc(nick) + " leads" : "All square";
    el.innerHTML = `<div class="pcVs"><b>You vs ${esc(nick)}</b><span class="num pcVsN">${w}W ${l}L${d ? " " + d + "D" : ""}</span><small>${lead}</small></div>${rows.length > 1 || rows[0].game !== "any" ? `<div class="pcVsG">${rows.slice(0, 5).map((x) => `<span>${esc(typeof rkName === "function" ? rkName(x.game) : x.game)} <b class="num">${x.wins}-${x.losses}${x.draws ? "-" + x.draws : ""}</b></span>`).join("")}</div>` : ""}`;
  },
};
document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-pc]")) { e.preventDefault(); PCard.open(e.target.dataset.pc); } });
document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest("[data-pc]"); if (a && !e.target.closest("button:not([data-pc])")) { e.preventDefault(); try { Snd.tick(); } catch (x) { /* quiet */ } PCard.open(a.dataset.pc); return; }
  const f = e.target.closest && e.target.closest("[data-pcadd]"); if (f) { f.disabled = true; Ranked.rpcx("add_friend", { p_nick: f.dataset.pcadd }).then((r) => { f.textContent = r.ok && r.data === "ok" ? "Added" : r.ok && r.data === "exists" ? "Already friends" : "Couldn't add"; }); }
});
(() => { const s = document.createElement("style"); s.textContent = `
.asW{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.asS{border-radius:16px;padding:12px;border:1px solid var(--line,#ffffff22);background:var(--surface,#ffffff0d);position:relative;overflow:hidden}
.asS::before{content:"";position:absolute;inset:0 0 auto;height:4px}.asS.fb::before{background:linear-gradient(90deg,#3ddc84,#f2c14e)}.asS.bb::before{background:linear-gradient(90deg,#ff8a3d,#e94560)}.asS.ch::before{background:linear-gradient(90deg,#c9a46a,#6b4f2a)}
.asH{display:flex;align-items:center;gap:8px;margin-bottom:8px}.asIc{font-size:20px}.asH b{font-size:16px;flex:1}.asElo{font:700 12px var(--mono,monospace);padding:3px 8px;border-radius:999px;background:var(--surface,#ffffff14);border:1px solid var(--line,#ffffff22)}
.asG{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.asT{padding:8px;border-radius:10px;background:var(--bg2,#00000014)}.asT b{display:block;font-size:20px}.asT small{font-size:11px;opacity:.75;line-height:1.2;display:block}
.asBar{position:relative;height:8px;border-radius:99px;background:var(--line,#ffffff22);margin:8px 0 4px;overflow:hidden}.asBar i{position:absolute;left:0;top:0;bottom:0;width:var(--w);background:var(--accent,#f2c14e);border-radius:99px;animation:asGrow .9s cubic-bezier(.2,.8,.2,1) both}.asBar i.m{top:5px;background:#8a93a8;opacity:.9}@keyframes asGrow{from{width:0}}
.pcBox h2{margin:0;font-size:26px}.pcTop{display:flex;gap:14px;align-items:center;margin:-6px -6px 12px;padding:14px;border-radius:18px;background:radial-gradient(circle at 15% 30%,color-mix(in srgb,var(--accent,#f2c14e) 38%,transparent),transparent 60%),linear-gradient(135deg,color-mix(in srgb,var(--accent,#f2c14e) 18%,transparent),transparent)}.pcAv{position:relative}.pcAv.on::after{content:"";position:absolute;right:4px;bottom:4px;width:14px;height:14px;border-radius:50%;background:#3ddc84;border:3px solid var(--card,#141b17)}
.pcDot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#3ddc84;margin-right:6px;animation:snPulse 1.6s infinite}.pcRank{margin-top:4px}.pcBox .asG{grid-template-columns:repeat(4,1fr)}
.pcForm{display:flex;gap:4px;align-items:center;margin-top:10px;flex-wrap:wrap}.pcForm i{font:800 11px var(--mono,monospace);font-style:normal;width:22px;height:22px;display:grid;place-items:center;border-radius:6px;color:#111}.pcForm i.w{background:#3ddc84}.pcForm i.l{background:#ff7a7a}.pcForm i.d{background:#c9d1e0}
.pcVs{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:12px;padding:10px 12px;border-radius:14px;background:color-mix(in srgb,var(--accent,#f2c14e) 14%,transparent)}.pcVsN{font-size:22px}.pcVsG{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:12px}.pcVsG span{padding:3px 9px;border-radius:999px;background:color-mix(in srgb,var(--ink) 8%,transparent)}
[data-pc]{cursor:pointer}[data-pc]:hover{filter:brightness(1.08)}[data-pc]:focus-visible{outline:3px solid var(--accent,#f2c14e);outline-offset:2px;border-radius:12px}
@media (max-width:640px){.asW{grid-template-columns:1fr}.pcBox .asG{grid-template-columns:repeat(2,1fr)}}`; document.head.appendChild(s); })();
/* ---------- profile hero: the top of the profile page, shared by football and basketball ----------
   A banner in your colours with a slow light sweep, your picture inside a ring that fills with your progress to the next
   level, your name, badges and level, then counters that roll up (Elo, streak, achievements, XP, rounds), your best medals
   and your season trophies. */
const PHero = {
  html(o) {
    const tile = (v, l, ic, id) => `<div class="phT"><span class="phTi">${ic}</span><b class="num phN" ${id ? `id="${id}"` : ""} data-to="${typeof v === "number" ? v : ""}">${typeof v === "number" ? 0 : v}</b><small>${l}</small></div>`;
    const cab = (() => { try { const s = prof().rseasons || {}; return Object.keys(s).filter((k) => s[k]).sort().reverse().slice(0, 4).map((k) => { const f = s[k], t = Season.tier(f) || ["played"]; return `<span class="phCup" title="${esc(Season.name(k))}: ${ord(f.place)} of ${f.players}">${SN_CUP(t[0])}</span>`; }).join(""); } catch (e) { return ""; } })();
    setTimeout(() => this.roll(), 60);
    return `<div class="phero"><div class="phSweep" aria-hidden="true"></div><div class="phRankBg" aria-hidden="true">${o.rankIcon || ""}</div>
      <div class="phTop"><div class="phAv" style="--p:${Math.max(0, Math.min(100, o.pct || 0))}"><span class="phRing"></span>${o.av}<span class="phLv" title="Level">${esc(o.levelShort || "")}</span></div>
        <div class="phId"><h1>${o.name}${o.badges || ""}</h1><div class="phLevel"><b>${esc(o.level)}</b> · ${o.xp.toLocaleString()} XP · ${o.next}</div><div class="phBar"><i style="--w:${o.pct || 0}%"></i></div><div class="phChips">${o.fav || ""}</div></div>
        ${o.medals && o.medals.length || cab ? `<div class="phShelf">${cab ? `<div class="phCups">${cab}</div>` : ""}${o.medals && o.medals.length ? `<div class="phMedals">${o.medals.join("")}</div>` : ""}<small>${cab ? "Seasons" : ""}${cab && o.medals.length ? " · " : ""}${o.medals.length ? "Best medals" : ""}</small></div>` : ""}</div>
      <div class="phTiles">${o.elo != null ? tile(o.elo, `Elo · ${o.rank || ""}`, "🏆", "pfElo") : tile("–", "Elo · sign in to play ranked", "🏆", "pfElo")}${tile(o.streak, "day streak", "🔥")}${tile(o.won, `of ${o.total} achievements`, "🏅")}${tile(o.xp, "XP", "⚡")}${tile(o.rounds, "rounds played", "🎯")}</div></div>`;
  },
  roll() {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelectorAll(".phero .phN").forEach((el, i) => { const to = +el.dataset.to; if (el.dataset.to === "" || isNaN(to)) return; if (reduce || to === 0) { el.textContent = to.toLocaleString(); return; }
      const t0 = performance.now() + i * 90, d = 900; (function step(t) { if (!el.isConnected) return; const k = Math.max(0, Math.min(1, (t - t0) / d)), e = 1 - Math.pow(1 - k, 3); if (el.dataset.to !== String(to)) return; el.textContent = Math.round(to * e).toLocaleString(); if (k < 1) requestAnimationFrame(step); })(performance.now()); });
  },
};
(() => { const s = document.createElement("style"); s.textContent = `
.phero{position:relative;overflow:hidden;border-radius:26px;padding:22px;margin-bottom:16px;border:1px solid var(--line,#ffffff22);background:radial-gradient(120% 140% at 0% 0%,color-mix(in srgb,var(--accent,#f2c14e) 34%,transparent),transparent 55%),radial-gradient(90% 120% at 100% 100%,color-mix(in srgb,var(--accent,#f2c14e) 16%,transparent),transparent 60%),var(--surface,#ffffff0d)}
.phSweep{position:absolute;inset:-50% -20%;background:linear-gradient(105deg,transparent 40%,#ffffff1f 50%,transparent 60%);animation:phSweep 7s ease-in-out infinite;pointer-events:none}@keyframes phSweep{0%{transform:translateX(-60%)}60%,100%{transform:translateX(60%)}}
.phRankBg{position:absolute;right:-30px;top:-30px;width:220px;height:220px;opacity:.09;pointer-events:none;transform:rotate(-12deg)}.phRankBg svg,.phRankBg .ic{width:100%;height:100%}
.phTop{position:relative;display:flex;gap:18px;align-items:center;flex-wrap:wrap}.phAv{position:relative;width:112px;height:112px;display:grid;place-items:center;flex:0 0 auto}
.phRing{position:absolute;inset:0;border-radius:50%;background:conic-gradient(var(--accent,#f2c14e) calc(var(--p) * 1%),color-mix(in srgb,var(--ink,#fff) 14%,transparent) 0);-webkit-mask:radial-gradient(circle,transparent 58%,#000 59%);mask:radial-gradient(circle,transparent 58%,#000 59%);animation:phRing 1.2s cubic-bezier(.2,.8,.2,1) both}@keyframes phRing{from{transform:rotate(-90deg);opacity:0}}
.phAv .av{width:92px!important;height:92px!important;font-size:36px}.phLv{position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);font:800 10px var(--mono,monospace);letter-spacing:.08em;padding:3px 8px;border-radius:999px;background:var(--accent,#f2c14e);color:#111;white-space:nowrap;text-transform:uppercase}
.phId{flex:1;min-width:200px}.phId h1{margin:0;font-size:clamp(28px,5vw,44px);line-height:1.05}.phLevel{opacity:.85;font-size:14px;margin-top:4px}.phBar{height:8px;border-radius:99px;background:color-mix(in srgb,var(--ink,#fff) 12%,transparent);margin:8px 0;overflow:hidden;max-width:420px}.phBar i{display:block;height:100%;width:var(--w);border-radius:99px;background:linear-gradient(90deg,var(--accent,#f2c14e),color-mix(in srgb,var(--accent,#f2c14e) 50%,#fff));animation:asGrow 1.1s cubic-bezier(.2,.8,.2,1) both}
.phChips{display:flex;gap:6px;flex-wrap:wrap}.phShelf{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 12px;border-radius:18px;background:color-mix(in srgb,var(--ink,#fff) 6%,transparent);border:1px solid var(--line,#ffffff22)}.phShelf small{font-size:11px;opacity:.7}
.phCups,.phMedals{display:flex;gap:6px}.phCup svg{width:38px;height:38px;filter:drop-shadow(0 3px 4px #0005)}.phMedals>*{transform:scale(1.1)}
.phTiles{position:relative;display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:16px}.phT{padding:10px 12px;border-radius:16px;background:color-mix(in srgb,var(--ink,#fff) 6%,transparent);border:1px solid var(--line,#ffffff22);animation:htIn .6s cubic-bezier(.2,1.2,.4,1) both}.phT:nth-child(2){animation-delay:.06s}.phT:nth-child(3){animation-delay:.12s}.phT:nth-child(4){animation-delay:.18s}.phT:nth-child(5){animation-delay:.24s}
.phTi{font-size:18px}.phT b{display:block;font-size:26px;line-height:1.1}.phT small{font-size:11.5px;opacity:.75;display:block;line-height:1.25}@keyframes htIn{from{transform:translateY(14px);opacity:0}}
@media (max-width:640px){.phTiles{grid-template-columns:repeat(2,1fr)}.phT:last-child{grid-column:1/-1}.phAv{width:92px;height:92px}.phAv .av{width:74px!important;height:74px!important}}
@media (prefers-reduced-motion:reduce){.phSweep,.phRing,.phBar i,.phT{animation:none}}`; document.head.appendChild(s); })();
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
  busy() { return [...document.body.children].some((e) => { if (e.id === "bkInst" || e.offsetHeight < innerHeight * 0.6 || e.offsetWidth < innerWidth * 0.8) return false; const c = getComputedStyle(e); return c.position === "fixed" && c.display !== "none" && c.visibility !== "hidden" && c.pointerEvents !== "none" && +c.opacity > 0.1; }); },
  show() {
    if (this.standalone() || this.snoozed() || document.getElementById("bkInst") || location.protocol !== "https:" && !/localhost|127\.0\.0\.1/.test(location.hostname)) return;
    if (!this.dp && !this.ios()) return;
    if (this.busy()) { clearTimeout(this.again); this.again = setTimeout(() => this.show(), 15000); return; }   // never on top of a dialog or the first-visit look picker
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
#bkInst .bkiGo{font:700 14px inherit;padding:9px 14px;border-radius:12px;border:0;background:var(--accent,#f2c14e);color:var(--on-accent,#111);cursor:pointer}#bkInst .bkiX{background:none;border:0;color:inherit;opacity:.6;font-size:16px;cursor:pointer;padding:6px}
@keyframes bkiIn{from{opacity:0;transform:translate(-50%,30px)}}
#bkInstIos{position:fixed;inset:0;z-index:100001;background:#000a;display:flex;align-items:flex-end;justify-content:center;padding:16px}#bkInstIos .bkib{background:#141b17;color:#f4f1ea;border-radius:20px;padding:18px 20px;width:min(440px,100%);border:1px solid #ffffff2a}
#bkInstIos h3{margin:0 0 8px;font-size:19px}#bkInstIos ol{margin:0 0 12px;padding-left:20px;line-height:1.7}#bkInstIos svg{vertical-align:-3px}#bkInstIos button{font:700 15px inherit;padding:10px 18px;border-radius:12px;border:0;background:var(--accent,#f2c14e);color:var(--on-accent,#111)}`; document.head.appendChild(s); })();
/* Accessibility: a "Skip to content" button, the first thing keyboard users reach, shown only when focused. It's a button
   rather than a #link because the sites route by the address hash. It moves focus to the visible main area. */
(() => {
  const go = () => { const t = [...document.querySelectorAll("#league:not([hidden]) #room, #league:not([hidden]), #home:not([hidden]), #profilePage:not([hidden]), main, #app")].find((x) => x.offsetParent !== null || x.tagName === "MAIN"); if (!t) return; if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: false }); };
  const add = () => { if (document.getElementById("bkSkip")) return; const b = document.createElement("button"); b.id = "bkSkip"; b.type = "button"; b.textContent = "Skip to content"; b.onclick = go; document.body.prepend(b); };
  if (document.body) add(); else addEventListener("DOMContentLoaded", add);
  const s = document.createElement("style"); s.textContent = "#bkSkip{position:fixed;left:12px;top:-60px;z-index:100002;padding:10px 16px;border-radius:12px;border:0;background:var(--accent,#f2c14e);color:var(--on-accent,#111);font:700 15px system-ui,sans-serif;transition:top .2s}#bkSkip:focus{top:12px;outline:3px solid #fff;outline-offset:2px}[tabindex='-1']:focus{outline:none}"; document.head.appendChild(s);
})();
/* In-game feedback for every quiz in football and basketball (each build includes this file).
   Both sites play Snd.right() for a right answer and Snd.wrong() for a wrong one, so this wraps those two calls:
   - right: a burst of sparks from the answer you tapped, a green glow on it, and a combo counter that appears from three in a row
     (with flames from five, and a bigger burst at 5, 10, 15...);
   - wrong: the answer you tapped shakes, the screen edge flashes red, and the combo resets.
   Changing game resets the combo too. Reduced motion (the device setting or the site's) turns it all off. */
const GFX = {
  last: null, lastAt: 0, combo: 0, best: 0, where: "",
  calm() { return matchMedia("(prefers-reduced-motion: reduce)").matches || (typeof REDUCED !== "undefined" && REDUCED); },
  target() { const t = this.last; return t && t.isConnected && Date.now() - this.lastAt < 2500 ? t : null; },
  burst(el, n, big) {
    const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2 - 20, top: innerHeight / 2 - 20, width: 40, height: 40 }, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const box = document.createElement("div"); box.className = "gfxB"; box.style.left = cx + "px"; box.style.top = cy + "px";
    const cols = ["#5ee6a8", "#ffd23f", "#ffffff", "var(--accent,#f2c14e)"];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = (big ? 90 : 55) + Math.random() * (big ? 70 : 35), s = document.createElement("i"); s.style.setProperty("--x", Math.cos(a) * d + "px"); s.style.setProperty("--y", Math.sin(a) * d + "px"); s.style.background = cols[i % cols.length]; s.style.animationDelay = Math.random() * 60 + "ms"; if (big && i % 3 === 0) s.className = "st"; box.appendChild(s); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 900);
  },
  pill() {
    let p = document.getElementById("gfxCombo"); if (this.combo < 3) { if (p) { p.classList.add("out"); setTimeout(() => p && p.remove(), 300); } return; }
    if (!p) { p = document.createElement("div"); p.id = "gfxCombo"; document.body.appendChild(p); }
    p.className = this.combo >= 10 ? "hot2" : this.combo >= 5 ? "hot" : ""; p.innerHTML = `${this.combo >= 5 ? '<span class="gfxFl">🔥</span>' : ""}<b class="num">${this.combo}</b><small>in a row</small>`;
    p.style.animation = "none"; void p.offsetWidth; p.style.animation = "";
  },
  right() {
    const here = location.hash; if (here !== this.where) { this.where = here; this.combo = 0; }
    this.combo++; this.best = Math.max(this.best, this.combo); if (this.calm()) return;
    const el = this.target(), milestone = this.combo >= 5 && this.combo % 5 === 0;
    this.burst(el, milestone ? 26 : 12, milestone); if (el) { el.classList.remove("gfxOk", "gfxNo"); void el.offsetWidth; el.classList.add("gfxOk"); setTimeout(() => el.classList.remove("gfxOk"), 900); }
    this.pill();
  },
  wrong() {
    const here = location.hash; if (here !== this.where) { this.where = here; } this.combo = 0; this.pill(); if (this.calm()) return;
    const el = this.target(); if (el) { el.classList.remove("gfxOk", "gfxNo"); void el.offsetWidth; el.classList.add("gfxNo"); setTimeout(() => el.classList.remove("gfxNo"), 600); }
    const v = document.createElement("div"); v.className = "gfxV"; document.body.appendChild(v); setTimeout(() => v.remove(), 700);
  },
};
addEventListener("pointerdown", (e) => { const t = e.target.closest && e.target.closest("button, [role=button], .opt, .pick, .tile, a"); if (t) { GFX.last = t; GFX.lastAt = Date.now(); } }, true);
addEventListener("keydown", (e) => { if (e.key === "Enter") { GFX.last = document.activeElement; GFX.lastAt = Date.now(); } }, true);
addEventListener("hashchange", () => { GFX.combo = 0; GFX.pill(); });
setTimeout(() => {
  if (typeof Snd === "undefined" || Snd.__gfx) return; Snd.__gfx = true;
  const r = Snd.right, w = Snd.wrong;
  if (r) Snd.right = function () { try { GFX.right(); } catch (e) { /* visuals only */ } return r.apply(this, arguments); };
  if (w) Snd.wrong = function () { try { GFX.wrong(); } catch (e) { /* visuals only */ } return w.apply(this, arguments); };
}, 0);
(() => { const s = document.createElement("style"); s.textContent = `
.gfxB{position:fixed;z-index:9500;pointer-events:none;width:0;height:0}.gfxB i{position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;animation:gfxFly .75s cubic-bezier(.15,.8,.3,1) forwards}.gfxB i.st{width:12px;height:12px;border-radius:2px;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
@keyframes gfxFly{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--x),var(--y)) scale(.2);opacity:0}}
.gfxOk{animation:gfxOk .8s cubic-bezier(.2,1.4,.4,1)!important;box-shadow:0 0 0 3px #5ee6a8,0 0 28px -2px #5ee6a8!important}@keyframes gfxOk{30%{transform:scale(1.06)}}
.gfxNo{animation:gfxNo .5s cubic-bezier(.36,.07,.19,.97)!important;box-shadow:0 0 0 3px #ff6b6b!important}@keyframes gfxNo{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-7px)}40%,60%{transform:translateX(7px)}}
.gfxV{position:fixed;inset:0;z-index:9400;pointer-events:none;box-shadow:inset 0 0 90px 10px #ff3b3b88;animation:gfxV .65s ease-out forwards}@keyframes gfxV{from{opacity:1}to{opacity:0}}
#gfxCombo{position:fixed;z-index:9450;right:16px;top:88px;display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;background:#141b17ee;color:#fff;border:2px solid #5ee6a8;box-shadow:0 10px 26px -10px #000;animation:gfxPop .45s cubic-bezier(.2,1.6,.4,1);pointer-events:none}
#gfxCombo b{font-size:22px;line-height:1}#gfxCombo small{font-size:11px;opacity:.8;text-transform:uppercase;letter-spacing:.08em}#gfxCombo.hot{border-color:#ffb21f;box-shadow:0 0 24px -4px #ff8a3d}#gfxCombo.hot2{border-color:#ff4d4d;box-shadow:0 0 34px -2px #ff4d4d;background:linear-gradient(90deg,#3a0d0d,#141b17)}
#gfxCombo.out{opacity:0;transform:scale(.6);transition:.25s}.gfxFl{font-size:20px;display:inline-block;animation:gfxFl .5s ease-in-out infinite alternate}@keyframes gfxFl{to{transform:scale(1.18) rotate(-8deg)}}@keyframes gfxPop{from{transform:scale(.4);opacity:0}}
@media (prefers-reduced-motion:reduce){.gfxB,.gfxV{display:none}}`; document.head.appendChild(s); })();
/* The games page, redesigned (football and basketball; each build includes this file).
   Before, "Games" opened four folders (ballknowledge originals, Beat the Model, Weekly tournament, Play online) and the games sat
   one level further in, so new players had to guess which folder held what. Now every game is on one page, with filter chips
   (Quizzes, Predict real games, Daily, With a friend, Online) and a search box. The old folder pages still work for links. */
const GG = { f: "all", q: "" };
const GG_FILTERS = [["all", "All games"], ["quiz", "Quizzes"], ["predict", "Predict real games"], ["daily", "Daily"], ["friend", "With a friend"], ["online", "Online"]];
function ggItems() {
  const ids = typeof GAME_IDS !== "undefined" ? GAME_IDS : null, seen = new Set(), out = [];
  const add = (g, kind) => { if (!g || !g.id || seen.has(g.id)) return; seen.add(g.id); out.push({ ...g, kind }); };
  (typeof QUIZ_GAMES !== "undefined" ? QUIZ_GAMES : []).forEach((g) => add(g, "quiz"));
  (typeof GAMES !== "undefined" ? GAMES : []).forEach((g) => add(g, "predict"));
  const nba = typeof DATA !== "undefined" && DATA.sport === "nba";
  if (!nba) add({ id: "@weekly", name: "Weekly tournament", tag: "Predict the exact score of this week's real Big 5 matches. 3 points for the score, 2 for the winner, 1 for the goals.", modes: "Everyone · this week", group: "weekly" }, "x");
  add({ id: "@ranked", name: "Ranked online", tag: "Real opponents, Elo and a monthly season. Quick match finds someone near your level.", modes: "Online · 1 v 1", group: "ranked" }, "x");
  if (!nba) add({ id: "@live", name: "Live scores", tag: "Today's real matches as they happen, with the model's prediction beside each one.", modes: "Live", group: "live" }, "x");
  return out.map((g) => {
    const m = (g.modes || "") + " " + (g.name || ""), t = new Set();
    if (g.kind === "quiz") t.add("quiz"); if (g.kind === "predict") t.add("predict");
    if (/daily|weekly/i.test(g.id + " " + g.name)) t.add("daily");
    if (/2 players|two|friend|1 v 1|duel/i.test(m) || ["ttt", "roulette"].includes(g.id)) t.add("friend");
    if (g.group) { t.add("online"); if (g.group === "weekly") t.add("predict"); }
    return { ...g, tags: t };
  });
}
function renderGameGrid() {
  const c = S.code || "ALL", clubs = Object.keys(CREST), pick = (k) => [0, 1, 2].map((j) => clubs[hash(`${c}-${k}-${j}`) % clubs.length]);
  const all = ggItems(), q = GG.q.trim().toLowerCase(), list = all.filter((g) => (GG.f === "all" || g.tags.has(GG.f)) && (!q || (g.name + " " + g.tag + " " + (g.modes || "")).toLowerCase().includes(q)));
  const icon = (g, k) => g.group ? `<span class="rkbig"><svg class=ic><use href=#i-${g.group === "live" ? "live" : "trophy"}></use></svg></span>` : g.faces ? g.faces(pick(k)) : pick(k).map((t) => badge(t, "md")).join("");
  const chip = (g) => [...g.tags].filter((x) => x !== "all").map((x) => `<span class="ggt t-${x}">${esc((GG_FILTERS.find((f) => f[0] === x) || [, x])[1].replace("Predict real games", "Predict"))}</span>`).join("");
  const card = (g, k) => `<button type="button" class="gcard ggc" ${g.group ? `data-group="${g.group}"` : `data-game="${g.id}"`} style="--d:${Math.min(k, 12) * 40}ms"><div class="gfaces">${icon(g, k)}</div>${typeof favPill === "function" && !g.group ? favPill(g.id) : ""}<div class="gname">${esc(g.name)}</div><div class="ggtags">${chip(g)}</div><div class="gtag">${esc(g.tag || "")}</div>${!g.group && typeof recordLine === "function" ? `<div class="grec num">${esc(recordLine(c, g.id) || "")}</div>` : ""}</button>`;
  const where = typeof lgOf === "function" && c !== "ALL" ? ` · ${esc(lgOf(c).name)}` : "";
  $("#room").innerHTML = `<div class="gghead"><div><h2 class="sec" style="margin:0">Play</h2><p class="secsub" style="margin:4px 0 0">${all.length} games${where}. Tap one to start; you pick difficulty and solo or two players inside.</p></div><label class="ggsearch"><svg class=ic><use href=#i-search></use></svg><input id="ggQ" type="search" placeholder="Find a game" value="${esc(GG.q)}" aria-label="Find a game" autocomplete="off"></label></div>
    <div class="ggfil" role="tablist" aria-label="Filter games">${GG_FILTERS.map(([k, n]) => `<button type="button" class="chip" role="tab" data-ggf="${k}" aria-pressed="${GG.f === k}" aria-selected="${GG.f === k}">${n} <span class="ggn">${k === "all" ? all.length : all.filter((g) => g.tags.has(k)).length}</span></button>`).join("")}</div>
    ${GG.f === "all" && !q && typeof forYouHTML === "function" ? forYouHTML() : ""}
    <div class="hub ggrid">${list.map(card).join("") || `<div class="fine" style="padding:20px">No game matches "${esc(GG.q)}".</div>`}</div>`;
  const inp = document.getElementById("ggQ"); if (inp && GG.focus) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); GG.focus = false; }
}
setTimeout(() => {
  if (typeof renderHub !== "function") return; const prev = renderHub;
  try { renderHub = function () { if (GG.fromGrid && (S.hubGroup === "bk" || S.hubGroup === "model")) { S.hubGroup = null; } if (!S.hubGroup) return renderGameGrid(); return prev.apply(this, arguments); }; } catch (e) { return; }   /* leaving a game you opened from the grid comes back to the grid, not to an old folder page */
  if (S.mode === "games" && S.room === "play" && !S.game && !S.hubGroup && document.getElementById("room")) renderGameGrid();
}, 0);
document.addEventListener("click", (e) => { const g = e.target.closest && e.target.closest("[data-game],[data-group]"); if (g) GG.fromGrid = !!g.closest(".ggrid") || (GG.fromGrid && !!g.dataset.game); }, true);
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-ggf]"); if (!b) return; e.stopPropagation(); GG.f = b.dataset.ggf; try { Snd.tick(); } catch (x) { /* quiet */ } renderGameGrid(); }, true);
document.addEventListener("input", (e) => { if (e.target.id !== "ggQ") return; GG.q = e.target.value; GG.focus = true; renderGameGrid(); });
(() => { const s = document.createElement("style"); s.textContent = `
.gghead{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.ggsearch{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:14px;border:1px solid var(--line);background:var(--surface);min-width:min(260px,100%)}
.ggsearch .ic{width:18px;height:18px;opacity:.6}.ggsearch input{border:0;background:transparent;color:var(--ink);font:inherit;outline:none;width:100%}.ggsearch:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 25%,transparent)}
.ggfil{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px}.ggfil .ggn{font:700 11px var(--mono);opacity:.65;margin-left:2px}
.ggtags{display:flex;gap:4px;flex-wrap:wrap;margin:2px 0 4px}.ggt{font:700 10px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;padding:4px 7px;border-radius:999px;background:color-mix(in srgb,var(--ink) 8%,transparent)}
.ggt.t-quiz{background:color-mix(in srgb,#7c5cff 22%,transparent)}.ggt.t-predict{background:color-mix(in srgb,#1fa463 24%,transparent)}.ggt.t-daily{background:color-mix(in srgb,#f2c14e 30%,transparent)}.ggt.t-friend{background:color-mix(in srgb,#ff8a3d 26%,transparent)}.ggt.t-online{background:color-mix(in srgb,#38bdf8 26%,transparent)}
.ggrid .ggc{animation:fadein .35s both;animation-delay:var(--d)}`; document.head.appendChild(s); })();
/* On game pages the league header shrinks to a slim bar (league name, small emblem, the league chips), so the games sit near the
   top instead of under a page-sized banner. Model pages keep the big header. */
(() => {
  const mark = () => { const h = location.hash.replace("#", ""); document.documentElement.dataset.sec = h === "games" || h.startsWith("games-") ? "games" : ""; };
  mark(); addEventListener("hashchange", mark);
  const s = document.createElement("style"); s.textContent = `
html[data-sec=games] #league .lhead{padding-top:8px;padding-bottom:8px;min-height:0}
html[data-sec=games] #league .lhead h1#lName{font-size:clamp(24px,3.6vw,34px);line-height:1.1;margin:0}
html[data-sec=games] #league #lTag{display:none}
html[data-sec=games] #league .lid .emblem,html[data-sec=games] #league .lid svg.emblem,html[data-sec=games] #league .lid img{max-width:44px;max-height:44px}
html[data-sec=games] #league .lid{gap:10px}
html[data-sec=games] #scope:not(:empty)::before{content:"League";font:700 11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;opacity:.6;align-self:center;margin-right:4px}`;
  document.head.appendChild(s);
})();
/* Header: the icon-only buttons get a word under the icon (Album, Search, Settings, Streak), so nobody has to guess. */
(() => {
  const label = () => { const bar = document.querySelector(".bar"); if (!bar) return;
    [["#searchBtn", "Search"], ["#settingsBtn", "Settings"], ['[aria-label="Your sticker album"],[title="Your sticker album"]', "Album"], ["#loginStreak", "Streak"]].forEach(([sel, txt]) => { const b = bar.querySelector(sel); if (b && !b.querySelector(".hlab")) { b.classList.add("hlabbed"); b.insertAdjacentHTML("beforeend", `<span class="hlab" aria-hidden="true">${txt}</span>`); } }); };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", label); else setTimeout(label, 0);
  setTimeout(label, 1500);
  const s = document.createElement("style"); s.textContent = `.bar .hlabbed{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;height:auto!important;min-height:38px;padding-top:4px!important;padding-bottom:3px!important}.bar .hlab{font:700 9.5px/1 var(--mono,monospace);letter-spacing:.04em;opacity:.8;white-space:nowrap}@media (max-width:420px){.bar .hlab{font-size:8.5px}}`; document.head.appendChild(s);
})();
/* Phones: starting a round (Solo, Two players...) scrolls the game itself into view. Before, the clues and the timer started
   below the bottom of the screen, under the header, the league bar and the "How it works" box. */
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("#room button.mode, #room [data-mode], #ttDuo, #ttOnline");
  if (!b || innerWidth >= 760) return;
  setTimeout(() => { if (typeof pnLive === "function" && document.getElementById("pnAsk")) return; const t = document.querySelector("#room .qhud") || document.querySelector("#room .card"); if (!t) return; const y = t.getBoundingClientRect().top + scrollY - 70; if (Math.abs(y - scrollY) > 40) scrollTo({ top: Math.max(0, y), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }, 450);
});
(() => { const s = document.createElement("style"); s.textContent = ".newold{margin-top:10px}.newold summary{cursor:pointer;font-weight:700;padding:8px 0;color:var(--accent)}"; document.head.appendChild(s); })();
/* Daily missions (football and basketball; each build includes this file).
   Every day there are three small goals, the same for everyone that day (picked from the date): for example "get 5 answers right",
   "play 2 different games" or "win a ranked match". Finishing one gives bonus XP; finishing all three gives a bigger bonus and ticks
   the day. Five all-three days in a week open the weekly chest (a large XP reward and a badge-style toast).
   Progress counts real play only: it is read from the same calls that already give XP and sounds (reward, right answers, ranked results),
   so nothing here can be earned without playing. Stored in your profile (so it syncs with your account), the last 14 days only. */
const MIS = [
  { id: "rounds3", t: (n) => `Play ${n} rounds of any game`, n: [3, 5, 8], key: "rounds", xp: 30 },
  { id: "right5", t: (n) => `Get ${n} answers right`, n: [5, 8, 12], key: "right", xp: 30 },
  { id: "games2", t: (n) => `Play ${n} different games`, n: [2, 3], key: "games", xp: 40 },
  { id: "newgame", t: () => "Try a game you've never played", n: [1], key: "newgame", xp: 50 },
  { id: "streak3", t: (n) => `Get ${n} right in a row`, n: [3, 5], key: "combo", xp: 40 },
  { id: "ranked1", t: () => "Win a ranked match", n: [1], key: "rankedwin", xp: 60 },
  { id: "predict", t: (n) => `Lock in ${n} prediction${n > 1 ? "s" : ""} on real matches`, n: [1, 2, 3], key: "predict", xp: 40 },
  { id: "hard1", t: () => "Play a round on Hard or Elite", n: [1], key: "hard", xp: 40 },
];
const MIS_ALL_XP = 100, MIS_CHEST_XP = 400;
const Mis = {
  hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; },
  today() { return new Date().toISOString().slice(0, 10); },
  weekStart(d) { const t = new Date((d || this.today()) + "T00:00:00Z"), dow = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dow); return t.toISOString().slice(0, 10); },
  /* the day's three, the same for everyone: a seeded shuffle of the list, a target picked per mission */
  list(day) {
    const pool = MIS.slice(); let h = this.hash("missions-" + day); const out = [];
    while (out.length < 3 && pool.length) { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; const i = h % pool.length, m = pool.splice(i, 1)[0]; h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0; out.push({ ...m, target: m.n[h % m.n.length] }); }
    return out;
  },
  day(p, d) { p.missions = p.missions || {}; const k = d || this.today(); return (p.missions[k] = p.missions[k] || { prog: { rounds: 0, right: 0, games: [], newgame: 0, combo: 0, rankedwin: 0, predict: 0, hard: 0 }, done: {} }); },
  val(rec, key) { const v = rec.prog[key]; return Array.isArray(v) ? v.length : v || 0; },
  /* record something that happened, then pay out anything that has just been finished */
  note(fn) {
    try {
      const p = prof(), rec = this.day(p); fn(rec.prog, p);
      const ms = this.list(this.today()); let gained = 0, finished = [];
      ms.forEach((m) => { if (!rec.done[m.id] && this.val(rec, m.key) >= m.target) { rec.done[m.id] = 1; gained += m.xp; finished.push(m); } });
      const all = ms.every((m) => rec.done[m.id]);
      if (all && !rec.all) { rec.all = 1; gained += MIS_ALL_XP; }
      let chest = false; const ws = this.weekStart(), days = Object.keys(p.missions).filter((d) => d >= ws && p.missions[d].all).length; p.mchest = p.mchest || {};
      if (days >= 5 && !p.mchest[ws]) { p.mchest[ws] = 1; gained += MIS_CHEST_XP; chest = true; }
      Object.keys(p.missions).sort().slice(0, -14).forEach((k) => delete p.missions[k]);
      if (gained) p.xp = (p.xp || 0) + gained;
      saveProf(p);
      finished.forEach((m, i) => setTimeout(() => { try { toast(`<b>Mission done</b><br>${esc(m.t(m.target))} · +${m.xp} XP`, "ach"); Snd.win && Snd.win(); } catch (e) { /* quiet */ } }, 600 + i * 900));
      if (all && finished.length) setTimeout(() => { try { toast(`<b>All three missions done</b><br>+${MIS_ALL_XP} XP bonus`, "ach"); confetti && confetti(); Mascot.react("achieve"); } catch (e) { /* quiet */ } }, 900 + finished.length * 900);
      if (chest) setTimeout(() => { try { toast(`<b>Weekly chest opened</b><br>5 perfect days: +${MIS_CHEST_XP} XP`, "ach"); confetti && confetti(); } catch (e) { /* quiet */ } }, 2600);
      if (gained) { try { paintProfileBtn(); } catch (e) { /* not ready */ } this.paint(); }
    } catch (e) { /* missions must never break a game */ }
  },
  streak(p) { let n = 0; const now = Date.now(); for (let k = 0; k < 120; k++) { const d = new Date(now - k * 864e5).toISOString().slice(0, 10), r = (p.missions || {})[d]; if (r && r.all) n++; else if (k > 0) break; else continue; } return n; },
  html() {
    const p = prof(), rec = this.day(p), ms = this.list(this.today()), ws = this.weekStart(), week = Array.from({ length: 7 }, (_, i) => { const t = new Date(ws + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + i); return t.toISOString().slice(0, 10); });
    const perfect = week.filter((d) => (p.missions || {})[d] && p.missions[d].all).length, doneN = ms.filter((m) => rec.done[m.id]).length, chest = (p.mchest || {})[ws];
    return `<div class="mbox" id="missionBox"><div class="mhead"><div><span class="htlabel">Daily missions</span><b class="mcount num">${doneN}/3 done</b></div><div class="mweek" title="Days this week with all three missions done. Five opens the weekly chest."><span class="fine">Weekly chest</span>${week.map((d) => `<i class="${(p.missions || {})[d] && p.missions[d].all ? "on" : ""} ${d === this.today() ? "today" : ""}"></i>`).join("")}<span class="fine num">${chest ? "opened" : perfect + "/5"}</span></div></div>
      <div class="mlist">${ms.map((m) => { const v = Math.min(this.val(rec, m.key), m.target), done = !!rec.done[m.id]; return `<div class="mrow ${done ? "done" : ""}"><span class="mtick">${done ? "✓" : ""}</span><div class="mtxt"><b>${esc(m.t(m.target))}</b><div class="mbar"><i style="width:${(v / m.target) * 100}%"></i></div></div><span class="mxp num">${done ? "done" : v + "/" + m.target}<small>+${m.xp} XP</small></span></div>`; }).join("")}</div>
      <div class="fine mfoot">All three: +${MIS_ALL_XP} XP${this.streak(p) > 1 ? ` · ${this.streak(p)} perfect days in a row` : ""}. New missions every day.</div></div>`;
  },
  paint() { const b = document.getElementById("missionBox"); if (b) b.outerHTML = this.html(); },
  mount() {
    const home = document.getElementById("homeToday"); if (!home || document.getElementById("missionBox")) return; home.insertAdjacentHTML("afterend", this.html());
  },
};
/* hooks: the same calls that already pay XP and play sounds */
setTimeout(() => {
  if (typeof reward === "function") { const r0 = reward; try { reward = function (xp, label) { const out = r0.apply(this, arguments); const hard = typeof S !== "undefined" && ["hard", "elite"].includes(S.diff); Mis.note((pr, p) => { pr.rounds = (pr.rounds || 0) + 1; pr.games = Array.isArray(pr.games) ? pr.games : []; if (label && !pr.games.includes(label)) pr.games.push(label); p.mseen = p.mseen || {}; if (label && !p.mseen[label]) { p.mseen[label] = 1; pr.newgame = (pr.newgame || 0) + 1; } if (hard) pr.hard = (pr.hard || 0) + 1; if (/call it|daily 5|matchday|rapid|bracket|upset|table|over or under|live|weekly/i.test(String(label))) pr.predict = (pr.predict || 0) + 1; }); return out; }; } catch (e) { /* keep the original */ } }
  if (typeof Snd !== "undefined" && Snd.right && !Snd.__mis) { Snd.__mis = true; const r1 = Snd.right, w1 = Snd.wrong; Snd.right = function () { try { Mis.note((pr) => { pr.right = (pr.right || 0) + 1; Mis.run = (Mis.run || 0) + 1; pr.combo = Math.max(pr.combo || 0, Mis.run); }); } catch (e) { /* quiet */ } return r1.apply(this, arguments); }; if (w1) Snd.wrong = function () { Mis.run = 0; return w1.apply(this, arguments); }; }
  if (typeof Ranked !== "undefined" && Ranked.report) { const rp = Ranked.report; Ranked.report = function (mid, opp, res) { try { if (res === "win") Mis.note((pr) => { pr.rankedwin = (pr.rankedwin || 0) + 1; }); } catch (e) { /* quiet */ } return rp.apply(this, arguments); }; }
  if (typeof renderHome === "function") { const h0 = renderHome; try { renderHome = function () { h0.apply(this, arguments); setTimeout(() => Mis.mount(), 80); }; } catch (e) { /* skip */ } }
  if (document.getElementById("homeToday")) setTimeout(() => Mis.mount(), 120);   /* the home page was already drawn before these hooks went in */
}, 0);
addEventListener("hashchange", () => { Mis.run = 0; });
(() => { const s = document.createElement("style"); s.textContent = `
.mbox{align-self:stretch;width:100%;box-sizing:border-box;margin:0 0 14px;padding:14px 16px;border-radius:20px;border:1px solid var(--line);background:radial-gradient(circle at 90% 0,color-mix(in srgb,var(--accent) 16%,transparent),transparent 55%),var(--surface)}
.mhead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:8px}.mhead>div:first-child{display:flex;flex-direction:column;gap:2px}.mcount{font-size:22px}
.mweek{display:flex;align-items:center;gap:5px}.mweek i{width:12px;height:12px;border-radius:50%;background:color-mix(in srgb,var(--ink) 14%,transparent)}.mweek i.on{background:var(--accent);box-shadow:0 0 10px var(--accent)}.mweek i.today{outline:2px solid color-mix(in srgb,var(--ink) 40%,transparent);outline-offset:1px}
.mlist{display:grid;gap:8px}.mrow{display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:center;padding:8px 10px;border-radius:14px;background:color-mix(in srgb,var(--ink) 5%,transparent)}
.mtick{width:24px;height:24px;border-radius:50%;border:2px solid color-mix(in srgb,var(--ink) 25%,transparent);display:grid;place-items:center;font-weight:800;font-size:14px}.mrow.done .mtick{background:var(--accent);border-color:var(--accent);color:#111;animation:mPop .4s cubic-bezier(.2,1.6,.4,1)}@keyframes mPop{from{transform:scale(.4)}}
.mtxt b{font-size:14.5px}.mbar{height:6px;border-radius:99px;background:color-mix(in srgb,var(--ink) 12%,transparent);margin-top:5px;overflow:hidden}.mbar i{display:block;height:100%;background:var(--accent);border-radius:99px;transition:width .6s cubic-bezier(.2,.8,.2,1)}
.mrow.done .mtxt b{opacity:.6;text-decoration:line-through}.mxp{display:flex;flex-direction:column;align-items:flex-end;font-size:13px}.mxp small{font:700 10.5px var(--mono);opacity:.7}.mfoot{margin-top:8px}`; document.head.appendChild(s); })();
/* "Play next": one suggestion on the home page, with the reason (football and basketball; each build includes this file).
   Picked in this order, using only what you have really done on this device:
   1. a daily mission you haven't finished, and the game that would finish it (predictions -> a Call it game, ranked -> Ranked,
      a new game -> one you've never opened, anything else -> your favourite);
   2. your weakest game: the one with the lowest share of right answers, once you have at least 8 answers in it;
   3. a game you've never played;
   4. your favourite game, as a way back in.
   With no history at all it suggests the easiest start. It sits above the missions card and is a single button. */
const PNX = {
  count(id) { try { return Usage.count(USPORT + ":" + id); } catch (e) { return 0; } },
  pick() {
    const items = typeof ggItems === "function" ? ggItems().filter((g) => !g.group) : [], p = prof(); if (!items.length) return null;
    const by = (ids) => ids.map((id) => items.find((g) => g.id === id)).find(Boolean);
    const fav = items.slice().sort((a, b) => this.count(b.id) - this.count(a.id))[0], unplayed = items.filter((g) => this.count(g.id) === 0);
    const rec = typeof Mis !== "undefined" ? Mis.day(p) : null, todo = rec ? Mis.list(Mis.today()).filter((m) => !rec.done[m.id]) : [];
    for (const m of todo) {
      if (m.key === "predict") { const g = by(["call", "nbcall", "daily", "nbdaily", "matchday", "rapid", "nbrapid"]); if (g) return { g, why: `finishes today's mission: ${m.t(m.target).toLowerCase()}` }; }
      if (m.key === "rankedwin") return { ranked: true, why: "finishes today's mission: win a ranked match" };
      if (m.key === "newgame" && unplayed.length) return { g: unplayed[0], why: "a game you haven't tried, which finishes today's mission" };
      if (["rounds", "right", "games", "combo", "hard"].includes(m.key) && fav && this.count(fav.id) > 0) return { g: fav, why: `your favourite, and it counts for today's mission: ${m.t(m.target).toLowerCase()}` };
    }
    const acc = p.acc || {}, weak = Object.entries(acc).filter(([, v]) => v && v.n >= 8).map(([k, v]) => ({ k, r: v.c / v.n, n: v.n })).sort((a, b) => a.r - b.r)[0];
    if (weak) { const g = items.find((x) => x.id === weak.k || x.id === "p" + weak.k) || by([weak.k]); if (g && weak.r < 0.6) return { g, why: `your weakest: ${Math.round(weak.r * 100)}% right so far, so there's room to climb` }; }
    if (unplayed.length) return { g: unplayed[0], why: this.count(items[0].id) ? "you haven't tried it yet" : "an easy place to start" };
    if (fav) return { g: fav, why: "your most-played game" };
    return null;
  },
  html() {
    const r = this.pick(); if (!r) return "";
    if (r.ranked) return `<button type="button" class="pnx" ${/basketball/.test(location.pathname) ? 'data-nbgroup="ranked"' : 'data-group-go="ranked"'}><span class="pnxl">Play next</span><b>Ranked match</b><small>${esc(r.why)}</small><span class="pnxgo">Go →</span></button>`;
    return `<button type="button" class="pnx" ${/basketball/.test(location.pathname) ? `data-nbgame="${esc(r.g.id)}"` : `data-hgame="${esc(r.g.id)}"`}><span class="pnxl">Play next</span><b>${esc(r.g.name)}</b><small>${esc(r.why)}</small><span class="pnxgo">Go →</span></button>`;
  },
  mount() { const box = document.getElementById("missionBox") || document.getElementById("doors"); if (!box || document.getElementById("pnxCard")) return; const h = this.html(); if (!h) return; box.insertAdjacentHTML("beforebegin", `<div id="pnxCard" class="pnxw">${h}</div>`); },
};
setTimeout(() => {
  if (typeof renderHome === "function") { const h0 = renderHome; try { renderHome = function () { h0.apply(this, arguments); setTimeout(() => PNX.mount(), 220); }; } catch (e) { /* skip */ } }
  if (document.getElementById("homeToday")) setTimeout(() => PNX.mount(), 260);
}, 0);
(() => { const s = document.createElement("style"); s.textContent = `
.pnxw{align-self:stretch;width:100%;margin:0 0 14px}.pnx{position:relative;display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto auto;column-gap:12px;width:100%;text-align:left;padding:14px 18px;border-radius:20px;border:1px solid color-mix(in srgb,var(--accent) 55%,var(--line));background:linear-gradient(110deg,color-mix(in srgb,var(--accent) 22%,transparent),transparent 70%),var(--surface);color:var(--ink);font:inherit;cursor:pointer;transition:transform .2s,box-shadow .2s}
.pnx:hover{transform:translateY(-2px);box-shadow:0 14px 34px -16px var(--accent)}.pnxl{grid-column:1/3;font:700 11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:4px}.pnx b{font-size:22px;line-height:1.15}.pnx small{grid-column:1;opacity:.8;font-size:13px;line-height:1.35}.pnxgo{grid-row:2/4;grid-column:2;align-self:center;font-weight:800;color:var(--accent);white-space:nowrap}`; document.head.appendChild(s); })();
/* Share a result as a link (football and basketball; each build includes this file).
   - Player links: https://…/football/#player-Name opens that player's card (rating, season place, last results) over the home page,
     with Add friend and Challenge buttons, so a link replaces a screenshot. Your own link is on your profile ("Copy my link"), and
     on every finished two-player or ranked match.
   - Solo results: the "Copy result link" button on the end screen shares the existing beat-this link (it opens the same game at the
     same difficulty with "beat <name>'s score"), through the phone's share sheet when there is one, otherwise it copies.
   The link carries only a display name, a game and a score; nothing private. */
const SL = {
  base() { return location.origin + location.pathname.replace(/[^/]*$/, ""); },
  nick() { try { return (prof().nick || "").replace(/[^A-Za-z0-9 _.-]/g, "").slice(0, 16); } catch (e) { return ""; } },
  playerLink(nick) { return `${this.base()}#player-${encodeURIComponent(nick || this.nick())}`; },
  async send(text, url) {
    try { if (navigator.share) { await navigator.share({ title: "ballknowledge", text, url }); return; } } catch (e) { return; }   /* cancelled */
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast("Link copied. Send it to a friend."); } catch (e) { prompt("Copy this link and send it:", url); }
  },
  /* a result link for the end screen: solo -> beat-this, duel or ranked -> my player card */
  forFinale(o) {
    const solo = o.winner == null, sc = o.players && o.players[0] ? Math.round(o.players[0].score) || 0 : 0;
    if (solo && S.game && typeof beatLink === "function" && typeof GAME_IDS !== "undefined" && GAME_IDS.includes(S.game === "value" ? "pvalue" : S.game)) return { text: `I scored ${sc.toLocaleString()} in ${typeof gameName === "function" ? gameName(S.game) : "a game"} on ballknowledge. Beat it:`, url: beatLink(S.game, sc) };
    if (!solo && this.nick()) return { text: `${o.verdict ? String(o.verdict).replace(/<[^>]+>/g, "") : "Good game"}. Challenge me on ballknowledge:`, url: this.playerLink() };
    return null;
  },
};
setTimeout(() => {
  if (typeof finale === "function") { const f0 = finale; try { finale = function (o) { let x = o; try { const r = SL.forFinale(o); if (r) { window.__slLast = r; x = { ...o, buttons: (o.buttons || "") + '<button type="button" class="btn ghost" data-sharelink="1">Copy result link</button>' }; } } catch (e) { /* plain finale */ } return f0.call(this, x); }; } catch (e) { /* skip */ } }
  if (typeof route === "function") { const r0 = route; try { route = function (ev) { const m = /^#player-(.+)$/.exec(location.hash); if (m) { const nick = decodeURIComponent(m[1]).slice(0, 16); history.replaceState(null, "", location.pathname); r0.call(this, ev); setTimeout(() => { try { PCard.open(nick); } catch (e) { /* no card yet */ } }, 500); return; } return r0.apply(this, arguments); }; } catch (e) { /* skip */ } }
  if (/^#player-/.test(location.hash)) setTimeout(() => route(), 900);
}, 0);
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-sharelink],[data-mylink],[data-pcchal]"); if (!b) return;
  if (b.dataset.sharelink && window.__slLast) { e.stopPropagation(); SL.send(window.__slLast.text, window.__slLast.url); }
  else if (b.dataset.mylink) { e.stopPropagation(); if (!SL.nick()) return toast("Pick a display name first (Profile → Edit profile)."); SL.send("Here's my ballknowledge profile. Add me or challenge me:", SL.playerLink()); }
  else if (b.dataset.pcchal) { e.stopPropagation(); try { closeModal(); } catch (x) { /* none open */ } setTimeout(() => { try { challengeModal(b.dataset.pcchal); } catch (x) { toast("Sign in to challenge someone."); } }, 80); }
}, true);
(() => { const s = document.createElement("style"); s.textContent = ".pcLink{margin-top:10px}"; document.head.appendChild(s); })();
/* Watch a friend's online match live (football and basketball; each build includes this file).
   An online game is run by the host's browser, which sends a copy of the game panel to the other player after every change. A
   spectator listens to the same room and shows that same panel, read-only: they can't click, type, buzz or pick anything.
   How you watch: the host (while a match is running) gets a small "Watch link" chip; send that link, or just the room code, and
   the other person opens it (or types the code under "Watch a match" on the Ranked page). The link looks like  #watch-ABCD.
   Rooms are not private: like every online room here, anyone who knows the 4-letter code can join as a player or a spectator, and
   the chip says so. Spectators never send answers or reactions. */
const Spec = {
  watchers: new Map(), seen: new Set(), got: false, code: null, hello: null, keep: null,
  link(code) { return `${location.origin}${location.pathname.replace(/[^/]*$/, "")}#watch-${code}`; },
  count() { const now = Date.now(); this.watchers.forEach((t, k) => { if (now - t > 70000) this.watchers.delete(k); }); return this.watchers.size; },
  /* spectator side */
  start(code) {
    this.stop(true); Net.close(); this.code = code; this.got = false; this.seen = new Set(); this.id = Math.random().toString(36).slice(2, 8);
    Net.role = "watch"; Net.open(code); Net.role = "watch"; document.body.dataset.net = "watch";
    const room = document.getElementById("room"); if (room) room.innerHTML = `<div class="card specwait"><h2>Watching room ${esc(code)}</h2><p class="sub" id="specMsg">Looking for the match…</p></div>`;
    this.bar(); const say = () => { try { Net.send({ k: "watchhello", id: this.id }); } catch (e) { /* not connected yet */ } };
    say(); this.hello = setInterval(() => { if (Net.role !== "watch") return this.stop(); if (!this.got) { say(); const m = document.getElementById("specMsg"), secs = Math.round((Date.now() - (Net.since || Date.now())) / 1000); if (m) m.textContent = !Net.linked() ? (secs > 12 ? "Could not reach the room server. Check your connection." : "Connecting to the room server…") : secs > 20 ? `Connected, but nobody is hosting ${code}. Check the code, and that the match is still going.` : "Looking for the match…"; } else say(); }, 2500);
  },
  stop(quiet) { clearInterval(this.hello); this.hello = null; try { if (Net.role === "watch" && Net.code) Net.send({ k: "watchbye", id: this.id }); } catch (e) { /* already closed */ } const b = document.getElementById("specBar"); if (b) b.remove(); if (!quiet && Net.role === "watch") { Net.close(); } document.body.dataset.net = Net.role || ""; },
  bar() {
    let b = document.getElementById("specBar"); if (!b) { b = document.createElement("div"); b.id = "specBar"; b.setAttribute("role", "status"); document.body.appendChild(b); }
    b.innerHTML = `<span class="specdot ${this.got ? "live" : ""}"></span><b>${this.got ? "Watching live" : "Looking for the match"}</b><span class="fine num">room ${esc(this.code || "")}</span><span class="specro">view only</span><button type="button" class="btn ghost" id="specLeave">Leave</button>`;
  },
  recv(m) {
    if (!m || m.from === "watch") return; if (m.i) { if (this.seen.has(m.i)) return; this.seen.add(m.i); if (this.seen.size > 400) this.seen = new Set([...this.seen].slice(-100)); }
    if (m.k === "html") { const room = document.getElementById("room"); if (!room) return; if (!this.got) { this.got = true; this.bar(); } room.innerHTML = m.h; room.classList.add("specro-room"); }
    else if (m.k === "duo") { try { duoResultShow(m.names, m.scores, m.sub); } catch (e) { /* no result screen */ } }
    else if (m.k === "react") { try { floatReact(m.e); } catch (e) { /* quiet */ } }
    else if (m.k === "end") { toast("The match ended"); this.stop(); }
  },
  /* host side: a spectator said hello, so send them the current panel and count them */
  hostHello(m) { this.watchers.set(m.id || "w", Date.now()); if (Net.started) Net.push(true); else Net.send({ k: "waiting" }); this.chip(); },
  chip() {
    const show = Net.role === "host" && Net.started; let c = document.getElementById("specChip");
    if (!show) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement("div"); c.id = "specChip"; document.body.appendChild(c); }
    const n = this.count(); c.innerHTML = `<button type="button" class="btn ghost" id="specCopy">${n ? `👁 ${n} watching` : "Watch link"}</button><small>Anyone with the room code can watch</small>`;
  },
};
setTimeout(() => {
  if (typeof Net === "undefined") return; const r0 = Net.recv;
  Net.recv = function (m) { if (this.role === "watch") return Spec.recv(m); if (this.role === "host" && m && m.k === "watchbye") { Spec.watchers.delete(m.id || "w"); Spec.chip(); return; } if (this.role === "host" && m && m.k === "watchhello") { if (m.i) { if (this.seen && this.seen.has(m.i)) return; if (this.seen) this.seen.add(m.i); } return Spec.hostHello(m); } return r0.apply(this, arguments); };
  setInterval(() => { try { Spec.chip(); } catch (e) { /* quiet */ } }, 1500);
  if (typeof route === "function") { const rt = route; try { route = function (ev) { const m = /^#watch-([A-Za-z]{4})$/.exec(location.hash); if (m) { const code = m[1].toUpperCase(); history.replaceState(null, "", location.pathname + "#games"); rt.call(this, ev); setTimeout(() => Spec.start(code), 350); return; } return rt.apply(this, arguments); }; } catch (e) { /* skip */ } }
  if (/^#watch-/.test(location.hash)) route();   /* straight away: a later route() would reset the room we are about to join */
}, 0);
/* read-only: while watching, nothing inside the game panel responds */
["click", "pointerdown", "keydown", "input", "submit"].forEach((t) => document.addEventListener(t, (e) => {
  if (Net.role !== "watch" || !e.target.closest) return; if (e.target.closest("#specBar")) return;
  if (e.target.closest("#room")) { e.stopImmediatePropagation(); e.preventDefault(); }
}, true));
document.addEventListener("click", (e) => {
  const l = e.target.closest && e.target.closest("#specLeave"); if (l) { e.stopImmediatePropagation(); Spec.stop(); try { go("games"); } catch (x) { location.hash = "games"; } return; }
  const c = e.target.closest && e.target.closest("#specCopy"); if (c && Net.code) { e.stopImmediatePropagation(); SL_send_watch(); }
  const w = e.target.closest && e.target.closest("#watchGo"); if (w) { e.stopImmediatePropagation(); const v = (document.getElementById("watchCode").value || "").trim().toUpperCase(); if (!/^[A-Z]{4}$/.test(v)) return toast("Type the 4-letter room code"); Spec.start(v); }
}, true);
async function SL_send_watch() { const url = Spec.link(Net.code), text = "Watch my ballknowledge match live:"; try { if (navigator.share) { await navigator.share({ title: "ballknowledge", text, url }); return; } } catch (e) { return; } try { await navigator.clipboard.writeText(`${text} ${url}`); toast("Watch link copied"); } catch (e) { prompt("Copy this link:", url); } }
/* "Watch a match" box on the Ranked page */
setTimeout(() => {
  if (typeof renderRanked !== "function") return; const rr = renderRanked; try { renderRanked = function () { rr.apply(this, arguments); const room = document.getElementById("room"); if (room && !document.getElementById("watchBox") && Account.signedIn) { const card = [...room.querySelectorAll(".card")].pop(); if (card) card.insertAdjacentHTML("afterend", `<div class="card" id="watchBox" style="margin-top:14px"><h3 style="font-size:22px">👁 Watch a match</h3><p class="fine">A friend is playing online? Type their 4-letter room code to watch live, view only. Or open the watch link they send you.</p><div class="row"><input id="watchCode" maxlength="4" placeholder="Code" aria-label="Room code to watch" style="text-transform:uppercase;width:90px;font:700 18px var(--mono);padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink)"><button class="btn ghost" id="watchGo" type="button">Watch</button></div></div>`); } }; } catch (e) { /* skip */ }
}, 0);
(() => { const s = document.createElement("style"); s.textContent = `
#specBar{position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:9600;display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:999px;background:#141b17f2;color:#f4f1ea;border:1px solid #ffffff33;box-shadow:0 12px 30px -12px #000;max-width:calc(100% - 20px)}#specBar .btn{padding:6px 12px}
.specdot{width:10px;height:10px;border-radius:50%;background:#e8c35a}.specdot.live{background:#ff4d4d;animation:specP 1.4s infinite}@keyframes specP{70%{box-shadow:0 0 0 8px #ff4d4d00}}.specro{font:700 10px var(--mono);letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;border-radius:99px;background:#ffffff1f}
body[data-net=watch] #reactBar{display:none!important}.specro-room{pointer-events:none;user-select:none}.specro-room *{cursor:default!important}
#specChip{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:9000;display:flex;flex-direction:column;gap:2px;padding:6px 8px;border-radius:14px;background:#141b17ee;border:1px solid #ffffff2a;color:#f4f1ea}#specChip small{font-size:10px;opacity:.65}#specChip .btn{padding:6px 12px}
@media (max-width:520px){#specBar .fine{display:none}}`; document.head.appendChild(s); })();
/* generated by src/95_site_index.py: every game and main page in all three sports, for search */
const SITE_INDEX = [{"s":"football","k":"Game","n":"Who am I?","u":"football/#games-all-leagues-who","d":"A mystery player. Clues go from obscure to obvious. Buzz in early for more points."},{"s":"football","k":"Game","n":"Career path","u":"football/#games-all-leagues-career","d":"Every club he played for, in order. Name the player."},{"s":"football","k":"Game","n":"Name that club","u":"football/#games-all-leagues-club","d":"Goals, wins and a stadium size. Which club is it?"},{"s":"football","k":"Game","n":"Badge blur","u":"football/#games-all-leagues-blur","d":"A blurry badge that sharpens by the second."},{"s":"football","k":"Game","n":"Where did they finish?","u":"football/#games-all-leagues-finish","d":"A club, a season, a slider. How close can you get?"},{"s":"football","k":"Game","n":"Market value","u":"football/#games-all-leagues-value","d":"Who is worth more, a player or a squad? Or both of you guess a value and the closest wins."},{"s":"football","k":"Game","n":"Club roulette","u":"football/#games-all-leagues-roulette","d":"A club appears. Take turns naming players who played for it. First to blank loses."},{"s":"football","k":"Game","n":"Starting XI","u":"football/#games-all-leagues-xi","d":"Champions League and cup finals, Champions League semi-finals and the biggest league games. Name the eleven wh"},{"s":"football","k":"Game","n":"Who did it","u":"football/#games-all-leagues-iconic","d":"A big match and its highlights by minute. Name the scorers, assisters, penalty takers and who was sent off."},{"s":"football","k":"Game","n":"Scramble","u":"football/#games-all-leagues-scramble","d":"A club, player or manager with the letters shuffled. Unscramble it before your rival does."},{"s":"football","k":"Game","n":"Football tic-tac-toe","u":"football/#games-all-leagues-ttt","d":"Name a player who fits the row and the column. Three in a row wins."},{"s":"football","k":"Game","n":"Call it","u":"football/#games-all-leagues-call","d":"One real match. Lock in your call, watch the model's match play out, then see what really happened."},{"s":"football","k":"Game","n":"Daily 5","u":"football/#games-all-leagues-daily","d":"The same five matches for everyone today. Beat the model and share your result."},{"s":"football","k":"Game","n":"Matchday","u":"football/#games-all-leagues-matchday","d":"Call a whole round at once and watch the results land one by one."},{"s":"football","k":"Game","n":"Rapid fire","u":"football/#games-all-leagues-rapid","d":"60 seconds. Call as many real matches as you can and beat the model on the same ones."},{"s":"football","k":"Game","n":"Bracket buster","u":"football/#games-all-leagues-bracket","d":"A real Champions League knockout. Pick every tie, round by round, against an Elo model."},{"s":"football","k":"Game","n":"Spot the upset","u":"football/#games-all-leagues-upset","d":"Five real results. Which one did the model think was least likely?"},{"s":"football","k":"Game","n":"Guess the table","u":"football/#games-all-leagues-table","d":"Rebuild a final table from last season's, then see you against the model."},{"s":"football","k":"Game","n":"Higher or lower","u":"football/#games-all-leagues-hol","d":"Two clubs, one number. Keep the streak alive."},{"s":"football","k":"Game","n":"Challenge a friend","u":"football/#games-all-leagues-challenge","d":"Five matches, one link. Send it and see who does better."},{"s":"basketball","k":"Game","n":"Who am I?","u":"basketball/#games-nba-who","d":"A mystery player. Clues go from obscure to obvious. Buzz in early for more points."},{"s":"basketball","k":"Game","n":"Career path","u":"basketball/#games-nba-career","d":"Every team he played for, in order. Name the player."},{"s":"basketball","k":"Game","n":"Name that team","u":"basketball/#games-nba-club","d":"Points, wins and a playoff run. Which team is it?"},{"s":"basketball","k":"Game","n":"Logo blur","u":"basketball/#games-nba-blur","d":"A blurry logo that sharpens by the second."},{"s":"basketball","k":"Game","n":"Where did they finish?","u":"basketball/#games-nba-finish","d":"A team, a season, a slider. How close can you get?"},{"s":"basketball","k":"Game","n":"Scramble","u":"basketball/#games-nba-scramble","d":"A player or team with the letters shuffled. Unscramble it before your rival does."},{"s":"basketball","k":"Game","n":"Team roulette","u":"basketball/#games-nba-roulette","d":"A team appears. Take turns naming players who played for it. First to blank loses."},{"s":"basketball","k":"Game","n":"Basketball tic-tac-toe","u":"basketball/#games-nba-ttt","d":"Name a player who fits the row and the column. Three in a row wins."},{"s":"basketball","k":"Game","n":"Who dropped it?","u":"basketball/#games-nba-dropped","d":"A real stat line with the name hidden: points, rebounds, assists. Clues get easier. Who was it?"},{"s":"basketball","k":"Game","n":"Starting five","u":"basketball/#games-nba-nbxi","d":"A Finals clincher or a Game 7. Name the five who started."},{"s":"basketball","k":"Game","n":"Higher or lower","u":"basketball/#games-nba-nbhol","d":"Two players, one stat. Who has more? Keep the streak alive."},{"s":"basketball","k":"Game","n":"Odd one out","u":"basketball/#games-nba-nbodd","d":"Four players, one does not belong. Who never played for the team, never won a title, never scored 22 a night?"},{"s":"basketball","k":"Game","n":"Rank the five","u":"basketball/#games-nba-nbrank","d":"Five players and one stat. Tap them in order, most to fewest. Closer to the truth scores more."},{"s":"basketball","k":"Game","n":"Career timeline","u":"basketball/#games-nba-nbtime","d":"A player's teams, shuffled. Slide each one to the season he joined it."},{"s":"basketball","k":"Game","n":"Call it","u":"basketball/#games-nba-nbcall","d":"Five real NBA games. Pick the winner and the margin, then see what the model said."},{"s":"basketball","k":"Game","n":"Daily 5","u":"basketball/#games-nba-nbdaily","d":"The same five games for everyone today. Beat the model and share your result."},{"s":"basketball","k":"Game","n":"Rapid fire","u":"basketball/#games-nba-nbrapid","d":"60 seconds. Tap the winner of as many real games as you can."},{"s":"basketball","k":"Game","n":"Bracket buster","u":"basketball/#games-nba-nbbracket","d":"A real NBA playoffs. Pick every series, round by round, against an Elo model."},{"s":"basketball","k":"Game","n":"Over or under","u":"basketball/#games-nba-nbou","d":"The model sets a line for a real game. Bet over or under with a bankroll that grows or shrinks."},{"s":"chess","k":"Game","n":"Call it","u":"chess/#go-call","d":"Two ratings and a time control: who wins, and how long does it last?"},{"s":"chess","k":"Game","n":"Predict who won","u":"chess/#go-elite","d":"Real games from the biggest events. Pick the result against the model."},{"s":"chess","k":"Game","n":"Guess the next move","u":"chess/#go-next","d":"A position from a real top-level game. Which move did the player choose?"},{"s":"chess","k":"Game","n":"Recognize the game","u":"chess/#go-recog","d":"The first moves of a real game. Who was playing?"},{"s":"chess","k":"Game","n":"Blunder or fine?","u":"chess/#go-blunder","d":"A move, graded by Stockfish. Blunder, mistake, inaccuracy or fine?"},{"s":"chess","k":"Game","n":"Name the opening","u":"chess/#go-open","d":"A position on the board. Sicilian, Ruy Lopez, King's Indian?"},{"s":"chess","k":"Game","n":"Pip's opening gym","u":"chess/#go-trainer","d":"Pip plays a random opening and you get a random colour. Play the best lines: slip, and Pip stops you and shows"},{"s":"chess","k":"Game","n":"Mate puzzles","u":"chess/#go-mate","d":"Real puzzles: checkmate in 1, 2 or 3."},{"s":"chess","k":"Game","n":"Estimate my Elo","u":"chess/#go-elo","d":"Puzzles that adapt to you, then an estimate of your level."},{"s":"chess","k":"Game","n":"Review a game","u":"chess/#go-review","d":"Every move graded, with an evaluation graph and the engine's preferred move."},{"s":"chess","k":"Game","n":"Play the characters","u":"chess/#go-ai","d":"Seven levels, from Pip warming up to all three coaches thinking together. Can you beat them?"},{"s":"chess","k":"Game","n":"Who is this player?","u":"chess/#go-who","d":"Clues appear on their own. Buzz when you know the grandmaster."},{"s":"chess","k":"Game","n":"Play a friend","u":"chess/#go-online","d":"Share a room code, pick a clock and play live. Resign, offer a draw, rematch and review the game after."},{"s":"chess","k":"Game","n":"Human bar","u":"chess/#go-hbar","d":"Drag the evaluation bar to where Stockfish puts the position. The closest guess scores most."},{"s":"chess","k":"Game","n":"Spot the tactic","u":"chess/#go-tact","d":"Tap every piece you could win for free before the clock runs out."},{"s":"chess","k":"Game","n":"Endgame verdict","u":"chess/#go-endg","d":"Win, draw or lose with best play? Call it, then play it out against Stockfish."},{"s":"chess","k":"Game","n":"Blindfold memory","u":"chess/#go-blind","d":"A position flashes up, then vanishes. Rebuild every piece from memory."},{"s":"football","k":"Page","n":"Games","u":"football/#games","d":"Every football game in one place"},{"s":"football","k":"Page","n":"Leaderboard","u":"football/#games-all-leagues-boards","d":"Seasons and all-time Elo"},{"s":"football","k":"Page","n":"Ranked online","u":"football/#games-all-leagues-ranked","d":"Play real people for Elo"},{"s":"football","k":"Page","n":"Weekly tournament","u":"football/#games-all-leagues-weekly","d":"Predict this week's real scores"},{"s":"football","k":"Page","n":"Live scores","u":"football/#games-all-leagues-live","d":"Today's matches"},{"s":"football","k":"Page","n":"Our model","u":"football/#lab","d":"How the prediction model works"},{"s":"football","k":"Page","n":"Title race","u":"football/#lab-premier-league-race","d":"Who wins the league"},{"s":"football","k":"Page","n":"Time machine","u":"football/#lab-premier-league-replay","d":"A season replayed beside the model"},{"s":"football","k":"Page","n":"Profile","u":"football/#profile","d":"Your stats, badges and friends"},{"s":"football","k":"Page","n":"Sticker album","u":"football/#album","d":"Collect every club and player"},{"s":"football","k":"Page","n":"Settings","u":"football/#settings","d":"Look, sidekick and sound"},{"s":"basketball","k":"Page","n":"Games","u":"basketball/#games","d":"Every basketball game in one place"},{"s":"basketball","k":"Page","n":"Leaderboard","u":"basketball/#games-nba-boards","d":"Seasons and all-time Elo"},{"s":"basketball","k":"Page","n":"Ranked online","u":"basketball/#games-nba-ranked","d":"Play real people for Elo"},{"s":"basketball","k":"Page","n":"Our model","u":"basketball/#lab","d":"How the NBA model works"},{"s":"basketball","k":"Page","n":"Profile","u":"basketball/#profile","d":"Your stats, badges and friends"},{"s":"basketball","k":"Page","n":"Settings","u":"basketball/#settings","d":"Look, sidekick and sound"},{"s":"chess","k":"Page","n":"Games","u":"chess/#go-games","d":"Every chess game"},{"s":"chess","k":"Page","n":"Daily challenges","u":"chess/#go-daily","d":"A puzzle, a bar and a tactic every day"},{"s":"chess","k":"Page","n":"Learn","u":"chess/#go-learn","d":"Lessons, openings, endgames"},{"s":"chess","k":"Page","n":"Opening explorer","u":"chess/#go-explorer","d":"Master games for any opening"},{"s":"chess","k":"Page","n":"Endgame trainer","u":"chess/#go-et","d":"Seven endings against Stockfish"},{"s":"chess","k":"Page","n":"Guess the famous game","u":"chess/#go-famous","d":"Replay the classics move by move"},{"s":"chess","k":"Page","n":"Weekly cup","u":"chess/#go-wk","d":"Five puzzles, the same for everyone"},{"s":"chess","k":"Page","n":"Puzzle rush","u":"chess/#go-rush","d":"Three minutes, as many puzzles as you can"},{"s":"chess","k":"Page","n":"Practise my mistakes","u":"chess/#go-mypz","d":"Your own blunders as puzzles"},{"s":"chess","k":"Page","n":"Opening repertoire","u":"chess/#go-rep","d":"Drill opening lines with spaced repetition"},{"s":"chess","k":"Page","n":"World rankings","u":"chess/#go-rank","d":"The FIDE top 100"},{"s":"chess","k":"Page","n":"World Championship 2026","u":"chess/#go-champ","d":"Gukesh vs Sindarov: live board, schedule, score, openings"},{"s":"chess","k":"Page","n":"Championships","u":"chess/#go-champ","d":"World titles and the current match"},{"s":"chess","k":"Page","n":"Simulate a match","u":"chess/#go-sim","d":"Anyone against anyone, 1,000 games"},{"s":"chess","k":"Page","n":"Leaderboards","u":"chess/#go-board","d":"Best scores"}];
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
/* Lines for the football and basketball sidekicks (spoken with Kokoro, see src/80_make_voice.py). Funny on top, a little real underneath. */
const MASCOT_LINES = {
  boot: {
    welcome: ["Evening. I'm Old Boot. I've played in every era of this game, mostly from a cupboard. Let's see what you know.", "Ah, you're back. Lace me up, let's have a go.", "Right then. Studs on, nerves off. Let's play.", "There you are. Kettle's on, boots are ready, let's get some quizzes in.", "Back again! I knew you couldn't resist."],
    hit: ["Back in my day, we'd have called that a proper answer.", "Lovely. Clean contact, like a volley in the rain.", "Correct. You remind me of a winger I used to wear. He's a pundit now. We don't talk.", "Spot on. I've seen fifty years of football and that was still a nice moment.", "That's it. Simple game, really. You just played it simply.", "Yes! I felt that one right in the toe cap.", "Correct. Mud, rain, three o'clock kickoffs. And you, getting it right.", "Good answer. Some things never go out of fashion. Knowing your football is one of them.", "Correct. That one went in off the post and I felt every bit of it.", "Right answer. I've heard worse from people who've had a lot more practice.", "Yes. Slide tackle of an answer. Clean and no booking.", "Good. Better than anything I managed in the cup final, and I was there.", "That's right! I'd give you a lap of honour, but my sole's coming loose.", "Spot on. You've done your homework, and so have your knees.", "Correct. That deserves a pie at half time.", "Lovely stuff. First touch like a tin of gravy, smooth and warm.", "Right again. Somebody ring the programme sellers.", "You know your football. I can tell. I've been kicked by experts.", "Right you are. That's gone in off the crossbar and I'm not even sorry.", "Correct. Like a perfect through ball on a wet Saturday.", "That's the one. I'd shake your hand, but I've no hands.", "Good answer. I've heard commentators get that wrong, and they're paid for it.", "Yes. You're a natural. I can tell from the way you hold your breath.", "Spot on. Put that one in the trophy cabinet, next to my old shin pad.", "Correct. Class is permanent. Mud is temporary.", "Right. There's a pie waiting for that answer."],
    bighit: ["Ooh, early buzz! You knew that before the clue finished. That's instinct, that is.", "Top bins! I've kicked a lot of balls. That's one I'd frame.", "First clue and you had it. I haven't seen speed like that since the old leather balls.", "That was quick! Even my laces are impressed, and they've seen everything.", "Instant! You didn't think, you just knew. The best players say that's the whole secret.", "Before the clue even landed! You must have had a word with the manager.", "Straight in at the near post. That's what I call instinct.", "First clue! My old toe cap's tingling.", "Buzzed before I could polish a stud! That's quick.", "Wham! First clue and in the top corner."],
    miss: ["Not quite. Don't worry, I once scored an own goal at Wembley. Well, my wearer did. I took the blame.", "Wrong one. Shake it off. Boots don't get better by staying in the box.", "Missed. Even the greats wore through a few pairs of me before they got it right.", "Ah. Not that one. The ball doesn't always go where you aim. Ask anyone.", "Off target. Happens to the best. Happens to me every Sunday.", "No, not him. Close though. Close counts for something, I promise.", "Wide of the post. Pick your head up, there's another chance coming.", "Wrong answer, but you swung for it. I respect a player who shoots.", "Not that one. Mind you, I've seen a captain pick the wrong end to defend.", "Wrong, but a good effort. Like a rainy Tuesday in Stoke. You'll live.", "Missed. Keep your head up, kid, it's only a question.", "No. That one's gone behind for a throw-in. Reset.", "Wrong this time. I had a bad run once. Twelve matches in the wrong sock.", "Not quite. Even the cleverest managers rotate the wrong player sometimes.", "Ah, close but no. Close is how you build a career, ask anyone in the lower leagues.", "Incorrect. The mud sticks, the mood doesn't. Next one.", "Off target, I'm afraid. Happens to the best, and to me all the time.", "Wrong. Never mind. The tea's still warm.", "Not that one. I once lost a game by walking out in odd socks, so you're in good company.", "Wrong. But I still like you, which is more than I can say for the linesman.", "No luck. Nobody gets every one. Not even the man on the telly.", "That's off the mark. Stand up, brush the grass off, go again.", "Missed. The ball's round, the questions are tricky, and we all wear out eventually.", "Not this time. A fresh pair of laces and a clear head will do wonders.", "Wrong one. There's no shame in a miss. The shame is in not turning up.", "Ah, no. The bounce didn't fall for you. It will."],
    streak: ["That's a streak! Keep this up and they'll bronze you, like they did my cousin.", "On fire. Mind you don't scuff the leather.", "Another one! You're on a run like the great teams. One game at a time.", "Five in a row? I'd need new studs to keep up with you.", "Streak's alive. Don't think about it. The moment you count, you stumble.", "Four in a row! Somebody fetch the wheelbarrow, we need to carry all this form.", "You're flying. I haven't felt this good since the new laces went in.", "On a roll! Don't look down, you'll trip over how good you are.", "That's a hot streak. I'd put a scarf on you.", "That's a proper run. I'd put you in the starting eleven.", "Another one right! You're giving me flashbacks to a very good Tuesday.", "You can't be stopped! Unless there's a pie on the way."],
    best: ["New personal best! Write it down. Memory fades. Leather fades. Records stay.", "A new best! The old you would be proud. The old me certainly is.", "Best ever! Moments like this are why we keep turning up in the cold."],
    over: ["Full time. Good innings. The thing about old boots is, we always get laced up again.", "That's the run done. Come back tomorrow. I'll still be here. I'm always here.", "Final whistle. Win or lose, you showed up. Plenty don't.", "That's it for now. Clean the mud off, have a cup of tea, go again.", "Run's over. Every great player has more of these than you think.", "That's the whistle. Put your feet up, I'll polish myself.", "Good session. Same time next week? I'll be in the cupboard.", "Final whistle. Shake hands with the question setter and go home happy.", "That's your lot for now. Put the kettle on, you've earned it.", "Game over. Every boot needs a rest, and every player does too."],
    rankup: ["You've gone up a level! Proper progress, that. Slow and steady, like a good centre back.", "New rank! I remember when you were a youngster. Well, a few games ago.", "Promoted! Enjoy it. Then get back to work. That's what the good ones do.", "Up a rank! They'll be asking for your autograph next. I'll sign your left shoe.", "Promoted again! Don't let it go to your head, it'll go to your feet."],
    achieve: ["An achievement! Stick it on the mantelpiece next to me.", "Unlocked something! Little milestones add up to a career.", "Look at that, a new badge. Small things, done often. That's how it's built.", "Another badge! I'll make room on the shelf, next to the cup I won in 1987.", "You've unlocked something. Good lads and lasses, the lot of you."],
    model_right: ["You beat the model on that one! Machines don't know about heart.", "Your call was right. The computer is sulking. I can tell.", "Correct prediction. Experience beats algorithms. Sometimes.", "The model agrees with you! Two heads are better than one, even if one is a spreadsheet.", "You and the model are on the same wavelength. Thick as thieves."],
    model_wrong: ["Football did football things. Nobody saw that coming. Not even the model.", "Wrong call. Upsets are why we watch. Don't be too hard on yourself.", "Missed that one. If results were predictable, nobody would bother turning up."],
  },
  rita: {
    welcome: ["I'm Ref Rita. I've seen everything, and I mean everything. Play fair, buzz fast, and I might not book you.", "Back again. Good. Captains, shake hands. Let's begin.", "Whistle's ready. Rules are simple. Know your stuff.", "Kick off in a minute. Warm up your brain.", "Back already. Good. Discipline is a habit."],
    hit: ["Correct. Play on.", "Good decision. Better than half the calls I've made.", "That's a clean answer. No VAR needed.", "Correct. I'm not allowed to smile on the pitch. I'm smiling a little.", "Right answer. Clear and obvious.", "Yes. Noted in my book. The good book.", "Correct. Nobody's appealing that one.", "Good. Composure. That's what wins matches.", "Correct. Advantage played.", "Right. Carry on, nothing to see here.", "Yes. Whistle stays in my pocket.", "Correct. That's a decision I'd be proud of.", "Good answer. I've seen worse from professionals.", "That's right. Clean tackle, no card.", "Yes. I'll allow that one. Happily.", "Spot on. Play continues, and so do you.", "Correct. Don't celebrate too much, it's unprofessional. A little is fine.", "Well judged. The linesman agrees. He rarely does.", "Correct. Calm, sensible, no fuss.", "Yes. That's a decision I'd back in any stadium.", "Right. Whistle stays down. Play on.", "Good. That is exactly what the rulebook says.", "Correct. I'd call that a clean sheet of reasoning.", "That's right. I rarely say this, but well done.", "Yes. A precise answer. I appreciate precision.", "Right call. I wouldn't change a thing."],
    bighit: ["Early and right. That's a highlight reel buzz.", "Advantage, you. Lovely stuff.", "First clue! I nearly blew the whistle out of shock.", "That was quick. I've seen fewer instant decisions from fourth officials.", "Lightning. I'd check the replay, but I don't need to.", "Early. Decisive. Exactly how I like a quick decision.", "You buzzed before I raised the whistle. Quick, and correct.", "Instant. No hesitation. Respect.", "Fast. Decisive. I like fast and decisive.", "Early buzz, correct answer. That's how it's done."],
    miss: ["Wrong. That's a yellow. Don't make me reach for the red.", "No. And before you ask, yes, I'm sure.", "Missed it. Everyone gets one wrong. I've got a whole career of them.", "Not him. Free kick to the quiz.", "Incorrect. Keep your head. Arguing never changed a decision.", "Wrong call. I know how that feels. Trust me, I really do.", "No. But the game goes on. That's the beauty of it.", "Not that one. Reset. Next phase of play.", "No. Marginal. Don't ask me to go to the monitor, there's no monitor.", "Wrong. Booking the question, not you.", "Not that one. Regroup, compose yourself, take the free kick.", "Incorrect. I did warn you. Politely.", "No. It happens. Referees miss things too. Don't tell anyone.", "Wrong, and I stand by it.", "Not this time. Dissent is not helping, by the way.", "That's a no. Let's move on, quietly and quickly.", "Incorrect. I've seen the replay. I'm sorry.", "No. Hold your head up and take the next restart.", "No. Wrong. We will not be appealing.", "Not that one. Take a breath and read the next question properly.", "Incorrect. Do not worry. Even officials review their notes.", "No. That one went wide. Next.", "Wrong, but you kept your composure. That counts.", "Not correct. I will remind you that I am not unkind, just accurate.", "No. Reset. The next restart is yours.", "That's incorrect. Learn from it and carry on."],
    streak: ["Three in a row? I'm checking the monitor. No, it's real.", "You're on a streak. I'm not allowed to cheer, so I'm cheering quietly.", "Another one. I'm running out of room in my notebook.", "That's a streak. Consistency. That's all anyone asks for.", "Still going. Don't celebrate yet. The match isn't over.", "Another correct decision. You'd make a decent official.", "Unbeaten. The league is taking notice.", "I'm running out of ways to say well done. Well done.", "A streak. Discipline, focus, no complaints. Admirable.", "Consistent. That's the word I'd use. Consistent.", "Another right answer. Your discipline is noted.", "Unbeaten run. Do not let it distract you."],
    best: ["New best. Officially recorded. I've signed the match report.", "A personal best. Even I'll admit that's impressive.", "Record set. Nobody can take that off you."],
    over: ["Final whistle. Shake hands, drink some water, come back stronger.", "That's the game. Win or lose, you showed up. That counts for more than people think.", "Full time. Review it, learn from it, move on. That's what I do.", "Game over. You played it straight. I can't ask for more.", "That's time. See you at the next fixture.", "Full time. Handshakes, please.", "That's the match. I'll file the report. It says well played.", "Final whistle. Go and get some water. That's an order.", "Full time. Collect yourself and take a moment.", "That's the end of the match. Good conduct throughout."],
    rankup: ["Promotion confirmed. Well deserved.", "You've moved up a level. The paperwork is in order.", "New rank. Keep your standards and it'll keep coming.", "You've gone up a rank. Earned, not given. The best kind.", "Promotion. Well deserved. Do not become complacent."],
    achieve: ["Achievement awarded. Fair and square.", "That's a badge. Earned, not given.", "Unlocked. Keep collecting. I'll keep watching.", "An achievement. I'll note it in the match report.", "Unlocked. Quietly impressive."],
    model_right: ["Correct call. You read the game better than the machine.", "Good decision. The model got overruled.", "Right result. That's what we call reading the play.", "The model agrees with you. Two independent opinions. Reassuring.", "You and the model are in line. Sensible people think alike."],
    model_wrong: ["Wrong call. The result stands. Accept it and go again.", "Upsets happen. I've seen a hundred. You'll see more.", "Not this time. Decisions go both ways over a season."],
  },
  bench: {
    welcome: ["Hey! I'm Bench. I've been warming up for nine seasons. Any minute now, coach is gonna call my name. While I wait, let's play.", "You're back! I kept your spot warm. Literally. I've been sitting here the whole time.", "Ready when you are! I'm always ready. Ask me about readiness. I'm an expert.", "You came back! I saved you a seat. It's a splinter, but it's yours.", "Hi! Hi! I'm so ready for this! Are you ready? I'm ready!"],
    hit: ["Yes! That's it! I knew it too, I just, um, didn't say it.", "Nice! If you ever need a sub, I'm right here. Already warmed up.", "Correct! Coach, did you see that? Coach?", "Ooh, good one! I'm doing a little celebration. Quietly. On the bench.", "That's right! You make it look easy. It's not easy. I would know.", "Yes! I'm stretching for no reason, I'm just excited.", "Correct! That answer deserves a start. Unlike me, apparently.", "Boom! Get in! Sorry. Too much? I've been holding that in for years.", "Correct! I'm standing up! Sitting back down! Standing up!", "Yes! You and me against the quiz!", "That's right! I'd have said that too! Probably! Maybe a bit later!", "Nice one! I'm bouncing on the bench. It's wooden. It hurts. Worth it.", "Wow, correct! You deserve the armband!", "Right! Do you want a sub? I'm free. I'm always free.", "Yes, that's it! I'm telling the groundsman!", "Brilliant! Honestly, I'm tearing up a little. Happy tears.", "Correct! Somebody get this person a trophy. I'll find a cup in the kit room.", "You got it! I'll write that down on the tactics board. In crayon.", "Yes! You're so good! Can I be your assistant?", "Correct! I'm going to tell everyone I was here for that!", "That's right! I'm shaking my pom-poms! They're imaginary but still!", "Right! Honestly, I'd hire you as the coach!", "Wow! You knew that! I'm learning so much from you!", "Correct! If I had a medal, it would be yours!", "Yes! That's the stuff! Coach, are you watching? Coach?", "Right again! I'm so happy I might fall off the bench!"],
    bighit: ["Whoa, so early! That's starting eleven stuff right there.", "That buzz was faster than my last sprint. And I sprint every single day. Just in case.", "First clue?! Are you sure you're not a scout?", "That was instant! Someone sign this person up.", "So fast! I didn't even finish my warm-up lap.", "So fast! I blinked and you'd already scored!", "First clue! I want to be you when I grow up!", "Oh wow! You didn't even wait! Show off! I love it!", "So quick! I was still getting my water bottle!", "First clue! You're a legend, my friend!"],
    miss: ["Ah, not it. That's okay. I've been not it for nine years, and I'm still smiling.", "Wrong one. Shake it off. The next chance is always closer than it looks.", "Missed. Hey, at least you got on the pitch. Some of us are still waiting.", "Oof. That's okay! Mistakes mean you're playing. Not playing is worse. Trust me.", "Not that one. Breathe. Bounce on your toes. Go again.", "Wrong, but brave! Brave is good. Coach likes brave. I think.", "Nope. But hey, you're still in the game. That's the dream.", "Missed it. I miss things too. Like every single team photo.", "Oh! Not that one. It's okay! Next one's yours, I can feel it!", "Wrong, but you tried, and trying is the whole thing!", "Missed! It's alright! I've missed a whole decade of matches!", "Not quite! I believe in you. I believe in you extra now.", "Oof, no. Hey, you can still come on at half time. Metaphorically.", "That's wrong, but your hair looks great. Is that allowed to be said?", "Missed it! No problem, we've got plenty of time. And snacks.", "No! But you were so close! Like, a bit close! Kind of close!", "Not that one! Chin up! Look, chins everywhere! Nobody's mad!", "Wrong, but you're still my favourite player. Don't tell the others.", "Not it! But I still think you're brilliant!", "Wrong one! It's okay, I got a few wrong earlier and nobody noticed!", "Oh! Missed. But you didn't give up. That's the real win!", "Not quite! Next time we've got it. I just know it.", "Missed! Don't worry! You're still allowed on the team!", "Wrong, but you gave it everything! I'd pick you every time!", "That's alright! Mistakes are how people get good. And I'm very good at mistakes!", "Oops! It's fine! Let's try again, together!"],
    streak: ["A streak! Is this what it feels like to play every week?", "Keep going! I'm doing stretches for you on the sideline.", "Another one! I'm making a highlight video of you in my head.", "Five in a row! I'm telling everyone on the bench. It's just me, but still.", "You're on fire! Can I be your sub? Please?", "You're on fire! I'm so happy I might cry into my tracksuit!", "Keep going! I'm doing a Mexican wave. By myself!", "A streak! Honestly I can't believe I know you!", "Four in a row! I'm stretching my legs in case they need me. They won't. But in case!", "So many in a row! I'm making a banner! With glitter!", "You keep getting them right! Is this a dream? Pinch me! Not too hard!", "That's a streak! I want to be like you!"],
    best: ["New best! Someday that'll be me getting the call. Today, it's you.", "Personal best! I'm so happy I might actually stand up.", "Best ever! You did it! I'm not crying. It's sweat. From warming up."],
    over: ["Full time. Good game. I'll keep warming up. You never know.", "That's the run. Don't stop showing up. That's the whole secret. Ask me, I've never missed a training.", "Game over! Same time tomorrow? I'll be here. I'm always here.", "That's it! You played great. Way more minutes than me this season.", "Done for now! Rest those legs. Mine are fine. They've never been used.", "That's the end! Great game! I'll carry your bag!", "Full time! Everyone clap! Me first!", "Done for now! You were brilliant, and so was I, sitting here supporting.", "All done! Amazing effort! I'll carry the cones!", "That's full time! You were brilliant! And so was I, for cheering!"],
    rankup: ["You levelled up! That's like getting called off the bench. I've heard it's amazing.", "New rank! Look at you, climbing the table!", "Promotion! Maybe if I watch you, I'll learn how it's done.", "You moved up! Look at you go! I'm so proud I could cry!", "Rank up! Next stop, the first team!"],
    achieve: ["An achievement! Can I touch it? Just once?", "You unlocked something! I'm unlocking a smile.", "Ooh, a badge! I have one too. It says participant.", "A new badge! Can I hold it? Just for a second? I'll be careful!", "You unlocked something! I'm dancing! Sitting down!"],
    model_right: ["You called it! Beat the computer! Can you teach me?", "Right prediction! You're like a manager. A really good one.", "You were right and the model wasn't! Underdogs, unite!", "You and the model agree! You're both so clever! I'm so lucky to know you!", "The model said the same! You're a genius, I mean it!"],
    model_wrong: ["Ah, wrong result. Upsets happen! I'd know, I'm a permanent upset.", "Didn't go your way. Next match! There's always a next match.", "Missed it. Football is weird. That's why we love it."],
  },
  rim: {
    welcome: ["Hey, I'm Rim. I've been dunked on more than anyone alive, and I'm still standing. Let's ball.", "You're back. Good. I've been hanging around. It's kind of my whole thing.", "Alright, shoot your shot. I'll be right here.", "Hey. Court's open. Lace up and let's see what you've got.", "You're back. Good. I'm hanging around, as always."],
    hit: ["Swish. Nothing but net. That's my favourite sound.", "Bucket! You hit that one clean.", "Good shot. Honestly, I love it when people score. That's my whole job.", "Nice! Soft touch. Didn't even graze me.", "Money. Right in.", "That's good. You've been putting in the reps, I can tell.", "Count it! Clean release, clean answer.", "Yes. I'd give you a high five, but I'm bolted to a backboard.", "Splash. That's the sweet sound of nylon.", "Cash money. No rattle, no problem.", "That went in so clean I didn't even have to move.", "Bucket after bucket after bucket. This is a good day.", "Right. That's a shot I'd hang a banner for.", "Smooth. That's a Tuesday night in the gym, nobody watching, perfect form.", "Correct. Like a bank shot off the glass, simple and beautiful.", "Yes. Quiet confidence. My favourite kind.", "Good answer. I felt a little breeze go through me. That's a swish.", "Dagger. That one hurt the other team's feelings.", "Pure. No rim, no glass, just net.", "Right. That one was so smooth, I didn't even wobble.", "Correct. That's money in the bank.", "Yes. That's how you take a shot with confidence.", "Good. That kind of answer keeps a team in a game.", "Clean. I could watch that all day.", "Right answer. It dropped through like silk.", "Nice. Easy as a layup. Beautiful as a fadeaway."],
    bighit: ["Early and in! That's a buzzer beater the other way round.", "That was a dunk. I felt it in my bolts.", "First clue! That's a logo three. From half court.", "Instant! You didn't even look at the rim. Respect.", "So quick! That's a fast break answer.", "Pulled up from way downtown and drained it. First clue!", "That was quick. Quick like a fast break.", "No hesitation. That's confidence, my friend.", "First clue and it's in. That's a clutch shot.", "No hesitation. I love a quick release."],
    miss: ["Off the rim. Trust me, I know the feeling from the other side.", "Brick. It happens. Even the greatest shooters miss more than half their shots.", "Not this time. I've been hit with a thousand bad shots. I'm still standing.", "Airball. Hey, no one's watching. Well, I am. But I'm nice about it.", "Rattled out. So close. Get the rebound and go again.", "Missed. Shooters shoot. Keep shooting.", "Not it. Shake it off. Next possession.", "Back iron. Your form was fine. Sometimes the ball just doesn't drop.", "Clank. Look, I've heard that sound a lot, no judgement.", "Rimmed out. Cruel game, but we go again.", "Not this time. The ball was on line, the question wasn't.", "Short. Happens. The legs go before the head, usually.", "Missed. I once spat out a game winner. Still got a hug afterwards.", "Wrong. But your shooting form was lovely.", "Off the iron. Next possession matters more than this one.", "Brick. A learning brick. Those are the useful ones.", "Wide. That one rolled all the way around me and left. Rude.", "No good. But hey, you took the shot. Most people don't.", "Off the side. It happens. Shake the hands out, go again.", "Not this time. Nobody makes every shot.", "Short again. Don't worry, even legends miss on a Tuesday.", "Clank. I felt that in my bolts.", "Wrong. Next one is always the next one. That's the best part.", "No good. But I like how you went for it.", "Missed. You've got ten more shots coming, so let it go.", "Back iron and out. The game is full of those."],
    streak: ["You're heating up! Somebody get this person a towel.", "On fire! Careful, I'm only rated for so many dunks.", "Another one! The net's getting tired.", "That's a streak! Don't think. Just shoot.", "You're unconscious right now! Keep it going.", "Heat check! Keep it going, I'm hanging on.", "Three, four, five in a row. You're making me proud, and I'm bolted to a wall.", "You're locked in. The net's practically singing.", "That's a streak. Just keep doing what you're doing.", "You're locked in. Net's practically humming.", "Another bucket. I'm running out of ways to say it.", "That's a heater. Don't stop."],
    best: ["New best! Hang that one in the rafters.", "Personal best! That's a banner night.", "Best ever! That's going on the highlight reel."],
    over: ["Game over. Shake it off, run it back. I'll be right here, hanging around.", "That's the game. Nobody remembers the misses. They remember that you kept shooting.", "Final buzzer. Good run. Ice those fingers.", "That's it. Come back tomorrow. The court's always open.", "Game's done. Win some, lose some. Keep showing up to the gym.", "Final buzzer. Good game. Go grab some water.", "That's a wrap. I'll be right here, same spot, waiting.", "Game's over. Nobody leaves the gym the same as they came in.", "That's the final horn. Good game. Hydrate.", "Done for the night. Turn the lights off on your way out. Or leave them. I like company."],
    rankup: ["Level up! You're making the jump to the next league.", "New rank! That's a promotion to the starting five.", "Moving up! Keep putting up shots and it keeps coming.", "You moved up. That's a big shot, and you made it.", "New rank. Don't celebrate too long. The next possession is coming."],
    achieve: ["Achievement unlocked! That one goes in the trophy case.", "New badge! Earned it in the gym.", "Unlocked! Small wins make big seasons.", "An achievement. Add it to the banners.", "Unlocked. That's the kind of thing you hang from the rafters."],
    model_right: ["You beat the model! Ball don't lie.", "Called it! Better than the analytics department.", "Correct pick. Sometimes you just know ball.", "You and the model both saw it. That's good vision.", "The model called it the same way. Great minds play alike."],
    model_wrong: ["Upset city. That's why they play the games.", "Wrong pick. Any given night, anyone can win.", "Missed it. Basketball's beautiful and random. Mostly beautiful."],
  },
  clock: {
    welcome: ["Hi! I'm Shot Clock. Twenty four seconds. That's all anyone ever gets. Let's not waste them.", "You're back! Quick, quick, let's go. Sorry. I'm always like this.", "Ready? Clock's running. It's always running. Deep breaths. Mine, I mean.", "Hi! You're here! Perfect timing! Get it?", "Ready? Okay, ready? Here we go, in three, two, one!"],
    hit: ["Got it in time! Phew. I wasn't worried. I was very worried.", "Correct! With seconds to spare. Well, plenty of seconds.", "Yes! You beat me! I mean, the clock. I'm the clock.", "Nice. Calm under pressure. Teach me that.", "Correct. See? When you don't panic, it all works out.", "That's it! I can breathe again.", "Good answer. Time well spent.", "Correct! Every second counted, and you counted them right.", "Correct! With time on me! I love it when there's time on me!", "Right! I'm doing victory laps! In place! I'm a clock!", "Yes! You made that look so easy! My hands are shaking!", "That's it! Whew! I almost buzzed, I swear!", "Correct! Fast and calm! Is that allowed?", "Nice! I was holding my breath. I don't have lungs. Still!", "You got it! Tick, tick, yes! That's the sound!", "Wow, right! You're making me look slow!", "Perfect! Not a second wasted!", "Correct! Okay! I'm so relieved I forgot how to count!", "Correct! With time to spare! I'm so relieved I'm ticking louder!", "Right! You didn't even rush! How? Teach me!", "Yes! Phew! My hands are damp! I don't have hands!", "That's it! With three seconds left! Okay, I made that up. But it felt that close!", "Correct! Everything's fine! Everything's great!", "Right! I'm doing a victory tick!", "You got it! The buzzer didn't even have time to ring!", "Yes! You're so smooth under pressure! I'm a mess! You're great!"],
    bighit: ["Already?! I barely started counting!", "That was so fast I didn't even tick!", "First clue! I've never felt so relaxed.", "Instant answer! You're the calmest player I've ever met.", "Whoa! I had twenty seconds left! Nobody does that!", "That was lightning! You didn't even let me count to three!", "First clue! I didn't even have time to get nervous!", "So fast! You make me feel slow, and I'm literally about speed!", "You buzzed before I started counting! Incredible!", "First clue! I didn't even have time to panic!"],
    miss: ["Ah! Wrong! It's okay, it's okay. We still have time. We always have a little time.", "Missed it. Breathe. Rushing never helps. I would know.", "Not that one. The clock resets. That's the nice thing about me.", "Wrong. Don't panic. I panic enough for both of us.", "Nope. Next possession. Fresh twenty four.", "Missed. Hey, some shots don't fall. The clock doesn't care, and neither should you.", "Not it. Slow down a little. Speed is good, but calm is better.", "Wrong answer. It's fine. Really. I'm fine. We're fine.", "Wrong! Okay! It's okay! That's one possession!", "Missed it! Breathe! In, out! I can't, but you can!", "Not that one! But you've still got time! You always do!", "Oof! No! It's fine! It's fine! I'm fine! Are you fine?", "Wrong! It's just one shot! Statistically you'll take another!", "Missed! The clock doesn't judge. I do, a little. But kindly!", "Not it! Take a second. A real one. They're free!", "No! But it's a fresh shot clock next time! Fresh start!", "Wrong answer! But your pace was great! That counts!", "Missed! Honestly the pressure is my fault. I'm sorry!", "Wrong! Okay, okay, no big deal! Next shot clock, fresh start!", "Not it! Don't worry! I reset all the time!", "Missed it! It's alright! Even the best run out of time once in a while!", "Nope! But you were so close! Like, within a few ticks!", "Oh no! Wrong! It's fine! It's all fine!", "That's a miss! Take a deep breath! Or just a breath! Any breath!", "Wrong one! I'm sorry! I'm sorry for the pressure!", "Missed! The next one's yours! I've got a good feeling! I've also got a bad feeling! Mixed feelings!"],
    streak: ["A streak! Time is flying! In a good way!", "Three in a row! I'm counting down from excited.", "Still going! You make every second look easy.", "Five straight! I've stopped worrying. Almost.", "On a roll! Don't look at the clock. Don't look at me.", "Keep going! I'm counting, and it's going so well!", "Another one! I'm running out of fingers! I don't have fingers!", "That's a streak! Time is on your side, and I'm on your side!", "Four in a row! My ticking's gone all happy!", "So many in a row! I've lost count! I'm a clock! This is embarrassing!", "Another one! I'm so excited my minute hand is shaking!", "You're unstoppable! Even time can't catch you!"],
    best: ["New best! In record time! I measured it!", "Personal best! I'll remember this second forever.", "Best ever! Time well spent, every bit of it."],
    over: ["Time's up! Not just for the run. For today. That's okay. Tomorrow has new seconds.", "That's the buzzer. You did good. Time goes on. So do you.", "Game over. Rest. I'll keep ticking for you.", "That's it! Every run ends. That's what makes them count.", "Out of time. But you used it well. That's all anyone can do.", "Time! That's the buzzer! Good run!", "All done! I'm resetting! Come back soon!", "Final seconds gone! You were great! I'm exhausted!", "And that's time! Great job! Let me reset!", "Buzzer! That's the end! You did great! I did a lot of counting!"],
    rankup: ["You levelled up! It only took... I counted... a lot of seconds! Worth it!", "New rank! Right on time!", "Promotion! Time well invested!", "You went up a rank! Time well spent!", "Rank up! I'm so proud, I skipped a second!"],
    achieve: ["Achievement unlocked! Just in time!", "New badge! I timed it. Perfect.", "Unlocked something! Tick tock, that's progress.", "An achievement! Time to celebrate! Briefly! There's more clock to run!", "You unlocked something! I'm ticking with joy!"],
    model_right: ["You called it! Faster than the model, too!", "Right pick! Good timing!", "Correct! The model ran out of time on that one.", "The model agrees! You two are on the same clock!", "You and the model picked the same one! Tick, tick, yes!"],
    model_wrong: ["Wrong pick. That's okay. Upsets happen in the last seconds all the time.", "Missed that one. The clock doesn't lie, but games do surprise.", "Not this time. Reset. Next game."],
  },
  sneak: {
    welcome: ["Yo! I'm Sneak. Hear that squeak? That's the sound of greatness. Let's go!", "My guy, you're back! Let's light up this court!", "Laces tight, let's hoop! Or, you know, quiz. Same energy.", "Yo! You're back! Let's get some buckets!", "Fresh pair, fresh day. Let's go!"],
    hit: ["Let's gooo! That's a bucket!", "Clean! Like fresh out the box!", "Yes! I'm squeaking with joy right now!", "That's money! You can't teach that!", "Swish! I'm doing a little crossover dance right now.", "Correct! That's that hall of fame knowledge.", "Ayy! You cooked that!", "Right answer! Somebody check the replay, that was smooth.", "Boom! Fresh as a box out the shop!", "Cold-blooded! You didn't even blink!", "That's the one! I'm squeaking like crazy!", "Clean! Cleaner than my insoles!", "Yes, yes, yes! Highlight of the night!", "Let me get a clip of that one! That's going on my wall!", "You're him! Or her! Or them! Whoever! You're the one!", "Right! The crowd's getting loud for you!", "That's a W! Capital W!", "Bucket! I need a minute, my laces are untied from excitement!", "Ooh, clean! That's straight out the box!", "Right! You're cooking and I'm ready to eat!", "Bucket! I need a new pair just to celebrate!", "That's a W! Big W! Frame it!", "Correct! I'm squeaking and I can't stop!", "Yes! Okay, that's a highlight, I'm saving it!", "Nice! The whole court's looking at you right now!", "Right on time! That's the one! Straight fire!"],
    bighit: ["Instant! You're on another level!", "Whoa! Fastest hands in the gym!", "First clue?! Are you kidding me?! Let's go!", "That was a poster dunk of an answer!", "So fast I left skid marks!", "That was quick! No hesitation! Straight cold!", "You buzzed right away! My laces got goosebumps!", "First clue! That's a highlight right there!", "First clue! That's a quick release!", "Straight cold! You didn't even wait!"],
    miss: ["Ooh, no. That's alright, even I slip on a wet court sometimes.", "Missed! No stress. Pull up, shoot again.", "Not it. Shake it off, my friend. Fresh kicks, fresh chance.", "Wrong one! Hey, every legend has bad nights.", "Nope! But you were brave. Brave is drip.", "Missed it. Get back on D and come back stronger.", "Not this one. Tie your laces, take a breath, go again.", "Wrong! It's cool. I've been stepped on by better players than this question.", "Nope! But we've all had a scuff or two, it's fine!", "Missed! You're still stylish, that counts!", "Wrong! Next one, new kicks, new luck!", "Not that one! But that confidence? Keep that!", "Oof! Hey, nobody saw that. Okay, I did. Still love you!", "Wrong! Tie your laces and go again!", "That's a miss! But you went for it. Respect!", "Not quite! Shake it out! Stretch it out!", "No! But that's alright. The pros miss too. Allegedly.", "Wrong one! But the vibes? Immaculate!", "Missed! Don't stress it, you're still fly!", "Nope! Tie 'em tighter and run it back!", "Wrong one! But the confidence? Immaculate!", "Ah! Close! Dust off the soles and go again!", "That's a miss! But your style is still ten out of ten!", "Not it! New game, new shoes, new luck!", "Oof! Hey, no worries! Even legends scuff!", "Wrong! But you've got the best attitude I've seen all day!"],
    streak: ["You're cooking! Somebody turn the oven down!", "Streak! I'm squeaking so loud right now!", "On fire! These shoes can't keep up!", "Another one! You're a problem! In a good way!", "Heat check! You're passing it!", "You're on a heater! Somebody call the shoe store!", "Another bucket! I can't even squeak straight!", "That's a streak! I'm glowing! My soles are glowing!", "Keep going, keep going! This is your night!", "You're on a run! Somebody call the shoe store!", "Another one! I'm squeaking so loud the court's shaking!", "That's three, four, five! You're him! Or her! Or them! Whoever you are, you're the one!"],
    best: ["New best! That's a signature shoe moment!", "Personal best! They're gonna name a colourway after you!", "Best ever! Frame it, put it on the wall!"],
    over: ["Game over! Good run! Stretch, hydrate, come back tomorrow!", "That's the final buzzer! You put in work today!", "Done! Even the best shoes need a rest. So do you.", "That's a wrap! Proud of you, for real.", "Game's done! Win or lose, you laced up. That's the first step.", "Game over! Well played! Go put your feet up!", "That's the buzzer! GG! Come back soon!", "All done! Wash me off and I'll see you tomorrow!", "Game over! Great run! Time to wash the court off me!", "That's the buzzer! Well played! Take a break, champ!"],
    rankup: ["Level up! New rank, new drip!", "You moved up! That's a promotion to the big leagues!", "Rank up! I knew you had that in you!", "Rank up! You're moving up the leaderboard like a fresh drop!", "Level up! That's a big step, my friend!"],
    achieve: ["Achievement unlocked! That's a limited edition!", "New badge! Collector's item!", "Unlocked! That's rare, my friend!", "Achievement unlocked! I'm hanging it on my laces!", "New badge! That's some serious kicks!"],
    model_right: ["You beat the model! Human hoopers rise up!", "Called it! You know ball!", "Right pick! The analytics nerds are shook!", "The model agrees! You're in sync! Love it!", "You and the model are on the same page! That's a vibe!"],
    model_wrong: ["Upset! That's basketball, baby!", "Missed it! Even the best scouts get it wrong sometimes.", "Wrong pick! Next game, next chance!"],
  },
};

/* A second helping: more everyday lines, deeper ones for the big moments, and lines for particular games. */
const MASCOT_MORE = {
  boot: {
    hit: ["Correct. Like a well-oiled pair of boots, you just work.", "Right! I'd tap you on the shin if I could.", "That's the one. Textbook. And I've been in the textbooks.", "Spot on. Your granddad would be proud. I knew your granddad. Size nine."],
    miss: ["Not him. Never mind. I've had worse days. I once spent a whole season in a lost property box.", "Wrong one. Even the great Brazil sides misplaced a pass now and then.", "No. Dust yourself off. Grass stains wash out.", "Missed. Don't overthink it. The best players have short memories."],
    over: ["The run's over. You know what I've learned in all these years? Nobody remembers the losses. They remember who kept coming back.", "That's the end of that one. Funny, isn't it. The games we lose teach us more than the ones we win.", "Full time. Somewhere out there, a kid is kicking a ball against a wall, dreaming. That used to be all of us."],
    deep: ["I've been retired for years, and I still remember every pitch. Treasure the games while you're playing them.", "People think boots just get thrown away. We don't. We get kept in garages, by people who can't let go. That's love, that is.", "I've been resoled four times. Each time I came back feeling a bit more like myself.", "Rain, mud, snow. It was all the same to me, as long as someone was playing.", "A game isn't about winning every time. It's about turning up when the weather's rotten.", "I miss the old terraces sometimes. But I've got you now, and that's alright by me.", "I've seen kids play in my size for years, and they never stop dreaming. That's the best part of it.", "Football isn't about the trophy. It's about the muddy Sunday mornings nobody asks you to remember.", "There's no perfect pair of boots. There's just a pair you've broken in properly."],
    blur: ["Spotted that badge through the fog! Like seeing your club's colours from the back of the stand.", "Sharp eyes! You'd recognise that crest anywhere, wouldn't you."],
    career: ["Every club in order! You know a career like it's your own.", "That career path is a long road. You walked it in seconds."],
    ttt: ["Three in a row! Noughts and crosses, football style. Lovely.", "Square claimed. That's tactical, that is."],
    value: ["Good eye for a price. You'd make a better director of football than most.", "Right on the money. Literally."],
  },
  rita: {
    hit: ["Correct. That's a clean sheet of an answer.", "Right. I'm awarding you the point. No appeal.", "Good. Textbook decision.", "Correct. I've written it down in ink."],
    miss: ["Wrong. Take a breath. Players who argue with me lose twice.", "No. That's a foul on the question. Free kick to me.", "Incorrect. Unlucky. Genuinely, unlucky.", "Not that one. Everyone in the stadium knows it. Except you, just now."],
    over: ["Final whistle. You know what nobody tells you about refereeing? Everyone remembers your mistakes and nobody notices your good calls. Be kinder to yourself than they are to me.", "That's full time. Win or lose, shake hands. Character shows at the end, not the start.", "Game over. Learn the laws, respect the game, come back sharper."],
    deep: ["I've been booed in every stadium in Europe. I still show up. Doing the right thing doesn't always get applause.", "Nobody grows up dreaming of being the referee. Some of us just love the game enough to stand in the middle of it.", "A referee is only noticed when something goes wrong. I've made my peace with that.", "Every decision is made in about a second. Then you live with it for years. That's the job.", "I run more than most of the players. Nobody writes songs about that either.", "Fairness isn't exciting. It's just the reason everything else works.", "The hardest part of the job is the silence after a decision. You have to be comfortable in it.", "I've been shouted at by thousands. The trick is to hear the one person who isn't shouting.", "Being fair is not always popular. But it lets everyone play."],
    blur: ["Badge identified. Crystal clear. Even with the blur.", "Correct crest. I've seen that one from the tunnel."],
    career: ["Career confirmed. Every club accounted for.", "Right player. That path checks out."],
    ttt: ["Line complete. Three in a row, by the rules.", "Square awarded. Legal and fair."],
    value: ["Accurate valuation. Fair price, fairly guessed.", "Correct. You'd pass a transfer audit."],
  },
  bench: {
    hit: ["Yes! You're like the captain I always wanted to pass to.", "Correct! I'm clapping! Quietly! So coach doesn't notice!", "That's right! You're so good at this. Like, really good.", "Get in! I'm living my dreams through you right now and I'm okay with that."],
    miss: ["Missed. It's okay! Wanna know a secret? I miss things in training all the time. Nobody's watching though.", "Not it! Hey, you're out there trying. That's more than most.", "Wrong one! Shake it off! I'm shaking it off with you. Look. Shaking.", "Ah! So close. Next time. There's always a next time. That's my whole life motto."],
    over: ["Full time. You know what I've learned on this bench? Being ready matters more than being picked. One day it'll be your turn. One day it'll be mine.", "Game over. Hey, you played. That's the dream. Never forget it's the dream.", "That's the run. I'll be here tomorrow, warming up. Same as always. Hope you will be too."],
    deep: ["Some people get the big moments. Some of us just keep showing up for them. Both count. I promise both count.", "Nine seasons on the bench and I still lace up every game. Hope is a muscle. You have to train it.", "A bench is where you learn to cheer without being cheered for. It's a good skill.", "I watch every game from here. Nobody's watched more football than I have. Not in a good seat, but still.", "When you don't get picked, you can either sulk or you can learn the song. I learned the song.", "The best teams have someone who's glad when others do well. I like to think that's me.", "You know what? Being ready for the moment is a skill. Not everyone has it. I think I might.", "A team is bigger than who is on the pitch. The people on the side count too. I try to remember that.", "I clap the loudest, even if no one's looking. It's my way of saying thank you."],
    blur: ["You spotted it through the blur! I can't even see the pitch from here!", "Badge! Yes! You know every club! Teach me!"],
    career: ["You knew his whole career! I wish someone knew mine. It's one club. This bench.", "Every club in order! You're like a walking transfer history!"],
    ttt: ["Three in a row! You're winning! I'm so happy I'm vibrating!", "Square! Get in! Tic tac go!"],
    value: ["You priced that perfectly! Hey, what do you think I'm worth? Actually, don't answer.", "Right value! You'd be an amazing agent. Wanna be mine?"],
  },
  rim: {
    hit: ["Nothing but net. I love it when it doesn't even touch me.", "Bucket. Easy money.", "Clean. That's a pure shooter's answer.", "And one! Okay, it's just one. Still beautiful."],
    miss: ["Clank. That's okay, I've heard that sound a million times. Still here.", "In and out. Basketball can be cruel.", "Off the backboard and out. Good look, though.", "Short. Use your legs. And maybe the next clue."],
    over: ["Game over. You know, I've been dunked on by the greatest players alive. Every single time, I stayed up. That's the whole lesson.", "That's the buzzer. Win or lose, the gym will be open tomorrow.", "Final horn. Get some rest. Hoopers need sleep too."],
    deep: ["People only notice me when someone scores. That's okay. Some of us are built to help others shine.", "I've been hit, hung on, broken, and replaced. Still standing. Resilience is just getting back up more times than you fall.", "I hang up here and I watch everything. Pressure looks the same on every face.", "The rim doesn't care who's shooting. That's the best thing about it. It treats everyone the same.", "Practice is just making your future self the one who makes the shot.", "The ball goes through me and then it's gone. It's like life. Don't hold on too long.", "A shot isn't about the make or the miss. It's about being brave enough to take it.", "Gyms are quiet places most of the time. I like that. It's where the real work happens.", "Every great shooter has missed more shots than most people have taken. Remember that."],
    blur: ["You saw that logo through the blur! Elite court vision.", "Logo spotted! That's a no-look pass of an answer."],
    career: ["Whole career, every team. You've got the scouting report memorised.", "Career path nailed. You've been watching tape."],
    ttt: ["Three in a row! That's a triple double of squares.", "Square locked down. Defence wins championships."],
    value: ["Good read on that one. You know who's worth the max.", "Right number. You'd run a front office."],
  },
  clock: {
    hit: ["Correct! And with time left over! I love time left over!", "Yes! That's the stress-free kind of answer!", "Right! I can stop sweating now. Clocks sweat. Trust me.", "Got it! Five, four, oh never mind, you already got it!"],
    miss: ["Wrong! Okay, okay, okay. Reset. Twenty four. We're fine.", "Missed it! It's fine! I'm only screaming on the inside!", "Not it. You know what helps? A breath. I can't breathe, I'm a clock. You can.", "Wrong answer. Time doesn't stop for mistakes. That's actually good news. It means there's always a next second."],
    over: ["Buzzer! That's it for now. You know, I spend my whole life counting down. But the best moments are the ones where you forget the clock exists.", "Time's up. It always is, eventually. That's what makes every second matter.", "Game's done. Go do something that makes you lose track of time."],
    deep: ["Everyone's racing me. Nobody ever slows down to enjoy the possession. Slow down sometimes. I mean it.", "Twenty four seconds feels like nothing, until it's all you have left. Use your time on the things that matter.", "People hate me for ticking down. I don't mind. It's what makes the last second special.", "I've never once been late. But I've watched everyone else show up on time to the things that matter, and that's nice.", "The best moment in a game is usually the last five seconds. I'm proud to be part of that.", "You can't pause me. But you can choose how you spend what I give you.", "People tell me to slow down. I tell them I can't, it's my whole job. But I wish I could, for a moment.", "The last second of any game feels like an hour. I have never understood how.", "I count every possession like it matters. Because to someone, it does."],
    blur: ["You saw that logo before I even ticked! Amazing!", "Logo! So fast! I'm impressed and only slightly anxious!"],
    career: ["The whole career! You must have spent a lot of time on this. Time well spent!", "Every team in order! I counted! I count everything!"],
    ttt: ["Three in a row! Before the clock ran out! Phew!", "Square taken! Quick thinking!"],
    value: ["Right price, right on time!", "Nailed the value! Quick and accurate, my favourite!"],
  },
  sneak: {
    hit: ["Sheesh! That's a bucket!", "You're a walking highlight reel!", "That's cold! Ice cold!", "Let's go! I'm squeaking all over this court!"],
    miss: ["Ah, slipped! Even fresh soles slip sometimes.", "Missed! Wipe the soles, go again!", "Not it, but your form was clean. Trust the process.", "Brick! It's alright. Legends brick too, they just keep shooting."],
    over: ["Game over! You know what I've learned on every court? The squeak you hear is someone working. Keep working.", "That's a wrap! Proud of the effort. Effort's the drip that never goes out of style.", "Final buzzer! Ice those knees, come back tomorrow, run it back."],
    deep: ["Every pair of shoes wears out eventually. What matters is where you walked in them.", "I've been on courts in parks and in arenas. The game felt the same. Love it for what it is, not where you play it.", "Every scuff is a story. I like looking at mine and remembering the games.", "I've never met a player who's still wearing their first pair. Growth is the whole point.", "Sometimes it's the shoes. Mostly it's the person in them. Never forget that.", "The best game I ever played in was a park run on a Saturday. No crowd. Perfect.", "Every court I've been on taught me something. Park courts taught me to be humble.", "People notice the shoes first. Then they notice the player. I try to be worth noticing.", "The best sneakers aren't the shiniest. They're the ones that have been through the most."],
    blur: ["Logo spotted! That's eagle eyes, my friend!", "You read that blurry logo like it was 4K!"],
    career: ["Whole career on lock! You know ball history!", "Every team in order! That's encyclopedia energy!"],
    ttt: ["Three in a row! You're cooking the grid!", "Square locked! Lockdown defence!"],
    value: ["You priced that like a pro! Front office material!", "Money! Literally! Right value!"],
  },
};
Object.entries(MASCOT_MORE).forEach(([c, groups]) => Object.entries(groups).forEach(([k, L]) => { MASCOT_LINES[c][k] = [...(MASCOT_LINES[c][k] || []), ...L]; }));

/* A third helping, so the sidekicks rarely repeat themselves. */
const MASCOT_MORE2 = {
  boot: {
    hit: ["That's a proper footballer's answer, that.", "Correct. I've got goosebumps. Well, leather bumps.", "Right first time. Like a penalty down the middle.", "Spot on. You must have watched a lot of Match of the Day.", "Correct. Even the old groundsman would nod at that.", "That's the one. Simple, effective, no fuss.", "Yes. I've seen less composure in a cup final.", "Correct. Back of the net, as we used to say. We still say it.", "Right. You know your football. I can tell. I can always tell.", "Lovely. That's an answer with good first touch.", "Correct. That one's going in my memoirs.", "Yes! Put that on the scoreboard, son. Or daughter. Or whoever you are."],
    miss: ["Not him. I've worn the wrong boot on the wrong foot before. Long story.", "Wrong. Happens. Even the greats skied a few over the bar.", "Missed it. Chin up. The terraces forgive a miss. Eventually.", "No. That's alright. Every winter has a few muddy days.", "Not quite. You'll get the next one. I've a feeling in my laces.", "Wrong one. Take a breath and reset, like a goalkeeper after a howler.", "No. Don't overthink it. Overthinking is how I ended up in a skip.", "Missed. The best strikers miss more than you'd believe.", "Not that one. Forget it now. Strikers have short memories.", "Wrong. I've seen worse. I've been worse.", "No. That's football. Nobody gets every bounce.", "Off target. Still, you had a go. Plenty never do."],
    bighit: ["Early! Like a goal in the first minute of a derby!", "Instant! You read that like a sweeper reads a long ball.", "Before the clues even arrived! That's pure vision, that is.", "Lightning. They'll be writing songs about that one.", "First clue! I nearly came untied."],
    streak: ["Look at you go! Like a team on a twenty game unbeaten run.", "Another! I haven't seen form like this since the nineties.", "Streak's going strong. Keep your head down and keep scoring.", "You're on a run, kid. Enjoy every one of these.", "Unstoppable! Someone fetch the trophy polish.", "That's a hot streak. Don't change your socks."],
    over: ["Full time. Wash the kit, rest the legs, and dream about tomorrow.", "Run's over. You played with heart. That's all a boot can ask.", "That's the final whistle. Same time next week? I'll be in the cupboard.", "It's over, but the season's long. There's always next game.", "Final whistle. Every legend has nights like this. Most of them, actually.", "That's the lot. Go on, tell your mates about that streak."],
    deep: ["They put me in a museum once. I didn't like it. Boots are meant to be worn, not watched. So is life.", "I've been on the feet of heroes and nobodies. The grass felt the same under both.", "One day you'll be the old one telling stories. Make sure they're good ones.", "Nobody remembers the boot. They remember the goal. That's alright. That's how it should be.", "I miss the noise of the crowd. Enjoy the noise while it's there.", "The best days don't feel special while you're in them. Look around today, just in case."],
    welcome: ["Oh, hello again. Kettle's on. Let's play.", "Right. Boots laced, shin pads on. Off we go.", "Back for more? Good lad. Or lass. Let's go."],
    rankup: ["Up a level! You're climbing faster than a promoted side in August.", "New rank. That's a proper promotion, that is.", "Promoted again! Mind the step up, the football's quicker here."],
    achieve: ["Another badge. Your trophy cabinet's filling up nicely.", "Achievement! I'll add it to the club history books.", "Unlocked. Little by little, that's how legends are made."],
    model_right: ["The machine said one thing, you said another, and you were right. Lovely.", "You out-thought the computer. That's old school, that is.", "Spot on. Gut feeling beats spreadsheets sometimes."],
  },
  rita: {
    hit: ["Correct. Clear decision.", "Right. No discussion needed.", "Yes. Textbook.", "Correct. I'm almost impressed.", "That's right. Play continues.", "Good call. Better than mine on a Tuesday night in the rain.", "Correct. Fair and square.", "Right answer. Consistency, please. Keep it up.", "Correct. The linesman agrees.", "Yes. Composed and correct.", "That's the one. Clean as a whistle.", "Correct. You know the laws of this game."],
    miss: ["No. Free kick against you.", "Wrong. Calm down. It's one decision.", "Incorrect. Don't look at me like that.", "No. And no, I won't change my mind.", "Wrong answer. Unlucky. I mean that.", "Not him. Keep your discipline.", "Incorrect. Back to your position.", "No. Learn from it, move on.", "Wrong. I've been booed for less. You'll be fine.", "Not correct. Next play.", "No. That's a caution. Just a caution.", "Wrong. Deep breath. Concentrate."],
    bighit: ["Instant decision. I respect that enormously.", "First clue. That's elite reading of the game.", "Quick and correct. That's rare. That's very rare.", "Lightning. I didn't even have the whistle in my mouth.", "So fast. Are you sure you're not a referee?"],
    streak: ["Another one. Your discipline is excellent.", "The streak continues. I'm noting it down.", "Still unbeaten. Very good.", "That's consistency. That's what separates the good from the great.", "Keep this up and I'll have nothing to do.", "Remarkable streak. Stay focused."],
    over: ["That's full time. Good effort. Genuinely.", "Final whistle. You'll be better next time. I can tell.", "Game over. Report filed. Well played, mostly.", "That's it. No extra time today.", "Final whistle. Go home, rest, come back sharper.", "Match over. You conducted yourself well."],
    deep: ["People think referees don't care who wins. We care that the game is fair. That's a kind of love too.", "I've made calls I still think about at night. Everyone carries something. Carry it lightly.", "Some of the loudest people in the stadium have never set foot on a pitch. Ignore the noise. Play your game.", "Respect is earned in small moments. Shaking hands. Admitting a mistake. Trying again.", "Nobody thanks the referee. I do it anyway. Some things are worth doing without applause.", "The game is ninety minutes. How you treat people lasts much longer."],
    welcome: ["Players, positions please. We're starting.", "Welcome back. Fair play, as always.", "Right. Whistle's ready. Let's have a clean game."],
    rankup: ["Promotion confirmed. Paperwork filed.", "New rank. Earned through consistency.", "Up a level. Well officiated, by you."],
    achieve: ["Achievement verified. Well done.", "Badge awarded after review. Deserved.", "That's a new honour. Fully within the laws."],
    model_right: ["Your decision stands. The model's is overturned.", "Correct prediction. Clear and obvious.", "You read the match better. Noted."],
  },
  bench: {
    hit: ["Yes! I'm high fiving the water bottles!", "Correct! I'm telling the kit man!", "Oh, you're good. You're really good.", "Get in! Okay, I'm sitting back down.", "Yes! That's the stuff dreams are made of!", "Correct! I'd play you every week. If I picked the team. I don't.", "Right! I'm so proud. Is that weird? That's not weird.", "Yes! I've been practising that celebration for years!", "Correct! You make it look so easy!", "That's it! I'm doing star jumps! For warmth! And joy!", "Yes! Coach, I think we've found our new star!", "Right answer! You're on fire and I'm just warm!"],
    miss: ["Ah, not it. That's okay! I believe in you. I believe in everybody. It's my thing.", "Wrong one! But hey, you're on the pitch. That's the hard part.", "Missed. It's fine. I miss the bus to away games all the time.", "Not him! Shake it off. I'll shake it off with you.", "Nope! But your attitude is great. Coaches love attitude.", "Wrong! Don't worry, nobody saw. Except me. And I'm on your side.", "Missed it. You know what I do when I miss? I just keep warming up.", "Not quite! You'll get it next time. I can feel it in my hamstrings.", "Wrong one. It happens. I've been wrong about my chances for nine years.", "Nope! That's okay. Mistakes are proof you're trying.", "Missed! Still more minutes than me this season, so, winning.", "Not it! Head up! Look at me, I'm always looking up. At the scoreboard."],
    bighit: ["Instant! You're the super sub I always dreamed of being!", "Woah! That was a world class buzz!", "First clue! Even the stadium announcer is shocked!", "So fast! I didn't even finish my lunge!", "Lightning! Can you teach me that? Please?"],
    streak: ["A streak! I'm going to frame this moment!", "Another one! I'm cheering so loud the physio is staring!", "You're unstoppable! Like a team on the last day of a title race!", "Still going! I'm so excited I might pull a muscle!", "Streak! This is the best day on the bench ever!", "Keep going! I'm right here! Always right here!"],
    over: ["Game's over! You played great. I'll keep your seat warm.", "That's full time! Want a jaffa cake? We've got loads on the bench.", "It's over! But tomorrow's a new match. And I'll still be ready!", "Final whistle! Great effort. Like, really great.", "That's it! You gave it everything. That's all anyone wants.", "Done! Same time tomorrow? I'll be here. Obviously."],
    deep: ["Sometimes I wonder if I'm the bench, or the bench is me. Then I remember: I'm just patient. Patience is a talent too.", "Everyone you see on the pitch was once on a bench somewhere. Waiting is part of the story, not the end of it.", "I clap for everyone who scores. One day someone will clap for me. Until then, I'll keep clapping.", "Being ready for a chance that might never come sounds sad. It isn't. It means you still believe.", "Nobody notices the sub who keeps warming up. But the team does. Effort is never invisible to the people who matter.", "Some dreams take nine seasons. Some take nineteen. The important thing is they're still dreams."],
    welcome: ["You came back! Best day ever!", "Hi! I've been stretching since you left!", "You're here! Let's go! I mean, you go. I'll watch."],
    rankup: ["You got promoted! Like a youth player getting a first team call!", "New rank! You're climbing! I'm so jealous and so happy!", "Level up! Tell me everything about it!"],
    achieve: ["You got a badge! I'm making you a little cake. Imaginary cake.", "Achievement! You're collecting them like I collect splinters!", "Unlocked! Look at you, achieving things!"],
    model_right: ["You beat the robot! Humans one, robots nil!", "Right prediction! Better than our actual manager!", "You called it! Can you call my name next?"],
  },
  rim: {
    hit: ["Cash. That one didn't even touch me.", "Swish. Beautiful arc on that answer.", "Bucket. Easy two.", "That's good. Smooth like a fadeaway.", "Count it. Clean.", "Nice. You've been in the gym.", "That's a pure shooter's answer.", "Splash. I love that sound.", "Two points. And the respect of the hoop.", "That's in. Every time you do that, a net somewhere smiles.", "Good. Keep that same form.", "Money. You're feeling it."],
    miss: ["Clank. I felt that one. It's okay.", "Rattled out. Unlucky bounce.", "Short. Bend those knees next time.", "Airball. Hey, at least it was confident.", "Front rim. You're close.", "Off the glass and out. That's basketball.", "No good. Get back on defence.", "Brick. Even legends throw a few bricks.", "In and out. That's the cruellest one.", "Missed. Shake it off, next play.", "Long. You're amped up. Calm the arm.", "Not this one. The next one's falling."],
    bighit: ["From half court! That's a buzzer beater!", "Early and in! That's a dagger!", "Instant! You didn't even need to dribble!", "First clue! That's a logo shot!", "Cold blooded! That's an instant bucket!"],
    streak: ["You're on fire! Somebody call the fire department!", "Heat check passed! Keep shooting!", "Another one! The defence has no answer!", "You're in the zone! Don't overthink it!", "Streak's alive! The crowd's on its feet!", "Unstoppable! This is a career night!"],
    over: ["Final buzzer. Good game. Shake hands, run it back tomorrow.", "Game over. Ice the arm, watch the film, come back stronger.", "That's the horn. You left it all on the court.", "Game's done. Even the champs drop games.", "Final whistle. Wait, wrong sport. Final buzzer.", "That's it. I'll be right here. Hanging. Like always."],
    deep: ["I've been part of every great moment in this game, and never once been the hero. I'm alright with that. Somebody has to hold the dream up.", "Thousands of kids have shot at me alone in the dark, practising. I remember every one. Nobody sees the work. I do.", "Missing a shot isn't failing. Not shooting is.", "I've been bent and broken and replaced. Still, every season, I'm back. Resilience isn't loud. It's just showing up.", "The ball comes back down every time. So do you.", "Everybody wants the dunk. Real players love the free throws too. The boring stuff wins games."],
    welcome: ["Back on the court. Let's get some shots up.", "Ball's in your hands. Let's go.", "Warm up's over. Game time."],
    rankup: ["Level up! You just made the All Star team.", "New rank! You're a starter now.", "Promoted! That's a max contract energy."],
    achieve: ["Achievement! That's a banner for the rafters.", "Badge unlocked! Earned in the gym.", "New honour! That's a ring moment."],
    model_right: ["You called it over the analytics! Ball don't lie!", "Right pick! You know the game.", "Beat the model! Eye test wins sometimes."],
  },
  clock: {
    hit: ["Correct! And look, still time on me! Perfect!", "Yes! I didn't even have to panic!", "Right! You're so calm! How are you so calm?", "Correct! I'm resetting with joy!", "Yes! Twenty four seconds of happiness!", "Right answer! I could hug you! I have no arms!", "Correct! Good use of time!", "Yes! No rush, no stress, just right!", "Got it! My numbers are glowing green!", "Correct! The best possession I've seen all day!", "Right! Every second you spend learning pays off!", "Yes! Time well spent! My favourite kind!"],
    miss: ["Wrong! Okay! Okay! We're fine! Totally fine!", "Not it! Don't panic! Panicking is my job!", "Missed! It's okay, the clock resets! Fresh start!", "Wrong one! Breathe in for four, out for four. That's what I do. Well, try to.", "Nope! Hey, mistakes don't count against your time. Only against my nerves.", "Missed! The shot clock doesn't hold grudges. Neither should you.", "Wrong! Slow down a touch. You're faster than you need to be.", "Not this one! There's always another possession!", "Missed it! You know, nobody makes every shot. Not even with all the time in the world.", "Wrong! Reset! Focus! Twenty four!", "Nope! Hey, hey, it's alright. I'm alright. We're alright.", "Missed! Time to reset. That's literally what I do."],
    bighit: ["Already?! You barely used a second!", "Woah! That's the fastest possession ever recorded!", "First clue! I didn't even start ticking!", "Instant! You're calmer than a closed shot clock!", "So quick! I think I just relaxed for the first time!"],
    streak: ["A streak! Every second you're getting better!", "Another one! Time's on your side today!", "Still going! I've never been so proud of a possession!", "Five in a row! I'm counting up for once!", "Unstoppable! The clock can't keep up!", "Streak! Make it last! Not too long, I'll get nervous!"],
    over: ["Time's up! You did great! I timed it! Great!", "That's the buzzer! Rest those fingers!", "It's over! Time to slow down for a bit. Even me.", "Game over! Thank you for every second!", "Final buzzer! Go enjoy some time that doesn't count down!", "That's it! The clock stops! Phew!"],
    deep: ["I count down every possession, all day, every day. Nobody counts the seconds they spend happy. Maybe you should.", "Everyone thinks they're running out of time. Most people have more than they think. Use it on what you love.", "I'm always rushing people. Here's a secret: the best players never feel rushed. They're just ready.", "Time doesn't stop for anyone. That's not scary. That's why every moment matters.", "When the game ends, nobody remembers how much time was left. They remember what you did with it.", "Breathe. The clock is loud, but it isn't in charge of you."],
    welcome: ["Hi! Ready? I'm ready! I'm always ready! Too ready!", "You're back! Twenty four seconds on the clock! Let's go!", "Hello! Deep breath! Okay! Let's play!"],
    rankup: ["You levelled up! Right on schedule!", "New rank! Time well invested!", "Promotion! Took exactly as long as it should!"],
    achieve: ["Achievement! Timed to perfection!", "Badge! Earned with seconds to spare!", "Unlocked! Tick tock, look at you go!"],
    model_right: ["Right pick! Faster than the model!", "Called it! Good timing!", "Correct! The model ran out of seconds!"],
  },
  sneak: {
    hit: ["Sheesh! That's a bucket, my friend!", "Clean! Fresh like a new pair!", "Let's go! You're cooking!", "Ayo! That's hall of fame knowledge!", "Smooth! Like a crossover into a step back!", "Correct! The squeak of victory!", "Money! You're so locked in!", "Yes! You're the best on the court right now!", "That's cold! Ice in the veins!", "Easy work! You make it look effortless!", "Bucket! Somebody start the highlight tape!", "Correct! I'd sign a shoe deal with you!"],
    miss: ["Missed! Hey, even fresh soles slip sometimes.", "Not it! Shake it off, back on D!", "Wrong one! Legends brick too, they just don't stop.", "Nope! Keep that confidence, though!", "Missed! The next one's going down, trust me.", "Not this one! Reset, refocus, reload!", "Brick! It happens! Keep the energy up!", "Wrong! You were brave, and brave is drip.", "Missed! Wipe the soles, go again!", "Nope! Short memory, my friend, short memory.", "Not it! The court's still yours!", "Wrong! It's alright, I've been stepped on worse."],
    bighit: ["Instant! You're too fast for the defence!", "First clue! That's a poster!", "So quick! I left skid marks!", "Woah! That's a fast break answer!", "Immediate! You're playing at a different speed!"],
    streak: ["You're on fire! Somebody turn the heat down!", "Another bucket! The crowd is going wild!", "Streak! I'm squeaking off the walls!", "You can't miss! Seriously, try missing!", "Heat check passed! Keep shooting!", "Unconscious! This is a career night!"],
    over: ["Game's over! Great energy! Bring it back tomorrow!", "That's a wrap! Ice, stretch, hydrate!", "Final buzzer! You put in work!", "Done! Even the best shoes need rest!", "That's the game! You were hooping out there!", "Over! Proud of you, for real, for real!"],
    deep: ["Every pair of shoes has a story. Scuffs are just chapters. Don't hide yours.", "I've been on the feet of champions and kids in the park. The love of the game felt exactly the same.", "You don't need the most expensive shoes to be great. You need to keep lacing them up.", "Some nights the shot falls. Some nights it doesn't. The work is the same either way. Respect the work.", "A squeak on the court means someone's moving. As long as you're moving, you're in the game.", "Shoes wear out. Memories don't. Make good ones."],
    welcome: ["Yo! Lace up! Let's hoop!", "You're back! The court missed you!", "Let's goooo! Game time!"],
    rankup: ["Level up! New rank, new drip!", "Promotion! You're in the big leagues now!", "Rank up! That's a signature shoe moment!"],
    achieve: ["Achievement! That's a limited edition!", "Badge unlocked! That's rare heat!", "New honour! Collector's item!"],
    model_right: ["Beat the model! Human hoopers rise up!", "Called it! You know ball!", "Right pick! The analytics are shook!"],
  },
};
Object.entries(MASCOT_MORE2).forEach(([c, groups]) => Object.entries(groups).forEach(([k, L]) => { MASCOT_LINES[c][k] = [...(MASCOT_LINES[c][k] || []), ...L]; }));
/* ---------- Sidekicks: one mascot per sport (football lets you choose) ----------
   They pop into the corner on right answers, misses, streaks and new bests, greet you, and narrate the tour in their
   own Kokoro voice (src/80_make_voice.py makes the clips; src/voice_lines.json holds the lines). Original characters. */
const MASCOTS = {
  boot: { name: "Old Boot", voice: "bm_george", blurb: "A worn football boot who has played in every era. Back in my day...", sport: "fb" },
  rita: { name: "Ref Rita", voice: "bf_emma", blurb: "A referee who has seen everything. Deadpan, fair, secretly on your side.", sport: "fb" },
  bench: { name: "Bench", voice: "am_puck", blurb: "A sub who has warmed up for nine seasons. Any minute now, coach will call his name.", sport: "fb" },
  rim: { name: "Rim", voice: "am_michael", blurb: "A hoop who has been dunked on more than anyone alive, and is still standing.", sport: "bb" },
  clock: { name: "Shot Clock", voice: "am_eric", blurb: "A nervous shot clock, always counting down. Teaches you to stay calm.", sport: "bb" },
  sneak: { name: "Sneak", voice: "am_fenrir", blurb: "A squeaky high-top who has been on every court. Loud, hype, kind.", sport: "bb" },
};
Object.entries(MASCOTS).forEach(([k, m]) => { m.lines = MASCOT_LINES[k]; });
const MOOD_OF = { welcome: "happy", hit: "happy", bighit: "wow", miss: "sad", streak: "wow", best: "wow", over: "calm", tour: "happy", rankup: "wow", achieve: "happy", model_right: "happy", model_wrong: "sad", idle: "calm" };
function mascotFace(mood, cx, cy, s = 1) {
  const e = (dx) => cx + dx * s, y = cy, ink = "#2a1a08";
  const eyes = { happy: `<path d="M${e(-12)} ${y}q4 -5 8 0M${e(4)} ${y}q4 -5 8 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`, wow: `<circle cx="${e(-8)}" cy="${y}" r="${4.5 * s}" fill="${ink}"/><circle cx="${e(8)}" cy="${y}" r="${4.5 * s}" fill="${ink}"/><circle cx="${e(-6.5)}" cy="${y - 1.5}" r="${1.4 * s}" fill="#fff"/><circle cx="${e(9.5)}" cy="${y - 1.5}" r="${1.4 * s}" fill="#fff"/>`, sad: `<path d="M${e(-12)} ${y - 1}q4 3 8 1M${e(4)} ${y}q4 2 8 -1" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M${e(11)} ${y + 4}q2 4 0 6q-2 -2 0 -6z" fill="#7cc6ff"/>`, calm: `<circle cx="${e(-8)}" cy="${y}" r="${3 * s}" fill="${ink}"/><circle cx="${e(8)}" cy="${y}" r="${3 * s}" fill="${ink}"/>` }[mood] || "";
  const m = { happy: `<path d="M${e(-8)} ${y + 10}q8 8 16 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`, wow: `<ellipse cx="${cx}" cy="${y + 12}" rx="${5 * s}" ry="${6 * s}" fill="${ink}"/>`, sad: `<path d="M${e(-7)} ${y + 15}q7 -6 14 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`, calm: `<path d="M${e(-6)} ${y + 11}q6 4 12 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>` }[mood] || "";
  const ch = mood === "happy" || mood === "wow" ? `<circle cx="${e(-15)}" cy="${y + 8}" r="4" fill="#ff8f80" opacity=".5"/><circle cx="${e(15)}" cy="${y + 8}" r="4" fill="#ff8f80" opacity=".5"/>` : "";
  return ch + eyes + m;
}
const MASCOT_SVG = {
  clock: (md) => `<svg viewBox="0 0 120 120" class="msvg"><ellipse cx="60" cy="114" rx="34" ry="5" fill="#000" opacity=".2"/><rect x="40" y="96" width="8" height="16" rx="2" fill="#444"/><rect x="72" y="96" width="8" height="16" rx="2" fill="#444"/><rect x="14" y="14" width="92" height="84" rx="12" fill="#1c1c1f" stroke="#444" stroke-width="3"/><rect x="22" y="22" width="76" height="68" rx="8" fill="#0d0d0f"/><text x="60" y="52" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-weight="900" font-size="24" fill="#ff3b30">24</text><g transform="translate(0,26)">${mascotFace(md, 60, 44, 0.75).replace(/#2a1a08/g, "#ffd60a")}</g></svg>`,
  sneak: (md) => `<svg viewBox="0 0 130 110" class="msvg"><ellipse cx="66" cy="104" rx="48" ry="5" fill="#000" opacity=".2"/><path d="M14 90V52c0-22 10-36 30-36h20l10 30c20 6 40 14 46 28v16z" fill="#e8e8e8" stroke="#222" stroke-width="3" stroke-linejoin="round"/><path d="M14 90h106v8H14z" fill="#e23d3d" stroke="#222" stroke-width="3"/><path d="M44 16v40" stroke="#e23d3d" stroke-width="10"/><path d="M50 30l18-6M52 40l20-6M56 50l20-6" stroke="#222" stroke-width="3" stroke-linecap="round"/><path d="M78 62q14 6 24 16" fill="none" stroke="#e23d3d" stroke-width="5" stroke-linecap="round"/>${mascotFace(md, 96, 74, 0.75)}</svg>`,
  boot: (md) => `<svg viewBox="0 0 120 110" class="msvg"><ellipse cx="60" cy="104" rx="44" ry="5" fill="#000" opacity=".2"/><path d="M30 12h34v48c10 4 34 8 44 18c6 6 2 16-8 16H22c-8 0-12-6-10-14l8-26z" fill="#8a5a2b" stroke="#3b230c" stroke-width="3" stroke-linejoin="round"/><path d="M30 12h34v10H30z" fill="#6e4520" stroke="#3b230c" stroke-width="3"/><path d="M38 30l20 6M38 40l20 6M38 50l20 6" stroke="#f3e2c0" stroke-width="3" stroke-linecap="round"/><path d="M22 94h86" stroke="#3b230c" stroke-width="3"/>${[30, 48, 66, 84, 100].map((x) => `<rect x="${x - 3}" y="94" width="6" height="7" rx="2" fill="#bbb" stroke="#3b230c" stroke-width="1.5"/>`).join("")}<path d="M70 66q6-3 10 2" stroke="#3b230c" stroke-width="2" fill="none" opacity=".5"/>${mascotFace(md, 84, 74, 0.85)}</svg>`,
  rita: (md) => `<svg viewBox="0 0 120 120" class="msvg"><ellipse cx="60" cy="114" rx="34" ry="5" fill="#000" opacity=".2"/><path d="M28 114c0-22 14-34 32-34s32 12 32 34z" fill="#fff" stroke="#111" stroke-width="3"/>${[36, 48, 60, 72, 84].map((x) => `<path d="M${x} ${x === 60 ? 80 : 84}v30" stroke="#111" stroke-width="6"/>`).join("")}<path d="M50 80l10 10l10-10" fill="#fff" stroke="#111" stroke-width="3" stroke-linejoin="round"/><path d="M86 22q16 6 12 30" stroke="#5a2e12" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="60" cy="48" r="28" fill="#f3c9a0" stroke="#5a2e12" stroke-width="3"/><path d="M32 44q4-26 28-26t28 22q-14-8-28-6t-28 10z" fill="#5a2e12"/><path d="M60 76v-6" stroke="#111" stroke-width="2"/><circle cx="60" cy="98" r="0" /><rect x="88" y="86" width="12" height="17" rx="2" fill="#ffd400" stroke="#111" stroke-width="2" transform="rotate(12 94 94)"/><path d="M78 70q8 4 10 0" stroke="#999" stroke-width="2" fill="none"/><circle cx="90" cy="70" r="4" fill="#ccc" stroke="#555" stroke-width="1.5"/>${mascotFace(md, 60, 48, 0.9)}</svg>`,
  bench: (md) => `<svg viewBox="0 0 120 120" class="msvg"><ellipse cx="60" cy="114" rx="36" ry="5" fill="#000" opacity=".2"/><path d="M26 114c0-24 14-36 34-36s34 12 34 36z" fill="#2f7de1" stroke="#123a70" stroke-width="3"/><path d="M40 82l20 32l20-32" fill="#ff7a00" opacity=".9"/><text x="60" y="106" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="16" fill="#fff">12</text><circle cx="60" cy="48" r="28" fill="#c98d5e" stroke="#5a3418" stroke-width="3"/><path d="M33 40q2-22 27-22t27 22" fill="#2a1a10"/><path d="M32 38h56" stroke="#fff" stroke-width="7"/><path d="M32 38h56" stroke="#e23d3d" stroke-width="3"/>${mascotFace(md, 60, 50, 0.9)}</svg>`,
  rim: (md) => `<svg viewBox="0 0 120 120" class="msvg"><rect x="18" y="6" width="84" height="58" rx="6" fill="#f7f7f2" stroke="#333" stroke-width="3"/><rect x="42" y="26" width="36" height="26" fill="none" stroke="#e85d1c" stroke-width="3"/>${mascotFace(md, 60, 28, 0.8)}<path d="M57 64v6h6v-6" fill="#888"/><ellipse cx="60" cy="74" rx="30" ry="7" fill="none" stroke="#e85d1c" stroke-width="5"/><path d="M32 76l8 34M44 79l4 32M60 81v32M76 79l-4 32M88 76l-8 34M36 92q24 8 48 0M40 104q20 6 40 0" stroke="#fff" stroke-width="2" fill="none" opacity=".9"/><path d="M32 76l8 34M44 79l4 32M60 81v32M76 79l-4 32M88 76l-8 34" stroke="#999" stroke-width="1" fill="none" opacity=".6"/></svg>`,
};
const Mascot = (() => {
  const sport = typeof DATA !== "undefined" && DATA.sport === "nba" ? "bb" : "fb", pre = sport === "bb" ? "bkn_" : "bk_", mine = Object.keys(MASCOTS).filter((k) => MASCOTS[k].sport === sport);
  const g = (k, d) => { try { return localStorage.getItem(pre + k) || d; } catch (e) { return d; } };
  let last = 0, hideT = null, n = 0, ctx = "";
  const id = () => (mine.includes(g("mascot", "")) ? g("mascot", "") : mine[sport === "bb" ? 0 : 2]);
  const mode = () => g("mascot_mode", "on");   // on, quiet (no voice), off
  const said = []; const pick = (arr) => { const fresh = arr.filter((x) => !said.includes(x)); const pool = fresh.length ? fresh : arr, x = pool[Math.floor(Math.random() * pool.length)]; said.push(x); if (said.length > 40) said.shift(); n++; return x; };   /* no repeats until the pool runs dry */
  function dock() {
    if (mode() === "off") { const d = document.getElementById("mascot"); if (d) d.remove(); return null; }
    let el = document.getElementById("mascot");
    if (!el) { el = document.createElement("div"); el.id = "mascot"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); el.addEventListener("click", (e) => { if (e.target.closest(".mbubble")) return hideBubble(); api.react("idle", true); }); }
    if (el.dataset.who !== id()) { el.dataset.who = id(); el.innerHTML = `<div class="mbody calm">${MASCOT_SVG[id()]("calm")}</div><div class="mbubble"></div>`; }
    return el;
  }
  function show(kind, text, opts = {}) {
    const el = dock(); if (!el) return; const m = MASCOTS[id()], mood = MOOD_OF[kind] || "calm";
    el.querySelector(".mbody").className = "mbody " + mood; el.querySelector(".mbody").innerHTML = MASCOT_SVG[id()](mood); try { outfitPaint(); } catch (e) { /* outfits not loaded */ }
    el.querySelector(".mbubble").innerHTML = `<b>${m.name}</b>${opts.ctx ? `<i class="mctx">${esc(opts.ctx)}</i>` : ""}${esc(text)}`;
    el.className = "on talk k-" + kind; clearTimeout(hideT); hideT = setTimeout(hideBubble, opts.ms || Math.min(10000, 3200 + text.length * 50));
    if (mode() === "on" && !opts.silent) AIVoice.play(text, { voice: m.voice, volume: 0.95 });
  }
  function hideBubble() { const el = document.getElementById("mascot"); if (!el) return; el.className = "on"; const b = el.querySelector(".mbody"); if (b) { b.className = "mbody calm"; b.innerHTML = MASCOT_SVG[id()]("calm"); try { outfitPaint(); } catch (e) { /* outfits not loaded */ } } }
  const api = {
    id, mode, show, sport, mine, dock,
    setCtx(x) { ctx = x || ""; },
    react(kind, force) { const now = performance.now(), big = ["streak", "best", "over", "rankup", "achieve"].includes(kind); if (!big && !force && now - last < 6000) return; last = now; const m = MASCOTS[id()], game = typeof S !== "undefined" && S.game, gl = (kind === "hit" || kind === "bighit") && game && m.lines[game], deep = kind === "over" && m.lines.deep && Math.random() < 0.35; /* a line about the game you are playing, or a deeper one at the end of a run */ let L = gl && Math.random() < 0.5 ? gl : deep ? m.lines.deep : m.lines[kind] || (kind === "idle" ? [...m.lines.welcome, ...m.lines.hit, ...(m.lines.deep || [])] : m.lines.hit); const c = kind === "hit" || kind === "bighit" ? ctx : ""; ctx = ""; show(kind, pick(L), { ctx: c }); },
    hello() { const m = MASCOTS[id()]; show("welcome", m.lines.welcome[0]); },
    voice() { return MASCOTS[id()].voice; },
    face(mood) { return MASCOT_SVG[id()](mood); },
    name() { return MASCOTS[id()].name; },
  };
  setTimeout(() => { try { dock(); } catch (e) { /* page not ready */ } }, 1500);   // always there in the corner, like a coach
  return api;
})();

/* ---------- Outfits for the sidekick, unlocked by rank and by achievements ---------- */
const OUTFITS = [
  ["none", "Classic", () => true, "Always yours"],
  ["silver", "Silver", (p) => levelOf(p.xp).i >= 3, "Reach rank 4"],
  ["gold", "Gold", (p) => levelOf(p.xp).i >= 5, "Reach the Captain rank"],
  ["fire", "Fire aura", (p) => !!p.ach.flame7, "Play seven days in a row"],
  ["party", "Party hat", (p) => !!p.ach.rounds100, "Play 100 games"],
  ["neon", "Neon", (p) => !!p.ach.squad, "Play every game"],
  ["crown", "Crown", (p) => !!p.ach.wk_win, "Win a weekly tournament"],
];
const outfitOK = (k) => { try { const o = OUTFITS.find((x) => x[0] === k); return !!o && o[2](prof()); } catch (e) { return k === "none"; } };
const outfitNow = () => { const pre = typeof DATA !== "undefined" && DATA.sport === "nba" ? "bkn_" : "bk_"; let k = "none"; try { k = localStorage.getItem(pre + "outfit") || "none"; } catch (e) { /* blocked */ } return outfitOK(k) ? k : "none"; };
const OUTFIT_HAT = { party: `<svg viewBox="0 0 60 60" class="mhat"><path d="M30 2L48 52H12z" fill="#ff4d8d" stroke="#7a1238" stroke-width="3" stroke-linejoin="round"/><circle cx="30" cy="4" r="6" fill="#ffd34e"/><path d="M20 32l20-6M16 44l28-8" stroke="#fff" stroke-width="4"/></svg>`, crown: `<svg viewBox="0 0 70 50" class="mhat"><path d="M6 44l4-30 14 14 11-24 11 24 14-14 4 30z" fill="#f2c14e" stroke="#7a5a10" stroke-width="3" stroke-linejoin="round"/>${[10, 35, 60].map((x) => `<circle cx="${x}" cy="${x === 35 ? 6 : 14}" r="4" fill="#e84a5f"/>`).join("")}</svg>` };
function outfitPaint() { const el = document.getElementById("mascot"); if (!el) return; const k = outfitNow(); el.dataset.fit = k; const b = el.querySelector(".mbody"); if (!b) return; b.querySelectorAll(".mhat").forEach((x) => x.remove()); if (OUTFIT_HAT[k]) b.insertAdjacentHTML("afterbegin", OUTFIT_HAT[k]); }
const outfitsHTML = (seg) => `<label class="pfl">Sidekick outfit</label><div class="scope" style="padding:2px 0">${OUTFITS.map(([k, n, , how]) => { const ok = outfitOK(k); return `<button type="button" class="chip" ${ok ? `data-ap="outfit|${k}"` : "disabled"} aria-pressed="${outfitNow() === k}" title="${ok ? n : "Locked: " + how}">${ok ? "" : "🔒 "}${n}</button>`; }).join("")}</div><div class="fine" style="margin-top:4px">Locked outfits unlock by rank or with achievements; hover one to see how.</div>`;
setTimeout(() => { try { outfitPaint(); } catch (e) { /* not ready */ } }, 1800);

/* Keep the sidekick off the game's own controls: when Buzz or the answer box is pinned to the bottom of the screen,
   the dock sits just above them (on a phone they share the same corner). */
setInterval(() => {
  const el = document.getElementById("mascot"); if (!el) return;
  let top = innerHeight; document.querySelectorAll(".buzzers, .answerbox, .lvbar, .modal:not([hidden]) .sheet").forEach((x) => { const r = x.getBoundingClientRect(); if (r.height && r.top < innerHeight && r.bottom > innerHeight - 260) top = Math.min(top, r.top); });
  const want = top < innerHeight ? `${Math.max(10, innerHeight - top + 8)}px` : ""; if (el.style.bottom !== want) el.style.bottom = want;
}, 700);
/* Settings, the visual way: every choice is a row of cards you swipe through (or tap, or step with the arrows), each showing
   what you get: the look as a little animated scene, each sidekick with their face, their blurb and one of their lines (tap to
   hear it in their voice), each outfit on your current sidekick, the theme as a swatch and text sizes as real text.
   Swiping a card into the middle applies it straight away. Shared by football and basketball (the build adds it to each page). */
const SETUI = { t: {} };
const setGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
function setApply(k, v) {   /* the same effect as the old chips, without rebuilding the page (so the carousel stays where it is) */
  if (k === "look") { const [st, md] = TP_OPTS[+v]; setApply("style", st); setApply("theme", md); return; }
  try { localStorage.setItem("bk_" + k, v); } catch (e) { /* blocked */ }
  try { const pf = prof(); pf.look = { ...(pf.look || {}), [k]: v }; saveProf(pf); } catch (e) { /* profile not ready */ }
  applyAppearance();
  if (k === "mascot") setTimeout(() => { try { Mascot.dock(); Mascot.hello(); } catch (e) { /* no sidekick */ } }, 60);
  if (k === "mascot_mode") setTimeout(() => { try { Mascot.dock(); if (v !== "off") Mascot.hello(); } catch (e) { /* no sidekick */ } }, 60);
  if (k === "outfit") setTimeout(() => { try { outfitPaint(); Mascot.react("achieve", true); } catch (e) { /* no outfits */ } }, 60);
}
const lookNow = () => { const st = setGet("bk_style", TP_OPTS[0][0]), th = setGet("bk_theme", "dark"), md = th === "auto" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : th; const i = TP_OPTS.findIndex(([s, m]) => s === st && m === md); return i < 0 ? TP_OPTS.findIndex(([s]) => s === st) : i; };
function carousel(id, cards) {
  return `<div class="crsl" data-crsl="${id}"><button type="button" class="crbtn" data-crs="${id}|-1" aria-label="Previous">‹</button><div class="crtrack" id="crs-${id}">${cards.join("")}</div><button type="button" class="crbtn" data-crs="${id}|1" aria-label="Next">›</button></div><div class="crdots" id="crd-${id}">${cards.map((_, i) => `<i data-crdot="${id}|${i}"></i>`).join("")}</div>`;
}
function skLine(k, n) { const L = (MASCOTS[k].lines || {}), all = Object.values(L).flat().filter((x) => typeof x === "string" && x.length < 140); return n === 0 && L.welcome && L.welcome[0] ? L.welcome[0] : all.length ? all[(n * 7 + k.length) % all.length] : MASCOTS[k].blurb; }
function appearanceV2() {
  const look = lookNow(), sk = Mascot.id(), fit = typeof outfitNow === "function" ? outfitNow() : "classic", th = setGet("bk_theme", "auto"), tx = setGet("bk_text", "m"), md = Mascot.mode();
  SETUI.line = SETUI.line || {};
  const lookCards = TP_OPTS.map(([st, mdd, n, d, c], i) => `<button type="button" class="crcard ${i === look ? "on" : ""}" data-set="look|${i}"><span class="lkprev ${st} ${mdd}" style="--a:${c[0]};--b:${c[1]};--c:${c[2]}"><i class="lkbeam"></i><i class="lkbeam b2"></i><i class="lkball"></i><i class="lkbar"></i><i class="lkbar s"></i><i class="lkpill"></i></span><b>${n}</b><small>${d}</small></button>`);
  const skCards = Mascot.mine.map((k) => `<div class="crcard skcard ${k === sk ? "on" : ""}" data-set="mascot|${k}" role="button" tabindex="0"><span class="skface">${MASCOT_SVG[k]("happy")}</span><b>${esc(MASCOTS[k].name)}</b><small>${esc(MASCOTS[k].blurb)}</small><span class="skbubble" id="skl-${k}">“${esc(skLine(k, SETUI.line[k] || 0))}”</span><span class="skbtns"><button type="button" class="btn ghost skhear" data-skhear="${k}">▶ Hear ${esc(MASCOTS[k].name.split(" ").pop())}</button><button type="button" class="btn ghost skmore" data-skmore="${k}">Another line</button></span></div>`);
  const fitCards = (typeof OUTFITS !== "undefined" ? OUTFITS : []).map(([k, n, , how]) => { const ok = outfitOK(k); return `<button type="button" class="crcard ofcard ${k === fit ? "on" : ""} ${ok ? "" : "locked"}" ${ok ? `data-set="outfit|${k}"` : "disabled"} data-fit="${k}"><span class="skface ofprev">${OUTFIT_HAT[k] || ""}${MASCOT_SVG[sk]("happy")}</span><b>${ok ? "" : "🔒 "}${esc(n)}</b><small>${ok ? (k === fit ? "Wearing it" : "Tap to wear it") : esc(how)}</small></button>`; });
  const themeCards = [["dark", "Dark", "Easy on the eyes at night"], ["light", "Light", "Bright, like a day game"], ["auto", "Follow my device", "Switches with your phone or computer"]].map(([k, n, d]) => `<button type="button" class="crcard thcard ${th === k ? "on" : ""}" data-set="theme|${k}"><span class="thprev ${k}"><i></i><i></i><i></i></span><b>${n}</b><small>${d}</small></button>`);
  const textCards = [["s", "Small", 13], ["m", "Normal", 16], ["l", "Large", 19], ["xl", "Extra large", 23]].map(([k, n, px]) => `<button type="button" class="crcard txcard ${tx === k ? "on" : ""}" data-set="text|${k}"><span class="txprev" style="font-size:${px}px">Who scored the winner?</span><b>${n}</b></button>`);
  const seg = (k, items, cur) => `<div class="scope" style="padding:2px 0">${items.map(([v, n]) => `<button type="button" class="chip" data-set="${k}|${v}" aria-pressed="${cur === v}">${n}</button>`).join("")}</div>`;
  return `<h3 class="sethead">Your look</h3><p class="fine">Swipe through them. The one in the middle is the one you get.</p>${carousel("look", lookCards)}
    <h3 class="sethead">Your sidekick</h3><p class="fine">They cheer, groan and narrate in their own voice. Tap ▶ to hear one.</p>${carousel("sk", skCards)}<div class="setsub"><span class="fine">Sidekick voice</span>${seg("mascot_mode", [["on", "Talks"], ["quiet", "Bubbles only"], ["off", "Hidden"]], md)}</div>
    ${fitCards.length ? `<h3 class="sethead">Outfit</h3><p class="fine">Locked outfits unlock with your rank or achievements; each card says how.</p>${carousel("fit", fitCards)}` : ""}
    <h3 class="sethead">Theme</h3>${carousel("th", themeCards)}
    <h3 class="sethead">Text size</h3>${carousel("tx", textCards)}
    <h3 class="sethead">Display</h3><div class="scope" style="padding:2px 0"><button type="button" class="chip" data-set="contrast|${setGet("bk_contrast", "0") === "1" ? 0 : 1}" aria-pressed="${setGet("bk_contrast", "0") === "1"}">High contrast</button><button type="button" class="chip" data-set="motion|${setGet("bk_motion", "") === "reduced" ? "full" : "reduced"}" aria-pressed="${setGet("bk_motion", "") === "reduced"}">Reduce motion</button></div><p class="fine">Reduce motion also stops background effects after a refresh.</p>`;
}
function setCenter(track, smooth) { const c = track.querySelector(".crcard.on") || track.firstElementChild; if (!c) return; track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.clientWidth) / 2, behavior: smooth ? "smooth" : "instant" }); setDots(track); }
function setDots(track) { const id = track.id.slice(4), cards = [...track.children], mid = track.scrollLeft + track.clientWidth / 2; let best = 0; cards.forEach((c, i) => { if (Math.abs(c.offsetLeft + c.clientWidth / 2 - mid) < Math.abs(cards[best].offsetLeft + cards[best].clientWidth / 2 - mid)) best = i; }); document.querySelectorAll(`#crd-${id} i`).forEach((d, i) => d.classList.toggle("on", i === best)); return cards[best]; }
function setPick(card) {   /* make this card the chosen one: apply it and mark it */
  if (!card || card.classList.contains("locked") || !card.dataset.set) return; const [k, v] = card.dataset.set.split("|"); if (card.classList.contains("on")) return;
  card.parentElement.querySelectorAll(".crcard.on").forEach((x) => x.classList.remove("on")); card.classList.add("on"); setApply(k, v); try { Snd.tick(); } catch (e) { /* quiet */ }
  if (k === "mascot") { const f = document.getElementById("crs-fit"); if (f) f.querySelectorAll(".ofprev").forEach((p) => { const hat = p.querySelector(".mhat"); p.innerHTML = (hat ? hat.outerHTML : "") + MASCOT_SVG[v]("happy"); }); }
}
function setWire(root) {
  SETUI.lock = true; clearTimeout(SETUI.lockT); SETUI.lockT = setTimeout(() => { SETUI.lock = false; }, 700);   /* positioning the rows is not a choice */
  root.querySelectorAll(".crtrack").forEach((t) => {
    requestAnimationFrame(() => setCenter(t, false));
    t.addEventListener("scroll", () => { setDots(t); clearTimeout(SETUI.t[t.id]); SETUI.t[t.id] = setTimeout(() => { if (SETUI.lock) return; setPick(setDots(t)); }, 220); }, { passive: true });
  });
}
document.addEventListener("click", (e) => {
  const h = e.target.closest && e.target.closest("[data-skhear]"); if (h) { e.stopPropagation(); const k = h.dataset.skhear, el = document.getElementById("skl-" + k), txt = el ? el.textContent.replace(/[“”]/g, "") : skLine(k, 0); try { AIVoice.play(txt, { voice: MASCOTS[k].voice, volume: 0.95 }); } catch (er) { /* no voice */ } h.closest(".crcard").querySelector(".skface").classList.add("talking"); setTimeout(() => h.closest(".crcard")?.querySelector(".skface")?.classList.remove("talking"), 2600); return; }
  const m = e.target.closest && e.target.closest("[data-skmore]"); if (m) { e.stopPropagation(); const k = m.dataset.skmore; SETUI.line[k] = (SETUI.line[k] || 0) + 1; const el = document.getElementById("skl-" + k); if (el) { el.textContent = `“${skLine(k, SETUI.line[k])}”`; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); } return; }
  const a = e.target.closest && e.target.closest("[data-crs]"); if (a) { const [id, d] = a.dataset.crs.split("|"), t = document.getElementById("crs-" + id); if (!t) return; const cur = setDots(t), cards = [...t.children], nx = cards[Math.max(0, Math.min(cards.length - 1, cards.indexOf(cur) + +d))]; t.scrollTo({ left: nx.offsetLeft - (t.clientWidth - nx.clientWidth) / 2, behavior: "smooth" }); return; }
  const dot = e.target.closest && e.target.closest("[data-crdot]"); if (dot) { const [id, i] = dot.dataset.crdot.split("|"), t = document.getElementById("crs-" + id), c = t && t.children[+i]; if (c) t.scrollTo({ left: c.offsetLeft - (t.clientWidth - c.clientWidth) / 2, behavior: "smooth" }); return; }
  const c = e.target.closest && e.target.closest(".crcard[data-set]"); if (c) { const t = c.parentElement; t.scrollTo({ left: c.offsetLeft - (t.clientWidth - c.clientWidth) / 2, behavior: "smooth" }); setPick(c); return; }
  const chip = e.target.closest && e.target.closest(".chip[data-set]"); if (chip) { const [k, v] = chip.dataset.set.split("|"); setApply(k, v); try { Snd.tick(); } catch (er) { /* quiet */ } if (k === "contrast" || k === "motion") { const on = k === "contrast" ? v === "1" : v === "reduced"; chip.setAttribute("aria-pressed", on); chip.dataset.set = `${k}|${k === "contrast" ? (on ? 0 : 1) : on ? "full" : "reduced"}`; } else chip.parentElement.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", x === chip)); }
}, true);

paintSplashArt();
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (v, d = 0) => (v * 100).toFixed(d) + "%";
const LG = DATA.leagues, ORDER = ["NBA"];
LG.ALL = { name: "NBA", country: "United States", tag: "Thirty franchises, every season since 2001-02.", star: null, logo: null, crests: LG.NBA.crests, seasons: LG.NBA.seasons, tables: LG.NBA.tables, race: null, scorers: null };
const lgs = (c) => (c === "ALL" ? ORDER : [c]);
const SLUG = { NBA: "nba", ALL: "all-leagues" };
const BYSLUG = Object.fromEntries(Object.entries(SLUG).map(([k, v]) => [v, k]));
const PAL = {
  NBA: { bg: "#17100C", surface: "#261A12", ink: "#FBF1E4", muted: "#CDB49B", accent: "#FF8A3D", glow: "#E8542E", display: '"Big Shoulders Display", sans-serif', mood: "Court lights" },
  ALL: { bg: "#17100C", surface: "#261A12", ink: "#FBF1E4", muted: "#CDB49B", accent: "#FF8A3D", glow: "#E8542E", display: '"Big Shoulders Display", sans-serif', mood: "Court lights" },
  HOME: { bg: "#120C09", surface: "#1F150E", ink: "#FBF1E4", muted: "#C4AA90", accent: "#FF9F4A", glow: "#E8542E", display: '"Big Shoulders Display", sans-serif', mood: "Tip-off" },
};
const FLAG = {
  NBA: "linear-gradient(90deg,#C8102E 0 50%,#1D428A 50%)",
  ALL: "linear-gradient(90deg,#C8102E 0 50%,#1D428A 50%)",
};
const INITIALS = { NBA: "NBA", ALL: "NBA" };
// Original emblems (not the official league logos, which are trademarked): a ring, a motif, the initials. If site/logos/<code>.* exists at build time its image is used instead.
function emblem(c, cls = "") {
  const L = lgOf(c); if (L.logo) return `<img class="emblem ${cls}" src="${L.logo}" alt="${esc(L.name)} logo">`;
  const motif = {
    E0: '<path d="M22 44l7-16 8 11 7-17 7 17 8-11 7 16z" fill="currentColor" opacity=".95"/>',
    D1: '<path d="M50 22l17 10v20L50 62 33 52V32z" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="50" cy="42" r="5" fill="currentColor"/>',
    SP1: '<circle cx="50" cy="42" r="10" fill="currentColor"/>' + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M50 24v-7" stroke="currentColor" stroke-width="4" stroke-linecap="round" transform="rotate(${a} 50 42)"/>`).join(""),
    I1: '<path d="M30 58V40a20 20 0 0140 0v18" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M40 58V42a10 10 0 0120 0v16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
    F1: '<path d="M50 20l7 16 17 2-13 12 4 17-15-9-15 9 4-17-13-12 17-2z" fill="currentColor"/>',
    ALL: [[50, 24], [30, 42], [70, 42], [38, 62], [62, 62]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="currentColor"/>`).join(""),
  }[c];
  return `<svg class="emblem ${cls}" viewBox="0 0 100 100" role="img" aria-label="${esc(L.name)} emblem" style="color:var(--c-accent,var(--accent))"><circle cx="50" cy="50" r="46" fill="var(--c-bg,var(--bg))" stroke="currentColor" stroke-width="3"/><circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".5"/>${motif}<text x="50" y="82" text-anchor="middle" font-size="15" font-weight="800" fill="var(--c-ink,var(--ink))" style="font-family:var(--c-display,var(--display));letter-spacing:.06em">${INITIALS[c]}</text></svg>`;
}
const OUTNAME = { H: "Home", D: "Draw", A: "Away" }, OUTCOL = { H: "var(--home)", D: "var(--draw)", A: "var(--away)" };
const REDUCED = (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) || document.documentElement.getAttribute("data-motion") === "reduced";

/* ---------- sound: small synthesised palette, three levels ---------- */
const Snd = (() => {
  let ctx = null, master = null, level = 1;           // 0 off, 1 soft, 2 full
  try { const v = localStorage.getItem("arena-nba-sound"); if (v != null) level = +v; } catch (e) { /* storage unavailable */ }
  const gainFor = () => [0, 0.5, 1][level] * (window.MIXFX == null ? 1 : window.MIXFX);
  function init() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = gainFor();
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 6500;
      const delay = ctx.createDelay(); delay.delayTime.value = 0.19; const fb = ctx.createGain(); fb.gain.value = 0.28; const wet = ctx.createGain(); wet.gain.value = 0.22;
      master.connect(lp); lp.connect(ctx.destination); lp.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function note(n, t0, dur, type = "sine", vol = 0.09, glide = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(midi(n), t0);
    if (glide) o.frequency.exponentialRampToValueAtTime(midi(n + glide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(t0, dur, f0, f1, vol = 0.05, q = 1.2) {
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf; const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t0);
  }
  const SCALES = { E0: [0, 2, 4, 6, 7, 9, 11], D1: [0, 3, 5, 7, 10], SP1: [0, 1, 4, 5, 7, 8, 10], I1: [0, 2, 4, 5, 7, 9, 11], F1: [0, 2, 3, 5, 7, 9, 10], ALL: [0, 3, 5, 6, 7, 10] };
  const ROOT = { E0: 60, D1: 57, SP1: 62, I1: 65, F1: 59, ALL: 57 }, WAVE = { E0: "sine", D1: "triangle", SP1: "triangle", I1: "sine", F1: "sine", ALL: "triangle" };
  const run = (fn) => { if (level === 0 || !init()) return; fn(ctx.currentTime + 0.01); };
  /* Generative background music: calm lobby loop and a slightly more driven game loop. Nothing is downloaded; it is played live. */
  let mus = 1, mg = null, mode = "lobby", want = "lobby", timer = null, nextT = 0, step = 0, pend = null;
  try { const v = localStorage.getItem("arena-nba-music"); if (v != null) mus = +v; } catch (e) { /* storage unavailable */ }
  const LOBBY = { bpm: 84, chords: [[48, 55, 59, 64], [45, 52, 60, 64], [41, 48, 57, 64], [43, 50, 59, 62]], pent: [72, 74, 76, 79, 81, 84], motif: [76, 79, 81, 79, 76, 74, 72, 74] };
  const GAME = { bpm: 108, chords: [[45, 52, 57, 60], [41, 48, 55, 57], [48, 55, 60, 64], [43, 50, 55, 59]], pent: [69, 72, 74, 76, 79, 81], motif: [69, 72, 76, 72, 74, 72, 69, 67] };
  function mnote(n, t0, dur, type, vol, att) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(midi(n), t0); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + (att || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g); g.connect(mg); o.start(t0); o.stop(t0 + dur + 0.05); }
  function mkick(t0, vol) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(42, t0 + 0.14); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2); o.connect(g); g.connect(mg); o.start(t0); o.stop(t0 + 0.25); }
  function mhat(t0, vol) { const len = Math.floor(ctx.sampleRate * 0.05), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len); const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 6500; const g = ctx.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(mg); s.start(t0); }
  function bar(m, bi, t0, spb) {
    const P = m === "game" ? GAME : LOBBY, ch = P.chords[bi % 4], beat = spb, game = m === "game";
    if (!game) ch.slice(1).forEach((n, i) => mnote(n + 12, t0 + i * 0.03, beat * 4.2, "sine", 0.022, 1.1));
    else ch.slice(1).forEach((n) => mnote(n, t0, beat * 1.9, "triangle", 0.012, 0.05));
    mnote(ch[0] - 12, t0, beat * (game ? 1.6 : 3.4), "sine", game ? 0.07 : 0.06, 0.03);
    if (game) { mnote(ch[0] - 12, t0 + beat * 2.5, beat * 0.9, "sine", 0.05, 0.03); mkick(t0, 0.07); mkick(t0 + beat * 2, 0.05); [1, 3].forEach((b) => mhat(t0 + beat * (b + 0.5), 0.012)); }
    else { mkick(t0, 0.035); mkick(t0 + beat * 2, 0.03); [1, 3].forEach((b) => mhat(t0 + beat * (b + 0.5), 0.008)); }   // a soft arena thump under the lobby loop
    const eighth = beat / 2, n8 = 8;
    for (let i = 0; i < n8; i++) {
      const sw = i % 2 ? eighth * 0.12 : 0, tt = t0 + i * eighth + sw;
      if (bi % 4 === 0 || bi % 4 === 2 && i % 2 === 0) { if (bi % 4 === 0 || Math.random() < 0.6) mnote(P.motif[i] + (bi % 8 >= 4 ? 0 : 0), tt, eighth * (game ? 1.4 : 2.6), game ? "triangle" : "sine", game ? 0.04 : 0.045, 0.006); }
      else if (Math.random() < (game ? 0.42 : 0.3)) mnote(P.pent[Math.floor(Math.random() * P.pent.length)], tt, eighth * (game ? 1.2 : 2.4), game ? "triangle" : "sine", game ? 0.03 : 0.032, 0.006);
    }
  }
  function sched() {
    if (!ctx || !mg) return; const P = mode === "game" ? GAME : LOBBY, spb = 60 / P.bpm, now = ctx.currentTime;
    if (nextT < now) nextT = now + 0.05;
    while (nextT < now + 1.2) { bar(mode, step, nextT, spb); step++; nextT += spb * 4; }
  }
  function mStart() { if (!mus || level === 0 || !init()) return; if (!mg) { mg = ctx.createGain(); mg.gain.value = 0.0001; mg.connect(master); } if (!timer) { mode = want; nextT = ctx.currentTime + 0.1; step = 0; timer = setInterval(sched, 300); sched(); } mg.gain.cancelScheduledValues(ctx.currentTime); mg.gain.setTargetAtTime(0.9 * (window.MIXMUS == null ? 1 : window.MIXMUS), ctx.currentTime, 0.8); }
  function mStop() { if (mg && ctx) { mg.gain.cancelScheduledValues(ctx.currentTime); mg.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25); } clearInterval(timer); timer = null; }
  function mSet(m) { want = m; if (!timer || m === mode) return; mg.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2); clearTimeout(pend); pend = setTimeout(() => { mode = want; step = 0; nextT = ctx.currentTime + 0.1; mg.gain.setTargetAtTime(0.9 * (window.MIXMUS == null ? 1 : window.MIXMUS), ctx.currentTime, 0.6); }, 700); }
  document.addEventListener("visibilitychange", () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (level) ctx.resume(); });
  const vib = (p) => { try { if (level && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch (e) { /* not supported */ } };
  return {
    get level() { return level; },
    remix() { if (master) master.gain.value = gainFor(); if (mg && timer) mg.gain.setTargetAtTime(0.9 * (window.MIXMUS == null ? 1 : window.MIXMUS), ctx.currentTime, 0.1); },
    _n: { note: (...a) => note(...a), noise: (...a) => noise(...a), run: (f) => run(f) },
    cycle() { level = (level + 1) % 3; try { localStorage.setItem("arena-nba-sound", String(level)); } catch (e) { /* storage unavailable */ } if (master) master.gain.value = gainFor(); if (level === 0) mStop(); else mStart(); return ["off", "soft", "full"][level]; },
    unlock() { if (level) { init(); mStart(); } },
    get music() { return mus; }, mode(m) { mSet(m); },
    setLevel(n) { level = n; try { localStorage.setItem("arena-nba-sound", String(level)); } catch (e) { /* storage unavailable */ } if (master) master.gain.value = gainFor(); if (level === 0) mStop(); else mStart(); return level; },
    setMusic(on) { mus = on ? 1 : 0; try { localStorage.setItem("arena-nba-music", String(mus)); } catch (e) { /* storage unavailable */ } if (mus) mStart(); else mStop(); return mus; },
    toggleMusic() { mus = mus ? 0 : 1; try { localStorage.setItem("arena-nba-music", String(mus)); } catch (e) { /* storage unavailable */ } if (mus) mStart(); else mStop(); return mus; },
    count(n) { run((t) => { if (n === 0) { [72, 76, 79, 84].forEach((x, i) => note(x, t + i * 0.025, 0.7, "triangle", 0.06)); noise(t, 0.35, 800, 5000, 0.03, 0.8); } else note(n === 1 ? 69 : 67, t, 0.22, "sine", 0.08); }); },
    tick() { run((t) => noise(t, 0.035, 2600, 1800, 0.035, 2)); },
    hover() { run((t) => { note(84, t, 0.07, "sine", 0.02); note(91, t + 0.015, 0.06, "sine", 0.01); }); },
    lock() { vib(15); run((t) => { note(43, t, 0.22, "sine", 0.16, -5); noise(t, 0.08, 400, 120, 0.05); note(67, t + 0.06, 0.12, "triangle", 0.06); }); },
    whoosh() { run((t) => noise(t, 0.42, 300, 3200, 0.06, 0.8)); },
    right() { vib(18); run((t) => [72, 76, 79].forEach((n, i) => note(n, t + i * 0.09, 0.45, "triangle", 0.075))); },
    wrong() { vib([40, 50, 40]); run((t) => { note(64, t, 0.3, "sine", 0.07, -2); note(60, t + 0.16, 0.42, "sine", 0.06, -1); }); },
    win() { vib([30, 40, 70]); run((t) => { [76, 79, 83, 88].forEach((n, i) => note(n, t + i * 0.08, 0.55, "triangle", 0.07)); noise(t + 0.3, 0.4, 5000, 9000, 0.02, 3); noise(t + 0.1, 1.3, 500, 1700, 0.035, 0.5); }); },
    horn() { vib([60, 40, 120]); run((t) => { [55, 59, 62].forEach((n) => note(n, t, 0.9, "sawtooth", 0.035)); [67, 71, 74].forEach((n) => note(n, t + 0.02, 0.9, "square", 0.018)); noise(t + 0.15, 1.8, 450, 1500, 0.045, 0.45); }); },
    league(code) { run((t) => { const sc = SCALES[code] || SCALES.ALL, r = ROOT[code] || ROOT.ALL; [0, 2, 4, 6].forEach((d, i) => note(r + sc[d % sc.length] + (d >= sc.length ? 12 : 0), t + i * 0.13, 0.9, WAVE[code] || "triangle", 0.075)); noise(t, 0.6, 500, 2400, 0.025, 0.7); }); },
    back() { run((t) => { note(67, t, 0.22, "sine", 0.07); note(60, t + 0.11, 0.3, "sine", 0.07); }); },
    goal() { run((t) => { noise(t, 0.5, 400, 2600, 0.07, 0.7); [67, 71, 74, 79].forEach((n, i) => note(n, t + 0.05 + i * 0.07, 0.5, "triangle", 0.07)); }); },
    whistle() { run((t) => { note(88, t, 0.16, "sine", 0.045); note(88.5, t + 0.19, 0.3, "sine", 0.045); }); },
    flip() { run((t) => noise(t, 0.2, 800, 2400, 0.05, 1.5)); },
  };
})();
function paintSound() { if ($("#setPage") && !$("#setPage").hidden) renderSettings(); }
setInterval(() => Snd.mode(inMatch() || (Q.s && Q.s.phase === "run") ? "game" : "lobby"), 1500);

/* ---------- ambient particles ---------- */
const fx = $("#fx"), fctx = fx.getContext("2d");
let parts = [], glowCol = "#A855F7", accCol = "#7CF5C8";
function sizeFx() { fx.width = innerWidth * devicePixelRatio; fx.height = innerHeight * devicePixelRatio; }
function seedParts() { parts = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 3, s: 0.02 + Math.random() * 0.05, p: Math.random() * 6.28, a: 0.15 + Math.random() * 0.4 })); }
function frame(ts) {
  fctx.clearRect(0, 0, fx.width, fx.height);
  const W = fx.width, H = fx.height, dpr = devicePixelRatio;
  parts.forEach((q) => {
    q.y -= q.s / 60; if (q.y < -0.05) { q.y = 1.05; q.x = Math.random(); }
    const x = (q.x + Math.sin(ts / 4000 + q.p) * 0.02) * W, y = q.y * H, rr = q.r * 6 * dpr, g = fctx.createRadialGradient(x, y, 0, x, y, rr);
    const a = q.a * (0.6 + 0.4 * Math.sin(ts / 900 + q.p));
    g.addColorStop(0, hexA(q.r > 2.4 ? accCol : glowCol, a)); g.addColorStop(1, hexA(glowCol, 0));
    fctx.fillStyle = g; fctx.beginPath(); fctx.arc(x, y, rr, 0, 6.283); fctx.fill();
  });
  if (!document.hidden) requestAnimationFrame(frame);
}
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`; }
if (!REDUCED) { sizeFx(); seedParts(); requestAnimationFrame(frame); addEventListener("resize", sizeFx); document.addEventListener("visibilitychange", () => { if (!document.hidden) requestAnimationFrame(frame); }); }
function setParticleColours(code) { const p = PAL[code] || PAL.E0; glowCol = p.glow; accCol = p.accent; }

/* ---------- persistence: browser first, private cloud copy when signed in ---------- */
const store = { items: {}, coll: null, uid: null, mode: "local" };
const LOCAL_KEY = "arena-nba-plays-v1";
function loadLocal() { try { store.items = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); } catch (e) { store.items = {}; } }
function saveLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(store.items)); } catch (e) { /* storage unavailable */ } }
loadLocal();   /* read saved progress at once: code that runs at start-up (the login streak, the loading-screen collection) saves the profile, and saving before this point used to overwrite everything with an empty profile */
async function lockIn(key, body) {
  store.items[key] = body; saveLocal(); paintScore(); if (typeof Account !== "undefined") Account.queue();
  if (store.coll) { try { await store.coll.doc(key).set(body); } catch (e) { store.mode = "local"; } }
}
const playsOf = (code) => Object.entries(store.items).filter(([k]) => (code === "ALL" ? k.startsWith("p_") : k.startsWith(`p_${code}_`))).map(([k, v]) => ({ k, ...v }));
const allPlays = () => Object.entries(store.items).filter(([k]) => k.startsWith("p_")).map(([k, v]) => ({ k, ...v }));

/* ---------- data helpers ---------- */
const S = { code: null, mode: null, room: "play", game: null, md: null, up: null, tab: null, hol: null, upStreak: 0, holStreak: 0, style: "accuracy", season: null, cur: null, pick: null, score: [0, 0], useScore: false, busy: false, replay: { round: 12, timer: null } };
const lgOf = (c) => LG[c];
const poolSeasons = (c) => Object.keys(lgOf(c).seasons).sort();
// The games draw from every season on the page (a decade of matches); the replay and the title race show only the last three finished seasons and the live one.
function replaySeasons(c) { const ks = poolSeasons(c), L = lgOf(c).seasons; return ks.filter((k) => L[k].live).concat(ks.filter((k) => !L[k].live).slice(-3)).sort(); }
function allMatches(c) { return lgs(c).flatMap((lg) => poolSeasons(lg).flatMap((s) => lgOf(lg).seasons[s].matches.map((m, i) => ({ m, season: s, i, c: lg })))); }
// m = [date, home, away, hg, ag, res, pA, pD, pH, lamH, lamA, mkA, mkD, mkH]
const odds = (m) => [m[6], m[7], m[8]];       // A, D, H
function modelCall(m, style = S.style) {
  const f = DATA.profiles[style], adj = [m[6] * f.a, m[7] * f.d, m[8] * f.h], k = adj.indexOf(Math.max(...adj)), pick = "ADH"[k];
  let best = [0, 0, -1];
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    if (("ADH"[(i > j) ? 2 : (i === j ? 1 : 0)]) !== pick) continue;
    const p = pois(i, m[9]) * pois(j, m[10]); if (p > best[2]) best = [i, j, p];
  }
  return { pick, score: [best[0], best[1]], probs: { A: m[6], D: m[7], H: m[8] } };
}
function pois(k, l) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
const resOf = (h, a) => (h > a ? "H" : h < a ? "A" : "D");
const ptsFor = (pick, score, real) => (pick === resOf(real[0], real[1]) ? 1 : 0) + (score && score[0] === real[0] && score[1] === real[1] ? 2 : 0);
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };
const mulberry = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function teamCode(n) { const w = n.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean); return (w.length > 1 ? w.map((x) => x[0]).join("") + w[w.length - 1].slice(1) : w[0] || "?").slice(0, 3).toUpperCase(); }
function teamColour(n) { const h = hash(n) % 360, p = PAL[S.code || "E0"]; return `hsl(${h} 58% 48%)`; }
const CREST = Object.assign({}, ...Object.values(LG).map((l) => l.crests || {}));
const badge = (n, cls = "") => (CREST[n] ? `<span class="badge crest ${cls}" aria-hidden="true"><img src="${CREST[n]}" alt=""></span>` : `<span class="badge ${cls}" style="--bc:${teamColour(n)}" aria-hidden="true">${esc(teamCode(n))}</span>`);
const fmtDate = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
function formOf(c, team, before, n = 5) {
  const out = [];
  for (const r of allMatches(c)) { if (r.m[0] >= before) continue; if (r.m[1] === team) out.push([r.m[0], r.m[3] > r.m[4] ? "W" : r.m[3] === r.m[4] ? "D" : "L"]); else if (r.m[2] === team) out.push([r.m[0], r.m[4] > r.m[3] ? "W" : r.m[3] === r.m[4] ? "D" : "L"]); }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-n).map((x) => x[1]);
}
const formHTML = (f) => `<span class="form">${f.map((x) => `<i class="${x}">${x}</i>`).join("") || '<span class="fine">no earlier matches</span>'}</span>`;

/* ---------- theme + routing ---------- */

/* ---------- team colours and arena backdrop ---------- */
/* Seven clubs have only black-and-white badge files, so their colours cannot be read from the badge. Kit colours, as the owner suggested, checked against recent kit-release reports:
   Juventus black and white stripes; Swansea white; Freiburg white and red; Nottingham Forest red; Gladbach white with green. Amiens and Spezia: no reliable kit source found, so they use their
   black-and-white badge colours. White on a dark theme reads as a light accent. */
const EXTRA_COL = { "Juventus": ["#f2f2f2", "#8f949b"], "Swansea": ["#f2f2f2", "#8f949b"], "Amiens": ["#f2f2f2", "#8f949b"], "Spezia": ["#f2f2f2", "#8f949b"], "Freiburg": ["#e2001a", "#f2f2f2"], "Nott'm Forest": ["#dd0000", "#f2f2f2"], "M'gladbach": ["#00a651", "#f2f2f2"] };
const TEAMCOL = { ...EXTRA_COL, ...(DATA.colors || {}) };
function teamTheme() {
  const root = document.documentElement, p = prof(), light = root.getAttribute("data-mode") === "light", c = p.favT && p.teamTheme !== false ? TEAMCOL[p.favT] : null;
  ["--accent", "--accent2", "--glow", "--on-accent"].forEach((k) => root.style.removeProperty(k));
  const pal = PAL[root.getAttribute("data-league") || "NBA"] || PAL.NBA, base = c || (light ? [pal.accent, pal.accent2] : null); if (!base) return;
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); }, dark = (h) => `color-mix(in srgb, ${h} 58%, #000)`;
  const a0 = light ? dark(base[0]) : base[0], a1 = light ? dark(base[1] || base[0]) : (base[1] || base[0]);
  root.style.setProperty("--accent", a0); root.style.setProperty("--accent2", a1); root.style.setProperty("--glow", base[0]); root.style.setProperty("--on-accent", light ? "#ffffff" : lum(base[0]) > 150 ? "#101010" : "#ffffff");
}
function applyAppearance() {
  try { const L = prof().look; if (L) Object.entries(L).forEach(([k, v]) => { if (!localStorage.getItem("bkn_" + k)) localStorage.setItem("bkn_" + k, v); }); } catch (e) { /* profile not ready */ }
  const d = document.documentElement, g = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, th = g("bkn_theme") || "auto";
  d.setAttribute("data-style", g("bkn_style") === "minimal" ? "minimal" : "classic"); d.setAttribute("data-mode", th === "auto" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : th);
  if (g("bkn_contrast") === "1") d.setAttribute("data-contrast", "high"); else d.removeAttribute("data-contrast");
  if (g("bkn_motion") === "reduced") d.setAttribute("data-motion", "reduced"); else d.removeAttribute("data-motion");
  d.style.setProperty("--zoom", { s: 0.92, m: 1, l: 1.1, xl: 1.2 }[g("bkn_text") || "m"] || 1); teamTheme();
}
try { matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if ((localStorage.getItem("bkn_theme") || "auto") === "auto") applyAppearance(); }); } catch (e) { /* old browser */ }
function paintStadium(code) {
  const el = $("#stadium"); if (!el) return; const r = mulberry(hash("stadium" + code)), W = 1200, H = 360;
  const towers = [150, 420, 780, 1050].map((x, i) => `<g><rect x="${x}" y="${70 + (i % 2) * 20}" width="8" height="${H - 90 - (i % 2) * 20}" fill="#0b0f1a"/><g class="lamp" style="animation-delay:${i * 0.7}s"><circle cx="${x + 4}" cy="${64 + (i % 2) * 20}" r="46" fill="url(#glow)"/><rect x="${x - 22}" y="${54 + (i % 2) * 20}" width="52" height="14" rx="3" fill="#fff7d6"/></g></g>`).join("");
  let crowd = ""; for (let k = 0; k < 170; k++) { const x = r() * W, y = 205 + r() * 150, col = r() < 0.3 ? "var(--accent)" : r() < 0.5 ? "var(--accent2)" : "#fff"; crowd += `<circle class="fan" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.6 + r() * 2).toFixed(1)}" fill="${col}" style="animation-delay:${(r() * 3).toFixed(2)}s;animation-duration:${(1.6 + r() * 2).toFixed(2)}s"/>`; }
  let flags = ""; for (let k = 0; k < 9; k++) { const x = 40 + k * 135 + r() * 60; flags += `<g class="flag" style="animation-delay:${(r() * 2).toFixed(2)}s;transform-origin:${x}px 230px"><rect x="${x}" y="190" width="2" height="40" fill="#222"/><path d="M${x + 2} 190 l26 8 l-26 10z" fill="var(--accent)"/></g>`; }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs><radialGradient id="glow"><stop offset="0" stop-color="#fff7d6" stop-opacity=".9"/><stop offset="1" stop-color="#fff7d6" stop-opacity="0"/></radialGradient></defs>${towers}<path d="M0 ${H} L0 230 Q300 160 600 190 Q900 160 ${W} 230 L${W} ${H}Z" fill="#0b0f1a" opacity=".92"/>${crowd}${flags}</svg>`;
}
function setTheme(code, ev) {
  const root = document.documentElement, apply = () => { if (code) root.setAttribute("data-league", code); else root.setAttribute("data-league", "E0"); setParticleColours(code || "E0"); paintStadium(code || "E0"); teamTheme(); };
  if (REDUCED || !ev) { apply(); return; }
  const wash = $("#wash"), p = PAL[code || "E0"];
  wash.style.setProperty("--wx", ev.clientX + "px"); wash.style.setProperty("--wy", ev.clientY + "px"); wash.style.setProperty("--wash", p.bg);
  wash.classList.remove("go"); void wash.offsetWidth; wash.classList.add("go"); setTimeout(apply, 280);
}
function inMatch() { return !!((Net.role && Net.started) || (Q.s && Q.s.mode === "duo" && Q.s.phase === "run") || (S.ttt && S.ttt.mode === "duo" && S.ttt.phase !== "over") || (S.rou && S.rou.phase === "play") || (S.fin && S.fin.mode === "duo" && S.fin.phase !== "done") || (S.num && S.num.mode === "duo" && S.num.phase !== "done")); }
function leaveModal(cb) { window.__leaveCb = cb; modal(`<h2 style="font-size:24px">Leave this match?</h2><p class="fine">${Net.role && Net.ranked ? "Leaving a ranked match ends it, and your opponent may be awarded the win." : "Your match will end."}</p><div class="row" style="margin-top:14px"><button class="btn" id="lvStay" type="button">Stay</button><button class="btn ghost" id="lvLeave" type="button">Leave</button></div>`); }
function go(slug) { if (inMatch() && location.hash.replace("#", "") !== slug) { leaveModal(() => { Q.s = null; S.ttt = S.rou = S.fin = S.num = null; Net.close(); go0(slug); }); return; } go0(slug); }
/* page transitions: the browser's own view transitions where it has them, a short fade-in otherwise; never during a match or with Reduce motion */
function pageTo(fn, box) {
  const calm = (typeof REDUCED !== "undefined" && REDUCED) || document.hidden || (typeof inMatch === "function" && inMatch());
  if (!calm && document.startViewTransition) { try { const vt = document.startViewTransition(() => { fn(); }); [vt.ready, vt.finished, vt.updateCallbackDone].forEach((x) => x && x.catch(() => {})); return; }   /* an overlapping transition is skipped on purpose; don't report it as an error */ catch (e) { /* fall through */ } }
  fn(); if (calm) return; const els = box ? [box] : [...document.querySelectorAll("#home:not([hidden]), #lobby:not([hidden]), #league:not([hidden]), #profilePage:not([hidden]), #setPage:not([hidden]), #aboutPage:not([hidden]), #discPage:not([hidden])")].slice(0, 2); els.forEach((x) => { if (!x) return; x.classList.remove("pgin"); void x.offsetWidth; x.classList.add("pgin"); });
}
function go0(slug) { try { if (location.hash !== "#" + slug) history.replaceState(null, "", "#" + slug); } catch (e) { /* hash unavailable */ } pageTo(() => route()); }
const GAME_IDS = ["call", "daily", "matchday", "upset", "table", "hol", "challenge", "who", "club", "career", "finish", "blur", "pvalue", "cvalue", "number", "ttt", "value", "roulette", "xi", "rapid", "bracket", "scramble", "iconic"];
function route(ev) {
  const h = location.hash.slice(1);
  stopReplay(); stopTheatre(); resetGames(); { const pp = $("#profilePage"); if (pp) pp.hidden = true; const ap = $("#albumPage"); if (ap) ap.hidden = true; const ad = $("#adminPage"); if (ad) ad.hidden = true; const ab = $("#aboutPage"); if (ab) ab.hidden = true; const sp_ = $("#setPage"); if (sp_) sp_.hidden = true; const dp_ = $("#discPage"); if (dp_) dp_.hidden = true; }
  const cm = /^challenge-([a-z0-9]{2})-([a-z0-9]{4,10})$/.exec(h);
  if (cm && FROMSHORT[cm[1]]) { S.mode = "games"; S.room = "play"; S.game = "challenge"; S.chal = { code: cm[2] }; openLeague(FROMSHORT[cm[1]], ev); return; }
  const bm = /^beat-([a-z]+)-([A-Z0-9]+)-([a-z]+)-(\d+)-([A-Za-z0-9_.]{1,16})$/.exec(h);
  if (bm && GAME_IDS.includes(bm[1])) { BEAT = { game: bm[1], score: +bm[4], nick: bm[5] }; S.diff = bm[3]; S.mode = "games"; S.room = "play"; S.hubGroup = "bk"; S.game = bm[1]; openLeague(LG[bm[2]] ? bm[2] : "ALL", ev); setTimeout(() => toast(`<b>${esc(BEAT.nick)} challenged you</b><br>Beat ${BEAT.score} in ${esc(gameName(BEAT.game))}. Play Solo.`), 600); return; }
  const jm = /^join-([A-Za-z]{4})-([a-z]+)$/.exec(h);
  if (jm) { const gm = jm[2] === "number" ? "value" : jm[2]; S.mode = "games"; S.room = "play"; S.game = GAME_IDS.includes(gm) ? gm : null; openLeague("ALL", ev); if (S.game) setTimeout(() => { openOnline(jm[2]); joinRoomCode(jm[1].toUpperCase()); }, 150); return; }
  if (h === "") return showHome(ev);
  if (h === "lab") return showLab(ev);
  if (h === "profile") return showProfile(ev);
  if (h === "admin") return showAdmin(ev);
  if (h === "about") return showAbout(ev);
  if (h === "settings") return showSettings(ev);
  if (h === "daily" && typeof showDaily === "function") return showDaily(ev);
  if (h === "discover") return showDiscover(ev);
  if (h === "album") return showAlbum(ev);
  let mode = null, rest = h;
  if (h === "games") { mode = "games"; rest = "all-leagues"; } else if (h.startsWith("games-")) { mode = "games"; rest = h.slice(6); } else if (h.startsWith("lab-")) { mode = "lab"; rest = h.slice(4); }
  const slug = Object.keys(BYSLUG).find((x) => rest === x || rest.startsWith(x + "-"));
  if (!slug) return showHome(ev);
  let lg = BYSLUG[slug]; const tail = rest.slice(slug.length + 1);
  if (!mode) mode = ["race", "replay", "review"].includes(tail) ? "lab" : "games";          // links from before the sections were split
  if (mode === "lab" && lg === "ALL") lg = ORDER[0];          // the model section has no all-leagues view
  S.mode = mode;
  if (mode === "games") { if (GAME_IDS.includes(tail)) { S.room = "play"; S.game = ["pvalue", "cvalue", "number"].includes(tail) ? "value" : tail; } else { S.room = tail === "boards" ? "boards" : "play"; S.game = null; S.hubGroup = tail === "bk" || tail === "model" || tail === "ranked" || tail === "live" ? tail : null; S.rk = tail === "ranked"; } }
  else { S.room = ["race", "replay", "review", "about"].includes(tail) ? tail : lg === "ALL" ? "review" : "race"; S.game = null; if (lg === "ALL" && S.room !== "about") S.room = "review"; }
  openLeague(lg, ev);
}
function showHome(ev) {
  S.code = null; S.mode = null; S.cur = null; setTheme("HOME", ev);
  $("#home").hidden = false; $("#lobby").hidden = true; $("#league").hidden = true; renderHome(); window.scrollTo(0, 0);
}
function showLab(ev) {
  S.code = null; S.mode = "lab-pick"; S.cur = null; setTheme("ALL", ev); renderLobby();
  $("#home").hidden = true; $("#lobby").hidden = false; $("#league").hidden = true; window.scrollTo(0, 0);
}
function openLeague(code, ev) {
  const key = `${S.mode}|${code}`, changing = S.key !== key; S.key = key; S.code = code;
  if (changing) { S.season = poolSeasons(code).filter((x) => !lgOf(code).seasons[x].live).slice(-1)[0]; S.cur = null; S.pick = null; S.md = null; S.up = null; S.tab = null; S.hol = null; stopReplay(); Snd.league(code); setTheme(code, ev); }
  $("#home").hidden = true; $("#lobby").hidden = true; $("#league").hidden = false;
  const L = lgOf(code), p = PAL[code];
  $("#lKicker").textContent = `${S.mode === "games" ? "Games" : "Our model"} · ${p.mood} · ${L.country}`; $("#lName").textContent = L.name; $("#lTag").textContent = S.mode === "games" ? "Pick a game." : L.tag;
  $("#lFlag").style.background = FLAG[code]; $("#lEmblem").innerHTML = emblem(code, "sm");
  paintScore(); renderScope(); renderRooms(); renderRoom(); renderCrumbs(); if (changing) window.scrollTo(0, 0);
}
function renderScope() {
  const prefix = S.mode === "games" ? "games-" : "lab-";
  $("#scope").innerHTML = (S.mode === "lab" ? ORDER : ["ALL", ...ORDER]).map((c) => `<button type="button" class="chip" data-scope="${prefix}${SLUG[c]}" aria-pressed="${S.code === c}">${c === "ALL" ? "All leagues" : esc(lgOf(c).name)}</button>`).join("");
}
/* ---------- front page ---------- */
function renderHome() {
  const hero = (DATA.hero || []).filter((x) => x.img && !x.photo), crests = Object.entries(CREST).filter(([, u]) => u && u.startsWith("data:image/webp"));
  const tiles = hero.length ? hero.map((x) => `<div class="wtile"><img src="${x.img}" alt="${esc(x.n)}"><span>${esc(x.n)}</span></div>`) : crests.map(([n, u]) => `<div class="wtile crestt"><img src="${u}" alt=""><span>${esc(n)}</span></div>`);
  const rows = [0, 1, 2].map((r) => { const list = tiles.filter((_, i) => i % 3 === r); const run = list.concat(list); return `<div class="wrow ${r === 1 ? "rev" : ""}" style="--sp:${70 + r * 18}s">${run.join("")}</div>`; });
  $("#photowall").innerHTML = rows.join("");
  const sm = DATA.summary.ALL, clubs = Object.keys(CREST);
  const faces = (seed) => [0, 1, 2].map((j) => badge(clubs[hash(seed + j) % clubs.length], "md")).join("");
  $("#doors").innerHTML = `<button type="button" class="door" data-door="games"><div class="gfaces">${faces("g")}</div><div class="dname">Games</div><div class="dtag">Call real matches against the model, then test your ball knowledge: who am I, market values, football tic-tac-toe and more. Solo or against a friend.</div><span class="dgo">Play</span></button>
    <button type="button" class="door" data-door="lab"><div class="gfaces">${faces("l")}</div><div class="dname">Our model</div><div class="dtag">See what the model predicts: title-race odds, the Time machine (any season replayed beside the model's table), how it stacks up against the bookmakers, how it works and who made it possible.</div><span class="dgo">Explore</span></button>
    <button type="button" class="door" data-door="about"><div class="gfaces"><span class="rkbig"><svg class=ic><use href=#i-bulb></use></svg></span></div><div class="dname">About</div><div class="dtag">Why ballknowledge exists, how the model works with two tools to play with, what the data does not cover, and a roadmap you can vote on.</div><span class="dgo">Read</span></button>
    <button type="button" class="door" data-door="discover"><div class="gfaces"><span class="rkbig"><svg class=ic><use href=#i-compass></use></svg></span></div><div class="dname">Discover</div><div class="dtag">New here? A daily feed with one fun stat, a spotlight and a question, plus a short quiz that matches you to a club.</div><span class="dgo">Open</span></button>`;
  $("#ribbon").innerHTML = `<span><b class="num">${sm.n.toLocaleString()}</b> matches tested</span><span>model <b class="num">${pct(sm.pooled_acc, 1)}</b></span><span>bookmakers <b class="num">${pct(sm.market_acc, 1)}</b></span><span><b class="num">5</b> leagues</span><span><b class="num">10</b> seasons</span>`;
}

/* ---------- lobby ---------- */
function renderLobby() { /* basketball has a single league: no league picker */ }

/* ---------- score strip ---------- */
function streaks(plays) {
  const ms = plays.slice().sort((a, b) => (a.at < b.at ? -1 : 1)); let cur = 0, best = 0;
  ms.forEach((x) => { if (x.pick === x.res) { cur++; best = Math.max(best, cur); } else cur = 0; });
  return { cur, best };
}
function totals(plays) {
  let you = 0, mod = 0, yr = 0, mr = 0;
  plays.forEach((x) => { you += ptsFor(x.pick, x.score, x.real); mod += ptsFor(x.mpick, x.mscore, x.real); if (x.pick === x.res) yr++; if (x.mpick === x.res) mr++; });
  return { you, mod, yr, mr, n: plays.length };
}
const renderBoardsIfOpen = () => { if (S.room === "boards") renderBoards(); };
function paintScore() {
  if (!S.code) return;
  const sb = $("#scorebox"); sb.hidden = !(S.mode === "games" && S.room === "play" && (S.game ? MODEL_IDS.includes(S.game) : S.hubGroup === "model"));
  const pl = playsOf(S.code), t = totals(pl), st = streaks(pl);
  $("#scorebox").innerHTML = [[`${t.you} v ${t.mod}`, "points, you vs the model"], [`${t.yr} v ${t.mr}`, `right results, you vs the model`], [`${st.cur}`, "streak"], [`${st.best}`, "best streak"]].map(([v, l]) => `<div><b class="num">${v}</b><small>${l}</small></div>`).join("");
}
function renderRooms() {
  const rooms = S.mode === "games" ? [["play", "<svg class=ic><use href=#i-games></use></svg> Games"], ["boards", "<svg class=ic><use href=#i-trophy></use></svg> Leaderboard"]] : S.code === "ALL" ? [["review", "<svg class=ic><use href=#i-chart></use></svg> How good is it?"], ["about", "<svg class=ic><use href=#i-bulb></use></svg> How it works"]] : [["race", "<svg class=ic><use href=#i-flag></use></svg> Title race"], ["replay", "<svg class=ic><use href=#i-hourglass></use></svg> Time machine"], ["review", "<svg class=ic><use href=#i-chart></use></svg> How good is it?"], ["about", "<svg class=ic><use href=#i-bulb></use></svg> How it works"]];
  $("#rooms").innerHTML = rooms.map(([k, t]) => `<button type="button" class="room" role="tab" data-room="${k}" aria-selected="${S.room === k}">${t}</button>`).join("");
}
function renderRoom() { stopReplay(); if (S.room !== "play") stopQuiz(); if (S.room !== "play") stopTheatre(); ({ play: renderPlayRoom, race: renderRace, replay: renderReplay, boards: renderBoards, review: renderReview, about: renderAbout })[S.room](); paintScore(); renderCrumbs(); }

/* ---------- Call it ---------- */
function freshPool(c) { return allMatches(c).filter((r) => !store.items[`p_${r.c}_${r.season}_${r.i}`]); }
function renderCall() {
  const c = S.code;
  if (S.cur) return renderPlay();
  const fresh = freshPool(c);
  const st = lgOf(c).star || { club: "", name: "", role: "", face: null }, clubMs = allMatches(c).filter((r) => r.m[1] === st.club || r.m[2] === st.club).sort((a, b) => (a.m[0] < b.m[0] ? -1 : 1)), recent = clubMs.slice(-10), fm = DATA.profiles[S.style];
  const hit = (m) => { const adj = [m[6] * fm.a, m[7] * fm.d, m[8] * fm.h]; return "ADH"[adj.indexOf(Math.max(...adj))] === m[5]; };
  const form = clubMs.slice(-5).map((r) => { const m = r.m, own = m[1] === st.club ? m[3] - m[4] : m[4] - m[3]; return own > 0 ? "W" : own === 0 ? "D" : "L"; });
  const clubFresh = freshPool(c).filter((r) => r.m[1] === st.club || r.m[2] === st.club);
  const starCard = `<div class="starwatch">${st.face ? `<img class="face" src="${st.face}" alt="${esc(st.name)}">` : badge(st.club)}<div><div class="label">Star to watch</div><h3>${esc(st.name)}</h3><div class="row" style="gap:8px">${badge(st.club, "sm")}<span class="fine">${esc(st.role)} · ${esc(st.club)}</span></div><div class="fine">The model got ${recent.filter((r) => hit(r.m)).length} of the last ${recent.length} ${esc(st.club)} matches right</div><div style="margin-top:6px">${formHTML(form)}</div></div><button class="btn" id="goStar" type="button" ${clubFresh.length ? "" : "disabled"}>Call a ${esc(st.club)} match</button></div>`;
  $("#room").innerHTML = (c === "ALL" ? "" : starCard) + `<div class="card">${gamesBar("Call it")}<p class="sub">A real match, result hidden. Lock in your call, then see the model's call and the real score. Right result: 1 point. Exact score: 2 more.</p>
    <div class="row" style="margin-top:14px"><button class="btn" id="goRandom" type="button" ${fresh.length ? "" : "disabled"}>Surprise me</button>
    <label class="fine">Model plays <select id="styleSel"><option value="accuracy" ${S.style === "accuracy" ? "selected" : ""}>Max Accuracy</option><option value="balanced" ${S.style === "balanced" ? "selected" : ""}>Balanced</option></select></label></div>
    <p class="fine" style="margin-top:10px">${fresh.length.toLocaleString()} unplayed matches from 2001 on, so you may remember some of them. Locked results can't be replayed, so the record stays honest.</p></div>`;
}
function open(c, season, i, onDone, key) { S.cur = { c, season, i, m: lgOf(c).seasons[season].matches[i], onDone: onDone || null, key: key || `p_${c}_${season}_${i}` }; S.pick = null; S.score = [0, 0]; S.useScore = true; S.busy = false; renderRoom(); }
function renderPlay() {
  const { c, season, i, m } = S.cur, key = S.cur.key, done = store.items[key];
  const fh = formOf(c, m[1], m[0]), fa = formOf(c, m[2], m[0]);
  const head = `<div class="row"><button class="btn ghost" id="playBack" type="button">${S.cur.onDone === "chal" ? "Back to the challenge" : S.cur.onDone ? "Back to the Daily 5" : "Choose another"}</button><span class="label">${S.code === "ALL" ? lgOf(c).name + " · " : ""}${season} · ${fmtDate(m[0])}</span></div>
    <div class="stage"><div class="team">${badge(m[1])}<b>${esc(m[1])}</b>${formHTML(fh)}${done ? "" : goalStep(0)}</div><div class="vs">vs</div><div class="team">${badge(m[2])}<b>${esc(m[2])}</b>${formHTML(fa)}${done ? "" : goalStep(1)}</div></div>`;
  if (done) { $("#room").innerHTML = `<div class="card">${head}<div class="theatre" id="theatre" hidden></div><div class="reveal" id="reveal"></div></div>`; showReveal(done, true); return; }
  const mine = S.pick;
  $("#room").innerHTML = `<div class="card">${head}
    <div class="picks" id="picks">${[["H", `${esc(m[1])} win`], ["D", "Draw"], ["A", `${esc(m[2])} win`]].map(([k, t]) => `<button type="button" class="pick" data-pick="${k}" aria-pressed="${mine === k}">${t}<small>your call</small></button>`).join("")}</div>
    <div class="row" style="margin-top:16px"><button type="button" class="toggle" id="useScoreBtn" aria-pressed="${S.useScore}"><span class="tk"><i></i></span><span><b>Exact score</b><small>${S.useScore ? "On: set each team's goals above for +2 points if you nail it" : "Off: just pick the result"}</small></span></button></div>
    <div class="row" style="margin-top:16px"><button class="btn" id="lockBtn" type="button" ${mine ? "" : "disabled"}>Lock it in</button><span class="fine">Once locked it can't be changed.</span></div>
    <div class="theatre" id="theatre" hidden></div><div class="reveal" id="reveal"></div></div>`;
}
const goalStep = (k) => (S.useScore ? `<div class="gstep" role="group" aria-label="${k === 0 ? "Home" : "Away"} goals"><button type="button" data-st="${k}-" aria-label="One fewer goal">−</button><output class="num" id="${k === 0 ? "sH" : "sA"}">${S.score[k]}</output><button type="button" data-st="${k}+" aria-label="One more goal">+</button></div>` : "");
const defaultScore = (pick) => (pick === "H" ? [1, 0] : pick === "A" ? [0, 1] : [1, 1]);
function lockPlay() {
  if (S.busy || !S.pick) return; S.busy = true;
  const { c, season, i, m } = S.cur, key = S.cur.key, call = modelCall(m);
  const score = S.useScore ? [...S.score] : null, pick = S.useScore ? resOf(S.score[0], S.score[1]) : S.pick;
  const item = { lg: c, season, date: m[0], home: m[1], away: m[2], pick, score, mpick: call.pick, mscore: call.score, probs: call.probs, real: [m[3], m[4]], res: m[5], style: S.style, at: new Date().toISOString() };
  Snd.lock(); lockIn(key, item);
  document.querySelectorAll("#picks .pick, #lockBtn, #useScoreBtn, .gstep button").forEach((b) => { b.disabled = true; });
  startTheatre(c, season, m, call.score, () => showReveal(item, false));
}
function showReveal(it, instant) {
  const box = $("#reveal"), mp = it.mpick, mine = it.pick, ok = it.pick === it.res, mok = it.mpick === it.res;
  const yp = ptsFor(it.pick, it.score, it.real), mpts = ptsFor(it.mpick, it.mscore, it.real);
  const step = (el, t, fn) => setTimeout(() => { el.classList.add("on"); if (fn) fn(); }, instant ? 0 : t);
  box.innerHTML = `<div class="rcard"><div class="label">The model's call (${it.style === "balanced" ? "Balanced" : "Max Accuracy"})</div><div class="row" style="margin:8px 0 2px"><b style="font:800 24px var(--display)">${OUTNAME[mp]}${mp === "D" ? "" : " win"}</b><span class="num fine">predicts ${it.mscore[0]}-${it.mscore[1]}</span></div>
      ${["H", "D", "A"].map((k) => `<div class="pbar" style="--c:${OUTCOL[k]}"><span class="label">${OUTNAME[k]}</span><div class="track"><div class="fill" data-w="${(it.probs[k] * 100).toFixed(0)}"></div></div><span class="num">${pct(it.probs[k])}</span></div>`).join("")}</div>
    <div class="rcard"><div class="label">Full time</div><div class="big num" id="bigScore">${instant ? `${it.real[0]}-${it.real[1]}` : "0-0"}</div>
      <div class="verdicts" style="margin-top:12px"><div class="vd ${ok ? "ok" : "no"}"><span class="label">You</span><b>${ok ? "Right" : "Wrong"} · ${yp} pt${yp === 1 ? "" : "s"}</b><span class="fine">${OUTNAME[mine]}${it.score ? ` ${it.score[0]}-${it.score[1]}` : ""}</span></div><div class="vd ${mok ? "ok" : "no"}"><span class="label">Model</span><b>${mok ? "Right" : "Wrong"} · ${mpts} pt${mpts === 1 ? "" : "s"}</b><span class="fine">${OUTNAME[mp]} ${it.mscore[0]}-${it.mscore[1]}</span></div></div>
      <div class="row" style="margin-top:12px"><b>${yp > mpts ? "You beat the model on this one." : yp === mpts ? "Level with the model." : "The model took this one."}</b>${S.cur && S.cur.onDone ? "" : '<button class="btn" id="nextBtn" type="button">Next match</button>'}${S.cur && S.cur.onDone ? '<button class="btn" id="dailyNext" type="button">Back to the Daily 5</button>' : ""}</div></div>`;
  if (S.cur && S.cur.m && S.cur.m[16]) box.insertAdjacentHTML("beforeend", realGoalsCard(S.cur.m));
  if (S.cur && S.cur.m) box.insertAdjacentHTML("beforeend", statsCard(S.cur.c, S.cur.m) + '<div class="row" style="margin-top:6px"><button class="btn ghost" id="watchBtn" type="button">Watch the model\'s match</button></div>');
  const cards = box.querySelectorAll(".rcard");
  if (instant) { cards.forEach((c) => c.classList.add("on")); box.querySelectorAll(".fill").forEach((f) => { f.style.transition = "none"; f.style.width = f.dataset.w + "%"; }); return; }
  Snd.whoosh(); bigReveal(it, ok, mok, yp, mpts);
  step(cards[0], 120, () => requestAnimationFrame(() => box.querySelectorAll(".fill").forEach((f) => { f.style.width = f.dataset.w + "%"; })));
  if (cards[2]) step(cards[2], 2200);
  step(cards[1], 1300, () => {
    countUp($("#bigScore"), it.real);
    setTimeout(() => { Mascot.react(ok ? "model_right" : "model_wrong", true); if (yp > mpts) { Snd.win(); confetti(); } else if (ok) Snd.right(); else Snd.wrong(); S.busy = false; lbPublish(); afterPlayHook(it); }, 700);
  });
}
/* A quick full-screen reveal in three beats: what you called, what the model called, the real score. */
function bigReveal(it, ok, mok, yp, mpts) {
  const old = $("#bro"); if (old) old.remove();
  const call = (r, s) => `${OUTNAME[r]}${r === "D" ? "" : " win"}${s ? ` · ${s[0]}-${s[1]}` : ""}`;
  const o = document.createElement("div"); o.id = "bro"; o.className = "bro"; o.setAttribute("role", "dialog"); o.setAttribute("aria-label", "Result reveal");
  o.innerHTML = `<div class="bro-in"><div class="bro-m">${esc(it.home)} v ${esc(it.away)}</div>
    <div class="bro-b" id="broY"><span class="label">You called</span><b>${esc(call(it.pick, it.score))}</b></div>
    <div class="bro-b" id="broM"><span class="label">The model called</span><b>${esc(call(it.mpick, it.mscore))}</b></div>
    <div class="bro-b bro-f" id="broF"><span class="label">Full time</span><b class="num" id="broS">0-0</b></div>
    <div class="bro-v" id="broV"><span class="vd ${ok ? "ok" : "no"}">You: ${ok ? "right" : "wrong"} · ${yp} pt${yp === 1 ? "" : "s"}</span><span class="vd ${mok ? "ok" : "no"}">Model: ${mok ? "right" : "wrong"} · ${mpts} pt${mpts === 1 ? "" : "s"}</span></div>
    <div class="row" style="justify-content:center;margin-top:14px"><button class="btn ghost" id="broMore" type="button">Details</button><button class="btn" id="broNext" type="button">${S.cur && S.cur.onDone ? "Back to the Daily 5" : "Next match"}</button></div></div>`;
  document.body.appendChild(o);
  const at = (id, ms) => setTimeout(() => { const e = $("#" + id); if (e) e.classList.add("on"); }, REDUCED ? 0 : ms);
  at("broY", 100); at("broM", 900); at("broF", 1700);
  setTimeout(() => { const e = $("#broS"); if (!e) return; if (REDUCED) e.textContent = `${it.real[0]}-${it.real[1]}`; else countUp(e, it.real); }, REDUCED ? 0 : 1800);
  at("broV", 2700);
}
function closeBro() { const o = $("#bro"); if (o) o.remove(); }
/* what really happened: the real goals (minute, scorer, assist, penalty) of a match, where the match records cover it (2012-13 on) */
function realGoalsCard(m) {
  const gl = m[16]; if (!gl || !gl.length) return "";
  return `<div class="rcard" style="margin-top:12px"><div class="label">What really happened</div><ol class="iclist" style="margin-top:6px">${gl.map((g) => `<li class="icrow"><span class="num">${g[0]}'</span><span><svg class=ic><use href=#i-ball></use></svg> ${esc(g[1] === 0 ? m[1] : m[2])}: <b>${esc(DATA.gn[g[2]])}</b>${g[4] ? " (penalty)" : ""}${g[3] >= 0 ? ` · assist ${esc(DATA.gn[g[3]])}` : ""}</span></li>`).join("")}</ol><div class="fine" style="margin-top:6px">Real goals from match records; minutes are whole minutes, and own goals are not marked, so those matches show no list.</div></div>`;
}
function countUp(el, real) {
  if (!el) return;
  const end = real, t0 = performance.now(); const tot = Math.max(end[0], end[1]);
  (function f(t) { const k = Math.min(1, (t - t0) / 600), h = Math.round(end[0] * k), a = Math.round(end[1] * k); if (el.isConnected) el.textContent = `${h}-${a}`; if (k < 1 && el.isConnected) requestAnimationFrame(f); })(t0);
  if (tot > 0) Snd.tick();
}
function confetti() {
  if (REDUCED) return;
  const box = document.createElement("div"); box.className = "confetti"; box.setAttribute("aria-hidden", "true");
  const cols = ["--accent", "--accent2", "--home", "--away", "--ok"];
  for (let k = 0; k < 40; k++) { const e = document.createElement("i"); e.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;--c:var(${cols[k % cols.length]});--x:${((Math.random() - 0.5) * 260).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;--d:${(1.1 + Math.random() * 1).toFixed(2)}s`; box.appendChild(e); }
  document.body.appendChild(box); setTimeout(() => box.remove(), 2600);
}

/* ---------- FX: the moments after a right or wrong answer ----------
   hit(pts): a burst where you clicked and a floating +points.  miss(text): the card shakes and a red -points floats up.
   streak(n): a banner at 3, 5, 10, 15, 20 and every 5 after.  best(score): "New best" at the end of a solo run.
   Snd.right / Snd.wrong are wrapped, so every game gets at least the burst or the shake. */
const FX = (() => {
  let px = innerWidth / 2, py = innerHeight / 2, last = 0;
  addEventListener("pointerdown", (e) => { px = e.clientX; py = e.clientY; }, { capture: true, passive: true });
  const origin = () => { const a = document.activeElement; if (a && a !== document.body && a.getBoundingClientRect) { const r = a.getBoundingClientRect(); if (r.width && r.bottom > 0 && r.top < innerHeight) return [r.left + r.width / 2, r.top + r.height / 2]; } return [px, py]; };
  const add = (cls, html, at, ms, label) => { const e = document.createElement("div"); e.className = cls; e.innerHTML = html; if (label) { e.setAttribute("role", "status"); e.setAttribute("aria-label", label); } else e.setAttribute("aria-hidden", "true"); if (at) { e.style.left = at[0] + "px"; e.style.top = at[1] + "px"; } document.body.appendChild(e); setTimeout(() => e.remove(), ms); return e; };
  const cols = ["--ok", "--accent", "--accent2", "--glow"];
  function burst(at) { let h = "<b></b>"; for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2 + Math.random() * 0.3, d = 60 + Math.random() * 70; h += `<i style="--c:var(${cols[k % cols.length]});--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d).toFixed(0)}px"></i>`; } add("fx-burst", h, at, 900); }
  const float = (text, kind, at, label) => add("fx-float " + kind, text, at, 1200, label);
  const after = (fn) => setTimeout(fn, 20);   // after the synchronous re-render that follows every answer
  function shake(sel) { after(() => { const el = typeof sel === "string" ? document.querySelector(sel) : sel; if (!el) return; el.classList.remove("fx-shake"); void el.offsetWidth; el.classList.add("fx-shake"); setTimeout(() => el.classList.remove("fx-shake"), 520); }); }
  function pop(sel) { after(() => document.querySelectorAll(sel).forEach((el, i) => { el.style.animationDelay = i * 80 + "ms"; el.classList.add("fx-pop"); })); }
  function countUp(sel, from, to) { after(() => { const el = document.querySelector(sel); if (!el || REDUCED) return; const t0 = performance.now(); el.classList.add("fx-count"); (function f(t) { const k = Math.min(1, (t - t0) / 650), e = 1 - Math.pow(1 - k, 3); if (el.isConnected) el.textContent = Math.round(from + (to - from) * e); if (k < 1 && el.isConnected) requestAnimationFrame(f); })(t0); }); }
  function banner(big, small, party = true) { if (REDUCED) return; document.querySelectorAll(".fx-banner").forEach((e) => e.remove()); add("fx-banner", `${big}<small>${small}</small>`, null, 2000, `${big}. ${small}`); if (party) confetti(); }
  const MILESTONE = { 3: ["3 in a row", "Heating up"], 5: ["5 in a row", "On fire"], 10: ["10 in a row", "Unstoppable"], 15: ["15 in a row", "Ball knowledge"], 20: ["20 in a row", "Hall of fame"] };
  const api = {
    hit(pts) { last = performance.now(); try { Mascot.react(pts >= 900 ? "bighit" : "hit"); } catch (e) { /* no mascot */ } if (REDUCED) return; const at = origin(); burst(at); if (pts) float("+" + pts, "good", [at[0], at[1] - 10], `Correct, plus ${pts}`); },
    miss(text, sel = "#room > .card") { last = performance.now(); try { Mascot.react("miss"); } catch (e) { /* no mascot */ } const at = origin(); if (!REDUCED && text) float(text, "bad", at, "Wrong, " + text); shake(sel); },
    streak(n) { if (!n) return; const m = MILESTONE[n] || (n > 20 && n % 5 === 0 ? [n + " in a row", "Legendary"] : null); if (!m) return; setTimeout(() => { try { Mascot.react("streak"); } catch (e) { /* no mascot */ } }, 900); setTimeout(() => { banner(m[0], m[1]); try { Snd.horn(); } catch (e) { /* no sound */ } }, 350); },
    best(score) { setTimeout(() => { try { Mascot.react("best"); } catch (e) { /* no mascot */ } }, 1200); setTimeout(() => { banner("New best!", score + " points"); try { Snd.horn(); } catch (e) { /* no sound */ } }, 450); },
    over() { setTimeout(() => { try { Mascot.react("over"); } catch (e) { /* no mascot */ } }, 600); if (REDUCED) return; add("fx-dim", "", null, 1500); shake("#room > .card"); },
    pop, countUp, shake,
    auto(ok) { if (performance.now() - last < 120) return; last = performance.now(); try { Mascot.react(ok ? "hit" : "miss"); } catch (e) { /* no mascot */ } if (ok) { if (!REDUCED) burst(origin()); } else shake("#room > .card"); },
  };
  const r0 = Snd.right, w0 = Snd.wrong;
  Snd.right = function () { const v = r0.apply(this, arguments); api.auto(true); return v; };
  Snd.wrong = function () { const v = w0.apply(this, arguments); api.auto(false); return v; };
  return api;
})();

/* ---------- Daily 5 ---------- */
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
function dailyFixtures(c, key) {
  const pool = allMatches(c), r = mulberry(hash(`daily-${c}-${key}`)), seen = new Set(), out = [];
  while (out.length < 5) { const x = pool[Math.floor(r() * pool.length)], id = x.season + "|" + x.i; if (!seen.has(id)) { seen.add(id); out.push(x); } }
  return out;
}
function dailyState(c, key) { const f = dailyFixtures(c, key), items = f.map((x) => store.items[`p_${x.c}_${x.season}_${x.i}`]); return { f, items, n: items.filter(Boolean).length }; }
function dailyDays(c) { let s = 0; const now = Date.now(); for (let k = 0; k < 60; k++) { const n = dailyState(c, dayKey(new Date(now - k * 864e5))).n; if (n === 5) s++; else if (k > 0) break; } return s; }
function renderDaily() {
  const c = S.code, key = dayKey(), st = dailyState(c, key);
  if (S.cur) return renderPlay();
  const rows = st.f.map((x, k) => { const it = st.items[k]; return `<button type="button" class="drow ${it ? "done" : ""}" data-dfix="${x.c}|${x.season}|${x.i}"><b class="num">${k + 1}</b><span class="mt">${badge(x.m[1], "sm")}${esc(x.m[1])} <span class="fine">v</span> ${badge(x.m[2], "sm")}${esc(x.m[2])}</span>${it ? `<span class="mark ${it.pick === it.res ? "y" : "n"}">${it.pick === it.res ? "✓" : "✗"}</span>` : '<span class="fine">play</span>'}</button>`; }).join("");
  let result = "";
  if (st.n === 5) { const you = st.items.filter((x) => x.pick === x.res).length, mod = st.items.filter((x) => x.mpick === x.res).length; result = `<div class="row" style="margin-top:14px"><b>You ${you}/5, model ${mod}/5: ${you > mod ? "you beat it today" : you === mod ? "a tie" : "the model wins today"}</b><button class="btn" id="shareBtn" type="button">Copy my result</button><button class="btn ghost" id="dailyCard" type="button">Make a result card</button></div><pre class="share" id="shareTxt" hidden></pre>`; }
  $("#room").innerHTML = `<div class="card">${gamesBar("Daily 5")}<p class="sub">Five ${esc(lgOf(c).name)} matches from 2001 on, picked from today's date, so everyone gets the same five. ${dailyDays(c)} day${dailyDays(c) === 1 ? "" : "s"} in a row so far.</p><div class="daily">${rows}</div>${result}</div>`;
}
async function shareDaily() {
  const c = S.code, key = dayKey(), st = dailyState(c, key), you = st.items.filter((x) => x.pick === x.res).length, mod = st.items.filter((x) => x.mpick === x.res).length;
  const text = `ballknowledge · ${lgOf(c).name} Daily 5 · ${key}\nMe ${you}/5, model ${mod}/5\n${st.items.map((x) => (x.pick === x.res ? "🟩" : "🟥")).join("")} me\n${st.items.map((x) => (x.mpick === x.res ? "🟩" : "🟥")).join("")} model`;
  try { await navigator.clipboard.writeText(text); $("#shareBtn").textContent = "Copied"; } catch (e) { const pre = $("#shareTxt"); pre.textContent = text; pre.hidden = false; }
}

/* ---------- Time machine ---------- */
/* A matchday is a real group of fixtures: the builder splits each season wherever two days pass with no match or a club would play twice (season.rb holds the end index of each group). */
function grpEnds(ms, sn) { if (sn && sn.rb && sn.rb.length) return sn.rb; const per = Math.max(1, Math.floor(new Set(ms.flatMap((m) => [m[1], m[2]])).size / 2)), e = []; for (let i = per; i <= ms.length; i += per) e.push(i); if (!e.length || e[e.length - 1] !== ms.length) e.push(ms.length); return e; }
function roundsOf(ms) { const teams = new Set(ms.flatMap((m) => [m[1], m[2]])); return { per: Math.floor(teams.size / 2), teams }; }
function tableAt(ms, n) {
  const T = {}; ms.forEach((m) => { T[m[1]] = T[m[1]] || { t: m[1], p: 0, pts: 0, gd: 0, gf: 0 }; T[m[2]] = T[m[2]] || { t: m[2], p: 0, pts: 0, gd: 0, gf: 0 }; });
  for (let i = 0; i < n; i++) { const m = ms[i], h = T[m[1]], a = T[m[2]]; h.p++; a.p++; h.gf += m[3]; a.gf += m[4]; h.gd += m[3] - m[4]; a.gd += m[4] - m[3]; if (m[3] > m[4]) h.pts += 3; else if (m[3] < m[4]) a.pts += 3; else { h.pts++; a.pts++; } }
  return Object.values(T).sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
}
function renderReplay() {
  const c = S.code, seasons = replaySeasons(c);
  if (!seasons.includes(S.season)) S.season = seasons[seasons.length - 1];
  $("#room").innerHTML = `<div class="card"><h2><svg class=ic><use href=#i-hourglass></use></svg> Time machine</h2><p class="sub">Pick a season and press play. Watch every call land, matchday by matchday, as the table builds.</p>
    <div class="ctl" style="margin-top:12px"><select id="seasonSel" aria-label="Season">${seasons.slice().reverse().map((s) => `<option ${s === S.season ? "selected" : ""}>${s}${lgOf(c).seasons[s].live ? " (live)" : ""}</option>`).join("")}</select>
      <button class="btn" id="rpPlay" type="button">Play</button><input type="range" id="rpScrub" min="0" value="0" step="1" aria-label="Matchday"><span class="roundlabel" id="rpLabel"></span></div>
    <div class="replay"><div><div id="rpChart"></div><div id="rpFeed"></div></div><div id="rpTable"></div></div></div>`;
  S.replay.round = Math.min(S.replay.round, roundsOf(lgOf(c).seasons[S.season.replace(" (live)", "")].matches).per ? 99 : 0);
  paintReplay(true);
}
function paintReplay(first) {
  const c = S.code, sn = lgOf(c).seasons[S.season], ms = sn.matches, E = grpEnds(ms, sn), Es = new Set(E), R = E.length, r = Math.max(0, Math.min(R, S.replay.round)); S.replay.round = r;
  const n = r === 0 ? 0 : E[r - 1], p0 = r > 1 ? E[r - 2] : 0;
  const sc = $("#rpScrub"); sc.max = R; sc.value = r; $("#rpLabel").textContent = r === 0 ? "Before matchday 1" : `Matchday ${r} / ${R}`;
  const f = DATA.profiles[S.style]; let right = 0; const pts = [];
  ms.slice(0, n).forEach((m, i) => { const adj = [m[6] * f.a, m[7] * f.d, m[8] * f.h], pk = "ADH"[adj.indexOf(Math.max(...adj))]; if (pk === m[5]) right++; if (Es.has(i + 1) || i === n - 1) pts.push(right / (i + 1)); });
  const W = 520, H = 190, L = 34, Rr = 508, T = 10, B = 160, y = (v) => B - ((Math.min(0.8, Math.max(0.2, v)) - 0.2) / 0.6) * (B - T), x = (k) => L + (R <= 1 ? 0 : (k / (R - 1)) * (Rr - L));
  const mk = ms.reduce((a, m) => a + (["A", "D", "H"][[m[11], m[12], m[13]].indexOf(Math.max(m[11], m[12], m[13]))] === m[5] ? 1 : 0), 0) / ms.length;
  let g = [0.3, 0.4, 0.5, 0.6, 0.7].map((v) => `<line x1="${L}" x2="${Rr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`).join("");
  g += `<line x1="${L}" x2="${Rr}" y1="${y(mk)}" y2="${y(mk)}" stroke="var(--accent2)" stroke-dasharray="5 5"/>`;
  if (pts.length) { const d = pts.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join(" "); g += `<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(pts.length - 1)}" cy="${y(pts[pts.length - 1])}" r="5" fill="var(--accent)"/><text x="${Math.min(x(pts.length - 1), Rr - 14)}" y="${y(pts[pts.length - 1]) - 10}" text-anchor="middle" style="fill:var(--accent);font-weight:700">${pct(pts[pts.length - 1])}</text>`; }
  $("#rpChart").innerHTML = `<div class="label" style="margin-bottom:6px">Model accuracy so far <span style="color:var(--accent2)">· dashed: bookmakers' season ${pct(mk)}</span></div><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative accuracy by matchday">${g}</svg>`;
  const rows = r === 0 ? [] : ms.slice(p0, n);
  $("#rpFeed").innerHTML = r === 0 ? `<p class="fine">Press play to start the season.</p>` : `<div class="label" style="margin:10px 0 2px">Matchday ${r}</div>` + rows.map((m) => { const adj = [m[6] * f.a, m[7] * f.d, m[8] * f.h], k = adj.indexOf(Math.max(...adj)), pk = "ADH"[k]; return `<div class="mrow"><span class="h">${esc(m[1])}${badge(m[1], "sm")}</span><b class="num">${m[3]}-${m[4]}</b><span>${badge(m[2], "sm")}${esc(m[2])}</span><span class="mark ${pk === m[5] ? "y" : "n"}" title="Model said ${OUTNAME[pk]}">${pk === m[5] ? "✓" : "✗"}</span></div>`; }).join("");
  const tab = tableAt(ms, n), prev = tableAt(ms, p0).map((q) => q.t), N = tab.length;
  // The model's table: each match's win / draw / loss probabilities turned into expected points (3 x P(win) + P(draw)), summed over the matches played so far.
  const xp = {}; tab.forEach((q) => { xp[q.t] = { t: q.t, x: 0, pts: q.pts, p: q.p }; });
  for (let i = 0; i < n; i++) { const m = ms[i]; xp[m[1]].x += 3 * m[8] + m[7]; xp[m[2]].x += 3 * m[6] + m[7]; }
  const mod = Object.values(xp).sort((a, b) => b.x - a.x || b.pts - a.pts), mrank = Object.fromEntries(mod.map((q, i) => [q.t, i + 1]));
  const zone = (i) => (i < 4 ? "z-top" : i < 7 ? "z-eu" : i >= N - 3 ? "z-bot" : "");
  const real = `<div class="tcol"><div class="label" style="margin-bottom:6px">Real table</div><table><thead><tr><th>#</th><th>Club</th><th>Pts</th><th title="Places above (up) or below (down) where the model's table has the club">vs model</th></tr></thead><tbody>${tab.map((q, i) => { const mv = first || n === 0 ? 0 : prev.indexOf(q.t) - i, d = n === 0 ? 0 : mrank[q.t] - (i + 1); return `<tr class="${zone(i)} ${mv ? "moved" : ""}"><td class="num">${i + 1}</td><td>${badge(q.t, "sm")}<span class="cn">${esc(q.t)}</span>${mv ? `<span class="${mv > 0 ? "up" : "down"} num">${mv > 0 ? "▲" : "▼"}${Math.abs(mv)}</span>` : ""}</td><td class="num"><b>${q.pts}</b></td><td class="num ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d === 0 ? "=" : (d > 0 ? "▲" : "▼") + Math.abs(d)}</td></tr>`; }).join("")}</tbody></table></div>`;
  const model = `<div class="tcol"><div class="label" style="margin-bottom:6px">Model table <span style="text-transform:none;letter-spacing:0">(expected points)</span></div><table><thead><tr><th>#</th><th>Club</th><th>xPts</th><th title="Real points minus expected points: positive means the club has got more than the model expected">luck</th></tr></thead><tbody>${mod.map((q, i) => { const lk = q.pts - q.x; return `<tr class="${zone(i)}"><td class="num">${i + 1}</td><td>${badge(q.t, "sm")}<span class="cn">${esc(q.t)}</span></td><td class="num"><b>${q.x.toFixed(1)}</b></td><td class="num ${n === 0 ? "" : lk > 0.5 ? "up" : lk < -0.5 ? "down" : ""}">${n === 0 ? "" : (lk > 0 ? "+" : "") + lk.toFixed(1)}</td></tr>`; }).join("")}</tbody></table></div>`;
  $("#rpTable").innerHTML = `<div class="tpair">${real}${model}</div><p class="fine" style="margin-top:8px">Left: the real table. Right: the table if every match had followed the model's odds.</p>`;
  $("#rpPlay").textContent = S.replay.timer ? "Pause" : (r >= R ? "Replay" : "Play");
}
function stopReplay() { if (S.replay.timer) { clearInterval(S.replay.timer); S.replay.timer = null; } }
function toggleReplay() {
  if (S.replay.timer) { stopReplay(); paintReplay(); return; }
  const c = S.code, R = grpEnds(lgOf(c).seasons[S.season].matches, lgOf(c).seasons[S.season]).length;
  if (S.replay.round >= R) S.replay.round = 0;
  S.replay.timer = setInterval(() => { if (S.replay.round >= R) { stopReplay(); Snd.win(); paintReplay(); return; } S.replay.round++; Snd.tick(); paintReplay(); }, 1100);
  paintReplay();
}


/* ---------- Title race: odds from simulating the rest of the season ---------- */
S.raceSeason = null; S.raceCp = "19"; S.raceHeat = false;
function renderRace() {
  const c = S.code, L = lgOf(c), R = L.race;
  if (!R) { $("#room").innerHTML = `<div class="card"><h2>Title race</h2><p class="sub">The race for this league is not built yet.</p></div>`; return; }
  const live = R.live, pasts = Object.keys(R.past).sort().reverse();
  if (!S.raceSeason || (S.raceSeason !== live.season && !R.past[S.raceSeason])) S.raceSeason = live.season;
  const isLive = S.raceSeason === live.season, P = isLive ? null : R.past[S.raceSeason];
  const rows = isLive ? live.rows : P.checkpoints[S.raceCp], [, euN, relN] = live.rules;
  const fin = isLive ? null : P.final;
  const maxP = Math.max(...rows.map((r) => r.p90)), minP = Math.min(...rows.map((r) => r.p10)), span = Math.max(1, maxP - minP);
  const top = [...rows].sort((a, b) => b.title - a.title).slice(0, 3), euCut = [...rows].sort((a, b) => b.eu - a.eu).slice(Math.max(0, euN - 2), euN + 1), danger = [...rows].sort((a, b) => b.drop - a.drop).slice(0, 3);
  const pc = (v) => (v < 0.005 ? (v === 0 ? "–" : "<1%") : v > 0.995 ? ">99%" : pct(v));
  const cell = (v, col) => `<td class="pcell"><div class="pb"><i style="width:${(v * 100).toFixed(0)}%;background:${col}"></i></div><span class="num">${pc(v)}</span></td>`;
  const card = (title, list, key, col) => `<div class="tile"><span class="label">${title}</span>${list.map((r) => `<div class="row" style="gap:8px;margin-top:8px">${badge(r.team, "sm")}<b class="tn">${esc(r.team)}</b><span class="num" style="color:${col};font-weight:700">${pc(r[key])}</span></div>`).join("")}</div>`;
  const N = rows.length, heat = S.raceHeat ? [...rows].sort((a, b) => a.mean - b.mean).reverse().slice(0, Math.min(10, N)) : [];
  const seasonOpts = [live.season, ...pasts].map((x) => `<option value="${x}" ${x === S.raceSeason ? "selected" : ""}>${x}${x === live.season ? " (live)" : ""}</option>`).join("");
  const asof = isLive ? `As of ${fmtDate(live.as_of)}: ${live.played} matches played, ${live.remaining} to go, ${live.n_sims.toLocaleString()} simulated finishes.` : `Odds after matchday ${S.raceCp} of ${P.rounds}, using the model's real pre-match probabilities for the matches still to come (optimistic: they used form that had not happened yet at that point). ${fin ? "The last column is how the season really ended." : ""}`;
  $("#room").innerHTML = `<div class="card"><h2>Title race</h2><p class="sub">The model plays out the rest of the season thousands of times and counts where each club finishes.</p>
    <div class="ctl" style="margin-top:12px"><select id="raceSeasonSel" aria-label="Season">${seasonOpts}</select>
      ${isLive ? "" : `<span class="seg" role="group" aria-label="Checkpoint">${["10", "19", "28"].map((k) => `<button type="button" class="pill" data-cp="${k}" aria-pressed="${S.raceCp === k}" style="${S.raceCp === k ? "border-color:var(--accent);color:var(--accent)" : ""}">After MD ${k}</button>`).join(" ")}</span>`}
      <button type="button" class="pill" id="heatBtn" aria-pressed="${S.raceHeat}">${S.raceHeat ? "Show the odds table" : "Show finishing positions"}</button></div>
    <div class="tiles" style="margin-top:14px">${card("Title favourites", top, "title", "var(--accent)")}${card(`Fighting for the last Europe place (top ${euN})`, euCut, "eu", "var(--away)")}${card(`Relegation, most at risk (bottom ${relN})`, danger, "drop", "var(--bad)")}</div>
    ${S.raceHeat ? `<div class="heatwrap"><div class="heat" style="--n:${N}">${heat.map((r) => `<div class="hrow"><span class="hn">${badge(r.team, "sm")}${esc(r.team)}</span>${r.dist.map((v, k) => `<span class="hc" style="--a:${Math.min(1, v * 2.6).toFixed(2)}" title="${esc(r.team)} finishes ${k + 1}: ${pct(v)}">${v >= 0.05 ? Math.round(v * 100) : ""}</span>`).join("")}</div>`).join("")}<div class="hrow hhead"><span></span>${rows.map((_, k) => `<span class="hc">${k + 1}</span>`).join("")}</div></div><p class="fine">Cell: chance (%) of finishing in that position. Top ${Math.min(10, N)} clubs by expected points.</p></div>` : `<div class="tablewrap"><table class="race"><thead><tr><th>Now</th><th>Club</th><th>Pts</th><th style="text-align:left">Expected final points (10th to 90th percentile)</th><th>Title</th><th>Europe</th><th>Drop</th>${fin ? "<th>Real</th>" : ""}</tr></thead><tbody>${rows.map((r) => `<tr><td class="num">${r.now}</td><td>${badge(r.team, "sm")}${esc(r.team)}</td><td class="num">${r.pts}<span class="fine"> (${r.played})</span></td><td style="text-align:left"><div class="rng"><i style="left:${((r.p10 - minP) / span * 100).toFixed(1)}%;width:${Math.max(2, (r.p90 - r.p10) / span * 100).toFixed(1)}%"></i><b style="left:${((r.mean - minP) / span * 100).toFixed(1)}%"></b></div><span class="num fine">${r.mean.toFixed(0)}</span></td>${cell(r.title, "var(--accent)")}${cell(r.eu, "var(--away)")}${cell(r.drop, "var(--bad)")}${fin ? `<td class="num"><b>${fin[r.team]}</b></td>` : ""}</tr>`).join("")}</tbody></table></div>`}
    <p class="fine" style="margin-top:10px">These odds come from a model that can't see injuries, transfers or news, so real title races have more late twists. Ties on points are split by goal difference, then goals scored.</p></div>`;
}


/* ================= Match simulation: the model's predicted match, played out minute by minute ================= */
const LEAGUE_AVG = [13.8, 11.7, 4.7, 4.1, 5.4, 4.7, 10.7, 11.1, 1.8, 2.1];    // shots, on target, corners, fouls, yellows: home then away
const STAT_NAMES = [["Shots", 0], ["On target", 2], ["Corners", 4], ["Fouls", 6], ["Yellow cards", 8]];
function pickBy(r, list, wi, skip) {
  const pool = list.filter((x) => x[0] !== skip), tot = pool.reduce((t, x) => t + x[wi], 0);
  if (!pool.length || tot <= 0) return null;
  let u = r() * tot;
  for (const x of pool) { u -= x[wi]; if (u <= 0) return x; }
  return pool[pool.length - 1];
}
function squadOf(c, season, club) {
  const L = lgOf(c); let sq = (L.scorers && L.scorers[season] && L.scorers[season][club]) || [];
  if (sq.length && L.star && L.star.club === club) sq = [[L.star.name, "MID", 7, 7], ...sq];   // today's star is added only for seasons whose squads we really have; before, he might not even have been born (a 2004 match named Lamine Yamal)
  return sq;
}
// With no stored statistics forecast the league average is scaled by each side's expected goals, so stats still follow the goal forecast.
function expFor(m) {
  if (m[14]) return m[14];
  const fh = Math.sqrt(Math.max(0.3, m[9]) / 1.5), fa = Math.sqrt(Math.max(0.3, m[10]) / 1.2);
  return LEAGUE_AVG.map((v, i) => (i === 0 || i === 2 ? v * fh : i === 1 || i === 3 ? v * fa : v));
}
// The played-out totals ARE the forecast, rounded; only two physical limits can move a total (shots on target >= goals, shots >= shots on target).
function genMatch(c, season, home, away, score, seed, exp) {
  const r = mulberry(seed);
  const s1 = 1 + Math.floor(r() * 4), s2 = 2 + Math.floor(r() * 5), T = 90 + s1 + s2, L1 = 45 + s1;
  const FH = (DATA.statsval && DATA.statsval.first_half_goal_share) || 0.44;
  const disp = (t) => (t <= 45 ? `${t}` : t <= L1 ? `45+${t - 45}` : t <= 90 + s1 ? `${t - s1}` : `90+${t - 90 - s1}`);
  const minute = (firstShare = 0.5) => { const first = r() < firstShare, lo = first ? 1 : L1 + 1, hi = first ? L1 : T; for (;;) { const t = lo + Math.floor(r() * (hi - lo + 1)); if (r() < 0.8 + 0.4 * (t - lo) / (hi - lo + 1)) return t; } };
  const spot = (sd, goal) => { const d = goal ? 5 + 11 * Math.pow(r(), 1.5) : 7 + 24 * Math.pow(r(), 1.2), spread = Math.min(26, 6 + d * 0.5); return [sd === "H" ? 105 - d : d, 34 + (r() * 2 - 1) * spread * (goal ? 0.7 : 1)]; };
  const ev = [];
  [["H", home, score[0], 0], ["A", away, score[1], 1]].forEach(([sd, club, g, k]) => {
    const squad = squadOf(c, season, club), anon = () => "A player";
    const xSh = exp[k], xSot = exp[2 + k], xCor = exp[4 + k], xFoul = exp[6 + k], xYel = exp[8 + k];
    for (let i = 0; i < g; i++) { const sc = pickBy(r, squad, 2), as = r() < 0.72 && sc ? pickBy(r, squad, 3, sc[0]) : null, [x, y] = spot(sd, true); ev.push({ t: minute(FH), sd, type: "goal", x, y, who: sc ? sc[0] : anon(), assist: as ? as[0] : null }); }
    const nSot = Math.max(g, Math.round(xSot)), nShots = Math.max(nSot, Math.round(xSh)), saves = nSot - g, others = nShots - nSot;
    const shooter = () => pickBy(r, squad.map((q) => [q[0], q[1], q[1] === "GK" ? 0.01 : q[2] + 0.4]), 2);
    for (let i = 0; i < saves; i++) { const sh = shooter(), [x, y] = spot(sd, false); ev.push({ t: minute(), sd, type: "save", x, y, who: sh ? sh[0] : anon() }); }
    for (let i = 0; i < others; i++) { const sh = shooter(), [x, y] = spot(sd, false); ev.push({ t: minute(), sd, type: r() < 0.6 ? "off" : "block", x, y, who: sh ? sh[0] : anon() }); }
    for (let i = Math.round(xCor); i > 0; i--) ev.push({ t: minute(), sd, type: "corner" });
    for (let i = Math.round(xFoul); i > 0; i--) ev.push({ t: minute(), sd, type: "foul" });
    for (let i = Math.round(xYel); i > 0; i--) { const pl = squad.length ? squad[Math.floor(r() * squad.length)][0] : `${club} player`; ev.push({ t: minute(0.42), sd, type: "card", who: pl }); }
  });
  ev.push({ t: L1, type: "ht" }, { t: T, type: "ft" });
  ev.sort((a, b) => a.t - b.t || (a.type === "goal" ? -1 : 1));
  const tot = Array(10).fill(0), idx = { H: 0, A: 1 };
  ev.forEach((e) => { const k = idx[e.sd]; if (k == null) return; if (e.type === "goal" || e.type === "save") { tot[k]++; tot[2 + k]++; } else if (e.type === "off" || e.type === "block") tot[k]++; else if (e.type === "corner") tot[4 + k]++; else if (e.type === "foul") tot[6 + k]++; else if (e.type === "card") tot[8 + k]++; });
  return { home, away, score, T, s1, disp, ev, totals: tot, exp };
}
const theatre = { timer: null, m: null, t: 0, speed: 1, paused: false, done: null, last: 0 };
function stopTheatre() { clearInterval(theatre.timer); theatre.timer = null; theatre.m = null; theatre.done = null; }
function theatreHTML(m) {
  const pitch = `<svg class="mt-pitch" viewBox="-2 -2 109 72" role="img" aria-label="Pitch: where the shots were taken"><g fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".5"><rect x="0" y="0" width="105" height="68"/><path d="M52.5 0V68"/><circle cx="52.5" cy="34" r="9.15"/><rect x="0" y="13.85" width="16.5" height="40.3"/><rect x="88.5" y="13.85" width="16.5" height="40.3"/><rect x="0" y="24.85" width="5.5" height="18.3"/><rect x="99.5" y="24.85" width="5.5" height="18.3"/></g><g fill="rgba(255,255,255,.8)"><rect x="-1.2" y="30.3" width="1.2" height="7.3"/><rect x="105" y="30.3" width="1.2" height="7.3"/></g><g id="thDots"></g></svg>`;
  return `<div class="mt-board"><div class="mt-team">${badge(m.home, "md")}<b>${esc(m.home)}</b></div><div class="mt-score"><span class="big num" id="thScore">0 - 0</span><small id="thClock">Kick-off</small></div><div class="mt-team right"><b>${esc(m.away)}</b>${badge(m.away, "md")}</div></div>
    <div class="mt-poss" aria-hidden="true"><i id="thPH" style="background:var(--home)"></i><i id="thPA" style="background:var(--away)"></i></div>
    <div class="mt-stats" id="thStats"></div>${pitch}
    <div class="fine">${esc(m.home)} attacks to the right, ${esc(m.away)} to the left. Filled dot: goal. Ring: saved. Cross: wide. Grey: blocked. Positions are illustrative; the final score and every statistic come from the model's forecast.</div>
    <div class="row mt-ctrl" style="margin-top:10px"><button class="btn ghost" id="thPause" type="button">Pause</button><button class="btn ghost" id="thSpeed" type="button">Speed 3x</button><button class="btn ghost" id="thSkip" type="button">Skip to full time</button></div>
    <ol class="mt-feed" id="thFeed"></ol>`;
}
function paintTheatre() {
  const m = theatre.m; if (!m) return;
  const t = theatre.t, vis = m.ev.filter((e) => e.t <= t), score = [0, 0];
  const st = { H: { shots: 0, sot: 0, cards: 0, corners: 0, fouls: 0 }, A: { shots: 0, sot: 0, cards: 0, corners: 0, fouls: 0 } };
  vis.forEach((e) => {
    if (e.type === "goal") { score[e.sd === "H" ? 0 : 1]++; st[e.sd].shots++; st[e.sd].sot++; } else if (e.type === "save") { st[e.sd].shots++; st[e.sd].sot++; }
    else if (e.type === "off" || e.type === "block") st[e.sd].shots++; else if (e.type === "corner") st[e.sd].corners++; else if (e.type === "foul") st[e.sd].fouls++; else if (e.type === "card") st[e.sd].cards++;
  });
  const prevGoals = theatre.last; const nowGoals = score[0] + score[1];
  if (nowGoals > prevGoals) { Snd.goal(); const el = $("#thScore"); if (el) { el.classList.remove("goalpop"); void el.offsetWidth; el.classList.add("goalpop"); } }
  theatre.last = nowGoals;
  $("#thScore").textContent = `${score[0]} - ${score[1]}`;
  const mn = Math.floor(t);
  $("#thClock").textContent = t >= m.T ? "Full time" : mn === 0 ? "Kick-off" : mn === 45 + m.s1 ? "Half-time" : `${m.disp(Math.max(1, mn))}'`;
  const shn = st.H.shots + st.A.shots, ph = shn ? (st.H.shots / shn) * 100 : 50; $("#thPH").style.width = ph + "%"; $("#thPA").style.width = (100 - ph) + "%";
  $("#thStats").innerHTML = [["Share of shots", `${Math.round(ph)}%`, `${Math.round(100 - ph)}%`], ["Shots", st.H.shots, st.A.shots], ["On target", st.H.sot, st.A.sot], ["Corners", st.H.corners, st.A.corners], ["Fouls", st.H.fouls, st.A.fouls], ["Yellow cards", st.H.cards, st.A.cards]]
    .map(([l, a, b]) => `<span class="num">${a}</span><span class="label">${l}</span><span class="num">${b}</span>`).join("");
  const gn = { H: 0, A: 0 };
  $("#thDots").innerHTML = vis.filter((e) => e.x != null).map((e) => {
    const c = e.sd === "H" ? "var(--home)" : "var(--away)";
    if (e.type === "goal") { const k = gn[e.sd]++, ly = Math.max(5, Math.min(66, e.y - 2.4 - 3.6 * k)); return `<circle cx="${e.x.toFixed(1)}" cy="${e.y.toFixed(1)}" r="1.8" fill="${c}" stroke="#fff" stroke-width=".5"/><text x="${(e.x + (e.sd === "H" ? -2.6 : 2.6)).toFixed(1)}" y="${ly.toFixed(1)}" font-size="3.1" font-weight="700" fill="#fff" text-anchor="${e.sd === "H" ? "end" : "start"}">${esc(String(e.who).split(" ").slice(-1)[0])}</text>`; }
    if (e.type === "save") return `<circle cx="${e.x.toFixed(1)}" cy="${e.y.toFixed(1)}" r="1.2" fill="none" stroke="${c}" stroke-width=".6"/>`;
    if (e.type === "off") return `<path d="M${(e.x - 1).toFixed(1)} ${(e.y - 1).toFixed(1)}l2 2m0 -2l-2 2" stroke="${c}" stroke-width=".5" fill="none"/>`;
    return `<circle cx="${e.x.toFixed(1)}" cy="${e.y.toFixed(1)}" r=".8" fill="rgba(255,255,255,.45)"/>`;
  }).join("");
  let hg = 0, ag = 0; const lines = [];
  for (const e of vis) {
    const when = e.type === "ht" ? "HT" : e.type === "ft" ? "FT" : m.disp(e.t) + "'", club = e.sd === "H" ? m.home : m.away; let txt = "", cls = e.type;
    if (e.type === "goal") { if (e.sd === "H") hg++; else ag++; txt = `<b>GOAL!</b> ${esc(e.who)} (${esc(club)})${e.assist ? `, assisted by ${esc(e.assist)}` : ""}. <b>${hg}-${ag}</b>`; }
    else if (e.type === "save") txt = `${esc(e.who)} (${esc(club)}) shoots, saved`; else if (e.type === "off") txt = `${esc(e.who)} (${esc(club)}) shoots wide`;
    else if (e.type === "block") txt = `${esc(e.who)} (${esc(club)}) has a shot blocked`; else if (e.type === "card") txt = `Yellow card: ${esc(e.who)} (${esc(club)})`;
    else if (e.type === "corner") txt = `Corner to ${esc(club)}`; else if (e.type === "foul") continue;
    else if (e.type === "ht") txt = `Half-time: ${hg}-${ag}`; else if (e.type === "ft") txt = `Full time: ${m.home} ${hg}-${ag} ${m.away}`;
    lines.push(`<li class="${cls}"><span class="num">${when}</span><span>${txt}</span></li>`);
  }
  $("#thFeed").innerHTML = lines.reverse().join("");
}
function finishTheatre() {
  clearInterval(theatre.timer); theatre.timer = null;
  const m = theatre.m; if (!m) return;
  theatre.t = m.T; theatre.last = 99; paintTheatre(); Snd.whistle();
  ["thPause", "thSpeed", "thSkip"].forEach((id) => { const b = $("#" + id); if (b) b.hidden = true; });
  const f = theatre.done; theatre.done = null; if (f) f();
}
function startTheatre(c, season, m, score, onDone) {
  stopTheatre();
  const seed = hash(`${m[1]}|${m[2]}|${m[0]}|${score.join("-")}`);
  theatre.m = genMatch(c, season, m[1], m[2], score, seed, expFor(m)); theatre.t = 0; theatre.speed = 3; theatre.paused = false; theatre.done = onDone; theatre.last = 0;
  const box = $("#theatre"); box.innerHTML = theatreHTML(theatre.m); box.hidden = false; paintTheatre(); Snd.whistle();
  box.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "nearest" });
  if (REDUCED) { finishTheatre(); return; }
  theatre.timer = setInterval(() => { if (theatre.paused) return; theatre.t += theatre.speed * 0.2; if (theatre.t >= theatre.m.T) finishTheatre(); else paintTheatre(); }, 50);
}
function statsCard(c, m) {
  if (!m[14] || !m[15]) return "";
  const exp = m[14], real = m[15], cell = (v) => (v == null ? "-" : v);
  const V = DATA.statsval;
  const note = V ? `Forecasts come from a model trained only on earlier seasons and tested on 2023-26. Average miss per side against always guessing the league average: shots ${((V.shots_home.mae_model + V.shots_away.mae_model) / 2).toFixed(1)} against ${((V.shots_home.mae_baseline + V.shots_away.mae_baseline) / 2).toFixed(1)}, corners ${((V.corners_home.mae_model + V.corners_away.mae_model) / 2).toFixed(1)} against ${((V.corners_home.mae_baseline + V.corners_away.mae_baseline) / 2).toFixed(1)}. Yellow cards are not forecast better than the average.` : "";
  return `<div class="rcard" style="margin-top:12px"><div class="label">Match statistics: real, the model's forecast, the prediction played out</div><div class="vtable">
    <div class="vrow head"><span></span><span>Real</span><span>Model forecast</span><span>Played out</span></div>
    ${STAT_NAMES.map(([n, i]) => `<div class="vrow"><b>${n}</b><span class="num">${cell(real[i])}-${cell(real[i + 1])}</span><span class="num">${exp[i].toFixed(1)}-${exp[i + 1].toFixed(1)}</span><span class="num">${Math.round(exp[i])}-${Math.round(exp[i + 1])}</span></div>`).join("")}</div><div class="fine" style="margin-top:8px">${note}</div></div>`;
}

/* ================= The games hub ================= */
const GAMES = [
  { id: "call", name: "Call it", tag: "One real match. Lock in your call, watch the model's match play out, then see what really happened." },
  { id: "daily", name: "Daily 5", tag: "The same five matches for everyone today. Beat the model and share your result." },
  { id: "matchday", name: "Matchday", tag: "Call a whole round at once and watch the results land one by one." },
  { id: "rapid", name: "Rapid fire", tag: "60 seconds. Call as many real matches as you can and beat the model on the same ones." },
  { id: "bracket", name: "Bracket buster", tag: "A real Champions League knockout. Pick every tie, round by round, against an Elo model." },
  { id: "upset", name: "Spot the upset", tag: "Five real results. Which one did the model think was least likely?" },
  { id: "table", name: "Guess the table", tag: "Rebuild a final table from last season's, then see you against the model." },
  { id: "hol", name: "Higher or lower", tag: "Two clubs, one number. Keep the streak alive." },
  { id: "challenge", name: "Challenge a friend", tag: "Five matches, one link. Send it and see who does better." },
];
function recordLine(c, id) {
  if (id === "call") { const t = totals(playsOf(c)); return t.n ? `${t.you} v ${t.mod} points over ${t.n} matches` : "not played yet"; }
  if (id === "daily") { const n = dailyDays(c); return n ? `${n} day${n === 1 ? "" : "s"} in a row` : "not played today"; }
  if (id === "matchday") { const it = Object.entries(store.items).filter(([k]) => (c === "ALL" ? k.startsWith("md_") : k.startsWith(`md_${c}_`))).map(([, v]) => v); return it.length ? `you ${it.reduce((a, x) => a + x.you, 0)} v model ${it.reduce((a, x) => a + x.mod, 0)} right, ${it.length} matchday${it.length === 1 ? "" : "s"}` : "not played yet"; }
  if (id === "upset") { const u = store.items[`u_${c}`]; return u ? `${u.right}/${u.rounds} right, best streak ${u.best}` : "not played yet"; }
  if (id === "table") { const it = Object.entries(store.items).filter(([k]) => (c === "ALL" ? k.startsWith("t_") : k.startsWith(`t_${c}_`))).map(([, v]) => v); return it.length ? `${it.filter((x) => x.youErr < x.modErr).length} of ${it.length} tables beat the model` : "not played yet"; }
  if (id === "hol") { const h = store.items[`h_${c}`]; return h ? `best streak ${h.best}` : "not played yet"; }
  if (id === "who" || id === "career" || id === "club" || id === "blur" || id === "finish") { const b = store.items[`best_${id}_${c}_${S.diff}`]; return b ? `best ${b.best} (${S.diff})` : "not played yet"; }
  if (id === "value") { const b = store.items[`v_${c}`]; return b ? `best streak ${b.best}` : "not played yet"; }
  if (id === "challenge") { const n = Object.keys(store.items).filter((k) => k.startsWith("xpc_")).length; return n ? `${n} challenge${n === 1 ? "" : "s"} played` : "not played yet"; }
  return "";
}
const QUIZ_GAMES = [
  { id: "who", name: "Who am I?", modes: "Solo streak · 2 players", tag: "A mystery player. Clues go from obscure to obvious. Buzz in early for more points.", faces: () => heroFaces(3) },
  { id: "career", name: "Career path", modes: "Solo streak · 2 players", tag: "Every club he played for, in order. Name the player.", faces: () => heroFaces(3) },
  { id: "club", name: "Name that team", modes: "Solo streak · 2 players", tag: "Goals, wins and a stadium size. Which club is it?" },
  { id: "blur", name: "Logo blur", modes: "Solo streak · 2 players", tag: "A blurry badge that sharpens by the second." },
  { id: "finish", name: "Where did they finish?", modes: "Solo streak · 2 players", tag: "A club, a season, a slider. How close can you get?" },
  { id: "value", name: "Market value", modes: "Solo higher or lower · 2 players", tag: "Who is worth more, a player or a squad? Or both of you guess a value and the closest wins.", faces: () => heroFaces(2) },
  { id: "roulette", name: "Team roulette", modes: "2 players · one device or two", tag: "A club appears. Take turns naming players who played for it. First to blank loses.", faces: () => heroFaces(2) },
  { id: "xi", name: "Starting XI", modes: "Solo · 2 to 3 minutes", tag: "Champions League and cup finals, Champions League semi-finals and the biggest league games. Name the eleven who started.", faces: () => heroFaces(3) },
  { id: "iconic", name: "Who did it", modes: "Solo", tag: "A big match and its highlights by minute. Name the scorers, assisters, penalty takers and who was sent off.", faces: () => heroFaces(3) },
  { id: "scramble", name: "Scramble", modes: "Solo streak · 2 players", tag: "A club, player or manager with the letters shuffled. Unscramble it before your rival does." },
  { id: "ttt", name: "Basketball tic-tac-toe", modes: "2 players · one device or two", tag: "Name a player who fits the row and the column. Three in a row wins.", faces: () => heroFaces(2) },
];
let heroQueue = [];
const heroFaces = (n) => { const all = (DATA.hero || []).filter((x) => x.img && !x.photo); let out = ""; for (let i = 0; i < n && all.length; i++) { if (!heroQueue.length) heroQueue = shuffle(all); const x = heroQueue.pop(); out += `<span class="badge xl hface"><img src="${x.img}" alt="${esc(x.n)}"></span>`; } return out; };
const MODEL_IDS = ["call", "daily", "matchday", "upset", "table", "hol", "challenge", "rapid", "bracket"];
const gameName = (id) => (window.VERSNAME && VERSNAME[id]) || ([...GAMES, ...QUIZ_GAMES, ...(window.QUIZ_HIDDEN || [])].find((g) => g.id === id) || {}).name || "";
function renderHub() {
  heroQueue = [];
  const c = S.code, clubs = c === "ALL" ? Object.keys(CREST) : Object.keys(lgOf(c).crests || {}).length ? Object.keys(lgOf(c).crests) : [...new Set(allMatches(c).flatMap((r) => [r.m[1], r.m[2]]))];
  const pick = (k) => [0, 1, 2].map((j) => clubs[(hash(`${c}-${k}-${j}`)) % clubs.length]);
  const card = (g, k) => `<button type="button" class="gcard" data-game="${g.id}" style="--d:${k * 60}ms"><div class="gfaces">${g.faces ? g.faces(pick(k)) : pick(k).map((t) => badge(t, "md")).join("")}</div>${favPill(g.id)}<div class="gname">${g.name}</div><div class="gmodes">${g.modes || "Solo, against the model"}</div><div class="gtag">${g.tag}</div><div class="grec num">${esc(recordLine(c, g.id))}</div></button>`;
  const where = c === "ALL" ? "across all five leagues" : `in the ${lgOf(c).name}`, g = S.hubGroup;
  if (g === "ranked") { renderRanked(); $("#room").insertAdjacentHTML("afterbegin", onlineTabs("ranked")); return; }
  if (g === "live") { renderLive(); $("#room").insertAdjacentHTML("afterbegin", onlineTabs("live")); return; }
  if (g === "model") { $("#room").innerHTML = weeklyCardHTML() + `<h2 class="sec">Beat the Model</h2><p class="secsub">Real matches, real results, and a model that never saw them. Call them ${where} and see who does better.</p><div class="hub">${hubList(GAMES).map(card).join("")}</div>`; weeklyBoard(); weeklyChampionCheck(); return; }
  if (g === "bk") { $("#room").innerHTML = `<h2 class="sec">ballknowledge originals</h2><p class="secsub">Players, clubs, careers and market values ${where}. Pick a difficulty, then play solo or against a friend.</p><div class="hub">${hubList(QUIZ_GAMES).map((x, k) => card(x, k)).join("")}</div>`; return; }
  $("#room").innerHTML = `<h2 class="sec">What do you want to play?</h2><p class="secsub">Four places to play, ${where}.</p>${forYouHTML()}<div class="groups">
    <button type="button" class="gpick" data-group="bk" style="--d:0ms"><div class="gfaces">${heroFaces(4)}</div><div class="gname">ballknowledge originals</div><div class="gtag">Who am I?, career paths, club roulette, tic-tac-toe, market values and more. Four difficulty levels, solo streaks or two-player duels.</div><span class="dgo">${QUIZ_GAMES.length} games</span></button>
    <button type="button" class="gpick" data-group="model" style="--d:80ms"><div class="gfaces">${pick(1).concat(pick(2).slice(0, 1)).map((x) => badge(x, "md")).join("")}</div><div class="gname">Beat the Model</div><div class="gtag">Call real matches against a prediction model that never saw them, watch its match play out, and climb the ranks.</div><span class="dgo">${GAMES.length} games</span></button>
    <button type="button" class="gpick" data-group="model" style="--d:120ms"><div class="gfaces"><span class="rkbig"><svg class=ic><use href=#i-trophy></use></svg></span></div><div class="gname">Weekly tournament</div><div class="gtag">The same five matches for everyone this week. Best score takes the week and the Weekly champion badge.</div><span class="dgo">${store.items["xpc_wk" + weekId()] ? "Played this week" : "Week " + (weekId() % 100)}</span></button>
    <button type="button" class="gpick" data-group="ranked" style="--d:160ms"><div class="gfaces"><span class="rkbig"><svg class=ic><use href=#i-trophy></use></svg></span><span class="rkbig"><svg class=ic><use href=#i-live></use></svg></span></div><div class="gname">Play online</div><div class="gtag">Ranked matches against real players for Elo and the leaderboard, plus live predictions on the next real fixtures.</div><span class="dgo">Play online</span></button></div>`;
}
const onlineTabs = (cur) => ""; const _onlineTabsFootball = (cur) => `<div class="scope" style="padding:2px 0;margin-bottom:10px"><button type="button" class="chip" data-group="ranked" aria-pressed="${cur === "ranked"}">Ranked</button><button type="button" class="chip" data-group="live" aria-pressed="${cur === "live"}">Live predictions</button></div>`;
function weeklyCardHTML() {
  const wk = "wk" + weekId(), done = store.items[`xpc_${wk}`];
  return `<div class="card wkcard" style="margin-bottom:14px"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="label">Weekly tournament · week ${weekId() % 100}</div><h3 style="margin:2px 0 4px">Five matches, the same for everyone this week</h3><div class="fine">All five leagues. Best score takes the week, and the winner earns the Weekly champion badge.</div></div><button class="btn" id="wkPlay" type="button">${done ? "See your result" : "Play"}</button></div><div id="wkBoard" class="lb" style="margin-top:10px"></div></div>`;
}
async function weeklyBoard() {
  const rows = await Board.top("challenge", "all", "all", "wk" + weekId()), el = $("#wkBoard"); if (!el) return;
  el.innerHTML = rows && rows.length ? rows.slice(0, 5).map((r, i) => `<div class="lbrow"><b class="num">${i + 1}</b><span>${esc(r.nick)}</span><span class="num">${Math.round(Number(r.value))}/5</span></div>`).join("") : '<div class="fine">Nobody has finished yet. Be first.</div>';
}
async function weeklyChampionCheck() {
  const last = "wk" + weekId(new Date(Date.now() - 7 * 864e5)), key = `wkchk_${last}`; if (store.items[key] || !Account.signedIn || Board.mode !== "rest") return;
  const rows = await Board.top("challenge", "all", "all", last); if (!rows) return; lockIn(key, 1);
  if (rows.length >= 3 && prof().nick && rows[0].nick === prof().nick) award("wk_win");
}
function renderCrumbs() {
  paintHowto();
  const el = $("#crumbs"); if (!el || !S.code) return; const items = [["Menu", "menu"]];
  if (S.mode === "games") { items.push(["Games", "games"]); if (S.hubGroup) items.push([S.hubGroup === "bk" ? "ballknowledge originals" : S.hubGroup === "ranked" ? "Ranked" : S.hubGroup === "live" ? "Live" : "Beat the Model", "group"]); if (S.game) items.push([gameName(S.game) || "Game", null]); else if (S.room === "boards") items.push(["Leaderboard", null]); }
  else { items.push(["Our model", "lobby"]); items.push([lgOf(S.code).name, null]); }
  el.innerHTML = `<button class="back" id="backBtn" type="button">← Back</button><button class="back" id="howBtn" type="button" title="How this works" ${howKey() && HOWTO[howKey()] ? "" : "hidden"}>?</button><div class="trail">${items.map(([n, k], i) => (k && i < items.length - 1 ? `<button type="button" class="crumb" data-crumb="${k}">${esc(n)}</button>` : `<span class="crumb cur">${esc(n)}</span>`)).join("<i>›</i>")}</div>`;
}
function crumbGo(k) {
  Snd.back();
  if (k === "menu") go(""); else if (k === "lobby") go("lab"); else if (k === "games") { S.hubGroup = null; go("games-" + SLUG[S.code]); } else if (k === "group") { resetGames(); S.game = null; S.room = "play"; renderRoom(); }
}
function goBack() {
  if (inMatch() && !window.__leaving) { leaveModal(() => { window.__leaving = true; goBack(); window.__leaving = false; }); return; }
  Snd.back();
  if (S.mode !== "games") { go("lab"); return; }
  if (S.room === "boards") { S.room = "play"; renderRooms(); renderRoom(); return; }
  if (S.game) { resetGames(); S.game = null; S.chal = null; S.cur = null; renderRoom(); return; }
  if (S.hubGroup) { S.hubGroup = null; go("games-" + SLUG[S.code]); return; }
  go("");
}

const modeIntro = (title, blurb, opts) => `<div class="card">${gamesBar(title)}<p class="sub">${blurb}</p>${diffBar()}<div class="modes">${opts.map((o) => `<button class="mode" id="${o.id}" type="button"><b>${o.t}</b><span>${o.d}</span></button>`).join("")}</div><div id="roomBox"></div></div>`;
const gamesBar = (title) => `<div class="row" style="margin-bottom:12px"><button class="btn ghost" id="gamesBack" type="button">← Back</button><h2 style="font-size:24px">${title}</h2></div>`;
function renderPlayRoom() {
  stopTheatre();
  if (S.game) S.hubGroup = S.rk ? "ranked" : MODEL_IDS.includes(S.game) ? "model" : "bk";
  if (!S.game) return renderHub();
  stopQuiz();
  if (QDEF[S.game]) { if (!Q.s || Q.s.game !== S.game || Q.s.scope !== S.code) newQuiz(S.game, "solo", S.code); else renderQuiz(); return; }
  ({ call: renderCall, daily: renderDaily, matchday: renderMatchday, upset: renderUpset, table: renderTableGame, hol: renderHol, challenge: renderChallenge,
     finish: renderFinish,
     value: renderValue, ttt: renderTTT, roulette: renderRoulette, xi: renderXI, iconic: renderIconic, rapid: renderRapid, bracket: renderBracket })[S.game]();
}

/* ---------- Matchday ---------- */
function mdList(c) {
  const out = [];
  lgs(c).forEach((lg) => poolSeasons(lg).forEach((sn) => { const se = lgOf(lg).seasons[sn], ms = se.matches, per = roundsOf(ms).per, E = grpEnds(ms, se); E.forEach((end, k) => { const a = k ? E[k - 1] : 0; if (end - a === per) out.push({ c: lg, season: sn, n: k + 1, per, a, b: end }); }); }));
  return out;
}
const mdKey = (c, sn, n) => `md_${c}_${sn}_${n}`;
function renderMatchday() {
  const c = S.code;
  if (!S.md) {
    const free = mdList(c).filter((x) => !store.items[mdKey(x.c, x.season, x.n)]);
    $("#room").innerHTML = `<div class="card">${gamesBar("Matchday")}<p class="sub">A whole round of real matches. Pick a result for each, lock them in, and watch the real scores land one by one.</p>
      <div class="row" style="margin-top:14px"><button class="btn" id="mdRandom" type="button" ${free.length ? "" : "disabled"}>Random matchday</button>
      <label class="fine">Model plays <select id="styleSel"><option value="accuracy" ${S.style === "accuracy" ? "selected" : ""}>Max Accuracy</option><option value="balanced" ${S.style === "balanced" ? "selected" : ""}>Balanced</option></select></label></div>
      <p class="fine" style="margin-top:10px">${free.length} matchdays you haven't played, across ${c === "ALL" ? "all five leagues and 25 seasons" : poolSeasons(c).length + " seasons"}.</p></div>`;
    return;
  }
  const { c: mc, season, n, per, picks, locked } = S.md, ms = lgOf(mc).seasons[season].matches.slice(S.md.a, S.md.b), done = store.items[mdKey(mc, season, n)];
  const rows = ms.map((m, i) => {
    const call = modelCall(m), res = done ? done.res[i] : null;
    return `<div class="mdrow2" data-i="${i}"><div class="mteam h">${esc(m[1])}${badge(m[1], "sm")}</div>
      <div class="mpicks">${["H", "D", "A"].map((k) => `<button type="button" class="mp" data-k="${k}" data-mdp="${i}|${k}" aria-pressed="${picks[i] === k}" aria-label="${OUTNAME[k]}" ${locked || done ? "disabled" : ""}>${k}</button>`).join("")}</div>
      <div class="mteam">${badge(m[2], "sm")}${esc(m[2])}</div><div class="mres" id="mres${i}">${done ? mdResult(m, picks[i] != null ? picks[i] : done.picks[i], call) : ""}</div></div>`;
  }).join("");
  const filled = picks.filter(Boolean).length;
  $("#room").innerHTML = `<div class="card">${gamesBar(`${c === "ALL" ? lgOf(mc).name + " · " : ""}${season} · matchday ${n}`)}<div class="mdlist">${rows}</div>
    <div class="row" style="margin-top:14px"><button class="btn" id="mdLock" type="button" ${filled === per && !locked && !done ? "" : "disabled"}>Lock all ${per}</button><span class="fine" id="mdCount">${filled}/${per} picked</span></div><div id="mdSum"></div></div>`;
  if (done) renderMdSummary(done, true);
}
const mdResult = (m, pick, call) => { const ok = pick === m[5], mok = call.pick === m[5]; return `<span class="num score">${m[3]}-${m[4]}</span><span class="mark ${ok ? "y" : "n"}" title="You">${ok ? "✓" : "✗"}</span><span class="mark ${mok ? "y" : "n"} dim" title="Model: ${OUTNAME[call.pick]}">${mok ? "✓" : "✗"}</span>`; };
function lockMd() {
  const { c, season, n, per, picks } = S.md, ms = lgOf(c).seasons[season].matches.slice(S.md.a, S.md.b);
  S.md.locked = true; Snd.lock();
  document.querySelectorAll(".mp, #mdLock").forEach((b) => { b.disabled = true; });
  let you = 0, mod = 0, i = 0; const res = ms.map((m) => m[5]), mp = ms.map((m) => modelCall(m).pick);
  const step = () => {
    const m = ms[i], ok = picks[i] === m[5], mok = mp[i] === m[5]; you += ok; mod += mok;
    const el = $("#mres" + i); if (!el) return;
    el.innerHTML = mdResult(m, picks[i], { pick: mp[i] }); el.classList.add("land");
    ok ? Snd.right() : Snd.wrong(); i++;
    if (i < ms.length) setTimeout(step, REDUCED ? 0 : 650);
    else setTimeout(() => { const item = { lg: c, season, n, picks, res, mpicks: mp, you, mod, at: new Date().toISOString() }; lockIn(mdKey(c, season, n), item); renderMdSummary(item, false); afterMatchday(item); }, 500);
  };
  setTimeout(step, 400);
}
function renderMdSummary(it, instant) {
  const beat = it.you > it.mod, tie = it.you === it.mod;
  $("#mdSum").innerHTML = `<div class="rcard on" style="margin-top:14px"><div class="label">Full time</div><div class="verdicts" style="margin-top:8px"><div class="vd ${beat || tie ? "ok" : "no"}"><span class="label">You</span><b class="big2 num">${it.you}/${it.picks.length}</b></div><div class="vd ${it.mod >= it.you ? "ok" : "no"}"><span class="label">Model</span><b class="big2 num">${it.mod}/${it.picks.length}</b></div></div>
    <div class="row" style="margin-top:12px"><b>${beat ? "You beat the model this round." : tie ? "Level with the model." : "The model won this round."}</b><button class="btn" id="mdAgain" type="button">Another matchday</button><button class="btn ghost" id="mdCard" type="button">Make a result card</button></div></div>`;
  if (!instant && beat) { Snd.win(); confetti(); }
}

/* ---------- Spot the upset ---------- */
const probOfResult = (m) => ({ A: m[6], D: m[7], H: m[8] }[m[5]]);
function newUpset(c) {
  const pool = allMatches(c);
  for (let tries = 0; tries < 500; tries++) {
    const pick = []; while (pick.length < 5) { const r = pool[Math.floor(Math.random() * pool.length)]; if (!pick.includes(r)) pick.push(r); }
    const ps = pick.map((r) => probOfResult(r.m)), sorted = [...ps].sort((a, b) => a - b);
    if (sorted[0] <= 0.2 && sorted[1] - sorted[0] >= 0.06) return { items: pick, ps, ans: ps.indexOf(sorted[0]), chosen: null };
  }
  return null;
}
function renderUpset() {
  const c = S.code; if (!S.up) S.up = newUpset(c);
  const u = S.up, st = store.items[`u_${c}`] || { rounds: 0, right: 0, best: 0 };
  const cards = u.items.map((r, k) => {
    const m = r.m, rev = u.chosen != null, cls = rev ? (k === u.ans ? "ans" : k === u.chosen ? "wrong" : "") : "";
    return `<button type="button" class="upc ${rev ? "flip" : ""} ${cls}" data-up="${k}" ${rev ? "disabled" : ""} style="--d:${k * 80}ms"><div class="upin"><div class="upfront"><span class="fine">${fmtDate(m[0])}</span><div class="upm">${badge(m[1], "sm")}<b>${esc(m[1])}</b><span class="num score">${m[3]}-${m[4]}</span><b>${esc(m[2])}</b>${badge(m[2], "sm")}</div></div>
      <div class="upback"><div class="upm">${badge(m[1], "sm")}<b>${esc(m[1])}</b><span class="num score">${m[3]}-${m[4]}</span><b>${esc(m[2])}</b>${badge(m[2], "sm")}</div><div class="pbar" style="--c:var(--accent)"><span class="label">Model gave it</span><div class="track"><div class="fill" style="width:${(u.ps[k] * 100).toFixed(0)}%"></div></div><span class="num">${pct(u.ps[k])}</span></div>${k === u.ans ? '<span class="tag">the biggest upset</span>' : ""}</div></div></button>`;
  }).join("");
  $("#room").innerHTML = `<div class="card">${gamesBar("Spot the upset")}<p class="sub">Five real results from matches the model had never seen. Before kickoff it gave every outcome a probability. <b>Which result did it think was least likely?</b></p><div class="uplist">${cards}</div>
    ${u.chosen != null ? `<div class="row" style="margin-top:14px"><b class="${u.chosen === u.ans ? "up" : "down"}">${u.chosen === u.ans ? "Right!" : "Not this time."} Streak ${S.upStreak}</b><button class="btn" id="upNext" type="button">Next round</button></div>` : `<p class="fine" style="margin-top:10px">Streak ${S.upStreak} · best ${st.best}</p>`}</div>`;
}
function answerUpset(k) {
  const c = S.code, u = S.up; if (u.chosen != null) return; u.chosen = k; const ok = k === u.ans; S.upStreak = ok ? S.upStreak + 1 : 0;
  const st = store.items[`u_${c}`] || { rounds: 0, right: 0, best: 0 }; lockIn(`u_${c}`, { rounds: st.rounds + 1, right: st.right + (ok ? 1 : 0), best: Math.max(st.best, S.upStreak) }); afterUpset(ok, u.ps[u.ans], S.upStreak, u.items[u.ans].c);
  Snd.flip(); renderUpset(); setTimeout(() => { ok ? (FX.hit(), S.upStreak >= 3 ? Snd.win() : Snd.right()) : (FX.miss(""), Snd.wrong()); if (ok) FX.streak(S.upStreak); if (ok && S.upStreak >= 3) confetti(); }, 350);
}

/* ---------- Guess the table ---------- */
const tabKey = (c, sn) => `t_${c}_${sn}`;
function tabSeasons(c) { const ks = Object.keys(lgOf(c).tables).sort(); return ks.filter((s) => s > ks[0]); }
const tabChoices = (c) => lgs(c).flatMap((lg) => tabSeasons(lg).map((sn) => ({ c: lg, season: sn })));
function prevPos(c, sn) { const keys = Object.keys(lgOf(c).tables).sort(), i = keys.indexOf(sn); return i > 0 ? Object.fromEntries(lgOf(c).tables[keys[i - 1]].map((r, j) => [r[0], j + 1])) : {}; }
function renderTableGame() {
  const c = S.tab ? S.tab.c : S.code, L = lgOf(c);
  if (!S.tab) {
    const choices = tabChoices(S.code), done = (x) => store.items[tabKey(x.c, x.season)];
    $("#room").innerHTML = `<div class="card">${gamesBar("Guess the table")}<p class="sub">Rebuild a final table. Start from last season's, then drag clubs up or down (or use the arrows). Closest to the real table wins. Tip: repeating last year is a tough baseline to beat.</p>
      <div class="row" style="margin-top:14px"><select id="tbSeason" aria-label="Season">${choices.slice().reverse().map((x) => `<option value="${x.c}|${x.season}">${S.code === "ALL" ? lgOf(x.c).name + " " : ""}${x.season}${done(x) ? " ✓" : ""}</option>`).join("")}</select><button class="btn" id="tbGo" type="button">Start</button><button class="btn ghost" id="tbRandom" type="button">Surprise me</button></div></div>`;
    return;
  }
  const { season, order } = S.tab, done = store.items[tabKey(c, season)], prev = prevPos(c, season);
  if (done) return renderTableVerdict(done);
  const rows = order.map((t, i) => `<div class="tbrow" draggable="true" data-tb="${i}"><span class="num tbn">${i + 1}</span>${badge(t, "sm")}<b>${esc(t)}</b><span class="fine">${prev[t] ? `last season ${prev[t]}${["th", "st", "nd", "rd"][prev[t] % 10 > 3 || (prev[t] > 10 && prev[t] < 14) ? 0 : prev[t] % 10]}` : "promoted"}</span><span class="tbbtns"><button class="xbtn" type="button" data-mv="${i}|-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>▲</button><button class="xbtn" type="button" data-mv="${i}|1" aria-label="Move down" ${i === order.length - 1 ? "disabled" : ""}>▼</button></span></div>`).join("");
  $("#room").innerHTML = `<div class="card">${gamesBar(`${S.code === "ALL" ? lgOf(c).name + " · " : ""}${season} · final table`)}<div class="tblist" id="tbList">${rows}</div><div class="row" style="margin-top:14px"><button class="btn" id="tbLock" type="button">Lock in my table</button><span class="fine">Drag rows or use the arrows. Top places and the bottom places are marked after you lock.</span></div></div>`;
}
function startTable(lg, sn) {
  const c = lg, tab = lgOf(c).tables[sn], prev = prevPos(c, sn), clubs = tab.map((r) => r[0]);
  const xp = Object.fromEntries(tab.map((r) => [r[0], r[7]]));
  S.tab = { c, season: sn, order: [...clubs].sort((a, b) => (prev[a] || 99) - (prev[b] || 99) || xp[b] - xp[a]) }; renderTableGame();
}
function lockTable() {
  const { c, season, order } = S.tab, tab = lgOf(c).tables[season], real = Object.fromEntries(tab.map((r, i) => [r[0], i + 1])), prev = prevPos(c, season), xp = Object.fromEntries(tab.map((r) => [r[0], r[7]]));
  const model = [...order].sort((a, b) => xp[b] - xp[a]), last = [...order].sort((a, b) => (prev[a] || 99) - (prev[b] || 99) || xp[b] - xp[a]);
  const err = (o) => o.reduce((a, t, i) => a + Math.abs(i + 1 - real[t]), 0) / o.length;
  Snd.lock(); lockIn(tabKey(c, season), { lg: c, season, you: order, model, last, youErr: err(order), modErr: err(model), lastErr: err(last), at: new Date().toISOString() }); afterTable({ lg: c, season, youErr: err(order), modErr: err(model), lastErr: err(last) }); renderTableGame();
}
function renderTableVerdict(d) {
  const c = d.lg, tab = lgOf(c).tables[d.season], N = tab.length, exact = (o) => o.filter((t, i) => tab[i][0] === t).length, beat = d.youErr < d.modErr;
  const rows = tab.map((r, i) => `<div class="tbrow tbres" style="--d:${i * 40}ms"><span class="num tbn">${i + 1}</span>${badge(r[0], "sm")}<b>${esc(r[0])}</b><span class="num">${r[1]} pts</span><span>You <b class="num">${d.you.indexOf(r[0]) + 1}</b></span><span>Model <b class="num">${d.model.indexOf(r[0]) + 1}</b></span></div>`).join("");
  $("#room").innerHTML = `<div class="card">${gamesBar(`${S.code === "ALL" ? lgOf(c).name + " · " : ""}${d.season} · the real table`)}<div class="rcard on"><h3 style="font-size:24px" class="${beat ? "up" : d.youErr > d.modErr ? "down" : ""}">${beat ? "You beat the model!" : d.youErr > d.modErr ? "The model wins this one." : "Level with the model."}</h3>
    <div class="tiles"><div class="tile"><b class="num">${d.youErr.toFixed(2)}</b><small>You: places off per club (${exact(d.you)} exact)</small></div><div class="tile"><b class="num">${d.modErr.toFixed(2)}</b><small>Model: places off (${exact(d.model)} exact)</small></div><div class="tile"><b class="num">${d.lastErr.toFixed(2)}</b><small>Just repeating last season: places off (${exact(d.last)} exact)</small></div></div></div>
    <div class="tblist" style="margin-top:12px">${rows}</div><div class="row" style="margin-top:12px"><button class="btn" id="tbAgain" type="button">Another season</button><button class="btn ghost" id="tbCard" type="button">Make a result card</button></div></div>`;
  if (beat) { Snd.win(); confetti(); } else Snd.tick();
}

/* ---------- Higher or lower ---------- */
const HOL_Q = [["pts", "finished with more points", 1, 5], ["gf", "scored more goals", 1, 6], ["ga", "conceded fewer goals", -1, 6], ["w", "won more matches", 1, 2], ["gd", "had the better goal difference", 1, 8]];
function newHol(c) {
  const lg = lgs(c)[Math.floor(Math.random() * lgs(c).length)], tabs = lgOf(lg).tables, keys = Object.keys(tabs);
  for (let tries = 0; tries < 300; tries++) {
    const sn = keys[Math.floor(Math.random() * keys.length)], rows = tabs[sn].map((r) => ({ t: r[0], pts: r[1], gf: r[2], ga: r[3], w: r[4], gd: r[2] - r[3] })), [key, text, dir, gap] = HOL_Q[Math.floor(Math.random() * HOL_Q.length)];
    const a = rows[Math.floor(Math.random() * rows.length)], b = rows[Math.floor(Math.random() * rows.length)];
    if (a === b || Math.abs(a[key] - b[key]) < gap) continue;
    return { c: lg, sn, key, text, a, b, win: dir * (a[key] - b[key]) > 0 ? a : b, chosen: null };
  }
  return null;
}
function renderHol() {
  const c = S.code; if (!S.hol) S.hol = newHol(c);
  const q = S.hol, best = (store.items[`h_${c}`] || { best: 0 }).best;
  const side = (r, k) => { const rev = q.chosen != null; return `<button type="button" class="holc ${rev ? (r === q.win ? "ans" : r === q.chosen ? "wrong" : "") : ""}" data-hol="${k}" ${rev ? "disabled" : ""}>${badge(r.t, "xl")}<b>${esc(r.t)}</b><span class="num holv" data-v="${r[q.key]}">${rev ? r[q.key] : "?"}</span></button>`; };
  $("#room").innerHTML = `<div class="card">${gamesBar("Higher or lower")}<p class="sub">Which club ${esc(q.text)} in <b>${S.code === "ALL" ? lgOf(q.c).name + " " : ""}${q.sn}</b>?</p><div class="holpair">${side(q.a, "a")}<span class="vs">or</span>${side(q.b, "b")}</div>
    ${q.chosen != null ? `<div class="row" style="margin-top:14px"><b class="${q.chosen === q.win ? "up" : "down"}">${q.chosen === q.win ? "Right!" : "Wrong."} Streak ${S.holStreak}</b><button class="btn" id="holNext" type="button">${q.chosen === q.win ? "Next" : "Try again"}</button></div>` : `<p class="fine" style="margin-top:10px">Streak ${S.holStreak} · best ${best}</p>`}</div>`;
  if (q.chosen != null) document.querySelectorAll(".holv").forEach((el) => { const end = +el.dataset.v, t0 = performance.now(); (function f(t) { const k = REDUCED ? 1 : Math.min(1, (t - t0) / 700); el.textContent = Math.round(end * k); if (k < 1) requestAnimationFrame(f); })(t0); });
}
function answerHol(k) {
  const c = S.code, q = S.hol; if (q.chosen != null) return; q.chosen = k === "a" ? q.a : q.b; const ok = q.chosen === q.win; S.holStreak = ok ? S.holStreak + 1 : 0;
  const cur = store.items[`h_${c}`] || { best: 0 }; if (S.holStreak > cur.best) lockIn(`h_${c}`, { best: S.holStreak }); afterHol(ok, S.holStreak, q.c);
  Snd.flip(); renderHol(); setTimeout(() => { ok ? (FX.hit(), S.holStreak >= 5 ? Snd.win() : Snd.right()) : (FX.miss(""), Snd.wrong()); if (ok) FX.streak(S.holStreak); if (ok && S.holStreak >= 5 && S.holStreak % 5 === 0) confetti(); }, 500);
}


/* ================= Progression: XP, ranks, achievements, streak calendar ================= */
const LEVELS = [["Driveway", 0], ["Rec League", 100], ["High School", 300], ["College", 650], ["Pro", 1200], ["Captain", 2000], ["Franchise Legend", 3200], ["Hall of Famer", 5000]];
const ACH = [
  ["first_call", "First blood", "Make your first correct call"],
  ["giant", "Giant killer", "Beat the model on a single match"],
  ["sharp", "Sharpshooter", "Predict an exact score"],
  ["draw", "Draw whisperer", "Call a draw correctly"],
  ["streak5", "On a roll", "Five correct calls in a row"],
  ["streak10", "Unstoppable", "Ten correct calls in a row"],
  ["upset", "Upset detective", "Spot an upset the model gave 12% or less"],
  ["daily5", "Perfect five", "Get 5 of 5 on a Daily 5"],
  ["dailybeat", "Daily double", "Beat the model on a Daily 5"],
  ["flame3", "Warming up", "Play three days in a row"],
  ["flame7", "Seven-day flame", "Play seven days in a row"],
  ["md9", "Matchday master", "Call 9 or more results right in one matchday"],
  ["table", "Table whisperer", "Beat the model at Guess the table"],
  ["hol5", "Higher power", "Five right in a row at Higher or lower"],
  ["globe", "Globetrotter", "Play a game in all five leagues"],
  ["decade", "Time traveller", "Play matches from five different seasons"],
  ["friend", "Rival", "Finish a challenge"],
  ["captain", "Captain's armband", "Reach the Captain rank"],
  ["quizmaster", "Quizmaster", "Score 3,500 or more in a solo quiz"],
  ["tttwin", "Three in a row", "Beat the computer at football tic-tac-toe"],
  ["splash_all", "Loading screen collector", "See every loading screen"],
  ["splash_10", "Channel hopper", "See ten different loading screens"],
  ["splash_rare", "Lucky load", "See a rare or legendary loading screen"],
  ["splash_leg", "Glitch in the matrix", "See the legendary loading screen"],
  ["first_buzz", "First buzz", "Get your first quiz answer right"],
  ["speed", "Speed demon", "Answer a quiz in the first few seconds (950 points or more)"],
  ["elite_win", "Elite mind", "Get a quiz answer right on Elite ball knowledge"],
  ["hat3", "Hat-trick", "Three right in a row in a solo streak"],
  ["streak10q", "Perfect ten", "Ten right in a row in a solo streak"],
  ["night", "Night owl", "Play between midnight and 5am"],
  ["early", "Early bird", "Play between 5am and 7am"],
  ["social", "Friendly", "Add a friend"],
  ["avatar", "Looking sharp", "Pick a profile picture"],
  ["fav", "True colours", "Pick a favourite player and a favourite team"],
  ["ranked_first", "Ranked debut", "Finish your first ranked match"],
  ["ranked_win", "Winner winner", "Win a ranked match"],
  ["ranked5", "Regular", "Finish five ranked matches"],
  ["elo1200", "Rising", "Reach 1200 Elo"],
  ["season_regular", "Season regular", "Play 10 ranked games in one monthly season"],
  ["season_top10", "Top 10", "Finish a monthly season in the top 10 (12+ players)"],
  ["season_podium", "Podium", "Finish a monthly season in the top 3 (5+ players)"],
  ["season_champ", "Season champion", "Win a monthly season"],
  ["alldiff", "Every level", "Play a ballknowledge game on all four difficulty levels"],
  ["rounds100", "Century", "Play 100 games"],
  ["squad", "The whole squad", "Play all eleven ballknowledge originals"],
  ["curious", "Know thyself", "Open your profile"],
  ["pred1", "On the record", "Lock your first live prediction"],
  ["pred10", "Pundit", "Lock 10 live predictions"],
  ["beatmodel", "Out-predicted the model", "Finish ahead of the model on the live board (3 or more picks)"],
  ["sticker1", "First sticker", "Collect your first sticker"],
  ["page", "Team page complete", "Collect a club's badge and its 12 best-known players"],
  ["stick50", "Swapper", "Collect 50 different stickers"],
  ["stick150", "Panini pro", "Collect 150 different stickers"],
  ["wk_play", "Weekly regular", "Finish a weekly tournament"],
  ["ic_perfect", "Highlight reel", "Name every highlight of an iconic match"],
  ["xi_perfect", "Full eleven", "Name a complete Starting XI"],
  ["daily_habit", "Daily habit", "Answer the Daily feed question seven days in a row"],
  ["club_quiz", "Found my club", "Take the Who's your club quiz"],
  ["rapid_win", "Quicker than the model", "Beat the model in Rapid fire"],
  ["rapid_20", "Twenty in a minute", "Get 20 results right in one Rapid fire"],
  ["bracket_win", "Bracket buster", "Beat the Elo model on a Champions League bracket"],
  ["scramble10", "Word wizard", "Solve 10 Scramble rounds"],
  ["login7", "Regular visitor", "Open ballknowledge seven days in a row"],
  ["login30", "Part of the furniture", "Open ballknowledge thirty days in a row"],
  ["wk_win", "Weekly champion", "Finish first in a weekly tournament"],
];
/* Badge difficulty: 0 Common, 1 Uncommon, 2 Rare, 3 Epic, 4 Legendary. Every unlocked achievement can be equipped as a badge. */
const TIERS = [["Common", "#9aa3b2"], ["Uncommon", "#4ade80"], ["Rare", "#38bdf8"], ["Epic", "#c084fc"], ["Legendary", "#fbbf24"]];
const ACH_TIER = { season_regular: 2, season_top10: 3, season_podium: 3, season_champ: 4, curious: 0, avatar: 0, fav: 0, social: 0, first_call: 0, first_buzz: 0, sticker1: 0, pred1: 0, ranked_first: 0, early: 0, night: 0, flame3: 0,
  draw: 1, sharp: 1, upset: 1, streak5: 1, hat3: 1, dailybeat: 1, splash_10: 1, splash_rare: 1, pred10: 1, tttwin: 1, friend: 1, table: 1, hol5: 1, decade: 1, alldiff: 1,
  speed: 2, md9: 2, daily5: 2, flame7: 2, globe: 2, ranked_win: 2, elo1200: 2, ranked5: 2, rounds100: 2, stick50: 2, page: 2, squad: 2, giant: 2,
  elite_win: 3, streak10: 3, streak10q: 3, beatmodel: 3, quizmaster: 3, captain: 3, splash_leg: 3, stick150: 4, splash_all: 4, wk_play: 1, wk_win: 4, ic_perfect: 3, login7: 2, login30: 4, xi_perfect: 3, rapid_win: 2, rapid_20: 3, bracket_win: 3, scramble10: 2, daily_habit: 2, club_quiz: 0 };
const ACH_ICON = { season_regular: "calendar", season_top10: "medal", season_podium: "trophy", season_champ: "crown", first_call: "target", giant: "swords", sharp: "target", draw: "minus", streak5: "flame", streak10: "bolt", upset: "search", daily5: "star", dailybeat: "calendar", flame3: "flame", flame7: "flame", md9: "chart", table: "rank", hol5: "trend", globe: "globe", decade: "hourglass", friend: "handshake", captain: "medal", quizmaster: "brain", tttwin: "net", splash_all: "monitor", splash_10: "monitor", splash_rare: "gem", splash_leg: "gem", first_buzz: "bulb", speed: "timer", elite_win: "crown", hat3: "ball", streak10q: "bolt", night: "moon", early: "sun", social: "users", avatar: "user", fav: "star", ranked_first: "shield", ranked_win: "trophy", ranked5: "shield", elo1200: "trend", alldiff: "compass", rounds100: "games", squad: "users", curious: "search", pred1: "fore", pred10: "fore", beatmodel: "chip", sticker1: "album", page: "album", stick50: "album", stick150: "album", wk_play: "calendar", wk_win: "trophy", ic_perfect: "live", login7: "flame", login30: "flame", xi_perfect: "users", rapid_win: "bolt", rapid_20: "timer", bracket_win: "trophy", scramble10: "brain", daily_habit: "calendar", club_quiz: "compass", owner: "crown", admin: "shield" };
const ROLE_BADGES = { owner: ["Owner", "Owns ballknowledge. Only the owner can wear this."], admin: ["Admin", "Looks after ballknowledge. Only admins can wear this."] };
const badgeName = (id) => ROLE_BADGES[id] ? ROLE_BADGES[id][0] : ((ACH.find((a) => a[0] === id) || [])[1] || "");
const badgeTier = (id) => ROLE_BADGES[id] ? 5 : ACH_TIER[id] != null ? ACH_TIER[id] : 0;
function bdg(id, big) {
  if (!ROLE_BADGES[id] && !ACH.some((a) => a[0] === id)) return "";
  const r = ROLE_BADGES[id], ti = badgeTier(id), tn = r ? r[0] : TIERS[ti][0];
  return `<span class="bdg ${r ? "role " + id : "t" + ti} ${big ? "big" : ""}" title="${esc(badgeName(id))} · ${tn}"><svg class=ic><use href=#i-${ACH_ICON[id] || "star"}></use></svg></span>`;
}
const badgesHTML = (arr, big) => { const a = (Array.isArray(arr) ? arr : []).filter((x) => typeof x === "string").slice(0, 3).map((x) => bdg(x, big)).join(""); return a ? `<span class="bdgs">${a}</span>` : ""; };
const myRoleOK = (id) => id === "owner" ? Admin.role === "owner" : id === "admin" ? !!Admin.role : true;
function myBadges() { const p = prof(); return (p.badges || []).filter((id) => (ROLE_BADGES[id] ? myRoleOK(id) : p.ach[id])).slice(0, 3); }
function syncBadges() { if (Account.signedIn) Ranked.rpc("set_badges", { p_ids: myBadges() }); }
const todayKey = () => new Date().toISOString().slice(0, 10);
const weekId = (d = new Date()) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = t.getUTCFullYear(), w = Math.ceil(((t - new Date(Date.UTC(y, 0, 1))) / 864e5 + 1) / 7); return y * 100 + w; };
function prof() { const p = store.items.profile || {}; return { xp: 0, ach: {}, days: {}, nick: "", board: false, leagues: {}, seasons: {}, ...p, ach: { ...(p.ach || {}) }, days: { ...(p.days || {}) }, leagues: { ...(p.leagues || {}) }, seasons: { ...(p.seasons || {}) } }; }
const saveProf = (p) => lockIn("profile", p);
function levelOf(xp) { let i = 0; LEVELS.forEach(([, t], k) => { if (xp >= t) i = k; }); const next = LEVELS[i + 1]; return { i, name: LEVELS[i][0], from: LEVELS[i][1], to: next ? next[1] : null, next: next ? next[0] : null }; }
function dayStreak(p) { let s = 0; const now = Date.now(); for (let k = 0; k < 400; k++) { const key = new Date(now - k * 864e5).toISOString().slice(0, 10); if ((p.days[key] || 0) > 0) s++; else if (k > 0) break; } return s; }
function bestDayStreak(p) { const keys = Object.keys(p.days).filter((k) => p.days[k] > 0).sort(); let best = 0, cur = 0, prev = null; keys.forEach((k) => { const d = new Date(k + "T00:00:00Z").getTime(); cur = prev !== null && d - prev === 864e5 ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }); return best; }
function toast(html, kind = "") {
  let box = $("#toasts"); if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
  TOASTQ.push([html, kind]); if (TOASTQ.length === 1) toastNext(box);   // one at a time, so achievements and stickers do not pile up
}
const TOASTQ = [];
function toastNext(box) {
  if (!TOASTQ.length) return; const [html, kind] = TOASTQ[0], short = TOASTQ.length > 3, t = document.createElement("div"); t.className = "toast " + kind; t.innerHTML = html; box.appendChild(t);
  const life = short ? 1800 : 2800; setTimeout(() => t.classList.add("out"), life); setTimeout(() => { t.remove(); TOASTQ.shift(); toastNext(box); }, life + 450);
}
function unlock(p, id) { if (p.ach[id]) return; p.ach[id] = todayKey(); const a = ACH.find((x) => x[0] === id); toast(`<b>Achievement unlocked</b><br>${esc(a[1])}: ${esc(a[2])}`, "ach"); Snd.win(); setTimeout(() => { try { Mascot.react("achieve"); } catch (e) { /* not ready */ } }, 1500); }
const skelRows = (n = 3) => Array.from({ length: n }, () => '<div class="skel"></div>').join("");
const emptyState = (icon, title, text, action = "") => `<div class="fxempty"><span>${icon}</span><b>${title}</b><div class="fine">${text}</div>${action ? `<div class="fxact">${action}</div>` : ""}</div>`;   /* action: an optional button, so an empty screen says what to do next */
const BK_LABELS = ["Who am I?", "Career path", "Name that team", "Logo blur", "Where did they finish?", "Market value", "Basketball tic-tac-toe", "Team roulette", "Starting XI", "Scramble", "Who did it"];
function award(id) { const p = prof(); if (p.ach[id]) return; unlock(p, id); saveProf(p); }
/* ---------- recommendations (Usage lives in site/usage.js) ---------- */
const USPORT = DATA.sport === "nba" ? "bb" : "fb";
let HUB_ORD = { fav: null, next: null };
function hubList(list) { const o = Usage.order(list, USPORT); HUB_ORD = o; return o.list; }
const favPill = (id) => (id === HUB_ORD.fav ? '<span class="gfav">Your go-to</span>' : id === HUB_ORD.next ? '<span class="gfav try">Try next</span>' : "");
function forYouHTML() {
  const all = [...QUIZ_GAMES, ...GAMES], o = Usage.order(all, USPORT); if (!o.fav) return "";
  const top = o.list.filter((g) => Usage.count(USPORT + ":" + g.id) > 0).slice(0, 3), nx = o.next && all.find((g) => g.id === o.next);
  return `<div class="foryou"><span class="label">For you</span>${top.map((g) => `<button type="button" class="fychip ${g.id === o.fav ? "fav" : ""}" data-game="${g.id}">${g.name}<small>${Usage.count(USPORT + ":" + g.id)}×</small></button>`).join("")}${nx ? `<button type="button" class="fychip" data-game="${nx.id}">${nx.name}<small>try next</small></button>` : ""}</div>`;
}
function trackPlay(label) {
  if (S.game) Usage.play(USPORT, S.game, 0.25);
  const p = prof(); label = label === "Write your number" ? "Market value" : label; p.rounds = (p.rounds || 0) + 1; p.played = { ...(p.played || {}) }; p.diffs = { ...(p.diffs || {}) };
  if (BK_LABELS.includes(label)) { p.played[label] = 1; p.diffs[S.diff] = 1; }
  const hr = new Date().getHours(); if (hr < 5) unlock(p, "night"); else if (hr < 7) unlock(p, "early");
  if (p.rounds >= 100) unlock(p, "rounds100"); if (BK_LABELS.every((l) => p.played[l])) unlock(p, "squad"); if (["easy", "medium", "hard", "elite"].every((d) => p.diffs[d])) unlock(p, "alldiff");
  saveProf(p);
}
function reward(xp, label, mutate) {
  trackPlay(label);
  const p = prof(), before = levelOf(p.xp).i; p.xp += xp; p.days[todayKey()] = (p.days[todayKey()] || 0) + 1;
  if (mutate) mutate(p);
  const st = dayStreak(p); if (st >= 3) unlock(p, "flame3"); if (st >= 7) unlock(p, "flame7");
  if (Object.keys(p.leagues).length >= 5) unlock(p, "globe"); if (Object.keys(p.seasons).length >= 5) unlock(p, "decade");
  const after = levelOf(p.xp); if (after.i >= 5) unlock(p, "captain");
  saveProf(p); toast(`+${xp} XP · ${esc(label)}`);
  if (after.i > before) { toast(`<b>Rank up</b><br>${esc(after.name)}`, "up"); Snd.win(); confetti(); setTimeout(() => Mascot.react("rankup"), 800); }
  paintProfileBtn(); Board.submit({ game: "xp", league: "all", score: xp });
}
const mark = (p, c, season) => { p.leagues[c] = (p.leagues[c] || 0) + 1; if (season) p.seasons[season] = 1; };
function afterCall(it) {
  const yp = ptsFor(it.pick, it.score, it.real), mp = ptsFor(it.mpick, it.mscore, it.real), ok = it.pick === it.res, st = streaks(playsOf(it.lg));
  reward(10 + (ok ? 8 : 0) + (yp > mp ? 12 : 0) + (it.score && it.score[0] === it.real[0] && it.score[1] === it.real[1] ? 15 : 0), "Call it", (p) => {
    mark(p, it.lg, it.season); if (ok) unlock(p, "first_call"); if (yp > mp) unlock(p, "giant"); if (it.score && it.score[0] === it.real[0] && it.score[1] === it.real[1]) unlock(p, "sharp");
    if (ok && it.res === "D") unlock(p, "draw"); if (st.cur >= 5) unlock(p, "streak5"); if (st.cur >= 10) unlock(p, "streak10");
  });
  Board.submit({ game: "call", league: it.lg, score: yp - mp });
}
function afterDaily(c, st, key) {
  const you = st.items.filter((x) => x.pick === x.res).length, mod = st.items.filter((x) => x.mpick === x.res).length;
  if (store.items[`xpd_${c}_${key}`]) return; lockIn(`xpd_${c}_${key}`, { you, mod });
  reward(40 + 10 * you + (you > mod ? 25 : 0), "Daily 5", (p) => { if (you === 5) unlock(p, "daily5"); if (you > mod) unlock(p, "dailybeat"); });
  Board.submit({ game: "daily", league: c, score: you, day: key });
}
function afterChallenge(c, code, st) {
  const you = st.items.filter((x) => x.pick === x.res).length, mod = st.items.filter((x) => x.mpick === x.res).length;
  if (store.items[`xpc_${code}`]) return; lockIn(`xpc_${code}`, { you, mod, c });
  reward(40 + 10 * you + (you > mod ? 25 : 0), "Challenge", (p) => { unlock(p, "friend"); if (/^wk\d{6}$/.test(code)) unlock(p, "wk_play"); if (you === 5) unlock(p, "daily5"); });
  Board.submit({ game: "challenge", league: c, score: you, code });
}
function afterMatchday(it) { reward(20 + 4 * it.you + (it.you > it.mod ? 20 : 0), "Matchday", (p) => { mark(p, it.lg, it.season); if (it.you >= 9) unlock(p, "md9"); }); Board.submit({ game: "matchday", league: it.lg, score: it.you }); }
function afterUpset(ok, prob, streak, lg) { reward(10 + (ok ? 15 + 5 * Math.min(streak, 5) : 0), "Spot the upset", (p) => { mark(p, lg, null); if (ok && prob <= 0.12) unlock(p, "upset"); }); if (ok) Board.submit({ game: "upset", league: S.code, score: streak }); }
function afterTable(d) { const beat = d.youErr < d.modErr; reward(60 + (beat ? 40 : 0) + (d.youErr < d.lastErr ? 20 : 0), "Guess the table", (p) => { mark(p, d.lg, d.season); if (beat) unlock(p, "table"); }); Board.submit({ game: "table", league: d.lg, score: beat ? 1 : 0 }); }
function afterHol(ok, streak, lg) { reward(5 + (ok ? 5 + 2 * Math.min(streak, 10) : 0), "Higher or lower", (p) => { mark(p, lg, null); if (streak >= 5) unlock(p, "hol5"); }); if (ok) Board.submit({ game: "hol", league: S.code, score: streak }); }

function loginStreak(p) { let s = 0; const now = Date.now(), L = p.logins || {}; for (let k = 0; k < 400; k++) { const key = new Date(now - k * 864e5).toISOString().slice(0, 10); if (L[key]) s++; else if (k > 0) break; else continue; } return s; }
function recordLogin() { const p = prof(), k = todayKey(); p.logins = { ...(p.logins || {}) }; if (!p.logins[k]) { p.logins[k] = 1; const ks = Object.keys(p.logins).sort(); while (ks.length > 120) delete p.logins[ks.shift()]; const s = loginStreak(p); if (s >= 7) unlock(p, "login7"); if (s >= 30) unlock(p, "login30"); saveProf(p); } paintLoginStreak(); }
function paintLoginStreak() { const el = $("#loginStreak"); if (!el) return; const s = loginStreak(prof()); el.hidden = s < 1; el.innerHTML = `<svg class="ic fire"><use href="#i-flame"></use></svg><b class="num">${s}</b>`; el.title = `${s} day${s === 1 ? "" : "s"} in a row opening ballknowledge`; }
function paintProfileBtn() {
  const b = $("#profileBtn"); if (!b) return; const p = prof(), lv = levelOf(p.xp), st = dayStreak(p), signed = Account.signedIn || Account.claude, pct = lv.to ? Math.min(100, Math.round(((p.xp - lv.from) / (lv.to - lv.from)) * 100)) : 100;
  b.title = signed ? `Your profile. ${lv.to ? lv.to - p.xp + " XP to " + lv.next : "Top rank"}` : "Sign in or create an account";
  b.innerHTML = `<span class="lvl"><small>${esc(lv.name)}${st ? ` · ${st}d` : ""}</small><i class="lvbar"><b style="width:${pct}%"></b></i></span><span class="uname">${signed ? esc(p.nick || "Account") : Account.available ? "Sign in" : esc(p.nick || "Guest")}</span>${signed ? badgesHTML(myBadges()) : ""}${avatarHTML(p.avatar, "sm", p.nick || "G")}`;
  const a = $("#acctBtn"); if (a) a.hidden = true;
}
function calendarHTML(p) {
  const weeks = 12, today = new Date(), dow = (today.getUTCDay() + 6) % 7, cells = [];
  for (let w = weeks - 1; w >= 0; w--) for (let d = 0; d < 7; d++) { const off = w * 7 + (dow - d); const dt = new Date(today.getTime() - off * 864e5), key = dt.toISOString().slice(0, 10), n = off < 0 ? null : p.days[key] || 0; cells.push(`<i class="cal ${n == null ? "fut" : n === 0 ? "" : n < 3 ? "l1" : n < 6 ? "l2" : "l3"}" title="${key}: ${n || 0} games"></i>`); }
  return `<div class="calgrid">${cells.join("")}</div>`;
}

/* ---------- first-time tour ---------- */
/* ---------- the explainer: a narrated, animated walkthrough of the whole site (about 100 seconds) ---------- */

/* ---------- plain-language "how it works" panels, shown the first time you open something ---------- */
const HOWTO = {
  "g:call": ["Call it", ["What you do", "Pick the result of a real past match before you see it: Home win (H), Draw (D) or Away win (A). You can also guess the exact score."], ["Scoring", "1 point for the right result, plus 2 more for the exact score. The model makes its own pick, so you are playing against it."], ["Good to know", "Home teams win about 45 in 100 matches and draws happen about 26 in 100, so a draw is never a silly pick."]],
  "g:daily": ["Daily 5", ["What you do", "Five real matches, the same for everyone today. Pick a result for each."], ["Scoring", "A point for every right result. Come back tomorrow for a fresh five and build a streak."], ["Tip", "Share your score with a friend and see who did better."]],
  "g:matchday": ["Matchday", ["What you do", "A whole round of real fixtures at once. Pick a result for every match and lock them all in."], ["What happens next", "The real scores appear one by one, with the model's picks beside yours."], ["Scoring", "One point for each right result."]],
  "g:upset": ["Spot the upset", ["What you do", "Five real results are shown. Before each match the model gave every outcome a probability. Pick the result it thought was least likely."], ["Why it is fun", "An upset is a result almost nobody expected. Finding them trains your football instinct."], ["Scoring", "A point for each upset you spot, and your streak grows."]],
  "g:table": ["Guess the table", ["What you do", "Rebuild the final league table. Start from last season's and drag clubs up or down (or use the arrows)."], ["Scoring", "The closer your table is to the real one, the better. The model builds a table too, so you can compare."], ["Tip", "Repeating last year's table is a surprisingly strong guess. To beat it, change only the clubs you are sure about."]],
  "g:hol": ["Higher or lower", ["What you do", "Two clubs and one number. Pick the club that had more (points, goals and so on)."], ["Scoring", "Each right answer grows your streak. One wrong answer ends it."]],
  "g:challenge": ["Challenge a friend", ["What you do", "Create a challenge: five matches, the same for you and anyone with the link."], ["How", "Copy the link, send it, then compare scores when you have both finished."]],
  "g:who": ["Who am I?", ["What you do", "A mystery player. Clues start hard (where he was born) and get easier (his club). Press Buzz when you think you know, then type the name and press Enter. Small typos are fine."], ["Scoring", "Up to 1,000 points, falling as more clues appear. A wrong guess costs 150."], ["Solo or duel", "Solo: keep a streak going. Two players: the first to buzz and answer right takes the points."], ["Tip", "New to this? Choose Easy: it only asks about superstars."]],
  "g:career": ["Career path", ["What you do", "You see every club a player has played for, in order. Name the player."], ["Scoring", "Up to 1,000 points, falling over time. A wrong guess costs 150."], ["Tip", "Start with Easy for the biggest names."]],
  "g:club": ["Name that team", ["What you do", "Guess the club from numbers: goals scored, wins and defeats, then bigger hints like stadium size."], ["Scoring", "Up to 1,000 points, falling over time. A wrong guess costs 150."]],
  "g:blur": ["Logo blur", ["What you do", "A club badge starts very blurry and gets sharper every few seconds. Name the club."], ["Scoring", "The sharper the badge, the fewer points. Guess early to score more."]],
  "g:finish": ["Where did they finish?", ["What you do", "A club and a season appear. Slide to where you think it finished in the league table."], ["Scoring", "The closer you are, the more you score. Solo: your run continues while you stay within a few places."], ["Two players", "You each slide in turn without seeing the other's guess. Closest wins the round."]],
  "g:value": ["Market value", ["What it is", "Transfermarkt estimates what a player or squad is worth. That is the number we use."], ["Solo", "Two players or two squads: pick the one worth more. Keep the streak alive."], ["Two players", "A player appears and you each type a value in millions of euros. The closest guess scores most."]],
  "g:roulette": ["Team roulette", ["What you do", "A club appears. Two players take turns naming someone who has played for it."], ["You lose a round if", "you name someone who never played there, repeat a name, or run out of time."], ["Winning", "The first to win two rounds takes the match."]],
  "g:rapid": ["Rapid fire", ["What you do", "A real match appears. Tap Home win, Draw or Away win as fast as you can for 60 seconds."], ["The model", "It calls the same matches. Whoever gets more right wins."], ["Tip", "You can use the keys H, D and A."]],
  "g:bracket": ["Bracket buster", ["What you do", "A real Champions League knockout. In every round pick who goes through in each tie, then lock the round in."], ["The model", "A plain Elo rating, computed from every match before the tie, picks the higher-rated club."], ["Scoring", "A round of 16 tie is worth 1 point, a quarter-final 2, a semi-final 3 and the final 4."]],
  "g:iconic": ["Who did it", ["What you do", "A famous match appears with its score and its highlights by minute. For each goal and red card you name the player: the scorer, the penalty taker, the player who set it up, or who was sent off."], ["Hints and scoring", "100 per right answer, minus 15 per wrong guess and 30 per hint. Skip if you are stuck; the answer is shown at the end."], ["Good to know", "Minutes are whole minutes, so added-time goals show as 91, 93 and so on. Matches with own goals or shoot-outs are left out because the source does not mark them."]],
  "g:scramble": ["Scramble", ["What you do", "A club, a footballer or a manager appears as big shuffled letters, each word shuffled on its own. Buzz in when you know it and type the real name."], ["Hints", "Hints do not arrive on their own. Press Hint when you want one; in a two-player round a hint only appears once both players have asked. Each hint takes a little off the points."], ["Two players", "Same round on one device or two. A wrong answer costs 150 points and locks you out of that round."]],
  "g:xi": ["Starting XI", ["What you do", "A big match (a final, a Champions League semi-final or quarter-final, or a clash between two top-three league teams) and one of its teams appear on a pitch. Type the surnames of the eleven players who started."], ["Clues", "Easy shows first letters and shirt numbers, Medium shirt numbers, Hard and Elite only the positions (Elite also has 2 minutes instead of 3). Hint reveals more letters for 30 points."], ["Scoring", "100 per player, a bonus for the time left on a perfect XI, minus 20 per wrong guess."]],
  "g:ttt": ["Basketball tic-tac-toe", ["What you do", "Claim a square by naming a player who fits both its row and its column, for example 'played for Arsenal' and 'Spanish'."], ["Rules", "Nobody can be used twice, and a wrong answer loses your turn. Three in a row wins."]],
  "ranked": ["Ranked", ["What it is", "Play real people online. Create a lobby and others can join from the list."], ["Public or private", "Public lobbies change your rating. A private lobby with a code is for friends and never changes it."], ["Your rating", "Everyone starts at 1,000 Elo. Beating a higher-rated player earns more. Ranks run from Bronze up to Legend."]],
  "live": ["Live predictions", ["What you do", "Pick Home, Draw or Away for upcoming real matches before they kick off. You can change your pick until kickoff."], ["The model", "The model's pick is shown after you lock yours. The leaderboard pins its score at the top so you can compare."], ["Scoring", "One point for every right result."]],
  "replay": ["Time machine", ["What it does", "Pick any season and press play. Matches land round by round and the table builds, with the model's table next to the real one."], ["Model table", "That is the table you would get if every match went the way the model's probabilities say."]],
  "race": ["Title race", ["What it shows", "The model plays out the rest of the season thousands of times. The percentages are how often each club ends up in each place."], ["Careful", "It cannot see injuries or transfers, so treat it as a guide, not a promise."]],
};
const howSeen = () => { try { return JSON.parse(localStorage.getItem("bkn_howto") || "{}"); } catch (e) { return {}; } };
const howKey = () => { if (S.mode === "games") { if (S.game) return "g:" + S.game; if (S.hubGroup === "ranked" && S.room === "play") return "ranked"; if (S.hubGroup === "live" && S.room === "play") return "live"; } else if (S.mode === "lab" && (S.room === "replay" || S.room === "race")) return S.room; return null; };
function paintHowto(force) {
  const box = $("#howto"); if (!box) return; const k = howKey(), h = k && HOWTO[k], seen = howSeen();
  const q = $("#howBtn"); if (q) q.hidden = !h;
  if (!h || (!force && seen[k])) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false; box.innerHTML = `<div class="howcard"><div class="row" style="justify-content:space-between"><b>How ${esc(h[0])} works</b><button type="button" class="chip" data-how="${esc(k)}">Got it</button></div>${h.slice(1).map(([a, b]) => `<p><b>${esc(a)}.</b> ${esc(b)}</p>`).join("")}</div>`;
}

const BL = () => Object.assign({ random: 33.3, form: 47.8, home: 45.4 }, DATA.baselines || {});
function xBars(rows, note) { return `<div class="xs xs2">${rows.map(([n, v, k, hi]) => `<div class="xbar ${hi ? "hi" : ""}" style="--d:${0.4 + k * 0.45}s"><span>${n}</span><i><b style="--w:${v}%"></b></i><em class="num">${v}%</em></div>`).join("")}<small>${note}</small></div>`; }
function buildScenes(path, name) {
  const sm = DATA.summary.ALL, b = BL(), model = Math.round(sm.pooled_acc * 1000) / 10, books = Math.round(sm.market_acc * 1000) / 10, nn = Math.round(sm.n / 1000);
  const who = name ? `, ${name}` : "";
  const ns = ((DATA.nbaModel || {}).summary || {}).overall || {}, nacc = Math.round((ns.acc || 0) * 1000) / 10, nh = Math.round((ns.home || 0) * 1000) / 10, ngames = ns.n || 0;
  const welcome = { h: "Welcome", say: `Welcome${who}. This is the basketball side of ballknowledge, and it has two halves: games that test what you know, and a prediction model you can try to beat. It is free, and you do not need an account. Sign in only if you want to save your progress or play online.`,
    v: () => `<div class="xs xs1"><div class="xlogo">ball<b>knowledge</b></div><div class="xtwo"><div style="--d:.8s"><svg class=ic><use href=#i-brain></use></svg>Test your knowledge</div><div style="--d:1.4s"><svg class=ic><use href=#i-chip></use></svg>Beat the model</div></div></div>` };
  const quiz = [
    { h: "The quiz games", say: "In the quiz games you get clues about a mystery player or team. The sooner you answer correctly, the more points you score, up to a thousand. A wrong guess costs a little, so be sure. If you are new, start on Easy: it only asks about the biggest stars.",
      v: () => `<div class="xs xs4"><div class="xclues">${["Born in Madrid", "187 cm, left-footed", "Plays in La Liga", "Plays for ???"].map((c, k) => `<div style="--d:${0.6 + k * 0.9}s">${c}</div>`).join("")}</div><div class="xworth">Worth <b class="num">1000</b> points now</div><div class="xbuzz">BUZZ</div></div>` },
    { h: "Alone or together", say: "Play alone and see how long your streak lasts, or challenge a friend. Create a room, send them the link, and you play at the same time from your own phones. Short timers keep it fast.",
      v: () => `<div class="xs xs5"><div class="xphone"><i></i></div><div class="xlink"><span>ROOM  KXMP</span></div><div class="xphone"><i></i></div></div>` },
  ];
  const predict = [
    { h: "Predict games", say: "In Beat the Model you pick the winner of a real NBA game before you see the result. Then you see what the model picked, and what really happened.",
      v: () => `<div class="xs xs3"><div class="xmatch"><b>Lakers</b><span>at</span><b>Celtics</b></div><div class="xpicks"><i>Lakers</i><i class="sel">Celtics</i></div><div class="xnote">Then see what the model picked, and what really happened.</div></div>` },
    { h: "How good is the model?", say: `The model is a computer program that studies past results. It never sees the game it is predicting. Flipping a coin gets half right. Always backing the home team gets ${nh} percent. The model gets ${nacc} percent. Upsets happen every night.`,
      v: () => xBars([["Coin flip", 50, 1], ["Always the home team", nh, 2], ["The model", nacc, 3, true]], `Share of winners picked correctly, ${ngames.toLocaleString()} real games`) },
    { h: "Live predictions", say: "You can also predict upcoming real matches. Lock your pick before kickoff. The model plays along, and its score is pinned at the top of the leaderboard so you can see if you are beating it.",
      v: () => `<div class="xs xs7"><div class="xrow model"><svg class=ic><use href=#i-chip></use></svg>The Model<b class="num">31/52</b></div>${[["You", "34/52"], ["Ana", "33/52"], ["Bo", "29/52"]].map(([n, s], k) => `<div class="xrow" style="--d:${0.8 + k * 0.5}s">${n}<b class="num">${s}</b></div>`).join("")}</div>` },
  ];
  const go = { quiz: ["ballknowledge originals", "games-all-leagues-bk"], predict: ["Beat the Model", "games-all-leagues-model"], both: ["the games", "games-all-leagues"] }[path];
  const end = { h: "Where to start", say: `That is all you need. Each game explains itself the first time you open it, and you can press the question mark any time to see it again. Press slash to search anything. Ready? Let's start with ${go[0]}.`,
    v: () => `<div class="xs xs11"><div class="xsearch"><svg class=ic><use href=#i-search></use></svg><span class="xtype">press  /</span></div><button type="button" class="btn" data-x="cta" data-to="${go[1]}">Take me to ${go[0]}</button></div>` };
  return [welcome, ...(path === "quiz" ? quiz : path === "predict" ? predict : [quiz[0], quiz[1], predict[0], predict[1]]), end];
}
const XX = { i: 0, t: 0, playing: true, voice: true, timer: null, spDone: false, dur: [], sc: [] };
const xDur = (s) => Math.max(5, s.say.split(/\s+/).length / 2.9 + 1);
function startTour(path) {
  closeTour(); XX.i = 0; XX.t = 0; XX.playing = true; XX.sc = buildScenes(path || "both", prof().nick || ""); XX.dur = XX.sc.map(xDur); XX.voice = XX.voice; AIVoice.preload();
  const el = document.createElement("div"); el.id = "xp"; el.className = "xp"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Guided tour"); document.body.appendChild(el); xScene(); XX.timer = setInterval(xTick, 100);
}
function closeTour() { clearInterval(XX.timer); XX.timer = null; AIVoice.stop(); try { speechSynthesis.cancel(); } catch (e) { /* no speech */ } const el = $("#xp"); if (el) el.remove(); try { localStorage.setItem("bkn_tour", "1"); } catch (e) { /* blocked */ } }
function xSpeak() {
  try { speechSynthesis.cancel(); } catch (e) { /* no device voice */ } AIVoice.stop(); XX.spDone = !XX.voice; if (!XX.voice) { XX.spDone = true; return; }
  const i0 = XX.i; AIVoice.play(XX.sc[XX.i].say, { voice: Mascot.voice(), paused: !XX.playing, onend: () => { if (XX.i === i0) XX.spDone = true; } }).then((a) => { if (!a && XX.i === i0) xSpeakDevice(); });
}
function xSpeakDevice() { XX.spDone = true; }   /* a line with no recorded clip stays on screen without the device voice */

function xScene() {
  const el = $("#xp"); if (!el) return; const s = XX.sc[XX.i], total = XX.sc.length;
  el.innerHTML = `<div class="xframe"><div class="xtop"><span class="xmas">${Mascot.face(XX.i === total - 1 ? "wow" : "happy")}<b>${Mascot.name()}</b></span><span class="label">${XX.i + 1} of ${total} · ${esc(s.h)}</span><span class="spacer"></span><button type="button" class="chip" data-x="voice" aria-pressed="${XX.voice}">Voice</button><button type="button" class="chip" data-x="close">Close</button></div><div class="xstage" key="${XX.i}">${s.v()}</div><div class="xcap">${esc(s.say)}</div><div class="xctl"><button type="button" class="btn ghost" data-x="prev" ${XX.i ? "" : "disabled"}>Back</button><button type="button" class="btn" data-x="play">${XX.playing ? "Pause" : "Play"}</button><button type="button" class="btn ghost" data-x="next">${XX.i === total - 1 ? "Finish" : "Next"}</button></div><div class="xprog">${XX.sc.map((_, k) => `<i class="${k < XX.i ? "done" : k === XX.i ? "now" : ""}" data-x="go" data-k="${k}"><b style="width:${k < XX.i ? 100 : 0}%"></b></i>`).join("")}</div></div>`;
  XX.t = 0; xSpeak();
}
function xTick() {
  if (!XX.playing || !$("#xp")) return; XX.t += 0.1; const d = XX.dur[XX.i], bar = document.querySelector(".xprog i.now b"); if (bar) bar.style.width = Math.min(100, (XX.t / d) * 100) + "%";
  if (XX.t >= d && XX.spDone) xGo(XX.i + 1);
}
function xGo(k) { if (k >= XX.sc.length) { closeTour(); Snd.win(); return; } XX.i = Math.max(0, k); xScene(); }
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-x]"); if (!b || !$("#xp")) return; const a = b.dataset.x; Snd.tick();
  if (a === "close") closeTour(); else if (a === "next") xGo(XX.i + 1); else if (a === "prev") xGo(XX.i - 1); else if (a === "go") xGo(+b.dataset.k); else if (a === "cta") { const to = b.dataset.to; closeTour(); go(to); }
  else if (a === "play") { XX.playing = !XX.playing; b.textContent = XX.playing ? "Pause" : "Play"; XX.playing ? AIVoice.resume() : AIVoice.pause(); try { XX.playing ? speechSynthesis.resume() : speechSynthesis.pause(); } catch (err) { /* no speech */ } }
  else if (a === "voice") { XX.voice = !XX.voice; b.setAttribute("aria-pressed", XX.voice); if (!XX.voice) { AIVoice.stop(); try { speechSynthesis.cancel(); } catch (err) { /* none */ } XX.spDone = true; } else xSpeak(); } });
addEventListener("keydown", (e) => { if ($("#xp")) { if (e.key === "Escape") closeTour(); else if (e.key === "ArrowRight") xGo(XX.i + 1); else if (e.key === "ArrowLeft") xGo(XX.i - 1); else if (e.key === " " && !/BUTTON/.test(e.target.tagName)) { e.preventDefault(); const p = document.querySelector('[data-x="play"]'); if (p) p.click(); } } });
function offerTour() {
  const nm = prof().nick, el = document.createElement("div"); el.id = "xoffer"; el.className = "xoffer";
  el.innerHTML = `<div class="tcard"><b>${nm ? "Welcome back, " + esc(nm) : "Welcome to ballknowledge"}</b><p>What would you like to do first? Pick one and I'll show you around in about a minute. Every game also explains itself the first time you open it.</p><div class="xpath"><button type="button" class="btn" data-o="quiz">Test my basketball knowledge</button><button type="button" class="btn" data-o="predict">Predict games</button><button type="button" class="btn ghost" data-o="both">A bit of both</button></div><div class="row" style="justify-content:flex-end;margin-top:8px"><button type="button" class="btn ghost" data-o="skip">Skip, I'll explore</button></div></div>`; document.body.appendChild(el);
  el.addEventListener("click", (e) => { const b = e.target.closest("[data-o]"); if (!b) return; el.remove(); if (b.dataset.o === "skip") { try { localStorage.setItem("bkn_tour", "1"); } catch (err) { /* blocked */ } } else startTour(b.dataset.o); });
}
function finishSplash() {
  paintStadium(document.documentElement.getAttribute("data-league") || "HOME"); teamTheme();
  const sp = $("#splash"); if (!sp) return; const cur = window.__spCur || { id: "none", rar: "Common" }, p = prof(), cat = splashCatalog(); p.splashes = { ...(p.splashes || {}) };
  const fresh = !p.splashes[cur.id]; p.splashes[cur.id] = (p.splashes[cur.id] || 0) + 1;
  const n = cat.filter((c) => p.splashes[c.id]).length; if (fresh) { const el = $("#spNew"); if (el) el.textContent = `New! ${n} of ${cat.length}`; }
  if (cur.rar === "Secret" || (p.ach && p.ach.splash_secret)) { if (!ACH.some((a) => a[0] === "splash_secret")) { ACH.push(["splash_secret", "The Notebook", "Found the secret loading screen"]); ACH_TIER.splash_secret = 4; ACH_ICON.splash_secret = "star"; } if (cur.rar === "Secret") { unlock(p, "splash_secret"); setTimeout(() => { try { toast("<b>Secret found</b><br>The Notebook"); Snd.win(); confetti(); } catch (e) { /* ok */ } }, 1500); } }
  if (cur.rar === "Rare" || cur.rar === "Legendary") unlock(p, "splash_rare"); if (cur.rar === "Legendary") unlock(p, "splash_leg"); if (n >= 10) unlock(p, "splash_10"); if (n >= cat.length) unlock(p, "splash_all"); saveProf(p);
  const hide = () => { sp.classList.add("out"); setTimeout(() => { sp.remove(); themePick(() => { try { if (!localStorage.getItem("bkn_tour") && !location.hash.replace("#", "")) offerTour(); else if (localStorage.getItem("bkn_tour") && localStorage.getItem("bkn_ver") !== CHANGELOG.v) showWhatsNew(); } catch (e) { /* blocked */ } }); }, 700); };
  $("#spSkip").addEventListener("click", hide); sp.addEventListener("click", hide);
  setTimeout(hide, Math.max(300, (cur.rar === "Common" ? 2300 : cur.rar === "Secret" ? 10500 : 3600) - (performance.now() - (window.__spT0 || 0))));
}
function openProfile() { Snd.tick(); go("profile"); }
function openProfileOld() {
  const p = prof(), lv = levelOf(p.xp), st = dayStreak(p), pl = allPlays(), t = totals(pl), won = Object.keys(p.ach).length;
  const pct2 = lv.to ? Math.min(100, ((p.xp - lv.from) / (lv.to - lv.from)) * 100) : 100;
  const ach = ACH.map(([id, n, d]) => `<div class="achv ${p.ach[id] ? "on" : ""}" title="${esc(d)}"><b><svg class='ic ${p.ach[id] ? "fill" : ""}'><use href='#i-star'/></svg></b><span>${esc(n)}</span><small>${esc(d)}</small></div>`).join("");
  modal(`<h2 style="font-size:28px">${esc(p.nick || "Your profile")}</h2>
    <div class="label" style="margin-top:6px">${esc(lv.name)} · ${p.xp} XP${lv.next ? ` · next: ${esc(lv.next)} at ${lv.to}` : " · top rank"}</div>
    <div class="xpbar"><i style="width:${pct2}%"></i></div>
    <div class="tiles"><div class="tile"><b class="num">${st}</b><small>days in a row (best ${bestDayStreak(p)})</small></div><div class="tile"><b class="num">${t.you} v ${t.mod}</b><small>points: you v model</small></div><div class="tile"><b class="num">${won}/${ACH.length}</b><small>achievements</small></div></div>
    <h3 style="font-size:18px;margin:16px 0 8px">Streak calendar</h3>${calendarHTML(p)}<div class="fine">Each square is a day; brighter means more games played. Last 12 weeks.</div>
    <h3 style="font-size:18px;margin:16px 0 8px">Achievements</h3><div class="achgrid">${ach}</div>
    <h3 style="font-size:18px;margin:16px 0 8px">Account</h3>${accountHTML()}
    <h3 style="font-size:18px;margin:16px 0 8px">Leaderboards</h3>${boardSettingsHTML(p)}
    <div class="row" style="margin-top:16px"><button class="btn" id="shareRecord" type="button">Share my record</button><button class="btn ghost" id="modalClose" type="button">Close</button></div>`);
}
function boardSettingsHTML(p) {
  if (Board.mode === "none") return `<p class="fine">The leaderboard needs the online database, which isn't connected in this build. Your results stay on this device.</p>`;
  if (!Account.signedIn) return `<p class="fine">Sign in or create a free account to appear on the leaderboard.</p>`;
  return `<p class="fine">Your display name, shown in lobbies and on the leaderboard. Your progress saves to your account automatically.</p><div class="row"><input id="nickIn" maxlength="16" placeholder="Nickname (3 to 16 letters or numbers)" value="${esc(p.nick || "")}" aria-label="Nickname"><button class="btn" id="nickSave" type="button">${p.nick ? "Update nickname" : "Save nickname"}</button>${p.board ? '<button class="btn ghost" id="nickLeave" type="button">Stop sharing scores</button>' : ""}</div><div class="fine" id="nickMsg"></div>`;
}
function modal(html) {
  let m = $("#modal"); if (!m) { m = document.createElement("div"); m.id = "modal"; m.className = "modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); document.body.appendChild(m); }
  m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; m.querySelector("button, input")?.focus(); Snd.tick();
}
/* ---------- first visit: pick a look (change it later in your profile, under Appearance) ---------- */
const TP_PRE = DATA.sport === "nba" ? "bkn_" : "bk_";
const TP_OPTS = DATA.sport === "nba"
  ? [["classic", "dark", "Arena night", "Glow, effects and the arena after dark", ["#16110c", "#ff8a3d", "#2a1d14"]], ["classic", "light", "Daylight court", "Bright, warm and easy on the eyes", ["#f6efe6", "#b5521b", "#ffffff"]], ["minimal", "dark", "Minimal dark", "Calm and quiet, no effects", ["#121417", "#9aa4b2", "#1c2026"]], ["minimal", "light", "Minimal light", "Clean and simple", ["#fafafa", "#555555", "#ececec"]]]
  : [["flood", "dark", "Floodlit", "A night match: light beams and a flying ball", ["#0b1033", "#f2c14e", "#1b2450"]], ["classic", "dark", "Stadium", "The glow and the stadium backdrop", ["#0a1a12", "#1fa463", "#12281c"]], ["classic", "light", "Matchday", "Bright, like an afternoon kickoff", ["#f4f1ea", "#7a5c12", "#ffffff"]], ["minimal", "dark", "Minimal dark", "Calm and quiet, no effects", ["#121417", "#9aa4b2", "#1c2026"]], ["minimal", "light", "Minimal light", "Clean and simple", ["#fafafa", "#555555", "#ececec"]]];
function themePick(done) {
  let picked = "1"; try { picked = localStorage.getItem(TP_PRE + "picked"); } catch (e) { /* storage blocked: skip */ }
  if (picked || /^#(join|challenge)/.test(location.hash)) return done();
  window.__tpDone = done;
  modal(`<h2 style="font-size:26px">Pick your look</h2><p class="fine" style="margin-top:0">Tap one to preview it. You can change it any time in Settings (the gear at the top).</p><div class="tpgrid">${TP_OPTS.map(([, md, n, d, c], i) => `<button type="button" class="tpopt" data-tp="${i}" aria-pressed="false"><span class="tpprev ${md}" style="--a:${c[0]};--b:${c[1]};--c:${c[2]}"><i></i><i></i><i></i></span><b>${n}</b><small>${d}</small></button>`).join("")}</div>${`<h3 style="margin:16px 0 0">Pick your sidekick</h3><p class="fine" style="margin:2px 0 0">They cheer, groan and narrate in their own voice.</p><div class="tpgrid">${Mascot.mine.map((k) => `<button type="button" class="tpopt mscopt" data-msc="${k}" aria-pressed="${Mascot.id() === k}"><span class="tpprev">${MASCOT_SVG[k]("happy")}</span><b>${MASCOTS[k].name}</b><small>${MASCOTS[k].blurb}</small></button>`).join("")}</div>`}<label class="tpauto"><input type="checkbox" id="tpAuto"> Switch between light and dark with my device</label><div class="row" style="margin-top:12px"><button class="btn" id="tpGo" type="button">Let's go</button></div>`);
}
function tpSet(k, v) { try { localStorage.setItem(TP_PRE + k, v); } catch (e) { /* blocked */ } try { const pf = prof(); pf.look = { ...(pf.look || {}), [k]: v }; saveProf(pf); } catch (e) { /* profile not ready */ } }
document.addEventListener("click", (e) => {
  const o = e.target.closest && e.target.closest("[data-tp]"); if (o) { const [st, md] = TP_OPTS[+o.dataset.tp]; tpSet("style", st); tpSet("theme", document.getElementById("tpAuto")?.checked ? "auto" : md); applyAppearance(); document.querySelectorAll("[data-tp]").forEach((x) => x.setAttribute("aria-pressed", x === o)); Snd.tick(); return; }
  const ms = e.target.closest && e.target.closest("[data-msc]"); if (ms) { tpSet("mascot", ms.dataset.msc); document.querySelectorAll("[data-msc]").forEach((x) => x.setAttribute("aria-pressed", x === ms)); Mascot.hello(); return; }
  if (e.target.id === "tpGo") { if (document.getElementById("tpAuto")?.checked) { tpSet("theme", "auto"); applyAppearance(); } try { localStorage.setItem(TP_PRE + "picked", "1"); } catch (er) { /* blocked */ } closeModal(); const d = window.__tpDone; window.__tpDone = null; setTimeout(() => Mascot.hello(), 500); if (d) d(); }
});
const closeModal = () => { const m = $("#modal"); if (m) m.hidden = true; };
addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

/* ================= Share cards (drawn on a canvas, saved as a picture) ================= */
const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
async function cardCanvas(kind, d) {
  const W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d"), lg = d.lg || S.code || "E0", p = PAL[lg] || PAL.E0, L = LG[lg] || LG.E0;
  const dispFont = p.display.split(",")[0].replace(/"/g, "");
  try { await Promise.all([document.fonts.load(`800 80px "${dispFont}"`), document.fonts.load('700 30px "DM Sans"'), document.fonts.load('700 24px "JetBrains Mono"')]); } catch (e) { /* fall back to system fonts */ }
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, p.bg); bg.addColorStop(1, p.surface); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.85, 120, 0, W * 0.85, 120, 700); glow.addColorStop(0, p.glow + "88"); glow.addColorStop(1, p.glow + "00"); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  const glow2 = g.createRadialGradient(80, H - 100, 0, 80, H - 100, 600); glow2.addColorStop(0, p.accent + "33"); glow2.addColorStop(1, p.accent + "00"); g.fillStyle = glow2; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 30; i++) { const x = (hash(`s${i}`) % W), y = (hash(`t${i}`) % H), r = 2 + (hash(`u${i}`) % 5); g.fillStyle = (i % 3 ? p.glow : p.accent) + "55"; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); }
  const text = (s, x, y, font, color, align = "left") => { g.font = font; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); };
  text("BALLKNOWLEDGE", 70, 100, '700 28px "JetBrains Mono"', p.accent);
  const logo = await loadImg(L.logo); if (logo) { g.save(); rrect(g, W - 190, 52, 120, 120, 28); g.fillStyle = "#ffffffee"; g.fill(); g.clip(); const k = Math.min(100 / logo.width, 100 / logo.height); g.drawImage(logo, W - 130 - (logo.width * k) / 2, 112 - (logo.height * k) / 2, logo.width * k, logo.height * k); g.restore(); } else text(L.name.toUpperCase(), W - 70, 100, '700 28px "JetBrains Mono"', p.muted, "right");
  const fit = (str, size, max, weight = 800) => { let px = size; g.font = `${weight} ${px}px "${dispFont}", sans-serif`; while (px > 30 && g.measureText(str).width > max) { px -= 6; g.font = `${weight} ${px}px "${dispFont}", sans-serif`; } return `${weight} ${px}px "${dispFont}", sans-serif`; };
  g.save(); g.translate(330, 440); g.globalAlpha = 0.13; g.fillStyle = p.accent; for (let k = 0; k < 18; k++) { g.rotate((Math.PI * 2) / 18); g.beginPath(); g.moveTo(0, 0); g.lineTo(-40, -720); g.lineTo(40, -720); g.closePath(); g.fill(); } g.restore();   /* light rays behind the big number */
  text(d.title, 70, 250, fit(d.title, 96, W - 140), p.ink);
  text(d.big, 70, 520, fit(String(d.big), 270, W - 140), p.accent);
  text(d.sub, 70, 600, '700 36px "DM Sans", sans-serif', p.muted);
  let y = 680;
  if (d.rows) {
    for (const r of d.rows) { rrect(g, 70, y, W - 140, 96, 24); g.fillStyle = p.surface + "dd"; g.fill(); g.strokeStyle = p.glow + "66"; g.lineWidth = 2; g.stroke();
      const hi = await loadImg(CREST[r.home]), ai = await loadImg(CREST[r.away]);
      if (hi) g.drawImage(hi, 96, y + 16, 64, 64); if (ai) g.drawImage(ai, W - 160, y + 16, 64, 64);
      text(r.home, hi ? 176 : 96, y + 62, '700 32px "DM Sans", sans-serif', p.ink); text(r.away, ai ? W - 176 : W - 96, y + 62, '700 32px "DM Sans", sans-serif', p.ink, "right");
      text(r.score, W / 2, y + 62, '800 36px "JetBrains Mono"', p.accent, "center"); text(r.you, W / 2 - 150, y + 62, '800 34px "JetBrains Mono"', r.youOk ? "#5EE6A8" : "#FF6B7F", "center"); y += 112; }
  }
  if (d.tiles) { const tw = (W - 140 - 40) / 3; d.tiles.forEach(([v, l], k) => { const x = 70 + k * (tw + 20); rrect(g, x, y, tw, 190, 26); g.fillStyle = p.surface + "ee"; g.fill(); text(v, x + 28, y + 100, `800 64px "${dispFont}", sans-serif`, p.ink); text(l, x + 28, y + 150, '500 26px "DM Sans", sans-serif', p.muted); }); y += 220; }
  if (d.line) text(d.line, 70, Math.max(y + 40, 1180), '700 34px "DM Sans", sans-serif', p.ink);
  const pr = prof(), av = pr.avatar || "";   /* your picture: a player, a crest, an emoji or your initial, in a ring */
  g.save(); g.beginPath(); g.arc(120, 1272, 46, 0, 6.283); g.fillStyle = p.surface; g.fill(); g.lineWidth = 5; g.strokeStyle = p.accent; g.stroke(); g.clip();
  let avImg = null; if (av.startsWith("h:")) { const h = (DATA.hero || []).find((x) => x.n === av.slice(2)); avImg = h ? await loadImg(h.img) : null; } else if (av.startsWith("c:")) avImg = await loadImg(CREST[av.slice(2)]);
  if (avImg) { const k = Math.max(92 / avImg.width, 92 / avImg.height); g.drawImage(avImg, 120 - (avImg.width * k) / 2, 1272 - (avImg.height * k) / 2, avImg.width * k, avImg.height * k); }
  else text(av.startsWith("e:") ? av.slice(2) : (pr.nick || "P")[0].toUpperCase(), 120, 1290, `800 48px "${dispFont}", sans-serif`, p.ink, "center");
  g.restore();
  text(`${pr.nick || "Player"} · ${levelOf(pr.xp).name}`, 186, 1290, '700 30px "DM Sans", sans-serif', p.ink);
  try {   /* your sidekick, with a line, in the bottom corner */
    if (Mascot.mode() !== "off") { const id = Mascot.id(), svg = MASCOT_SVG[id]("happy").replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" '), url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), mi = await loadImg(url);
      if (mi) { g.drawImage(mi, W - 270, 960, 210, 210); URL.revokeObjectURL(url);
        const L2 = (MASCOTS[id].lines || {}).best || [], ln = L2.length ? L2[hash(String(d.big)) % L2.length] : ""; if (ln && ln.length < 70) { g.font = '700 26px "DM Sans", sans-serif'; const words = ln.split(" "), lines = []; let cur = ""; words.forEach((w2) => { if (g.measureText(cur + " " + w2).width > 380 && cur) { lines.push(cur); cur = w2; } else cur = cur ? cur + " " + w2 : w2; }); lines.push(cur);
          const bh = 30 + lines.length * 34, bx = W - 300 - 420, by = 990; rrect(g, bx, by, 420, bh, 22); g.fillStyle = p.surface + "f2"; g.fill(); g.strokeStyle = p.accent; g.lineWidth = 3; g.stroke(); lines.forEach((t2, k) => text(t2, bx + 22, by + 44 + k * 34, '700 26px "DM Sans", sans-serif', p.ink)); } } }
  } catch (e) { /* no sidekick on this card */ }
  text(location.host ? location.host.replace(/^www\./, "") : "ballknowledge", W - 70, 1290, '500 26px "JetBrains Mono"', p.muted, "right");
  return cv;
}
async function showCard(kind, d) {
  Snd.tick(); const cv = await cardCanvas(kind, d), url = cv.toDataURL("image/png");
  modal(`<h2 style="font-size:24px">Your card</h2><img class="cardimg" src="${url}" alt="Result card"><div class="row" style="margin-top:12px"><button class="btn" id="cardSave" type="button">Save picture</button><button class="btn ghost" id="cardShare" type="button">Share</button><button class="btn ghost" id="modalClose" type="button">Close</button></div><div class="fine" id="cardMsg">If saving is blocked on your device, press and hold the picture to save it.</div>`);
  window.__card = { cv, name: `beat-the-model-${kind}.png`, text: d.share || `${d.title}: ${d.big}` };
}
async function saveCard() {
  const { cv, name } = window.__card, blob = await new Promise((r) => cv.toBlob(r, "image/png")); let ok = false;
  try { const dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; if (dl) { await dl.save({ filename: name, data: blob }); ok = true; } } catch (e) { /* use the normal download */ }
  if (!ok) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const m = $("#cardMsg"); if (m) m.textContent = "Saved (check your downloads).";
}
async function shareCard() {
  const { cv, name, text } = window.__card, blob = await new Promise((r) => cv.toBlob(r, "image/png"));
  try { const f = new File([blob], name, { type: "image/png" }); if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], text }); return; } } catch (e) { /* fall through */ }
  try { await navigator.clipboard.writeText(text); const m = $("#cardMsg"); if (m) m.textContent = "Sharing pictures isn't supported here, so the text was copied instead."; } catch (e) { const m = $("#cardMsg"); if (m) m.textContent = text; }
}
function recordCard() {
  const pl = allPlays(), t = totals(pl), st = streaks(pl), p = prof(), top = Object.entries(p.leagues).sort((a, b) => b[1] - a[1])[0];
  return showCard("record", { lg: top ? top[0] : S.code, title: "My record", big: `${t.you} v ${t.mod}`, sub: `points against the model over ${t.n} match${t.n === 1 ? "" : "es"}`, tiles: [[String(st.best), "best streak"], [levelOf(p.xp).name, "rank"], [`${Object.keys(p.ach).length}/${ACH.length}`, "achievements"]], line: t.you > t.mod ? "Ahead of the model." : t.you === t.mod ? "Level with the model." : "The model leads, for now.", share: `My ballknowledge record: ${t.you} points to the model's ${t.mod}. Think you can do better?` });
}

/* ================= Global leaderboards: one adapter, two backends ================= */
const Board = {
  mode: "none", cfg: null,
  init() { if (DATA.board && DATA.board.url && DATA.board.key) { this.mode = "rest"; this.cfg = DATA.board; } },
  headers() { return { apikey: this.cfg.key, Authorization: `Bearer ${this.cfg.key}`, "Content-Type": "application/json", "Accept-Profile": "nba", "Content-Profile": "nba" }; },
  async submit(e) {
    const p = prof(); if (this.mode !== "rest" || !Account.signedIn) return; if (!p.nick) await ensureNick();
    const t = await Account.token(); if (!t) return;
    const row = { game: e.game, league: !e.league || e.league === "ALL" ? "all" : e.league, score: e.score, week: weekId(), day: e.day || todayKey(), code: e.code || null };
    try { await fetch(`${this.cfg.url}/rest/v1/results`, { method: "POST", headers: { ...Account.hdr(t), Prefer: "return=minimal" }, body: JSON.stringify(row) }); } catch (err) { /* offline: the score stays local */ }
  },
  async top(game, league, period, code) {
    if (this.mode !== "rest") return null;
    try { const r = await fetch(`${this.cfg.url}/rest/v1/rpc/leaderboard`, { method: "POST", headers: this.headers(), body: JSON.stringify({ p_game: game, p_league: league, p_period: period, p_week: weekId(), p_day: todayKey(), p_code: code || "" }) }); if (!r.ok) return null; return await r.json(); } catch (err) { return null; }
  },
};
const BOARD_GAMES = [["xp", "Overall XP", "XP earned"], ["call", "Call it", "points ahead of the model"], ["daily", "Daily 5", "right out of 5"], ["matchday", "Matchday", "results right"], ["upset", "Spot the upset", "best streak"], ["table", "Guess the table", "tables that beat the model"], ["hol", "Higher or lower", "best streak"], ["who", "Who am I?", "points"], ["career", "Career path", "points"], ["club", "Name that team", "points"], ["blur", "Logo blur", "points"], ["finish", "Where did they finish?", "points"], ["pvalue", "Market value streak", "best streak"], ["number", "Write your number", "points"], ["ttt", "Tic-tac-toe", "wins"], ["scramble", "Scramble", "points"], ["xi", "Starting XI", "best score"], ["iconic", "Who did it", "best score"], ["rapid", "Rapid fire", "best run, results right"], ["bracket", "Bracket buster", "best points"]];

/* ================= Ranked: Elo, public lobbies, leaderboard ================= */
const RK_GAMES = [["who", "Who am I?"], ["career", "Career path"], ["club", "Name that team"], ["blur", "Logo blur"], ["finish", "Where did they finish?"], ["number", "Market value"], ["ttt", "Basketball tic-tac-toe"], ["roulette", "Team roulette"]];
const rkIcon = (cls) => `<svg class='ic rk rk-${cls}'><use href='#i-rank'/></svg>`;
const RANKS = [[1400, "Legend", rkIcon("legend")], [1250, "Diamond", rkIcon("diamond")], [1150, "Platinum", rkIcon("platinum")], [1050, "Gold", rkIcon("gold")], [950, "Silver", rkIcon("silver")], [0, "Bronze", rkIcon("bronze")]];
const rankOf = (elo) => { const r = RANKS.find(([min]) => elo >= min) || RANKS[RANKS.length - 1]; return { name: r[1], icon: r[2] }; };
const rankTag = (elo) => `<span class="rflair" title="${rankOf(elo).name}">${rankOf(elo).icon}</span>`;
const rkName = (g) => (RK_GAMES.find((x) => x[0] === g) || [, g])[1];
const Ranked = {
  elo: 1000, games: 0, wins: 0, lt: null, list: null, timer: null,
  async rpc(fn, args) {
    if (Board.mode !== "rest") return null;
    try { const t = await Account.token(); const r = await fetch(`${Board.cfg.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: t ? Account.hdr(t) : Board.headers(), body: JSON.stringify(args || {}) }); if (!r.ok) return null; const txt = await r.text(); return txt ? JSON.parse(txt) : true; } catch (e) { return null; }
  },
  /* like rpc, but says what went wrong instead of returning null: { ok, data, why } */
  async rpcx(fn, args) {
    if (Board.mode !== "rest") return { ok: false, why: "This build has no database connection." };
    try { const t = await Account.token(); if (!t) return { ok: false, why: "Please sign in first." }; const r = await fetch(`${Board.cfg.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: Account.hdr(t), body: JSON.stringify(args || {}) }); const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : true; } catch (e) { j = txt; }
      if (!r.ok) return { ok: false, why: r.status === 404 || (j && j.code === "PGRST202") ? `The database function ${fn} is missing. Run its schema file in Supabase.` : `The database refused it (${r.status}${j && j.message ? ": " + j.message : ""}).` };
      return { ok: true, data: j }; } catch (e) { return { ok: false, why: "Could not reach the server." }; }
  },
  async refresh() { const r = await this.rpc("my_rating"); if (r && r[0]) { this.elo = r[0].elo; this.games = r[0].games; this.wins = r[0].wins; } return this.elo; },
  startLobby(code, game, diff) { this.stopLobby(true); const go = () => this.rpc("lobby_ping", { p_code: code, p_game: game, p_diff: diff }); go(); this.lt = setInterval(go, 15000); },
  stopLobby(quiet) { if (this.lt) { clearInterval(this.lt); this.lt = null; if (!quiet) this.rpc("lobby_close"); } },
  async report(mid, opp, res, game) {
    const before = this.elo; await this.rpc("report_match", { p_match: mid, p_opp: opp, p_result: res, p_game: game || null });
    setTimeout(async () => { const now = await this.refresh(); if (now !== before || res === "draw") { toast(`Rating ${now} (${now >= before ? "+" : ""}${now - before})`); award("ranked_first"); if (res === "win") award("ranked_win"); if (this.games >= 5) award("ranked5"); if (now >= 1200) award("elo1200"); } else toast("Waiting for your opponent to confirm the result"); }, 2500);
  },
};
/* ================= Two accounts on one device (experiment) =================
   Player 2 signs in with email and password; the password goes straight to the database's sign-in and nothing about player 2 is stored on the device. At the end of a same-device
   two-player game each account reports the result with its own sign-in, so both ratings move exactly like an online match. */
const Dual = {
  p2: null, game: null,
  async rpc2(fn, args) { try { const r = await fetch(`${Board.cfg.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: Board.cfg.key, Authorization: `Bearer ${this.p2.token}`, "Content-Type": "application/json" }, body: JSON.stringify(args || {}) }); const x = await r.text(); return r.ok ? (x ? JSON.parse(x) : true) : null; } catch (e) { return null; } },
  async signIn(email, pw) {
    try { const r = await fetch(`${Board.cfg.url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: Board.cfg.key, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pw }) }); const j = await r.json(); if (!r.ok || !j.access_token) return { error: j.error_description || j.msg || "Could not sign in." };
      if (Account.session && j.user && j.user.id === Account.session.user.id) return { error: "That is the account you are already using. Sign in with a different one." };
      this.p2 = { uid: j.user.id, token: j.access_token, nick: "Player 2", elo: 1000 };
      const pr = await fetch(`${Board.cfg.url}/rest/v1/profiles?select=nick`, { headers: { apikey: Board.cfg.key, Authorization: `Bearer ${j.access_token}` } }); const pj = await pr.json(); if (pj && pj[0]) this.p2.nick = pj[0].nick; else { this.p2 = null; return { error: "That account has no display name yet. Sign in to it once on its own and pick a name." }; }
      const rt = await this.rpc2("my_rating"); if (rt && rt[0]) this.p2.elo = rt[0].elo; return { ok: true }; } catch (e) { return { error: "Could not reach the server." }; }
  },
  out() { this.p2 = null; this.game = null; S.dual = false; },
  async finish(sc) {
    const p1 = Account.session.user.id, p2 = this.p2.uid, mid = `dual-${Date.now().toString(36)}-${p1.slice(0, 4)}${p2.slice(0, 4)}`, r1 = sc[0] > sc[1] ? "win" : sc[0] < sc[1] ? "loss" : "draw", r2 = r1 === "win" ? "loss" : r1 === "loss" ? "win" : "draw", b1 = Ranked.elo, b2 = this.p2.elo;
    const a = await Ranked.rpcx("report_match", { p_match: mid, p_opp: p2, p_result: r1, p_game: this.game }); const b = await this.rpc2("report_match", { p_match: mid, p_opp: p1, p_result: r2, p_game: this.game });
    await Ranked.refresh(); const rt = await this.rpc2("my_rating"); if (rt && rt[0]) this.p2.elo = rt[0].elo;
    if (a.ok && b === "applied") { toast(`Rated: ${prof().nick || "Player 1"} ${Ranked.elo} (${Ranked.elo - b1 >= 0 ? "+" : ""}${Ranked.elo - b1}) · ${this.p2.nick} ${this.p2.elo} (${this.p2.elo - b2 >= 0 ? "+" : ""}${this.p2.elo - b2})`); if (r1 === "win") award("ranked_win"); award("ranked_first"); } else toast(`The rating did not move (${a.ok ? String(b) : a.why}). Both accounts must be signed in and rated games need schema_v2 or newer.`);
  },
};
function dualCard() {
  const d = Dual.p2;
  if (!d) return `<div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="font-size:22px">Two accounts, one device <span class="chip2">experiment</span></h3></div><p class="fine">Hand the device to a friend: they sign in with their own account, you play a two-player game here, and both ratings move as in an online match. Their password is only sent to the sign-in and is not kept.</p><div class="row" style="margin-top:8px"><input id="d2Mail" type="email" autocomplete="off" placeholder="Player 2 email" aria-label="Player 2 email"><input id="d2Pw" type="password" autocomplete="off" placeholder="Player 2 password" aria-label="Player 2 password"><button class="btn" id="d2In" type="button">Sign in player 2</button></div><div class="fine" id="d2Msg"></div></div>`;
  return `<div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="font-size:22px">Two accounts, one device <span class="chip2">experiment</span></h3><button class="btn ghost" id="d2Out" type="button">Sign player 2 out</button></div><p class="fine">Player 1 is <b>${esc(prof().nick || "you")}</b> (Elo ${Ranked.elo}), player 2 is <b>${esc(d.nick)}</b> (Elo ${d.elo}). Player 1 is X and goes first.</p><div class="row" style="margin-top:8px"><select id="d2Game" aria-label="Game">${[["ttt", "Basketball tic-tac-toe"], ["who", "Who am I?"], ["career", "Career path"], ["club", "Name that team"], ["blur", "Logo blur"], ["scramble", "Scramble"]].map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select><button class="btn" id="d2Go" type="button">Start rated game</button></div></div>`;
}
function rankedEnd(ref, sc) {
  if (S.dual && Dual.p2) { if (Net.lastRef === ref) return; Net.lastRef = ref; Dual.finish(sc); return; }
  if (Net.role !== "host" || !Net.ranked || !Net.guest || !Net.guest.uid || Net.lastRef === ref || !Account.signedIn) return; Net.lastRef = ref;
  const mid = `${Net.code}-${Date.now().toString(36)}`, hostRes = sc[0] > sc[1] ? "win" : sc[0] < sc[1] ? "loss" : "draw";
  Net.send({ k: "result", mid, game: Net.game, hostUid: Account.session.user.id, guestRes: hostRes === "win" ? "loss" : hostRes === "loss" ? "win" : "draw" });
  Ranked.report(mid, Net.guest.uid, hostRes, Net.game);
}
async function ensureNick() {   /* one name everywhere: adopt the master (football) name, or ask you to pick one; never a name made from your email without asking */
  if (!Account.signedIn || Board.mode !== "rest") return; const t = await Account.token(); if (!t) return;
  Season.reward();
  const master = await NameSync.master(Board.cfg, t), p = prof();
  if (master) { if (p.nick !== master) { p.nick = master; p.board = true; store.items.profile = p; saveLocal(); paintProfileBtn(); } const mine = await NameSync.own(Board.cfg, t, "nba"); if (mine !== master) await Account.setNick(master); return; }
  NameSync.ask(p.nick || NameSync.suggest(Account.session.user.email), async (n) => { const r = await Account.setNick(n); if (r && r.ok) { const q = prof(); q.nick = n; q.board = true; store.items.profile = q; saveProf(q); paintProfileBtn(); try { toast("Name saved: " + esc(n)); } catch (e) { /* no toast */ } } return r; });
}

function renderRanked() {
  clearInterval(Ranked.timer);
  if (Board.mode !== "rest") { $("#room").innerHTML = `<div class="card"><h2>Ranked</h2><p class="sub">Ranked play needs the online database, which is not connected in this build.</p></div>`; return; }
  if (!Account.signedIn) { $("#room").innerHTML = `<div class="card"><h2>Ranked</h2><p class="sub">Play real opponents, win Elo and climb the leaderboard. You need a free account so your rating belongs to you.</p><div class="row" style="margin-top:12px"><button class="btn" id="rkSign" type="button">Create an account or sign in</button></div></div>`; return; }
  const p = prof();
  $("#room").innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2>Ranked</h2><span class="rkbadge"><b class="num">${Ranked.elo}</b><small>${rankOf(Ranked.elo).icon} ${rankOf(Ranked.elo).name} · ${Ranked.games} played · ${Ranked.wins} won</small></span></div>
    <p class="sub">Quick match finds you an opponent near your rating. Or open a public lobby anyone can join, or go private with a code for friends (no rating change).</p>
    <div class="rkform"><label>Game<select id="rkGame">${RK_GAMES.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select></label><label>Difficulty<select id="rkDiff">${DIFFS.map(([v, n]) => `<option value="${v}" ${v === S.diff ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    <label>Who can join<select id="rkVis"><option value="pub">Public, anyone (ranked)</option><option value="priv">Private, with a code (friendly)</option></select></label><button class="btn ghost" id="rkCreate" type="button">Create lobby</button><button class="btn qmbtn" id="rkQuick" type="button"><span class="qmpulse"></span>Quick match</button></div>
    <div class="row" style="margin-top:10px"><input id="rkCode" maxlength="4" placeholder="Code" aria-label="Private room code" style="text-transform:uppercase;width:90px;font:700 18px var(--mono);padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink)"><button class="btn ghost" id="rkJoinCode" type="button">Join with a code</button></div></div>
    ${dualCard()}
    <div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="font-size:22px">Open lobbies</h3><span class="fine" id="rkStamp"></span></div><div id="rkList" class="lbx">${skelRows(3)}</div></div>`;
  paintLobbies(); Ranked.timer = setInterval(() => { if (S.hubGroup !== "ranked" || S.game || !$("#rkList")) { clearInterval(Ranked.timer); return; } paintLobbies(); }, 4000);
  Ranked.refresh().then(() => { const b = $(".rkbadge"); if (b) b.innerHTML = `<b class="num">${Ranked.elo}</b><small>${rankOf(Ranked.elo).icon} ${rankOf(Ranked.elo).name} · ${Ranked.games} played · ${Ranked.wins} won</small>`; });
}
async function paintLobbies() {
  const rows = await Ranked.rpc("open_lobbies"), box = $("#rkList"); if (!box) return;
  if (!rows) { box.innerHTML = '<div class="fine">Could not load lobbies. Check your connection.</div>'; return; }
  const me = prof().nick, list = rows.filter((r) => r.nick !== me || true);
  box.innerHTML = list.length ? list.map((r) => `<div class="lbrow lobby"><div data-pc="${esc(r.nick)}" tabindex="0" role="button" aria-haspopup="dialog">${avatarHTML(r.avatar, "xs", r.nick)}<b>${esc(r.nick)}</b>${badgesHTML(r.badges)} ${rankTag(r.elo)} <span class="fine num">Elo ${r.elo}</span></div><div class="fine">${esc(rkName(r.game))} · ${esc((DIFFS.find((d) => d[0] === r.diff) || [, r.diff])[1])}</div><button class="btn" data-rkjoin="${esc(r.code)}|${esc(r.game)}" type="button" ${r.nick === me ? "disabled" : ""}>${r.nick === me ? "Yours" : "Join"}</button></div>`).join("") : emptyState("<svg class=ic><use href=#i-seat></use></svg>", "No open lobbies", "Create one above and wait for someone to hop in.");
  const st = $("#rkStamp"); if (st) st.textContent = "updates every few seconds";
}
/* ---------- The finale: one end-of-game card for every game. A ribbon and a trophy (gold for a win or a good run, silver for a
   draw), the scores counting up with a crown on the winner, confetti, your sidekick's reaction and stat tiles. ---------- */
const FIN_TROPHY = (tone) => `<svg viewBox="0 0 64 64" class="fintro ${tone}" aria-hidden="true"><defs><linearGradient id="fg-${tone}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${tone === "gold" ? "#ffe27a" : tone === "silver" ? "#f2f4f8" : "#e7b07a"}"/><stop offset="1" stop-color="${tone === "gold" ? "#d49a12" : tone === "silver" ? "#9aa3b2" : "#a8642c"}"/></linearGradient></defs><path d="M18 8h28v12a14 14 0 0 1-28 0z" fill="url(#fg-${tone})" stroke="#0006" stroke-width="2"/><path d="M18 12H9a9 9 0 0 0 11 12M46 12h9a9 9 0 0 1-11 12" fill="none" stroke="url(#fg-${tone})" stroke-width="4" stroke-linecap="round"/><rect x="29" y="33" width="6" height="11" fill="url(#fg-${tone})"/><rect x="20" y="44" width="24" height="8" rx="2" fill="url(#fg-${tone})" stroke="#0006" stroke-width="2"/><path d="M27 15l5-3 5 3-2 6h-6z" fill="#fff" opacity=".55"/></svg>`;
function finale(o) {
  /* o: { label, verdict, players: [{ name, score, av }], winner: index | -1 (draw) | null (solo), good: solo run worth celebrating, extra, buttons } */
  const solo = o.winner == null, tone = solo ? (o.good ? "gold" : "bronze") : o.winner < 0 ? "silver" : "gold", party = solo ? o.good : o.winner >= 0;
  let line = ""; try { const L = MASCOTS[Mascot.id()].lines || {}, pool = (party ? L.best || L.over : L.over || L.miss) || []; line = pool.length ? pool[Math.floor(Math.random() * pool.length)] : ""; } catch (e) { /* no sidekick */ }
  const sk = (() => { try { return Mascot.mode() !== "off" ? Mascot.face(party ? "happy" : "sad") : ""; } catch (e) { return ""; } })();
  setTimeout(finaleFx, 30);
  return `<div class="fin ${party ? "won" : ""} ${solo ? "solo" : ""}"><div class="finrays" aria-hidden="true"></div>
    <div class="fintop">${FIN_TROPHY(tone)}<div class="finkick">${esc(o.label || "Full time")}</div><div class="finverdict">${o.verdict || ""}</div></div>
    <div class="finscores">${o.players.map((p, i) => `<div class="finp ${!solo && i === o.winner ? "win" : ""} ${!solo && o.winner >= 0 && i !== o.winner ? "lose" : ""}" style="--d:${200 + i * 160}ms">${!solo && i === o.winner ? '<span class="fincrown" aria-label="Winner">👑</span>' : ""}<span class="finav">${p.av || avatarHTML("", "lg", p.name)}</span><small>${esc(p.name)}</small><b class="num finnum" data-to="${Math.round(p.score) || 0}">0</b></div>`).join(!solo && o.players.length === 2 ? '<span class="finvs">vs</span>' : "")}</div>
    ${o.tiles && o.tiles.length ? `<div class="fintiles">${o.tiles.map(([v, l], i) => `<div class="fintile" style="--d:${500 + i * 90}ms"><b class="num">${v}</b><small>${esc(l)}</small></div>`).join("")}</div>` : ""}
    ${o.extra || ""}
    ${sk && line ? `<div class="finsk"><span class="finskface">${sk}</span><span class="finskbub"><b>${esc(Mascot.name())}</b>${esc(line)}</span></div>` : ""}
    <div class="row finbtns">${o.buttons || ""}</div></div>`;
}
function finaleFx() {
  const f = document.querySelector(".fin"); if (!f) return;
  f.querySelectorAll(".finnum").forEach((el, i) => { const to = +el.dataset.to || 0; if (typeof REDUCED !== "undefined" && REDUCED) { el.textContent = to.toLocaleString(); return; } setTimeout(() => { const t0 = performance.now(), d = 900 + Math.min(700, Math.abs(to) / 6); (function step(t) { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); if (!el.isConnected) return; el.textContent = Math.round(to * e).toLocaleString(); if (k < 1) requestAnimationFrame(step); else { el.classList.add("land"); try { Snd.tick(); } catch (x) { /* quiet */ } } })(t0); }, 260 + i * 160); });
  if (f.classList.contains("won")) setTimeout(() => { try { confetti(); Snd.win && Snd.win(); } catch (x) { /* quiet */ } }, 650);
}
/* ---------- Quick match: a real queue. It looks for an open public lobby for your game near your rating, widening the range the
   longer you wait (±100, then ±200, ±400, anyone). With none open it opens yours and keeps looking: when two people queue at the
   same moment, the one whose nickname sorts later joins the other, so they always meet instead of waiting side by side. ---------- */
const QM = { on: false };
function qmMount() {
  const c = Vs.me(), e = Vs.mount("waiting queue", `<div class="vsw"><div class="vsttl">Quick match · ${esc(rkName(QM.game))}</div><div class="vsstage qmstage"><i class="vsr"></i><i class="vsr"></i><i class="vsr"></i><i class="vsradar"></i><span class="qmorbit" id="qmOrbit"></span><span class="vsme">${avatarHTML(c.avatar, "xl", c.nick)}</span></div><div class="vsname">${esc(c.nick)}${badgesHTML(c.badges)} <span class="fine num">${Ranked.elo}</span></div><div class="qmclock num" id="qmClock">0:00</div><div class="vsttl" id="qmRange">Searching near your rating<i>.</i><i>.</i><i>.</i></div><div class="qmbar"><i id="qmBar"></i></div><div class="vsmsg" id="qmMsg">Looking for an open lobby…</div><button class="btn ghost" id="qmCancel" type="button">Leave the queue</button></div>`);
  e.querySelector("#qmCancel").onclick = () => qmStop(false); qmClock();
}
function qmStart() {
  if (!Account.signedIn) return toast("Sign in to play ranked");
  QM.on = true; QM.game = $("#rkGame").value; QM.diff = $("#rkDiff").value; QM.t0 = Date.now(); QM.mine = null; Vs.matched = false;
  qmMount(); Snd.tick(); qmTick(); QM.iv = setInterval(qmTick, 3000); QM.clk = setInterval(qmClock, 250);
}
const qmRange = () => { const s = (Date.now() - QM.t0) / 1000; return s < 15 ? 100 : s < 35 ? 200 : s < 60 ? 400 : 9999; };
function qmClock() { if (Vs.matched || (Net.started && QM.mine)) { clearInterval(QM.iv); clearInterval(QM.clk); QM.on = false; return; } const s = Math.floor((Date.now() - QM.t0) / 1000), el = $("#qmClock"), r = qmRange(), b = $("#qmBar"), rg = $("#qmRange"); if (!el) return; el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; if (b) b.style.width = Math.min(100, (s / 60) * 100) + "%"; if (rg) rg.firstChild.textContent = r > 1000 ? "Searching for anyone" : `Searching within ±${r} Elo`; }
async function qmTick() {
  if (!QM.on) return; const rows = (await Ranked.rpc("open_lobbies")) || [], me = prof().nick, r = qmRange(); if (!QM.on || Vs.matched) return;
  const orb = $("#qmOrbit"); if (orb) { const faces = rows.filter((x) => x.nick !== me).slice(0, 6); orb.innerHTML = faces.map((x, i) => `<span class="qmo" style="--a:${(i / Math.max(1, faces.length)) * 360}deg" title="${esc(x.nick)}">${avatarHTML(x.avatar, "xs", x.nick)}</span>`).join(""); }
  const fit = rows.filter((x) => x.nick !== me && x.game === QM.game && Math.abs((x.elo || 1000) - Ranked.elo) <= r).sort((a, b) => Math.abs((a.elo || 1000) - Ranked.elo) - Math.abs((b.elo || 1000) - Ranked.elo));
  const best = fit.find((x) => !QM.mine || x.nick < me);   /* both of us hosting: the later nickname joins the other */
  if (best) { const m = $("#qmMsg"); if (m) m.textContent = `Found ${best.nick} (${best.elo}). Joining…`; Snd.tick(); qmStop(true); return rankedJoin(best.code, best.game); }
  if (!QM.mine && (Date.now() - QM.t0) / 1000 > 4) {   /* nobody yet: host a real public room, listed in the lobbies, and keep the queue screen up */
    rankedStart(QM.game, QM.diff, true); QM.mine = Net.code; qmMount();
  }
  const m = $("#qmMsg"), n = rows.filter((x) => x.nick !== me).length; if (m && QM.mine) m.textContent = n ? `Your room is open. ${n} other player${n > 1 ? "s are" : " is"} online in other games.` : "Your room is open. The next player who queues lands here.";
}
function qmStop(found) {
  QM.on = false; clearInterval(QM.iv); clearInterval(QM.clk);
  if (QM.mine) { Ranked.stopLobby(); if (found) { try { Net.close(); } catch (e) { /* already closed */ } } }
  if (!found) { if (QM.mine) Vs.cancel(); else Vs.close(); Snd.tick(); }
}
function rankedStart(game, diff, pub) {
  S.diff = diff; try { localStorage.setItem("bkn_diff", diff); } catch (e) { /* blocked */ }
  resetGames(); S.rk = true; S.game = game === "number" ? "value" : game; S.hubGroup = "ranked"; renderRoom(); openOnline(game); makeRoom(); Net.ranked = pub;
  if (pub) Ranked.startLobby(Net.code, game, diff);
  const el = $("#roomStatus"); if (el && pub) el.insertAdjacentHTML("afterend", '<div class="fine" style="margin-top:6px">Listed in Ranked lobbies. Anyone can join; the result changes both ratings.</div>');
}
function challengeModal(nick) {
  modal(`<h2 style="font-size:24px">Challenge ${esc(nick)}</h2><p class="fine">Pick a game. A private room opens and the invite link is copied, ready to send. This match does not change your Elo.</p>
    <div class="rkform"><label>Game<select id="chGame">${RK_GAMES.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select></label><label>Difficulty<select id="chDiff">${DIFFS.map(([v, n]) => `<option value="${v}" ${v === S.diff ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
    <div class="row" style="margin-top:14px"><button class="btn" id="chGo" data-nick="${esc(nick)}" type="button">Create room and copy link</button><button class="btn ghost" id="modalClose" type="button">Cancel</button></div>`);
}
function rankedJoin(code, game) {
  resetGames(); S.rk = true; S.game = game === "number" ? "value" : game; S.hubGroup = "ranked"; renderRoom(); openOnline(game); joinRoomCode(code); Net.ranked = true;
}
async function renderBoards() {
  const p = prof(), tab = S.btab || "season";
  $("#room").innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2>Leaderboard</h2><div class="bktabs scope"><button type="button" class="chip" data-btab="season" aria-pressed="${tab === "season"}">This season</button><button type="button" class="chip" data-btab="all" aria-pressed="${tab === "all"}">All time</button></div></div><div id="bBody" class="lbx" style="margin-top:10px">${skelRows(5)}</div></div>`;
  const body = $("#bBody");
  if (Board.mode !== "rest") { body.innerHTML = '<div class="fine">The leaderboard needs the online database.</div>'; return; }
  if (tab === "season") return Season.render(body);
  const rows = await Ranked.rpc("elo_top"); if (!$("#bBody")) return;
  if (!rows) { body.innerHTML = '<div class="fine">Could not load the leaderboard. Try again in a moment.</div>'; return; }
  body.innerHTML = rows.length ? rows.map((r, i) => `<div class="lbrow ${p.nick && r.nick === p.nick ? "me" : ""}" data-pc="${esc(r.nick)}" tabindex="0" role="button" aria-haspopup="dialog"><b class="num">${i + 1}</b><span>${avatarHTML(r.avatar, "xs", r.nick)}${esc(r.nick)}${badgesHTML(r.badges)}${p.nick && r.nick === p.nick ? " (you)" : ""}</span><span class="num">${rankTag(r.elo)} ${r.elo}</span><span class="fine num">${r.wins}W ${r.games - r.wins}L</span></div>`).join("") : emptyState("<svg class=ic><use href=#i-trophy></use></svg>", "No ranked matches yet", "Play one in Ranked and be the first on the board.", '<button type="button" class="btn" data-nbgroup="ranked">Play a ranked match</button>');
}



/* ================= Sticker album and personal stats ================= */
const yy = (y) => String(y).slice(2);
const eraOf = (y0, y1) => `${yy(y0)}–${y1 ? yy(y1) : "now"}`;
let CLUBPL_ = null;
function clubPlayers() {                               // club -> [{p, y0, y1}] for every player who has been at an arena club, best known first
  if (CLUBPL_) return CLUBPL_; const m = {};
  QZ.players.forEach((p) => (p.cr || []).forEach(([c, y0, y1]) => { (m[c] || (m[c] = [])).push({ p, y0, y1 }); }));
  Object.values(m).forEach((l) => l.sort((a, b) => FAME.get(a.p.id) - FAME.get(b.p.id)));
  return (CLUBPL_ = m);
}
const albumClubs = (lg) => Object.entries(QZ.clubs).filter(([n, f]) => f.lg === lg && CREST[n] && (clubPlayers()[n] || []).length).sort((a, b) => (b[1].value || 0) - (a[1].value || 0)).map(([n]) => n);
function clubProgress(n, pr) { const l = clubPlayers()[n] || [], st = pr.stickers || {}; return { have: l.filter((x) => st[x.p.id]).length + ((pr.clubStickers || {})[n] ? 1 : 0), total: l.length + 1 }; }
function teamPageDone(n, pr) { const st = pr.stickers || {}, top = (clubPlayers()[n] || []).slice(0, 12); return !!(pr.clubStickers || {})[n] && top.every((x) => st[x.p.id]); }
function collectClub(name) { if (!QZ.clubs[name]) return; const pr = prof(); pr.clubStickers = { ...(pr.clubStickers || {}) }; const fresh = !pr.clubStickers[name]; pr.clubStickers[name] = (pr.clubStickers[name] || 0) + 1; if (fresh) { toast(`<svg class=ic><use href=#i-stadium></use></svg> New team sticker: <b>${esc(name)}</b>`); unlock(pr, "sticker1"); if (teamPageDone(name, pr)) unlock(pr, "page"); } saveProf(pr); }
function collectSticker(p) {
  const pr = prof(); pr.stickers = { ...(pr.stickers || {}) }; const fresh = !pr.stickers[p.id]; pr.stickers[p.id] = (pr.stickers[p.id] || 0) + 1;
  if (fresh) { toast(`<svg class=ic><use href=#i-album></use></svg> New sticker: <b>${esc(p.n)}</b>${(p.cr || []).length > 1 ? ` <small>(fills ${p.cr.length} team slots)</small>` : ""}`); const n = Object.keys(pr.stickers).length; unlock(pr, "sticker1"); if (n >= 50) unlock(pr, "stick50"); if (n >= 150) unlock(pr, "stick150"); (p.cr || []).forEach(([c]) => { if (teamPageDone(c, pr)) unlock(pr, "page"); }); }
  saveProf(pr);
}
function track(game, ok, lg) { const p = prof(); p.acc = { ...(p.acc || {}) }; const a = p.acc[game] || { c: 0, n: 0 }; p.acc[game] = { c: a.c + (ok ? 1 : 0), n: a.n + 1 }; if (lg) { p.accL = { ...(p.accL || {}) }; const b = p.accL[lg] || { c: 0, n: 0 }; p.accL[lg] = { c: b.c + (ok ? 1 : 0), n: b.n + 1 }; } saveProf(p); }
function radarSVG(items) {
  const n = items.length, R = 78, C = 100, pt = (i, k) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return [C + Math.cos(a) * R * k, C + Math.sin(a) * R * k]; };
  const ring = (k) => items.map((_, i) => pt(i, k).map((v) => v.toFixed(1)).join(",")).join(" "), shape = items.map((it, i) => pt(i, Math.max(0.04, it.v)).map((v) => v.toFixed(1)).join(",")).join(" ");
  return `<svg class="radar" viewBox="0 0 200 200" role="img" aria-label="Strengths"><g fill="none" stroke="currentColor" stroke-opacity=".18">${[0.33, 0.66, 1].map((k) => `<polygon points="${ring(k)}"/>`).join("")}${items.map((_, i) => `<line x1="${C}" y1="${C}" x2="${pt(i, 1)[0].toFixed(1)}" y2="${pt(i, 1)[1].toFixed(1)}"/>`).join("")}</g><polygon points="${shape}" fill="var(--accent)" fill-opacity=".35" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>${items.map((it, i) => { const [x, y] = pt(i, 1.2); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="700" fill="currentColor">${esc(it.l)}</text>`; }).join("")}</svg>`;
}
function statsRadarHTML() {
  const p = prof(), acc = p.acc || {}, accL = p.accL || {}, g = [["who", "Who am I?"], ["career", "Career"], ["club", "Clubs"], ["blur", "Badges"], ["finish", "Tables"], ["value", "Values"]], total = g.reduce((s, [k]) => s + (acc[k] ? acc[k].n : 0), 0);
  if (total < 5) return '<div class="fine">Play a few rounds and your strengths will show up here.</div>';
  const a = g.map(([k, l]) => ({ l, v: acc[k] && acc[k].n ? acc[k].c / acc[k].n : 0 })), b = ORDER.map((c) => ({ l: lgOf(c).name.replace("Premier League", "PL").replace("Bundesliga", "BL").replace("La Liga", "LL").replace("Serie A", "SA").replace("Ligue 1", "L1"), v: accL[c] && accL[c].n ? accL[c].c / accL[c].n : 0 }));
  return `<div class="radars"><div><div class="fine">By game</div>${radarSVG(a)}</div><div><div class="fine">By league</div>${radarSVG(b)}</div></div>`;
}
function showAlbum(ev) {
  S.code = null; S.mode = null; setTheme("HOME", ev); ["#home", "#lobby", "#league", "#profilePage"].forEach((s) => { $(s).hidden = true; }); $("#albumPage").hidden = false; window.scrollTo(0, 0); S.alb = S.alb || { lg: "E0", club: null, more: 1 }; renderAlbum();
}
function renderAlbum() {
  const el = $("#albumPage"), pr = prof(), st = pr.stickers || {}, a = S.alb, have = Object.keys(st).length + Object.keys(pr.clubStickers || {}).length;
  const rar = (r) => (r < 40 ? "legend" : r < 120 ? "epic" : r < 400 ? "rare" : "common");
  const top = `<nav class="crumbs"><button class="back" data-crumb="menu" type="button">← Menu</button><div class="trail"><button type="button" class="crumb" data-alb="home|0">Sticker album</button>${a.club ? `<i>›</i><span class="crumb cur">${esc(a.club)}</span>` : ""}</div></nav>`;
  if (!a.club) {
    const clubs = albumClubs(a.lg);
    el.innerHTML = `${top}<div class="card"><div class="row" style="justify-content:space-between"><h2><svg class=ic><use href=#i-album></use></svg> Sticker album</h2><span class="rkbadge"><b class="num">${have}</b><small>stickers collected</small></span></div><p class="sub">Every team has a page: its logo, then every player who played there, with his years. Get a player right and he fills a slot at each team he played for.</p>
    <div class="scope">${ORDER.map((c) => `<button type="button" class="chip" data-alb="lg|${c}" aria-pressed="${a.lg === c}">${esc(lgOf(c).name)}</button>`).join("")}</div>
    <div class="clubgrid">${clubs.map((n) => { const g = clubProgress(n, pr); return `<button type="button" class="clubcard ${g.have === g.total ? "done" : ""}" data-alb="club|${esc(n)}">${badge(n, "md")}<b>${esc(n)}</b><small class="num">${g.have}/${g.total}</small><i style="--w:${Math.round((g.have / g.total) * 100)}%"></i></button>`; }).join("")}</div></div>`; return;
  }
  const list = clubPlayers()[a.club] || [], shown = list.slice(0, 40 * a.more), got = list.filter((x) => st[x.p.id]).length, ts = (pr.clubStickers || {})[a.club];
  el.innerHTML = `${top}<div class="card"><div class="row" style="justify-content:space-between"><h2>${esc(a.club)}</h2><span class="fine">${got + (ts ? 1 : 0)} of ${list.length + 1} collected</span></div>
    <div class="stickers"><div class="stk team ${ts ? "on legend" : "off"}">${ts ? badge(a.club, "xl") : '<span class="q">?</span>'}<b>${ts ? esc(a.club) : "Team badge"}</b><small>${ts ? esc(QZ.clubs[a.club].stadium || "") : "Get this club right in Name that team or Logo blur"}</small><i>team sticker</i></div>
    ${shown.map((x, k) => { const r = FAME.get(x.p.id); return st[x.p.id] ? `<div class="stk on ${rar(r)}">${playerPic(x.p, "md")}<b>${esc(x.p.n)}</b><small>${esc(x.p.pos)}</small><span class="era">${eraOf(x.y0, x.y1)}</span><i>${rar(r)}</i></div>` : `<div class="stk off"><span class="q">?</span><b>#${k + 1}</b><small>${esc(x.p.pos)}</small><span class="era">${eraOf(x.y0, x.y1)}</span></div>`; }).join("")}</div>
    ${shown.length < list.length ? `<div class="row" style="margin-top:12px;justify-content:center"><button class="btn ghost" data-alb="more|1" type="button">Show more (${list.length - shown.length} left)</button></div>` : ""}</div>`;
}

/* ================= Live predictions ================= */
const Live = { lg: "all", days: 30, timer: null, tick: null, fx: [], board: null };
const LIVE_PERIODS = [[7, "This week"], [30, "30 days"], [365, "This season"]];
const fmtKick = (iso) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
function countdown(ms) { if (ms <= 0) return "kicking off"; const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`; }
async function renderLive() {
  clearInterval(Live.timer); clearInterval(Live.tick); const signed = Account.signedIn && Board.mode === "rest";
  $("#room").innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2><span class="livedot"></span> Live predictions</h2><span class="fine" id="lvNext"></span></div>
    <p class="sub">Predict the next real matches before kickoff. The model plays too, and its score is pinned to the top of the board.</p>
    ${signed ? "" : '<div class="rcard on" style="margin:10px 0"><b>Sign in to lock your picks and join the board.</b> <button class="btn" id="lvSign" type="button" style="margin-left:8px">Sign in</button></div>'}
    <div class="scope">${["all", ...ORDER].map((c) => `<button type="button" class="chip" data-lvlg="${c}" aria-pressed="${Live.lg === c}">${c === "all" ? "All leagues" : esc(lgOf(c).name)}</button>`).join("")}</div><div id="lvList" class="fxlist">${skelRows(3)}</div></div>
    <div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="font-size:22px"><svg class=ic><use href=#i-trophy></use></svg> Leaderboard</h3><div class="scope" style="padding:0">${LIVE_PERIODS.map(([d, n]) => `<button type="button" class="chip" data-lvd="${d}" aria-pressed="${Live.days === d}">${n}</button>`).join("")}</div></div><div id="lvBoard" class="lbx">${skelRows(3)}</div></div>`;
  await loadLive(); Live.timer = setInterval(() => { if (S.hubGroup !== "live" || S.game || !$("#lvList")) { clearInterval(Live.timer); clearInterval(Live.tick); return; } loadLive(); }, 60000);
  Live.tick = setInterval(paintCountdown, 1000);
}
function paintCountdown() {
  const nx = Live.fx.find((f) => new Date(f.kickoff) > Date.now()), el = $("#lvNext"); if (el) el.textContent = nx ? `Next kickoff in ${countdown(new Date(nx.kickoff) - Date.now())}` : "";
  document.querySelectorAll("[data-kick]").forEach((e) => { const ms = new Date(e.dataset.kick) - Date.now(); e.textContent = ms > 0 ? `kickoff in ${countdown(ms)}` : ""; });
}
async function loadLive() {
  const list = $("#lvList"); if (!list) return;
  if (Board.mode !== "rest") { list.innerHTML = '<div class="fine">Live predictions need the online database, which is not connected in this build.</div>'; return; }
  const fx = await Ranked.rpc("open_fixtures", { p_league: Live.lg }); if (!$("#lvList")) return;
  if (!fx) { list.innerHTML = '<div class="fine">Live predictions need the latest database update (schema_v4.sql).</div>'; return; }
  Live.fx = fx; paintFixtures(); paintCountdown();
  const [rows, ms] = await Promise.all([Ranked.rpc("fixture_board", { p_league: Live.lg, p_days: Live.days }), Ranked.rpc("model_score", { p_league: Live.lg, p_days: Live.days })]); if (!$("#lvBoard")) return;
  paintLiveBoard(rows || [], ms && ms[0]);
}
function paintFixtures() {
  const list = $("#lvList"); if (!list) return; const signed = Account.signedIn, now = Date.now();
  if (!Live.fx.length) { list.innerHTML = '<div class="fxempty"><span><svg class=ic><use href=#i-calendar></use></svg></span><b>No fixtures yet</b><div class="fine">The next round appears here as soon as it is published, usually a few days before kickoff.</div></div>'; return; }
  let lastDay = "";
  list.innerHTML = Live.fx.map((f) => {
    const ko = new Date(f.kickoff), open = ko > now, day = ko.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }), head = day !== lastDay ? `<div class="fxday">${esc(day)}</div>` : ""; lastDay = day;
    const live = !open && !f.res && now - ko < 2.5 * 3600 * 1000, show = f.p_h != null;
    const picks = ["H", "D", "A"].map((k) => `<button type="button" class="mp" data-k="${k}" data-lvp="${esc(f.id)}|${k}" aria-pressed="${f.my_pick === k}" aria-label="${OUTNAME[k]}" ${open ? "" : "disabled"}>${k}</button>`).join("");
    let extra = "";
    if (show) { const pc = (v) => Math.round(v * 100), n = (f.crowd_h || 0) + (f.crowd_d || 0) + (f.crowd_a || 0), cp = (v) => (n ? Math.round((v / n) * 100) : 0), mk = (k) => ({ H: f.home, D: "Draw", A: f.away })[k];
      extra = `<div class="fxinfo"><div><svg class=ic><use href=#i-chip></use></svg> <b>The model:</b> ${esc(mk(f.model_pick))} <span class="fine num">${pc(f.p_h)}% · ${pc(f.p_d)}% · ${pc(f.p_a)}%</span></div>${n ? `<div class="fine"><svg class=ic><use href=#i-users></use></svg> The crowd (${n}): <span class="num">${cp(f.crowd_h || 0)}% · ${cp(f.crowd_d || 0)}% · ${cp(f.crowd_a || 0)}%</span></div>` : ""}</div>`; }
    if (f.res) { const you = f.my_pick ? (f.my_pick === f.res ? "✓" : "✗") : "–", mo = f.model_pick ? (f.model_pick === f.res ? "✓" : "✗") : "–"; extra += `<div class="fxres"><b class="num">${f.hg}-${f.ag}</b><span>You ${you}</span><span>Model ${mo}</span></div>`; }
    return `${head}<div class="fx ${live ? "islive" : ""}"><div class="fxteams"><span class="fxh">${esc(f.home)}${badge(f.home, "sm")}</span><span class="fxv">v</span><span class="fxa">${badge(f.away, "sm")}${esc(f.away)}</span></div><div class="fxmeta"><span>${esc(lgOf(f.league).name)} · ${esc(fmtKick(f.kickoff))}</span>${live ? '<b class="livetag">LIVE</b>' : ""}<span class="fine" data-kick="${esc(f.kickoff)}"></span></div><div class="fxpicks">${picks}</div>${extra}</div>`;
  }).join("");
}
function paintLiveBoard(rows, model) {
  const box = $("#lvBoard"); if (!box) return; const me = prof().nick, pc = (c, p) => (p ? Math.round((c / p) * 100) : 0);
  const mrow = `<div class="lbrow modelrow"><b><svg class=ic><use href=#i-chip></use></svg></b><span>The Model <small class="fine">plays along</small></span><span class="num">${model ? model.correct : 0}/${model ? model.played : 0}</span><span class="fine num">${model ? pc(model.correct, model.played) : 0}%</span></div>`;
  const mine = rows.find((r) => r.nick === me);
  const head = mine && model && model.played ? `<div class="fine" style="margin-bottom:6px">You: <b class="num">${mine.correct}/${mine.played}</b> · Model: <b class="num">${model.correct}/${model.played}</b>${mine.correct > model.correct ? " · you're ahead!" : mine.correct === model.correct ? " · level with the model" : ""}</div>` : "";
  if (mine && model && mine.played >= 3 && mine.correct > model.correct) award("beatmodel");
  box.innerHTML = head + mrow + (rows.length ? rows.map((r, i) => `<div class="lbrow ${r.nick === me ? "me" : ""}"><b class="num">${i + 1}</b><span>${avatarHTML(r.avatar, "xs", r.nick)}${esc(r.nick)}${badgesHTML(r.badges)}${r.nick === me ? " (you)" : ""}</span><span class="num">${r.correct}/${r.played}</span><span class="fine num">${pc(r.correct, r.played)}%</span></div>`).join("") : emptyState("<svg class=ic><use href=#i-fore></use></svg>", "No finished predictions yet", "Lock a pick and check back after the match.", '<button type="button" class="btn" data-nbgame="nbcall">Make a prediction</button>'));
}


/* ================= Search everything ================= */
function searchItems(q) {
  const n = qnorm(q), out = [];
  const pages = [["Menu", "⌂", () => go("")], ["Games", "<svg class=ic><use href=#i-games></use></svg>", () => go("games")], ["ballknowledge originals", "<svg class=ic><use href=#i-brain></use></svg>", () => go("games-all-leagues-bk")], ["Beat the Model", "🆚", () => go("games-all-leagues-model")], ["Ranked", "<svg class=ic><use href=#i-trophy></use></svg>", () => go("games-all-leagues-ranked")], ["Live predictions", "<svg class=ic><use href=#i-live></use></svg>", () => go("games-all-leagues-live")], ["Our model", "<svg class=ic><use href=#i-chart></use></svg>", () => go("lab")], ["Time machine", "<svg class=ic><use href=#i-hourglass></use></svg>", () => go("lab-premier-league-replay")], ["Title race", "<svg class=ic><use href=#i-flag></use></svg>", () => go("lab-premier-league-race")], ["How the model works", "<svg class=ic><use href=#i-bulb></use></svg>", () => go("lab-all-leagues-about")], ["Leaderboard", "<svg class=ic><use href=#i-medal></use></svg>", () => go("games-all-leagues-boards")], ["My profile", "<svg class=ic><use href=#i-user></use></svg>", () => go("profile")], ["Appearance and settings", "<svg class=ic><use href=#i-palette></use></svg>", () => go("profile")], ["Sticker album", "<svg class=ic><use href=#i-album></use></svg>", () => go("album")], ["Replay the tour", "<svg class=ic><use href=#i-compass></use></svg>", () => startTour()]];
  pages.forEach(([name, ic, fn]) => { if (!n || qnorm(name).includes(n)) out.push({ ic, name, sub: "Page", fn }); });
  [...GAMES, ...QUIZ_GAMES, ...(window.QUIZ_HIDDEN || [])].forEach((g) => { if (!n || qnorm(g.name).includes(n)) out.push({ ic: "<svg class=ic><use href=#i-dice></use></svg>", name: g.name, sub: "Game", fn: () => go("games-all-leagues-" + g.id) }); });
  if (n.length >= 2) {
    Object.keys(QZ.clubs).filter((c) => CREST[c] && qnorm(c).includes(n)).slice(0, 4).forEach((c) => out.push({ ic: badge(c, "sm"), name: c, sub: "Club in the sticker album", fn: () => { S.alb = { lg: QZ.clubs[c].lg, club: c, more: 1 }; go("album"); renderAlbum && S.alb && setTimeout(renderAlbum, 50); } }));
    suggestions(q, QZ.players, (x) => x.n).forEach((p) => out.push({ ic: avatarHTML("", "xs", p.n[0]), name: p.n, sub: `Player · ${p.club || ""}`, fn: () => playerCard(p) }));
  }
  return out.slice(0, 12);
}
function openSearch() {
  if ($("#search")) return; const el = document.createElement("div"); el.id = "search"; el.className = "searchov"; el.innerHTML = `<div class="searchbox" role="dialog" aria-label="Search"><input id="searchIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Search games, pages, players, clubs…" aria-label="Search"><div id="searchRes" class="searchres"></div><div class="fine">↑ ↓ to move · Enter to open · Esc to close</div></div>`; document.body.appendChild(el);
  let sel = 0, items = [];
  const paint = () => { items = searchItems($("#searchIn").value); sel = Math.min(sel, Math.max(0, items.length - 1)); $("#searchRes").innerHTML = items.length ? items.map((x, i) => `<button type="button" class="sres ${i === sel ? "on" : ""}" data-sr="${i}"><span class="sic">${x.ic}</span><b>${esc(x.name)}</b><small>${esc(x.sub)}</small></button>`).join("") : '<div class="fine" style="padding:12px">Nothing found. Try a game, a player or a club.</div>'; };
  const go_ = (i) => { const x = items[i]; if (!x) return; closeSearch(); Snd.tick(); setTimeout(x.fn, 30); };
  el.addEventListener("click", (e) => { const b = e.target.closest("[data-sr]"); if (b) go_(+b.dataset.sr); else if (e.target === el) closeSearch(); });
  $("#searchIn").addEventListener("input", () => { sel = 0; paint(); });
  $("#searchIn").addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paint(); } else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); } else if (e.key === "Enter") { e.preventDefault(); go_(sel); } else if (e.key === "Escape") closeSearch(); });
  paint(); $("#searchIn").focus();
}
function closeSearch() { const el = $("#search"); if (el) el.remove(); }

/* ---------- report a problem, and what's new ---------- */
function reportDialog(kind, ref, label) {
  if (!Account.signedIn || Board.mode !== "rest") { toast("Sign in to send a report"); Account.available ? authForm("in") : openProfile(); return; }
  modal(`<h2 style="font-size:24px">Report a problem</h2><p class="fine">${esc(label)}. What is wrong? (a wrong photo, club, fact or answer)</p><textarea id="rpNote" maxlength="500" rows="4" placeholder="For example: this player now plays for another club" aria-label="What is wrong" style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:500 15px var(--sans, system-ui)"></textarea><div class="row" style="margin-top:12px"><button class="btn" id="rpSend" data-kind="${esc(kind)}" data-ref="${esc(ref)}" type="button">Send report</button><button class="btn ghost" id="modalClose" type="button">Cancel</button></div>`);
}
const CHANGELOG = { v: "2026-11-22-redesign", items: [["Every game on one page", "Games now shows every game at once, with filters (Quizzes, Predict, Daily, With a friend, Online) and a search box. Search in the top bar also finds games in the other sports."], ["Seasons and player cards", "The leaderboard has monthly seasons with rewards, and tapping any name opens that player's card."], ["Fixes", "Progress no longer resets between visits, Player 2 can pick categories in tic-tac-toe, and hints no longer give away a player's current club."], ["Close enough counts", "Typing just a last name, a distinctive club word like Dortmund, or a name with a small typo now counts as right in every guessing game."], ["Who did it", "Iconic matches is now Who did it, and it only has big matches: Champions League finals and semi-finals, cup finals with a big club, top-three clashes, Der Klassiker, World Cup and Euro finals. Penalties no longer show an assister."], ["Scramble", "Big letter tiles, and hints that only arrive when every player asks for one."], ["Result moments", "Two-player games end with a big winner screen, and right or wrong answers flash the screen edge."], ["Discover", "A daily feed (matches on this date, a record, a player spotlight and a question) and a quiz that matches you to a club."], ["Goal loading screens are back", "The twelve goal recreations return, with the run, pass and finish redrawn from match reports."], ["Play online", "Ranked and Live predictions now live together under one card."], ["What really happened", "After a call, past matches show their real goals, scorers and assists."], ["Who did it", "A new original: a big match and its highlights by minute. Name the scorers, assisters, penalty takers and red cards."], ["Settings and languages", "A settings page for sound and music, plus German, French and Arabic (a first draft: menus and games, not every sentence yet)."], ["Login streak", "A fire counter next to your profile for days in a row."], ["Two accounts, one device", "An experiment on the Ranked page: a friend signs in on your device and a rated game moves both ratings."], ["Scramble", "A new ballknowledge original: a club, player or manager with the letters shuffled. Buzz in when you know it."], ["About page", "Our story, how the model works with two tools to play with, honest limits and sources, and a roadmap where you can suggest ideas and badges and vote."], ["Wrong kits hidden", "If a player's photo was taken before his latest transfer, the club badge shows instead of the old shirt."], ["Fixes and polish", "A quick three-beat reveal after each call, a smaller and faster match simulation, labelled model bars, a mobile title that fits, one Buzz button online, consistent player photo framing, and no more invented scorers in old matches."], ["Older Champions League finals", "Starting XI now has the Champions League finals from 2000 to 2013, with lineups from Wikipedia, and keeps only the main derbies: one per league and three in the Premier League."], ["Starting XI: 953 matches", "Cup and Champions League finals, quarter-finals and semi-finals, 18 famous derbies like El Clásico and the Manchester derby, and top-three clashes. Pick the match type before you start."], ["Nine and nine", "New: Starting XI, Rapid fire and Bracket buster. Tic-tac-toe has Best of 3, wrong answers can be reported, and there is a Weekly tournament with a Weekly champion badge."], ["Real match facts", "Managers, league titles, cup wins and teammates now come from who actually played in each match since 2012-13, not from guesses. Played-under is back as a category."], ["Tic-tac-toe draft", "Twelve categories, one from each family, and players take turns picking three each: X picks the rows, O the columns. Every pair is checked so no category sits inside another."], ["Data fixes", "Players who moved this summer now show their new club in tic-tac-toe and the quizzes. Matchdays are real rounds with no club twice, and older seasons are complete again."], ["Music", "A calm lobby loop and a slightly more driven in-game loop, played live with no downloads. Music has its own button next to Sound."], ["Badges", "Wear up to three of your achievements next to your picture. Every achievement now has a difficulty from Common to Legendary."], ["Epic ranked rooms", "Waiting, joining and a versus screen with a countdown when your opponent arrives."], ["Moving loading screens", "Animated player cards and legend cards to collect."], ["Fresher player photos", "Premier League players now use the official current-season photo; everyone else gets the newest available one."], ["Every game explains itself", "A short how-it-works panel appears the first time you open a game. Press the ? button to see it again."], ["A gentler tour", "New visitors choose what they want to do and get a short, personal walkthrough."], ["Report a problem", "Spot a wrong photo, club or fact? Report it from any player card."]] };
function showWhatsNew() {
  const row = ([h, d]) => `<div><b>${esc(h)}</b><span>${esc(d)}</span></div>`, first = CHANGELOG.items.slice(0, 3), rest = CHANGELOG.items.slice(3);   /* the latest three; older ones behind a button, not a page-long list */
  modal(`<h2 style="font-size:26px">What's new</h2><div class="newlist">${first.map(row).join("")}</div>${rest.length ? `<details class="newold"><summary>Show older changes (${rest.length})</summary><div class="newlist">${rest.map(row).join("")}</div></details>` : ""}<div class="row" style="margin-top:14px"><button class="btn" id="modalClose" type="button">Got it</button></div>`);
  try { localStorage.setItem("bkn_ver", CHANGELOG.v); } catch (e) { /* blocked */ }
}
function playerCard(p) {
  const era = (p.cr || []).map(([c, a, b]) => `<span class="chip2">${CREST[c] ? badge(c, "sm") : ""} ${esc(c)} <small class="num">${eraOf(a, b)}</small></span>`).join("");
  modal(`<div class="row" style="gap:16px">${playerPic(p, "xl")}<div><h2 style="font-size:28px">${esc(p.n)}</h2><div class="fine">${POSICON[p.pos] || ""} ${esc(p.sub || p.pos)} · ${flagOf(p.nat)} ${esc(p.nat)} · ${ageOf(p)} yrs</div><div class="fine">${esc(p.club || "")} · ${euro(p.val)}${p.caps ? ` · ${p.caps} caps` : ""}</div></div></div><div class="pfchips" style="margin-top:12px">${era}</div><div class="row" style="margin-top:14px"><button class="btn" data-favp="${p.id}" type="button"><svg class=ic><use href=#i-star></use></svg> Make favourite</button><button class="btn ghost" data-report="player|${p.id}|${esc(p.n)}" type="button">Report a problem</button><button class="btn ghost" id="modalClose" type="button">Close</button></div>`);
}
addEventListener("keydown", (e) => { if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openSearch(); } });


/* ================= Settings ================= */
const LANGS = [["en", "English", "ltr"], ["de", "Deutsch", "ltr"], ["fr", "Français", "ltr"], ["ar", "العربية", "rtl"]];
function showSettings(ev) {
  S.code = null; S.mode = null; S.cur = null; setTheme("HOME", ev); ["#home", "#lobby", "#league", "#profilePage", "#albumPage", "#adminPage", "#aboutPage", "#discPage"].forEach((s) => { $(s).hidden = true; }); $("#setPage").hidden = false; window.scrollTo(0, 0); renderSettings();
}
function renderSettings() {
  const el = $("#setPage"); if (!el) return; const lv = Snd.level, mu = Snd.music && lv > 0 ? 1 : 0, lang = curLang();
  const seg = (attr, items, cur) => `<div class="scope" style="padding:2px 0">${items.map(([v, n]) => `<button type="button" class="chip" data-${attr}="${v}" aria-pressed="${String(cur) === String(v)}">${n}</button>`).join("")}</div>`;
  el.innerHTML = `<div class="row" style="margin-bottom:8px"><button class="btn ghost" id="aboutBack" type="button">← Menu</button><h1 style="font-size:28px">Settings</h1></div>
    <div class="card"><h3>Appearance</h3>${appearanceV2()}</div>
    <div class="card"><h3>Sound</h3><p class="fine">Effects for taps, buzzers and results.</p>${seg("snd", [[0, "Off"], [1, "Soft"], [2, "Full"]], lv)}
    <h3 style="margin-top:16px">Music</h3><p class="fine">A calm loop in menus and a livelier one during games. Needs sound to be on.</p>${seg("mus", [[1, "On"], [0, "Off"]], mu)}</div>
    <div class="card"><h3>Language</h3><p class="fine">${lang === "en" ? "More of the site is translated over time; anything not translated yet stays in English." : "Teile der Seite sind noch Englisch."}</p>${seg("lang", LANGS.map(([c, n]) => [c, n]), lang)}</div>`;
  setWire(el);
}
/* ================= Languages: German, French, Arabic =================
   Text is matched against the exact English wording and replaced; anything not in the lists below stays English. These are written to read like football talk in each language, not
   word for word, but they have not been checked by native speakers yet and cover the menus, games and main pages, not every sentence. */
const I18N = {
  de: {
    "Football, predicted and played": "Fußball, getippt und gespielt", "Games": "Spiele", "Play": "Spielen", "Our model": "Unser Modell", "Explore": "Entdecken", "About": "Über uns", "Read": "Lesen",
    "matches tested": "Spiele getestet", "model": "Modell", "bookmakers": "Wettanbieter", "leagues": "Ligen", "seasons": "Saisons", "Sign in": "Anmelden", "Built by moisback22": "Gebaut von moisback22",
    "← Menu": "← Menü", "← Back": "← Zurück", "Menu": "Menü", "Back": "Zurück", "Got it": "Verstanden", "Beta": "Beta",
    "Pick a game.": "Such dir ein Spiel aus oder wechsle oben die Liga.", "All leagues": "Alle Ligen", "All five leagues": "Alle fünf Ligen", "Leaderboard": "Bestenliste",
    "Random matches from every league on one big pitch.": "Zufällige Spiele aus allen Ligen auf einem großen Platz.", "Mix it up": "Alles gemischt", "Any league, any season": "Jede Liga, jede Saison",
    "Premier League": "Premier League", "Bundesliga": "Bundesliga", "La Liga": "La Liga", "Serie A": "Serie A", "Ligue 1": "Ligue 1", "Star to watch": "Spieler im Fokus",
    "What do you want to play?": "Worauf hast du Lust?", "ballknowledge originals": "ballknowledge-Originale", "Beat the Model": "Schlag das Modell", "Ranked": "Rangliste", "Play online": "Online spielen",
    "Live predictions": "Live-Tipps", "Live": "Live", "Weekly tournament": "Wochenturnier", "Five matches, the same for everyone this week": "Fünf Spiele, diese Woche für alle gleich",
    "Call it": "Tipp abgeben", "Solo, against the model": "Allein gegen das Modell", "not played yet": "noch nicht gespielt", "Daily 5": "Die Tages-5", "not played today": "heute noch nicht gespielt",
    "The same five matches for everyone today. Beat the model and share your result.": "Heute für alle dieselben fünf Spiele. Schlag das Modell und teile dein Ergebnis.",
    "Matchday": "Spieltag", "Call a whole round at once and watch the results land one by one.": "Tippe einen ganzen Spieltag auf einmal und sieh zu, wie die Ergebnisse eintrudeln.",
    "Rapid fire": "Blitzrunde", "60 seconds. Call as many real matches as you can and beat the model on the same ones.": "60 Sekunden. Tippe so viele echte Spiele wie möglich und schlag das Modell bei denselben.",
    "Bracket buster": "Turnierbaum-Tipp", "A real Champions League knockout. Pick every tie, round by round, against an Elo model.": "Eine echte Champions-League-K.-o.-Runde. Tippe jedes Duell, Runde für Runde, gegen ein Elo-Modell.",
    "Spot the upset": "Finde die Überraschung", "Five real results. Which one did the model think was least likely?": "Fünf echte Ergebnisse. Welches hielt das Modell für am unwahrscheinlichsten?",
    "Guess the table": "Tabelle tippen", "Rebuild a final table from last season's, then see you against the model.": "Bau eine Abschlusstabelle nach und miss dich dann mit dem Modell.",
    "Higher or lower": "Höher oder tiefer", "Two clubs, one number. Keep the streak alive.": "Zwei Vereine, eine Zahl. Halte die Serie am Leben.", "Challenge a friend": "Freund herausfordern",
    "Five matches, one link. Send it and see who does better.": "Fünf Spiele, ein Link. Schick ihn los und schau, wer besser tippt.",
    "Who am I?": "Wer bin ich?", "Solo streak · 2 players": "Solo-Serie · 2 Spieler", "A mystery player. Clues go from obscure to obvious. Buzz in early for more points.": "Ein Mysterium im Trikot. Die Hinweise werden immer deutlicher. Wer früher drückt, bekommt mehr Punkte.",
    "Career path": "Karriereweg", "Every club he played for, in order. Name the player.": "Alle Stationen in der richtigen Reihenfolge. Wer ist es?",
    "Name that team": "Welcher Verein?", "Goals, wins and a stadium size. Which club is it?": "Tore, Siege und eine Stadiongröße. Welcher Verein steckt dahinter?",
    "Logo blur": "Wappen-Rätsel", "A blurry badge that sharpens by the second.": "Ein verschwommenes Wappen, das mit jeder Sekunde schärfer wird.",
    "Where did they finish?": "Wo landen sie?", "A club, a season, a slider. How close can you get?": "Ein Verein, eine Saison, ein Regler. Wie nah kommst du ran?",
    "Market value": "Marktwert", "Solo higher or lower · 2 players": "Solo höher oder tiefer · 2 Spieler", "Who is worth more, a player or a squad? Or both of you guess a value and the closest wins.": "Wer ist mehr wert, ein Spieler oder ein Kader? Oder ihr schätzt beide einen Wert, und wer näher dran ist, gewinnt.",
    "Team roulette": "Vereins-Roulette", "2 players · one device or two": "2 Spieler · ein Gerät oder zwei", "A club appears. Take turns naming players who played for it. First to blank loses.": "Ein Verein erscheint. Nennt abwechselnd Spieler, die dort gespielt haben. Wer zuerst nichts mehr weiß, verliert.",
    "Starting XI": "Startelf", "Solo · 2 to 3 minutes": "Solo · 2 bis 3 Minuten", "Finals, Champions League knockouts, derbies and big games. Name the eleven who started.": "Finals, Champions-League-K.-o.-Spiele, Derbys und Topspiele. Nenne die elf, die angefangen haben.",
    "Who did it": "Wer war's?", "Solo": "Solo", "A big match and its highlights by minute. Name the scorers, assisters, penalty takers and who was sent off.": "Ein berühmtes Spiel und seine Höhepunkte Minute für Minute. Nenne Torschützen, Vorlagengeber, Elfmeterschützen und Platzverweise.",
    "Scramble": "Buchstabensalat", "A club, player or manager with the letters shuffled. Unscramble it before your rival does.": "Ein Verein, Spieler oder Trainer mit durcheinandergewürfelten Buchstaben. Entwirr ihn vor deinem Gegner.",
    "Basketball tic-tac-toe": "Fußball-Tic-Tac-Toe", "2 players": "2 Spieler", "Name a player who fits the row and the column. Three in a row wins.": "Nenne einen Spieler, der zu Zeile und Spalte passt. Drei in einer Reihe gewinnen.",
    "How Ranked works": "So funktioniert die Rangliste", "Play real people online. Create a lobby and others can join from the list.": "Spiel online gegen echte Leute. Erstell eine Lobby, andere steigen aus der Liste ein.",
    "Create an account or sign in": "Konto erstellen oder anmelden", "Your rating.": "Deine Wertung.", "This week": "Diese Woche", "30 days": "30 Tage", "This season": "Diese Saison",
    "Settings": "Einstellungen", "Sound": "Ton", "Effects for taps, buzzers and results.": "Effekte für Klicks, Tore und Ergebnisse.", "Off": "Aus", "Soft": "Leise", "Full": "Voll", "Music": "Musik",
    "A calm loop in menus and a livelier one during games. Needs sound to be on.": "Ein ruhiger Loop in den Menüs und ein lebhafterer im Spiel. Der Ton muss an sein.", "On": "An", "Language": "Sprache",
    "Appearance": "Darstellung", "Theme, text size, contrast and reduced motion are in your profile.": "Design, Textgröße, Kontrast und weniger Animationen findest du in deinem Profil.", "Open profile": "Profil öffnen",
    "About ballknowledge": "Über ballknowledge", "Our story": "Unsere Geschichte", "How the model works": "So funktioniert das Modell", "Honest limits and sources": "Ehrliche Grenzen und Quellen", "Roadmap and votes": "Fahrplan und Abstimmung",
    "How it grew": "So ist es gewachsen", "Who builds it": "Wer dahintersteckt", "Roadmap": "Fahrplan", "Shipped": "Fertig", "Next": "Als Nächstes", "Later": "Später", "Your ideas": "Deine Ideen",
    "Suggest a feature, a game or a badge. Vote for the ones you like.": "Schlag ein Feature, ein Spiel oder ein Abzeichen vor. Stimm für die, die dir gefallen.", "Feature": "Feature", "Badge": "Abzeichen", "Game": "Spiel", "Other": "Sonstiges", "Suggest": "Vorschlagen",
    "What we do not have": "Was uns fehlt", "Sources": "Quellen", "Profile": "Profil", "Guest": "Gast", "Elo": "Elo", "day streak": "Tage in Folge", "achievements": "Erfolge", "Edit profile": "Profil bearbeiten",
    "Profile picture": "Profilbild", "Favourite player": "Lieblingsspieler", "Favourite team": "Lieblingsverein", "None": "Keiner", "Elo history": "Elo-Verlauf", "Friends": "Freunde", "Style": "Stil", "Minimal": "Schlicht", "Classic": "Klassisch",
    "Theme": "Design", "Dark": "Dunkel", "Light": "Hell", "Auto": "Automatisch", "Text size": "Textgröße", "Small": "Klein", "Normal": "Normal", "Large": "Groß", "Extra large": "Sehr groß", "Sunday League": "Sonntagsliga", "Pub Team": "Kneipenteam", "Academy": "Nachwuchs", "Reserves": "Reserve", "First Team": "Profis", "Captain": "Kapitän", "Club Legend": "Vereinslegende", "World Class": "Weltklasse",
    "Coming later": "Kommt später", "Champions League": "Champions League", "Report a problem": "Problem melden", "Report a wrong answer": "Falsche Antwort melden", "Weekly regular": "Stammgast der Woche", "Weekly champion": "Wochenmeister"
  },
  fr: {
    "Football, predicted and played": "Le foot, pronostiqué et joué", "Games": "Jeux", "Play": "Jouer", "Our model": "Notre modèle", "Explore": "Explorer", "About": "À propos", "Read": "Lire",
    "matches tested": "matchs testés", "model": "modèle", "bookmakers": "bookmakers", "leagues": "championnats", "seasons": "saisons", "Sign in": "Se connecter", "Built by moisback22": "Créé par moisback22",
    "← Menu": "← Menu", "← Back": "← Retour", "Menu": "Menu", "Back": "Retour", "Got it": "Compris", "Beta": "Bêta",
    "Pick a game.": "Choisis un jeu, ou change de championnat en haut.", "All leagues": "Tous les championnats", "All five leagues": "Les cinq grands championnats",
    "Random matches from every league on one big pitch.": "Des matchs au hasard de tous les championnats, sur une seule grande pelouse.", "Mix it up": "Un peu de tout", "Any league, any season": "N'importe quel championnat, n'importe quelle saison",
    "Premier League": "Premier League", "Bundesliga": "Bundesliga", "La Liga": "Liga", "Serie A": "Serie A", "Ligue 1": "Ligue 1", "Star to watch": "Le joueur à suivre",
    "What do you want to play?": "À quoi on joue ?", "ballknowledge originals": "Les originaux ballknowledge", "Beat the Model": "Bats le modèle", "Ranked": "Classé", "Play online": "Jouer en ligne",
    "Live predictions": "Pronos en direct", "Live": "Direct", "Weekly tournament": "Tournoi de la semaine", "Five matches, the same for everyone this week": "Cinq matchs, les mêmes pour tout le monde cette semaine",
    "Call it": "Fais ton pronostic", "Solo, against the model": "En solo, contre le modèle", "not played yet": "pas encore joué", "Daily 5": "Les 5 du jour", "not played today": "pas joué aujourd'hui",
    "The same five matches for everyone today. Beat the model and share your result.": "Les mêmes cinq matchs pour tout le monde aujourd'hui. Bats le modèle et partage ton score.",
    "Matchday": "Journée", "Call a whole round at once and watch the results land one by one.": "Pronostique toute une journée d'un coup et regarde les scores tomber un par un.",
    "Rapid fire": "Tir rapide", "60 seconds. Call as many real matches as you can and beat the model on the same ones.": "60 secondes. Pronostique un max de vrais matchs et bats le modèle sur les mêmes.",
    "Bracket buster": "Prédis le tableau", "A real Champions League knockout. Pick every tie, round by round, against an Elo model.": "Une vraie phase à élimination directe de Ligue des champions. Choisis chaque qualifié, tour après tour, face à un modèle Elo.",
    "Spot the upset": "Repère la surprise", "Five real results. Which one did the model think was least likely?": "Cinq vrais résultats. Lequel le modèle jugeait-il le moins probable ?",
    "Guess the table": "Devine le classement", "Rebuild a final table from last season's, then see you against the model.": "Reconstitue un classement final à partir de celui de la saison passée, puis mesure-toi au modèle.",
    "Higher or lower": "Plus ou moins", "Two clubs, one number. Keep the streak alive.": "Deux clubs, un chiffre. Garde ta série en vie.", "Challenge a friend": "Défie un ami",
    "Five matches, one link. Send it and see who does better.": "Cinq matchs, un lien. Envoie-le et vois qui pronostique le mieux.",
    "Who am I?": "Qui suis-je ?", "Solo streak · 2 players": "Série en solo · 2 joueurs", "A mystery player. Clues go from obscure to obvious. Buzz in early for more points.": "Un joueur mystère. Les indices passent de flous à évidents. Buzze tôt pour plus de points.",
    "Career path": "Parcours", "Every club he played for, in order. Name the player.": "Tous ses clubs, dans l'ordre. Qui est-ce ?",
    "Name that team": "Quel club ?", "Goals, wins and a stadium size. Which club is it?": "Des buts, des victoires et la taille d'un stade. De quel club s'agit-il ?",
    "Logo blur": "Écusson flou", "A blurry badge that sharpens by the second.": "Un écusson flou qui devient net seconde après seconde.",
    "Where did they finish?": "Où ont-ils fini ?", "A club, a season, a slider. How close can you get?": "Un club, une saison, un curseur. Jusqu'où peux-tu t'approcher ?",
    "Market value": "Valeur marchande", "Solo higher or lower · 2 players": "Plus ou moins en solo · 2 joueurs", "Who is worth more, a player or a squad? Or both of you guess a value and the closest wins.": "Qui vaut le plus, un joueur ou un effectif ? Ou vous estimez tous les deux une valeur et le plus proche gagne.",
    "Team roulette": "Roulette des clubs", "2 players · one device or two": "2 joueurs · un ou deux appareils", "A club appears. Take turns naming players who played for it. First to blank loses.": "Un club apparaît. À tour de rôle, citez des joueurs qui y ont joué. Le premier qui sèche a perdu.",
    "Starting XI": "Le onze de départ", "Solo · 2 to 3 minutes": "Solo · 2 à 3 minutes", "Finals, Champions League knockouts, derbies and big games. Name the eleven who started.": "Finales, éliminatoires de Ligue des champions, derbys et grosses affiches. Cite les onze titulaires.",
    "Who did it": "Qui l'a fait ?", "Solo": "Solo", "A big match and its highlights by minute. Name the scorers, assisters, penalty takers and who was sent off.": "Un match mythique et ses temps forts minute par minute. Retrouve les buteurs, les passeurs, les tireurs de penalty et les cartons rouges.",
    "Scramble": "Mots mélangés", "A club, player or manager with the letters shuffled. Unscramble it before your rival does.": "Un club, un joueur ou un entraîneur aux lettres mélangées. Remets-les en ordre avant ton adversaire.",
    "Basketball tic-tac-toe": "Morpion du foot", "2 players": "2 joueurs", "Name a player who fits the row and the column. Three in a row wins.": "Cite un joueur qui correspond à la ligne et à la colonne. Trois alignés et c'est gagné.",
    "How Ranked works": "Comment marche le mode Classé", "Play real people online. Create a lobby and others can join from the list.": "Joue en ligne contre de vraies personnes. Crée un salon, les autres te rejoignent depuis la liste.",
    "Create an account or sign in": "Crée un compte ou connecte-toi", "Your rating.": "Ton classement.", "This week": "Cette semaine", "30 days": "30 jours", "This season": "Cette saison",
    "Settings": "Réglages", "Sound": "Son", "Effects for taps, buzzers and results.": "Effets pour les clics, les buts et les résultats.", "Off": "Coupé", "Soft": "Doux", "Full": "Fort", "Music": "Musique",
    "A calm loop in menus and a livelier one during games. Needs sound to be on.": "Une boucle calme dans les menus et une plus rythmée pendant les matchs. Le son doit être activé.", "On": "Activée", "Language": "Langue",
    "Appearance": "Apparence", "Theme, text size, contrast and reduced motion are in your profile.": "Thème, taille du texte, contraste et animations réduites sont dans ton profil.", "Open profile": "Ouvrir le profil",
    "About ballknowledge": "À propos de ballknowledge", "Our story": "Notre histoire", "How the model works": "Comment marche le modèle", "Honest limits and sources": "Limites assumées et sources", "Roadmap and votes": "Feuille de route et votes",
    "How it grew": "Comment ça a grandi", "Who builds it": "Qui le construit", "Roadmap": "Feuille de route", "Shipped": "Livré", "Next": "Prochainement", "Later": "Plus tard", "Your ideas": "Tes idées",
    "Suggest a feature, a game or a badge. Vote for the ones you like.": "Propose une fonction, un jeu ou un badge. Vote pour ceux qui te plaisent.", "Feature": "Fonction", "Badge": "Badge", "Game": "Jeu", "Other": "Autre", "Suggest": "Proposer",
    "What we do not have": "Ce qu'on n'a pas", "Sources": "Sources", "Profile": "Profil", "Guest": "Invité", "Elo": "Elo", "day streak": "jours d'affilée", "achievements": "succès", "Edit profile": "Modifier le profil",
    "Profile picture": "Photo de profil", "Favourite player": "Joueur préféré", "Favourite team": "Équipe préférée", "None": "Aucune", "Elo history": "Historique Elo", "Friends": "Amis", "Style": "Style", "Minimal": "Épuré", "Classic": "Classique",
    "Theme": "Thème", "Dark": "Sombre", "Light": "Clair", "Auto": "Auto", "Text size": "Taille du texte", "Small": "Petite", "Normal": "Normale", "Large": "Grande", "Extra large": "Très grande", "Sunday League": "Foot du dimanche", "Pub Team": "Équipe du bar", "Academy": "Centre de formation", "Reserves": "Réserve", "First Team": "Équipe première", "Captain": "Capitaine", "Club Legend": "Légende du club", "World Class": "Classe mondiale",
    "Coming later": "Bientôt", "Champions League": "Ligue des champions", "Report a problem": "Signaler un problème", "Report a wrong answer": "Signaler une mauvaise réponse", "Weekly regular": "Habitué de la semaine", "Weekly champion": "Champion de la semaine"
  },
  ar: {
    "Football, predicted and played": "كرة القدم: توقّع وتحدَّ", "Games": "الألعاب", "Play": "العب", "Our model": "نموذجنا", "Explore": "استكشف", "About": "عن الموقع", "Read": "اقرأ",
    "matches tested": "مباراة مُختبَرة", "model": "النموذج", "bookmakers": "شركات الرهان", "leagues": "دوريات", "seasons": "مواسم", "Sign in": "تسجيل الدخول", "Built by moisback22": "من تطوير moisback22",
    "← Menu": "القائمة ←", "← Back": "رجوع ←", "Menu": "القائمة", "Back": "رجوع", "Got it": "فهمت", "Beta": "تجريبي",
    "Pick a game.": "اختر لعبة، أو بدّل الدوري من الأعلى.", "All leagues": "كل الدوريات", "All five leagues": "الدوريات الخمسة الكبرى",
    "Random matches from every league on one big pitch.": "مباريات عشوائية من كل الدوريات على ملعب واحد كبير.", "Mix it up": "خليط من كل شيء", "Any league, any season": "أي دوري، أي موسم",
    "Premier League": "الدوري الإنجليزي الممتاز", "Bundesliga": "الدوري الألماني", "La Liga": "الدوري الإسباني", "Serie A": "الدوري الإيطالي", "Ligue 1": "الدوري الفرنسي", "Star to watch": "نجم يستحق المتابعة",
    "What do you want to play?": "ماذا تريد أن تلعب؟", "ballknowledge originals": "ألعاب ballknowledge الأصلية", "Beat the Model": "تغلّب على النموذج", "Ranked": "التصنيف", "Play online": "العب أونلاين",
    "Live predictions": "توقعات مباشرة", "Live": "مباشر", "Weekly tournament": "بطولة الأسبوع", "Five matches, the same for everyone this week": "خمس مباريات، نفسها للجميع هذا الأسبوع",
    "Call it": "توقّع النتيجة", "Solo, against the model": "فردي، ضد النموذج", "not played yet": "لم تُلعب بعد", "Daily 5": "خمس مباريات اليوم", "not played today": "لم تُلعب اليوم",
    "The same five matches for everyone today. Beat the model and share your result.": "اليوم خمس مباريات نفسها للجميع. تغلّب على النموذج وشارك نتيجتك.",
    "Matchday": "الجولة", "Call a whole round at once and watch the results land one by one.": "توقّع جولة كاملة دفعة واحدة وشاهد النتائج تظهر واحدة تلو الأخرى.",
    "Rapid fire": "الجولة السريعة", "60 seconds. Call as many real matches as you can and beat the model on the same ones.": "60 ثانية. توقّع أكبر عدد من المباريات الحقيقية وتغلّب على النموذج في المباريات نفسها.",
    "Bracket buster": "توقّع الأدوار الإقصائية", "A real Champions League knockout. Pick every tie, round by round, against an Elo model.": "دور إقصائي حقيقي من دوري أبطال أوروبا. اختر المتأهل في كل مواجهة، دورًا بعد دور، ضد نموذج إيلو.",
    "Spot the upset": "اكتشف المفاجأة", "Five real results. Which one did the model think was least likely?": "خمس نتائج حقيقية. أيّها رآها النموذج الأقل احتمالًا؟",
    "Guess the table": "خمّن الترتيب", "Rebuild a final table from last season's, then see you against the model.": "أعد بناء جدول الترتيب النهائي انطلاقًا من الموسم الماضي، ثم قارن نفسك بالنموذج.",
    "Higher or lower": "أعلى أم أقل", "Two clubs, one number. Keep the streak alive.": "ناديان ورقم واحد. حافظ على سلسلتك.", "Challenge a friend": "تحدَّ صديقًا",
    "Five matches, one link. Send it and see who does better.": "خمس مباريات ورابط واحد. أرسله وشاهد من يتوقع أفضل.",
    "Who am I?": "من أنا؟", "Solo streak · 2 players": "سلسلة فردية · لاعبان", "A mystery player. Clues go from obscure to obvious. Buzz in early for more points.": "لاعب غامض. تتدرج التلميحات من الغامض إلى الواضح. اضغط الجرس مبكرًا لتحصل على نقاط أكثر.",
    "Career path": "مسيرة اللاعب", "Every club he played for, in order. Name the player.": "كل الأندية التي لعب لها بالترتيب. من هو اللاعب؟",
    "Name that team": "أي نادٍ هذا؟", "Goals, wins and a stadium size. Which club is it?": "أهداف وانتصارات وسعة ملعب. فما هو النادي؟",
    "Logo blur": "شعار ضبابي", "A blurry badge that sharpens by the second.": "شعار ضبابي يزداد وضوحًا مع كل ثانية.",
    "Where did they finish?": "أين أنهوا الموسم؟", "A club, a season, a slider. How close can you get?": "نادٍ وموسم ومنزلق. إلى أي حد تقترب من الصواب؟",
    "Market value": "القيمة السوقية", "Solo higher or lower · 2 players": "أعلى أم أقل فرديًا · لاعبان", "Who is worth more, a player or a squad? Or both of you guess a value and the closest wins.": "من يساوي أكثر، لاعب أم فريق؟ أو يخمّن كل منكما قيمة ويفوز الأقرب.",
    "Team roulette": "روليت الأندية", "2 players · one device or two": "لاعبان · جهاز واحد أو جهازان", "A club appears. Take turns naming players who played for it. First to blank loses.": "يظهر نادٍ. تناوبا على ذكر لاعبين لعبوا فيه. من يتعثر أولًا يخسر.",
    "Starting XI": "التشكيلة الأساسية", "Solo · 2 to 3 minutes": "فردي · من دقيقتين إلى ثلاث", "Finals, Champions League knockouts, derbies and big games. Name the eleven who started.": "نهائيات وأدوار إقصائية في دوري الأبطال وديربيات ومباريات كبرى. اذكر اللاعبين الأحد عشر الذين بدؤوا المباراة.",
    "Who did it": "من فعلها؟", "Solo": "فردي", "A big match and its highlights by minute. Name the scorers, assisters, penalty takers and who was sent off.": "مباراة شهيرة ولقطاتها دقيقة بدقيقة. اذكر المسجّلين وصنّاع الأهداف ومنفّذي ركلات الجزاء والبطاقات الحمراء.",
    "Scramble": "حروف مبعثرة", "A club, player or manager with the letters shuffled. Unscramble it before your rival does.": "اسم نادٍ أو لاعب أو مدرب بحروف مبعثرة. رتّبه قبل خصمك.",
    "Basketball tic-tac-toe": "إكس أو كرة القدم", "2 players": "لاعبان", "Name a player who fits the row and the column. Three in a row wins.": "اذكر لاعبًا يناسب الصف والعمود. ثلاثة في خط واحد تفوز.",
    "How Ranked works": "كيف يعمل التصنيف", "Play real people online. Create a lobby and others can join from the list.": "العب أونلاين ضد أشخاص حقيقيين. أنشئ غرفة ويمكن للآخرين الانضمام من القائمة.",
    "Create an account or sign in": "أنشئ حسابًا أو سجّل الدخول", "Your rating.": "تصنيفك.", "This week": "هذا الأسبوع", "30 days": "30 يومًا", "This season": "هذا الموسم",
    "Settings": "الإعدادات", "Sound": "الصوت", "Effects for taps, buzzers and results.": "مؤثرات للنقرات والأهداف والنتائج.", "Off": "إيقاف", "Soft": "هادئ", "Full": "كامل", "Music": "الموسيقى",
    "A calm loop in menus and a livelier one during games. Needs sound to be on.": "لحن هادئ في القوائم وآخر أكثر حيوية أثناء المباريات. يلزم تشغيل الصوت.", "On": "تشغيل", "Language": "اللغة",
    "Appearance": "المظهر", "Theme, text size, contrast and reduced motion are in your profile.": "المظهر وحجم الخط والتباين وتقليل الحركة في ملفك الشخصي.", "Open profile": "افتح الملف الشخصي",
    "About ballknowledge": "عن ballknowledge", "Our story": "قصتنا", "How the model works": "كيف يعمل النموذج", "Honest limits and sources": "حدود صريحة ومصادر", "Roadmap and votes": "خارطة الطريق والتصويت",
    "How it grew": "كيف كبر المشروع", "Who builds it": "من يبنيه", "Roadmap": "خارطة الطريق", "Shipped": "تم", "Next": "التالي", "Later": "لاحقًا", "Your ideas": "أفكارك",
    "Suggest a feature, a game or a badge. Vote for the ones you like.": "اقترح ميزة أو لعبة أو شارة، وصوّت لما يعجبك.", "Feature": "ميزة", "Badge": "شارة", "Game": "لعبة", "Other": "أخرى", "Suggest": "اقترح",
    "What we do not have": "ما لا نملكه", "Sources": "المصادر", "Profile": "الملف الشخصي", "Guest": "ضيف", "Elo": "إيلو", "day streak": "أيام متتالية", "achievements": "إنجازات", "Edit profile": "تعديل الملف",
    "Profile picture": "صورة الملف", "Favourite player": "اللاعب المفضل", "Favourite team": "الفريق المفضل", "None": "لا شيء", "Elo history": "سجل إيلو", "Friends": "الأصدقاء", "Style": "النمط", "Minimal": "بسيط", "Classic": "كلاسيكي",
    "Theme": "المظهر", "Dark": "داكن", "Light": "فاتح", "Auto": "تلقائي", "Text size": "حجم الخط", "Small": "صغير", "Normal": "عادي", "Large": "كبير", "Extra large": "كبير جدًا", "Sunday League": "دوري الأحد", "Pub Team": "فريق الحي", "Academy": "الأكاديمية", "Reserves": "الاحتياط", "First Team": "الفريق الأول", "Captain": "القائد", "Club Legend": "أسطورة النادي", "World Class": "مستوى عالمي",
    "Coming later": "قريبًا", "Champions League": "دوري أبطال أوروبا", "Report a problem": "أبلغ عن مشكلة", "Report a wrong answer": "أبلغ عن إجابة خاطئة", "Weekly regular": "منتظم الأسبوع", "Weekly champion": "بطل الأسبوع"
  },
};
const I18N_EN = (() => { const m = {}; Object.values(I18N).forEach((d) => Object.entries(d).forEach(([en, tr]) => { m[tr] = en; })); return m; })();
let LANGC = "en";
function i18nOne(s, lang) { const k = s.trim(); if (!k) return s; const en = I18N_EN[k] || k, t = lang === "en" ? en : (I18N[lang] || {})[en]; return t && t !== k ? s.replace(k, t) : (lang === "en" && en !== k ? s.replace(k, en) : s); }
function i18nWalk(root) {
  if (!root) return; const lang = LANGC;
  if (root.nodeType === 3) { const v = i18nOne(root.nodeValue, lang); if (v !== root.nodeValue) root.nodeValue = v; return; }
  if (root.nodeType !== 1 || ["SCRIPT", "STYLE", "TEXTAREA", "INPUT"].includes(root.tagName) && !root.placeholder) { if (root.nodeType === 1 && root.placeholder) { const v = i18nOne(root.placeholder, lang); if (v !== root.placeholder) root.placeholder = v; } return; }
  ["title", "aria-label", "placeholder"].forEach((a) => { const o = root.getAttribute && root.getAttribute(a); if (o) { const v = i18nOne(o, lang); if (v !== o) root.setAttribute(a, v); } });
  for (let c = root.firstChild; c; c = c.nextSibling) i18nWalk(c);
}
let i18nBusy = false;
const i18nObs = new MutationObserver((ms) => { if (LANGC === "en" && !document.documentElement.dataset.i18nDirty) return; if (i18nBusy) return; i18nBusy = true; requestAnimationFrame(() => { ms.forEach((m) => { if (m.type === "characterData") i18nWalk(m.target); else m.addedNodes.forEach((n) => i18nWalk(n)); }); i18nBusy = false; }); });
function applyLang(code) {
  LANGC = (LANGS.find((l) => l[0] === code) || LANGS[0])[0]; const dir = (LANGS.find((l) => l[0] === LANGC) || LANGS[0])[2];
  const d = document.documentElement; d.setAttribute("lang", LANGC); d.setAttribute("dir", dir); if (LANGC !== "en") d.dataset.i18nDirty = "1";
  i18nWalk(document.body);
}
i18nObs.observe(document.body, { childList: true, subtree: true, characterData: true });

/* ================= Discover: Daily feed and Who's your club? ================= */
const dfDays = (p) => p.dfDone || {};
function dfStreak(p) { let s = 0; const now = Date.now(), L = dfDays(p); for (let k = 0; k < 400; k++) { const key = new Date(now - k * 864e5).toISOString().slice(0, 10); if (L[key]) s++; else if (k > 0) break; } return s; }
function showDiscover(ev) {
  S.code = null; S.mode = null; S.cur = null; setTheme("HOME", ev); ["#home", "#lobby", "#league", "#profilePage", "#albumPage", "#adminPage", "#aboutPage", "#setPage"].forEach((s) => { $(s).hidden = true; }); $("#discPage").hidden = false; window.scrollTo(0, 0);
  S.dcTab = S.dcTab || "feed"; renderDiscover();
}
let CLUBSTAT = null;
function clubStats() {
  if (CLUBSTAT) return CLUBSTAT; const m = {};
  ORDER.forEach((lg) => { const seasons = Object.keys(lgOf(lg).seasons).sort().slice(-5); seasons.forEach((sn) => lgOf(lg).seasons[sn].matches.forEach((x) => { const [, h, a, hg, ag, res] = x, hp = res === "H" ? 3 : res === "D" ? 1 : 0, ap = res === "A" ? 3 : res === "D" ? 1 : 0;
    [[h, hg, ag, hp, true], [a, ag, hg, ap, false]].forEach(([c, gf, ga, pts, home]) => { const s = m[c] || (m[c] = { lg, n: 0, gf: 0, ga: 0, pts: 0, hpts: 0, d: 0, one: 0 }); s.n++; s.gf += gf; s.ga += ga; s.pts += pts; if (home) s.hpts += pts; if (gf === ga) s.d++; if (Math.abs(gf - ga) === 1) s.one++; }); })); });
  const rows = Object.entries(m).filter(([, s]) => s.n >= 100).map(([c, s]) => ({ c, lg: s.lg, n: s.n, gf: s.gf / s.n, ga: s.ga / s.n, tot: (s.gf + s.ga) / s.n, ppg: s.pts / s.n, home: s.pts ? s.hpts / s.pts : 0.5, draw: s.d / s.n, close: s.one / s.n }));
  const ax = ["gf", "ga", "tot", "ppg", "home", "draw", "close"], st = {}; ax.forEach((k) => { const v = rows.map((r) => r[k]), mu = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) * (b - mu), 0) / v.length) || 1; st[k] = [mu, sd]; });
  rows.forEach((r) => { r.z = {}; ax.forEach((k) => { r.z[k] = (r[k] - st[k][0]) / st[k][1]; }); });
  return (CLUBSTAT = rows);
}
const CLUBQ = [
  ["Your perfect final score is…", [["A 4-3 thriller", { tot: 1.4, gf: 0.8 }], ["A 2-1 win", { tot: 0.1 }], ["A 1-0 squeak", { tot: -1.1, ga: -0.6 }], ["A 3-0 stroll", { gf: 0.8, ga: -0.8, ppg: 0.8 }]]],
  ["Your team is 1-0 up at half-time. You want them to…", [["Go for the second goal", { gf: 1, tot: 0.6 }], ["Shut the game down", { ga: -1, tot: -0.8 }], ["Just not mess it up", { close: 0.8 }]]],
  ["Which supporter are you?", [["Title or bust", { ppg: 1.4 }], ["European places would be lovely", { ppg: 0.5 }], ["Mid-table and proud", { ppg: -0.2 }], ["Survival is a trophy", { ppg: -1.1 }]]],
  ["Where does your team shine?", [["A fortress at home", { home: 1.2 }], ["Winning on the road", { home: -1.2 }], ["Wherever, as long as they win", { ppg: 0.6 }]]],
  ["How do you feel about draws?", [["Love a tense 1-1", { draw: 1.2, close: 0.6 }], ["Hate them. Win or lose", { draw: -1.2 }], ["A point is a point", { draw: 0.2 }]]],
  ["Pick a game plan", [["Open attacking football, risk and all", { gf: 1, ga: 0.6, tot: 1 }], ["Tight at the back, pounce on mistakes", { ga: -1, gf: -0.2 }], ["Dominate and win by a few", { gf: 0.9, ga: -0.9, ppg: 1 }]]],
];
function clubMatch(answers) {
  const w = {}, tgt = {}, n = {}; answers.forEach((a) => { Object.entries(a).forEach(([k, v]) => { tgt[k] = (tgt[k] || 0) + v; n[k] = (n[k] || 0) + 1; }); }); Object.keys(tgt).forEach((k) => { tgt[k] /= n[k]; w[k] = n[k]; });
  return clubStats().map((r) => ({ r, d: Object.keys(tgt).reduce((s, k) => s + w[k] * Math.pow(r.z[k] - tgt[k], 2), 0) })).sort((a, b) => a.d - b.d).slice(0, 3).map((x) => x.r);
}
function dailyData() {
  const key = todayKey(), rng = mulberry(hash("daily-feed-" + key)), pool = allMatches("ALL"), mmdd = key.slice(5), out = {};
  let same = pool.filter((x) => x.m[0].slice(5) === mmdd && x.m[0].slice(0, 4) < key.slice(0, 4)); same.sort((a, b) => (b.m[3] + b.m[4]) - (a.m[3] + a.m[4]) || (a.m[0] < b.m[0] ? 1 : -1)); out.same = same.slice(0, 4);
  const lg = ORDER[Math.floor(rng() * ORDER.length)], all = allMatches(lg), kind = rng() < 0.5 ? "win" : "goals";
  out.rec = kind === "win" ? all.reduce((b, x) => (Math.abs(x.m[3] - x.m[4]) > Math.abs(b.m[3] - b.m[4]) ? x : b), all[0]) : all.reduce((b, x) => (x.m[3] + x.m[4] > b.m[3] + b.m[4] ? x : b), all[0]); out.recKind = kind; out.recLg = lg;
  const ps = QZ.players.filter((p) => p.active && p.hist.length >= 2 && FAME.get(p.id) < 400 && p.nat && p.club && p.comp in LG_OF_COMP);
  const p = ps[Math.floor(rng() * ps.length)], t = Math.floor(rng() * 3);
  out.spot = p;
  if (t === 0) { const nats = [...new Set(ps.map((x) => x.nat))].filter((n) => n !== p.nat); const opts = [p.nat]; while (opts.length < 4) { const c = nats[Math.floor(rng() * nats.length)]; if (!opts.includes(c)) opts.push(c); } out.q = { text: `Which country does ${p.n} play for?`, opts: opts.sort(), ans: p.nat, note: `${p.n} is ${p.nat === "England" ? "English" : "from " + p.nat} and plays for ${p.club}.` }; }
  else if (t === 1) { const same = [...new Set(ps.filter((x) => x.comp === p.comp && x.club !== p.club).map((x) => x.club))], opts = [p.club]; while (opts.length < 4 && same.length) { const c = same.splice(Math.floor(rng() * same.length), 1)[0]; opts.push(c); } out.q = { text: `Which club does ${p.n} play for?`, opts: opts.sort(), ans: p.club, note: `${p.n} plays for ${p.club} (${lgOf(LG_OF_COMP[p.comp]).name}).` }; }
  else { let o = ps[Math.floor(rng() * ps.length)]; for (let k = 0; k < 30 && (o.id === p.id || o.dob === p.dob); k++) o = ps[Math.floor(rng() * ps.length)]; const older = p.dob < o.dob ? p : o; out.q = { text: `Who is older: ${p.n} or ${o.n}?`, opts: [p.n, o.n], ans: older.n, note: `${older.n} was born on ${fmtDate(older.dob)}.` }; }
  return out;
}
function renderDiscover() {
  const el = $("#discPage"), tab = S.dcTab, nav = `<div class="scope" style="padding:2px 0"><button type="button" class="chip" data-dctab="feed" aria-pressed="${tab === "feed"}">Daily feed</button><button type="button" class="chip" data-dctab="club" aria-pressed="${tab === "club"}">Who's your club?</button></div>`;
  let body = "";
  if (tab === "feed") {
    const d = (S.df = S.df && S.df.key === todayKey() ? S.df : { key: todayKey(), ...dailyData(), pick: null }), p = prof(), done = (dfDays(p)[d.key] ? true : false) || d.pick != null, st = dfStreak(p), sp = d.spot, yrs = (x) => new Date().getFullYear() - +x.m[0].slice(0, 4);
    const fmtM = (x) => `${esc(x.m[1])} <b class="num">${x.m[3]}-${x.m[4]}</b> ${esc(x.m[2])} <span class="fine">(${esc(lgOf(x.c).name)}, ${fmtDate(x.m[0])})</span>`;
    body = `<div class="card abx"><div class="row" style="justify-content:space-between"><h2>Today in football</h2><span class="chip2"><svg class="ic fire"><use href="#i-flame"></use></svg> <b class="num">${st}</b> day${st === 1 ? "" : "s"} in a row</span></div><div class="fine">${fmtDate(d.key)}. Everything here comes from real results and player records, and it is the same for everyone today.</div>
      <h3>On this day</h3>${d.same.length ? `<ul>${d.same.map((x) => `<li>${yrs(x)} years ago: ${fmtM(x)}</li>`).join("")}</ul>` : '<div class="fine">No match in our five leagues on this date since 2001-02.</div>'}
      <h3>Record check</h3><p>${d.recKind === "win" ? "The biggest win" : "The match with the most goals"} in the ${esc(lgOf(d.recLg).name)} since 2001-02: ${fmtM(d.rec)}.</p>
      <h3>Player spotlight</h3><div class="row" style="gap:12px">${playerPic(sp, "lg")}<div><b style="font-size:20px">${esc(sp.n)}</b><div class="fine">${flagOf(sp.nat)} ${esc(sp.nat)} · ${esc(sp.sub || sp.pos)} · ${esc(sp.club)}</div><div class="fine">${ageOf(sp)} years old${sp.h ? ` · ${sp.h} cm` : ""}${sp.foot ? ` · ${sp.foot}-footed` : ""}${sp.caps ? ` · ${sp.caps} caps` : ""}</div></div></div>
      <h3>Question of the day</h3><p><b>${esc(d.q.text)}</b></p><div class="dfopts">${d.q.opts.map((o) => `<button type="button" class="btn ${done ? (o === d.q.ans ? "" : "ghost") : "ghost"}" data-dfq="${esc(o)}" ${done ? "disabled" : ""}>${esc(o)}${done && o === d.q.ans ? " ✓" : ""}</button>`).join("")}</div>
      ${done ? `<div class="rcard on" style="margin-top:10px"><b>${d.pick == null ? "Already answered today." : d.pick === d.q.ans ? "Correct!" : `Not quite: ${esc(d.q.ans)}.`}</b><div class="fine">${esc(d.q.note)}</div><div class="row" style="margin-top:8px"><button class="btn ghost" id="dfShare" type="button">Copy to share</button></div></div>` : ""}</div>`;
  } else {
    const a = S.cq || (S.cq = { i: 0, ans: [], res: null });
    if (a.res) body = `<div class="card abx"><h2>Your club</h2><p class="sub">Based on how you like a game to feel, here are the clubs whose last five seasons fit you best.</p><div class="lbx">${a.res.map((r, k) => `<div class="lbrow" style="grid-template-columns:auto 1fr;gap:12px;padding:12px;border-radius:14px;background:var(--surface2)">${badge(r.c, "lg")}<div><b style="font-size:${k ? 17 : 24}px">${k === 0 ? "You are a " : ""}${esc(r.c)} fan</b><div class="fine">${esc(lgOf(r.lg).name)} · ${r.gf.toFixed(2)} goals scored and ${r.ga.toFixed(2)} conceded a game · ${r.ppg.toFixed(2)} points a game · ${Math.round(r.draw * 100)}% draws (last five seasons)</div></div></div>`).join("")}</div><div class="row" style="margin-top:12px"><button class="btn" id="cqAgain" type="button">Take it again</button><button class="btn ghost" id="cqShare" type="button">Copy to share</button></div><div class="fine" style="margin-top:8px">A fun match, not a prediction: it compares your answers with each club's real record, not with a personality.</div></div>`;
    else { const q = CLUBQ[a.i]; body = `<div class="card abx"><h2>Who's your club?</h2><p class="sub">Six quick questions about how you like football. We match you with clubs by their real record from the last five seasons.</p><div class="qhud"><span class="label">Question ${a.i + 1} of ${CLUBQ.length}</span></div><p><b style="font-size:20px">${esc(q[0])}</b></p><div class="dfopts">${q[1].map((o, k) => `<button type="button" class="btn ghost" data-cq="${k}">${esc(o[0])}</button>`).join("")}</div></div>`; }
  }
  el.innerHTML = `<div class="row" style="margin-bottom:8px"><button class="btn ghost" id="aboutBack" type="button">← Menu</button><h1 style="font-size:28px">Discover</h1></div>${nav}${body}`;
}

/* ================= About: story, how it works, honest limits, roadmap with votes ================= */
const ABOUT_TABS = [["story", "Our story"], ["how", "How the model works"], ["limits", "Honest limits and sources"], ["road", "Roadmap and votes"]];
const ROADMAP = [
  ["done", "Scramble, Starting XI, Rapid fire and Bracket buster", "Nine games in each group."],
  ["done", "Badges, weekly tournament, report a wrong answer", "Plus real match facts for managers, titles and cups."],
  ["next", "Settings page with sound and music", "Moves the sound and music buttons out of the header."],
  ["next", "German, French and Arabic", "Written to sound natural and football-minded, with right-to-left layout for Arabic."],
  ["next", "Daily feed and Who's your club?", "One fun stat or question a day, and a quiz that matches you to a club."],
  ["next", "Who did it: guess the highlights", "Needs real goal, assist and card events for past matches."],
  ["later", "Ranked and Live merged into one Play online hub", "Fewer tiles on the menu."],
  ["later", "Login streak next to your profile", "A small fire counter for consecutive days."],
];
const IDEA_KINDS = [["feature", "Feature"], ["badge", "Badge"], ["game", "Game"], ["other", "Other"]];
function poisson(k, l) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
function poissonGrid(lh, la) { const N = 9, g = []; let H = 0, D = 0, A = 0; for (let i = 0; i < N; i++) { g[i] = []; for (let j = 0; j < N; j++) { const p = poisson(i, lh) * poisson(j, la); g[i][j] = p; if (i > j) H += p; else if (i === j) D += p; else A += p; } } const t = H + D + A; return { H: H / t, D: D / t, A: A / t, g }; }
function showAbout(ev) {
  S.code = null; S.mode = null; S.cur = null; setTheme("HOME", ev); ["#home", "#lobby", "#league", "#profilePage", "#albumPage", "#adminPage", "#setPage", "#discPage"].forEach((s) => { $(s).hidden = true; }); $("#aboutPage").hidden = false; window.scrollTo(0, 0);
  S.abTab = S.abTab || "story"; renderAboutPage();
}
function renderAboutPage() {
  const tab = S.abTab, el = $("#aboutPage"), sm = DATA.summary.ALL, a = DATA.about || {}, au = DATA.audit;
  const nav = `<div class="scope" style="padding:2px 0">${ABOUT_TABS.map(([k, n]) => `<button type="button" class="chip" data-abtab="${k}" aria-pressed="${tab === k}">${n}</button>`).join("")}</div>`;
  let body = "";
  if (tab === "story") {
    const why = String(a.why || "").trim();
    body = `<div class="card abx"><h2>Our story</h2>
      <p>ballknowledge started as one plain question: <b>can a computer beat "always pick the home team" at predicting football results?</b> The first version, in spring 2026, was one Premier League season of match data and a rule that never changed: a forecast may only use what was known <i>before</i> kickoff.</p>
      ${why ? `<div class="abwhy">${esc(why).split(/\n\s*\n/).map((p) => `<p>${p}</p>`).join("")}<div class="fine">In the owner's words.</div></div>` : ""}
      <h3>How it grew</h3><ol class="abtl">
        <li><b>30 April to July</b> One season became ten (about 3,800 matches), then the first models: Random Forest, Gradient Boosting, XGBoost, LightGBM and CatBoost side by side.</li>
        <li><b>A number that felt great</b> Gradient Boosting hit 57.1% on one season, which felt great for about a month.</li>
        <li><b>28 August: the audit</b> Going back through everything, the 57% did not survive. Some inputs were betting-market columns that already contain the answer, and one season file was a copy of another. Fixing that gave an honest, lower number. It set the tone of the whole project: tested on matches the model never saw, and rejected ideas written down instead of hidden.</li>
        <li><b>September to mid-November</b> A break for exams and study, with no changes.</li>
        <li><b>13 to 15 November</b> Back with the new season under way: a live season, then the Bundesliga, La Liga, Serie A and Ligue 1, title-race odds from 20,000 simulations per league, and the first interactive page.</li>
        <li><b>Since</b> A game site around the model: ball-knowledge games, online rooms and Elo-rated matches, accounts and leaderboards, live predictions, and the name ballknowledge on 16 November.</li></ol>
      <h3>Who builds it</h3><p>ballknowledge is built by <b>moisback22</b>, a student. Most of the engineering was done in pair-programming sessions with Claude Code (credited in the commits); what to test, what to keep and what to throw away are the owner's decisions. It is an independent project, not affiliated with any league, club or player. The full project log is in the repository: github.com/mosoliman517-sudo/football-prediction-model</p></div>`;
  } else if (tab === "how") {
    body = `<div class="card abx"><h2>How the model works</h2>
      <p>The model looks at one match and gives three probabilities: Home win, Draw, Away win. Here are its ingredients in plain language, with two small tools to play with.</p>
      <h3>1. Only the past</h3><p>Recent form, goals, shots, rest days, how strong the last opponents were, and a rating for each club. Everything is computed only from matches played before the one being predicted.</p>
      <h3>2. Ratings (Elo)</h3><p>Every club has a number. Beat a strong club and your number rises a lot; beat a weak one and it barely moves. The chance that club A beats club B depends only on the gap: <b>1 / (1 + 10<sup>(Rb − Ra)/400</sup>)</b>. The model's own rating also looks at the size of the win, but the idea is the same. Try it:</p>
      <div class="abtool"><label>Home rating <b id="abEA">1550</b><input type="range" id="abRA" min="1000" max="2000" value="1550"></label><label>Away rating <b id="abEB">1500</b><input type="range" id="abRB" min="1000" max="2000" value="1500"></label><div class="fine" id="abEloOut"></div></div>
      <h3>3. Goals (Poisson)</h3><p>Goals are rare and random, so a classic way to model them is the Poisson distribution: if a team is expected to score 1.6 goals, the chance of exactly 0, 1, 2, 3 goals follows a fixed pattern. Put two teams' expectations together and you get the chance of every score, and so of Home, Draw and Away. Try it:</p>
      <div class="abtool"><label>Home expected goals <b id="abLH">1.6</b><input type="range" id="abPH" min="2" max="40" value="16"></label><label>Away expected goals <b id="abLA">1.1</b><input type="range" id="abPA" min="2" max="40" value="11"></label><div id="abPoisOut"></div></div>
      <h3>4. Putting it together</h3><p>Several models (tree-based learners on the form and rating inputs, plus the goal model) are blended, and the blend only keeps what also helps on data it has not seen. Many plausible ideas were tested and thrown out because both models did not agree they helped.</p>
      <h3>5. The honest test</h3><p>Walk-forward: for each season, the model is trained on <i>earlier</i> seasons only, then predicts that season. Over <b>${sm.n.toLocaleString()}</b> matches since 2001-02 it gets <b>${pct(sm.pooled_acc, 1)}</b> of results right, the bookmakers' closing odds <b>${pct(sm.market_acc, 1)}</b>, and always picking the home team <b>${pct(sm.home_acc, 1)}</b>. Picking randomly gets 33%. The market is slightly better because it knows lineups, injuries and news that results alone do not show.</p>
      <h3>6. Two playing styles</h3><p><b>Max Accuracy</b> always picks the most likely result, so it almost never calls draws. <b>Balanced</b> also calls draws and away wins so its picks look like real results, at the cost of a little accuracy.</p></div>`;
  } else if (tab === "limits") {
    const hidden = QZ.players.filter((p) => p.mv && p.pd && p.pd < p.mv).length, thin = QZ.players.filter((p) => p.hist.length < 2).length;
    body = `<div class="card abx"><h2>Honest limits and sources</h2>
      <p>Nothing here is guaranteed to be 100% right, and the page tries to say so wherever it matters. What we know and do not know:</p>
      <div class="tiles"><div class="tile"><b class="num">${sm.n.toLocaleString()}</b><small>matches the model was tested on</small></div><div class="tile"><b class="num">${QZ.players.length.toLocaleString()}</b><small>players in the quiz data</small></div><div class="tile"><b class="num">${XI.length}</b><small>matches with starting elevens</small></div><div class="tile"><b class="num">${au ? au.facts : "–"}</b><small>certain facts checked${au ? ` (${au.wrong} wrong, ${au.ran})` : ""}</small></div></div>
      <h3>What we do not have</h3><ul>
        <li>Managers, league titles, cup wins and "played with" cover 2012-13 onward only; the labels say so. Older careers use transfer dates.</li>
        <li>${thin} players have fewer than two clubs on record (the transfer file has nothing for some, such as Bale), so they are left out of tic-tac-toe and Team roulette.</li>
        <li>Some starting elevens (finals before 2013-14) come from Wikipedia and cover 2000 to 2013 only; the League Cup and Coupe de France are not covered at all.</li>
        <li>${hidden.toLocaleString()} player photos were taken before the player's latest move and show his previous club's shirt. They are still shown (an older picture beats none).</li>
        <li>Seven clubs have no theme colours; Ligue 1 2019-20 is left out because the Covid-cut season is incomplete.</li>
        <li>The Bracket buster "model" is a simple Elo rating, not the main match model.</li>
        <li>Transfer data is a snapshot that is refreshed against Wikidata; a very recent move can still be missing. Use Report a wrong answer when you spot one.</li></ul>
      <h3>Sources</h3><ul><li>Results and bookmaker odds: football-data.co.uk. Expected goals (Premier League): Understat.</li><li>Players, transfers, market values, appearances and lineups: the Transfermarkt dataset on Kaggle (CC0). Awards and tournament squads: Wikidata (CC0). Finals before 2013-14: Wikipedia (CC BY-SA).</li><li>Badges, logos and photos belong to their owners and appear only to identify clubs and players. Photos come from the Premier League's official feed, Transfermarkt, EA SPORTS FC, Wikimedia Commons and TheSportsDB.</li></ul></div>`;
  } else {
    body = `<div class="card abx"><h2>Roadmap</h2><div class="lbx">${ROADMAP.map(([st, t, d]) => `<div class="lbrow rmrow"><span class="rmst ${st}">${st === "done" ? "Shipped" : st === "next" ? "Next" : "Later"}</span><span><b>${esc(t)}</b><div class="fine">${esc(d)}</div></span></div>`).join("")}</div></div>
      <div class="card abx"><div class="row" style="justify-content:space-between"><h2>Your ideas</h2><span class="fine">Suggest a feature, a game or a badge. Vote for the ones you like.</span></div>
      <div class="row" style="margin-top:8px"><select id="ideaKind" aria-label="Kind">${IDEA_KINDS.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select><input id="ideaTitle" maxlength="80" placeholder="Your idea in one line" aria-label="Your idea"><button class="btn" id="ideaSend" type="button">Suggest</button></div>
      <textarea id="ideaBody" maxlength="300" rows="2" placeholder="Optional: a bit more detail (for a badge: its name and how you earn it)" aria-label="Details" style="width:100%;margin-top:8px;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:500 14px var(--sans, system-ui)"></textarea>
      <div id="ideaList" class="lbx" style="margin-top:12px">${skelRows(3)}</div></div>`;
  }
  el.innerHTML = `<div class="row" style="margin-bottom:8px"><button class="btn ghost" id="aboutBack" type="button">← Menu</button><h1 style="font-size:28px">About ballknowledge</h1></div>${nav}${body}`;
  if (tab === "how") updateAboutTools(); if (tab === "road") loadIdeas();
}
function updateAboutTools() {
  const g = (id) => $("#" + id); if (!g("abRA")) return;
  const ra = +g("abRA").value, rb = +g("abRB").value; g("abEA").textContent = ra; g("abEB").textContent = rb;
  const e = 1 / (1 + Math.pow(10, -(ra + 60 - rb) / 400)); g("abEloOut").innerHTML = `With a 60-point home edge, the home side is expected to score <b>${(e * 100).toFixed(0)}%</b> (a win counts 1, a draw one half). If it wins, its rating rises by about <b>${(20 * (1 - e)).toFixed(1)}</b> and the away side's falls by the same; if it loses it drops by about <b>${(20 * e).toFixed(1)}</b>.`;
  const lh = +g("abPH").value / 10, la = +g("abPA").value / 10; g("abLH").textContent = lh.toFixed(1); g("abLA").textContent = la.toFixed(1);
  const r = poissonGrid(lh, la), top = []; r.g.forEach((row, i) => row.forEach((p, j) => top.push([i, j, p]))); top.sort((x, y) => y[2] - x[2]);
  g("abPoisOut").innerHTML = `<div class="pbar" style="--c:var(--home)"><span class="label">Home win</span><div class="track"><div class="fill" style="width:${(r.H * 100).toFixed(0)}%"></div></div><span class="num">${pct(r.H)}</span></div><div class="pbar" style="--c:var(--draw)"><span class="label">Draw</span><div class="track"><div class="fill" style="width:${(r.D * 100).toFixed(0)}%"></div></div><span class="num">${pct(r.D)}</span></div><div class="pbar" style="--c:var(--away)"><span class="label">Away win</span><div class="track"><div class="fill" style="width:${(r.A * 100).toFixed(0)}%"></div></div><span class="num">${pct(r.A)}</span></div><div class="fine">Most likely scores: ${top.slice(0, 4).map((x) => `${x[0]}-${x[1]} (${(x[2] * 100).toFixed(0)}%)`).join(", ")}</div>`;
}
async function loadIdeas() {
  const box = $("#ideaList"); if (!box) return;
  const res = Board.mode === "rest" ? await Ranked.rpcx("list_ideas", {}) : { ok: false, why: "This build has no database connection." };
  if (!res.ok && !Account.signedIn) { const r2 = await Ranked.rpc("list_ideas", {}); if (Array.isArray(r2)) { res.ok = true; res.data = r2; } }
  if (!$("#ideaList")) return;
  if (!res.ok) { box.innerHTML = `<div class="fine">Ideas are not available yet. ${esc(res.why || "")}</div>`; return; }
  const rows = Array.isArray(res.data) ? res.data : [], badgeOnly = false;
  box.innerHTML = rows.length ? rows.map((r) => `<div class="lbrow idearow"><button type="button" class="vote ${r.mine ? "on" : ""}" data-vote="${r.id}" aria-pressed="${!!r.mine}" title="Vote"><b>${r.votes}</b><small>${r.mine ? "voted" : "vote"}</small></button><span><b>${esc(r.title)}</b> <span class="chip2">${esc((IDEA_KINDS.find((k) => k[0] === r.kind) || [, r.kind])[1])}</span>${r.status !== "open" ? ` <span class="rmst ${r.status === "done" ? "done" : "next"}">${esc(r.status)}</span>` : ""}${r.body ? `<div class="fine">${esc(r.body)}</div>` : ""}<div class="fine">${r.nick ? "by " + esc(r.nick) : ""}</div>${Admin.is ? `<div class="row" style="gap:6px;margin-top:4px">${["planned", "done", "declined", "open"].map((s) => `<button type="button" class="chip" data-ideast="${r.id}|${s}" style="padding:2px 8px;font-size:11px">${s}</button>`).join("")}</div>` : ""}</span></div>`).join("") : '<div class="fine">No ideas yet. Be the first.</div>';
}
function updateAboutOnInput(t) { if (["abRA", "abRB", "abPH", "abPA"].includes(t.id)) updateAboutTools(); }
function curLang() { try { return localStorage.getItem("bkn_lang") || "en"; } catch (e) { return "en"; } }

/* ================= Admin (only accounts listed in the admins table) ================= */
const Admin = { is: false, role: null, users: [], q: "" };
async function checkAdmin() { if (!Account.signedIn || Board.mode !== "rest") { Admin.is = false; Admin.role = null; paintAdminBtn(); return; } const r = await Ranked.rpc("is_admin"); Admin.is = r === true; const ro = Admin.is ? await Ranked.rpc("my_role") : null; Admin.role = Admin.is ? (ro === "owner" ? "owner" : "admin") : null; paintAdminBtn(); paintProfileBtn(); }
function paintAdminBtn() { const b = $("#adminBtn"); if (b) b.hidden = !Admin.is; }
function showAdmin(ev) {
  if (!Admin.is) { toast("Admin only"); go(""); return; }
  S.code = null; S.mode = null; setTheme("HOME", ev); ["#home", "#lobby", "#league", "#profilePage", "#albumPage"].forEach((s) => { $(s).hidden = true; }); $("#adminPage").hidden = false; window.scrollTo(0, 0); renderAdmin();
}
async function renderAdmin() {
  const el = $("#adminPage"); const ref = (Board.cfg && Board.cfg.url || "").replace(/^https?:\/\//, "").split(".")[0];
  const has = (f) => QZ.players.filter(f).length, n = QZ.players.length;
  el.innerHTML = `<nav class="crumbs"><button class="back" data-crumb="menu" type="button">← Menu</button><div class="trail"><span class="crumb cur">Admin</span></div></nav>
  <div class="card"><div class="row" style="justify-content:space-between"><h2><svg class=ic><use href=#i-shield></use></svg> Admin</h2><span class="fine">Visible only to you</span></div><div id="admStats" class="tiles">${skelRows(2)}</div></div>
  <div class="card"><h3>Sign-ups, last 14 days</h3><div id="admChart">${skelRows(1)}</div></div>
  <div class="card"><div class="row" style="justify-content:space-between"><h3>Reports</h3><span class="fine" id="admRepN"></span></div><div id="admReports" class="lbx">${skelRows(2)}</div></div>
  <div class="card"><div class="row" style="justify-content:space-between"><h3>Accounts</h3><div class="row"><input id="admQ" placeholder="Search name or email" aria-label="Search accounts" style="padding:9px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink)"><button class="btn ghost" id="admCsv" type="button">Export CSV</button></div></div><div id="admUsers" class="admtable">${skelRows(4)}</div></div>
  <div class="card"><h3>Data health</h3><div class="tiles"><div class="tile"><b class="num">${n.toLocaleString()}</b><small>players in the quiz data</small></div><div class="tile"><b class="num">${has((p) => p.ea)}</b><small>with an EA portrait</small></div><div class="tile"><b class="num">${has((p) => !p.ea && (p.im || p.iu))}</b><small>other photo only</small></div><div class="tile"><b class="num">${has((p) => !p.ea && !p.im && !p.iu && !p.ph)}</b><small>no photo</small></div><div class="tile"><b class="num">${has((p) => p.pq === "fpl")}</b><small>official current-season photos</small></div><div class="tile"><b class="num">${has((p) => p.pq === "tm")}</b><small>Transfermarkt photos</small></div><div class="tile"><b class="num">${Object.keys(QZ.clubs).length}</b><small>clubs</small></div><div class="tile"><b class="num">${Object.keys(LG.E0.seasons).length}</b><small>Premier League seasons</small></div></div>
  ${ref ? `<div class="row" style="margin-top:12px"><a class="btn ghost" href="https://supabase.com/dashboard/project/${esc(ref)}" target="_blank" rel="noopener">Open Supabase</a><a class="btn ghost" href="https://github.com/mosoliman517-sudo/football-prediction-model/actions" target="_blank" rel="noopener">Sync workflow runs</a></div>` : ""}</div>`;
  const st = await Ranked.rpc("admin_stats"); if (!$("#admStats")) return;
  if (!st) { $("#admStats").innerHTML = '<div class="fine">Admin data needs schema_v6.sql, and your account must be in the admins table.</div>'; return; }
  const tile = (v, l) => `<div class="tile"><b class="num">${v}</b><small>${l}</small></div>`, ago = (iso) => { if (!iso) return "never"; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
  $("#admStats").innerHTML = tile(st.accounts, "accounts") + tile(st.new_7d, "new this week") + tile(st.active_7d, "active in 7 days") + tile(st.active_30d, "active in 30 days") + tile(st.rated, "rated players") + tile(st.ranked_matches, "ranked matches") + tile(st.predictions, "live predictions") + tile(st.open_lobbies, "open lobbies") + tile(st.friend_links, "friend links") + tile(st.saved_progress, "saved profiles") + tile(ago(st.last_fixture_sync), "last fixtures sync");
  const days = st.signups_by_day || [], mx = Math.max(1, ...days.map((x) => x.n)); $("#admChart").innerHTML = days.length ? `<div class="bars14">${days.map((x) => `<div title="${x.d}: ${x.n}"><i style="height:${Math.round((x.n / mx) * 100)}%"></i><small>${String(x.d).slice(8)}</small></div>`).join("")}</div>` : '<div class="fine">No sign-ups in the last 14 days.</div>';
  loadAdminUsers(); loadAdminReports();
}
async function loadAdminReports() {
  const res = await Ranked.rpcx("admin_reports", { p_status: "open" }), box = $("#admReports"); if (!box) return;
  if (!res.ok) { box.innerHTML = `<div class="fine">Could not load reports. ${esc(res.why)}</div>`; return; }
  const rows = Array.isArray(res.data) ? res.data : [];
  $("#admRepN").textContent = rows.length + " open";
  box.innerHTML = rows.length ? rows.map((r) => `<div class="lbrow rrow"><div><b>${esc(r.ref || r.kind)}</b><div class="fine">${esc(r.note || "")}</div><div class="fine">${esc(r.email || "")} · ${esc((r.created || "").slice(0, 16).replace("T", " "))}</div></div><button class="btn ghost" data-resolve="${r.id}" type="button">Resolve</button></div>`).join("") : '<div class="fine">No open reports.</div>';
}
async function loadAdminUsers() {
  const rows = await Ranked.rpc("admin_users", { p_q: Admin.q }); const box = $("#admUsers"); if (!box) return; Admin.users = rows || [];
  box.innerHTML = rows && rows.length ? `<div class="admrow head"><b>Name</b><b>Email</b><b>Joined</b><b>Last seen</b><b>Elo</b><b>Games</b></div>` + rows.map((r) => `<div class="admrow"><span>${esc(r.nick || "–")}</span><span>${esc(r.email || "")}</span><span class="fine">${esc((r.created || "").slice(0, 10))}</span><span class="fine">${esc((r.last_seen || "").slice(0, 10)) || "–"}</span><span class="num">${r.elo}</span><span class="num">${r.games}</span></div>`).join("") : '<div class="fine">No accounts match.</div>';
}

/* ================= Profile page ================= */
const AVATARS = ["ball", "net", "gloves", "trophy", "crown", "flame", "target", "brain", "bolt", "star", "flag", "stadium"];
function avatarHTML(av, size = "md", nick = "") {
  let inner = `<span class="avl">${esc((nick || "?")[0].toUpperCase())}</span>`;
  if (av && av.startsWith("e:")) inner = `<span class="ave">${esc(av.slice(2))}</span>`;
  else if (av && av.startsWith("i:")) inner = `<span class="ave"><svg class='ic'><use href='#i-${esc(av.slice(2))}'/></svg></span>`;
  else if (av && av.startsWith("h:")) { const h = (DATA.hero || []).find((x) => x.n === av.slice(2)); if (h) inner = `<img src="${h.img}" alt="">`; }
  else if (av && av.startsWith("c:") && CREST[av.slice(2)]) inner = `<img class="avc" src="${CREST[av.slice(2)]}" alt="">`;
  return `<span class="av av-${size}">${inner}</span>`;
}
function syncProfile() { const p = prof(); Ranked.rpc("set_profile", { p_avatar: p.avatar || "", p_player: p.favPName || "", p_team: p.favT || "" }); syncBadges(); }
function appearanceHTML() {
  const g = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }, th = g("bkn_theme", "auto"), tx = g("bkn_text", "m"), seg = (k, items, cur) => `<div class="scope" style="padding:2px 0">${items.map(([v, n]) => `<button type="button" class="chip" data-ap="${k}|${v}" aria-pressed="${cur === v}">${n}</button>`).join("")}</div>`;
  return `<label class="pfl">Style</label>${seg("style", [["minimal", "Minimal"], ["classic", "Classic"]], g("bkn_style", "minimal") === "classic" ? "classic" : "minimal")}<div class="fine" style="margin:4px 0 0">Minimal is calm and quiet. Classic brings back the glow, effects and arena backdrop.</div><label class="pfl">Sidekick</label>${seg("mascot", Mascot.mine.map((k) => [k, MASCOTS[k].name]), Mascot.id())}${seg("mascot_mode", [["on", "On"], ["quiet", "No voice"], ["off", "Off"]], Mascot.mode())}${outfitsHTML()}<label class="pfl">Theme</label>${seg("theme", [["dark", "<svg class=ic><use href=#i-moon></use></svg> Dark"], ["light", "<svg class=ic><use href=#i-sun></use></svg> Light"], ["auto", "<svg class=ic><use href=#i-monitor></use></svg> Auto"]], th)}<label class="pfl">Text size</label>${seg("text", [["s", "Small"], ["m", "Normal"], ["l", "Large"], ["xl", "Extra large"]], tx)}
  <label class="pfl">Display</label><div class="scope" style="padding:2px 0"><button type="button" class="chip" data-ap="contrast|${g("bkn_contrast", "0") === "1" ? 0 : 1}" aria-pressed="${g("bkn_contrast", "0") === "1"}">High contrast</button><button type="button" class="chip" data-ap="motion|${g("bkn_motion", "") === "reduced" ? "full" : "reduced"}" aria-pressed="${g("bkn_motion", "") === "reduced"}">Reduce motion</button></div><div class="fine" style="margin-top:6px">Reduce motion also stops background effects after a refresh.</div>`;
}
const signedIn0 = () => !!(Account.signedIn || Account.claude);
function showProfile(ev) {
  S.code = null; S.mode = null; setTheme("HOME", ev); $("#home").hidden = true; $("#lobby").hidden = true; $("#league").hidden = true; $("#profilePage").hidden = false; window.scrollTo(0, 0);
  award("curious"); renderProfilePage();
}
function eloChart(rows) {
  if (!rows || rows.length < 1) return emptyState("<svg class=ic><use href=#i-trend></use></svg>", "No rating history yet", "Play a ranked match and your Elo will draw itself here.", '<button type="button" class="btn" data-nbgroup="ranked">Play a ranked match</button>');
  const pts = [1000].concat(rows.map((r) => r.elo)), lo = Math.min(...pts) - 10, hi = Math.max(...pts) + 10, W = 320, H = 110, x = (i) => (pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * (W - 20) + 10), y = (v) => H - 14 - ((v - lo) / (hi - lo || 1)) * (H - 28);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" "), last = pts[pts.length - 1];
  return `<svg class="elochart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Elo history"><line x1="10" x2="${W - 10}" y1="${y(1000)}" y2="${y(1000)}" stroke="currentColor" stroke-opacity=".2" stroke-dasharray="3 4"/><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${pts.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === pts.length - 1 ? 5 : 3}" fill="${i === pts.length - 1 ? "var(--accent)" : "var(--surface)"}" stroke="var(--accent)" stroke-width="2"/>`).join("")}<text x="${W - 10}" y="12" text-anchor="end" font-size="11" fill="currentColor" opacity=".7">peak ${Math.max(...pts)} · now ${last}</text></svg>`;
}
async function renderProfilePage() {
  const el = $("#profilePage"); if (!el) return; const keep = {}; ["pfNick", "pfFriend", "pfPlayer"].forEach((id) => { const x = $("#" + id); if (x && x.value) keep[id] = x.value; }); const p = prof(), lv = levelOf(p.xp), st = dayStreak(p), won = Object.keys(p.ach).length, pct2 = lv.to ? Math.min(100, ((p.xp - lv.from) / (lv.to - lv.from)) * 100) : 100, signed = Account.signedIn && Board.mode === "rest";
  const seen = p.splashes || {}, cat = splashCatalog(), nSeen = cat.filter((c) => seen[c.id]).length, spl = [...(seen["s:notebook"] ? ["Secret"] : []), "Legendary", "Rare", "Uncommon", "Common"].map((r) => `<div class="splrow"><div class="label">${r} · ${cat.filter((c) => c.rar === r && seen[c.id]).length}/${cat.filter((c) => c.rar === r).length}</div><div class="splgrid">${cat.filter((c) => c.rar === r).map((s) => `<div class="splc ${seen[s.id] ? "on" : ""}"><b>${seen[s.id] ? esc(s.name) : "???"}</b><span class="fine">${seen[s.id] ? `seen ${seen[s.id]}x` : "not seen yet"}</span></div>`).join("")}</div></div>`).join("");
  const eq = myBadges(), tierSort = (a, b) => badgeTier(b) - badgeTier(a);
  const ach = [...ACH].sort((a, b) => ACH_TIER[b[0]] - ACH_TIER[a[0]]).map(([id, n, d]) => `<div class="achv t${ACH_TIER[id]} ${p.ach[id] ? "on" : ""}" title="${esc(d)}"><b>${bdg(id)}</b><span>${esc(n)}</span><small>${esc(d)}</small><em class="tname">${TIERS[ACH_TIER[id]][0]}</em></div>`).join("");
  const own = [...Object.keys(ROLE_BADGES).filter(myRoleOK), ...ACH.map((a) => a[0]).filter((id) => p.ach[id])].sort(tierSort);
  const slots = [0, 1, 2].map((i) => eq[i] ? `<button type="button" class="bslot on" data-bdg="${eq[i]}" title="Tap to remove">${bdg(eq[i], true)}<span>${esc(badgeName(eq[i]))}</span></button>` : `<span class="bslot"><i></i><span>Empty</span></span>`).join("");
  const bpick = signedIn0() ? `<div class="card"><h3>Badges <span class="fine">${eq.length} of 3 worn</span></h3><div class="fine" style="margin-bottom:10px">Wear up to three of the achievements you have earned. They show next to your picture in Ranked, boards and friends. Rarer ones look fancier.</div><div class="bslots">${slots}</div>${own.length ? `<div class="bgrid">${own.map((id) => `<button type="button" class="bopt ${eq.includes(id) ? "on" : ""}" data-bdg="${id}" aria-pressed="${eq.includes(id)}">${bdg(id, true)}<span>${esc(badgeName(id))}<small>${ROLE_BADGES[id] ? ROLE_BADGES[id][0] + " only" : TIERS[ACH_TIER[id]][0]}</small></span></button>`).join("")}</div>` : '<div class="fine">Earn an achievement and it appears here.</div>'}</div>` : "";
  const favP = p.favP ? QZ.players.find((x) => x.id === +p.favP) : null;
  const avs = AVATARS.map((e) => `<button type="button" class="avopt ${p.avatar === "i:" + e ? "on" : ""}" data-av="i:${e}" aria-label="Avatar ${e}"><svg class='ic'><use href='#i-${e}'/></svg></button>`).join("") + (DATA.hero || []).filter((h) => h.img && !h.photo).map((h) => `<button type="button" class="avopt ${p.avatar === "h:" + h.n ? "on" : ""}" data-av="h:${esc(h.n)}" aria-label="${esc(h.n)}"><img src="${h.img}" alt=""></button>`).join("") + (p.favT && CREST[p.favT] ? `<button type="button" class="avopt ${p.avatar === "c:" + p.favT ? "on" : ""}" data-av="c:${esc(p.favT)}" aria-label="${esc(p.favT)} badge"><img class="avc" src="${CREST[p.favT]}" alt=""></button>` : "");
  const teams = Object.keys(QZ.clubs).filter((n) => CREST[n]).sort();
  el.innerHTML = `<nav class="crumbs"><button class="back" data-crumb="menu" type="button">← Menu</button><div class="trail"><span class="crumb cur">Profile</span></div></nav>
  ${PHero.html({ av: avatarHTML(p.avatar, "xl", p.nick), name: esc(p.nick || "Guest"), badges: signed ? badgesHTML(myBadges(), true) : "", level: lv.name, levelShort: "Lv " + (lv.i + 1), xp: p.xp || 0, next: lv.next ? `next: ${esc(lv.next)} at ${lv.to.toLocaleString()}` : "top rank", pct: pct2, elo: signed ? Ranked.elo : null, rank: signed ? rankOf(Ranked.elo).name : "", rankIcon: signed ? rankOf(Ranked.elo).icon : "", streak: st, won, total: ACH.length, rounds: p.rounds || 0, fav: `${favP ? `<span class="chip2"><svg class=ic><use href=#i-star></use></svg> ${esc(favP.n)}</span>` : ""}${p.favT ? `<span class="chip2">${CREST[p.favT] ? badge(p.favT, "sm") : ""} ${esc(p.favT)}</span>` : ""}`, medals: [...ACH].filter(([id]) => p.ach[id]).sort((a, b) => ACH_TIER[b[0]] - ACH_TIER[a[0]]).slice(0, 3).map(([id]) => `<span title="${esc(badgeName(id))}">${bdg(id, true)}</span>`) })}
  ${AllStats.html()}
  <div class="pfgrid"><div class="card"><h3>Edit profile</h3>
    ${signed ? `<label class="pfl">Display name</label><div class="row"><input id="pfNick" maxlength="16" value="${esc(p.nick || "")}" aria-label="Display name"><button class="btn" id="pfNickSave" type="button">Save</button></div><div class="fine" id="pfNickMsg"></div>` : `<div class="fine">Sign in to choose a display name and use friends and Elo.</div>`}
    <label class="pfl">Profile picture</label><div class="avgrid">${avs}</div>
    <label class="pfl">Favourite player</label><div class="row"><input id="pfPlayer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${favP ? esc(favP.n) : "Search a player"}" aria-label="Favourite player">${favP ? '<button class="btn ghost" id="pfPlayerClear" type="button">Clear</button>' : ""}</div><div id="pfPSug" class="sugs"></div>
    <label class="pfl">Favourite team</label><select id="pfTeam" aria-label="Favourite team"><option value="">None</option>${teams.map((n) => `<option value="${esc(n)}" ${p.favT === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>${p.favT && TEAMCOL[p.favT] ? `<label class="pfl" style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0"><input type="checkbox" id="pfTheme" ${p.teamTheme !== false ? "checked" : ""} style="width:auto;flex:none"> Use ${esc(p.favT)} colours across the site</label>` : p.favT ? `<div class="fine" style="margin-top:6px">We do not have theme colours for ${esc(p.favT)} yet, so the site keeps its normal colours.</div>` : ""}</div>
  <div class="card"><h3>Elo history</h3><div id="pfElo2" class="fine">${signed ? "Loading…" : "Create an account to play Ranked and build a rating."}</div></div>
  <div class="card"><h3>Friends</h3>${signed ? `<div class="row"><input id="pfFriend" maxlength="16" placeholder="Friend's display name" aria-label="Friend's display name"><button class="btn" id="pfFriendAdd" type="button">Add</button></div><div class="fine" id="pfFriendMsg">They do not need to accept. You can see their Elo and favourites.</div><div id="pfFriends" class="lbx">${skelRows(2)}</div>` : '<div class="fine">Sign in to add friends.</div>'}</div></div>
  <div class="card"><h3>This month</h3><p class="fine">A card with your month: games, days played, streak, favourite game, your club and a word from your sidekick.</p><button class="btn" id="recapBtn" type="button">Make my monthly recap</button></div><div class="card setlink"><div class="row" style="justify-content:space-between;align-items:center"><div><h3 style="margin:0">Look, sidekick and outfit</h3><p class="fine" style="margin:2px 0 0">Everything you can change lives in Settings now.</p></div><button class="btn" type="button" id="settingsBtn2"><svg class=ic><use href=#i-gear></use></svg> Open Settings</button></div></div>
  <div class="card"><h3>Your strengths</h3>${statsRadarHTML()}</div>
  <div class="card"><h3>Loading screens <span class="fine">${nSeen} of ${cat.length} collected</span></h3>${spl}</div>
  ${bpick}
  <div class="card"><h3>Achievements <span class="fine">${won} of ${ACH.length}</span></h3><div class="achgrid">${ach}</div></div>
  <div class="card"><h3>Streak calendar</h3>${calendarHTML(p)}<div class="fine">Each square is a day; brighter means more games. Last 12 weeks.</div></div>
  <div class="card"><h3>Account</h3>${accountHTML()}<div class="row" style="margin-top:12px"><button class="btn ghost" id="shareRecord" type="button">Share my record</button><button class="btn ghost" id="pfShare" type="button">Share my profile card</button><button class="btn ghost" id="tourBtn" type="button">Replay the tour</button><button class="btn ghost" id="newBtn" type="button">What's new</button><button class="btn" data-go="album" type="button"><svg class=ic><use href=#i-album></use></svg> Sticker album</button></div></div>`;
  Object.keys(keep).forEach((id) => { const x = $("#" + id); if (x) x.value = keep[id]; });
  if (!signed) return;
  Ranked.refresh().then(() => { const e = $("#pfElo"); if (e) { e.dataset.to = Ranked.elo; e.textContent = Ranked.elo.toLocaleString(); } });
  Ranked.rpc("my_elo_history").then((rows) => { const b = $("#pfElo2"); if (b) b.innerHTML = rows ? eloChart(rows) + historyList(rows) : '<div class="fine">History needs the latest database update (schema_v3.sql).</div>'; });
  paintFriends();
}
function historyList(rows) {
  if (!rows || !rows.length) return ""; const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 60 ? `${Math.max(1, m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
  return `<div class="label" style="margin-top:12px">Recent matches</div><div class="lbx">${rows.slice(-8).reverse().map((r) => `<div class="lbrow hrow"><b>${r.delta > 0 ? "<svg class=ic><use href=#i-check></use></svg>" : r.delta < 0 ? "<svg class=ic><use href=#i-cross></use></svg>" : "<svg class=ic><use href=#i-minus></use></svg>"}</b><span>${r.opp_nick ? "vs " + esc(r.opp_nick) : "Ranked match"}<small class="fine"> ${r.game ? esc(rkName(r.game)) : ""}</small></span><span class="num ${r.delta >= 0 ? "up" : "down"}">${r.delta > 0 ? "+" : ""}${r.delta}</span><span class="fine">${ago(r.at)}</span></div>`).join("")}</div>`;
}
async function paintFriends() {
  const rows = await Ranked.rpc("my_friends"), box = $("#pfFriends"); if (!box) return;
  if (!rows) { box.innerHTML = '<div class="fine">Friends need the latest database update (schema_v3.sql).</div>'; return; }
  box.innerHTML = rows.length ? rows.map((r) => `<div class="lbrow frow" data-pc="${esc(r.nick)}" tabindex="0" role="button" aria-haspopup="dialog">${avatarHTML(r.avatar, "sm", r.nick)}<div><b>${esc(r.nick)}</b>${badgesHTML(r.badges)} ${rankTag(r.elo)} <span class="fine num">Elo ${r.elo}</span><div class="fine">${r.fav_player ? "<svg class=ic><use href=#i-star></use></svg> " + esc(r.fav_player) : ""} ${r.fav_team ? "· " + esc(r.fav_team) : ""}</div></div><div class="row" style="gap:6px"><button class="btn" data-chal="${esc(r.nick)}" type="button"><svg class=ic><use href=#i-swords></use></svg> Challenge</button><button class="btn ghost" data-unfriend="${esc(r.nick)}" type="button">Remove</button></div></div>`).join("") : emptyState("<svg class=ic><use href=#i-handshake></use></svg>", "No friends yet", "Add someone by their display name.", sel === "#pfFriends" ? "" : '<button type="button" class="btn" data-go="profile">Add a friend</button>');
}

/* ================= Challenge a friend ================= */
const SHORT = { E0: "pl", D1: "bl", SP1: "ll", I1: "sa", F1: "l1", ALL: "al" }, FROMSHORT = Object.fromEntries(Object.entries(SHORT).map(([k, v]) => [v, k]));
function seededFixtures(c, seedStr) {
  const pool = allMatches(c), r = mulberry(hash(seedStr)), seen = new Set(), out = [];
  while (out.length < 5) { const x = pool[Math.floor(r() * pool.length)], id = x.season + "|" + x.i; if (!seen.has(id)) { seen.add(id); out.push(x); } }
  return out;
}
const chalState = (c, code) => { const f = seededFixtures(c, `chal-${c}-${code}`), items = f.map((x) => store.items[`x_${code}_${x.c}_${x.season}_${x.i}`]); return { f, items, n: items.filter(Boolean).length }; };
const chalLink = (c, code) => `${location.href.split("#")[0]}#challenge-${SHORT[c]}-${code}`;
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
const chalC = () => (S.chal && S.chal.c) || S.code;
function renderChallenge() {
  const c = chalC();
  if (S.cur) return renderPlay();
  if (!S.chal) {
    $("#room").innerHTML = `<div class="card">${gamesBar("Challenge a friend")}<p class="sub">Five matches from 2001 on, the same for you and everyone you send the link to. Play them, then compare scores.</p>
      <div class="row" style="margin-top:14px"><button class="btn" id="chNew" type="button">Create a challenge</button></div>
      <div class="row" style="margin-top:14px"><input id="chCode" maxlength="10" placeholder="Got a code? Type it here" aria-label="Challenge code"><button class="btn ghost" id="chJoin" type="button">Play it</button></div></div>`;
    return;
  }
  const code = S.chal.code, st = chalState(c, code);
  const rows = st.f.map((x, k) => { const it = st.items[k]; return `<button type="button" class="drow ${it ? "done" : ""}" data-cfix="${x.c}|${x.season}|${x.i}"><b class="num">${k + 1}</b><span class="mt">${badge(x.m[1], "sm")}${esc(x.m[1])} <span class="fine">v</span> ${badge(x.m[2], "sm")}${esc(x.m[2])}</span>${it ? `<span class="mark ${it.pick === it.res ? "y" : "n"}">${it.pick === it.res ? "✓" : "✗"}</span>` : '<span class="fine">play</span>'}</button>`; }).join("");
  let result = "";
  if (st.n === 5) { const you = st.items.filter((x) => x.pick === x.res).length, mod = st.items.filter((x) => x.mpick === x.res).length; result = `<div class="row" style="margin-top:14px"><b>You ${you}/5, model ${mod}/5: ${you > mod ? "you beat it" : you === mod ? "a tie" : "the model wins"}</b></div><div class="row" style="margin-top:10px"><button class="btn" id="chCard" type="button">Make a result card</button><button class="btn ghost" id="chCopy" type="button">Copy the challenge link</button></div><pre class="share" id="chTxt" hidden></pre>`; }
  else result = `<div class="row" style="margin-top:14px"><button class="btn ghost" id="chCopy" type="button">Copy the challenge link</button><span class="fine">Send it before you play, or after, to see who does better.</span></div><pre class="share" id="chTxt" hidden></pre>`;
  $("#room").innerHTML = `<div class="card">${gamesBar(`Challenge ${code}`)}<p class="sub">${esc(lgOf(c).name)} · ${st.n}/5 played. Everyone with this code gets the same five matches.</p><div class="daily">${rows}</div>${result}${st.n === 5 ? '<div id="chBoard"></div>' : ""}</div>`;
  if (st.n === 5) challengeBoard(code);
}
async function challengeBoard(code) {
  const el = $("#chBoard"); if (!el || Board.mode !== "rest") return;
  const rows = await Board.top("challenge", "all", "all", code); if (!rows || !rows.length || !$("#chBoard")) return;
  $("#chBoard").innerHTML = `<h3 style="font-size:18px;margin:16px 0 6px">Everyone who played this challenge</h3><div class="lb">${rows.slice(0, 10).map((r, i) => `<div class="lbrow"><b class="num">${i + 1}</b><span>${esc(r.nick)}</span><span class="num">${Math.round(Number(r.value))}/5</span></div>`).join("")}</div>`;
}
async function copyChallenge(c, code) { const txt = `ballknowledge challenge: five ${lgOf(c).name} matches, same for everyone. Can you beat me? ${chalLink(c, code)}`; try { await navigator.clipboard.writeText(txt); toast("Challenge link copied"); } catch (e) { const pre = $("#chTxt"); if (pre) { pre.textContent = txt; pre.hidden = false; } } }
function challengeCard(c, code) {
  const st = chalState(c, code), you = st.items.filter((x) => x.pick === x.res).length, mod = st.items.filter((x) => x.mpick === x.res).length;
  return showCard("challenge", { lg: c, title: `Challenge ${code}`, big: `${you}/5`, sub: `the model got ${mod}/5`, rows: st.f.map((x, k) => ({ home: x.m[1], away: x.m[2], score: `${x.m[3]}-${x.m[4]}`, you: st.items[k].pick === st.items[k].res ? "✓" : "✗", youOk: st.items[k].pick === st.items[k].res })), line: you > mod ? "Beat the model. Your turn to beat me." : "Can you do better?", share: `I scored ${you}/5 on ballknowledge challenge ${code}. Can you beat me? ${chalLink(c, code)}` });
}

function afterPlayHook(it) {
  const k = S.cur && S.cur.onDone;
  if (k === "chal") { if (S.chal) { const st = chalState(chalC(), S.chal.code); if (st.n === 5) afterChallenge(chalC(), S.chal.code, st); } }
  else if (k) { const key = todayKey(), st = dailyState(S.code, key); if (st.n === 5) afterDaily(S.code, st, key); }
  else afterCall(it);
}
function dailyCard() {
  const c = S.code, key = todayKey(), st = dailyState(c, key), you = st.items.filter((x) => x.pick === x.res).length, mod = st.items.filter((x) => x.mpick === x.res).length;
  return showCard("daily", { lg: c, title: "Daily 5", big: `${you}/5`, sub: `the model got ${mod}/5 · ${key}`, rows: st.f.map((x, k) => ({ home: x.m[1], away: x.m[2], score: `${x.m[3]}-${x.m[4]}`, you: st.items[k].pick === st.items[k].res ? "✓" : "✗", youOk: st.items[k].pick === st.items[k].res })), line: you > mod ? "I beat the model today." : "Can you beat the model?", share: `ballknowledge, ${lgOf(c).name} Daily 5, ${key}: me ${you}/5, the model ${mod}/5.` });
}
const mdCardNow = (it) => showCard("matchday", { lg: it.lg, title: `Matchday ${it.n}`, big: `${it.you}/${it.picks.length}`, sub: `the model got ${it.mod}/${it.picks.length} · ${it.season}`, tiles: [[`${it.you}`, "you"], [`${it.mod}`, "model"], [it.season, "season"]], line: it.you > it.mod ? "I beat the model this round." : it.you === it.mod ? "Level with the model." : "The model won this round.", share: `ballknowledge, ${lgOf(it.lg).name} matchday ${it.n} (${it.season}): me ${it.you}/${it.picks.length}, the model ${it.mod}/${it.picks.length}.` });
const tableCardNow = (d) => showCard("table", { lg: d.lg, title: "Guess the table", big: d.youErr < d.modErr ? "Beat it" : d.youErr > d.modErr ? "Close" : "Level", sub: `${d.season} · places off per club`, tiles: [[d.youErr.toFixed(2), "me"], [d.modErr.toFixed(2), "the model"], [d.lastErr.toFixed(2), "repeat last year"]], line: d.youErr < d.modErr ? "I out-guessed the model." : "The model edged it.", share: `ballknowledge, ${lgOf(d.lg).name} ${d.season} table: me ${d.youErr.toFixed(2)} places off per club, the model ${d.modErr.toFixed(2)}.` });

/* ================= Accounts: play as a guest, or sign in so progress is saved online ================= */
const Account = {
  session: null, pushTimer: null, status: "",
  get available() { return Board.mode === "rest"; },
  get signedIn() { return !!(this.session && this.session.user); },
  get claude() { return store.mode === "cloud"; },
  load() { try { const s = JSON.parse(localStorage.getItem("arena-session") || "null"); if (s && s.refresh_token) this.session = s; } catch (e) { /* storage unavailable */ } },
  persist() { try { if (this.session) localStorage.setItem("arena-session", JSON.stringify(this.session)); else localStorage.removeItem("arena-session"); } catch (e) { /* storage unavailable */ } },
  hdr(token) { return { apikey: Board.cfg.key, Authorization: `Bearer ${token || Board.cfg.key}`, "Content-Type": "application/json", "Accept-Profile": "nba", "Content-Profile": "nba" }; },
  take(j) { if (!j || !j.access_token) return false; this.session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: { id: j.user.id, email: j.user.email } }; this.persist(); return true; },
  async auth(path, body) { const r = await fetch(`${Board.cfg.url}/auth/v1/${path}`, { method: "POST", headers: this.hdr(), body: JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch (e) { /* empty body */ } return { ok: r.ok, j }; },
  errText(j) { return (j && (j.error_description || j.msg || j.message)) || "Something went wrong. Please try again."; },
  async signUp(email, password) {
    const { ok, j } = await this.auth("signup", { email, password }); if (!ok) return { error: this.errText(j) };
    if (this.take(j)) { await this.afterSignIn(); return { ok: true }; }
    return { ok: true, confirm: true };
  },
  async signIn(email, password) { const { ok, j } = await this.auth("token?grant_type=password", { email, password }); if (!ok || !this.take(j)) return { error: this.errText(j) }; await this.afterSignIn(); return { ok: true }; },
  async recover(email) { const { ok, j } = await this.auth("recover", { email }); return ok ? { ok: true } : { error: this.errText(j) }; },
  async token() {
    if (!this.session) return null;
    if (this.session.expires_at - 60 > Date.now() / 1000) return this.session.access_token;
    const { ok, j } = await this.auth("token?grant_type=refresh_token", { refresh_token: this.session.refresh_token });
    if (ok && this.take(j)) return this.session.access_token;
    this.session = null; this.persist(); paintProfileBtn(); return null;
  },
  async flush() { if (this.pushTimer) { clearTimeout(this.pushTimer); this.pushTimer = null; await this.push(); } },
  async signOut() { await this.flush(); try { if (this.session) await fetch(`${Board.cfg.url}/auth/v1/logout`, { method: "POST", headers: this.hdr(this.session.access_token) }); } catch (e) { /* offline */ } this.session = null; this.persist(); this.status = ""; paintProfileBtn(); },
  async afterSignIn() { await this.pull(); try { applyAppearance(); } catch (e) { /* ignore */ } await this.push(); paintProfileBtn(); paintScore(); await ensureNick(); Ranked.refresh(); checkAdmin(); },
  async pull() {
    const t = await this.token(); if (!t) return;
    try { const r = await fetch(`${Board.cfg.url}/rest/v1/progress?select=data`, { headers: this.hdr(t) }); if (!r.ok) return; const rows = await r.json(); if (rows[0] && rows[0].data) mergeProgress(rows[0].data); this.status = "Progress synced."; await this.syncNick(t); } catch (e) { this.status = "Could not reach the server; your progress is safe on this device."; }
  },
  /* the display name lives in the database (unique, checked there); the copy in saved progress can be older, so after every sync the database name wins */
  async syncNick(t) {
    try { const r = await fetch(`${Board.cfg.url}/rest/v1/profiles?select=nick`, { headers: this.hdr(t) }); if (!r.ok) return; const j = await r.json(); const n = j && j[0] && j[0].nick; if (!n) return; const p = prof(); if (p.nick !== n) { p.nick = n; p.board = true; store.items.profile = p; saveLocal(); paintProfileBtn(); if ($("#profilePage") && !$("#profilePage").hidden) renderProfilePage(); } } catch (e) { /* offline: keep the local name */ }
  },
  async push() {
    const t = await this.token(); if (!t) return;
    try { await fetch(`${Board.cfg.url}/rest/v1/progress`, { method: "POST", headers: { ...this.hdr(t), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: this.session.user.id, data: store.items, updated_at: new Date().toISOString() }) }); this.status = "Progress saved online."; } catch (e) { this.status = "Could not reach the server; your progress is safe on this device."; }
  },
  queue() { if (!this.signedIn) return; clearTimeout(this.pushTimer); this.pushTimer = setTimeout(() => { this.pushTimer = null; this.push(); }, 2500); },
  async setNick(nick) { const t = await this.token(); if (!t) return { error: "Please sign in first." }; const all = await NameSync.setAll(Board.cfg, t, nick), j = all["nba"]; if (j === "ok") return { ok: true }; if (j == null) return { error: "Could not reach the server." }; return { error: j === "taken" ? "That nickname is taken. Try another." : j === "invalid" ? "Use 3 to 16 letters, numbers, spaces, dots, dashes or underscores." : this.errText(j) }; },   /* saved in all three sports at once */
};
document.addEventListener("visibilitychange", () => { if (document.hidden) Account.flush(); });
addEventListener("pagehide", () => { Account.flush(); });
// Bring cloud progress into this device without losing anything: plays are append-only locks, so the union is safe; the profile merges field by field.
function mergeProgress(cloud) {
  const mine = store.items; let changed = false;
  Object.entries(cloud || {}).forEach(([k, v]) => {
    if (k === "profile") { const a = prof(), b = v || {}; const m = { ...a, ...b, xp: Math.max(a.xp || 0, b.xp || 0), ach: { ...(b.ach || {}), ...a.ach }, splashes: { ...(b.splashes || {}), ...(a.splashes || {}) }, played: { ...(b.played || {}), ...(a.played || {}) }, diffs: { ...(b.diffs || {}), ...(a.diffs || {}) }, rounds: Math.max(a.rounds || 0, b.rounds || 0), avatar: a.avatar || b.avatar, favP: a.favP || b.favP, favT: a.favT || b.favT, leagues: { ...(b.leagues || {}), ...a.leagues }, seasons: { ...(b.seasons || {}), ...a.seasons }, nick: a.nick || b.nick || "", board: a.board || b.board || false, days: {} }; new Set([...Object.keys(a.days), ...Object.keys(b.days || {})]).forEach((d) => { m.days[d] = Math.max(a.days[d] || 0, (b.days || {})[d] || 0); }); mine.profile = m; changed = true; }
    else if (!(k in mine)) { mine[k] = v; changed = true; }
  });
  if (changed) { saveLocal(); paintScore(); paintProfileBtn(); }
}
function accountHTML() {
  if (Account.claude) return `<p class="fine">Signed in with your claude.ai account: your progress is saved privately and follows you automatically.</p>`;
  if (!Account.available) return `<p class="fine">You're playing as a guest. Your progress is saved in this browser.</p>`;
  if (Account.signedIn) return `<div class="row"><span>Signed in as <b>${esc(Account.session.user.email)}</b></span><button class="btn ghost" id="acctOut" type="button">Sign out</button></div><div class="fine" id="acctMsg">${esc(Account.status || "Your progress is saved online automatically.")}</div>`;
  return `<p class="fine">You're playing as a guest, so your progress stays in this browser. A free account keeps it on every device and puts you on the leaderboard.</p><div class="row"><button class="btn" id="acctIn" type="button">Sign in</button><button class="btn ghost" id="acctNew" type="button">Create an account</button></div>`;
}
function authForm(mode) {
  const up = mode === "up";
  modal(`<h2 style="font-size:26px">${up ? "Create an account" : "Sign in"}</h2><p class="fine">${up ? "Your progress is saved to your account and follows you to any device. Guests can keep playing without one." : "Welcome back. Your saved progress will load."}</p>
    <div class="authform"><input id="aEmail" type="email" autocomplete="email" placeholder="Email" aria-label="Email"><input id="aPass" type="password" autocomplete="${up ? "new-password" : "current-password"}" placeholder="Password (6 or more characters)" aria-label="Password"></div>
    <div class="row" style="margin-top:12px"><button class="btn" id="aGo" data-mode="${mode}" type="button">${up ? "Create account" : "Sign in"}</button><button class="btn ghost" id="aSwitch" data-mode="${up ? "in" : "up"}" type="button">${up ? "I already have an account" : "Create an account"}</button>${up ? "" : '<button class="link" id="aForgot" type="button">Forgot password?</button>'}<button class="btn ghost" id="modalClose" type="button">Continue as a guest</button><button class="btn ghost" id="guestProfile" type="button">My guest profile</button></div><div class="fine" id="aMsg" style="margin-top:8px"></div>`);
}
async function submitAuth(mode) {
  const email = ($("#aEmail").value || "").trim(), pw = $("#aPass").value || "", msg = $("#aMsg"), btn = $("#aGo");
  if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = "Please enter a valid email address."; return; }
  if (pw.length < 6) { msg.textContent = "The password needs at least 6 characters."; return; }
  btn.disabled = true; msg.textContent = "One moment…";
  const res = mode === "up" ? await Account.signUp(email, pw) : await Account.signIn(email, pw); btn.disabled = false;
  if (res.error) { msg.textContent = res.error; Snd.wrong(); return; }
  if (res.confirm) { msg.textContent = "Almost there: check your email and click the confirmation link, then sign in here."; return; }
  Snd.right(); toast(`Signed in as ${esc(email)}`); closeModal(); openProfile();
}


/* ================= Ball knowledge: shared data helpers ================= */
const QZ = DATA.quiz || { players: [], clubs: {} };
const LG_OF_COMP = { NBA: "NBA" };
const TODAY_MS = Date.now();
const qnorm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ageOf = (p) => Math.floor((TODAY_MS - Date.parse(p.dob)) / 31557600000);
const euro = (v) => `${Math.round(v).toLocaleString("en-US")}`;
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const playerPool = (scope, f) => QZ.players.filter((p) => (scope === "ALL" || LG_OF_COMP[p.comp] === scope) && (!f || f(p)));
const TM_TO_OURS = (() => { const m = {}; Object.entries(QZ.clubs || {}).forEach(([ours, f]) => { m[qnorm(f.tm)] = ours; }); return m; })();
const oursOf = (tmName) => TM_TO_OURS[qnorm(tmName)] || (QZ.alias && QZ.alias[tmName]) || null;
const oursSet = (p) => p._o || (p._o = new Set([...p.hist, ...(p.ap || []), p.club].map(oursOf).filter(Boolean)));
const playedFor = (p, ours) => oursSet(p).has(ours);
const clubBadgeFor = (tmName, cls = "sm") => { const o = oursOf(tmName); return o && CREST[o] ? badge(o, cls) : ""; };
const clubList = (scope) => { const out = []; lgs(scope).forEach((lg) => Object.keys(lgOf(lg).tables || {}).forEach((sn) => (lgOf(lg).tables[sn] || []).forEach((r) => { if (!out.some((x) => x.n === r[0])) out.push({ n: r[0], lg }); }))); return out; };
const surnameCount = (() => { const m = {}; QZ.players.forEach((p) => { const w = qnorm(p.n.split(" ").slice(-1)[0]); m[w] = (m[w] || 0) + 1; }); return m; })();
function suggestions(q, items, key) {
  const n = qnorm(q); if (n.length < 2) return [];
  const hit = items.filter((x) => qnorm(key(x)).includes(n)); hit.sort((a, b) => (qnorm(key(a)).startsWith(n) ? 0 : 1) - (qnorm(key(b)).startsWith(n) ? 0 : 1) || key(a).length - key(b).length);
  return hit.slice(0, 6);
}
/* ---------- difficulty, turn timers ---------- */
const DIFFS = [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"], ["elite", "Elite ball knowledge"]];
const DIFFX = { easy: 0.6, medium: 1, hard: 1.4, elite: 2 };
const DIFFNOTE = { easy: "Superstars and the biggest clubs, slow clues, forgiving margins. Scores count 0.6x.", medium: "Well-known players and top clubs. Scores count 1x.", hard: "Regular first-teamers and mid-table clubs, faster clues, tighter margins. Scores count 1.4x.", elite: "Deep cuts: the obscure players and smaller clubs only, fast clues, almost no margin. Scores count 2x." };
const TLIM = { easy: 30, medium: 20, hard: 14, elite: 9 };
try { S.diff = localStorage.getItem("bkn_diff"); } catch (e) { /* storage blocked */ }
if (!DIFFX[S.diff]) S.diff = "medium";
const fameOf = (p) => p.min || 0;
const FAME = (() => { const s = QZ.players.slice().sort((a, b) => fameOf(b) - fameOf(a)), m = new Map(); s.forEach((p, i) => m.set(p.id, i)); return m; })();
const clubRank = (() => { const s = Object.entries(QZ.clubs).filter(([, f]) => f.value > 0).sort((a, b) => b[1].value - a[1].value), m = {}; s.forEach(([n], i) => { m[n] = i; }); return m; })();
/* what to ask about: easy is the very famous, elite is the obscure (players ranked below 1,500 by peak value, clubs outside the top 60 by squad value) */
const playerOK = (p) => { const r = FAME.get(p.id); return S.diff === "easy" ? r < 130 : S.diff === "medium" ? r < 420 : S.diff === "hard" ? r < 900 : r >= 600; };
/* what may appear as an answer or category pool: everything at least as famous as the level, and elite allows anyone */
const poolOK = (p) => { const r = FAME.get(p.id); return S.diff === "easy" ? r < 260 : S.diff === "medium" ? r < 650 : S.diff === "hard" ? r < 1100 : true; };
const clubOK = (n) => { const r = clubRank[n]; return S.diff === "easy" ? r < 10 : S.diff === "medium" ? r < 20 : S.diff === "hard" ? r < 28 : (r === undefined || r >= 15); };
const clueSpeed = () => ({ easy: 1.35, medium: 1, hard: 0.8, elite: 0.6 })[S.diff];
const finTol = () => ({ easy: 4, medium: 3, hard: 2, elite: 1 })[S.diff];
const pickWith = (make, ok) => { let x; for (let k = 0; k < 60; k++) { x = make(); if (ok(x)) return x; } return x; };
const diffBar = () => `<div class="label" style="margin-top:14px">Difficulty</div><div class="diffbar" role="group" aria-label="Difficulty">${DIFFS.map(([k, n]) => `<button type="button" class="chip" data-diff="${k}" aria-pressed="${S.diff === k}">${n}</button>`).join("")}</div><div class="fine" id="diffNote" style="margin-top:6px">${DIFFNOTE[S.diff]}</div>`;
const Turn = { key: "", left: 0 };
function turnKey() {
  if (S.fin && S.fin.mode === "duo" && S.fin.phase === "ask") return `f${S.fin.round}-${S.fin.turn}`;
  if (S.num && S.num.mode === "duo" && S.num.phase === "guess") return `n${S.num.round}-${S.num.turn}`;
  if (S.ttt && S.ttt.mode === "duo" && S.ttt.phase === "play") return `t${S.ttt.turn}-${S.ttt.cells.filter((x) => x != null).length}-${S.ttt.sel}`;
  if (S.rou && S.rou.phase === "play") return `r${S.rou.round}-${S.rou.turn}-${S.rou.used.length}`;
  return "";
}
const turnLimit = () => Math.round(TLIM[S.diff] * (S.ttt ? 1.5 : S.rou ? 0.6 : 1));
setInterval(() => {
  const k = turnKey(); if (!k) { Turn.key = ""; return; }
  if (k !== Turn.key) { Turn.key = k; Turn.left = turnLimit(); } else Turn.left--;
  if (!$("#tclock")) { const h = $("#room .qhud"); if (h) h.insertAdjacentHTML("beforeend", '<span class="tclock num" id="tclock"></span>'); }
  const c = $("#tclock"); if (c) { c.innerHTML = `<svg class=ic><use href=#i-timer></use></svg> ${Math.max(0, Turn.left)}s`; c.classList.toggle("low", Turn.left <= 5); }
  if (Turn.left <= 0) { Turn.key = ""; Snd.wrong(); toast("Time is up"); expireTurn(); }
}, 1000);
function expireTurn() {
  if (S.fin && S.fin.mode === "duo" && S.fin.phase === "ask") lockFinish();
  else if (S.num && S.num.mode === "duo" && S.num.phase === "guess") lockNumber(true);
  else if (S.ttt && S.ttt.mode === "duo" && S.ttt.phase === "play") { S.ttt.msg = "Time is up. Turn lost."; endTurn(); }
  else if (S.rou && S.rou.phase === "play") rouLose(S.rou.turn, "ran out of time");
}
/* ---------- pictures for the ball-knowledge games: flags, positions, faces ---------- */
const FLAGISO = {"Spain": "ES", "France": "FR", "Germany": "DE", "England": "ENG", "Italy": "IT", "Brazil": "BR", "Argentina": "AR", "Netherlands": "NL", "Portugal": "PT", "Belgium": "BE", "Denmark": "DK", "Morocco": "MA", "Senegal": "SN", "Cote d'Ivoire": "CI", "Sweden": "SE", "Croatia": "HR", "Switzerland": "CH", "United States": "US", "Nigeria": "NG", "Norway": "NO", "Uruguay": "UY", "Austria": "AT", "Serbia": "RS", "Japan": "JP", "Ghana": "GH", "Algeria": "DZ", "Colombia": "CO", "Ireland": "IE", "Türkiye": "TR", "Turkey": "TR", "Cameroon": "CM", "Poland": "PL", "Scotland": "SCT", "Wales": "WLS", "Greece": "GR", "Mali": "ML", "DR Congo": "CD", "Bosnia-Herzegovina": "BA", "Slovakia": "SK", "Georgia": "GE", "Ukraine": "UA", "Kosovo": "XK", "Czech Republic": "CZ", "Canada": "CA", "Chile": "CL", "Slovenia": "SI", "Albania": "AL", "Northern Ireland": "GB", "Korea, South": "KR", "Ecuador": "EC", "Hungary": "HU", "Australia": "AU", "Romania": "RO", "Mexico": "MX", "Iceland": "IS", "Tunisia": "TN", "Guinea": "GN", "Angola": "AO", "Paraguay": "PY", "Burkina Faso": "BF", "Montenegro": "ME", "Finland": "FI", "Egypt": "EG", "Venezuela": "VE", "Israel": "IL", "The Gambia": "GM", "New Zealand": "NZ", "Mauritania": "MR", "Indonesia": "ID", "Russia": "RU", "Jamaica": "JM", "Haiti": "HT", "Gabon": "GA", "North Macedonia": "MK", "Suriname": "SR", "Guinea-Bissau": "GW", "Luxembourg": "LU", "Bulgaria": "BG", "Dominican Republic": "DO", "Central African Republic": "CF", "Togo": "TG", "Benin": "BJ", "Cyprus": "CY", "Panama": "PA", "Zimbabwe": "ZW", "Cape Verde": "CV", "Libya": "LY", "Zambia": "ZM", "Peru": "PE", "Iraq": "IQ", "Niger": "NE", "Comoros": "KM", "Armenia": "AM", "Syria": "SY", "Mozambique": "MZ", "Bangladesh": "BD", "Malta": "MT", "Curacao": "CW", "South Africa": "ZA", "Estonia": "EE", "Honduras": "HN", "Malaysia": "MY", "Jordan": "JO", "Latvia": "LV", "Equatorial Guinea": "GQ", "Saudi Arabia": "SA", "Burundi": "BI", "Guadeloupe": "GP", "Uzbekistan": "UZ", "Lithuania": "LT", "Moldova": "MD", "Sierra Leone": "SL", "Kenya": "KE", "Iran": "IR", "China": "CN", "Costa Rica": "CR", "Bolivia": "BO", "Trinidad and Tobago": "TT", "Congo": "CG", "Uganda": "UG", "Tanzania": "TZ", "Ethiopia": "ET", "Madagascar": "MG", "Namibia": "NA", "Liberia": "LR", "Lebanon": "LB", "Palestine": "PS", "Belarus": "BY", "Azerbaijan": "AZ", "Kazakhstan": "KZ", "Faroe Islands": "FO", "Liechtenstein": "LI", "Martinique": "MQ", "French Guiana": "GF", "Philippines": "PH", "India": "IN", "Thailand": "TH", "Vietnam": "VN"};
const TAGFLAG = { ENG: "gbeng", SCT: "gbsct", WLS: "gbwls" };
const flagOf = (nat) => { const c = FLAGISO[nat]; if (!c) return ""; if (TAGFLAG[c]) return String.fromCodePoint(0x1F3F4, ...[...TAGFLAG[c]].map((ch) => 0xE0000 + ch.charCodeAt(0)), 0xE007F); return String.fromCodePoint(...[...c].map((ch) => 127397 + ch.charCodeAt(0))); };
const POSICON = { Goalkeeper: "<svg class=ic><use href=#i-gloves></use></svg>", Defender: "<svg class=ic><use href=#i-shield></use></svg>", Midfield: "<svg class=ic><use href=#i-gear></use></svg>", Attack: "<svg class=ic><use href=#i-ball></use></svg>" };
const faceOf = (name) => { const h = (DATA.hero || []).find((x) => x.img && qnorm(x.n) === qnorm(name)); return h ? h.img : null; };
const photoUrl = (p) => p.ph ? p.ph : p.ea ? `https://ratings-images-prod.pulse.ea.com/FC25/full/player-portraits/p${p.ea}.png` : p.im ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p.im)}?width=240` : p.iu || null;
const playerPic = (p, cls = "xl") => { const f = faceOf(p.n), c = clubBadgeFor(p.club, cls), u = f ? null : photoUrl(p), under = f ? `<span class="badge ${cls} hface"><img src="${f}" alt=""></span>` : c || badge(p.n, cls); return `<span class="ppic">${under}${u ? `<img class="pimg" src="${u}" alt="${esc(p.n)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}${flagOf(p.nat) ? `<i class="pflag">${flagOf(p.nat)}</i>` : ""}</span>`; };
const lev = (a, b) => { const m = a.length, n = b.length; if (Math.abs(m - n) > 3) return 9; let prev = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; };
/* what Enter should submit: an exact match, the only suggestion, the only name that starts with what was typed, or a single name within a letter or two (typos) */
/* One forgiving name check used by every guessing game: the full name, just the last name (or any later part of it), initials plus last name ("L. Messi"), accents ignored,
   and a typo or two on longer words all count. A first name on its own and bare particles ("van", "de") do not. */
const NM_PART = new Set(["de", "da", "do", "dos", "van", "von", "der", "den", "di", "del", "la", "le", "el", "al", "bin", "ter", "ten", "dal", "du", "mac", "mc", "fc", "ac", "as"]);
const NM_GENERIC = new Set(["city", "united", "real", "club", "sporting", "athletic", "town", "borussia", "bayer", "olympique", "sport", "calcio", "futbol", "football", "ssc", "afc"]);
function nmSame(a, b) { if (a === b) return true; if (a.length >= 5 && Math.abs(a.length - b.length) <= 2) return lev(a, b) <= (a.length >= 9 ? 2 : 1); return false; }
function nameMatch(typed, full, generic) {
  const g = xiTok(typed).filter((w) => w.length > 1), t = xiTok(full); if (!g.length || !t.length) return false;
  if (xiTok(typed).join(" ") === t.join(" ")) return true;
  const used = new Set();
  for (const w of g) { const k = t.findIndex((v, i) => !used.has(i) && nmSame(w, v)); if (k < 0) return false; used.add(k); }
  const idx = [...used], skip = generic ? NM_GENERIC : null;
  if (idx.every((i) => NM_PART.has(t[i]) || (skip && skip.has(t[i])))) return false;                // only particles or generic words matched
  if (t.length === 1 || generic) return true;                                                           // club names: any distinctive word is enough
  return idx.some((i) => i > 0 && !NM_PART.has(t[i])) || g.length >= 2;                                 // a later part of the name (the surname), or at least two words
}
const clubNameMatch = (typed, ours, tm) => nameMatch(typed, ours, true) || (tm && nameMatch(typed, tm, true));
/* players in a pool whose name fits what was typed, most famous first; the first one that passes `pred` wins (a cell of the grid, a club he played for) */
function guessPlayer(typed, pool, pred) { const c = pool.filter((x) => nameMatch(typed, x.n)).sort((a, b) => (FAME.get(a.id) ?? 9e9) - (FAME.get(b.id) ?? 9e9)); return (pred && c.find(pred)) || c[0] || null; }
function resolveGuess(typed, items, key) {
  const n = qnorm(typed); if (n.length < 3) return null;
  const s = suggestions(typed, items, key), exact = s.find((x) => qnorm(key(x)) === n); if (exact) return exact;
  if (s.length === 1) return s[0];
  const starts = s.filter((x) => qnorm(key(x)).startsWith(n)); if (starts.length === 1 && n.length >= 4) return starts[0];
  const tol = n.length >= 9 ? 2 : n.length >= 5 ? 1 : 0; if (!tol) return null;
  let best = null, bd = 99, tie = false; for (const x of items) { const d = lev(n, qnorm(key(x))); if (d < bd) { bd = d; best = x; tie = false; } else if (d === bd) tie = true; }
  return bd <= tol && !tie ? best : null;
}
function stopQuiz() { if (Q.timer) { clearInterval(Q.timer); Q.timer = null; } }
const Q = { timer: null, s: null };

/* ---------- clue ladders, hardest first ---------- */
const CLUB_GENERIC = new Set(["fc", "cf", "cd", "rcd", "sc", "ac", "as", "ssc", "afc", "club", "de", "the", "c", "b", "ii", "u19", "u21", "u23", "you", "yth", "youth", "sad", "1", "a"]);
const clubWords = (n) => new Set(String(n || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !CLUB_GENERIC.has(w)));
const sameClub = (a, b) => { const x = clubWords(a), y = clubWords(b); if (!x.size || !y.size) return false; const [s1, s2] = x.size <= y.size ? [x, y] : [y, x]; return [...s1].every((w) => s2.has(w)); };
function playerClues(p) {
  const a = ageOf(p), prev = p.hist.filter((c, i, h) => !sameClub(c, p.club) && !(i > 0 && sameClub(c, h[i - 1]))).slice(-3), cl = [];
  if (p.city || p.bc) cl.push(["Birthplace", `Born in ${p.city ? p.city + ", " : ""}${p.bc || p.nat}`, flagOf(p.bc || p.nat)]);
  if (p.h) cl.push(["Build", `${p.h} cm tall${p.foot ? `, ${p.foot}-footed` : ""}`]);
  cl.push(["Age", `${a} years old (born ${p.dob.slice(0, 4)})`]);
  if (p.end) cl.push(["Contract", `Contract runs until ${p.end}`]);
  if ((p.aw || []).length) cl.push(["Awards", `Has won the ${p.aw.map((k) => ({ BDO: "Ballon d'Or", GS: "European Golden Shoe", PLGB: "Premier League Golden Boot", PFA: "PFA Players' Player of the Year", FIFA: "FIFA best player award", UEFA: "UEFA Player of the Year" })[k]).join(", ")}`, "<svg class=ic><use href=#i-medal></use></svg>"]);
  if ((p.hn || []).length) cl.push(["Honours", `Has won the ${p.hn.map((k) => ({ UCL: "Champions League", UEL: "Europa League", FAC: "FA Cup", EFL: "League Cup", CDR: "Copa del Rey", DFB: "DFB-Pokal", COP: "Coppa Italia", CDF: "Coupe de France" })[k]).join(", ")}`, "<svg class=ic><use href=#i-trophy></use></svg>"]);
  if (p.val) cl.push(["Value", `Market value about ${euro(p.val)}${p.peak > p.val * 1.2 ? `, peak ${euro(p.peak)}` : ""}`]);
  if (p.caps) cl.push(["Caps", `${p.caps} international caps, ${p.ig} goal${p.ig === 1 ? "" : "s"}`]);
  cl.push(["Position", `${p.sub || p.pos}`, POSICON[p.pos] || ""]);
  cl.push(["Nationality", p.nat, flagOf(p.nat)]);
  if (prev.length) cl.push(["Earlier clubs", `Previously at ${prev.join(", ")}`, prev.map((c) => clubBadgeFor(c, "sm")).join("")]);
  if (p.club) cl.push(["Club", `${p.active ? "Plays for" : "Last club:"} ${p.club}`, clubBadgeFor(p.club, "sm")]);
  cl.push(["Name", `${p.n.split(" ").length} word${p.n.split(" ").length > 1 ? "s" : ""}, ${p.n.replace(/ /g, "").length} letters, starts with ${p.n[0]}`]);
  return cl;
}
function careerClues(p) {
  const h = p.hist, cl = [];
  h.forEach((c, i) => cl.push([i === 0 ? "Started" : `Move ${i}`, i === 0 ? `Career began at ${c}` : `Then ${c}`, clubBadgeFor(c, "sm")]));
  cl.push(["Age", `${ageOf(p)} years old`]); cl.push(["Nationality", p.nat, flagOf(p.nat)]); cl.push(["Position", p.sub || p.pos, POSICON[p.pos] || ""]);
  cl.push(["Name", `Starts with ${p.n[0]}, ${p.n.replace(/ /g, "").length} letters`]);
  return cl;
}
function clubClues(e) {
  const r = e.row, f = QZ.clubs[e.n] || {}, cl = [];
  cl.push(["Defence", `Conceded ${r[3]} goals in ${e.season}`]); cl.push(["Attack", `Scored ${r[2]} goals`]); cl.push(["Record", `${r[4]} wins, ${r[5]} draws, ${r[6]} defeats`]);
  cl.push(["Points", `Finished on ${r[1]} points`]); cl.push(["Position", `Ended ${e.pos}${["th", "st", "nd", "rd"][e.pos % 10 > 3 || (e.pos > 10 && e.pos < 14) ? 0 : e.pos % 10]} in the table`]);
  if (f.seats) cl.push(["Stadium", `Stadium holds ${f.seats.toLocaleString()}`]);
  if (f.value) cl.push(["Squad value", `Squad worth about ${euro(f.value)} today`]);
  if (f.age) cl.push(["Squad age", `Average squad age ${f.age.toFixed(1)} today`]);
  cl.push(["League", `${lgOf(e.lg).name}, ${e.season}`, emblem(e.lg, "sm")]);
  if (f.coach) cl.push(["Coach", `Coach today: ${f.coach}`]);
  if (f.stadium) cl.push(["Ground", `Plays at ${f.stadium}`]);
  cl.push(["Name", `${e.n.replace(/ /g, "").length} letters, starts with ${e.n[0]}`]);
  return cl;
}
const BLUR = [34, 26, 19, 13, 8, 4, 0];

/* ---------- the round engine ---------- */
const QDEF = {
  who: { name: "Who am I?", unit: "player", rounds: 5, clueS: 6, mk: (scope) => ({ p: rnd(playerPool(scope, (p) => p.active && p.hist.length >= 2 && playerOK(p))) }), clues: (r) => playerClues(r.p), ans: (r) => ({ kind: "player", id: r.p.id, name: r.p.n }) },
  career: { name: "Career path", unit: "player", rounds: 5, clueS: 7, mk: (scope) => ({ p: rnd(playerPool(scope, (p) => p.hist.length >= 3 && playerOK(p))) }), clues: (r) => careerClues(r.p), ans: (r) => ({ kind: "player", id: r.p.id, name: r.p.n }) },
  club: { name: "Name that team", unit: "club", rounds: 5, clueS: 6, mk: (scope) => pickWith(() => { const lg = rnd(lgs(scope)), tabs = lgOf(lg).tables, sn = rnd(Object.keys(tabs)), pos = Math.floor(Math.random() * tabs[sn].length), row = tabs[sn][pos]; return { e: { n: row[0], lg, season: sn, row, pos: pos + 1 } }; }, (r) => clubOK(r.e.n)), clues: (r) => clubClues(r.e), ans: (r) => ({ kind: "club", name: r.e.n }) },
  blur: { name: "Logo blur", unit: "club", rounds: 6, clueS: 3.2, mk: (scope) => { const names = clubList(scope).filter((c) => CREST[c.n] && clubOK(c.n)); return { e: rnd(names.length ? names : clubList(scope).filter((c) => CREST[c.n])) }; }, clues: (r) => BLUR.map((b, i) => ["Blur", i === BLUR.length - 1 ? "Fully sharp" : `Blur ${b}`]), ans: (r) => ({ kind: "club", name: r.e.n }) },
};
/* ---- Scramble: a club, player or manager with the letters of every word shuffled ---- */
const MGRCOUNT = (() => { const m = {}; QZ.players.forEach((p) => (p.mg || []).forEach((x) => { m[x] = (m[x] || 0) + 1; })); return Object.entries(m).filter(([, n]) => n >= 12).sort((a, b) => b[1] - a[1]); })();
const mgrPool = () => MGRCOUNT.slice(0, { easy: 25, medium: 70, hard: 160, elite: 400 }[S.diff] || 70).map(([n]) => n);
function scrambleWord(w, rng) { const a = [...w]; if (a.length < 3 || new Set(a.map((c) => c.toLowerCase())).size < 2) return w; for (let k = 0; k < 20; k++) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } if (a.join("").toLowerCase() !== w.toLowerCase()) break; } return a.join(""); }
const scrambleName = (name) => name.split(/\s+/).map((w) => scrambleWord(w.replace(/[^\p{L}'-]/gu, ""), Math.random)).join("   ").toUpperCase();
function scrambleClues(r) {
  const name = r.kind === "player" ? r.p.n : r.e.n, words = name.split(/\s+/), kindWord = r.kind === "player" ? "a footballer" : r.kind === "club" ? "a club" : "a manager";
  const pattern = words.map((w) => [...w.replace(/[^\p{L}'-]/gu, "")].map(() => "_").join(" ")).join("    "), first = words.map((w) => w[0].toUpperCase()).join(" ");
  const extra = r.kind === "player" ? `${r.p.nat ? r.p.nat + " " : ""}${(r.p.sub || r.p.pos || "").toLowerCase()}` : r.kind === "club" ? `from the ${lgOf(r.e.lg || (QZ.clubs[r.e.n] || {}).lg || "E0").name}` : (() => { const st_ = QZ.players.filter((p) => (p.mg || []).includes(r.e.n)).sort((a, b) => (b.val || 0) - (a.val || 0)); return st_.length ? `managed ${st_[0].n}` + (st_[1] ? ` and ${st_[1].n}` : "") : "a manager in this data"; })();   /* a real clue: the best-known players who played under them */
  return [["Letters", r.scr], ["It is…", kindWord], ["Starts with", first], ["Extra hint", extra]];
}
QDEF.scramble = { name: "Scramble", unit: "name", rounds: 5, clueS: 7, mk: (scope) => {
  const kind = rnd(["player", "club", "manager"]);
  if (kind === "player") { const p = rnd(playerPool(scope, (q) => q.hist.length >= 2 && playerOK(q))); return { kind, p, scr: scrambleName(p.n) }; }
  if (kind === "club") { const names = clubList(scope).filter((c) => clubOK(c.n)), c = rnd(names.length ? names : clubList(scope)); return { kind, e: { n: c.n, lg: c.lg }, scr: scrambleName(c.n) }; }
  const n = rnd(mgrPool()); return { kind, e: { n }, scr: scrambleName(n) };
}, clues: (r) => scrambleClues(r), ans: (r) => (r.kind === "player" ? { kind: "player", id: r.p.id, name: r.p.n } : r.kind === "club" ? { kind: "club", name: r.e.n } : { kind: "text", name: r.e.n }) };
function newQuiz(game, mode, scope) { Q.s = { game, mode, scope, round: 0, scores: mode === "duo" ? [0, 0] : [0], log: [], phase: "intro" }; renderQuiz(); }
function nextRound() {
  const S_ = Q.s, d = QDEF[S_.game];
  if (S_.round === 0) { S_.streak = 0; S_.over = false; clearResume(); }
  S_.round++; const uk = S_.game + S.diff + S_.scope; S.seenQ = S.seenQ || {}; if (!S.seenQ[uk] || S.seenQ[uk].size > 150) S.seenQ[uk] = new Set(); S_.used = S.seenQ[uk]; S_.r = (() => { let r; for (let k = 0; k < 40; k++) { r = d.mk(S_.scope); const key = r.p ? r.p.id : r.e.n; if (!S_.used.has(key)) { S_.used.add(key); break; } } return r; })(); S_.clues = d.clues(S_.r); S_.elapsed = 0; S_.paused = false; S_.buzzed = null; S_.locked = [false, false]; S_.phase = "run"; S_.sug = []; S_.points = 0; S_.result = null;
  S_.hv = [false, false]; S_.hn = 0; S_.scDone = false; S_.cs = d.clueS * clueSpeed(); S_.total = S_.clues.length * S_.cs + 6; renderQuiz(); stopQuiz(); Q.timer = setInterval(tickQuiz, 250);
}
const worth = () => { const S_ = Q.s, base = Math.round(1000 * (1 - S_.elapsed / S_.total)); return Math.max(100, S_.game === "scramble" ? Math.round(base * Math.max(0.4, 1 - 0.15 * (S_.hn || 0))) : base); };
function shownCount() { const S_ = Q.s, d = QDEF[S_.game]; return Math.min(S_.clues.length, 1 + Math.floor(S_.elapsed / S_.cs)); }
function tickQuiz() {
  const S_ = Q.s; if (!S_ || S_.phase !== "run") return;
  if (!document.getElementById("qMeter")) { stopQuiz(); return; }
  if (S_.paused) { S_.answerLeft -= 0.25; if (S_.answerLeft <= 0) wrongGuess(true); else paintAnswerClock(); return; }
  const before = shownCount(); S_.elapsed += 0.25; if (shownCount() > before) { Snd.tick(); if (S_.game !== "scramble") paintClues(); }
  if (S_.elapsed >= S_.total) endRound(null); else paintMeter();
}
function buzz(who) {
  const S_ = Q.s; if (!S_ || S_.phase !== "run" || S_.paused || S_.locked[who]) return;
  S_.paused = true; S_.buzzed = who; S_.answerLeft = 12; S_.sug = []; Snd.lock(); renderQuiz(); const i = $("#qIn"); if (i) { i.value = ""; setTimeout(() => { i.value = ""; i.focus({ preventScroll: true }); const hd = $("#room .qhud") || $("#qClues"); if (hd) { const r = hd.getBoundingClientRect(); if (r.top < 56 || r.top > innerHeight * 0.3) hd.scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" }); } }, 0); }
}
function submitAnswer(pickId) {
  const S_ = Q.s, d = QDEF[S_.game], a = d.ans(S_.r); if (!S_ || !S_.paused) return;
  const typed = ($("#qIn") && $("#qIn").value) || ""; let ok = false;
  if (a.kind === "player") { const p = S_.r.p; if (pickId != null) ok = pickId === a.id; else { const t = qnorm(typed); ok = nameMatch(typed, p.n) || t === qnorm(p.n) || (t.length >= 3 && t === qnorm(p.n.split(" ").slice(-1)[0]) && surnameCount[t] === 1); if (!ok) { const m = resolveGuess(typed, QZ.players, (x) => x.n); if (m) ok = m.id === a.id; } } }
  else if (a.kind === "text") { ok = nameMatch(typed, a.name); }
  else { const f = QZ.clubs[a.name] || {}; const t = qnorm(typed); ok = (pickId != null ? pickId === a.name : t === qnorm(a.name) || t === qnorm(f.tm || "") || clubNameMatch(typed, a.name, f.tm)); if (!ok && pickId == null) { const m = resolveGuess(typed, clubList(S_.scope), (x) => x.n); if (m) ok = m.n === a.name; } }
  if (ok) endRound(S_.buzzed); else wrongGuess(false);
}
function wrongGuess(timedOut) {
  flashEdge(false); const S_ = Q.s, who = S_.buzzed; S_.scores[who] -= 150; if (S_.mode === "duo") S_.locked[who] = true; S_.paused = false; S_.buzzed = null; FX.miss(timedOut ? "Time! -150" : "-150"); Snd.wrong();
  if (S_.mode === "duo" ? S_.locked[0] && S_.locked[1] : true) { if (S_.mode === "duo") endRound(null); else { S_.paused = false; renderQuiz(); } } else renderQuiz();
}
function endRound(winner) {
  const S_ = Q.s; stopQuiz(); S_.paused = false; S_.phase = "reveal"; let pts = 0;
  if (winner != null) { pts = worth(); S_.scores[winner] += pts; S_.streak++; flashEdge(true); Mascot.setCtx(((S_.r.p && S_.r.p.n) || (S_.r.e && S_.r.e.n) || "") + "!"); FX.hit(pts); Snd.win(); if (pts > 700) confetti(); FX.pop("#room .rcard, #room .rcard + *"); FX.countUp(`#room .qscore:nth-of-type(${winner + 2}) b`, S_.scores[winner] - pts, S_.scores[winner]); if (S_.mode === "solo") FX.streak(S_.streak); } else { if (S_.mode === "solo") { S_.over = true; FX.over(); } else FX.miss(""); Snd.wrong(); }
  if (S_.mode === "solo") { if (winner != null) saveResume(S_.game, S_.scope, S_.scores[0], S_.streak, S_.round); else clearResume(); } S_.result = { winner, pts }; if (S_.mode === "solo") { const rp = S_.r.p, lgx = rp ? LG_OF_COMP[rp.comp] : S_.r.e && S_.r.e.lg; track(S_.game, winner === 0, lgx || null); if (winner === 0 && rp) collectSticker(rp); if (winner === 0 && S_.r.e && (S_.game === "club" || S_.game === "blur")) collectClub(S_.r.e.n); } if (winner === 0 && S_.game === "scramble" && S_.mode === "solo") { const p0 = prof(); p0.scrSolved = (p0.scrSolved || 0) + 1; if (p0.scrSolved >= 10) unlock(p0, "scramble10"); saveProf(p0); } if (winner != null) { award("first_buzz"); if (pts >= 950) award("speed"); if (S.diff === "elite") award("elite_win"); if (S_.mode === "solo") { if (S_.streak >= 3) award("hat3"); if (S_.streak >= 10) award("streak10q"); } } S_.log.push({ round: S_.round, winner, pts }); renderQuiz();
}
const RESUME_KEY = "bkn_resume";
const getResume = (game, scope) => { try { const r = JSON.parse(localStorage.getItem(RESUME_KEY) || "null"); return r && r.game === game && r.scope === scope && r.diff === S.diff && Date.now() - r.at < 3 * 864e5 ? r : null; } catch (e) { return null; } };
const saveResume = (game, scope, score, streak, round) => { try { localStorage.setItem(RESUME_KEY, JSON.stringify({ game, scope, diff: S.diff, score, streak, round, at: Date.now() })); } catch (e) { /* blocked */ } };
const clearResume = () => { try { localStorage.removeItem(RESUME_KEY); } catch (e) { /* blocked */ } };
/* ---------- Challenge a friend from a quiz result, and the monthly recap card ---------- */
let BEAT = null;
function beatLink(game, score) { const p = prof(), nick = (p.nick || "a friend").replace(/[^A-Za-z0-9_.]/g, "").slice(0, 16) || "friend"; return `${location.origin}${location.pathname}#beat-${game}-${S.code || "ALL"}-${S.diff || "medium"}-${Math.max(0, score | 0)}-${nick}`; }
async function beatShare(game, score) { const url = beatLink(game, score), text = `I scored ${score} in ${gameName(game)} on ballknowledge. Beat it:`; try { if (navigator.share) { await navigator.share({ title: "ballknowledge challenge", text, url }); return; } } catch (e) { /* cancelled */ } try { await navigator.clipboard.writeText(`${text} ${url}`); toast("Challenge link copied. Send it to a friend."); } catch (e) { prompt("Copy this link and send it:", url); } }
function monthRecap() {
  const p = prof(), now = new Date(), ym = now.toISOString().slice(0, 7), month = now.toLocaleDateString(undefined, { month: "long" });
  const days = Object.entries(p.days || {}).filter(([k]) => k.startsWith(ym)), games = days.reduce((a, [, v]) => a + v, 0);
  let fav = null; try { const u = JSON.parse(localStorage.getItem("bk_usage") || "{}"), pre = (typeof USPORT !== "undefined" ? USPORT : "fb") + ":"; fav = Object.entries(u).filter(([k]) => k.startsWith(pre)).sort((a, b) => (b[1].n || 0) - (a[1].n || 0))[0]; } catch (e) { /* none */ }
  const favName = fav ? gameName(fav[0].split(":")[1]) : "-", m = MASCOTS[Mascot.id()], pool = m.lines.over || m.lines.hit, quote = pool[Math.floor(Math.random() * pool.length)];
  showCard("quiz", { lg: S.code || "E0", title: `${month} recap`, big: `${games} game${games === 1 ? "" : "s"}`, sub: `${days.length} day${days.length === 1 ? "" : "s"} played · ${levelOf(p.xp).name}`, tiles: [[String(dayStreak(p)), "day streak"], [favName.length > 14 ? favName.slice(0, 13) + "…" : favName, "favourite game"], [p.favT || "-", "your club"]], line: `${m.name}: "${quote.length > 70 ? quote.slice(0, 68) + "…" : quote}"`, share: `My ${month} on ballknowledge: ${games} games.` });
}
function finishQuiz() { clearResume();
  const S_ = Q.s; S_.phase = "done"; stopQuiz(); const best = Math.max(...S_.scores); if (S_.mode === "duo") { rankedEnd(S_, S_.scores); setTimeout(() => duoResult(S_.scores.slice(), QDEF[S_.game].name), 700); }
  let newBest = false; if (S_.mode === "solo") { const k = `best_${S_.game}_${S_.scope}_${S.diff}`, cur = store.items[k] || { best: 0 }; if (S_.scores[0] > cur.best) { lockIn(k, { best: S_.scores[0] }); newBest = S_.scores[0] > 0; } }
  if (S_.mode === "solo") { const sc = Math.round(Math.max(0, S_.scores[0]) * DIFFX[S.diff]); reward(30 + Math.round(sc / 100), QDEF[S_.game].name, (p) => { if (S_.scores[0] >= 3500) unlock(p, "quizmaster"); }); Board.submit({ game: S_.game, league: S_.scope === "ALL" ? "all" : S_.scope, score: sc }); }
  renderQuiz(); FX.pop("#room .rcard, #room .vd"); if (newBest) FX.best(S_.scores[0]); else if (best > 0 && S_.mode === "duo") { Snd.horn(); confetti(); }
}
const answerOf = (S_) => { const d = QDEF[S_.game]; return d.ans(S_.r); };
function answerCard(S_) {
  if (S_.game === "scramble" && S_.r.kind === "manager") return `<div class="rcard on"><div class="label">The answer</div><h3 style="font-size:30px;margin:8px 0">${esc(S_.r.e.n)}</h3><div class="fine">A manager of players in this game's data (2012-13 on).</div></div>`;
  if (S_.game === "who" || S_.game === "career" || (S_.game === "scramble" && S_.r.kind === "player")) { const p = S_.r.p; return `<div class="rcard on"><div class="label">The answer</div><div class="row" style="gap:14px;margin:8px 0">${playerPic(p, "xl")}<div><h3 style="font-size:30px">${esc(p.n)}</h3><div class="fine">${POSICON[p.pos] || ""} ${esc(p.sub || p.pos)} · ${flagOf(p.nat)} ${esc(p.nat)} · ${esc(p.club || "")}</div></div></div><div class="fine" style="margin-top:6px">${p.hist.length ? esc(p.hist.join(" → ")) : ""}</div><button type="button" class="link" data-report="player|${p.id}|${esc(p.n)}" style="margin-top:6px">Report a problem with this player</button></div>`; }
  const e = S_.r.e; return `<div class="rcard on"><div class="label">The answer</div><div class="row" style="gap:12px;margin:8px 0">${badge(e.n, "md")}<h3 style="font-size:30px">${esc(e.n)}</h3></div>${e.season ? `<div class="fine row" style="gap:6px">${emblem(e.lg, "sm")}${esc(lgOf(e.lg).name)}, ${e.season}: finished ${e.pos}${["th", "st", "nd", "rd"][e.pos % 10 > 3 || (e.pos > 10 && e.pos < 14) ? 0 : e.pos % 10]}</div>` : ""}</div>`;
}
function paintMeter() { const m = $("#qMeter"), w = $("#qWorth"); if (m) m.style.width = (100 * (1 - Q.s.elapsed / Q.s.total)).toFixed(1) + "%"; if (w) w.textContent = worth(); }
function paintAnswerClock() { const el = $("#qClock"); if (el) el.textContent = Math.max(0, Math.ceil(Q.s.answerLeft)) + "s"; }
function paintClues() { const box = $("#qClues"); if (box) box.innerHTML = cluesHTML(); }
function scrambleHTML(S_) {
  let k = 0; const words = S_.r.scr.split(/\s{2,}/).map((w) => `<div class="scw">${[...w].map((c) => `<i class="sct" style="--i:${++k}">${esc(c)}</i>`).join("")}</div>`).join("");
  const hs = scrambleClues(S_.r), order = [1, 3, 2, 4], shown = order.slice(0, S_.hn || 0).map((i) => `<div class="schint"><span class="label">${esc(hs[i][0])}</span><b>${esc(hs[i][1])}</b></div>`).join("");
  const seen = S_.scDone ? " seen" : ""; S_.scDone = true; return `<div class="scr${seen}">${words}</div>${shown ? `<div class="schints">${shown}</div>` : ""}`;
}
function scHintBar(S_) {
  if (S_.game !== "scramble") return ""; const duo = S_.mode === "duo", left = (S_.hn || 0) >= 4, v = S_.hv || [false, false], who = ["Player 1", "Player 2"];
  const btn = (i) => `<button type="button" class="btn ghost schb ${v[i] ? "on" : ""}" id="scH${i}" data-p="${i + 1}" ${left || S_.paused ? "disabled" : ""}>${duo ? (Net.role ? "Ask for a hint (H)" : who[i] + ": hint (" + (i ? "K" : "S") + ")") : "Hint (H)"}${v[i] ? " ✓" : ""}</button>`;
  const status = left ? "All hints shown." : !duo ? "A hint lowers this round's points a little." : v[0] || v[1] ? `${v[0] ? who[0] : who[1]} wants a hint. It arrives when ${v[0] ? who[1] : who[0]} agrees.` : "A hint arrives only when both players ask for one.";
  return `<div class="schintbar">${btn(0)}${duo ? btn(1) : ""}<span class="fine">${status}</span></div>`;
}
function cluesHTML() {
  const S_ = Q.s, n = shownCount();
  if (S_.game === "scramble") return scrambleHTML(S_);
  if (S_.game === "blur") return `<div class="blurwrap"><span class="badge xl" style="filter:blur(${BLUR[Math.min(n - 1, BLUR.length - 1)]}px)">${CREST[S_.r.e.n] ? `<img src="${CREST[S_.r.e.n]}" alt="">` : esc(teamCode(S_.r.e.n))}</span></div><div class="fine" style="text-align:center">The badge sharpens every few seconds</div>`;
  return S_.clues.map((c, i) => i < n ? `<div class="clue on ${i === n - 1 ? "new" : ""}"><span class="label">${esc(c[0])}</span><b>${c[2] ? `<span class="cico">${c[2]}</span>` : ""}${esc(c[1])}</b></div>` : `<div class="clue off"><span class="label">${esc(c[0])}</span><b>?</b></div>`).join("");
}
function renderQuiz() {
  const S_ = Q.s, d = QDEF[S_.game], duo = S_.mode === "duo", who = ["Player 1", "Player 2"];
  const head = gamesBar(d.name) ;
  if (S_.phase === "intro") {
    const clue = S_.game === "blur" ? "A team logo starts blurred and sharpens." : S_.game === "scramble" ? "A player or a team with the letters shuffled. Hints only arrive when everyone agrees." : "Clues start hard and get easier.";
    $("#room").innerHTML = modeIntro(d.name, `${clue} Buzz in whenever you think you know it. The sooner you are right, the more you score (up to 1,000), and a wrong guess costs 150. ${QZ.players.length ? "" : " Quiz data is missing from this build."}`, [
      ...(getResume(S_.game, S_.scope) ? [{ id: "qResume", t: `Resume your streak (${getResume(S_.game, S_.scope).streak}, ${getResume(S_.game, S_.scope).score} pts)`, d: "Pick up where you stopped." }] : []),
      { id: "qSolo", t: "Solo streak", d: "Keep going for as long as you can. The run ends the first time a round runs out of time." },
      { id: "qDuo", t: "Two players, one device", d: "Five rounds. Race to buzz: A for player 1, L for player 2. The first right answer takes the points." },
      { id: "qOnline", t: "Two players, two devices", d: "The same race, from two phones or computers, with a four-letter room code." }]); return;
  }
  if (S_.phase === "done") {
    const best = Math.max(...S_.scores), winner = duo ? (S_.scores[0] === S_.scores[1] ? -1 : S_.scores[0] > S_.scores[1] ? 0 : 1) : 0;
    const beat = !duo && BEAT && BEAT.game === S_.game ? `<div class="rcard on finbeat"><b>${S_.scores[0] > BEAT.score ? `You beat ${esc(BEAT.nick)}&#39;s ${BEAT.score}!` : S_.scores[0] === BEAT.score ? `Level with ${esc(BEAT.nick)} on ${BEAT.score}.` : `${esc(BEAT.nick)} wins this one: ${BEAT.score} to ${S_.scores[0]}.`}</b></div>` : "";
    $("#room").innerHTML = `<div class="card">${head}${finale({ label: duo ? "Full time" : `Run over · streak of ${S_.streak}`, verdict: duo ? (winner < 0 ? "A draw." : esc(who[winner]) + " wins!") : best >= 3500 ? "Serious ball knowledge." : best >= 2000 ? "Solid." : "Keep practising.", players: S_.scores.map((sc, k) => ({ name: duo ? who[k] : prof().nick || "You", score: sc, av: duo ? null : avatarHTML(prof().avatar || "", "lg", prof().nick || "You") })), winner: duo ? winner : null, good: best >= 2000, tiles: duo ? [] : [[S_.streak, "streak"], [best.toLocaleString(), "points"]], extra: beat, buttons: `<button class="btn" id="qAgain" type="button">Play again</button><button class="btn ghost" id="qCard" type="button">Make a result card</button>${duo ? "" : `<button class="btn ghost" id="qChal" type="button">Challenge a friend</button>`}` })}</div>`; return;
  }
  const rounds = duo ? (S_.rounds || d.rounds) : Infinity, last = duo ? S_.round >= rounds : S_.over, hud = `<div class="qhud"><span class="label">${duo ? `Round ${S_.round} of ${rounds}` : `Streak ${S_.streak}`}</span>${S_.scores.map((s, i) => `<span class="num qscore"><small>${duo ? who[i] : "Score"}</small> <b>${s}</b></span>`).join("")}</div>`;
  if (S_.phase === "reveal") {
    const r = S_.result, name = r.winner == null ? (duo ? "Nobody got it" : "Time ran out. The run is over") : duo ? who[r.winner] + " got it" : "You got it";
    $("#room").innerHTML = `<div class="card">${head}${hud}<div class="rcard on" style="margin-bottom:10px"><b style="font-size:20px">${name}${r.winner != null ? `: +${r.pts}` : ""}</b></div>${answerCard(S_)}<div class="row" style="margin-top:14px"><button class="btn" id="${last ? "qFinish" : "qNext"}" type="button">${last ? "See the final score" : "Next round"}</button></div></div>`; return;
  }
  const buzzed = S_.paused;
  const buzzers = duo ? `<div class="buzzers"><button class="buzz p1" id="qB0" type="button" ${S_.locked[0] || buzzed ? "disabled" : ""}>${Net.role ? "Buzz" : "Player 1"}<small>${Net.role ? "you are Player 1" : "key A"}</small></button><button class="buzz p2" id="qB1" type="button" ${S_.locked[1] || buzzed ? "disabled" : ""}>${Net.role ? "Buzz" : "Player 2"}<small>${Net.role ? "you are Player 2" : "key L"}</small></button></div>` : `<div class="buzzers"><button class="buzz p1 wide" id="qB0" type="button" ${buzzed ? "disabled" : ""}>BUZZ<small>space bar</small></button></div>`;
  const answer = buzzed ? `<div class="answerbox"><div class="row"><b>${duo ? who[S_.buzzed] : "Your answer"}</b><span class="num fine" id="qClock">${Math.ceil(S_.answerLeft)}s</span></div><div class="row"><input id="qIn" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="${QDEF[S_.game].unit === "club" ? "Type the club" : S_.game === "scramble" ? "Type the unscrambled name" : "Type the player"}" aria-label="Your answer"><button class="btn" id="qGuess" type="button">Guess</button></div><div id="qSug" class="sugs"></div></div>` : "";
  $("#room").innerHTML = `<div class="card">${head}${hud}<div class="meter"><i id="qMeter" style="width:${(100 * (1 - S_.elapsed / S_.total)).toFixed(1)}%"></i></div><div class="row" style="justify-content:space-between"><span class="fine">Worth <b class="num" id="qWorth">${worth()}</b> points now</span></div><div id="qClues" class="clues">${cluesHTML()}</div>${scHintBar(S_)}${answer}${buzzers}</div>`;
}
function paintSuggestions() {
  const S_ = Q.s, box = $("#qSug"), q = $("#qIn").value; if (!box) return;
  if (S_.game === "scramble") { box.innerHTML = ""; return; }
  const isClub = QDEF[S_.game].unit === "club", list = isClub ? suggestions(q, clubList(S_.scope), (x) => x.n) : suggestions(q, QZ.players, (x) => x.n);
  box.innerHTML = list.map((x) => isClub ? `<button type="button" class="sug" data-sug="${esc(x.n)}">${S_.game === "blur" ? "" : badge(x.n, "sm")}${esc(x.n)}</button>` : `<button type="button" class="sug" data-sug="${x.id}"><span>${esc(x.n)}</span>${list.filter((y) => y.n === x.n).length > 1 ? `<small>born ${esc(x.dob.slice(0, 4))}</small>` : ""}</button>`).join("");
}
document.addEventListener("input", (e) => { if (e.target.id === "qIn") paintSuggestions(); updateAboutOnInput(e.target); });
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") { if (e.key === "Enter" && e.target.id === "qIn") { e.preventDefault(); submitAnswer(null); } return; }
  if (Net.role === "guest" && e.code === "Space") { const gb = $("#qB1"); if (gb && !gb.disabled) { e.preventDefault(); gb.click(); } return; }
  const S_ = Q.s; if (!S_ || S_.phase !== "run" || S_.paused || !S_.game) return;
  if (S_.game === "scramble" && S_.phase === "run" && !S_.paused) { const k0 = e.key.toLowerCase(), id = S_.mode === "solo" ? (k0 === "h" ? 0 : -1) : Net.role === "host" ? (k0 === "h" ? 0 : -1) : Net.role === "guest" ? (k0 === "h" ? 1 : -1) : (k0 === "s" ? 0 : k0 === "k" ? 1 : -1); if (id >= 0) { e.preventDefault(); const hb = document.getElementById("scH" + id); if (hb && !hb.disabled) hb.click(); return; } }
  if (S_.mode === "solo" && e.code === "Space") { e.preventDefault(); buzz(0); } else if (S_.mode === "duo") { const k = e.key.toLowerCase(); if (Net.role === "host" && e.code === "Space") { e.preventDefault(); buzz(0); } else if (k === "a") { e.preventDefault(); buzz(0); } else if (k === "l" && !Net.role) { e.preventDefault(); buzz(1); } }
});

/* ---------- Where did they finish? ---------- */
function newFinish(mode) { S.fin = { mode, scope: S.code, round: 0, rounds: 5, scores: mode === "duo" ? [0, 0] : [0], streak: 0, over: false, turn: 0, phase: "ask" }; nextFinish(); }
function nextFinish() {
  const f = S.fin; f.used = f.used || new Set(); let lg, tabs, sn, n, pos;
  for (let k = 0; k < 40; k++) { lg = rnd(lgs(f.scope)); tabs = lgOf(lg).tables; sn = rnd(Object.keys(tabs)); n = tabs[sn].length; pos = Math.floor(Math.random() * n); if (!f.used.has(tabs[sn][pos][0]) && clubOK(tabs[sn][pos][0])) break; }
  f.used.add(tabs[sn][pos][0]); f.round++; f.turn = 0; f.cur = { lg, sn, n, pos: pos + 1, row: tabs[sn][pos], guess: Math.ceil(n / 2), guesses: [null, null], diffs: [0, 0], pts: [0, 0] }; f.phase = "ask"; renderFinish();
}
const ordn = (k) => k + (["th", "st", "nd", "rd"][k % 10 > 3 || (k > 10 && k < 14) ? 0 : k % 10]);
function renderFinish() {
  const f = S.fin;
  if (!f) { $("#room").innerHTML = modeIntro("Where did they finish?", "A team and a season appear. Slide to where you think it finished by wins. The closer you are, the more you score.", [
    { id: "finStart", t: "Solo streak", d: "Keep going while you are within a few places (fewer on harder levels). The first bigger miss ends the run." },
    { id: "finDuo", t: "Two players, one device", d: "Five teams. You each slide in turn without seeing the other's guess. Closest scores most." },
    { id: "finOnline", t: "Two players, two devices", d: "The same duel from two devices, with a four-letter room code." }]); return; }
  const duo = f.mode === "duo", who = ["Player 1", "Player 2"], c = f.cur, r = c.row;
  if (f.phase === "done") { const w = duo ? (f.scores[0] === f.scores[1] ? -1 : f.scores[0] > f.scores[1] ? 0 : 1) : 0; $("#room").innerHTML = `<div class="card">${gamesBar("Where did they finish?")}${finale({ label: duo ? "Full time" : `Run over · streak of ${f.streak}`, verdict: duo ? (w < 0 ? "A draw." : esc(who[w]) + " wins!") : f.streak >= 5 ? "You know your tables." : "Good effort.", players: f.scores.map((sc, k) => ({ name: duo ? who[k] : prof().nick || "You", score: sc, av: duo ? null : avatarHTML(prof().avatar || "", "lg", prof().nick || "You") })), winner: duo ? w : null, good: f.streak >= 5, tiles: duo ? [] : [[f.streak, "streak"]], buttons: `<button class="btn" id="finAgain" type="button">Play again</button><button class="btn ghost" id="finCard" type="button">Make a result card</button>` })}</div>`; return; }
  const ctx = f.phase === "ask" ? `Scored ${r[2].toFixed(1)} and allowed ${r[3].toFixed(1)} points a game` : `${r[4]} wins and ${r[6]} losses`, hud = `<div class="qhud"><span class="label">${duo ? `Round ${f.round} of ${f.rounds}` : `Streak ${f.streak}`}</span>${f.scores.map((s, i) => `<span class="num qscore"><small>${duo ? who[i] : "Points"}</small> <b>${s}</b></span>`).join("")}</div>`;
  let body;
  if (f.phase === "ask") body = `<div class="sliderbox">${duo ? `<b>${who[f.turn]}, your guess</b>` : ""}<div class="num bigpos" id="finVal">${ordn(c.guess)}</div><input type="range" id="finRange" min="1" max="${c.n}" value="${c.guess}" aria-label="Final position"><div class="row fine" style="justify-content:space-between"><span>Best record</span><span>Worst record</span></div></div><div class="row" style="margin-top:12px"><button class="btn" id="finLock" type="button">${duo && f.turn === 0 && !Net.role ? "Lock it in, pass the device" : "Lock it in"}</button></div>`;
  else { const last = duo ? f.round >= f.rounds : f.over; body = `<div class="rcard on"><div class="label">The real ranking by wins</div><div class="big num">${ordn(c.pos)}</div><div class="verdicts" style="margin-top:10px">${c.guesses.slice(0, duo ? 2 : 1).map((g, i) => `<div class="vd ${c.pts[i] === Math.max(...c.pts.slice(0, duo ? 2 : 1)) ? "ok" : "no"}"><span class="label">${duo ? who[i] : "You"}</span><b class="num">${ordn(g)}</b><span class="fine">${c.diffs[i] === 0 ? "spot on" : c.diffs[i] + " off"} · +${c.pts[i]}</span></div>`).join("")}</div>${!duo && f.over ? '<div class="fine" style="margin-top:8px">More than ${finTol()} place${finTol() === 1 ? "" : "s"} out. The run is over.</div>' : ""}</div><div class="row" style="margin-top:12px"><button class="btn" id="${last ? "finEnd" : "finNext"}" type="button">${last ? "See the final score" : "Next team"}</button></div>`; }
  $("#room").innerHTML = `<div class="card">${gamesBar("Where did they finish?")}${hud}<div class="row" style="gap:14px;margin:6px 0">${badge(r[0], "xl")}<div><h3 style="font-size:30px">${esc(r[0])}</h3><div class="fine row" style="gap:6px">${emblem(c.lg, "sm")}${esc(lgOf(c.lg).name)}, ${c.sn} · ${c.n} teams</div><div class="fine">${ctx}</div></div></div>${body}</div>`;
}
function lockFinish() {
  const f = S.fin, c = f.cur, duo = f.mode === "duo"; c.guesses[f.turn] = c.guess; Snd.lock();
  if (duo && f.turn === 0) { f.turn = 1; c.guess = Math.ceil(c.n / 2); renderFinish(); return; }
  const n = duo ? 2 : 1; for (let i = 0; i < n; i++) { c.diffs[i] = Math.abs(c.guesses[i] - c.pos); c.pts[i] = Math.max(0, 1000 - 220 * c.diffs[i]); f.scores[i] += c.pts[i]; }
  const best = Math.min(...c.diffs.slice(0, n)); if (!duo) { if (best <= finTol()) { f.streak++; FX.streak(f.streak); } else { f.over = true; FX.over(); } track("finish", best <= finTol(), c.lg); }
  f.phase = "reveal"; best === 0 ? (Snd.win(), confetti()) : best <= 2 ? Snd.right() : Snd.wrong(); renderFinish();
}
function endFinish() { const f = S.fin; f.phase = "done"; if (f.mode === "duo") rankedEnd(f, f.scores); if (f.mode === "solo") { const k = `best_finish_${f.scope}_${S.diff}`, cur = store.items[k] || { best: 0 }, sc = Math.round(f.scores[0] * DIFFX[S.diff]); if (f.scores[0] > cur.best) lockIn(k, { best: f.scores[0] }); reward(30 + Math.round(sc / 100), "Where did they finish?", null); Board.submit({ game: "finish", league: f.scope === "ALL" ? "all" : f.scope, score: sc }); } renderFinish(); }

/* ================= Market value games ================= */
const ordinal2 = (k) => k + (["th", "st", "nd", "rd"][k % 10 > 3 || (k > 10 && k < 14) ? 0 : k % 10]);
function pvPair(scope) {
  const pool = playerPool(scope, (p) => p.val >= 3000 && playerOK(p)), ratio = { easy: 3, medium: 1.8, hard: 1.35, elite: 1.1 }[S.diff];
  const seen = (S.vSeen = S.vSeen || []);
  for (let t = 0; t < 300; t++) { const a = rnd(pool), b = rnd(pool); if (a.id !== b.id && Math.max(a.val, b.val) / Math.min(a.val, b.val) >= ratio && (t > 200 || (!seen.includes(a.id) && !seen.includes(b.id)))) { seen.push(a.id, b.id); S.vSeen = seen.slice(-60); return { a, b, win: a.val >= b.val ? "a" : "b", chosen: null }; } }
  return null;
}
function cvPair(scope) {
  const pool = Object.entries(QZ.clubs).filter(([n, f]) => f.value > 0 && (scope === "ALL" || f.lg === scope) && CREST[n] && clubOK(n)), ratio = { easy: 2.5, medium: 1.6, hard: 1.3, elite: 1.08 }[S.diff];
  const seen = (S.vSeen = S.vSeen || []);
  for (let t = 0; t < 300; t++) { const [an, af] = rnd(pool), [bn, bf] = rnd(pool); if (an !== bn && Math.max(af.value, bf.value) / Math.min(af.value, bf.value) >= ratio && (t > 200 || (!seen.includes(an) && !seen.includes(bn)))) { seen.push(an, bn); S.vSeen = seen.slice(-40); return { a: { n: an, f: af }, b: { n: bn, f: bf }, win: af.value >= bf.value ? "a" : "b", chosen: null }; } }
  return null;
}
function renderVH(kind) {
  const scope = S.code, key = kind === "p" ? "pv" : "cv"; if (S[key] && S[key].sc !== scope) S[key] = null; const q = S[key] || (S[key] = (kind === "p" ? pvPair(scope) : cvPair(scope)) || null); if (q) q.sc = scope; const  st = S.vStreak || 0, best = (store.items[`v_${scope}`] || { best: 0 }).best;
  if (!q) { $("#room").innerHTML = `<div class="card">${gamesBar("Market value")}<p class="sub">Not enough data for this league.</p></div>`; return; }
  const side = (x, k) => {
    const rev = q.chosen != null, val = kind === "p" ? x.val : x.f.value, cls = rev ? (q.win === k ? "ans" : q.chosen === k ? "wrong" : "") : "";
    const info = kind === "p" ? `<span class="fine">${POSICON[x.pos] || ""} ${esc(x.sub || x.pos)} · ${flagOf(x.nat)} ${esc(x.nat)} · ${ageOf(x)} yrs</span><span class="fine">${esc(x.club || "")}</span>` : `<span class="fine">${esc(lgOf(x.f.lg).name)} · squad of ${x.f.squad}</span>`;
    return `<button type="button" class="holc ${cls}" data-vh="${k}" ${rev ? "disabled" : ""}>${kind === "p" ? playerPic(x, "xl") : badge(x.n, "xl")}<b>${esc(kind === "p" ? x.n : x.n)}</b>${info}<span class="num holv" data-v="${val}">${rev ? euro(val) : "?"}</span></button>`;
  };
  $("#room").innerHTML = `<div class="card">${gamesBar("Market value")}<p class="sub">Who is worth more on Transfermarkt${kind === "c" ? " (whole squad)" : ""}?</p><div class="holpair">${side(q.a, "a")}<span class="vs">or</span>${side(q.b, "b")}</div>
    ${q.chosen != null ? `<div class="row" style="margin-top:14px"><b class="${q.chosen === q.win ? "up" : "down"}">${q.chosen === q.win ? "Right!" : "Wrong."} Streak ${S.vStreak}</b><button class="btn" id="vNext" type="button">${q.chosen === q.win ? "Next" : "Try again"}</button></div>` : `<p class="fine" style="margin-top:10px">Streak ${st} · best ${best}</p>`}</div>`;
  if (q.chosen != null) document.querySelectorAll(".holv").forEach((el) => { const end = +el.dataset.v, t0 = performance.now(); (function f(t) { const k = REDUCED ? 1 : Math.min(1, (t - t0) / 700); if (el.isConnected) el.textContent = euro(end * k); if (k < 1 && el.isConnected) requestAnimationFrame(f); })(t0); });
}
function answerVH(kind, k) {
  const key = kind === "p" ? "pv" : "cv", q = S[key]; if (q.chosen != null) return; q.chosen = k; const ok = k === q.win; track("value", ok, null); S.vStreak = ok ? (S.vStreak || 0) + 1 : 0;
  const cur = store.items[`v_${S.code}`] || { best: 0 }; if (S.vStreak > cur.best) lockIn(`v_${S.code}`, { best: S.vStreak });
  reward(5 + (ok ? 5 + 2 * Math.min(S.vStreak, 10) : 0), "Market value", null); if (ok) Board.submit({ game: "pvalue", league: S.code === "ALL" ? "all" : S.code, score: S.vStreak });
  Snd.flip(); renderVH(kind); setTimeout(() => { ok ? (FX.hit(), S.vStreak >= 5 ? Snd.win() : Snd.right()) : (FX.miss(""), Snd.wrong()); if (ok) FX.streak(S.vStreak); if (ok && S.vStreak >= 5 && S.vStreak % 5 === 0) confetti(); }, 500);
}

/* ---------- Write your number: one or two players ---------- */
function numItem(scope) {
  const used = (S.numSeen = S.numSeen || []);
  if (Math.random() < 0.65) { let p; for (let k = 0; k < 30; k++) { p = rnd(playerPool(scope, (x) => x.val >= 5000 && playerOK(x))); if (!used.includes(p.id)) break; } used.push(p.id); return { type: "p", e: p, actual: p.val }; }
  const [n, f] = rnd(Object.entries(QZ.clubs).filter(([nm, fc]) => fc.value > 0 && (scope === "ALL" || fc.lg === scope))); return { type: "c", e: { n, f }, actual: f.value };
}
function renderValue() { if (S.num) return renderNumber(); if (S.vsolo) { S.vk = S.vk || rnd(["p", "c"]); return renderVH(S.vk); } renderNumber(); }
function newNumber(mode) { trackPlay("Market value"); S.num = { mode, scope: S.code, round: 0, rounds: 5, scores: mode === "duo" ? [0, 0] : [0], phase: "setup" }; nextNumber(); }
function nextNumber() {
  const g = S.num; g.round++; g.item = numItem(g.scope); g.guesses = [null, null]; g.turn = 0; g.phase = "guess"; g.pts = [0, 0]; renderNumber();
}
const numPts = (guess, actual) => Math.max(0, Math.round(1000 * (1 - Math.abs(Math.log(guess / actual)) / Math.log(4))));
function renderNumber() {
  const g = S.num; if (!g) { $("#room").innerHTML = modeIntro("Market value", "Transfermarkt puts a market value on every player and every squad. How well do you know the numbers?", [
    { id: "nmSolo", t: "Solo: higher or lower", d: "Two players or two squads. Pick the more valuable. Keep the streak alive." },
    { id: "nmDuo", t: "Two players, one device", d: "Write your number. A player or club appears, and you each type a value in millions. The closest guess scores most over five rounds." },
    { id: "nmOnline", t: "Two players, two devices", d: "The same duel from two devices, with a four-letter room code." }]); return; }
    const duo = g.mode === "duo", who = ["Player 1", "Player 2"], it = g.item;
  if (g.phase === "done") { const best = Math.max(...g.scores), w = duo ? (g.scores[0] === g.scores[1] ? -1 : g.scores[0] > g.scores[1] ? 0 : 1) : 0; $("#room").innerHTML = `<div class="card">${gamesBar("Write your number")}${finale({ label: "Full time", verdict: duo ? (w < 0 ? "A draw." : esc(who[w]) + " wins!") : best >= 3500 ? "Market whisperer." : "Not bad.", players: g.scores.map((sc, k) => ({ name: duo ? who[k] : prof().nick || "You", score: sc, av: duo ? null : avatarHTML(prof().avatar || "", "lg", prof().nick || "You") })), winner: duo ? w : null, good: best >= 3500, buttons: `<button class="btn" id="nmAgain" type="button">Play again</button><button class="btn ghost" id="nmCard" type="button">Make a result card</button>` })}</div>`; return; }
  const facts = it.type === "p" ? `<div class="row" style="gap:12px">${playerPic(it.e, "xl")}<div><h3 style="font-size:30px">${esc(it.e.n)}</h3><div class="fine">${POSICON[it.e.pos] || ""} ${esc(it.e.sub || it.e.pos)} · ${flagOf(it.e.nat)} ${esc(it.e.nat)} · ${ageOf(it.e)} yrs · ${esc(it.e.club || "")}</div></div></div>` : `<div class="row" style="gap:12px">${badge(it.e.n, "xl")}<div><h3 style="font-size:30px">${esc(it.e.n)}</h3><div class="fine">${esc(lgOf(it.e.f.lg).name)} · squad of ${it.e.f.squad} · average age ${it.e.f.age.toFixed(1)}</div><div class="fine">${it.e.f.seats ? "Stadium holds " + it.e.f.seats.toLocaleString() : ""}</div></div></div>`;
  const hud = `<div class="qhud"><span class="label">Round ${g.round} of ${g.rounds}</span>${g.scores.map((s, i) => `<span class="num qscore"><small>${duo ? who[i] : "Score"}</small> <b>${s}</b></span>`).join("")}</div>`;
  if (g.phase === "reveal") {
    const rows = g.guesses.slice(0, duo ? 2 : 1).map((v, i) => `<div class="vd ${g.pts[i] === Math.max(...g.pts.slice(0, duo ? 2 : 1)) ? "ok" : "no"}"><span class="label">${duo ? who[i] : "You"}</span><b class="num">${v ? "€" + v + "m" : "no answer"}</b><span class="fine">+${g.pts[i]} points</span></div>`).join("");
    $("#room").innerHTML = `<div class="card">${gamesBar("Write your number")}${hud}${facts}<div class="rcard on" style="margin-top:12px"><div class="label">Real market value</div><div class="big num">${euro(it.actual)}</div><div class="verdicts" style="margin-top:10px">${rows}</div></div><div class="row" style="margin-top:12px"><button class="btn" id="${g.round >= g.rounds ? "nmEnd" : "nmNext"}" type="button">${g.round >= g.rounds ? "See the final score" : "Next"}</button></div></div>`; return;
  }
  $("#room").innerHTML = `<div class="card">${gamesBar("Write your number")}${hud}${facts}<div class="answerbox" style="margin-top:14px"><div class="row"><b>${duo ? who[g.turn] + ", your guess" : "Your guess"} in millions of euros</b></div><div class="row"><span class="num" style="font-size:22px">€</span><input id="nmIn" inputmode="decimal" autocomplete="off" placeholder="e.g. 45" aria-label="Market value in millions of euros"><span>m</span><button class="btn" id="nmLock" type="button">${duo && g.turn === 0 && !Net.role ? "Lock it in, pass the screen" : "Lock it in"}</button></div>${duo && g.turn === 1 ? '<div class="fine">Player 1 has locked a guess. No peeking.</div>' : ""}</div></div>`;
  const i = $("#nmIn"); if (i) i.focus();
}
function lockNumber(timeout) {
  const g = S.num, inp = $("#nmIn"); let v = inp ? parseFloat(String(inp.value).replace(",", ".")) : NaN; if (!(v > 0)) { if (!timeout) { toast("Type a number above 0"); return; } v = null; }
  g.guesses[g.turn] = v; Snd.lock();
  if (g.mode === "duo" && g.turn === 0) { g.turn = 1; renderNumber(); return; }
  const n = g.mode === "duo" ? 2 : 1; for (let k = 0; k < n; k++) { g.pts[k] = g.guesses[k] ? numPts(g.guesses[k] * 1e6, g.item.actual) : 0; g.scores[k] += g.pts[k]; }
  g.phase = "reveal"; (Math.max(...g.pts) >= 800 ? (Snd.win(), confetti()) : Snd.right()); renderNumber();
}
function endNumber() { const g = S.num; g.phase = "done"; if (g.mode === "duo") rankedEnd(g, g.scores); if (g.mode === "solo") { reward(25, "Write your number", null); } renderNumber(); }


/* ================= Team roulette ================= */
function rouClub() {
  const cnt = {}; QZ.players.forEach((p) => oursSet(p).forEach((c) => { if (CREST[c] && (S.code === "ALL" || (QZ.clubs[c] || {}).lg === S.code)) cnt[c] = (cnt[c] || 0) + 1; }));
  const list = Object.entries(cnt).filter(([, n]) => n >= 15).sort((a, b) => b[1] - a[1]), th = Math.ceil(list.length / 3);
  const slice = S.diff === "easy" ? list.slice(0, th) : S.diff === "medium" ? list.slice(0, 2 * th) : S.diff === "hard" ? list.slice(th) : list.slice(2 * th);
  return rnd(slice.length ? slice : list)[0];
}
function newRoulette() { trackPlay("Team roulette"); S.rou = { round: 0, rounds: 3, wins: [0, 0], phase: "play", used: [], names: [], msg: "" }; nextRoulette(); }
function nextRoulette() { const r = S.rou; r.round++; r.club = rouClub(); r.used = []; r.names = []; r.turn = (r.round - 1) % 2; r.phase = "play"; r.msg = ""; renderRoulette(); }
function renderRoulette() {
  const r = S.rou, who = ["Player 1", "Player 2"];
  if (!r) { $("#room").innerHTML = modeIntro("Team roulette", "A team appears. Take turns naming players who played for it since 2001-02, with no repeats. A wrong name, a repeat or a timeout loses the round. First to win two rounds takes the match.", [
    { id: "rDuo", t: "Two players, one device", d: "Take turns on the same screen." },
    { id: "rOnline", t: "Two players, two devices", d: "Play a friend from your own device, with a four-letter room code." }]); return; }
  if (r.phase === "done") { const w = r.wins[0] > r.wins[1] ? 0 : 1; $("#room").innerHTML = `<div class="card">${gamesBar("Team roulette")}${finale({ label: "Match over", verdict: esc(who[w]) + " wins!", players: r.wins.map((sc, k) => ({ name: who[k], score: sc })), winner: w, buttons: `<button class="btn" id="rAgain" type="button">Play again</button>` })}</div>`; return; }
  const head = `<div class="qhud"><span class="label">Round ${r.round} of ${r.rounds}</span>${r.wins.map((s, i) => `<span class="num qscore"><small>${who[i]}</small> <b>${s}</b></span>`).join("")}</div><div class="row" style="gap:14px;margin:6px 0">${badge(r.club, "xl")}<div><h3 style="font-size:30px">${esc(r.club)}</h3><div class="fine">Players who have played for this club</div></div></div><div class="sugs" style="margin:8px 0">${r.names.map((n) => `<span class="sug">${esc(n)}</span>`).join("") || '<span class="fine">No names yet</span>'}</div>`;
  if (r.phase === "reveal") { const left = QZ.players.filter((p) => playedFor(p, r.club) && !r.used.includes(p.id)).slice(0, 8).map((p) => p.n); $("#room").innerHTML = `<div class="card">${gamesBar("Team roulette")}${head}<div class="rcard on"><b style="font-size:20px">${who[1 - r.loser]} wins the round</b><div class="fine">${who[r.loser]}: ${esc(r.why)}. ${r.bad && /never played/.test(r.why) ? `<button class="btn ghost" style="padding:4px 10px;font-size:12px" data-report="rou|${esc(r.bad.replace(/\|/g, "/"))}|${esc(r.why.replace(/\|/g, "/"))}" type="button">Report a wrong answer</button>` : ""}</div>${left.length ? `<div class="fine" style="margin-top:6px">Still available: ${esc(left.join(", "))}</div>` : ""}</div><div class="row" style="margin-top:12px"><button class="btn" id="${r.wins[0] >= 2 || r.wins[1] >= 2 || r.round >= r.rounds ? "rFinish" : "rNext"}" type="button">${r.wins[0] >= 2 || r.wins[1] >= 2 || r.round >= r.rounds ? "See the result" : "Next round"}</button></div></div>`; return; }
  $("#room").innerHTML = `<div class="card">${gamesBar("Team roulette")}${head}<div class="answerbox"><div class="row"><b>${who[r.turn]}, name a player</b></div><div class="row"><input id="rIn" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="Type a player" aria-label="Player"><button class="btn" id="rGuess" type="button">Play</button></div><div id="rSug" class="sugs"></div>${r.msg ? `<div class="fine">${esc(r.msg)}</div>` : ""}</div></div>`;
  const i = $("#rIn"); if (i) i.focus();
}
function rouSubmit(pickId) {
  const r = S.rou; let p = null;
  if (pickId != null) p = QZ.players.find((x) => x.id === +pickId); else { const typed = $("#rIn").value; p = resolveGuess(typed, QZ.players, (x) => x.n); const alt = guessPlayer(typed, QZ.players, (x) => x.hist.length >= 2 && !r.used.includes(x.id) && playedFor(x, r.club)); if (alt && (!p || (!playedFor(p, r.club) && playedFor(alt, r.club)))) p = alt; }
  if (!p) { r.msg = "Pick a player from the suggestions."; renderRoulette(); return; }
  if (p.hist.length < 2) { r.msg = `We do not have ${p.n}'s career on record, so he cannot be used. Name someone else (no round lost).`; renderRoulette(); return; }
  if (r.used.includes(p.id)) { rouLose(r.turn, `${p.n} was already named`); return; }
  if (!playedFor(p, r.club)) { r.bad = `${p.id}:${r.club}`; rouLose(r.turn, `${p.n} never played for ${r.club}`); return; }
  r.used.push(p.id); r.names.push(p.n); r.turn = 1 - r.turn; r.msg = ""; Snd.right(); renderRoulette();
}
function rouLose(who, why) { const r = S.rou; r.phase = "reveal"; r.loser = who; r.why = why; r.wins[1 - who]++; Snd.wrong(); renderRoulette(); }

/* ================= Rapid fire: 60 seconds, call as many real matches as you can ================= */
function newRapid() {
  trackPlay("Rapid fire"); const pool = allMatches(S.code); if (!pool.length) return;
  S.rp = { pool, seen: new Set(), left: 60, you: 0, mod: 0, n: 0, streak: 0, best: 0, cur: null, last: null, phase: "play", fm: DATA.profiles[S.style] };
  nextRapid(); clearInterval(S.rp.timer);
  S.rp.timer = setInterval(() => { const r = S.rp; if (!r || r.phase !== "play") { clearInterval(r && r.timer); return; } r.left--; const el = $("#rpTime"); if (el) el.textContent = r.left; if (r.left <= 0) endRapid(); }, 1000);
  renderRapid();
}
function nextRapid() { const r = S.rp; let it; for (let k = 0; k < 50; k++) { it = rnd(r.pool); if (!r.seen.has(it.season + it.i + it.c)) break; } r.seen.add(it.season + it.i + it.c); r.cur = it; }
function rapidModel(m, fm) { const adj = [m[6] * fm.a, m[7] * fm.d, m[8] * fm.h]; return "ADH"[adj.indexOf(Math.max(...adj))]; }
function renderRapid() {
  const r = S.rp;
  if (!r) { $("#room").innerHTML = `<div class="card">${gamesBar("Rapid fire")}<h2 style="margin-top:6px">Rapid fire</h2><p class="sub">60 seconds. A real match appears: tap Home, Draw or Away as fast as you can. The model calls the same matches. Whoever is right more often wins.</p><div class="row" style="margin-top:14px"><button class="btn" id="rpStart" type="button">Start</button><label class="fine">Model plays <select id="styleSel"><option value="accuracy" ${S.style === "accuracy" ? "selected" : ""}>Max Accuracy</option><option value="balanced" ${S.style === "balanced" ? "selected" : ""}>Balanced</option></select></label></div></div>`; return; }
  const it = r.cur, m = it && it.m;
  if (r.phase === "done") {
    const win = r.you > r.mod, tie = r.you === r.mod;
    $("#room").innerHTML = `<div class="card">${gamesBar("Rapid fire")}<div class="rcard on"><div class="label">Time</div><b style="font-size:26px">${win ? "You beat the model" : tie ? "A tie with the model" : "The model won"}</b><div class="tiles" style="margin-top:10px"><div class="tile"><b class="num">${r.you}</b><small>you right of ${r.n}</small></div><div class="tile"><b class="num">${r.mod}</b><small>model right</small></div><div class="tile"><b class="num">${r.best}</b><small>best streak</small></div><div class="tile"><b class="num">${r.n ? Math.round((100 * r.you) / r.n) : 0}%</b><small>your accuracy</small></div></div></div><div class="row" style="margin-top:12px"><button class="btn" id="rpStart" type="button">Go again</button></div></div>`; return;
  }
  const lg = lgOf(it.c), last = r.last ? `<div class="rplast ${r.last.ok ? "ok" : "bad"}">${r.last.ok ? "Right" : "Wrong"}: ${esc(r.last.t)}</div>` : '<div class="rplast">&nbsp;</div>';
  $("#room").innerHTML = `<div class="card">${gamesBar("Rapid fire")}<div class="qhud"><span class="label">You ${r.you} · Model ${r.mod}${r.streak > 1 ? ` · streak ${r.streak}` : ""}</span><b class="num" id="rpTime">${r.left}</b></div>${last}
    <div class="rpmatch"><div class="fine">${esc(lg.name)} · ${esc(it.season)} · ${esc(fmtDate ? fmtDate(m[0]) : m[0])}</div><div class="rpteams"><div>${clubBadgeFor(m[1], "md") || badge(m[1], "md")}<b>${esc(m[1])}</b></div><span class="fine">vs</span><div>${clubBadgeFor(m[2], "md") || badge(m[2], "md")}<b>${esc(m[2])}</b></div></div></div>
    <div class="rpbtns"><button class="btn" data-rp="H" type="button">Home win</button><button class="btn" data-rp="D" type="button">Draw</button><button class="btn" data-rp="A" type="button">Away win</button></div><p class="fine" style="text-align:center;margin-top:8px">Keys: H, D, A</p></div>`;
}
function rapidPick(k) {
  const r = S.rp; if (!r || r.phase !== "play") return; const m = r.cur.m, ok = m[5] === k, mo = rapidModel(m, r.fm) === m[5];
  r.n++; if (ok) { r.you++; r.streak++; r.best = Math.max(r.best, r.streak); Snd.tick(); FX.hit(); FX.streak(r.streak); } else { r.streak = 0; Snd.wrong(); } if (mo) r.mod++;
  r.last = { ok, t: `${m[1]} ${m[3]}–${m[4]} ${m[2]}` }; nextRapid(); renderRapid();
}
function endRapid() { const r = S.rp; if (!r || r.phase === "done") return; r.phase = "done"; clearInterval(r.timer); if (r.you > r.mod) { Snd.win(); confetti(); } else Snd.whistle(); reward(5 + r.you * 2 + (r.you > r.mod ? 20 : 0), "Rapid fire", (p) => { if (r.you > r.mod) unlock(p, "rapid_win"); if (r.you >= 20) unlock(p, "rapid_20"); }); Board.submit({ game: "rapid", league: S.code === "ALL" ? "all" : S.code, score: r.you }); renderRapid(); }

/* ================= Bracket buster: call every Champions League knockout tie, round by round ================= */
const BB = DATA.bracket || [], BBPTS = [1, 2, 3, 4];
const bbTeam = (n) => `<span class="bbc">${clubBadgeFor(n, "md") || badge(n, "md")}<b>${esc(n)}</b></span>`;
function newBracket() {
  trackPlay("Bracket buster"); const s = rnd(BB); if (!s) { toast("No brackets in this build."); return; }
  S.bb = { s, r: 0, picks: {}, locked: false, you: 0, mod: 0, ptsYou: 0, ptsMod: 0 }; renderBracket();
}
function renderBracket() {
  const b = S.bb;
  if (!b) { $("#room").innerHTML = `<div class="card">${gamesBar("Bracket buster")}<h2 style="margin-top:6px">Bracket buster</h2><p class="sub">A real Champions League knockout, from the round of 16 to the final. In each round, pick who goes through in every tie, lock it in, and see who really did. A plain Elo rating plays the same ties, and later rounds are worth more.</p><div class="row" style="margin-top:14px"><button class="btn" id="bbStart" type="button">Start</button></div></div>`; return; }
  const rd = b.s.rounds[b.r], n = rd.ties.length, last = b.r === b.s.rounds.length - 1, done = b.phase === "done", sn = `${b.s.season}-${String(b.s.season + 1).slice(2)}`;
  if (done) { const win = b.ptsYou > b.ptsMod, tie = b.ptsYou === b.ptsMod; $("#room").innerHTML = `<div class="card">${gamesBar("Bracket buster")}<div class="rcard on"><div class="label">Champions League ${sn}</div><b style="font-size:26px">${win ? "You beat the Elo model" : tie ? "Level with the Elo model" : "The Elo model won"}</b><div class="tiles" style="margin-top:10px"><div class="tile"><b class="num">${b.ptsYou}</b><small>your points</small></div><div class="tile"><b class="num">${b.ptsMod}</b><small>Elo model points</small></div><div class="tile"><b class="num">${b.you}/15</b><small>your ties right</small></div><div class="tile"><b class="num">${b.mod}/15</b><small>model ties right</small></div></div></div><div class="row" style="margin-top:12px"><button class="btn" id="bbStart" type="button">Another season</button></div></div>`; return; }
  const filled = Object.keys(b.picks).length;
  const ties = rd.ties.map((t, i) => { const p = b.picks[i], pa = 1 / (1 + Math.pow(10, (t.eb - t.ea) / 400)), mp = t.ea >= t.eb ? "a" : "b";
    const btn = (side) => { const cls = [p === side ? "sel" : "", b.locked ? (t.w === side ? "won" : p === side ? "lost" : "") : ""].join(" "); return `<button type="button" class="bbt ${cls}" data-bb="${i}|${side}" ${b.locked ? "disabled" : ""}>${bbTeam(side === "a" ? t.a : t.b)}</button>`; };
    return `<div class="bbtie">${btn("a")}<span class="fine">vs</span>${btn("b")}${b.locked ? `<div class="fine bbinfo">${p === t.w ? "You were right." : "You picked the other side."} Elo model: ${Math.round(100 * (mp === "a" ? pa : 1 - pa))}% for ${esc(mp === "a" ? t.a : t.b)} ${mp === t.w ? "(right)" : "(wrong)"}</div>` : ""}</div>`; }).join("");
  $("#room").innerHTML = `<div class="card">${gamesBar("Bracket buster")}<div class="qhud"><span class="label">Champions League ${sn} · ${esc(rd.name)} · ${BBPTS[b.r]} point${BBPTS[b.r] > 1 ? "s" : ""} per tie</span><span class="label">You ${b.ptsYou} · Elo model ${b.ptsMod}</span></div><div class="bbgrid">${ties}</div>
    <div class="row" style="margin-top:12px">${b.locked ? `<button class="btn" id="bbNext" type="button">${last ? "See the result" : "Next round"}</button>` : `<button class="btn" id="bbLock" type="button" ${filled === n ? "" : "disabled"}>Lock round (${filled}/${n})</button>`}</div></div>`;
}
function bbLock() {
  const b = S.bb; if (!b || b.locked) return; const rd = b.s.rounds[b.r], pt = BBPTS[b.r]; let y = 0, m = 0;
  rd.ties.forEach((t, i) => { if (b.picks[i] === t.w) y++; if ((t.ea >= t.eb ? "a" : "b") === t.w) m++; });
  b.you += y; b.mod += m; b.ptsYou += y * pt; b.ptsMod += m * pt; b.locked = true; y >= m ? Snd.right() : Snd.wrong(); renderBracket();
}
function bbNext() {
  const b = S.bb; if (!b || !b.locked) return; if (b.r >= b.s.rounds.length - 1) { b.phase = "done"; if (b.ptsYou > b.ptsMod) { Snd.win(); confetti(); } reward(5 + b.you * 3 + (b.ptsYou > b.ptsMod ? 20 : 0), "Bracket buster", (p) => { if (b.ptsYou > b.ptsMod) unlock(p, "bracket_win"); }); Board.submit({ game: "bracket", league: "all", score: b.ptsYou }); renderBracket(); return; }
  b.r++; b.picks = {}; b.locked = false; Snd.tick(); renderBracket();
}

/* ================= Who did it: guess the highlights (scorers, assisters, penalty takers, red cards) ================= */
const HL = DATA.highlights || [];
const ICKINDS = [["any", "Surprise me", () => true], ["ucl", "Champions League", (m) => m.comp === "Champions League"], ["intl", "World Cups and Euros", (m) => /World Cup|European Championship/.test(m.comp)], ["cup", "Domestic cup finals", (m) => /FA Cup|Copa|DFB|Coppa/.test(m.comp)], ["league", "League giants", (m) => /Premier|Bundesliga|La Liga/.test(m.comp)]];
function newIconic() {
  trackPlay("Who did it"); const f = (ICKINDS.find((k) => k[0] === (S.icKind || "any")) || ICKINDS[0])[2], pool = HL.filter(f); if (!pool.length) { toast("No matches of that kind in this build."); return; }
  const m = rnd(pool), qs = [];
  m.ev.forEach((e, i) => { if (e.k === "goal") { qs.push({ i, q: e.pen ? "Who converted the penalty?" : "Who scored?", ans: e.p }); if (e.a) qs.push({ i, q: "Who set it up?", ans: e.a, assist: true }); } else qs.push({ i, q: e.why === "second yellow" ? "Who was sent off for a second yellow?" : "Who was sent off?", ans: e.p }); });
  const cap = qs.filter((q) => !q.assist).length > 10 ? qs.filter((q) => !q.assist).slice(0, 10) : qs.slice(0, 12);
  S.ic = { m, qs: cap, k: 0, got: {}, wrong: 0, hints: 0, hint: 0, skipped: 0, phase: "play", msg: "" }; renderIconic();
}
function icHint(s, level) { const t = s.split(" "), sur = t[t.length - 1]; return level === 1 ? `${t.length > 1 ? t[0][0] + ". " : ""}${sur.length} letters in the surname` : `Surname starts with “${sur.slice(0, 3)}”`; }
function renderIconic() {
  const x = S.ic;
  if (!x) { $("#room").innerHTML = `<div class="card">${gamesBar("Who did it")}<h2 style="margin-top:6px">Who did it</h2><p class="sub">A famous match appears with its result and the highlights: the minute of every goal and red card, who it was for, and how. You name the scorer, the player who set it up, the penalty taker and who was sent off.</p><p class="fine">${HL.length} big matches: Champions League finals and semi-finals (and big quarter-finals of the last five seasons), domestic cup finals with a big club in them, the top-three clashes of the Premier League and La Liga, Der Klassiker, and World Cup and Euro semi-finals and finals. Goals, minutes and cards come from match records (minutes are whole minutes, so a goal in added time shows as, say, 93'). A match is skipped if its goals do not add up to its score (own goals are not marked in the source). A penalty has no assist: the record only names the player who won it.</p><div class="scope" style="padding:2px 0;margin-top:8px">${ICKINDS.map(([k, n, f]) => `<button type="button" class="chip" data-ick="${k}" aria-pressed="${(S.icKind || "any") === k}">${n} (${HL.filter(f).length})</button>`).join("")}</div><div class="row" style="margin-top:14px"><button class="btn" id="icStart" type="button">Start</button></div></div>`; return; }
  const m = x.m, done = x.phase === "done", cur = x.qs[x.k], sn = m.season >= 1990 && !/World Cup|European/.test(m.comp) ? `${m.season}-${String(m.season + 1).slice(2)}` : String(m.season);
  const asked = new Set(x.qs.map((q) => q.i)), rows = m.ev.map((e, i) => {
    const mine = x.qs.filter((q) => q.i === i), isCur = !done && cur && cur.i === i, side = e.s === "h" ? m.h : m.a;
    const ok = (q) => x.got[x.qs.indexOf(q)];
    const scorer = mine.find((q) => !q.assist), assist = mine.find((q) => q.assist);
    const name = (q, real) => (done || x.got[x.qs.indexOf(q)] ? esc(real) : isCur && cur === q ? "<b>?</b>" : "…");
    const txt = e.k === "goal" ? `${e.pen ? "Penalty" : "Goal"}${e.how && !e.pen ? ` (${e.how})` : ""} for ${esc(side)}: ${scorer ? name(scorer, e.p) : esc(e.p)}${e.a ? ` · assist ${assist ? name(assist, e.a) : esc(e.a)}` : " · no assist recorded"}` : `${e.why === "second yellow" ? "Second yellow, red card" : "Red card"} for ${esc(side)}: ${scorer ? name(scorer, e.p) : name(mine[0], e.p)}`;
    return `<li class="icrow ${isCur ? "cur" : ""} ${e.k}"><span class="num">${e.m}'</span><span>${e.k === "goal" ? "<svg class=ic><use href=#i-ball></use></svg>" : "<i class=\"redcard\"></i>"} ${txt}</span></li>`;
  }).join("");
  const correct = Object.keys(x.got).length, score = Math.max(0, correct * 100 - x.wrong * 15 - x.hints * 30);
  $("#room").innerHTML = `<div class="card">${gamesBar("Who did it")}<div class="qhud"><span class="label">${esc(m.t)} · ${esc(sn)} · ${esc(fmtDate(m.date))}</span><b class="num">${correct}/${x.qs.length}</b></div>
    <div class="icscore"><b>${esc(m.h)}</b><span class="num">${m.hg} – ${m.ag}</span><b>${esc(m.a)}</b></div>
    <ol class="iclist">${rows}</ol>
    ${done ? `<div class="rcard on" style="margin-top:12px"><b style="font-size:20px">${correct === x.qs.length ? "Perfect highlights" : `${correct} of ${x.qs.length}`}</b><div class="fine">Score ${score}. ${x.wrong} wrong guess${x.wrong === 1 ? "" : "es"}, ${x.hints} hint${x.hints === 1 ? "" : "s"}, ${x.skipped} skipped.</div></div><div class="row" style="margin-top:12px"><button class="btn" id="icStart" type="button">Another match</button></div>`
    : `<div class="answerbox"><div class="row"><b>${esc(cur.q)}</b><span class="fine">minute ${m.ev[cur.i].m}</span></div><div class="row"><input id="icIn" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="Type a surname" aria-label="Player"><button class="btn" id="icGuess" type="button">Guess</button><button class="btn ghost" id="icHint" type="button">Hint (-30)</button><button class="btn ghost" id="icSkip" type="button">Skip</button></div>${x.hint ? `<div class="fine">Hint: ${esc(icHint(cur.ans, x.hint))}</div>` : ""}${x.msg ? `<div class="fine">${esc(x.msg)}</div>` : ""}</div>`}</div>`;
  const i = $("#icIn"); if (i) i.focus();
}
function icMatch(typed, ans) { return nameMatch(typed, ans); }
function icAdvance() { const x = S.ic; x.k++; x.hint = 0; x.msg = ""; if (x.k >= x.qs.length) { x.phase = "done"; const c = Object.keys(x.got).length; if (c === x.qs.length) { Snd.win(); confetti(); } else Snd.whistle(); reward(5 + c * 3 + (c === x.qs.length ? 15 : 0), "Who did it", (p) => { p.icPlays = (p.icPlays || 0) + 1; if (c === x.qs.length && x.qs.length >= 4) unlock(p, "ic_perfect"); }); Board.submit({ game: "iconic", league: "all", score: Math.max(0, c * 100 - x.wrong * 15 - x.hints * 30) }); } renderIconic(); }
function icGuess() { const x = S.ic; if (!x || x.phase !== "play") return; const cur = x.qs[x.k], v = ($("#icIn") || {}).value || ""; if (!v.trim()) return; if (icMatch(v, cur.ans)) { x.got[x.k] = true; x.msg = ""; Snd.right(); icAdvance(); } else { x.wrong++; x.msg = `"${v.trim()}" is not it.`; Snd.wrong(); renderIconic(); } }

/* ================= Starting XI ================= */
const XI = DATA.xi || [];
const XIPOS = { Goalkeeper: [0, 1], "Left-Back": [1, 0], "Centre-Back": [1, 1], Sweeper: [1, 1], "Right-Back": [1, 2], "Defensive Midfield": [2, 1], "Left Midfield": [3, 0], "Central Midfield": [3, 1], "Right Midfield": [3, 2], "Left Winger": [4, 0], "Attacking Midfield": [4, 1], "Right Winger": [4, 2], "Second Striker": [5, 1], "Centre-Forward": [5, 1] };
const XIKINDS = [["any", "Surprise me"], ["final", "Finals"], ["knockout", "Champions League semis and quarters"], ["league", "League giants"]];
const xiTok = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/ø/g, "o").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
function xiLayout(xi) {
  const rows = {}; xi.forEach((p, i) => { const [r, c] = XIPOS[p.pos] || [3, 1]; (rows[r] || (rows[r] = [])).push({ i, c }); });
  const keys = Object.keys(rows).map(Number).sort((a, b) => a - b), pos = {};
  keys.forEach((r, ri) => { const row = rows[r].sort((a, b) => a.c - b.c || a.i - b.i); row.forEach((e, k) => { pos[e.i] = { x: ((k + 1) / (row.length + 1)) * 100, y: 8 + (keys.length > 1 ? (ri / (keys.length - 1)) * 80 : 40) }; }); });
  return pos;
}
function newXI() {
  trackPlay("Starting XI");
  const kind = S.xiKind || "any", pool = XI.filter((m) => kind === "any" || m.k === kind); if (!pool.length) { toast("No lineups of that kind in this build."); return; } const m = rnd(pool);
  const side = Math.random() < 0.5 ? 0 : 1, team = m.teams[side];
  S.xi = { m, side, team, found: new Set(), wrong: 0, hints: 0, hintOf: {}, left: S.diff === "elite" ? 120 : 180, phase: "play", msg: "", pos: xiLayout(team.xi) };
  clearInterval(S.xi.timer); S.xi.timer = setInterval(() => { const x = S.xi; if (!x || x.phase !== "play") { clearInterval(S.xi && S.xi.timer); return; } x.left--; const el = $("#xiTime"); if (el) el.textContent = `${Math.floor(x.left / 60)}:${String(x.left % 60).padStart(2, "0")}`; if (x.left <= 0) endXI(); }, 1000);
  renderXI();
}
function xiMatch(x) {
  const t = x.team, o = x.m.teams[1 - x.side], sn = `${x.m.season}-${String(x.m.season + 1).slice(2)}`, home = x.m.teams[0], away = x.m.teams[1];
  return { head: `${x.m.t} · ${x.m.k === "final" || x.m.k === "knockout" ? "" : x.m.comp + " "}${sn} · ${fmtDate(x.m.date)}`.replace(" · ·", " ·"), vs: `${home.club} ${x.m.hg}–${x.m.ag} ${away.club}`, you: t.club, other: o.club };
}
function renderXI() {
  const x = S.xi;
  if (!x) { $("#room").innerHTML = `<div class="card">${gamesBar("Starting XI")}<h2 style="margin-top:6px">Starting XI</h2><p class="sub">A real match and one of its teams. Name the eleven players who started. Type a surname; it can go in any slot.</p><p class="fine">${XI.length} matches: Champions League finals back to 2000 (2013-14 on also the semi-finals, the big quarter-finals, cup finals with a big club, and the top-three clashes of the Premier League and La Liga plus Der Klassiker; the 2000 to 2012-13 finals use lineups from Wikipedia). Difficulty sets the clues: Easy shows first letters and shirt numbers, Medium the numbers, Hard only the positions, and Elite also cuts the clock from 3 minutes to 2.</p><div class="scope" style="padding:2px 0;margin-top:8px">${XIKINDS.map(([k, n]) => `<button type="button" class="chip" data-xik="${k}" aria-pressed="${(S.xiKind || "any") === k}">${n} (${k === "any" ? XI.length : XI.filter((m) => m.k === k).length})</button>`).join("")}</div><div class="row" style="margin-top:14px"><button class="btn" id="xiStart" type="button">Start</button></div></div>`; return; }
  const mt = xiMatch(x), done = x.phase === "done", d = S.diff, showNum = d === "easy" || d === "medium", showLetter = d === "easy";
  const slots = x.team.xi.map((p, i) => { const f = x.found.has(i), miss = done && !f, ps = x.pos[i], q = QZ.players.find((z) => z.id === p.id), sur = p.n.split(" ").slice(-1)[0], hint = x.hintOf[i];
    return `<div class="xis ${f ? "ok" : miss ? "miss" : ""}" style="left:${ps.x}%;bottom:${ps.y}%"><span class="xin">${f || miss ? (q ? playerPic(q, "sm") : `<b>${esc(p.num)}</b>`) : showNum ? `<b>${esc(p.num)}</b>` : "<b>?</b>"}</span><small>${f || miss ? esc(sur) : hint ? esc(sur.slice(0, hint)) + "…" : showLetter ? esc(sur[0]) + "…" : ""}</small></div>`; }).join("");
  const nF = x.found.size, score = xiScore(x);
  $("#room").innerHTML = `<div class="card">${gamesBar("Starting XI")}<div class="qhud"><span class="label">${esc(mt.head)}</span><span class="label">${esc(mt.vs)}</span><b class="num" id="xiTime">${Math.floor(x.left / 60)}:${String(x.left % 60).padStart(2, "0")}</b></div>
    ${x.m.src ? `<div class="fine">Lineup source: ${esc(x.m.src)}.</div>` : ""}<p class="sub" style="margin:6px 0 10px">Name the XI that started for <b>${esc(mt.you)}</b> (${nF} of 11). ${done ? (x.team.won ? `${esc(mt.you)} won this final.` : `${esc(mt.you)} lost this final.`) : ""}</p>
    <div class="xipitch">${slots}</div>
    ${done ? `<div class="rcard on" style="margin-top:12px"><b style="font-size:20px">${nF === 11 ? "Perfect XI" : `${nF} of 11`}</b><div class="fine">Score ${score}. ${x.wrong} wrong guess${x.wrong === 1 ? "" : "es"}, ${x.hints} hint${x.hints === 1 ? "" : "s"}.</div></div><div class="row" style="margin-top:12px"><button class="btn" id="xiAgain" type="button">Another XI</button></div>`
    : `<div class="answerbox"><div class="row"><input id="xiIn" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="Type a surname" aria-label="Player surname"><button class="btn" id="xiGuess" type="button">Add</button><button class="btn ghost" id="xiHint" type="button">Hint (-30)</button><button class="btn ghost" id="xiGiveUp" type="button">Give up</button></div>${x.msg ? `<div class="fine">${esc(x.msg)}</div>` : ""}</div>`}</div>`;
  const i = $("#xiIn"); if (i) i.focus();
}
const xiScore = (x) => Math.max(0, x.found.size * 100 + (x.found.size === 11 ? x.left : 0) - x.wrong * 20 - x.hints * 30);
function xiGuess() {
  const x = S.xi; if (!x || x.phase !== "play") return; const el = $("#xiIn"), g = xiTok(el ? el.value : ""); if (!g.length) return;
  let hit = -1;
  x.team.xi.forEach((p, i) => { if (hit < 0 && !x.found.has(i) && nameMatch(el ? el.value : "", p.n)) hit = i; });
  if (hit >= 0) { x.found.add(hit); x.msg = `${x.team.xi[hit].n} was in the XI.`; Snd.right(); if (x.found.size === 11) { endXI(); return; } }
  else { x.wrong++; x.msg = `"${el.value.trim()}" did not start for ${x.team.club} in this final.`; Snd.wrong(); }
  renderXI();
}
function editOne(a, b) { if (a === b) return true; let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1); if (a.length + 1 === b.length) return a.slice(i) === b.slice(i + 1); if (b.length + 1 === a.length) return a.slice(i + 1) === b.slice(i); return false; }
function endXI() { const x = S.xi; if (!x || x.phase === "done") return; x.phase = "done"; clearInterval(x.timer); const n = x.found.size; if (n === 11) { Snd.win(); confetti(); } else Snd.whistle(); reward(5 + n * 3 + (n === 11 ? 20 : 0), "Starting XI", (p) => { if (n === 11) unlock(p, "xi_perfect"); }); Board.submit({ game: "xi", league: "all", score: Math.min(1000, xiScore(x)) }); renderXI(); }

/* ================= Basketball tic-tac-toe ================= */
const POSNAME = { Goalkeeper: "Goalkeepers", Defender: "Defenders", Midfield: "Midfielders", Attack: "Attackers" };
const LGLABEL = { E0: "Plays in the Premier League", D1: "Plays in the Bundesliga", SP1: "Plays in La Liga", I1: "Plays in Serie A", F1: "Plays in Ligue 1" };
/* Categories come in families (club, nationality, honours, ...). Every game offers twelve categories from twelve DIFFERENT families, one version of each,
   and every pair of them is checked so that no two overlap (one inside the other) and every square has several correct answers. Players then draft: X picks
   three rows and O picks three columns, taking turns. Any choice is safe because every pair was already checked. */
const FAMNAME = { club: "Club", league: "League", nat: "Nationality", age: "Age", height: "Height", foot: "Foot", value: "Value", caps: "Country caps", letter: "Name", trophy: "Honour", award: "Award", mate: "Teammate", mgr: "Manager", career: "Career", pos: "Position" };
const CONT = {
  "UEFA nation": ["Albania", "Armenia", "Austria", "Belgium", "Bosnia-Herzegovina", "Bulgaria", "Croatia", "Cyprus", "Czech Republic", "Denmark", "England", "Estonia", "Finland", "France", "Georgia", "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Israel", "Italy", "Kosovo", "Latvia", "Lithuania", "Luxembourg", "Malta", "Moldova", "Montenegro", "Netherlands", "North Macedonia", "Northern Ireland", "Norway", "Poland", "Portugal", "Romania", "Russia", "Scotland", "Serbia", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland", "Türkiye", "Turkey", "Ukraine", "Wales"],
  "African nation": ["Algeria", "Angola", "Benin", "Burkina Faso", "Burundi", "Cameroon", "Cape Verde", "Central African Republic", "Comoros", "Cote d'Ivoire", "DR Congo", "Egypt", "Equatorial Guinea", "Gabon", "Ghana", "Guinea", "Guinea-Bissau", "Kenya", "Libya", "Mali", "Mauritania", "Morocco", "Mozambique", "Niger", "Nigeria", "Senegal", "Sierra Leone", "South Africa", "The Gambia", "Togo", "Tunisia", "Zambia", "Zimbabwe"],
  "South American nation": ["Argentina", "Brazil", "Chile", "Colombia", "Ecuador", "Paraguay", "Peru", "Uruguay", "Venezuela"],
  "North or Central American nation": ["Canada", "Curacao", "Dominican Republic", "Guadeloupe", "Haiti", "Honduras", "Jamaica", "Mexico", "Panama", "Suriname", "United States"],
  "Asian or Oceanian nation": ["Australia", "Bangladesh", "Indonesia", "Iraq", "Japan", "Jordan", "Korea, South", "Malaysia", "New Zealand", "Saudi Arabia", "Syria", "Uzbekistan"],
};
const ico = (n) => `<span class="cflag"><svg class=ic><use href=#i-${n}></use></svg></span>`;
const careerClubs = (p) => new Set(p.hist.filter((h) => !/yth|youth|\bu\d\d\b|\bii\b|\bb$|\bc$|castilla|jugend|juvenil|primavera|reserve/i.test(h)).map((h) => qnorm(h)));
function tttCategories(pool, scope) {
  const F = {}, add = (c) => { (F[c.fam] || (F[c.fam] = [])).push(c); }, count = (f) => pool.filter(f).length, big = scope === "ALL";
  const clubs = {}, nats = {}; pool.forEach((p) => { oursSet(p).forEach((c) => { clubs[c] = (clubs[c] || 0) + 1; }); if (p.nat) nats[p.nat] = (nats[p.nat] || 0) + 1; });
  const minC = big ? 45 : 20;
  Object.entries(clubs).filter(([c, n]) => n >= minC && CREST[c] && (big || (QZ.clubs[c] || {}).lg === scope || n >= minC * 2)).forEach(([c]) => add({ id: "club:" + c, fam: "club", label: `Played for ${c}`, icon: badge(c, "md"), tags: [(QZ.clubs[c] || {}).lg].filter(Boolean), test: (p) => playedFor(p, c) }));
  if (big) Object.keys(LGLABEL).forEach((lg) => add({ id: "lg:" + lg, fam: "league", label: LGLABEL[lg], icon: emblem(lg, "sm"), tags: [lg], test: (p) => LG_OF_COMP[p.comp] === lg }));
  Object.entries(nats).filter(([n, v]) => v >= (big ? 35 : 14)).forEach(([n]) => add({ id: "nat:" + n, fam: "nat", label: `${n} players`, icon: `<span class="cflag">${flagOf(n) || "<svg class=ic><use href=#i-globe></use></svg>"}</span>`, test: (p) => p.nat === n }));
  Object.entries(CONT).forEach(([name, list]) => { const f = (p) => list.includes(p.nat); if (count(f) >= (big ? 60 : 25)) add({ id: "cont:" + name, fam: "nat", label: `From a${/^[AEIOU]/.test(name) ? "n" : ""} ${name}`, icon: ico("globe"), test: f }); });
  /* honours: league titles come from match records (2017-18 on), cups from the winners lists (2016-17 on); a player counts if the club was his at the start of that season */
  Object.keys(LGLABEL).forEach((lg) => { const f = (p) => (p.ti || []).includes(lg); if (count(f) >= (big ? 14 : 8)) add({ id: "ti:" + lg, fam: "trophy", label: `Won the ${lgOf(lg).name} (2012-13 on)`, icon: ico("trophy"), tags: [lg], test: f }); });
  const anyT = (p) => (p.ti || []).length > 0; if (count(anyT) >= 30) add({ id: "ti:any", fam: "trophy", label: "Won a Big 5 league title (2012-13 on)", icon: ico("trophy"), test: anyT });
  const HON = { UCL: ["Won the Champions League", null], UEL: ["Won the Europa League", null], FAC: ["Won the FA Cup", "E0"], CDR: ["Won the Copa del Rey", "SP1"], DFB: ["Won the DFB-Pokal", "D1"], COP: ["Won the Coppa Italia", "I1"] };
  Object.entries(HON).forEach(([k, [label, lg]]) => { const f = (p) => (p.hn || []).includes(k); if (count(f) >= (k === "UCL" ? 20 : 10)) add({ id: "hn:" + k, fam: "trophy", label: `${label} (2012-13 on)`, icon: ico("trophy"), tags: lg ? [lg] : [], test: f }); });
  [["bdo", "Won the Ballon d'Or", (p) => (p.aw || []).includes("BDO"), 5, "medal"], ["wc14", "At the 2014 World Cup", (p) => (p.tn || []).includes("WC14"), 50, "globe"], ["wc18", "At the 2018 World Cup", (p) => (p.tn || []).includes("WC18"), 50, "globe"]].forEach(([id, label, f, min, ic]) => { if (count(f) >= min) add({ id: "aw:" + id, fam: "award", label, icon: ico(ic), test: f }); });
  /* teammates: stars and everyone who shared a club with them for a year or more */
  const starCount = {}; pool.forEach((p) => (p.tm || []).forEach((id) => { starCount[id] = (starCount[id] || 0) + 1; }));
  Object.entries(starCount).filter(([, n]) => n >= (big ? 25 : 12)).forEach(([id]) => { const st = QZ.players.find((x) => x.id === +id); if (st) add({ id: "tm:" + id, fam: "mate", label: `Played with ${st.n} (20+ matches)`, icon: faceOf(st.n) ? `<span class="badge md hface"><img src="${faceOf(st.n)}" alt=""></span>` : ico("handshake"), test: (p) => (p.tm || []).includes(+id) }); });
  /* managers: the manager on the bench in a match the player appeared in (3 or more matches), 2012-13 on */
  const mc = {}; pool.forEach((p) => (p.mg || []).forEach((m) => { mc[m] = (mc[m] || 0) + 1; }));
  Object.entries(mc).filter(([, n]) => n >= (big ? 45 : 20)).forEach(([m]) => add({ id: "mg:" + m, fam: "mgr", label: `Played under ${m} (2012-13 on)`, icon: ico("coach"), test: (p) => (p.mg || []).includes(m) }));
  /* career */
  [["clubs6", "Played for 6 or more clubs", (p) => careerClubs(p).size >= 6, "suitcase"], ["leagues2", "Played in 2 or more of the Big 5 leagues", (p) => new Set([...oursSet(p)].map((c) => (QZ.clubs[c] || {}).lg).filter(Boolean)).size >= 2, "compass"], ["leagues3", "Played in 3 or more of the Big 5 leagues", (p) => new Set([...oursSet(p)].map((c) => (QZ.clubs[c] || {}).lg).filter(Boolean)).size >= 3, "compass"]].forEach(([id, label, f, ic]) => { if (count(f) >= 25) add({ id: "cr:" + id, fam: "career", label, icon: ico(ic), test: f }); });
  /* age, build, foot, value, caps, name */
  [["age30", "Aged 30 or over", (p) => ageOf(p) >= 30, "hourglass"], ["age23", "Aged 23 or under", (p) => ageOf(p) <= 23, "sprout"], ["b80", "Born in the 1980s", (p) => p.dob >= "1980" && p.dob < "1990", "calendar"], ["b90", "Born in the 1990s", (p) => p.dob >= "1990" && p.dob < "2000", "calendar"], ["b00", "Born in the 2000s", (p) => p.dob >= "2000" && p.dob < "2010", "calendar"]].forEach(([id, label, f, ic]) => { if (count(f) >= 25) add({ id: "age:" + id, fam: "age", label, icon: ico(ic), test: f }); });
  [["tall", "190 cm or taller", (p) => p.h >= 190, "ruler"], ["tall195", "195 cm or taller", (p) => p.h >= 195, "ruler"], ["short", "Under 176 cm", (p) => p.h > 0 && p.h < 176, "ruler"]].forEach(([id, label, f, ic]) => { if (count(f) >= 25) add({ id: "h:" + id, fam: "height", label, icon: ico(ic), test: f }); });
  [["left", "Left-footed", (p) => p.foot === "left", "boot"], ["both", "Two-footed", (p) => p.foot === "both", "boot"]].forEach(([id, label, f, ic]) => { if (count(f) >= (id === "both" ? 18 : 25)) add({ id: "foot:" + id, fam: "foot", label, icon: ico(ic), test: f }); });
  [["val50", "Worth €50m or more", (p) => p.val >= 50e6, "euro"], ["val10", "Worth under €10m", (p) => p.val > 0 && p.val < 10e6, "coin"], ["peak100", "Once worth €100m or more", (p) => p.peak >= 100e6, "gem"]].forEach(([id, label, f, ic]) => { if (count(f) >= 25) add({ id: "val:" + id, fam: "value", label, icon: ico(ic), test: f }); });
  [["caps50", "50 or more caps", (p) => p.caps >= 50, "cap"], ["caps100", "100 or more caps", (p) => p.caps >= 100, "cap"]].forEach(([id, label, f, ic]) => { if (count(f) >= 15) add({ id: "caps:" + id, fam: "caps", label, icon: ico(ic), test: f }); });
  const ln = {}; pool.forEach((p) => { const L = qnorm(p.n)[0]; if (L) ln[L] = (ln[L] || 0) + 1; });
  Object.entries(ln).filter(([L, n]) => /[a-z]/.test(L) && n >= (big ? 110 : 40)).forEach(([L]) => add({ id: "L:" + L, fam: "letter", label: `Name starts with ${L.toUpperCase()}`, icon: `<span class="cflag"><b>${L.toUpperCase()}</b></span>`, test: (p) => qnorm(p.n)[0] === L }));
  /* position: the four groups and the exact roles */
  Object.keys(POSNAME).forEach((k) => add({ id: "pos:" + k, fam: "pos", label: POSNAME[k], icon: `<span class="cflag">${POSICON[k]}</span>`, test: (p) => p.pos === k }));
  ["Centre-Back", "Left-Back", "Right-Back", "Defensive Midfield", "Central Midfield", "Attacking Midfield", "Left Winger", "Right Winger", "Centre-Forward"].forEach((s) => { if (count((p) => p.sub === s) >= 40) add({ id: "sub:" + s, fam: "pos", label: s + "s", icon: ico(/Back|Centre-Back/.test(s) ? "shield" : /Midfield/.test(s) ? "gear" : "ball"), test: (p) => p.sub === s }); });
  return F;
}
/* Twelve categories, one per family, every pair compatible. Returns null if none could be built. */
function tttOptions(scope) {
  const pool = playerPool(scope, (p) => poolOK(p) && p.hist.length >= 2 && p.pos && p.nat), F = tttCategories(pool, scope), K = { easy: 3, medium: 4, hard: 4, elite: 2 }[S.diff] || 3, cache = new Map();
  const mask = (c) => { if (!c.m) { c.m = new Uint8Array(pool.length); c.n = 0; for (let i = 0; i < pool.length; i++) if (c.test(pool[i])) { c.m[i] = 1; c.n++; } } return c.m; };
  const compat = (a, b) => {
    if (a.fam === b.fam) return false; if (a.tags && b.tags && a.tags.some((t) => b.tags.includes(t))) return false;
    const k = a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id; if (cache.has(k)) return cache.get(k);
    const ma = mask(a), mb = mask(b); let x = 0; for (let i = 0; i < pool.length; i++) if (ma[i] && mb[i]) x++;
    const ok = x >= K + 1 && x <= 0.7 * Math.min(a.n, b.n); cache.set(k, ok); return ok;
  };
  const fams = Object.keys(F).filter((f) => F[f].length); let best = [];
  for (let t = 0; t < 40 && best.length < 12; t++) {
    const chosen = [];
    shuffle(fams).forEach((f) => { if (chosen.length >= 12) return; const c = shuffle(F[f]).slice(0, 8).find((x) => chosen.every((y) => compat(x, y))); if (c) chosen.push(c); });
    if (chosen.length > best.length) best = chosen;
  }
  if (best.length < 8) return null;
  return { pool, opts: shuffle(best) };
}
const TTT_ORDER = [0, 1, 0, 1, 0, 1];
function newTTT(mode, series) { trackPlay("Basketball tic-tac-toe");
  let o = tttOptions(S.code); const was = S.diff, order = ["easy", "medium", "hard", "elite"];
  for (let i = order.indexOf(was) + 1; !o && i < order.length; i++) { S.diff = order[i]; o = tttOptions(S.code); if (o) toast("Not enough easy players in this league, so the grid uses a wider pool."); }
  S.diff = was; if (!o) { toast("Could not build categories for this league. Try All leagues."); return; }
  S.ttt = { mode, series: series || (S.tttBo3 ? { w: [0, 0], n: 1 } : null), pool: o.pool, opts: o.opts, picks: [[], []], step: 0, grid: null, cells: Array(9).fill(null), used: new Set(), turn: 0, phase: "draft", sel: null, winner: null, msg: "" }; renderTTT(); draftCpu();
}
function draftPick(id) {
  const t = S.ttt; if (!t || t.phase !== "draft") return; const c = t.opts.find((x) => x.id === id); if (!c || t.picks[0].includes(c) || t.picks[1].includes(c)) return;
  t.picks[TTT_ORDER[t.step]].push(c); t.step++; Snd.lock();
  if (t.step >= 6) { const rows = t.picks[0], cols = t.picks[1]; t.grid = { rows, cols, pool: t.pool, counts: rows.map((r) => cols.map((c2) => t.pool.filter((p) => r.test(p) && c2.test(p)).length)) }; t.phase = "play"; t.turn = 0; t.msg = "Grid ready. X goes first."; renderTTT(); return; }
  t.turn = TTT_ORDER[t.step]; renderTTT(); draftCpu();
}
function draftCpu() {
  const t = S.ttt; if (!t || t.phase !== "draft" || t.mode !== "solo" || t.turn !== 1) return;
  setTimeout(() => { if (!S.ttt || S.ttt !== t || t.phase !== "draft" || t.turn !== 1) return; const free = t.opts.filter((x) => !t.picks[0].includes(x) && !t.picks[1].includes(x)); draftPick(rnd(free).id); }, REDUCED ? 0 : 900);
}
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const tttWin = (cells) => { for (const l of LINES) { const [a, b, c] = l; if (cells[a] != null && cells[a] === cells[b] && cells[b] === cells[c]) return { who: cells[a], line: l }; } return null; };
function catHead(c, cls = "") { return `<div class="tcat ${cls}">${c.icon || ""}<span>${esc(c.label)}</span></div>`; }
function renderTTT() {
  const t = S.ttt; if (!t) { $("#room").innerHTML = modeIntro("Basketball tic-tac-toe", "Every row and column is a basketball category. Name a player who fits both to claim the square. No repeats, and a wrong answer loses your turn. Three in a row wins.", [
    { id: "ttDuo", t: "Two players, one device", d: "Take turns on the same screen." },
    { id: "ttOnline", t: "Two players, two devices", d: "Play a friend from your own device, with a four-letter room code." }]); return; }
    const who = t.mode === "solo" ? ["You", "Computer"] : ["Player 1", "Player 2"], mark = ["X", "O"];
  if (t.phase === "draft") { renderDraft(t, who, mark); return; }
  const g = t.grid, win = t.winner ? tttWin(t.cells) : null;
  const cells = t.cells.map((v, i) => `<button type="button" class="tcell ${v === 0 ? "x" : v === 1 ? "o" : ""} ${win && win.line.includes(i) ? "win" : ""}" data-tc="${i}" ${v != null || t.phase !== "play" || (t.mode === "solo" && t.turn === 1) ? "disabled" : ""}>${v != null ? `<b>${mark[v]}</b>${t.pl && t.pl[i] ? playerPic(t.pl[i], "sm") : ""}<small>${esc(t.names && t.names[i] || "")}</small>` : ""}</button>`).join("");
  const sr = t.series ? ` · Best of 3, game ${t.series.n}, score ${t.series.w[0]}-${t.series.w[1]}` : "", sWin = t.series ? t.series.w.findIndex((x) => x >= 2) : -1;
  const status = (t.phase === "over" ? (t.winner === "draw" ? "It's a draw." : `${who[t.winner.who !== undefined ? t.winner.who : t.winner]} wins${sWin >= 0 ? " the series" : ""}!`) : `${who[t.turn]} (${mark[t.turn]}) to play`) + sr;
  const panel = t.sel != null && t.phase === "play" ? `<div class="answerbox"><div class="row"><b>Name a player who fits both: <u>${esc(g.rows[Math.floor(t.sel / 3)].label)}</u> and <u>${esc(g.cols[t.sel % 3].label)}</u></b></div><div class="row"><input id="tIn" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="Type a player" aria-label="Player"><button class="btn" id="tGuess" type="button">Play</button><button class="btn ghost" id="tCancel" type="button">Cancel</button></div><div id="tSug" class="sugs"></div></div>` : "";
  $("#room").innerHTML = `<div class="card">${gamesBar("Basketball tic-tac-toe")}<div class="qhud"><span class="label">${status}</span></div>
    <div class="tgrid"><div class="tcorner"></div>${g.cols.map(catHead).join("")}${[0, 1, 2].map((r) => catHead(g.rows[r], "rowh") + [0, 1, 2].map((c) => cells.split("</button>").slice(0, 9)[r * 3 + c] + "</button>").join("")).join("")}</div>
    ${t.msg ? `<div class="fine" style="margin-top:8px">${esc(t.msg)}${t.rep ? ` <button class="btn ghost" style="padding:4px 10px;font-size:12px" data-report="ttt|${esc(t.rep.replace(/\|/g, "/"))}|${esc(t.repLab.replace(/\|/g, "/"))}" type="button">Report a wrong answer</button>` : ""}</div>` : ""}${panel}${t.phase === "over" ? `<div class="row" style="margin-top:12px">${t.series && sWin < 0 ? `<button class="btn" id="ttNext" type="button">${t.winner === "draw" ? "Replay this game" : "Next game"}</button>` : `<button class="btn" id="ttAgain" type="button">${t.series ? "New series" : "Rematch"}</button>`}<button class="btn ghost" id="ttCard" type="button">Make a result card</button></div>` : ""}</div>`;
  const i = $("#tIn"); if (i) i.focus();
}
function renderDraft(t, who, mark) {
  const done = (c) => (t.picks[0].includes(c) ? 0 : t.picks[1].includes(c) ? 1 : -1), locked = t.mode === "solo" && t.turn === 1;
  const left = 3 - t.picks[t.turn].length, role = t.turn === 0 ? "a row" : "a column";
  const tiles = t.opts.map((c) => { const d = done(c); return `<button type="button" class="tdr ${d >= 0 ? "taken " + (d ? "o" : "x") : ""}" data-dr="${esc(c.id)}" ${d >= 0 || locked ? "disabled" : ""}><span class="tdi">${c.icon || ""}</span><b>${esc(c.label)}</b><small>${esc(FAMNAME[c.fam] || "")}</small>${d >= 0 ? `<i class="tdm">${mark[d]}</i>` : ""}</button>`; }).join("");
  const chips = (i) => t.picks[i].map((c) => `<span class="chip2">${esc(c.label)}</span>`).join("") || '<span class="fine">none yet</span>';
  $("#room").innerHTML = `<div class="card">${gamesBar("Basketball tic-tac-toe")}<div class="qhud"><span class="label">Pick the categories${t.series ? ` · Best of 3, game ${t.series.n}, score ${t.series.w[0]}-${t.series.w[1]}` : ""}</span>${t.step === 0 && !(t.series && t.series.n > 1) ? `<button type="button" class="chip" id="ttBo3" aria-pressed="${!!S.tttBo3}">Best of 3</button>` : ""}</div>
    <p class="sub" style="margin:6px 0 12px"><b>${who[t.turn]} (${mark[t.turn]})</b>: pick ${role}${locked ? "…" : ""} (${left} left to pick). Take turns. X's three picks become the rows, O's three the columns. Every pick works with every other one, so every square can be won.</p>
    <div class="tdraft">${tiles}</div>
    <div class="tdsum"><div><span class="label">Rows (X)</span><div class="row" style="gap:6px;margin-top:4px">${chips(0)}</div></div><div><span class="label">Columns (O)</span><div class="row" style="gap:6px;margin-top:4px">${chips(1)}</div></div></div></div>`;
}
function factsOf(p) { return [p.nat, p.sub || p.pos, p.club ? "now at " + p.club : "", `${careerClubs(p).size} clubs on record`].filter(Boolean).join(" · "); }
function tttSubmit(pickId) {
  const t = S.ttt, g = t.grid, r = g.rows[Math.floor(t.sel / 3)], c = g.cols[t.sel % 3]; let p = null;
  if (pickId != null) p = QZ.players.find((x) => x.id === +pickId); else { const typed = $("#tIn").value; p = resolveGuess(typed, g.pool, (x) => x.n); const alt = guessPlayer(typed, g.pool, (x) => !t.used.has(x.id) && r.test(x) && c.test(x)); if (alt && (!p || (!(r.test(p) && c.test(p)) && r.test(alt) && c.test(alt)))) p = alt; }
  t.rep = null;
  if (!p) { t.msg = "Pick a player from the suggestions."; renderTTT(); return; }
  if (t.used.has(p.id)) { t.msg = `${p.n} is already on the board. Turn lost.`; Snd.wrong(); endTurn(); return; }
  if (r.test(p) && c.test(p)) { t.cells[t.sel] = t.turn; (t.names || (t.names = {}))[t.sel] = p.n.split(" ").slice(-1)[0]; (t.pl || (t.pl = {}))[t.sel] = p; t.used.add(p.id); t.msg = `${p.n} fits. Square claimed.`; Snd.right(); } else { const bad = [r, c].filter((x) => !x.test(p)).map((x) => x.label); t.rep = `${p.id}:${bad.map((l) => l.slice(0, 22)).join("+")}`; t.repLab = `${p.n} was rejected for "${bad.join('" and "')}"`; t.msg = `${p.n} does not fit "${bad.join('" or "')}". Turn lost. (${factsOf(p)})`; Snd.wrong(); }
  t.sel = null; endTurn();
}
function endTurn() {
  const t = S.ttt; t.sel = null; const w = tttWin(t.cells); if (w) { t.winner = w; t.phase = "over"; Snd.win(); confetti(); finishTTT(); renderTTT(); return; }
  if (t.cells.every((v) => v != null)) { t.winner = "draw"; t.phase = "over"; finishTTT(); renderTTT(); return; }
  t.turn = 1 - t.turn; renderTTT(); if (t.mode === "solo" && t.turn === 1) setTimeout(computerMove, REDUCED ? 0 : 900);
}
function computerMove() {
  const t = S.ttt; if (!t || t.phase !== "play" || t.turn !== 1) return; const g = t.grid, free = t.cells.map((v, i) => (v == null ? i : -1)).filter((i) => i >= 0);
  const wins = (who, i) => { const c = t.cells.slice(); c[i] = who; return !!tttWin(c); };
  let move = free.find((i) => wins(1, i)); if (move == null) move = free.find((i) => wins(0, i)); if (move == null) move = free.includes(4) && Math.random() < 0.6 ? 4 : rnd(free);
  const valid = g.pool.filter((p) => g.rows[Math.floor(move / 3)].test(p) && g.cols[move % 3].test(p) && !t.used.has(p.id)); const miss = Math.random() < 0.25;
  if (miss || !valid.length) { t.msg = "The computer could not think of one. Your turn."; Snd.wrong(); t.turn = 0; renderTTT(); return; }
  const p = rnd(valid.slice(0, Math.max(3, Math.ceil(valid.length / 2)))); t.cells[move] = 1; (t.names || (t.names = {}))[move] = p.n.split(" ").slice(-1)[0]; (t.pl || (t.pl = {}))[move] = p; t.used.add(p.id); t.msg = `The computer plays ${p.n}.`; Snd.tick(); endTurn();
}
function finishTTT() { const t = S.ttt; if (t.mode === "duo") { const sc = t.winner === "draw" ? [0, 0] : t.winner.who === 0 ? [1, 0] : [0, 1]; setTimeout(() => duoResult(sc, "Basketball tic-tac-toe"), 900); } if (t.series && t.winner !== "draw" && t.winner) { t.series.w[t.winner.who]++; } if (t.mode === "duo") rankedEnd(t, t.winner === "draw" ? [0, 0] : t.winner.who === 0 ? [1, 0] : [0, 1]); const won = t.mode === "solo" && t.winner && t.winner.who === 0; reward(20 + (won ? 40 : 0), "Basketball tic-tac-toe", (p) => { if (won) unlock(p, "tttwin"); }); if (won) Board.submit({ game: "ttt", league: S.code === "ALL" ? "all" : S.code, score: 1 }); }



/* ================= Online rooms =================
   One player hosts: the host's browser runs the game and sends a copy of the game panel to the guest after every change, and the guest sends
   back only their clicks and typed text, which the host applies if it is genuinely the guest's turn. So there is no second copy of the game
   logic to keep in step. Two transports: a BroadcastChannel (two tabs of the same browser, used for testing and offline) and Supabase
   Realtime broadcast (two devices, when the build has a database). */
/* A tiny MQTT-over-WebSocket client: public brokers relay the messages between two devices, so rooms need no account or database. */
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
const BROKERS = ["wss://broker.hivemq.com:8884/mqtt", "wss://broker.emqx.io:8084/mqtt", "wss://test.mosquitto.org:8081"];
const Net = {
  role: null, code: null, bc: null, ws: null, hb: null, obs: null, last: "", guestOn: false, game: null, t: 0,
  send(m) {
    m.from = this.role; m.i = Math.random().toString(36).slice(2); try { if (this.bc) this.bc.postMessage(m); } catch (e) { /* closed */ }
    (this.mq || []).forEach((q) => q.send(m));
  },
  open(code) {
    this.close(); this.code = code; this.seen = new Set(); this.welcomed = false; this.since = Date.now();
    try { this.bc = new BroadcastChannel("btm-" + code); this.bc.onmessage = (e) => this.recv(e.data); } catch (e) { this.bc = null; }
    this.mq = BROKERS.map((u) => mqttConnect(u, "ballknowledge/nba/v1/" + code, (m) => this.recv(m), (up) => this.onLink(up)));
    this.sti = setInterval(() => this.paintStatus(), 1000);
  },
  onLink(up) { this.paintStatus(); if (up && this.role === "guest" && this.welcomed) { this.send({ k: "hello", uid: Account.signedIn ? Account.session.user.id : null, nick: prof().nick || "", card: Vs.me() }); toast("Reconnected"); } else if (!up && this.role && (this.started || this.welcomed) && !this.linked()) toast("Connection lost. Reconnecting…"); },
  linked() { return (this.mq || []).filter((q) => q.open).length; },
  paintStatus() {
    document.body.dataset.net = this.role || "";
    const rb = $("#reactBar"); if (rb) rb.hidden = !(this.role && (this.started || this.welcomed));
    const el = $("#roomStatus"); if (!el || !this.role) return;
    if (this.role === "host") { if (this.started) { el.textContent = "Player 2 is in. Good luck!"; return; } const link = inviteLink(this.code, this.game); el.innerHTML = `Room <b class="num" style="font-size:22px">${this.code}</b> ${this.linked() ? "is open" : "is connecting…"}. Send the code, or this link, to your friend:<div class="row" style="margin-top:6px"><input id="inviteBox" readonly value="${esc(link)}" style="flex:1;min-width:0;font:600 13px var(--mono);padding:9px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink)"><button class="btn" id="roomCopy" type="button">Copy link</button></div>`; return; }
    if (this.welcomed) { el.textContent = "Connected. Waiting for the game to appear…"; return; }
    const secs = Math.round((Date.now() - this.since) / 1000);
    el.textContent = !this.linked() ? (secs > 12 ? "Could not reach the room server. Check your connection and try again." : "Connecting to the room server…") : secs > 20 ? `Connected, but nobody is hosting ${this.code}. Check the code, and that your friend has created the room and is still on that screen.` : `Looking for room ${this.code}…`;
  },
  close() { document.body.dataset.net = ""; if (Vs.on) Vs.close(); const rb = $("#reactBar"); if (rb) rb.hidden = true; if (this.role === "host" && Ranked.lt) Ranked.stopLobby(); this.ranked = false; this.guest = null; this.lastRef = null; if (this.bc) { try { this.bc.close(); } catch (e) { /* ignore */ } } (this.mq || []).forEach((q) => q.close()); clearInterval(this.sti); clearInterval(this.hi); if (this.obs) this.obs.disconnect(); this.bc = this.mq = this.obs = null; this.role = null; this.started = false; this.guestOn = false; },
  recv(m) {
    if (!m || m.from === this.role) return; if (m.i) { if (this.seen && this.seen.has(m.i)) return; if (this.seen) { this.seen.add(m.i); if (this.seen.size > 400) this.seen = new Set([...this.seen].slice(-100)); } }
    if (this.role === "host") {
      if (m.k === "hello") { this.guest = { uid: m.uid, nick: m.nick }; this.send({ k: "welcome", ranked: !!this.ranked, card: Vs.me(), gcard: m.card || { nick: m.nick } }); if (!Net.started) { if (!Vs.matched) { Net.started = true; Vs.match(Vs.me(), m.card || { nick: m.nick || "Player 2" }, () => { Net.started = false; if (Net.role === "host") startOnline(); }); } } else if (!Vs.matched) this.push(true); }
      else if (m.k === "react") floatReact(m.e);
      else if (m.k === "sk") skPop(m.id, m.nick, m.line, false);
      else if (m.k === "click") applyRemote(m);
      else if (m.k === "input") { const el = document.getElementById(m.id); if (el && guestTurn()) { el.value = m.v; el.dispatchEvent(new Event("input", { bubbles: true })); } }
    } else if (this.role === "guest") {
      if (m.k === "welcome" || m.k === "html") { this.welcomed = true; clearInterval(this.hi); }
      if (m.k === "react") floatReact(m.e);
      if (m.k === "sk") skPop(m.id, m.nick, m.line, false);
      if (m.k === "duo") duoResultShow(m.names, m.scores, m.sub);
      if (m.k === "welcome" && m.ranked) this.ranked = true;
      if (m.k === "welcome" && !Vs.matched && !Vs.seen) { Vs.seen = true; Vs.match(Vs.me(), m.card || { nick: "Host" }); }
      if (m.k === "result" && this.ranked && Account.signedIn) { Ranked.report(m.mid, m.hostUid, m.guestRes, m.game); }
      if (m.k === "html") { const room = $("#room"); const active = document.activeElement && document.activeElement.id, keep = {}; ["qIn", "tIn", "nmIn", "finRange", "rIn"].forEach((id) => { const x = document.getElementById(id); if (x) keep[id] = x.value; }); room.innerHTML = m.h; Object.keys(keep).forEach((id) => { const x = document.getElementById(id); if (x) { x.value = keep[id]; if (id === active) { x.focus(); try { x.setSelectionRange(x.value.length, x.value.length); } catch (e) { /* not a text box */ } } } }); paintGuestBanner(); }
      else if (m.k === "end") { toast("The host left the room"); this.close(); }
    }
  },
  push(force) {
    if (this.role !== "host" || !Net.started) return; const room = $("#room"); if (!room) return; const h = room.innerHTML;
    if (!force && h === this.last) return; this.last = h; this.send({ k: "html", h });
  },
  watch() {
    if (this.obs) this.obs.disconnect(); let pend = 0;
    this.obs = new MutationObserver(() => { if (pend) return; pend = setTimeout(() => { pend = 0; this.push(); }, 120); });
    this.obs.observe($("#room"), { childList: true, subtree: true, attributes: true, characterData: true });
  },
};
const codeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const newRoomCode = () => Array.from({ length: 4 }, () => codeChars[Math.floor(Math.random() * codeChars.length)]).join("");
function guestTurn() { if (Q.s && Q.s.mode === "duo" && Q.s.phase === "run") return Q.s.buzzed === 1; if (S.rou && S.rou.phase === "play") return S.rou.turn === 1; if (S.fin && S.fin.mode === "duo") return S.fin.turn === 1 && S.fin.phase === "ask"; if (S.num && S.num.mode === "duo") return S.num.turn === 1; if (S.ttt && S.ttt.mode === "duo") return S.ttt.turn === 1; return false; }
/* sidekick talk in online matches: your sidekick (or theirs) pops up with a line, on both screens, in its own voice */
function skPop(id, nick, line, mine) {
  if (!MASCOT_SVG[id] || typeof line !== "string") return; document.querySelectorAll(".skpop." + (mine ? "me" : "them")).forEach((x) => x.remove());
  const e = document.createElement("div"); e.className = "skpop " + (mine ? "me" : "them"); e.setAttribute("role", "status");
  e.innerHTML = `<span class="skpf">${MASCOT_SVG[id](mine ? "happy" : "wow")}</span><span class="skpb"><b>${esc((MASCOTS[id] || {}).name || "Sidekick")} <small>${mine ? "yours" : "· " + esc(String(nick).slice(0, 16))}</small></b>${esc(line)}</span>`;
  document.body.appendChild(e); setTimeout(() => e.classList.add("out"), 4200); setTimeout(() => e.remove(), 4700);
  try { if (Mascot.mode() === "on") AIVoice.play(line, { voice: MASCOTS[id].voice, volume: 0.9 }); } catch (x) { /* no voice */ }
}
function floatReact(e) { const s = document.createElement("span"); s.className = "floater"; s.textContent = e; s.style.left = 12 + Math.random() * 76 + "%"; document.body.appendChild(s); setTimeout(() => s.remove(), 1900); }
function startOnline() {
  Ranked.stopLobby(); Net.started = true; const g = Net.game;
  if (QDEF[g]) { newQuiz(g, "duo", S.code); Q.s.mode = "duo"; Q.s.scores = [0, 0]; nextRound(); }
  else if (g === "roulette") newRoulette(); else if (g === "finish") newFinish("duo"); else if (g === "number") newNumber("duo"); else if (g === "ttt") newTTT("duo");
  Net.watch(); Net.push(true); toast("Player 2 joined. You are Player 1.");
}
const inviteLink = (code, game) => `${location.origin}${location.pathname}#join-${code}-${game}`;
function openOnline(game) {
  const box = $("#roomBox"); if (!box) return; Net.game = game;
  box.innerHTML = `<div class="rcard on" style="margin-top:14px"><b>Two devices</b><p class="fine">Create a room and send your friend the link or the 4-letter code. Or join theirs. It works over the internet, so you can be anywhere.</p><div class="row"><button class="btn" id="roomMake" type="button">Create a room</button><input id="roomCode" maxlength="4" placeholder="CODE" aria-label="Room code" style="text-transform:uppercase;width:90px;font:700 18px var(--mono, monospace);padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink)"><button class="btn ghost" id="roomJoin" type="button">Join</button></div><div id="roomStatus" class="fine" style="margin-top:10px"></div></div>`;
}
/* ================= Epic ranked-room overlay: waiting, joining, versus ================= */
const Vs = {
  el: null, tm: [], on: false,
  clear() { this.tm.forEach(clearTimeout); this.tm = []; clearInterval(this.iv); },
  close() { this.clear(); this.on = false; const e = this.el; this.el = null; if (e) { e.classList.add("out"); setTimeout(() => e.remove(), 360); } },
  mount(cls, html) { this.clear(); if (this.el) this.el.remove(); const e = document.createElement("div"); e.className = "vso " + cls; e.setAttribute("role", "dialog"); e.setAttribute("aria-label", "Online match"); e.style.setProperty("--rc", this.rc()); e.innerHTML = html; document.body.appendChild(e); this.el = e; this.on = true; return e; },
  rc() { const c = Account.signedIn ? Ranked.elo : 1000; return c >= 1400 ? "#d36bff" : c >= 1250 ? "#5aa8ff" : c >= 1150 ? "#5ad6d0" : c >= 1050 ? "#f2b632" : c >= 950 ? "#b9c2d0" : "#c07a45"; },
  me() { const p = prof(); return { nick: p.nick || "Guest", elo: Account.signedIn ? Ranked.elo : null, avatar: p.avatar || "", badges: myBadges() }; },
  wait(code, game) {
    const c = this.me(), link = inviteLink(code, game);
    const e = this.mount("waiting", `<div class="vsw"><div class="vsttl">${Net.ranked ? "Ranked lobby" : "Private room"}</div><div class="vsstage"><i class="vsr"></i><i class="vsr"></i><i class="vsr"></i><i class="vsradar"></i><span class="vsme">${avatarHTML(c.avatar, "xl", c.nick)}</span></div><div class="vsname">${esc(c.nick)}${badgesHTML(c.badges)}</div><div class="vsttl">Waiting for an opponent<i>.</i><i>.</i><i>.</i></div><div class="vscode" aria-label="Room code ${esc(code)}">${code.split("").map((ch) => `<b>${esc(ch)}</b>`).join("")}</div><div class="vsmsg" id="vsMsg">Share the code or the invite link.</div><div class="row" style="justify-content:center"><button class="btn" id="vsCopy" type="button">Copy invite link</button><button class="btn ghost" id="vsCancel" type="button">Cancel</button></div></div>`);
    e.querySelector("#vsCopy").onclick = () => { try { navigator.clipboard.writeText(link).then(() => toast("Invite link copied"), () => toast(link)); } catch (x) { toast(link); } };
    e.querySelector("#vsCancel").onclick = () => Vs.cancel();
    this.iv = setInterval(() => { const m = $("#vsMsg"); if (m && !Net.linked()) m.textContent = "Connecting to the room server…"; else if (m) m.textContent = "Room is open. Share the code or the invite link."; }, 1500);
  },
  join(code) {
    this.seen = false; const c = this.me(), since = Date.now();
    const e = this.mount("joining", `<div class="vsw"><div class="vsttl">Joining room</div><div class="vscode">${code.split("").map((ch) => `<b>${esc(ch)}</b>`).join("")}</div><div class="vsstage"><i class="vsr"></i><i class="vsr"></i><i class="vsr"></i><i class="vsradar"></i><span class="vsme">${avatarHTML(c.avatar, "xl", c.nick)}</span></div><div class="vsname">${esc(c.nick)}${badgesHTML(c.badges)}</div><div class="vsttl" id="vsJt">Connecting<i>.</i><i>.</i><i>.</i></div><div class="vsmsg" id="vsMsg"></div><button class="btn ghost" id="vsCancel" type="button">Cancel</button></div>`);
    e.querySelector("#vsCancel").onclick = () => Vs.cancel();
    this.iv = setInterval(() => { const m = $("#vsMsg"), s = (Date.now() - since) / 1000; if (!m) return; m.textContent = !Net.linked() ? (s > 12 ? "Could not reach the room server. Check your connection." : "Reaching the room server…") : s > 20 ? "Connected, but nobody is hosting this room. Check the code." : "Looking for the host…"; }, 1200);
  },
  cancel() { this.close(); Net.close(); S.rk = false; go(""); },
  card(c, side) {
    c = c || {}; const elo = Number.isFinite(+c.elo) && c.elo != null ? Math.round(+c.elo) : null, rk = elo != null ? rankOf(elo) : null;
    const ids = (Array.isArray(c.badges) ? c.badges : []).filter((x) => typeof x === "string" && /^[a-z0-9_]{2,24}$/.test(x)).slice(0, 3);
    return `<div class="vsc ${side}"><span>${avatarHTML(typeof c.avatar === "string" ? c.avatar.slice(0, 60) : "", "xl", String(c.nick || "?"))}</span><div class="vsname">${esc(String(c.nick || "Player").slice(0, 16))}</div>${badgesHTML(ids, true)}${elo != null ? `<div class="vselo">${elo}</div><div class="vsrk">${rk.icon} ${rk.name}</div>` : '<div class="vsrk">Guest</div>'}</div>`;
  },
  match(a, b, done) {
    if (this.matched) return; this.matched = true;
    const e = this.mount("versus", `<div class="vsflash"></div><div class="vsvs"><div class="vsvsl"></div>${this.card(a, "l")}<div class="vsmid"><div class="vsx">VS</div></div>${this.card(b, "r")}</div><div class="vscount" id="vsCnt" aria-live="polite"></div>`);
    Snd.lock();
    const cnt = (txt, at) => this.tm.push(setTimeout(() => { const n = $("#vsCnt"); if (n) n.innerHTML = `<b>${txt}</b>`; Snd.count(txt === "GO" ? 0 : +txt); }, at));
    cnt("3", 1700); cnt("2", 2300); cnt("1", 2900); cnt("GO", 3500);
    this.tm.push(setTimeout(() => { Vs.matched = false; Vs.close(); if (done) done(); }, 4100));
  },
};
/* ================= Satisfying extras: match result overlay, answer flashes ================= */
function duoNames() { if (Net.role === "host") return [prof().nick || "Player 1", (Net.guest && Net.guest.nick) || "Player 2"]; return ["Player 1", "Player 2"]; }
function duoResultShow(names, scores, sub) {
  const w = scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1, card = (i) => `<div class="vsc ${i === 0 ? "l" : "r"} ${w === i ? "winner" : w === -1 ? "" : "loser"}"><span>${avatarHTML("", "xl", names[i])}</span><div class="vsname">${esc(String(names[i]).slice(0, 16))}</div><div class="vselo">${scores[i]}</div>${w === i ? '<div class="vsrk"><svg class=ic><use href=#i-crown></use></svg> Winner</div>' : ""}</div>`;
  const e = Vs.mount("versus result", `<div class="vsflash"></div><div class="vsvs"><div class="vsvsl"></div>${card(0)}<div class="vsmid"><div class="vsx" style="font-size:clamp(30px,8vw,56px)">${w === -1 ? "DRAW" : "FT"}</div></div>${card(1)}</div><div class="vsw" style="margin-top:22px"><div class="vsttl">${w === -1 ? "Nothing to separate you" : esc(names[w]) + " takes it"}${sub ? " · " + esc(sub) : ""}</div><button class="btn" id="vsDone" type="button" style="margin-top:12px">Continue</button></div>`);
  e.querySelector("#vsDone").onclick = () => Vs.close(); Snd.win(); if (w >= 0) setTimeout(confetti, 500);
}
function duoResult(scores, sub) { const names = duoNames(); duoResultShow(names, scores, sub); if (Net.role === "host") Net.send({ k: "duo", names, scores, sub: sub || "" }); }
function flashEdge(ok) { const d = document.documentElement; d.classList.remove("fl-ok", "fl-no"); void d.offsetWidth; d.classList.add(ok ? "fl-ok" : "fl-no"); setTimeout(() => d.classList.remove("fl-ok", "fl-no"), 700); }
function makeRoom() { const code = newRoomCode(); Net.role = "host"; Net.started = false; Net.open(code); Net.role = "host"; Net.paintStatus(); Snd.lock(); Vs.wait(code, Net.game); }
function joinRoomCode(c) { Net.role = "guest"; Net.open(c); Net.role = "guest"; const hello = () => Net.send({ k: "hello", uid: Account.signedIn ? Account.session.user.id : null, nick: prof().nick || "", card: Vs.me() }); hello(); Net.hi = setInterval(() => { if (Net.role === "guest" && !Net.welcomed) hello(); }, 2500); Net.paintStatus(); Snd.tick(); Vs.join(Net.code || c); }
function joinRoom() { const c = ($("#roomCode").value || "").trim().toUpperCase(); if (!/^[A-Z]{4}$/.test(c)) { toast("Type the 4-letter code"); return; } joinRoomCode(c); }
function paintGuestBanner() { if (!$("#guestBar")) { const r = $("#room"); r.insertAdjacentHTML("afterbegin", `<div id="guestBar" class="fine" style="margin-bottom:8px">You are Player 2 in room ${esc(Net.code)}. <button class="btn ghost" id="roomLeave" type="button">Leave</button></div>`); } }
function applyRemote(m) {
  const sel = m.id ? "#" + CSS.escape(m.id) : m.da ? `[data-${m.da}="${CSS.escape(m.dv)}"]` : null; if (!sel) return; const el = document.querySelector("#room " + sel); if (!el) return;
  const guestOk = () => {
    if (["qAgain", "finAgain", "nmAgain", "ttAgain", "ttNext", "rAgain", "qNext", "nmNext", "finNext", "rNext"].includes(m.id)) return true;   /* either player can move the game on */
    if (m.id === "qB1" || m.id === "nmLock" || m.id === "tGuess" || m.id === "qGuess" || m.id === "tCancel") { /* checked below */ }
    if (Q.s && Q.s.mode === "duo" && Q.s.phase === "run") { if (m.id === "qB1" || m.id === "scH1") return true; if (m.id === "qGuess" || m.da === "sug") return Q.s.buzzed === 1; return false; }
    if (S.rou) return (m.id === "rGuess" || m.da === "sug") && S.rou.turn === 1 && S.rou.phase === "play";
    if (S.fin && S.fin.mode === "duo") return m.id === "finLock" && S.fin.turn === 1 && S.fin.phase === "ask";
    if (S.num && S.num.mode === "duo") return m.id === "nmLock" ? S.num.turn === 1 && S.num.phase === "guess" : false;
    if (S.ttt && S.ttt.mode === "duo" && S.ttt.phase === "draft") return m.da === "dr" && S.ttt.turn === 1;
    if (S.ttt && S.ttt.mode === "duo") { if (m.da === "tc") return S.ttt.turn === 1 && S.ttt.sel == null; if (m.id === "tGuess" || m.id === "tCancel" || m.da === "sug") return S.ttt.turn === 1 && S.ttt.sel != null; }
    return false;
  };
  if (!guestOk()) return; if (m.id === "finLock" && m.v != null) S.fin.cur.guess = Math.max(1, Math.min(S.fin.cur.n, +m.v || 1)); else if (m.v != null) { const i = el.tagName === "INPUT" ? el : document.getElementById("qIn") || document.getElementById("tIn") || document.getElementById("nmIn"); if (i) i.value = m.v; }
  Net.applying = true; try { el.click(); } finally { Net.applying = false; }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("button"); if (!b) return;
  if (b.id === "roomMake") { e.stopImmediatePropagation(); makeRoom(); return; }
  if (b.id === "roomJoin") { e.stopImmediatePropagation(); joinRoom(); return; }
  if (b.id === "roomCopy") { e.stopImmediatePropagation(); const v = ($("#inviteBox") || {}).value || ""; try { navigator.clipboard.writeText(v).then(() => toast("Link copied"), () => { $("#inviteBox").select(); toast("Press copy on the selected link"); }); } catch (err) { $("#inviteBox").select(); } return; }
  if (b.id === "roomLeave") { e.stopImmediatePropagation(); Net.close(); S.game = null; renderRoom(); return; }
  if (Net.role === "guest" && b.closest("#room")) {
    e.stopImmediatePropagation(); e.preventDefault(); const ds = Object.keys(b.dataset).find((k) => ["tc", "sug", "dr"].includes(k));
    const i = document.getElementById("qIn") || document.getElementById("tIn") || document.getElementById("nmIn") || document.getElementById("finRange") || document.getElementById("rIn");
    Net.send({ k: "click", id: b.id || null, da: !b.id && ds ? ds.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()) : null, dv: !b.id && ds ? b.dataset[ds] : null, v: i ? i.value : null });
  }
}, true);
document.addEventListener("input", (e) => { if (Net.role === "guest" && ["qIn", "tIn", "nmIn", "finRange", "rIn"].includes(e.target.id)) { e.stopImmediatePropagation(); Net.send({ k: "input", id: e.target.id, v: e.target.value }); } }, true);
document.addEventListener("keydown", (e) => { if (Net.role === "guest" && e.key === "Enter" && ["qIn", "tIn", "nmIn", "rIn"].includes(e.target.id)) { e.stopImmediatePropagation(); e.preventDefault(); const id = e.target.id === "qIn" ? "qGuess" : e.target.id === "tIn" ? "tGuess" : e.target.id === "rIn" ? "rGuess" : "nmLock"; Net.send({ k: "click", id, v: e.target.value }); } else if (Net.role === "guest" && !["INPUT"].includes(e.target.tagName)) { e.stopImmediatePropagation(); } }, true);

/* ---------- How it works + credits ---------- */
function renderAbout() {
  const sm = DATA.summary[S.code] || DATA.summary.ALL;
  $("#room").innerHTML = `<div class="card about"><h2>How it works</h2>
    <p>The model forecasts Home, Draw or Away for a match using only what was known before kickoff: each team's recent results and goals, an Elo-style strength rating built from past results, rest days and table position. A random forest and a Poisson goal model are blended, and the blend is trained on all five leagues together.</p>
    <h3>How we test it honestly</h3><p>Season by season, the model is trained only on earlier seasons and then predicts the next one it has never seen. Across ${sm.n.toLocaleString()} matches it gets <b>${pct(sm.pooled_acc, 1)}</b> of results right; the bookmakers' closing odds get <b>${pct(sm.market_acc, 1)}</b>. For comparison, picking at random gets about a third right, and a fan who backs the team in better form this season gets <b>${BL().form}%</b>. The gap is information (lineups, injuries, news), not effort: many extra signals were tried and thrown out because they did not help in both of the test models.</p>
    <h3>Two playing styles</h3><p><b>Max Accuracy</b> simply picks the most likely result. <b>Balanced</b> also calls draws and away wins, so its picks are spread like real results, at the cost of some accuracy. In the games, switch between them where it says "Model plays".</p>
    <h3>What the games do with it</h3><ul><li>The title race comes from 20,000 simulations of the rest of the season per league.</li><li>The Time machine puts the model's expected-points table beside the real one.</li><li>The ball-knowledge games use player and club facts from Transfermarkt, which stop at July 2026. Moves since then are checked against Wikidata and corrected.</li></ul>
    <h3>Credits</h3><ul><li>Results and bookmaker odds: football-data.co.uk. Expected goals (Premier League): Understat.</li><li>Players, transfers and market values: the Transfermarkt dataset on Kaggle (CC0). Starting elevens of Champions League finals before 2013-14: Wikipedia (CC BY-SA), which cites UEFA match sheets.</li><li>Club badges, league logos and star cutouts: TheSportsDB and football-data.org. They belong to their owners and appear here only to identify clubs, leagues and players. Player portraits: for each player the newest available of the Premier League's official photo (current season, Premier League players), Transfermarkt's portrait and EA SPORTS FC's FC25 portrait, then Wikimedia Commons (each under its author's free licence) and TheSportsDB, loaded from those sites when shown and refreshed weekly. The photos belong to their owners and appear only to identify players. Players without any photo show their club badge.</li><li>Built by moisback22, a student project, in pair-programming sessions with Claude Code. Not affiliated with any league, club or player, and not betting advice.</li></ul>
    <p class="fine">Source code and the full project log: github.com/mosoliman517-sudo/football-prediction-model</p></div>`;
}

/* ---------- Review ---------- */
function renderReview() {
  const c = S.code, sm = DATA.summary[c], L = lgOf(c), pl = playsOf(c), t = totals(pl), f = DATA.profiles.accuracy, agg = {};
  lgs(c).forEach((lg) => Object.entries(lgOf(lg).seasons).forEach(([sn, S_]) => { const a = agg[sn] || (agg[sn] = { s: sn, live: S_.live, n: 0, mo: 0, mk: 0, hm: 0 }); S_.matches.forEach((m) => { a.n++; const adj = [m[6] * f.a, m[7] * f.d, m[8] * f.h]; if ("ADH"[adj.indexOf(Math.max(...adj))] === m[5]) a.mo++; if (["A", "D", "H"][[m[11], m[12], m[13]].indexOf(Math.max(m[11], m[12], m[13]))] === m[5]) a.mk++; if (m[5] === "H") a.hm++; }); }));
  const rows = Object.values(agg).sort((x, y) => (x.s < y.s ? -1 : 1)).map((a) => ({ s: a.s, live: a.live, n: a.n, mo: a.mo / a.n, mk: a.mk / a.n, hm: a.hm / a.n }));
  $("#room").innerHTML = `<div class="card"><h2>How good is the model?</h2><p class="sub">Across ${sm.n.toLocaleString()} ${esc(L.name)} matches since 2001-02, each predicted only from earlier seasons: the model gets <b>${pct(sm.pooled_acc, 1)}</b> of results right, the bookmakers <b>${pct(sm.market_acc, 1)}</b>, and always picking the home team <b>${pct(sm.home_acc, 1)}</b>. Football is noisy, so around half is a good score and a point or two is a real gap.</p>
    <div class="row fine" style="margin:10px 0 6px"><span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent)"></i> model (Max Accuracy)</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent2)"></i> bookmakers</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--muted)"></i> always Home</span></div>
    <div class="bars">${rows.map((r) => `<div class="brow"><span class="num">${r.s}${r.live ? " live" : ""}</span><div class="tracks"><div class="t"><div class="tr"><i style="width:${r.mo * 100}%;background:var(--accent)"><em>Model</em></i></div><span class="num">${pct(r.mo)}</span></div><div class="t"><div class="tr"><i style="width:${r.mk * 100}%;background:var(--accent2)"><em>Bookmakers</em></i></div><span class="num">${pct(r.mk)}</span></div><div class="t"><div class="tr"><i style="width:${r.hm * 100}%;background:var(--muted)"><em>Always Home</em></i></div><span class="num">${pct(r.hm)}</span></div></div></div>`).join("")}</div>
    <div class="tiles"><div class="tile"><b class="num">${t.n ? `${t.you} v ${t.mod}` : "–"}</b><small>your points v the model, ${esc(L.name)}</small></div><div class="tile"><b class="num">${t.n ? `${t.yr} v ${t.mr}` : "–"}</b><small>results right, of ${t.n}</small></div><div class="tile"><b class="num">${pct(DATA.profiles.balanced.bench.D)}</b><small>draws found by the Balanced style (Max Accuracy: ${pct(DATA.profiles.accuracy.bench.D)})</small></div></div>
    <div id="board"></div></div>`;
  renderBoard();
}

/* ---------- leaderboard: opt-in, totals only ---------- */
const LB = { coll: null, uid: null, user: null, rows: [], failed: false };
function myTotals() { const pl = allPlays(), t = totals(pl); return { played: t.n, edge: t.you - t.mod, right: t.yr, best: streaks(pl).best }; }
const lbJoined = () => !!LB.uid && LB.rows.some((r) => r.id === LB.uid);
async function lbPublish() { if (!LB.coll || !lbJoined()) return; try { await LB.coll.doc(LB.uid).set({ ...myTotals(), updatedAt: new Date().toISOString() }); } catch (e) { /* read-only */ } }
async function renderBoard() {
  const el = $("#board"); if (!el) return; if (!LB.coll || LB.failed) { el.innerHTML = ""; return; }
  const rows = [...LB.rows].sort((a, b) => b.edge - a.edge || b.right - a.right).slice(0, 10); let names = {};
  try { if (LB.user && typeof LB.user.profiles === "function") names = await LB.user.profiles(rows.map((r) => r.id)); } catch (e) { /* generic names */ }
  const me = lbJoined(), pl = myTotals();
  el.innerHTML = `<h3 style="font-size:20px;margin:18px 0 4px">Leaderboard</h3><span class="fine">Points ahead of the model across every league you play.</span>
    <div class="lb">${rows.length ? rows.map((r, i) => `<div class="lbrow ${r.id === LB.uid ? "me" : ""}"><b class="num">${i + 1}</b><span>${esc((names[r.id] && names[r.id].name) || "Someone")}${r.id === LB.uid ? " (you)" : ""}</span><span class="num">${r.edge >= 0 ? "+" : ""}${r.edge} · ${r.right}/${r.played}</span></div>`).join("") : '<div class="fine">No one is on the board yet.</div>'}</div>
    <div class="row" style="margin-top:10px"><button class="btn ${me ? "ghost" : ""}" id="lbToggle" type="button" ${me || pl.played ? "" : "disabled"}>${me ? "Leave the leaderboard" : "Join the leaderboard"}</button>${!me && !pl.played ? '<span class="fine">Play a match first.</span>' : ""}</div>`;
}
async function toggleBoard() { if (!LB.coll) return; try { if (lbJoined()) await LB.coll.doc(LB.uid).delete(); else await LB.coll.doc(LB.uid).set({ ...myTotals(), updatedAt: new Date().toISOString() }); } catch (e) { LB.failed = true; renderBoard(); } }
async function initStore() {
  loadLocal(); paintScore();
  try {
    if (!window.claude || !window.claude.use) return;
    const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
    const uid = user ? await user.id() : null; if (!db || !uid) return;
    LB.coll = db.collection("leaderboard"); LB.uid = uid; LB.user = user;
    LB.coll.onSnapshot((snap) => { LB.rows = snap.docs.filter((d) => d.exists).map((d) => ({ id: d.id, ...d.data() })); renderBoard(); }, () => { LB.failed = true; renderBoard(); });
    store.coll = db.collection("data/users/" + uid); store.uid = uid; store.mode = "cloud";
    store.coll.onSnapshot((snap) => { const items = { ...store.items }; snap.docs.forEach((d) => { if (d.exists) items[d.id] = d.data(); }); store.items = items; saveLocal(); paintScore(); if (S.code && S.room === "play" && S.game === "daily" && !S.cur) renderDaily(); }, () => { store.coll = null; store.mode = "local"; });
  } catch (e) { /* stay on browser storage */ }
}

/* ---------- events ---------- */
document.addEventListener("pointerdown", () => Snd.unlock(), { once: true });
document.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "rkSign") { Account.available ? authForm("up") : openProfile(); return; }
  if (b.id === "rkQuick") { qmStart(); return; }
  if (b.id === "rkCreate") { rankedStart($("#rkGame").value, $("#rkDiff").value, $("#rkVis").value === "pub"); return; }
  if (b.id === "rkJoinCode") { const c = ($("#rkCode").value || "").trim().toUpperCase(); if (!/^[A-Z]{4}$/.test(c)) { toast("Type the 4-letter code"); return; } Snd.tick(); toast("Joining… the host's game appears when it connects"); resetGames(); S.rk = true; S.hubGroup = "ranked"; S.game = "ttt"; renderRoom(); openOnline("ttt"); joinRoomCode(c); return; }
  if (b.dataset.rkjoin) { const [c, g] = b.dataset.rkjoin.split("|"); Snd.tick(); rankedJoin(c, g); return; }
  if (b.dataset.bdg) { const p = prof(), id = b.dataset.bdg, cur = myBadges(); if (cur.includes(id)) p.badges = cur.filter((x) => x !== id); else if (cur.length >= 3) { toast("You can wear three. Tap one to remove it first."); return; } else p.badges = [...cur, id]; saveProf(p); syncBadges(); renderProfilePage(); paintProfileBtn(); Snd.tick(); return; }
  if (b.dataset.av) { const p = prof(); p.avatar = b.dataset.av; saveProf(p); award("avatar"); syncProfile(); renderProfilePage(); paintProfileBtn(); return; }
  if (b.id === "pfPlayerClear") { const p = prof(); p.favP = ""; p.favPName = ""; saveProf(p); syncProfile(); renderProfilePage(); return; }
  if (b.dataset.favp) { const x = QZ.players.find((q) => q.id === +b.dataset.favp); if (x) { const p = prof(); p.favP = x.id; p.favPName = x.n; if (p.favT) unlock(p, "fav"); saveProf(p); syncProfile(); renderProfilePage(); } return; }
  if (b.id === "pfNickSave") { const v = ($("#pfNick").value || "").trim(), msg = $("#pfNickMsg"); if (!/^[A-Za-z0-9 _.-]{3,16}$/.test(v)) { msg.textContent = "Use 3 to 16 letters, numbers, spaces, dots, dashes or underscores."; return; } Account.setNick(v).then((r) => { if (r && r.ok) { const p = prof(); p.nick = v; p.board = true; store.items.profile = p; saveProf(p); try { Account.push(); } catch (e) { /* offline */ } renderProfilePage(); paintProfileBtn(); toast("Name saved: " + esc(v)); } else $("#pfNickMsg").textContent = (r && r.error) || "That name is taken."; }); return; }
  if (b.id === "pfFriendAdd") { const v = ($("#pfFriend").value || "").trim(), msg = $("#pfFriendMsg"); if (!v) return; Ranked.rpc("add_friend", { p_nick: v }).then((r) => { const m = { ok: "Added!", notfound: "Nobody has that display name.", self: "That is you.", already: "Already on your list.", full: "Your list is full (100).", auth: "Please sign in." }; msg.textContent = r === null ? "Could not reach the server (is schema_v3.sql installed?)." : m[r] || "Done."; if (r === "ok") { award("social"); $("#pfFriend").value = ""; paintFriends(); } }); return; }
  if (b.dataset.unfriend) { Ranked.rpc("remove_friend", { p_nick: b.dataset.unfriend }).then(paintFriends); return; }
  if (b.dataset.sk) { const now = Date.now(); if (now - (window.__skT || 0) < 3000) return; window.__skT = now; const id = Mascot.id(), L = (MASCOTS[id] && MASCOTS[id].lines) || {}, pool = { cheer: [...(L.hit || []), ...(L.bighit || [])], tease: [...(L.miss || []), ...(L.model_wrong || [])], gg: [...(L.over || []), ...(L.best || [])] }[b.dataset.sk] || [], line = pool.length ? pool[Math.floor(Math.random() * pool.length)] : "Good game."; skPop(id, prof().nick || "You", line, true); Net.send({ k: "sk", id, nick: prof().nick || "Opponent", line: String(line).slice(0, 180) }); return; }
  if (b.dataset.react) { Snd.tick(); floatReact(b.dataset.react); Net.send({ k: "react", e: b.dataset.react }); return; }
  if (b.id === "tourBtn") { startTour(); return; }
  if (b.dataset.go) { Snd.tick(); go(b.dataset.go); return; }
  if (b.dataset.alb) { const [k, v] = b.dataset.alb.split("|"); S.alb = S.alb || { lg: "E0", club: null, more: 1 }; if (k === "lg") S.alb = { lg: v, club: null, more: 1 }; else if (k === "club") S.alb = { ...S.alb, club: v, more: 1 }; else if (k === "home") S.alb = { ...S.alb, club: null }; else if (k === "more") S.alb.more++; Snd.tick(); renderAlbum(); window.scrollTo(0, 0); return; }
  if (b.dataset.lvlg) { Live.lg = b.dataset.lvlg; Snd.tick(); renderLive(); return; }
  if (b.dataset.lvd) { Live.days = +b.dataset.lvd; Snd.tick(); renderLive(); return; }
  if (b.id === "lvSign") { Account.available ? authForm("up") : openProfile(); return; }
  if (b.dataset.lvp) { const [id, k] = b.dataset.lvp.split("|"); if (!Account.signedIn) { toast("Sign in to lock your picks"); Account.available ? authForm("up") : openProfile(); return; } Snd.lock(); Ranked.rpc("predict", { p_fixture: id, p_pick: k }).then((r) => { if (r === "ok") { const f = Live.fx.find((x) => x.id === id), first = f && !f.my_pick; const p = prof(); if (first) { p.preds = (p.preds || 0) + 1; unlock(p, "pred1"); if (p.preds >= 10) unlock(p, "pred10"); saveProf(p); } loadLive(); } else toast(r === "closed" ? "Kickoff has passed" : "Could not save the pick"); }); return; }
  if (b.dataset.ap) { const [k, v] = b.dataset.ap.split("|"); if (k === "mascot" || (k === "mascot_mode" && v !== "off")) setTimeout(() => Mascot.hello(), 50); if (k === "outfit") setTimeout(() => { outfitPaint(); Mascot.react("achieve", true); }, 50); if (k === "mascot_mode" && v === "off") setTimeout(() => Mascot.dock(), 50); try { localStorage.setItem("bkn_" + k, v); } catch (e) { /* blocked */ } try { const pf = prof(); pf.look = { ...(pf.look || {}), [k]: v }; saveProf(pf); } catch (e) { /* profile not ready */ } applyAppearance(); Snd.tick(); renderProfilePage(); return; }
  if (b.dataset.chal) { Snd.tick(); challengeModal(b.dataset.chal); return; }
  if (b.id === "chGo") { const g = $("#chGame").value, d = $("#chDiff").value, nick = b.dataset.nick; closeModal(); rankedStart(g, d, false); const link = inviteLink(Net.code, g), msg = `${nick}, join my ballknowledge room: ${link}`; try { navigator.clipboard.writeText(msg).then(() => toast("Invite link copied. Send it to " + esc(nick))); } catch (e) { toast("Copy the link from the room screen"); } try { if (navigator.share) navigator.share({ title: "ballknowledge", text: msg, url: link }).catch(() => {}); } catch (e) { /* not supported */ } return; }
  if (b.id === "pfShare") { const p = prof(), lv = levelOf(p.xp), signed = Account.signedIn && Board.mode === "rest", fav = QZ.players.find((x) => x.id === +p.favP); showCard("record", { lg: p.favT ? (QZ.clubs[p.favT] || {}).lg || "ALL" : "ALL", title: p.nick || "My profile", big: signed ? `${Ranked.elo} Elo` : lv.name, sub: `${signed ? rankOf(Ranked.elo).name + " · " : ""}${lv.name} · ${p.xp} XP`, tiles: [[`${Object.keys(p.ach).length}/${ACH.length}`, "achievements"], [String(dayStreak(p)), "day streak"], [String(Object.keys(p.stickers || {}).length), "stickers"]], line: fav ? `Favourite player: ${fav.n}${p.favT ? " · " + p.favT : ""}` : p.favT ? `Favourite team: ${p.favT}` : "Think you know more football than me?", share: `My ballknowledge profile: ${signed ? Ranked.elo + " Elo, " : ""}${Object.keys(p.ach).length} achievements. Think you know more?` }); return; }
  if (b.id === "guestProfile") { closeModal(); openProfile(); return; }
  if (b.id === "adminBtn") { Snd.tick(); go("admin"); return; }
  if (b.id === "admCsv") { const head = "nick,email,joined,last_seen,elo,games,wins"; const csv = [head, ...Admin.users.map((r) => [r.nick, r.email, (r.created || "").slice(0, 10), (r.last_seen || "").slice(0, 10), r.elo, r.games, r.wins].map((v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`).join(","))].join("\n"); const blob = new Blob([csv], { type: "text/csv" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ballknowledge-accounts.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return; }
  if (b.dataset.report) { const [k, ref, lab] = b.dataset.report.split("|"); reportDialog(k, k + ":" + ref, lab); return; }
  if (b.id === "rpSend") { const note = ($("#rpNote").value || "").trim(); if (note.length < 3) { toast("Please describe the problem"); return; } Ranked.rpcx("submit_report", { p_kind: b.dataset.kind, p_ref: b.dataset.ref, p_note: note }).then((r) => { closeModal(); toast(r.ok ? (r.data === "ok" ? "Thanks, report sent" : r.data === "limit" ? "Too many reports today" : r.data === "auth" ? "Sign in to send a report" : "The report was not saved: " + r.data) : "Report NOT sent. " + r.why); }); return; }
  if (b.id === "newBtn") { showWhatsNew(); return; }
  if (b.id === "admResolve" || b.dataset.resolve) { Ranked.rpc("admin_resolve_report", { p_id: +b.dataset.resolve }).then(() => loadAdminReports()); return; }
  if (b.id === "searchBtn") { openSearch(); return; }
  if (b.id === "lvStay") { closeModal(); return; }
  if (b.id === "lvLeave") { closeModal(); const cb = window.__leaveCb; window.__leaveCb = null; resetGames(); Q.s = null; if (cb) cb(); return; }
  if (b.dataset.how) { const s = howSeen(); s[b.dataset.how] = 1; try { localStorage.setItem("bkn_howto", JSON.stringify(s)); } catch (e) { /* blocked */ } const bx = $("#howto"); if (bx) { bx.hidden = true; bx.innerHTML = ""; } Snd.tick(); return; }
  if (b.id === "howBtn") { Snd.tick(); paintHowto(true); const bx = $("#howto"); if (bx) bx.scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }
  if (b.id === "backBtn") { goBack(); return; }
  if (b.dataset.crumb) { crumbGo(b.dataset.crumb); return; }
  if (b.dataset.group) { Snd.tick(); S.hubGroup = b.dataset.group; S.rk = b.dataset.group === "ranked"; S.game = null; go("games-" + SLUG[S.code] + "-" + b.dataset.group); return; }
  if (b.id === "acctBtn") { Snd.tick(); Account.available ? authForm("up") : openProfile(); return; }
  if (b.dataset.door) { Snd.tick(); go(b.dataset.door); route(e); return; }
  if (b.dataset.scope) { Snd.tick(); go(b.dataset.scope); route(e); return; }
  if (b.dataset.lg) { Snd.tick(); go("lab-" + SLUG[b.dataset.lg]); route(e); return; }
  if (b.id === "brand") { Snd.back(); S.cur = null; go(""); route(e); return; }
  if (b.id === "settingsBtn" || b.id === "settingsBtn2") { go("settings"); return; }
  if (b.id === "d2In") { const m = ($("#d2Mail").value || "").trim(), pw = $("#d2Pw").value || ""; if (!m || !pw) { $("#d2Msg").textContent = "Enter the email and password."; return; } $("#d2Msg").textContent = "Signing in…"; Dual.signIn(m, pw).then((r) => { if (r.ok) { $("#d2Pw") && ($("#d2Pw").value = ""); renderRanked(); } else $("#d2Msg") && ($("#d2Msg").textContent = r.error); }); return; }
  if (b.id === "d2Out") { Dual.out(); renderRanked(); return; }
  if (b.id === "d2Go") { const g = $("#d2Game").value; resetGames(); S.dual = true; Dual.game = g; S.hubGroup = "ranked"; S.rk = true; S.game = g === "who" || g === "career" || g === "club" || g === "blur" || g === "scramble" || g === "ttt" ? g : "ttt"; Net.lastRef = null; if (g === "ttt") { renderRoom(); newTTT("duo"); } else { S.game = g; renderRoom(); newQuiz(g, "duo", S.code || "ALL"); nextRound(); } return; }
  if (b.dataset.lang) { try { localStorage.setItem("bkn_lang", b.dataset.lang); } catch (e) { /* blocked */ } applyLang(b.dataset.lang); renderSettings(); applyLang(b.dataset.lang); Snd.tick(); return; }
  if (b.dataset.snd != null) { Snd.setLevel(+b.dataset.snd); renderSettings(); Snd.right(); return; }
  if (b.dataset.mus != null) { Snd.setMusic(+b.dataset.mus); renderSettings(); Snd.tick(); return; }
  if (b.id === "profileBtn" && !(Account.signedIn || Account.claude) && Account.available) { Snd.tick(); authForm("in"); return; }
  if (b.id === "profileBtn" || b.id === "openProfileJoin") { openProfile(); return; }
  if (b.id === "modalClose") { closeModal(); return; }
  if (b.id === "shareRecord") { recordCard(); return; }
  if (b.id === "cardSave") { saveCard(); return; }
  if (b.id === "cardShare") { shareCard(); return; }
  if (b.id === "nickSave") { const v = ($("#nickIn").value || "").trim(), msg = $("#nickMsg"); if (!/^[A-Za-z0-9 _.-]{3,16}$/.test(v)) { msg.textContent = "Use 3 to 16 letters, numbers, spaces, dots, dashes or underscores."; return; } msg.textContent = "Checking…"; Account.setNick(v).then((r) => { if (r.error) { msg.textContent = r.error; Snd.wrong(); return; } const p = prof(); p.nick = v; p.board = true; saveProf(p); msg.textContent = `You are on the boards as ${v}.`; Snd.right(); renderBoardsIfOpen(); }); return; }
  if (b.id === "acctIn") { authForm("in"); return; }
  if (b.id === "acctNew") { authForm("up"); return; }
  if (b.id === "aSwitch") { authForm(b.dataset.mode); return; }
  if (b.id === "aGo") { submitAuth(b.dataset.mode); return; }
  if (b.id === "aForgot") { const email = ($("#aEmail").value || "").trim(); if (!/^\S+@\S+\.\S+$/.test(email)) { $("#aMsg").textContent = "Type your email above first."; return; } Account.recover(email).then((r) => { $("#aMsg").textContent = r.error || "If that address has an account, a reset link is on its way."; }); return; }
  if (b.id === "acctOut") { Account.signOut().then(() => { closeModal(); openProfile(); }); return; }
  if (b.id === "nickLeave") { const p = prof(); p.board = false; saveProf(p); closeModal(); openProfile(); return; }
  if (b.id === "dailyCard") { dailyCard(); return; }
  if (b.id === "mdCard") { const it = store.items[mdKey(S.md.c, S.md.season, S.md.n)]; if (it) mdCardNow(it); return; }
  if (b.id === "tbCard") { const d = store.items[tabKey(S.tab.c, S.tab.season)]; if (d) tableCardNow({ lg: S.tab.c, season: d.season, youErr: d.youErr, modErr: d.modErr, lastErr: d.lastErr }); return; }
  if (b.id === "broMore") { closeBro(); const r = $("#reveal"); if (r) r.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (b.id === "broNext") { closeBro(); const n = $("#nextBtn") || $("#dailyNext"); if (n) n.click(); return; }
  if (b.id === "scH0" || b.id === "scH1") { const S_ = Q.s, i = +b.id.slice(3); if (!S_ || S_.game !== "scramble" || S_.phase !== "run" || S_.paused || (S_.hn || 0) >= 4) return; if (i === 1 && Net.role === "host" && Net.started && !Net.applying) return; S_.hv[i] = true; const need = S_.mode === "duo" ? S_.hv[0] && S_.hv[1] : true; if (need) { S_.hn = (S_.hn || 0) + 1; S_.hv = [false, false]; Snd.lock(); paintClues(); toast("Hint " + S_.hn); } else Snd.tick(); renderQuiz(); return; }
  if (b.dataset.dctab) { S.dcTab = b.dataset.dctab; Snd.tick(); renderDiscover(); return; }
  if (b.dataset.dfq != null) { const d = S.df; if (!d || d.pick != null || dfDays(prof())[d.key]) return; d.pick = b.dataset.dfq; const p = prof(); p.dfDone = { ...(p.dfDone || {}), [d.key]: 1 }; const ks = Object.keys(p.dfDone).sort(); while (ks.length > 120) delete p.dfDone[ks.shift()]; const s = dfStreak(p); if (s >= 7) unlock(p, "daily_habit"); saveProf(p); d.pick === d.q.ans ? (Snd.right(), reward(10, "Daily feed", () => {})) : (Snd.wrong(), reward(4, "Daily feed", () => {})); renderDiscover(); return; }
  if (b.id === "dfShare") { const d = S.df, s = dfStreak(prof()); const txt = `ballknowledge daily ${d.key}: ${d.pick === d.q.ans ? "got" : "missed"} "${d.q.text}" · ${s} day streak`; try { navigator.clipboard.writeText(txt).then(() => toast("Copied"), () => toast(txt)); } catch (e) { toast(txt); } return; }
  if (b.dataset.cq != null) { const a = S.cq; if (!a || a.res) return; a.ans.push(CLUBQ[a.i][1][+b.dataset.cq][1]); a.i++; Snd.tick(); if (a.i >= CLUBQ.length) { a.res = clubMatch(a.ans); Snd.win(); award("club_quiz"); } renderDiscover(); return; }
  if (b.id === "cqAgain") { S.cq = null; renderDiscover(); return; }
  if (b.id === "cqShare") { const a = S.cq, txt = `ballknowledge says I am a ${a.res[0].c} fan (then ${a.res[1].c}, ${a.res[2].c}). Who is your club?`; try { navigator.clipboard.writeText(txt).then(() => toast("Copied"), () => toast(txt)); } catch (e) { toast(txt); } return; }
  if (b.dataset.abtab) { S.abTab = b.dataset.abtab; Snd.tick(); renderAboutPage(); return; }
  if (b.id === "aboutBack") { go(""); return; }
  if (b.id === "ideaSend") { const ti = ($("#ideaTitle").value || "").trim(); if (ti.length < 3) { toast("Give your idea a short title"); return; } Ranked.rpcx("submit_idea", { p_kind: $("#ideaKind").value, p_title: ti, p_body: ($("#ideaBody").value || "").trim() }).then((r) => { if (!r.ok) { toast("Not sent. " + r.why); return; } toast(r.data === "ok" ? "Thanks, idea added" : r.data === "limit" ? "Five ideas a day is the limit" : r.data === "auth" ? "Sign in to suggest" : "Not saved"); if (r.data === "ok") { $("#ideaTitle").value = ""; $("#ideaBody").value = ""; loadIdeas(); } }); return; }
  if (b.dataset.vote) { Ranked.rpcx("vote_idea", { p_id: +b.dataset.vote }).then((r) => { if (!r.ok) toast("Vote not saved. " + r.why); else if (r.data === "auth") toast("Sign in to vote"); else loadIdeas(); }); return; }
  if (b.dataset.ideast) { const [id, st] = b.dataset.ideast.split("|"); Ranked.rpcx("admin_set_idea", { p_id: +id, p_status: st }).then(() => loadIdeas()); return; }
  if (b.id === "vtag") { showWhatsNew(); return; }
  if (b.id === "wkPlay") { Snd.tick(); resetGames(); S.game = "challenge"; S.hubGroup = "model"; S.cur = null; S.chal = { code: "wk" + weekId(), c: "ALL", weekly: true }; renderRoom(); return; }
  if (b.id === "chNew") { S.chal = { code: newCode() }; Snd.tick(); renderChallenge(); return; }
  if (b.id === "chJoin") { const v = ($("#chCode").value || "").trim().toLowerCase(); if (/^[a-z0-9]{4,10}$/.test(v)) { S.chal = { code: v }; Snd.tick(); renderChallenge(); } return; }
  if (b.dataset.cfix) { const [lg, sn, i] = b.dataset.cfix.split("|"); Snd.tick(); open(lg, sn, +i, "chal", `x_${S.chal.code}_${lg}_${sn}_${i}`); return; }
  if (b.id === "chCopy") { copyChallenge(chalC(), S.chal.code); return; }
  if (b.id === "chCard") { challengeCard(chalC(), S.chal.code); return; }
  if (b.dataset.btab) { S.btab = b.dataset.btab; Snd.tick(); renderBoards(); return; }
  if (b.dataset.b) { const [k, v] = b.dataset.b.split("|"); if (k === "game") S.bgame = v; else if (k === "period") S.bperiod = v; else S.bscope = v; Snd.tick(); renderBoards(); return; }
  if (b.dataset.room) { Snd.tick(); resetGames(); S.room = b.dataset.room; S.game = null; S.cur = null; S.md = null; S.up = null; S.tab = null; S.hol = null; renderRooms(); renderRoom(); return; }
  if (b.dataset.game) { Snd.tick(); resetGames(); S.game = b.dataset.game; Usage.play(USPORT, S.game); S.hubGroup = MODEL_IDS.includes(S.game) ? "model" : "bk"; S.chal = null; S.cur = null; S.md = null; S.up = null; S.tab = null; S.hol = null; renderRoom(); if (innerWidth < 760) $("#room").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" }); else window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" }); return; }
  if (b.id === "gamesBack") { Snd.back(); resetGames(); S.game = null; S.chal = null; S.cur = null; S.md = null; S.up = null; S.tab = null; S.hol = null; renderRoom(); paintScore(); return; }
  if (b.id === "thPause") { theatre.paused = !theatre.paused; b.textContent = theatre.paused ? "Play" : "Pause"; return; }
  if (b.id === "thSpeed") { theatre.speed = theatre.speed === 3 ? 8 : theatre.speed === 8 ? 1 : 3; b.textContent = `Speed ${theatre.speed}x`; return; }
  if (b.id === "thSkip") { finishTheatre(); return; }
  if (b.id === "watchBtn") { const { c, season, i, m } = S.cur, it = store.items[`p_${c}_${season}_${i}`], box = $("#theatre"); if (box) { box.hidden = false; startTheatre(c, season, m, it ? it.mscore : modelCall(m).score, null); } return; }
  if (b.id === "mdRandom") { const free = mdList(S.code).filter((x) => !store.items[mdKey(x.c, x.season, x.n)]); if (free.length) { const x = free[Math.floor(Math.random() * free.length)]; S.md = { ...x, picks: Array(x.per).fill(null), locked: false }; Snd.tick(); renderMatchday(); } return; }
  if (b.dataset.mdp) { const [i, k] = b.dataset.mdp.split("|"); S.md.picks[+i] = k; Snd.tick(); renderMatchday(); return; }
  if (b.id === "mdLock") { lockMd(); return; }
  if (b.id === "mdAgain") { S.md = null; renderMatchday(); return; }
  if (b.dataset.up != null && b.dataset.up !== "") { answerUpset(+b.dataset.up); return; }
  if (b.id === "upNext") { S.up = null; Snd.tick(); renderUpset(); return; }
  if (b.id === "tbGo") { const [lg, sn] = $("#tbSeason").value.split("|"); startTable(lg, sn); Snd.tick(); return; }
  if (b.id === "tbRandom") { const all = tabChoices(S.code), fresh = all.filter((x) => !store.items[tabKey(x.c, x.season)]), pool = fresh.length ? fresh : all, x = pool[Math.floor(Math.random() * pool.length)]; startTable(x.c, x.season); Snd.tick(); return; }
  if (b.dataset.mv) { const [i, d] = b.dataset.mv.split("|").map(Number), o = S.tab.order, j = i + d; if (j >= 0 && j < o.length) { [o[i], o[j]] = [o[j], o[i]]; Snd.tick(); renderTableGame(); } return; }
  if (b.id === "tbLock") { lockTable(); return; }
  if (b.id === "tbAgain") { S.tab = null; renderTableGame(); return; }
  if (b.dataset.hol) { answerHol(b.dataset.hol); return; }
  if (b.id === "qResume") { const r = getResume(Q.s.game, Q.s.scope); Q.s.mode = "solo"; Q.s.scores = [r ? r.score : 0]; Q.s.round = r ? r.round : 0; Q.s.streak = r ? r.streak : 0; Q.s.over = false; Snd.tick(); nextRound(); return; }
  if (b.id === "qSolo" || b.id === "qDuo") { const m = b.id === "qSolo" ? "solo" : "duo"; Q.s.mode = m; Q.s.scores = m === "duo" ? [0, 0] : [0]; Snd.tick(); nextRound(); return; }
  if (b.id === "qOnline" || b.id === "nmOnline" || b.id === "ttOnline") { openOnline(b.id === "qOnline" ? Q.s.game : b.id === "nmOnline" ? "number" : "ttt"); return; }
  if (b.id === "qNext") { Snd.tick(); nextRound(); return; }
  if (b.id === "qFinish") { finishQuiz(); return; }
  if (b.id === "qAgain") { const m = Q.s.mode, g = Q.s.game; newQuiz(g, m, S.code); if (m === "duo") { Q.s.scores = [0, 0]; nextRound(); } return; }
  if (b.id === "recapBtn") { monthRecap(); return; }
  if (b.id === "qChal") { const g = Q.s; beatShare(g.game, g.scores[0]); return; }
  if (b.id === "qCard") { const g = Q.s, d = QDEF[g.game]; showCard("quiz", { lg: S.code, title: d.name, big: String(Math.max(...g.scores)), sub: g.mode === "duo" ? `Player 1 ${g.scores[0]} · Player 2 ${g.scores[1]}` : "points", line: "How much ball knowledge have you got?", share: `ballknowledge, ${d.name}: ${Math.max(...g.scores)} points. Think you know more?`, tiles: [[String(g.mode === "solo" ? g.streak : g.rounds || d.rounds), g.mode === "solo" ? "streak" : "rounds"], [S.code === "ALL" ? "All 5" : S.code, "league"], [g.mode, "mode"]] }); return; }
  if (b.id === "qB0") { buzz(0); return; }
  if (b.id === "qB1") { if (Net.role === "host" && Net.started && !Net.applying) return; buzz(1); return; }
  if (b.id === "qGuess") { submitAnswer(null); return; }
  if (b.dataset.sug != null && b.closest("#qSug")) { const v = b.dataset.sug; submitAnswer(QDEF[Q.s.game].unit === "club" ? v : +v); return; }
  if (b.id === "finStart") { newFinish("solo"); Snd.tick(); return; }
  if (b.id === "finDuo") { newFinish("duo"); Snd.tick(); return; }
  if (b.id === "finOnline") { openOnline("finish"); return; }
  if (b.id === "finAgain") { newFinish(S.fin.mode); Snd.tick(); return; }
  if (b.id === "finLock") { if (Net.role === "host" && Net.started && !Net.applying && S.fin.mode === "duo" && S.fin.turn === 1) return; lockFinish(); return; }
  if (b.id === "finNext") { nextFinish(); Snd.tick(); return; }
  if (b.id === "finEnd") { endFinish(); return; }
  if (b.id === "finCard") { const f = S.fin; showCard("quiz", { lg: S.code, title: "Where did they finish?", big: String(Math.max(...f.scores)), sub: f.mode === "solo" ? `streak of ${f.streak}` : "points", line: "Table knowledge.", share: `ballknowledge, Where did they finish?: ${Math.max(...f.scores)} points.`, tiles: [[String(f.mode === "solo" ? f.streak : f.rounds), f.mode === "solo" ? "streak" : "rounds"], [S.code === "ALL" ? "All 5" : S.code, "league"], [f.mode, "mode"]] }); return; }
  if (b.dataset.vh) { answerVH(S.vk, b.dataset.vh); return; }
  if (b.id === "vNext") { S.pv = S.cv = null; S.vk = rnd(["p", "c"]); Snd.tick(); renderVH(S.vk); return; }
  if (b.id === "nmSolo") { S.vsolo = true; S.vStreak = 0; S.vk = rnd(["p", "c"]); Snd.tick(); renderValue(); return; }
  if (b.id === "nmDuo") { newNumber("duo"); Snd.tick(); return; }
  if (b.id === "nmLock") { if (Net.role === "host" && Net.started && !Net.applying && S.num.turn === 1) return; lockNumber(); return; }
  if (b.id === "nmNext") { Snd.tick(); nextNumber(); return; }
  if (b.id === "nmEnd") { endNumber(); return; }
  if (b.id === "nmAgain") { newNumber(S.num.mode); return; }
  if (b.id === "nmCard") { const g = S.num; showCard("quiz", { lg: S.code, title: "Write your number", big: String(Math.max(...g.scores)), sub: g.mode === "duo" ? `Player 1 ${g.scores[0]} · Player 2 ${g.scores[1]}` : "points", line: "Market whisperer?", share: `ballknowledge, Write your number: ${Math.max(...g.scores)} points.`, tiles: [["5", "rounds"], [S.code === "ALL" ? "All 5" : S.code, "league"], [g.mode, "mode"]] }); return; }
  if (b.id === "rpStart") { newRapid(); Snd.tick(); return; }
  if (b.dataset.rp) { rapidPick(b.dataset.rp); return; }
  if (b.id === "bbStart") { newBracket(); Snd.tick(); return; }
  if (b.dataset.bb) { const bb = S.bb; if (bb && !bb.locked) { const [i, side] = b.dataset.bb.split("|"); bb.picks[i] = side; Snd.tick(); renderBracket(); } return; }
  if (b.id === "bbLock") { bbLock(); return; }
  if (b.id === "bbNext") { bbNext(); return; }
  if (b.dataset.xik) { S.xiKind = b.dataset.xik; Snd.tick(); renderXI(); return; }
  if (b.dataset.ick) { S.icKind = b.dataset.ick; Snd.tick(); renderIconic(); return; }
  if (b.id === "icStart") { newIconic(); Snd.tick(); return; }
  if (b.id === "icGuess") { icGuess(); return; }
  if (b.id === "icHint") { const x = S.ic; if (x && x.phase === "play" && x.hint < 2) { x.hint++; x.hints++; renderIconic(); } return; }
  if (b.id === "icSkip") { const x = S.ic; if (x && x.phase === "play") { x.skipped++; x.msg = ""; icAdvance(); } return; }
  if (b.id === "xiStart" || b.id === "xiAgain") { newXI(); Snd.tick(); return; }
  if (b.id === "xiGuess") { xiGuess(); return; }
  if (b.id === "xiHint") { const x = S.xi; if (x && x.phase === "play") { const i = x.team.xi.findIndex((p, k) => !x.found.has(k) && !(x.hintOf[k] >= 2)); if (i >= 0) { x.hintOf[i] = (x.hintOf[i] || 0) + 1; x.hints++; renderXI(); } } return; }
  if (b.id === "xiGiveUp") { endXI(); return; }
  if (b.id === "ttSolo") { newTTT("solo"); Snd.tick(); return; }
  if (b.id === "ttDuo") { newTTT("duo"); Snd.tick(); return; }
  if (b.dataset.tc != null && b.dataset.tc !== "") { if (Net.role === "host" && Net.started && !Net.applying && S.ttt.turn === 1) return; S.ttt.sel = +b.dataset.tc; S.ttt.msg = ""; Snd.tick(); renderTTT(); return; }
  if (b.dataset.dr != null && b.dataset.dr !== "") { const t = S.ttt; if (!t || t.phase !== "draft") return; if (Net.role === "host" && Net.started && !Net.applying && t.turn === 1) return;   /* only while an online opponent is connected: a room left open must not lock Player 2 out of a one-device game */ if (t.mode === "solo" && t.turn === 1) return; draftPick(b.dataset.dr); return; }
  if (b.id === "tCancel") { S.ttt.sel = null; renderTTT(); return; }
  if (b.id === "tGuess") { if (Net.role === "host" && Net.started && !Net.applying && S.ttt.turn === 1) return; tttSubmit(null); return; }
  if (b.dataset.sug != null && b.closest("#tSug")) { tttSubmit(b.dataset.sug); return; }
  if (b.id === "rDuo") { newRoulette(); Snd.tick(); return; }
  if (b.id === "rOnline") { openOnline("roulette"); return; }
  if (b.id === "rGuess") { if (Net.role === "host" && Net.started && !Net.applying && S.rou.turn === 1) return; rouSubmit(null); return; }
  if (b.dataset.sug != null && b.closest("#rSug")) { if (Net.role === "host" && Net.started && !Net.applying && S.rou.turn === 1) return; rouSubmit(b.dataset.sug); return; }
  if (b.id === "rNext") { Snd.tick(); nextRoulette(); return; }
  if (b.id === "rFinish") { S.rou.phase = "done"; rankedEnd(S.rou, S.rou.wins); Snd.win(); confetti(); renderRoulette(); return; }
  if (b.id === "rAgain") { newRoulette(); return; }
  if (b.id === "ttAgain") { newTTT(S.ttt.mode); return; }
  if (b.id === "ttNext") { const s = S.ttt.series; newTTT(S.ttt.mode, s ? { w: s.w.slice(), n: S.ttt.winner === "draw" ? s.n : s.n + 1 } : null); return; }
  if (b.id === "ttBo3") { if (Net.role === "guest") return; S.tttBo3 = !S.tttBo3; if (S.ttt && S.ttt.phase === "draft" && S.ttt.step === 0) S.ttt.series = S.tttBo3 ? { w: [0, 0], n: 1 } : null; renderTTT(); return; }
  if (b.id === "ttCard") { const t = S.ttt, w = t.winner === "draw" ? "Draw" : (t.mode === "solo" ? (t.winner.who === 0 ? "I won" : "Computer won") : `Player ${t.winner.who + 1} won`); showCard("quiz", { lg: S.code, title: "Basketball tic-tac-toe", big: w, sub: t.mode === "solo" ? "against the computer" : "two players", line: "Name a player who fits.", share: `ballknowledge, Basketball tic-tac-toe: ${w}.`, tiles: [[String(t.used.size), "players used"], [S.code === "ALL" ? "All 5" : S.code, "league"], [t.mode, "mode"]] }); return; }
  if (b.id === "holNext") { S.hol = null; Snd.tick(); renderHol(); return; }
  if (b.id === "goStar") { const st = lgOf(S.code).star, f = freshPool(S.code).filter((r) => r.m[1] === st.club || r.m[2] === st.club); if (f.length) { const r = f[Math.floor(Math.random() * f.length)]; Snd.tick(); open(r.c, r.season, r.i); } return; }
  if (b.id === "goRandom") { const f = freshPool(S.code); if (f.length) { const r = f[Math.floor(Math.random() * f.length)]; Snd.tick(); open(r.c, r.season, r.i); } return; }
  if (b.dataset.pick) { S.pick = b.dataset.pick; if (S.useScore && resOf(S.score[0], S.score[1]) !== S.pick) S.score = defaultScore(S.pick); Snd.tick(); renderPlay(); return; }
  if (b.id === "useScoreBtn") { S.useScore = !S.useScore; if (S.useScore && S.pick && resOf(S.score[0], S.score[1]) !== S.pick) S.score = defaultScore(S.pick); Snd.tick(); renderPlay(); return; }
  if (b.dataset.st) { const [k, d] = [+b.dataset.st[0], b.dataset.st[1]]; S.score[k] = Math.max(0, Math.min(9, S.score[k] + (d === "+" ? 1 : -1))); S.pick = resOf(S.score[0], S.score[1]); Snd.tick(); renderPlay(); return; }
  if (b.id === "lockBtn") { lockPlay(); return; }
  if (b.id === "nextBtn") { S.cur = null; const f = freshPool(S.code); if (f.length) { const r = f[Math.floor(Math.random() * f.length)]; open(r.c, r.season, r.i); } else renderRoom(); return; }
  if (b.id === "playBack" || b.id === "dailyNext") { S.cur = null; renderRoom(); paintScore(); return; }
  if (b.dataset.dfix) { const [lg, sn, i] = b.dataset.dfix.split("|"); Snd.tick(); open(lg, sn, +i, true); return; }
  if (b.id === "shareBtn") { shareDaily(); return; }
  if (b.dataset.cp) { S.raceCp = b.dataset.cp; Snd.tick(); renderRace(); return; }
  if (b.id === "heatBtn") { S.raceHeat = !S.raceHeat; Snd.tick(); renderRace(); return; }
  if (b.id === "rpPlay") { toggleReplay(); return; }
  if (b.id === "lbToggle") { toggleBoard(); return; }
});
function resetGames() { if (Net.role) { if (Net.role === "host") Net.send({ k: "end" }); Net.close(); } stopQuiz(); Q.s = null; S.fin = null; S.pv = null; S.cv = null; S.pvStreak = 0; S.cvStreak = 0; S.num = null; S.ttt = null; S.vsolo = false; S.vStreak = 0; S.vk = null; S.vSeen = []; S.numSeen = []; S.rou = null; if (S.xi) clearInterval(S.xi.timer); S.xi = null; S.ic = null; S.dual = false; if (S.rp) clearInterval(S.rp.timer); S.rp = null; S.bb = null; }
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-diff]"); if (!b) return; S.diff = b.dataset.diff; try { localStorage.setItem("bkn_diff", S.diff); } catch (err) { /* storage blocked */ } document.querySelectorAll("[data-diff]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.diff === S.diff)); const n = $("#diffNote"); if (n) n.textContent = DIFFNOTE[S.diff]; Snd.tick(); });
document.addEventListener("input", (e) => { if (e.target.id === "finRange" && S.fin && S.fin.cur) { S.fin.cur.guess = +e.target.value; const v = $("#finVal"); if (v) v.textContent = ordn(S.fin.cur.guess); } });
document.addEventListener("input", (e) => { if (e.target.id === "admQ") { clearTimeout(window.__admT); window.__admT = setTimeout(() => { Admin.q = e.target.value; loadAdminUsers(); }, 300); } });
document.addEventListener("input", (e) => { if (e.target.id === "pfPlayer") { const box = $("#pfPSug"), list = suggestions(e.target.value, QZ.players, (x) => x.n); box.innerHTML = list.map((x) => `<button type="button" class="sug" data-favp="${x.id}"><span>${esc(x.n)}</span><small>${esc(x.club || "")}</small></button>`).join(""); } });
document.addEventListener("input", (e) => { if (e.target.id === "rIn") { const box = $("#rSug"); if (!box) return; const list = suggestions(e.target.value, QZ.players, (x) => x.n); box.innerHTML = list.map((x) => `<button type="button" class="sug" data-sug="${x.id}"><span>${esc(x.n)}</span>${list.filter((y) => y.n === x.n).length > 1 ? `<small>born ${esc(x.dob.slice(0, 4))}</small>` : ""}</button>`).join(""); } });
document.addEventListener("input", (e) => { if (e.target.id === "tIn") { const box = $("#tSug"); if (!box) return; const g = S.ttt.grid, r = g.rows[Math.floor(S.ttt.sel / 3)], c = g.cols[S.ttt.sel % 3]; const list = suggestions(e.target.value, QZ.players, (x) => x.n); box.innerHTML = list.map((x) => `<button type="button" class="sug" data-sug="${x.id}"><span>${esc(x.n)}</span>${list.filter((y) => y.n === x.n).length > 1 ? `<small>born ${esc(x.dob.slice(0, 4))}</small>` : ""}</button>`).join(""); } });
document.addEventListener("keydown", (e) => { if (S.rp && S.rp.phase === "play" && !/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || "")) && /^[hdaHDA]$/.test(e.key)) { rapidPick(e.key.toUpperCase()); return; } if (e.key !== "Enter") return; if (e.target.id === "xiIn") { e.preventDefault(); xiGuess(); return; } if (e.target.id === "icIn") { e.preventDefault(); icGuess(); return; } if (e.target.id === "rIn") { e.preventDefault(); if (Net.role === "host" && S.rou.turn === 1) return; rouSubmit(null); } else if (e.target.id === "tIn") { e.preventDefault(); tttSubmit(null); } else if (e.target.id === "nmIn") { e.preventDefault(); lockNumber(); } });
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "pfNick") { const b = $("#pfNickSave"); if (b && t.value.trim() && t.value.trim() !== (prof().nick || "")) b.click(); return; }
  if (t.id === "pfTheme") { const p = prof(); p.teamTheme = t.checked; saveProf(p); teamTheme(); return; }
  if (t.id === "pfTeam") { const p = prof(); p.favT = t.value; if (p.favP && p.favT) unlock(p, "fav"); saveProf(p); syncProfile(); teamTheme(); renderProfilePage(); return; }
  if (t.id === "styleSel") { S.style = t.value; }
  else if (t.id === "raceSeasonSel") { S.raceSeason = t.value; renderRace(); }
  else if (t.id === "seasonSel") { stopReplay(); S.season = t.value.replace(" (live)", ""); S.replay.round = 0; paintReplay(true); }
});
let dragIx = null;
document.addEventListener("dragstart", (e) => { const r = e.target.closest && e.target.closest("[data-tb]"); if (r) { dragIx = +r.dataset.tb; e.dataTransfer.effectAllowed = "move"; r.classList.add("dragging"); } });
document.addEventListener("dragover", (e) => { if (dragIx != null && e.target.closest && e.target.closest("[data-tb]")) e.preventDefault(); });
document.addEventListener("drop", (e) => { const r = e.target.closest && e.target.closest("[data-tb]"); if (r && dragIx != null && S.tab) { e.preventDefault(); const o = S.tab.order, [x] = o.splice(dragIx, 1); o.splice(+r.dataset.tb, 0, x); dragIx = null; Snd.tick(); renderTableGame(); } });
document.addEventListener("dragend", () => { dragIx = null; });
document.addEventListener("input", (e) => { if (e.target.id === "rpScrub") { stopReplay(); S.replay.round = +e.target.value; Snd.tick(); paintReplay(); } });
let lastHov = null, lastHovT = 0;
document.addEventListener("mouseover", (e) => {
  if (!matchMedia("(hover: hover)").matches) return;
  const el = e.target.closest && e.target.closest(".door, .gpick, .gcard, .mode, .chip, .room, .back, .pill, .btn, .lobby, .avopt, .stk.on, .reactbar button, .world, .brand, .mp, .crumb, .sug, .achv"); if (!el || el.disabled || el === lastHov) return;
  lastHov = el; const n = performance.now(); if (n - lastHovT < 60) return; lastHovT = n; Snd.hover();
});
document.addEventListener("mouseout", (e) => { if (!e.relatedTarget || !lastHov || !lastHov.contains(e.relatedTarget)) lastHov = null; });
addEventListener("beforeunload", (e) => { if (inMatch()) { e.preventDefault(); e.returnValue = ""; } });
addEventListener("hashchange", () => pageTo(() => route()));

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
/* Basketball front page glow-up (appended after the basketball overlay, so it wraps the final renderHome).
   The same "Today" strip football has, in basketball terms:
   - Game of the day: one game for everyone, picked from the date, with a countdown to tomorrow's.
   - Tonight in the NBA: today's real games from ESPN's public scoreboard (live scores while they're on, tip-off times before,
     finals after), with the team logos. If ESPN can't be reached, or there are no games today, the card hides.
   - Ranked: how many lobbies are open right now (hidden when there are none).
   And the section cards lean towards the pointer, like football's. */
{
  const homePrev = renderHome;
  renderHome = function () { homePrev(); nbToday(); nbTilt(); };
}
async function nbToday() {
  let box = $("#homeToday"); if (!box) { const d = $("#doors"); if (!d) return; d.insertAdjacentHTML("beforebegin", '<div id="homeToday" class="htoday"></div>'); box = $("#homeToday"); }
  const all = [...GAMES, ...QUIZ_GAMES].filter((g) => GAME_IDS.includes(g.id)); if (!all.length) return;
  const g = all[hash("gotd-" + todayKey()) % all.length], teams = Object.keys(CREST), faces = [0, 1, 2].map((j) => badge(teams[hash(todayKey() + j) % teams.length], "md")).join("");
  box.innerHTML = `<button type="button" class="htcard htgotd" data-nbgame="${esc(g.id)}"><span class="htlabel"><svg class=ic><use href=#i-star></use></svg> Game of the day</span><div class="gfaces">${faces}</div><b class="htname">${esc(g.name)}</b><span class="fine">${esc(g.tag || "")}</span><span class="htfoot"><span class="dgo">Play now</span><span class="fine num" id="htNew"></span></span></button>
    <div class="htcol"><button type="button" class="htcard htsmall" id="htNba" hidden data-nbgroup="live"></button><button type="button" class="htcard htsmall" id="htLobby" hidden data-nbgroup="ranked"></button></div>`;
  const tick = () => { const el = $("#htNew"); if (!el) return clearInterval(nbToday.t); const now = new Date(), mid = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)), ms = mid - now; el.textContent = `new game in ${Math.floor(ms / 3.6e6)}h ${Math.floor((ms % 3.6e6) / 6e4)}m`; };
  clearInterval(nbToday.t); tick(); nbToday.t = setInterval(tick, 30000);
  try {
    const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"), j = r.ok ? await r.json() : null, ev = (j && j.events) || [], el = $("#htNba");
    if (el && ev.length) {
      const live = ev.filter((e) => e.status.type.state === "in"), pre = ev.filter((e) => e.status.type.state === "pre"), done = ev.filter((e) => e.status.type.state === "post");
      const pick = live[0] || pre[0] || done[done.length - 1], cs = pick.competitions[0].competitors, away = cs.find((c) => c.homeAway === "away"), home = cs.find((c) => c.homeAway === "home"), state = pick.status.type.state;
      const logo = (c) => (c.team.logo ? `<img class="htlogo" src="${esc(c.team.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "");
      const mid = state === "pre" ? `<small>at</small>` : `<b class="num">${esc(away.score)}</b><small>–</small><b class="num">${esc(home.score)}</b>`;
      el.hidden = false;
      el.innerHTML = `<span class="htlabel">${live.length ? '<span class="livedot"></span> Live now' : "Tonight in the NBA"} · ${ev.length} game${ev.length === 1 ? "" : "s"}</span><span class="htmatch">${logo(away)}<b>${esc(away.team.abbreviation)}</b>${mid}<b>${esc(home.team.abbreviation)}</b>${logo(home)}</span><span class="fine">${esc(pick.status.type.shortDetail || "")}${live.length > 1 ? ` · ${live.length} games on` : pre.length && state !== "pre" ? ` · ${pre.length} still to come` : ""}</span>`;
    }
  } catch (e) { /* ESPN unreachable: the card stays hidden */ }
  if (Board.mode === "rest") { const rows = await Ranked.rpc("open_lobbies"), l = $("#htLobby"); if (rows && rows.length && l) { l.hidden = false; l.innerHTML = `<span class="htlabel"><svg class=ic><use href=#i-trophy></use></svg> Ranked</span><span class="htbig num">${rows.length}</span><span class="fine">open lobb${rows.length === 1 ? "y" : "ies"} right now · join one</span>`; } }
}
function nbTilt() {
  if (typeof REDUCED !== "undefined" && REDUCED) return;
  document.querySelectorAll("#doors .door, .htcard").forEach((d) => { if (d.dataset.tilt) return; d.dataset.tilt = 1;
    d.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") return; const r = d.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; d.style.transform = `perspective(700px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-3px)`; d.style.setProperty("--mx", `${(x + 0.5) * 100}%`); d.style.setProperty("--my", `${(y + 0.5) * 100}%`); });
    d.addEventListener("pointerleave", () => { d.style.transform = ""; }); });
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-nbgame],[data-nbgroup]"); if (!b) return;
  try { Snd.tick(); } catch (x) { /* quiet */ } const slug = Object.keys(BYSLUG).find((k) => k !== "all-leagues") || "nba";
  if (b.dataset.nbgame) { go("games-" + slug + "-" + b.dataset.nbgame); return; }
  S.hubGroup = b.dataset.nbgroup; S.game = null; go("games-" + slug + "-" + b.dataset.nbgroup);
});
(() => { const s = document.createElement("style"); s.textContent = `
.htoday{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:14px;margin:0 0 14px}@media(max-width:720px){.htoday{grid-template-columns:1fr}}.htcol{display:flex;flex-direction:column;gap:14px}
.htcard{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:6px;text-align:left;padding:16px 18px;border-radius:20px;border:1px solid var(--line);background:radial-gradient(circle at var(--mx,80%) var(--my,0%),color-mix(in srgb,var(--accent) 18%,transparent),transparent 55%),var(--surface);color:var(--ink);font:inherit;cursor:pointer;transition:transform .25s cubic-bezier(.2,1.2,.4,1),box-shadow .25s,border-color .25s;animation:htIn .6s cubic-bezier(.2,1.2,.4,1) both;overflow:hidden}
.htcard:hover{border-color:var(--accent);box-shadow:0 16px 40px -18px var(--accent)}.htgotd{min-height:190px}
.htgotd::after{content:"";position:absolute;inset:-40%;background:conic-gradient(from 0deg,transparent 0 80%,color-mix(in srgb,var(--accent) 35%,transparent) 90%,transparent 100%);animation:htSweep 6s linear infinite;pointer-events:none;opacity:.5}
.htcol .htcard:nth-child(1){animation-delay:.08s}.htcol .htcard:nth-child(2){animation-delay:.16s}@keyframes htIn{from{transform:translateY(14px);opacity:0}}@keyframes htSweep{to{transform:rotate(360deg)}}
.htlabel{display:inline-flex;align-items:center;gap:6px;font:700 11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}.htname{font:400 30px/1.1 var(--display);text-transform:uppercase;letter-spacing:.02em}
.htfoot{display:flex;align-items:center;gap:12px;margin-top:auto;width:100%;justify-content:space-between;position:relative;z-index:1}.htmatch{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:18px}.htmatch small{opacity:.6}.htmatch .num{font-family:"Orbitron",var(--mono);font-size:22px;color:#ffb21f}
.htlogo{width:34px;height:34px;object-fit:contain;filter:drop-shadow(0 2px 3px #0006)}.htbig{font:800 40px/1 var(--display)}
.livedot{width:8px;height:8px;border-radius:50%;background:#ff4d4d;box-shadow:0 0 0 0 #ff4d4d;animation:nbLive 1.4s infinite}@keyframes nbLive{70%{box-shadow:0 0 0 8px #ff4d4d00}}
#doors .door{transition:transform .25s cubic-bezier(.2,1.2,.4,1),box-shadow .25s}#doors .door::before{content:"";position:absolute;inset:0;border-radius:inherit;background:radial-gradient(260px circle at var(--mx,50%) var(--my,50%),color-mix(in srgb,var(--accent) 22%,transparent),transparent 60%);opacity:0;transition:opacity .25s;pointer-events:none}#doors .door:hover::before{opacity:1}
@media (prefers-reduced-motion: reduce){.htgotd::after,.livedot{animation:none}}`; document.head.appendChild(s); })();

/* ===== two players on one device can type their own names (shared by football and basketball) ===== */
const PN = ["Player 1", "Player 2"];
/* Names last only for the game you're playing on this device: nothing is remembered between visits (names typed in
   an earlier game, or your account name, used to come back and replace "Player 1" across the whole site), and they're only
   swapped in while a one-device game is on screen, never in online rooms. */
try { localStorage.removeItem("bk_pn1"); localStorage.removeItem("bk_pn2"); } catch (e) { /* storage blocked */ }
const pnLive = () => { try { return !(Net.role && Net.started) && !!((S.ttt && S.ttt.mode === "duo") || (Q.s && Q.s.mode === "duo") || S.rou || (S.fin && S.fin.mode === "duo") || (S.num && S.num.mode === "duo")); } catch (e) { return false; } };   /* a one-device game is open (its result screen included) */
function nameFix(node) { if (PN[0] === "Player 1" && PN[1] === "Player 2") return; if (!pnLive()) return; if (node.nodeType === 3) { if (/Player [12]/.test(node.data)) node.data = node.data.replace(/Player 1/g, PN[0]).replace(/Player 2/g, PN[1]); return; } if (node.nodeType !== 1 || /SCRIPT|STYLE|INPUT|TEXTAREA/.test(node.tagName)) return; const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (/Player [12]/.test(n.data)) n.data = n.data.replace(/Player 1/g, PN[0]).replace(/Player 2/g, PN[1]); }
new MutationObserver((ms) => { ms.forEach((m) => { if (m.type === "characterData") nameFix(m.target); else m.addedNodes.forEach(nameFix); }); }).observe(document.body, { childList: true, subtree: true, characterData: true });
function askNames(then) {
  const old = document.getElementById("pnAsk"); if (old) old.remove(); const me = "";
  const d = document.createElement("div"); d.id = "pnAsk"; d.setAttribute("style", "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:16px");
  const v1 = PN[0] !== "Player 1" ? PN[0] : me, v2 = PN[1] !== "Player 2" ? PN[1] : "";
  d.innerHTML = `<div class="card" style="max-width:420px;width:100%"><h2 style="font-size:26px;margin-bottom:6px">Who is playing?</h2><p class="sub" style="margin-bottom:12px">Type your names so the scores say who is who. You can leave them blank.</p><div style="display:grid;gap:10px"><label class="fine">Player 1 (A key)<input id="pn1" maxlength="14" autocomplete="off" value="${esc(v1)}" placeholder="Player 1" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface2);color:var(--ink);font:inherit"></label><label class="fine">Player 2 (L key)<input id="pn2" maxlength="14" autocomplete="off" value="${esc(v2)}" placeholder="Player 2" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface2);color:var(--ink);font:inherit"></label></div><div class="row" style="margin-top:14px"><button class="btn" id="pnGo" type="button">Start</button><button class="btn ghost" id="pnX" type="button">Cancel</button></div></div>`;
  document.body.appendChild(d); const i1 = d.querySelector("#pn1"); i1.focus(); i1.select();
  const go = () => { const a = d.querySelector("#pn1").value.trim().replace(/[<>]/g, ""), b = d.querySelector("#pn2").value.trim().replace(/[<>]/g, ""); PN[0] = a || "Player 1"; PN[1] = b && b !== a ? b : a ? "Player 2" : "Player 2"; if (PN[1] === PN[0]) PN[1] = "Player 2"; try { /* kept in memory only */ } catch (e) { /* ok */ } d.remove(); then(); setTimeout(() => nameFix(document.body), 0); };
  d.addEventListener("click", (e) => { if (e.target.id === "pnGo") go(); else if (e.target.id === "pnX" || e.target === d) d.remove(); }); d.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); else if (e.key === "Escape") d.remove(); e.stopPropagation(); });
}
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button.mode"); if (!b || b.dataset.named || !/one device/i.test(b.textContent)) return; e.stopPropagation(); e.preventDefault(); askNames(() => { b.dataset.named = "1"; b.click(); delete b.dataset.named; }); }, true);
nameFix(document.body);

/* ===== audio mixer and announcer voice (football and basketball) ===== */
const Mix = { fx: 1, music: 1, voice: 0.9, say: false };
try { Object.assign(Mix, JSON.parse(localStorage.getItem("bk_mix") || "{}")); } catch (e) { /* storage blocked */ }
function applyMix() { window.MIXFX = Mix.fx; window.MIXMUS = Mix.music; try { Snd.remix(); } catch (e) { /* audio not started */ } try { localStorage.setItem("bk_mix", JSON.stringify(Mix)); } catch (e) { /* storage blocked */ } }
applyMix();
/* No more device ("robot") voice: every spoken moment belongs to the sidekick, in its own recorded voice. The sidekick already
   reacts to achievements, streaks, rank-ups, best scores and the end of a run; the few moments it did not cover are handed to it here. */
const Voice = { say(text) { try { if (typeof Mascot === "undefined" || Mascot.mode() === "off") return; if (/All three dailies done|Secret found/i.test(text)) Mascot.react("achieve", true); } catch (e) { /* no sidekick on this page */ } } };
{ const pick = (a) => a[Math.floor(Math.random() * a.length)], win0 = Snd.win, right0 = Snd.right;
  Snd.win = function () { win0.apply(Snd, arguments); Voice.say(pick(["Winner!", "Brilliant!", "Nice one!", "What a finish!"])); };
  Snd.right = function () { right0.apply(Snd, arguments); try { const n = Q && Q.s && Q.s.streak; if (n >= 3 && n % 3 === 0) Voice.say("Streak of " + n); } catch (e) { /* no quiz */ } };
  const toast0 = toast; toast = function (html, kind) { try { const txt = String(html).replace(/<[^>]*>/g, " "); if (/Rank up/i.test(txt)) Voice.say(txt.replace(/\s+/g, " ").trim()); else if (/Achievement unlocked/i.test(txt)) Voice.say("Achievement unlocked"); else if (/Secret found/i.test(txt)) Voice.say("Secret found. The Notebook."); } catch (e) { /* ok */ } return toast0.apply(this, arguments); };
}
{ const rs0 = renderSettings;
  renderSettings = function () { rs0(); const el = $("#setPage"); if (!el || document.getElementById("mixCard")) return; const sl = (id, label, v) => `<label class="fine" style="display:grid;grid-template-columns:96px 1fr 40px;gap:10px;align-items:center;margin:8px 0">${label}<input type="range" id="${id}" min="0" max="100" value="${Math.round(v * 100)}" style="width:100%"><span class="num" id="${id}V">${Math.round(v * 100)}%</span></label>`;
    el.insertAdjacentHTML("beforeend", `<div class="card" id="mixCard"><h3>Audio mixer</h3><p class="fine">Set effects, music and voice separately. Everything is made live in your browser, nothing is downloaded.</p>${sl("mixFx", "Effects", Mix.fx)}${sl("mixMus", "Music", Mix.music)}${sl("mixVoice", "Voice", Mix.voice)}<div class="row" style="margin-top:6px"><button class="chip" id="mixTest" type="button">Test sound</button></div></div>`); };
  document.addEventListener("input", (e) => { const m = { mixFx: "fx", mixMus: "music", mixVoice: "voice" }[e.target.id]; if (!m) return; Mix[m] = e.target.value / 100; const l = document.getElementById(e.target.id + "V"); if (l) l.textContent = e.target.value + "%"; applyMix(); });
  document.addEventListener("click", (e) => { if (e.target.id === "mixSay") { Mix.say = !Mix.say; applyMix(); e.target.setAttribute("aria-pressed", Mix.say); e.target.textContent = "Announcer voice: " + (Mix.say ? "On" : "Off"); if (Mix.say) Voice.say("Game on"); } else if (e.target.id === "mixTest") { Snd.right(); setTimeout(() => Snd.win(), 500); } });
}

/* ---- games that share a core are merged into one card with several versions (football and basketball) ---- */
(function () {
  if (typeof QUIZ_GAMES === "undefined" || typeof renderRoom !== "function") return;
  const nba = QUIZ_GAMES.some((g) => g.id === "dropped");
  const GROUPS = nba ? [
    { lead: "who", name: "Name it", tag: "Six ways to name a mystery: player clues, a career path, team stats, a real stat line, a blurred logo or scrambled letters.", vers: [["who", "Player clues"], ["career", "Career path"], ["club", "Team stats"], ["dropped", "Stat line"], ["blur", "Logo blur"], ["scramble", "Scramble"]] },
  ] : [];   // football: every game has its own card again (owner's call, 21 Nov 2026); the merge into Name it / Match recall is undone
  window.QUIZ_HIDDEN = []; window.VERSNAME = {}; window.VERSOF = {};
  GROUPS.forEach((g) => {
    const lead = QUIZ_GAMES.find((x) => x.id === g.lead); if (!lead) return;
    g.vers.forEach(([id, label]) => { VERSNAME[id] = label; VERSOF[id] = g; });
    g.vers.forEach(([id]) => { if (id === g.lead) return; const k = QUIZ_GAMES.findIndex((x) => x.id === id); if (k >= 0) QUIZ_HIDDEN.push(QUIZ_GAMES.splice(k, 1)[0]); });
    lead.name = g.name; lead.tag = g.tag; lead.modes = g.vers.length + " versions · solo or 2 players";
  });
  const rr = renderRoom;
  renderRoom = function () {
    rr.apply(this, arguments);
    try {
      const g = S.game && VERSOF[S.game], sub = $("#room #diffNote") && $("#room .card .sub"); if (!g || !sub || $("#room .vers")) return;
      sub.insertAdjacentHTML("afterend", `<div class="vers"><div class="label" style="margin-top:12px">Version</div><div class="diffbar" role="group" aria-label="Version">${g.vers.map(([id, label]) => `<button type="button" class="chip" data-game="${id}" aria-pressed="${id === S.game}">${label}</button>`).join("")}</div></div>`);
    } catch (e) { /* chips are optional */ }
  };
})();

/* ---- themes: floodlit night (football) and neon street court (basketball). Cheap layers: transform and opacity only. ---- */
(function themeFX() {
  const root = document.documentElement, nba = typeof NBH_DIFF !== "undefined"; root.setAttribute("data-sport", nba ? "nba" : "fb");
  const on = ":root[data-sport=" + (nba ? "nba" : "fb") + "]" + (nba ? ":not([data-style=minimal])" : "[data-style=flood]");
  const css = nba ? `
#tfx{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
${on} #tfx .tx-neon{position:absolute;right:3vw;top:76px;width:min(240px,34vw);opacity:.9;animation:tflick 7s infinite;filter:drop-shadow(0 0 7px #ff7a1a) drop-shadow(0 0 18px rgba(255,122,26,.55))}
${on} #tfx .tx-court{position:absolute;left:0;right:0;bottom:0;height:38vh;opacity:.16;transform:perspective(600px) rotateX(58deg);transform-origin:50% 100%}
${on} #tfx .tx-ballb{position:absolute;left:4vw;bottom:2vh;width:44px;height:44px;animation:tbounce 2.2s cubic-bezier(.3,0,.5,1) infinite;filter:drop-shadow(0 0 8px rgba(255,122,26,.7))}
${on} #tfx .tx-glow{position:absolute;inset:0;background:radial-gradient(520px 300px at 88% 14%,rgba(255,122,26,.16),transparent 70%),radial-gradient(700px 360px at 10% 100%,rgba(255,60,120,.10),transparent 70%)}
@keyframes tflick{0%,100%{opacity:.95}44%{opacity:.95}46%{opacity:.5}48%{opacity:.95}70%{opacity:.8}72%{opacity:.95}}
@keyframes tbounce{0%,100%{transform:translateY(0) scale(1.12,.88)}12%{transform:translateY(0) scale(1)}50%{transform:translateY(-150px) rotate(180deg)}88%{transform:translateY(0) rotate(340deg) scale(1)}}
${on} h2.sec,${on} .gpick .gname,${on} .door .dname{font-family:"Permanent Marker","Anton",system-ui,sans-serif!important;letter-spacing:.01em;text-shadow:0 0 14px rgba(255,122,26,.45)}
${on} .card,${on} .gcard,${on} .gpick,${on} .door{box-shadow:0 0 0 1px rgba(255,122,26,.28),0 0 24px -6px rgba(255,122,26,.28),0 14px 30px -20px #000}
#tsw{position:fixed;inset:0;z-index:9000;pointer-events:none;transform:translateY(-105%);opacity:0}
${on} #tsw{background:repeating-linear-gradient(45deg,transparent 0 8px,rgba(255,255,255,.6) 8px 9.2px),repeating-linear-gradient(-45deg,transparent 0 8px,rgba(255,255,255,.6) 8px 9.2px);-webkit-mask-image:linear-gradient(180deg,transparent,#000 35%,#000 65%,transparent);mask-image:linear-gradient(180deg,transparent,#000 35%,#000 65%,transparent)}
#tsw.go{animation:tswv .62s cubic-bezier(.5,0,.3,1)}@keyframes tswv{10%{opacity:.9}to{transform:translateY(105%);opacity:.9}}
:root[data-perf=low] #tfx .tx-ballb,:root[data-perf=low] #tfx .tx-glow,:root[data-perf=low] #tsw{display:none}:root[data-perf=low] #tfx .tx-neon{animation:none}
@media (prefers-reduced-motion:reduce){#tfx .tx-ballb,#tfx .tx-neon{animation:none!important}#tsw{display:none}}
@media (max-width:640px){#tfx .tx-neon{top:64px;width:30vw}#tfx .tx-ballb{width:34px;height:34px}}
` : `
#tfx{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
${on} #tfx .tx-beam{position:absolute;top:-8vh;width:50vw;height:112vh;background:linear-gradient(180deg,rgba(255,244,205,.30),rgba(255,244,205,.07) 55%,transparent 82%);clip-path:polygon(46% 0,54% 0,100% 100%,0 100%);transform-origin:50% 0;opacity:.75;animation:tbeam 11s ease-in-out infinite alternate}
${on} #tfx .tx-b1{left:-8vw;--r0:-17deg;--r1:-8deg}${on} #tfx .tx-b2{right:-8vw;--r0:17deg;--r1:8deg;animation-delay:-5.5s}
@keyframes tbeam{from{transform:rotate(var(--r0))}to{transform:rotate(var(--r1))}}
${on} #tfx .tx-pitch{position:absolute;left:0;right:0;bottom:0;height:36vh;opacity:.10;transform:perspective(560px) rotateX(58deg);transform-origin:50% 100%}
${on} #tfx .tx-ballf{position:absolute;left:0;top:0;width:30px;height:30px;opacity:0;animation:tball 24s linear infinite;animation-delay:4s}
@keyframes tball{0%{opacity:0;transform:translate(-6vw,64vh) rotate(0)}4%{opacity:1}50%{transform:translate(50vw,12vh) rotate(540deg)}96%{opacity:1}100%{opacity:0;transform:translate(106vw,66vh) rotate(1000deg)}}
${on} #fx{display:none}
${on} h2.sec::after{content:"";display:block;height:3px;width:60px;margin-top:6px;border-radius:2px;background:linear-gradient(90deg,var(--accent),transparent)}
${on} .card,${on} .gcard,${on} .gpick,${on} .door{box-shadow:0 0 0 1px rgba(255,244,205,.10),0 14px 30px -20px #000}
#tsw{position:fixed;inset:0;z-index:9000;pointer-events:none;transform:translateX(-105%);opacity:0}
${on} #tsw{background:linear-gradient(90deg,transparent,rgba(255,244,205,.20) 38%,rgba(255,244,205,.42) 50%,rgba(255,244,205,.20) 62%,transparent)}
#tsw.go{animation:tswh .6s cubic-bezier(.5,0,.3,1)}@keyframes tswh{10%{opacity:1}to{transform:translateX(105%);opacity:1}}
:root[data-perf=low] #tfx,:root[data-perf=low] #tsw{display:none}
@media (prefers-reduced-motion:reduce){#tfx .tx-beam,#tfx .tx-ballf{animation:none!important}#tsw{display:none}}
`;
  const st = document.createElement("style"); st.textContent = css + `:root[data-mode=light] #tfx{opacity:.4}:root[data-mode=light] #tfx .tx-neon{filter:none;opacity:.55}:root[data-mode=light] h2.sec,:root[data-mode=light] .gpick .gname,:root[data-mode=light] .door .dname{text-shadow:none}:root[data-mode=light] .card,:root[data-mode=light] .gcard,:root[data-mode=light] .gpick,:root[data-mode=light] .door{box-shadow:0 1px 0 rgba(0,0,0,.06),0 10px 24px -16px rgba(0,0,0,.25)}`; document.head.appendChild(st);
  const hoop = `<svg class="tx-neon" viewBox="0 0 240 200" fill="none" stroke="#ff9a3c" stroke-width="4" stroke-linecap="round" aria-hidden="true"><rect x="40" y="6" width="160" height="104" rx="6" stroke="#ffd0a0"/><rect x="88" y="52" width="64" height="48" rx="3" stroke="#ffd0a0" stroke-width="3"/><ellipse cx="120" cy="124" rx="52" ry="12" stroke="#ff5a1a" stroke-width="6"/><path d="M70 128l16 62M96 134l10 58M120 136v58M144 134l-10 58M170 128l-16 62M82 150l76 0M90 172l60 0" stroke-width="2.4" stroke="#ffe2c4"/></svg>`;
  const ball = `<svg class="tx-ballb" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#ff7a1a" stroke="#2a1200" stroke-width="2"/><path d="M2 24h44M24 2v44M8 8c10 9 10 23 0 32M40 8c-10 9-10 23 0 32" stroke="#2a1200" stroke-width="2" fill="none"/></svg>`;
  const court = `<svg class="tx-court" viewBox="0 0 400 220" fill="none" stroke="#ff9a3c" stroke-width="3" aria-hidden="true"><rect x="2" y="2" width="396" height="216"/><rect x="140" y="2" width="120" height="110"/><circle cx="200" cy="112" r="44"/><path d="M40 2c0 90 70 140 160 140s160-50 160-140"/><circle cx="200" cy="10" r="10"/></svg>`;
  const beams = `<i class="tx-beam tx-b1"></i><i class="tx-beam tx-b2"></i><svg class="tx-pitch" viewBox="0 0 400 220" fill="none" stroke="#fff" stroke-width="3" aria-hidden="true"><rect x="2" y="2" width="396" height="216"/><path d="M200 2v216"/><circle cx="200" cy="110" r="38"/><rect x="2" y="60" width="64" height="100"/><rect x="334" y="60" width="64" height="100"/></svg><svg class="tx-ballf" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#fff" stroke="#222" stroke-width="2"/><path d="M24 12l9 7-3 11H18l-3-11z" fill="#222"/><path d="M24 12V3M33 19l9-3M30 30l6 8M18 30l-6 8M15 19l-9-3" stroke="#222" stroke-width="2"/></svg>`;
  const mount = () => { if (document.getElementById("tfx")) return; const f = document.createElement("div"); f.id = "tfx"; f.setAttribute("aria-hidden", "true"); f.innerHTML = nba ? `<div class="tx-glow"></div>${court}${hoop}${ball}` : beams; document.body.prepend(f); const s = document.createElement("div"); s.id = "tsw"; document.body.appendChild(s); };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  let lock = 0; const sweep = () => { const el = document.getElementById("tsw"); if (!el || root.getAttribute("data-perf") === "low" || matchMedia("(prefers-reduced-motion:reduce)").matches || Date.now() - lock < 700) return; if (!(nba ? root.getAttribute("data-style") !== "minimal" : root.getAttribute("data-style") === "flood")) return; lock = Date.now(); el.classList.remove("go"); void el.offsetWidth; el.classList.add("go"); };
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("[data-door],[data-game],[data-group],.gcard,.gpick,.door,[data-crumb],#gamesBack,.mode")) sweep(); }, true);
  addEventListener("hashchange", sweep);
})();

/* ---- Daily challenges (football and basketball): today's three things, a streak and a 14-day calendar, built from what each sport already has ---- */
(function dailyHub() {
  if (typeof QUIZ_GAMES === "undefined" || typeof renderHome !== "function") return;
  const nba = typeof NBH_DIFF !== "undefined";
  const css = document.createElement("style"); css.textContent = `.dhd{width:18px;height:18px;border-radius:5px;background:var(--surface2,#222);border:1px solid var(--line,#fff3)}.dhd.some{background:var(--accent);opacity:.55}.dhd.full{background:var(--accent)}.dhd.today{outline:2px solid var(--ink)}.dhcard.done{outline:2px solid var(--accent)}.dhstreak{font:800 34px/1 var(--display,Inter),sans-serif;display:flex;gap:8px;align-items:center}`; document.head.appendChild(css);
  const safe = (f) => { try { return !!f(); } catch (e) { return false; } };
  const ITEMS = nba ? [
    { n: "Daily 5", d: "Five real games, the same for everyone today. Call the score and the quarter winners.", slug: "games-all-leagues-nbdaily", ic: "#i-trophy", done: (k) => !!store.items["nbd_" + k] },
    { n: "Question of the day", d: "A fun fact, a spotlight player and one question, the same for everyone.", slug: "discover", ic: "#i-bulb", done: (k) => !!store.items["dq_" + k] },
    { n: "Play any game", d: "Any game counts. Rank the five, Name it, Over or under, whatever you fancy.", slug: "games", ic: "#i-dice", done: (k) => ((prof().days || {})[k] || 0) > 0 },
  ] : [
    { n: "Daily 5", d: "Five real matches, the same for everyone today. Beat the model.", slug: "games-all-leagues-daily", ic: "#i-trophy", done: (k) => safe(() => dailyState("ALL", k).n === 5) },
    { n: "Question of the day", d: "The daily feed: an on this day fact and a question, the same for everyone.", slug: "discover", ic: "#i-bulb", done: (k) => !!dfDays(prof())[k] },
    { n: "Play any game", d: "Any game counts. Who am I?, Badge blur, Starting XI, whatever you fancy.", slug: "games", ic: "#i-dice", done: (k) => ((prof().days || {})[k] || 0) > 0 },
  ];
  const count = (k) => ITEMS.filter((x) => x.done(k)).length, dayKey = (off) => new Date(Date.now() - off * 864e5).toISOString().slice(0, 10);
  const streak = () => { let s = 0; for (let k = 0; k < 400; k++) { if (count(dayKey(k))) s++; else if (k > 0) break; } return s; };
  window.showDaily = function (ev) {
    S.code = null; S.mode = null; S.cur = null; setTheme("HOME", ev); ["#home", "#lobby", "#league", "#profilePage", "#albumPage", "#adminPage", "#aboutPage", "#setPage"].forEach((s) => { const e = $(s); if (e) e.hidden = true; });
    const el = $("#discPage"); el.hidden = false; window.scrollTo(0, 0); const k = dayKey(0), n = count(k), st_ = streak(); if (n === 3 && !store.items["dsay_" + k]) { lockIn("dsay_" + k, 1); Voice.say("All three dailies done"); }
    const dots = Array.from({ length: 14 }, (_, i) => { const d = dayKey(13 - i), c = count(d); return `<i class="dhd ${c >= 3 ? "full" : c ? "some" : ""} ${d === k ? "today" : ""}" title="${d}: ${c} of 3"></i>`; }).join("");
    el.innerHTML = `<nav class="crumbs"><button class="back" data-crumb="menu" type="button">← Menu</button><div class="trail"><span class="crumb cur">Daily challenges</span></div></nav>
      <div class="card abx"><div class="label">Every day</div><h2><svg class=ic><use href=#i-bulb></use></svg> Daily challenges</h2><p class="fine">Three short things, new every day. Do any one to keep your streak going.</p>
      <div class="row" style="justify-content:space-between;margin:10px 0"><div><div class="label">Streak</div><div class="dhstreak">🔥 <span class="num">${st_}</span> <small style="font-size:15px;font-weight:600">day${st_ === 1 ? "" : "s"}</small></div></div><div style="text-align:right"><div class="label">Today</div><b class="num" style="font-size:30px">${n} / 3</b></div></div><div class="row" style="gap:6px;flex-wrap:wrap">${dots}</div></div>
      <div class="hub" style="margin-top:12px">${ITEMS.map((x, i) => `<button type="button" class="gcard dhcard ${x.done(k) ? "done" : ""}" data-door="${x.slug}" style="--d:${i * 60}ms"><div class="gfaces"><span class="rkbig"><svg class=ic><use href="${x.ic}"></use></svg></span></div><div class="gname">${x.n}</div><div class="gtag">${x.d}</div><div class="grec num">${x.done(k) ? "Done today" : "Not done yet"}</div></button>`).join("")}</div>`;
  };
  const home = renderHome;
  renderHome = function () { home.apply(this, arguments); const d = $("#doors"); if (d && !d.querySelector('[data-door="daily"]')) d.insertAdjacentHTML("beforeend", `<button type="button" class="door" data-door="daily"><div class="gfaces"><span class="rkbig"><svg class=ic><use href=#i-trophy></use></svg></span></div><div class="dname">Daily challenges</div><div class="dtag">Three short things, new every day, with a streak: ${streak()} day${streak() === 1 ? "" : "s"} so far.</div></button>`); };
})();

/* ---- home screen: a bolder stats strip whose numbers count up when scrolled into view, and parallax layers that drift as you scroll ---- */
(function homeFX() {
  if (typeof renderHome !== "function") return;
  const css = document.createElement("style"); css.textContent = `
#ribbon{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;max-width:900px;margin:18px auto 0}
#ribbon span{background:var(--surface,#1c1c1c);border:1px solid var(--line,#fff2);border-radius:14px;padding:12px 10px;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);text-align:center}
#ribbon span b.num{order:-1;font-size:28px;line-height:1.1;letter-spacing:0;color:var(--accent);text-transform:none}
@media (prefers-reduced-motion:no-preference){:root:not([data-perf=low]) #photowall{transform:translate3d(0,calc(var(--sy,0)*.16px),0);will-change:transform}:root:not([data-perf=low]) #home .hero h1,:root:not([data-perf=low]) #home .lhead h1{transform:translate3d(0,calc(var(--sy,0)*.07px),0)}:root:not([data-perf=low]) #tfx{transform:translate3d(0,calc(var(--sy,0)*-.06px),0)}}`;
  document.head.appendChild(css);
  let tick = false; addEventListener("scroll", () => { if (tick) return; tick = true; requestAnimationFrame(() => { document.documentElement.style.setProperty("--sy", Math.min(scrollY, 800)); tick = false; }); }, { passive: true });
  const run = (el) => { const m = /^(\D*)([\d,]*\.?\d+)(\D*)$/.exec(el.textContent.trim()); if (!m) return; const end = parseFloat(m[2].replace(/,/g, "")), dec = (m[2].split(".")[1] || "").length, comma = m[2].includes(","), t0 = performance.now(), fmt = (v) => (comma ? v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec));
    const step = (now) => { const k = Math.min(1, (now - t0) / 1100), e = 1 - Math.pow(1 - k, 3); el.textContent = m[1] + fmt(end * e) + m[3]; if (k < 1) requestAnimationFrame(step); }; el.textContent = m[1] + fmt(0) + m[3]; requestAnimationFrame(step); };
  const old = renderHome;
  renderHome = function () {
    old.apply(this, arguments); const r = document.getElementById("ribbon"); if (!r || matchMedia("(prefers-reduced-motion:reduce)").matches || document.documentElement.getAttribute("data-perf") === "low") return;
    const io = new IntersectionObserver((es) => { es.forEach((x) => { if (x.isIntersecting) { io.disconnect(); r.querySelectorAll("b.num").forEach(run); } }); }, { threshold: 0.4 }); io.observe(r);
  };
})();

/* ---- football: shorter how-to cards, and icons next to headings and card titles ---- */
(function footballPolish() {
  if (typeof NBH_DIFF !== "undefined" || typeof HOWTO === "undefined") return;
  Object.assign(HOWTO, {
    "g:iconic": ["Who did it", ["What you do", "A famous match and its goals and red cards by minute. Name the player for each."], ["Scoring", "100 a right answer, minus 15 per wrong guess and 30 per hint."], ["Good to know", "Matches with own goals or shoot-outs are left out."]],
    "g:xi": ["Starting XI", ["What you do", "A big match and one of its teams. Type the surnames of the eleven who started."], ["Clues", "Easy shows first letters and shirt numbers, Hard only positions. A hint costs 30 points."], ["Scoring", "100 per player, a time bonus for a perfect XI, minus 20 per wrong guess."]],
    "g:scramble": ["Scramble", ["What you do", "A club, player or manager with the letters shuffled. Buzz in and type the real name."], ["Hints", "Press Hint when you want one. In a duel it appears once both players ask. Each takes off a few points."], ["Two players", "A wrong answer costs 150 and locks you out of that round."]],
    "g:who": ["Who am I?", ["What you do", "A mystery player. Clues go from hard to easy. Buzz in, type the name, press Enter. Small typos are fine."], ["Scoring", "Up to 1,000, falling as clues appear. A wrong guess costs 150."], ["Tip", "New here? Pick Easy: it only asks about superstars."]],
    "g:call": ["Call it", ["What you do", "Pick the result of a real past match before you see it: Home, Draw or Away. You can guess the score too."], ["Scoring", "1 point for the result, 2 more for the exact score. The model picks too."], ["Good to know", "Draws happen about 26 in 100 matches, so a draw is never a silly pick."]],
    "g:table": ["Guess the table", ["What you do", "Rebuild the final table. Start from last season's and drag clubs up or down."], ["Scoring", "The closer to the real table, the better. The model builds one too."], ["Tip", "Last year's table is a strong guess. Change only what you are sure about."]],
    "ranked": ["Ranked", ["What it is", "Play real people online. Create a lobby or join one."], ["Public or private", "Public lobbies change your rating. A private code lobby for friends never does."], ["Rating", "Everyone starts at 1,000 Elo. Ranks run from Bronze to Legend."]],
    "g:bracket": ["Bracket buster", ["What you do", "A real Champions League knockout. Pick who goes through in each tie, round by round."], ["The model", "A plain Elo rating picks the higher-rated club."], ["Scoring", "Round of 16 is 1 point, quarters 2, semis 3, the final 4."]],
    "g:upset": ["Spot the upset", ["What you do", "Five real results. Pick the one the model thought least likely."], ["Scoring", "A point for each upset you spot."]],
    "g:finish": ["Where did they finish?", ["What you do", "A club and a season. Slide to where it finished in the table."], ["Scoring", "Closer scores more. Solo, your run continues while you stay within a few places."], ["Two players", "Each slide in turn. Closest wins the round."]],
    "live": ["Live predictions", ["What you do", "Pick Home, Draw or Away for upcoming matches. You can change it until kickoff."], ["Scoring", "One point per right result. The model's score is pinned on the leaderboard."]],
    "g:value": ["Market value", ["What it is", "Transfermarkt's estimate of what a player or squad is worth."], ["Solo", "Pick the one worth more and keep the streak alive."], ["Two players", "Each type a value in millions of euros. Closest wins."]],
  });
  const MAP = [[/ranked|leader|board|rank/i, "rank"], [/daily|streak/i, "calendar"], [/discover/i, "compass"], [/about/i, "bulb"], [/model|lab/i, "chart"], [/name it|scramble/i, "brain"], [/who am|player|who did/i, "user"], [/club|team|badge/i, "shield"], [/career|path/i, "trend"], [/table|finish/i, "chart"], [/value|market/i, "star"], [/xi|recall|lineup/i, "users"], [/roulette/i, "dice"], [/tic/i, "cross"], [/higher|lower/i, "trend"], [/upset/i, "flame"], [/bracket|final/i, "finals"], [/rapid/i, "timer"], [/call|match|predict/i, "target"], [/game|play/i, "games"], [/setting/i, "gear"], [/profile/i, "user"], [/achiev/i, "medal"], [/album|collect/i, "album"]];
  let queued = false;
  const iconize = () => { queued = false; document.querySelectorAll("h2:not([data-ic]), .gname:not([data-ic]), .dname:not([data-ic])").forEach((el) => { el.setAttribute("data-ic", "1"); if (el.querySelector("svg")) return; const t = el.textContent || "", m = MAP.find((x) => x[0].test(t)); if (m) el.insertAdjacentHTML("afterbegin", `<svg class="ic" aria-hidden="true"><use href="#i-${m[1]}"></use></svg> `); }); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(iconize); } }).observe(document.body, { childList: true, subtree: true }); iconize();
})();

/* ---- football: automatic lite mode, like basketball. If the page runs under 30 frames a second while you are looking at it, the heavy effects switch off. ---- */
(function footballLite() {
  if (typeof NBH_DIFF !== "undefined") return; const root = document.documentElement;
  const css = document.createElement("style"); css.textContent = `:root[data-perf=low] .stadium,:root[data-perf=low] #fx,:root[data-perf=low] .photowall,:root[data-perf=low] body::before{display:none!important}:root[data-perf=low] *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;backdrop-filter:none!important}`; document.head.appendChild(css);
  try { const q = new URLSearchParams(location.search).get("lite"); if (q === "1") localStorage.setItem("bk_perf", "low"); if (q === "0") localStorage.removeItem("bk_perf"); if (localStorage.getItem("bk_perf") === "low") { root.setAttribute("data-perf", "low"); return; } } catch (e) { /* storage blocked */ }
  let n = 0, t0 = 0, aborted = false; const vis = () => { if (document.hidden) aborted = true; }; document.addEventListener("visibilitychange", vis);
  const f = (t) => { n++; if (aborted) return; if (!t0) t0 = t; if (t - t0 < 2500) requestAnimationFrame(f); else { document.removeEventListener("visibilitychange", vis); const fps = n * 1000 / (t - t0); if (fps < 30 && !document.hidden) { root.setAttribute("data-perf", "low"); try { localStorage.setItem("bk_perf", "low"); } catch (e) { /* storage blocked */ } try { toast("<b>Lite mode on</b><br>This device looked slow, so I switched off the heavy effects. Add ?lite=0 to the address to turn them back on."); } catch (e) { /* no toast */ } } } };
  setTimeout(() => { if (!document.hidden) requestAnimationFrame(f); else aborted = true; }, 4000);
})();

renderLobby(); paintSound(); recordLogin(); applyLang(curLang()); Board.init(); Account.load(); paintProfileBtn(); if (Account.signedIn) { Account.pull().then(() => ensureNick()); Ranked.refresh(); checkAdmin(); } initStore().then(() => { paintProfileBtn(); paintScore(); });
 route(); setTimeout(finishSplash, 300);

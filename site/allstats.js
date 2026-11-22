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
    return `<div class="card asCard"><h3>Across every sport</h3><div class="asW">${ball(fb, "Football", "fb", "public")}${ball(bb, "Basketball", "bb", "nba")}${chessBox}</div><div class="fine" style="margin-top:8px">From this browser's saved progress; ranked Elo comes from your account.</div></div>`;
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
    let r = null; try { const t = Account.signedIn ? await Account.token() : null; const x = await fetch(`${Board.cfg.url}/rest/v1/rpc/player_card`, { method: "POST", headers: t ? Account.hdr(t) : Board.headers(), body: JSON.stringify({ p_nick: nick }) }); r = x.status === 404 ? "missing" : x.ok ? (await x.json())[0] : null; } catch (e) { r = null; }
    const box = document.querySelector(".pcBox"); if (!box) return;
    if (r === "missing") { box.innerHTML = `<h2>${esc(nick)}</h2><p class="fine">Player cards need the latest database update (online/schema_v14.sql).</p><div class="row"><button class="btn ghost" id="modalClose" type="button">Close</button></div>`; return; }
    if (!r) { box.innerHTML = `<h2>${esc(nick)}</h2><p class="fine">Couldn't load this player. Try again in a moment.</p><div class="row"><button class="btn ghost" id="modalClose" type="button">Close</button></div>`; return; }
    const on = r.last_seen && Date.now() - new Date(r.last_seen) < 180000, form = (r.form || []).slice(-10);
    box.innerHTML = `<div class="pcTop"><div class="pcAv ${on ? "on" : ""}">${avatarHTML(r.avatar, "xl", r.nick)}</div><div><h2>${esc(r.nick)}${badgesHTML(r.badges)}</h2><div class="fine">${on ? '<span class="pcDot"></span>Online now' : r.last_seen ? "Last seen " + new Date(r.last_seen).toLocaleDateString() : ""}</div><div class="pcRank">${rankTag(r.elo)} <b class="num">${r.elo}</b> Elo · ${esc(rankOf(r.elo).name)}</div></div></div>
      <div class="asG">${AllStats.tile(r.games, "ranked games")}${AllStats.tile(AllStats.pct(r.wins, r.games), "won")}${AllStats.tile(r.season_pts != null ? r.season_pts : "–", "season points")}${AllStats.tile(r.season_place ? ord(r.season_place) : "–", "this season")}</div>
      ${form.length ? `<div class="pcForm"><span class="fine">Last ${form.length}</span>${form.map((d) => `<i class="${d > 0 ? "w" : d < 0 ? "l" : "d"}" title="${d > 0 ? "+" : ""}${d}">${d > 0 ? "W" : d < 0 ? "L" : "D"}</i>`).join("")}</div>` : ""}
      ${r.fav_player || r.fav_team ? `<div class="fine" style="margin-top:8px">${r.fav_player ? "Favourite player: <b>" + esc(r.fav_player) + "</b>" : ""}${r.fav_player && r.fav_team ? " · " : ""}${r.fav_team ? "Supports <b>" + esc(r.fav_team) + "</b>" : ""}</div>` : ""}
      <div class="row" style="margin-top:14px">${r.nick !== prof().nick && Account.signedIn ? `<button class="btn" data-pcadd="${esc(r.nick)}" type="button">Add friend</button>` : ""}<button class="btn ghost" id="modalClose" type="button">Close</button></div>`;
  },
};
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
[data-pc]{cursor:pointer}[data-pc]:hover{filter:brightness(1.08)}
@media (max-width:640px){.asW{grid-template-columns:1fr}.pcBox .asG{grid-template-columns:repeat(2,1fr)}}`; document.head.appendChild(s); })();

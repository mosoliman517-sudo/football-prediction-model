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
    if (!rows.length) { b.innerHTML = emptyState(SN_CUP("champ"), "The season has just started", "Nobody has played a ranked match this month yet. Win the first one and you're top of the table."); return; }
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

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

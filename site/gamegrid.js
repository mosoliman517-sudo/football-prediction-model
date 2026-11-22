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

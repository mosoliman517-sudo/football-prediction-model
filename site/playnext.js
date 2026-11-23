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

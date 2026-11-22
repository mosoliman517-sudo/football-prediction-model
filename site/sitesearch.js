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

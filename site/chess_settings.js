/* ---------- Settings and your profile, as in football and basketball: a gear and a face in the top bar ----------
   Every choice is a row of cards to swipe or tap. The profile shows only what chess really keeps: your nickname and account,
   your best score in each game, your record against the characters and your daily streak. */
const CS = {
  get: (k, d) => { try { return localStorage.getItem("bkc_" + k) || d; } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem("bkc_" + k, v); } catch (e) { /* blocked */ } },
  apply() {
    const d = document.documentElement;
    if (CS.get("contrast", "0") === "1") d.setAttribute("data-contrast", "high"); else d.removeAttribute("data-contrast");
    if (CS.get("motion", "") === "reduced") d.setAttribute("data-motion", "reduced"); else d.removeAttribute("data-motion");
    d.style.setProperty("--zoom", { s: 0.92, m: 1, l: 1.1, xl: 1.2 }[CS.get("text", "m")] || 1);
  },
};
CS.apply();
const uxRow = (id, cards) => `<div class="uxrow" data-uxrow="${id}"><button type="button" class="uxarrow" data-uxgo="-1" aria-label="Previous">‹</button><div class="uxtrack">${cards.join("")}</div><button type="button" class="uxarrow" data-uxgo="1" aria-label="Next">›</button></div>`;
const uxCard = (key, val, on, body) => `<div class="uxcard ${on ? "on" : ""}" role="button" tabindex="0" aria-pressed="${on}" data-ux="${key}|${val}">${body}</div>`;
const uxChips = (key, items, cur) => `<div class="chips">${items.map(([v, n]) => `<button type="button" class="chip ${cur === v ? "on" : ""}" aria-pressed="${cur === v}" data-ux="${key}|${v}">${n}</button>`).join("")}</div>`;
function uxPage(kind) { clearInterval(st.timer); live = null; rvStop(); st = { game: kind }; fresh(); window.scrollTo(0, 0); }

function settingsPage() {
  uxPage("settings");
  const look = lookNow(), coach = coachId(), text = CS.get("text", "m"), mode = CS.get("coach_hide", "0") === "1" ? "off" : PIPV.on ? "on" : "quiet";
  const lookArt = { auto: ["#0a0f1f", "#fffdf8", "#e8c35a"], cyber: ["#0a0f1f", "#3ef2ff", "#141b33"], classic: ["#0e1411", "#e8c35a", "#16201b"], light: ["#f2efe7", "#9a6200", "#fffdf8"] };
  const lookNote = { auto: "Switches with your device", cyber: "Neon glow on a dark board", classic: "Gold and deep green", light: "Warm paper and ink" };
  const looks = LOOKS.map(([k, n]) => uxCard("look", k, look === k, `<span class="uxlook" style="--a:${lookArt[k][0]};--b:${lookArt[k][1]};--c:${lookArt[k][2]}"><i></i><i></i><i></i></span><b>${n}</b><small>${lookNote[k]}</small>`));
  const coaches = Object.entries(COACHES).map(([k, c]) => uxCard("coach", k, coach === k, `<span class="uxface">${oppFace(k, "happy")}</span><b>${esc(c.name)}</b><small>${esc(c.blurb)}</small><button type="button" class="btn ghost uxhear" data-uxhear="${k}">▶ Hear</button>`));
  const texts = [["s", "Small", 13], ["m", "Normal", 16], ["l", "Large", 19], ["xl", "Extra large", 23]].map(([k, n, px]) => uxCard("text", k, text === k, `<span class="uxtext" style="font-size:${px}px">Mate in two?</span><b>${n}</b>`));
  const slider = (id, l, v) => `<label class="uxslide">${l}<input type="range" id="${id}" min="0" max="100" value="${Math.round(v * 100)}"><span id="${id}V">${Math.round(v * 100)}%</span></label>`;
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="home">← Menu</button></div><div class="card uxpage"><h2>${ic("bolt")}Settings</h2>
    <h3>Your look</h3>${uxRow("look", looks)}
    <h3>Your coach</h3><p class="fine">They sit in the corner, narrate and review your games. In a game against a character they step away.</p>${uxRow("coach", coaches)}<p class="fine">Coach</p>${uxChips("mode", [["on", "Talks"], ["quiet", "Bubbles only"], ["off", "Hidden"]], mode)}
    <h3>Text size</h3>${uxRow("text", texts)}
    <h3>Display</h3><div class="chips"><button type="button" class="chip ${CS.get("contrast", "0") === "1" ? "on" : ""}" data-ux="contrast|flip" aria-pressed="${CS.get("contrast", "0") === "1"}">High contrast</button><button type="button" class="chip ${CS.get("motion", "") === "reduced" ? "on" : ""}" data-ux="motion|flip" aria-pressed="${CS.get("motion", "") === "reduced"}">Less motion</button></div>
    <h3>Sound</h3><div class="row"><button class="chip ${Snd.on ? "on" : ""}" data-snd="1" type="button">Sound ${Snd.on ? "on" : "off"}</button><button class="chip ${Snd.mus ? "on" : ""}" data-mus="1" type="button">Music ${Snd.mus ? "on" : "off"}</button><button class="chip ${Mix.say ? "on" : ""}" data-say="1" type="button">Voice ${Mix.say ? "on" : "off"}</button></div>${slider("mxFx", "Effects", Mix.fx)}${slider("mxMus", "Music", Mix.music)}${slider("mxVoice", "Voice", Mix.voice)}
    <h3>Account</h3>${uxAccount()}</div>`;
  $("#app").querySelectorAll(".uxcard.on").forEach((c) => { const t = c.parentElement; t.scrollLeft = c.offsetLeft - (t.clientWidth - c.clientWidth) / 2; });
}

function uxAccount() {
  if (!Cloud.on) return `<p class="fine">Accounts are not switched on for this copy of the site, so your progress stays in this browser.</p>`;
  if (Cloud.signedIn) return `<p>Signed in as <b>${esc(Cloud.session.user.email)}</b>${Cloud.nick ? `, playing as <b>${esc(Cloud.nick)}</b>` : ""}.</p><div class="row"><button type="button" class="btn" data-uxacct="in">Change nickname</button><button type="button" class="btn ghost" data-cm="out">Sign out</button></div>`;
  return `<p class="fine">You are playing as a guest, so your progress stays in this browser. One free account works for football, basketball and chess, keeps your bests and puts you on the leaderboards.</p><div class="row"><button type="button" class="btn" data-uxacct="in">Sign in</button><button type="button" class="btn ghost" data-uxacct="up">Create account</button></div>`;
}

function myPage() {
  uxPage("me");
  const rec = store.get("ai_rec", { w: 0, d: 0, l: 0 }), streak = dStreak(), played = rec.w + rec.d + rec.l;
  const bests = BOARDS.map(([k, n, unit]) => [n, bestOf(k), unit]).filter((x) => x[1] > 0);
  $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-go="home">← Menu</button></div><div class="card uxpage">
    <div class="uxhead"><span class="uxface">${oppFace(coachId(), "happy")}</span><div><h2>${esc(Cloud.signedIn ? Cloud.nick || "Your account" : "Guest")}</h2><p class="fine">Your chess profile. Football and basketball keep their own.</p></div><button type="button" class="btn ghost" data-uxopen="settings">Settings</button></div>
    <div class="tiles"><div class="tile"><small>Against the characters</small><b>${rec.w}-${rec.d}-${rec.l}</b><span class="fine">${played ? "won, drawn, lost" : "no games finished yet"}</span></div><div class="tile"><small>Daily streak</small><b>${streak}</b><span class="fine">${streak === 1 ? "day" : "days"}</span></div><div class="tile"><small>Games with a best score</small><b>${bests.length}</b><span class="fine">of ${BOARDS.length}</span></div></div>
    <h3>Your best scores</h3>${bests.length ? `<table class="tb"><tbody>${bests.map(([n, v, u]) => `<tr><td>${esc(n)}</td><td><b>${v}</b> <span class="fine">${esc(u)}</span></td></tr>`).join("")}</tbody></table>` : `<p class="fine">Nothing yet. Finish a game and your best score shows here.</p>`}
    <div class="row"><button type="button" class="btn ghost" data-go="board">${ic("trophy")}Leaderboards</button></div>
    <h3>Account</h3>${uxAccount()}</div>`;
}

function uxPick(key, v) {
  if (key === "look") { try { localStorage.setItem("bkc_look", v); } catch (e) { /* blocked */ } document.documentElement.setAttribute("data-theme", lookResolve(v)); thPaint(); if (Cloud.signedIn) Cloud.push(); }
  if (key === "coach") { CS.set("coach", v); if (PIPV.on) pipSay(pipPick("start", 0)); }
  if (key === "mode") { CS.set("coach_hide", v === "off" ? "1" : "0"); PIPV.on = v === "on"; try { localStorage.setItem("bk_pip_voice", PIPV.on ? "1" : "0"); } catch (e) { /* blocked */ } if (v !== "on") AIVoice.stop(); }
  if (key === "text") CS.set("text", v);
  if (key === "contrast") CS.set("contrast", CS.get("contrast", "0") === "1" ? "0" : "1");
  if (key === "motion") CS.set("motion", CS.get("motion", "") === "reduced" ? "full" : "reduced");
  CS.apply();
}
document.addEventListener("click", (e) => {
  const q = (s) => e.target.closest && e.target.closest(s);
  if (q("#setBtn")) return settingsPage();
  if (q("#meBtn")) return myPage();
  if (q("[data-uxopen]")) return settingsPage();
  const a = q("[data-uxacct]"); if (a) return acctModal(a.dataset.uxacct);
  const h = q("[data-uxhear]"); if (h) { e.stopPropagation(); const k = h.dataset.uxhear, line = (COACH_LINES[k] && COACH_LINES[k].start && COACH_LINES[k].start[0]) || PIP.start[0]; AIVoice.play(line, { voice: COACHES[k].voice, volume: Mix.voice }); return; }
  const go = q("[data-uxgo]"); if (go) { const t = go.parentElement.querySelector(".uxtrack"), card = t.firstElementChild; t.scrollBy({ left: +go.dataset.uxgo * (card.offsetWidth + 12), behavior: "smooth" }); return; }
  const c = q("[data-ux]"); if (!c) return;
  const [key, v] = c.dataset.ux.split("|"), top = window.scrollY; uxPick(key, v); settingsPage(); window.scrollTo(0, top); try { Snd.tick(); } catch (er) { /* quiet */ }
});
document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("uxcard")) { e.preventDefault(); e.target.click(); } });
/* after signing in or out from one of these pages, show the new state */
{ const _acct = acctPaint; acctPaint = function () { _acct.apply(this, arguments); setTimeout(() => { if (typeof st !== "undefined" && st.game === "me") myPage(); else if (typeof st !== "undefined" && st.game === "settings") settingsPage(); }, 0); }; }
(() => {
  const bar = document.getElementById("acctBtn"), th = document.getElementById("thBtn");
  if (bar) bar.insertAdjacentHTML("beforebegin", `<button class="pill" id="setBtn" type="button" title="Settings: look, coach, text size, sound" aria-label="Settings">${ic("gear") }<span class="uxlab">Settings</span></button>`);
  if (bar) bar.insertAdjacentHTML("afterend", `<button class="pill" id="meBtn" type="button" title="Your profile and best scores" aria-label="Your profile">${ic("user")}<span class="uxlab">Profile</span></button>`);
  if (th) th.hidden = true;   /* the looks now live in Settings */
  const s = document.createElement("style"); s.textContent = `
#app{zoom:var(--zoom,1)}
:root[data-contrast="high"]{--muted:color-mix(in srgb,var(--ink) 85%,var(--bg))!important;--line:color-mix(in srgb,var(--ink) 55%,transparent)!important}:root[data-contrast="high"] .card,:root[data-contrast="high"] .chip,:root[data-contrast="high"] .btn.ghost{border-width:2px}
:root[data-motion="reduced"] *,:root[data-motion="reduced"] *::before,:root[data-motion="reduced"] *::after{animation-duration:.001s!important;animation-iteration-count:1!important;transition-duration:.001s!important;scroll-behavior:auto!important}
#thBtn[hidden]{display:none}#setBtn,#meBtn{display:inline-flex;align-items:center;gap:6px}@media (max-width:1000px){.uxlab{display:none}}
.uxpage{min-width:0}.uxpage h3{margin:18px 0 4px}
.uxrow{display:flex;align-items:center;gap:6px;min-width:0}.uxtrack{flex:1;min-width:0;display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x proximity;padding:8px 2px 12px;scrollbar-width:none;position:relative}.uxtrack::-webkit-scrollbar{display:none}
.uxarrow{flex:none;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:var(--panel2);color:var(--ink);font:700 20px/1 inherit;cursor:pointer}
.uxcard{flex:0 0 clamp(170px,56vw,220px);scroll-snap-align:center;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:14px 12px;border-radius:18px;border:2px solid var(--line);background:var(--panel2);cursor:pointer;opacity:.75;transition:opacity .2s,border-color .2s,transform .2s}.uxcard:hover{opacity:1;transform:translateY(-2px)}.uxcard.on{opacity:1;border-color:var(--gold);box-shadow:0 10px 30px -14px var(--gold)}.uxcard small{color:var(--muted);line-height:1.35}
.uxlook{display:block;position:relative;width:100%;height:96px;border-radius:12px;background:var(--a);overflow:hidden}.uxlook i{position:absolute;border-radius:6px}.uxlook i:nth-child(1){left:10%;top:18%;width:34%;height:64%;background:var(--c)}.uxlook i:nth-child(2){left:52%;top:30%;width:36%;height:10px;background:var(--b)}.uxlook i:nth-child(3){left:52%;top:54%;width:24%;height:10px;background:var(--b);opacity:.6}
.uxface{display:flex;align-items:center;justify-content:center;width:96px;height:96px;flex:none}.uxface svg{width:100%!important;height:100%!important}
.uxtext{display:flex;align-items:center;justify-content:center;min-height:70px;font-weight:700}
.uxslide{display:grid;grid-template-columns:70px minmax(0,1fr) 44px;gap:8px;align-items:center;margin:6px 0;max-width:420px}
.uxhead{display:flex;gap:14px;align-items:center;flex-wrap:wrap}.uxhead div{flex:1;min-width:150px}.uxhead h2{margin:0}`; document.head.appendChild(s);
  if (location.hash === "#settings") setTimeout(settingsPage, 400);
  if (location.hash === "#profile") setTimeout(myPage, 400);
})();

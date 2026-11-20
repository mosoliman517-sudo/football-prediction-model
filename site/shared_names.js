/* ===== two players on one device can type their own names (shared by football and basketball) ===== */
const PN = ["Player 1", "Player 2"];
try { PN[0] = localStorage.getItem("bk_pn1") || PN[0]; PN[1] = localStorage.getItem("bk_pn2") || PN[1]; } catch (e) { /* storage blocked */ }
function nameFix(node) { if (PN[0] === "Player 1" && PN[1] === "Player 2") return; if (node.nodeType === 3) { if (/Player [12]/.test(node.data)) node.data = node.data.replace(/Player 1/g, PN[0]).replace(/Player 2/g, PN[1]); return; } if (node.nodeType !== 1 || /SCRIPT|STYLE|INPUT|TEXTAREA/.test(node.tagName)) return; const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (/Player [12]/.test(n.data)) n.data = n.data.replace(/Player 1/g, PN[0]).replace(/Player 2/g, PN[1]); }
new MutationObserver((ms) => { ms.forEach((m) => { if (m.type === "characterData") nameFix(m.target); else m.addedNodes.forEach(nameFix); }); }).observe(document.body, { childList: true, subtree: true, characterData: true });
function askNames(then) {
  const old = document.getElementById("pnAsk"); if (old) old.remove(); let me = ""; try { me = (typeof prof === "function" && prof().nick) || ""; } catch (e) { /* no profile */ }
  const d = document.createElement("div"); d.id = "pnAsk"; d.setAttribute("style", "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:16px");
  const v1 = PN[0] !== "Player 1" ? PN[0] : me, v2 = PN[1] !== "Player 2" ? PN[1] : "";
  d.innerHTML = `<div class="card" style="max-width:420px;width:100%"><h2 style="font-size:26px;margin-bottom:6px">Who is playing?</h2><p class="sub" style="margin-bottom:12px">Type your names so the scores say who is who. You can leave them blank.</p><div style="display:grid;gap:10px"><label class="fine">Player 1 (A key)<input id="pn1" maxlength="14" autocomplete="off" value="${esc(v1)}" placeholder="Player 1" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface2);color:var(--ink);font:inherit"></label><label class="fine">Player 2 (L key)<input id="pn2" maxlength="14" autocomplete="off" value="${esc(v2)}" placeholder="Player 2" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface2);color:var(--ink);font:inherit"></label></div><div class="row" style="margin-top:14px"><button class="btn" id="pnGo" type="button">Start</button><button class="btn ghost" id="pnX" type="button">Cancel</button></div></div>`;
  document.body.appendChild(d); const i1 = d.querySelector("#pn1"); i1.focus(); i1.select();
  const go = () => { const a = d.querySelector("#pn1").value.trim().replace(/[<>]/g, ""), b = d.querySelector("#pn2").value.trim().replace(/[<>]/g, ""); PN[0] = a || "Player 1"; PN[1] = b && b !== a ? b : a ? "Player 2" : "Player 2"; if (PN[1] === PN[0]) PN[1] = "Player 2"; try { localStorage.setItem("bk_pn1", PN[0]); localStorage.setItem("bk_pn2", PN[1]); } catch (e) { /* ok */ } d.remove(); then(); setTimeout(() => nameFix(document.body), 0); };
  d.addEventListener("click", (e) => { if (e.target.id === "pnGo") go(); else if (e.target.id === "pnX" || e.target === d) d.remove(); }); d.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); else if (e.key === "Escape") d.remove(); e.stopPropagation(); });
}
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button.mode"); if (!b || b.dataset.named || !/one device/i.test(b.textContent)) return; e.stopPropagation(); e.preventDefault(); askNames(() => { b.dataset.named = "1"; b.click(); delete b.dataset.named; }); }, true);
nameFix(document.body);

/* ===== audio mixer and announcer voice (football and basketball) ===== */
const Mix = { fx: 1, music: 1, voice: 0.9, say: false };
try { Object.assign(Mix, JSON.parse(localStorage.getItem("bk_mix") || "{}")); } catch (e) { /* storage blocked */ }
function applyMix() { window.MIXFX = Mix.fx; window.MIXMUS = Mix.music; try { Snd.remix(); } catch (e) { /* audio not started */ } try { localStorage.setItem("bk_mix", JSON.stringify(Mix)); } catch (e) { /* storage blocked */ } }
applyMix();
const Voice = { say(text) { if (!Mix.say || !window.speechSynthesis || Snd.level === 0) return; try { const u = new SpeechSynthesisUtterance(text), vs = speechSynthesis.getVoices(); u.volume = Mix.voice; u.rate = 1.04; const v = vs.find((x) => /^en/i.test(x.lang) && /Samantha|Google US|Daniel|Natural|Aria|Alex/i.test(x.name)) || vs.find((x) => /^en/i.test(x.lang)); if (v) u.voice = v; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* no voice */ } } };
{ const pick = (a) => a[Math.floor(Math.random() * a.length)], win0 = Snd.win, right0 = Snd.right;
  Snd.win = function () { win0.apply(Snd, arguments); Voice.say(pick(["Winner!", "Brilliant!", "Nice one!", "What a finish!"])); };
  Snd.right = function () { right0.apply(Snd, arguments); try { const n = Q && Q.s && Q.s.streak; if (n >= 3 && n % 3 === 0) Voice.say("Streak of " + n); } catch (e) { /* no quiz */ } };
  const toast0 = toast; toast = function (html, kind) { try { const txt = String(html).replace(/<[^>]*>/g, " "); if (/Rank up/i.test(txt)) Voice.say(txt.replace(/\s+/g, " ").trim()); else if (/Secret found/i.test(txt)) Voice.say("Secret found. The Notebook."); } catch (e) { /* ok */ } return toast0.apply(this, arguments); };
}
{ const rs0 = renderSettings;
  renderSettings = function () { rs0(); const el = $("#setPage"); if (!el || document.getElementById("mixCard")) return; const sl = (id, label, v) => `<label class="fine" style="display:grid;grid-template-columns:96px 1fr 40px;gap:10px;align-items:center;margin:8px 0">${label}<input type="range" id="${id}" min="0" max="100" value="${Math.round(v * 100)}" style="width:100%"><span class="num" id="${id}V">${Math.round(v * 100)}%</span></label>`;
    el.insertAdjacentHTML("beforeend", `<div class="card" id="mixCard"><h3>Audio mixer</h3><p class="fine">Set effects, music and voice separately. Everything is made live in your browser, nothing is downloaded.</p>${sl("mixFx", "Effects", Mix.fx)}${sl("mixMus", "Music", Mix.music)}${sl("mixVoice", "Voice", Mix.voice)}<div class="row" style="margin-top:6px"><button class="chip" id="mixSay" type="button" aria-pressed="${Mix.say}">Announcer voice: ${Mix.say ? "On" : "Off"}</button><button class="chip" id="mixTest" type="button">Test sound</button></div></div>`); };
  document.addEventListener("input", (e) => { const m = { mixFx: "fx", mixMus: "music", mixVoice: "voice" }[e.target.id]; if (!m) return; Mix[m] = e.target.value / 100; const l = document.getElementById(e.target.id + "V"); if (l) l.textContent = e.target.value + "%"; applyMix(); });
  document.addEventListener("click", (e) => { if (e.target.id === "mixSay") { Mix.say = !Mix.say; applyMix(); e.target.setAttribute("aria-pressed", Mix.say); e.target.textContent = "Announcer voice: " + (Mix.say ? "On" : "Off"); if (Mix.say) Voice.say("Game on"); } else if (e.target.id === "mixTest") { Snd.right(); setTimeout(() => Snd.win(), 500); } });
}

/* ---- games that share a core are merged into one card with several versions (football and basketball) ---- */
(function () {
  if (typeof QUIZ_GAMES === "undefined" || typeof renderRoom !== "function") return;
  const nba = QUIZ_GAMES.some((g) => g.id === "dropped");
  const GROUPS = nba ? [
    { lead: "who", name: "Name it", tag: "Six ways to name a mystery: player clues, a career path, team stats, a real stat line, a blurred logo or scrambled letters.", vers: [["who", "Player clues"], ["career", "Career path"], ["club", "Team stats"], ["dropped", "Stat line"], ["blur", "Logo blur"], ["scramble", "Scramble"]] },
  ] : [
    { lead: "who", name: "Name it", tag: "Five ways to name a mystery: player clues, a career path, club stats, a blurred badge or scrambled letters.", vers: [["who", "Player clues"], ["career", "Career path"], ["club", "Club stats"], ["blur", "Badge blur"], ["scramble", "Scramble"]] },
    { lead: "xi", name: "Match recall", tag: "Name the eleven who started a big final, or the scorers, assisters and red cards of a classic match.", vers: [["xi", "Starting XI"], ["iconic", "Who did it"]] },
  ];
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
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
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
    { n: "Play any game", d: "Any game counts. Name it, Match recall, Higher or lower, whatever you fancy.", slug: "games", ic: "#i-dice", done: (k) => ((prof().days || {})[k] || 0) > 0 },
  ];
  const count = (k) => ITEMS.filter((x) => x.done(k)).length, dayKey = (off) => new Date(Date.now() - off * 864e5).toISOString().slice(0, 10);
  const streak = () => { let s = 0; for (let k = 0; k < 400; k++) { if (count(dayKey(k))) s++; else if (k > 0) break; } return s; };
  window.showDaily = function (ev) {
    S.code = null; S.mode = null; S.cur = null; setTheme("HOME", ev); ["#home", "#lobby", "#league", "#profilePage", "#albumPage", "#adminPage", "#aboutPage", "#setPage"].forEach((s) => { const e = $(s); if (e) e.hidden = true; });
    const el = $("#discPage"); el.hidden = false; window.scrollTo(0, 0); const k = dayKey(0), n = count(k), st_ = streak();
    const dots = Array.from({ length: 14 }, (_, i) => { const d = dayKey(13 - i), c = count(d); return `<i class="dhd ${c >= 3 ? "full" : c ? "some" : ""} ${d === k ? "today" : ""}" title="${d}: ${c} of 3"></i>`; }).join("");
    el.innerHTML = `<nav class="crumbs"><button class="back" data-crumb="menu" type="button">← Menu</button><div class="trail"><span class="crumb cur">Daily challenges</span></div></nav>
      <div class="card abx"><div class="label">Every day</div><h2><svg class=ic><use href=#i-bulb></use></svg> Daily challenges</h2><p class="fine">Three short things, new every day. Do any one to keep your streak going.</p>
      <div class="row" style="justify-content:space-between;margin:10px 0"><div><div class="label">Streak</div><div class="dhstreak">🔥 <span class="num">${st_}</span> <small style="font-size:15px;font-weight:600">day${st_ === 1 ? "" : "s"}</small></div></div><div style="text-align:right"><div class="label">Today</div><b class="num" style="font-size:30px">${n} / 3</b></div></div><div class="row" style="gap:6px;flex-wrap:wrap">${dots}</div></div>
      <div class="hub" style="margin-top:12px">${ITEMS.map((x, i) => `<button type="button" class="gcard dhcard ${x.done(k) ? "done" : ""}" data-door="${x.slug}" style="--d:${i * 60}ms"><div class="gfaces"><span class="rkbig"><svg class=ic><use href="${x.ic}"></use></svg></span></div><div class="gname">${x.n}</div><div class="gtag">${x.d}</div><div class="grec num">${x.done(k) ? "Done today" : "Not done yet"}</div></button>`).join("")}</div>`;
  };
  const home = renderHome;
  renderHome = function () { home.apply(this, arguments); const d = $("#doors"); if (d && !d.querySelector('[data-door="daily"]')) d.insertAdjacentHTML("beforeend", `<button type="button" class="door" data-door="daily"><div class="gfaces"><span class="rkbig"><svg class=ic><use href=#i-trophy></use></svg></span></div><div class="dname">Daily challenges</div><div class="dtag">Three short things, new every day, with a streak: ${streak()} day${streak() === 1 ? "" : "s"} so far.</div></button>`); };
})();

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
    el.querySelector(".mbody").className = "mbody " + mood; el.querySelector(".mbody").innerHTML = MASCOT_SVG[id()](mood);
    el.querySelector(".mbubble").innerHTML = `<b>${m.name}</b>${opts.ctx ? `<i class="mctx">${esc(opts.ctx)}</i>` : ""}${esc(text)}`;
    el.className = "on talk k-" + kind; clearTimeout(hideT); hideT = setTimeout(hideBubble, opts.ms || Math.min(10000, 3200 + text.length * 50));
    if (mode() === "on" && !opts.silent) AIVoice.play(text, { voice: m.voice, volume: 0.95 });
  }
  function hideBubble() { const el = document.getElementById("mascot"); if (!el) return; el.className = "on"; const b = el.querySelector(".mbody"); if (b) { b.className = "mbody calm"; b.innerHTML = MASCOT_SVG[id()]("calm"); } }
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

/* Watch a friend's online match live (football and basketball; each build includes this file).
   An online game is run by the host's browser, which sends a copy of the game panel to the other player after every change. A
   spectator listens to the same room and shows that same panel, read-only: they can't click, type, buzz or pick anything.
   How you watch: the host (while a match is running) gets a small "Watch link" chip; send that link, or just the room code, and
   the other person opens it (or types the code under "Watch a match" on the Ranked page). The link looks like  #watch-ABCD.
   Rooms are not private: like every online room here, anyone who knows the 4-letter code can join as a player or a spectator, and
   the chip says so. Spectators never send answers or reactions. */
/* A game panel that arrives from another browser travels over a public relay, so anyone who knows (or listens for) a room code can
   send one. It is never trusted: it is parsed without running anything, only ordinary layout, form and drawing elements are kept,
   and every handler, script address, password box and full-screen overlay is removed before it reaches the page. */
const ROOM_TAGS = new Set("div span p b i em strong small h1 h2 h3 h4 h5 h6 button input label select option optgroup textarea table caption thead tbody tfoot tr td th ul ol li dl dt dd img br hr a section header footer article figure figcaption nav aside mark sup sub progress meter fieldset legend kbd abbr time svg path g circle ellipse rect line polyline polygon use text tspan defs lineargradient radialgradient stop clippath mask pattern title desc".split(" "));
const ROOM_URL = /^(#|https:\/\/|data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]|(\.\.?\/)?[\w-]+(\/[\w.+-]+)*\.(png|jpe?g|webp|gif|svg)$)/i;
function safeFill(room, html) {
  const t = document.createElement("template"); t.innerHTML = String(html == null ? "" : html).slice(0, 400000);   /* inside a template nothing loads or runs */
  for (const el of [...t.content.querySelectorAll("*")]) {
    const tag = el.localName.toLowerCase();
    if (!ROOM_TAGS.has(tag) || (tag === "input" && /^(password|file|image|submit)$/i.test(el.getAttribute("type") || ""))) { el.remove(); continue; }
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase(), v = a.value.trim();
      if (n.startsWith("on") || /^(srcdoc|action|formaction|autofocus|form|ping|srcset|background|poster|target|is)$/.test(n)) el.removeAttribute(a.name);
      else if (/(^|:)(href|src)$/.test(n) && !(ROOM_URL.test(v) || (tag === "a" && /^(#|https:\/\/)/i.test(v)))) el.removeAttribute(a.name);
      else if (tag === "use" && /(^|:)href$/.test(n) && !v.startsWith("#")) el.removeAttribute(a.name);
      else if (n === "style" && /position\s*:\s*(fixed|sticky)|url\s*\(|expression|\\/i.test(v)) el.removeAttribute(a.name);
    }
  }
  room.replaceChildren(t.content);
}
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
    if (m.k === "html") { const room = document.getElementById("room"); if (!room) return; if (!this.got) { this.got = true; this.bar(); } safeFill(room, m.h); room.classList.add("specro-room"); }
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

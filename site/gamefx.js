/* In-game feedback for every quiz in football and basketball (each build includes this file).
   Both sites play Snd.right() for a right answer and Snd.wrong() for a wrong one, so this wraps those two calls:
   - right: a burst of sparks from the answer you tapped, a green glow on it, and a combo counter that appears from three in a row
     (with flames from five, and a bigger burst at 5, 10, 15...);
   - wrong: the answer you tapped shakes, the screen edge flashes red, and the combo resets.
   Changing game resets the combo too. Reduced motion (the device setting or the site's) turns it all off. */
const GFX = {
  last: null, lastAt: 0, combo: 0, best: 0, where: "",
  calm() { return matchMedia("(prefers-reduced-motion: reduce)").matches || (typeof REDUCED !== "undefined" && REDUCED); },
  target() { const t = this.last; return t && t.isConnected && Date.now() - this.lastAt < 2500 ? t : null; },
  burst(el, n, big) {
    const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2 - 20, top: innerHeight / 2 - 20, width: 40, height: 40 }, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const box = document.createElement("div"); box.className = "gfxB"; box.style.left = cx + "px"; box.style.top = cy + "px";
    const cols = ["#5ee6a8", "#ffd23f", "#ffffff", "var(--accent,#f2c14e)"];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = (big ? 90 : 55) + Math.random() * (big ? 70 : 35), s = document.createElement("i"); s.style.setProperty("--x", Math.cos(a) * d + "px"); s.style.setProperty("--y", Math.sin(a) * d + "px"); s.style.background = cols[i % cols.length]; s.style.animationDelay = Math.random() * 60 + "ms"; if (big && i % 3 === 0) s.className = "st"; box.appendChild(s); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 900);
  },
  pill() {
    let p = document.getElementById("gfxCombo"); if (this.combo < 3) { if (p) { p.classList.add("out"); setTimeout(() => p && p.remove(), 300); } return; }
    if (!p) { p = document.createElement("div"); p.id = "gfxCombo"; document.body.appendChild(p); }
    p.className = this.combo >= 10 ? "hot2" : this.combo >= 5 ? "hot" : ""; p.innerHTML = `${this.combo >= 5 ? '<span class="gfxFl">🔥</span>' : ""}<b class="num">${this.combo}</b><small>in a row</small>`;
    p.style.animation = "none"; void p.offsetWidth; p.style.animation = "";
  },
  right() {
    const here = location.hash; if (here !== this.where) { this.where = here; this.combo = 0; }
    this.combo++; this.best = Math.max(this.best, this.combo); if (this.calm()) return;
    const el = this.target(), milestone = this.combo >= 5 && this.combo % 5 === 0;
    this.burst(el, milestone ? 26 : 12, milestone); if (el) { el.classList.remove("gfxOk", "gfxNo"); void el.offsetWidth; el.classList.add("gfxOk"); setTimeout(() => el.classList.remove("gfxOk"), 900); }
    this.pill();
  },
  wrong() {
    const here = location.hash; if (here !== this.where) { this.where = here; } this.combo = 0; this.pill(); if (this.calm()) return;
    const el = this.target(); if (el) { el.classList.remove("gfxOk", "gfxNo"); void el.offsetWidth; el.classList.add("gfxNo"); setTimeout(() => el.classList.remove("gfxNo"), 600); }
    const v = document.createElement("div"); v.className = "gfxV"; document.body.appendChild(v); setTimeout(() => v.remove(), 700);
  },
};
addEventListener("pointerdown", (e) => { const t = e.target.closest && e.target.closest("button, [role=button], .opt, .pick, .tile, a"); if (t) { GFX.last = t; GFX.lastAt = Date.now(); } }, true);
addEventListener("keydown", (e) => { if (e.key === "Enter") { GFX.last = document.activeElement; GFX.lastAt = Date.now(); } }, true);
addEventListener("hashchange", () => { GFX.combo = 0; GFX.pill(); });
setTimeout(() => {
  if (typeof Snd === "undefined" || Snd.__gfx) return; Snd.__gfx = true;
  const r = Snd.right, w = Snd.wrong;
  if (r) Snd.right = function () { try { GFX.right(); } catch (e) { /* visuals only */ } return r.apply(this, arguments); };
  if (w) Snd.wrong = function () { try { GFX.wrong(); } catch (e) { /* visuals only */ } return w.apply(this, arguments); };
}, 0);
(() => { const s = document.createElement("style"); s.textContent = `
.gfxB{position:fixed;z-index:9500;pointer-events:none;width:0;height:0}.gfxB i{position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;animation:gfxFly .75s cubic-bezier(.15,.8,.3,1) forwards}.gfxB i.st{width:12px;height:12px;border-radius:2px;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
@keyframes gfxFly{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--x),var(--y)) scale(.2);opacity:0}}
.gfxOk{animation:gfxOk .8s cubic-bezier(.2,1.4,.4,1)!important;box-shadow:0 0 0 3px #5ee6a8,0 0 28px -2px #5ee6a8!important}@keyframes gfxOk{30%{transform:scale(1.06)}}
.gfxNo{animation:gfxNo .5s cubic-bezier(.36,.07,.19,.97)!important;box-shadow:0 0 0 3px #ff6b6b!important}@keyframes gfxNo{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-7px)}40%,60%{transform:translateX(7px)}}
.gfxV{position:fixed;inset:0;z-index:9400;pointer-events:none;box-shadow:inset 0 0 90px 10px #ff3b3b88;animation:gfxV .65s ease-out forwards}@keyframes gfxV{from{opacity:1}to{opacity:0}}
#gfxCombo{position:fixed;z-index:9450;right:16px;top:88px;display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;background:#141b17ee;color:#fff;border:2px solid #5ee6a8;box-shadow:0 10px 26px -10px #000;animation:gfxPop .45s cubic-bezier(.2,1.6,.4,1);pointer-events:none}
#gfxCombo b{font-size:22px;line-height:1}#gfxCombo small{font-size:11px;opacity:.8;text-transform:uppercase;letter-spacing:.08em}#gfxCombo.hot{border-color:#ffb21f;box-shadow:0 0 24px -4px #ff8a3d}#gfxCombo.hot2{border-color:#ff4d4d;box-shadow:0 0 34px -2px #ff4d4d;background:linear-gradient(90deg,#3a0d0d,#141b17)}
#gfxCombo.out{opacity:0;transform:scale(.6);transition:.25s}.gfxFl{font-size:20px;display:inline-block;animation:gfxFl .5s ease-in-out infinite alternate}@keyframes gfxFl{to{transform:scale(1.18) rotate(-8deg)}}@keyframes gfxPop{from{transform:scale(.4);opacity:0}}
@media (prefers-reduced-motion:reduce){.gfxB,.gfxV{display:none}}`; document.head.appendChild(s); })();

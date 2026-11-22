/* Install ballknowledge as an app, from any sport page (each build includes this file).
   Chrome, Edge and Android offer a real install prompt: we keep it and show a small "Get the app" chip from your second day of
   playing (never on the first visit, never once installed, and "Not now" hides it for two weeks). iPhone and iPad have no
   prompt, so the chip opens two steps: Share, then Add to Home Screen. Installed, the site opens full screen with its own icon,
   and the pages you've visited work offline (the service worker keeps them). */
const Install = {
  dp: null,
  standalone() { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; },
  ios() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); },
  days() { try { const k = "bk_visit_days", d = JSON.parse(localStorage.getItem(k) || "[]"), t = new Date().toISOString().slice(0, 10); if (!d.includes(t)) { d.push(t); localStorage.setItem(k, JSON.stringify(d.slice(-30))); } return d.length; } catch (e) { return 1; } },
  snoozed() { try { return Date.now() < +(localStorage.getItem("bk_install_snooze") || 0); } catch (e) { return false; } },
  show() {
    if (this.standalone() || this.snoozed() || document.getElementById("bkInst") || location.protocol !== "https:" && !/localhost|127\.0\.0\.1/.test(location.hostname)) return;
    if (!this.dp && !this.ios()) return;
    const c = document.createElement("div"); c.id = "bkInst";
    c.innerHTML = `<img src="${location.pathname.split("/").length > 2 ? "../" : ""}icon-192.png" alt=""><div><b>Get the app</b><small>Full screen, its own icon, works offline.</small></div><button type="button" class="bkiGo">Install</button><button type="button" class="bkiX" aria-label="Not now">✕</button>`;
    document.body.appendChild(c);
    c.querySelector(".bkiX").onclick = () => { try { localStorage.setItem("bk_install_snooze", Date.now() + 14 * 864e5); } catch (e) { /* blocked */ } c.classList.add("out"); setTimeout(() => c.remove(), 300); };
    c.querySelector(".bkiGo").onclick = () => {
      if (this.dp) { this.dp.prompt(); this.dp.userChoice.then((r) => { if (r && r.outcome === "accepted") c.remove(); this.dp = null; }); return; }
      const m = document.createElement("div"); m.id = "bkInstIos"; m.innerHTML = `<div class="bkib"><h3>Add ballknowledge to your Home Screen</h3><ol><li>Tap the <b>Share</b> button <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8"/></svg> in Safari's toolbar.</li><li>Scroll and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol><button type="button">Got it</button></div>`;
      document.body.appendChild(m); m.onclick = (e) => { if (e.target === m || e.target.tagName === "BUTTON") m.remove(); };
    };
  },
  init() {
    const n = this.days();
    addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); this.dp = e; if (n >= 2) setTimeout(() => this.show(), 8000); });
    addEventListener("appinstalled", () => { const c = document.getElementById("bkInst"); if (c) c.remove(); });
    if (this.ios() && n >= 2) setTimeout(() => this.show(), 8000);
  },
};
Install.init();
(() => { const s = document.createElement("style"); s.textContent = `
#bkInst{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9000;display:flex;align-items:center;gap:10px;padding:10px 10px 10px 12px;border-radius:18px;background:#141b17f2;color:#f4f1ea;border:1px solid #ffffff2a;box-shadow:0 18px 40px -14px #000;width:min(440px,calc(100% - 32px));backdrop-filter:blur(10px);animation:bkiIn .5s cubic-bezier(.2,1.3,.4,1)}
#bkInst.out{opacity:0;transform:translate(-50%,20px);transition:.3s}#bkInst img{width:40px;height:40px;border-radius:10px}#bkInst div{flex:1;min-width:0}#bkInst b{display:block;font-size:15px}#bkInst small{font-size:12px;opacity:.75}
#bkInst .bkiGo{font:700 14px inherit;padding:9px 14px;border-radius:12px;border:0;background:var(--accent,#f2c14e);color:#111;cursor:pointer}#bkInst .bkiX{background:none;border:0;color:inherit;opacity:.6;font-size:16px;cursor:pointer;padding:6px}
@keyframes bkiIn{from{opacity:0;transform:translate(-50%,30px)}}
#bkInstIos{position:fixed;inset:0;z-index:100001;background:#000a;display:flex;align-items:flex-end;justify-content:center;padding:16px}#bkInstIos .bkib{background:#141b17;color:#f4f1ea;border-radius:20px;padding:18px 20px;width:min(440px,100%);border:1px solid #ffffff2a}
#bkInstIos h3{margin:0 0 8px;font-size:19px}#bkInstIos ol{margin:0 0 12px;padding-left:20px;line-height:1.7}#bkInstIos svg{vertical-align:-3px}#bkInstIos button{font:700 15px inherit;padding:10px 18px;border-radius:12px;border:0;background:var(--accent,#f2c14e);color:#111}`; document.head.appendChild(s); })();
/* Accessibility: a "Skip to content" button, the first thing keyboard users reach, shown only when focused. It's a button
   rather than a #link because the sites route by the address hash. It moves focus to the visible main area. */
(() => {
  const go = () => { const t = [...document.querySelectorAll("#league:not([hidden]) #room, #league:not([hidden]), #home:not([hidden]), #profilePage:not([hidden]), main, #app")].find((x) => x.offsetParent !== null || x.tagName === "MAIN"); if (!t) return; if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: false }); };
  const add = () => { if (document.getElementById("bkSkip")) return; const b = document.createElement("button"); b.id = "bkSkip"; b.type = "button"; b.textContent = "Skip to content"; b.onclick = go; document.body.prepend(b); };
  if (document.body) add(); else addEventListener("DOMContentLoaded", add);
  const s = document.createElement("style"); s.textContent = "#bkSkip{position:fixed;left:12px;top:-60px;z-index:100002;padding:10px 16px;border-radius:12px;border:0;background:var(--accent,#f2c14e);color:#111;font:700 15px system-ui,sans-serif;transition:top .2s}#bkSkip:focus{top:12px;outline:3px solid #fff;outline-offset:2px}[tabindex='-1']:focus{outline:none}"; document.head.appendChild(s);
})();

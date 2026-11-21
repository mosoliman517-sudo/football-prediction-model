/* Settings, the visual way: every choice is a row of cards you swipe through (or tap, or step with the arrows), each showing
   what you get: the look as a little animated scene, each sidekick with their face, their blurb and one of their lines (tap to
   hear it in their voice), each outfit on your current sidekick, the theme as a swatch and text sizes as real text.
   Swiping a card into the middle applies it straight away. Shared by football and basketball (the build adds it to each page). */
const SETUI = { t: {} };
const setGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
function setApply(k, v) {   /* the same effect as the old chips, without rebuilding the page (so the carousel stays where it is) */
  if (k === "look") { const [st, md] = TP_OPTS[+v]; setApply("style", st); setApply("theme", md); return; }
  try { localStorage.setItem("bk_" + k, v); } catch (e) { /* blocked */ }
  try { const pf = prof(); pf.look = { ...(pf.look || {}), [k]: v }; saveProf(pf); } catch (e) { /* profile not ready */ }
  applyAppearance();
  if (k === "mascot") setTimeout(() => { try { Mascot.dock(); Mascot.hello(); } catch (e) { /* no sidekick */ } }, 60);
  if (k === "mascot_mode") setTimeout(() => { try { Mascot.dock(); if (v !== "off") Mascot.hello(); } catch (e) { /* no sidekick */ } }, 60);
  if (k === "outfit") setTimeout(() => { try { outfitPaint(); Mascot.react("achieve", true); } catch (e) { /* no outfits */ } }, 60);
}
const lookNow = () => { const st = setGet("bk_style", TP_OPTS[0][0]), th = setGet("bk_theme", "dark"), md = th === "auto" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : th; const i = TP_OPTS.findIndex(([s, m]) => s === st && m === md); return i < 0 ? TP_OPTS.findIndex(([s]) => s === st) : i; };
function carousel(id, cards) {
  return `<div class="crsl" data-crsl="${id}"><button type="button" class="crbtn" data-crs="${id}|-1" aria-label="Previous">‹</button><div class="crtrack" id="crs-${id}">${cards.join("")}</div><button type="button" class="crbtn" data-crs="${id}|1" aria-label="Next">›</button></div><div class="crdots" id="crd-${id}">${cards.map((_, i) => `<i data-crdot="${id}|${i}"></i>`).join("")}</div>`;
}
function skLine(k, n) { const L = (MASCOTS[k].lines || {}), all = Object.values(L).flat().filter((x) => typeof x === "string" && x.length < 140); return n === 0 && L.welcome && L.welcome[0] ? L.welcome[0] : all.length ? all[(n * 7 + k.length) % all.length] : MASCOTS[k].blurb; }
function appearanceV2() {
  const look = lookNow(), sk = Mascot.id(), fit = typeof outfitNow === "function" ? outfitNow() : "classic", th = setGet("bk_theme", "auto"), tx = setGet("bk_text", "m"), md = Mascot.mode();
  SETUI.line = SETUI.line || {};
  const lookCards = TP_OPTS.map(([st, mdd, n, d, c], i) => `<button type="button" class="crcard ${i === look ? "on" : ""}" data-set="look|${i}"><span class="lkprev ${st} ${mdd}" style="--a:${c[0]};--b:${c[1]};--c:${c[2]}"><i class="lkbeam"></i><i class="lkbeam b2"></i><i class="lkball"></i><i class="lkbar"></i><i class="lkbar s"></i><i class="lkpill"></i></span><b>${n}</b><small>${d}</small></button>`);
  const skCards = Mascot.mine.map((k) => `<div class="crcard skcard ${k === sk ? "on" : ""}" data-set="mascot|${k}" role="button" tabindex="0"><span class="skface">${MASCOT_SVG[k]("happy")}</span><b>${esc(MASCOTS[k].name)}</b><small>${esc(MASCOTS[k].blurb)}</small><span class="skbubble" id="skl-${k}">“${esc(skLine(k, SETUI.line[k] || 0))}”</span><span class="skbtns"><button type="button" class="btn ghost skhear" data-skhear="${k}">▶ Hear ${esc(MASCOTS[k].name.split(" ").pop())}</button><button type="button" class="btn ghost skmore" data-skmore="${k}">Another line</button></span></div>`);
  const fitCards = (typeof OUTFITS !== "undefined" ? OUTFITS : []).map(([k, n, , how]) => { const ok = outfitOK(k); return `<button type="button" class="crcard ofcard ${k === fit ? "on" : ""} ${ok ? "" : "locked"}" ${ok ? `data-set="outfit|${k}"` : "disabled"} data-fit="${k}"><span class="skface ofprev">${OUTFIT_HAT[k] || ""}${MASCOT_SVG[sk]("happy")}</span><b>${ok ? "" : "🔒 "}${esc(n)}</b><small>${ok ? (k === fit ? "Wearing it" : "Tap to wear it") : esc(how)}</small></button>`; });
  const themeCards = [["dark", "Dark", "Easy on the eyes at night"], ["light", "Light", "Bright, like a day game"], ["auto", "Follow my device", "Switches with your phone or computer"]].map(([k, n, d]) => `<button type="button" class="crcard thcard ${th === k ? "on" : ""}" data-set="theme|${k}"><span class="thprev ${k}"><i></i><i></i><i></i></span><b>${n}</b><small>${d}</small></button>`);
  const textCards = [["s", "Small", 13], ["m", "Normal", 16], ["l", "Large", 19], ["xl", "Extra large", 23]].map(([k, n, px]) => `<button type="button" class="crcard txcard ${tx === k ? "on" : ""}" data-set="text|${k}"><span class="txprev" style="font-size:${px}px">Who scored the winner?</span><b>${n}</b></button>`);
  const seg = (k, items, cur) => `<div class="scope" style="padding:2px 0">${items.map(([v, n]) => `<button type="button" class="chip" data-set="${k}|${v}" aria-pressed="${cur === v}">${n}</button>`).join("")}</div>`;
  return `<h3 class="sethead">Your look</h3><p class="fine">Swipe through them. The one in the middle is the one you get.</p>${carousel("look", lookCards)}
    <h3 class="sethead">Your sidekick</h3><p class="fine">They cheer, groan and narrate in their own voice. Tap ▶ to hear one.</p>${carousel("sk", skCards)}<div class="setsub"><span class="fine">Sidekick voice</span>${seg("mascot_mode", [["on", "Talks"], ["quiet", "Bubbles only"], ["off", "Hidden"]], md)}</div>
    ${fitCards.length ? `<h3 class="sethead">Outfit</h3><p class="fine">Locked outfits unlock with your rank or achievements; each card says how.</p>${carousel("fit", fitCards)}` : ""}
    <h3 class="sethead">Theme</h3>${carousel("th", themeCards)}
    <h3 class="sethead">Text size</h3>${carousel("tx", textCards)}
    <h3 class="sethead">Display</h3><div class="scope" style="padding:2px 0"><button type="button" class="chip" data-set="contrast|${setGet("bk_contrast", "0") === "1" ? 0 : 1}" aria-pressed="${setGet("bk_contrast", "0") === "1"}">High contrast</button><button type="button" class="chip" data-set="motion|${setGet("bk_motion", "") === "reduced" ? "full" : "reduced"}" aria-pressed="${setGet("bk_motion", "") === "reduced"}">Reduce motion</button></div><p class="fine">Reduce motion also stops background effects after a refresh.</p>`;
}
function setCenter(track, smooth) { const c = track.querySelector(".crcard.on") || track.firstElementChild; if (!c) return; track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.clientWidth) / 2, behavior: smooth ? "smooth" : "instant" }); setDots(track); }
function setDots(track) { const id = track.id.slice(4), cards = [...track.children], mid = track.scrollLeft + track.clientWidth / 2; let best = 0; cards.forEach((c, i) => { if (Math.abs(c.offsetLeft + c.clientWidth / 2 - mid) < Math.abs(cards[best].offsetLeft + cards[best].clientWidth / 2 - mid)) best = i; }); document.querySelectorAll(`#crd-${id} i`).forEach((d, i) => d.classList.toggle("on", i === best)); return cards[best]; }
function setPick(card) {   /* make this card the chosen one: apply it and mark it */
  if (!card || card.classList.contains("locked") || !card.dataset.set) return; const [k, v] = card.dataset.set.split("|"); if (card.classList.contains("on")) return;
  card.parentElement.querySelectorAll(".crcard.on").forEach((x) => x.classList.remove("on")); card.classList.add("on"); setApply(k, v); try { Snd.tick(); } catch (e) { /* quiet */ }
  if (k === "mascot") { const f = document.getElementById("crs-fit"); if (f) f.querySelectorAll(".ofprev").forEach((p) => { const hat = p.querySelector(".mhat"); p.innerHTML = (hat ? hat.outerHTML : "") + MASCOT_SVG[v]("happy"); }); }
}
function setWire(root) {
  SETUI.lock = true; clearTimeout(SETUI.lockT); SETUI.lockT = setTimeout(() => { SETUI.lock = false; }, 700);   /* positioning the rows is not a choice */
  root.querySelectorAll(".crtrack").forEach((t) => {
    requestAnimationFrame(() => setCenter(t, false));
    t.addEventListener("scroll", () => { setDots(t); clearTimeout(SETUI.t[t.id]); SETUI.t[t.id] = setTimeout(() => { if (SETUI.lock) return; setPick(setDots(t)); }, 220); }, { passive: true });
  });
}
document.addEventListener("click", (e) => {
  const h = e.target.closest && e.target.closest("[data-skhear]"); if (h) { e.stopPropagation(); const k = h.dataset.skhear, el = document.getElementById("skl-" + k), txt = el ? el.textContent.replace(/[“”]/g, "") : skLine(k, 0); try { AIVoice.play(txt, { voice: MASCOTS[k].voice, volume: 0.95 }); } catch (er) { /* no voice */ } h.closest(".crcard").querySelector(".skface").classList.add("talking"); setTimeout(() => h.closest(".crcard")?.querySelector(".skface")?.classList.remove("talking"), 2600); return; }
  const m = e.target.closest && e.target.closest("[data-skmore]"); if (m) { e.stopPropagation(); const k = m.dataset.skmore; SETUI.line[k] = (SETUI.line[k] || 0) + 1; const el = document.getElementById("skl-" + k); if (el) { el.textContent = `“${skLine(k, SETUI.line[k])}”`; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); } return; }
  const a = e.target.closest && e.target.closest("[data-crs]"); if (a) { const [id, d] = a.dataset.crs.split("|"), t = document.getElementById("crs-" + id); if (!t) return; const cur = setDots(t), cards = [...t.children], nx = cards[Math.max(0, Math.min(cards.length - 1, cards.indexOf(cur) + +d))]; t.scrollTo({ left: nx.offsetLeft - (t.clientWidth - nx.clientWidth) / 2, behavior: "smooth" }); return; }
  const dot = e.target.closest && e.target.closest("[data-crdot]"); if (dot) { const [id, i] = dot.dataset.crdot.split("|"), t = document.getElementById("crs-" + id), c = t && t.children[+i]; if (c) t.scrollTo({ left: c.offsetLeft - (t.clientWidth - c.clientWidth) / 2, behavior: "smooth" }); return; }
  const c = e.target.closest && e.target.closest(".crcard[data-set]"); if (c) { const t = c.parentElement; t.scrollTo({ left: c.offsetLeft - (t.clientWidth - c.clientWidth) / 2, behavior: "smooth" }); setPick(c); return; }
  const chip = e.target.closest && e.target.closest(".chip[data-set]"); if (chip) { const [k, v] = chip.dataset.set.split("|"); setApply(k, v); try { Snd.tick(); } catch (er) { /* quiet */ } if (k === "contrast" || k === "motion") { const on = k === "contrast" ? v === "1" : v === "reduced"; chip.setAttribute("aria-pressed", on); chip.dataset.set = `${k}|${k === "contrast" ? (on ? 0 : 1) : on ? "full" : "reduced"}`; } else chip.parentElement.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", x === chip)); }
}, true);

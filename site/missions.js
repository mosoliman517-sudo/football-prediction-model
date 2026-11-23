/* Daily missions (football and basketball; each build includes this file).
   Every day there are three small goals, the same for everyone that day (picked from the date): for example "get 5 answers right",
   "play 2 different games" or "win a ranked match". Finishing one gives bonus XP; finishing all three gives a bigger bonus and ticks
   the day. Five all-three days in a week open the weekly chest (a large XP reward and a badge-style toast).
   Progress counts real play only: it is read from the same calls that already give XP and sounds (reward, right answers, ranked results),
   so nothing here can be earned without playing. Stored in your profile (so it syncs with your account), the last 14 days only. */
const MIS = [
  { id: "rounds3", t: (n) => `Play ${n} rounds of any game`, n: [3, 5, 8], key: "rounds", xp: 30 },
  { id: "right5", t: (n) => `Get ${n} answers right`, n: [5, 8, 12], key: "right", xp: 30 },
  { id: "games2", t: (n) => `Play ${n} different games`, n: [2, 3], key: "games", xp: 40 },
  { id: "newgame", t: () => "Try a game you've never played", n: [1], key: "newgame", xp: 50 },
  { id: "streak3", t: (n) => `Get ${n} right in a row`, n: [3, 5], key: "combo", xp: 40 },
  { id: "ranked1", t: () => "Win a ranked match", n: [1], key: "rankedwin", xp: 60 },
  { id: "predict", t: (n) => `Lock in ${n} prediction${n > 1 ? "s" : ""} on real matches`, n: [1, 2, 3], key: "predict", xp: 40 },
  { id: "hard1", t: () => "Play a round on Hard or Elite", n: [1], key: "hard", xp: 40 },
];
const MIS_ALL_XP = 100, MIS_CHEST_XP = 400;
const Mis = {
  hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; },
  today() { return new Date().toISOString().slice(0, 10); },
  weekStart(d) { const t = new Date((d || this.today()) + "T00:00:00Z"), dow = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dow); return t.toISOString().slice(0, 10); },
  /* the day's three, the same for everyone: a seeded shuffle of the list, a target picked per mission */
  list(day) {
    const pool = MIS.slice(); let h = this.hash("missions-" + day); const out = [];
    while (out.length < 3 && pool.length) { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; const i = h % pool.length, m = pool.splice(i, 1)[0]; h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0; out.push({ ...m, target: m.n[h % m.n.length] }); }
    return out;
  },
  day(p, d) { p.missions = p.missions || {}; const k = d || this.today(); return (p.missions[k] = p.missions[k] || { prog: { rounds: 0, right: 0, games: [], newgame: 0, combo: 0, rankedwin: 0, predict: 0, hard: 0 }, done: {} }); },
  val(rec, key) { const v = rec.prog[key]; return Array.isArray(v) ? v.length : v || 0; },
  /* record something that happened, then pay out anything that has just been finished */
  note(fn) {
    try {
      const p = prof(), rec = this.day(p); fn(rec.prog, p);
      const ms = this.list(this.today()); let gained = 0, finished = [];
      ms.forEach((m) => { if (!rec.done[m.id] && this.val(rec, m.key) >= m.target) { rec.done[m.id] = 1; gained += m.xp; finished.push(m); } });
      const all = ms.every((m) => rec.done[m.id]);
      if (all && !rec.all) { rec.all = 1; gained += MIS_ALL_XP; }
      let chest = false; const ws = this.weekStart(), days = Object.keys(p.missions).filter((d) => d >= ws && p.missions[d].all).length; p.mchest = p.mchest || {};
      if (days >= 5 && !p.mchest[ws]) { p.mchest[ws] = 1; gained += MIS_CHEST_XP; chest = true; }
      Object.keys(p.missions).sort().slice(0, -14).forEach((k) => delete p.missions[k]);
      if (gained) p.xp = (p.xp || 0) + gained;
      saveProf(p);
      finished.forEach((m, i) => setTimeout(() => { try { toast(`<b>Mission done</b><br>${esc(m.t(m.target))} · +${m.xp} XP`, "ach"); Snd.win && Snd.win(); } catch (e) { /* quiet */ } }, 600 + i * 900));
      if (all && finished.length) setTimeout(() => { try { toast(`<b>All three missions done</b><br>+${MIS_ALL_XP} XP bonus`, "ach"); confetti && confetti(); Mascot.react("achieve"); } catch (e) { /* quiet */ } }, 900 + finished.length * 900);
      if (chest) setTimeout(() => { try { toast(`<b>Weekly chest opened</b><br>5 perfect days: +${MIS_CHEST_XP} XP`, "ach"); confetti && confetti(); } catch (e) { /* quiet */ } }, 2600);
      if (gained) { try { paintProfileBtn(); } catch (e) { /* not ready */ } this.paint(); }
    } catch (e) { /* missions must never break a game */ }
  },
  streak(p) { let n = 0; const now = Date.now(); for (let k = 0; k < 120; k++) { const d = new Date(now - k * 864e5).toISOString().slice(0, 10), r = (p.missions || {})[d]; if (r && r.all) n++; else if (k > 0) break; else continue; } return n; },
  html() {
    const p = prof(), rec = this.day(p), ms = this.list(this.today()), ws = this.weekStart(), week = Array.from({ length: 7 }, (_, i) => { const t = new Date(ws + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + i); return t.toISOString().slice(0, 10); });
    const perfect = week.filter((d) => (p.missions || {})[d] && p.missions[d].all).length, doneN = ms.filter((m) => rec.done[m.id]).length, chest = (p.mchest || {})[ws];
    return `<div class="mbox" id="missionBox"><div class="mhead"><div><span class="htlabel">Daily missions</span><b class="mcount num">${doneN}/3 done</b></div><div class="mweek" title="Days this week with all three missions done. Five opens the weekly chest."><span class="fine">Weekly chest</span>${week.map((d) => `<i class="${(p.missions || {})[d] && p.missions[d].all ? "on" : ""} ${d === this.today() ? "today" : ""}"></i>`).join("")}<span class="fine num">${chest ? "opened" : perfect + "/5"}</span></div></div>
      <div class="mlist">${ms.map((m) => { const v = Math.min(this.val(rec, m.key), m.target), done = !!rec.done[m.id]; return `<div class="mrow ${done ? "done" : ""}"><span class="mtick">${done ? "✓" : ""}</span><div class="mtxt"><b>${esc(m.t(m.target))}</b><div class="mbar"><i style="width:${(v / m.target) * 100}%"></i></div></div><span class="mxp num">${done ? "done" : v + "/" + m.target}<small>+${m.xp} XP</small></span></div>`; }).join("")}</div>
      <div class="fine mfoot">All three: +${MIS_ALL_XP} XP${this.streak(p) > 1 ? ` · ${this.streak(p)} perfect days in a row` : ""}. New missions every day.</div></div>`;
  },
  paint() { const b = document.getElementById("missionBox"); if (b) b.outerHTML = this.html(); },
  mount() {
    const home = document.getElementById("homeToday"); if (!home || document.getElementById("missionBox")) return; home.insertAdjacentHTML("afterend", this.html());
  },
};
/* hooks: the same calls that already pay XP and play sounds */
setTimeout(() => {
  if (typeof reward === "function") { const r0 = reward; try { reward = function (xp, label) { const out = r0.apply(this, arguments); const hard = typeof S !== "undefined" && ["hard", "elite"].includes(S.diff); Mis.note((pr, p) => { pr.rounds = (pr.rounds || 0) + 1; pr.games = Array.isArray(pr.games) ? pr.games : []; if (label && !pr.games.includes(label)) pr.games.push(label); p.mseen = p.mseen || {}; if (label && !p.mseen[label]) { p.mseen[label] = 1; pr.newgame = (pr.newgame || 0) + 1; } if (hard) pr.hard = (pr.hard || 0) + 1; if (/call it|daily 5|matchday|rapid|bracket|upset|table|over or under|live|weekly/i.test(String(label))) pr.predict = (pr.predict || 0) + 1; }); return out; }; } catch (e) { /* keep the original */ } }
  if (typeof Snd !== "undefined" && Snd.right && !Snd.__mis) { Snd.__mis = true; const r1 = Snd.right, w1 = Snd.wrong; Snd.right = function () { try { Mis.note((pr) => { pr.right = (pr.right || 0) + 1; Mis.run = (Mis.run || 0) + 1; pr.combo = Math.max(pr.combo || 0, Mis.run); }); } catch (e) { /* quiet */ } return r1.apply(this, arguments); }; if (w1) Snd.wrong = function () { Mis.run = 0; return w1.apply(this, arguments); }; }
  if (typeof Ranked !== "undefined" && Ranked.report) { const rp = Ranked.report; Ranked.report = function (mid, opp, res) { try { if (res === "win") Mis.note((pr) => { pr.rankedwin = (pr.rankedwin || 0) + 1; }); } catch (e) { /* quiet */ } return rp.apply(this, arguments); }; }
  if (typeof renderHome === "function") { const h0 = renderHome; try { renderHome = function () { h0.apply(this, arguments); setTimeout(() => Mis.mount(), 80); }; } catch (e) { /* skip */ } }
  if (document.getElementById("homeToday")) setTimeout(() => Mis.mount(), 120);   /* the home page was already drawn before these hooks went in */
}, 0);
addEventListener("hashchange", () => { Mis.run = 0; });
(() => { const s = document.createElement("style"); s.textContent = `
.mbox{align-self:stretch;width:100%;box-sizing:border-box;margin:0 0 14px;padding:14px 16px;border-radius:20px;border:1px solid var(--line);background:radial-gradient(circle at 90% 0,color-mix(in srgb,var(--accent) 16%,transparent),transparent 55%),var(--surface)}
.mhead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:8px}.mhead>div:first-child{display:flex;flex-direction:column;gap:2px}.mcount{font-size:22px}
.mweek{display:flex;align-items:center;gap:5px}.mweek i{width:12px;height:12px;border-radius:50%;background:color-mix(in srgb,var(--ink) 14%,transparent)}.mweek i.on{background:var(--accent);box-shadow:0 0 10px var(--accent)}.mweek i.today{outline:2px solid color-mix(in srgb,var(--ink) 40%,transparent);outline-offset:1px}
.mlist{display:grid;gap:8px}.mrow{display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:center;padding:8px 10px;border-radius:14px;background:color-mix(in srgb,var(--ink) 5%,transparent)}
.mtick{width:24px;height:24px;border-radius:50%;border:2px solid color-mix(in srgb,var(--ink) 25%,transparent);display:grid;place-items:center;font-weight:800;font-size:14px}.mrow.done .mtick{background:var(--accent);border-color:var(--accent);color:#111;animation:mPop .4s cubic-bezier(.2,1.6,.4,1)}@keyframes mPop{from{transform:scale(.4)}}
.mtxt b{font-size:14.5px}.mbar{height:6px;border-radius:99px;background:color-mix(in srgb,var(--ink) 12%,transparent);margin-top:5px;overflow:hidden}.mbar i{display:block;height:100%;background:var(--accent);border-radius:99px;transition:width .6s cubic-bezier(.2,.8,.2,1)}
.mrow.done .mtxt b{opacity:.6;text-decoration:line-through}.mxp{display:flex;flex-direction:column;align-items:flex-end;font-size:13px}.mxp small{font:700 10.5px var(--mono);opacity:.7}.mfoot{margin-top:8px}`; document.head.appendChild(s); })();

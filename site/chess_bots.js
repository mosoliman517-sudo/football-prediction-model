/* The opponents: eight characters, each with ONE strength and a playstyle you can feel, and their rating on the card.
   A character is not a strength setting with a new face: every move a character makes is picked by its own rule from what
   Stockfish says about the position.
     Pip          the beginner. A tiny engine that looks two moves ahead and grabs whatever it can.
     Mikel Arteta extremely passive. Of the moves that are still fine, he plays the quietest one: no captures, no checks, no
                  pawn storms, pieces tucked back, trades refused. He waits for you to make a mistake.
     Bishop Bea   positional: bishops on long diagonals, fianchettos, castling, steady development.
     The Trader   trades pieces at every chance, queens first, and heads for the endgame.
     The Berserker attacks: checks, captures and pawn storms against your king, whatever the cost to his own.
     The Escaped  an escaped patient. Plays a sacrifice whenever one exists that does not lose on the spot: any piece, any
                  square, even a doubtful one. If there is no sacrifice, he plays like a strong club player.
     Queen Vera   ruthless: no style, just accurate chess.
     The Council  Pip, Bea and Vera vote on every move.
   Ratings (BOT_ELO) are measured, not guessed: each character plays its moves in sample positions from top-level games, the
   loss against Stockfish is measured, and the game review's own rating model (calibrated on 63,815 Lichess games) turns that
   into a rating. They are on the Lichess scale; chess.com ratings run a little lower at club level. src/ has no copy: the
   numbers below were produced by botCalib() in this file. */
const councilLogo = () => `<span class="council">${["bea", "vera", "pip"].map((id, k) => `<span class="cf cf${k}">${oppFace(id, "happy")}</span>`).join("")}</span>`;
COACH_SVG.council = () => councilLogo();
const BOT_ELO = { pip: 1080, arteta: 1735, berserker: 1750, bea: 1835, trader: 1980, escaped: 1990, vera: 2110, council: 2065 };   /* measured with botCalib(id, 150) on 2026-11-25; Lichess scale */
const BOTS = [
  { id: "pip", name: "Pip", tag: "The Beginner", kind: "small", small: 1, style: ["Grabs loose pieces", "Looks no moves ahead"], desc: "A pawn who only just learned how the pieces move. He looks no moves ahead and grabs whatever is free." },
  { id: "arteta", name: "Mikel Arteta", tag: "The Wall", kind: "sf", cap: 14, depth: 7, ms: 300, multipv: 8, style: ["Extremely passive", "Never initiates"], desc: "Plays the quietest move that is still safe. No captures unless forced, no checks, pawns stay home, trades refused. He is waiting for you to overreach." },
  { id: "berserker", name: "The Berserker", tag: "The Attacker", kind: "sf", cap: 12, depth: 8, ms: 300, multipv: 8, style: ["Checks and captures", "Pawn storms at your king"], desc: "Throws everything at your king: checks first, then captures, then pawns. His own king can wait." },
  { id: "bea", name: "Bishop Bea", tag: "The Positional Player", kind: "sf", cap: 16, depth: 7, ms: 300, multipv: 6, style: ["Long diagonals", "Fianchettos, castles early"], desc: "Develops calmly, loves her bishops on the long diagonals, castles early and rarely hurries." },
  { id: "trader", name: "The Trader", tag: "The Simplifier", kind: "sf", cap: 14, depth: 8, ms: 300, multipv: 8, style: ["Trades everything", "Queens off first"], desc: "Offers and accepts a trade at every chance, queens first, and marches into the endgame." },
  { id: "escaped", name: "The Escaped", tag: "The Sacrificer", kind: "sf", cap: 10, depth: 9, ms: 400, multipv: 6, style: ["Sacrifices whenever he can", "Never on the spot losing"], desc: "Slipped out of the clinic with one idea: give things away. Any sacrifice that does not simply lose, he plays. No sacrifice available? Then he plays like a strong club player." },
  { id: "council", name: "The Council", tag: "Pip, Bea and Vera together", kind: "council", style: ["Three coaches vote", "Thinks the longest"], desc: "Pip, Bea and Vera each rank the engine's three best moves their own way and the points are added up. Never a bad move, and he thinks the longest." },
  { id: "vera", name: "Queen Vera", tag: "The Ruthless", kind: "sf", cap: 2, depth: 14, ms: 1000, multipv: 2, style: ["Accurate and cold", "No tricks"], desc: "A retired queen who does not do friendly games. No style, just accurate chess." },
];
const botOf = (level) => BOTS[(level || 1) - 1] || BOTS[0];
BOTS.forEach((b, i) => { LVL[i + 1] = b.name; LVC[i + 1] = b.id; });
/* ---------- faces ---------- */
const BF = (body, md) => `<svg class="pip ${md}" viewBox="0 0 100 120" aria-hidden="true"><ellipse cx="50" cy="114" rx="30" ry="5" fill="#000" opacity=".18"/>${body}</svg>`;
COACH_SVG.escaped = (md) => BF(`<path d="M18 112c2-22 10-34 32-34s30 12 32 34z" fill="#f4f4f0" stroke="#5a5a66" stroke-width="2.5"/><path d="M30 84l40 26M70 84L30 110" stroke="#8a8a96" stroke-width="3"/><rect x="44" y="94" width="12" height="9" rx="2" fill="#c9a24a" stroke="#5a4510" stroke-width="1.5"/><circle cx="50" cy="48" r="25" fill="#f2d7c0" stroke="#5a5a66" stroke-width="2.5"/><path d="M24 40l-8-16 12 6-2-16 12 12 4-16 6 14 8-14 2 16 12-10-4 16 10-4-8 14c-6-8-18-12-28-12s-20 4-24 12z" fill="#dcdcd6" stroke="#5a5a66" stroke-width="2"/><circle cx="40" cy="48" r="8" fill="#fff" stroke="#333" stroke-width="2"/><circle cx="60" cy="46" r="9" fill="#fff" stroke="#333" stroke-width="2"/><circle cx="42" cy="50" r="2.6" fill="#111"/><circle cx="57" cy="44" r="2.6" fill="#111"/><path d="M32 38l16 4M70 36l-14 6" stroke="#333" stroke-width="2.4" stroke-linecap="round"/><path d="M36 62c4 10 24 12 30 0-6 3-24 3-30 0z" fill="#fff" stroke="#333" stroke-width="2"/><path d="M40 63v4M46 64v5M52 64v5M58 63v4" stroke="#333" stroke-width="1.4"/><path d="M33 54c1 4 3 5 5 5M65 54c-1 4-3 5-5 5" stroke="#7a6a8a" stroke-width="2" fill="none" opacity=".7"/>`, md);
COACH_SVG.arteta = (md) => BF(`<path d="M16 112c2-22 10-32 34-32s32 10 34 32z" fill="#1d2a44" stroke="#0e1626" stroke-width="2.5"/><path d="M42 80l8 14 8-14z" fill="#f4f4f0" stroke="#0e1626" stroke-width="1.5"/><path d="M28 96c12-4 32-4 44 0" stroke="#e8c3a3" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M30 99c14-4 30-4 40 0" stroke="#0e1626" stroke-width="1.2" fill="none" opacity=".4"/><circle cx="50" cy="48" r="24" fill="#ecc9aa" stroke="#6b4a33" stroke-width="2.5"/><path d="M26 42c0-16 12-24 26-22 12 1 22 8 22 22-4-8-10-12-22-12-8 0-14 2-18 6-2 2-6 4-8 6z" fill="#1c1a1a" stroke="#0e0e0e" stroke-width="2"/><path d="M33 40l12-2M55 38l12 2" stroke="#2a2220" stroke-width="2.6" stroke-linecap="round"/><circle cx="41" cy="48" r="2.6" fill="#222"/><circle cx="59" cy="48" r="2.6" fill="#222"/><path d="M44 62h12" stroke="#7a4a3a" stroke-width="2.4" stroke-linecap="round"/><path d="M26 56c0 12 10 14 24 14s24-2 24-14" fill="none" stroke="#6b4a33" stroke-width="0" />`, md);
COACH_SVG.trader = (md) => BF(`<path d="M18 112c2-22 10-32 32-32s30 10 32 32z" fill="#3a3a44" stroke="#1c1c24" stroke-width="2.5"/><path d="M44 80l6 30 6-30z" fill="#c43d3d" stroke="#601818" stroke-width="1.5"/><path d="M40 80l10 6 10-6" fill="#f4f4f0" stroke="#1c1c24" stroke-width="1.5"/><circle cx="50" cy="48" r="24" fill="#efcfb2" stroke="#6b4a33" stroke-width="2.5"/><path d="M27 40c2-14 12-20 23-20s21 6 23 20c-4-6-12-10-23-10s-19 4-23 10z" fill="#bcbcc4" stroke="#6a6a74" stroke-width="2"/><circle cx="41" cy="48" r="8" fill="#fff" fill-opacity=".5" stroke="#333" stroke-width="2"/><circle cx="59" cy="48" r="8" fill="#fff" fill-opacity=".5" stroke="#333" stroke-width="2"/><path d="M49 48h2" stroke="#333" stroke-width="2"/><circle cx="41" cy="49" r="2.3" fill="#222"/><circle cx="59" cy="49" r="2.3" fill="#222"/><path d="M40 62c6 5 14 5 20 0" stroke="#7a4a3a" stroke-width="2.4" fill="none" stroke-linecap="round"/><rect x="62" y="96" width="26" height="16" rx="3" fill="#7a4a22" stroke="#3a220c" stroke-width="2"/><path d="M70 96v-4h10v4" stroke="#3a220c" stroke-width="2" fill="none"/>`, md);
COACH_SVG.berserker = (md) => BF(`<path d="M16 112c2-22 12-32 34-32s32 10 34 32z" fill="#6a1c1c" stroke="#2a0a0a" stroke-width="2.5"/><path d="M26 86l-6-8 10 2M74 86l6-8-10 2M50 82l-4-10 8 0z" fill="#c9c9d0" stroke="#3a3a44" stroke-width="1.5"/><circle cx="50" cy="50" r="24" fill="#e6b998" stroke="#5a3520" stroke-width="2.5"/><path d="M30 38c2-12 8-22 20-26 12 4 18 14 20 26-4-4-8-6-20-6s-16 2-20 6z" fill="#d13a2a" stroke="#6a1410" stroke-width="2"/><path d="M50 12l-4-12 8 0z M38 16l-8-10 10 4z M62 16l8-10-10 4z" fill="#d13a2a" stroke="#6a1410" stroke-width="1.5"/><path d="M33 42l14 6M67 42l-14 6" stroke="#2a1008" stroke-width="3.2" stroke-linecap="round"/><circle cx="41" cy="51" r="3" fill="#fff" stroke="#2a1008" stroke-width="1.5"/><circle cx="59" cy="51" r="3" fill="#fff" stroke="#2a1008" stroke-width="1.5"/><circle cx="41" cy="51" r="1.4" fill="#c11"/><circle cx="59" cy="51" r="1.4" fill="#c11"/><path d="M34 44l8 14" stroke="#7a2a2a" stroke-width="2.2" stroke-linecap="round"/><path d="M38 64c8-5 16-5 24 0-2 6-22 6-24 0z" fill="#fff" stroke="#2a1008" stroke-width="2"/><path d="M42 64v4M48 64v5M54 64v5M60 64v4" stroke="#2a1008" stroke-width="1.2"/>`, md);
/* ---------- the move rules ---------- */
const BV = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const winOf = (l) => (l.mate != null ? (l.mate > 0 ? 100 : 0) : wpct(l.cp));
/* material we would lose net by playing m: their best capture, minus our best recapture, minus what m itself took */
function botSac(c, m) {
  const mine = BV[m.captured] || 0; c.move(m); let worst = 0;
  for (const o of c.moves({ verbose: true })) { if (!o.captured) continue; c.move(o); let back = 0; for (const r of c.moves({ verbose: true })) if (r.captured) back = Math.max(back, BV[r.captured]); c.undo(); worst = Math.max(worst, BV[o.captured] - back); }
  c.undo(); return worst - mine;
}
const botAdv = (m) => { const f = +m.from[1], t = +m.to[1]; return m.color === "w" ? t - f : f - t; };   /* ranks moved forward */
function botScore(id, c, m, ctx) {
  const adv = botAdv(m), cap = !!m.captured, chk = /\+|#/.test(m.san), q = m.piece, ownMat = ctx.mat;
  if (id === "arteta") return -(cap ? 4 + (BV[m.captured] >= BV[q] ? 2 : 0) : 0) - (chk ? 3 : 0) - (q === "p" ? Math.max(0, +(m.color === "w" ? m.to[1] - 2 : 7 - m.to[1]) - 1) * 1.2 : 0) - Math.max(0, adv) * 0.6 + Math.max(0, -adv) * 1.4 + (m.flags.includes("k") || m.flags.includes("q") ? 3 : 0) + (q === "k" ? -2.5 : 0) - ctx.sac * 5 - (cap && ctx.exch ? 2 : 0) + ((m.color === "w" ? +m.from[1] === 1 : +m.from[1] === 8) && q !== "p" && q !== "k" ? 0.8 : 0);
  if (id === "bea") { const longDiag = q === "b" && /^[a-h][1-8]$/.test(m.to) && ((m.to.charCodeAt(0) - 97) === (+m.to[1] - 1) || (m.to.charCodeAt(0) - 97) + (+m.to[1] - 1) === 7); const fian = q === "b" && /^(b2|g2|b7|g7)$/.test(m.to); const dev = q === "n" || q === "b" ? 1 : 0; return (longDiag ? 3 : 0) + (fian ? 3 : 0) + (m.flags.includes("k") || m.flags.includes("q") ? 3.5 : 0) + (q === "b" ? 1.2 : 0) + dev * (ctx.ply < 24 ? 1.5 : 0) + (q === "p" && /^[bg][23]$|^[bg][67]$/.test(m.to) ? 1.5 : 0) - (q === "q" && ctx.ply < 20 ? 3 : 0) - ctx.sac * 2; }
  if (id === "trader") return (cap && BV[m.captured] >= BV[q] - 0.1 ? 4 + BV[m.captured] * 0.5 : 0) + (cap && m.captured === "q" ? 4 : 0) + (q === "q" && ctx.qTrade.has(m.to) ? 6 : 0) + ctx.trade.has(m.san) * 6 - (q === "p" && !cap ? 0.4 : 0) - ctx.sac * 5;
  if (id === "berserker") { const k = ctx.oppK; const near = k ? Math.max(0, 7 - Math.max(Math.abs(m.to.charCodeAt(0) - k.charCodeAt(0)), Math.abs(+m.to[1] - +k[1]))) : 0; return (chk ? 6 : 0) + (cap ? 3 + BV[m.captured] * 0.4 : 0) + (q === "p" && near >= 3 ? 2.5 : 0) + near * 0.5 + Math.max(0, adv) * 0.8 - (q === "k" ? 3 : 0) - (m.flags.includes("k") || m.flags.includes("q") ? 0 : 0); }
  if (id === "escaped") return ctx.sac * 10 + (cap ? 0 : 0);
  return 0;
}
function botKingSq(c, color) { const b = c.board(); for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = b[r][f]; if (p && p.type === "k" && p.color === color) return "abcdefgh"[f] + (8 - r); } return null; }
function botTradeSet(c) {   /* SAN of moves that are an even trade right now */
  const out = new Set(), qT = new Set(); for (const m of c.moves({ verbose: true })) { if (!m.captured) continue; c.move(m); let back = false; for (const r of c.moves({ verbose: true })) if (r.captured && r.to === m.to) back = true; c.undo(); if (back && BV[m.captured] >= BV[m.piece] - 0.1) out.add(m.san); } return { out, qT };
}
/* ---------- picking the move ---------- */
async function botMove(level, fen) {
  const B = botOf(level), c = new Chess(fen), me = c.turn(), legal = c.moves({ verbose: true }); if (!legal.length) return null;
  const cfg = { skill: 20, depth: B.depth || 10, ms: B.ms || 500, multipv: Math.min(B.multipv || 6, legal.length) };
  if (B.kind === "council") return botCouncil(fen);
  let lines = await Sf.analyse(fen, cfg); if (!lines.length) return null; const win = lines.map(winOf), best = win[0], ply = (+fen.split(" ")[5] - 1) * 2 + (me === "b" ? 1 : 0);
  /* the character's candidates: moves the engine still rates within the character's own tolerance of the best move */
  let cands = lines.map((l, k) => ({ uci: l.pv[0], loss: best - win[k] })).filter((x) => x.loss <= B.cap);
  const ctx = { sac: 0, mat: 0, ply, oppK: botKingSq(c, me === "w" ? "b" : "w"), exch: false, trade: new Set(), qTrade: new Set() };
  if (B.id === "escaped") {
    /* every legal move that gives material away, whether or not the engine ranks it: the engine is asked only about those */
    const sacs = legal.map((m) => ({ m, s: botSac(c, m) })).filter((x) => x.s >= 1);
    if (sacs.length) {
      const sl = await Sf.analyse(fen, { skill: 20, depth: 9, ms: 450, multipv: Math.min(6, sacs.length), moves: sacs.map((x) => x.m.from + x.m.to + (x.m.promotion || "")) }).catch(() => []);
      const ok = sl.map((l) => { const m = sacs.find((x) => x.m.from + x.m.to + (x.m.promotion || "") === l.pv[0]); return m ? { m: m.m, s: m.s, loss: best - winOf(l) } : null; }).filter((x) => x && x.loss <= B.cap);
      if (ok.length) { ok.sort((a, b) => b.s - a.s || a.loss - b.loss); const pick = ok[0].m; return { from: pick.from, to: pick.to, promotion: pick.promotion }; }
    }
  }
  if (B.id === "escaped") cands = cands.filter((x) => x.loss <= 3);   /* no sacrifice to play: an ordinary strong move */
  if (B.id === "trader") { const t = botTradeSet(c); ctx.trade = t.out; }
  if (B.id === "arteta") ctx.exch = true;
  const scored = cands.map((x) => { const m = legal.find((l) => l.from + l.to + (l.promotion || "") === x.uci); if (!m) return null; ctx.sac = botSac(c, m) > 0 ? botSac(c, m) : 0; return { m, sc: botScore(B.id, c, m, ctx) - x.loss * 0.15 + Math.random() * 0.4 }; }).filter(Boolean);
  const pick = scored.length ? scored.sort((a, b) => b.sc - a.sc)[0].m : legal.find((l) => l.from + l.to + (l.promotion || "") === lines[0].pv[0]) || legal[0];
  return { from: pick.from, to: pick.to, promotion: pick.promotion };
}
async function botCouncil(fen) {
  /* the three coaches rank the engine's best three moves their own way and the points are added up: Vera by the engine's order,
     Bea by her positional taste, Pip by what grabs the most. Ties go to Vera. Never a move outside the engine's top three. */
  const c = new Chess(fen), lines = await Sf.analyse(fen, { skill: 20, depth: 16, ms: 1800, multipv: Math.min(3, c.moves().length) }); if (!lines.length) return null;
  const win = lines.map(winOf), legal = c.moves({ verbose: true }), ctx = { sac: 0, mat: 0, ply: (+fen.split(" ")[5] - 1) * 2, oppK: null, exch: false, trade: new Set(), qTrade: new Set() };
  const ms = lines.map((l, k) => ({ k, m: legal.find((x) => x.from + x.to + (x.promotion || "") === l.pv[0]), loss: win[0] - win[k] })).filter((x) => x.m && x.loss <= 4);
  const pts = ms.map((x) => ({ x, p: ms.length - x.k }));
  const rank = (f) => ms.map((x) => ({ x, v: f(x.m) })).sort((a, b) => b.v - a.v).forEach((e, r) => { pts.find((q) => q.x === e.x).p += ms.length - 1 - r; });
  rank((m) => botScore("bea", c, m, ctx)); rank((m) => (m.captured ? BV[m.captured] : 0) + (/\+|#/.test(m.san) ? 1 : 0));
  const pick = pts.sort((a, b) => b.p - a.p || a.x.k - b.x.k)[0].x.m; return { from: pick.from, to: pick.to, promotion: pick.promotion };
}
/* ---------- wiring into the game ---------- */
aiThink = function () {
  const B = botOf(st.level); if (B.kind === "small") { live.lock = true; st.think = true; aiPaint(); setTimeout(() => { if (!live || st.game !== "ai") return; askEngine({ type: "move", fen: live.c.fen(), level: B.small || 1 }, (r) => { if (!live || st.game !== "ai" || r.type !== "move") return; const m = live.c.move({ from: r.from, to: r.to, promotion: r.promotion || "q" }); live.last = [m.from, m.to]; Snd.move(m, live.c); st.think = false; live.lock = false; if (!aiEnd()) aiPaint(); }); }, 200); return; }
  const me = st, L = live; L.lock = true; st.think = true; aiPaint();
  botMove(st.level, L.c.fen()).then((r) => {
    if (st !== me || live !== L) return; const m = r ? L.c.move({ from: r.from, to: r.to, promotion: r.promotion || "q" }) : null; if (!m) { st.think = false; L.lock = false; return aiPaint(); }
    L.last = [m.from, m.to]; Snd.move(m, L.c); st.think = false; L.lock = false; if (!aiEnd()) aiPaint();
  }).catch(() => { if (st !== me) return; me.msg = "Stockfish could not load, so Pip took over."; me.level = 1; aiThink(); });
};

/* ---------- the characters talk: a bubble and a recorded voice (Kokoro clips from src/bot_lines.json), never the device voice ---------- */
function botPick(kind) {
  const B = botOf(st.level), L = BOT_LINES[B.id]; if (!L || !L[kind] || !L[kind].length) return null; st.botPk = st.botPk || {};
  if (kind === "trait" || !st.botPk[kind]) { const pick = L[kind][Math.floor(Math.random() * L[kind].length)], who = Array.isArray(pick) ? pick[0] : B.id; st.botPk[kind] = { who, text: Array.isArray(pick) ? pick[1] : pick, name: B.id === "council" ? `${COACHES[who].name} of the Council` : B.name, face: oppFace(who, "calm") }; }
  return st.botPk[kind];
}
/* the end-of-game card in a game against a character shows what that character says, not the coach */
function botEnd(res) {
  if (!st || st.game !== "ai" || !BOT_LINES[botOf(st.level).id]) return null; const p = botPick(res === "win" ? "lose" : res === "loss" ? "win" : "draw"); if (!p) return null;
  return `<div class="endcoach"><span class="botbf sm">${p.face}</span><span><b>${esc(p.name)}</b>${esc(p.text)}</span></div>`;
}
function botSay(kind) {
  if (!st || st.game !== "ai") return; const p = botPick(kind); if (!p) return; const who = p.who, text = p.text, nm = p.name, face = p.face;
  let el = document.getElementById("pipc"); if (!el) { el = Object.assign(document.body.appendChild(document.createElement("div")), { id: "pipc" }); el.setAttribute("role", "status"); el.addEventListener("click", () => el.classList.remove("on")); }
  el.innerHTML = `<span class="botbf">${face}</span><div class="pipsay"><b>${esc(nm)}</b>${esc(text)}</div>`; el.classList.add("on", "talk"); clearTimeout(pipT); pipT = setTimeout(() => { el.classList.remove("talk"); el.classList.remove("on"); }, Math.min(10000, 3600 + text.length * 55));
  try { if (PIPV.on && !(Snd && Snd.on === false)) AIVoice.play(text, { voice: BOT_VOICE[who], volume: 0.95 }); } catch (e) { /* silent */ }
}
{
  const _aiStart = aiStart; aiStart = function () { const r = _aiStart.apply(this, arguments); setTimeout(() => botSay("start"), 900); return r; };
  const _aiEnd = aiEnd; aiEnd = function () { const r = _aiEnd.apply(this, arguments); if (r && st && st.over && !st.botEnd) { st.botEnd = true; setTimeout(() => botSay(st.over.won ? "lose" : st.over.lost ? "win" : "draw"), 800); } return r; };
  const _vs = Voice.say; Voice.say = function (t) { if (st && st.game === "ai" && BOT_LINES[botOf(st.level).id] && /^(You win|You lost|Draw|Checkmate)$/.test(t)) return; return _vs.apply(this, arguments); };
  const _aiPaint = aiPaint; aiPaint = function () { const r = _aiPaint.apply(this, arguments); try { botWatch(); openTalk(); } catch (e) { /* never block the board */ } return r; };
}
/* a line when the character does the thing it is known for: the Escaped gives a piece away, the Berserker checks, the Trader trades, Arteta declines a capture */
/* while you are still in a known opening, your coach drops a fun fact about it (at most two a game) */
function openTalk() {
  if (!st || st.game !== "ai" || !live || st.over) return; const h = live.c.history(), n = h.length; if (n < 3 || n > 18 || (st.openN || 0) >= 2 || n - (st.openAt == null ? -9 : st.openAt) < 5) return;
  const S = openStory(bookMap().get(h.join(" "))); if (!S) return; st.openSaid = st.openSaid || {}; const left = S.facts.map(storyFact).filter((f) => !st.openSaid[f]); if (!left.length) return;
  const f = left[Math.floor(Math.random() * left.length)], me = st; st.openSaid[f] = 1; st.openN = (st.openN || 0) + 1; st.openAt = n; setTimeout(() => { if (st === me && !st.over) { pipPop(f, "happy"); pipSay(f); } }, 1500);
}
function botWatch() {
  if (!st || st.game !== "ai" || !live || st.over) return; const h = live.c.history({ verbose: true }), n = h.length; if (st.botN === n) return; st.botN = n;
  const m = h[n - 1]; if (!m || m.color === live.color) return; const id = botOf(st.level).id, L = BOT_LINES[id]; if (!L || !L.trait) return;
  const T = st.botT = st.botT || { n: 0, last: -9 }; if (T.n >= 4 || n - T.last < 6) return;
  const pre = new Chess(); h.slice(0, -1).forEach((x) => pre.move({ from: x.from, to: x.to, promotion: x.promotion })); let hit = false;
  if (id === "escaped") { const mv = pre.moves({ verbose: true }).find((z) => z.from === m.from && z.to === m.to && z.promotion === m.promotion); hit = !!mv && botSac(pre, mv) >= 2; }
  else if (id === "berserker") hit = /[+#]/.test(m.san);
  else if (id === "trader") hit = m.captured === "q" || (!!m.captured && m.captured !== "p" && n > 8);
  else if (id === "arteta") hit = n >= 8 && !m.captured && !/[+#]/.test(m.san) && pre.moves({ verbose: true }).some((z) => z.captured && BV[z.captured] >= 3);
  else if (id === "council") hit = n >= 12 && Math.random() < 0.12;
  if (hit) { T.n++; T.last = n; setTimeout(() => botSay("trait"), 500); }
}
const botElo = (b) => BOT_ELO[b.id] || null;
function aiMenu() {
  clearInterval(st.timer); live = null; st = { game: "ai", level: Math.min(8, store.get("ai_level", 2)), color: store.get("ai_color", "w"), clock: store.get("ai_clock", 0) };
  const card = (b, i) => `<button class="opp botcard ${st.level === i + 1 ? "on" : ""}" data-lv="${i + 1}" type="button"><div class="av oppface">${b.id === "council" ? councilLogo() : oppFace(b.id, i % 2 ? "happy" : "calm")}</div><b>${esc(b.name)}</b><span class="botelo num">${botElo(b) ? botElo(b) : "…"}<small>Elo</small></span><span class="bottag">${esc(b.tag)}</span><span class="botst">${b.style.map((s) => `<i>${esc(s)}</i>`).join("")}</span><span class="fine">${esc(b.desc)}</span></button>`;
  $("#app").className = "fresh"; $("#app").innerHTML = `<div class="crumbs"><button class="btn ghost" data-hub="bk">← Back</button></div><div class="card"><h2>${ic("robot")}Play the characters</h2><p class="sub">Eight opponents, each with one strength and one way of playing. The number is their rating, measured: every character's moves were graded against Stockfish in real master-game positions and turned into a rating with the same model the game review uses (Lichess scale; chess.com runs a little lower at club level). Pip thinks with a tiny engine written for this site; everyone else uses Stockfish, which downloads once (about 1.5 MB).</p><div class="opps botgrid">${BOTS.map(card).join("")}</div><h3>${ic("clock")}Clock</h3><div class="chips">${[[0, "No clock"], [180, "3 min"], [300, "5 min"], [600, "10 min"]].map(([s, n]) => `<button class="chip ${(st.clock || 0) === s ? "on" : ""}" data-clk="${s}" type="button">${n}</button>`).join("")}</div><h3>${ic("flag")}You play</h3><div class="chips">${[["w", "White"], ["b", "Black"], ["r", "Random"]].map(([k, n]) => `<button class="chip ${st.color === k ? "on" : ""}" data-col="${k}" type="button">${n}</button>`).join("")}</div><div class="row"><button class="btn" id="aiGo">Start the game</button></div></div>`;
}
GO.ai = aiMenu;
/* the player bar shows who and their rating */
const botBarName = (level) => { const b = botOf(level), e = botElo(b); return `${b.name}${e ? ` · ${e}` : ""}`; };
const botBarSub = (level) => botOf(level).tag;
/* calibration: how good is each character really? Run botCalib("escaped", 60) in the console; it prints the rating. */
async function botCalib(id, n = 60) {
  const level = BOTS.findIndex((b) => b.id === id) + 1, B = BOTS[level - 1], items = []; if (typeof rv === "undefined" || !rv) window.rv = { speed: "Rapid" };
  for (let k = 0; k < n; k++) {
    const g = rnd(EM), ply = 16 + Math.floor(Math.random() * Math.min(50, g.moves.length - 18)), fen = fenOf(g.moves.slice(0, ply)).fen(), c = new Chess(fen); if (c.game_over() || c.moves().length < 3) { k--; continue; }
    const a = await Sf.analyse(fen, { depth: 12, ms: 700, multipv: 1 }); if (!a.length) continue;
    let mv; if (B.kind === "small") mv = engineMove(c, B.small || 1); else { const r = await botMove(level, fen); mv = r; } if (!mv) continue;
    const mm = c.move({ from: mv.from, to: mv.to, promotion: mv.promotion || "q" }); if (!mm) continue; const after = c.fen();
    let cpA = a[0].mate != null ? (a[0].mate > 0 ? 1000 : -1000) : a[0].cp, cpAfter;
    if (c.game_over()) cpAfter = c.in_checkmate() ? 1000 : 0; else { const b = await Sf.analyse(after, { depth: 12, ms: 700, multipv: 1 }); cpAfter = b[0].mate != null ? (b[0].mate > 0 ? -1000 : 1000) : -b[0].cp; }   /* from the mover's point of view */
    const cl = (x) => Math.max(-800, Math.min(800, x)); items.push({ i: ply + 1, cls: "good", cpl: Math.max(0, cl(cpA) - cl(cpAfter)), cpb: cl(cpA) });
  }
  const r = rvRate(items); return { id, n: items.length, acpl: Math.round(items.reduce((s, x) => s + x.cpl, 0) / items.length), elo: r ? r.elo : null, lo: r ? r.lo : null, hi: r ? r.hi : null };
}
(() => { const s = document.createElement("style"); s.textContent = `
.hbots{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 10px;scroll-snap-type:x proximity}.hbot{flex:0 0 96px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 6px;border-radius:16px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);font:inherit;cursor:pointer;scroll-snap-align:start;transition:transform .25s,border-color .25s}.hbot:hover{transform:translateY(-4px);border-color:var(--gold)}.hbf{width:56px;height:56px;display:block}.hbf svg{width:100%;height:100%}.hbot b{font-size:12px;text-align:center}.hbot small{color:var(--gold);font-weight:800;font-size:14px}
.botgrid{grid-template-columns:repeat(auto-fill,minmax(210px,1fr))!important}.botcard{display:flex!important;flex-direction:column;align-items:center;gap:6px;text-align:center}.botcard .oppface{width:84px!important;height:84px!important}.botcard .oppface svg{width:100%;height:100%}
.council{position:relative;display:block;width:100%;height:100%}.council .cf{position:absolute;width:62%;height:62%;border-radius:50%;background:var(--panel);box-shadow:0 0 0 2px var(--gold),0 3px 8px #0006;overflow:hidden}.council .cf svg{width:100%!important;height:100%!important;display:block}.council .cf0{left:0;bottom:2%;z-index:1}.council .cf2{right:0;bottom:2%;z-index:1}.council .cf1{left:19%;top:0;z-index:2}
.botbf.sm{width:48px;height:48px;flex:none;display:inline-block}.botbf.sm svg{width:100%;height:100%}#pipc .botbf{width:96px;height:96px;flex:none;filter:drop-shadow(0 10px 18px #0007)}#pipc .botbf svg{width:100%;height:100%}#pipc .botbf .council{width:96px;height:96px}
.botelo{font:800 30px/1 var(--mono);color:var(--gold)}.botelo small{display:block;font:700 9px var(--mono);letter-spacing:.16em;text-transform:uppercase;opacity:.7;margin-top:2px}.bottag{font:700 11px var(--mono);letter-spacing:.1em;text-transform:uppercase;opacity:.85}
.botst{display:flex;flex-wrap:wrap;gap:4px;justify-content:center}.botst i{font-style:normal;font:700 10px var(--mono);padding:3px 8px;border-radius:99px;background:color-mix(in srgb,var(--gold) 16%,transparent);border:1px solid color-mix(in srgb,var(--gold) 35%,var(--line))}`; document.head.appendChild(s); })();

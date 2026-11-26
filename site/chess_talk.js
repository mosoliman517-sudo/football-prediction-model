/* ---------- what the characters notice during a game ----------
   After every half-move the position is checked twice: by the rules (captures, checks, castling, offers of material, odd
   moves) and by a small Stockfish of its own (who is better, and how much the last move cost). The most interesting thing
   found becomes one line. Event names are the kinds in src/bot_lines.json; "i" is the character, "u" is you. */
const TALK = (() => {
  let sf = null;
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  /* priority: 4 always speaks, 3 big, 2 ordinary, 1 filler. gap = fewest half-moves since the last line. */
  const GAP = { 4: 1, 3: 2, 2: 3, 1: 6 };
  const PRI = {
    u_sac_good: 4, u_sac_dubious: 4, u_sac_blunder: 4, my_sac: 4, my_sac_taken: 4, my_sac_declined: 3, u_sac_taken: 3,
    comeback: 4, collapse: 4, lost_queen: 4, took_queen: 4, u_brilliant: 4, u_blunder: 4, my_blunder: 4, promo_u: 4, promo_me: 4,
    trait: 3, check: 3, give_check: 2, escape: 2, ouch: 2, take: 2, trade: 2, castle_u: 2, u_aggressive: 2, u_passive: 2, u_weird: 3,
    ahead: 3, behind: 3, defend: 3, tense: 2, endgame: 3, mid: 2, open: 2, story: 1, taunt: 1,
  };
  const MAX_LINES = 34;

  /* what the side that just moved is offering: the biggest capture now open to the other side that nets them two or more points
     and was not already there before the move */
  function offered(before, after, mv) {
    const them = mv.color === "w" ? "b" : "w", took = VAL[mv.captured] || 0;
    const nets = (c) => {
      const out = {};
      for (const m of c.moves({ verbose: true })) {
        if (!m.captured || VAL[m.captured] < 3) continue;
        c.move(m); let back = 0;
        for (const r of c.moves({ verbose: true })) if (r.captured && r.to === m.to) back = Math.max(back, VAL[r.captured]);
        c.undo();
        const net = VAL[m.captured] - back;
        if (net >= 2 && (!out[m.to] || net > out[m.to].net)) out[m.to] = { sq: m.to, piece: m.captured, net };
      }
      return out;
    };
    const turned = rvTurn(before, them), old = turned ? nets(turned) : {};
    const fresh = Object.values(nets(new Chess(after))).filter((x) => (x.sq === mv.to || !old[x.sq]) && x.net - took >= 2);
    return fresh.sort((a, b) => b.net - a.net)[0] || null;
  }

  /* everything that can be seen from the rules alone. H = verbose history, f = the positions before and after the last move */
  function facts(H, fens, myColor) {
    const n = H.length, m = H[n - 1], before = fens[n - 1], after = fens[n], mine = m.color === myColor;   /* mine = the character's move */
    const c = new Chess(after), prev = H[n - 2], wasCheck = prev ? /[+#]/.test(prev.san) : false;
    let heavy = 0, queens = 0;
    c.board().forEach((r) => r.forEach((p) => { if (p && "nbrq".includes(p.type)) heavy += VAL[p.type]; if (p && p.type === "q") queens++; }));
    const rank = (sq) => +sq[1], fwd = m.color === "w" ? 1 : -1, home = m.color === "w" ? 1 : 8;
    const king = botKingSq(c, m.color === "w" ? "b" : "w");
    const near = king ? Math.max(Math.abs(m.to.charCodeAt(0) - king.charCodeAt(0)), Math.abs(rank(m.to) - rank(king))) : 8;
    const castle = m.flags.includes("k") || m.flags.includes("q");
    const recapture = !!(m.captured && prev && prev.captured && prev.to === m.to);
    const off = offered(before, after, m);
    const shuffle = !!(H[n - 3] && H[n - 3].from === m.to && H[n - 3].to === m.from && !m.captured);
    const retreat = !m.captured && m.piece !== "p" && m.piece !== "k" && rank(m.to) === home && rank(m.from) !== home;
    const weird = n <= 16 && ((m.piece === "q" && n <= 8 && !m.captured) || (m.piece === "k" && !castle && !wasCheck && !m.captured) || (m.piece === "p" && n <= 10 && /^[ah]/.test(m.to) && !m.captured) || (m.piece === "n" && /^[ah]/.test(m.to) && !m.captured));
    const aggressive = n >= 10 && !m.captured && near <= 2 && (rank(m.to) - rank(m.from)) * fwd > 0 && m.piece !== "k" && heavy > 20;
    return { n, m, mine, off, heavy, endgame: heavy <= 20, opening: n <= 12, recapture, wasCheck, castle, shuffle, retreat, weird, aggressive, check: /\+/.test(m.san), mate: /#/.test(m.san), queensGone: queens === 0 };
  }

  /* the events this half-move raised, most interesting first. ev = {after, loss, onlyBest} from the character's side, or null.
     S = what has already been said or is pending (kept between calls). */
  function events(F, ev, S, id) {
    const out = [], add = (k) => out.push(k), m = F.m, mine = F.mine, pending = S.pending;
    S.pending = null;
    const loss = ev ? ev.loss : null, me = ev ? ev.after : null;   /* me = the character's winning chances now, 0..100 */
    /* an offer made last move: was it taken or left? */
    if (pending && pending.n === F.n - 1) {
      const took = !!m.captured && m.to === pending.sq;
      if (pending.mine && !mine) add(took ? "my_sac_taken" : "my_sac_declined");
      else if (!pending.mine && mine && took) add("u_sac_taken");
    }
    /* a new offer */
    if (F.off && !F.mate && !F.recapture) {
      const uMe = me == null ? null : 100 - me;   /* your winning chances */
      if (!mine) {
        if (loss != null && loss >= 15) add("u_sac_blunder");
        else if (loss != null && loss >= 5) add("u_sac_dubious");
        else if (loss != null && uMe >= 40) add("u_sac_good");
        else add("u_sac_dubious");
      } else if (loss == null || loss < 20) add("my_sac");
      else add("my_blunder");
      S.pending = { n: F.n, sq: F.off.sq, mine };
    }
    if (m.promotion) add(mine ? "promo_me" : "promo_u");
    if (m.captured === "q" && !F.recapture) add(mine ? "took_queen" : "lost_queen");
    if (ev && !F.off && !F.mate) {
      if (loss >= 20) add(mine ? "my_blunder" : "u_blunder");
      else if (!mine && ev.onlyBest && !F.recapture && !F.wasCheck) add("u_brilliant");
    }
    if (ev) {
      /* the story of the game */
      if (me >= 75) S.wasUp = F.n; if (me <= 25) S.wasDown = F.n;
      if (S.wasDown != null && me >= 55) { add("comeback"); S.wasDown = null; }
      else if (S.wasUp != null && me <= 45) { add("collapse"); S.wasUp = null; }
      else if (me >= 80 && !S.said.ahead) add("ahead");
      else if (me <= 22 && !S.said.behind) add("behind");
      if (mine && me <= 35 && ev.onlyBest) add("defend");
      S.level = me > 38 && me < 62 ? S.level + 1 : 0;
      if (F.n >= 30 && S.level >= 8 && !S.said.tense) add("tense");
    }
    if (F.check) add(mine ? "give_check" : "check");
    else if (mine && F.wasCheck) add("escape");
    if (m.captured && m.captured !== "q") {
      if (F.recapture && m.captured !== "p") add("trade");
      else if (!F.recapture && m.captured !== "p") add(mine ? "take" : "ouch");
    }
    /* the thing each one is known for */
    if (mine && ((id === "berserker" && F.check) || (id === "trader" && m.captured && m.captured !== "p" && F.n > 8) || (id === "arteta" && F.n >= 8 && !m.captured && !F.check && F.quietChance) || (id === "bea" && m.piece === "b" && /^(b2|g2|b7|g7)$/.test(m.to)))) add("trait");
    if (!mine && F.castle) add("castle_u");
    if (!mine && F.weird) add("u_weird");
    if (!mine && F.aggressive) add("u_aggressive");
    if (!mine && (F.shuffle || F.retreat) && F.n > 10) add("u_passive");
    if (F.endgame && !S.said.endgame) add("endgame");
    else if (F.n >= 18 && F.n <= 30 && !F.endgame && !S.said.mid) add("mid");
    if (F.opening && F.n >= 3 && !S.custom && (S.said.open || 0) < 2) add("open");
    if (F.n >= 8) add(S.chat % 2 ? "story" : "taunt");
    return out.sort((a, b) => PRI[b] - PRI[a]);
  }

  const fresh = (custom) => ({ said: {}, pending: null, wasUp: null, wasDown: null, level: 0, chat: 0, lines: 0, last: -9, custom, seen: 0, evals: [] });

  /* Stockfish's view of one position, as the character's winning chances */
  async function look(fen, myColor) {
    const c = new Chess(fen);
    if (c.game_over()) return null;
    sf = sf || mkSf();
    const lines = await sf.analyse(fen, { skill: 20, depth: 12, ms: 350, multipv: 2 });
    if (!lines.length) return null;
    const turn = c.turn(), mineOf = (l) => { const w = lineW(l, turn).w; return myColor === "w" ? w : 100 - w; };
    const best = mineOf(lines[0]), second = lines[1] ? mineOf(lines[1]) : best;
    return { me: best, best: lines[0].pv[0], gap: Math.abs(best - second), turn };
  }

  /* what the last move cost the side that played it, and whether it was the only good one */
  function judge(prev, now, m, myColor, mine) {
    if (!now) return null;
    if (!prev) return { after: now.me, loss: 0, onlyBest: false };
    const mover = (x) => (mine ? x : 100 - x), loss = Math.max(0, mover(prev.me) - mover(now.me));
    const uci = m.from + m.to + (m.promotion || "");
    return { after: now.me, loss, onlyBest: prev.best === uci && prev.gap >= 28 && loss <= 3 };
  }

  /* Arteta's squad: who each of his pieces is, by the square it started on (file a to h) */
  const SQUAD = { back: ["Gabriel", "Eze", "Odegaard", "Bruno", "Raya", "Rice", "Saka", "Saliba"], pawns: ["Calafiori", "Lewis-Skelly", "Zubimendi", "Merino", "Gyokeres", "Havertz", "Timber", "White"] };
  /* follow every piece through the moves; returns for each half-move {mover, taken} = player names (or null when it was not one of his) */
  function squad(H, colour) {
    const at = {}, rank = colour === "w" ? ["1", "2"] : ["8", "7"];
    "abcdefgh".split("").forEach((f, i) => { at[f + rank[0]] = SQUAD.back[i]; at[f + rank[1]] = SQUAD.pawns[i]; });
    return H.map((m) => {
      const his = m.color === colour, gone = m.flags.includes("e") ? m.to[0] + m.from[1] : m.to;
      let taken = null, mover = null;
      if (his) {
        mover = at[m.from] || null; delete at[m.from]; if (mover) at[m.to] = mover;
        if (m.flags.includes("k") || m.flags.includes("q")) { const r = m.from[1], a = (m.flags.includes("k") ? "h" : "a") + r, b = (m.flags.includes("k") ? "f" : "d") + r; if (at[a]) { at[b] = at[a]; delete at[a]; } }
      } else if (m.captured) { taken = at[gone] || null; delete at[gone]; }
      return { mover, taken };
    });
  }

  /* which of his player lines fits this event, if any */
  function playerKind(ev, H, colour) {
    const who = squad(H, colour), n = H.length - 1, m = H[n], w = who[n];
    if (ev === "check") return "check:Raya";
    if ((ev === "ouch" || ev === "lost_queen" || ev === "my_sac_taken") && w.taken) return "lost:" + w.taken;
    if ((ev === "take" || ev === "trade" || ev === "took_queen") && m.color === colour && w.mover) return "take:" + w.mover;
    if ((ev === "story" || ev === "taunt" || ev === "trait") && Math.random() < 0.5) {
      const last = m.color === colour ? w.mover : who[n - 1] && who[n - 1].mover;
      return last ? "move:" + last : null;
    }
    return null;
  }

  return { PRI, GAP, MAX_LINES, offered, facts, events, fresh, look, judge, squad, playerKind };
})();

/* which kinds can stand in when a character has no line of its own for an event */
const TALK_ALSO = { give_check: ["trait"], take: ["taunt"], u_sac_taken: ["take"], took_queen: ["take"], lost_queen: ["ouch"], my_sac: ["trait"] };

/* the next line of a kind, never repeating until the whole pool has been heard, across games too */
function botFresh(botId, kind, pool) {
  const key = (x) => (Array.isArray(x) ? x[1] : x), K = "bk_said_" + botId;
  let all; try { all = JSON.parse(localStorage.getItem(K)) || {}; } catch (e) { all = {}; }
  let used = (all[kind] || []).filter((t) => pool.some((x) => key(x) === t));
  let left = pool.filter((x) => !used.includes(key(x)));
  if (!left.length) { const lastSaid = used[used.length - 1]; used = []; left = pool.filter((x) => key(x) !== lastSaid); if (!left.length) left = pool; }
  const pick = left[Math.floor(Math.random() * left.length)];
  used.push(key(pick)); all[kind] = used;
  try { localStorage.setItem(K, JSON.stringify(all)); } catch (e) { /* rotation just resets next visit */ }
  return pick;
}

function botWatch() {
  if (!st || st.game !== "ai" || !live || st.over) return;
  const H = live.c.history({ verbose: true }), n = H.length;
  const T = st.talk = st.talk || TALK.fresh(false);
  if (T.seen === n) return;
  T.seen = n;
  if (!n) return;
  const B = botOf(st.level), L = BOT_LINES[B.id]; if (!L) return;
  /* rebuild the positions from the game itself, so a game started from a position works too */
  const walk = new Chess(); walk.load(live.c.header().FEN || new Chess().fen());
  T.custom = !!live.c.header().FEN;
  const fens = [walk.fen()]; H.forEach((x) => { walk.move({ from: x.from, to: x.to, promotion: x.promotion }); fens.push(walk.fen()); });
  const me = st, myColor = live.color === "w" ? "b" : "w";
  const F = TALK.facts(H, fens, myColor);
  const pre = new Chess(fens[n - 1]); F.quietChance = pre.moves({ verbose: true }).some((z) => z.captured && BV[z.captured] >= 3);
  const evalOf = (k) => (T.evals[k] = T.evals[k] || TALK.look(fens[k], myColor).catch(() => null));
  const both = Promise.all([evalOf(n - 1), evalOf(n)]);
  const slow = new Promise((res) => setTimeout(() => res([null, null]), 3000));
  T.chain = (T.chain || Promise.resolve()).then(() => Promise.race([both, slow])).then(([a, b]) => {
    if (st !== me || me.over || !live || live.c.history().length - n > 2) return;
    const ev = TALK.judge(a, b, F.m, myColor, F.mine);
    const list = TALK.events(F, ev, T, B.id);
    if (T.lines >= TALK.MAX_LINES) return;
    for (const ev1 of list) {
      const pri = TALK.PRI[ev1], kind = [ev1, ...(TALK_ALSO[ev1] || [])].find((k) => L[k] && L[k].length);
      if (!kind || n - T.last < TALK.GAP[pri]) continue;
      if (performance.now() < (st.talkUntil || 0) && pri <= (st.talkPri || 0)) return;   /* do not talk over a line that matters as much */
      if (ev1 === "story" || ev1 === "taunt") { if (Math.random() < 0.45) return; T.chat++; }
      T.said[ev1] = (T.said[ev1] || 0) + 1; T.lines++; T.last = n; st.talkPri = pri;
      const named = B.id === "arteta" && !T.custom ? TALK.playerKind(ev1, H, myColor) : null;   /* from a set position nobody knows who is who */
      botSay(named && L[named] ? named : kind);
      return;
    }
  }).catch(() => { /* talk never breaks a game */ });
}

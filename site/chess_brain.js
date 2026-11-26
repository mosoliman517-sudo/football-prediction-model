/* ---------- how The Escaped and Arteta choose a move ----------
   Objective quality comes first. Stockfish lists the best moves with what each one costs in winning chances (percentage
   points, "loss"). Style is a bonus measured in those same points and kept small, so it picks between moves of similar
   quality and can never outweigh a bad one. The one exception is a sacrifice, which is searched two plies deeper and
   accepted only when it is sound (costs little) or speculative (costs more, but leaves a real attack and a playable
   position). Strength is set by three numbers per character, tuned by playing matches (tests/bot_arena.js):
   search depth (sacrifices are always checked deeper), how much chance (noise) decides between close moves, and how often a smaller, human mistake slips in. */
const BRAIN = (() => {
  const P = {
    escaped: { depth: 7, verify: 11, ms: 1000, multi: 8, noise: 1.2, slip: 0.04, slipMax: 13, maxLoss: 8, spec: 12, floor: 30, specPerGame: 3, sound: 11, wild: 13, weigh: 1.1 },
    arteta: { depth: 7, verify: 9, ms: 1000, multi: 8, noise: 0.5, slip: 0, slipMax: 12, maxLoss: 6, spec: 0, floor: 100, specPerGame: 0, sound: 0, wild: 0, weigh: 1.4 },
  };
  /* openings in the character's own taste; followed while the game stays on one of them */
  const BOOK = {
    escaped: {
      w: ["e4 e5 f4 exf4 Nf3 g5 Bc4", "e4 e5 Nf3 Nc6 d4 exd4 Bc4 Nf6 e5 d5", "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4", "e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6 Bc4", "e4 e6 d4 d5 Nc3 Nf6 Bg5", "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4", "e4 d5 exd5 Qxd5 Nc3 Qa5 d4", "e4 d6 d4 Nf6 Nc3 g6 f4"],
      b: ["e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6", "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5", "e4 c5 Nc3 Nc6 g3 g6", "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5", "d4 Nf6 c4 c5 d5 b5 cxb5 a6", "d4 Nf6 c4 e6 Nf3 c5 d5 exd5 cxd5 d6", "d4 Nf6 Nf3 g6", "c4 e5 Nc3 Nf6", "Nf3 c5"],
    },
    arteta: {
      w: ["d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3", "d4 Nf6 Bf4 e6 e3 d5 Nf3 c5 c3", "d4 g6 Bf4 Bg7 e3 d6 Nf3", "e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6 c3 d6 O-O O-O", "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4", "e4 e6 d4 d5 exd5 exd5 Bd3", "e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3", "e4 c5 c3 d5 exd5 Qxd5 d4"],
      b: ["e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6", "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2", "e4 c6 d4 d5 exd5 cxd5", "e4 c6 Nc3 d5 Nf3 Bg4", "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O", "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4", "d4 d5 Nf3 Nf6 Bf4 e6", "d4 d5 Bf4 Nf6 e3 e6", "c4 e6 Nc3 d5", "Nf3 d5 g3 c6"],
    },
  };
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }, ROOK_FILES = "abcdefgh";
  let engine = null;
  const uciOf = (m) => m.from + m.to + (m.promotion || "");
  const rnd = () => Math.random(), gumbel = () => -Math.log(-Math.log(Math.min(0.999999, Math.max(1e-6, rnd()))));

  function book(id, history) {
    if (!history || history.length > 14) return null;
    const side = history.length % 2 ? "b" : "w", on = BOOK[id][side].map((l) => l.split(" ")).filter((l) => l.length > history.length && history.every((m, k) => l[k] === m));
    return on.length ? on[Math.floor(rnd() * on.length)][history.length] : null;
  }

  /* ---- what a position looks like ---- */
  const squares = (c) => { const out = []; c.board().forEach((row, r) => row.forEach((p, f) => { if (p) out.push({ ...p, f, r: 8 - r, sq: ROOK_FILES[f] + (8 - r) }); })); return out; };
  /* how hard `us` is pressing the other king: how many of our moves land on or next to it (a queen's counts more) */
  function pressure(fen, us) {
    const t = rvTurn(fen, us); if (!t) return 3;   /* we are giving check */
    const c = new Chess(fen), king = botKingSq(c, us === "w" ? "b" : "w"); if (!king) return 0;
    const near = (sq) => Math.max(Math.abs(sq.charCodeAt(0) - king.charCodeAt(0)), Math.abs(+sq[1] - +king[1])) <= 1;
    const who = {}; for (const m of t.moves({ verbose: true })) if (near(m.to)) who[m.from] = m.piece === "q" ? 2 : 1;
    return Object.values(who).reduce((a, b) => a + b, 0);
  }
  /* 0 (snug) to 3 (bare): missing pawns in front of a king, and whether it is still in the middle */
  function exposure(fen, colour) {
    const c = new Chess(fen), P_ = squares(c), k = P_.find((p) => p.type === "k" && p.color === colour); if (!k) return 0;
    const dir = colour === "w" ? 1 : -1; let shield = 0;
    for (let df = -1; df <= 1; df++) if (P_.some((p) => p.type === "p" && p.color === colour && p.f === k.f + df && (p.r - k.r) * dir >= 1 && (p.r - k.r) * dir <= 2)) shield++;
    return Math.max(0, 3 - shield - (k.f === 0 || k.f === 7 ? 1 : 0)) + (k.f >= 3 && k.f <= 4 ? 1 : 0);
  }
  const material = (c, col) => squares(c).reduce((a, p) => a + (p.color === col ? VAL[p.type] : -VAL[p.type]), 0);
  const heavy = (c) => squares(c).reduce((a, p) => a + (p.type === "p" || p.type === "k" ? 0 : VAL[p.type]), 0);
  const openFile = (c, f) => !squares(c).some((p) => p.type === "p" && p.f === f);
  function centre(fen, us) {
    const t = rvTurn(fen, us); if (!t) return 0; const set = new Set(["d4", "e4", "d5", "e5", "c4", "f4", "c5", "f5"]); let n = 0;
    for (const m of t.moves({ verbose: true })) if (set.has(m.to)) n += "de".includes(m.to[0]) && "45".includes(m.to[1]) ? 1 : 0.4;
    return n;
  }
  const mobility = (fen, us) => { const t = rvTurn(fen, us); return t ? t.moves().length : 0; };

  /* ---- style: a small bonus, in winning-chance points ---- */
  function features(fen, m) {
    const us = m.color, them = us === "w" ? "b" : "w", after = new Chess(fen); after.move({ from: m.from, to: m.to, promotion: m.promotion });
    const a = after.fen(), before = new Chess(fen);
    const trade = !!m.captured && VAL[m.captured] <= VAL[m.piece] && after.moves({ verbose: true }).some((r) => r.captured && r.to === m.to);
    return {
      m, after, check: /[+#]/.test(m.san), trade, queenTrade: trade && m.captured === "q",
      press: pressure(a, us) - pressure(fen, us), pressNow: pressure(a, us), bare: exposure(a, them), ownBare: exposure(a, us) - exposure(fen, us),
      storm: m.piece === "p" && !m.captured && (() => { const k = botKingSq(after, them); return !!k && Math.abs(m.to.charCodeAt(0) - k.charCodeAt(0)) <= 1 && (us === "w" ? +m.to[1] >= 4 : +m.to[1] <= 5) && (k[1] === (them === "w" ? "1" : "8") || k[1] === (them === "w" ? "2" : "7")); })(),
      opens: !!m.captured && m.piece === "p" && (() => { const k = botKingSq(after, them); const f = m.from.charCodeAt(0) - 97; return !!k && Math.abs(f - (k.charCodeAt(0) - 97)) <= 1 && openFile(after, f); })(),
      castle: m.flags.includes("k") || m.flags.includes("q"), ply: before.history().length,
      plyNo: (+fen.split(" ")[5] - 1) * 2 + (us === "b" ? 1 : 0), mat: material(before, us), ending: heavy(before) <= 20,
    };
  }
  function styleEscaped(F, x) {
    const m = F.m; let s = 0;
    s += F.check ? 2 : 0;
    s += Math.max(-3, Math.min(6, F.press * 1.6)) + Math.min(2.5, F.pressNow * 0.3) * (F.bare >= 2 ? 1.5 : 1);
    s += (F.storm ? 2.8 : 0) + (F.opens ? 2.8 : 0);
    if (F.trade && !x.winning) s -= F.queenTrade ? 8 : 3;   /* keep the pieces on while there is something to attack with */
    if (m.piece === "n" || m.piece === "b") s += F.plyNo < 20 && (m.from[1] === "1" || m.from[1] === "8") ? 1.5 : 0;
    s += F.castle && F.plyNo < 24 ? 1 : 0;
    return Math.max(-8, Math.min(9, s));
  }
  /* the wall: king safe first, everyone close to home, swap pieces off, then squeeze the ending */
  function styleArteta(F, fen, x) {
    const m = F.m, us = m.color, them = us === "w" ? "b" : "w", a = F.after.fen(), rank = (sq) => (us === "w" ? +sq[1] : 9 - +sq[1]); let s = 0;
    if (F.ending) {   /* now he plays to win it, slowly: trade down when ahead, bring the king in, push what can be pushed */
      if (F.trade) s += F.mat >= 1 ? 3 : 0;
      return s + (m.piece === "k" ? 0.8 : 0) + (m.piece === "p" && F.mat >= 1 ? 0.8 : 0);
    }
    s += F.castle ? 5 : 0;
    s -= Math.max(0, F.ownBare) * 3 + (m.piece === "k" && !F.castle ? 1.5 : 0);
    if (F.trade) s += F.mat <= -2 ? 0.5 : F.queenTrade ? 5 : 2.5;
    s += Math.max(-3, Math.min(3, (pressure(fen, them) - pressure(a, them)) * 1.2));   /* take their attackers away */
    if (m.piece !== "k" && !F.castle) s -= Math.max(0, rank(m.to) - 4) * 1.4 + (F.storm ? 3 : 0);   /* stay on our side */
    if (!m.captured && m.piece !== "p" && rank(m.to) < rank(m.from)) s += 0.8;   /* regroup */
    if (F.plyNo < 20) s += ((m.piece === "n" || m.piece === "b") && rank(m.from) === 1 && rank(m.to) <= 3 ? 2.5 : 0) - (m.piece === "q" && !m.captured ? 2 : 0) + (m.piece === "p" && "cde".includes(m.to[0]) && rank(m.to) <= 4 ? 1 : 0);
    s -= F.check && !m.captured ? 0.8 : 0;
    return Math.max(-7, Math.min(7, s));
  }

  /* ---- sacrifices ---- */
  const isOffer = (fen, F) => { const off = TALK.offered(fen, F.after.fen(), F.m); return off && (VAL[F.m.captured] || 0) < VAL[off.piece] ? off : null; };
  /* "sound", "speculative" or null (no justification): x = {loss, win after, mate} from the deeper search */
  function judgeSac(p, F, off, x, used, behind) {
    if (x.mate != null && x.mate > 0) return "sound";
    if (x.loss <= 3.5) return "sound";
    const attack = F.check || F.press >= 2 || (F.pressNow >= 3 && F.bare >= 1) || F.opens;
    if (p.spec && x.loss <= p.spec && x.win >= p.floor && attack && used < p.specPerGame && behind > -3 && (off.piece !== "q" || x.loss <= 5)) return "speculative";
    return null;
  }

  async function move(id, fen, history, past) {
    const p = P[id], c = new Chess(fen), legal = c.moves({ verbose: true }); if (!legal.length) return null;
    const out = (m, why) => ({ from: m.from, to: m.to, promotion: m.promotion, why });
    if (legal.length === 1) return out(legal[0], "forced");
    const b = book(id, history); if (b) { const m = legal.find((l) => l.san === b); if (m) return out(m, "book"); }
    engine = engine || mkSf();
    const lines = await engine.analyse(fen, { skill: 20, depth: p.depth, ms: p.ms, multipv: Math.min(p.multi, legal.length) });
    if (!lines.length) return null;
    const val = (l) => ({ win: winOf(l), mate: l.mate });
    const best = Math.max(...lines.map(winOf));
    const byUci = new Map(legal.map((m) => [uciOf(m), m]));
    let cands = lines.map((l) => ({ m: byUci.get(l.pv[0]), ...val(l), loss: best - winOf(l) })).filter((x) => x.m);
    const mating = cands.filter((x) => x.mate != null && x.mate > 0).sort((a, b2) => a.mate - b2.mate)[0];
    if (mating) return out(mating.m, "mate");
    const safe = cands.filter((x) => !(x.mate != null && x.mate < 0)); if (safe.length) cands = safe;

    /* a piece left for nothing is taken, whatever the style would rather do */
    const free = cands.filter((x) => { if (VAL[x.m.captured] < 3 || !x.m.captured || x.loss > 4) return false; const t = new Chess(fen); t.move({ from: x.m.from, to: x.m.to, promotion: x.m.promotion }); return !t.moves({ verbose: true }).some((r) => r.captured && r.to === x.m.to); }).sort((a, b2) => VAL[b2.m.captured] - VAL[a.m.captured] || a.loss - b2.loss)[0];
    if (free) return out(free.m, "free");

    /* every offer of material, including ones the first search did not list, looked at more deeply */
    const offers = [];
    for (const m of legal) {
      if (!m.captured && m.piece === "k") continue;
      const F = features(fen, m), off = isOffer(fen, F); if (off) offers.push({ m, F, off, heat: (F.check ? 3 : 0) + Math.max(0, F.press) + (F.opens ? 2 : 0) + (m.captured ? 1 : 0) });
    }
    let sacs = [];
    if (offers.length) {
      const pick = offers.sort((a, b2) => b2.heat - a.heat).slice(0, id === "escaped" ? 7 : 4);
      const deep = await engine.analyse(fen, { skill: 20, depth: p.verify, ms: p.ms, multipv: pick.length, moves: pick.map((x) => uciOf(x.m)) }).catch(() => []);
      const behind = material(c, c.turn()), used = past ? past.spec : 0;
      for (const l of deep) {
        const o = pick.find((x) => uciOf(x.m) === l.pv[0]); if (!o) continue;
        const x = { m: o.m, ...val(l), loss: Math.max(0, best - winOf(l)), F: o.F };
        x.kind = judgeSac(p, o.F, o.off, x, used, behind); sacs.push(x);
      }
    }
    const offered = new Set(offers.map((o) => uciOf(o.m)));
    /* an offer with no justification is only ever played if it is simply the best move on the board */
    cands = cands.filter((x) => !offered.has(uciOf(x.m)) || x.loss <= 1.5);
    const winning = best >= 75, limit = best >= 90 || best <= 10 ? 3 : p.maxLoss;
    cands = cands.filter((x) => x.loss <= p.slipMax);
    for (const s of sacs) if (s.kind) { cands = cands.filter((x) => uciOf(x.m) !== uciOf(s.m)); cands.push(s); }
    if (!cands.length) cands = [{ m: byUci.get(lines[0].pv[0]) || legal[0], loss: 0, win: best }];

    /* a human slip: now and then a lesser move, never when one move is clearly the point of the position, never one that
       just leaves something hanging */
    const sorted = [...cands].sort((a, b2) => a.loss - b2.loss), gap = sorted[1] ? sorted[1].loss - sorted[0].loss : 99;
    const slip = rnd() < p.slip && gap < 14 && best > 8 && best < 92;
    const seen = new Set(past ? past.fens : []);
    const scored = cands.map((x) => {
      const F = x.F || features(fen, x.m), sacBonus = x.kind === "sound" ? p.sound : x.kind === "speculative" ? p.wild : 0;
      let s = (id === "escaped" ? styleEscaped(F, { winning }) : styleArteta(F, fen, { winning })) + sacBonus;
      if (best >= 60 && seen.has(F.after.fen().split(" ").slice(0, 4).join(" "))) s = Math.min(s, 0) - 20;   /* do not repeat a good position away */
      if (F.after.in_stalemate() && best > 40) s -= 100;
      const allowed = x.kind ? p.spec : slip ? p.slipMax : limit;
      const q = slip && x.loss >= 5 ? 6 : 0;
      return { x, ok: x.loss <= allowed, score: -x.loss * (slip ? 0.15 : 1) + s * p.weigh * (winning && id === "escaped" ? 0.5 : 1) + q + gumbel() * p.noise };
    }).filter((y) => y.ok).sort((a, b2) => b2.score - a.score);
    const chosen = scored.length ? scored[0].x : sorted[0];
    return out(chosen.m, chosen.kind || (slip && chosen.loss >= 5 ? "slip" : "move"));
  }

  return { P, BOOK, move, book, pressure, exposure, features, judgeSac };
})();

/* these two choose their moves above; the other characters keep their own rules */
{
  const _botMove = botMove;
  botMove = async function (level, fen, history) {
    const B = botOf(level); if (!BRAIN.P[B.id]) return _botMove(level, fen, history);
    /* what happened before in this game: the positions reached (not to repeat one by accident) and speculative sacrifices made */
    const mem = botMove.mem && botMove.mem.st === st && fen.split(" ")[5] >= botMove.mem.no ? botMove.mem : (botMove.mem = { st, fens: [], spec: 0, no: 1 });
    mem.no = +fen.split(" ")[5]; mem.fens.push(fen.split(" ").slice(0, 4).join(" "));
    const r = await BRAIN.move(B.id, fen, history, mem);
    if (r && r.why === "speculative") mem.spec++;
    if (r) { const c = new Chess(fen); if (c.move({ from: r.from, to: r.to, promotion: r.promotion || "q" })) mem.fens.push(c.fen().split(" ").slice(0, 4).join(" ")); }
    return r;
  };
}

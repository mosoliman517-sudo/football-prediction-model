/* Match harness for the characters, run inside the chess page (copy to docs/chess/ for a test, never commit it there).
   ARENA.run({bot, elo, games, tag}) plays the character against Stockfish limited to a UCI_Elo, from eight short openings with
   both colours. A third Stockfish (depth 12) referees: it adjudicates decided games and grades every one of the character's
   moves. Results collect in ARENA.log[tag]; ARENA.sum(tag) gives score, performance rating, average loss, blunders and
   sacrifices. UCI_Elo is Stockfish's own scale (set from engine-versus-engine games), not a human federation rating. */
window.ARENA = (() => {
  const OPEN = ["e4 e5 Nf3 Nc6", "d4 d5 c4 e6", "e4 c5 Nf3 d6", "d4 Nf6 c4 g6", "e4 e6 d4 d5", "c4 e5 Nc3 Nf6", "e4 c6 d4 d5", "Nf3 d5 g3 Nf6"];
  const log = {};
  function limited(elo) {
    const w = new Worker(SF17_URL); let done = null;
    const ready = new Promise((res) => { w.onmessage = (e) => { const s = String(e.data); if (s === "uciok") { w.postMessage("setoption name Hash value 16"); w.postMessage("setoption name UCI_LimitStrength value true"); w.postMessage("setoption name UCI_Elo value " + elo); w.postMessage("isready"); } else if (s === "readyok") res(); else if (s.startsWith("bestmove") && done) { const f = done; done = null; f(s.split(" ")[1]); } }; w.postMessage("uci"); });
    return { move: (fen) => ready.then(() => new Promise((res) => { done = res; w.postMessage("position fen " + fen); w.postMessage("go movetime 400"); })), close: () => w.terminate() };
  }
  async function game(o, k, ref) {
    const self = /^sf:/.test(o.bot) ? limited(+o.bot.slice(3)) : null, bot = BOTS.findIndex((b) => b.id === o.bot) + 1, botColor = k % 2 ? "b" : "w", c = new Chess(), opp = limited(o.elo);
    OPEN[Math.floor(k / 2) % OPEN.length].split(" ").forEach((m) => c.move(m));
    const mem = { fens: [], spec: 0 };
    const rec = { why: {}, k, color: botColor, moves: 0, loss: 0, blunders: [], sacs: [], result: null, ms: 0 };
    let lastCp = 0; const items = []; const look = async (fen) => { const t = new Chess(fen); if (t.game_over()) { lastCp = t.in_checkmate() ? (t.turn() === botColor ? -800 : 800) : 0; return t.in_checkmate() ? (t.turn() === botColor ? 0 : 100) : 50; } const l = await ref.analyse(fen, { depth: 12, ms: 250 }); const e = lineW(l[0], t.turn()), cp = Math.max(-800, Math.min(800, e.cp)); lastCp = botColor === "w" ? cp : -cp; return botColor === "w" ? e.w : 100 - e.w; };
    let win = await look(c.fen()), up = 0, down = 0;
    while (!c.game_over() && c.history().length < 200) {
      const mine = c.turn() === botColor, before = c.fen(), cpb = lastCp; let m;
      if (mine) { const t0 = performance.now(); let r; if (self) { const u = await self.move(before); r = { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }; } else r = await (BRAIN.P[o.bot] ? BRAIN.move(o.bot, before, c.history(), mem).then((r2) => { mem.fens.push(before.split(" ").slice(0, 4).join(" ")); if (r2.why === "speculative") mem.spec++; rec.why[r2.why] = (rec.why[r2.why] || 0) + 1; const after = new Chess(before); if (after.move({ from: r2.from, to: r2.to, promotion: r2.promotion || "q" })) mem.fens.push(after.fen().split(" ").slice(0, 4).join(" ")); return r2; }) : botMove(bot, before, c.history())); rec.ms += performance.now() - t0; m = c.move({ from: r.from, to: r.to, promotion: r.promotion || "q" }); }
      else { const u = await opp.move(before); m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); }
      if (!m) { rec.result = "error"; rec.err = before; break; }
      const now = await look(c.fen());
      if (mine) {
        const loss = Math.max(0, win - now); rec.moves++; rec.loss += loss; items.push({ i: c.history().length, cls: "good", cpl: Math.max(0, cpb - lastCp), cpb });
        if (loss >= 20) rec.blunders.push({ fen: before, san: m.san, loss: Math.round(loss) });
        const off = TALK.offered(before, c.fen(), m);
        if (off && !(m.captured && "pnbrq".indexOf(m.captured) >= "pnbrq".indexOf(off.piece))) rec.sacs.push({ san: m.san, piece: off.piece, loss: Math.round(loss), after: Math.round(now) });
      }
      win = now; up = win >= 96 ? up + 1 : 0; down = win <= 4 ? down + 1 : 0;
      if (up >= 8) { rec.result = 1; break; } if (down >= 8) { rec.result = 0; break; }
    }
    if (rec.result == null) rec.result = c.in_checkmate() ? (c.turn() === botColor ? 0 : 1) : c.game_over() ? 0.5 : win >= 75 ? 1 : win <= 25 ? 0 : 0.5;
    if (typeof rv === "undefined" || !rv) rv = { speed: "Rapid" }; else if (!rv.speed) rv.speed = "Rapid"; const rr = rvRate(items); rec.lichess = rr ? rr.elo : null; rec.plies = c.history().length; if (self) self.close(); rec.pgn = c.history().join(" "); opp.close();
    return rec;
  }
  async function run(o) {
    const out = (log[o.tag] = log[o.tag] || { o, games: [], running: true }); out.running = true;
    let next = o.from || 0; const end = next + o.games;
    const lane = async () => { const ref = mkSf(); while (next < end) { const k = next++; try { out.games.push(await game(o, k, ref)); } catch (e) { out.games.push({ k, result: "error", err: String(e) }); } try { localStorage.setItem("arena_" + o.tag, JSON.stringify(out.games)); } catch (e) { /* full */ } } };
    await Promise.all(Array.from({ length: o.lanes || 3 }, lane)); out.running = false;
  }
  function sum(tag) {
    const g = (log[tag] ? log[tag].games : []).filter((x) => typeof x.result === "number"), n = g.length; if (!n) return { n: 0, errors: log[tag] && log[tag].games.length };
    const score = g.reduce((a, x) => a + x.result, 0) / n, s = Math.min(1 - 0.5 / n, Math.max(0.5 / n, score)), perf = Math.round(log[tag].o.elo - 400 * Math.log10(1 / s - 1));
    const moves = g.reduce((a, x) => a + x.moves, 0), se = Math.sqrt(s * (1 - s) / n), r = (p) => Math.round(log[tag].o.elo - 400 * Math.log10(1 / Math.min(0.99, Math.max(0.01, p)) - 1));
    const sacs = g.flatMap((x) => x.sacs);
    return { n, vs: log[tag].o.elo, w: g.filter((x) => x.result === 1).length, d: g.filter((x) => x.result === 0.5).length, l: g.filter((x) => x.result === 0).length, score: +score.toFixed(3), perf, range95: [r(s - 1.96 * se), r(s + 1.96 * se)],
      avgLoss: +(g.reduce((a, x) => a + x.loss, 0) / moves).toFixed(2), blundersPer100: +(100 * g.reduce((a, x) => a + x.blunders.length, 0) / moves).toFixed(1),
      sacsPerGame: +(sacs.length / n).toFixed(2), sacSound: sacs.filter((x) => x.loss <= 4).length, sacSpec: sacs.filter((x) => x.loss > 4 && x.loss <= 12).length, sacBad: sacs.filter((x) => x.loss > 12).length,
      reviewRating: Math.round(g.reduce((a, x) => a + (x.lichess || 0), 0) / g.filter((x) => x.lichess).length), why: g.reduce((a, x) => { Object.entries(x.why || {}).forEach(([k2, v]) => { a[k2] = (a[k2] || 0) + v; }); return a; }, {}), msPerMove: Math.round(g.reduce((a, x) => a + x.ms, 0) / moves), running: log[tag].running, errors: log[tag].games.length - n };
  }
  return { run, sum, log };
})();

/* Tactical sanity for the two characters with their own move chooser. Load in the chess page; sets window.BRAIN_RESULT.
   Each position is tried several times (the chooser uses chance), and the share of acceptable answers is reported. */
window.BRAIN_TEST = async (tries = 6) => {
  const out = {};
  const T = [
    ["mate in one", "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", (m) => m.san === "Rd8#", 1],
    ["takes a free queen", "rnb1kbnr/pppp1ppp/8/4p1q1/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4", (m) => m.san === "Nxg5", 1],
    ["takes a free knight", "4k3/pp3ppp/8/3n4/8/8/PP3PPP/3RK3 w - - 0 1", (m) => m.san === "Rxd5", 1],
    ["saves an attacked queen", "rnb1kbnr/pppp1ppp/8/4p3/4P3/2N2N2/PPPP1qPP/R1BQKB1R w KQkq - 0 5", (m) => m.san === "Kxf2", 1],
    ["finds the smothered mate", "5r1k/6pp/7N/8/8/1Q6/8/6K1 w - - 0 1", (m) => m.san === "Qg8+", 1],
    ["takes the fork", "r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/4K2R w Kkq - 0 1", (m) => m.san === "Nxc7+", 1],
    ["stops mate in one", "6k1/5ppp/8/8/8/8/r4PPP/1R4K1 b - - 0 1", (m, c) => !c.moves().some((x) => x.includes("#")), 1],
  ];
  for (const id of ["escaped", "arteta"]) {
    out[id] = {};
    for (const [name, fen, good, need] of T) {
      let ok = 0; const seen = {};
      for (let k = 0; k < tries; k++) { const c = new Chess(fen), r = await BRAIN.move(id, fen, null, { fens: [], spec: 0 }), m = c.move({ from: r.from, to: r.to, promotion: r.promotion || "q" }); seen[m.san] = (seen[m.san] || 0) + 1; if (good(m, c)) ok++; }
      out[id][name] = { share: +(ok / tries).toFixed(2), pass: ok / tries >= need, played: seen };
    }
  }
  window.BRAIN_RESULT = out; return out;
};

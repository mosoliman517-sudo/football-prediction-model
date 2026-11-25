/* Labelled positions for the game-review detectors. Open the chess page, paste this file into the console: it prints
   precision and recall per detector. Each case: [detector, FEN, SAN moves, expected]. */
await (async () => {
  const CASES = [
    ["fork", "r3k3/8/4N3/8/8/8/8/4K3 w - - 0 1", ["Nc7+"], true],
    ["fork", "4k3/8/8/2n1n3/8/8/3P4/4K3 w - - 0 1", ["d4"], true],
    ["pin", "4k3/8/2n5/8/8/8/4B3/4K3 w - - 0 1", ["Bb5"], true],
    ["skewer", "3q4/8/8/8/3k4/8/8/R3K3 w - - 0 1", ["Rd1+"], true],
    ["discovered attack", "4q1k1/8/8/8/4B3/8/8/4R1K1 w - - 0 1", ["Bb7"], true],
    ["fork", "4k3/8/8/8/8/8/8/R3K3 w - - 0 1", ["Ra8+"], false],
    ["pin", "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", ["e4"], false],
    ["fork", "r3k3/8/8/8/8/8/8/4K2N w - - 0 1", ["Ng3"], false],
    ["desperado", "7N/5rk1/8/8/8/8/8/4K3 w - - 0 1", ["Nxf7"], true],
    ["desperado", "4k3/8/8/8/8/8/5RK1/7n b - - 0 1", ["Nxf2"], true],
    ["desperado", "7N/p4rk1/8/8/8/8/8/4K3 w - - 0 1", ["Ke2", "a6", "Nxf7"], true],
    ["desperado", "7N/5r2/8/6k1/8/8/8/4K3 w - - 0 1", ["Nxf7"], false],
    ["desperado", "k6N/5r2/8/8/8/8/8/4K3 w - - 0 1", ["Nxf7"], false],
    ["desperado", "4k3/8/3p4/4N3/2p5/8/8/4K3 w - - 0 1", ["Nxc4"], false],
    ["zwischenzug", "4k3/8/8/8/8/2N5/1Pr5/4K2R b - - 0 1", ["Rxc3", "Rh8+"], true],
    ["zwischenzug", "4k3/8/8/8/8/2N5/1Pr5/4K2R b - - 0 1", ["Rxc3", "bxc3"], false]
  ];
  const keep = rv, res = {}, wrong = [];
  for (const [name, fen, sans, want] of CASES) {
    const c = new Chess(fen), fens = [c.fen()], mv = []; for (const s of sans) { mv.push(c.move(s)); fens.push(c.fen()); }
    rv = { fen: fens, mv, pos: [], data: [] }; const i = mv.length;
    let got;
    if (name === "desperado") got = !!rvDesperado(i);
    else if (name === "zwischenzug") got = rvIdeas(i, { cls: "best", loss: 0, after: 60, isBest: false, L: [], b: { lines: [] }, sac: {}, recapture: mv[i - 2].captured && mv[i - 1].to === mv[i - 2].to, pov: (w) => w }).some((t) => t.startsWith("zwischenzug"));
    else got = rvMotifs(i).includes(name);
    const R = res[name] = res[name] || { tp: 0, fp: 0, fn: 0, tn: 0 }; R[got ? (want ? "tp" : "fp") : want ? "fn" : "tn"]++; if (got !== want) wrong.push(`${name}: ${fen} ${sans.join(" ")} expected ${want}`);
  }
  rv = keep;
  const out = Object.entries(res).map(([k, r]) => `${k}: precision ${r.tp + r.fp ? Math.round((100 * r.tp) / (r.tp + r.fp)) : "-"}% recall ${r.tp + r.fn ? Math.round((100 * r.tp) / (r.tp + r.fn)) : "-"}% (${r.tp} tp ${r.fp} fp ${r.fn} fn ${r.tn} tn)`);
  return out.concat(wrong).join("\n");
})();

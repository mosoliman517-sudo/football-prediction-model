/* Runs the full game review over a list of real games and records every special badge and idea it awards, with the
   position, so each one can be checked by hand or by engine. Open the chess page, paste this file into the console,
   then call reviewAudit([[name, "e4 e5 ..."], ...]). Progress and results are in window.AUDIT. Several minutes a game. */
window.reviewAudit = async function (games) {
  const A = (window.AUDIT = { n: games.length, done: [], now: "", error: "" }), wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const [name, moves] of games) {
    A.now = name; reviewStart(moves.split(" ").map((s) => s.replace(/[?!]+$/, "")), "w"); const me = rv, t0 = Date.now();
    while (rv === me && !(me.done && me.deepDone) && !me.failed && Date.now() - t0 < 900000) await wait(2000);
    if (rv !== me) { A.error = "review was interrupted"; return; }
    const rows = me.data.filter(Boolean).filter((d) => !["best", "excellent", "good", "book"].includes(d.cls) || d.tags.length).map((d) => ({ i: d.i, san: d.san, cls: d.cls, tags: d.tags, fen: me.fen[d.i - 1], bestSan: d.bestSan, before: Math.round(d.before), after: Math.round(d.after), second: d.second == null ? null : Math.round(d.second), loss: Math.round(d.loss * 10) / 10, pv: (me.pos[d.i].lines[0] || { pv: [] }).pv.slice(0, 6).join(" ") }));
    const counts = {}; for (const d of me.data) if (d) counts[d.cls] = (counts[d.cls] || 0) + 1;
    A.done.push({ name, plies: me.N, secs: Math.round((Date.now() - t0) / 1000), finished: !!(me.done && me.deepDone), failed: !!me.failed, counts, rows });
  }
  A.now = "finished";
};

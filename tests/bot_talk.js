/* Paste into the console of the chess page (or load it from a test run). Sets window.TALK_RESULT = {pass, fail, missing}.
   Checks that each event is raised by a position that should raise it, and not by ones that should not, and that every
   event has a line for every character. */
window.TALK_RESULT = (() => {
  const pass = [], fail = [], ok = (name, cond, got) => (cond ? pass : fail).push(cond ? name : `${name}: ${JSON.stringify(got)}`);
  /* play the moves from a position, then ask about the last one. mine = the colour the character plays */
  const run = (moves, charColor, ev, o = {}) => {
    const c = new Chess(), start = o.fen || c.fen(); if (o.fen) c.load(o.fen);
    const fens = [start]; moves.forEach((m) => { if (!c.move(m)) throw new Error("bad move " + m); fens.push(c.fen()); });
    const F = TALK.facts(c.history({ verbose: true }), fens, charColor), S = o.S || TALK.fresh(!!o.fen); F.quietChance = !!o.quiet;
    return { F, S, list: TALK.events(F, ev, S, o.id || "escaped") };
  };
  const even = { after: 50, loss: 0, onlyBest: false };
  const sac = ["e4", "e5", "Bc4", "Nc6", "Bxf7+"];   /* white gives a bishop for a pawn */
  let r = run(sac, "b", { after: 50, loss: 1, onlyBest: false }); ok("your sound sacrifice", r.list.includes("u_sac_good"), r.list);
  r = run(sac, "b", { after: 62, loss: 9, onlyBest: false }); ok("your doubtful sacrifice", r.list.includes("u_sac_dubious"), r.list);
  r = run(sac, "b", { after: 85, loss: 30, onlyBest: false }); ok("your blundered piece", r.list.includes("u_sac_blunder") && !r.list.includes("u_blunder"), r.list);
  r = run(sac, "w", { after: 50, loss: 2, onlyBest: false }); ok("his own sacrifice", r.list.includes("my_sac"), r.list);
  const S1 = run(sac, "w", even).S; r = run([...sac, "Kxf7"], "w", even, { S: S1 }); ok("you take his offered piece", r.list.includes("my_sac_taken"), r.list);
  const S2 = run(sac, "w", even).S; r = run([...sac, "Ke7"], "w", even, { S: S2 }); ok("you decline his piece", r.list.includes("my_sac_declined") && !r.list.includes("my_sac_taken"), r.list);
  const S3 = run(sac, "b", even).S; r = run([...sac, "Kxf7"], "b", even, { S: S3 }); ok("he takes your offered piece", r.list.includes("u_sac_taken"), r.list);
  r = run(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6"], "b", even); ok("an even trade is no sacrifice", !r.list.some((k) => /sac/.test(k)), r.list);
  r = run(["e4", "d5", "exd5", "Qxd5"], "b", even); ok("a pawn recapture is quiet", !r.list.some((k) => /sac|take|ouch|trade/.test(k)), r.list);
  r = run(["e4", "f5", "Qh5+"], "b", even); ok("being checked", r.list.includes("give_check") === false && r.list.includes("check"), r.list);
  r = run(["e4", "f5", "Qh5+"], "w", even); ok("giving check", r.list.includes("give_check") && !r.list.includes("check"), r.list);
  r = run(["e4", "f5", "Qh5+", "g6"], "b", even); ok("escaping check", r.list.includes("escape"), r.list);
  r = run(["e4", "Nf6", "Nc3", "Nxe4", "Nxe4"], "w", even); ok("he wins a piece", r.list.includes("take") || r.list.includes("trade"), r.list);
  r = run(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"], "b", even); ok("your castling", r.list.includes("castle_u"), r.list);
  r = run(["e4", "e5", "Qh5"], "b", even); ok("early queen is unusual", r.list.includes("u_weird"), r.list);
  r = run(["e4", "e5", "Nf3", "Nc6"], "w", even); ok("opening talk early", r.list.includes("open"), r.list);
  const shuffle = ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8", "Nf3"];
  r = run(shuffle, "b", even); ok("no opening talk after move 6", !r.list.includes("open"), r.list); ok("shuffling is passive", r.list.includes("u_passive"), r.list);
  r = run(["Kd2"], "b", even, { fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1" }); ok("endgame, and no opening talk from a position", r.list.includes("endgame") && !r.list.includes("open"), r.list);
  r = run(["b8=Q+"], "b", even, { fen: "7k/1P6/8/8/8/8/8/4K3 w - - 0 1" }); ok("your promotion", r.list.includes("promo_u"), r.list);
  r = run(["Rxd8+"], "w", even, { fen: "3q2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1" }); ok("he takes your queen", r.list.includes("took_queen"), r.list);
  r = run(["Rxd8+"], "b", even, { fen: "3q2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1" }); ok("you take his queen", r.list.includes("lost_queen"), r.list);
  const quiet = ["e4", "e5", "Nf3", "Nc6"];
  r = run(quiet, "w", { after: 20, loss: 28, onlyBest: false }); ok("your blunder", r.list.includes("u_blunder") && !r.list.includes("my_blunder"), r.list);
  r = run(quiet, "b", { after: 40, loss: 28, onlyBest: false }); ok("his blunder", r.list.includes("my_blunder"), r.list);
  r = run(["e4", "e5", "Nf3"], "b", { after: 70, loss: 28, onlyBest: false }); ok("your blunder seen", r.list.includes("u_blunder"), r.list);
  r = run(["e4", "e5", "Nf3"], "b", { after: 40, loss: 0, onlyBest: true }); ok("your only strong move", r.list.includes("u_brilliant"), r.list);
  let S = TALK.fresh(false); S.wasDown = 3; r = run(quiet, "b", { after: 60, loss: 0, onlyBest: false }, { S }); ok("comeback", r.list.includes("comeback"), r.list);
  S = TALK.fresh(false); S.wasUp = 3; r = run(quiet, "b", { after: 40, loss: 0, onlyBest: false }, { S }); ok("thrown away lead", r.list.includes("collapse"), r.list);
  r = run(quiet, "b", { after: 90, loss: 0, onlyBest: false }); ok("far ahead", r.list.includes("ahead"), r.list);
  r = run(quiet, "b", { after: 10, loss: 0, onlyBest: false }); ok("far behind", r.list.includes("behind"), r.list);
  r = run(sac, "b", null); ok("works without the engine", r.list.length > 0 && !r.list.includes("u_blunder"), r.list);
  /* Arteta's squad: names stay with their piece */
  { const c = new Chess(); ["e4", "Nf6", "d4", "Nxe4", "Nc3", "Nxc3", "bxc3"].forEach((m) => c.move(m)); const H = c.history({ verbose: true });
    ok("his lost pawn is named by its start", TALK.squad(H.slice(0, 4), "w")[3].taken === "Gyokeres", TALK.squad(H, "w"));
    ok("his knight keeps its name", TALK.squad(H, "w")[4].mover === "Eze" && TALK.squad(H, "w")[5].taken === "Eze", TALK.squad(H, "w"));
    ok("the recapturing pawn is named", TALK.playerKind("take", H, "w") === "take:Lewis-Skelly", TALK.playerKind("take", H, "w")); }
  { const c = new Chess(); ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6", "Re1"].forEach((m) => c.move(m)); ok("the rook keeps its name through castling", TALK.squad(c.history({ verbose: true }), "w")[8].mover === "Saliba", 0); }
  const missing = [], SIG = ["berserker", "trader", "arteta", "bea"];   /* who has a signature move besides sacrifices */
  Object.keys(BOT_LINES).forEach((id) => Object.keys(TALK.PRI).forEach((k) => { if ((k === "trait" && !SIG.includes(id)) || id === "council" && ["story", "taunt", "ouch", "check", "trait"].includes(k) && BOT_LINES[id][k]) return; if (![k, ...(TALK_ALSO[k] || [])].some((x) => (BOT_LINES[id][x] || []).length)) missing.push(id + "." + k); }));
  return { pass: pass.length, fail, missing };
})();

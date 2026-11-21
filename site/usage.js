/* ---------- What you play most (shared by football, basketball, chess and the sport picker) ----------
   Kept only in this browser (localStorage "bk_usage"); nothing is sent anywhere. Each key holds a score that halves
   every 14 days, so what you play now counts more than what you played last month. Keys: "s:fb" (a sport),
   "fb:who" (a game in a sport). Lists are only reordered once you have played at least three times, so a new
   visitor sees the hand-picked order. */
const Usage = (() => {
  const K = "bk_usage", HL = 14 * 864e5, MIN = 3;
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || "{}") || {}; } catch (e) { return {}; } };
  const save = (u) => { try { localStorage.setItem(K, JSON.stringify(u)); } catch (e) { /* private mode */ } };
  const decay = (x, now) => (x ? x.s * Math.pow(0.5, (now - x.t) / HL) : 0);
  function add(key, w) { const u = load(), now = Date.now(), x = u[key]; u[key] = { s: decay(x, now) + w, t: now, n: ((x && x.n) || 0) + (w >= 1 ? 1 : 0) }; save(u); }
  return {
    play(sport, game, w = 1) { add("s:" + sport, w); if (game) add(sport + ":" + game, w); },
    count(key) { const x = load()[key]; return (x && x.n) || 0; },
    /* list sorted by what you play, plus the favourite (played 3+ times) and one game to try next (never played) */
    order(list, sport, idOf = (x) => x.id) {
      const u = load(), now = Date.now(), rows = list.map((x, i) => { const k = u[sport + ":" + idOf(x)]; return { x, i, s: decay(k, now), n: (k && k.n) || 0 }; });
      const total = rows.reduce((a, r) => a + r.n, 0);
      if (total < MIN) return { list: list.slice(), fav: null, next: null };
      rows.sort((a, b) => b.s - a.s || a.i - b.i);
      const fav = rows[0].n >= MIN ? idOf(rows[0].x) : null, nx = rows.find((r) => !r.n);
      return { list: rows.map((r) => r.x), fav, next: nx ? idOf(nx.x) : null };
    },
    sports() { const u = load(), now = Date.now(); return ["fb", "bb", "ch"].map((s) => ({ s, v: decay(u["s:" + s], now), n: (u["s:" + s] && u["s:" + s].n) || 0 })).sort((a, b) => b.v - a.v); },
  };
})();

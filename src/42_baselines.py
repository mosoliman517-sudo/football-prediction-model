"""
Plain-language baselines for the tour and the About page, on the same 45,031 test matches as the model (2001-02 to 2025-26):
  random   picking Home, Draw or Away at random gets one in three right
  form     the 'fan's educated guess': back the team with the better points per game so far this season (before 5 games, a blend with last season's
           rate); the home team if they are level
  home     always pick the home team
Saves 02_processed_data/baselines.json.  Run from the project root:  python3 src/42_baselines.py
"""
import json

import pandas as pd

d = pd.read_csv("02_processed_data/multi_league_matches.csv")
d = d[d.season < d.season.max()].sort_values(["league", "date"]).reset_index(drop=True)   # the live season is left out of the benchmark
pts, prev, ok, n = {}, {}, 0, 0
for r in d.itertuples():
    def ppg(t):
        p, g = pts.get((r.league, r.season, t), [0, 0]); pp = prev.get((r.league, t))
        if g >= 5:
            return p / g
        if pp is not None and g > 0:
            return pp * 0.5 + (p / g) * 0.5
        return pp if pp is not None else 1.35
    pick = "H" if ppg(r.home) >= ppg(r.away) else "A"
    n += 1; ok += pick == r.res
    for t, gf, ga in ((r.home, r.hg, r.ag), (r.away, r.ag, r.hg)):
        k = (r.league, r.season, t); p, g = pts.get(k, [0, 0]); pts[k] = [p + (3 if gf > ga else 1 if gf == ga else 0), g + 1]
    for t in (r.home, r.away):
        p, g = pts[(r.league, r.season, t)]; prev[(r.league, t)] = p / g if g >= 10 else prev.get((r.league, t), p / g)
out = {"n": n, "random": 33.3, "form": round(100 * ok / n, 1), "home": round(100 * (d.res == "H").mean(), 1), "draw_share": round(100 * (d.res == "D").mean(), 1)}
json.dump(out, open("02_processed_data/baselines.json", "w"), indent=1); print(out)

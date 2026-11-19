"""NBA 'Beat the Model': a walk-forward Elo model. Every game is predicted using ONLY games played before it.
Elo (K=20, margin-of-victory multiplier, 25% pull toward 1500 each new season) + home court + rest (back-to-back).
Output: 02_processed_data/nba_model.json  {games:[...rows...], summary:{...}, series:...}
Row: [date, home, away, hs, as, pHome(0-1), expMargin(home), recH, recA, type(2/3), season]  (team = short name)"""
import json, glob, math, collections, pathlib
import pandas as pd
nd = json.load(open("02_processed_data/nba_data.json")); teams = {int(k): v for k, v in nd["teams"].items()}
short = {i: t["short"] for i, t in teams.items()}
COLS = ["game_id", "season", "season_type", "game_date", "team_id", "opponent_team_id", "team_score", "opponent_team_score", "home_away", "team_winner"]
fr = []
for f in sorted(glob.glob("01_data_nba/player_box_*.csv")):
    d = pd.read_csv(f, low_memory=False, usecols=COLS); fr.append(d.drop_duplicates(["game_id", "team_id"]))
g = pd.concat(fr, ignore_index=True)
g = g[g.season_type.isin([2, 3]) & (g.team_id <= 30) & (g.opponent_team_id <= 30) & (g.home_away == "home")].drop_duplicates("game_id").sort_values(["game_date", "game_id"]).reset_index(drop=True)
g = g.dropna(subset=["team_score", "opponent_team_score"])
print("games", len(g), "seasons", g.season.min(), g.season.max())
elo = collections.defaultdict(lambda: 1500.0); last_day = {}; rec = collections.defaultdict(lambda: [0, 0]); cur_season = None
HFA, K, B2B = 70.0, 20.0, 30.0
po_elo = {}; rows = []; ll = br = acc = n = 0; per = collections.defaultdict(lambda: [0, 0, 0.0, 0.0])   # season: n, right, brier, mae
for r in g.itertuples():
    s = int(r.season)
    if s != cur_season:                                    # new season: pull every rating 25% toward the mean, reset records
        for t in list(elo): elo[t] = 1500 + 0.75 * (elo[t] - 1500)
        rec = collections.defaultdict(lambda: [0, 0]); cur_season = s
    if int(r.season_type) == 3 and s not in po_elo: po_elo[s] = {short[t]: round(v) for t, v in elo.items() if t in short}   # ratings going into the playoffs
    h, a = int(r.team_id), int(r.opponent_team_id); dt = pd.Timestamp(r.game_date)
    rest = lambda t: (dt - last_day[t]).days if t in last_day else 3
    adj = (B2B if rest(a) <= 1 else 0) - (B2B if rest(h) <= 1 else 0)
    dr = elo[h] - elo[a] + HFA + adj
    p = 1 / (1 + 10 ** (-dr / 400)); em = dr / 28.0
    hs, as_ = float(r.team_score), float(r.opponent_team_score); margin = hs - as_; won = 1.0 if margin > 0 else 0.0
    if s >= 2003:                                          # the first season only warms the ratings up
        rows.append([r.game_date, short[h], short[a], int(hs), int(as_), round(p, 3), round(em, 1), f"{rec[h][0]}-{rec[h][1]}", f"{rec[a][0]}-{rec[a][1]}", int(r.season_type), s])
        e = per[s]; e[0] += 1; e[1] += int((p > 0.5) == (won == 1)); e[2] += (p - won) ** 2; e[3] += abs(em - margin)
    mult = ((abs(margin) + 3) ** 0.8) / (7.5 + 0.006 * (elo[h] - elo[a] if margin > 0 else elo[a] - elo[h]))
    delta = K * mult * (won - p)
    elo[h] += delta; elo[a] -= delta
    last_day[h] = last_day[a] = dt
    rec[h][0 if won else 1] += 1; rec[a][1 if won else 0] += 1
summ = {}
for s, (n, right, b2, mae) in sorted(per.items()): summ[s] = {"n": n, "acc": round(right / n, 4), "brier": round(b2 / n, 4), "mae": round(mae / n, 2)}
tot = [sum(v[i] for v in per.values()) for i in range(4)]
home = sum(1 for x in rows if x[3] > x[4]) / len(rows)
test = [x for x in rows if x[10] >= 2017]
acc_t = sum(1 for x in test if (x[5] > .5) == (x[3] > x[4])) / len(test)
print(f"walk-forward 2002-03 to now: {tot[1]/tot[0]:.3f} winners right over {tot[0]} games; home team wins {home:.3f}; margin MAE {tot[3]/tot[0]:.2f}; since 2017-18: {acc_t:.3f} over {len(test)}")
for s, v in summ.items(): print(s, v)
keep = [x for x in rows if x[10] >= 2017]            # what ships to the site (2016-17 on)
out = {"games": keep, "summary": {"overall": {"n": tot[0], "acc": round(tot[1] / tot[0], 4), "mae": round(tot[3] / tot[0], 2), "home": round(home, 4), "since2017_acc": round(acc_t, 4), "since2017_n": len(test)}, "perSeason": summ},
       "po_elo": {str(k): v for k, v in po_elo.items() if k >= 2003}, "elo_final": {short[t]: round(v) for t, v in elo.items() if t in short}}
pathlib.Path("02_processed_data/nba_model.json").write_text(json.dumps(out, separators=(",", ":")))
print("shipped games:", len(keep), "file", pathlib.Path("02_processed_data/nba_model.json").stat().st_size // 1024, "KB")

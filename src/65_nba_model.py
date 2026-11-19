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
import re, ast
QS = {}                                   # game_id -> ([home q1..q4], [away q1..q4]); real quarter scores exist from about 2019-20 on
for f in sorted(glob.glob("01_data_nba/schedule_*.csv")):
    hd = pd.read_csv(f, low_memory=False, nrows=1)
    if "home_linescores" not in hd.columns: continue
    sc = pd.read_csv(f, low_memory=False, usecols=["game_id", "home_linescores", "away_linescores"]).dropna()[["game_id", "home_linescores", "away_linescores"]]
    for gid, hl, al in sc.itertuples(index=False):
        a = [float(x) for x in re.findall(r"'value':\s*([\d.]+)", str(hl))]; b = [float(x) for x in re.findall(r"'value':\s*([\d.]+)", str(al))]
        if len(a) >= 4 and len(b) >= 4 and 40 <= sum(a[:4]) <= 200: QS[int(gid)] = ([int(x) for x in a[:4]], [int(x) for x in b[:4]])
print("games with quarter scores:", len(QS))
ew = collections.defaultdict(lambda: [112.0, 112.0])      # per team: recent points scored / allowed (exponential average)
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
    tot = (ew[h][0] + ew[a][1] + ew[a][0] + ew[h][1]) / 2; ph_, pa_ = (tot + em) / 2, (tot - em) / 2
    hs, as_ = float(r.team_score), float(r.opponent_team_score); margin = hs - as_; won = 1.0 if margin > 0 else 0.0
    if s >= 2003:                                          # the first season only warms the ratings up
        rows.append([r.game_date, short[h], short[a], int(hs), int(as_), round(p, 3), round(em, 1), f"{rec[h][0]}-{rec[h][1]}", f"{rec[a][0]}-{rec[a][1]}", int(r.season_type), s, round(ph_, 1), round(pa_, 1), QS.get(int(r.game_id))])
        e = per[s]; e[0] += 1; e[1] += int((p > 0.5) == (won == 1)); e[2] += (p - won) ** 2; e[3] += abs(em - margin)
    mult = ((abs(margin) + 3) ** 0.8) / (7.5 + 0.006 * (elo[h] - elo[a] if margin > 0 else elo[a] - elo[h]))
    delta = K * mult * (won - p)
    elo[h] += delta; elo[a] -= delta
    last_day[h] = last_day[a] = dt
    ew[h][0] = 0.92 * ew[h][0] + 0.08 * hs; ew[h][1] = 0.92 * ew[h][1] + 0.08 * as_; ew[a][0] = 0.92 * ew[a][0] + 0.08 * as_; ew[a][1] = 0.92 * ew[a][1] + 0.08 * hs
    rec[h][0 if won else 1] += 1; rec[a][1 if won else 0] += 1
summ = {}
for s, (n, right, b2, mae) in sorted(per.items()): summ[s] = {"n": n, "acc": round(right / n, 4), "brier": round(b2 / n, 4), "mae": round(mae / n, 2)}
tot = [sum(v[i] for v in per.values()) for i in range(4)]
home = sum(1 for x in rows if x[3] > x[4]) / len(rows)
test = [x for x in rows if x[10] >= 2017]
acc_t = sum(1 for x in test if (x[5] > .5) == (x[3] > x[4])) / len(test)
print(f"walk-forward 2002-03 to now: {tot[1]/tot[0]:.3f} winners right over {tot[0]} games; home team wins {home:.3f}; margin MAE {tot[3]/tot[0]:.2f}; since 2017-18: {acc_t:.3f} over {len(test)}")
for s, v in summ.items(): print(s, v)
keep = [x for x in rows if x[13]]                    # what ships: games with real quarter scores
sc_err = sum(abs(x[11] - x[3]) + abs(x[12] - x[4]) for x in keep) / len(keep)
q_ok = sum(1 for x in keep for i in range(4) if x[13][0][i] != x[13][1][i] and ((x[6] > 0) == (x[13][0][i] > x[13][1][i]))); q_n = sum(1 for x in keep for i in range(4) if x[13][0][i] != x[13][1][i])
print(f"quarter games {len(keep)}; mean score error (both teams summed) {sc_err:.1f}; quarter winners right {q_ok/q_n:.3f} over {q_n}")
QSTAT = {"n": len(keep), "score_err": round(sc_err, 1), "q_acc": round(q_ok / q_n, 4), "from": min(x[10] for x in keep)}
out = {"games": keep, "summary": {"overall": {"n": tot[0], "acc": round(tot[1] / tot[0], 4), "mae": round(tot[3] / tot[0], 2), "home": round(home, 4), "since2017_acc": round(acc_t, 4), "since2017_n": len(test)}, "perSeason": summ},
       "quarters": QSTAT, "po_elo": {str(k): v for k, v in po_elo.items() if k >= 2003}, "elo_final": {short[t]: round(v) for t, v in elo.items() if t in short}}
pathlib.Path("02_processed_data/nba_model.json").write_text(json.dumps(out, separators=(",", ":")))
print("shipped games:", len(keep), "file", pathlib.Path("02_processed_data/nba_model.json").stat().st_size // 1024, "KB")

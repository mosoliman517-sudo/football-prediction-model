"""
Blind simulation of the REST of the live season (2026-27).

Starts from the real current state: every real result so far (this season's
matches included) is replayed into Elo / form / head-to-head / the table, and
then each remaining match is predicted from that state, sampled, and fed
forward, so the next match is predicted from the simulation's OWN earlier
results. That is the one place predicted results are allowed to feed
predictions; everywhere else (the replay, next-matchday forecasts) uses only
real results. The engine is shared with 07 (blind_engine.py).

Which matches remain is exact (every ordered pairing is played once per
season), but kickoff dates are not in the data, so the remaining fixtures are
laid out in an ASSUMED order, one round per week, each club playing at most
once per round.

Usage (project root):
    python3 src/12_blind_rest_of_season.py              simulate the live season's remainder
    python3 src/12_blind_rest_of_season.py --backtest   also test the same method on the two
                                                        held-out seasons, started after 100 matches
Writes 02_processed_data/blind_rest.json (and blind_rest_backtest.json).
"""

import json
import sys

import numpy as np
import pandas as pd

from config import TRAIN_TEST_SPLIT_DATE, LIVE_SEASON_START
from features.elo import get_season
from blind_engine import make_simulator, run_many, build_table

N_SIMS_LIVE = 300
N_SIMS_BACKTEST = 120
START_AFTER = 100            # matches already played when the backtest begins

bench = pd.read_csv("02_processed_data/E0_features.csv")
live = pd.read_csv("02_processed_data/E0_live_features.csv")
grid = pd.read_csv("02_processed_data/E0_grid_model.csv")
for frame in (bench, live):
    frame["Date"] = pd.to_datetime(frame["Date"], format="mixed")
df = pd.concat([bench, live], ignore_index=True).sort_values("Date").reset_index(drop=True)
df["SeasonYear"] = df["Date"].apply(get_season)

EXOGENOUS = ["DayOfWeek", "IsWeekend", "KickoffHour", "HomePlayedEuropeMidweek", "AwayPlayedEuropeMidweek",
             "HomeManagerExperience", "AwayManagerExperience", "HomeRecentAvgPlacement", "AwayRecentAvgPlacement",
             "HomeSquadValueEur", "AwaySquadValueEur"]


def lay_out_rounds(pairs, seed=7):
    """Greedy rounds in which no club plays twice. An assumed order, not the real calendar."""
    rng = np.random.default_rng(seed)
    left = list(pairs)
    rng.shuffle(left)
    rounds = []
    while left:
        busy, this_round, rest = set(), [], []
        for h, a in left:
            if h in busy or a in busy:
                rest.append((h, a))
            else:
                this_round.append((h, a)); busy.update((h, a))
        rounds.append(this_round)
        left = rest
    return rounds


def summarize(per_sim_matches, teams, real_final=None):
    """Turns N simulated seasons into per-team points range and finishing-position odds."""
    n = len(teams)
    ix = {t: i for i, t in enumerate(teams)}
    pos_counts = np.zeros((n, n))
    points = np.zeros((len(per_sim_matches), n))
    for s, matches in enumerate(per_sim_matches):
        table = build_table(matches)
        for pos, row in table.iterrows():
            pos_counts[ix[row["Team"]], pos - 1] += 1
            points[s, ix[row["Team"]]] = row["Points"]
    pos_dist = pos_counts / len(per_sim_matches)
    return points, pos_dist


# =====================================================================
# 1. The live season: what is left of 2026-27
# =====================================================================
season_year = int(LIVE_SEASON_START[:4])
live_sorted = live.sort_values("Date").reset_index(drop=True)
teams = sorted(set(live_sorted["HomeTeam"]) | set(live_sorted["AwayTeam"]))
played_pairs = set(zip(live_sorted["HomeTeam"], live_sorted["AwayTeam"]))
remaining = [(h, a) for h in teams for a in teams if h != a and (h, a) not in played_pairs]
rounds = lay_out_rounds(remaining)
print(f"{len(live_sorted)} real matches played, {len(remaining)} remaining, laid out in {len(rounds)} assumed weekly rounds")

grid_ix = grid.set_index(["HomeTeam", "AwayTeam"])
first_date = live_sorted["Date"].max() + pd.Timedelta(days=(5 - live_sorted["Date"].max().weekday()) % 7 + 7)   # a Saturday a week or more on
hyp = []
for r, rnd in enumerate(rounds):
    for h, a in rnd:
        g = grid_ix.loc[(h, a)]
        row = {"HomeTeam": h, "AwayTeam": a, "Date": first_date + pd.Timedelta(days=7 * r), "SeasonYear": season_year}
        row.update({c: g[c] for c in EXOGENOUS})
        hyp.append(row)
fixtures = pd.concat([live_sorted.assign(SeasonYear=season_year), pd.DataFrame(hyp)], ignore_index=True)
real_n = len(live_sorted)
train = df[df["Date"] < LIVE_SEASON_START].reset_index(drop=True)

run_one = make_simulator(train, fixtures, real_n=real_n)
runs = run_many(run_one, list(range(N_SIMS_LIVE)), workers=9)
points, pos_dist = summarize(runs, teams)

now_table = build_table([(r.HomeTeam, r.AwayTeam, int(r.FTHG), int(r.FTAG)) for r in live_sorted.itertuples()])
now = {row["Team"]: (pos, int(row["Points"]), int(row["Played"])) for pos, row in now_table.iterrows()}
n = len(teams)
rows = []
for i, t in enumerate(teams):
    rows.append({
        "team": t, "now": now[t][0], "pts": now[t][1], "played": now[t][2],
        "mean": round(float(points[:, i].mean()), 1),
        "p10": int(np.percentile(points[:, i], 10)), "p90": int(np.percentile(points[:, i], 90)),
        "title": round(float(pos_dist[i, 0]), 4), "top4": round(float(pos_dist[i, :4].sum()), 4),
        "down": round(float(pos_dist[i, n - 3:].sum()), 4),
        "pos": [round(float(x), 3) for x in pos_dist[i]],
    })
rows.sort(key=lambda r: -r["mean"])
result = {"n_sims": N_SIMS_LIVE, "played": int(real_n), "remaining": len(remaining), "assumed_rounds": len(rounds),
          "as_of": str(live_sorted["Date"].max().date()), "rows": rows}
json.dump(result, open("02_processed_data/blind_rest.json", "w"), separators=(",", ":"))
print("\nBlind rest-of-season (state updates after every simulated match):")
for r in rows[:6]:
    print(f"  {r['team']:<14} now {r['now']:>2}  proj {r['mean']:>5.1f} pts  title {r['title']:.0%}  top4 {r['top4']:.0%}  bottom3 {r['down']:.0%}")

# =====================================================================
# 2. Backtest: the same method on the held-out seasons, from round 10
# =====================================================================
if "--backtest" in sys.argv:
    out = {"coverage_80": [], "title_prob_of_real_champion": [], "brier_top4": [], "brier_top4_base_rate": [],
           "brier_relegation": [], "brier_relegation_base_rate": [], "position_mae_projection": [], "position_mae_current_table": []}
    seasons = sorted(df.loc[(df["Date"] >= TRAIN_TEST_SPLIT_DATE) & (df["Date"] < LIVE_SEASON_START), "SeasonYear"].unique())
    for sy in seasons:
        tr = df[df["Date"] < f"{sy}-08-01"].reset_index(drop=True)
        fx = df[df["SeasonYear"] == sy].sort_values("Date").reset_index(drop=True)
        runs = run_many(make_simulator(tr, fx, real_n=START_AFTER), list(range(N_SIMS_BACKTEST)), workers=9)
        tms = sorted(set(fx["HomeTeam"]) | set(fx["AwayTeam"]))
        pts, pdist = summarize(runs, tms)
        real = build_table([(r.HomeTeam, r.AwayTeam, int(r.FTHG), int(r.FTAG)) for r in fx.itertuples()])
        real_pos = {row["Team"]: p for p, row in real.iterrows()}; real_pts = {row["Team"]: row["Points"] for _, row in real.iterrows()}
        cur = build_table([(r.HomeTeam, r.AwayTeam, int(r.FTHG), int(r.FTAG)) for r in fx.iloc[:START_AFTER].itertuples()])
        cur_pos = {row["Team"]: p for p, row in cur.iterrows()}
        rp = np.array([real_pos[t] for t in tms]); rpts = np.array([real_pts[t] for t in tms])
        lo, hi = np.percentile(pts, 10, axis=0), np.percentile(pts, 90, axis=0)
        out["coverage_80"].append(float(((rpts >= lo) & (rpts <= hi)).mean()))
        out["title_prob_of_real_champion"].append(float(pdist[rp.argmin(), 0]))
        top4 = pdist[:, :4].sum(1); down = pdist[:, -3:].sum(1)
        out["brier_top4"].append(float(((top4 - (rp <= 4)) ** 2).mean())); out["brier_top4_base_rate"].append(float(((0.2 - (rp <= 4)) ** 2).mean()))
        out["brier_relegation"].append(float(((down - (rp >= 18)) ** 2).mean())); out["brier_relegation_base_rate"].append(float(((0.15 - (rp >= 18)) ** 2).mean()))
        proj_rank = pts.mean(0).argsort()[::-1].argsort() + 1
        out["position_mae_projection"].append(float(np.abs(proj_rank - rp).mean()))
        out["position_mae_current_table"].append(float(np.abs(np.array([cur_pos[t] for t in tms]) - rp).mean()))
        print(f"  backtest {sy}-{str(sy + 1)[-2:]} done")
    summary = {k: round(float(np.mean(v)), 3) for k, v in out.items()}
    summary.update(started_after_matches=START_AFTER, n_sims=N_SIMS_BACKTEST, seasons=[int(s) for s in seasons])
    json.dump(summary, open("02_processed_data/blind_rest_backtest.json", "w"), indent=1)
    print("\nBlind method, backtested from round 10 (NOT optimistic: it sees no real result after match 100):")
    for k, v in summary.items():
        print(f"  {k}: {v}")

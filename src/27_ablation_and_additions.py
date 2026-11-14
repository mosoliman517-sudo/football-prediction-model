"""
Two questions about the classifier features, judged out-of-fold on the TRAINING seasons only (same rules as
14_test_new_signals.py: chronological folds, a logistic regression and a random forest must both agree, paired
match-by-match differences give a t-statistic):

  A. DROP-ONE: take each group of existing features out. If log loss gets better without it, the group is
     misleading or redundant; if it gets worse, the group earns its place.
  B. ADD-ONE: build new signals from the raw results already in the pipeline (longer and shorter form windows,
     exponentially weighted form, opponent-adjusted form, streaks, promoted-club flag, time in season,
     absolute gaps that help a linear model see draws, a log squad-value ratio) and test each on top of the
     current features.

The held-out 760 matches are touched once, at the end, only for a combination chosen from the out-of-fold
results:   python3 src/27_ablation_and_additions.py --confirm "drop:Group A,Group B|add:Signal X,Signal Y"

Run from the project root:  python3 src/27_ablation_and_additions.py
"""
import importlib.util
import json
import sys

import numpy as np
import pandas as pd

from config import TRAIN_TEST_SPLIT_DATE

spec = importlib.util.spec_from_file_location("sig14", "src/14_test_new_signals.py")
sig = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sig)
oof_losses, fit_predict, CODE, NON_FEATURES = sig.oof_losses, sig.fit_predict, sig.CODE, sig.NON_FEATURES

SPLITS = 4

DROP_GROUPS = {
    "Form: points last 5 (overall)": ["HomeLast5Points", "AwayLast5Points"],
    "Form: points last 5 at home/away": ["HomeLast5HomePoints", "AwayLast5AwayPoints"],
    "Form: win rate at home/away": ["HomeWinRateLastHome", "AwayWinRateLastAway"],
    "Goals scored/conceded last 5": ["HomeAvgGoalsScoredLast5", "HomeAvgGoalsConcededLast5", "AwayAvgGoalsScoredLast5", "AwayAvgGoalsConcededLast5"],
    "Shots and shots on target last 5": ["HomeAvgShotsLast5", "AwayAvgShotsLast5", "HomeAvgShotsOnTargetLast5", "AwayAvgShotsOnTargetLast5",
                                          "HomeAvgShotsConcededLast5", "AwayAvgShotsConcededLast5"],
    "Rest days": ["HomeDaysRest", "AwayDaysRest"],
    "Head to head": ["H2HHomeTeamWinRate", "H2HAwayTeamWinRate", "H2HDrawRate", "H2HMatchesPlayed"],
    "Second-half goal patterns": ["HomeAvgSecondHalfGoalsScoredLast5", "HomeAvgSecondHalfGoalsConcededLast5",
                                   "AwayAvgSecondHalfGoalsScoredLast5", "AwayAvgSecondHalfGoalsConcededLast5"],
    "Elo: home/away track": ["HomeElo", "AwayElo", "EloDifference"],
    "Elo: expected-goals track": ["EloXGDifference"],
    "Squad market value": ["HomeSquadValueEur", "AwaySquadValueEur"],
    "Table position and points gap": ["HomeTablePosition", "AwayTablePosition", "TablePointsGap"],
    "Kickoff day and time": ["DayOfWeek", "IsWeekend", "KickoffHour"],
    "Midweek European football": ["HomePlayedEuropeMidweek", "AwayPlayedEuropeMidweek"],
    "Manager experience": ["HomeManagerExperience", "AwayManagerExperience"],
    "Recent average placement": ["HomeRecentAvgPlacement", "AwayRecentAvgPlacement"],
}


def build_candidates(base):
    """New walk-forward signals from E0_features.csv (rows in date order). Only earlier matches feed each row."""
    d = base.copy()
    d["Date"] = pd.to_datetime(d["Date"], format="mixed")
    d = d.sort_index()
    n = len(d)
    rows = []
    for side, other in (("Home", "Away"), ("Away", "Home")):
        gf = d["FTHG"] if side == "Home" else d["FTAG"]
        ga = d["FTAG"] if side == "Home" else d["FTHG"]
        team = d[f"{side}Team"]
        pts = np.where(gf > ga, 3, np.where(gf == ga, 1, 0))
        elo_gap = d["EloDifference"] if side == "Home" else -d["EloDifference"]
        expected = 1 / (1 + 10 ** (-elo_gap / 400))
        score = np.where(gf > ga, 1.0, np.where(gf == ga, 0.5, 0.0))
        shots = d["HS"] if side == "Home" else d["AS"]
        sot = d["HST"] if side == "Home" else d["AST"]
        rows.append(pd.DataFrame({"i": np.arange(n), "team": team.values, "side": side, "season": np.where(d["Date"].dt.month >= 8, d["Date"].dt.year, d["Date"].dt.year - 1),
                                  "pts": pts, "gd": (gf - ga).values, "resid": score - expected.values, "shots": shots.values, "sot": sot.values,
                                  "goals": gf.values, "win": (gf > ga).astype(int), "unbeaten": (gf >= ga).astype(int)}))
    long = pd.concat(rows).sort_values(["team", "i"]).reset_index(drop=True)
    g = long.groupby("team", sort=False)
    feat = pd.DataFrame({"i": long["i"], "side": long["side"], "team": long["team"], "season": long["season"]})
    for w in (3, 10, 20):
        feat[f"Pts{w}pg"] = g["pts"].transform(lambda s, w=w: s.shift(1).rolling(w, min_periods=2).mean())
    feat["EWMpts"] = g["pts"].transform(lambda s: s.shift(1).ewm(halflife=3, min_periods=2).mean())
    feat["GD5"] = g["gd"].transform(lambda s: s.shift(1).rolling(5, min_periods=2).mean())
    feat["AdjForm10"] = g["resid"].transform(lambda s: s.shift(1).rolling(10, min_periods=3).mean())
    feat["SotShare10"] = g["sot"].transform(lambda s: s.shift(1).rolling(10, min_periods=3).sum()) / g["shots"].transform(lambda s: s.shift(1).rolling(10, min_periods=3).sum())
    feat["Conv10"] = g["goals"].transform(lambda s: s.shift(1).rolling(10, min_periods=3).sum()) / g["shots"].transform(lambda s: s.shift(1).rolling(10, min_periods=3).sum())

    def streak(s):
        out, run = [], 0
        for v in s.shift(1).fillna(0):
            run = run + 1 if v == 1 else 0
            out.append(run)
        return pd.Series(out, index=s.index)
    feat["WinStreak"] = g["win"].transform(streak)
    feat["Unbeaten"] = g["unbeaten"].transform(streak)
    feat["PlayedSeason"] = long.groupby(["team", "season"], sort=False).cumcount()
    first_season = long.groupby("team")["season"].transform("min")
    prev = long.groupby("team")["season"].transform(lambda s: s.map(lambda x: x - 1 in set(s)))
    feat["Promoted"] = ((~prev) & (long["season"] > first_season.min())).astype(int)

    out = pd.DataFrame(index=d.index)
    for side in ("Home", "Away"):
        f = feat[feat["side"] == side].set_index("i").sort_index()
        for c in ("Pts3pg", "Pts10pg", "Pts20pg", "EWMpts", "GD5", "AdjForm10", "SotShare10", "Conv10", "WinStreak", "Unbeaten", "PlayedSeason", "Promoted"):
            if c in f:
                out[f"{side}{c}"] = f[c].values
    groups = {
        "Form: 3-match points per game": ["HomePts3pg", "AwayPts3pg"],
        "Form: 10-match points per game": ["HomePts10pg", "AwayPts10pg"],
        "Form: 20-match points per game": ["HomePts20pg", "AwayPts20pg"],
        "Form: exponentially weighted points": ["HomeEWMpts", "AwayEWMpts"],
        "Form: goal difference last 5": ["HomeGD5", "AwayGD5"],
        "Form: opponent-adjusted (result vs Elo expectation, last 10)": ["HomeAdjForm10", "AwayAdjForm10"],
        "Attack quality: shot-on-target share and goals per shot (last 10)": ["HomeSotShare10", "AwaySotShare10", "HomeConv10", "AwayConv10"],
        "Streaks: wins in a row and unbeaten run": ["HomeWinStreak", "AwayWinStreak", "HomeUnbeaten", "AwayUnbeaten"],
        "Time in season (matches played)": ["HomePlayedSeason", "AwayPlayedSeason"],
        "Newly promoted club flag": ["HomePromoted", "AwayPromoted"],
    }
    extra = pd.DataFrame(index=d.index)
    extra["AbsEloGap"] = d["EloDifference"].abs()
    extra["AbsTableGap"] = d["TablePointsGap"].abs()
    groups["Absolute gaps (Elo, table): closeness for draws"] = ["AbsEloGap", "AbsTableGap"]
    hv, av = d["HomeSquadValueEur"].replace(0, np.nan), d["AwaySquadValueEur"].replace(0, np.nan)
    extra["LogValueRatio"] = np.log(hv / av)
    groups["Log squad-value ratio (home over away)"] = ["LogValueRatio"]
    cand = pd.concat([out, extra], axis=1)
    return cand, groups


def verdict_drop(res):
    both_help = all(res[k][0] > 0 for k in res)          # dropping raises loss: the group earns its place
    both_hurt = all(res[k][0] < 0 for k in res)          # dropping lowers loss: the group is misleading or redundant
    t = {k: res[k][0] / res[k][1] for k in res}
    if both_help and max(t.values()) > 2: return "USEFUL"
    if both_hurt and min(t.values()) < -1: return "REMOVE?"
    return "neutral"


def verdict_add(res):
    t = {k: res[k][0] / res[k][1] for k in res}
    if all(res[k][0] < 0 for k in res) and max(t.values()) < -1 and min(t.values()) < -2: return "HELPS"
    if all(res[k][0] > 0 for k in res): return "hurts"
    return "no clear effect"


def main():
    base = pd.read_csv("02_processed_data/E0_features.csv")
    model = pd.read_csv("02_processed_data/E0_model.csv")
    assert (model["HomeTeam"].values == base["HomeTeam"].values).all()
    date = pd.to_datetime(model["Date"], format="mixed")
    y_all = model["FTR"].map(CODE).values
    feats = [c for c in model.columns if c not in NON_FEATURES and model[c].notna().any()]
    train = (date < TRAIN_TEST_SPLIT_DATE).values
    cand, add_groups = build_candidates(base)

    if "--confirm" in sys.argv:
        spec_ = sys.argv[sys.argv.index("--confirm") + 1]
        drop_names = [x for x in spec_.split("|")[0].replace("drop:", "").split(",") if x]
        add_names = [x for x in (spec_.split("|")[1].replace("add:", "").split(",") if "|" in spec_ else []) if x]
        drop_cols = {c for g in drop_names for c in DROP_GROUPS[g]}
        add_cols = [c for g in add_names for c in add_groups[g]]
        keep = [c for c in feats if c not in drop_cols]
        X0 = model[feats]
        X1 = pd.concat([model[keep], cand[add_cols]], axis=1)
        tr, te = np.where(train)[0], np.where(~train)[0]
        print(f"Held-out {len(te)} matches (used once). Dropped {sorted(drop_names)}; added {sorted(add_names)}")
        for k in ("lr", "rf"):
            res = []
            for X in (X0, X1):
                mean = X.iloc[tr].mean()
                p = fit_predict(k, X.iloc[tr].fillna(mean).fillna(0), y_all[tr], X.iloc[te].fillna(mean).fillna(0))
                res.append((-np.log(np.clip(p[np.arange(len(te)), y_all[te]], 1e-9, 1)).mean(), (p.argmax(1) == y_all[te]).mean()))
            print(f"  {k.upper()}: log loss {res[0][0]:.4f} -> {res[1][0]:.4f}   accuracy {res[0][1]:.1%} -> {res[1][1]:.1%}")
        return

    idx = np.where(train)[0]
    y = y_all[idx]
    X0 = model.loc[idx, feats].reset_index(drop=True)
    base_loss = {k: oof_losses(X0, y, k, SPLITS) for k in ("lr", "rf")}
    print(f"{len(feats)} current features, {len(idx)} training matches, {len(base_loss['lr'])} scored out-of-fold")
    print(f"current: log loss LR {base_loss['lr'].mean():.4f}   RF {base_loss['rf'].mean():.4f}")
    out = {"drop": [], "add": []}

    def report(name, X1, bucket, vfn, sign_note):
        res = {}
        for k in ("lr", "rf"):
            d = oof_losses(X1, y, k, SPLITS) - base_loss[k]
            if bucket == "drop": d = -d                  # positive = the group helps
            res[k] = (d.mean(), d.std() / np.sqrt(len(d)))
        v = vfn(res)
        out[bucket].append({"group": name, "lr": round(res["lr"][0], 5), "lr_t": round(res["lr"][0] / res["lr"][1], 2),
                            "rf": round(res["rf"][0], 5), "rf_t": round(res["rf"][0] / res["rf"][1], 2), "verdict": v})
        print(f"  {name:<68} LR {res['lr'][0]:+.4f} (t {res['lr'][0] / res['lr'][1]:+.1f})   RF {res['rf'][0]:+.4f} (t {res['rf'][0] / res['rf'][1]:+.1f})   {v}", flush=True)

    print("\nA. DROP-ONE (positive = the group helps; negative = log loss is better without it)")
    for name, cols in DROP_GROUPS.items():
        cols = [c for c in cols if c in X0.columns]
        report(name, X0.drop(columns=cols), "drop", verdict_drop, "")
    print("\nB. ADD-ONE (negative = lower log loss with the new signal)")
    for name, cols in add_groups.items():
        cols = [c for c in cols if c in cand.columns and cand.loc[idx, c].notna().any()]
        if not cols:
            print(f"  {name}: no data"); continue
        report(name, pd.concat([X0, cand.loc[idx, cols].reset_index(drop=True)], axis=1), "add", verdict_add, "")
    json.dump(out, open("02_processed_data/ablation_tests.json", "w"), indent=1)
    print("\nSaved 02_processed_data/ablation_tests.json")


if __name__ == "__main__":
    main()

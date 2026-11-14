"""
Pre-match predictions of the match statistics the page's minute-by-minute
simulation shows: shots, shots on target, corners, fouls and yellow cards, for
each side. Same recipe as the goal model in 05 (Poisson regression on the
pre-match features, trained on the training seasons only), and scored on the
held-out 760 matches against the plain training-season average, so the page
can say how good the numbers are instead of drawing them out of thin air.

Also measures the share of goals scored in the first half, which the
simulation uses to place goal minutes.

Possession is NOT here: none of our sources (football-data, Understat,
Transfermarkt, Fantasy Premier League) records it.

Run from the project root after 02 and 05:  python3 src/17_predict_match_stats.py
Writes 02_processed_data/match_stats.csv and match_stats_validation.json.
"""

import json
import re

import numpy as np
import pandas as pd
from sklearn.linear_model import PoissonRegressor
from sklearn.metrics import mean_absolute_error, mean_poisson_deviance

from config import TRAIN_TEST_SPLIT_DATE

STATS = {  # name -> (home column, away column)
    "shots": ("HS", "AS"), "sot": ("HST", "AST"), "corners": ("HC", "AC"), "fouls": ("HF", "AF"), "yellows": ("HY", "AY"),
}
src = open("src/05_predict_scoreline.py").read()
FEATURE_COLUMNS = eval(re.search(r"FEATURE_COLUMNS = (\[.*?\n\])", src, re.S).group(1))

feat = pd.read_csv("02_processed_data/E0_features.csv")
feat["Date"] = pd.to_datetime(feat["Date"], format="mixed")
live = pd.read_csv("02_processed_data/E0_live_features.csv")
live["Date"] = pd.to_datetime(live["Date"], format="mixed")
train = feat[feat["Date"] < TRAIN_TEST_SPLIT_DATE]
test = feat[feat["Date"] >= TRAIN_TEST_SPLIT_DATE]

mean, std = train[FEATURE_COLUMNS].fillna(0).mean(), train[FEATURE_COLUMNS].fillna(0).std().replace(0, 1)
scale = lambda d: (d[FEATURE_COLUMNS].fillna(0) - mean) / std

models, report = {}, {}
print(f"{'stat':<9}{'side':<6}{'real avg':>9}{'model avg':>10}{'MAE model':>10}{'MAE avg-baseline':>17}{'deviance model':>16}{'baseline':>10}{'corr':>7}")
for name, cols in STATS.items():
    for side, col in zip(("home", "away"), cols):
        tr = train.dropna(subset=[col])
        m = PoissonRegressor(max_iter=2000).fit(scale(tr), tr[col])
        models[(name, side)] = m
        te = test.dropna(subset=[col])
        pred, y = m.predict(scale(te)), te[col].values
        base = np.full(len(y), tr[col].mean())
        r = {"real_mean": round(float(y.mean()), 3), "model_mean": round(float(pred.mean()), 3),
             "mae_model": round(float(mean_absolute_error(y, pred)), 3), "mae_baseline": round(float(mean_absolute_error(y, base)), 3),
             "dev_model": round(float(mean_poisson_deviance(y, pred)), 3), "dev_baseline": round(float(mean_poisson_deviance(y, base)), 3),
             "corr": round(float(np.corrcoef(pred, y)[0, 1]), 3)}
        # calibration: split matches into three groups by prediction and compare the group means
        q = pd.qcut(pred, 3, labels=["low", "mid", "high"], duplicates="drop")
        r["calibration"] = {str(k): [round(float(pred[q == k].mean()), 2), round(float(y[q == k].mean()), 2)] for k in q.categories}
        report[f"{name}_{side}"] = r
        print(f"{name:<9}{side:<6}{r['real_mean']:>9.2f}{r['model_mean']:>10.2f}{r['mae_model']:>10.3f}{r['mae_baseline']:>17.3f}{r['dev_model']:>16.3f}{r['dev_baseline']:>10.3f}{r['corr']:>7.2f}")

# share of goals scored in the first half (all seasons), for placing goal minutes
hg = feat["HTHG"].fillna(0) + feat["HTAG"].fillna(0)
tg = feat["FTHG"] + feat["FTAG"]
report["first_half_goal_share"] = round(float(hg.sum() / tg.sum()), 4)
print(f"\nShare of goals scored in the first half: {report['first_half_goal_share']:.1%}")

rows = []
for split, frame in (("benchmark", test), ("live", live)):
    out = frame[["Date", "HomeTeam", "AwayTeam"]].copy()
    out["Split"] = split
    sc = scale(frame)
    for (name, side), m in models.items():
        out[f"X_{name}_{side}"] = m.predict(sc)
    for name, cols in STATS.items():
        for side, col in zip(("home", "away"), cols):
            out[f"R_{name}_{side}"] = frame[col].values if col in frame.columns else np.nan
    rows.append(out)
pd.concat(rows).to_csv("02_processed_data/match_stats.csv", index=False)
json.dump(report, open("02_processed_data/match_stats_validation.json", "w"), indent=1)
print("Saved match_stats.csv and match_stats_validation.json")

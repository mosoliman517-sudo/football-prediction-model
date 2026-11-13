"""
Tunes the three decision profiles on the BLENDED odds (an even average of the
Random Forest and the Poisson goal model) instead of on the Random Forest
alone. Same discipline as 03: thresholds are chosen on out-of-fold training
data only (3 chronological folds), the held-out 760 matches are used once,
for reporting.

Run from the project root after 03 and 05:
    python3 src/10_tune_blend_profiles.py
Writes 02_processed_data/blend_profiles.json (read by 08_build_wrapped.py).
"""

import json
import re

import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import PoissonRegressor
from sklearn.model_selection import TimeSeriesSplit
from sklearn.utils.class_weight import compute_sample_weight

from config import TRAIN_TEST_SPLIT_DATE

MAXG = 8
CODE = {"A": 0, "D": 1, "H": 2}

src = open("src/05_predict_scoreline.py").read()
FEATURE_COLUMNS = eval(re.search(r"FEATURE_COLUMNS = (\[.*?\n\])", src, re.S).group(1))

feat = pd.read_csv("02_processed_data/E0_features.csv")
feat["Date"] = pd.to_datetime(feat["Date"], format="mixed")
model_df = pd.read_csv("02_processed_data/E0_model.csv")
model_df["Date"] = pd.to_datetime(model_df["Date"], format="mixed")

tr = feat[feat["Date"] < TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)
te = feat[feat["Date"] >= TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)
mtr = model_df[model_df["Date"] < TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)
assert (mtr["HomeTeam"].values == tr["HomeTeam"].values).all() and (mtr["Date"].values == tr["Date"].values).all()


def goal_model_probs(train, test):
    """Home/draw/away probabilities implied by a fitted pair of Poisson goal models (order A, D, H)."""
    x = train[FEATURE_COLUMNS].fillna(0)
    mean, std = x.mean(), x.std().replace(0, 1)
    scale = lambda d: (d[FEATURE_COLUMNS].fillna(0) - mean) / std
    home = PoissonRegressor(max_iter=1000).fit(scale(train), train["FTHG"])
    away = PoissonRegressor(max_iter=1000).fit(scale(train), train["FTAG"])
    lh, la = home.predict(scale(test)), away.predict(scale(test))
    k = np.arange(MAXG + 1)
    out = np.zeros((len(test), 3))
    for n, (a, b) in enumerate(zip(lh, la)):
        g = np.outer(poisson.pmf(k, a), poisson.pmf(k, b))
        g /= g.sum()
        out[n] = [np.triu(g, 1).sum(), np.trace(g), np.tril(g, -1).sum()]
    return out


# ---- out-of-fold blended odds on the training seasons -----------------
cols = [c for c in mtr.columns if c not in ("FTR", "Div", "Date", "HomeTeam", "AwayTeam")]
Xm = mtr[cols].fillna(0)
ym = mtr["FTR"].map(CODE).values
rf_params = dict(n_estimators=500, max_depth=15, min_samples_split=5, min_samples_leaf=2, random_state=42, n_jobs=-1)

oof_blend, oof_y = [], []
for a, b in TimeSeriesSplit(n_splits=3).split(Xm):
    rf = RandomForestClassifier(**rf_params).fit(Xm.iloc[a], ym[a], sample_weight=compute_sample_weight("balanced", ym[a]))
    oof_blend.append((rf.predict_proba(Xm.iloc[b]) + goal_model_probs(tr.iloc[a], tr.iloc[b])) / 2)
    oof_y.append(ym[b])

# ---- held-out blended odds (the forest's come from 03, the goal model is refit) ----
rf_test = pd.read_csv("02_processed_data/rf_predictions.csv")
rf_test = rf_test[rf_test["Split"] == "benchmark"][["P_A", "P_D", "P_H"]].values
test_blend = (rf_test + goal_model_probs(tr, te)) / 2
test_y = te["FTR"].map(CODE).values


def recalls(pick, y):
    """Home, Draw, Away recall, then accuracy."""
    return [float((pick[y == c] == c).mean()) for c in (2, 1, 0)] + [float((pick == y).mean())]


OBJECTIVES = {
    "balanced": lambda r: min(r[0], r[1], r[2]),
    "deadkill": lambda r: r[3],
    "target": lambda r: min(r[0] / 0.60, r[2] / 0.60, r[1] / 0.40),
}
COARSE = (np.arange(1.0, 0.35, -0.1), np.arange(1.0, 2.05, 0.15), np.arange(0.4, 2.05, 0.2))
FINE = (np.arange(1.0, 0.30, -0.05), np.arange(1.0, 2.55, 0.1), np.arange(0.4, 2.55, 0.1))
GRIDS = {"balanced": COARSE, "deadkill": COARSE, "target": FINE}


def search(objective, home_f, away_f, draw_f):
    best, best_f = -1.0, None
    for h in home_f:
        for a in away_f:
            for d in draw_f:
                score = np.mean([objective(recalls(np.argmax(P * np.array([a, d, h]), 1), y))
                                 for P, y in zip(oof_blend, oof_y)])
                if score > best:
                    best, best_f = score, (h, a, d)
    return best_f


result = {}
print("Profiles tuned on the blended odds (held-out 760 matches, used once):")
for name, objective in OBJECTIVES.items():
    h, a, d = search(objective, *GRIDS[name])
    r = recalls(np.argmax(test_blend * np.array([a, d, h]), 1), test_y)
    result[name] = {"home": round(float(h), 3), "away": round(float(a), 3), "draw": round(float(d), 3),
                    "bench": {"H": round(r[0], 4), "D": round(r[1], 4), "A": round(r[2], 4), "acc": round(r[3], 4)}}
    print(f"  {name:<9} home={h:.2f} away={a:.2f} draw={d:.2f} -> Home {r[0]:.0%} Draw {r[1]:.0%} Away {r[2]:.0%} accuracy {r[3]:.1%}")

raw = recalls(test_blend.argmax(1), test_y)
result["raw"] = {"home": 1.0, "away": 1.0, "draw": 1.0,
                 "bench": {"H": round(raw[0], 4), "D": round(raw[1], 4), "A": round(raw[2], 4), "acc": round(raw[3], 4)}}
json.dump(result, open("02_processed_data/blend_profiles.json", "w"), indent=2)
print("Saved blend_profiles.json")

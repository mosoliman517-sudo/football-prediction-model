"""
Tunes the three decision profiles on the BLENDED odds (an even average of the
Random Forest and the Poisson goal model) instead of on the Random Forest
alone. Same discipline as 03: thresholds are chosen on out-of-fold training
data only (3 chronological folds), the held-out 760 matches are used once,
for reporting.

It also builds the opt-in MARKET-INFORMED HYBRID: a logistic-regression stack of
our blend and Bet365's pre-match odds (margin removed), trained on out-of-fold
training data only, with its own profiles. The odds are real pre-match
information but they carry what the market knows (lineups, injuries, news), so
the hybrid is labelled as market-informed and is not the default.

Run from the project root after 03 and 05:
    python3 src/10_tune_blend_profiles.py
Writes 02_processed_data/blend_profiles.json and hybrid.json (read by 08).
"""

import glob
import json
import re

import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression, PoissonRegressor
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

oof_blend, oof_y, oof_idx = [], [], []
for a, b in TimeSeriesSplit(n_splits=3).split(Xm):
    rf = RandomForestClassifier(**rf_params).fit(Xm.iloc[a], ym[a], sample_weight=compute_sample_weight("balanced", ym[a]))
    oof_blend.append((rf.predict_proba(Xm.iloc[b]) + goal_model_probs(tr.iloc[a], tr.iloc[b])) / 2)
    oof_y.append(ym[b])
    oof_idx.append(b)

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
    "accuracy": lambda r: r[3],
}
COARSE = (np.arange(1.0, 0.35, -0.1), np.arange(1.0, 2.05, 0.15), np.arange(0.4, 2.05, 0.2))
GRIDS = {"balanced": COARSE, "accuracy": COARSE}


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


# =====================================================================
# Market-informed hybrid (opt-in)
# =====================================================================
odds = pd.concat([pd.read_csv(f, usecols=lambda c: c in ["Date", "HomeTeam", "AwayTeam", "B365H", "B365D", "B365A"])
                  for f in glob.glob("01_data/*.csv")]).dropna()
odds["Date"] = pd.to_datetime(odds["Date"], format="mixed", dayfirst=True)
odds = odds.drop_duplicates(["Date", "HomeTeam", "AwayTeam"])
merged = feat[["Date", "HomeTeam", "AwayTeam"]].merge(odds, on=["Date", "HomeTeam", "AwayTeam"], how="left")
assert len(merged) == len(feat) and merged["B365H"].notna().all(), "Bet365 odds missing for some matches"
raw_inv = 1 / merged[["B365A", "B365D", "B365H"]].values              # order A, D, H
market = raw_inv / raw_inv.sum(1, keepdims=True)
market_tr, market_te = market[: len(tr)], market[len(tr):]


def logp(p):
    return np.log(np.clip(p, 1e-6, 1))


oof_idx_all = np.concatenate(oof_idx)
X_oof = np.hstack([logp(np.vstack(oof_blend)), logp(market_tr[oof_idx_all])])
y_oof = np.concatenate(oof_y)
stacker = LogisticRegression(C=1.0, max_iter=2000).fit(X_oof, y_oof)
hybrid_oof = np.split(stacker.predict_proba(X_oof), np.cumsum([len(b) for b in oof_blend])[:-1])
hybrid_test = stacker.predict_proba(np.hstack([logp(test_blend), logp(market_te)]))


def log_loss(p, y):
    return float(-np.log(np.clip(p[np.arange(len(y)), y], 1e-9, 1)).mean())


hybrid = {"coef": stacker.coef_.round(5).tolist(), "intercept": stacker.intercept_.round(5).tolist(),
          "test": {"log_loss": round(log_loss(hybrid_test, test_y), 4), "accuracy": round(float((hybrid_test.argmax(1) == test_y).mean()), 4),
                   "market_log_loss": round(log_loss(market_te, test_y), 4), "market_accuracy": round(float((market_te.argmax(1) == test_y).mean()), 4),
                   "blend_log_loss": round(log_loss(test_blend, test_y), 4), "blend_accuracy": round(float((test_blend.argmax(1) == test_y).mean()), 4)},
          "profiles": {}}


def search_on(objective, grid, oofs):
    best, best_f = -1.0, None
    for h in grid[0]:
        for a in grid[1]:
            for d in grid[2]:
                score = np.mean([objective(recalls(np.argmax(P * np.array([a, d, h]), 1), y)) for P, y in zip(oofs, oof_y)])
                if score > best:
                    best, best_f = score, (h, a, d)
    return best_f


print("\nMarket-informed hybrid (blend + Bet365 odds), held-out 760 matches:")
print(f"  log loss {hybrid['test']['log_loss']} (market alone {hybrid['test']['market_log_loss']}, blend alone {hybrid['test']['blend_log_loss']}), "
      f"accuracy {hybrid['test']['accuracy']:.1%} (market alone {hybrid['test']['market_accuracy']:.1%}, blend alone {hybrid['test']['blend_accuracy']:.1%})")
for name, objective in OBJECTIVES.items():
    h, a, d = search_on(objective, GRIDS[name], hybrid_oof)
    r = recalls(np.argmax(hybrid_test * np.array([a, d, h]), 1), test_y)
    hybrid["profiles"][name] = {"home": round(float(h), 3), "away": round(float(a), 3), "draw": round(float(d), 3),
                                "bench": {"H": round(r[0], 4), "D": round(r[1], 4), "A": round(r[2], 4), "acc": round(r[3], 4)}}
    print(f"  {name:<9} home={h:.2f} away={a:.2f} draw={d:.2f} -> Home {r[0]:.0%} Draw {r[1]:.0%} Away {r[2]:.0%} accuracy {r[3]:.1%}")
raw_h = recalls(hybrid_test.argmax(1), test_y)
hybrid["profiles"]["raw"] = {"home": 1.0, "away": 1.0, "draw": 1.0, "bench": {"H": round(raw_h[0], 4), "D": round(raw_h[1], 4), "A": round(raw_h[2], 4), "acc": round(raw_h[3], 4)}}
json.dump(hybrid, open("02_processed_data/hybrid.json", "w"), indent=2)
print("Saved hybrid.json")

"""
Does the model squeeze the table? Blended match odds tend to be too timid
(favourites under-rated, mid and bottom teams over-rated), which compresses the
expected-points table: leaders get too few points, the relegation zone too many.

This script
  1. rebuilds out-of-fold blended odds for the training seasons (same recipe as
     10_tune_blend_profiles.py: forest + goal model, chronological folds),
  2. measures expected points (xPts) against real points, by final table rank,
  3. fits a small recalibration on the TRAINING odds only (3-class logistic
     regression on two symmetric features: log(Home/Away) and log(Draw/sqrt(Home*Away))),
  4. scores it on the held-out 760 matches (touched once) and saves the
     parameters to 02_processed_data/spread_calibration.json.

Run from the project root after 03 and 05:  python3 src/15_calibrate_spread.py
"""

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
tr = feat[feat["Date"] < TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)
te = feat[feat["Date"] >= TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)
mtr = model_df[pd.to_datetime(model_df["Date"], format="mixed") < TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)


def goal_model_probs(train, test):
    x = train[FEATURE_COLUMNS].fillna(0)
    mean, std = x.mean(), x.std().replace(0, 1)
    scale = lambda d: (d[FEATURE_COLUMNS].fillna(0) - mean) / std
    home = PoissonRegressor(max_iter=1000).fit(scale(train), train["FTHG"])
    away = PoissonRegressor(max_iter=1000).fit(scale(train), train["FTAG"])
    lh, la = home.predict(scale(test)), away.predict(scale(test))
    k = np.arange(MAXG + 1)
    out = np.zeros((len(test), 3))
    for n, (a, b) in enumerate(zip(lh, la)):
        g = np.outer(poisson.pmf(k, a), poisson.pmf(k, b)); g /= g.sum()
        out[n] = [np.triu(g, 1).sum(), np.trace(g), np.tril(g, -1).sum()]
    return out


cols = [c for c in mtr.columns if c not in ("FTR", "Div", "Date", "HomeTeam", "AwayTeam")]
Xm, ym = mtr[cols].fillna(0), mtr["FTR"].map(CODE).values
rf_params = dict(n_estimators=500, max_depth=15, min_samples_split=5, min_samples_leaf=2, random_state=42, n_jobs=-1)
oof_p, oof_i = [], []
for a, b in TimeSeriesSplit(n_splits=3).split(Xm):
    rf = RandomForestClassifier(**rf_params).fit(Xm.iloc[a], ym[a], sample_weight=compute_sample_weight("balanced", ym[a]))
    oof_p.append((rf.predict_proba(Xm.iloc[b]) + goal_model_probs(tr.iloc[a], tr.iloc[b])) / 2)
    oof_i.append(b)
P_tr, I_tr = np.vstack(oof_p), np.concatenate(oof_i)
y_tr = ym[I_tr]

rf_test = pd.read_csv("02_processed_data/rf_predictions.csv")
rf_test = rf_test[rf_test["Split"] == "benchmark"][["P_A", "P_D", "P_H"]].values
P_te = (rf_test + goal_model_probs(tr, te)) / 2
y_te = te["FTR"].map(CODE).values


def features(P):
    lp = np.log(np.clip(P, 1e-6, 1))
    return np.column_stack([lp[:, 2] - lp[:, 0], lp[:, 1] - (lp[:, 2] + lp[:, 0]) / 2])


cal = LogisticRegression(C=100.0, max_iter=5000).fit(features(P_tr), y_tr)
base_recal = lambda P: cal.predict_proba(features(P))


def stretch(Q, s):
    """Multiply the Home-vs-Away log-odds by s (s > 1 spreads favourites and underdogs apart)."""
    lq = np.log(np.clip(Q, 1e-9, 1))
    d = lq[:, 2] - lq[:, 0]
    z = lq + (s - 1.0) * np.column_stack([-d / 2, np.zeros(len(d)), d / 2])
    z = np.exp(z - z.max(1, keepdims=True))
    return z / z.sum(1, keepdims=True)
log_loss = lambda P, y: float(-np.log(np.clip(P[np.arange(len(y)), y], 1e-9, 1)).mean())

def season_tables(df, P, y):
    """Real points and expected points per team per season, plus real final rank."""
    d = df.copy()
    d["pA"], d["pD"], d["pH"] = P[:, 0], P[:, 1], P[:, 2]
    d["season"] = np.where(d["Date"].dt.month >= 7, d["Date"].dt.year, d["Date"].dt.year - 1)
    d["season"] = d["season"].where(~((d["Date"].dt.year == 2020) & (d["Date"].dt.month == 7)), 2019)
    rows = []
    for s, g in d.groupby("season"):
        T = {}
        for r in g.itertuples():
            for team, win, lose, pw, pl in ((r.HomeTeam, r.FTHG > r.FTAG, r.FTHG < r.FTAG, r.pH, r.pA), (r.AwayTeam, r.FTAG > r.FTHG, r.FTAG < r.FTHG, r.pA, r.pH)):
                t = T.setdefault(team, {"pts": 0, "xpts": 0.0, "gd": 0, "n": 0})
                t["pts"] += 3 if win else (0 if lose else 1)
                t["xpts"] += 3 * pw + r.pD
                t["gd"] += (r.FTHG - r.FTAG) if team == r.HomeTeam else (r.FTAG - r.FTHG)
                t["n"] += 1
        t = pd.DataFrame(T).T.reset_index().rename(columns={"index": "team"})
        t["season"] = s
        t["rank"] = t.sort_values(["pts", "gd"], ascending=False).reset_index(drop=True).reset_index().set_index("team").loc[t["team"], "index"].values + 1
        rows.append(t)
    return pd.concat(rows, ignore_index=True)


def report(label, tab):
    full = tab[tab["n"] >= 36].copy()                      # complete seasons only
    full["err"] = full["xpts"] - full["pts"]
    bucket = pd.cut(full["rank"], [0, 3, 6, 10, 14, 17, 20], labels=["1-3", "4-6", "7-10", "11-14", "15-17", "18-20"])
    by = full.groupby(bucket, observed=True).agg(real=("pts", "mean"), expected=("xpts", "mean"))
    by["expected minus real"] = by["expected"] - by["real"]
    slope = np.polyfit(full["xpts"], full["pts"], 1)[0]
    print(f"\n{label}: {full['season'].nunique()} complete seasons, {len(full)} team-seasons")
    print(by.round(1).to_string())
    print(f"  spread (std of team points): real {full['pts'].std():.1f}, model {full['xpts'].std():.1f}   | real points per expected point (slope): {slope:.2f}   | mean absolute points error {full['err'].abs().mean():.1f}")
    return by



# ---- pick the spread factor on the TRAINING out-of-fold seasons (points error per team-season) ----
tr_part = tr.iloc[I_tr].reset_index(drop=True)
def points_error(P):
    t = season_tables(tr_part, P, y_tr)
    t = t[t["n"] >= 36]
    return float((t["xpts"] - t["pts"]).abs().mean())
grid_s = np.arange(1.0, 2.41, 0.1)
errs = [points_error(stretch(base_recal(P_tr), g)) for g in grid_s]
S_BEST = float(grid_s[int(np.argmin(errs))])
print("Spread factor search (training out-of-fold, mean absolute points error per team-season):")
print("  " + "  ".join(f"{g:.1f}:{e:.2f}" for g, e in zip(grid_s, errs)))
print(f"  chosen spread factor: {S_BEST:.1f}")
recal = lambda P: stretch(base_recal(P), S_BEST)

print("\nMatch-level (held-out 760):")
print(f"  log loss  before {log_loss(P_te, y_te):.4f}   after {log_loss(recal(P_te), y_te):.4f}")
print(f"  accuracy  before {(P_te.argmax(1) == y_te).mean():.1%}   after {(recal(P_te).argmax(1) == y_te).mean():.1%}")
print("\n=== Expected points vs real points, by final table position ===")
report("Training seasons (out-of-fold odds), BEFORE", season_tables(tr_part, P_tr, y_tr))
report("Training seasons (out-of-fold odds), AFTER", season_tables(tr_part, recal(P_tr), y_tr))
report("HELD-OUT 2024-26, BEFORE", season_tables(te, P_te, y_te))
report("HELD-OUT 2024-26, AFTER", season_tables(te, recal(P_te), y_te))

json.dump({"coef": cal.coef_.round(5).tolist(), "intercept": cal.intercept_.round(5).tolist(), "stretch": round(S_BEST, 3),
           "heldout": {"log_loss_before": round(log_loss(P_te, y_te), 4), "log_loss_after": round(log_loss(recal(P_te), y_te), 4)}},
          open("02_processed_data/spread_calibration.json", "w"), indent=2)
print("\nSaved 02_processed_data/spread_calibration.json")

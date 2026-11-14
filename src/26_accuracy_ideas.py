"""
Three further ideas for better probabilities, each judged on the held-out 760 (and, where possible, out-of-fold):
  1. A dedicated DRAW model: draws are likelier between evenly matched, low-scoring sides; the blend's draw
     probability barely separates draws, so a small model on those ingredients may rank them better.
  2. Dixon-Coles low-score correction: independent Poisson goals under-count 0-0 and 1-1 and over-count 1-0 and 0-1.
  3. Elo built from EXPECTED GOALS instead of goals (a steadier measure of how well a team really played).
Run from the project root:  python3 src/26_accuracy_ideas.py
"""
import re

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from scipy.stats import poisson
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression, PoissonRegressor
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import oof_blend
from config import TRAIN_TEST_SPLIT_DATE

z = oof_blend.get()
P_tr, I_tr, y_tr, P_te, y_te = z["P_tr"], z["I_tr"], z["y_tr"], z["P_te"], z["y_te"]
fc, feat, model_df = oof_blend.load()
tr = feat[feat["Date"] < TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)
te = feat[feat["Date"] >= TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)
ll = lambda P, y: float(-np.log(np.clip(P[np.arange(len(y)), y], 1e-9, 1)).mean())
acc = lambda P, y: float((P.argmax(1) == y).mean())
print(f"current blend on the held-out 760: log loss {ll(P_te, y_te):.4f}, accuracy {acc(P_te, y_te):.1%}, draw AUC {roc_auc_score(y_te == 1, P_te[:, 1]):.3f}\n")

# ------------------------------------------------------------------ 1. dedicated draw model
def draw_feats(d, P):
    goals = (d["HomeAvgGoalsScoredLast5"] + d["AwayAvgGoalsScoredLast5"] + d["HomeAvgGoalsConcededLast5"] + d["AwayAvgGoalsConcededLast5"]).to_numpy()
    xg = (d["HomeAvgXGLast5"] + d["AwayAvgXGLast5"] + d["HomeAvgXGConcededLast5"] + d["AwayAvgXGConcededLast5"]).to_numpy()
    lp = np.log(np.clip(P, 1e-6, 1))
    return np.column_stack([np.abs(d["EloDifference"]), np.abs(d["OverallEloDifference"]), goals, xg, np.abs(lp[:, 2] - lp[:, 0]), lp[:, 1], d["H2HDrawRate"].fillna(0.25), np.abs(d["TablePointsGap"])])


Xd_tr = np.nan_to_num(draw_feats(tr.iloc[I_tr], P_tr)); Xd_te = np.nan_to_num(draw_feats(te, P_te))
dm = make_pipeline(StandardScaler(), LogisticRegression(C=0.3, max_iter=2000)).fit(Xd_tr, (y_tr == 1).astype(int))
pd_te = dm.predict_proba(Xd_te)[:, 1]
print(f"1. Dedicated draw model: draw AUC on the held-out {roc_auc_score(y_te == 1, pd_te):.3f} (the blend's own draw odds: {roc_auc_score(y_te == 1, P_te[:, 1]):.3f})")
P_new = P_te.copy()
P_new[:, 1] = pd_te
rest = P_te[:, [0, 2]] / P_te[:, [0, 2]].sum(1, keepdims=True)
P_new[:, [0, 2]] = rest * (1 - pd_te)[:, None]
print(f"   log loss with its draw odds swapped in: {ll(P_new, y_te):.4f} (current {ll(P_te, y_te):.4f}); accuracy {acc(P_new, y_te):.1%}")
# does the better draw ranking show up as better balance? same recipe as 23: factors tuned on training, reported on held-out
P_new_tr = P_tr.copy(); pd_tr = dm.predict_proba(Xd_tr)[:, 1]
P_new_tr[:, 1] = pd_tr; P_new_tr[:, [0, 2]] = (P_tr[:, [0, 2]] / P_tr[:, [0, 2]].sum(1, keepdims=True)) * (1 - pd_tr)[:, None]
grid = [(a, d) for a in np.arange(0.6, 2.01, 0.05) for d in np.arange(0.4, 2.6, 0.05)]


def rec(P, y, a, d):
    pick = np.argmax(P * np.array([a, d, 1.0]), 1)
    return np.array([(pick[y == 2] == 2).mean(), (pick[y == 1] == 1).mean(), (pick[y == 0] == 0).mean()]), (pick == y).mean()


for label, Ptr_, Pte_ in (("current blend", P_tr, P_te), ("with the draw model", P_new_tr, P_new)):
    best = max(grid, key=lambda g: rec(Ptr_, y_tr, *g)[0].min())
    r, a_ = rec(Pte_, y_te, *best)
    print(f"   Balanced style, {label:<20}: Home {r[0]:.0%} Draw {r[1]:.0%} Away {r[2]:.0%}  accuracy {a_:.1%}  (worst recall {r.min():.0%})")

# ------------------------------------------------------------------ 2. Dixon-Coles
src = open("src/05_predict_scoreline.py").read()
FC = eval(re.search(r"FEATURE_COLUMNS = (\[.*?\n\])", src, re.S).group(1))
x = tr[FC].fillna(0); mean, std = x.mean(), x.std().replace(0, 1)
sc = lambda d: (d[FC].fillna(0) - mean) / std
hm = PoissonRegressor(max_iter=1000).fit(sc(tr), tr["FTHG"]); am = PoissonRegressor(max_iter=1000).fit(sc(tr), tr["FTAG"])
lh_tr, la_tr = hm.predict(sc(tr)), am.predict(sc(tr))
lam_te = pd.read_csv("02_processed_data/poisson_lambdas.csv"); lam_te = lam_te[lam_te["Split"] == "benchmark"].reset_index(drop=True)
rf_te = pd.read_csv("02_processed_data/rf_predictions.csv"); rf_te = rf_te[rf_te["Split"] == "benchmark"][["P_A", "P_D", "P_H"]].values
k = np.arange(9)


def tau(h, a, lh, la, rho):
    if h == 0 and a == 0: return 1 - lh * la * rho
    if h == 0 and a == 1: return 1 + lh * rho
    if h == 1 and a == 0: return 1 + la * rho
    if h == 1 and a == 1: return 1 - rho
    return 1.0


def grid_probs(lh, la, rho):
    g = np.outer(poisson.pmf(k, lh), poisson.pmf(k, la))
    for h_, a_ in ((0, 0), (0, 1), (1, 0), (1, 1)):
        g[h_, a_] *= max(tau(h_, a_, lh, la, rho), 1e-6)
    g /= g.sum()
    return [np.triu(g, 1).sum(), np.trace(g), np.tril(g, -1).sum()]


gh, ga = tr["FTHG"].to_numpy(), tr["FTAG"].to_numpy()
def neg_ll(rho):
    s = 0.0
    for lh, la, h_, a_ in zip(lh_tr, la_tr, gh, ga):
        if h_ <= 1 and a_ <= 1: s += np.log(max(tau(int(h_), int(a_), lh, la, rho), 1e-6))
    return -s
rho = minimize_scalar(neg_ll, bounds=(-0.3, 0.3), method="bounded").x
Pdc = (rf_te + np.array([grid_probs(a, b, rho) for a, b in zip(lam_te["LamH"], lam_te["LamA"])])) / 2
Pplain = (rf_te + np.array([grid_probs(a, b, 0.0) for a, b in zip(lam_te["LamH"], lam_te["LamA"])])) / 2
print(f"\n2. Dixon-Coles: fitted correction rho = {rho:+.3f}; held-out log loss {ll(Pdc, y_te):.4f} against {ll(Pplain, y_te):.4f} without it; draw AUC {roc_auc_score(y_te == 1, Pdc[:, 1]):.3f}")

# ------------------------------------------------------------------ 3. Elo from expected goals
def elo_xg(df, K=10, D=300, HG=0.4, REV=0.2):
    R, out, season = {}, [], None
    for h, a, d, xh, xa, gh_, ga_ in zip(df["HomeTeam"], df["AwayTeam"], df["Date"], df["HomeXG"], df["AwayXG"], df["FTHG"], df["FTAG"]):
        s = d.year if d.month >= 8 else d.year - 1
        if season is not None and s != season:
            R = {t: v + REV * (1500 - v) for t, v in R.items()}
        season = s
        rh, ra = R.setdefault(h, 1500.0), R.setdefault(a, 1500.0)
        out.append(rh - ra)
        margin = (xh - xa) if not (np.isnan(xh) or np.isnan(xa)) else (gh_ - ga_)
        dlt = K * (margin - ((rh - ra) / D + HG))
        R[h], R[a] = rh + dlt, ra - dlt
    return np.array(out)


feat_sorted = feat.sort_values("Date", kind="stable").reset_index(drop=True)
elo_x = pd.Series(elo_xg(feat_sorted), index=feat_sorted.index)
mapper = feat_sorted[["Date", "HomeTeam", "AwayTeam"]].assign(EloXG=elo_x.values)
mm = model_df[["Date", "HomeTeam", "AwayTeam"]].merge(mapper, on=["Date", "HomeTeam", "AwayTeam"], how="left")
assert len(mm) == len(model_df)
cols = [c for c in model_df.columns if c not in ("FTR", "Div", "Date", "HomeTeam", "AwayTeam")]
y_all = model_df["FTR"].map(oof_blend.CODE).to_numpy()
is_tr = (model_df["Date"] < TRAIN_TEST_SPLIT_DATE).to_numpy()
idx = np.where(is_tr)[0]


def oof(X, kind):
    out = []
    for a, b in TimeSeriesSplit(n_splits=4).split(idx):
        Xa, Xb = X.iloc[idx[a]].fillna(0), X.iloc[idx[b]].fillna(0)
        m = make_pipeline(StandardScaler(), LogisticRegression(C=0.05, max_iter=3000)) if kind == "lr" else RandomForestClassifier(n_estimators=400, max_depth=8, min_samples_leaf=10, random_state=0, n_jobs=-1)
        p = m.fit(Xa, y_all[idx[a]]).predict_proba(Xb)
        out.append(-np.log(np.clip(p[np.arange(len(b)), y_all[idx[b]]], 1e-9, 1)))
    return np.concatenate(out)


print("\n3. Elo built from expected goals, added to the model's features (out-of-fold on the training seasons; change in log loss, negative = better):")
X0 = model_df[cols]; X1 = pd.concat([X0, mm[["EloXG"]]], axis=1)
for kind in ("lr", "rf"):
    d = oof(X1, kind) - oof(X0, kind)
    print(f"   {kind.upper()}: {d.mean():+.4f} (t {d.mean() / (d.std() / np.sqrt(len(d))):+.1f})")

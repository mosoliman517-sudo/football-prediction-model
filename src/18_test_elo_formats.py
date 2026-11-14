"""
Which rating format actually works?

The production Elo is symmetric: whatever one side gains the other loses, and the
size of the move depends on the result against ONE shared expectation. Tested here
against formats where each club's rating moves by its own surprise, so gains and
losses are not mirrored:

  classic        single rating, zero-sum, margin multiplier (textbook Elo)
  dual-track     separate home and away ratings, zero-sum (the production idea)
  margin         expected goal difference from the rating gap, zero-sum
  asymmetric     as margin, but a club that does worse than expected moves by
                 k_down and one that does better by k_up (k_down > k_up means
                 losing ground is punished harder than winning ground is rewarded)
  adaptive-K     classic, but each club has its own K that grows with how
                 surprising its recent results have been
  attack/defence each club has an attack and a defence rating (goal-based, Poisson)
  asym. a/d      attack/defence with separate up and down rates

Each format is walked through every match in date order (so each rating only
knows the past), its settings are tuned on the TRAINING seasons only, a small
logistic regression turns "rating gap" into Home/Draw/Away probabilities (fit on
training seasons only), and the score is log loss on the held-out 760 matches
(lower is better). Then the best new formats are added to the model's 65 features
to see whether they improve the real model.

Run from the project root:  python3 src/18_test_elo_formats.py
"""

import copy
import itertools
import json
import math

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from config import TRAIN_TEST_SPLIT_DATE

BURN_IN = "2016-08-01"          # the first two seasons only warm the ratings up
CODE = {"A": 0, "D": 1, "H": 2}

df = pd.read_csv("02_processed_data/E0_features.csv")
df["Date"] = pd.to_datetime(df["Date"], format="mixed")
N = len(df)
H, A = df["HomeTeam"].tolist(), df["AwayTeam"].tolist()
GH, GA = df["FTHG"].to_numpy(), df["FTAG"].to_numpy()
SEASON = np.where(df["Date"].dt.month >= 8, df["Date"].dt.year, df["Date"].dt.year - 1)
y = df["FTR"].map(CODE).to_numpy()
is_train = (df["Date"] < TRAIN_TEST_SPLIT_DATE).to_numpy()
is_burn = (df["Date"] < BURN_IN).to_numpy()
fit_rows = is_train & ~is_burn
test_rows = ~is_train
MEAN_H, MEAN_A = GH[is_train].mean(), GA[is_train].mean()


def margin_mult(gd):
    d = abs(gd)
    return 1.0 if d <= 1 else 1.5 if d == 2 else (11 + d) / 8


# ---------------------------------------------------------------- formats
class Classic:
    name = "classic"
    def __init__(s, K=20, HA=60, REV=0.33): s.K, s.HA, s.REV, s.R = K, HA, REV, {}
    def season(s): s.R = {t: v + s.REV * (1500 - v) for t, v in s.R.items()}
    def r(s, t): return s.R.get(t, 1500.0)
    def feat(s, h, a): return [s.r(h) - s.r(a)]
    def step(s, h, a, gh, ga):
        E = 1 / (1 + 10 ** (-(s.r(h) - s.r(a) + s.HA) / 400))
        d = s.K * margin_mult(gh - ga) * ((1.0 if gh > ga else 0.5 if gh == ga else 0.0) - E)
        s.R[h], s.R[a] = s.r(h) + d, s.r(a) - d
        return d, -d


class DualTrack(Classic):
    name = "dual-track"
    def __init__(s, K=20, REV=0.33): s.K, s.REV, s.RH, s.RA = K, REV, {}, {}
    def season(s):
        s.RH = {t: v + s.REV * (1500 - v) for t, v in s.RH.items()}; s.RA = {t: v + s.REV * (1500 - v) for t, v in s.RA.items()}
    def feat(s, h, a): return [s.RH.get(h, 1500.0) - s.RA.get(a, 1500.0)]
    def step(s, h, a, gh, ga):
        E = 1 / (1 + 10 ** (-(s.RH.get(h, 1500.0) - s.RA.get(a, 1500.0)) / 400))
        d = s.K * margin_mult(gh - ga) * ((1.0 if gh > ga else 0.5 if gh == ga else 0.0) - E)
        s.RH[h] = s.RH.get(h, 1500.0) + d; s.RA[a] = s.RA.get(a, 1500.0) - d
        return d, -d


class Margin(Classic):
    name = "margin"
    def __init__(s, K=25, D=250, HG=0.35, REV=0.33): s.K, s.D, s.HG, s.REV, s.R = K, D, HG, REV, {}
    def egd(s, h, a): return (s.r(h) - s.r(a)) / s.D + s.HG
    def step(s, h, a, gh, ga):
        d = s.K * ((gh - ga) - s.egd(h, a))
        s.R[h], s.R[a] = s.r(h) + d, s.r(a) - d
        return d, -d


class Asym(Margin):
    name = "asymmetric"
    def __init__(s, k_up=15, k_down=30, D=250, HG=0.35, REV=0.33): s.ku, s.kd, s.D, s.HG, s.REV, s.R = k_up, k_down, D, HG, REV, {}
    def step(s, h, a, gh, ga):
        sh = (gh - ga) - s.egd(h, a)                     # the home side's surprise; the away side's is its negative
        dh = (s.ku if sh > 0 else s.kd) * sh
        da = (s.ku if -sh > 0 else s.kd) * (-sh)
        s.R[h], s.R[a] = s.r(h) + dh, s.r(a) + da
        return dh, da


class AdaptiveK(Classic):
    name = "adaptive-K"
    def __init__(s, K=20, HA=60, gamma=1.0, REV=0.33): s.K, s.HA, s.g, s.REV, s.R, s.vol = K, HA, gamma, REV, {}, {}
    def step(s, h, a, gh, ga):
        E = 1 / (1 + 10 ** (-(s.r(h) - s.r(a) + s.HA) / 400))
        S = 1.0 if gh > ga else 0.5 if gh == ga else 0.0
        kh = s.K * (s.vol.get(h, 0.33) / 0.33) ** s.g; ka = s.K * (s.vol.get(a, 0.33) / 0.33) ** s.g
        m = margin_mult(gh - ga)
        dh, da = kh * m * (S - E), -ka * m * (S - E)
        s.R[h], s.R[a] = s.r(h) + dh, s.r(a) + da
        s.vol[h] = 0.9 * s.vol.get(h, 0.33) + 0.1 * abs(S - E); s.vol[a] = 0.9 * s.vol.get(a, 0.33) + 0.1 * abs(S - E)
        return dh, da


class AttDef:
    name = "attack/defence"
    def __init__(s, eta=0.03, REV=0.33, k_down=None):
        s.up = eta; s.down = eta if k_down is None else k_down; s.REV = REV; s.att, s.dfn = {}, {}
        s.mu, s.ha = math.log(MEAN_A), math.log(MEAN_H / MEAN_A)
    def season(s):
        s.att = {t: (1 - s.REV) * v for t, v in s.att.items()}; s.dfn = {t: (1 - s.REV) * v for t, v in s.dfn.items()}
    def lam(s, h, a):
        return (math.exp(s.mu + s.ha + s.att.get(h, 0.0) - s.dfn.get(a, 0.0)), math.exp(s.mu + s.att.get(a, 0.0) - s.dfn.get(h, 0.0)))
    def feat(s, h, a):
        lh, la = s.lam(h, a)
        return [lh - la, lh + la]
    def step(s, h, a, gh, ga):
        lh, la = s.lam(h, a)
        res_h, res_a = gh - lh, ga - la                     # surprise in goals scored by each side
        rate = lambda x: s.up if x > 0 else s.down
        d_att_h, d_att_a = rate(res_h) * res_h / max(lh, 0.5), rate(res_a) * res_a / max(la, 0.5)
        d_def_a, d_def_h = rate(-res_h) * (-res_h) / max(lh, 0.5), rate(-res_a) * (-res_a) / max(la, 0.5)
        s.att[h] = s.att.get(h, 0.0) + d_att_h; s.att[a] = s.att.get(a, 0.0) + d_att_a
        s.dfn[a] = s.dfn.get(a, 0.0) + d_def_a; s.dfn[h] = s.dfn.get(h, 0.0) + d_def_h
        return d_att_h + d_def_h, d_att_a + d_def_a


# ---------------------------------------------------------------- walk + score
def walk(make):
    """Pre-match features for every match, ratings updated after each result."""
    m = make()
    feats = []
    for i in range(N):
        if i and SEASON[i] != SEASON[i - 1] and hasattr(m, "season"):
            m.season()
        feats.append(m.feat(H[i], A[i]))
        m.step(H[i], A[i], int(GH[i]), int(GA[i]))
    return np.array(feats), m


def logloss(P, yy): return float(-np.log(np.clip(P[np.arange(len(yy)), yy], 1e-9, 1)).mean())


def score(F, rows_fit, rows_eval, per_match=False):
    lr = make_pipeline(StandardScaler(), LogisticRegression(C=10.0, max_iter=2000)).fit(F[rows_fit], y[rows_fit])
    P = lr.predict_proba(F[rows_eval])
    if per_match:
        return -np.log(np.clip(P[np.arange(P.shape[0]), y[rows_eval]], 1e-9, 1))
    return logloss(P, y[rows_eval]), float((P.argmax(1) == y[rows_eval]).mean())


def tune(cls, grid):
    best = None
    keys = list(grid)
    for vals in itertools.product(*grid.values()):
        params = dict(zip(keys, vals))
        F, _ = walk(lambda: cls(**params))
        ll, _ = score(F, fit_rows, fit_rows)              # training seasons only
        if best is None or ll < best[0]:
            best = (ll, params)
    return best


FORMATS = [
    (Classic, {"K": [10, 15, 20, 30], "HA": [40, 80], "REV": [0.2, 0.33]}),
    (DualTrack, {"K": [10, 15, 20, 30], "REV": [0.2, 0.33]}),
    (Margin, {"K": [10, 20, 30], "D": [200, 300], "HG": [0.3, 0.4], "REV": [0.2, 0.33]}),
    (Asym, {"k_up": [3, 5, 8, 12, 20], "k_down": [3, 5, 8, 12, 20, 30], "D": [300], "HG": [0.4], "REV": [0.2]}),
    (AdaptiveK, {"K": [15, 20, 30], "HA": [60], "gamma": [0.5, 1.0, 1.5], "REV": [0.2, 0.33]}),
    (AttDef, {"eta": [0.02, 0.04, 0.07], "REV": [0.2, 0.33]}),
    (AttDef, {"eta": [0.02, 0.04, 0.07], "k_down": [0.03, 0.06, 0.1], "REV": [0.33]}),
]
LABEL = ["classic", "dual-track", "margin", "asymmetric (loss > gain)", "adaptive-K", "attack/defence", "asym. attack/defence"]

results, FEATS, MODELS = [], {}, {}
prod = df[["OverallEloDifference", "EloDifference"]].to_numpy()
base_ll, base_acc = None, None
print(f"{'format':<28}{'train log loss':>15}{'held-out log loss':>19}{'accuracy':>10}   tuned settings")
rates = np.bincount(y[fit_rows], minlength=3) / fit_rows.sum()
P0 = np.tile(rates, (test_rows.sum(), 1))
print(f"{'no ratings (league rates)':<28}{'':>15}{logloss(P0, y[test_rows]):>19.4f}{(P0.argmax(1) == y[test_rows]).mean():>10.1%}")
ll_t, _ = score(prod, fit_rows, fit_rows); ll_h, acc_h = score(prod, fit_rows, test_rows)
print(f"{'production Elo (in the model)':<28}{ll_t:>15.4f}{ll_h:>19.4f}{acc_h:>10.1%}   (dual-track + calibrated expectation model + shots on target)")
results.append({"format": "production Elo", "train": round(ll_t, 4), "heldout": round(ll_h, 4), "accuracy": round(acc_h, 4)})
for (cls, grid), label in zip(FORMATS, LABEL):
    ll_train, params = tune(cls, grid)
    F, model = walk(lambda: cls(**params))
    ll_h, acc_h = score(F, fit_rows, test_rows)
    FEATS[label], MODELS[label] = F, (cls, params)
    results.append({"format": label, "train": round(ll_train, 4), "heldout": round(ll_h, 4), "accuracy": round(acc_h, 4), "params": params})
    print(f"{label:<28}{ll_train:>15.4f}{ll_h:>19.4f}{acc_h:>10.1%}   {params}")


# ---------------------------------------------------------------- does asymmetry itself help?
print("\nAsymmetry sweep (margin format, D=300, home goal edge 0.4, reversion 0.2). Rows: k_up (gain rate), columns: k_down (loss rate). Training log loss:")
ks_up, ks_down = [3, 5, 8, 12, 20], [3, 5, 8, 12, 20, 30]
surface = {}
print("        " + "".join(f"{kd:>9}" for kd in ks_down))
for ku in ks_up:
    row = []
    for kd in ks_down:
        F, _ = walk(lambda: Asym(k_up=ku, k_down=kd, D=300, HG=0.4, REV=0.2))
        ll, _ = score(F, fit_rows, fit_rows); surface[f"{ku}/{kd}"] = round(ll, 4); row.append(ll)
    print(f"  {ku:>5} " + "".join(f"{v:>9.4f}" for v in row))
sym = min(((surface[f"{k}/{k}"], k) for k in (3, 5, 8, 12, 20)))
asym = min((v, k) for k, v in surface.items() if k.split("/")[0] != k.split("/")[1])
print(f"  best symmetric (k_up = k_down): {sym[0]:.4f} at {sym[1]};  best asymmetric: {asym[0]:.4f} at k_up/k_down = {asym[1]}")

# ---------------------------------------------------------------- paired significance on the held-out matches
prod_loss = score(prod, fit_rows, test_rows, per_match=True)
print("\nHeld-out difference in log loss against the production Elo (negative = better; paired over the 760 matches):")
paired = {}
for label in ("classic", "margin", "asymmetric (loss > gain)", "adaptive-K", "attack/defence"):
    d = score(FEATS[label], fit_rows, test_rows, per_match=True) - prod_loss
    paired[label] = [round(float(d.mean()), 4), round(float(d.mean() / (d.std() / np.sqrt(len(d)))), 2)]
    print(f"  {label:<28}{d.mean():+.4f}  (t {d.mean() / (d.std() / np.sqrt(len(d))):+.1f})")

# ---------------------------------------------------------------- what each format does to a lopsided result
print("\nA strong club beats a weak one 5-0 (and 1-0), then loses to it 0-1 -- rating points moved (strong club / weak club):")
scen = []
for label, (cls, params) in MODELS.items():
    _, m = walk(lambda: cls(**params))
    teams = sorted(set(H[-380:]) | set(A[-380:]))
    if hasattr(m, "R"): sc = {t: m.R.get(t, 1500.0) for t in teams}
    elif hasattr(m, "RH"): sc = {t: (m.RH.get(t, 1500.0) + m.RA.get(t, 1500.0)) / 2 for t in teams}
    else: sc = {t: m.att.get(t, 0.0) + m.dfn.get(t, 0.0) for t in teams}
    strong, weak = max(sc, key=sc.get), min(sc, key=sc.get)
    row = []
    for g in ((5, 0), (1, 0), (0, 1)):
        mm = copy.deepcopy(m); d = mm.step(strong, weak, *g)
        if hasattr(m, "att"): d = (d[0] * 100, d[1] * 100)          # attack/defence ratings live in log-goals: shown in hundredths
        row.append(f"{g[0]}-{g[1]}: {d[0]:+.1f} / {d[1]:+.1f}")
    scen.append({"format": label, "pair": f"{strong} v {weak}", "moves": row})
    print(f"  {label:<26} ({strong} v {weak})   " + "   ".join(row))

# ---------------------------------------------------------------- do they improve the real model?
model_df = pd.read_csv("02_processed_data/E0_model.csv")
feat_cols = [c for c in model_df.columns if c not in ("FTR", "Div", "Date", "HomeTeam", "AwayTeam")]


def oof(X, kind):
    out = []
    idx = np.where(is_train)[0]
    for a, b in TimeSeriesSplit(n_splits=4).split(idx):
        Xa, Xb = X.iloc[idx[a]].fillna(0), X.iloc[idx[b]].fillna(0)
        m = make_pipeline(StandardScaler(), LogisticRegression(C=0.05, max_iter=3000)) if kind == "lr" else RandomForestClassifier(n_estimators=400, max_depth=8, min_samples_leaf=10, random_state=0, n_jobs=-1)
        m.fit(Xa, y[idx[a]])
        p = m.predict_proba(Xb)
        out.append(-np.log(np.clip(p[np.arange(len(b)), y[idx[b]]], 1e-9, 1)))
    return np.concatenate(out)


print("\nAdding each new rating to the model's 65 features (out-of-fold on the training seasons; change in log loss, negative = better):")
base = {k: oof(model_df[feat_cols], k) for k in ("lr", "rf")}
stack = []
for label in ("asymmetric (loss > gain)", "adaptive-K", "attack/defence", "asym. attack/defence", "margin"):
    X1 = pd.concat([model_df[feat_cols], pd.DataFrame(FEATS[label], columns=[f"{label}_{i}" for i in range(FEATS[label].shape[1])])], axis=1)
    row = {"format": label}
    for k in ("lr", "rf"):
        d = oof(X1, k) - base[k]
        row[k] = round(float(d.mean()), 5); row[k + "_t"] = round(float(d.mean() / (d.std() / np.sqrt(len(d)))), 2)
    stack.append(row)
    print(f"  {label:<28} LR {row['lr']:+.4f} (t {row['lr_t']:+.1f})   RF {row['rf']:+.4f} (t {row['rf_t']:+.1f})")


ELO_COLS = ["HomeElo", "AwayElo", "EloDifference", "HomeTeamOverallElo", "AwayTeamOverallElo", "OverallEloDifference"]
no_elo = [c for c in feat_cols if c not in ELO_COLS]
print("\nREPLACING the production Elo columns (out-of-fold on the training seasons; change in log loss against the current 65 features, negative = better):")
swap = []
for label in ("classic", "margin", "asymmetric (loss > gain)", "adaptive-K"):
    X1 = pd.concat([model_df[no_elo], pd.DataFrame(FEATS[label], columns=[f"{label}_{i}" for i in range(FEATS[label].shape[1])])], axis=1)
    row = {"format": label}
    for k in ("lr", "rf"):
        d = oof(X1, k) - base[k]
        row[k] = round(float(d.mean()), 5); row[k + "_t"] = round(float(d.mean() / (d.std() / np.sqrt(len(d)))), 2)
    swap.append(row)
    print(f"  {label:<28} LR {row['lr']:+.4f} (t {row['lr_t']:+.1f})   RF {row['rf']:+.4f} (t {row['rf_t']:+.1f})")

json.dump({"formats": results, "scenarios": scen, "added_to_model": stack, "replacing_production_elo": swap, "asymmetry_surface": surface, "heldout_vs_production": paired}, open("02_processed_data/elo_formats.json", "w"), indent=1)
print("\nSaved 02_processed_data/elo_formats.json")

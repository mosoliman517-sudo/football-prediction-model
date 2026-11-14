"""
Do the 14 extra seasons (2000-01 to 2013-14) help? Train the same kind of models (random forest +
Poisson goal model, blended) on compact walk-forward features, once on 2014-2024 only and once on
2000-2024, and score both on matches neither saw: an inner window (2022-24, trained before it) and the
final held-out 760. Then check whether a long-history model improves the production blend.
Run from the project root:  python3 src/20_test_older_seasons.py
"""
import glob
import json

import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import PoissonRegressor

import core_features
import oof_blend

COLS = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR", "HS", "AS", "HST", "AST"]
CODE = {"A": 0, "D": 1, "H": 2}


def read(files, enc="utf-8"):
    out = []
    for f in files:
        d = pd.read_csv(f, encoding=enc, on_bad_lines="skip")
        d = d[[c for c in COLS if c in d.columns]].dropna(subset=["HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"])
        out.append(d)
    d = pd.concat(out, ignore_index=True)
    d["Date"] = pd.to_datetime(d["Date"], dayfirst=True, format="mixed")
    return d


old = read(sorted(glob.glob("01_data_old/E0_*.csv")), "latin-1")
cur = read([f for f in sorted(glob.glob("01_data/E0_*.csv")) if "2627" not in f], "utf-8-sig")
old["HomeTeam"] = old["HomeTeam"].replace({"Middlesboro": "Middlesbrough"}); old["AwayTeam"] = old["AwayTeam"].replace({"Middlesboro": "Middlesbrough"})
allm = pd.concat([old, cur], ignore_index=True).sort_values("Date", kind="stable").reset_index(drop=True)
print(f"matches: {len(old)} older + {len(cur)} current = {len(allm)}")
feat = core_features.build(allm)
X = feat.copy(); y = allm["FTR"].map(CODE).to_numpy(); date = allm["Date"]
FIT_COLS = list(X.columns)


def blend_probs(tr_idx, te_idx, seed=0):
    Xtr, Xte = X.iloc[tr_idx].fillna(X.iloc[tr_idx].mean()).fillna(0), X.iloc[te_idx].fillna(X.iloc[tr_idx].mean()).fillna(0)
    rf = RandomForestClassifier(n_estimators=500, max_depth=10, min_samples_leaf=8, random_state=seed, n_jobs=-1).fit(Xtr, y[tr_idx])
    Prf = rf.predict_proba(Xte)
    mean, std = Xtr.mean(), Xtr.std().replace(0, 1)
    sc = lambda d_: (d_ - mean) / std
    lh = PoissonRegressor(max_iter=1000).fit(sc(Xtr), allm["FTHG"].to_numpy()[tr_idx]).predict(sc(Xte))
    la = PoissonRegressor(max_iter=1000).fit(sc(Xtr), allm["FTAG"].to_numpy()[tr_idx]).predict(sc(Xte))
    k = np.arange(9); Pg = np.zeros((len(te_idx), 3))
    for n, (a, b) in enumerate(zip(lh, la)):
        g = np.outer(poisson.pmf(k, a), poisson.pmf(k, b)); g /= g.sum(); Pg[n] = [np.triu(g, 1).sum(), np.trace(g), np.tril(g, -1).sum()]
    return (Prf + Pg) / 2


ll = lambda P, yy: float(-np.log(np.clip(P[np.arange(len(yy)), yy], 1e-9, 1)).mean())
res = {}
windows = {"inner 2022-24": (pd.Timestamp("2022-08-01"), pd.Timestamp("2024-08-01")), "held-out 2024-26": (pd.Timestamp("2024-08-01"), pd.Timestamp("2027-01-01"))}
print(f"\n{'trained on':<22}" + "".join(f"{w:>26}" for w in windows))
for label, start in (("2014-15 onward", pd.Timestamp("2014-08-01")), ("2000-01 onward", pd.Timestamp("2000-08-01")), ("2008-09 onward", pd.Timestamp("2008-08-01"))):
    row = {}
    for wname, (a, b) in windows.items():
        tr_idx = np.where((date >= start) & (date < a))[0]; te_idx = np.where((date >= a) & (date < b))[0]
        P = blend_probs(tr_idx, te_idx)
        row[wname] = (round(ll(P, y[te_idx]), 4), round(float((P.argmax(1) == y[te_idx]).mean()), 4), len(tr_idx), len(te_idx))
    res[label] = row
    print(f"{label:<22}" + "".join(f"{row[w][0]:>14.4f} ({row[w][1]:.1%}, n={row[w][2]})" for w in windows))

# does a core-feature model add to the production blend on the held-out matches? (rows aligned by date and teams)
z = oof_blend.get()
_, ffeat, _ = oof_blend.load()
keys_prod = ffeat[ffeat["Date"] >= "2024-08-01"][["Date", "HomeTeam", "AwayTeam"]].reset_index(drop=True)
te_idx = np.where(date >= pd.Timestamp("2024-08-01"))[0]
keys_core = allm.iloc[te_idx][["Date", "HomeTeam", "AwayTeam"]].reset_index(drop=True)
pos = keys_prod.merge(keys_core.reset_index().rename(columns={"index": "r"}), on=["Date", "HomeTeam", "AwayTeam"], how="left")["r"].to_numpy()
assert not np.isnan(pos).any() and len(pos) == len(z["P_te"])
pos = pos.astype(int)
Pprod, yte = z["P_te"], z["y_te"]
assert (y[te_idx][pos] == yte).all()
res["combo"] = {}
print("\nHeld-out 760: production blend vs core-feature models vs averages:")
cores = {}
for label, start in (("core features, trained 2014+", "2014-08-01"), ("core features, trained 2000+", "2000-08-01")):
    tr_idx = np.where((date >= pd.Timestamp(start)) & (date < pd.Timestamp("2024-08-01")))[0]
    cores[label] = blend_probs(tr_idx, te_idx)[pos]
rows = [("production blend (65 features, 2014+)", Pprod)] + list(cores.items())
for lab, Pc in list(cores.items()):
    rows.append((f"average: production + {lab}", (Pprod + Pc) / 2))
for name, P in rows:
    print(f"  {name:<60} log loss {ll(P, yte):.4f}   accuracy {(P.argmax(1) == yte).mean():.1%}")
    res["combo"][name] = [round(ll(P, yte), 4), round(float((P.argmax(1) == yte).mean()), 4)]
d = -np.log(np.clip(cores["core features, trained 2014+"][np.arange(len(yte)), yte], 1e-9, 1)) + np.log(np.clip(Pprod[np.arange(len(yte)), yte], 1e-9, 1))
print(f"  paired difference core(2014+) minus production on the 760: {d.mean():+.4f} (t {d.mean() / (d.std() / np.sqrt(len(d))):+.1f})")
json.dump(res, open("02_processed_data/older_seasons.json", "w"), indent=1)

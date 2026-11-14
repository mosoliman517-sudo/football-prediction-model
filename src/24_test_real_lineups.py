"""
Do ACTUAL starting lineups help? From 2022-23 the Fantasy archive records who started each match (starts == 1).
For each club and match: the price-weighted value of the starting XI against the club's usual XI (last 5 matches),
how many starters are new (rotation), and how many of its regular starters (top-11 by recent minutes) are missing.
Lineups are public about an hour before kickoff, so this is legitimate for a same-day forecast.
Compared on top of the compact core features, trained on 2022-24 and scored on the held-out 2024-26 matches,
plus out-of-fold over all four seasons. Run from the project root:  python3 src/24_test_real_lineups.py
"""
import glob
import os

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import core_features

COLS = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR", "HS", "AS", "HST", "AST"]
CODE = {"A": 0, "D": 1, "H": 2}
RENAME = {"Man Utd": "Man United", "Spurs": "Tottenham", "Coventry City": "Coventry", "Hull City": "Hull", "Ipswich Town": "Ipswich",
          "Sheffield Utd": "Sheffield United", "Leicester City": "Leicester", "Luton Town": "Luton", "Leeds United": "Leeds"}

frames = []
for f in sorted(glob.glob("01_data_old/E0_*.csv")):
    frames.append(pd.read_csv(f, encoding="latin-1", on_bad_lines="skip"))
for f in sorted(glob.glob("01_data/E0_*.csv")):
    if "2627" not in f:
        frames.append(pd.read_csv(f, encoding="utf-8-sig"))
allm = pd.concat([d[[c for c in COLS if c in d.columns]].dropna(subset=["HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"]) for d in frames], ignore_index=True)
allm["Date"] = pd.to_datetime(allm["Date"], dayfirst=True, format="mixed")
allm["HomeTeam"] = allm["HomeTeam"].replace({"Middlesboro": "Middlesbrough"}); allm["AwayTeam"] = allm["AwayTeam"].replace({"Middlesboro": "Middlesbrough"})
allm = allm.sort_values("Date", kind="stable").reset_index(drop=True)
core = core_features.build(allm)
y = allm["FTR"].map(CODE).to_numpy()

# ---------------- lineup features from the Fantasy archive
fpl = []
for f in sorted(glob.glob("01_data_fpl/gw_202[2-5]-*.csv")):
    d = pd.read_csv(f, low_memory=False, encoding="utf-8")
    d["season"] = os.path.basename(f)[3:10]
    fpl.append(d[["season", "team", "element", "minutes", "starts", "value", "kickoff_time", "fixture"]])
fpl = pd.concat(fpl, ignore_index=True)
fpl["team"] = fpl["team"].map(lambda t: RENAME.get(t, t))
fpl["date"] = pd.to_datetime(fpl["kickoff_time"]).dt.tz_localize(None).dt.normalize()
ours = {}
for i, (dt, h, a) in enumerate(zip(allm["Date"].dt.normalize(), allm["HomeTeam"], allm["AwayTeam"])):
    ours[(h, dt)] = (i, "Home"); ours[(a, dt)] = (i, "Away")
names = ["XIDelta", "XIValue", "Rotation", "MissingRegulars"]
feat = {f"{s}{n}": np.full(len(allm), np.nan) for s in ("Home", "Away") for n in names}
for (season, team), g in fpl.groupby(["season", "team"]):
    order = g.groupby("fixture")["date"].first().sort_values()
    xi_hist, prior_min, prev_xi, fixtures_done = [], {}, set(), 0
    for fx, dt in order.items():
        rows = g[g["fixture"] == fx]
        xi = set(rows.loc[rows["starts"] == 1, "element"])
        if len(xi) < 9:
            continue
        val = rows.set_index("element")["value"].to_dict()
        xi_val = sum(val.get(e, 0) for e in xi)
        if len(xi_hist) >= 3:
            usual = np.mean(xi_hist[-5:])
            regulars = {e for e, _ in sorted(prior_min.items(), key=lambda kv: -kv[1])[:11]}
            key = next((ours.get((team, dt + pd.Timedelta(days=k))) for k in (0, 1, -1) if ours.get((team, dt + pd.Timedelta(days=k)))), None)
            if key:
                i, side = key
                feat[f"{side}XIDelta"][i] = xi_val - usual
                feat[f"{side}XIValue"][i] = xi_val
                feat[f"{side}Rotation"][i] = len(xi - prev_xi)
                feat[f"{side}MissingRegulars"][i] = len(regulars - xi)
        xi_hist.append(xi_val); prev_xi = xi
        for _, r in rows.iterrows():
            prior_min[r["element"]] = prior_min.get(r["element"], 0) + r["minutes"]
        fixtures_done += 1
lin = pd.DataFrame(feat)
lin["XIValueDiff"] = lin["HomeXIValue"] - lin["AwayXIValue"]
lin["XIDeltaDiff"] = lin["HomeXIDelta"] - lin["AwayXIDelta"]
rows = np.where((allm["Date"] >= "2022-08-01") & lin["HomeXIDelta"].notna() & lin["AwayXIDelta"].notna())[0]
print(f"matches with lineup data: {len(rows)} (2022-23 to 2026-05)")

date = allm["Date"].to_numpy()
tr = rows[date[rows] < np.datetime64("2024-08-01")]; te = rows[date[rows] >= np.datetime64("2024-08-01")]
SETS = {"XI value vs usual XI": ["HomeXIDelta", "AwayXIDelta"], "XI value gap (home - away)": ["XIValueDiff"], "Rotation (new starters)": ["HomeRotation", "AwayRotation"],
        "Regular starters missing": ["HomeMissingRegulars", "AwayMissingRegulars"], "All lineup features": list(lin.columns)}
mk = lambda k: make_pipeline(StandardScaler(), LogisticRegression(C=0.05, max_iter=3000)) if k == "lr" else RandomForestClassifier(n_estimators=400, max_depth=6, min_samples_leaf=10, random_state=0, n_jobs=-1)


def losses(X, k, a, b):
    Xa = X.iloc[a].fillna(X.iloc[a].mean()).fillna(0); Xb = X.iloc[b].fillna(X.iloc[a].mean()).fillna(0)
    p = mk(k).fit(Xa, y[rows[a] if False else a]).predict_proba(Xb)
    return -np.log(np.clip(p[np.arange(len(b)), y[b]], 1e-9, 1))


Xc = core.copy()
print(f"\n{'added to the core features':<30}{'LR change':>12}{'RF change':>12}   (held-out 2024-26, trained 2022-24; log loss, negative = better; t-stat)")
base = {k: losses(Xc, k, tr, te) for k in ("lr", "rf")}
print(f"{'(core features alone)':<30}{base['lr'].mean():>12.4f}{base['rf'].mean():>12.4f}")
for name, cols in SETS.items():
    X1 = pd.concat([Xc, lin[cols]], axis=1)
    out = []
    for k in ("lr", "rf"):
        d = losses(X1, k, tr, te) - base[k]
        out.append(f"{d.mean():+.4f} (t {d.mean() / (d.std() / np.sqrt(len(d))):+.1f})")
    print(f"{name:<30}{out[0]:>20}{out[1]:>20}")
# out-of-fold over all four seasons
print("\nOut-of-fold across all 2022-26 matches (4 chronological folds):")
for name in ("All lineup features",):
    X1 = pd.concat([Xc, lin[SETS[name]]], axis=1)
    for k in ("lr", "rf"):
        diffs = []
        for a_, b_ in TimeSeriesSplit(n_splits=4).split(rows):
            a, b = rows[a_], rows[b_]
            diffs.append(losses(X1, k, a, b) - losses(Xc, k, a, b))
        d = np.concatenate(diffs)
        print(f"  {name} ({k.upper()}): {d.mean():+.4f} (t {d.mean() / (d.std() / np.sqrt(len(d))):+.1f}, n={len(d)})")

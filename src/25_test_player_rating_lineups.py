"""
Lineup quality from player performance ratings. Every player gets a rating built only from past matches:
an exponentially-weighted average of his per-90 performance index (Fantasy BPS and ICT, which are post-match
performance scores like the ratings sites publish), standardised by position and shrunk toward average when
he has played little. For each club and match:
  - XI quality: the sum of the ratings of the 11 who actually played the most minutes (the lineup)
  - best-XI quality: the best XI the club could have fielded from its recently active squad (1 keeper + 10 best outfielders)
  - deficit: best-XI quality minus XI quality (how much quality is missing, injuries and rotation included)
  - star count missing: how many of its 5 highest-rated recent players are not in the XI
Tested on top of the compact core features: trained 2020-24, scored on the held-out 2024-26, and out-of-fold.
FotMob's own ratings are not used: they are scraped, not provided, so they are not collected here.
Run from the project root:  python3 src/25_test_player_rating_lineups.py
"""
import glob
import os
from collections import defaultdict, deque

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
DECAY, PRIOR = 0.92, 3.0

frames = [pd.read_csv(f, encoding="latin-1", on_bad_lines="skip") for f in sorted(glob.glob("01_data_old/E0_*.csv"))]
frames += [pd.read_csv(f, encoding="utf-8-sig") for f in sorted(glob.glob("01_data/E0_*.csv")) if "2627" not in f]
allm = pd.concat([d[[c for c in COLS if c in d.columns]].dropna(subset=["HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"]) for d in frames], ignore_index=True)
allm["Date"] = pd.to_datetime(allm["Date"], dayfirst=True, format="mixed")
allm = allm.replace({"Middlesboro": "Middlesbrough"}).sort_values("Date", kind="stable").reset_index(drop=True)
core = core_features.build(allm)
y = allm["FTR"].map(CODE).to_numpy()
ours = {}
for i, (dt, h, a) in enumerate(zip(allm["Date"].dt.normalize(), allm["HomeTeam"], allm["AwayTeam"])):
    ours[(h, dt)] = (i, "Home"); ours[(a, dt)] = (i, "Away")

fpl = []
for f in sorted(glob.glob("01_data_fpl/gw_202[0-5]-*.csv")):
    d = pd.read_csv(f, low_memory=False, encoding="utf-8")
    d["season"] = os.path.basename(f)[3:10]
    fpl.append(d[["season", "name", "position", "team", "minutes", "bps", "ict_index", "kickoff_time", "fixture"]])
fpl = pd.concat(fpl, ignore_index=True)
fpl["team"] = fpl["team"].map(lambda t: RENAME.get(t, t))
fpl["position"] = fpl["position"].replace({"GKP": "GK"})
fpl["date"] = pd.to_datetime(fpl["kickoff_time"]).dt.tz_localize(None)
played = fpl[fpl["minutes"] >= 30]
stats = {pos: (played.loc[played["position"] == pos, "bps"] / played.loc[played["position"] == pos, "minutes"] * 90, played.loc[played["position"] == pos, "ict_index"] / played.loc[played["position"] == pos, "minutes"] * 90) for pos in ("GK", "DEF", "MID", "FWD")}
norm = {pos: (b.mean(), b.std(), i.mean(), i.std()) for pos, (b, i) in stats.items()}      # global scale constants per position


def perf(pos, minutes, bps, ict):
    bm, bs, im, ist = norm[pos]
    return 0.6 * ((bps / minutes * 90 - bm) / bs) + 0.4 * ((ict / minutes * 90 - im) / ist)


num, den = defaultdict(float), defaultdict(float)        # per player: weighted sum of performance, weighted minutes
recent = defaultdict(lambda: defaultdict(lambda: deque(maxlen=6)))      # team -> player -> last 6 minutes
rating = lambda n: num[n] / (PRIOR + den[n])
names = ["XIQuality", "BestXIQuality", "Deficit", "StarsMissing"]
feat = {f"{s}{n}": np.full(len(allm), np.nan) for s in ("Home", "Away") for n in names}

for (season, fx), g in fpl.sort_values("date", kind="stable").groupby(["season", "fixture"], sort=False):
    dt = g["date"].iloc[0].normalize()
    for team, tg in g.groupby("team"):
        team_hist = recent[(season, team)]
        pool = [(r.name, r.position) for r in tg.itertuples() if sum(team_hist[r.name]) >= 90 or r.minutes >= 60]
        xi = tg[tg["minutes"] > 0].sort_values("minutes", ascending=False).head(11)
        if len(xi) < 11 or len(pool) < 13 or len(team_hist) == 0:
            continue
        r_of = {n: rating(n) for n, _ in pool}
        xi_q = sum(rating(n) for n in xi["name"])
        gks = sorted([r_of[n] for n, p in pool if p == "GK"], reverse=True)
        out = sorted([r_of[n] for n, p in pool if p != "GK"], reverse=True)
        best = (gks[0] if gks else 0.0) + sum(out[:10])
        top5 = {n for n, _ in sorted(r_of.items(), key=lambda kv: -kv[1])[:5]}
        key = next((ours.get((team, dt + pd.Timedelta(days=k))) for k in (0, 1, -1) if ours.get((team, dt + pd.Timedelta(days=k)))), None)
        if key:
            i, side = key
            feat[f"{side}XIQuality"][i] = xi_q; feat[f"{side}BestXIQuality"][i] = best
            feat[f"{side}Deficit"][i] = best - xi_q; feat[f"{side}StarsMissing"][i] = len(top5 - set(xi["name"]))
    # update ratings and minute histories AFTER the match
    for r in g.itertuples():
        recent[(season, r.team)][r.name].append(r.minutes)
        if r.minutes >= 15:
            w = min(r.minutes, 90) / 90
            num[r.name] = DECAY * num[r.name] + w * perf(r.position, r.minutes, r.bps, r.ict_index)
            den[r.name] = DECAY * den[r.name] + w
lin = pd.DataFrame(feat)
lin["XIQualityGap"] = lin["HomeXIQuality"] - lin["AwayXIQuality"]
lin["DeficitGap"] = lin["AwayDeficit"] - lin["HomeDeficit"]       # positive: away side is missing more than home
rows = np.where((allm["Date"] >= "2020-10-01") & lin["HomeDeficit"].notna() & lin["AwayDeficit"].notna())[0]
print(f"matches with rated lineups: {len(rows)} (2020-21 to 2025-26)")
date = allm["Date"].to_numpy()
tr = rows[date[rows] < np.datetime64("2024-08-01")]; te = rows[date[rows] >= np.datetime64("2024-08-01")]
SETS = {"Deficit vs best XI": ["HomeDeficit", "AwayDeficit"], "Deficit gap": ["DeficitGap"], "XI quality (lineup)": ["HomeXIQuality", "AwayXIQuality", "XIQualityGap"],
        "Star players missing": ["HomeStarsMissing", "AwayStarsMissing"], "All rated-lineup features": list(lin.columns)}
mk = lambda k: make_pipeline(StandardScaler(), LogisticRegression(C=0.05, max_iter=3000)) if k == "lr" else RandomForestClassifier(n_estimators=400, max_depth=6, min_samples_leaf=10, random_state=0, n_jobs=-1)


def losses(X, k, a, b):
    Xa = X.iloc[a].fillna(X.iloc[a].mean()).fillna(0); Xb = X.iloc[b].fillna(X.iloc[a].mean()).fillna(0)
    p = mk(k).fit(Xa, y[a]).predict_proba(Xb)
    return -np.log(np.clip(p[np.arange(len(b)), y[b]], 1e-9, 1))


print(f"\n{'added to the core features':<30}{'LR change':>20}{'RF change':>20}   (trained 2020-24, scored on held-out 2024-26 ({len(te)} matches); log loss, negative = better)")
base = {k: losses(core, k, tr, te) for k in ("lr", "rf")}
print(f"{'(core features alone)':<30}{base['lr'].mean():>20.4f}{base['rf'].mean():>20.4f}")
for name, cols in SETS.items():
    X1 = pd.concat([core, lin[cols]], axis=1)
    out = []
    for k in ("lr", "rf"):
        d = losses(X1, k, tr, te) - base[k]
        out.append(f"{d.mean():+.4f} (t {d.mean() / (d.std() / np.sqrt(len(d))):+.1f})")
    print(f"{name:<30}{out[0]:>20}{out[1]:>20}")
print("\nOut-of-fold across all matches (5 chronological folds):")
for name in ("Deficit vs best XI", "All rated-lineup features"):
    X1 = pd.concat([core, lin[SETS[name]]], axis=1)
    for k in ("lr", "rf"):
        diffs = [losses(X1, k, rows[a_], rows[b_]) - losses(core, k, rows[a_], rows[b_]) for a_, b_ in TimeSeriesSplit(n_splits=5).split(rows)]
        d = np.concatenate(diffs)
        print(f"  {name} ({k.upper()}): {d.mean():+.4f} (t {d.mean() / (d.std() / np.sqrt(len(d))):+.1f}, n={len(d)})")
print("\nSanity: does the deficit behave? Average deficit when a club lost vs won (higher = more quality missing):")
res = allm["FTR"].to_numpy()
h_won = res == "H"; a_won = res == "A"
ok = lin["HomeDeficit"].notna().to_numpy()
print(f"  home club: deficit {lin['HomeDeficit'][ok & h_won].mean():.2f} when it won, {lin['HomeDeficit'][ok & a_won].mean():.2f} when it lost")
print(f"  away club: deficit {lin['AwayDeficit'][ok & a_won].mean():.2f} when it won, {lin['AwayDeficit'][ok & h_won].mean():.2f} when it lost")

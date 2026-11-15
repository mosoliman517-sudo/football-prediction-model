"""
Big 5 leagues, season by season. For each test season S (2017-18 onward) every league's matches are predicted by a model
trained ONLY on seasons before S; then S joins the training data for S+1, so every season is both test and training data
(walk-forward, no season is ever predicted by a model that saw it).

Two ways of training are compared on the SAME matches:
  own    one model per league, trained on that league's earlier seasons
  pooled one model trained on all five leagues' earlier seasons (with a league indicator)
and both are set against the bookmaker market (average closing odds, margin removed) and "always Home".

The compact walk-forward features (src/core_features.py: Elo, form, shots, rest, head to head, season-to-date) can be built
for any league from results alone; the Premier League's richer inputs (xG, squad value, managers) have no equivalent here,
so this measures what extra leagues add on equal footing.
Run from the project root:  python3 src/29_multi_league_walkforward.py
"""
import glob
import json

import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import PoissonRegressor

import core_features

LEAGUES = {"E0": "Premier League", "D1": "Bundesliga", "SP1": "La Liga", "I1": "Serie A", "F1": "Ligue 1"}
COLS = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR", "HS", "AS", "HST", "AST", "AvgH", "AvgD", "AvgA", "B365H", "B365D", "B365A"]
CODE = {"A": 0, "D": 1, "H": 2}
FIRST_TEST = 2017          # test seasons start with 2017-18 (three seasons of history before it)
LIVE = 2026                # 2026-27, still being played: predicted for the page, left out of the benchmark summary


def read(path):
    for enc in ("utf-8-sig", "latin-1"):
        try:
            d = pd.read_csv(path, encoding=enc, on_bad_lines="skip")
            break
        except UnicodeDecodeError:
            continue
    d = d.dropna(subset=["HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"])
    for c in COLS:
        if c not in d.columns:
            d[c] = np.nan
    d = d[COLS].copy()
    d["Date"] = pd.to_datetime(d["Date"], dayfirst=True, format="mixed")
    return d


def load():
    frames = []
    for lg in LEAGUES:
        files = sorted(glob.glob(f"01_data/E0_*.csv")) if lg == "E0" else sorted(glob.glob(f"01_data_leagues/{lg}_*.csv"))
        d = pd.concat([read(f) for f in files], ignore_index=True).sort_values("Date", kind="stable").reset_index(drop=True)
        feat = core_features.build(d)
        d = pd.concat([d, feat], axis=1)
        d["League"] = lg
        d["Season"] = np.where(d["Date"].dt.month >= 8, d["Date"].dt.year, d["Date"].dt.year - 1)
        frames.append(d)
        print(f"  {LEAGUES[lg]:<15} {len(d):>5} matches, seasons {d['Season'].min()}-{d['Season'].max()}", flush=True)
    return pd.concat(frames, ignore_index=True)


def market(d):
    """Average closing odds (else Bet365), margin removed. NaN where neither exists."""
    out = np.full((len(d), 3), np.nan)
    for a, dr, h in (("AvgA", "AvgD", "AvgH"), ("B365A", "B365D", "B365H")):
        q = 1 / d[[a, dr, h]].to_numpy(float)
        ok = np.isnan(out[:, 0]) & ~np.isnan(q).any(1)
        out[ok] = q[ok] / q[ok].sum(1, keepdims=True)
    return out


def fit_predict(Xtr, ytr, gh, ga, Xte, seed=0):
    mean = Xtr.mean()
    Xtr, Xte = Xtr.fillna(mean).fillna(0), Xte.fillna(mean).fillna(0)
    rf = RandomForestClassifier(n_estimators=300, max_depth=10, min_samples_leaf=8, random_state=seed, n_jobs=-1).fit(Xtr, ytr)
    Prf = rf.predict_proba(Xte)
    mu, sd = Xtr.mean(), Xtr.std().replace(0, 1)
    sc = lambda d_: (d_ - mu) / sd
    lh = PoissonRegressor(max_iter=1000).fit(sc(Xtr), gh).predict(sc(Xte))
    la = PoissonRegressor(max_iter=1000).fit(sc(Xtr), ga).predict(sc(Xte))
    k = np.arange(9); Pg = np.zeros((len(Xte), 3))
    for n, (a, b) in enumerate(zip(lh, la)):
        g = np.outer(poisson.pmf(k, a), poisson.pmf(k, b)); g /= g.sum()
        Pg[n] = [np.triu(g, 1).sum(), np.trace(g), np.tril(g, -1).sum()]
    return (Prf + Pg) / 2, lh, la


ll = lambda P, y: -np.log(np.clip(P[np.arange(len(y)), y], 1e-9, 1))


def main():
    print("Loading and building features:")
    d = load()
    y = d["FTR"].map(CODE).to_numpy()
    feats = [c for c in d.columns if c not in COLS and c not in ("League", "Season")]
    X = d[feats].copy()
    for lg in LEAGUES:
        X[f"lg_{lg}"] = (d["League"] == lg).astype(float)
    mk = market(d)
    rows, per_match = [], []
    seasons = sorted(s for s in d["Season"].unique() if s >= FIRST_TEST)
    for S in seasons:
        te = np.where(d["Season"] == S)[0]
        tr_all = np.where(d["Season"] < S)[0]
        P_pool, LH_pool, LA_pool = fit_predict(X.iloc[tr_all], y[tr_all], d["FTHG"].to_numpy()[tr_all], d["FTAG"].to_numpy()[tr_all], X.iloc[te])
        for lg in LEAGUES:
            idx = np.where((d["Season"] == S) & (d["League"] == lg))[0]
            tr = np.where((d["Season"] < S) & (d["League"] == lg))[0]
            P_own, _, _ = fit_predict(X.iloc[tr], y[tr], d["FTHG"].to_numpy()[tr], d["FTAG"].to_numpy()[tr], X.iloc[idx])
            pos = np.searchsorted(te, idx)
            Pp = P_pool[pos]
            for j, r_ in enumerate(idx):
                per_match.append((lg, S, d["Date"].iloc[r_].strftime("%Y-%m-%d"), d["HomeTeam"].iloc[r_], d["AwayTeam"].iloc[r_], int(d["FTHG"].iloc[r_]), int(d["FTAG"].iloc[r_]), d["FTR"].iloc[r_],
                                  *Pp[j].round(4), round(float(LH_pool[pos[j]]), 3), round(float(LA_pool[pos[j]]), 3), *np.round(mk[r_], 4)))
            m = mk[idx]; ok = ~np.isnan(m).any(1)
            rec = {"season": f"{S}-{str(S + 1)[2:]}", "league": lg, "n": len(idx), "n_market": int(ok.sum()),
                   "own_ll": float(ll(P_own, y[idx]).mean()), "pooled_ll": float(ll(Pp, y[idx]).mean()),
                   "own_acc": float((P_own.argmax(1) == y[idx]).mean()), "pooled_acc": float((Pp.argmax(1) == y[idx]).mean()),
                   "home_acc": float((y[idx] == 2).mean())}
            if ok.any():
                rec.update(market_ll=float(ll(m[ok], y[idx][ok]).mean()), market_acc=float((m[ok].argmax(1) == y[idx][ok]).mean()),
                           own_ll_mk=float(ll(P_own[ok], y[idx][ok]).mean()), pooled_ll_mk=float(ll(Pp[ok], y[idx][ok]).mean()))
            rows.append(rec)
        print(f"  {S}-{str(S + 1)[2:]} done ({len(tr_all)} training matches)", flush=True)
    pm = pd.DataFrame(per_match, columns=["league", "season", "date", "home", "away", "hg", "ag", "res", "p_a", "p_d", "p_h", "lam_h", "lam_a", "mk_a", "mk_d", "mk_h"])
    pm.to_csv("02_processed_data/multi_league_matches.csv", index=False)
    print(f"Saved {len(pm)} per-match predictions (pooled model) to 02_processed_data/multi_league_matches.csv")
    rows = [r for r in rows if r["season"] != f"{LIVE}-{str(LIVE + 1)[2:]}"]
    df = pd.DataFrame(rows)
    df.to_csv("02_processed_data/multi_league_walkforward.csv", index=False)
    w = lambda g, c: float(np.average(g[c], weights=g["n"]))
    wm = lambda g, c: float(np.average(g[c].dropna(), weights=g.loc[g[c].notna(), "n_market"]))
    print(f"\nTest seasons {seasons[0]}-{str(seasons[0] + 1)[2:]} to {seasons[-2]}-{str(seasons[-2] + 1)[2:]}, every season predicted from earlier ones only (2026-27 is predicted for the page but left out of this table).")
    print(f"{'league':<16}{'n':>6}   {'own ll':>7} {'pooled ll':>10} {'market ll':>10}   {'own acc':>8} {'pooled acc':>11} {'market acc':>11} {'always Home':>12}")
    out = {}
    for lg, g in list(df.groupby("league", sort=False)) + [("ALL", df)]:
        r = {"n": int(g["n"].sum()), "own_ll": w(g, "own_ll"), "pooled_ll": w(g, "pooled_ll"), "market_ll": wm(g, "market_ll"),
             "own_acc": w(g, "own_acc"), "pooled_acc": w(g, "pooled_acc"), "market_acc": wm(g, "market_acc"), "home_acc": w(g, "home_acc")}
        out[lg] = r
        print(f"{LEAGUES.get(lg, 'All five'):<16}{r['n']:>6}   {r['own_ll']:>7.4f} {r['pooled_ll']:>10.4f} {r['market_ll']:>10.4f}   {r['own_acc']:>8.1%} {r['pooled_acc']:>11.1%} {r['market_acc']:>11.1%} {r['home_acc']:>12.1%}")
    json.dump(out, open("02_processed_data/multi_league_summary.json", "w"), indent=1)
    print("\nSaved 02_processed_data/multi_league_walkforward.csv and multi_league_summary.json")


if __name__ == "__main__":
    main()

"""
Does "nothing left to play for" help predict results? Late in a season a club whose position is effectively decided
(champion, safe, stuck in a Champions League slot, out of every race) may rotate or ease off, while a rival still chasing
a place or fighting the drop plays flat out (Man City, stuck second, losing to an Aston Villa side chasing the top five).

For every match, for each side, count which of four bands are STILL UNDECIDED given the points left to play:
title (1st), Champions League (top 4, top 5 from 2024-25), Europe (top 7), and survival (17th or better).
A band is undecided when the club could finish on either side of it:
    best finish  = 1 + clubs already above it even if it wins everything left
    worst finish = 1 + clubs that could still pass it even if it gets nothing more
Two reaches are used: HARD (every other club could win all its remaining games: 3 points a game) and SOFT (2 points a
game, which is closer to what really changes behaviour, since a decided position is rarely mathematically sealed).
Features: how many bands are alive for each side, a "nothing at stake" flag, and that flag times the Elo gap, so a
strong club easing off can pull its edge down.

Same rules as 14 and 27: out-of-fold on the training seasons, a logistic regression and a forest must agree, and the
held-out 760 are touched once, only for a combination that passed:
    python3 src/28_test_motivation.py --confirm
Run from the project root:  python3 src/28_test_motivation.py
"""
import importlib.util
import json
import sys

import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit

from config import TRAIN_TEST_SPLIT_DATE

spec = importlib.util.spec_from_file_location("sig14", "src/14_test_new_signals.py")
sig = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sig)
fit_predict, CODE, NON_FEATURES = sig.fit_predict, sig.CODE, sig.NON_FEATURES
SPLITS = 4
LATE = 8          # "late season": the side with fewer games left has this many or fewer


def build(base):
    d = pd.to_datetime(base["Date"], format="mixed")
    season = np.where(d.dt.month >= 8, d.dt.year, d.dt.year - 1)
    n = len(base)
    names = ["HomeAlive3", "AwayAlive3", "HomeAlive2", "AwayAlive2", "HomeLeft", "AwayLeft"]
    out = {k: np.zeros(n) for k in names}
    home, away = base["HomeTeam"].to_numpy(), base["AwayTeam"].to_numpy()
    hg, ag = base["FTHG"].to_numpy(), base["FTAG"].to_numpy()
    teams_of = {s: set(home[season == s]) | set(away[season == s]) for s in np.unique(season)}
    cur, pts, played = None, {}, {}
    for i in np.argsort(d.values, kind="stable"):
        s = season[i]
        if s != cur:
            cur, pts, played = s, {t: 0 for t in teams_of[s]}, {t: 0 for t in teams_of[s]}
        ucl = 5 if s >= 2024 else 4
        bands = (1, ucl, 7, 17)
        for side, t in (("Home", home[i]), ("Away", away[i])):
            p, r = pts[t], 38 - played[t]
            out[f"{side}Left"][i] = r
            for tag, f in (("3", 3), ("2", 2)):
                best = 1 + sum(1 for j, pj in pts.items() if j != t and pj > p + f * r)
                worst = 1 + sum(1 for j, pj in pts.items() if j != t and pj + f * (38 - played[j]) > p)
                out[f"{side}Alive{tag}"][i] = sum(1 for b in bands if best <= b < worst)
        pts[home[i]] += 3 if hg[i] > ag[i] else 1 if hg[i] == ag[i] else 0
        pts[away[i]] += 3 if ag[i] > hg[i] else 1 if hg[i] == ag[i] else 0
        played[home[i]] += 1; played[away[i]] += 1
    c = pd.DataFrame(out, index=base.index)
    c["HomeSealed2"] = (c["HomeAlive2"] == 0).astype(float)
    c["AwaySealed2"] = (c["AwayAlive2"] == 0).astype(float)
    elo = base["EloDifference"].to_numpy()
    c["EloXHomeSealed"] = elo * c["HomeSealed2"]
    c["EloXAwaySealed"] = elo * c["AwaySealed2"]
    c["AliveGap2"] = c["HomeAlive2"] - c["AwayAlive2"]
    return c


GROUPS = {
    "Bands still alive, hard (3 pts a game left)": ["HomeAlive3", "AwayAlive3"],
    "Bands still alive, soft (2 pts a game left)": ["HomeAlive2", "AwayAlive2"],
    "Nothing at stake flags (soft)": ["HomeSealed2", "AwaySealed2"],
    "Nothing at stake x Elo gap": ["HomeSealed2", "AwaySealed2", "EloXHomeSealed", "EloXAwaySealed"],
    "Stakes gap (home bands alive minus away) + flags": ["AliveGap2", "HomeSealed2", "AwaySealed2"],
    "Everything above (soft + hard + flags + Elo interaction)": ["HomeAlive3", "AwayAlive3", "HomeAlive2", "AwayAlive2",
                                                                  "HomeSealed2", "AwaySealed2", "EloXHomeSealed", "EloXAwaySealed", "AliveGap2"],
}


def oof_rows(X, y, kind):
    """Out-of-fold per-match log loss and the row index of each scored match."""
    idx, loss = [], []
    for a, b in TimeSeriesSplit(n_splits=SPLITS).split(X):
        mean = X.iloc[a].mean()
        p = fit_predict(kind, X.iloc[a].fillna(mean).fillna(0), y[a], X.iloc[b].fillna(mean).fillna(0))
        loss.append(-np.log(np.clip(p[np.arange(len(b)), y[b]], 1e-9, 1))); idx.append(b)
    return np.concatenate(idx), np.concatenate(loss)


def main():
    base = pd.read_csv("02_processed_data/E0_features.csv")
    model = pd.read_csv("02_processed_data/E0_model.csv")
    assert (model["HomeTeam"].values == base["HomeTeam"].values).all()
    cand = build(base)
    date = pd.to_datetime(model["Date"], format="mixed")
    y_all = model["FTR"].map(CODE).values
    feats = [c for c in model.columns if c not in NON_FEATURES and model[c].notna().any()]
    train = (date < TRAIN_TEST_SPLIT_DATE).values
    left = np.minimum(cand["HomeLeft"], cand["AwayLeft"]).to_numpy()
    sealed = ((cand["HomeSealed2"] + cand["AwaySealed2"]) > 0).to_numpy()

    if "--confirm" in sys.argv:
        names = [g for g in GROUPS if g.startswith("Everything")] if len(sys.argv) < 3 else sys.argv[2].split("|")
        cols = sorted({c for g in names for c in GROUPS[g]})
        tr, te = np.where(train)[0], np.where(~train)[0]
        X0, X1 = model[feats], pd.concat([model[feats], cand[cols]], axis=1)
        late = left[te] <= LATE
        print(f"Held-out {len(te)} matches (used once); {late.sum()} late-season; matches with a club at nothing-to-play-for: {int(sealed[te].sum())}. Added: {names}")
        for k in ("lr", "rf"):
            res = []
            for X in (X0, X1):
                mean = X.iloc[tr].mean()
                p = fit_predict(k, X.iloc[tr].fillna(mean).fillna(0), y_all[tr], X.iloc[te].fillna(mean).fillna(0))
                ll = -np.log(np.clip(p[np.arange(len(te)), y_all[te]], 1e-9, 1))
                res.append((ll.mean(), ll[late].mean(), (p.argmax(1) == y_all[te]).mean()))
            print(f"  {k.upper()}: log loss {res[0][0]:.4f} -> {res[1][0]:.4f} (late season {res[0][1]:.4f} -> {res[1][1]:.4f}), accuracy {res[0][2]:.1%} -> {res[1][2]:.1%}")
        return

    idx = np.where(train)[0]
    y = y_all[idx]
    X0 = model.loc[idx, feats].reset_index(drop=True)
    print(f"{len(idx)} training matches. Matches where at least one side has nothing at stake (soft): {int(sealed[idx].sum())} "
          f"({sealed[idx].mean():.1%}); late-season matches (<= {LATE} games left): {int((left[idx] <= LATE).sum())}")
    base_loss, rows = {}, {}
    for k in ("lr", "rf"):
        rows[k], base_loss[k] = oof_rows(X0, y, k)
    late_o = left[idx][rows["lr"]] <= LATE
    out = []
    print(f"\nbaseline log loss: LR {base_loss['lr'].mean():.4f}   RF {base_loss['rf'].mean():.4f}")
    print("(negative = the new signal lowers log loss; 'late' = only matches with a side that has 8 or fewer games left)\n")
    for name, cols in GROUPS.items():
        X1 = pd.concat([X0, cand.loc[idx, cols].reset_index(drop=True)], axis=1)
        rec = {"group": name}
        line = f"  {name:<58}"
        for k in ("lr", "rf"):
            r2, l2 = oof_rows(X1, y, k)
            assert (r2 == rows[k]).all()
            diff = l2 - base_loss[k]
            ld = diff[late_o]
            rec[k] = [round(diff.mean(), 5), round(diff.mean() / (diff.std() / np.sqrt(len(diff))), 2), round(ld.mean(), 5), round(ld.mean() / (ld.std() / np.sqrt(len(ld))), 2)]
            line += f"  {k.upper()} all {diff.mean():+.4f} (t {rec[k][1]:+.1f}) late {ld.mean():+.4f} (t {rec[k][3]:+.1f})"
        agree = all(rec[k][0] < 0 for k in ("lr", "rf")) and min(rec[k][1] for k in ("lr", "rf")) < -1 and min(rec[k][3] for k in ("lr", "rf")) < -1
        rec["verdict"] = "HELPS" if agree else "hurts" if all(rec[k][0] > 0 for k in ("lr", "rf")) else "no clear effect"
        print(line + f"   {rec['verdict']}", flush=True)
        out.append(rec)
    json.dump(out, open("02_processed_data/motivation_tests.json", "w"), indent=1)
    print("\nSaved 02_processed_data/motivation_tests.json")


if __name__ == "__main__":
    main()

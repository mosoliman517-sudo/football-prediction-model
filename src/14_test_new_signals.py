"""
Tests every candidate signal on its own: does adding it to the current feature
set lower the out-of-fold log loss (lower = better calibrated probabilities)?

Rules, so a lucky result cannot sneak in:
  * Candidates are judged on the TRAINING seasons only (chronological folds,
    each fold trained on the past and scored on the next block).
  * Two different models must agree (a logistic regression and a random
    forest), and the improvement is paired match by match, so noise shows up
    as a standard error.
  * The held-out 760 matches are touched once, only for signals that passed,
    with:  python3 src/14_test_new_signals.py --confirm "group A,group B"

Run from the project root:  python3 src/14_test_new_signals.py
"""

import json
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from config import TRAIN_TEST_SPLIT_DATE
from features.candidates import build_all

CODE = {"A": 0, "D": 1, "H": 2}
NON_FEATURES = ("FTR", "Div", "Date", "HomeTeam", "AwayTeam")

GROUPS = {
    "Manager: changes in last 2 years": ["HomeMgrChanges730", "AwayMgrChanges730"],
    "Manager: changed in last 70 days": ["HomeMgrChangeLast70d", "AwayMgrChangeLast70d"],
    "Manager: interim spell recently": ["HomeMgrInterimRecent", "AwayMgrInterimRecent"],
    "Manager: tenure (tested before)": ["HomeMgrTenureLog", "AwayMgrTenureLog"],
    "Manager: all four": ["HomeMgrChanges730", "AwayMgrChanges730", "HomeMgrChangeLast70d", "AwayMgrChangeLast70d",
                          "HomeMgrInterimRecent", "AwayMgrInterimRecent", "HomeMgrTenureLog", "AwayMgrTenureLog"],
    "Referee record": ["RefHomeEdge", "RefGoalsEdge", "RefCardsEdge"],
    "Derby": ["IsDerby"],
    "Travel distance": ["TravelKm"],
    "Days since international break": ["DaysSinceBreak", "JustAfterBreak"],
    "Stakes (title / top four / drop gaps)": ["HomeRemaining", "AwayRemaining", "HomeTitleGapPerGame", "AwayTitleGapPerGame",
                                              "HomeTop4GapPerGame", "AwayTop4GapPerGame", "HomeSafetyGapPerGame", "AwaySafetyGapPerGame"],
    "Weather": ["WxRain", "WxWind", "WxTemp"],
    "Long-run points and goal difference (last 38 matches)": ["HomePPG38", "AwayPPG38", "HomeGD38", "AwayGD38"],
}
LINEUP = {
    "Lineup: share of usual minutes missing": ["HomeAbsentMinShare", "AwayAbsentMinShare"],
    "Lineup: value of missing regulars": ["HomeAbsentValueShare", "AwayAbsentValueShare"],
    "Lineup: number of regulars out": ["HomeNumAbsent", "AwayNumAbsent"],
    "Lineup: goalkeeper missing": ["HomeGKAbsent", "AwayGKAbsent"],
    "Lineup: all four": ["HomeAbsentMinShare", "AwayAbsentMinShare", "HomeAbsentValueShare", "AwayAbsentValueShare",
                         "HomeNumAbsent", "AwayNumAbsent", "HomeGKAbsent", "AwayGKAbsent"],
}
FPL_START = "2020-09-01"


def fit_predict(kind, Xa, ya, Xb):
    if kind == "lr":
        m = make_pipeline(StandardScaler(), LogisticRegression(C=0.05, max_iter=3000))
    else:
        m = RandomForestClassifier(n_estimators=400, max_depth=8, min_samples_leaf=10, random_state=0, n_jobs=-1)
    m.fit(Xa, ya)
    return m.predict_proba(Xb)


def oof_losses(X, y, kind, splits):
    losses = []
    for a, b in TimeSeriesSplit(n_splits=splits).split(X):
        mean = X.iloc[a].mean()
        p = fit_predict(kind, X.iloc[a].fillna(mean).fillna(0), y[a], X.iloc[b].fillna(mean).fillna(0))
        losses.append(-np.log(np.clip(p[np.arange(len(b)), y[b]], 1e-9, 1)))
    return np.concatenate(losses)


def main():
    base = pd.read_csv("02_processed_data/E0_features.csv")
    model = pd.read_csv("02_processed_data/E0_model.csv")
    assert (model["HomeTeam"].values == base["HomeTeam"].values).all()
    cand = build_all(base)
    cand.to_csv("02_processed_data/candidate_signals.csv", index=False)
    date = pd.to_datetime(model["Date"], format="mixed")
    y_all = model["FTR"].map(CODE).values
    feats = [c for c in model.columns if c not in NON_FEATURES]
    train = (date < TRAIN_TEST_SPLIT_DATE).values

    confirm = None
    if "--confirm" in sys.argv:
        confirm = sys.argv[sys.argv.index("--confirm") + 1].split(",")

    def block(groups, rows, splits, title):
        idx = np.where(rows)[0]
        y = y_all[idx]
        X0 = model.loc[idx, feats].reset_index(drop=True)
        base_loss = {k: oof_losses(X0, y, k, splits) for k in ("lr", "rf")}
        print(f"\n{title}: {len(idx)} training matches, {len(base_loss['lr'])} scored out-of-fold")
        print(f"  current features: log loss LR {base_loss['lr'].mean():.4f}   RF {base_loss['rf'].mean():.4f}")
        rows_out = []
        for name, cols in groups.items():
            cols = [c for c in cols if c in cand.columns and cand.loc[idx, c].notna().any()]
            if not cols:
                print(f"  {name}: no data"); continue
            X1 = pd.concat([X0, cand.loc[idx, cols].reset_index(drop=True)], axis=1)
            res = {}
            for k in ("lr", "rf"):
                d = oof_losses(X1, y, k, splits) - base_loss[k]
                res[k] = (d.mean(), d.std() / np.sqrt(len(d)))
            verdict = ("HELPS" if all(res[k][0] < 0 for k in res) and min(res[k][0] / res[k][1] for k in res) < -1.0 and
                       (res["lr"][0] / res["lr"][1] < -2 or res["rf"][0] / res["rf"][1] < -2) else
                       "hurts" if all(res[k][0] > 0 for k in res) else "no clear effect")
            rows_out.append({"signal": name, "lr": round(res["lr"][0], 5), "lr_t": round(res["lr"][0] / res["lr"][1], 2),
                             "rf": round(res["rf"][0], 5), "rf_t": round(res["rf"][0] / res["rf"][1], 2), "verdict": verdict})
            print(f"  {name:<42} LR {res['lr'][0]:+.4f} (t {res['lr'][0] / res['lr'][1]:+.1f})   RF {res['rf'][0]:+.4f} (t {res['rf'][0] / res['rf'][1]:+.1f})   {verdict}")
        return rows_out

    if confirm is None:
        out = {"general": block(GROUPS, train, 4, "All seasons 2014-2024"),
               "lineup": block(LINEUP, train & (date >= FPL_START).values, 3, "Lineup signals, seasons 2020-2024 only")}
        json.dump(out, open("02_processed_data/signal_tests.json", "w"), indent=1)
        print("\nSaved 02_processed_data/signal_tests.json")
        return

    allg = {**GROUPS, **LINEUP}
    cols = sorted({c for g in confirm for c in allg[g]})
    test = ~train
    subset = np.ones(len(model), bool)
    if any(g in LINEUP for g in confirm):
        subset = (date >= FPL_START).values
    tr, te = np.where(train & subset)[0], np.where(test)[0]
    X0, X1 = model[feats], pd.concat([model[feats], cand[cols]], axis=1)
    print(f"Held-out {len(te)} matches (used once), trained on {len(tr)}; extra columns: {cols}")
    for k in ("lr", "rf"):
        res = []
        for X in (X0, X1):
            mean = X.iloc[tr].mean()
            p = fit_predict(k, X.iloc[tr].fillna(mean).fillna(0), y_all[tr], X.iloc[te].fillna(mean).fillna(0))
            res.append((-np.log(np.clip(p[np.arange(len(te)), y_all[te]], 1e-9, 1)).mean(), (p.argmax(1) == y_all[te]).mean()))
        print(f"  {k.upper()}: log loss {res[0][0]:.4f} -> {res[1][0]:.4f}   accuracy {res[0][1]:.1%} -> {res[1][1]:.1%}")


if __name__ == "__main__":
    main()

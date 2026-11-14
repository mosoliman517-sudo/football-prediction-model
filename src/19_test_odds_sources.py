"""
Which bookmaker odds help the market-informed hybrid most? A logistic-regression stack of our blend
and one odds source (margin removed), trained on out-of-fold training data only, scored on the
held-out 760. Run from the project root:  python3 src/19_test_odds_sources.py
"""
import glob
import json

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

import oof_blend
from config import TRAIN_TEST_SPLIT_DATE

z = oof_blend.get()
P_tr, I_tr, y_tr, P_te, y_te = z["P_tr"], z["I_tr"], z["y_tr"], z["P_te"], z["y_te"]
_, feat, _ = oof_blend.load()
tr = feat[feat["Date"] < TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)
te = feat[feat["Date"] >= TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)

SOURCES = {"Bet365 opening (current hybrid)": ("B365A", "B365D", "B365H"), "Pinnacle opening": ("PSA", "PSD", "PSH"),
           "Pinnacle closing": ("PSCA", "PSCD", "PSCH"), "Bet365 closing": ("B365CA", "B365CD", "B365CH"),
           "Market average closing": ("AvgCA", "AvgCD", "AvgCH"), "Market average opening": ("AvgA", "AvgD", "AvgH"), "Market maximum closing": ("MaxCA", "MaxCD", "MaxCH")}
need = sorted({c for v in SOURCES.values() for c in v})
raw = pd.concat([pd.read_csv(f, usecols=lambda c: c in ["Date", "HomeTeam", "AwayTeam"] + need) for f in sorted(glob.glob("01_data/*.csv"))])
raw["Date"] = pd.to_datetime(raw["Date"], format="mixed", dayfirst=True)
raw = raw.drop_duplicates(["Date", "HomeTeam", "AwayTeam"])
lp = lambda p: np.log(np.clip(p, 1e-6, 1))
ll = lambda p, y: float(-np.log(np.clip(p[np.arange(len(y)), y], 1e-9, 1)).mean())
res = {"blend alone": {"log_loss": round(ll(P_te, y_te), 4), "accuracy": round(float((P_te.argmax(1) == y_te).mean()), 4)}}
print(f"{'source':<34}{'coverage':>9}{'market alone':>14}{'blend + market':>16}{'accuracy':>10}")
print(f"{'blend alone':<34}{'':>9}{'':>14}{ll(P_te, y_te):>16.4f}{(P_te.argmax(1) == y_te).mean():>10.1%}")
for name, cols in SOURCES.items():
    m = feat[["Date", "HomeTeam", "AwayTeam"]].merge(raw[["Date", "HomeTeam", "AwayTeam"] + list(cols)], how="left", on=["Date", "HomeTeam", "AwayTeam"])
    if m[list(cols)].iloc[len(tr):].notna().all(axis=1).mean() < 0.5:
        print(f"{name:<34}{'-':>9}  (not available for the held-out seasons)"); continue
    inv = 1 / m[list(cols)].values; mk = inv / inv.sum(1, keepdims=True)
    mk_tr, mk_te = mk[: len(tr)], mk[len(tr):]
    ok_tr = ~np.isnan(mk_tr[I_tr]).any(1); ok_te = ~np.isnan(mk_te).any(1)
    X = np.hstack([lp(P_tr), lp(np.nan_to_num(mk_tr[I_tr], nan=1 / 3))])[ok_tr]
    st = LogisticRegression(C=1.0, max_iter=2000).fit(X, y_tr[ok_tr])
    Pt = st.predict_proba(np.hstack([lp(P_te), lp(np.nan_to_num(mk_te, nan=1 / 3))]))
    res[name] = {"coverage": round(float(ok_te.mean()), 3), "market_log_loss": round(ll(mk_te[ok_te], y_te[ok_te]), 4), "log_loss": round(ll(Pt[ok_te], y_te[ok_te]), 4), "accuracy": round(float((Pt[ok_te].argmax(1) == y_te[ok_te]).mean()), 4), "market_accuracy": round(float((mk_te[ok_te].argmax(1) == y_te[ok_te]).mean()), 4)}
    r = res[name]
    print(f"{name:<34}{r['coverage']:>9.0%}{r['market_log_loss']:>14.4f}{r['log_loss']:>16.4f}{r['accuracy']:>10.1%}   (market's own pick {r['market_accuracy']:.1%})")
json.dump(res, open("02_processed_data/odds_sources.json", "w"), indent=1)

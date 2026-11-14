"""
Out-of-fold blended odds (forest + goal model) for the training seasons, and the
held-out blend, cached to 02_processed_data/oof_blend.npz. Same recipe as
10_tune_blend_profiles.py and 15_calibrate_spread.py. Delete the cache to rebuild.
"""
import os
import re

import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import PoissonRegressor
from sklearn.model_selection import TimeSeriesSplit
from sklearn.utils.class_weight import compute_sample_weight

from config import TRAIN_TEST_SPLIT_DATE

CACHE = "02_processed_data/oof_blend.npz"
MAXG = 8
CODE = {"A": 0, "D": 1, "H": 2}


def load():
    src = open("src/05_predict_scoreline.py").read()
    feature_columns = eval(re.search(r"FEATURE_COLUMNS = (\[.*?\n\])", src, re.S).group(1))
    feat = pd.read_csv("02_processed_data/E0_features.csv")
    feat["Date"] = pd.to_datetime(feat["Date"], format="mixed")
    model_df = pd.read_csv("02_processed_data/E0_model.csv")
    model_df["Date"] = pd.to_datetime(model_df["Date"], format="mixed")
    return feature_columns, feat, model_df


def goal_model_probs(feature_columns, train, test):
    x = train[feature_columns].fillna(0)
    mean, std = x.mean(), x.std().replace(0, 1)
    scale = lambda d: (d[feature_columns].fillna(0) - mean) / std
    home = PoissonRegressor(max_iter=1000).fit(scale(train), train["FTHG"])
    away = PoissonRegressor(max_iter=1000).fit(scale(train), train["FTAG"])
    lh, la = home.predict(scale(test)), away.predict(scale(test))
    k = np.arange(MAXG + 1)
    out = np.zeros((len(test), 3))
    for n, (a, b) in enumerate(zip(lh, la)):
        g = np.outer(poisson.pmf(k, a), poisson.pmf(k, b)); g /= g.sum()
        out[n] = [np.triu(g, 1).sum(), np.trace(g), np.tril(g, -1).sum()]
    return out


def get(force=False):
    if os.path.exists(CACHE) and not force:
        z = np.load(CACHE, allow_pickle=True)
        return {k: z[k] for k in z.files}
    fc, feat, model_df = load()
    tr = feat[feat["Date"] < TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)
    te = feat[feat["Date"] >= TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)
    mtr = model_df[model_df["Date"] < TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)
    cols = [c for c in mtr.columns if c not in ("FTR", "Div", "Date", "HomeTeam", "AwayTeam")]
    Xm, ym = mtr[cols].fillna(0), mtr["FTR"].map(CODE).values
    rf_params = dict(n_estimators=500, max_depth=15, min_samples_split=5, min_samples_leaf=2, random_state=42, n_jobs=-1)
    P, I = [], []
    for a, b in TimeSeriesSplit(n_splits=3).split(Xm):
        rf = RandomForestClassifier(**rf_params).fit(Xm.iloc[a], ym[a], sample_weight=compute_sample_weight("balanced", ym[a]))
        P.append((rf.predict_proba(Xm.iloc[b]) + goal_model_probs(fc, tr.iloc[a], tr.iloc[b])) / 2); I.append(b)
    rf_test = pd.read_csv("02_processed_data/rf_predictions.csv")
    rf_test = rf_test[rf_test["Split"] == "benchmark"][["P_A", "P_D", "P_H"]].values
    out = {"P_tr": np.vstack(P), "I_tr": np.concatenate(I), "y_tr": ym[np.concatenate(I)],
           "P_te": (rf_test + goal_model_probs(fc, tr, te)) / 2, "y_te": te["FTR"].map(CODE).values}
    np.savez(CACHE, **out)
    return out

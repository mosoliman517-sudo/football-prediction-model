"""
Pre-match forecasts of match statistics for every Big 5 league: shots, shots on target, corners, fouls and yellow cards,
for each side. These are what the arena's minute-by-minute match simulation plays out, so the simulated match fits the
model's own forecast instead of random numbers.

Same walk-forward discipline as src/29: for each season from 2017-18 on, ten Poisson regressions (one per statistic and
side) are trained only on earlier seasons of all five leagues (compact results-only features from core_features.py, plus a
league indicator) and predict that season's matches; the live 2026-27 season is predicted from everything before it. Each
statistic is scored on 2023-24 to 2025-26 against the plain "always the training average" baseline, so the page can say
how good the numbers are. The share of goals scored in the first half is measured too (it places goal minutes).

Possession is not here: no free source records it.
Run from the project root:  python3 src/33_match_stats_leagues.py
Writes 02_processed_data/multi_league_stats.csv and multi_league_stats_validation.json
"""
import glob
import json

import numpy as np
import pandas as pd
from sklearn.linear_model import PoissonRegressor

import core_features

LEAGUES = ["E0", "D1", "SP1", "I1", "F1"]
STATS = [("shots", "HS", "AS"), ("sot", "HST", "AST"), ("corners", "HC", "AC"), ("fouls", "HF", "AF"), ("yellows", "HY", "AY")]
TARGETS = [c for _, h, a in STATS for c in (h, a)]          # order: shots H, A, on target H, A, corners H, A, fouls H, A, yellows H, A
COLS = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR", "HS", "AS", "HST", "AST", "HC", "AC", "HF", "AF", "HY", "AY", "HTHG", "HTAG"]
FIRST_TEST, LIVE = 2017, 2026


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


def main():
    frames = []
    for lg in LEAGUES:
        files = sorted(glob.glob("01_data/E0_*.csv")) if lg == "E0" else sorted(glob.glob(f"01_data_leagues/{lg}_*.csv"))
        d = pd.concat([read(f) for f in files], ignore_index=True).sort_values("Date", kind="stable").reset_index(drop=True)
        feat = core_features.build(d)
        d = pd.concat([d, feat], axis=1)
        d["League"] = lg
        d["Season"] = np.where(d["Date"].dt.month >= 8, d["Date"].dt.year, d["Date"].dt.year - 1)
        frames.append(d)
        print(f"  {lg}: {len(d)} matches", flush=True)
    d = pd.concat(frames, ignore_index=True)
    feats = [c for c in d.columns if c not in COLS and c not in ("League", "Season")]
    X = d[feats].copy()
    for lg in LEAGUES:
        X[f"lg_{lg}"] = (d["League"] == lg).astype(float)

    pred = np.full((len(d), len(TARGETS)), np.nan)
    for S in sorted(s for s in d["Season"].unique() if s >= FIRST_TEST):
        tr, te = np.where(d["Season"] < S)[0], np.where(d["Season"] == S)[0]
        mean = X.iloc[tr].mean()
        Xtr, Xte = X.iloc[tr].fillna(mean).fillna(0), X.iloc[te].fillna(mean).fillna(0)
        mu, sd = Xtr.mean(), Xtr.std().replace(0, 1)
        for k, col in enumerate(TARGETS):
            ok = d[col].iloc[tr].notna().to_numpy()
            m = PoissonRegressor(alpha=1.0, max_iter=2000).fit(((Xtr - mu) / sd)[ok], d[col].iloc[tr][ok])
            pred[te, k] = m.predict((Xte - mu) / sd)
        print(f"  season {S}-{str(S + 1)[2:]} done", flush=True)

    out = d[["League", "Season", "Date", "HomeTeam", "AwayTeam"]].copy()
    out["Date"] = out["Date"].dt.strftime("%Y-%m-%d")
    for k, col in enumerate(TARGETS):
        out[f"e_{col}"] = np.round(pred[:, k], 2)
        out[f"r_{col}"] = d[col].to_numpy()
    out = out[out["Season"] >= FIRST_TEST]
    out.to_csv("02_processed_data/multi_league_stats.csv", index=False)

    # validation on the three finished seasons the page uses
    val = {}
    ev = d["Season"].isin([2023, 2024, 2025]).to_numpy()
    print(f"\n{'statistic':<10}{'side':<6}{'real avg':>9}{'model avg':>10}{'MAE model':>10}{'MAE baseline':>13}{'better by':>11}")
    for k, col in enumerate(TARGETS):
        base_mean = d[col][d["Season"] < 2023].mean()
        y = d[col].to_numpy(); ok = ev & ~np.isnan(y) & ~np.isnan(pred[:, k])
        mae, mae_b = np.abs(pred[ok, k] - y[ok]).mean(), np.abs(base_mean - y[ok]).mean()
        name, side = next((n, "home" if col == h else "away") for n, h, a in STATS if col in (h, a))
        val[f"{name}_{side}"] = {"real_mean": round(float(y[ok].mean()), 3), "model_mean": round(float(pred[ok, k].mean()), 3), "mae_model": round(float(mae), 3), "mae_baseline": round(float(mae_b), 3)}
        print(f"{name:<10}{side:<6}{y[ok].mean():>9.2f}{pred[ok, k].mean():>10.2f}{mae:>10.3f}{mae_b:>13.3f}{(1 - mae / mae_b):>10.1%}")
    first = d[["HTHG", "HTAG", "FTHG", "FTAG"]].dropna()
    val["first_half_goal_share"] = round(float((first["HTHG"] + first["HTAG"]).sum() / (first["FTHG"] + first["FTAG"]).sum()), 4)
    print(f"\nShare of goals scored in the first half: {val['first_half_goal_share']:.1%}")
    json.dump(val, open("02_processed_data/multi_league_stats_validation.json", "w"), indent=1)
    print("Saved 02_processed_data/multi_league_stats.csv and multi_league_stats_validation.json")


if __name__ == "__main__":
    main()

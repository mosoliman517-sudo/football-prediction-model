"""
Does the simulation make sense, or is it a random number generator?

Every test here compares simulated or predicted output with what really
happened in the 760 held-out matches (2024-25 and 2025-26), against a
baseline that knows nothing. Writes 02_processed_data/validation.json for the
Season Wrapped page. Run from the project root after 03 and 05.
"""

import json

import numpy as np
import pandas as pd
from scipy.stats import poisson, spearmanr

from config import TRAIN_TEST_SPLIT_DATE

rng = np.random.default_rng(2026)
N_SIMS = 4000
MAXG = 8

# ---- load -----------------------------------------------------------
feat = pd.read_csv("02_processed_data/E0_features.csv", usecols=["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"])
feat["Date"] = pd.to_datetime(feat["Date"], format="mixed")
train, test = feat[feat["Date"] < TRAIN_TEST_SPLIT_DATE], feat[feat["Date"] >= TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)

rf = pd.read_csv("02_processed_data/rf_predictions.csv")
rf = rf[rf["Split"] == "benchmark"].reset_index(drop=True)
lam = pd.read_csv("02_processed_data/poisson_lambdas.csv")
lam = lam[lam["Split"] == "benchmark"].reset_index(drop=True)
for other in (rf, lam):
    assert (other["HomeTeam"].values == test["HomeTeam"].values).all() and (other["AwayTeam"].values == test["AwayTeam"].values).all()

y = test["FTR"].map({"A": 0, "D": 1, "H": 2}).values
P_rf = rf[["P_A", "P_D", "P_H"]].values
lamH, lamA = lam["LamH"].values, lam["LamA"].values
hg, ag = test["FTHG"].values, test["FTAG"].values


def poisson_outcome_probs(lh, la):
    """Home/draw/away probabilities implied by the goal model's scoreline grid."""
    k = np.arange(MAXG + 1)
    out = np.zeros((len(lh), 3))
    for n, (a, b) in enumerate(zip(lh, la)):
        g = np.outer(poisson.pmf(k, a), poisson.pmf(k, b))
        g /= g.sum()
        out[n] = [np.triu(g, 1).sum(), np.trace(g), np.tril(g, -1).sum()]   # A, D, H
    return out


P_pois = poisson_outcome_probs(lamH, lamA)
# The page's honest odds: an even blend of the Random Forest and the goal
# model. Each is informative but biased in a different direction (the forest
# under-rates Home and over-rates Draw, the goal model the reverse).
P_blend = (P_rf + P_pois) / 2
freq = np.array([(train["FTR"] == c).mean() for c in "ADH"])
P_clim = np.tile(freq, (len(test), 1))        # knows only the long-run H/D/A rates


def log_loss(P):
    return float(-np.log(np.clip(P[np.arange(len(y)), y], 1e-9, 1)).mean())


def brier(P):
    onehot = np.eye(3)[y]
    return float(((P - onehot) ** 2).sum(axis=1).mean())


report = {"n_matches": int(len(test)), "n_sims": N_SIMS}

# ---- 1. single match: are the probabilities informative and honest? --
report["match_probs"] = {
    name: {"log_loss": round(log_loss(P), 4), "brier": round(brier(P), 4),
           "accuracy": round(float((P.argmax(1) == y).mean()), 4)}
    for name, P in (("Knows nothing (league-wide H/D/A rates)", P_clim),
                    ("Random Forest", P_rf),
                    ("Goal model (Poisson scorelines)", P_pois),
                    ("Blend of both (the page's odds)", P_blend))
}


def reliability(P, col, bins=8):
    q = np.quantile(P[:, col], np.linspace(0, 1, bins + 1))
    q[-1] += 1e-9
    rows = []
    for lo, hi in zip(q[:-1], q[1:]):
        m = (P[:, col] >= lo) & (P[:, col] < hi)
        if m.sum():
            rows.append([round(float(P[m, col].mean()), 4), round(float((y[m] == col).mean()), 4), int(m.sum())])
    ece = sum(n * abs(p - o) for p, o, n in rows) / len(y)
    return rows, round(float(ece), 4)


report["reliability"] = {}
for name, P in (("Random Forest", P_rf), ("Goal model", P_pois), ("Blend", P_blend)):
    report["reliability"][name] = {}
    for col, label in ((2, "Home"), (1, "Draw"), (0, "Away")):
        rows, ece = reliability(P, col)
        report["reliability"][name][label] = {"bins": rows, "ece": ece,
                                              "mean_predicted": round(float(P[:, col].mean()), 4),
                                              "actual": round(float((y == col).mean()), 4)}

# ---- 2. scoreline model ---------------------------------------------
sc = {
    "mean_goals_predicted": [round(float(lamH.mean()), 3), round(float(lamA.mean()), 3)],
    "mean_goals_actual": [round(float(hg.mean()), 3), round(float(ag.mean()), 3)],
}
dist = []
for k in range(5):
    pred_h = poisson.pmf(k, lamH).sum() if k < 4 else (1 - poisson.cdf(3, lamH)).sum()
    pred_a = poisson.pmf(k, lamA).sum() if k < 4 else (1 - poisson.cdf(3, lamA)).sum()
    act_h = (hg == k).sum() if k < 4 else (hg >= 4).sum()
    act_a = (ag == k).sum() if k < 4 else (ag >= 4).sum()
    dist.append([("4+" if k == 4 else str(k)), round(float(pred_h)), int(act_h), round(float(pred_a)), int(act_a)])
sc["goal_count_distribution"] = dist       # label, home predicted, home actual, away predicted, away actual

train_scores = pd.Series(list(zip(np.minimum(train["FTHG"], MAXG), np.minimum(train["FTAG"], MAXG))))
score_freq = (train_scores.value_counts(normalize=True)).to_dict()
naive_ll = float(np.mean([np.log(score_freq.get((min(a, MAXG), min(b, MAXG)), 1e-4)) for a, b in zip(hg, ag)]))
model_ll = float(np.mean([np.log(max(poisson.pmf(min(a, MAXG), x) * poisson.pmf(min(b, MAXG), z), 1e-12))
                          for a, b, x, z in zip(hg, ag, lamH, lamA)]))
sc["scoreline_log_likelihood_per_match"] = {"naive_league_score_frequencies": round(naive_ll, 4), "goal_model": round(model_ll, 4)}
best_naive = max(score_freq, key=score_freq.get)
sc["exact_score_hit_rate"] = {
    f"always guess {best_naive[0]}-{best_naive[1]}": round(float(((hg == best_naive[0]) & (ag == best_naive[1])).mean()), 4),
    "goal model's most likely score": round(float(np.mean([
        np.unravel_index(np.argmax(np.outer(poisson.pmf(np.arange(MAXG + 1), a), poisson.pmf(np.arange(MAXG + 1), b))), (MAXG + 1, MAXG + 1)) == (h, g)
        for a, b, h, g in zip(lamH, lamA, hg, ag)])), 4),
}
report["scorelines"] = sc

# ---- 3. whole seasons: sample every match thousands of times ---------
def season_label(d):
    s = d.year if d.month >= 8 else d.year - 1
    return f"{s}-{str(s + 1)[-2:]}"


def standings(frame):
    t = {}
    for r in frame.itertuples():
        for team in (r.HomeTeam, r.AwayTeam):
            t.setdefault(team, [0, 0, 0])
        h, a = t[r.HomeTeam], t[r.AwayTeam]
        h[1] += r.FTHG - r.FTAG; a[1] += r.FTAG - r.FTHG; h[2] += r.FTHG; a[2] += r.FTAG
        h[0] += 3 if r.FTHG > r.FTAG else 1 if r.FTHG == r.FTAG else 0
        a[0] += 3 if r.FTAG > r.FTHG else 1 if r.FTHG == r.FTAG else 0
    order = sorted(t, key=lambda k: (t[k][0], t[k][1], t[k][2]), reverse=True)
    return {team: i + 1 for i, team in enumerate(order)}, {team: v[0] for team, v in t.items()}


feat["Season"] = feat["Date"].apply(season_label)
test["Season"] = test["Date"].apply(season_label)
labels = sorted(test["Season"].unique())
report["seasons"] = {}

for label in labels:
    idx = np.where(test["Season"].values == label)[0]
    sub = test.iloc[idx]
    real_pos, real_pts = standings(sub)
    teams = sorted(real_pos)
    tix = {t: i for i, t in enumerate(teams)}
    H = np.zeros((len(sub), 20)); A = np.zeros((len(sub), 20))
    for m, r in enumerate(sub.itertuples()):
        H[m, tix[r.HomeTeam]] = 1; A[m, tix[r.AwayTeam]] = 1
    real_pts_v = np.array([real_pts[t] for t in teams]); real_pos_v = np.array([real_pos[t] for t in teams])

    def summarize(pts, gd):
        # position per sim: points, then goal difference, then random
        key = pts * 1000 + gd + rng.random(pts.shape) * 0.5
        pos = (-key).argsort(axis=1).argsort(axis=1) + 1
        mean_pts = pts.mean(0); exp_pos = pos.mean(0)
        order = exp_pos.argsort().argsort() + 1            # rank of expected position
        out = {"points_mae": round(float(np.abs(mean_pts - real_pts_v).mean()), 2),
               "position_mae_from_expected_pos": round(float(np.abs(order - real_pos_v).mean()), 2),
               "spearman": round(float(spearmanr(mean_pts, real_pts_v)[0]), 3)}
        for lo, hi, name in ((25, 75, "50"), (10, 90, "80"), (5, 95, "90")):
            l, h = np.percentile(pts, lo, axis=0), np.percentile(pts, hi, axis=0)
            out[f"coverage_{name}"] = round(float(((real_pts_v >= l) & (real_pts_v <= h)).mean()), 3)
        out["title_win_prob_of_real_champion"] = round(float((pos[:, real_pos_v.argmin()] == 1).mean()), 3)
        out["teams"] = [{"team": t, "real_pts": int(real_pts_v[i]), "real_pos": int(real_pos_v[i]),
                         "sim_pts": round(float(mean_pts[i]), 1), "p10": round(float(np.percentile(pts[:, i], 10)), 1),
                         "p90": round(float(np.percentile(pts[:, i], 90)), 1), "sim_pos": round(float(exp_pos[i]), 1)}
                        for i, t in enumerate(teams)]
        return out

    # (a) sample the outcome of every match from the blended odds
    cum = P_blend[idx].cumsum(1)
    draws = (rng.random((N_SIMS, len(idx), 1)) > cum[None]).sum(2).clip(0, 2)     # 0=A 1=D 2=H
    hp = np.where(draws == 2, 3, np.where(draws == 1, 1, 0)); ap = np.where(draws == 0, 3, np.where(draws == 1, 1, 0))
    pts_rf = hp @ H + ap @ A
    gd_zero = np.zeros_like(pts_rf)

    # (b) sample actual scorelines from the goal model
    sh = rng.poisson(lamH[idx], size=(N_SIMS, len(idx))); sa = rng.poisson(lamA[idx], size=(N_SIMS, len(idx)))
    hp2 = np.where(sh > sa, 3, np.where(sh == sa, 1, 0)); ap2 = np.where(sa > sh, 3, np.where(sh == sa, 1, 0))
    pts_po = hp2 @ H + ap2 @ A
    gd_po = (sh - sa) @ H - (sh - sa) @ A

    # baselines that know nothing about this season's matches
    prev_label = f"{int(label[:4]) - 1}-{str(int(label[:4]))[-2:]}"
    prev = feat[feat["Season"] == prev_label]
    prev_pos, _ = standings(prev)
    prev_v = np.array([prev_pos.get(t, 19) for t in teams])      # newly promoted: assume 19th
    prev_rank = prev_v.argsort(kind="stable").argsort() + 1
    shuffled = np.mean([np.abs(rng.permutation(20) + 1 - real_pos_v).mean() for _ in range(2000)])

    report["seasons"][label] = {
        "randomly_sampled_blended_odds": summarize(pts_rf, gd_zero),
        "randomly_sampled_goal_model_scores": summarize(pts_po, gd_po),
        "baseline_last_seasons_table_position_mae": round(float(np.abs(prev_rank - real_pos_v).mean()), 2),
        "baseline_random_shuffle_position_mae": round(float(shuffled), 2),
    }

json.dump(report, open("02_processed_data/validation.json", "w"), separators=(",", ":"))

# ---- printed summary ------------------------------------------------
print("\n1. SINGLE MATCH: probabilities vs. a model that knows nothing (lower is better)")
for k, v in report["match_probs"].items():
    print(f"   {k:<42} log loss {v['log_loss']:.4f}  Brier {v['brier']:.4f}  accuracy {v['accuracy']:.1%}")
print("\n   Calibration (average predicted vs. what really happened):")
for name in report["reliability"]:
    for lab, v in report["reliability"][name].items():
        print(f"   {name:<14} {lab:<5} predicted {v['mean_predicted']:.1%} | actual {v['actual']:.1%} | calibration error {v['ece']:.3f}")
print("\n2. SCORELINES")
print("   mean goals home/away  predicted", sc["mean_goals_predicted"], "actual", sc["mean_goals_actual"])
print("   goal counts (label, home predicted, home actual, away predicted, away actual):")
for row in sc["goal_count_distribution"]:
    print("    ", row)
print("   scoreline log-likelihood per match:", sc["scoreline_log_likelihood_per_match"])
print("   exact score hit rate:", sc["exact_score_hit_rate"])
print("\n3. WHOLE SEASONS (each match sampled", N_SIMS, "times)")
for label, v in report["seasons"].items():
    print(f"   {label}")
    for key in ("randomly_sampled_blended_odds", "randomly_sampled_goal_model_scores"):
        s = v[key]
        print(f"     {key}: points error {s['points_mae']}, position error {s['position_mae_from_expected_pos']}, "
              f"rank corr {s['spearman']}, real points inside 50/80/90% range: {s['coverage_50']:.0%}/{s['coverage_80']:.0%}/{s['coverage_90']:.0%}")
    print(f"     baselines (position error): last season's table {v['baseline_last_seasons_table_position_mae']}, random shuffle {v['baseline_random_shuffle_position_mae']}")

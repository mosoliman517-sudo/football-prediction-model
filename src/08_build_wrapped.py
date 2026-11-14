"""
Builds the interactive "Season Wrapped" page (site/season_wrapped.html).

Everything on the page comes from files the pipeline already wrote:
  - 02_processed_data/rf_predictions.csv  (03_train_model.py: Random
    Forest probabilities for every match it never trained on)
  - 02_processed_data/rf_profiles.json    (03_train_model.py: the
    decision-threshold factors each tuned profile chose on the forest)
  - 02_processed_data/blend_profiles.json, hybrid.json (10_tune_blend_profiles.py:
    the same profiles tuned on the blended odds / on the market-informed hybrid)
  - 02_processed_data/blind_rest.json + blind_rest_backtest.json
    (12_blind_rest_of_season.py: the blind rest-of-season simulation)
  - 02_processed_data/poisson_lambdas.csv (05_predict_scoreline.py: expected
    goals for every match and for every possible live-season pairing)
  - 02_processed_data/validation.json    (09_validate_simulation.py: how well
    the odds and simulations match what really happened)
  - real scores from E0_features.csv / E0_live_features.csv
  - market-average closing odds (and Bet365's favourite as a yardstick) from the raw season files, used ONLY as a
    reference line to compare the model against, never as a feature

Run from the project root, after 03_train_model.py:
    python3 src/08_build_wrapped.py
"""

import json
import os
import re

import numpy as np
import pandas as pd

PREDICTIONS = "02_processed_data/rf_predictions.csv"
PROFILES_JSON = "02_processed_data/rf_profiles.json"
LAMBDAS = "02_processed_data/poisson_lambdas.csv"
BLEND_JSON = "02_processed_data/blend_profiles.json"
HYBRID_JSON = "02_processed_data/hybrid.json"
BLIND_JSON = "02_processed_data/blind_rest.json"
BLIND_BACKTEST_JSON = "02_processed_data/blind_rest_backtest.json"
TEMPLATE = "site/season_wrapped_template.html"
OUTPUT = os.environ.get("WRAPPED_OUT", "site/season_wrapped.html")

RAW_FILES = {
    "2024-25": "01_data/E0_2425.csv",
    "2025-26": "01_data/E0_2526.csv",
    "2026-27": "01_data/E0_2627.csv",
}

# Class order in the saved probabilities: A, D, H (alphabetical, as in 03)
CLASSES = ["A", "D", "H"]

PROFILE_META = {
    "Balanced": ("balanced", "Balanced", "Tuned to find Home, Draw and Away results about equally often. Gives up some overall accuracy to call draws."),
    "Max Accuracy": ("accuracy", "Max Accuracy", "Tuned to get the most results right overall. Almost never calls a draw."),
}


def season_label(date):
    start = date.year if date.month >= 8 else date.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def apply_factors(proba, f):
    adjusted = proba * np.array([f["away"], f["draw"], f["home"]])
    return adjusted / adjusted.sum(axis=1, keepdims=True)


preds = pd.read_csv(PREDICTIONS)
preds["Date"] = pd.to_datetime(preds["Date"], format="mixed")
grid_preds = preds[preds["Split"] == "grid"].copy()
preds = preds[preds["Split"] != "grid"].copy()
lambdas = pd.read_csv(LAMBDAS)

scores = pd.concat([
    pd.read_csv("02_processed_data/E0_features.csv", usecols=["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"]),
    pd.read_csv("02_processed_data/E0_live_features.csv", usecols=["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"]),
])
scores["Date"] = pd.to_datetime(scores["Date"])
df = preds.merge(scores, on=["Date", "HomeTeam", "AwayTeam"], how="left", validate="one_to_one")
assert df["FTHG"].notna().all(), "some predicted matches have no score"
df = df.sort_values(["Date", "HomeTeam"]).reset_index(drop=True)
df["Season"] = df["Date"].apply(season_label)

# ---- profiles -------------------------------------------------------
factors = json.load(open(PROFILES_JSON))
profiles = []
for key, f in factors.items():
    pid, name, desc = PROFILE_META[key]
    profiles.append({"id": pid, "name": name, "desc": desc,
                     "f": {"h": round(f["home"], 3), "d": round(f["draw"], 3), "a": round(f["away"], 3)}})

# The same four profiles, tuned on the blended odds (10_tune_blend_profiles.py):
# "f"/"bench" are the Random Forest versions, "fb"/"benchB" the blend versions
blend_profiles = json.load(open(BLEND_JSON))
for p in profiles:
    b = blend_profiles[p["id"]]
    p["fb"] = {"h": b["home"], "d": b["draw"], "a": b["away"]}
    p["benchB"] = b["bench"]

# ... and tuned on the market-informed hybrid ("fh"/"benchH")
hybrid = json.load(open(HYBRID_JSON))
for p in profiles:
    b = hybrid["profiles"][p["id"]]
    p["fh"] = {"h": b["home"], "d": b["draw"], "a": b["away"]}
    p["benchH"] = b["bench"]

# Benchmark recall per profile (same 760 matches 03 reports), as a sanity
# check against what 03 printed AND as the numbers shown on the chips
bench = df[df["Split"] == "benchmark"]
proba = bench[[f"P_{c}" for c in CLASSES]].values
actual = bench["FTR"].map({c: i for i, c in enumerate(CLASSES)}).values
for p in profiles:
    adj = apply_factors(proba, {"away": p["f"]["a"], "draw": p["f"]["d"], "home": p["f"]["h"]})
    pick = adj.argmax(axis=1)
    p["bench"] = {
        "acc": round(float((pick == actual).mean()), 4),
        **{c: round(float((pick[actual == i] == i).mean()), 4) for i, c in enumerate(CLASSES)},
    }
    print(f'{p["name"]:<22} acc {p["bench"]["acc"]:.1%}  '
          f'Home {p["bench"]["H"]:.0%}  Draw {p["bench"]["D"]:.0%}  Away {p["bench"]["A"]:.0%}')

# ---- bookmaker reference per season ---------------------------------
bookmaker = {}
for label, path in RAW_FILES.items():
    raw = pd.read_csv(path).dropna(subset=["FTR", "B365H", "B365D", "B365A"])
    odds = raw[["B365H", "B365D", "B365A"]].values
    favourite = np.array(["H", "D", "A"])[odds.argmin(axis=1)]
    bookmaker[label] = round(float((favourite == raw["FTR"].values).mean()), 4)

# ---- seasons --------------------------------------------------------
seasons = {}
for label, g in df.groupby("Season"):
    seasons[label] = {
        "live": bool((g["Split"] == "live").all()),
        "bookmaker": bookmaker[label],
        "matches": [
            [r.Date.strftime("%Y-%m-%d"), r.HomeTeam, r.AwayTeam, int(r.FTHG), int(r.FTAG), r.FTR,
             round(r.P_A, 4), round(r.P_D, 4), round(r.P_H, 4)]
            for r in g.itertuples()
        ],
    }
    print(label, len(g), "matches, bookmaker favourite", f"{bookmaker[label]:.1%}")

# ---- market-average closing odds per match (margin removed), for the market-informed hybrid ----
import glob
raw_odds = pd.concat([pd.read_csv(f, usecols=lambda c: c in ["Date", "HomeTeam", "AwayTeam", "AvgCA", "AvgCD", "AvgCH"])
                      for f in glob.glob("01_data/*.csv")]).dropna()
raw_odds["Date"] = pd.to_datetime(raw_odds["Date"], format="mixed", dayfirst=True).dt.strftime("%Y-%m-%d")
inv = 1 / raw_odds[["AvgCA", "AvgCD", "AvgCH"]].values
mk = inv / inv.sum(1, keepdims=True)
raw_odds[["MA", "MD", "MH"]] = mk
market_lookup = raw_odds.drop_duplicates(["Date", "HomeTeam", "AwayTeam"]).set_index(["Date", "HomeTeam", "AwayTeam"])[["MA", "MD", "MH"]]

# ---- expected goals for every match (the goal model's view of it) ----
played_lam = lambdas[lambdas["Split"].isin(["benchmark", "live"])].copy()
played_lam["Date"] = pd.to_datetime(played_lam["Date"], format="mixed").dt.strftime("%Y-%m-%d")
played_lam = played_lam.set_index(["Date", "HomeTeam", "AwayTeam"])
for season in seasons.values():
    for m in season["matches"]:
        row = played_lam.loc[(m[0], m[1], m[2])]
        m.extend([round(float(row["LamH"]), 3), round(float(row["LamA"]), 3)])
        key = (m[0], m[1], m[2])
        m.extend([round(float(x), 4) for x in market_lookup.loc[key]] if key in market_lookup.index else [None, None, None])

# ---- match lab: the full grid of possible live-season pairings ----
live_label = next(k for k, v in seasons.items() if v["live"])

grid_lam = lambdas[lambdas["Split"] == "grid"].set_index(["HomeTeam", "AwayTeam"])
grid = {}
for r in grid_preds.itertuples():
    lh, la = grid_lam.loc[(r.HomeTeam, r.AwayTeam)]["LamH"], grid_lam.loc[(r.HomeTeam, r.AwayTeam)]["LamA"]
    grid[f"{r.HomeTeam}|{r.AwayTeam}"] = [round(r.P_A, 4), round(r.P_D, 4), round(r.P_H, 4),
                                          round(float(lh), 3), round(float(la), 3)]
# How often does the quick no-features-yet forecast pick the same result as
# the exact version, on the live matches that HAVE been played? Shown on the
# page so the approximation is stated, not assumed.
same = [
    int(np.argmax(m[6:9]) == np.argmax(grid[f"{m[1]}|{m[2]}"][:3]))
    for m in seasons[live_label]["matches"]
]
agree = round(float(np.mean(same)), 2)
last_played = max(m[0] for m in seasons[live_label]["matches"])
lab = {"season": live_label, "asOf": last_played, "agree": agree,
       "teams": sorted({m[1] for m in seasons[live_label]["matches"]} | {m[2] for m in seasons[live_label]["matches"]}),
       "grid": grid}
print(f"Match lab: {len(grid)} pairings, results up to {last_played}")

# ---- full history for the team page, head-to-head and Elo race ------------
cols = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "HomeTeamOverallElo", "AwayTeamOverallElo"]
full = pd.concat([pd.read_csv("02_processed_data/E0_features.csv", usecols=cols),
                  pd.read_csv("02_processed_data/E0_live_features.csv", usecols=cols)])
full["Date"] = pd.to_datetime(full["Date"], format="mixed")
full = full.sort_values(["Date", "HomeTeam"]).reset_index(drop=True)
epoch = pd.Timestamp("2014-08-01")
full["Day"] = (full["Date"] - epoch).dt.days
club_list = sorted(set(full["HomeTeam"]) | set(full["AwayTeam"]))
club_ix = {t: i for i, t in enumerate(club_list)}
elo_series = {i: [] for i in range(len(club_list))}     # [day, rating before that match]
for r in full.itertuples():
    elo_series[club_ix[r.HomeTeam]].append([int(r.Day), int(round(r.HomeTeamOverallElo))])
    elo_series[club_ix[r.AwayTeam]].append([int(r.Day), int(round(r.AwayTeamOverallElo))])
history = {
    "epoch": epoch.strftime("%Y-%m-%d"), "clubs": club_list,
    "elo": {str(k): v for k, v in elo_series.items()},
    "matches": [[int(r.Day), club_ix[r.HomeTeam], club_ix[r.AwayTeam], int(r.FTHG), int(r.FTAG)] for r in full.itertuples()],
}
print(f"History: {len(club_list)} clubs, {len(history['matches'])} matches")

validation = json.load(open("02_processed_data/validation.json"))
# Official club badges, embedded once and shared by every use on the page. They are
# trademarked artwork, fetched locally by 13_fetch_crests.py into a git-ignored folder;
# a club without one (or a machine that never ran 13) simply shows a text chip.
def minify_svg(svg):
    svg = re.sub(r"<\?xml[^>]*\?>|<!--.*?-->|<!DOCTYPE[^>]*>", "", svg, flags=re.S)
    svg = re.sub(r"<metadata.*?</metadata>|<title>.*?</title>", "", svg, flags=re.S)
    return re.sub(r">\s+<", "><", svg).strip()


TEAM_SLUGS = sorted(set(pd.read_csv("02_processed_data/E0_features.csv")["HomeTeam"]) | set(pd.read_csv("02_processed_data/E0_grid_model.csv")["HomeTeam"]))
crests = {}
crest_index = "site/crests/index.json"
if os.path.exists(crest_index):
    only = [c for c in os.environ.get("CRESTS_ONLY", "").split(",") if c]    # preview builds: a few badges only
    for club, fname in json.load(open(crest_index)).items():
        if only and club not in only:
            continue
        crests[club] = minify_svg(open(f"site/crests/{fname}", encoding="utf-8").read())
# A badge you supply yourself (e.g. site/crests/coventry.png or .svg) is used for any club the fetch script could not get.
import base64
for fname in sorted(os.listdir("site/crests")) if os.path.isdir("site/crests") else []:
    stem, ext = os.path.splitext(fname)
    club = next((c for c in TEAM_SLUGS if re.sub(r"[^a-z0-9]+", "-", c.lower()).strip("-") == stem), None)
    if club and (not os.environ.get("CRESTS_ONLY") or club in os.environ["CRESTS_ONLY"].split(",")) and club not in crests and ext.lower() in (".png", ".jpg", ".jpeg", ".webp", ".svg"):
        raw = open(f"site/crests/{fname}", "rb").read()
        if ext.lower() == ".svg":
            crests[club] = minify_svg(raw.decode("utf-8"))
        else:
            mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}[ext.lower()]
            crests[club] = "data:" + mime + ";base64," + base64.b64encode(raw).decode()
print(f"Crests embedded: {len(crests)}" + ("" if crests else " (none found; clubs show as text chips. Run 13_fetch_crests.py)"))

blind = json.load(open(BLIND_JSON))
blind["backtest"] = json.load(open(BLIND_BACKTEST_JSON))
# ---- expected (and, for played matches, real) shots / on target / corners / fouls / yellows ----
ms_df = pd.read_csv("02_processed_data/match_stats.csv")
ms_df["Date"] = pd.to_datetime(ms_df["Date"], format="mixed").dt.strftime("%Y-%m-%d")
STAT_ORDER = ["shots", "sot", "corners", "fouls", "yellows"]
mstats = {}
for row in ms_df.to_dict("records"):
    exp = [round(float(row[f"X_{n}_{s}"]), 2) for n in STAT_ORDER for s in ("home", "away")]
    real = [None if pd.isna(row[f"R_{n}_{s}"]) else int(row[f"R_{n}_{s}"]) for n in STAT_ORDER for s in ("home", "away")]
    mstats[f"{row['Date']}|{row['HomeTeam']}|{row['AwayTeam']}"] = [exp, real]
statsval = json.load(open("02_processed_data/match_stats_validation.json"))

data = {"profiles": profiles, "seasons": seasons, "lab": lab, "validation": validation, "history": history,
        "crests": crests, "blind": blind, "hybrid": {"coef": hybrid["coef"], "intercept": hybrid["intercept"], "test": hybrid["test"]},
        "spread": json.load(open("02_processed_data/spread_calibration.json")),
        "scorers": json.load(open("02_processed_data/scorers.json")),
        "mstats": mstats, "statsval": statsval}
if os.environ.get("PREVIEW_LEAN"):    # testing aid: the preview pane cannot open files over ~500 KB, so drop the oldest season
    for k in [k for k in data["seasons"] if k < "2025-26"]:
        del data["seasons"][k]
    data["mstats"] = {k: [[round(x, 1) for x in v[0]], v[1]] for k, v in mstats.items() if k >= "2025-08"}
    cut = (pd.Timestamp("2023-08-01") - epoch).days                       # keep the last three seasons of history
    data["history"] = {**history, "matches": [m for m in history["matches"] if m[0] >= cut],
                       "elo": {k: [e for e in v if e[0] >= cut] or v[-1:] for k, v in history["elo"].items()}}
    data["scorers"] = {sn: {c: sorted(pl, key=lambda q: -q[2])[:8] for c, pl in cl.items()} for sn, cl in data["scorers"].items() if sn >= "2025-26"}
template = open(TEMPLATE).read().replace("__LOOK__", os.environ.get("LOOK", "broadcast"))
if os.environ.get("LOOK") == "programme":
    template = template.replace("<title>Beat the Model</title>", "<title>Beat the Model Programme</title>", 1)
assert "/*__DATA__*/null" in template
html = template.replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":")))
open(OUTPUT, "w").write(html)
print(f"Wrote {OUTPUT} ({len(html) / 1024:.0f} KB)")

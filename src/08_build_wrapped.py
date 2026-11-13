"""
Builds the interactive "Season Wrapped" page (site/season_wrapped.html).

Everything on the page comes from files the pipeline already wrote:
  - 02_processed_data/rf_predictions.csv  (03_train_model.py: Random
    Forest probabilities for every match it never trained on)
  - 02_processed_data/rf_profiles.json    (03_train_model.py: the
    decision-threshold factors each tuned profile chose)
  - real scores from E0_features.csv / E0_live_features.csv
  - Bet365 pre-match odds from the raw season files, used ONLY as a
    reference line to compare the model against, never as a feature

Run from the project root, after 03_train_model.py:
    python3 src/08_build_wrapped.py
"""

import json

import numpy as np
import pandas as pd

PREDICTIONS = "02_processed_data/rf_predictions.csv"
PROFILES_JSON = "02_processed_data/rf_profiles.json"
TEMPLATE = "site/season_wrapped_template.html"
OUTPUT = "site/season_wrapped.html"

RAW_FILES = {
    "2024-25": "01_data/E0_2425.csv",
    "2025-26": "01_data/E0_2526.csv",
    "2026-27": "01_data/E0_2627.csv",
}

# Class order in the saved probabilities: A, D, H (alphabetical, as in 03)
CLASSES = ["A", "D", "H"]

PROFILE_META = {
    "Raw model": ("raw", "Plain Random Forest", "Calls whatever is most probable. No tuning."),
    "Balanced": ("balanced", "Balanced", "Tuned so Home, Draw and Away recall are as even as possible."),
    "Deadkill (max accuracy, no balance constraint)": (
        "deadkill", "Deadkill", "Tuned purely for accuracy. Almost never calls a draw."),
    "Target 60/60/40": (
        "target", "Target 60/60/40", "Aims at 60% Home, 60% Away and 40% Draw recall."),
}


def season_label(date):
    start = date.year if date.month >= 8 else date.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def apply_factors(proba, f):
    adjusted = proba * np.array([f["away"], f["draw"], f["home"]])
    return adjusted / adjusted.sum(axis=1, keepdims=True)


preds = pd.read_csv(PREDICTIONS)
preds["Date"] = pd.to_datetime(preds["Date"])

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
profiles = [{"id": "raw", "name": "Raw model", "desc": PROFILE_META["Raw model"][2],
             "f": {"h": 1.0, "d": 1.0, "a": 1.0}}]
for key, f in factors.items():
    pid, name, desc = PROFILE_META[key]
    profiles.append({"id": pid, "name": name, "desc": desc,
                     "f": {"h": round(f["home"], 3), "d": round(f["draw"], 3), "a": round(f["away"], 3)}})

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

data = {"profiles": profiles, "seasons": seasons}
template = open(TEMPLATE).read()
assert "/*__DATA__*/null" in template
html = template.replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":")))
open(OUTPUT, "w").write(html)
print(f"Wrote {OUTPUT} ({len(html) / 1024:.0f} KB)")

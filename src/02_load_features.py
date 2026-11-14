import pandas as pd

from features.fixture_grid import build_fixture_grid

# Information that would not be known before kickoff (or that only
# helps through Elo's calibration, not as a raw classifier feature)
COLUMNS_TO_DROP = [
    # exact copies of HomeElo / AwayElo / EloDifference under the classic Elo format
    "HomeTeamOverallElo",
    "AwayTeamOverallElo",
    "OverallEloDifference",
    # columns the football-data files leave empty for these seasons (match xG, closing odds)
    "HxG", "AxG", "PPH", "PPD", "PPA", "SKBH", "SKBD", "SKBA",
    "PPCH", "PPCD", "PPCA", "SKBCH", "SKBCD", "SKBCA",
    "FTHG",
    "FTAG",
    "HTHG",
    "HTAG",
    "HTR",
    "HS",
    "AS",
    "HST",
    "AST",
    "HF",
    "AF",
    "HC",
    "AC",
    "HY",
    "AY",
    "HR",
    "AR",
    "HomeXG",
    "AwayXG",
    "HomeAvgXGLast5",
    "AwayAvgXGLast5",
    "HomeAvgXGConcededLast5",
    "AwayAvgXGConcededLast5",
    "HomeTransfersIn",
    "HomeTransfersOut",
    "HomeNetTransferSpendEur",
    "AwayTransfersIn",
    "AwayTransfersOut",
    "AwayNetTransferSpendEur",
    "HomeManagerTenureDays",
    "HomeNewManagerBoost",
    "AwayManagerTenureDays",
    "AwayNewManagerBoost",
    "HomeSquadAvgAge",
    "AwaySquadAvgAge"
]

# Benchmark seasons and the live season are processed identically
processed = {}
for name, source in [
    ("benchmark", "02_processed_data/E0_features.csv"),
    ("live", "02_processed_data/E0_live_features.csv"),
]:
    df = pd.read_csv(source)
    df = df.drop(columns=COLUMNS_TO_DROP, errors="ignore")
    df = df.drop(columns=["HomePoints", "AwayPoints"])
    processed[name] = df

# Newer football-data files add columns the benchmark seasons never had
# (the match's own xG, closing odds). Real post-match / bookmaker information
# must never reach the live rows, so any column that is empty throughout the
# benchmark is blanked in the live file too -- live inputs then match exactly
# what the models trained on.
benchmark_empty = [c for c in processed["benchmark"].columns if processed["benchmark"][c].isna().all()]
processed["live"][benchmark_empty] = float("nan")

processed["benchmark"].to_csv("02_processed_data/E0_model.csv", index=False)
processed["live"].to_csv("02_processed_data/E0_live_model.csv", index=False)

# Every possible pairing of the live season's teams, for scoring matches
# that have not been played yet (see features/fixture_grid.py)
history = pd.concat([
    pd.read_csv("02_processed_data/E0_features.csv"),
    pd.read_csv("02_processed_data/E0_live_features.csv"),
], ignore_index=True)
history["Date"] = pd.to_datetime(history["Date"])
live_results = pd.read_csv("02_processed_data/E0_live_features.csv")
live_results["Date"] = pd.to_datetime(live_results["Date"])
grid, unfilled = build_fixture_grid(history, live_results, list(processed["benchmark"].columns))
grid.to_csv("02_processed_data/E0_grid_model.csv", index=False)
print(f"Wrote {len(grid)} hypothetical fixtures; columns left empty (as in training): {len(unfilled)}")

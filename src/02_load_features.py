import pandas as pd

# Information that would not be known before kickoff (or that only
# helps through Elo's calibration, not as a raw classifier feature)
COLUMNS_TO_DROP = [
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
for source, target in [
    ("02_processed_data/E0_features.csv", "02_processed_data/E0_model.csv"),
    ("02_processed_data/E0_live_features.csv", "02_processed_data/E0_live_model.csv"),
]:
    df = pd.read_csv(source)
    df = df.drop(columns=COLUMNS_TO_DROP, errors="ignore")
    df = df.drop(columns=["HomePoints", "AwayPoints"])
    df.to_csv(target, index=False)

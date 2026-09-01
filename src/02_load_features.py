import pandas as pd
# Loads the engineered dataset
df = pd.read_csv("02_processed_data/E0_features.csv")

# Removes information that would not be known before kickoff
df = df.drop(columns=[
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
    "AwayNetTransferSpendEur"
], errors="ignore")

df = df.drop(columns=["HomePoints", "AwayPoints"])
df.to_csv("02_processed_data/E0_model.csv", index=False)
import pandas as pd
# Loads the engineered dataset
df = pd.read_csv("processed_data/E0_features.csv")

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
    "AR"
], errors="ignore")

# Inputs (what the model can see before the match)
X = df.drop(columns=["FTR"])

# Target (what the model should learn to predict)
y = df["FTR"]

print(X.shape)
print(y.shape)
df = df.drop(columns=["HomePoints", "AwayPoints"])
df.to_csv("processed_data/E0_model.csv", index=False)
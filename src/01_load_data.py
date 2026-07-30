import glob
import pandas as pd

from features.form import add_form_features
from features.goals import add_goals_features
from features.shots import add_shot_features
from features.rest_days import add_rest_days_features
from features.elo import add_elo_features

# ---------------------------------------
# Load every CSV
# ---------------------------------------

files = glob.glob("data/*.csv")

df = pd.concat(
    [pd.read_csv(file) for file in files],
    ignore_index=True
)

# ---------------------------------------
# Dates
# ---------------------------------------

df["Date"] = pd.to_datetime(
    df["Date"],
    dayfirst=True,
    format="mixed"
)

df = (
    df
    .sort_values("Date")
    .reset_index(drop=True)
)

# ---------------------------------------
# Remove unnecessary columns
# ---------------------------------------

columns_to_drop = [

    "Referee",
    "Time",

    "B365>2.5","B365<2.5",
    "P>2.5","P<2.5",
    "Max>2.5","Max<2.5",
    "Avg>2.5","Avg<2.5",

    "B365C>2.5","B365C<2.5",
    "PC>2.5","PC<2.5",
    "MaxC>2.5","MaxC<2.5",
    "AvgC>2.5","AvgC<2.5",

    "AHh",

    "B365AHH","B365AHA",
    "PAHH","PAHA",
    "MaxAHH","MaxAHA",
    "AvgAHH","AvgAHA",

    "AHCh",

    "B365CAHH","B365CAHA",
    "PCAHH","PCAHA",
    "MaxCAHH","MaxCAHA",
    "AvgCAHH","AvgCAHA",

    "B365H","B365D","B365A",
    "BWH","BWD","BWA",
    "IWH","IWD","IWA",
    "PSH","PSD","PSA",
    "WHH","WHD","WHA",
    "VCH","VCD","VCA",
    "MaxH","MaxD","MaxA"
]

df = df.drop(
    columns=columns_to_drop,
    errors="ignore"
)

# ---------------------------------------
# Match points
# ---------------------------------------

df["HomePoints"] = df["FTR"].map({
    "H": 3,
    "D": 1,
    "A": 0
})

df["AwayPoints"] = df["FTR"].map({
    "A": 3,
    "D": 1,
    "H": 0
})

# ---------------------------------------
# Feature Engineering
# ---------------------------------------

print("Creating form features...")
df = add_form_features(df)

print("Creating goal features...")
df = add_goals_features(df)

print("Creating shot features...")
df = add_shot_features(df)

print("Creating rest day features...")
df = add_rest_days_features(df)

print("Creating Elo ratings...")
df = add_elo_features(df)

# ---------------------------------------
# Save
# ---------------------------------------

df.to_csv(
    "processed_data/E0_features.csv",
    index=False
)

print("Finished!")

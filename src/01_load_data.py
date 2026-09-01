import glob
import pandas as pd

from features.form import add_form_features, add_win_rate_features
from features.goals import add_goals_features
from features.shots import add_shot_features
from features.xg import add_xg_features
from features.market_value import add_market_value_features
from features.transfer_activity import add_transfer_activity_features
from features.table_position import add_table_position_features
from features.rest_days import add_rest_days_features
from features.head_to_head import add_head_to_head_features
from features.half_time import add_half_time_pattern_features
from features.elo import add_elo_features
from config import TRAIN_TEST_SPLIT_DATE

# ---------------------------------------
# Load every CSV
# ---------------------------------------

files = glob.glob("01_data/*.csv")

if not files:
    raise FileNotFoundError(
        "No CSV files found in '01_data/'. Check that the folder "
        "exists and contains your season CSVs, and that you're "
        "running this script from the project root."
    )

df = pd.concat(
    [pd.read_csv(file) for file in files],
    ignore_index=True
)

# At least one season file (2014-15) has a genuinely blank trailing
# row -- all commas, no data -- which read_csv turns into a row of
# NaNs. It's been silently harmless so far (its NaT date fails every
# train/test comparison downstream) but that's an accident, not a
# guarantee, so it gets dropped here explicitly instead.
before = len(df)
df = df.dropna(subset=["HomeTeam", "AwayTeam", "Date"]).reset_index(drop=True)
dropped = before - len(df)

if dropped:
    print(f"Dropped {dropped} blank row(s) found in the raw season files")

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

    # ---------------------------------------------------------------
    # Betting market columns. These are bookmakers' own predictions
    # (odds, over/under lines, Asian handicap lines) — pre-match, so
    # not technically leakage, but the whole point of this project is
    # to see if OUR features can predict a result, not to let the
    # model read Pinnacle's or Bet365's answer off the odds. Every
    # market found across all 12 seasons' files gets dropped here,
    # opening line and closing line alike.
    # ---------------------------------------------------------------

    # Match result (1X2) odds — opening
    "B365H","B365D","B365A",
    "BWH","BWD","BWA",
    "IWH","IWD","IWA",
    "PSH","PSD","PSA",
    "WHH","WHD","WHA",
    "VCH","VCD","VCA",
    "LBH","LBD","LBA",
    "SJH","SJD","SJA",
    "MaxH","MaxD","MaxA",
    "AvgH","AvgD","AvgA",

    # Match result (1X2) odds — closing
    "B365CH","B365CD","B365CA",
    "BWCH","BWCD","BWCA",
    "IWCH","IWCD","IWCA",
    "PSCH","PSCD","PSCA",
    "WHCH","WHCD","WHCA",
    "VCCH","VCCD","VCCA",
    "MaxCH","MaxCD","MaxCA",
    "AvgCH","AvgCD","AvgCA",

    # Over/under 2.5 goals odds — opening and closing
    "B365>2.5","B365<2.5",
    "P>2.5","P<2.5",
    "Max>2.5","Max<2.5",
    "Avg>2.5","Avg<2.5",
    "B365C>2.5","B365C<2.5",
    "PC>2.5","PC<2.5",
    "MaxC>2.5","MaxC<2.5",
    "AvgC>2.5","AvgC<2.5",

    # Asian handicap line + odds — opening and closing
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

    # Betbrain aggregated market columns (older seasons only —
    # a pooled max/average across many bookmakers at once)
    "Bb1X2","BbOU","BbAH","BbAHh",
    "BbMxH","BbMxD","BbMxA",
    "BbAvH","BbAvD","BbAvA",
    "BbMx>2.5","BbMx<2.5",
    "BbAv>2.5","BbAv<2.5",
    "BbMxAHH","BbMxAHA",
    "BbAvAHH","BbAvAHA",

    # Newer bookmakers that only appear in 2024-25 / 2025-26 -- found
    # by diffing the new files' columns against every earlier season's,
    # exactly the same leakage risk as the original odds columns if
    # left in.
    "1XBH","1XBD","1XBA",
    "1XBCH","1XBCD","1XBCA",
    "BFH","BFD","BFA",
    "BFCH","BFCD","BFCA",
    "BFDH","BFDD","BFDA",
    "BFDCH","BFDCD","BFDCA",
    "BFEH","BFED","BFEA",
    "BFECH","BFECD","BFECA",
    "BFE>2.5","BFE<2.5",
    "BFEC>2.5","BFEC<2.5",
    "BFEAHH","BFEAHA",
    "BFECAHH","BFECAHA",
    "BMGMH","BMGMD","BMGMA",
    "BMGMCH","BMGMCD","BMGMCA",
    "BVH","BVD","BVA",
    "BVCH","BVCD","BVCA",
    "CLH","CLD","CLA",
    "CLCH","CLCD","CLCA",
    "LBCH","LBCD","LBCA",
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

print("Creating win-rate features...")
df = add_win_rate_features(df)

print("Creating goal features...")
df = add_goals_features(df)

print("Creating shot features...")
df = add_shot_features(df)

print("Creating xG features...")
df = add_xg_features(df)

print("Creating market value features...")
df = add_market_value_features(df)

print("Creating transfer activity features...")
df = add_transfer_activity_features(df)

print("Creating table position features...")
df = add_table_position_features(df)

print("Creating rest day features...")
df = add_rest_days_features(df)

print("Creating head-to-head features...")
df = add_head_to_head_features(df)

print("Creating half-time pattern features...")
df = add_half_time_pattern_features(df)

print("Creating Elo ratings...")
# Elo calibrates its own form-blend weight using only matches before
# this date, so it never peeks at the test seasons — see config.py
df = add_elo_features(df, train_cutoff=TRAIN_TEST_SPLIT_DATE)

# ---------------------------------------
# Save
# ---------------------------------------

df.to_csv(
    "02_processed_data/E0_features.csv",
    index=False
)

print("Finished!")
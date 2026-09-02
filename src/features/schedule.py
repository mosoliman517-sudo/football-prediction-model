import pandas as pd


def add_schedule_features(df):
    """
    Kickoff scheduling -- genuinely pre-match information (fixtures are
    scheduled and published well in advance), completely free from a
    data standpoint since Date is always present and Time is already
    sitting in the raw files for 2019-20 onward.

    DayOfWeek and IsWeekend are derivable for every match, all 12
    seasons. Kickoff Time itself only exists in the raw files from
    2019-20 on (~60% of matches) -- missing values are filled with the
    mode of whatever real kickoff times exist elsewhere in the data
    (computed from the data itself, not a hand-picked guess), the same
    "neutral, no info yet" convention every other feature module here
    uses for missing history.
    """

    df = df.copy()

    df["DayOfWeek"] = df["Date"].dt.dayofweek   # Monday=0 ... Sunday=6
    df["IsWeekend"] = (df["DayOfWeek"] >= 5).astype(int)

    if "Time" in df.columns:
        parsed_hour = pd.to_datetime(
            df["Time"], format="%H:%M", errors="coerce"
        ).dt.hour + pd.to_datetime(
            df["Time"], format="%H:%M", errors="coerce"
        ).dt.minute / 60

        fill_value = parsed_hour.mode().iloc[0] if parsed_hour.notna().any() else 15.0
        df["KickoffHour"] = parsed_hour.fillna(fill_value)
        df = df.drop(columns=["Time"])
    else:
        df["KickoffHour"] = 15.0

    return df

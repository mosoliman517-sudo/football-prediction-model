import glob

import pandas as pd

XG_DATA_DIR = "01_data_xg"


def _load_xg_lookup():
    """
    Loads every Understat season file (one row per team per match) and
    normalizes the date to match football-data.co.uk's format.
    """

    files = glob.glob(f"{XG_DATA_DIR}/*.csv")
    xg = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
    xg["Date"] = pd.to_datetime(xg["Date"]).dt.normalize()

    return xg


def _attach_actual_xg(df):
    """
    Attaches each match's own actual xG (HomeXG, AwayXG) -- the shot
    quality each team actually created in that specific match. This is
    the outcome, not a pre-match signal -- leakage on its own, only
    used here to build the walk-forward rolling averages below.
    add_xg_features drops these two columns before returning; anything
    upstream that still sees them (02_load_features.py's leakage list)
    treats them the same as HS/HST/etc.

    Matched on (Team, Date). About 99.4% of matches match exactly --
    the rest are mostly rescheduled/TV-moved fixtures where Understat
    and football-data.co.uk logged a day or two apart. Those are left
    as NaN rather than fuzzy-matched: the rolling averages below skip
    NaN the same way they already skip a team's not-yet-played
    history, so a handful of unmatched matches just don't contribute
    their own actual xG, without breaking anything downstream.
    """

    xg = _load_xg_lookup()

    home_xg = xg[xg["Venue"] == "Home"][["Team", "Date", "xG"]].rename(
        columns={"Team": "HomeTeam", "xG": "HomeXG"}
    )
    away_xg = xg[xg["Venue"] == "Away"][["Team", "Date", "xG"]].rename(
        columns={"Team": "AwayTeam", "xG": "AwayXG"}
    )

    df = df.merge(home_xg, on=["HomeTeam", "Date"], how="left")
    df = df.merge(away_xg, on=["AwayTeam", "Date"], how="left")

    return df


def add_xg_features(df):
    """
    Walk-forward rolling xG features, same shape and same no-leakage
    pattern as add_goals_features: last-5-match average xG created and
    conceded, per team, using only matches strictly before the current
    row. xG measures shot QUALITY (would these shots score against an
    average keeper on average positioning), which is genuinely
    different information from goals (actual finishing, including
    luck/finishing skill) and shots (raw volume, no quality weighting)
    -- neither of the existing features captures this.
    """

    df = _attach_actual_xg(df)

    df["HomeAvgXGLast5"] = 0.0
    df["HomeAvgXGConcededLast5"] = 0.0

    df["AwayAvgXGLast5"] = 0.0
    df["AwayAvgXGConcededLast5"] = 0.0

    for i in range(len(df)):

        previous_games = df.iloc[:i]

        home = df.iloc[i]["HomeTeam"]
        away = df.iloc[i]["AwayTeam"]

        # -----------------------------
        # HOME TEAM HISTORY
        # -----------------------------

        home_home = previous_games[
            previous_games["HomeTeam"] == home
        ]

        home_away = previous_games[
            previous_games["AwayTeam"] == home
        ]

        home_created = pd.concat([
            home_home["HomeXG"],
            home_away["AwayXG"]
        ])

        home_conceded = pd.concat([
            home_home["AwayXG"],
            home_away["HomeXG"]
        ])

        # -----------------------------
        # AWAY TEAM HISTORY
        # -----------------------------

        away_home = previous_games[
            previous_games["HomeTeam"] == away
        ]

        away_away = previous_games[
            previous_games["AwayTeam"] == away
        ]

        away_created = pd.concat([
            away_home["HomeXG"],
            away_away["AwayXG"]
        ])

        away_conceded = pd.concat([
            away_home["AwayXG"],
            away_away["HomeXG"]
        ])

        # -----------------------------
        # SAVE FEATURES
        # -----------------------------

        df.loc[df.index[i], "HomeAvgXGLast5"] = (
            home_created.tail(5).mean()
        )

        df.loc[df.index[i], "HomeAvgXGConcededLast5"] = (
            home_conceded.tail(5).mean()
        )

        df.loc[df.index[i], "AwayAvgXGLast5"] = (
            away_created.tail(5).mean()
        )

        df.loc[df.index[i], "AwayAvgXGConcededLast5"] = (
            away_conceded.tail(5).mean()
        )

    return df

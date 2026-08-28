import pandas as pd


DEFAULT_REST_DAYS = 7        # typical week-to-week gap. Used only for a
                               # team's very first appearance, where there's
                               # no previous match to measure from — leaving
                               # this at 0 (the original default) would
                               # falsely tell the model "no rest at all"
                               # for a team that's simply new to the data.

CONGESTION_WINDOW_DAYS = 14   # how far back to count fixture pile-up


def _matches_in_window(team_games, current_date, window_days):
    cutoff = current_date - pd.Timedelta(days=window_days)
    return team_games[
        pd.to_datetime(team_games["Date"]) >= cutoff
    ].shape[0]


def add_rest_days_features(df):

    df["HomeDaysRest"] = DEFAULT_REST_DAYS
    df["AwayDaysRest"] = DEFAULT_REST_DAYS

    df["HomeMatchesLast14Days"] = 0
    df["AwayMatchesLast14Days"] = 0

    for i in range(len(df)):

        previous_games = df.iloc[:i]

        home = df.iloc[i]["HomeTeam"]
        away = df.iloc[i]["AwayTeam"]

        current_date = pd.to_datetime(df.iloc[i]["Date"])

        # -----------------------------
        # HOME TEAM
        # -----------------------------

        home_previous = previous_games[
            (previous_games["HomeTeam"] == home) |
            (previous_games["AwayTeam"] == home)
        ]

        if len(home_previous) > 0:

            last_match = pd.to_datetime(
                home_previous.iloc[-1]["Date"]
            )

            df.loc[df.index[i], "HomeDaysRest"] = (
                current_date - last_match
            ).days

        df.loc[df.index[i], "HomeMatchesLast14Days"] = (
            _matches_in_window(
                home_previous, current_date, CONGESTION_WINDOW_DAYS
            )
        )

        # -----------------------------
        # AWAY TEAM
        # -----------------------------

        away_previous = previous_games[
            (previous_games["HomeTeam"] == away) |
            (previous_games["AwayTeam"] == away)
        ]

        if len(away_previous) > 0:

            last_match = pd.to_datetime(
                away_previous.iloc[-1]["Date"]
            )

            df.loc[df.index[i], "AwayDaysRest"] = (
                current_date - last_match
            ).days

        df.loc[df.index[i], "AwayMatchesLast14Days"] = (
            _matches_in_window(
                away_previous, current_date, CONGESTION_WINDOW_DAYS
            )
        )

    return df
import pandas as pd


def add_rest_days_features(df):

    df["HomeDaysRest"] = 0
    df["AwayDaysRest"] = 0

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

    return df
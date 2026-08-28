import pandas as pd


def add_form_features(df):

    df["HomeLast5Points"] = 0
    df["AwayLast5Points"] = 0

    df["HomeLast5HomePoints"] = 0
    df["AwayLast5AwayPoints"] = 0

    for i in range(len(df)):

        previous_games = df.iloc[:i]

        home = df.iloc[i]["HomeTeam"]
        away = df.iloc[i]["AwayTeam"]

        # -----------------------
        # Last 5 Overall Points
        # -----------------------

        home_home_games = previous_games[
            previous_games["HomeTeam"] == home
        ]

        home_away_games = previous_games[
            previous_games["AwayTeam"] == home
        ]

        home_points = pd.concat([
            home_home_games["HomePoints"],
            home_away_games["AwayPoints"]
        ])

        df.loc[df.index[i], "HomeLast5Points"] = (
            home_points.tail(5).sum()
        )

        away_home_games = previous_games[
            previous_games["HomeTeam"] == away
        ]

        away_away_games = previous_games[
            previous_games["AwayTeam"] == away
        ]

        away_points = pd.concat([
            away_home_games["HomePoints"],
            away_away_games["AwayPoints"]
        ])

        df.loc[df.index[i], "AwayLast5Points"] = (
            away_points.tail(5).sum()
        )

        # -----------------------
        # Home / Away Specific Form
        # -----------------------

        df.loc[df.index[i], "HomeLast5HomePoints"] = (
            previous_games[
                previous_games["HomeTeam"] == home
            ]["HomePoints"]
            .tail(5)
            .sum()
        )

        df.loc[df.index[i], "AwayLast5AwayPoints"] = (
            previous_games[
                previous_games["AwayTeam"] == away
            ]["AwayPoints"]
            .tail(5)
            .sum()
        )

    return df
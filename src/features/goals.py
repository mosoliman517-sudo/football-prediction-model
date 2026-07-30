import pandas as pd


def add_goals_features(df):

    df["HomeAvgGoalsScoredLast5"] = 0.0
    df["HomeAvgGoalsConcededLast5"] = 0.0

    df["AwayAvgGoalsScoredLast5"] = 0.0
    df["AwayAvgGoalsConcededLast5"] = 0.0

    df["HomeAvgGoalDifferenceLast5"] = 0.0
    df["AwayAvgGoalDifferenceLast5"] = 0.0

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

        home_scored = pd.concat([
            home_home["FTHG"],
            home_away["FTAG"]
        ])

        home_conceded = pd.concat([
            home_home["FTAG"],
            home_away["FTHG"]
        ])

        home_goal_difference = pd.concat([
            home_home["FTHG"] - home_home["FTAG"],
            home_away["FTAG"] - home_away["FTHG"]
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

        away_scored = pd.concat([
            away_home["FTHG"],
            away_away["FTAG"]
        ])

        away_conceded = pd.concat([
            away_home["FTAG"],
            away_away["FTHG"]
        ])

        away_goal_difference = pd.concat([
            away_home["FTHG"] - away_home["FTAG"],
            away_away["FTAG"] - away_away["FTHG"]
        ])

        # -----------------------------
        # SAVE FEATURES
        # -----------------------------

        df.loc[df.index[i], "HomeAvgGoalsScoredLast5"] = (
            home_scored.tail(5).mean()
        )

        df.loc[df.index[i], "HomeAvgGoalsConcededLast5"] = (
            home_conceded.tail(5).mean()
        )

        df.loc[df.index[i], "AwayAvgGoalsScoredLast5"] = (
            away_scored.tail(5).mean()
        )

        df.loc[df.index[i], "AwayAvgGoalsConcededLast5"] = (
            away_conceded.tail(5).mean()
        )

        df.loc[df.index[i], "HomeAvgGoalDifferenceLast5"] = (
            home_goal_difference.tail(5).mean()
        )

        df.loc[df.index[i], "AwayAvgGoalDifferenceLast5"] = (
            away_goal_difference.tail(5).mean()
        )

    return df
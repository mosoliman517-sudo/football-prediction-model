import pandas as pd


def add_half_time_pattern_features(df):
    """
    NOT the current match's own half-time score -- that happens during
    the match, so using it to predict the match would be leakage, the
    same category of mistake as the betting odds. This looks at how a
    team's PAST matches split between the two halves, to see if they
    tend to fade or come alive after the break -- something none of
    the existing full-time-only features can see.

    Same walk-forward discipline as every other rolling feature here:
    only matches that happened before this row are ever used.
    """

    df["HomeAvgSecondHalfGoalsScoredLast5"] = 0.0
    df["HomeAvgSecondHalfGoalsConcededLast5"] = 0.0

    df["AwayAvgSecondHalfGoalsScoredLast5"] = 0.0
    df["AwayAvgSecondHalfGoalsConcededLast5"] = 0.0

    for i in range(len(df)):

        previous_games = df.iloc[:i]

        home = df.iloc[i]["HomeTeam"]
        away = df.iloc[i]["AwayTeam"]

        # -----------------------------
        # HOME TEAM HISTORY
        # -----------------------------

        home_home = previous_games[previous_games["HomeTeam"] == home]
        home_away = previous_games[previous_games["AwayTeam"] == home]

        home_second_half_scored = pd.concat([
            home_home["FTHG"] - home_home["HTHG"],
            home_away["FTAG"] - home_away["HTAG"]
        ])

        home_second_half_conceded = pd.concat([
            home_home["FTAG"] - home_home["HTAG"],
            home_away["FTHG"] - home_away["HTHG"]
        ])

        # -----------------------------
        # AWAY TEAM HISTORY
        # -----------------------------

        away_home = previous_games[previous_games["HomeTeam"] == away]
        away_away = previous_games[previous_games["AwayTeam"] == away]

        away_second_half_scored = pd.concat([
            away_home["FTHG"] - away_home["HTHG"],
            away_away["FTAG"] - away_away["HTAG"]
        ])

        away_second_half_conceded = pd.concat([
            away_home["FTAG"] - away_home["HTAG"],
            away_away["FTHG"] - away_away["HTHG"]
        ])

        # -----------------------------
        # SAVE FEATURES
        # -----------------------------

        df.loc[df.index[i], "HomeAvgSecondHalfGoalsScoredLast5"] = (
            home_second_half_scored.tail(5).mean()
        )
        df.loc[df.index[i], "HomeAvgSecondHalfGoalsConcededLast5"] = (
            home_second_half_conceded.tail(5).mean()
        )
        df.loc[df.index[i], "AwayAvgSecondHalfGoalsScoredLast5"] = (
            away_second_half_scored.tail(5).mean()
        )
        df.loc[df.index[i], "AwayAvgSecondHalfGoalsConcededLast5"] = (
            away_second_half_conceded.tail(5).mean()
        )

    return df

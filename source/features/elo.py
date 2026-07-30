import pandas as pd


def expected_score(rating_a, rating_b):

    return 1 / (1 + 10 ** ((rating_b - rating_a) / 400))


def add_elo_features(df):

    INITIAL_ELO = 1500
    K = 20

    elo = {}

    df["HomeElo"] = 0.0
    df["AwayElo"] = 0.0
    df["EloDifference"] = 0.0

    for i in range(len(df)):

        home = df.loc[i, "HomeTeam"]
        away = df.loc[i, "AwayTeam"]

        if home not in elo:
            elo[home] = INITIAL_ELO

        if away not in elo:
            elo[away] = INITIAL_ELO

        home_rating = elo[home]
        away_rating = elo[away]

        df.loc[i, "HomeElo"] = home_rating
        df.loc[i, "AwayElo"] = away_rating
        df.loc[i, "EloDifference"] = (
            home_rating - away_rating
        )

        expected_home = expected_score(
            home_rating,
            away_rating
        )

        expected_away = expected_score(
            away_rating,
            home_rating
        )

        result = df.loc[i, "FTR"]

        if result == "H":
            actual_home = 1
            actual_away = 0

        elif result == "D":
            actual_home = 0.5
            actual_away = 0.5

        else:
            actual_home = 0
            actual_away = 1

        elo[home] = (
            home_rating
            + K * (actual_home - expected_home)
        )

        elo[away] = (
            away_rating
            + K * (actual_away - expected_away)
        )

    return df
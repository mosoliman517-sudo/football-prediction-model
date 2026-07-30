import pandas as pd


def add_shot_features(df):

    df["HomeAvgShotsLast5"] = 0.0
    df["AwayAvgShotsLast5"] = 0.0

    df["HomeAvgShotsOnTargetLast5"] = 0.0
    df["AwayAvgShotsOnTargetLast5"] = 0.0

    df["HomeAvgShotsConcededLast5"] = 0.0
    df["AwayAvgShotsConcededLast5"] = 0.0

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

        home_shots = pd.concat([
            home_home["HS"],
            home_away["AS"]
        ])

        home_shots_target = pd.concat([
            home_home["HST"],
            home_away["AST"]
        ])

        home_shots_conceded = pd.concat([
            home_home["AS"],
            home_away["HS"]
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

        away_shots = pd.concat([
            away_home["HS"],
            away_away["AS"]
        ])

        away_shots_target = pd.concat([
            away_home["HST"],
            away_away["AST"]
        ])

        away_shots_conceded = pd.concat([
            away_home["AS"],
            away_away["HS"]
        ])

        # -----------------------------
        # SAVE FEATURES
        # -----------------------------

        df.loc[df.index[i], "HomeAvgShotsLast5"] = (
            home_shots.tail(5).mean()
        )

        df.loc[df.index[i], "AwayAvgShotsLast5"] = (
            away_shots.tail(5).mean()
        )

        df.loc[df.index[i], "HomeAvgShotsOnTargetLast5"] = (
            home_shots_target.tail(5).mean()
        )

        df.loc[df.index[i], "AwayAvgShotsOnTargetLast5"] = (
            away_shots_target.tail(5).mean()
        )

        df.loc[df.index[i], "HomeAvgShotsConcededLast5"] = (
            home_shots_conceded.tail(5).mean()
        )

        df.loc[df.index[i], "AwayAvgShotsConcededLast5"] = (
            away_shots_conceded.tail(5).mean()
        )

    return df
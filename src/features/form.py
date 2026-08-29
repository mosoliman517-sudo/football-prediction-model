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


def add_win_rate_features(df, window=10):
    """
    Last-N win rate, isolated from draws -- HomeLast5Points blends a
    win (3pts) and three draws (1pt each) into similar totals, even
    though those are very different signals for how likely a team is
    to actually win, not just avoid losing. This tracks the plain
    fraction of a team's last N home (or away) matches that were wins,
    nothing else blended in.

    Teams with no matches yet in that context get a neutral 0.5 --
    not "50% win rate" as a real estimate, just "no history to judge
    from yet".
    """

    df["HomeWinRateLastHome"] = 0.5
    df["AwayWinRateLastAway"] = 0.5

    for i in range(len(df)):

        previous_games = df.iloc[:i]

        home = df.iloc[i]["HomeTeam"]
        away = df.iloc[i]["AwayTeam"]

        home_home_results = previous_games[
            previous_games["HomeTeam"] == home
        ]["FTR"].tail(window)

        if len(home_home_results) > 0:
            df.loc[df.index[i], "HomeWinRateLastHome"] = (
                (home_home_results == "H").mean()
            )

        away_away_results = previous_games[
            previous_games["AwayTeam"] == away
        ]["FTR"].tail(window)

        if len(away_away_results) > 0:
            df.loc[df.index[i], "AwayWinRateLastAway"] = (
                (away_away_results == "A").mean()
            )

    return df
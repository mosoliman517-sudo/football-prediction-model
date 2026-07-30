import pandas as pd


def get_form_table(previous_games):
    teams = pd.concat([
        previous_games["HomeTeam"],
        previous_games["AwayTeam"]
    ]).unique()

    form = {}

    for team in teams:

        home_games = previous_games[
            previous_games["HomeTeam"] == team
        ]

        away_games = previous_games[
            previous_games["AwayTeam"] == team
        ]

        points = pd.concat([
            home_games["HomePoints"],
            away_games["AwayPoints"]
        ])

        form[team] = points.tail(5).sum()

    table = pd.DataFrame(
        list(form.items()),
        columns=["Team", "Last5Points"]
    )

    table = table.sort_values(
        "Last5Points",
        ascending=False
    )

    table["FormRank"] = range(
        1,
        len(table) + 1
    )

    return table


def add_form_features(df):

    df["HomeLast5Points"] = 0
    df["AwayLast5Points"] = 0

    df["HomeFormRank"] = 0
    df["AwayFormRank"] = 0

    df["HomeAvgOpponentStrengthLast5"] = 0.0
    df["AwayAvgOpponentStrengthLast5"] = 0.0

    df["HomeLast5HomePoints"] = 0
    df["AwayLast5AwayPoints"] = 0

    for i in range(len(df)):

        previous_games = df.iloc[:i]

        home = df.iloc[i]["HomeTeam"]
        away = df.iloc[i]["AwayTeam"]

        # -----------------------
        # Last 5 Overall Points
        # -----------------------

        home_games = previous_games[
            previous_games["HomeTeam"] == home
        ]

        away_games = previous_games[
            previous_games["AwayTeam"] == home
        ]

        home_points = pd.concat([
            home_games["HomePoints"],
            away_games["AwayPoints"]
        ])

        df.loc[df.index[i], "HomeLast5Points"] = (
            home_points.tail(5).sum()
        )

        home_games = previous_games[
            previous_games["HomeTeam"] == away
        ]

        away_games = previous_games[
            previous_games["AwayTeam"] == away
        ]

        away_points = pd.concat([
            home_games["HomePoints"],
            away_games["AwayPoints"]
        ])

        df.loc[df.index[i], "AwayLast5Points"] = (
            away_points.tail(5).sum()
        )

        # -----------------------
        # Home / Away Form
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

        # -----------------------
        # Form Table
        # -----------------------

        if len(previous_games) == 0:
            continue

        form_table = get_form_table(previous_games)

        home_rank = form_table.loc[
            form_table["Team"] == home,
            "FormRank"
        ]

        away_rank = form_table.loc[
            form_table["Team"] == away,
            "FormRank"
        ]

        if len(home_rank):
            df.loc[df.index[i], "HomeFormRank"] = home_rank.iloc[0]

        if len(away_rank):
            df.loc[df.index[i], "AwayFormRank"] = away_rank.iloc[0]

        # -----------------------
        # Opponent Strength
        # -----------------------

        for team, column in [
            (home, "HomeAvgOpponentStrengthLast5"),
            (away, "AwayAvgOpponentStrengthLast5")
        ]:

            previous = pd.concat([
                previous_games[
                    previous_games["HomeTeam"] == team
                ],
                previous_games[
                    previous_games["AwayTeam"] == team
                ]
            ]).tail(5)

            opponent_ranks = []

            for _, game in previous.iterrows():

                if game["HomeTeam"] == team:
                    opponent = game["AwayTeam"]
                else:
                    opponent = game["HomeTeam"]

                rank = form_table.loc[
                    form_table["Team"] == opponent,
                    "FormRank"
                ]

                if len(rank):
                    opponent_ranks.append(rank.iloc[0])

            if len(opponent_ranks):
                df.loc[df.index[i], column] = (
                    sum(opponent_ranks) / len(opponent_ranks)
                )

    return df
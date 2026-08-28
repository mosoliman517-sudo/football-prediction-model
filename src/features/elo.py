import pandas as pd


HOME_ADVANTAGE = 100   # Elo points added to the home team when computing
                        # win probability (not stored in their rating).
                        # ~100 is the standard value used by World
                        # Football Elo ratings — it captures crowd/travel
                        # effects that "team strength" alone misses.

BASE_K = 20             # rating points moved for a normal 1-goal result

REVERSION = 0.33        # fraction each team's rating pulls back toward
                        # 1500 at the start of a new season. Squads
                        # change over the summer — a team shouldn't
                        # carry last May's form at full strength into
                        # August.


def expected_score(rating_a, rating_b):
    return 1 / (1 + 10 ** ((rating_b - rating_a) / 400))


def margin_multiplier(goal_difference):
    """
    A 4-0 win says more about the gap in strength than a 1-0 squeaker,
    so it should move ratings further. This scaling (not something
    invented here — it's the standard World Football Elo formula from
    eloratings.net) increases the K-factor with the margin of victory.
    """

    diff = abs(goal_difference)

    if diff <= 1:
        return 1.0
    elif diff == 2:
        return 1.5
    else:
        return (11 + diff) / 8


def get_season(date):
    # Premier League seasons run Aug -> May, so July is the cutoff:
    # Jan 2024 belongs to the 2023 season, Sept 2024 to the 2024 one.
    return date.year if date.month >= 7 else date.year - 1


def add_elo_features(df):

    INITIAL_ELO = 1500

    elo = {}
    current_season = None

    df["HomeElo"] = 0.0
    df["AwayElo"] = 0.0
    df["EloDifference"] = 0.0

    for i in range(len(df)):

        date = df.loc[i, "Date"]
        season = get_season(date)

        # ---------------------------------------------
        # New season -> pull every rating back toward
        # the mean before this match is processed
        # ---------------------------------------------

        if current_season is None:
            current_season = season

        elif season != current_season:

            for team in elo:
                elo[team] = elo[team] + REVERSION * (INITIAL_ELO - elo[team])

            current_season = season

        home = df.loc[i, "HomeTeam"]
        away = df.loc[i, "AwayTeam"]

        if home not in elo:
            elo[home] = INITIAL_ELO

        if away not in elo:
            elo[away] = INITIAL_ELO

        home_rating = elo[home]
        away_rating = elo[away]

        # Store the rating the teams walked in with — this is what
        # the model gets to see, no home-advantage baked in, since
        # that's applied only to the win-probability calc below
        df.loc[i, "HomeElo"] = home_rating
        df.loc[i, "AwayElo"] = away_rating
        df.loc[i, "EloDifference"] = home_rating - away_rating

        expected_home = expected_score(
            home_rating + HOME_ADVANTAGE,
            away_rating
        )
        expected_away = 1 - expected_home

        result = df.loc[i, "FTR"]

        if result == "H":
            actual_home, actual_away = 1, 0

        elif result == "D":
            actual_home, actual_away = 0.5, 0.5

        else:
            actual_home, actual_away = 0, 1

        home_goals = df.loc[i, "FTHG"]
        away_goals = df.loc[i, "FTAG"]

        k = BASE_K * margin_multiplier(home_goals - away_goals)

        elo[home] = home_rating + k * (actual_home - expected_home)
        elo[away] = away_rating + k * (actual_away - expected_away)

    return df
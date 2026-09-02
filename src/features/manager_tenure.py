import pandas as pd

GAMES_PATH = "01_data_market_value/games.csv"

NEW_MANAGER_WINDOW_DAYS = 45   # the well-documented "new manager bounce" --
                                 # results often improve in the weeks right
                                 # after an appointment, before reverting

TEAM_NAME_MAP = {
    "AFC Bournemouth": "Bournemouth", "Arsenal FC": "Arsenal", "Aston Villa": "Aston Villa",
    "Brentford FC": "Brentford", "Brighton & Hove Albion": "Brighton", "Burnley FC": "Burnley",
    "Cardiff City": "Cardiff", "Chelsea FC": "Chelsea", "Crystal Palace": "Crystal Palace",
    "Everton FC": "Everton", "Fulham FC": "Fulham", "Huddersfield Town": "Huddersfield",
    "Hull City": "Hull", "Ipswich Town": "Ipswich", "Leeds United": "Leeds",
    "Leicester City": "Leicester", "Liverpool FC": "Liverpool", "Luton Town": "Luton",
    "Manchester City": "Man City", "Manchester United": "Man United", "Middlesbrough FC": "Middlesbrough",
    "Newcastle United": "Newcastle", "Norwich City": "Norwich", "Nottingham Forest": "Nott'm Forest",
    "Queens Park Rangers": "QPR", "Sheffield United": "Sheffield United", "Southampton FC": "Southampton",
    "Stoke City": "Stoke", "Sunderland AFC": "Sunderland", "Swansea City": "Swansea",
    "Tottenham Hotspur": "Tottenham", "Watford FC": "Watford", "West Bromwich Albion": "West Brom",
    "West Ham United": "West Ham", "Wolverhampton Wanderers": "Wolves",
}


def _manager_timeline():
    """
    For every EPL club, the date each manager change actually
    happened -- walking that club's real league match sequence
    (extending back to 2012, before this project's own data starts,
    so even a manager appointed just before our 2014-15 window has a
    real "since" date instead of a false day-one appointment) and
    noting whenever the recorded manager name changes from the
    previous match.
    """

    games = pd.read_csv(GAMES_PATH)
    games = games[games["competition_id"] == "GB1"].copy()
    games["date"] = pd.to_datetime(games["date"])

    appearances = pd.concat([
        games[["date", "home_club_name", "home_club_manager_name"]].rename(
            columns={"home_club_name": "Team", "home_club_manager_name": "Manager"}
        ),
        games[["date", "away_club_name", "away_club_manager_name"]].rename(
            columns={"away_club_name": "Team", "away_club_manager_name": "Manager"}
        ),
    ]).dropna(subset=["Manager"])

    appearances["Team"] = appearances["Team"].map(TEAM_NAME_MAP)
    appearances = appearances.dropna(subset=["Team"]).sort_values("date")

    changes = {}   # team -> sorted list of (date_appointed, manager_name)

    for team, group in appearances.groupby("Team"):
        group = group.sort_values("date")
        timeline = []
        current_manager = None
        for _, row in group.iterrows():
            if row["Manager"] != current_manager:
                timeline.append((row["date"], row["Manager"]))
                current_manager = row["Manager"]
        changes[team] = timeline

    return changes


def add_manager_tenure_features(df):
    """
    Adds HomeManagerTenureDays / AwayManagerTenureDays (days since the
    current manager's first known match in charge) and
    HomeNewManagerBoost / AwayNewManagerBoost (1 if within
    NEW_MANAGER_WINDOW_DAYS of an appointment) -- the well-documented
    "new manager bounce". A team's level can shift mid-season in a way
    nothing else here sees coming; this is a real, if imperfect, way
    to capture it (imperfect because the walk only sees league
    matches, so a change made purely between cup fixtures could be
    caught a match late).

    A team with no manager history yet in the data gets a large
    default tenure (730 days) -- "presumably settled," a deliberately
    neutral assumption rather than falsely implying a brand new
    appointment.
    """

    changes = _manager_timeline()

    def tenure_and_boost(team, match_date):
        timeline = changes.get(team, [])
        appointed = None
        for date_appointed, _ in timeline:
            if date_appointed < match_date:
                appointed = date_appointed
            else:
                break

        if appointed is None:
            return 730, 0

        days = (match_date - appointed).days
        return days, int(days <= NEW_MANAGER_WINDOW_DAYS)

    df = df.copy()

    home_results = df.apply(
        lambda row: tenure_and_boost(row["HomeTeam"], row["Date"]), axis=1
    )
    away_results = df.apply(
        lambda row: tenure_and_boost(row["AwayTeam"], row["Date"]), axis=1
    )

    df["HomeManagerTenureDays"] = [r[0] for r in home_results]
    df["HomeNewManagerBoost"] = [r[1] for r in home_results]
    df["AwayManagerTenureDays"] = [r[0] for r in away_results]
    df["AwayNewManagerBoost"] = [r[1] for r in away_results]

    return df

import pandas as pd

GAMES_PATH = "01_data_market_value/games.csv"
CLUBS_PATH = "01_data_market_value/clubs.csv"

EUROPEAN_COMPETITION_IDS = {
    "CL", "CLQ",      # Champions League + qualifying
    "EL", "ELQ",      # Europa League + qualifying
    "UCOL", "ECLQ",   # Conference League + qualifying
}

CONGESTION_WINDOW_DAYS = 4   # Tuesday/Wednesday European game -> Saturday/
                              # Sunday league match is the classic fatigue
                              # window ("European hangover") -- 4 days
                              # covers a Tuesday-to-Saturday or
                              # Wednesday-to-Sunday gap.

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


def add_fixture_congestion_features(df):
    """
    Adds HomePlayedEuropeMidweek / AwayPlayedEuropeMidweek -- did this
    team play a Champions League / Europa League / Conference League
    match (including qualifiers) in the CONGESTION_WINDOW_DAYS before
    this league match? The well-documented "European hangover" effect:
    a midweek continental fixture (often with travel) before a weekend
    league match is a real fatigue factor nothing else here captures.

    Genuinely pre-match: which teams are in Europe that week and their
    fixture list is public information well before kickoff.
    """

    games = pd.read_csv(GAMES_PATH)
    games["date"] = pd.to_datetime(games["date"])
    european_games = games[games["competition_id"].isin(EUROPEAN_COMPETITION_IDS)]

    clubs = pd.read_csv(CLUBS_PATH)
    clubs = clubs.copy()
    clubs["ProjectName"] = clubs["name"].map(TEAM_NAME_MAP)
    name_to_club_ids = {}
    for club_id, name in zip(clubs["club_id"], clubs["ProjectName"]):
        if pd.notna(name):
            name_to_club_ids.setdefault(name, set()).add(club_id)

    # Every European match date per club (either side of the fixture)
    club_european_dates = {}
    for _, row in european_games.iterrows():
        for club_id in (row["home_club_id"], row["away_club_id"]):
            club_european_dates.setdefault(club_id, []).append(row["date"])

    for club_id in club_european_dates:
        club_european_dates[club_id] = sorted(club_european_dates[club_id])

    def played_europe_recently(team, match_date):
        for club_id in name_to_club_ids.get(team, []):
            dates = club_european_dates.get(club_id, [])
            for d in dates:
                if pd.Timedelta(0) < (match_date - d) <= pd.Timedelta(days=CONGESTION_WINDOW_DAYS):
                    return 1
        return 0

    df = df.copy()
    df["HomePlayedEuropeMidweek"] = df.apply(
        lambda row: played_europe_recently(row["HomeTeam"], row["Date"]), axis=1
    )
    df["AwayPlayedEuropeMidweek"] = df.apply(
        lambda row: played_europe_recently(row["AwayTeam"], row["Date"]), axis=1
    )

    return df

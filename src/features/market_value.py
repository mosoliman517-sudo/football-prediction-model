import pandas as pd

CLUBS_PATH = "01_data_market_value/clubs.csv"
VALUATIONS_PATH = "01_data_market_value/player_valuations.csv"

# Transfermarkt's club names vs. the naming this project already uses
# (01_data/) -- same normalization job as Understat's TEAM_NAME_MAP in
# 00_fetch_xg_data.py, just a different source. Reading FC and Wigan
# Athletic are real EPL clubs in Transfermarkt's data but never
# appear in this project's own seasons, so they're left unmapped.
TEAM_NAME_MAP = {
    "AFC Bournemouth": "Bournemouth",
    "Arsenal FC": "Arsenal",
    "Aston Villa": "Aston Villa",
    "Brentford FC": "Brentford",
    "Brighton & Hove Albion": "Brighton",
    "Burnley FC": "Burnley",
    "Cardiff City": "Cardiff",
    "Chelsea FC": "Chelsea",
    "Crystal Palace": "Crystal Palace",
    "Everton FC": "Everton",
    "Fulham FC": "Fulham",
    "Huddersfield Town": "Huddersfield",
    "Hull City": "Hull",
    "Ipswich Town": "Ipswich",
    "Leeds United": "Leeds",
    "Leicester City": "Leicester",
    "Liverpool FC": "Liverpool",
    "Luton Town": "Luton",
    "Manchester City": "Man City",
    "Manchester United": "Man United",
    "Middlesbrough FC": "Middlesbrough",
    "Newcastle United": "Newcastle",
    "Norwich City": "Norwich",
    "Nottingham Forest": "Nott'm Forest",
    "Queens Park Rangers": "QPR",
    "Sheffield United": "Sheffield United",
    "Southampton FC": "Southampton",
    "Stoke City": "Stoke",
    "Sunderland AFC": "Sunderland",
    "Swansea City": "Swansea",
    "Tottenham Hotspur": "Tottenham",
    "Watford FC": "Watford",
    "West Bromwich Albion": "West Brom",
    "West Ham United": "West Ham",
    "Wolverhampton Wanderers": "Wolves",
}


def _season_start(season_year):
    return pd.Timestamp(f"{season_year}-08-01")


def _squad_values_by_season(df):
    """
    One squad-value snapshot per team per season, taken as of that
    season's start (August 1st) -- not a continuously-updating
    feature, matching what was actually asked for: "market value of a
    team before every season."

    Resolving each player's club at a given date isn't as simple as
    filtering player_valuations.csv to EPL-tagged rows: that field
    reflects whichever competition the player was in at the time of
    THAT valuation record, so filtering by it up front would miss a
    player who transferred INTO an EPL club over the summer (their
    most recent pre-transfer valuation is tagged with their old
    club/league, not the new one). Instead, every player's full
    valuation history gets resolved to "whichever club they were
    actually at, as of this date" via merge_asof (most recent
    valuation on or before the season-start date, regardless of
    league), and only THEN filtered down to EPL clubs -- correctly
    capturing summer transfers either direction.
    """

    clubs = pd.read_csv(CLUBS_PATH)
    valuations = pd.read_csv(VALUATIONS_PATH)
    valuations["date"] = pd.to_datetime(valuations["date"])
    valuations = valuations.sort_values("date").reset_index(drop=True)

    epl_clubs = clubs[clubs["domestic_competition_id"] == "GB1"].copy()
    epl_clubs["ProjectName"] = epl_clubs["name"].map(TEAM_NAME_MAP)
    club_id_to_name = dict(
        zip(epl_clubs["club_id"], epl_clubs["ProjectName"])
    )
    epl_club_ids = set(club_id_to_name.keys())

    unique_players = valuations["player_id"].unique()
    season_years = sorted(df["Date"].apply(
        lambda d: d.year if d.month >= 7 else d.year - 1
    ).unique())

    rows = []

    for season_year in season_years:

        cutoff = _season_start(season_year)

        query = pd.DataFrame({
            "player_id": unique_players,
            "date": cutoff
        }).sort_values("date")

        resolved = pd.merge_asof(
            query,
            valuations[["player_id", "date", "market_value_in_eur", "current_club_id"]],
            on="date", by="player_id", direction="backward"
        )

        resolved = resolved[resolved["current_club_id"].isin(epl_club_ids)]
        resolved["Team"] = resolved["current_club_id"].map(club_id_to_name)

        squad_totals = resolved.groupby("Team")["market_value_in_eur"].sum()

        for team, total in squad_totals.items():
            rows.append({"SeasonYear": season_year, "Team": team, "SquadValueEur": total})

    return pd.DataFrame(rows)


def add_market_value_features(df):
    """
    Adds HomeSquadValueEur / AwaySquadValueEur -- each team's total
    squad market value as of that season's start, in euros. Genuinely
    pre-match: known before a ball is kicked, doesn't change during
    the season, and doesn't require any rolling/walk-forward logic the
    way form-based features do, since it's set once per season by
    construction.

    A team with no resolvable squad value for its season (shouldn't
    happen for any Premier League team in this project's date range,
    but guards a genuinely missing case) gets 0, matching how every
    other feature module here handles "no data yet."
    """

    df = df.copy()
    df["SeasonYear"] = df["Date"].apply(
        lambda d: d.year if d.month >= 7 else d.year - 1
    )

    squad_values = _squad_values_by_season(df)

    home_values = squad_values.rename(
        columns={"Team": "HomeTeam", "SquadValueEur": "HomeSquadValueEur"}
    )
    away_values = squad_values.rename(
        columns={"Team": "AwayTeam", "SquadValueEur": "AwaySquadValueEur"}
    )

    df = df.merge(home_values, on=["SeasonYear", "HomeTeam"], how="left")
    df = df.merge(away_values, on=["SeasonYear", "AwayTeam"], how="left")

    df["HomeSquadValueEur"] = df["HomeSquadValueEur"].fillna(0.0)
    df["AwaySquadValueEur"] = df["AwaySquadValueEur"].fillna(0.0)

    df = df.drop(columns=["SeasonYear"])

    return df

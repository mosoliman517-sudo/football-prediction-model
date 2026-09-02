import pandas as pd

CLUBS_PATH = "01_data_market_value/clubs.csv"
VALUATIONS_PATH = "01_data_market_value/player_valuations.csv"
PLAYERS_PATH = "01_data_market_value/players.csv"

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


def _squad_age_by_season(df):
    clubs = pd.read_csv(CLUBS_PATH)
    valuations = pd.read_csv(VALUATIONS_PATH)
    valuations["date"] = pd.to_datetime(valuations["date"])
    valuations = valuations.sort_values("date").reset_index(drop=True)

    players = pd.read_csv(PLAYERS_PATH)
    players["date_of_birth"] = pd.to_datetime(players["date_of_birth"], errors="coerce")
    birth_date = dict(zip(players["player_id"], players["date_of_birth"]))

    epl_clubs = clubs[clubs["domestic_competition_id"] == "GB1"].copy()
    epl_clubs["ProjectName"] = epl_clubs["name"].map(TEAM_NAME_MAP)
    club_id_to_name = dict(zip(epl_clubs["club_id"], epl_clubs["ProjectName"]))
    epl_club_ids = set(club_id_to_name.keys())

    unique_players = valuations["player_id"].unique()
    season_years = sorted(df["Date"].apply(
        lambda d: d.year if d.month >= 7 else d.year - 1
    ).unique())

    rows = []

    for season_year in season_years:
        cutoff = pd.Timestamp(f"{season_year}-08-01")

        query = pd.DataFrame({"player_id": unique_players, "date": cutoff}).sort_values("date")
        resolved = pd.merge_asof(
            query, valuations[["player_id", "date", "current_club_id"]],
            on="date", by="player_id", direction="backward"
        )
        resolved = resolved[resolved["current_club_id"].isin(epl_club_ids)].copy()
        resolved["Team"] = resolved["current_club_id"].map(club_id_to_name)
        resolved["AgeYears"] = resolved["player_id"].map(
            lambda pid: (cutoff - birth_date.get(pid)).days / 365.25
            if pd.notna(birth_date.get(pid)) else None
        )
        resolved = resolved.dropna(subset=["AgeYears"])

        avg_age = resolved.groupby("Team")["AgeYears"].mean()
        for team, age in avg_age.items():
            rows.append({"SeasonYear": season_year, "Team": team, "SquadAvgAge": age})

    return pd.DataFrame(rows)


def add_squad_age_features(df):
    df = df.copy()
    df["SeasonYear"] = df["Date"].apply(lambda d: d.year if d.month >= 7 else d.year - 1)

    squad_age = _squad_age_by_season(df)

    home_age = squad_age.rename(columns={"Team": "HomeTeam", "SquadAvgAge": "HomeSquadAvgAge"})
    away_age = squad_age.rename(columns={"Team": "AwayTeam", "SquadAvgAge": "AwaySquadAvgAge"})

    df = df.merge(home_age, on=["SeasonYear", "HomeTeam"], how="left")
    df = df.merge(away_age, on=["SeasonYear", "AwayTeam"], how="left")

    league_avg_age = squad_age["SquadAvgAge"].mean()
    df["HomeSquadAvgAge"] = df["HomeSquadAvgAge"].fillna(league_avg_age)
    df["AwaySquadAvgAge"] = df["AwaySquadAvgAge"].fillna(league_avg_age)

    df = df.drop(columns=["SeasonYear"])
    return df

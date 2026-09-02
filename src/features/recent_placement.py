from features.elo import get_season

RECENT_SEASONS = 3   # how many prior seasons' final standing to blend


def _final_standings_by_season(df):
    """
    Each team's FINAL league position at the end of every season this
    project covers -- fully derivable from data already in the
    pipeline, no new source needed. Same sort rule as
    table_position.py (Points, then GD, then GF), just captured once
    at each season's last matchday instead of walk-forward every row.
    """

    df = df.sort_values("Date")
    season_table = {}
    current_season = None
    final_standings = {}   # season_year -> {team: position}

    def snapshot_positions(table):
        ranking = sorted(
            table.items(),
            key=lambda kv: (kv[1]["Points"], kv[1]["GF"] - kv[1]["GA"], kv[1]["GF"]),
            reverse=True
        )
        return {team: rank + 1 for rank, (team, _) in enumerate(ranking)}

    for _, row in df.iterrows():

        season = get_season(row["Date"])

        if current_season is not None and season != current_season:
            final_standings[current_season] = snapshot_positions(season_table)
            season_table = {}

        current_season = season

        home, away = row["HomeTeam"], row["AwayTeam"]
        for team in (home, away):
            if team not in season_table:
                season_table[team] = {"Points": 0, "GF": 0, "GA": 0}

        home_goals, away_goals = row["FTHG"], row["FTAG"]
        season_table[home]["GF"] += home_goals
        season_table[home]["GA"] += away_goals
        season_table[away]["GF"] += away_goals
        season_table[away]["GA"] += home_goals

        if home_goals > away_goals:
            season_table[home]["Points"] += 3
        elif home_goals < away_goals:
            season_table[away]["Points"] += 3
        else:
            season_table[home]["Points"] += 1
            season_table[away]["Points"] += 1

    if current_season is not None:
        final_standings[current_season] = snapshot_positions(season_table)

    return final_standings


def add_recent_placement_features(df):
    """
    Adds HomeRecentAvgPlacement / AwayRecentAvgPlacement -- average
    final league position across each team's last RECENT_SEASONS
    seasons (not counting the season currently in progress). A
    genuinely different timescale from table_position.py (this
    season's live standing) or Elo (continuous, form-weighted): this
    is "roughly what level has this club actually operated at
    recently," the kind of multi-year context a newly-promoted side's
    single fast start or a big club's one bad season can't fake.

    A team with no prior-season history in the data (promoted for the
    first time within our coverage, or simply early in the dataset)
    gets 20.5 -- the middle of a 20-team table, a neutral "no
    established level yet" reading, the same spirit as every other
    feature module's "no data" convention.
    """

    final_standings = _final_standings_by_season(df)
    NEUTRAL_PLACEMENT = 20.5

    def recent_avg(team, season_year):
        recent_positions = []
        for prior_season in range(season_year - RECENT_SEASONS, season_year):
            standings = final_standings.get(prior_season)
            if standings and team in standings:
                recent_positions.append(standings[team])
        if not recent_positions:
            return NEUTRAL_PLACEMENT
        return sum(recent_positions) / len(recent_positions)

    df = df.copy()
    df["SeasonYear"] = df["Date"].apply(get_season)

    unique_pairs = df[["SeasonYear", "HomeTeam"]].drop_duplicates()
    home_lookup = {
        (row["SeasonYear"], row["HomeTeam"]): recent_avg(row["HomeTeam"], row["SeasonYear"])
        for _, row in unique_pairs.iterrows()
    }
    unique_away_pairs = df[["SeasonYear", "AwayTeam"]].drop_duplicates()
    away_lookup = {
        (row["SeasonYear"], row["AwayTeam"]): recent_avg(row["AwayTeam"], row["SeasonYear"])
        for _, row in unique_away_pairs.iterrows()
    }

    df["HomeRecentAvgPlacement"] = df.apply(
        lambda row: home_lookup[(row["SeasonYear"], row["HomeTeam"])], axis=1
    )
    df["AwayRecentAvgPlacement"] = df.apply(
        lambda row: away_lookup[(row["SeasonYear"], row["AwayTeam"])], axis=1
    )

    df = df.drop(columns=["SeasonYear"])

    return df

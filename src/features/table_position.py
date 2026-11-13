from features.elo import get_season


def add_table_position_features(df):
    """
    Where a team is actually SITTING in the table right now, walk-
    forward within each season -- genuinely different information from
    recent form (last-5-match trend) or Elo (long-run + recent blend).
    A team on a 3-game winning streak climbing from 10th to 6th is a
    different situation than the same streak climbing from 18th to
    14th, even though last-5 form looks identical either way.

    Standard EPL table sort: Points, then Goal Difference, then Goals
    For. Position 1 = top of the table. Resets every season boundary
    (same cutoff as Elo's own season reversion -- see features/elo.py)
    since a table position only means something within its own season.

    Early in a season (0-2 games played) every team is bunched near
    the same position with almost no separation -- that's not a bug,
    it's genuinely true: nobody's table position means much yet. No
    special-casing needed, the numbers just naturally reflect that.
    """

    df = df.copy()

    df["HomeTablePosition"] = 0
    df["AwayTablePosition"] = 0
    df["TablePointsGap"] = 0

    standings = {}   # season -> {team: {"Points":..,"GF":..,"GA":..}}
    current_season = None

    # Results are applied to the table only once a new MATCH DAY starts,
    # not row by row: every match on a given date is ranked from the
    # table as it stood at the start of that day. Applying them row by
    # row let a match "see" other same-day results that happened to sit
    # above it in the file -- an arbitrary order (it shifted whenever a
    # season file was added), and information a simultaneous kickoff
    # could never have had.
    pending = []         # (table, home, away, home_goals, away_goals) for the current day
    current_date = None

    def apply_pending():
        for tbl, h, a, hg, ag in pending:
            tbl[h]["GF"] += hg
            tbl[h]["GA"] += ag
            tbl[a]["GF"] += ag
            tbl[a]["GA"] += hg
            if hg > ag:
                tbl[h]["Points"] += 3
            elif hg < ag:
                tbl[a]["Points"] += 3
            else:
                tbl[h]["Points"] += 1
                tbl[a]["Points"] += 1
        pending.clear()

    for i in range(len(df)):

        date = df.loc[i, "Date"]
        season = get_season(date)

        if date != current_date:
            apply_pending()
            current_date = date

        if season != current_season:
            standings[season] = standings.get(season, {})
            current_season = season

        table = standings[season]
        home = df.loc[i, "HomeTeam"]
        away = df.loc[i, "AwayTeam"]

        for team in (home, away):
            if team not in table:
                table[team] = {"Points": 0, "GF": 0, "GA": 0}

        # Rank every team seen so far this season -- a team with no
        # matches yet this season (newly promoted, or simply hasn't
        # played its first fixture) sits at 0-0-0, tied at the bottom
        # of whatever's been recorded, which is an honest reflection
        # of "no data yet," the same convention every other feature
        # module here uses.
        ranking = sorted(
            table.items(),
            key=lambda kv: (kv[1]["Points"], kv[1]["GF"] - kv[1]["GA"], kv[1]["GF"]),
            reverse=True
        )
        position = {team_name: rank + 1 for rank, (team_name, _) in enumerate(ranking)}

        df.loc[i, "HomeTablePosition"] = position[home]
        df.loc[i, "AwayTablePosition"] = position[away]
        df.loc[i, "TablePointsGap"] = table[home]["Points"] - table[away]["Points"]

        # Queue the result -- applied once the day is over (see above)
        pending.append((table, home, away, df.loc[i, "FTHG"], df.loc[i, "FTAG"]))

    return df

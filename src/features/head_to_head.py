import pandas as pd


def matchup_key(team_a, team_b):
    # Unordered pair -- Arsenal vs Chelsea and Chelsea vs Arsenal look up
    # the same history bucket, since head-to-head history doesn't care
    # which side either team was on for a given past meeting.
    return tuple(sorted([team_a, team_b]))


def add_head_to_head_features(df):
    """
    Some teams just have a hold over specific opponents regardless of
    general form or Elo -- nothing built so far captures matchup-
    specific history at all. This tracks, for the two teams in THIS
    match, how their past meetings against each other (any venue) have
    gone: how often the current home team has won those meetings, how
    often the current away team has won them, and how often they've
    drawn.

    Walk-forward, no leakage: a match's result is only added to its
    matchup's history AFTER that row has been read, so every row only
    ever sees meetings that actually happened before it.

    Teams with no prior meetings (or a first-ever fixture between
    them) get a neutral 0.5/0.5/0.0 split -- H2HMatchesPlayed is 0 in
    that case, so a model can learn to treat the rates as meaningless
    until there's real history to back them.
    """

    df["H2HHomeTeamWinRate"] = 0.5
    df["H2HAwayTeamWinRate"] = 0.5
    df["H2HDrawRate"] = 0.0
    df["H2HMatchesPlayed"] = 0

    history = {}   # matchup_key -> list of winners ("H" team name, "A" team name, or None for a draw)

    for i in range(len(df)):

        home = df.loc[i, "HomeTeam"]
        away = df.loc[i, "AwayTeam"]
        key = matchup_key(home, away)

        past_results = history.get(key, [])
        matches_played = len(past_results)

        df.loc[i, "H2HMatchesPlayed"] = matches_played

        if matches_played > 0:

            home_wins = sum(1 for winner in past_results if winner == home)
            away_wins = sum(1 for winner in past_results if winner == away)
            draws = sum(1 for winner in past_results if winner is None)

            df.loc[i, "H2HHomeTeamWinRate"] = home_wins / matches_played
            df.loc[i, "H2HAwayTeamWinRate"] = away_wins / matches_played
            df.loc[i, "H2HDrawRate"] = draws / matches_played

        # Record this match's result for the next time these two meet
        result = df.loc[i, "FTR"]

        if result == "H":
            winner = home
        elif result == "A":
            winner = away
        else:
            winner = None

        history.setdefault(key, []).append(winner)

    return df

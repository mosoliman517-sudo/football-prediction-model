import pandas as pd

# Stems of the rolling "overall form" features: a team's last-5 numbers
# don't depend on which side it plays, so for a hypothetical fixture they
# are read from the team's most recent match whichever side it was on.
OVERALL_STEMS = [
    "Last5Points", "AvgGoalsScoredLast5", "AvgGoalsConcededLast5",
    "AvgShotsLast5", "AvgShotsOnTargetLast5", "AvgShotsConcededLast5",
    "AvgSecondHalfGoalsScoredLast5", "AvgSecondHalfGoalsConcededLast5",
]

DEFAULT_REST_DAYS = 7


def _current_table(live):
    """Real standings of the in-progress season, same sort as table_position.py."""
    table = {}
    for row in live.itertuples():
        for team in (row.HomeTeam, row.AwayTeam):
            table.setdefault(team, {"Points": 0, "GF": 0, "GA": 0})
        h, a = table[row.HomeTeam], table[row.AwayTeam]
        h["GF"] += row.FTHG; h["GA"] += row.FTAG
        a["GF"] += row.FTAG; a["GA"] += row.FTHG
        if row.FTHG > row.FTAG:
            h["Points"] += 3
        elif row.FTHG < row.FTAG:
            a["Points"] += 3
        else:
            h["Points"] += 1; a["Points"] += 1
    ranking = sorted(
        table.items(),
        key=lambda kv: (kv[1]["Points"], kv[1]["GF"] - kv[1]["GA"], kv[1]["GF"]),
        reverse=True,
    )
    return {team: (rank + 1, stats["Points"]) for rank, (team, stats) in enumerate(ranking)}


def _head_to_head(history, home, away):
    meetings = history[
        ((history["HomeTeam"] == home) & (history["AwayTeam"] == away))
        | ((history["HomeTeam"] == away) & (history["AwayTeam"] == home))
    ]
    n = len(meetings)
    if n == 0:
        return 0.5, 0.5, 0.0, 0
    home_wins = (((meetings["FTR"] == "H") & (meetings["HomeTeam"] == home))
                 | ((meetings["FTR"] == "A") & (meetings["AwayTeam"] == home))).sum()
    away_wins = (((meetings["FTR"] == "H") & (meetings["HomeTeam"] == away))
                 | ((meetings["FTR"] == "A") & (meetings["AwayTeam"] == away))).sum()
    draws = (meetings["FTR"] == "D").sum()
    return home_wins / n, away_wins / n, draws / n, n


def build_fixture_grid(history, live, model_columns):
    """
    One row for every possible Home-vs-Away pairing of the in-progress
    season's teams (n x (n-1) rows), in the same column layout as the model
    files, so the trained models can score a match that has not been played.

    An approximation, same spirit as 05_predict_scoreline.predict_fixture:
    each team's rolling features are read from its most recent match, so
    they are one match out of date; the table position / points gap use the
    REAL current standings; head-to-head is scanned from all history;
    kickoff day/time, rest days and European fixtures are unknown for a
    hypothetical fixture and get neutral defaults rather than a guess.
    """

    history = history.sort_values("Date")
    teams = sorted(set(live["HomeTeam"]) | set(live["AwayTeam"]))
    table = _current_table(live)

    latest_home = {t: history[history["HomeTeam"] == t].iloc[-1] for t in teams if (history["HomeTeam"] == t).any()}
    latest_away = {t: history[history["AwayTeam"] == t].iloc[-1] for t in teams if (history["AwayTeam"] == t).any()}

    def latest_any(team):
        h, a = latest_home.get(team), latest_away.get(team)
        if h is None:
            return a, "Away"
        if a is None:
            return h, "Home"
        return (h, "Home") if h["Date"] >= a["Date"] else (a, "Away")

    placeholder_date = (pd.to_datetime(live["Date"]).max() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    rows = []

    for home in teams:
        for away in teams:
            if home == away:
                continue
            hr, ar = latest_home[home], latest_away[away]
            home_any, home_side = latest_any(home)
            away_any, away_side = latest_any(away)
            h2h_home, h2h_away, h2h_draw, h2h_n = _head_to_head(history, home, away)

            row = {c: None for c in model_columns}
            row.update({
                "Div": "E0", "Date": placeholder_date, "HomeTeam": home, "AwayTeam": away,
                "HomeLast5HomePoints": hr["HomeLast5HomePoints"],
                "AwayLast5AwayPoints": ar["AwayLast5AwayPoints"],
                "HomeWinRateLastHome": hr["HomeWinRateLastHome"],
                "AwayWinRateLastAway": ar["AwayWinRateLastAway"],
                "HomeElo": hr["HomeElo"], "AwayElo": ar["AwayElo"],
                "EloDifference": hr["HomeElo"] - ar["AwayElo"],
                "HomeTeamOverallElo": home_any[f"{home_side}TeamOverallElo"],
                "AwayTeamOverallElo": away_any[f"{away_side}TeamOverallElo"],
                "HomeSquadValueEur": hr["HomeSquadValueEur"],
                "AwaySquadValueEur": ar["AwaySquadValueEur"],
                "HomeManagerExperience": hr["HomeManagerExperience"],
                "AwayManagerExperience": ar["AwayManagerExperience"],
                "HomeRecentAvgPlacement": hr["HomeRecentAvgPlacement"],
                "AwayRecentAvgPlacement": ar["AwayRecentAvgPlacement"],
                "HomeTablePosition": table[home][0], "AwayTablePosition": table[away][0],
                "TablePointsGap": table[home][1] - table[away][1],
                "H2HHomeTeamWinRate": h2h_home, "H2HAwayTeamWinRate": h2h_away,
                "H2HDrawRate": h2h_draw, "H2HMatchesPlayed": h2h_n,
                "DayOfWeek": 5, "IsWeekend": 1, "KickoffHour": 15.0,
                "HomePlayedEuropeMidweek": 0, "AwayPlayedEuropeMidweek": 0,
                "HomeDaysRest": DEFAULT_REST_DAYS, "AwayDaysRest": DEFAULT_REST_DAYS,
            })
            row["OverallEloDifference"] = row["HomeTeamOverallElo"] - row["AwayTeamOverallElo"]
            for stem in OVERALL_STEMS:
                row[f"Home{stem}"] = home_any[f"{home_side}{stem}"]
                row[f"Away{stem}"] = away_any[f"{away_side}{stem}"]
            rows.append(row)

    out = pd.DataFrame(rows, columns=model_columns)
    missing = [c for c in model_columns if out[c].isna().all()]
    return out, missing

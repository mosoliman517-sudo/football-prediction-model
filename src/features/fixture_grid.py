import json

import pandas as pd

DEFAULT_REST_DAYS = 7
ELO_STATE_PATH = "02_processed_data/elo_state.json"


def team_log(history, team):
    """
    One row per match the team has played, oldest first, in a venue-neutral
    shape (what the team scored / conceded / shot, whichever side it was on).
    `history` must be in date order and must have the raw result columns.
    """

    home = history[history["HomeTeam"] == team]
    away = history[history["AwayTeam"] == team]
    rows = pd.concat([
        pd.DataFrame({
            "venue": "H", "pts": home["HomePoints"], "gf": home["FTHG"], "ga": home["FTAG"],
            "shots": home["HS"], "sot": home["HST"], "shots_against": home["AS"],
            "sh_for": home["FTHG"] - home["HTHG"], "sh_against": home["FTAG"] - home["HTAG"],
            "won": (home["FTR"] == "H").astype(int),
        }),
        pd.DataFrame({
            "venue": "A", "pts": away["AwayPoints"], "gf": away["FTAG"], "ga": away["FTHG"],
            "shots": away["AS"], "sot": away["AST"], "shots_against": away["HS"],
            "sh_for": away["FTAG"] - away["HTAG"], "sh_against": away["FTHG"] - away["HTHG"],
            "won": (away["FTR"] == "A").astype(int),
        }),
    ]).sort_index()                       # index = row order = chronological
    return rows


def rolling_state(history, team, side):
    """
    A team's rolling features as they stand AFTER every match in `history`,
    named for the side ("Home" / "Away") it will play next. Same definitions
    as features/form.py, goals.py, shots.py and half_time.py:
      - "last 5" features use the team's last 5 matches overall, whichever
        side it played;
      - HomeLast5HomePoints / AwayLast5AwayPoints and the win rates use only
        matches at that venue.
    """

    log = team_log(history, team)
    last5 = log.tail(5)
    venue = "H" if side == "Home" else "A"
    at_venue = log[log["venue"] == venue]
    out = {
        f"{side}Last5Points": last5["pts"].sum(),
        f"{side}AvgGoalsScoredLast5": last5["gf"].mean(),
        f"{side}AvgGoalsConcededLast5": last5["ga"].mean(),
        f"{side}AvgShotsLast5": last5["shots"].mean(),
        f"{side}AvgShotsOnTargetLast5": last5["sot"].mean(),
        f"{side}AvgShotsConcededLast5": last5["shots_against"].mean(),
        f"{side}AvgSecondHalfGoalsScoredLast5": last5["sh_for"].mean(),
        f"{side}AvgSecondHalfGoalsConcededLast5": last5["sh_against"].mean(),
    }
    if side == "Home":
        out["HomeLast5HomePoints"] = at_venue["pts"].tail(5).sum()
        out["HomeWinRateLastHome"] = at_venue["won"].tail(10).mean() if len(at_venue) else 0.5
    else:
        out["AwayLast5AwayPoints"] = at_venue["pts"].tail(5).sum()
        out["AwayWinRateLastAway"] = at_venue["won"].tail(10).mean() if len(at_venue) else 0.5
    return out


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


def head_to_head(history, home, away):
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

    Everything is the state AFTER the latest real matchday, built only from
    REAL results: Elo is the end-of-data rating (elo_state.json, written by
    01), rolling form / goals / shots / half-time patterns are recomputed
    from the real history including each club's newest match, table position
    and points gap come from the real current standings, and head-to-head is
    scanned from all history. What cannot be known for an unscheduled match
    (kickoff day/time, days of rest, European fixtures) takes a neutral value.
    """

    history = history.sort_values("Date", kind="stable").reset_index(drop=True)
    teams = sorted(set(live["HomeTeam"]) | set(live["AwayTeam"]))
    table = _current_table(live)
    elo = json.load(open(ELO_STATE_PATH))
    home_elo, away_elo = elo["home"], elo["away"]
    xg_elo = elo.get("xg", {})

    latest_home = {t: history[history["HomeTeam"] == t].iloc[-1] for t in teams if (history["HomeTeam"] == t).any()}
    latest_away = {t: history[history["AwayTeam"] == t].iloc[-1] for t in teams if (history["AwayTeam"] == t).any()}

    home_state = {t: rolling_state(history, t, "Home") for t in teams}
    away_state = {t: rolling_state(history, t, "Away") for t in teams}

    placeholder_date = (pd.to_datetime(live["Date"]).max() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    rows = []

    for home in teams:
        for away in teams:
            if home == away:
                continue
            hr, ar = latest_home[home], latest_away[away]
            h2h_home, h2h_away, h2h_draw, h2h_n = head_to_head(history, home, away)

            row = {c: None for c in model_columns}
            row.update(home_state[home])
            row.update(away_state[away])
            row.update({
                "Div": "E0", "Date": placeholder_date, "HomeTeam": home, "AwayTeam": away,
                "HomeElo": home_elo[home], "AwayElo": away_elo[away],
                "EloDifference": home_elo[home] - away_elo[away],
                "EloXGDifference": xg_elo.get(home, 1500.0) - xg_elo.get(away, 1500.0),
                "HomeSquadValueEur": hr["HomeSquadValueEur"],
                "AwaySquadValueEur": ar["AwaySquadValueEur"],
                # experience counts matches BEFORE a row's match; one more has been played since
                "HomeManagerExperience": hr["HomeManagerExperience"] + 1,
                "AwayManagerExperience": ar["AwayManagerExperience"] + 1,
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
            rows.append(row)

    out = pd.DataFrame(rows, columns=model_columns)
    missing = [c for c in model_columns if out[c].isna().all()]
    return out, missing

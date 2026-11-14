import multiprocessing as mp
from collections import deque, defaultdict

import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.linear_model import PoissonRegressor

from features.elo import expected_score, margin_multiplier, get_season, INITIAL_ELO, BASE_K, REVERSION
from features.head_to_head import matchup_key

# ---------------------------------------------------------------------
# The blind season-simulation engine, shared by
# 07_predict_blind_season.py (whole past seasons) and
# 12_blind_rest_of_season.py (the rest of the live season).
#
# What "blind" means here: after every SIMULATED match, Elo, form,
# goals, shots, half-time patterns, head-to-head and the table are all
# updated with the model's own predicted result, and the next match is
# predicted from that updated state -- never from a real result the
# simulation was not given. `real_n` is the one exception, on purpose:
# the first real_n fixtures are matches that have REALLY been played,
# replayed into the state with their true results so the simulation
# continues from the genuine current position.
# ---------------------------------------------------------------------

MAX_GOALS = 8
MAX_SHOTS = 30
N_SIMULATIONS = 20   # trade-off between run-to-run noise and runtime;
                       # 100 was more stable but too slow to iterate on

FEATURE_COLUMNS = [
    "HomeLast5Points", "AwayLast5Points",
    "HomeLast5HomePoints", "AwayLast5AwayPoints",
    "HomeWinRateLastHome", "AwayWinRateLastAway",
    "HomeAvgGoalsScoredLast5", "HomeAvgGoalsConcededLast5",
    "AwayAvgGoalsScoredLast5", "AwayAvgGoalsConcededLast5",
    "HomeAvgShotsLast5", "AwayAvgShotsLast5",
    "HomeAvgShotsOnTargetLast5", "AwayAvgShotsOnTargetLast5",
    "HomeAvgShotsConcededLast5", "AwayAvgShotsConcededLast5",
    "HomeDaysRest", "AwayDaysRest",
    "H2HHomeTeamWinRate", "H2HAwayTeamWinRate",
    "H2HDrawRate", "H2HMatchesPlayed",
    "HomeAvgSecondHalfGoalsScoredLast5", "HomeAvgSecondHalfGoalsConcededLast5",
    "AwayAvgSecondHalfGoalsScoredLast5", "AwayAvgSecondHalfGoalsConcededLast5",
    "HomeElo", "AwayElo", "EloDifference",
    "HomeSquadValueEur", "AwaySquadValueEur",
    "HomeTablePosition", "AwayTablePosition", "TablePointsGap",
    "DayOfWeek", "IsWeekend", "KickoffHour",
    "HomePlayedEuropeMidweek", "AwayPlayedEuropeMidweek",
    "HomeManagerExperience", "AwayManagerExperience",
    "HomeRecentAvgPlacement", "AwayRecentAvgPlacement",
]

DEFAULT_REST_DAYS = 7

FEATURE_COLUMNS = [
    "HomeLast5Points", "AwayLast5Points",
    "HomeLast5HomePoints", "AwayLast5AwayPoints",
    "HomeWinRateLastHome", "AwayWinRateLastAway",
    "HomeAvgGoalsScoredLast5", "HomeAvgGoalsConcededLast5",
    "AwayAvgGoalsScoredLast5", "AwayAvgGoalsConcededLast5",
    "HomeAvgShotsLast5", "AwayAvgShotsLast5",
    "HomeAvgShotsOnTargetLast5", "AwayAvgShotsOnTargetLast5",
    "HomeAvgShotsConcededLast5", "AwayAvgShotsConcededLast5",
    "HomeDaysRest", "AwayDaysRest",
    "H2HHomeTeamWinRate", "H2HAwayTeamWinRate",
    "H2HDrawRate", "H2HMatchesPlayed",
    "HomeAvgSecondHalfGoalsScoredLast5", "HomeAvgSecondHalfGoalsConcededLast5",
    "AwayAvgSecondHalfGoalsScoredLast5", "AwayAvgSecondHalfGoalsConcededLast5",
    "HomeElo", "AwayElo", "EloDifference",
    "HomeSquadValueEur", "AwaySquadValueEur",
    "HomeTablePosition", "AwayTablePosition", "TablePointsGap",
    "DayOfWeek", "IsWeekend", "KickoffHour",
    "HomePlayedEuropeMidweek", "AwayPlayedEuropeMidweek",
    "HomeManagerExperience", "AwayManagerExperience",
    "HomeRecentAvgPlacement", "AwayRecentAvgPlacement",
]

def scoreline_grid(home_lambda, away_lambda, max_goals=MAX_GOALS):
    home_probs = poisson.pmf(np.arange(max_goals + 1), home_lambda)
    away_probs = poisson.pmf(np.arange(max_goals + 1), away_lambda)
    return np.outer(home_probs, away_probs)


def _appearance(points, goals_for, goals_against, shots_for, shots_against, shots_on_target_for, second_half_scored, second_half_conceded):
    return {
        "points": points,
        "goals_for": goals_for, "goals_against": goals_against,
        "shots_for": shots_for, "shots_against": shots_against,
        "shots_on_target_for": shots_on_target_for,
        "second_half_scored": second_half_scored,
        "second_half_conceded": second_half_conceded,
    }


def build_table(matches):

    table = {}

    def ensure(team):
        if team not in table:
            table[team] = {"Played": 0, "W": 0, "D": 0, "L": 0, "GF": 0, "GA": 0, "Points": 0}

    for home_team, away_team, home_goals, away_goals in matches:
        ensure(home_team)
        ensure(away_team)

        table[home_team]["Played"] += 1
        table[away_team]["Played"] += 1
        table[home_team]["GF"] += home_goals
        table[home_team]["GA"] += away_goals
        table[away_team]["GF"] += away_goals
        table[away_team]["GA"] += home_goals

        if home_goals > away_goals:
            table[home_team]["W"] += 1
            table[home_team]["Points"] += 3
            table[away_team]["L"] += 1
        elif home_goals < away_goals:
            table[away_team]["W"] += 1
            table[away_team]["Points"] += 3
            table[home_team]["L"] += 1
        else:
            table[home_team]["D"] += 1
            table[away_team]["D"] += 1
            table[home_team]["Points"] += 1
            table[away_team]["Points"] += 1

    rows = []
    for team, stats in table.items():
        rows.append({
            "Team": team, "Played": stats["Played"], "W": stats["W"], "D": stats["D"],
            "L": stats["L"], "GF": stats["GF"], "GA": stats["GA"],
            "GD": stats["GF"] - stats["GA"], "Points": stats["Points"],
        })

    table_df = pd.DataFrame(rows).sort_values(
        by=["Points", "GD", "GF"], ascending=False
    ).reset_index(drop=True)
    table_df.index = table_df.index + 1
    return table_df



def make_simulator(train, fixtures, real_n=0):
    """
    Fits the goal/shot/half-time models on `train` (real history) and
    returns run_one_simulation(seed). `fixtures` is the season in date
    order; its first `real_n` rows are real played matches (replayed with
    their true results), the rest are simulated.
    """

    # Squad value is genuinely known before a ball is kicked -- unlike
    # Elo/form, it isn't a result of anything happening DURING the
    # season being blindly forecast, so looking it up directly from
    # the real season data isn't cheating the same way reading real
    # results would be.
    team_squad_value = {}
    for _, row in fixtures.iterrows():
        team_squad_value[row["HomeTeam"]] = row["HomeSquadValueEur"]
        team_squad_value[row["AwayTeam"]] = row["AwaySquadValueEur"]

    # Same reasoning: the real fixture list (dates, scheduled kickoff
    # times) and which teams have midweek European football that week
    # are genuinely known in advance for a real season -- exogenous
    # facts, not something that needs to be blindly simulated the way
    # form/Elo/goals do. Keyed by the match itself, not by team, since
    # these vary match to match rather than being a per-team constant.
    #
    # Manager career experience and recent-seasons placement belong
    # here too, for the same reason: both are real, already-known
    # facts at the moment each fixture is played -- who's actually
    # managing a club, and how many EPL matches they've taken charge
    # of in their career so far, is public knowledge before a ball is
    # kicked (not a result of anything happening during the season
    # being blindly forecast), and recent placement only looks at
    # PRIOR completed seasons, never the one being simulated. Manager
    # experience specifically climbs match by match through a real
    # season, so it's keyed per fixture (not per team, like squad
    # value) to avoid freezing every match at one season-end value.
    match_schedule = {}
    for _, row in fixtures.iterrows():
        match_key = (row["HomeTeam"], row["AwayTeam"], row["Date"])
        match_schedule[match_key] = {
            "DayOfWeek": row["DayOfWeek"],
            "IsWeekend": row["IsWeekend"],
            "KickoffHour": row["KickoffHour"],
            "HomePlayedEuropeMidweek": row["HomePlayedEuropeMidweek"],
            "AwayPlayedEuropeMidweek": row["AwayPlayedEuropeMidweek"],
            "HomeManagerExperience": row["HomeManagerExperience"],
            "AwayManagerExperience": row["AwayManagerExperience"],
            "HomeRecentAvgPlacement": row["HomeRecentAvgPlacement"],
            "AwayRecentAvgPlacement": row["AwayRecentAvgPlacement"],
        }

    X_train_raw = train[FEATURE_COLUMNS].fillna(0)
    feature_means = X_train_raw.mean()
    feature_stds = X_train_raw.std().replace(0, 1)
    X_train = (X_train_raw - feature_means) / feature_stds

    home_goal_model = PoissonRegressor(max_iter=1000).fit(X_train, train["FTHG"])
    away_goal_model = PoissonRegressor(max_iter=1000).fit(X_train, train["FTAG"])
    home_shots_model = PoissonRegressor(max_iter=1000).fit(X_train, train["HS"])
    away_shots_model = PoissonRegressor(max_iter=1000).fit(X_train, train["AS"])
    home_shots_on_target_model = PoissonRegressor(max_iter=1000).fit(X_train, train["HST"])
    away_shots_on_target_model = PoissonRegressor(max_iter=1000).fit(X_train, train["AST"])
    home_ht_goals_model = PoissonRegressor(max_iter=1000).fit(X_train, train["HTHG"])
    away_ht_goals_model = PoissonRegressor(max_iter=1000).fit(X_train, train["HTAG"])

    def run_one_simulation(seed):
        """
        Runs this season once, start to finish, with its own fresh
        state and its own random draws -- completely independent of
        any other call. Returns the list of predicted (home, away,
        home_goals, away_goals) results.
        """

        rng = np.random.default_rng(seed)

        def sample_scoreline(grid):
            flat_probs = grid.flatten()
            flat_probs = flat_probs / flat_probs.sum()
            choice = rng.choice(len(flat_probs), p=flat_probs)
            h, a = np.unravel_index(choice, grid.shape)
            return int(h), int(a)

        def sample_count(lam, cap):
            counts = np.arange(cap + 1)
            probs = poisson.pmf(counts, lam)
            probs = probs / probs.sum()
            return int(rng.choice(counts, p=probs))

        # ---- fresh state, seeded from real history before season_start ----

        recent_overall = defaultdict(lambda: deque(maxlen=5))
        recent_home_points = defaultdict(lambda: deque(maxlen=5))
        recent_away_points = defaultdict(lambda: deque(maxlen=5))
        winrate_home = defaultdict(lambda: deque(maxlen=10))
        winrate_away = defaultdict(lambda: deque(maxlen=10))
        last_match_date = {}
        h2h_history = defaultdict(list)

        # Table position resets every season boundary (same as the
        # real table_position.py) -- starts empty here since fixtures
        # is always exactly one season, no carry-over from train needed.
        season_table = defaultdict(lambda: {"Points": 0, "GF": 0, "GA": 0})

        def table_position(team):
            ranking = sorted(
                season_table.items(),
                key=lambda kv: (kv[1]["Points"], kv[1]["GF"] - kv[1]["GA"], kv[1]["GF"]),
                reverse=True
            )
            positions = {name: rank + 1 for rank, (name, _) in enumerate(ranking)}
            return positions.get(team, len(season_table) + 1)

        # Elo seeded directly from the real, already-computed values --
        # elo.py already did the sophisticated version (dual-track, shot-
        # blended, multi-signal expectation) for every real match. Each
        # team starts this simulation at their true end-of-last-season
        # rating, not a flat 1500 -- exactly mirroring real final
        # standing, same as every other season transition already
        # reverts 33% toward the mean rather than wiping the slate clean.
        home_elo = {}
        away_elo = {}

        # Elo starting point: blended across each team's last 3 seasons,
        # weighted 50/30/20 toward the most recent -- not just last
        # season alone. One bad (or fluke-great) season shouldn't define
        # a team's whole starting point; a team's true level is usually
        # closer to its recent multi-year form than its single most
        # recent data point. season_end_home_elo/away_elo track each
        # team's FINAL rating in every season they appear in (the loop
        # below keeps overwriting within a season, so by the time a
        # season ends, whatever's stored is that season's closing value).
        season_end_home_elo = defaultdict(dict)
        season_end_away_elo = defaultdict(dict)

        for i in range(len(train)):
            row = train.iloc[i]
            home, away, date = row["HomeTeam"], row["AwayTeam"], row["Date"]
            season = get_season(date)

            recent_overall[home].append(_appearance(
                row["HomePoints"], row["FTHG"], row["FTAG"],
                row["HS"], row["AS"], row["HST"],
                row["FTHG"] - row["HTHG"], row["FTAG"] - row["HTAG"]
            ))
            recent_overall[away].append(_appearance(
                row["AwayPoints"], row["FTAG"], row["FTHG"],
                row["AS"], row["HS"], row["AST"],
                row["FTAG"] - row["HTAG"], row["FTHG"] - row["HTHG"]
            ))
            recent_home_points[home].append(row["HomePoints"])
            recent_away_points[away].append(row["AwayPoints"])
            winrate_home[home].append(1 if row["FTR"] == "H" else 0)
            winrate_away[away].append(1 if row["FTR"] == "A" else 0)

            last_match_date[home] = date
            last_match_date[away] = date

            winner = home if row["FTR"] == "H" else (away if row["FTR"] == "A" else None)
            h2h_history[matchup_key(home, away)].append(winner)

            season_end_home_elo[home][season] = row["HomeElo"]
            season_end_away_elo[away][season] = row["AwayElo"]

        RECENCY_WEIGHTS = [0.5, 0.3, 0.2]   # most recent season first

        def blended_elo(season_end_elo, team):
            if team not in season_end_elo or not season_end_elo[team]:
                return INITIAL_ELO

            seasons_available = sorted(season_end_elo[team].keys(), reverse=True)[:3]
            values = [season_end_elo[team][s] for s in seasons_available]
            weights = RECENCY_WEIGHTS[:len(values)]
            weights = [w / sum(weights) for w in weights]   # renormalize if <3 seasons on record

            return sum(v * w for v, w in zip(values, weights))

        for team in set(season_end_home_elo) | set(season_end_away_elo):
            home_elo[team] = blended_elo(season_end_home_elo, team)
            away_elo[team] = blended_elo(season_end_away_elo, team)

        def build_feature_row(home, away, date):

            home_recent = recent_overall.get(home, deque())
            away_recent = recent_overall.get(away, deque())

            def col(recent, key):
                values = [a[key] for a in recent]
                return np.mean(values) if values else 0.0

            def total(recent, key):
                return sum(a[key] for a in recent)

            home_rating = home_elo.get(home, INITIAL_ELO)
            away_rating = away_elo.get(away, INITIAL_ELO)

            key = matchup_key(home, away)
            past = h2h_history.get(key, [])
            n = len(past)
            if n > 0:
                h2h_home_rate = sum(1 for w in past if w == home) / n
                h2h_away_rate = sum(1 for w in past if w == away) / n
                h2h_draw_rate = sum(1 for w in past if w is None) / n
            else:
                h2h_home_rate, h2h_away_rate, h2h_draw_rate = 0.5, 0.5, 0.0

            home_last_date = last_match_date.get(home)
            away_last_date = last_match_date.get(away)
            home_rest = (date - home_last_date).days if home_last_date is not None else DEFAULT_REST_DAYS
            away_rest = (date - away_last_date).days if away_last_date is not None else DEFAULT_REST_DAYS

            return pd.Series({
                "HomeLast5Points": total(home_recent, "points"),
                "AwayLast5Points": total(away_recent, "points"),
                "HomeLast5HomePoints": sum(recent_home_points.get(home, [])),
                "AwayLast5AwayPoints": sum(recent_away_points.get(away, [])),
                "HomeWinRateLastHome": (
                    np.mean(winrate_home[home]) if winrate_home.get(home) else 0.5
                ),
                "AwayWinRateLastAway": (
                    np.mean(winrate_away[away]) if winrate_away.get(away) else 0.5
                ),
                "HomeAvgGoalsScoredLast5": col(home_recent, "goals_for"),
                "HomeAvgGoalsConcededLast5": col(home_recent, "goals_against"),
                "AwayAvgGoalsScoredLast5": col(away_recent, "goals_for"),
                "AwayAvgGoalsConcededLast5": col(away_recent, "goals_against"),
                "HomeAvgShotsLast5": col(home_recent, "shots_for"),
                "AwayAvgShotsLast5": col(away_recent, "shots_for"),
                "HomeAvgShotsOnTargetLast5": col(home_recent, "shots_on_target_for"),
                "AwayAvgShotsOnTargetLast5": col(away_recent, "shots_on_target_for"),
                "HomeAvgShotsConcededLast5": col(home_recent, "shots_against"),
                "AwayAvgShotsConcededLast5": col(away_recent, "shots_against"),
                "HomeDaysRest": home_rest,
                "AwayDaysRest": away_rest,
                "H2HHomeTeamWinRate": h2h_home_rate,
                "H2HAwayTeamWinRate": h2h_away_rate,
                "H2HDrawRate": h2h_draw_rate,
                "H2HMatchesPlayed": n,
                "HomeAvgSecondHalfGoalsScoredLast5": col(home_recent, "second_half_scored"),
                "HomeAvgSecondHalfGoalsConcededLast5": col(home_recent, "second_half_conceded"),
                "AwayAvgSecondHalfGoalsScoredLast5": col(away_recent, "second_half_scored"),
                "AwayAvgSecondHalfGoalsConcededLast5": col(away_recent, "second_half_conceded"),
                "HomeElo": home_rating,
                "AwayElo": away_rating,
                "EloDifference": home_rating - away_rating,
                "HomeSquadValueEur": team_squad_value.get(home, 0.0),
                "AwaySquadValueEur": team_squad_value.get(away, 0.0),
                "HomeTablePosition": table_position(home),
                "AwayTablePosition": table_position(away),
                "TablePointsGap": season_table[home]["Points"] - season_table[away]["Points"],
                "DayOfWeek": match_schedule[(home, away, date)]["DayOfWeek"],
                "IsWeekend": match_schedule[(home, away, date)]["IsWeekend"],
                "KickoffHour": match_schedule[(home, away, date)]["KickoffHour"],
                "HomePlayedEuropeMidweek": match_schedule[(home, away, date)]["HomePlayedEuropeMidweek"],
                "AwayPlayedEuropeMidweek": match_schedule[(home, away, date)]["AwayPlayedEuropeMidweek"],
                "HomeManagerExperience": match_schedule[(home, away, date)]["HomeManagerExperience"],
                "AwayManagerExperience": match_schedule[(home, away, date)]["AwayManagerExperience"],
                "HomeRecentAvgPlacement": match_schedule[(home, away, date)]["HomeRecentAvgPlacement"],
                "AwayRecentAvgPlacement": match_schedule[(home, away, date)]["AwayRecentAvgPlacement"],
            })[FEATURE_COLUMNS]

        season_state = {"current": get_season(train["Date"].iloc[-1])}

        def update_state_with_prediction(
            home, away, date,
            home_goals, away_goals,
            home_shots, away_shots, home_sot, away_sot,
            home_ht_goals, away_ht_goals
        ):

            home_pts = 3 if home_goals > away_goals else (1 if home_goals == away_goals else 0)
            away_pts = 3 if away_goals > home_goals else (1 if away_goals == home_goals else 0)

            recent_overall[home].append(_appearance(
                home_pts, home_goals, away_goals,
                home_shots, away_shots, home_sot,
                home_goals - home_ht_goals, away_goals - away_ht_goals
            ))
            recent_overall[away].append(_appearance(
                away_pts, away_goals, home_goals,
                away_shots, home_shots, away_sot,
                away_goals - away_ht_goals, home_goals - home_ht_goals
            ))
            recent_home_points[home].append(home_pts)
            recent_away_points[away].append(away_pts)
            winrate_home[home].append(1 if home_goals > away_goals else 0)
            winrate_away[away].append(1 if away_goals > home_goals else 0)

            last_match_date[home] = date
            last_match_date[away] = date

            winner = home if home_goals > away_goals else (away if away_goals > home_goals else None)
            h2h_history[matchup_key(home, away)].append(winner)

            season_table[home]["GF"] += home_goals
            season_table[home]["GA"] += away_goals
            season_table[away]["GF"] += away_goals
            season_table[away]["GA"] += home_goals
            season_table[home]["Points"] += home_pts
            season_table[away]["Points"] += away_pts

            season = get_season(date)
            if season != season_state["current"]:
                for team in home_elo:
                    home_elo[team] += REVERSION * (INITIAL_ELO - home_elo[team])
                for team in away_elo:
                    away_elo[team] += REVERSION * (INITIAL_ELO - away_elo[team])
                season_state["current"] = season

            home_rating = home_elo.get(home, INITIAL_ELO)
            away_rating = away_elo.get(away, INITIAL_ELO)

            expected_home = expected_score(home_rating, away_rating)
            expected_away = 1 - expected_home

            actual_home = 1 if home_goals > away_goals else (0.5 if home_goals == away_goals else 0)
            actual_away = 1 - actual_home

            k = BASE_K * margin_multiplier(home_goals - away_goals)

            home_elo[home] = home_rating + k * (actual_home - expected_home)
            away_elo[away] = away_rating + k * (actual_away - expected_away)

        predicted_matches = []

        for i in range(len(fixtures)):
            row = fixtures.iloc[i]
            home, away, date = row["HomeTeam"], row["AwayTeam"], row["Date"]

            if i < real_n:
                # A match that has really been played: its REAL result
                # (goals, shots, half-time) updates Elo/form/H2H/table
                # exactly as a simulated one would, so the simulation
                # carries on from the true current state. Nothing is
                # predicted or sampled for it.
                predicted_matches.append((home, away, int(row["FTHG"]), int(row["FTAG"])))
                update_state_with_prediction(
                    home, away, date, int(row["FTHG"]), int(row["FTAG"]),
                    row["HS"], row["AS"], row["HST"], row["AST"],
                    int(row["HTHG"]), int(row["HTAG"])
                )
                continue

            features = build_feature_row(home, away, date)
            scaled = ((features - feature_means) / feature_stds).to_frame().T

            home_lambda = home_goal_model.predict(scaled)[0]
            away_lambda = away_goal_model.predict(scaled)[0]
            pred_home_goals, pred_away_goals = sample_scoreline(
                scoreline_grid(home_lambda, away_lambda)
            )

            pred_home_shots = sample_count(home_shots_model.predict(scaled)[0], MAX_SHOTS)
            pred_away_shots = sample_count(away_shots_model.predict(scaled)[0], MAX_SHOTS)
            pred_home_sot = min(sample_count(home_shots_on_target_model.predict(scaled)[0], MAX_SHOTS), pred_home_shots)
            pred_away_sot = min(sample_count(away_shots_on_target_model.predict(scaled)[0], MAX_SHOTS), pred_away_shots)
            pred_home_ht = min(sample_count(home_ht_goals_model.predict(scaled)[0], MAX_GOALS), pred_home_goals)
            pred_away_ht = min(sample_count(away_ht_goals_model.predict(scaled)[0], MAX_GOALS), pred_away_goals)

            predicted_matches.append((home, away, pred_home_goals, pred_away_goals))
            update_state_with_prediction(
                home, away, date, pred_home_goals, pred_away_goals,
                pred_home_shots, pred_away_shots, pred_home_sot, pred_away_sot,
                pred_home_ht, pred_away_ht
            )

        return predicted_matches


    return run_one_simulation


def run_many(run_fn, seeds, workers=8):
    """Runs independent simulations in parallel (forked processes) and returns results in seed order."""
    ctx = mp.get_context("fork")
    chunks = [seeds[i::workers] for i in range(workers)]

    def work(conn, chunk):
        conn.send([(s, run_fn(s)) for s in chunk])
        conn.close()

    procs = []
    for chunk in chunks:
        if not chunk:
            continue
        parent, child = ctx.Pipe()
        p = ctx.Process(target=work, args=(child, chunk))
        p.start()
        procs.append((p, parent))
    out = {}
    for p, parent in procs:
        for seed, result in parent.recv():
            out[seed] = result
        p.join()
    return [out[s] for s in seeds]

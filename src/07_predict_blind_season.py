import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from collections import deque, defaultdict

from scipy.stats import poisson
from sklearn.linear_model import PoissonRegressor

from config import TRAIN_TEST_SPLIT_DATE
from features.elo import expected_score, margin_multiplier, get_season, INITIAL_ELO, BASE_K, REVERSION
from features.head_to_head import matchup_key

# ---------------------------------------------------------------------
# 06_predict_season_table.py isn't a blind forecast -- every match's
# pre-match features (Elo, form, goals, shots) are built from that
# season's own REAL results, because they already happened by the time
# this project runs. This script is the honest version: for whichever
# season it's forecasting, it knows real history only through the
# season before. Every team's starting Elo is seeded from their REAL
# rating, blended across their last 3 seasons (weighted 50/30/20
# toward the most recent) rather than just their single most recent
# season -- a real bad (or fluke-great) season shouldn't define a
# team's whole starting point on its own. From there, every match in
# the season being forecast is predicted from the model's own prior
# predictions fed forward -- Elo/form/goals/shots/half-time/H2H all
# update on predictions, never on that season's real results.
#
# Two seasons are forecast this way (2024-25 and 2025-26 -- see
# config.py), and each is re-anchored on real history up through its
# OWN start: the 2025-26 run trains on real data through 2024-25
# (which had genuinely already happened by August 2025), not on the
# 2024-25 run's own predictions. Chaining two blind seasons back to
# back on one frozen prediction thread isn't how anyone would actually
# use this -- every real August, last season's real table is already
# known before the new one kicks off.
#
# A single random simulation has real sampling variance -- one team
# can go on a lucky predicted streak early and have it snowball
# through the feedback loop, which isn't a real signal, just noise
# from that one draw. So each season runs many times with different
# random draws and averages the results (a proper Monte Carlo), which
# is what actual season-simulation tools do instead of trusting one
# run.
#
# Disclosed simplifications:
#   - Shots-on-target and half-time goals are predicted independently
#     of full-time goals/shots, clamped so a match can't have more
#     shots-on-target than shots, or more half-time goals than
#     full-time goals.
#   - Elo here uses a simpler expectation (plain rating comparison, no
#     shot-blend, no the multi-signal expectation model from elo.py)
#     since those need real shot data that doesn't exist for predicted
#     future matches.
#   - Nothing here can predict a real season-over-season swing driven
#     by new signings, a manager change, etc. -- it only knows what
#     history says, same as any model built this way.
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
    "HomeTeamOverallElo", "AwayTeamOverallElo", "OverallEloDifference",
    "HomeSquadValueEur", "AwaySquadValueEur",
]

DEFAULT_REST_DAYS = 7

# ---------------------------------------------------------------------
# Load once; everything else (which rows count as "real history" vs.
# "the season being blindly forecast") is decided per season below.
# ---------------------------------------------------------------------

df = pd.read_csv("02_processed_data/E0_features.csv")
df["Date"] = pd.to_datetime(df["Date"], format="mixed")
df["SeasonYear"] = df["Date"].apply(get_season)

TEST_SEASON_YEARS = sorted(
    df.loc[df["Date"] >= TRAIN_TEST_SPLIT_DATE, "SeasonYear"].unique()
)


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


def simulate_season(season_year):
    """
    Blindly forecasts one full season, re-anchored on every real match
    known before it starts: train = every real match before
    {season_year}-08-01, fixtures = that season's matches only.
    Retraining per season (rather than once) is what makes each
    season's forecast use the most real data honestly available to
    it -- 2025-26's run gets a whole extra real season (2024-25) that
    2024-25's own run never had.
    """

    season_start = f"{season_year}-08-01"
    season_label = f"{season_year}-{str(season_year + 1)[-2:]}"

    train = df[df["Date"] < season_start].reset_index(drop=True)
    fixtures = df[df["SeasonYear"] == season_year].sort_values("Date").reset_index(drop=True)

    # Squad value is genuinely known before a ball is kicked -- unlike
    # Elo/form, it isn't a result of anything happening DURING the
    # season being blindly forecast, so looking it up directly from
    # the real season data isn't cheating the same way reading real
    # results would be.
    team_squad_value = {}
    for _, row in fixtures.iterrows():
        team_squad_value[row["HomeTeam"]] = row["HomeSquadValueEur"]
        team_squad_value[row["AwayTeam"]] = row["AwaySquadValueEur"]

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
            home_overall_elo = (home_elo.get(home, INITIAL_ELO) + away_elo.get(home, INITIAL_ELO)) / 2
            away_overall_elo = (home_elo.get(away, INITIAL_ELO) + away_elo.get(away, INITIAL_ELO)) / 2

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
                "HomeTeamOverallElo": home_overall_elo,
                "AwayTeamOverallElo": away_overall_elo,
                "OverallEloDifference": home_overall_elo - away_overall_elo,
                "HomeSquadValueEur": team_squad_value.get(home, 0.0),
                "AwaySquadValueEur": team_squad_value.get(away, 0.0),
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

    # -------------------------------------------------------------
    # Run this season N times, average each team's Points/GF/GA
    # -------------------------------------------------------------

    print(f"Simulating the {season_label} season {N_SIMULATIONS} times (different random draws each run)...")

    per_team_points = defaultdict(list)
    per_team_gf = defaultdict(list)
    per_team_ga = defaultdict(list)
    per_team_position = defaultdict(list)

    for run in range(N_SIMULATIONS):
        matches = run_one_simulation(seed=run)
        run_table = build_table(matches)

        for pos, row in run_table.iterrows():
            per_team_points[row["Team"]].append(row["Points"])
            per_team_gf[row["Team"]].append(row["GF"])
            per_team_ga[row["Team"]].append(row["GA"])
            per_team_position[row["Team"]].append(pos)

    avg_rows = []
    for team in per_team_points:
        avg_gf = np.mean(per_team_gf[team])
        avg_ga = np.mean(per_team_ga[team])
        avg_rows.append({
            "Team": team,
            "Avg Points": round(np.mean(per_team_points[team]), 1),
            "Avg GF": round(avg_gf, 1),
            "Avg GA": round(avg_ga, 1),
            "Avg GD": round(avg_gf - avg_ga, 1),
            "Avg Position": round(np.mean(per_team_position[team]), 1),
            "Position Std Dev": round(np.std(per_team_position[team]), 1),
        })

    predicted_table = pd.DataFrame(avg_rows).sort_values(
        by="Avg Points", ascending=False
    ).reset_index(drop=True)
    predicted_table.index = predicted_table.index + 1

    actual_matches = list(zip(
        fixtures["HomeTeam"], fixtures["AwayTeam"], fixtures["FTHG"], fixtures["FTAG"]
    ))
    actual_table = build_table(actual_matches)

    print()
    print("=" * 100)
    print(f"PREDICTED TABLE -- {season_label} (averaged across {N_SIMULATIONS} blind simulations)".center(100))
    print("=" * 100)
    print(predicted_table.to_string())

    print()
    print("=" * 78)
    print(f"ACTUAL TABLE -- {season_label}".center(78))
    print("=" * 78)
    print(actual_table.to_string())

    actual_position = {team: pos for pos, team in enumerate(actual_table["Team"], start=1)}
    predicted_position = {team: pos for pos, team in enumerate(predicted_table["Team"], start=1)}

    comparison_rows = []
    for team, real_pos in actual_position.items():
        pred_pos = predicted_position.get(team)
        std_dev = round(np.std(per_team_position[team]), 1) if team in per_team_position else None
        comparison_rows.append({
            "Team": team, "Actual Position": real_pos, "Predicted Position": pred_pos,
            "Position Diff": (pred_pos - real_pos) if pred_pos is not None else None,
            "Run-to-Run Std Dev": std_dev,
        })

    comparison_df = pd.DataFrame(comparison_rows).sort_values("Actual Position")

    print()
    print("=" * 100)
    print(f"POSITION COMPARISON -- {season_label} (sorted by real final standing)".center(100))
    print("=" * 100)
    print(comparison_df.to_string(index=False))

    mean_abs_error = comparison_df["Position Diff"].abs().mean()
    print(f"\nMean absolute position error ({season_label}, averaged over {N_SIMULATIONS} runs): {mean_abs_error:.1f} places\n")

    return season_label, predicted_table, actual_table


season_results = [simulate_season(year) for year in TEST_SEASON_YEARS]


def render_table(ax, table_df, title, cols):
    ax.axis("off")
    ax.set_title(title, fontsize=13, fontweight="bold", pad=12)

    display_df = table_df[cols].reset_index().rename(columns={"index": "Pos"})
    table = ax.table(
        cellText=display_df.values.tolist(),
        colLabels=display_df.columns.tolist(),
        loc="center", cellLoc="center"
    )
    table.auto_set_font_size(False)
    table.set_fontsize(8)
    table.scale(1, 1.35)

    n_rows = len(display_df)
    for row in range(n_rows + 1):
        for col in range(len(display_df.columns)):
            cell = table[row, col]
            if row == 0:
                cell.set_text_props(fontweight="bold")
                cell.set_facecolor("#dddddd")
                continue
            if row <= 4:
                cell.set_facecolor("#d4edda")
            elif row >= n_rows - 2:
                cell.set_facecolor("#f8d7da")
            elif row % 2 == 0:
                cell.set_facecolor("#f5f5f5")


n_seasons = len(season_results)
fig, axes = plt.subplots(n_seasons, 2, figsize=(19, 9 * n_seasons))

if n_seasons == 1:
    axes = axes.reshape(1, 2)

for row, (season_label, predicted_table, actual_table) in enumerate(season_results):
    render_table(
        axes[row, 0], predicted_table,
        f"Predicted Table -- {season_label} (avg of {N_SIMULATIONS} blind runs)",
        ["Team", "Avg Points", "Avg GD", "Position Std Dev"]
    )
    render_table(
        axes[row, 1], actual_table,
        f"Actual Table -- {season_label}",
        ["Team", "Played", "W", "D", "L", "GD", "Points"]
    )

plt.tight_layout()
plt.show()

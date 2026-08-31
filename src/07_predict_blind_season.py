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
# pre-match features (Elo, form, goals, shots) are built from the REAL
# 2025-26 results, because they already happened by the time this
# project runs. That's a fair backtest, but it's not "predict the
# whole season before a ball is kicked."
#
# This script is that harder, honest version. It knows real history
# only through 2024-25. For every 2025-26 match, in fixture order, it
# predicts a scoreline AND shots AND a half-time split -- then treats
# every one of those predictions as if it were the real result,
# updating Elo/form/goals/shots/half-time/H2H with its own guesses,
# before moving to the next match. Matchday 5 is built entirely from
# matchdays 1-4's PREDICTED stats, never the real ones. No 2025-26
# result is ever read, only the fixture list (who plays whom, when --
# known in advance, same as a real calendar).
#
# Disclosed simplifications:
#   - Shots-on-target and half-time goals are predicted independently
#     of full-time goals/shots, so they're clamped so a match can't
#     have more shots-on-target than shots, or more half-time goals
#     than full-time goals -- a real (if minor) inconsistency of
#     predicting related quantities separately rather than jointly.
#   - Elo here uses a simpler expectation (plain rating comparison,
#     no shot-blend, no the multi-signal expectation model from
#     elo.py) -- those refinements were fit on real shot data, and
#     re-deriving them inside a live simulation loop is a separate,
#     bigger job than this script takes on.
# ---------------------------------------------------------------------

MAX_GOALS = 8
MAX_SHOTS = 30

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
]

DEFAULT_REST_DAYS = 7

# ---------------------------------------------------------------------
# Load + train every regressor on real data only. Two for the
# scoreline (same as 05/06), six more so shots, shots-on-target, and
# the half-time split can be predicted forward too instead of frozen.
# ---------------------------------------------------------------------

df = pd.read_csv("02_processed_data/E0_features.csv")
df["Date"] = pd.to_datetime(df["Date"], format="mixed")

train = df[df["Date"] < TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)
fixtures = df[df["Date"] >= TRAIN_TEST_SPLIT_DATE].sort_values("Date").reset_index(drop=True)

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


def scoreline_grid(home_lambda, away_lambda, max_goals=MAX_GOALS):
    home_probs = poisson.pmf(np.arange(max_goals + 1), home_lambda)
    away_probs = poisson.pmf(np.arange(max_goals + 1), away_lambda)
    return np.outer(home_probs, away_probs)


RNG = np.random.default_rng(42)


def sample_scoreline(grid):
    """
    Draws a scoreline from the actual probability distribution instead
    of always taking the single most likely one. Deterministically
    picking the mode every match sounds "safest", but it isn't
    realistic -- for two closely-matched teams the single most
    probable exact score is almost always something boring like 1-1,
    even though real seasons are full of blowouts that are each
    individually less likely than that. Worse, in a simulation where
    predictions feed forward, always picking the safe outcome creates
    a feedback loop: two teams that draw once stay close in rating,
    which predicts another draw next time, which keeps them close
    again -- nothing ever breaks the cycle. Sampling does.
    """

    flat_probs = grid.flatten()
    flat_probs = flat_probs / flat_probs.sum()   # grid is truncated at MAX_GOALS, renormalize
    choice = RNG.choice(len(flat_probs), p=flat_probs)
    h, a = np.unravel_index(choice, grid.shape)
    return int(h), int(a)


def sample_count(lam, cap):
    """Same idea as sample_scoreline, for a single Poisson(lam) count."""
    counts = np.arange(cap + 1)
    probs = poisson.pmf(counts, lam)
    probs = probs / probs.sum()
    return int(RNG.choice(counts, p=probs))


# ---------------------------------------------------------------------
# Seed simulation state from real history (2014-15 through 2024-25).
#
# One deque per team holds everything about their last 5 appearances
# (any venue) needed downstream: points, goals scored/conceded, shots
# for/against, shots-on-target for, second-half goals scored/conceded.
# Same "last 5, any venue" window every Goals/Shots/Half-Time feature
# in the real pipeline already uses -- this just tracks it
# incrementally instead of recomputing it from scratch every row.
# ---------------------------------------------------------------------

recent_overall = defaultdict(lambda: deque(maxlen=5))
recent_home_points = defaultdict(lambda: deque(maxlen=5))
recent_away_points = defaultdict(lambda: deque(maxlen=5))
winrate_home = defaultdict(lambda: deque(maxlen=10))
winrate_away = defaultdict(lambda: deque(maxlen=10))
last_match_date = {}
h2h_history = defaultdict(list)

# Elo: seeded directly from the real, already-computed values --
# 01_load_data.py's elo.py already did the sophisticated version
# (dual-track, shot-blended, multi-signal expectation) for every real
# match. No need to recompute any of that; just read each team's most
# recent real rating as the simulation's starting point.
home_elo = {}
away_elo = {}


def _appearance(points, goals_for, goals_against, shots_for, shots_against, shots_on_target_for, second_half_scored, second_half_conceded):
    return {
        "points": points,
        "goals_for": goals_for, "goals_against": goals_against,
        "shots_for": shots_for, "shots_against": shots_against,
        "shots_on_target_for": shots_on_target_for,
        "second_half_scored": second_half_scored,
        "second_half_conceded": second_half_conceded,
    }


for i in range(len(train)):
    row = train.iloc[i]
    home, away, date = row["HomeTeam"], row["AwayTeam"], row["Date"]

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

    home_elo[home] = row["HomeElo"]
    away_elo[away] = row["AwayElo"]

print(f"Seeded from real history through {train['Date'].max().date()}")
print(f"Blind-predicting {len(fixtures)} matches from "
      f"{fixtures['Date'].min().date()} to {fixtures['Date'].max().date()}\n")


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
    })[FEATURE_COLUMNS]


def update_state_with_prediction(
    home, away, date,
    home_goals, away_goals,
    home_shots, away_shots, home_shots_on_target, away_shots_on_target,
    home_ht_goals, away_ht_goals
):

    home_pts = 3 if home_goals > away_goals else (1 if home_goals == away_goals else 0)
    away_pts = 3 if away_goals > home_goals else (1 if away_goals == home_goals else 0)

    recent_overall[home].append(_appearance(
        home_pts, home_goals, away_goals,
        home_shots, away_shots, home_shots_on_target,
        home_goals - home_ht_goals, away_goals - away_ht_goals
    ))
    recent_overall[away].append(_appearance(
        away_pts, away_goals, home_goals,
        away_shots, home_shots, away_shots_on_target,
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

    # Season reversion, same rule as elo.py -- applies once, the first
    # time a match crosses into a new season during this simulation
    season = get_season(date)
    if update_state_with_prediction.current_season is None:
        update_state_with_prediction.current_season = season
    elif season != update_state_with_prediction.current_season:
        for team in home_elo:
            home_elo[team] += REVERSION * (INITIAL_ELO - home_elo[team])
        for team in away_elo:
            away_elo[team] += REVERSION * (INITIAL_ELO - away_elo[team])
        update_state_with_prediction.current_season = season

    home_rating = home_elo.get(home, INITIAL_ELO)
    away_rating = away_elo.get(away, INITIAL_ELO)

    expected_home = expected_score(home_rating, away_rating)
    expected_away = 1 - expected_home

    actual_home = 1 if home_goals > away_goals else (0.5 if home_goals == away_goals else 0)
    actual_away = 1 - actual_home

    k = BASE_K * margin_multiplier(home_goals - away_goals)

    home_elo[home] = home_rating + k * (actual_home - expected_home)
    away_elo[away] = away_rating + k * (actual_away - expected_away)


update_state_with_prediction.current_season = get_season(train["Date"].iloc[-1])


# ---------------------------------------------------------------------
# The blind simulation itself -- predicts goals, shots, shots-on-
# target, and the half-time split for every match, then feeds all of
# it forward as if real.
# ---------------------------------------------------------------------

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

    # Shots-on-target can't exceed shots -- predicted independently,
    # so clamp rather than let a rare inconsistency ripple forward
    pred_home_sot = min(
        sample_count(home_shots_on_target_model.predict(scaled)[0], MAX_SHOTS),
        pred_home_shots
    )
    pred_away_sot = min(
        sample_count(away_shots_on_target_model.predict(scaled)[0], MAX_SHOTS),
        pred_away_shots
    )

    # Half-time goals can't exceed full-time goals -- same clamp
    pred_home_ht_goals = min(
        sample_count(home_ht_goals_model.predict(scaled)[0], MAX_GOALS),
        pred_home_goals
    )
    pred_away_ht_goals = min(
        sample_count(away_ht_goals_model.predict(scaled)[0], MAX_GOALS),
        pred_away_goals
    )

    predicted_matches.append((home, away, pred_home_goals, pred_away_goals))
    update_state_with_prediction(
        home, away, date,
        pred_home_goals, pred_away_goals,
        pred_home_shots, pred_away_shots, pred_home_sot, pred_away_sot,
        pred_home_ht_goals, pred_away_ht_goals
    )

actual_matches = list(zip(
    fixtures["HomeTeam"], fixtures["AwayTeam"], fixtures["FTHG"], fixtures["FTAG"]
))


# ---------------------------------------------------------------------
# Build + compare tables -- same build_table as 06
# ---------------------------------------------------------------------

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


predicted_table = build_table(predicted_matches)
actual_table = build_table(actual_matches)

print("=" * 78)
print("PREDICTED TABLE (blind -- everything fed forward is a prediction)".center(78))
print("=" * 78)
print(predicted_table.to_string())

print()
print("=" * 78)
print("ACTUAL TABLE".center(78))
print("=" * 78)
print(actual_table.to_string())

actual_position = {team: pos for pos, team in enumerate(actual_table["Team"], start=1)}
predicted_position = {team: pos for pos, team in enumerate(predicted_table["Team"], start=1)}

comparison_rows = []
for team, real_pos in actual_position.items():
    pred_pos = predicted_position.get(team)
    comparison_rows.append({
        "Team": team, "Actual Position": real_pos, "Predicted Position": pred_pos,
        "Position Diff": (pred_pos - real_pos) if pred_pos is not None else None
    })

comparison_df = pd.DataFrame(comparison_rows).sort_values("Actual Position")

print()
print("=" * 78)
print("POSITION COMPARISON (sorted by real final standing)".center(78))
print("=" * 78)
print(comparison_df.to_string(index=False))

mean_abs_error = comparison_df["Position Diff"].abs().mean()
print(f"\nMean absolute position error (blind): {mean_abs_error:.1f} places")
print("(06_predict_season_table.py's non-blind version scored 2.8 places on this same season)")


def render_table(ax, table_df, title):
    ax.axis("off")
    ax.set_title(title, fontsize=13, fontweight="bold", pad=12)

    display_df = table_df.reset_index().rename(columns={"index": "Pos"})
    table = ax.table(
        cellText=display_df.values.tolist(),
        colLabels=display_df.columns.tolist(),
        loc="center", cellLoc="center"
    )
    table.auto_set_font_size(False)
    table.set_fontsize(8.5)
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


fig, axes = plt.subplots(1, 2, figsize=(18, 9))
render_table(axes[0], predicted_table, "Predicted Table (blind)")
render_table(axes[1], actual_table, "Actual Table")
plt.tight_layout()
plt.show()

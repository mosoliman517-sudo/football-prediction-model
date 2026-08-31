from difflib import get_close_matches

import numpy as np
import pandas as pd

from scipy.stats import poisson

from sklearn.linear_model import PoissonRegressor
from sklearn.metrics import (
    mean_absolute_error,
    mean_poisson_deviance,
    accuracy_score,
    classification_report
)

from config import TRAIN_TEST_SPLIT_DATE

# --------------------------------------------------------------------
# Why this file exists
#
# Every classifier so far has to pick one of three labels, and nothing
# forces those three probabilities to reflect reality -- which is
# exactly why they lean hard on Home Win and almost never call a
# Draw. This model doesn't classify a result at all. It predicts two
# numbers -- expected home goals, expected away goals -- and Win/Draw/
# Loss (and every individual scoreline) falls out of those two numbers
# as simple arithmetic. A draw isn't a class to gamble on anymore,
# it's just "both teams happened to score the same amount."
# --------------------------------------------------------------------

MAX_GOALS = 8   # covers >99.9% of realistic Premier League scorelines;
                # a Poisson(3) has under a 0.05% chance of reaching 8

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
# The exact same pre-match features the classifiers use. This is
# deliberate -- the point of this model is to test what a different
# way of using the same information can do, not to feed it new data.
# HomeMatchesLast14Days/AwayMatchesLast14Days were dropped from the
# classifiers (weakest features by importance, barely used); win-rate,
# head-to-head, and second-half-pattern features were added.


# --------------------------------------------------------------------
# Load dataset -- E0_features.csv, not E0_model.csv. The classifiers'
# file has FTHG/FTAG stripped out as leakage for THEM, but FTHG/FTAG
# are exactly what this model is trying to predict.
# --------------------------------------------------------------------

df = pd.read_csv("02_processed_data/E0_features.csv")
df["Date"] = pd.to_datetime(df["Date"], format="mixed")

train = df[df["Date"] < TRAIN_TEST_SPLIT_DATE]
test = df[df["Date"] >= TRAIN_TEST_SPLIT_DATE]

X_train_raw = train[FEATURE_COLUMNS].fillna(0)
X_test_raw = test[FEATURE_COLUMNS].fillna(0)

# Elo sits around 1500, rest days sit around 0-14 -- without scaling,
# the optimizer that fits PoissonRegressor doesn't converge cleanly
# (sklearn says as much: a ConvergenceWarning pointing at exactly
# this). Standardizing puts every feature on the same footing.
feature_means = X_train_raw.mean()
feature_stds = X_train_raw.std().replace(0, 1)

X_train = (X_train_raw - feature_means) / feature_stds
X_test = (X_test_raw - feature_means) / feature_stds

y_train_home = train["FTHG"]
y_train_away = train["FTAG"]

y_test_home = test["FTHG"]
y_test_away = test["FTAG"]

print(f"Training matches: {X_train.shape}")
print(f"Testing matches: {X_test.shape}")

# --------------------------------------------------------------------
# Two Poisson regressions -- one predicting home goals, one predicting
# away goals. Both see every feature for BOTH teams, because a team's
# expected goals depend on its own attack AND the opponent's defense,
# not just its own numbers in isolation.
# --------------------------------------------------------------------

home_goal_model = PoissonRegressor(max_iter=1000)
home_goal_model.fit(X_train, y_train_home)

away_goal_model = PoissonRegressor(max_iter=1000)
away_goal_model.fit(X_train, y_train_away)

predicted_home_goals = home_goal_model.predict(X_test)
predicted_away_goals = away_goal_model.predict(X_test)

print("\nGoal prediction accuracy (lower is better):")
print(
    f"  Home goals -- MAE: "
    f"{mean_absolute_error(y_test_home, predicted_home_goals):.3f}, "
    f"Poisson deviance: "
    f"{mean_poisson_deviance(y_test_home, predicted_home_goals):.3f}"
)
print(
    f"  Away goals -- MAE: "
    f"{mean_absolute_error(y_test_away, predicted_away_goals):.3f}, "
    f"Poisson deviance: "
    f"{mean_poisson_deviance(y_test_away, predicted_away_goals):.3f}"
)


# --------------------------------------------------------------------
# Turn a pair of expected goals into a full scoreline probability
# grid, and everything else (Win/Draw/Loss, most likely scoreline)
# falls out of that same grid.
#
# This assumes home and away goals are independent given the two
# expected-goal numbers -- the simple version of a Poisson goal model.
# The standard refinement (Dixon-Coles) adds a small correlation
# correction specifically for low-scoring results (0-0, 1-0, 0-1,
# 1-1), which real matches show slightly more/less of than pure
# independence predicts. Not built here -- worth knowing about as the
# next step up, not needed to get this working.
# --------------------------------------------------------------------

def scoreline_grid(home_lambda, away_lambda, max_goals=MAX_GOALS):
    home_probs = poisson.pmf(np.arange(max_goals + 1), home_lambda)
    away_probs = poisson.pmf(np.arange(max_goals + 1), away_lambda)
    return np.outer(home_probs, away_probs)   # rows=home goals, cols=away goals


def outcome_probabilities(grid):
    home_win = np.tril(grid, k=-1).sum()   # home goals > away goals
    draw = np.trace(grid)                   # home goals == away goals
    away_win = np.triu(grid, k=1).sum()     # home goals < away goals
    return home_win, draw, away_win


def most_likely_scoreline(grid):
    home_goals, away_goals = np.unravel_index(np.argmax(grid), grid.shape)
    return home_goals, away_goals, grid[home_goals, away_goals]


def rounded_score_result(home_lambda, away_lambda):
    """
    A different, simpler way to turn two expected-goal numbers into a
    single Win/Draw/Loss call: round each to the nearest whole number
    and compare. Unlike outcome_probabilities() above (which sums
    every exact-tie probability and rarely finds Draw winning that
    contest), this calls a draw whenever the two teams' rounded
    expected goals land on the same number -- so two evenly-matched
    teams projected at, say, 1.4 and 1.3 goals both round to 1 and
    get called a draw, even though "Home Win" is still technically the
    single most probable exact outcome underneath.
    """

    home_goals = round(home_lambda)
    away_goals = round(away_lambda)

    if home_goals > away_goals:
        return "H"
    elif home_goals < away_goals:
        return "A"
    else:
        return "D"


# --------------------------------------------------------------------
# Evaluate: does the derived Win/Draw/Loss call actually call draws,
# and how does its accuracy compare to the classifiers? Two decision
# rules compared side by side -- the probability-sum method already
# in place, and the rounded-goals method described above.
# --------------------------------------------------------------------

predicted_results = []
predicted_results_rounded = []
exact_scoreline_hits = 0
total_home_prob = 0.0
total_draw_prob = 0.0
total_away_prob = 0.0

for idx, (home_lambda, away_lambda) in enumerate(
    zip(predicted_home_goals, predicted_away_goals)
):
    grid = scoreline_grid(home_lambda, away_lambda)
    home_win, draw, away_win = outcome_probabilities(grid)

    total_home_prob += home_win
    total_draw_prob += draw
    total_away_prob += away_win

    if home_win >= draw and home_win >= away_win:
        predicted_results.append("H")
    elif away_win >= draw:
        predicted_results.append("A")
    else:
        predicted_results.append("D")

    predicted_results_rounded.append(
        rounded_score_result(home_lambda, away_lambda)
    )

    pred_home_goals, pred_away_goals, _ = most_likely_scoreline(grid)

    actual_home_goals = y_test_home.iloc[idx]
    actual_away_goals = y_test_away.iloc[idx]

    if pred_home_goals == actual_home_goals and pred_away_goals == actual_away_goals:
        exact_scoreline_hits += 1

actual_results = test["FTR"].values

accuracy = accuracy_score(actual_results, predicted_results)
draw_call_rate = (pd.Series(predicted_results) == "D").mean()
true_draw_rate = (pd.Series(actual_results) == "D").mean()
exact_scoreline_accuracy = exact_scoreline_hits / len(test)

print(f"\nDerived Win/Draw/Loss accuracy: {accuracy:.2%}")
print(
    f"Draw call rate (draw as the single most likely outcome): "
    f"{draw_call_rate:.1%} (actual draw rate in test set: {true_draw_rate:.1%})"
)
print(f"Exact scoreline accuracy: {exact_scoreline_accuracy:.2%}")

# ----------------------------------------------------------------
# Draw call rate above answers "how often is Draw the single best
# guess" -- which is a different, much harder question than "are
# the probabilities themselves trustworthy". This answers the
# second one: averaged across every match, do the predicted
# probabilities actually land near the real outcome rates?
# ----------------------------------------------------------------

n = len(test)
print(
    f"\nCalibration check — average predicted probability vs. actual rate:\n"
    f"  Home Win  predicted {total_home_prob / n:.1%}  "
    f"vs. actual {(actual_results == 'H').mean():.1%}\n"
    f"  Draw      predicted {total_draw_prob / n:.1%}  "
    f"vs. actual {(actual_results == 'D').mean():.1%}\n"
    f"  Away Win  predicted {total_away_prob / n:.1%}  "
    f"vs. actual {(actual_results == 'A').mean():.1%}"
)

print("\n" + classification_report(
    actual_results,
    predicted_results,
    labels=["A", "D", "H"],
    target_names=["Away Win", "Draw", "Home Win"]
))

# ----------------------------------------------------------------
# The rounded-goals decision rule, evaluated the same way, for a
# direct side-by-side comparison against the method above
# ----------------------------------------------------------------

rounded_accuracy = accuracy_score(actual_results, predicted_results_rounded)
rounded_draw_call_rate = (pd.Series(predicted_results_rounded) == "D").mean()

print("=" * 60)
print("Alternative: rounded-goals decision rule")
print("=" * 60)
print(f"Accuracy: {rounded_accuracy:.2%}")
print(
    f"Draw call rate: {rounded_draw_call_rate:.1%} "
    f"(actual draw rate: {true_draw_rate:.1%})"
)
print("\n" + classification_report(
    actual_results,
    predicted_results_rounded,
    labels=["A", "D", "H"],
    target_names=["Away Win", "Draw", "Home Win"]
))


# --------------------------------------------------------------------
# Predict a specific upcoming fixture by team name.
#
# Limitation, stated plainly: each team's "current" pre-match features
# are read from their most recent row in this dataset in the matching
# context (their last HOME match for Home* features, their last AWAY
# match for Away* features) -- so this can be up to one match stale if
# a team's most recent game was in the other context. Good enough for
# a next-fixture prediction, not a substitute for feeding it a live,
# freshly-computed row.
# --------------------------------------------------------------------

def predict_fixture(home_team, away_team, df):

    known_teams = set(df["HomeTeam"]) | set(df["AwayTeam"])

    for team in (home_team, away_team):
        if team not in known_teams:
            suggestion = get_close_matches(team, known_teams, n=1)
            hint = f" Did you mean '{suggestion[0]}'?" if suggestion else ""
            raise ValueError(f"'{team}' isn't a team name in the dataset.{hint}")

    home_row = df[df["HomeTeam"] == home_team].sort_values("Date").iloc[-1]
    away_row = df[df["AwayTeam"] == away_team].sort_values("Date").iloc[-1]

    # Head-to-head is specific to THIS matchup, not just each team's
    # most recent row (which could've been against anyone) -- scan
    # every past meeting between these two teams directly, same logic
    # as head_to_head.py's walk-forward version.
    past_meetings = df[
        ((df["HomeTeam"] == home_team) & (df["AwayTeam"] == away_team)) |
        ((df["HomeTeam"] == away_team) & (df["AwayTeam"] == home_team))
    ]

    matches_played = len(past_meetings)

    if matches_played > 0:
        home_team_wins = (
            ((past_meetings["FTR"] == "H") & (past_meetings["HomeTeam"] == home_team))
            | ((past_meetings["FTR"] == "A") & (past_meetings["AwayTeam"] == home_team))
        ).sum()
        away_team_wins = (
            ((past_meetings["FTR"] == "H") & (past_meetings["HomeTeam"] == away_team))
            | ((past_meetings["FTR"] == "A") & (past_meetings["AwayTeam"] == away_team))
        ).sum()
        h2h_home_rate = home_team_wins / matches_played
        h2h_away_rate = away_team_wins / matches_played
        h2h_draw_rate = (past_meetings["FTR"] == "D").sum() / matches_played
    else:
        h2h_home_rate, h2h_away_rate, h2h_draw_rate = 0.5, 0.5, 0.0

    features = pd.DataFrame([{
        "HomeLast5Points": home_row["HomeLast5Points"],
        "AwayLast5Points": away_row["AwayLast5Points"],
        "HomeLast5HomePoints": home_row["HomeLast5HomePoints"],
        "AwayLast5AwayPoints": away_row["AwayLast5AwayPoints"],
        "HomeWinRateLastHome": home_row["HomeWinRateLastHome"],
        "AwayWinRateLastAway": away_row["AwayWinRateLastAway"],
        "HomeAvgGoalsScoredLast5": home_row["HomeAvgGoalsScoredLast5"],
        "HomeAvgGoalsConcededLast5": home_row["HomeAvgGoalsConcededLast5"],
        "AwayAvgGoalsScoredLast5": away_row["AwayAvgGoalsScoredLast5"],
        "AwayAvgGoalsConcededLast5": away_row["AwayAvgGoalsConcededLast5"],
        "HomeAvgShotsLast5": home_row["HomeAvgShotsLast5"],
        "AwayAvgShotsLast5": away_row["AwayAvgShotsLast5"],
        "HomeAvgShotsOnTargetLast5": home_row["HomeAvgShotsOnTargetLast5"],
        "AwayAvgShotsOnTargetLast5": away_row["AwayAvgShotsOnTargetLast5"],
        "HomeAvgShotsConcededLast5": home_row["HomeAvgShotsConcededLast5"],
        "AwayAvgShotsConcededLast5": away_row["AwayAvgShotsConcededLast5"],
        "HomeDaysRest": home_row["HomeDaysRest"],
        "AwayDaysRest": away_row["AwayDaysRest"],
        "H2HHomeTeamWinRate": h2h_home_rate,
        "H2HAwayTeamWinRate": h2h_away_rate,
        "H2HDrawRate": h2h_draw_rate,
        "H2HMatchesPlayed": matches_played,
        "HomeAvgSecondHalfGoalsScoredLast5": home_row["HomeAvgSecondHalfGoalsScoredLast5"],
        "HomeAvgSecondHalfGoalsConcededLast5": home_row["HomeAvgSecondHalfGoalsConcededLast5"],
        "AwayAvgSecondHalfGoalsScoredLast5": away_row["AwayAvgSecondHalfGoalsScoredLast5"],
        "AwayAvgSecondHalfGoalsConcededLast5": away_row["AwayAvgSecondHalfGoalsConcededLast5"],
        "HomeElo": home_row["HomeElo"],
        "AwayElo": away_row["AwayElo"],
        "EloDifference": home_row["HomeElo"] - away_row["AwayElo"],
        "HomeTeamOverallElo": home_row["HomeTeamOverallElo"],
        "AwayTeamOverallElo": away_row["AwayTeamOverallElo"],
        "OverallEloDifference": (
            home_row["HomeTeamOverallElo"] - away_row["AwayTeamOverallElo"]
        ),
        "HomeSquadValueEur": home_row["HomeSquadValueEur"],
        "AwaySquadValueEur": away_row["AwaySquadValueEur"],
    }])[FEATURE_COLUMNS].fillna(0)

    features_scaled = (features - feature_means) / feature_stds

    home_lambda = home_goal_model.predict(features_scaled)[0]
    away_lambda = away_goal_model.predict(features_scaled)[0]

    grid = scoreline_grid(home_lambda, away_lambda)
    home_win, draw, away_win = outcome_probabilities(grid)

    print(f"\n{home_team} (home) vs {away_team} (away)")
    print(f"Expected goals: {home_team} {home_lambda:.2f} — {away_lambda:.2f} {away_team}")
    print(
        f"Result probabilities: "
        f"{home_team} win {home_win:.1%} | Draw {draw:.1%} | "
        f"{away_team} win {away_win:.1%}"
    )

    top_scorelines = np.dstack(
        np.unravel_index(np.argsort(-grid, axis=None)[:5], grid.shape)
    )[0]

    print("Most likely scorelines:")
    for home_goals, away_goals in top_scorelines:
        print(
            f"  {home_goals}-{away_goals}: {grid[home_goals, away_goals]:.1%}"
        )

    return home_lambda, away_lambda, grid


if __name__ == "__main__":

    # Add or remove (home, away) pairs here to predict whatever
    # matchups you actually care about -- team names have to match
    # how they appear in the data (run print(sorted(set(df["HomeTeam"])))
    # if you're not sure of the exact spelling).
    fixtures_to_predict = [
        ("Liverpool", "Chelsea"),
    ]

    for home_team, away_team in fixtures_to_predict:
        predict_fixture(home_team, away_team, df)

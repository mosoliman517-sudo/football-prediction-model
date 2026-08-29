import numpy as np
import pandas as pd

from scipy.stats import poisson
from sklearn.linear_model import PoissonRegressor

from config import TRAIN_TEST_SPLIT_DATE

# --------------------------------------------------------------------
# Simulates the entire held-out season, match by match, using the same
# Poisson goal model as 05_predict_scoreline.py -- needed here
# specifically because a league table needs Goal Difference, and only
# a model that predicts actual scorelines can produce that. The
# classifiers (03/04) only ever pick Home/Draw/Away, never a score.
#
# Every predicted match gets aggregated into a real league table
# (Played, W, D, L, GF, GA, GD, Points, sorted the same way a real
# table is), built with the exact same function used for the real
# results -- so whatever difference shows up between the two tables
# is a real difference in prediction quality, not an inconsistency in
# how the tables themselves were built.
# --------------------------------------------------------------------

MAX_GOALS = 8

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

# --------------------------------------------------------------------
# Load + train -- same approach as 05_predict_scoreline.py
# --------------------------------------------------------------------

df = pd.read_csv("02_processed_data/E0_features.csv")
df["Date"] = pd.to_datetime(df["Date"], format="mixed")

train = df[df["Date"] < TRAIN_TEST_SPLIT_DATE]
test = df[df["Date"] >= TRAIN_TEST_SPLIT_DATE].reset_index(drop=True)

X_train_raw = train[FEATURE_COLUMNS].fillna(0)
X_test_raw = test[FEATURE_COLUMNS].fillna(0)

feature_means = X_train_raw.mean()
feature_stds = X_train_raw.std().replace(0, 1)

X_train = (X_train_raw - feature_means) / feature_stds
X_test = (X_test_raw - feature_means) / feature_stds

home_goal_model = PoissonRegressor(max_iter=1000)
home_goal_model.fit(X_train, train["FTHG"])

away_goal_model = PoissonRegressor(max_iter=1000)
away_goal_model.fit(X_train, train["FTAG"])

predicted_home_goals = home_goal_model.predict(X_test)
predicted_away_goals = away_goal_model.predict(X_test)

print(f"Season simulated: {len(test)} matches "
      f"({test['Date'].min().date()} to {test['Date'].max().date()})\n")


def scoreline_grid(home_lambda, away_lambda, max_goals=MAX_GOALS):
    home_probs = poisson.pmf(np.arange(max_goals + 1), home_lambda)
    away_probs = poisson.pmf(np.arange(max_goals + 1), away_lambda)
    return np.outer(home_probs, away_probs)


def most_likely_scoreline(grid):
    home_goals, away_goals = np.unravel_index(np.argmax(grid), grid.shape)
    return int(home_goals), int(away_goals)


# --------------------------------------------------------------------
# Build a league table from a list of (home, away, home_goals,
# away_goals) results -- used for both the predicted and real tables
# --------------------------------------------------------------------

def build_table(matches):

    table = {}

    def ensure(team):
        if team not in table:
            table[team] = {
                "Played": 0, "W": 0, "D": 0, "L": 0, "GF": 0, "GA": 0, "Points": 0
            }

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
            "Team": team,
            "Played": stats["Played"],
            "W": stats["W"],
            "D": stats["D"],
            "L": stats["L"],
            "GF": stats["GF"],
            "GA": stats["GA"],
            "GD": stats["GF"] - stats["GA"],
            "Points": stats["Points"],
        })

    table_df = pd.DataFrame(rows).sort_values(
        by=["Points", "GD", "GF"], ascending=False
    ).reset_index(drop=True)

    table_df.index = table_df.index + 1   # standings start at 1

    return table_df


# --------------------------------------------------------------------
# Predicted results: the single most likely scoreline for every match
# --------------------------------------------------------------------

predicted_matches = []

for idx, (home_lambda, away_lambda) in enumerate(
    zip(predicted_home_goals, predicted_away_goals)
):
    pred_home_goals, pred_away_goals = most_likely_scoreline(
        scoreline_grid(home_lambda, away_lambda)
    )
    predicted_matches.append((
        test.loc[idx, "HomeTeam"],
        test.loc[idx, "AwayTeam"],
        pred_home_goals,
        pred_away_goals
    ))

actual_matches = list(zip(
    test["HomeTeam"], test["AwayTeam"], test["FTHG"], test["FTAG"]
))

predicted_table = build_table(predicted_matches)
actual_table = build_table(actual_matches)

print("=" * 78)
print("PREDICTED TABLE".center(78))
print("=" * 78)
print(predicted_table.to_string())

print()
print("=" * 78)
print("ACTUAL TABLE".center(78))
print("=" * 78)
print(actual_table.to_string())

# --------------------------------------------------------------------
# Position comparison -- how far off was each team's predicted
# finishing position from where they actually finished?
# --------------------------------------------------------------------

actual_position = {team: pos for pos, team in enumerate(actual_table["Team"], start=1)}
predicted_position = {team: pos for pos, team in enumerate(predicted_table["Team"], start=1)}

comparison_rows = []

for team, real_pos in actual_position.items():
    pred_pos = predicted_position.get(team)
    comparison_rows.append({
        "Team": team,
        "Actual Position": real_pos,
        "Predicted Position": pred_pos,
        "Position Diff": (pred_pos - real_pos) if pred_pos is not None else None
    })

comparison_df = pd.DataFrame(comparison_rows).sort_values("Actual Position")

print()
print("=" * 78)
print("POSITION COMPARISON (sorted by real final standing)".center(78))
print("=" * 78)
print(comparison_df.to_string(index=False))

mean_abs_error = comparison_df["Position Diff"].abs().mean()
print(f"\nMean absolute position error: {mean_abs_error:.1f} places")

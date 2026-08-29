import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from scipy.stats import poisson
from sklearn.linear_model import PoissonRegressor
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight
from sklearn.metrics import accuracy_score

from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from catboost import CatBoostClassifier

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
# Report the most accurate classifier first, for reference -- but the
# table itself still has to come from the Poisson model below, since a
# league table needs Goal Difference and the classifiers never predict
# a scoreline, only Home/Draw/Away. This isn't the table's source of
# truth, it's context: "here's how good the best W/D/L model is doing,
# for comparison against what the table below implies."
# --------------------------------------------------------------------

classifier_df = pd.read_csv("02_processed_data/E0_model.csv")
classifier_df["Date"] = pd.to_datetime(classifier_df["Date"], format="mixed")

classifier_train = classifier_df[classifier_df["Date"] < TRAIN_TEST_SPLIT_DATE]
classifier_test = classifier_df[classifier_df["Date"] >= TRAIN_TEST_SPLIT_DATE]

X_clf_train = classifier_train.drop(columns=["FTR", "Div", "Date", "HomeTeam", "AwayTeam"]).fillna(0)
X_clf_test = classifier_test.drop(columns=["FTR", "Div", "Date", "HomeTeam", "AwayTeam"]).fillna(0)

clf_encoder = LabelEncoder()
y_clf_train = clf_encoder.fit_transform(classifier_train["FTR"])
y_clf_test = clf_encoder.transform(classifier_test["FTR"])

clf_sample_weight = compute_sample_weight("balanced", y_clf_train)

classifiers = {
    "Random Forest": RandomForestClassifier(n_estimators=500, max_depth=15, min_samples_split=5, min_samples_leaf=2, random_state=42, n_jobs=-1),
    "Gradient Boosting": GradientBoostingClassifier(random_state=42),
    "XGBoost": XGBClassifier(random_state=42, eval_metric="mlogloss"),
    "LightGBM": LGBMClassifier(random_state=42, verbose=-1),
    "CatBoost": CatBoostClassifier(verbose=False, random_state=42),
}

best_classifier_name, best_classifier_accuracy = None, 0.0

for name, clf in classifiers.items():
    clf.fit(X_clf_train, y_clf_train, sample_weight=clf_sample_weight)
    clf_accuracy = accuracy_score(y_clf_test, np.ravel(clf.predict(X_clf_test)))

    if clf_accuracy > best_classifier_accuracy:
        best_classifier_name, best_classifier_accuracy = name, clf_accuracy

print(
    f"Most accurate classifier this season: {best_classifier_name} "
    f"({best_classifier_accuracy:.2%} Win/Draw/Loss accuracy, calibrated mode) "
    f"-- reference only, table below uses the Poisson goal model\n"
)

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

# --------------------------------------------------------------------
# Visual table, matching the confusion-matrix pop-up 03_train_model.py
# already gives -- top 4 (Champions League places) tinted green,
# bottom 3 (relegation) tinted red, same as a real league table.
# --------------------------------------------------------------------

def render_table(ax, table_df, title):

    ax.axis("off")
    ax.set_title(title, fontsize=13, fontweight="bold", pad=12)

    display_df = table_df.reset_index().rename(columns={"index": "Pos"})
    col_labels = display_df.columns.tolist()
    cell_text = display_df.values.tolist()

    table = ax.table(
        cellText=cell_text,
        colLabels=col_labels,
        loc="center",
        cellLoc="center"
    )
    table.auto_set_font_size(False)
    table.set_fontsize(8.5)
    table.scale(1, 1.35)

    n_rows = len(display_df)

    for row in range(n_rows + 1):   # +1 for the header row

        for col in range(len(col_labels)):

            cell = table[row, col]

            if row == 0:
                cell.set_text_props(fontweight="bold")
                cell.set_facecolor("#dddddd")
                continue

            position = row   # row 1 == 1st place, etc.

            if position <= 4:
                cell.set_facecolor("#d4edda")   # Champions League places
            elif position >= n_rows - 2:
                cell.set_facecolor("#f8d7da")   # relegation places
            elif row % 2 == 0:
                cell.set_facecolor("#f5f5f5")   # light row striping


fig, axes = plt.subplots(1, 2, figsize=(18, 9))

render_table(axes[0], predicted_table, "Predicted Table")
render_table(axes[1], actual_table, "Actual Table")

plt.tight_layout()
plt.show()

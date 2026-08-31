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
# pre-match features (Elo, form, goals) are built from the REAL
# 2025-26 results, because they already happened by the time this
# project runs. That's a fair backtest, but it's not "predict the
# whole season before a ball is kicked."
#
# This script is that harder, honest version. It knows real history
# only through 2024-25. For every 2025-26 match, in fixture order, it
# predicts a scoreline from whatever it currently believes about both
# teams -- then treats that PREDICTION as if it were the real result,
# updating Elo/form/goals/H2H with its own guess, before moving to the
# next match. No 2025-26 result is ever read, only the fixture list
# (who plays whom, when -- known in advance, same as a real calendar).
#
# One disclosed limitation: the Poisson model only ever predicts
# GOALS, never shots, cards, or half-time splits. So Elo, Form, Goals
# and Head-to-Head genuinely update match by match from predicted
# results -- but the Shots and Half-Time feature groups have nothing
# honest to update with, and stay frozen at each team's last real
# 2024-25 value for the whole simulated season. Elo here also uses a
# simpler expectation (plain rating comparison, no shot-blend, no the
# multi-signal expectation model from elo.py) since those refinements
# need shot data that doesn't exist for predicted future matches.
# ---------------------------------------------------------------------

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

DEFAULT_REST_DAYS = 7

# ---------------------------------------------------------------------
# Load + train the Poisson goal model on real data only, same as 05/06
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


def scoreline_grid(home_lambda, away_lambda, max_goals=MAX_GOALS):
    home_probs = poisson.pmf(np.arange(max_goals + 1), home_lambda)
    away_probs = poisson.pmf(np.arange(max_goals + 1), away_lambda)
    return np.outer(home_probs, away_probs)


def most_likely_scoreline(grid):
    h, a = np.unravel_index(np.argmax(grid), grid.shape)
    return int(h), int(a)


# ---------------------------------------------------------------------
# Seed simulation state from real history (2014-15 through 2024-25)
# ---------------------------------------------------------------------

recent_overall = defaultdict(lambda: deque(maxlen=5))    # (points, goals_scored, goals_conceded)
recent_home_points = defaultdict(lambda: deque(maxlen=5))
recent_away_points = defaultdict(lambda: deque(maxlen=5))
winrate_home = defaultdict(lambda: deque(maxlen=10))       # 1/0 flags, home matches only
winrate_away = defaultdict(lambda: deque(maxlen=10))       # 1/0 flags, away matches only
last_match_date = {}
h2h_history = defaultdict(list)

# Elo: seeded directly from the real, already-computed values --
# 01_load_data.py's elo.py already did the sophisticated version
# (dual-track, shot-blended, multi-signal expectation) for every real
# match. No need to recompute any of that; just read each team's most
# recent real rating as the simulation's starting point.
home_elo = {}
away_elo = {}

# Frozen snapshots -- each team's last REAL shots/half-time features,
# unchanged for the entire blind simulation (see note above)
frozen_home_shots = {}
frozen_away_shots = {}
frozen_home_ht = {}
frozen_away_ht = {}

SHOTS_HOME_COLS = ["HomeAvgShotsLast5", "HomeAvgShotsOnTargetLast5", "HomeAvgShotsConcededLast5"]
SHOTS_AWAY_COLS = ["AwayAvgShotsLast5", "AwayAvgShotsOnTargetLast5", "AwayAvgShotsConcededLast5"]
HT_HOME_COLS = ["HomeAvgSecondHalfGoalsScoredLast5", "HomeAvgSecondHalfGoalsConcededLast5"]
HT_AWAY_COLS = ["AwayAvgSecondHalfGoalsScoredLast5", "AwayAvgSecondHalfGoalsConcededLast5"]

for i in range(len(train)):
    row = train.iloc[i]
    home, away, date = row["HomeTeam"], row["AwayTeam"], row["Date"]

    home_pts, away_pts = row["HomePoints"], row["AwayPoints"]
    home_goals, away_goals = row["FTHG"], row["FTAG"]

    recent_overall[home].append((home_pts, home_goals, away_goals))
    recent_overall[away].append((away_pts, away_goals, home_goals))
    recent_home_points[home].append(home_pts)
    recent_away_points[away].append(away_pts)
    winrate_home[home].append(1 if row["FTR"] == "H" else 0)
    winrate_away[away].append(1 if row["FTR"] == "A" else 0)

    last_match_date[home] = date
    last_match_date[away] = date

    winner = home if row["FTR"] == "H" else (away if row["FTR"] == "A" else None)
    h2h_history[matchup_key(home, away)].append(winner)

    home_elo[home] = row["HomeElo"]
    away_elo[away] = row["AwayElo"]

    frozen_home_shots[home] = row[SHOTS_HOME_COLS].to_dict()
    frozen_away_shots[away] = row[SHOTS_AWAY_COLS].to_dict()
    frozen_home_ht[home] = row[HT_HOME_COLS].to_dict()
    frozen_away_ht[away] = row[HT_AWAY_COLS].to_dict()

print(f"Seeded from real history through {train['Date'].max().date()}")
print(f"Blind-predicting {len(fixtures)} matches from "
      f"{fixtures['Date'].min().date()} to {fixtures['Date'].max().date()}\n")


def build_feature_row(home, away, date):

    home_recent = recent_overall.get(home, deque())
    away_recent = recent_overall.get(away, deque())

    home_points_sum = sum(p for p, _, _ in home_recent)
    away_points_sum = sum(p for p, _, _ in away_recent)

    home_goals_scored = [g for _, g, _ in home_recent]
    home_goals_conceded = [g for _, _, g in home_recent]
    away_goals_scored = [g for _, g, _ in away_recent]
    away_goals_conceded = [g for _, _, g in away_recent]

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

    shots_home = frozen_home_shots.get(home, {c: 0.0 for c in SHOTS_HOME_COLS})
    shots_away = frozen_away_shots.get(away, {c: 0.0 for c in SHOTS_AWAY_COLS})
    ht_home = frozen_home_ht.get(home, {c: 0.0 for c in HT_HOME_COLS})
    ht_away = frozen_away_ht.get(away, {c: 0.0 for c in HT_AWAY_COLS})

    return pd.Series({
        "HomeLast5Points": home_points_sum,
        "AwayLast5Points": away_points_sum,
        "HomeLast5HomePoints": sum(recent_home_points.get(home, [])),
        "AwayLast5AwayPoints": sum(recent_away_points.get(away, [])),
        "HomeWinRateLastHome": (
            np.mean(winrate_home[home]) if winrate_home.get(home) else 0.5
        ),
        "AwayWinRateLastAway": (
            np.mean(winrate_away[away]) if winrate_away.get(away) else 0.5
        ),
        "HomeAvgGoalsScoredLast5": np.mean(home_goals_scored) if home_goals_scored else 0.0,
        "HomeAvgGoalsConcededLast5": np.mean(home_goals_conceded) if home_goals_conceded else 0.0,
        "AwayAvgGoalsScoredLast5": np.mean(away_goals_scored) if away_goals_scored else 0.0,
        "AwayAvgGoalsConcededLast5": np.mean(away_goals_conceded) if away_goals_conceded else 0.0,
        "HomeAvgShotsLast5": shots_home["HomeAvgShotsLast5"],
        "AwayAvgShotsLast5": shots_away["AwayAvgShotsLast5"],
        "HomeAvgShotsOnTargetLast5": shots_home["HomeAvgShotsOnTargetLast5"],
        "AwayAvgShotsOnTargetLast5": shots_away["AwayAvgShotsOnTargetLast5"],
        "HomeAvgShotsConcededLast5": shots_home["HomeAvgShotsConcededLast5"],
        "AwayAvgShotsConcededLast5": shots_away["AwayAvgShotsConcededLast5"],
        "HomeDaysRest": home_rest,
        "AwayDaysRest": away_rest,
        "H2HHomeTeamWinRate": h2h_home_rate,
        "H2HAwayTeamWinRate": h2h_away_rate,
        "H2HDrawRate": h2h_draw_rate,
        "H2HMatchesPlayed": n,
        "HomeAvgSecondHalfGoalsScoredLast5": ht_home["HomeAvgSecondHalfGoalsScoredLast5"],
        "HomeAvgSecondHalfGoalsConcededLast5": ht_home["HomeAvgSecondHalfGoalsConcededLast5"],
        "AwayAvgSecondHalfGoalsScoredLast5": ht_away["AwayAvgSecondHalfGoalsScoredLast5"],
        "AwayAvgSecondHalfGoalsConcededLast5": ht_away["AwayAvgSecondHalfGoalsConcededLast5"],
        "HomeElo": home_rating,
        "AwayElo": away_rating,
        "EloDifference": home_rating - away_rating,
        "HomeTeamOverallElo": home_overall_elo,
        "AwayTeamOverallElo": away_overall_elo,
        "OverallEloDifference": home_overall_elo - away_overall_elo,
    })[FEATURE_COLUMNS]


def update_state_with_prediction(home, away, date, home_goals, away_goals):

    home_pts = 3 if home_goals > away_goals else (1 if home_goals == away_goals else 0)
    away_pts = 3 if away_goals > home_goals else (1 if away_goals == home_goals else 0)

    recent_overall[home].append((home_pts, home_goals, away_goals))
    recent_overall[away].append((away_pts, away_goals, home_goals))
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
# The blind simulation itself
# ---------------------------------------------------------------------

predicted_matches = []

for i in range(len(fixtures)):
    row = fixtures.iloc[i]
    home, away, date = row["HomeTeam"], row["AwayTeam"], row["Date"]

    features = build_feature_row(home, away, date)
    scaled = ((features - feature_means) / feature_stds).to_frame().T

    home_lambda = home_goal_model.predict(scaled)[0]
    away_lambda = away_goal_model.predict(scaled)[0]

    pred_home_goals, pred_away_goals = most_likely_scoreline(
        scoreline_grid(home_lambda, away_lambda)
    )

    predicted_matches.append((home, away, pred_home_goals, pred_away_goals))
    update_state_with_prediction(home, away, date, pred_home_goals, pred_away_goals)

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
print("PREDICTED TABLE (blind -- built only from the model's own guesses)".center(78))
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

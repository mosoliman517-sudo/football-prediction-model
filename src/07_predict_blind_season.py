import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from config import TRAIN_TEST_SPLIT_DATE
from features.elo import get_season
from collections import defaultdict

from blind_engine import make_simulator, run_many, build_table

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

N_SIMULATIONS = 20   # trade-off between run-to-run noise and runtime

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


def simulate_season(season_year):
    """
    Blindly forecasts one full season, re-anchored on every real match
    known before it starts: train = every real match before
    {season_year}-08-01, fixtures = that season's matches only.
    Retraining per season (rather than once) is what makes each
    season's forecast use the most real data honestly available to
    it -- 2025-26's run gets a whole extra real season (2024-25) that
    2024-25's own run never had. The simulation engine itself lives in
    blind_engine.py.
    """

    season_start = f"{season_year}-08-01"
    season_label = f"{season_year}-{str(season_year + 1)[-2:]}"

    train = df[df["Date"] < season_start].reset_index(drop=True)
    fixtures = df[df["SeasonYear"] == season_year].sort_values("Date").reset_index(drop=True)

    run_one_simulation = make_simulator(train, fixtures)

    print(f"Simulating the {season_label} season {N_SIMULATIONS} times (different random draws each run)...")

    per_team_points = defaultdict(list)
    per_team_gf = defaultdict(list)
    per_team_ga = defaultdict(list)
    per_team_position = defaultdict(list)

    for matches in run_many(run_one_simulation, list(range(N_SIMULATIONS))):
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

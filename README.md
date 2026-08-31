## Football Match Prediction Model

## Goal

Build a machine learning model that predicts football match outcomes using historical Premier League data and pre-match statistics such as recent form, team strength, home advantage, and other performance metrics.

---

# Progress Log

## Update 1 — April 30 – June 5, 2026

- Set up the initial football prediction project structure and data pipeline.
- Collected historical Premier League match data from https://www.football-data.co.uk/englandm.php.
- Cleaned the raw datasets by removing unnecessary information and duplicate betting-market features.
- Developed a feature engineering pipeline using Python and Pandas.
- Created form-based metrics including:
  - Last 5 match points
  - Home and away specific form
  - Recent form rankings
- Developed an opponent strength metric based on the average ranking of each team's previous five opponents.
- Added attacking and defensive performance features including:
  - Average goals scored
  - Average goals conceded
  - Goal difference
  - Average shots
  - Average shots on target
  - Average shots conceded
- Added contextual match features:
  - Rest days between matches
  - Home and away performance trends
- Removed data leakage by ensuring only information available before kickoff is used.
- Generated the first engineered dataset (`E0_features.csv`).

---

## Update 2 — June 6 – July 22, 2026

- Expanded the project from one Premier League season to ten seasons of historical data (~3,800 matches).
- Redesigned the data loading pipeline to automatically merge multiple seasons.
- Fixed cross-season compatibility issues including inconsistent date formats.
- Successfully validated the combined dataset (3,801 matches, 130 raw columns).
- Confirmed that the feature engineering pipeline scales correctly across multiple seasons.

---

## Update 3 — July 23 – July 30, 2026

Successfully trained and evaluated the first generation of machine learning models using the engineered dataset.

Implemented and compared multiple classification algorithms:

- Random Forest
- Gradient Boosting
- XGBoost
- LightGBM
- CatBoost

### Current Best Result

- **Best model:** Gradient Boosting
- **Accuracy:** **57.1%**
- **Evaluation season:** 2023–24 Premier League

Additional improvements:

- Reorganized the project into a cleaner and more modular structure.
- Split the feature engineering pipeline into dedicated modules:
  - Form
  - Goals
  - Shots
  - Rest Days
  - Elo Ratings
- Added a model comparison pipeline to benchmark multiple machine learning algorithms.
- Added evaluation tools including:
  - Feature importance rankings
  - Prediction probabilities
  - Confusion matrices
- Improved the readability and scalability of the codebase, making future feature additions significantly easier.

---

## Update 4 — August 28, 2026

Focused on rigor over raw numbers: found and fixed real bugs, tested several ideas honestly, and dropped the ones that didn't hold up.

- Found and removed **betting-market data leakage** — bookmaker odds columns were still in the training data and ranked as the top features, meaning the model was partly reading bookmakers' predictions instead of its own.
- Rebuilt Elo as a **dual-track (home/away) rating system** with a calibrated multi-signal expectation model (Elo + form + net goal/shot form + rest days, weighted by measured significance) instead of a flat assumed home-advantage constant.
- Expanded the test set from 1 season to 2 (~760 matches), and added `config.py` as a single source of truth after finding real drift between the training and comparison scripts.
- Diagnosed a real Home Win over-prediction bug (62.5% predicted vs. 47.2% actual) and fixed it with class-balanced sample weighting — confirmed with a new permanent calibration check, not just eyeballed.
- Tried hyperparameter tuning and two different draw-prediction mechanisms; tested each honestly and dropped them when the data showed they weren't real improvements.
- Added `05_predict_scoreline.py` — a Poisson goal model predicting expected home/away goals, deriving Win/Draw/Loss probabilities and a full scoreline grid from one underlying prediction.
- Added head-to-head history and last-10 win-rate features aimed at Away Win recognition. Confirmed via feature importance they're genuinely used (head-to-head ranks mid-pack, ahead of several existing features) — but the accuracy effect was mixed across models, not the clean fix hoped for. Kept anyway since it's real signal.
- Added a `USE_CLASS_BALANCING` toggle instead of picking one philosophy permanently — calibrated (predicted proportions match real-world rates) vs. confident (higher Home recall, but only by over-predicting it). Confirmed with real confusion matrices that a margin-based middle ground doesn't escape the trade-off, it just moves which class pays for it.
- Removed the two weakest features (`HomeMatchesLast14Days`/`AwayMatchesLast14Days`, near-zero importance) and added second-half goal patterns (`half_time.py`) — built only from teams' *past* matches' half-time splits, never the current match's own half-time score, which would be leakage.
- Shifted the test set back to 1 season and added `06_predict_season_table.py` — simulates the whole held-out season and builds a real league table (Played/W/D/L/GF/GA/GD/Points) from the predicted results next to the actual one, now rendered as an actual styled table image, not just terminal text.
- Added 2024-25 and 2025-26 data (12 seasons total) and moved the test season to 2025-26, the most recently completed one. Caught several new bookmaker odds columns the newer files introduced before they could reintroduce leakage.
- Tested six more ideas honestly (recency weighting, isotonic calibration, expected-goals-as-classifier-feature, referee tendencies, corners/cards/fouls, model stacking) — all six came back worse than the existing baseline, a real, evidenced signal that this feature set is near its ceiling for further additions.
- Found that class-balanced weighting isn't universal — it helps some models and hurts others by a lot (Gradient Boosting: 40.79% balanced vs. 46.58% unweighted). Each model now picks its own weighting, decided on an internal validation slice and scored on f1_macro so the choice can't just reward ignoring Draw. Every model now beats the "always guess Home Win" baseline; three previously didn't.
- Added `07_predict_blind_season.py` — a genuinely blind full-season forecast. Unlike `06`, it never reads a single 2025-26 result: every match is predicted from the model's own prior predictions fed forward, Elo and form updating on guesses, not reality. Real result: mean position error 4.2 places vs. `06`'s 2.8 — confirming the non-blind version really was getting help from data it shouldn't have had.

**Current best:** Random Forest / CatBoost depending on weighting mode, ~47-48% on 2025-26 (380 matches). Genuinely a harder season to call than 2023-24 was — more draws (27.4% vs. 21.6%) and fewer clear favorites winning — reflected honestly in the accuracy, not hidden.

---

# Current Project Structure

```
football-prediction-model/
│
├── 01_data/                        # raw season CSVs
├── 02_processed_data/              # engineered datasets (E0_features.csv, E0_model.csv)
├── src/
│   ├── config.py                   # shared constants (train/test split date)
│   ├── draw_boost.py               # margin-based draw mechanism (unused by default)
│   ├── 01_load_data.py
│   ├── 02_load_features.py
│   ├── 03_train_model.py           # trains + compares all 5 models + ensemble
│   ├── 04_comparing_models.py      # lighter-weight version of the same comparison
│   ├── 05_predict_scoreline.py     # Poisson goal model — Win/Draw/Loss + scorelines
│   ├── 06_predict_season_table.py  # simulates a full season, predicted vs. actual table
│   └── features/
│       ├── form.py                 # points-based form + win-rate
│       ├── goals.py
│       ├── shots.py
│       ├── rest_days.py
│       ├── head_to_head.py
│       ├── half_time.py            # second-half goal patterns
│       └── elo.py                  # dual-track Elo + calibrated expectation model
│
├── README.md
├── requirements.txt
└── .gitignore
```

---

# Technologies Used

- Python
- Pandas
- NumPy
- Scikit-Learn
- XGBoost
- LightGBM
- CatBoost
- Matplotlib

---

# Next Steps

- Find a real fix for Away Win recognition — still an open problem, several attempts so far haven't cracked it.
- Refine scoreline prediction with a Dixon-Coles correlation correction — should help both scoreline accuracy and the goal-total compression seen in the season table.
- Once 2026-27 is underway, point predictions at the live in-progress season and start tracking real fixtures week to week.
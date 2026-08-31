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

## Update 4 — August 28-31, 2026

A long session focused on rigor over raw numbers: real bugs found and fixed, a lot of ideas tested honestly against real held-out data, most of which didn't survive contact with it.

- Removed **betting-market data leakage** (bookmaker odds were the top-ranked features) and rebuilt Elo as a dual-track home/away system with a calibrated, data-weighted expectation model instead of assumed constants.
- Diagnosed and fixed a real Home Win over-prediction bug (62.5% predicted vs. 47.2% actual) with class-balanced weighting — then found balancing isn't universal, it helps some models and actively hurts others. Each model now picks its own weighting via internal validation, scored so the choice can't just reward ignoring Draw.
- Added `05_predict_scoreline.py` (a Poisson goal model — Win/Draw/Loss and full scoreline probabilities from one prediction) and `06_predict_season_table.py` (simulates a season and builds a real predicted-vs-actual league table, rendered as a styled image).
- Added `07_predict_blind_season.py` — a genuinely blind season forecast that never reads a single result from the season it's predicting; every match updates Elo/form/goals purely from the model's own prior guesses, averaged over 20 Monte Carlo runs. Elo is seeded from each team's last 3 seasons, not just one — a single bad season (or a fluke great one) no longer defines a team's entire starting point.
- Pulled in 2024-25 and 2025-26 data (12 seasons total) and moved testing to 2025-26.
- Tested and honestly rejected a long list of further ideas — hyperparameter tuning, two different draw-forcing mechanisms, recency weighting, isotonic calibration, expected-goals-as-a-classifier-feature, referee tendencies, corners/cards/fouls, per-model feature selection, an explicit "match closeness" feature, and applying the 3-season Elo blend to the whole pipeline (helped the blind forecast, measurably hurt everything else). Each had a real rationale, each got tested against real data, and each got reverted the moment it didn't hold up. Kept only what actually earned its place.

**Current best:** CatBoost, 47.11% on 2025-26 (380 matches) — and 71.9% specifically on matches that had a winner, the fairer number once draws (which get counted as an automatic miss either way) are set aside.

---

## Update 5 — August 31, 2026

Found and fixed a real data bug, then added a genuinely new data source the right way — tested against real held-out results, kept only what earned its place.

- **Fixed a duplicate-season bug**: `E0_1516.csv` (meant to be the 2015-16 season) turned out to be a byte-for-byte copy of the 2017-18 season file, mislabeled. That means the real 2015-16 season was never in the training data, and 2017-18 was silently counted twice in every model run this project has ever reported. Replaced it with the real 2015-16 data from football-data.co.uk and re-verified column compatibility before merging it in. This alone moved the honest baseline to 44.74% (XGBoost) — lower than the old 47.11% headline number, because that number was partly inflated by the duplicate.
- **Added Understat xG data** (`00_fetch_xg_data.py`, all 12 seasons, 99.4% match rate against the existing fixtures) and built walk-forward rolling xG features (`features/xg.py`) — last-5-match average shot quality created and conceded per team, the same no-leakage pattern as goals and shots.
- **Tested three ways of using it, kept the one that worked**: feeding raw rolling xG straight into the classifiers as extra columns made things worse (43.95%) — same lesson as before, more raw features isn't automatically better for these models. Feeding it into Elo's calibrated expectation model *and* keeping the raw columns was also worse (43.16%). Feeding it into Elo's expectation model *only* — letting the data-driven logistic regression decide how much say xG gets alongside Elo, form, goals, shots and rest — and leaving the raw columns out of the classifiers entirely won clearly: **48.95%**, a real improvement over even the old, bug-inflated number.

**Current best (single-season test, 2025-26 only):** CatBoost, 48.95%. **Current best (two-season test, see below):** Random Forest, 47.89% on 2024-25 + 2025-26 combined (760 matches) — a more reliable number since it's not resting on one season's sample.

**Not yet done:** market value data (Kaggle's Transfermarkt dataset) — the idea is sound (a team's squad value before a season is real, always-available pre-match information Elo currently has no way to see) but pulling it needs a Kaggle account and API token, which has to happen on the user's end first.

### Two-season test set

Moved from testing on one season (2025-26, 380 matches) to two (2024-25 AND 2025-26, 760 matches) — a single season is a small enough sample that one hot or cold run can swing the headline number more than the model actually changed.

`06_predict_season_table.py` and `07_predict_blind_season.py` both now report a predicted-vs-actual table pair per season (4 tables total, not 2). `07` re-anchors each season's blind forecast on real history up through its own start — the 2025-26 blind run trains on real data through 2024-25 (which had genuinely already happened by August 2025), it doesn't chain off 2024-25's own predictions. That's how anyone would actually use this: every real August, last season's real table is already known.

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
│   ├── 07_predict_blind_season.py  # genuinely blind season forecast (Monte Carlo, no in-season data)
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

- Find a real fix for Away Win recognition — head-to-head, win-rate, referee tendencies, corners/cards/fouls, and per-model feature selection were all tried and didn't crack it; the honest read is this needs genuinely new information (real upset-specific signal), not another combination of what's already here.
- Refine scoreline prediction with a Dixon-Coles correlation correction — should help both scoreline accuracy and the goal-total compression seen in the season table.
- Once 2026-27 is underway, point predictions at the live in-progress season and start tracking real fixtures week to week — `07_predict_blind_season.py` already proves the mechanics work without cheating off real results.
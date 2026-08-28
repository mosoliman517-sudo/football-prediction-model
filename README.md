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

A single long working session focused on rigor over raw numbers: finding and fixing real bugs, testing ideas honestly (including ones that didn't pan out), and being precise about what a metric actually measures before trusting it.

### Data integrity

- Found and removed **betting-market data leakage** — closing odds and pooled bookmaker odds columns (Pinnacle, Betbrain, and others) were still flowing into the classifiers' training data. They ranked as the top 2 features by importance, meaning the model was partly reading bookmakers' own predictions instead of learning from Elo/form/goals/shots. All betting columns, opening and closing, across every bookmaker in the raw data, are now stripped in `01_load_data.py`.
- Found and fixed a genuinely blank trailing row in the 2014-15 season file that was silently producing a garbage all-NaN match every run (harmless by accident, not by design).

### Elo, rebuilt

- Replaced the single-rating, flat "+100 for home advantage" Elo with a **dual-track system** — separate home-context and away-context ratings per team, so home advantage is now something that emerges from the data (home teams winning more, empirically) instead of an assumed constant.
- Blended shot-on-target dominance into the *actual* side of each Elo update, so a team that dominated but didn't get the scoreline to match still moves the right direction.
- Built a **calibrated multi-signal expectation model** — a small logistic regression, fit only on training-era matches, that combines Elo, recent form, net goal form, net shot form, and rest-days advantage into one expected outcome, with the significance of each signal measured from the data rather than guessed. (Elo still dominates at ~64% of the combined weight; recent shot form was the biggest surprise at ~23%.)

### Evaluation rigor

- Expanded the test set from one season to two full seasons (2022-23 + 2023-24, ~760 matches) so a single lucky or unlucky season can't swing the whole result.
- Added `config.py` as a single source of truth for the train/test split date — found and fixed real drift between `03_train_model.py` and `04_comparing_models.py` that had gone unnoticed (different date parsing, different Random Forest hyperparameters, silently producing incomparable numbers).
- `03_train_model.py` now trains and evaluates all 5 models plus a soft-voting ensemble in one run, with confusion matrices for each.
- Tried hyperparameter tuning (RandomizedSearchCV, time-respecting cross-validation) on Gradient Boosting. It never beat the untuned defaults on real held-out data, tried twice with two different scoring metrics — removed rather than kept as dead weight.
- Added a permanent **calibration check** (predicted outcome proportions vs. real proportions) after learning the hard way that "recall gap between two classes" and "the model over/under-predicts a class" are not the same question.

### The Home Win bias, actually diagnosed

- Found that every model except Random Forest was predicting Home Win far more than its real rate (as high as 62.5% predicted vs. a true 47.2%), because nothing was correcting for Home Win being the most common outcome in the data.
- Applied class-balanced sample weighting uniformly across all 5 models. Confirmed via the calibration check that this is a real fix, not a stylistic swap — it's the best-calibrated option of everything tested (unweighted, fully balanced, half-strength balanced).
- Also confirmed, honestly, what it *didn't* fix: Away Win recall barely moved. The correction mostly repaired Draw's near-total collapse and pulled Home Win back toward reality — it did not meaningfully improve the model's ability to recognize a genuine away win. That's flagged as a real, open gap (see Next Steps).

### Draw handling — tried two mechanisms, kept neither

- Tried multiplying each model's predicted Draw probability by a measured factor. Rejected: it started calling Draw on matches the model was genuinely confident about, just to hit a higher Draw count.
- Tried a margin-based rule (call Draw only when the model sees Home and Away as close). More honest, but still traded away real Home/Away accuracy for Draw sensitivity.
- Decided the class-balanced weighting above was the more honest fix and reverted to plain prediction. The margin-based code is kept in `draw_boost.py`, unused by default, in case it's worth revisiting.

### Scoreline prediction

- Built `05_predict_scoreline.py` — a Poisson goal model (two regressions predicting expected home/away goals separately, using the same pre-match features as the classifiers) that derives a full scoreline probability grid, Win/Draw/Loss probabilities, and the single most likely scoreline all from the same underlying prediction, instead of guessing a class directly.
- Its predicted outcome proportions are dramatically better calibrated than any classifier (worst gap ~2 points vs. the classifiers' ~15-20 point gap), even though — like the classifiers — it almost never picks Draw as the single most likely outcome for any one match. That's structurally correct, not a bug: Draw is a narrower slice of outcome-space than "somebody wins," the same way it rarely is a bookmaker's own outright favorite.
- Includes `predict_fixture(home_team, away_team, df)` for predicting specific matchups by name, with a typo-tolerant error message.

### Current Best Result

- **Best model:** CatBoost
- **Accuracy:** **51.84%**
- **Evaluation seasons:** 2022-23 and 2023-24 Premier League (760 matches)

This isn't a new high score over Update 3's 57.1% — it's a more honest one. That number was on one season with data leakage still in the training set; this one is odds-free, class-balanced, and measured over twice the matches.

---

# Current Project Structure

```
football-prediction-model/
│
├── 01_data/
├── 02_processed_data/
├── 03_models/
├── 04_source/
│   ├── 01_load_data.py
│   ├── 02_load_features.py
│   ├── 03_comparing_models.py
│   ├── 04_train_model.py
│   └── features/
│       ├── form.py
│       ├── goals.py
│       ├── shots.py
│       ├── rest_days.py
│       └── elo.py
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

- Finish integrating the Elo rating system into the training pipeline.
- Add Last 10 form and rolling performance features.
- Hyperparameter tune each model.
- Experiment with ensemble models.
- Increase prediction accuracy beyond 60%.
- Predict exact match scorelines instead of only match outcomes.
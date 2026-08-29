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

**Current best:** CatBoost, 51.84% on 2 full seasons (760 matches) — lower than Update 3's 57.1%, but that number included data leakage on a single season; this one is odds-free and measured on twice the matches. On decisive (non-draw) matches specifically, the same model calls the right winner **71.9%** of the time.

*Taking a break here for academic reasons — picking this back up when I have time.*

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
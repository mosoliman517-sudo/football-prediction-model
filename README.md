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

## Update 4 — August 28 – September 4, 2026

A week focused on rigor: real bugs found and fixed, two genuinely new data sources added the honest way, and a real fix for the model's biggest known flaw — every change tested against real held-out results, kept only if it actually earned its place.

- Removed **betting-market data leakage**, rebuilt Elo as a dual-track home/away system with a calibrated expectation model, and fixed an early Home Win over-prediction bug with per-model class-balanced weighting.
- Found and fixed a real **data bug**: the 2015-16 season file turned out to be a mislabeled, byte-for-byte duplicate of 2017-18 — the real 2015-16 season had never been in the training data, and 2017-18 was silently double-counted in every result this project has ever reported. Replaced with the real season data.
- Added `05_predict_scoreline.py` (Poisson goal model), `06_predict_season_table.py` (real predicted-vs-actual league table), and `07_predict_blind_season.py` (a genuinely blind Monte Carlo season forecast that never reads the season it's predicting).
- Added two new data sources — **Understat xG** and **Kaggle Transfermarkt market value** — each tested multiple ways before deciding how to use it: xG only helps when fed into Elo's calibration (raw xG columns actively hurt); market value helps broadly as a direct feature across every model, and Elo's own model rates it nearly as significant as Elo itself.
- Diagnosed the real cause of the Home Win bias: Elo's home/away rating pools carry a structural home-field tilt by design, so the model needed far less evidence to call Home than Away. Built and validated a real fix — a probability threshold correction chosen via multi-fold internal validation, not a hand-picked rule — trading some raw accuracy for genuinely better Away/Draw recognition, a deliberate call.
- Moved to a **two-season test set** (2024-25 + 2025-26, 760 matches) for a more reliable number, and split `06`/`07` into a proper predicted-vs-actual table per season (4 tables, not 2) — `07` now re-anchors each blind forecast on real history through its own season start, the way anyone would actually use it.
- Tested and honestly rejected a long list of further ideas — hyperparameter tuning, draw-forcing mechanisms, isotonic probability calibration, referee tendencies, corners/cards/fouls, per-model feature selection, a de-trended Elo signal, and more. Each had a real rationale, each got a real test, each got reverted the moment it didn't hold up.
- Full codebase audit: deleted `draw_boost.py` (fully dead, zero references), removed unused variables/imports, fixed stale comments left over from earlier changes. Verified clean with `pyflakes`.
- Tested "clean up Elo" (strip it to just results + opponent strength + form, move everything else out as independent features) — a fair test, but the data said no: roughly a wash on average, helping some models and hurting others equally.
- Added **transfer activity** (Kaggle Transfermarkt) — summer transfer window volume and net spend per team. Tested the same rigorous way as xG: as a raw feature (net negative), and fed into Elo's calibration only (genuine, broad improvement). Kept the winning version, discarded the rest — including the combination of both ideas together, which was the *worst* result of everything tested. A real but modest effect: net transfer spend correlates weakly-positively with that season's points (r=0.20), buying activity specifically a bit more (r=0.31) — matches its small (~1.5%) share of Elo's calibrated weight, not a dominant signal on its own.
- Fixed the ensemble to pick its members by validation instead of always averaging all 5 — dropping CatBoost (not the weakest model solo) turned out to beat using all 5, because its errors overlapped too much with the other boosted-tree models rather than adding real diversity.
- Added **table position** (`features/table_position.py`) — where a team actually sits in the table right now (walk-forward within-season standings, zero new data needed, computed from results already in the pipeline). Genuinely different information from recent form or Elo: a winning streak climbing from 10th means something different than the same streak climbing from 18th. Tested as a raw feature, an Elo signal, and both together — both together won clearly, pushing Random Forest to **49.34%**, the best single number this project has produced. Trade-off disclosed and kept deliberately: it's a clear win in `03`/`04`/`05`/`06` (06's real position error dropped to 1.7/2.3 places), but a modest regression in `07`'s blind forecast (2025-26 error 4.2→4.7 places) since predicted standings compound their own error there in a way real standings never do elsewhere.

**This week's trajectory** (two-season test, 760 matches):

| Stage | Best Model | Accuracy | Away Win Recall |
|---|---|---|---|
| Baseline (data bug fixed, xG added) | Random Forest | 47.89% | 52% |
| + Home Win bias correction | Random Forest | 47.50% | 53% |
| + Market value | Random Forest | 48.03% | 57% |
| + Transfer activity (Elo signal) | LightGBM | 48.03% | — |
| + Validated ensemble selection | Ensemble (RF + XGBoost) | 48.16% | — |
| + Table position (current) | **Random Forest** | **49.34%** | — |

**Current best:** Random Forest, 49.34% on 2024-25 + 2025-26 combined.

---

## Update 5 — September 2, 2026

Five new pre-match data ideas, each tested individually, then an exhaustive search over every combination of the survivors — scored by internal validation throughout, never by peeking at the real test set to choose.

- **Schedule** (`features/schedule.py`) — day of week, weekend flag, kickoff hour. Free: already sitting in the raw files (kickoff time from 2019-20 on, day of week derivable for all 12 seasons). Raw feature, individually mixed (Random Forest hit 50.00% solo).
- **Fixture congestion** (`features/fixture_congestion.py`) — did a team play Champions/Europa/Conference League (or qualifiers) in the 4 days before this match, the "European hangover" effect. Raw feature, a broad individual win (helped 4 of 5 models).
- **Squad average age** (`features/squad_age.py`) — resolved the same way as market value (each player's age as of the season start, correctly handling summer transfers). Individually a clear **net negative** in every form tested.
- **Manager tenure** (`features/manager_tenure.py`) — real manager-change dates detected from Transfermarkt's own recorded manager per match, plus a "new manager bounce" flag (within 45 days of an appointment). Elo-signal only, a genuine individual win.
- **Weather** (Open-Meteo historical API, one query per stadium, resolved to the hour closest to actual kickoff) — temperature, precipitation, wind. Individually a net negative, and structurally can't take an Elo-signal form (both teams experience the same weather).

Weather was dropped before the combination search (conclusively negative alone, confirmed on real data). The remaining 4 went through a genuine 16-combination grid (every on/off pattern), each one trained and scored on a held-out internal validation slice, never the real test set — the same discipline used everywhere else in this project. The winner was a real surprise: **all four together**, including squad age, which had been a clear loser on its own. Real interaction effect, not a fluke — it shows up consistently across the top of the ranked results, not just in first place.

**New official pipeline**: schedule + fixture congestion as raw classifier features; manager tenure + squad age through Elo's calibration only (not raw features) — matching the winning combination exactly.

**New best: Random Forest, 49.61%**, Away Win recall **60%** (up from 45% at the start of this project's rigor phase). Full classification report: Away Win 60% recall / 47% precision, Home Win 63% recall / 57% precision, Draw 15% recall (still the hard one).

---

# Current Project Structure

```
football-prediction-model/
│
├── 01_data/                        # raw season CSVs
├── 01_data_xg/                     # Understat xG data, one CSV per season
├── 01_data_market_value/           # Kaggle Transfermarkt data (clubs, player valuations)
├── 02_processed_data/              # engineered datasets (E0_features.csv, E0_model.csv)
├── src/
│   ├── config.py                   # shared constants (train/test split date)
│   ├── 00_fetch_xg_data.py         # pulls Understat xG data
│   ├── 01_load_data.py
│   ├── 02_load_features.py
│   ├── 03_train_model.py           # trains + compares all 5 models + a validated ensemble
│   ├── 04_comparing_models.py      # lighter-weight version of the same comparison
│   ├── 05_predict_scoreline.py     # Poisson goal model — Win/Draw/Loss + scorelines
│   ├── 06_predict_season_table.py  # simulates each held-out season, predicted vs. actual table
│   ├── 07_predict_blind_season.py  # genuinely blind season forecast (Monte Carlo, no in-season data)
│   └── features/
│       ├── form.py                 # points-based form + win-rate
│       ├── goals.py
│       ├── shots.py
│       ├── xg.py                   # walk-forward rolling xG (Understat)
│       ├── market_value.py         # season-start squad market value (Transfermarkt)
│       ├── transfer_activity.py    # summer transfer window volume/spend (Transfermarkt)
│       ├── table_position.py       # walk-forward in-season table standings
│       ├── schedule.py             # kickoff day/time
│       ├── fixture_congestion.py   # midweek European fixture fatigue
│       ├── squad_age.py            # season-start squad average age (Transfermarkt)
│       ├── manager_tenure.py       # manager tenure + "new manager bounce"
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

- ~~Starting-XI market value~~ — tested: real per-match starting lineups from `game_lineups.csv`, resolved to combined starting-XI value (100% match rate against every fixture). The theory was sound (captures injuries/rotation, unlike a season-level snapshot) but it's 93% correlated with the squad value already in use — turned out to add match-to-match noise, not new information. Worse in every form tested (raw feature, Elo signal, both). Not adopted.
- ~~Clean up Elo's architecture~~ — tested (stripping Elo to just results + opponent strength + form, moving shots/xG/rest-days/transfer-activity out as independent features): roughly a wash, helped some models and hurt others about equally. Not adopted. Adding transfer activity INTO Elo's calibration (the opposite direction) was the actual winner instead.
- ~~Weather~~ — tested: real historical weather (temperature, precipitation, wind) at the home ground, resolved to actual kickoff hour via the Open-Meteo API. Net negative alone, and structurally can't take an Elo-signal form (weather is identical for both teams at a shared venue). Not adopted.
- ~~Account for manager changes~~ — done: `manager_tenure.py` detects real manager-change dates and a "new manager bounce" window, fed into Elo's calibration. A genuine individual win, and part of the best validated combination.
- Away Win recognition has real, measured progress now (recall 45% → 60% across this project's rigor phase) but isn't fully solved — head-to-head, win-rate, referee tendencies, corners/cards/fouls, per-model feature selection, weather, and a de-trended Elo signal were all tried along the way and didn't move the needle on their own.
- Refine scoreline prediction with a Dixon-Coles correlation correction — should help both scoreline accuracy and the goal-total compression seen in the season table.
- Once 2026-27 is underway, point predictions at the live in-progress season and start tracking real fixtures week to week — `07_predict_blind_season.py` already proves the mechanics work without cheating off real results.
- Squad age helping only in combination (not alone) suggests other individually-negative ideas might be worth a second look *in combination* rather than assumed dead for good — starting-XI value and the de-trended Elo signal are the two best candidates to revisit that way.
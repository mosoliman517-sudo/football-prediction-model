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

**New best: Random Forest, 49.61%**, Away Win recall **60%** (up from 45% at the start of this project's rigor phase). Full classification report: Away Win 60% recall / 47% precision, Home Win 63% recall / 57% precision, Draw 15% recall.

**Two more real findings, same day:**

- Squad age helping only in *combination* raised an obvious follow-up: would the de-trended Elo signal from an earlier session (`EloEdgeAboveAverage`, reverted back then for helping only 1 of 5 models) do better alongside today's new signals? Re-tested on top of the winning combination: genuinely mixed, not a clean win — Random Forest (the flagship model) got measurably *worse* (49.61% → 48.82%) while LightGBM improved and a 3-model ensemble reached 47.63%, still below Random Forest alone. Not adopted by default; the code keeps it available (computed but excluded from `SIGNAL_COLUMNS`) for a future combination search now that even more signals exist.
- **Draw recall was stuck around 14-16%** across every model even after the Home-penalty fix. Extended that same validated technique (never a hand-picked quota) to a second, jointly-searched parameter: a Draw probability boost alongside the existing Home penalty, both chosen together via the same 3-fold internal validation. Real result, not a wash — f1_macro improved for **every one of the 5 models**, and Draw recall roughly doubled (Random Forest 14%→23%, XGBoost 12%→25%, CatBoost 14%→27%), at an accuracy cost ranging from ~0 (Gradient Boosting, where the search correctly found no adjustment helps) to -2.5% (CatBoost, the steepest trade). Adopted for all 5 models.

**Final numbers after the Draw-boost adoption:** Random Forest, 49.08% accuracy, Away Win 55% recall, Home Win 60% recall, **Draw 23% recall** (up from 15%) — the real, deliberate trade of a little raw accuracy for a model that actually tries on Draw instead of defaulting away from it.

**How far can Home/Away recall go, and is 60/60/30 reachable?** Swept a wide grid of decision thresholds on Random Forest to answer this directly rather than guess: no combination reaches Home ≥60%, Away ≥60% AND Draw ≥30% at once — every extra match called "Draw" is one fewer chance to correctly call Home or Away, a real structural ceiling from splitting one argmax decision three ways, not a tuning shortfall. What the sweep found instead was a genuine trade-off frontier, which became the basis for three named, independently-validated **profiles** on the same trained Random Forest (`03_train_model.py`, no retraining — just a different decision rule per profile, each chosen by internal validation for its own explicit goal):

| Profile | Objective | Home | Away | Draw | Accuracy |
|---|---|---|---|---|---|
| Decisive | max(min(Home recall, Away recall)), Draw ignored | 72% | 67% | 0% | 52% |
| Balanced | max(f1_macro across all 3) | 62% | 47% | 28% | 48% |
| **Even** | max(min(Home, Away, Draw recall)) | 50% | 50% | **37%** | 47% |

Decisive is the best pure win/loss caller this project has produced, but sacrifices Draw entirely (rejected once seen for exactly that reason — draws are part of the game). Even is the honest answer to "why not a good balance instead of hyperfocusing on one thing" — it's not an average that tolerates one weak class, it directly maximizes whichever class is doing *worst*, which is the actual definition of balanced. 37% Draw recall is the best this project has found anywhere, at any config.

---

## Update 6 — September 2, 2026

A pass built around three named final profiles, a full correctness audit of every feature module, and a significant real bug found along the way — the kind of "genuinely nothing more we can do, for now" pass rather than another single feature.

### A real bug, wider than it first looked

Sanity-checking a new feature's output (average final-standing placement across a team's last 3 seasons) turned up an impossible max value — a 20-team league producing a 21st position. Traced to `get_season()`, the shared season-boundary function every part of this project uses: it treated `month >= 7` as "a new season has started," which is true almost every year, except one. The real 2019-20 season was suspended by COVID and resumed as "Project Restart," with matches played through **July 26, 2020** — so every match in that window was silently misfiled into the 2020-21 season, merging two seasons' standings into one 23-team table and truncating 2019-20 itself.

`get_season()` is shared infrastructure, not a one-feature bug: fixing it at the source (cutoff moved to `month >= 8`, verified safe — no other season ever starts before August or runs past May) automatically corrected Elo's season-reversion timing and `table_position.py`'s standings resets. But a further audit found the **same buggy logic independently copy-pasted in three more files** — `market_value.py`, `squad_age.py`, and `transfer_activity.py` — each computing its own season-year column by hand instead of calling the shared function, so each silently carried the same one-season COVID bug on its own. All three now import and call the real `get_season()` instead. Measured impact was small (this only ever affects one season's transition), as expected for a correctness fix rather than a modeling change — kept on principle, and because duplicated logic like this is exactly the kind of thing that causes real bugs later.

### Two new features, tested the established way

Two genuinely new signals, both built from data already in the pipeline (no new source needed) and both put through the project's standard three-way test — raw classifier feature, Elo-signal-only, and both together:

- **Manager career experience** (`features/manager_experience.py`) — how many career Premier League matches the current manager has taken charge of, resolved from Transfermarkt's own recorded manager per match (the same timeline `manager_tenure.py` already builds, reused rather than duplicated).
- **Recent placement** (`features/recent_placement.py`) — each team's average final league position across its last 3 completed seasons. A different timescale than anything else in the pipeline: not this season's live standing (`table_position.py`), not Elo's continuous form-weighted rating — a multi-year "what level does this club actually operate at" read that one hot start or one bad season can't fake. This is also the feature whose sanity check surfaced the COVID bug above.

Raw classifier features won clearly (avg accuracy 46.74% vs. 46.06% for Elo-signal-only vs. 44.92% for both together — "both" losing again, the same pattern seen with transfer activity, table position, and squad age earlier in this project). Both are now raw features (`HomeManagerExperience`/`AwayManagerExperience`, `HomeRecentAvgPlacement`/`AwayRecentAvgPlacement`), wired through `05`/`06`/`07`'s prediction paths the same way squad value and table position already were — including a real-data lookup in `07`'s blind simulation, since both are genuinely knowable in advance for a real season rather than something that needs simulating.

### Full-codebase audit

Every feature module was re-read end to end for walk-forward correctness (each rolling feature only ever sees strictly-prior rows) — `form.py`, `goals.py`, `shots.py`, `rest_days.py`, `head_to_head.py`, `half_time.py`, `schedule.py`, `fixture_congestion.py`, `manager_tenure.py` — no leakage found beyond the `get_season` bug above, which was fixed at its four real locations. `pyflakes` clean across the whole `src/` tree.

### Three final profiles, made official

The Decisive / Balanced / Even exploration from earlier the same day converged into three deliberately-scoped, permanent profiles on Random Forest (`03_train_model.py`, still no retraining — only the decision threshold changes per profile):

| Profile | Objective | Home | Away | Draw | Accuracy |
|---|---|---|---|---|---|
| **Balanced** | max(min(Home, Away, Draw recall)) — true 3-way balance | 51% | 47% | 34% | 45% |
| **Deadkill** | max(accuracy), no balance constraint | 72% | 61% | 0% | 50% |
| **Target 60/60/40** | max(min(recall ÷ its own target)) — aims at a named ratio, not equality | 55% | 50% | 26% | 46% |

Target 60/60/40 got a much finer search grid than the other two (0.05/0.1/0.1 resolution across wide ranges) specifically to get as close to that ambitious target as the model can genuinely reach — it lands short of it (55/50/26, not 60/60/40), an honest finding about where this feature set's real achievability frontier sits, not a search that gave up early. Balanced remains the best Draw number this project has found in any configuration.

### The honest net effect

The correctness fix and the two new raw features moved the project's best single number slightly: Ensemble (XGBoost + Random Forest) 49.47%, XGBoost 49.34% — both a shade below the previous session's Random-Forest peak of 49.61%. Consistent with everything measured today (the bug fix alone was near-neutral; the new features won their own individual tests), this modest net change is most likely the new features and the corrected data interacting slightly differently with Random Forest's own decision boundary than the previous configuration did — not a regression in anything tested in isolation. Reported honestly rather than reframed, the same standard held throughout this project.

Blind-season forecast (`07`, fully re-verified end to end with everything above): 2024-25 mean absolute position error 3.2 places, 2025-26 4.4 places (previously 4.2 — within this simulation's own run-to-run noise, std dev 2-5 places per team).

## Update 7 — November 13, 2026

Picked the project back up after a long gap. Step zero was proving the foundation: a fresh clone from GitHub reproduced the Sep 2 numbers exactly (ensemble 49.47%, XGBoost 49.34%, Random Forest 48.29%), so everything below is measured against a verified baseline. Then every open item from Update 6's Next Steps was tested the established way (change one thing, compare against the baseline, keep it only if it measurably helps). **All three came back negative — nothing was adopted, and the code is unchanged.**

- **Dixon-Coles correction for the scoreline model (`05`)** — fitted the low-score correlation parameter ρ by maximum likelihood on the training seasons only. It came out at **ρ = −0.02, essentially zero**: test log-likelihood improved by 0.0008 per match and the average predicted draw probability moved from 22.7% to 23.1% (real rate 25.9%). A second variant, inflating every tied scoreline by a fitted factor δ, was also tested: the training data chose **δ = 0**. The scoreline model's slight draw under-prediction on the test seasons reflects those two seasons simply having more draws than usual, not a structural flaw — Elo and form already absorb the structure Dixon-Coles targets. Not adopted.
- **Draw-propensity features** — the first feature idea aimed squarely at Draw, the model's weakest class: each team's draw rate over its last 10 matches and its average total goals per match over its last 10 (low-scoring, drawish teams), built walk-forward with no leakage. As raw classifier features they were a net loss (average accuracy 47.97% → 47.24%, Draw F1 0.218 → 0.196). Tested each pair separately: goals-only gave XGBoost 50.00% (the best individual number seen) but dropped CatBoost 1.9 points, average Draw F1 up 0.02 (inside the noise) with average accuracy down 0.9; rates-only was worse. These signals structurally can't go through Elo's calibration either, since Elo is trained on decisive matches only and a draw-propensity signal has no home-vs-away direction. Not adopted, module deleted.
- **De-trended Elo signal (`EloEdgeAboveAverage`) re-tested with the larger feature set** — switched on as an active Elo signal. At default thresholds it raised average Draw F1 (0.218 → 0.252) but cost average accuracy (47.97% → 46.55%), and in the three tuned Random Forest profiles the Draw gain vanished: Balanced 52/34/46 vs 51/34/47, Deadkill 73/0/60 vs 72/0/61, Target 60/60/40 trading 3 points of Away recall for 4 of Draw; best overall accuracy fell (ensemble 48.95% vs 49.47%). The default-threshold Draw gain was a threshold artefact, not a real improvement. Still dormant: computed in `elo.py`, excluded from `SIGNAL_COLUMNS`.

### Adding the 2026-27 season, and a correction that moved the baseline

- **New data.** Downloaded `E0_2627.csv` from football-data.co.uk (100 matches, 21 Aug to 8 Nov 2026, 20 teams including newly promoted Coventry). Kept strictly separate from the benchmark: `config.LIVE_SEASON_START` splits the pipeline's output into `E0_features.csv` / `E0_model.csv` (the 4,560-match benchmark, unchanged in scope) and `E0_live_features.csv` / `E0_live_model.csv` (2026-27). The model never trains on the live season and the 760-match test set never grows, so benchmark numbers stay comparable run to run.
- **Coventry has no Transfermarkt record at all** in the Kaggle dataset, which used to turn into a squad value of 0 ("this squad is worth nothing"). Missing squad values now fall back to that season's lowest known EPL squad value, the honest stand-in for a newly promoted side. Verified it never triggers for 2014-15 through 2025-26. Coventry was also added to the Transfermarkt name maps.
- **Known staleness in the live rows:** Understat xG, the Kaggle manager records and its European-fixture data all stop at the end of 2025-26, so 2026-27 xG form, manager tenure and midweek-Europe flags are carried forward or default. Refreshing them needs a new Understat fetch (`00_fetch_xg_data.py`) and a newer Kaggle download.
- **Bug found while adding the file: table position depended on row order.** `table_position.py` updated the table row by row, so a match could "see" other results from the same day that happened to sit above it in the file. That order is arbitrary (it changed when a season file was added) and a simultaneous kickoff could never know those results. Each match is now ranked from the table as it stood at the start of its day. Nothing else in the 4,560 historical rows changed.
- **Corrected baseline (same 760 matches):** ensemble **48.55%**, Gradient Boosting 47.50%, XGBoost 47.50%, Random Forest 47.37%, CatBoost 47.24%, LightGBM 47.11% (previously 49.47 / 47.76 / 49.34 / 48.29 / 46.32 / 48.16). The old figures were probably flattered a little by the same-day look-ahead, but single changes have swung per-model results by 1-2 points all along, so the share that was leak and the share that was noise can't be separated. 48.55% is the number to beat from here. Bet365's favourite is still 51.4% on the same matches. Blind-season forecast (`07`) after the fix: 3.2 places (2024-25) and 4.0 (2025-26), against 3.2 and 4.4 before. `06`'s real-position error is 1.9 and 2.9 places. The tuned profiles barely moved: Balanced 49/35/46 (Home/Draw/Away recall, 44% accuracy), Deadkill 72/0/59 (49%), Target 60/60/40 51/29/49 (45%).

### Season Wrapped (the interactive page)

`src/08_build_wrapped.py` builds `site/season_wrapped.html` from the saved Random Forest probabilities (`03_train_model.py` now writes `02_processed_data/rf_predictions.csv` and `rf_profiles.json` for every match the model never trained on, benchmark and live). It is one self-contained page: pick a season (2024-25, 2025-26, or 2026-27 live) and a profile (Raw, Balanced, Deadkill, Target 60/60/40), then replay the season round by round. A live scorecard, an accuracy-over-time chart against the bookmaker line, each round's matches with a probability bar and a right/wrong mark, and a real-versus-model league table with position differences all update as it plays. Below the replay is a recap: the headline accuracy against the bookmaker and an always-Home baseline, recall by outcome, boldest correct calls, the matches that surprised the model most, longest right and wrong streaks, the easiest and hardest teams to read, and the biggest blind spots in the table. Profiles are applied in the browser, so switching is instant. Rebuild after any retrain: `python3 src/03_train_model.py && python3 src/08_build_wrapped.py`.

### Match lab: simulate any 2026-27 match, then be scored on it

The Season Wrapped page has a lab for the live season. Pick a home and an away team:

- **Already played:** the model's call (using the exact pre-match features) against the real result, the scoreline odds with the real score highlighted and ranked, and a button that draws random scorelines from those odds so you can see how often a simulation lands the real result.
- **Not played yet:** a forecast, the same scoreline odds, a "Simulate this match" button and "Save my call". Saved calls are stored privately per viewer (the artifact's `db` capability, falling back to browser storage) and are scored automatically once the real result appears in the data after a rebuild. A tally tracks calls right, simulated results right and exact scores.

How an unplayed match gets features (`features/fixture_grid.py`, written by `02_load_features.py` to `E0_grid_model.csv`): every possible pairing of the 20 live-season teams (380 rows) is built from each team's latest state. Rolling form and Elo come from the team's most recent match (so they are one match stale), table position and points gap come from the real current standings, head-to-head from all history, and kickoff day/time, rest days and European fixtures take neutral values because they are unknown. `03` scores the grid with the Random Forest and `05` with the Poisson goal models. **Measured against the 100 matches already played** (where exact features exist), the quick version has 0.90 to 0.93 correlation on Home/Away probabilities and picks the same result 80% of the time, and the page states that number.

Two guards came out of this. **Live rows can no longer carry post-match information:** the newer football-data file includes the match's own xG and closing odds columns; they are empty in every benchmark row (so the 760-match numbers were never affected, and trees ignore a column that was constant in training), but any column empty throughout the benchmark is now blanked in the live file too. And the Transfermarkt name map now lives once in `features/team_names.py`, not in five pasted copies.

**Understat xG for 2026-27 could not be fetched.** Its data endpoint now returns a content-free placeholder page to scripted requests for every season, so `00_fetch_xg_data.py` fails everywhere (it now accepts season arguments, e.g. `python3 src/00_fetch_xg_data.py 2026`, once that works again). The live rows carry last season's xG form forward.

**What this says about the ceiling.** Four different kinds of idea aimed at Draw (threshold tuning, scoreline-model corrections, draw-propensity features, an extra Elo signal) have now each been tested honestly, and Draw recall at roughly 34% (Balanced profile) looks like where this data runs out. Pre-match data from these three sources describes how strong each side is and what situation they're in, but a draw is largely what happens when a match stays tight and nobody scores late — which isn't knowable before kickoff. The honest conclusion is that further gains likely need genuinely new *kinds* of information (lineups and injuries on the day, referee-and-weather interactions, or bookmaker-implied probabilities, which this project deliberately excludes) rather than more feature engineering on the same sources.

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
│   ├── 08_build_wrapped.py         # builds the interactive Season Wrapped page from saved predictions
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
│       ├── manager_experience.py   # manager's career EPL match count
│       ├── team_names.py           # shared Transfermarkt -> project team-name map
│       ├── fixture_grid.py         # features for every possible live-season pairing (unplayed matches)
│       ├── recent_placement.py     # team's avg final position, last 3 seasons
│       ├── rest_days.py
│       ├── head_to_head.py
│       ├── half_time.py            # second-half goal patterns
│       └── elo.py                  # dual-track Elo + calibrated expectation model
│
├── site/                           # Season Wrapped page (template + built HTML)
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
- ~~Manager's career experience / team's recent-years placement~~ — done: `manager_experience.py` and `recent_placement.py`, both raw features, both real wins (see Update 6). `RecentPlacementGap`'s Elo-signal form (not adopted — raw won) still earned 20.2% of Elo's calibrated weight, second only to Elo itself, so it's worth a second look in future combination searches even though raw is the current default.
- Away Win recognition has real, measured progress now (recall 45% → 60% across this project's rigor phase) but isn't fully solved — head-to-head, win-rate, referee tendencies, corners/cards/fouls, per-model feature selection, weather, and a de-trended Elo signal were all tried along the way and didn't move the needle on their own.
- ~~Dixon-Coles correction for the scoreline model~~ — tested: fitted ρ = −0.02 (essentially zero), a draw-diagonal inflation fitted δ = 0. No measurable benefit. Not adopted (see Update 7).
- Once 2026-27 is underway, point predictions at the live in-progress season and start tracking real fixtures week to week — `07_predict_blind_season.py` already proves the mechanics work without cheating off real results.
- Squad age helping only in combination (not alone) suggests other individually-negative ideas might be worth a second look *in combination* rather than assumed dead for good — starting-XI value, the de-trended Elo signal (`EloEdgeAboveAverage`, still computed but excluded from `SIGNAL_COLUMNS`), and now `RecentPlacementGap`'s Elo-signal form are the best candidates to revisit that way, especially now that the feature set is larger than when each was last tried.
- **Refresh the 2026-27 inputs:** pull the new Understat season with `00_fetch_xg_data.py` and download a newer Kaggle Transfermarkt copy (needs a Kaggle login) so the live season's xG form, managers and European fixtures stop being carried forward. Then re-run `01`, `02`, `03`, `08` to roll the live season forward.
- **Deduplicate `TEAM_NAME_MAP`:** the Transfermarkt-to-project team-name map is copy-pasted in five feature files (it needed the same Coventry edit five times). Same shape as the old `get_season` duplication: it should live in one shared module.
- Target 60/60/40 landed at a real 55/50/26 on Random Forest's current decision surface — short of the named target, and that gap looks like a genuine ceiling of this feature set rather than a search limitation (the grid used was already fine-resolution). Closing it further probably needs a new signal that separates Draw-likely matches more cleanly, not another threshold search on the same probabilities.
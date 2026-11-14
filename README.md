## Football Match Prediction Model

> **Resuming after a break? Read this box first.**
>
> **What this is.** A machine-learning model that predicts Premier League results (Home win / Draw / Away win) using only information known before kickoff, tested on matches it never trained on (2024-25 and 2025-26, 760 matches). It started as one season of CSVs and grew into 12 seasons, ~50 features, five tree models, a Poisson goal model, two tuned "playing styles" (Balanced and Max Accuracy, plus the untouched Pure Model), two kinds of season simulation, and an interactive page. The aim: a model that is **balanced**, with Home and Away recall near 60% and Draw 30-40%, instead of one that only ever calls Home wins.
>
> **Where it stands (Nov 2026).** On the 760 held-out matches: the goal model gets **50.0%**, our blend of goal model and forest **49.9%**, Bet365's pre-match favourite **51.6%**, and the opt-in hybrid that stacks our blend with Bet365's odds **52.1%**. A plain "always Home" is 41.7%. The gap to the market is information (lineups, injuries, news), not modelling: stacking the two gains almost nothing, so our features add very little the odds don't already contain. Best balance found: the hybrid's Balanced style at Home 48 / Draw 38 / Away 41; on our own data alone, Balanced is 44 / 36 / 46. Draw is the hard part. Everything is on GitHub and reproducible from a fresh clone.
>
> **The commands that matter.**
>
> ```bash
> ./refresh.sh                 # download latest 2026-27 results, rebuild everything, verify (~12 min)
> ./refresh.sh --no-download   # rebuild from the results file already in 01_data/
> ./refresh.sh --check         # also run the live-flow proof (11_check_live_flow.py, +5 min)
> ```
>
> Then republish `site/season_wrapped.html` (ask Claude to "republish the page"). The built page and the club badges are git-ignored: on a fresh clone run `python3 src/13_fetch_crests.py` once, then `python3 src/08_build_wrapped.py`. Live page: https://claude.ai/artifact/MDgzUP3phkTSLBR4WN29q4 (private).
>
> **Pipeline order** (from the project root): `01_load_data` -> `02_load_features` -> `03_train_model` -> `05_predict_scoreline` -> `10_tune_blend_profiles` -> `09_validate_simulation` -> `12_blind_rest_of_season` -> `08_build_wrapped`. `04` is a quick model comparison, `06` and `07` are season-table simulations (07 shares its engine with 12 through `blind_engine.py`), `11` proves the live season follows along correctly. `refresh.sh` runs the chain for you.
>
> **The two simulation rules (do not mix them up).** Replays and next-matchday forecasts are built from **real past results only**; Elo, form and the table update after every real matchday. The **blind** simulations (`07`, `12`) are the one place predicted results feed predictions: after each *simulated* match, state updates with the simulated result.
>
> **Known limits, stated plainly.** (1) Understat (xG) blocks scripted requests, so 2026-27 xG form is carried forward from last season. (2) The Kaggle Transfermarkt data stops in July 2026, so 2026-27 managers and European fixtures are stale; a newer download needs your Kaggle login. (3) football-data's `fixtures.csv` has no Premier League rows during international breaks, so there are no real kickoff dates; the page knows exactly *which* matches remain but not *when*. (4) Forecasts for unplayed matches use neutral values for kickoff time, rest days and European games. (5) Exact scores are not predictable: guessing 1-1 every time beats naming a score that fits each call. (6) The per-model accuracy printed by `03` swings by several points on a noisy tuning step (see Update 8); compare things by log loss and plain accuracy instead.
>
> **Open ideas, not yet built.** More training seasons (football-data goes back to 1993); the free Fantasy Premier League API for injuries and availability; real kickoff dates once the fixtures file has them; a newer Kaggle copy and a working xG source; revisiting individually-rejected features in combination.

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

> **Numbers in this update were measured before the feature fix described in Update 8.** The conclusions hold, but several figures moved (for example the Balanced profile's Draw recall is 36%, not 40%). Update 8 has the current values and says what changed.

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

### Does the simulation make sense? (`09_validate_simulation.py`)

Asked directly whether the single-match and season simulations are anything more than a random number generator, so each was tested against the 760 held-out matches, with a baseline that knows nothing. Full results are on the page ("Is it just a random number generator?") and in `02_processed_data/validation.json`.

- **Single match odds carry real information.** Log loss (lower is better) on matches never trained on: knows-nothing baseline (league-wide H/D/A rates) 1.083, Random Forest 1.023, Poisson goal model 1.014, an even blend of the two 1.012. Picking the right result: 41.7%, 48.0%, 49.9%, 49.6%.
- **The Random Forest's raw probabilities were biased**, because class-balanced training pushed them away from reality (average Home 38.1% against 41.7% real, Draw 29.2% against 25.9%). The goal model is biased the other way (Home 44.4%, Draw 22.7%). Their blend matches the real rates almost exactly (Home 41.2%, Draw 25.9%) and has the best log loss, so **the blend is now every percentage the page shows**. A profile only decides the *call*. Before this fix the page showed the profile's adjusted scores as if they were probabilities; those inflate or deflate Draw by design (Deadkill's expected-points table gave 54.3 points per team against 52.0 real, Balanced 50.3; the blend gives 52.0).
- **Scorelines look like football but are not predictions.** Mean goals 1.59/1.31 predicted against 1.52/1.32 real, goal-count distribution close (home 4+ goals slightly over-predicted, 68 against 51). The goal model beats just using league score frequencies on log-likelihood (-2.936 against -3.016 per match), a small real edge. Exact scores are a different story: always guessing 1-1 is right 12.1% of the time and the model's best-score guess 11.7%, so a simulated score is one draw from honest odds and not a forecast of that score.
- **A simulated season lands near the real table.** Every match sampled 4,000 times: position error 2.1 (2024-25) and 3.0 (2025-26) places per team, against 3.3 and 3.8 for repeating last season's table and 6.6 for a random shuffle; rank correlation about 0.75 to 0.82; real points inside the simulated 80% range for 65% to 85% of teams (20 teams a season, so noisy). Note these use each match's real pre-match features, so it is a replay with sampled results, not a blind forecast (`07` is the blind one).
- **The page's random draw was checked too:** 200,000 sampled scorelines from one grid stayed within 0.13 percentage points of the exact odds for every score, the odds sum to 1 for every match, and switching profile changes the calls (135 of 380 differ) but not the odds.

### Calls from the blended odds, and a goal-model finding

The Poisson goal model (`05`) turned out to be the best single source of probabilities: log loss 1.014 against the Random Forest's 1.023, and 49.9% accuracy against 48.0%. That prompted a test of whether the three decision profiles work better when they decide from the **blend** of both models (the odds the page already shows) than from the forest alone. Thresholds were chosen only on out-of-fold training data (3 chronological folds, the same discipline as `03`) and the 760 held-out matches were used once:

| Profile (Home / Draw / Away recall, accuracy) | Random Forest | Blend |
|---|---|---|
| Balanced | 49 / 35 / 46, 44% | 45 / **40** / 44, 43.7% |
| Deadkill | 72 / 0 / 59, 49.2% | 75 / 0 / 56, 49.6% |
| Target 60/60/40 | 51 / 29 / 49, 45% | **54** / 30 / 49, **46.4%** |

Balanced's weakest class rises from 35% to 40%, the project's balance goal, and the best Draw recall seen anywhere here. It is one test on 760 matches and Draw recall carries roughly +/-3 points of sampling noise, so the page offers both ("Calls made from": Blended odds, the default, or Random Forest only) instead of silently replacing the original profiles. A goal-model-only variant gave similar numbers (Balanced 43 / 40 / 46). The tuning is its own pipeline step, `10_tune_blend_profiles.py`, writing `blend_profiles.json`.

### New on the Season Wrapped page

Everything below is computed in the browser from the data embedded by `08_build_wrapped.py`:

- **Rest of 2026-27** (`#rest`): plays out the 280 matches not yet played 3,000 times from today's table (outcome from the honest odds, then a scoreline that fits it, so goal difference and tie-breaks are real) and shows each club's projected points, range, and chances of the title, top 4 and bottom 3. Backtested in `09` by starting each held-out season after 100 matches: real final points fell inside the simulated 80% range for 75% of teams, the real champion got 70% on average, top-4 and relegation Brier scores were 0.047 and 0.027 against 0.160 and 0.128 for flat base rates, and the projected final position was 1.9 places off against 2.6 for "the table now stays as it is". **That backtest is optimistic**: each remaining match's odds use its real pre-match form, which a live forecast would not have yet.
- **Teams**: pick any of the 36 clubs seen since 2014: Elo rating over twelve years, last ten results, and for each replayed season the real finish against the model's, record, calls right, best call and biggest miss.
- **Head to head**: every Premier League meeting since 2014 between two clubs with the tally, and, for two 2026-27 clubs, the real result or the forecast for both fixtures.
- **Elo race**: every club's rating as of the round on screen, reordering as the replay plays.
- **Share card**: a one-card summary of the selected season and profile, with Copy summary (text) and Save as image (PNG, via the viewer's downloads prompt).
- **Seven tabs instead of one long page** (hash-linked, so `#lab`, `#rest`, `#teams`, `#h2h`, `#recap`, `#checks` open directly): Replay, Match lab, Rest of 2026-27, Teams, Head to head, Recap and card, Checks. The season / calls / profile controls follow you to the tabs they affect and hide on the ones they don't.

### Exact-score calls

Every call now also names a scoreline: the goal model's likeliest score *among those that fit the call* (a Draw call names the likeliest draw, an Away call the likeliest away win), so different profiles name different scores. It appears next to each match in the replay (a star on an exact hit), in the match lab, in the recap and on the share card. Scored on the 760 held-out matches (`09_validate_simulation.py`, section 5), cross-checked against an independent implementation in the page:

| What names the score | Exact hits | Rate | Of which high-scoring (3+ goals) |
|---|---|---|---|
| Balanced profile | 77 | 10.1% | 12 |
| Target 60/60/40 | 74 | 9.7% | 15 |
| Deadkill / Raw | 65 | 8.6% | 26 / 25 |
| Always guess 1-1 | 92 | 12.1% | n/a |
| Goal model's single likeliest score | 89 | 11.7% | n/a |

**Naming a score that fits each call does not beat guessing 1-1 every time**, because a Home or Away call has to name something like 2-0 or 0-1, which turns up less often than 1-1. Deadkill and Raw produce the most high-scoring hits (26 and 25 of 65), which is where the "crazy calls" live (the recap shows the boldest exact hits). No exact hit was a score the goal model rated under 7%: a likeliest-fitting score is never that improbable, so "crazy" is defined as a high-scoring hit and not an unlikely one. Exact-score prediction has no real skill beyond 1-1 here, and the page says so.

### Fixtures file, honestly

football-data.co.uk's `fixtures.csv` was downloaded as agreed, but it contains **no Premier League rows** during an international break (51 rows, all other divisions). It would normally add real kickoff days and times to the match lab; until it does, those stay at neutral defaults. The rest-of-season simulation does not need it: since every ordered pairing is played exactly once, the unplayed set is simply every pairing not yet in the results.

### Verification pass

Before this update the whole pipeline was rebuilt from scratch (`01` -> `02` -> `03` -> `05` -> `09` -> `08`) and compared with the committed outputs: identical accuracies, identical validation numbers, a byte-identical page, and prediction files equal to the 16th decimal place (floating-point noise only). `pyflakes` is clean across `src/`. `refresh.sh` was run end to end, download included. A bug introduced during this work (a blanket find-and-replace that turned a default argument into `ms = ms`) was caught by loading the page and fixed before publishing. Probabilities on the page were checked to be well-formed: blended odds sum to 1 for all 860 matches, title chances sum to 100%, top-4 to 400%, bottom-3 to 300%.

**What this says about the ceiling.** Four different kinds of idea aimed at Draw (threshold tuning, scoreline-model corrections, draw-propensity features, an extra Elo signal) have now each been tested honestly, and Draw recall at roughly 34% (Balanced profile) looks like where this data runs out. Pre-match data from these three sources describes how strong each side is and what situation they're in, but a draw is largely what happens when a match stays tight and nobody scores late — which isn't knowable before kickoff. The honest conclusion is that further gains likely need genuinely new *kinds* of information (lineups and injuries on the day, referee-and-weather interactions, or bookmaker-implied probabilities, which this project deliberately excludes) rather than more feature engineering on the same sources.

## Update 8 — November 13, 2026 (second pass): a long-standing feature bug, a blind simulation, and a redesign

### The "last 5 matches" features were last 5 *away* matches

Building the forecast grid for the next matchday exposed it. The "points in the last 5 matches" feature (and goals scored and conceded, shots, shots on target, shots conceded, second-half goals and xG form: about 20 columns for each side) joined a team's home games and away games with `pd.concat` and then took `.tail(5)`. The concat puts home games first and away games second, so `.tail(5)` silently took the last five **away** games. Tested directly: the pipeline's value equalled the last-5-**away**-games points in **114 of 114** sampled rows and the true last 5 matches in only 20 of 114. This went unnoticed because the code never failed and the numbers looked plausible.

Fixed by restoring chronological order (`.sort_index()`) after each concat in `form.py`, `goals.py`, `shots.py`, `half_time.py` and `xg.py`; all venue-specific features (`HomeLast5HomePoints`, the two win rates) were already correct. The corrected definitions now also match the blind simulator's, which always tracked the true last 5.

**Effect: roughly neutral.** On the goal model the old and new feature sets are indistinguishable (log loss 1.0141 against 1.0154, accuracy 49.9% against 50.0%); on trees, with no post-processing, five seeds gave Random Forest 49.5% old against 48.6% new, LightGBM 49.1% against 47.4%, XGBoost identical. The season-table scripts moved slightly the wrong way: `06` 2.0 and 3.1 places off (was 1.9 and 2.9) and the blind `07` 3.5 and 4.4 (was 3.2 and 4.0), which is inside the run-to-run noise of a 20-run simulation but is not an improvement. Kept because the features are now what they claim to be, are consistent with the simulator, and are covered by a test; not kept because it helped.

**A reporting flaw this exposed.** `03`'s per-model accuracy dropped 2.5 to 5 points on the same data (ensemble 48.55% to 46.05%, LightGBM 47.1% to 41.6%), which looked like the fix hurt. It didn't. `03` reports each model *after* a Home-penalty and Draw-boost adjustment chosen by internal validation, and that choice is chaotic (XGBoost chose Home penalty 0.95 / Draw boost 1.60 before and 0.60 / 1.70 after; LightGBM 1.00 against 0.55). A heavy Home penalty costs accuracy by design. **That per-model number is a poor way to compare feature sets.** Use log loss and plain accuracy. Current `03` numbers, for the record: ensemble (3 models chosen by validation) 46.05%, CatBoost 45.92%, XGBoost 44.61%, Random Forest 44.21%, Gradient Boosting 43.16%, LightGBM 41.58%.

### Current reference numbers (760 held-out matches, corrected features)

| Odds from | Log loss (lower is better) | Accuracy |
|---|---|---|
| Knows nothing (league-wide H/D/A rates) | 1.083 | 41.7% |
| Random Forest | 1.026 | 47.4% |
| Poisson goal model | 1.015 | 50.0% |
| **Blend of the two** (what the page shows) | **1.014** | 49.9% |
| Bet365's own odds, margin removed | 0.995 | 51.6% |
| Hybrid: our blend + Bet365, stacked | 0.997 | 52.1% |

Calibration of the blend: average Home 41.1% against 41.7% real, Draw 25.8% against 25.9%, Away 33.1% against 32.4%. The forest alone under-rates Home (37.8%) and over-rates Draw (28.8%).

| Style (Home / Draw / Away recall, accuracy) | Forest only | Blend | Hybrid (market-informed) |
|---|---|---|---|
| Balanced | 48 / 31 / 47, 43% | 44 / **36** / 46, 42.5% | 48 / **38** / 41, 43.3% |
| Max Accuracy | 72 / 0 / 61, 49% | 76 / 0 / 57, 50.1% | 84 / 0 / 53, **52.1%** |

**Correction:** Update 7 highlighted Balanced-on-blend Draw recall of 40%. With the corrected features it is 36%. Draw recall carries about +/-3 points of sampling noise on 197 draws, and the 40% was partly that noise.

### Ideas tested to raise accuracy (and what happened)

| Idea (borrowed from) | Result |
|---|---|
| Online attack/defence ratings updated after every match (Dixon-Coles, pi-ratings) | Tiny: out-of-fold log loss 0.9636 to 0.9615, test accuracy 49.9% to 50.3%. Inside the noise. **Not adopted**: every simulator would need to track and update that extra state. |
| Tune the goal model's regularisation | alpha = 1.0 already best (0.1 to 30 tried). No change. |
| Recency-weighted training | Marginal (log loss 1.0124 to 1.0120). No change worth keeping. |
| Profiles decided from the blend instead of the forest | Better or equal across the board (see table). **Adopted** as the default, forest-only kept as an option. |
| Stack our blend with Bet365's odds | **52.1% vs the market's 51.6%.** Real, but the coefficients show the market does almost all the work. **Adopted as an opt-in mode**, labelled market-informed. |
| Dixon-Coles low-score correction, draw-propensity features, `EloEdgeAboveAverage` (Update 7) | Rejected. |

**Why Bet365 stays ahead.** Its odds also encode lineups, injuries, suspensions and news. Our features describe how strong each side is and what situation it is in; nothing free tells us who is actually playing. Stacking our blend onto the odds adds about half a point of accuracy and no log loss, which is not distinguishable from zero on 760 matches. Closing the rest needs new information, not new modelling.

### The live season follows along, and a test proves it

Two requirements: (a) Elo, form and the table must adjust after **every real matchday**, and (b) each matchday must be predicted from **real** past results, never predicted ones (except in the blind simulations).

- **(b) was already true for played matches**: the pipeline is walk-forward.
- **(a) was not true for the next-matchday forecast.** The forecast grid read each club's Elo and form from the row of its *latest match*, which holds the values from *before* that match. Man United's 4-4 draw with Villa on 8 Nov never reached their forecast Elo (1517.6 in both). Fixed: the Elo pass now returns the ratings after the last real match (`elo_state.json`, saved by `01`), and `features/fixture_grid.py` recomputes every rolling feature from the real history including each club's newest match.
- **`11_check_live_flow.py`** proves it in a scratch copy of the project (5 checks, all passing): (1) cutting the 2026-27 results back to 90 matches leaves all 96 numeric columns of those 90 matches identical, so **no match sees its own future**; (2) adding the 10 later matches changes the next-round Elo of all 20 clubs that played them; (3) Elo rose after every one of 65 wins; (4) the forecast Elo is above its pre-match value for all 8 clubs that won their latest match and below for all 8 that lost; (5) the grid's form/goals/shots/half-time logic equals the pipeline's own values on 60 random real matches, with zero mismatches. The first version of this check failed, and the failure was informative twice: once because it compared rows by position instead of by match (a test bug), and once because it was right and caught the stale-forecast problem above.

### The blind simulation of the rest of 2026-27

The page's earlier rest-of-season simulator froze every club's state, so it was not the blind simulation. `12_blind_rest_of_season.py` is. It reuses `07`'s engine, now in `blind_engine.py` (extracted by script; `07`'s output was verified **line-for-line identical** to before: 158 lines, 3.2 and 4.0 places). The engine learned one option, `real_n`: the first N fixtures are matches that have really been played, replayed into the state with their true results, and everything after is predicted, sampled and fed forward. After every simulated match Elo, form, goals, shots, half-time patterns, head-to-head and the table update with the simulated result, and the next match is predicted from that. 300 simulated seasons run in parallel in about 20 seconds. The 280 remaining matches are exact (every pairing is played once at each ground) but undated, so they are laid out in an assumed weekly order.

Live result (as of 8 Nov): Arsenal title 76% (projected 92 points), Man City 18% (82), Liverpool and Brighton 3% each; Coventry (58%) and Ipswich (54%) most likely to go down.

**Honest backtest, and a correction.** Started after round 10 of the two held-out seasons, seeing no real result after match 100: real final points inside the simulated 80% range for 70% of teams; top-4 and relegation Brier scores 0.063 and 0.050 against 0.160 and 0.128 for flat base rates, so the percentages carry real information; **but the projected finishing order was 2.6 places off, the same as simply keeping the table as it stands (2.6)**. The "frozen state" version looks better (1.75 places) only because each remaining match's odds contain that match's real form; Update 7 reported 1.9 for it and flagged it as optimistic, and the honest blind number shows how optimistic. The page shows both, labelled.

### Match lab, hybrid mode and exact scores, after the fix

- Calls can now be made from **Blended odds**, **Random Forest only**, or **Model + bookmaker odds** (the hybrid, labelled market-informed; for an unplayed match with no odds it falls back to the blend).
- Exact-score calls (score that fits each call): Balanced 83 hits (10.9%), Max Accuracy 73 (9.6%), Pure Model 72 (9.5%), against 92 (12.1%) for always guessing 1-1 and 89 (11.7%) for the goal model's single likeliest score. Same conclusion as before. (The page computes these counts itself and agrees with the Python figures to within one hit per style: it embeds probabilities rounded to four decimals, which can flip a near-exact tie between two outcomes.)
- Simulation sanity numbers, recomputed: blended odds sampled for whole seasons put the table 2.0 and 2.7 places off against 3.3 and 3.8 for repeating last season's and 6.6 to 6.7 for a shuffle.

### The redesign

The page was functional but flat. New identity: a floodlit pitch at night, with mown-turf stripes, chalk-line graphics, tall condensed scoreboard numerals (Big Shoulders Display), club colours throughout, outcome colours unchanged. New pieces: a live results **ticker**; a **scoreboard hero** with an animated accuracy ring and tiles; match rows tinted with both clubs' colours; the lab's **scoreline heatmap** (every score, coloured by who wins it, real score ringed, simulated score dashed), a big three-way odds readout and a rolling-digit simulation; **title-race cards and a 20 x 20 finishing-position heatmap** on the rest-of-season tab; club-coloured **team and head-to-head heroes** with a win/draw/loss tug-of-war bar and a meeting timeline; club-coloured Elo race bars; and a full-screen **Wrapped story mode** (11 slides, one giant number each, tap or arrow keys, progress bar, ending on the shareable card). Responsive down to a phone, with reduced-motion handled.

### Names, logos and a friendlier front door

**Naming, decided by a poll.** The profile names were developer shorthand. Asked to name each, the owner chose: **"Deadkill" is now "Max Accuracy"**, **"Raw model" is now "Pure Model"**, **"Balanced" stays**, and **"Target 60/60/40" was removed entirely** (it aimed at 60% Home / 60% Away / 40% Draw recall, landed around 53 / 52 / 26 and was confusing next to the other two). The removal went all the way through: the profile, its objective function and its fine-grained search grid are gone from `03`, `10` and `08` (no dead code left), and the retrain, retune and re-validate were rerun; Balanced and Max Accuracy reproduced their earlier numbers exactly. "Profile" is now called **playing style** everywhere on the page. Older updates in this README still use the old names: Deadkill = Max Accuracy, Raw model = Pure Model, Target 60/60/40 = removed.

**Names for every category, decided by a second poll.** After the profile names, the owner chose naming sets for each group of the interface: the **tabs** use the TV-broadcast set (Matchday, Prediction Desk, Title Race, Club Files, Derby Days, Season Review, Fact Check), the **Matchday screen** uses it too (tiles: Scoreboard, Versus the bookmakers, Perfect scores, Draws spotted; cards: Form guide, Matchday N, Power rankings, League table: reality vs model), the **Season Review cards** use the story set (Your headline, Result split, Table verdict, Moment of glory, Shocker of the season, Sniper scores, Streaks, Teacher's pets, Troublemakers, Biggest miss on the table, with the Wrapped story slides renamed to match), and the **settings wording** stays as it was (playing style, prediction engine, call, expected points). "Round" became "Matchday" everywhere. The `#lab`, `#rest`, `#teams`, `#h2h`, `#recap` and `#checks` links are unchanged, and the prediction-engine choice sits under "More options" as Our model / Forest only / Model + bookmaker odds.

**Start-here welcome** (dismissible, remembered in the browser): "Can a computer predict football?" with four one-click starting points (Watch a season, Predict a match, Who wins the title?, Play my Wrapped) and a 20-second "how to read this" (what a call is, what the percentages mean, why about 50% is a good score, what "never seen these matches" means).

**Official club badges everywhere a club is named.** The first attempt drew original shield badges in each club's kit colours; the owner asked for the official ones instead, with plain text as the fallback if that was not possible. It was possible: `src/13_fetch_crests.py` downloads each club's badge (one SVG per club, 35 files, about 1.3 MB) from the Premier League's public badge host into `site/crests/`. Every badge was checked by eye against its label, because the league codes were entered from memory and a wrong one would have shown the wrong club. **Coventry is the one club the host refuses (403), so it shows as a text chip.** The badges are embedded once in the page and shared by every use (one `data:` image per club, so about 265 uses cost one copy each; an earlier version used temporary `blob:` links, which the claude.ai viewer appeared to drop for most clubs, so only a few badges showed. The fix was published but could not be reproduced locally, so confirm all badges show in the viewer), and every club without a badge falls back to the coloured text chip.

**The badges are the clubs' and the league's trademarked artwork, so they are kept out of the public repo:** `site/crests/` is git-ignored, and because the built page contains them, `site/season_wrapped.html` is git-ignored too (rebuild it with `python3 src/08_build_wrapped.py` after running `13_fetch_crests.py` once; `refresh.sh` does both). The committed template and builder contain no logos. The club dropdowns are replaced by a **crest picker** (a grid of badges; the original select stays underneath for accessibility and for the page logic), and opponents' badges show in each club's last-10 results. Preview builds for testing can embed a few badges only: `CRESTS_ONLY="Wolves,Fulham" WRAPPED_OUT=site/_preview.html python3 src/08_build_wrapped.py`.

### End-of-day check (November 13, 2026)

Rerun before the final push: `11_check_live_flow.py` passed all 8 checks (no look-ahead, Elo and form follow along after every matchday, Elo rises after every win, the forecast grid starts from post-match Elo, grid logic equals pipeline logic); every script compiles; the built page embeds 35 badges and no `blob:` code; `site/crests/` and `site/season_wrapped.html` are git-ignored. Honest standing on the 760 held-out matches: Max Accuracy 50.1% accuracy (Home 76%, Draw 0%, Away 57%); **Balanced Home 44% / Draw 36% / Away 46%, accuracy 42.5%, so the 60/60/40 ambition is still not met** (Balanced reaches its Draw target but not Home/Away); with Bet365 odds mixed in, accuracy is 52.1% against the market's 51.6%. Still open: confirm the badges in the claude.ai viewer; Coventry stays a text chip.

### November 14, 2026: feedback on Wrapped, the tables and honest baselines

- **Wrapped rebuilt around the information that matters:** accuracy against "always pick Home" and against the bookmaker, the title race (did the model's table have the real champion on top), top four found out of 4 and relegated clubs found out of 3, home/away/draw results found, best call and biggest miss, and exact scores against "always 1-1". The streaks and best/worst-club slides were dropped. The share card and copy-summary text follow the same content.
- **Real and model league tables side by side** in one full-width card (no clicking between "Real order" and "Model order"); tap a club to highlight it in both. The arrow shows how far a club sits from its own position in the other table.
- **Honest baselines:** on the 760 held-out matches, always picking Home is right 41.7% of the time, so the **Balanced style (42.5%) is barely better than that**; its job is to find draws, not to maximise accuracy. Max Accuracy (50.1%) is clearly better and is now the page's default style. The scoreboard states the always-Home and bookmaker numbers next to the accuracy. **Exact scores:** always guessing 1-1 hits 12.1%, the model's calls about 9.5-10.9%; the goal model's single most likely score hits 11.7%, which is not meaningfully different from 1-1. No tested change has beaten the fixed guess on exact scores.

### November 14, 2026 (second pass): new signals tested, and the table squeeze fixed

**Eleven candidate signals tested, none added.** `src/14_test_new_signals.py` adds each signal alone to the current 65 features and compares out-of-fold log loss on the training seasons with two different models (a logistic regression and a random forest), match by match, so noise shows up as a standard error. The held-out 760 were not touched because nothing passed. Data added for the test: manager changes from the Transfermarkt file already in the project, referees from the football-data columns, derbies, distance travelled, days since an international break, title / top-four / relegation gaps ("stakes"), match-day weather (Open-Meteo archive, `src/14a_fetch_weather.py`), the Fantasy Premier League archive (minutes per player per matchday, 2020-21 onward; `01_data_fpl/`) to build a "how much of the usual team is missing" lineup proxy, and each club's points per game over its last 38 matches. Results (change in log loss, negative = better):

| Signal | Logistic reg. | Random forest | Verdict |
|---|---|---|---|
| Manager: changes in last 2 years | +0.0014 | +0.0010 | hurts |
| Manager: changed in last 70 days | +0.0033 (t 2.6) | +0.0017 (t 2.2) | hurts |
| Manager: interim spell recently | +0.0026 | +0.0012 | hurts |
| Manager: all four | +0.0088 (t 4.2) | +0.0004 | hurts |
| Referee record | -0.0010 | -0.0003 | no clear effect |
| Derby / travel distance | +0.0001 / +0.0005 | +0.0006 / +0.0006 | no effect |
| Days since international break | +0.0048 (t 3.8) | +0.0011 | hurts |
| Stakes (title / top four / drop gaps) | +0.0091 (t 3.5) | +0.0005 | hurts |
| Weather | +0.0014 | +0.0011 | no effect |
| Long-run points / goal difference (38 matches) | -0.0011 | -0.0006 | no clear effect |
| Lineup: missing minutes / value / count / goalkeeper | -0.0008 to +0.0033 | -0.0014 to +0.0004 | no clear effect |

Reading it honestly: the sacked-manager idea does not add anything because the "new manager" signal already feeds Elo (`ManagerBoostGap`), and the other signals overlap with Elo and form. The lineup proxy only covers about 1,500 training matches and uses minutes played, a crude stand-in for real injury and team-sheet data; a stronger source (live injury flags) could behave differently, but this archive does not support it. Nothing was added to the model.

**Fixing the squeezed table (`src/15_calibrate_spread.py`).** The blended odds were calibrated per match but compressed the table: out-of-fold on the training seasons, the top three got about 10 fewer expected points than they earned and the bottom three about 10 too many; the model's spread of team points was 12.9 against 18.6 real, and real points rose 1.34 for every expected point. Held-out 2024-26 looked the same (spread 12.2 against 17.0). The fix is two small steps learned on the training seasons only: a recalibration of the blended odds and a spread factor of 1.3 on the Home-vs-Away log-odds (chosen to minimise the points error per team-season). Result: top three off by about 2 points (was 10), model spread 17.4 against 18.6 real; on the held-out seasons the model's spread is 16.6 against 17.0 and mean absolute points error falls from 7.3 to 7.0, with the bottom three still about 6 points too generous. The correction **costs honesty at single-match level** (held-out log loss 1.0143 to 1.0308: it makes individual odds overconfident), so it is applied only where odds are summed into points (the expected-points table, team pages, the frozen-state rest-of-season projection) and **never to a single match's odds or the calls**. The blind rest-of-season simulation has its own ratings and is unchanged.

### November 14, 2026 (third pass): a one-shot Prediction Desk

- **Prediction Desk is now fixed** to the 2026-27 season, the Balanced style and our blended model; the season, playing-style and engine controls are hidden there (they still apply to the other tabs).
- **Play the match, once.** "Kick off" draws the final score a single time from the model's scoreline odds and **locks it in** (saved to the viewer's private store and browser storage before anything is shown), then plays a minute-by-minute match around it: goal minutes weighted toward the end, shots (saved, wide, blocked), yellow cards, stoppage time, possession, and a pitch showing where each shot was taken (home attacks right). The match comes from a single stored seed, so "Watch it again" replays exactly the same match, and a locked fixture can't be re-simulated (the delete button on saved calls was removed for the same reason). Scorers and assisters are real current players, weighted by their goals and expected goals over 2025-26 and 2026-27 (`src/16_build_scorers.py` reads the Fantasy Premier League archive into `02_processed_data/scorers.json`). Shot positions, cards and possession are illustrative; only the final score comes from the model.
- **What the result is worth in Elo**: a card per fixture with the rating change for a win by 1, 2 or 3+ goals, a draw and a loss (same rule as `features/elo.py`: K = 20, margin multiplier 1 / 1.5 / (11 + margin) / 8, 25% of the result score from shots-on-target share, expectation from the model's win chance among decisive results). After a locked match, the Elo change uses the simulated shots on target. Each club has a home and an away rating and the match updates the one in use, so the power rankings (which average both) move half as much.

### November 14, 2026 (fourth pass): Beat the Model replaces the Prediction Desk

The tab is now **Beat the Model** (the upcoming-fixtures desk was removed at the owner's request, chosen in a poll); five games, all against matches or seasons the model never trained on, with a persistent record (private store, or browser storage) and **locks: a locked result can't be replayed**.
- **Match Challenge**: choose a played match from 2024-25 on (by season and club, or "Surprise me"; the model trained on everything before, so earlier matches would be remembered), see Elo, league position and last-5 form but not the result, lock a result and an optional exact score, then the model's call plus a minute-by-minute simulated match play out, then reality is revealed with who got it right (1 point per result, +2 per exact score; you against the model's call, with the simulated match shown for fun). Optional hard mode makes the model play its Max Accuracy style (about 50% right) instead of Balanced. Matches before 2026-27 use anonymous scorers ("Arsenal striker") because today's squads are not those players.
- **Matchday Challenge**: ten real fixtures, one result each, against the model's ten calls.
- **Spot the Upset**: five real results, pick the one the model rated least likely (streak and best streak kept).
- **Guess the Table**: reorder the clubs from last season's table into the final table of a past season (2015-16 to 2025-26). The model's guess is its start-of-season Elo ranking. **Finding:** over those 11 seasons, repeating last season's table was off by 3.3 places per club and the Elo ranking by 3.7 (blends of the two landed between), so the model does not beat the simple baseline here; the page says so and shows all three.
- **Higher or Lower**: which of two clubs had more points, more goals, a better goal difference or fewer goals conceded in a given season (any season 2014-15 to 2025-26).

### November 14, 2026 (fifth pass): the simulated match's statistics come from forecasts, not random numbers

`src/17_predict_match_stats.py` trains one Poisson regression per statistic per side (same features and recipe as the goal model in 05, training seasons only) for **shots, shots on target, corners, fouls and yellow cards**, and scores them on the held-out 760 matches against always guessing the training-season average. Average miss per team (model against plain average): **shots 3.6 against 4.0, on target 1.7 against 1.8, corners 2.2 against 2.4** (correlation with the real number 0.3 to 0.5, and the low/mid/high thirds of the forecast line up with what happened); **fouls and yellow cards are barely predictable** (2.8 against 2.8, 1.1 against 1.1; correlation about 0.1), so the model stays near the league average for them. In the test seasons yellow cards also ran higher than the training average (real 1.8 home / 2.1 away against forecasts of 1.65 / 1.86), a bias the model does not correct.

How the minute-by-minute match uses them: the final score is still the one locked draw from the goal model; shots on target = goals + saved shots, with saves drawn around (expected on target - expected goals); wide and blocked shots around (expected shots - expected on target); corners, fouls and yellow cards around their forecasts. Goal minutes follow the measured share of goals scored in the first half (44.7% across all seasons, from the half-time scores). A check over every held-out match (480, five simulations each) shows simulated averages within noise of the forecasts and of the real averages (e.g. home shots forecast 13.76, simulated 13.73, real 14.03; the high-forecast third 16.8 forecast, 16.7 simulated, 16.6 real), with shots never below shots on target and goals matching the locked score. In Beat the Model's reveal, a **stats card compares real, the model's forecast and the simulated match**, and the Elo card now uses the real shots on target.

**Still not data-backed, and labelled as such on the page:** shot positions on the pitch, the split of non-on-target shots into wide and blocked (60/40), and the exact minute of shots, corners and cards. **Possession is not shown at all:** none of our sources (football-data, Understat, Transfermarkt, Fantasy Premier League) records it, and a made-up number would be the random output this change removes. The bar under the scoreboard is the share of shots so far. Earlier locked matches replay slightly differently after this change (same score, new events). For testing, `PREVIEW_LEAN=1` builds a smaller page the preview pane can open.

### Ideas still on the table

More training seasons (football-data has them back to 1993; Elo and form work for all, the market-value and xG features would be empty); the Fantasy Premier League API (free, includes injury and availability flags) as the first real source of *who is playing*; separate attack-and-defence state in the simulators so the online ratings can be adopted; a proper Bayesian team-strength model; ordinal-logistic and stacked variants for the draw problem.

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
│   ├── 09_validate_simulation.py   # tests the odds and simulations against what really happened
│   ├── 10_tune_blend_profiles.py   # tunes profiles on the blend and on the market-informed hybrid
│   ├── 11_check_live_flow.py       # proves the live season follows along (no look-ahead, Elo adjusts)
│   ├── 12_blind_rest_of_season.py  # blind simulation of the rest of the live season (+ backtest)
│   ├── 13_fetch_crests.py          # downloads official club badges into site/crests/ (git-ignored)
│   ├── blind_engine.py             # the state-updating simulation engine shared by 07 and 12
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
├── site/                           # Season Wrapped page template (the built page and site/crests/ are git-ignored)
├── refresh.sh                      # one-command refresh of the live season
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
- ~~Real fixtures for the match lab~~: downloaded, but the file has no Premier League rows during breaks; re-check with `curl -L https://www.football-data.co.uk/fixtures.csv` on a normal match week, and if it has them, wire real dates and kickoff times into `fixture_grid.py`.
- ~~Rest-of-season odds, team page, head to head, Elo race, share card, one-command refresh~~: built (Update 7).
- **Refresh the 2026-27 inputs:** pull the new Understat season with `00_fetch_xg_data.py` and download a newer Kaggle Transfermarkt copy (needs a Kaggle login) so the live season's xG form, managers and European fixtures stop being carried forward. Then re-run `01`, `02`, `03`, `08` to roll the live season forward.
- **Deduplicate `TEAM_NAME_MAP`:** the Transfermarkt-to-project team-name map is copy-pasted in five feature files (it needed the same Coventry edit five times). Same shape as the old `get_season` duplication: it should live in one shared module.
- Target 60/60/40 landed at a real 55/50/26 on Random Forest's current decision surface — short of the named target, and that gap looks like a genuine ceiling of this feature set rather than a search limitation (the grid used was already fine-resolution). Closing it further probably needs a new signal that separates Draw-likely matches more cleanly, not another threshold search on the same probabilities.
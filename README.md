## Beat the Model

*A five-league football prediction project and game, built by moisback22.*

### The short version

Beat the Model is machine-learning forecasting of football results (Home, Draw or Away) for the Premier League, Bundesliga, La Liga, Serie A and Ligue 1, plus a browser game in which you try to out-call the model. Every forecast uses only what was known before kickoff, and every number is tested on matches the model never saw.

- **How good is it?** Over 16,111 matches (nine seasons, each predicted only from earlier seasons), the model gets **52.6%** of results right. The bookmakers' closing odds get **53.7%**, and always picking the home team gets **43.5%**. It sits about one point behind the market in every league, and the gap is information (lineups, injuries, news), not modelling.
- **What can you do?** The front page splits in two. **Games** (pick one league or all five at random) lists every game once; you pick the game, then Solo or Two players, and the game changes to fit. Seven games play against the model; the ball-knowledge ones (Who am I?, Career path, Name that club, Badge blur, Where did they finish?, Market value) are a solo streak (or higher-or-lower for market value) or a head-to-head duel (a buzzer race, or closest guess wins), on one device or two. Football tic-tac-toe is two-player only. **Our model** holds the title race, a season replay next to the model's table, the review, and a How it works page with credits. On top of that: ranks, achievements, result cards, Challenge a friend and leaderboards.
- **Play it:** https://mosoliman517-sudo.github.io/football-prediction-model/
- **How it was built:** Python (pandas, scikit-learn, Poisson goal models, Elo ratings, Monte Carlo simulation) for the models; plain JavaScript for the page. Data from football-data.co.uk. Most of the later engineering was done in pair-programming sessions with Claude Code (credited in the commits); the evaluation rules and what to keep or discard are the owner's.
- **Honest notes:** the Premier League models use richer inputs than the other four leagues (which use results-only features); many plausible ideas were tested and rejected rather than shipped; accounts and global leaderboards need a free online database that has to be connected first (`online/SETUP.md`).

> **Resuming after a break? Read this box.**
>
> ```bash
> ./refresh.sh --no-download                 # rebuild the Premier League pipeline and the deep-dive page from files already in 01_data/ (~12 min)
> python3 src/29_multi_league_walkforward.py # five-league walk-forward evaluation + per-match predictions (~10 min)
> python3 src/33_match_stats_leagues.py      # shots, corners, fouls, card forecasts for every league
> python3 src/32_title_race.py               # title / Europe / relegation odds (20,000 simulations per league)
> python3 src/31_fetch_assets.py             # badges, logos, star photos into site/logos/ (git-ignored; slow, API throttled)
python3 src/34_build_quiz_data.py          # players, club histories and club facts for the ball-knowledge games (Transfermarkt, CC0)
python3 src/35_fetch_hero_photos.py        # ~30 star cutouts for the front-page collage (git-ignored, API throttled)
> python3 src/30_build_arena.py              # private build: site/arena.html
> python3 src/30_build_arena.py --public     # public build: docs/index.html (what GitHub Pages serves)
> python3 src/30_build_arena.py --public --no-artwork   # same, with colour discs instead of third-party artwork
> ```
>
> **Rules that stay:** a new signal is kept only if it helps out-of-fold in both a logistic regression and a random forest, and held-out matches are touched once. Badges, league logos and player photos belong to others: the raw files stay git-ignored, they appear in the built page only as identification with credit and a takedown route, and `--no-artwork` removes them in one command. Never scrape sources that block scripts or work around refusals.
>
> **Known limits:** the four newer leagues have no xG, squad-value or manager inputs and no real goalscorers; yellow cards are not forecast better than the league average; title-race odds assume today's form holds; the Champions League has no data source yet; accounts and leaderboards are built and tested against a stand-in for the database but not yet connected to a real one.
>
> **Next:** connect the online database; Champions League; real goalscorers for the four newer leagues; real lineups from the daily Fantasy snapshots.

### Project diary

Written as dated notes, as it happened. Development ran in bursts around heavy academic and study commitments, which is why the dates come in clusters with a long gap in the middle.

**30 April to 5 June, before the repository.** Started with one Premier League season of football-data CSVs and a plain question: can anything beat "always pick the home team"? Cleaned the files, built the first pre-kickoff features (recent form, goals, shots, rest days, how strong the last five opponents were) and made a habit that never went away: every feature may only look at matches played *before* the one it describes. First problem: the raw files carried duplicate betting columns, so those were stripped early.

**6 June to 22 July.** Grew from one season to ten (about 3,800 matches) with a loader that merges the season files. Problem: the seasons did not agree on date formats, so the same loader failed on some years until the parsing was made tolerant. Ended with a combined dataset that passed a basic validation.

**23 to 30 July.** First models: Random Forest, Gradient Boosting, XGBoost, LightGBM and CatBoost, compared side by side. Gradient Boosting hit 57.1% on the 2023-24 season, which felt great for about a month. The repository was created on 30 July (six commits).

**28 August.** Came back and audited everything, and the 57% did not survive. The features included betting-market columns, which already contain the result's likelihood; removing them dropped the number to something honest. Also found that the "2015-16" file was byte-for-byte a copy of 2017-18, so one season had been counted twice in every earlier result. Rebuilt Elo with separate home and away ratings and added a Poisson goal model.

**29 August.** Thirteen commits. Added head-to-head and win-rate features, dropped some weak congestion features and added second-half goal patterns, and flip-flopped on class balancing (off, then on) before settling it with validation. Moved from one test season to two (2024-25 and 2025-26, 760 matches) because one season is small enough for a lucky run to move the headline.

**31 August.** Thirteen more. Chose class balancing per model using an internal validation set scored on macro-F1 instead of accuracy. Wrote a blind full-season forecast; its first output was degenerate (every score the same) because it took the most likely scoreline each time, so it now samples scorelines instead. Added Understat expected goals (fixing a duplicate-season data bug while wiring it in), added Transfermarkt squad values, and wrote down why Away wins were being under-called.

**1 and 2 September.** Codebase audit; transfer-window activity; validated ensemble selection (dropping one model beat using all five). Added table position, which pushed accuracy to a project best of 49.34%, then a combination search over five more features (49.61%) and three tuned playing styles. Late on the 2nd, a sanity check on a new feature produced a 21st-place finish in a 20-team league. The cause: the shared season-boundary function treated July as a new season, but the COVID-delayed 2019-20 season ran to 26 July 2020, so its last matches were filed into the next season. Fixed at the source, along with three files that had copied the same logic by hand.

**3 September to 12 November.** No commits. Exams and study came first.

**13 November.** Back, with the 2026-27 season under way. Added it as a live season kept out of the benchmark, fixed a same-day look-ahead in table position, and built the first interactive page, a match lab and a simulation of the rest of the season. Building the next-matchday forecast exposed a bug that had sat in the project for months: the "last 5 matches" features were actually the last 5 *away* matches (a `.tail(5)` after joining home and away games). Fixed it, wrote a test, and found the effect was roughly neutral, which was a useful lesson in itself. Also: the page viewer dropped temporary image links, so club badges moved to embedded images.

**14 November.** The busiest day for experiments, and mostly for things that did not work. Compared seven ways of building Elo (a single rating won), adopted an Elo built from expected goals, and tested real starting lineups, player ratings, a dedicated draw model, a Dixon-Coles correction, a "nothing left to play for" signal and a full drop-one test of every feature group. All were rejected under the rule that both models must agree. Defined the playing styles three times before settling on two: Balanced (Home, Draw and Away found about equally often) and Max Accuracy. Trimmed six duplicate Elo columns and fourteen empty ones, and caught a mismatch where forecasts for unplayed games used a different Elo from training. The page got five games and a minute-by-minute match whose totals now equal the model's own forecast. A layout bug (the slider label "Matchday 10 / 10" is wider than "Matchday 9 / 10", re-wrapping the control row in a split-screen window) was reported, reproduced by sweeping widths and fixed.

**15 November.** The big expansion, in one long day built on everything above. Added the Bundesliga, La Liga, Serie A and Ligue 1: 52 season files, one compact feature builder run per league so each keeps its own Elo pool, then a single model pooled across all five. Evaluation moved to a season-by-season walk-forward so every season is both test data and training data (16,111 test matches; pooled training beat per-league models by 0.0021 log loss, in 34 of 45 league-seasons). Built title-race odds from 20,000 simulations per league. Rebuilt the front end as an "arena": a lobby of five league worlds, each with its own palette, typeface, particles, sounds and flag, plus rooms for games, title race, season replay (real table beside the model's expected-points table) and a review. Added official league logos, 138 club badges and star-player photos, matched by name from a public sports-data API; the matching went wrong in places (a women's team for Mainz, a Brazilian club for St Pauli, a Colombian one for Santander), so all 138 badges were checked by eye. Brought back the match simulation and four more games for every league, with statistics forecasts built for the four leagues that had none (yellow cards turned out no better than the league average, and the page says so). Opened the games to a decade of matches after checking that older seasons are not predicted worse. Published on GitHub Pages; a first build without third-party artwork looked "old", so the artwork went in, credited, with a one-command way to remove it. A sweep of every game found a missing way back to the games hub and a crash if you left mid-reveal; both fixed. Finished with progression (XP and eight ranks, 18 achievements, a streak calendar), image result cards, Challenge a friend, weekly and all-time leaderboards, and accounts with guest play, tested against a stand-in for the database. One catch from that test: a save delayed by a few seconds could be lost if the tab closed, so progress now saves the moment you leave or sign out. Late additions on request: Matchday picks read H, D and A in the home, draw and away colours; Call it defaults to guessing the exact score, with a big on/off switch and each team's goals set under its own logo (the result buttons and the score stay in step); and an "All five leagues" world at the top of the lobby, where every game (Call it, Daily 5, Matchday, Spot the upset, Guess the table, Higher or lower, Challenge) picks its matches, seasons and clubs at random across all five leagues and labels which league each came from. Single-league play was re-tested afterwards to check nothing there had changed.

**15 November, evening: a front page, ball-knowledge games and online rooms.** (First pass; the structure was corrected the same night, see below.) The lobby was doing two jobs, so it became a home page with two doors: Games, where you choose one league or all five and then a game, and Model Lab, where the title race, season replay and review live. Behind the Games door went a ball-knowledge section built from the Transfermarkt files already in the project (2,796 current and famous players with their club histories, plus stadium, squad value and coach for 154 clubs). Who am I? reveals one clue at a time from obscure (birthplace, height) to obvious (club, then the name's length); points fall from 1,000 toward 100 as time passes, and a wrong guess costs 150, so buzzing early is a gamble. Career path, Name that club, Badge blur and Where did they finish? reuse the same engine. Higher-or-lower works on player values and squad values; Write your number scores by how close a typed value is in ratio terms; tic-tac-toe builds a grid of random categories (a club played for, a nationality, age, height, foot, a value or caps tier) and only accepts a player who fits the row and the column, with every square guaranteed several valid answers. Problems: club squad values were empty in the source file, so they are now summed from current player values (all 134 current clubs filled); a first test showed a wrong guess in solo mode locked you out for the round, which was only meant for two players; the club categories in tic-tac-toe included reserve sides such as Bilbao Athletic, so they are now limited to the clubs the arena knows. Online rooms use a simple idea: one player hosts and runs the game, the guest sees a copy of the panel and sends back only clicks and typed text, which the host accepts only on the guest's turn. It is tested between two browser tabs (tic-tac-toe, a buzz and an answer in Who am I?); the second transport, Supabase Realtime, is written but could not be tested without a real database. The data has no trophies or honours, so categories like "won the Champions League" are not possible.

**15 November, late: the structure corrected.** The first pass listed the same game in several variations (a player-value game, a club-value game and Write your number as three cards; tic-tac-toe against a computer although it is a two-player game). The owner's intention was one entry per game, with the mode chosen after clicking it, and each mode built to suit the game: solo is a streak (Who am I? and its siblings run until a round times out; Where did they finish? runs while you stay within two places; Market value is higher-or-lower on players and squads mixed) while multiplayer is a real duel (buzz first; closest guess wins), on one device or two. Market value became one card whose duel is Write your number, and tic-tac-toe lost its computer opponent. "Model Lab" became "Our model", gaining a How it works page (method, honest test, the two styles, data credits). Problems: the slider in Where did they finish? never updated its guess in a first version because no input listener was attached, caught by testing the two-player flow; online guests could move a slider or type during the host's turn, so the host now accepts typed input only when it is the guest's turn.

**15 November, polish pass.** Went through every screen at phone width. Fixes: no game repeats a player, club or table within a run (and the game cards never show the same photo twice); the "points v model" strip now shows only on the predict-the-match games, since it meant nothing in a quiz; the header, league chips and room tabs were rewrapped for phones (chips scroll sideways instead of stacking three rows); starting a game on a phone scrolls to it instead of leaving you at the top. Caught on the way: the private build has no viewport tag (the artifact host adds one), so phone testing needed it injected; the public build already has it.

**15 November, pictures everywhere.** The ball-knowledge games looked bland, so they got images: tic-tac-toe categories now show club crests, country flags, league logos and position or stat icons, placed players show their club crest, and the suggestion lists show crest and flag; Who am I? and Career path clues carry flags, crests and position icons; answer cards, Market value and Write your number show a star photo where there is one (27 players), otherwise the club crest with the country flag. Flags are emoji, so older Windows machines will show letters instead. Not done: some earlier-club crests in clues are missing where the Transfermarkt club name does not map to an arena club.

### What is in the box

- **Models:** a Premier League blend (random forest plus Poisson goal model) with Elo, form, expected goals, squad value and managers (50.8% on 760 held-out matches, 52.6% with the market's odds added), and a five-league pooled model on results-only features (52.6% over 16,111 walk-forward matches).
- **Playing styles:** Balanced (Premier League Home 49 / Draw 38 / Away 46 at 45.0% accuracy) and Max Accuracy (76 / 0 / 59 at 50.8%). Home 70 / Away 60 / Draw 40 together is not reachable on this information.
- **Front ends:** the arena (`site/arena_template.html`, built by `src/30_build_arena.py`) and the original Premier League deep dive (`site/season_wrapped_template.html`, built by `src/08_build_wrapped.py`).
- **Ball knowledge:** `src/34_build_quiz_data.py` and `src/35_fetch_hero_photos.py` feed the quiz games; no player photos from Transfermarkt are used.
- **Online features:** `online/schema.sql` and `online/SETUP.md` (accounts, saved progress, leaderboards, and the transport for online rooms).

---

# Detailed technical log

The full record of every experiment, including the many that were rejected, in the order they happened. The diary above is the readable version; this is the evidence behind it.

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
- **Match Challenge**: choose a played match from 2024-25 on (by season and club, or "Surprise me"; the model trained on everything before, so earlier matches would be remembered), see Elo, league position and last-5 form but not the result, lock a result and an optional exact score, then the model's call plus a minute-by-minute simulated match play out, then reality is revealed with who got it right (1 point per result, +2 per exact score; you against the model's call, with the simulated match shown for fun). Optional hard mode makes the model play its Max Accuracy style (about 50% right) instead of Balanced. Scorers are real players from the squad of the season in question (see the sixth pass).
- **Matchday Challenge**: ten real fixtures, one result each, against the model's ten calls.
- **Spot the Upset**: five real results, pick the one the model rated least likely (streak and best streak kept).
- **Guess the Table**: reorder the clubs from last season's table into the final table of a past season (2015-16 to 2025-26). The model's guess is its start-of-season Elo ranking. **Finding:** over those 11 seasons, repeating last season's table was off by 3.3 places per club and the Elo ranking by 3.7 (blends of the two landed between), so the model does not beat the simple baseline here; the page says so and shows all three.
- **Higher or Lower**: which of two clubs had more points, more goals, a better goal difference or fewer goals conceded in a given season (any season 2014-15 to 2025-26).

### November 14, 2026 (fifth pass): the simulated match's statistics come from forecasts, not random numbers

`src/17_predict_match_stats.py` trains one Poisson regression per statistic per side (same features and recipe as the goal model in 05, training seasons only) for **shots, shots on target, corners, fouls and yellow cards**, and scores them on the held-out 760 matches against always guessing the training-season average. Average miss per team (model against plain average): **shots 3.6 against 4.0, on target 1.7 against 1.8, corners 2.2 against 2.4** (correlation with the real number 0.3 to 0.5, and the low/mid/high thirds of the forecast line up with what happened); **fouls and yellow cards are barely predictable** (2.8 against 2.8, 1.1 against 1.1; correlation about 0.1), so the model stays near the league average for them. In the test seasons yellow cards also ran higher than the training average (real 1.8 home / 2.1 away against forecasts of 1.65 / 1.86), a bias the model does not correct.

How the minute-by-minute match uses them: the final score is still the one locked draw from the goal model; shots on target = goals + saved shots, with saves drawn around (expected on target - expected goals); wide and blocked shots around (expected shots - expected on target); corners, fouls and yellow cards around their forecasts. Goal minutes follow the measured share of goals scored in the first half (44.7% across all seasons, from the half-time scores). A check over every held-out match (480, five simulations each) shows simulated averages within noise of the forecasts and of the real averages (e.g. home shots forecast 13.76, simulated 13.73, real 14.03; the high-forecast third 16.8 forecast, 16.7 simulated, 16.6 real), with shots never below shots on target and goals matching the locked score. In Beat the Model's reveal, a **stats card compares real, the model's forecast and the simulated match**, and the Elo card now uses the real shots on target.

**Still not data-backed, and labelled as such on the page:** shot positions on the pitch, the split of non-on-target shots into wide and blocked (60/40), and the exact minute of shots, corners and cards. **Possession is not shown at all:** none of our sources (football-data, Understat, Transfermarkt, Fantasy Premier League) records it, and a made-up number would be the random output this change removes. The bar under the scoreboard is the share of shots so far. Earlier locked matches replay slightly differently after this change (same score, new events). For testing, `PREVIEW_LEAN=1` builds a smaller page the preview pane can open.

### November 14, 2026 (sixth pass): real scorers for every season, and the prediction is the simulation

- **Real scorer names for past seasons.** `src/16_build_scorers.py` now builds a squad per season and club (2024-25, 2025-26, 2026-27) from the Fantasy Premier League archive (players with at least 180 minutes for the club that season, weighted by that season's goals and expected goals; assists likewise), with short display names (Saka, Palmer, M.Salah). The "Wolves striker" placeholders are gone; a check over 60 simulated matches found 109 goals, all credited to real players.
- **The model's prediction and the simulated match are now the same thing.** Before, a separate random draw produced a "played-out match" that could disagree with the model's call (a Draw 1-1 call next to a 1-0 simulation). Now the model's call and its named score (the most likely score that fits the call) *are* the match that is played out minute by minute, and the verdict compares you with that single prediction. In a check of 60 matches the played-out score matched the call in every case. Replays of earlier locked matches use the model's named score too.

### November 14, 2026 (seventh pass): which Elo format actually works? (`src/18_test_elo_formats.py`)

Question: should a result move the two clubs by mirrored amounts (the production Elo is zero-sum), or should each club's rating move by its own surprise, so a favourite gains little for an expected win while the beaten side loses more? Seven formats were walked through every match in date order, tuned on the training seasons only, turned into Home/Draw/Away probabilities with a small logistic regression fitted on the training seasons, and scored by log loss on the held-out 760 matches (lower is better). Then the promising ones were added to, and swapped into, the model's 65 features.

| Format | Held-out log loss | Accuracy |
|---|---|---|
| No ratings (league rates) | 1.0837 | 41.7% |
| **Production Elo** (dual-track home/away ratings, calibrated expectation, shots on target) | 1.0201 | 49.6% |
| Dual-track, plain | 1.0196 | 49.9% |
| **Classic single-rating Elo** | **1.0107** | 49.5% |
| **Margin Elo** (expected goal difference, zero-sum) | **1.0107** | 49.9% |
| **Adaptive-K** (each club's K grows with its recent surprises) | **1.0103** | 49.3% |
| Asymmetric margin (gain rate differs from loss rate) | 1.0163 | 49.6% |
| Attack/defence ratings (goal-based) | 1.0151 | 50.0% |
| Asymmetric attack/defence | 1.0114 | 50.0% |

Findings:
- **The asymmetry idea does not help.** In a sweep of gain rate against loss rate, training log loss is lowest along the diagonal (equal rates) and rises steeply when losses are punished harder than gains are rewarded (gain 5, loss 30: 1.0272, against 0.9589 symmetric). The best asymmetric setting (gain 8, loss 5, so the *opposite* direction) is only 0.0016 better in training and **worse on the held-out matches** (1.0163 against 1.0107 for symmetric margin Elo). Asymmetric attack/defence behaves the same.
- **The production dual-track design is the weak part.** Single-rating formats beat it by about 0.009 log loss on the held-out matches (paired over the 760: classic t = -2.1, margin -1.9, adaptive-K -2.3). Separate home and away pools spread the information over thinner samples.
- **Swapping the production Elo columns for a single-rating Elo improves the real model** (out-of-fold on the training seasons): margin Elo changes log loss by -0.0056 for the logistic regression (t -3.2) and -0.0026 for the forest (t -1.7); asymmetric margin -0.0047 and -0.0036; classic -0.0042 and -0.0020. Adding them alongside the old columns also helps a little (margin -0.0025 and -0.0024). These are small gains: they are real but not transformative.
- **How the formats treat a 5-0 win for a strong club over a weak one** (rating points, strong / weak): classic +2.6 / -2.6 (an expected win moves little); dual-track +4.8 / -4.8; margin +28 / -28 (it measures the win against the *expected margin*, so a 1-0 win by a heavy favourite costs it 12 points); adaptive-K +2.2 / -2.0; asymmetric margin +22.7 / -14.2.
- **Not adopted yet.** The production pipeline still uses the dual-track Elo. The evidence favours replacing it with a single-rating margin or classic Elo (about 0.003-0.006 log loss on the model); that means re-running steps 01 to 12 and rebuilding the page, so it was left as a decision.

### November 14, 2026 (eighth pass): renamed, credited, polished, and a redesign experiment

- **The project is now called Beat the Model** (chosen in a poll; the games tab became **Play** so the name is not used twice), credited to **moisback22** under the title, in the footer, in the artifact description and here. "Wrapped" is now just the season-recap feature.
- **Visual fixes everywhere:** matchday form is the same red/green/grey squircle strip used on the rest of the page instead of "WWWDL" text; the match list in Beat the Model shows both clubs' badges (and wider rows so names are not cut); Higher or Lower badges and text chips sit in a fixed slot so cards line up; the hard-mode checkbox is aligned; goal labels on the pitch no longer print on top of each other.
- **Redesign experiment, built alongside the current look** (`LOOK=programme python3 src/08_build_wrapped.py` writes a matchday-programme version; the default build is unchanged): cream paper with mowing stripes, a pitch-green masthead and card headings, chunky condensed type, hard offset shadows, scoreboard-style tiles, a gold welcome card, with a dark variant. Long copy is cut: every explanatory paragraph and fine print is marked `.long` and is hidden in this look, and the game intros have a one-line `.short` version shown instead. The programme version is published as a separate artifact so the two can be compared; the owner decides which direction wins.
- **Coventry's badge is still missing** because the Premier League badge host refuses that one file (HTTP 403) and was not worked around. `08_build_wrapped.py` now accepts a badge you supply: save an image as `site/crests/coventry.png` (or `.svg`, `.jpg`, `.webp`) and rebuild.

### November 14, 2026 (ninth pass): everything tried to raise accuracy

Asked to try every available source of extra accuracy and keep what helps (all on the 760 held-out matches unless noted):

| Idea | Result | Adopted? |
|---|---|---|
| **Better bookmaker odds for the hybrid** (`src/19_test_odds_sources.py`) | Hybrid log loss: Bet365 opening 0.9970 (52.1%), Bet365 closing 0.9920, market-average closing **0.9912 (52.9%)**, Pinnacle closing 0.9787 (54.2%) but only for 78% of matches: Pinnacle stopped appearing in 2025-26 and is absent for the live season | **Yes: market-average closing odds** (available for every season shown and for 2026-27) |
| **Older seasons** (14 more, 2000-01 to 2013-14, 5,230 matches; `src/20_test_older_seasons.py`) | A compact-feature model trained on 2000+ scored 1.0104 against 1.0086 for 2014+ on the held-out matches (better by 0.004 on an inner 2022-24 window, worse on the final one) | **No** |
| **Single-rating Elo** instead of the dual-track home/away Elo (`src/18_test_elo_formats.py`) | Blend log loss **1.0143 to 1.0096**, accuracy **49.9% to 50.4%**; Balanced Home 44 to 50, accuracy 42.5% to 44.3% | **Yes** (classic format: K 15, home edge 40, 20% summer reversion, margin multiplier; ratings still rise after every win) |
| **A compact feature set** (margin Elo + form + goals + shots + table + rest + head-to-head, 2014+) | 1.0086 and 50.8%, against 1.0143 for the old 65-feature blend (paired t -1.3); averaging with the blend gives 1.0095 | Not added separately: the Elo swap captured most of it |
| **Daily Fantasy API snapshots** (`src/22_snapshot_fpl.py`, scheduled daily at 09:39 while the app is open) | Saves every player's availability, news, form and ownership into `01_data_snapshots/` (git-ignored). Nothing to test yet: after a season it becomes the first real injury history, tested like every other signal | **Collecting** |
| Earlier this day: manager signals, referee, derbies, travel, weather, schedule, stakes, lineups (minutes proxy) | None helped (see the signal table above) | No |

**Why Home, Away and Draw recall cannot all be high** (`src/23_style_frontier.py`). The model's odds are calibrated: its average confidence is 50.0% and its accuracy 49.9%; only 20% of matches get a pick it is 60% sure of; if football were played exactly at the model's own goal rates, its top pick would win only about 53% of the time. The odds do not separate draws from other results (AUC 0.516 for the model, 0.524 for Bet365), so finding draws means calling them, which takes picks away from Home and Away. Best reachable combinations on the held-out matches: Home >= 70% allows Draw 41% **with** Away 10%, or Away 63% **with** Draw 0%; Home >= 60% allows Draw 54% with Away 8%, or Away 72% with Draw 0%. Tuning toward a 70 / 60 / 40 target on training data landed at Home 63 / Away 50 / Draw 19 on the held-out matches (Draw 34% in training), so Balanced stays "highest worst recall", which holds up (50 / 36 / 45).

**Also removed: the "Pure Model" playing style** (the single most probable result with no tuning). It picked almost exactly what Max Accuracy picks (Home 76 / Away 57 / Draw 0 against Max Accuracy's 75 / 60 / 0), so the page now has two styles, Balanced and Max Accuracy. Older sections of this README that mention Pure Model describe the earlier three-style setup.

**End-of-day recheck.** `./refresh.sh` ran end to end on the new Elo; `src/11_check_live_flow.py` passed all 8 checks (no look-ahead, ratings follow every result, Elo rises after every win, the forecast starts from post-match ratings, grid logic equals pipeline logic); pyflakes is clean; the built page passes a browser run of every season / engine / style combination, the story mode and all five games with no errors.

### November 14, 2026 (tenth pass): real starting lineups, tested (`src/24_test_real_lineups.py`)

The Fantasy archive records who actually started each match from 2022-23 on, so a better lineup test than the earlier minutes proxy was possible: price-weighted value of the starting XI against the club's usual XI, how many starters are new, and how many regular starters are missing. On 1,263 matches (2022-23 to 2026-05), on top of the compact core features, trained on 2022-24 and scored on 2024-26: the random forest improved (XI value gap -0.0061, t -2.1; all lineup features -0.0052) but the logistic regression did not (+0.0042, t +0.6); out-of-fold over all four seasons the forest gained -0.0073 (t -2.4) and the logistic regression +0.0014 (t +0.2). **Not adopted:** the two models disagree, and four seasons is too little data to separate a small real effect from noise. Lineups and injuries are mostly priced into the bookmaker odds already, which is why the market-informed hybrid (52.9%) is the way they reach the predictions today. Revisit once the daily Fantasy snapshots (`src/22_snapshot_fpl.py`) have built a real injury history.

### November 14, 2026 (eleventh pass): lineup against the best available XI, with player performance ratings (`src/25_test_player_rating_lineups.py`)

Direction suggested by the owner: compare each club's actual lineup with its best players, using post-match player ratings. FotMob's ratings are scraped rather than provided, so they were not collected; the Fantasy archive's per-match performance indices (BPS and ICT, the same kind of post-match score) were used instead. Each player gets a rating from his own past matches only (exponentially weighted per-90 performance, standardised by position, shrunk toward average with little playing time). Per club and match: the quality of the XI that actually played (the 11 with most minutes), the quality of the best XI available from the recently active squad, their difference (the deficit), and how many of the top five players were missing. On 2,078 matches (2020-21 to 2025-26), on top of the compact core features, trained 2020-24 and scored on the held-out 2024-26: **no help**. Deficit vs best XI: logistic regression +0.0020 (t +1.4), forest -0.0007 (t -0.4); all rated-lineup features: +0.0147 (t +3.0, worse) and +0.0036; out-of-fold the same story (+0.0080 and +0.0020). A sanity check also shows the deficit does not behave as hoped: clubs that won had a slightly *larger* deficit than clubs that lost (home 0.99 vs 0.92), consistent with rotation by strong clubs rather than injuries driving it. Not adopted. Caveats: FPL indices are a noisy stand-in for FotMob ratings, the Fantasy archive gives minutes rather than injury flags, and the market already prices lineups and injuries (the hybrid's 52.9%). If real FotMob-style ratings or injury history become available as a file, the same test script can be pointed at them.

### November 14, 2026 (twelfth pass): expected-goals Elo adopted, a balance dial, and three ideas that did not help

- **Elo built from expected goals (adopted).** A second single rating whose update uses the match's expected-goal difference (goal difference where xG is missing, e.g. the live season) improved both models out-of-fold (logistic -0.0019, forest -0.0027; an xG/goals blend was weaker). Rerunning everything: blend log loss **1.0096 to 1.0058**, accuracy **50.4% to 50.9%**, goal model 50.5% to 51.6%; Balanced **Home 49 / Draw 36 / Away 47** (accuracy 44.9%); Max Accuracy **Home 76 / Away 60** (51.2%); hybrid **53.0%** (Balanced 48 / 42 / 41). The rest-of-season backtest's 80% range now holds 72% of real final points (was 78%).
- **A dedicated draw model** (draw AUC 0.521 against 0.520, worse log loss) and **a Dixon-Coles low-score correction** (fitted effect about zero) did not help (`src/26_accuracy_ideas.py`).
- **Balance dial.** A slider between Max Accuracy and Balanced (geometric blend of the two tuned decision factors) with live Home / Draw / Away recall on the 760 held-out matches. Its season computation used the wrong profile lookup (fixed in this commit); **not yet re-tested in the browser**.

**Balanced redefined (same day, at the owner's request): no artificial draw boost.** Balanced used to multiply the draw odds by 1.6 to 1.8 so draws got found. It now picks the most likely result and calls a Draw only when it is almost as likely as the top one (draw odds times a small factor beat the top odds); the factor is the largest one that keeps out-of-fold accuracy within one point of the plain top pick (`logical_balanced` in `src/10_tune_blend_profiles.py`). Held-out result: **Home 75 / Draw 3 / Away 57, accuracy 50.4%** on our model (hybrid: 81 / 5 / 53, 52.1%), almost the same as Max Accuracy (76 / 0 / 60, 51.2%), because the model rarely has a draw close to the top outcome. That is the honest consequence of calling draws logically. The earlier draw-boosting Balanced (Home 49 / Draw 36 / Away 47, accuracy 44.9%) is in the git history if wanted back; the balance dial now runs between "never call draws" and this logical Balanced.

**Programme look is now the main design** (the owner chose it over the dark broadcast look). `python3 src/08_build_wrapped.py` builds it by default and it is published at https://claude.ai/artifact/3qauornydFP8suFbmjzTa1; the older dark look is still available with `LOOK=broadcast`. The balance dial is now a compact three-stop control (Max Accuracy, Mix, Balanced), since only a few settings give different results.

### November 14, 2026 (thirteenth pass): refresh and two page fixes

- `./refresh.sh` found no new 2026-27 results (100 matches, latest 2026-11-08); numbers unchanged.
- **Balance dial:** from Max Accuracy to 70% of the way to Balanced the draw factor never calls a draw, so most of its travel did nothing (76/0/60 throughout). It now maps onto the 0.7 to 1.0 part of the blend, with five stops. The honest limit stands: without a draw boost the stops only span 76/0/60 to 75/3/57.
- **Form Guide chart:** the bookmaker and always-Home percentages moved from on-chart labels (which collided with the line's end label) into the legend.
- **Matchday slider glitch (fixed):** in a narrow window or split screen, "Matchday 10 / 10" is wider than "Matchday 9 / 10", so the label grew and re-wrapped the whole control row, resizing the slider under the cursor (row height 130 to 176 px at a 360 px container, 79 of the widths swept). The label now has a fixed width, and the same sweep shows no change between matchdays 9 and 10.

### November 14, 2026 (fourteenth pass): drop-one and add-one feature tests (`src/27_ablation_and_additions.py`)

Same rules as `14`: out-of-fold on the 3,800 training matches (4 chronological folds), a logistic regression and a forest must agree. Baseline log loss: LR 1.0064, RF 0.9717.

- **Drop-one (16 groups of the 47 current features): almost nothing is clearly pulling its weight or clearly misleading.** Only goals scored/conceded and manager experience passed as useful by the rule (LR t 2.7 and 2.9, forest about 0). The two models often disagree: dropping shots, rest days or form at home/away helps the forest (shots: t -2.4) but hurts the logistic regression, so none of those is a clean removal. The forest barely notices most groups.
- **Candidates for removal:** the expected-goals Elo difference column (both models slightly better without it, -0.0019, t -1.9 and -1.7) and recent average placement (LR -0.0017, forest 0.0000).
- **Found along the way: the "home/away" Elo columns and the "overall" Elo columns are exact duplicates** under the classic Elo format (correlation 1.0, identical values), so six of the 47 columns carry no extra information. Their "useful" verdict in the drop test is a regularisation artifact, not information.
- **Add-one (14 new signals from existing results): none passed.** Form windows of 3, 10 and 20 matches, exponentially weighted form, opponent-adjusted form, goal-difference form, shot-on-target share and goals per shot, streaks, time in season, a promoted-club flag and absolute gaps for draws all gave no clear gain or made the logistic regression worse. The closest was a log squad-value ratio (LR -0.0030, t -1.9; forest -0.0009, t -0.8), which is not enough.
- **Held-out check (the one allowed): dropping the xG Elo column and recent placement and adding the log value ratio** gave LR log loss 1.0207 to 1.0169 (accuracy 50.0% to 49.2%) but forest 1.0119 to 1.0170 (51.1% to 50.0%). The models disagree, so **nothing is adopted** and the held-out set is now spent for this question.
- Takeaway: the current feature set is near a plateau for these data. More gain needs new information (lineups, injuries, news), as the market gap already suggested.

### November 14, 2026 (fifteenth pass): trimmed repeats, two final styles

- **Trimmed:** the three "overall Elo" columns (exact copies of the home/away Elo under the classic format) and 14 all-empty columns (match xG, closing odds) are out of the model files and feature lists; the unused overall-Elo code in the simulator and fixture grid is gone. The fixture grid used to compute "overall Elo" as an average that did not match training; that mismatch is gone too. Blend accuracy 50.9% to 50.8%, log loss 1.0058 to 1.0055 (no real change, as expected).
- **Two final styles, no dial.** Balanced is the equal-recall style again (the largest minimum of Home, Draw and Away recall on out-of-fold data): **Home 49 / Draw 38 / Away 46** at 45.0% accuracy (hybrid 50 / 41 / 43). Max Accuracy: **76 / 0 / 59**, 50.8% (hybrid 83 / 0 / 55, 52.6%). The "logical Balanced" and the balance dial were removed.

### November 14, 2026 (sixteenth pass): the page becomes a game

Chosen by poll: front door with three choices, hide the history tabs, make it more fun, do not publish publicly yet.

- **Home view** with one headline and three doors (Play the game, Watch a season, Who wins the title?), plus a link to the shareable Wrapped story. Tabs are now Home, Play, Matchday, Title Race, Season Review, with **More** holding Club Files, Derby Days and Fact Check (hidden, not removed). The prediction-engine switches stay behind "More options".
- **Streaks:** a strip above the games shows the current and best run of correct Match Challenge calls, you against the model, and daily-5 days in a row.
- **Daily 5:** five matches picked from the date alone (a seeded draw over 2024-25 onward), so everyone gets the same five each day; plays through the normal Match Challenge flow, shows your score against the model and a copyable result.
- **Sound and confetti:** short synthesised tones on lock-in and results, confetti when you beat the model on a match; a Sound on/off toggle, and confetti is skipped under reduced-motion.
- **Leaderboard (opt-in):** each person can join to publish only their totals (points ahead of the model, right/played, best streak); everyone who can open the page can read the board, and each person can write only their own row (`leaderboard/{self}`). Names come from the viewer's profile lookup. It only fills once the page is shared with others.
- **Matchday label fix** and **chart label fix** from earlier today are in the same build.
- Not done on purpose: public publishing (the badges are trademarked; see the standing rule on `site/crests/`).

### November 14, 2026 (seventeenth pass): the played-out match fits its forecast, statistics included

The minute-by-minute match used to draw shots, corners, fouls and cards at random around the model's forecast, so the totals on screen could drift from the forecast shown beside them. The played-out totals are now the forecast rounded (only the minutes, players and shot positions are still drawn from the seed). Two physical limits can move a total: shots on target cannot be fewer than the goals, and shots cannot be fewer than shots on target. Checked on all 860 matches with a stored forecast: every played-out total equals the rounded forecast (largest gap 0.5), the goals on the pitch always equal the predicted score, no limit ever had to bind, and there are no impossible lines. A hypothetical fixture with no stored statistics forecast uses the league average with shots and shots on target scaled by the square root of each side's expected goals against the league average, so a predicted 3-0 gets about 17 shots to 9 rather than identical numbers for every game.

### November 14, 2026 (eighteenth pass): "nothing left to play for" (`src/28_test_motivation.py`)

The idea: late in a season a club whose position is effectively decided may rotate or ease off, while a rival still chasing a place or fighting the drop plays flat out (Man City, stuck second, losing to an Aston Villa side chasing the top five). The earlier "Stakes" test only used raw points gaps. This one counts, per club and match, which of four bands (title, Champions League, Europe, survival) are still undecided given the points left, with a hard reach (3 points a game for every rival) and a soft one (2 points a game), plus a "nothing at stake" flag and that flag times the Elo gap.

- The signal behaves as intended: with 4 to 6 games left 35% of matches have a side with nothing at stake, with 1 to 3 left 88%; on the last day of 2024-25 it flags Aston Villa as still chasing and Man United as not. Only 392 of the 3,800 training matches (10.3%) have a flagged side, which limits how much it can show.
- Six variants, out-of-fold, logistic regression and forest, overall and on late-season matches only (8 or fewer games left, 823 matches). **None passed.** Overall log loss moved by -0.0003 to +0.0029 (all inside the noise); on late-season matches the logistic regression improved slightly (up to -0.0038, t -1.2) while the forest got worse (up to +0.0022), so the two never agree. Baseline LR 1.0058, RF 0.9715.
- Under the project rule (both models must agree), **nothing is adopted and the held-out 760 matches were not touched.** The effect may be real but small and, more likely, a lineup effect: a rotated side is only visible through who actually plays, which the Fantasy snapshot collector (`22_snapshot_fpl.py`) may eventually measure directly.

### November 15, 2026 (nineteenth pass): the Big 5 leagues, walk-forward (`src/29_multi_league_walkforward.py`)

New data: Bundesliga, La Liga, Serie A and Ligue 1, 2014-15 to 2026-27 from football-data.co.uk (`01_data_leagues/`, 52 files, same format as the Premier League files). Together with the Premier League that is about 19,800 finished matches before the 2026-27 season.

**Evaluation changed from one fixed split to walk-forward.** For each test season from 2017-18 to 2025-26 every league's matches are predicted by a model trained only on earlier seasons; the season then joins the training data for the next one, so every season is both test data and training data. 16,111 test matches. Features are the compact results-only set (`core_features.py`: Elo, form, shots, rest, head to head), the same for every league, so this is a like-for-like comparison. Premier League extras (xG, squad value, managers) have no equivalent in the other leagues.

| League | matches | own model | pooled Big 5 | bookmakers | always Home |
|---|---|---|---|---|---|
| Premier League | 3,420 | 53.6% (ll 0.9741) | 53.8% (0.9711) | 54.9% (0.9569) | 44.1% |
| Bundesliga | 2,754 | 51.2% (0.9958) | 51.3% (0.9909) | 52.6% (0.9769) | 43.7% |
| La Liga | 3,420 | 52.1% (0.9908) | 52.2% (0.9892) | 53.3% (0.9746) | 45.3% |
| Serie A | 3,420 | 54.3% (0.9750) | 54.1% (0.9761) | 55.0% (0.9544) | 41.2% |
| Ligue 1 | 3,097 | 51.2% (1.0049) | 51.4% (1.0030) | 52.2% (0.9850) | 43.3% |
| **All five** | **16,111** | **52.6% (0.9875)** | **52.6% (0.9855)** | **53.7% (0.9689)** | 43.5% |

- **Training on all five leagues is a small, consistent gain:** log loss better by 0.0021 on average, in 34 of 45 league-seasons (t about -3.4). Accuracy is unchanged. Pooled is the better base for any league that has little history of its own.
- **The model is about 1.1 accuracy points behind the closing odds across 16,111 matches**, and about 9 points ahead of "always Home". The gap to the market is the same size in every league, which fits the earlier conclusion that it is information (lineups, injuries, news), not modelling.
- **Season-to-season swings are large** (Premier League accuracy 48% in 2020-21 and 2025-26, 60% in 2018-19, for every method including the bookmakers), so any single season, or the 760-match benchmark, is a noisy yardstick; the walk-forward average over nine seasons is steadier.
- On the same Premier League matches as the production model (2024-26, 760): compact pooled model 50.9% (log loss 1.0096), production blend 50.8% (1.0055), bookmakers 51.8% (0.9929). The richer Premier League inputs are worth about 0.004 in log loss.

### November 15, 2026 (twentieth pass): the multi-league arena (`src/30_build_arena.py`, `site/arena_template.html`)

A new front door, built fresh around leagues, with the Premier League page kept as its own deep-dive. Opening the page shows five league worlds (Premier League, Bundesliga, La Liga, Serie A, Ligue 1; Champions League is a placeholder card). Picking one repaints the whole page with a circular wash: each league has its own palette, display typeface, lamp glow, drifting particles and a short musical motif (Premier League floodlit violet, Bundesliga lantern amber, La Liga sangria sunset, Serie A piazza teal, Ligue 1 twilight blue).

- **Rooms per league:** Call it (a hidden real match, lock a result and optional exact score, then the model's call and the result are revealed in sequence), Daily 5 (the same five matches for everyone each day, with a copyable result), Replay a season (matchday by matchday with a live table and accuracy line against the bookmakers), How good is it? (model, bookmakers and always-Home by season, plus your own record).
- **Data:** `src/29` now writes every match's prediction (pooled Big 5 model, trained only on earlier seasons) to `02_processed_data/multi_league_matches.csv`, including the live 2026-27 season; the page ships 2021-22 onward (about 13,000 matches, 0.9 MB).
- **Two styles, tuned on seasons up to 2023-24 and reported on 2024-26, all five leagues pooled:** Balanced **Home 46 / Draw 42 / Away 53**, accuracy 47.1%; Max Accuracy **Home 78 / Draw 0 / Away 60**, accuracy 52.5%.
- **Sound:** synthesised in the browser (no audio files): soft tick, lock thunk, reveal whoosh, a chime for a right call, a soft fall for a wrong one, a sparkle plus confetti for beating the model, and a league motif; three levels (off, soft, full).
- Badges are plain colour discs, not club crests (no trademark issues); the existing Premier League page keeps its own build.
- **League emblems, flags and star players (same day):** the lobby is one league per line; each card has an emblem, the country flag faded in behind it (drawn in CSS) and a star player (Haaland at Man City, Kane at Bayern Munich, Yamal at Barcelona, Nico Paz at Como, Dembélé at Paris SG; clubs checked against news reports in November 2026, kept in `STARS` in `src/30_build_arena.py`). Inside a league, "Star to watch" shows the star's club form, how many of its last ten matches the model got right, and a button to call one of its matches. The emblems are original drawings, not the official league logos (trademarked); if you drop `E0`, `D1`, `SP1`, `I1`, `F1` image files (`.svg`, `.png`, `.webp`) into `site/logos/` (git-ignored) the build uses them instead.
- **Official artwork (twenty-first pass):** `src/31_fetch_assets.py` downloads each league's badge, every club's badge and each star's cutout photo from TheSportsDB (free developer key) into `site/logos/` (git-ignored: the artwork belongs to leagues, clubs and photographers). 138 clubs, all checked by eye on contact sheets. Gaps filled from other public sources: Nott'm Forest from the Premier League's own badge file (`site/crests/`), and Paris SG, Monaco, Montpellier and Saint-Etienne from football-data.org's public crest host. The page embeds them as small WebP images (page now 1.8 MB). A public build (e.g. GitHub Pages) must NOT include them without the rights holders' permission; remove or skip `site/logos/` for that build and the page falls back to colour discs and original emblems.
- **Title race per league (`src/32_title_race.py`):** the live season's unplayed pairings are predicted from today's state and the rest of the season simulated 20,000 times (outcome from the model's probabilities, score from its goal rates given that outcome, goal difference breaking ties). For the last three finished seasons the same simulation is run after matchdays 10, 19 and 28 with the model's real pre-match probabilities (optimistic, and labelled so). Shown as title, Europe and relegation odds (the separate top-4 column was removed at the owner's request; Europe means every European place), an expected-points range, a finishing-position grid and the real final position. Live favourites on 8 Nov 2026: Arsenal 71%, Bayern Munich 91%, Barcelona 86%, Inter 68%, Paris SG 94%. The simulation does not update the forecast during a run, so it is more confident than a real title race and knows nothing about injuries or transfers.
- Not yet: the Premier League deep-dive link from the arena, minute-by-minute matches for other leagues (need shot and scorer data), Champions League, a mobile check, and a GitHub Pages build.

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
│   │  (newer scripts, in order: 14 signal tests, 17 match-stat forecasts, 18 Elo formats, 20 older seasons, 24-25 lineup tests, 26 accuracy ideas,
│   │   27 drop-one ablation, 28 motivation signal, 29 five-league walk-forward, 30 arena build, 31 badge and photo fetcher, 32 title race, 33 league stats forecasts)
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
├── site/                           # page templates (arena_template.html, season_wrapped_template.html); built pages, site/crests/ and site/logos/ are git-ignored
├── docs/                           # the public build GitHub Pages serves (docs/index.html)
├── online/                         # schema.sql and SETUP.md for accounts, saved progress and leaderboards
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
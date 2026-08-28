import pandas as pd

from sklearn.linear_model import LogisticRegression

from config import TRAIN_TEST_SPLIT_DATE


BASE_K = 20              # rating points moved for a normal 1-goal result

REVERSION = 0.33         # fraction each team's rating pulls back toward
                          # 1500 at the start of a new season. Squads
                          # change over the summer — a team shouldn't
                          # carry last May's form at full strength into
                          # August.

PERFORMANCE_WEIGHT = 0.25 # how much shot-on-target dominance gets blended
                           # into the "actual" match outcome, on top of
                           # the real W/D/L result. A team that wins 1-0
                           # while getting outshot 2-9 on target should
                           # gain less than a team that wins 1-0 while
                           # dominating 9-2 — and a team that draws 1-1
                           # after dominating on shots should lose less
                           # ground than a team that draws 1-1 doing
                           # nothing. The real result still carries 75%
                           # of the weight — this nudges ratings toward
                           # who actually played better, it doesn't
                           # override who actually won.

INITIAL_ELO = 1500


def expected_score(rating_a, rating_b):
    return 1 / (1 + 10 ** ((rating_b - rating_a) / 400))


def margin_multiplier(goal_difference):
    """
    A 4-0 win says more about the gap in strength than a 1-0 squeaker,
    so it should move ratings further. This scaling (not something
    invented here — it's the standard World Football Elo formula from
    eloratings.net) increases the K-factor with the margin of victory.
    """

    diff = abs(goal_difference)

    if diff <= 1:
        return 1.0
    elif diff == 2:
        return 1.5
    else:
        return (11 + diff) / 8


def shot_dominance_score(home_shots_on_target, away_shots_on_target):
    """
    Turns shots-on-target into a 0-1 "who actually played better" score,
    the same shape as a match result (1 = total dominance, 0.5 = even,
    0 = totally outplayed). Falls back to a neutral 0.5/0.5 split when
    neither team registered a shot on target — nothing to judge from.
    """

    total = home_shots_on_target + away_shots_on_target

    if total == 0:
        return 0.5, 0.5

    home_share = home_shots_on_target / total

    return home_share, 1 - home_share


def get_season(date):
    # Premier League seasons run Aug -> May, so July is the cutoff:
    # Jan 2024 belongs to the 2023 season, Sept 2024 to the 2024 one.
    return date.year if date.month >= 7 else date.year - 1


# ---------------------------------------------------------------------
# Pre-match expectation model
#
# Elo's "expected score" used to come from rating gap alone (and then,
# for one iteration, rating gap blended with recent form using a hand
# checked share-of-the-total trick). That trick doesn't generalise: a
# few of the signals worth including here — net goal form, rest-days
# advantage — can be negative, and "share of the total" isn't even
# defined when one side of the total is negative.
#
# So instead: one small logistic regression, fit once on training-era
# decisive matches only, turns every pre-match signal into a single
# calibrated probability. Its coefficients ARE the significance
# ranking — a signal the data leans on harder gets a bigger say in
# how Elo ratings move, automatically, instead of a guessed weight.
# ---------------------------------------------------------------------

SIGNAL_COLUMNS = ["Elo", "Form", "NetGoalForm", "NetShotForm", "RestAdvantage"]


def _signal_differences(df, elo_difference):
    """
    Every pre-match signal fed to the expectation model, each expressed
    as a single Home-minus-Away differential — the same shape as
    EloDifference itself. All four non-Elo signals are already sitting
    in df by the time this runs (form.py, goals.py, shots.py and
    rest_days.py all run earlier in 01_load_data.py), this just
    repackages them. Missing values (a team's very first-ever match in
    the dataset, before it has any rolling history) are filled with 0
    — a neutral "no signal yet" reading, matching how those columns
    were initialised by the modules that built them.
    """

    net_goals_home = (
        df["HomeAvgGoalsScoredLast5"] - df["HomeAvgGoalsConcededLast5"]
    )
    net_goals_away = (
        df["AwayAvgGoalsScoredLast5"] - df["AwayAvgGoalsConcededLast5"]
    )

    net_shots_home = (
        df["HomeAvgShotsLast5"] - df["HomeAvgShotsConcededLast5"]
    )
    net_shots_away = (
        df["AwayAvgShotsLast5"] - df["AwayAvgShotsConcededLast5"]
    )

    signals = pd.DataFrame({
        "Elo": elo_difference,
        "Form": df["HomeLast5Points"] - df["AwayLast5Points"],
        "NetGoalForm": net_goals_home - net_goals_away,
        "NetShotForm": net_shots_home - net_shots_away,
        "RestAdvantage": df["HomeDaysRest"] - df["AwayDaysRest"],
    })

    return signals.fillna(0.0)


def _fit_expectation_model(df, raw_elo_difference, train_cutoff):
    """
    Fits the expectation model described above and prints the
    significance ranking it found. Trained only on rows before
    train_cutoff (never the test seasons) and only on decisive
    (non-draw) matches, since "did the home team win" needs a
    win/loss target — draws are left to Elo's usual 0.5/0.5 handling
    downstream, same as always.

    Uses raw, form-blind Elo (a first, plain pass — see add_elo_features
    below) as the "Elo" signal here, since the real walk-forward ratings
    don't exist yet at the point this model needs to be fit.
    """

    signals = _signal_differences(df, raw_elo_difference)

    is_train = df["Date"] < train_cutoff
    decisive = df["FTR"] != "D"
    fit_rows = is_train & decisive

    X = signals.loc[fit_rows, SIGNAL_COLUMNS]
    y = (df.loc[fit_rows, "FTR"] == "H").astype(int)

    means = X.mean()
    stds = X.std().replace(0, 1)   # guards a signal with zero variance

    X_scaled = (X - means) / stds

    model = LogisticRegression()
    model.fit(X_scaled, y)

    coefficients = pd.Series(model.coef_[0], index=SIGNAL_COLUMNS)
    importance = coefficients.abs() / coefficients.abs().sum()

    print("\nElo expectation model (training seasons, decisive matches only):")

    for name in importance.sort_values(ascending=False).index:
        direction = "raises" if coefficients[name] >= 0 else "lowers"
        print(
            f"  {name:<14} {importance[name]:>5.1%} of combined weight "
            f"(higher {name} {direction} home win chance)"
        )

    print()

    return model, means, stds


def _predict_expected_home(expectation_model, raw_signals):
    model, means, stds = expectation_model

    scaled = pd.DataFrame([{
        name: (raw_signals[name] - means[name]) / stds[name]
        for name in SIGNAL_COLUMNS
    }])

    return model.predict_proba(scaled)[0][1]   # P(home win)


def _run_elo_pass(df, expectation_model=None):
    """
    One full walk-forward pass over every match, updating dual-track
    Elo ratings (a HOME-context rating per team, built only from home
    matches, and an AWAY-context rating, built only from away matches
    — no flat "+100 for home advantage" needed, since with both pools
    starting at 1500 and home teams winning more often league-wide,
    the home pool naturally drifts up and the away pool drifts down on
    its own).

    With expectation_model=None this is plain Elo (used for the raw
    first pass — see add_elo_features). With a fitted model, the
    pre-match EXPECTATION each result is judged against comes from
    all five calibrated signals together, not rating gap alone — so a
    team the data would have expected to do well anyway (strong recent
    form, healthy rest advantage, etc.) "surprises" the system less
    when it wins, and moves ratings less, than raw Elo alone would
    suggest.
    """

    home_elo = {}
    away_elo = {}
    current_season = None

    home_elo_col = [0.0] * len(df)
    away_elo_col = [0.0] * len(df)
    home_overall_col = [0.0] * len(df)
    away_overall_col = [0.0] * len(df)

    for i in range(len(df)):

        date = df.loc[i, "Date"]
        season = get_season(date)

        # ---------------------------------------------
        # New season -> pull every rating back toward
        # the mean before this match is processed
        # ---------------------------------------------

        if current_season is None:
            current_season = season

        elif season != current_season:

            for team in home_elo:
                home_elo[team] += REVERSION * (INITIAL_ELO - home_elo[team])

            for team in away_elo:
                away_elo[team] += REVERSION * (INITIAL_ELO - away_elo[team])

            current_season = season

        home = df.loc[i, "HomeTeam"]
        away = df.loc[i, "AwayTeam"]

        if home not in home_elo:
            home_elo[home] = INITIAL_ELO

        if home not in away_elo:
            away_elo[home] = INITIAL_ELO

        if away not in home_elo:
            home_elo[away] = INITIAL_ELO

        if away not in away_elo:
            away_elo[away] = INITIAL_ELO

        home_rating = home_elo[home]   # home team, in home matches
        away_rating = away_elo[away]   # away team, in away matches

        home_elo_col[i] = home_rating
        away_elo_col[i] = away_rating

        # A team's "general" strength regardless of venue — averages
        # this team's home-context and away-context ratings together,
        # useful when one of the two tracks is still thin (e.g. a
        # newly-promoted side with no away matches played yet)
        home_overall_col[i] = (home_elo[home] + away_elo[home]) / 2
        away_overall_col[i] = (home_elo[away] + away_elo[away]) / 2

        if expectation_model is not None:

            net_goals_home = (
                df.loc[i, "HomeAvgGoalsScoredLast5"]
                - df.loc[i, "HomeAvgGoalsConcededLast5"]
            )
            net_goals_away = (
                df.loc[i, "AwayAvgGoalsScoredLast5"]
                - df.loc[i, "AwayAvgGoalsConcededLast5"]
            )

            net_shots_home = (
                df.loc[i, "HomeAvgShotsLast5"]
                - df.loc[i, "HomeAvgShotsConcededLast5"]
            )
            net_shots_away = (
                df.loc[i, "AwayAvgShotsLast5"]
                - df.loc[i, "AwayAvgShotsConcededLast5"]
            )

            raw_signals = {
                "Elo": home_rating - away_rating,
                "Form": (
                    df.loc[i, "HomeLast5Points"] - df.loc[i, "AwayLast5Points"]
                ),
                "NetGoalForm": net_goals_home - net_goals_away,
                "NetShotForm": net_shots_home - net_shots_away,
                "RestAdvantage": (
                    df.loc[i, "HomeDaysRest"] - df.loc[i, "AwayDaysRest"]
                ),
            }

            for name, value in raw_signals.items():
                if pd.isna(value):
                    raw_signals[name] = 0.0

            expected_home = _predict_expected_home(
                expectation_model, raw_signals
            )

        else:
            expected_home = expected_score(home_rating, away_rating)

        expected_away = 1 - expected_home

        result = df.loc[i, "FTR"]

        if result == "H":
            result_home, result_away = 1, 0

        elif result == "D":
            result_home, result_away = 0.5, 0.5

        else:
            result_home, result_away = 0, 1

        # ---------------------------------------------
        # Blend in shot-on-target dominance, so a team
        # that dominated but didn't get the scoreline to
        # match still moves in the right direction
        # ---------------------------------------------

        home_sot = df.loc[i, "HST"]
        away_sot = df.loc[i, "AST"]

        if pd.notna(home_sot) and pd.notna(away_sot):

            performance_home, performance_away = shot_dominance_score(
                home_sot, away_sot
            )

            actual_home = (
                (1 - PERFORMANCE_WEIGHT) * result_home
                + PERFORMANCE_WEIGHT * performance_home
            )
            actual_away = (
                (1 - PERFORMANCE_WEIGHT) * result_away
                + PERFORMANCE_WEIGHT * performance_away
            )

        else:
            actual_home, actual_away = result_home, result_away

        home_goals = df.loc[i, "FTHG"]
        away_goals = df.loc[i, "FTAG"]

        k = BASE_K * margin_multiplier(home_goals - away_goals)

        home_elo[home] = home_rating + k * (actual_home - expected_home)
        away_elo[away] = away_rating + k * (actual_away - expected_away)

    return home_elo_col, away_elo_col, home_overall_col, away_overall_col


def add_elo_features(df, train_cutoff=TRAIN_TEST_SPLIT_DATE):

    # ---------------------------------------------------------------
    # Pass 1: pure Elo, no signal blending. This exists purely as a
    # measuring stick — it's what "Elo alone" would have said about
    # every match, needed as the "Elo" column the expectation model
    # is fit against below.
    # ---------------------------------------------------------------

    raw_home_col, raw_away_col, _, _ = _run_elo_pass(df)

    raw_elo_difference = pd.Series(
        [h - a for h, a in zip(raw_home_col, raw_away_col)],
        index=df.index
    )

    expectation_model = _fit_expectation_model(
        df, raw_elo_difference, train_cutoff
    )

    # ---------------------------------------------------------------
    # Pass 2: the real pass, using that calibrated model
    # ---------------------------------------------------------------

    home_col, away_col, home_overall_col, away_overall_col = _run_elo_pass(
        df, expectation_model=expectation_model
    )

    df["HomeElo"] = home_col
    df["AwayElo"] = away_col
    df["EloDifference"] = [h - a for h, a in zip(home_col, away_col)]

    df["HomeTeamOverallElo"] = home_overall_col
    df["AwayTeamOverallElo"] = away_overall_col
    df["OverallEloDifference"] = [
        h - a for h, a in zip(home_overall_col, away_overall_col)
    ]

    return df

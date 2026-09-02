import itertools

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import joblib

from sklearn.ensemble import (
    RandomForestClassifier,
    GradientBoostingClassifier
)
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    confusion_matrix,
    ConfusionMatrixDisplay,
    classification_report
)

from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from catboost import CatBoostClassifier

from config import TRAIN_TEST_SPLIT_DATE

# --------------------------------------------------
# Load Dataset
# --------------------------------------------------

df = pd.read_csv("02_processed_data/E0_model.csv")
df["Date"] = pd.to_datetime(df["Date"], format="mixed")

# --------------------------------------------------
# Split Dataset
# --------------------------------------------------

train = df[df["Date"] < TRAIN_TEST_SPLIT_DATE]
test = df[df["Date"] >= TRAIN_TEST_SPLIT_DATE]

X_train = train.drop(columns=["FTR"])
y_train_labels = train["FTR"]

X_test = test.drop(columns=["FTR"])
y_test_labels = test["FTR"]

# Remove columns that cannot be used by the model

columns_to_remove = [
    "Div",
    "Date",
    "HomeTeam",
    "AwayTeam"
]

X_train = X_train.drop(columns=columns_to_remove)
X_test = X_test.drop(columns=columns_to_remove)

# XGBoost rejects some characters in column names
X_train.columns = (
    X_train.columns
    .str.replace("[", "", regex=False)
    .str.replace("]", "", regex=False)
    .str.replace("<", "lt_", regex=False)
    .str.replace(">", "gt_", regex=False)
)
X_test.columns = X_train.columns

X_train = X_train.fillna(0)
X_test = X_test.fillna(0)

# One shared encoding (alphabetical: A=0, D=1, H=2) so every model's
# predict_proba columns line up the same way — required for the
# ensemble at the bottom to average them together meaningfully
encoder = LabelEncoder()
y_train = encoder.fit_transform(y_train_labels)
y_test = encoder.transform(y_test_labels)

display_labels = ["Away Win", "Draw", "Home Win"]   # matches A, D, H order
HOME_IDX = list(encoder.classes_).index("H")
DRAW_IDX = list(encoder.classes_).index("D")
AWAY_IDX = list(encoder.classes_).index("A")

# Class-balanced weighting is not a universal win -- confirmed
# directly: it helps CatBoost and Random Forest by several points, but
# actively HURTS Gradient Boosting (a bigger swing than almost
# anything else tried this project) and roughly wipes out for
# XGBoost/LightGBM. One global toggle was hiding that. So each model
# picks its own weighting here, decided on an internal validation
# slice carved out of the training data (last 15%, chronologically) --
# never the real test set, so the choice isn't just fit to these exact
# test matches.
sample_weight = compute_sample_weight("balanced", y_train)

inner_cutoff = int(len(X_train) * 0.85)
X_inner_train, X_inner_val = X_train.iloc[:inner_cutoff], X_train.iloc[inner_cutoff:]
y_inner_train, y_inner_val = y_train[:inner_cutoff], y_train[inner_cutoff:]
inner_sample_weight = compute_sample_weight("balanced", y_inner_train)


def choose_weighting(model):
    """
    True if this model does better balanced, False if it does better
    unweighted -- measured only on the internal validation slice.

    Scored on f1_macro, not accuracy. Accuracy is exactly the metric
    that rewards ignoring Draw entirely -- it's dominated by the two
    big classes, so picking whichever mode scores higher on raw
    accuracy will happily choose "never predicts Draw" if that mode
    happens to guess Home/Away right slightly more often. This is the
    same mistake caught earlier tuning Gradient Boosting's
    hyperparameters, showing up again in a new place.
    """

    balanced_model = model.__class__(**model.get_params())
    balanced_model.fit(X_inner_train, y_inner_train, sample_weight=inner_sample_weight)
    balanced_f1 = f1_score(
        y_inner_val, np.ravel(balanced_model.predict(X_inner_val)), average="macro"
    )

    unweighted_model = model.__class__(**model.get_params())
    unweighted_model.fit(X_inner_train, y_inner_train)
    unweighted_f1 = f1_score(
        y_inner_val, np.ravel(unweighted_model.predict(X_inner_val)), average="macro"
    )

    return balanced_f1 >= unweighted_f1


def choose_probability_adjustments(model, use_balancing):
    """
    Two corrections, searched jointly, both multiplicative scalars
    applied to predict_proba() before argmax:

    - Home penalty: every model here calls Home Win far more than its
      real ~42% share warrants (measured directly: predicted ~52% vs.
      actual ~42%), which inflates Home recall for free (guess it
      more, catch more of it) while capping Away/Draw recall -- an
      uncertain match defaults to Home instead of splitting evenly,
      because Elo's own home-field tilt (see features/elo.py) nudges
      the underlying score toward Home on almost every match, even
      genuine away wins.

    - Draw boost: Draw recall sits around 14-16% for most models even
      after the Home penalty above -- a match the model reads as
      genuinely close still tends to land on Home or Away rather than
      Draw. A boost factor >= 1.0 on Draw's own probability gives it a
      fairer hearing on exactly those close calls, without touching
      matches where the model already sees a clear favourite.

    Both are deliberate, chosen trade-offs, not defaults: this reduces
    overall accuracy (both corrections give back some of the recall
    that over-calling Home/under-calling Draw was inflating) in
    exchange for f1_macro that isn't propped up by ignoring the
    minority classes. Confirmed on real data to improve f1_macro for
    every one of the 5 models, not just the ones it was tuned on.

    Scored across 3 chronological folds within the training data, not
    one single slice -- a small single validation slice is easy for an
    aggressive multi-parameter search to overfit to (confirmed
    directly: one early single-parameter attempt picked a factor that
    looked great on one slice and collapsed real test accuracy).
    Averaging across folds only keeps factors that help consistently.
    """

    tscv = TimeSeriesSplit(n_splits=3)
    home_factors = np.arange(1.0, 0.40, -0.05)
    draw_factors = np.arange(1.0, 2.05, 0.1)

    fold_f1 = {(hf, df): [] for hf in home_factors for df in draw_factors}
    baseline_fold_f1 = []

    for fold_train_idx, fold_val_idx in tscv.split(X_train):

        fold_model = model.__class__(**model.get_params())
        fold_X_train = X_train.iloc[fold_train_idx]
        fold_y_train = y_train[fold_train_idx]
        fold_weight = (
            compute_sample_weight("balanced", fold_y_train) if use_balancing else None
        )
        fold_model.fit(fold_X_train, fold_y_train, sample_weight=fold_weight)

        fold_proba = fold_model.predict_proba(X_train.iloc[fold_val_idx])
        fold_y_val = y_train[fold_val_idx]
        baseline_fold_f1.append(
            f1_score(fold_y_val, np.argmax(fold_proba, axis=1), average="macro")
        )

        for hf in home_factors:
            for df in draw_factors:
                adjusted = fold_proba.copy()
                adjusted[:, HOME_IDX] *= hf
                adjusted[:, DRAW_IDX] *= df
                pred = np.argmax(adjusted, axis=1)
                fold_f1[(hf, df)].append(f1_score(fold_y_val, pred, average="macro"))

    best_factors, best_f1 = (1.0, 1.0), np.mean(baseline_fold_f1)

    for (hf, df), scores in fold_f1.items():
        avg_f1 = np.mean(scores)
        if avg_f1 > best_f1:
            best_f1, best_factors = avg_f1, (hf, df)

    return best_factors


print(f"Training matches: {X_train.shape}")
print(f"Testing matches: {X_test.shape}")

# --------------------------------------------------
# Models
# --------------------------------------------------

models = {

    "Random Forest": RandomForestClassifier(
        n_estimators=500,
        max_depth=15,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1
    ),

    "Gradient Boosting": GradientBoostingClassifier(
        random_state=42
    ),

    "XGBoost": XGBClassifier(
        random_state=42,
        eval_metric="mlogloss"
    ),

    "LightGBM": LGBMClassifier(
        random_state=42,
        verbose=-1
    ),

    "CatBoost": CatBoostClassifier(
        verbose=False,
        random_state=42
    )
}

# --------------------------------------------------
# Hyperparameter tuning was tried here (RandomizedSearchCV over
# Gradient Boosting, time-respecting CV). Removed: it never beat the
# untuned defaults on the actual test set, tried twice with two
# different scoring metrics, and cost real runtime for zero benefit.
# Worth knowing that was tried and didn't pay off, not worth paying
# for on every run.
# --------------------------------------------------

# --------------------------------------------------
# Train + evaluate each model on its own
# --------------------------------------------------

fig, axes = plt.subplots(2, 3, figsize=(16, 10))
axes = axes.flatten()

results = []
fitted_models = {}
fitted_probabilities = {}
inner_val_probabilities = {}

for ax, (name, model) in zip(axes, models.items()):

    use_balancing = choose_weighting(model)
    weight = sample_weight if use_balancing else None

    print(
        f"\n{name}: using "
        f"{'calibrated (balanced)' if use_balancing else 'confident (unweighted)'} "
        f"mode (chosen via internal validation)"
    )

    model.fit(X_train, y_train, sample_weight=weight)

    home_penalty, draw_boost = choose_probability_adjustments(model, use_balancing)
    print(
        f"{name}: Home penalty {home_penalty:.2f}, Draw boost {draw_boost:.2f} "
        f"(chosen via internal validation)"
    )

    # Note: the saved football_model.pkl below is the raw fitted model
    # only -- these adjustments are a prediction-time decision
    # correction, not part of the model itself, so anything loading
    # the .pkl directly and calling .predict() will NOT get it applied.
    probabilities = model.predict_proba(X_test)
    probabilities[:, HOME_IDX] *= home_penalty
    probabilities[:, DRAW_IDX] *= draw_boost
    predictions = np.argmax(probabilities, axis=1)

    accuracy = accuracy_score(y_test, predictions)

    results.append((name, accuracy))
    fitted_models[name] = model
    fitted_probabilities[name] = probabilities

    # A second model, fit on X_inner_train only (same weighting/
    # adjustment choices), gives this model's predictions on data it
    # never saw -- needed below to pick which models actually belong
    # in the ensemble, on real held-out data rather than the test set
    # itself.
    inner_model = model.__class__(**model.get_params())
    inner_weight = inner_sample_weight if use_balancing else None
    inner_model.fit(X_inner_train, y_inner_train, sample_weight=inner_weight)
    inner_proba = inner_model.predict_proba(X_inner_val)
    inner_proba[:, HOME_IDX] *= home_penalty
    inner_proba[:, DRAW_IDX] *= draw_boost
    inner_val_probabilities[name] = inner_proba

    print(f"\n{'=' * 60}")
    print(f"{name} — Accuracy: {accuracy:.2%}")
    print("=" * 60)

    print(classification_report(
        y_test,
        predictions,
        target_names=display_labels
    ))

    # Calibration: does this model predict each outcome about as
    # often as it actually happens? Different question from recall --
    # a model can have a "Home vs Away recall gap" and still be well
    # calibrated, if Home really does happen more. This is the check
    # that actually catches over/under-prediction.
    predicted_dist = np.bincount(predictions, minlength=3) / len(predictions)
    true_dist = np.bincount(y_test, minlength=3) / len(y_test)
    total_deviation = np.abs(predicted_dist - true_dist).sum() * 100

    print("Calibration (predicted proportion vs. real proportion):")
    for i, label in enumerate(display_labels):
        print(
            f"  {label:<10} predicted {predicted_dist[i]:.1%}  "
            f"vs. actual {true_dist[i]:.1%}"
        )
    print(f"  Total deviation: {total_deviation:.1f} points (lower = better calibrated)")

    cm = confusion_matrix(y_test, predictions)
    cm_percent = cm.astype(float) / cm.sum(axis=1)[:, np.newaxis] * 100

    ConfusionMatrixDisplay(
        confusion_matrix=cm_percent,
        display_labels=display_labels
    ).plot(ax=ax, values_format=".1f", cmap="Blues", colorbar=False)

    ax.set_title(f"{name}\n{accuracy:.1%} accuracy")

# --------------------------------------------------
# Ensemble: soft-vote across a CHOSEN subset of the 5 already-fitted
# models -- not always all 5. All 5 isn't automatically best: a model
# that's individually weaker can still add real value if its mistakes
# are uncorrelated with the others, while a model that's individually
# strong can still make the ensemble WORSE if it just duplicates votes
# the others already cast (confirmed directly: dropping CatBoost --
# the 3rd-best model solo -- beat using all 5, because its errors
# overlapped too much with the other boosted-tree models).
#
# Every non-trivial subset (2-5 models) is scored on f1_macro using
# the internal validation slice (inner_val_probabilities, built above
# from models that never saw this data) -- never the real test set,
# same discipline as every other choice in this file. Whichever subset
# wins there is what actually gets used below.
#
# Built manually instead of sklearn's VotingClassifier: that class
# clones and refits every sub-estimator with one shared sample_weight,
# which would silently throw away each model's own chosen weighting
# from above. Reusing the models already fitted in the loop preserves
# that per-model choice correctly.
# --------------------------------------------------

best_ensemble_members, best_ensemble_f1 = None, -1

for r in range(2, len(models) + 1):
    for combo in itertools.combinations(models.keys(), r):
        combo_proba = np.mean([inner_val_probabilities[name] for name in combo], axis=0)
        combo_f1 = f1_score(
            y_inner_val, np.argmax(combo_proba, axis=1), average="macro"
        )
        if combo_f1 > best_ensemble_f1:
            best_ensemble_f1, best_ensemble_members = combo_f1, combo

print(
    f"\nEnsemble members chosen via internal validation: "
    f"{', '.join(best_ensemble_members)}"
)

# Averages each chosen model's already Home-penalty-corrected
# probabilities (fitted_probabilities), not a fresh predict_proba()
# call -- the ensemble should reflect the same corrected decision each
# model individually makes, not silently revert to their raw,
# over-calling Home Win probabilities.
ensemble_probabilities = np.mean(
    [fitted_probabilities[name] for name in best_ensemble_members],
    axis=0
)
ensemble_predictions = np.argmax(ensemble_probabilities, axis=1)

ensemble_accuracy = accuracy_score(y_test, ensemble_predictions)
results.append((
    f"Ensemble ({len(best_ensemble_members)}, soft vote)", ensemble_accuracy
))

print(f"\n{'=' * 60}")
print(f"Ensemble ({', '.join(best_ensemble_members)}) — Accuracy: {ensemble_accuracy:.2%}")
print("=" * 60)

print(classification_report(
    y_test,
    ensemble_predictions,
    target_names=display_labels
))

predicted_dist = np.bincount(ensemble_predictions, minlength=3) / len(ensemble_predictions)
true_dist = np.bincount(y_test, minlength=3) / len(y_test)
total_deviation = np.abs(predicted_dist - true_dist).sum() * 100

print("Calibration (predicted proportion vs. real proportion):")
for i, label in enumerate(display_labels):
    print(
        f"  {label:<10} predicted {predicted_dist[i]:.1%}  "
        f"vs. actual {true_dist[i]:.1%}"
    )
print(f"  Total deviation: {total_deviation:.1f} points (lower = better calibrated)")

cm = confusion_matrix(y_test, ensemble_predictions)
cm_percent = cm.astype(float) / cm.sum(axis=1)[:, np.newaxis] * 100

ConfusionMatrixDisplay(
    confusion_matrix=cm_percent,
    display_labels=display_labels
).plot(ax=axes[5], values_format=".1f", cmap="Greens", colorbar=False)

axes[5].set_title(f"Ensemble ({len(best_ensemble_members)})\n{ensemble_accuracy:.1%} accuracy")

plt.tight_layout()
plt.show()

# --------------------------------------------------
# Final comparison table
# --------------------------------------------------

summary = pd.DataFrame(results, columns=["Model", "Accuracy"])
summary = summary.sort_values(by="Accuracy", ascending=False)
summary["Accuracy"] = summary["Accuracy"].map(lambda x: f"{x:.2%}")

print("\nFinal comparison:\n")
print(summary.to_string(index=False))

# --------------------------------------------------
# Save the best individual model (not the ensemble --
# the whole point of comparing is to see if the ensemble
# is actually worth the extra complexity over the best
# single model, not to assume it always is)
# --------------------------------------------------

best_name, best_accuracy = max(results[:len(models)], key=lambda r: r[1])

joblib.dump(fitted_models[best_name], "football_model.pkl")

print(
    f"\nBest individual model ({best_name}, {best_accuracy:.2%}) "
    f"saved as football_model.pkl"
)

# --------------------------------------------------
# Random Forest, tuned profiles
#
# Random Forest has been the strongest, most consistent model
# throughout this project. Rather than committing to one single
# decision threshold as "the" answer, this offers a few clearly-named,
# independently validated profiles on the SAME trained model -- no
# retraining, just a different decision rule at prediction time, each
# chosen by internal validation for a different, explicit goal. Real,
# measured trade-offs, not free lunches: Decisive trades almost all
# Draw recall for real gains on Home/Away; Balanced (the default
# elsewhere in this file) keeps Draw genuinely in play at a real cost
# to Home/Away recall. Neither is "the" answer -- which one to use
# depends on what the prediction is actually for.
# --------------------------------------------------


def search_profile(
    model, use_balancing, objective,
    home_factors=None, away_factors=None, draw_factors=None
):
    """
    Generalizes choose_probability_adjustments to a configurable
    objective and a 3-way (Home/Away/Draw) search -- same 3-fold
    internal validation discipline as everywhere else in this file,
    optimizing for whatever objective(y_true, y_pred) returns instead
    of always f1_macro. Grid resolution is overridable per call -- a
    finer grid (more, closer-together candidate factors) finds a
    closer answer for an ambitious explicit target, at real extra
    compute cost, so it's used selectively rather than everywhere.
    """

    if home_factors is None:
        home_factors = np.arange(1.0, 0.35, -0.1)
    if away_factors is None:
        away_factors = np.arange(1.0, 2.05, 0.15)
    if draw_factors is None:
        draw_factors = np.arange(0.4, 2.05, 0.2)

    tscv = TimeSeriesSplit(n_splits=3)

    fold_scores = {
        (hf, af, df): []
        for hf in home_factors for af in away_factors for df in draw_factors
    }

    for fold_train_idx, fold_val_idx in tscv.split(X_train):

        fold_model = model.__class__(**model.get_params())
        fold_X_train = X_train.iloc[fold_train_idx]
        fold_y_train = y_train[fold_train_idx]
        fold_weight = (
            compute_sample_weight("balanced", fold_y_train) if use_balancing else None
        )
        fold_model.fit(fold_X_train, fold_y_train, sample_weight=fold_weight)

        fold_proba = fold_model.predict_proba(X_train.iloc[fold_val_idx])
        fold_y_val = y_train[fold_val_idx]

        for hf in home_factors:
            for af in away_factors:
                for df in draw_factors:
                    adjusted = fold_proba.copy()
                    adjusted[:, HOME_IDX] *= hf
                    adjusted[:, AWAY_IDX] *= af
                    adjusted[:, DRAW_IDX] *= df
                    pred = np.argmax(adjusted, axis=1)
                    fold_scores[(hf, af, df)].append(objective(fold_y_val, pred))

    best_factors, best_score = (1.0, 1.0, 1.0), -1.0

    for factors, scores in fold_scores.items():
        avg_score = np.mean(scores)
        if avg_score > best_score:
            best_score, best_factors = avg_score, factors

    return best_factors


def accuracy_objective(y_true, y_pred):
    # "Deadkill": whatever raw accuracy this model can possibly reach,
    # no constraint on how the three classes get there. Optimizing
    # accuracy directly (not f1_macro) is exactly the metric that
    # rewards leaning on the majority class -- deliberate here, this
    # profile's entire point is squeezing out the last bit of overall
    # correctness, not balance.
    return accuracy_score(y_true, y_pred)


def even_objective(y_true, y_pred):
    # The MINIMUM recall across all THREE classes -- not an average
    # (f1_macro tolerates one weak class if the others are strong) and
    # not a 2-way minimum (decisive_objective ignores Draw entirely).
    # This is the actual mathematical definition of "as balanced as
    # possible": whichever class is doing worst, make it do as well as
    # it can, even if that costs the strongest class some ground. An
    # UNWEIGHTED 3-way minimum like this one always converges toward
    # exactly equal Home/Away recall once Draw hits its own ceiling --
    # that's not an artifact, it's what "maximize the worst one"
    # necessarily does once two of the three have real headroom left.
    home_mask = y_true == HOME_IDX
    away_mask = y_true == AWAY_IDX
    draw_mask = y_true == DRAW_IDX
    home_recall = (y_pred[home_mask] == HOME_IDX).mean() if home_mask.any() else 0.0
    away_recall = (y_pred[away_mask] == AWAY_IDX).mean() if away_mask.any() else 0.0
    draw_recall = (y_pred[draw_mask] == DRAW_IDX).mean() if draw_mask.any() else 0.0
    return min(home_recall, away_recall, draw_recall)


def target_ratio_objective_factory(home_target, away_target, draw_target):
    """
    Unlike even_objective (which always converges toward exactly EQUAL
    recall once the weakest class maxes out), this targets a specific
    NAMED ratio -- e.g. 55/55/30 -- by dividing each class's recall by
    its own target before taking the minimum. The search then
    maximizes "how close is the worst-performing class to ITS OWN
    goal," not "how close are all three to each other." A class that
    clears its target with room to spare no longer holds the others
    back, which is what actually produces results near a chosen ratio
    like 60/60/20 instead of always sliding toward a flat tie.
    """

    def objective(y_true, y_pred):
        home_mask = y_true == HOME_IDX
        away_mask = y_true == AWAY_IDX
        draw_mask = y_true == DRAW_IDX
        home_recall = (y_pred[home_mask] == HOME_IDX).mean() if home_mask.any() else 0.0
        away_recall = (y_pred[away_mask] == AWAY_IDX).mean() if away_mask.any() else 0.0
        draw_recall = (y_pred[draw_mask] == DRAW_IDX).mean() if draw_mask.any() else 0.0
        return min(
            home_recall / home_target,
            away_recall / away_target,
            draw_recall / draw_target,
        )

    return objective


# Three named profiles, each an explicit, different goal -- the three
# actually wanted, not every candidate objective explored along the
# way (those are gone: dead code left lying around is exactly what
# today's audit pass was for).
PROFILES = {
    "Balanced": (even_objective, {}),
    "Deadkill (max accuracy, no balance constraint)": (accuracy_objective, {}),
    # 60/60/40 gets a much finer grid than the others -- a genuinely
    # ambitious explicit target is worth the extra search cost to get
    # as close as the model can actually reach, not just whatever a
    # coarse grid happens to land near.
    "Target 60/60/40": (
        target_ratio_objective_factory(0.60, 0.60, 0.40),
        {
            "home_factors": np.arange(1.0, 0.30, -0.05),
            "away_factors": np.arange(1.0, 2.55, 0.1),
            "draw_factors": np.arange(0.4, 2.55, 0.1),
        },
    ),
}

rf_model = fitted_models["Random Forest"]
rf_use_balancing = choose_weighting(rf_model)
rf_base_proba = rf_model.predict_proba(X_test)

print(f"\n{'=' * 60}")
print("Random Forest — tuned profiles")
print("=" * 60)

for profile_name, (objective, grid_kwargs) in PROFILES.items():

    hf, af, df = search_profile(rf_model, rf_use_balancing, objective, **grid_kwargs)

    adjusted = rf_base_proba.copy()
    adjusted[:, HOME_IDX] *= hf
    adjusted[:, AWAY_IDX] *= af
    adjusted[:, DRAW_IDX] *= df
    pred = np.argmax(adjusted, axis=1)

    print(
        f"\n{profile_name}\n"
        f"  factors: home={hf:.2f} away={af:.2f} draw={df:.2f} "
        f"(chosen via internal validation)"
    )
    print(classification_report(y_test, pred, target_names=display_labels))

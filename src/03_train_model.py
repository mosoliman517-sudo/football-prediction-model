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
from sklearn.metrics import (
    accuracy_score,
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

# Class-balanced weighting is not a universal win -- confirmed
# directly: on the 2025-26 test season, it helps CatBoost and Random
# Forest by several points, but actively HURTS Gradient Boosting
# (40.79% balanced vs 46.58% unweighted -- a bigger swing than almost
# anything else tried this project) and roughly wipes out for
# XGBoost/LightGBM. One global toggle was hiding that. So each model
# picks its own weighting here, decided on an internal validation
# slice carved out of the training data (last 15%, chronologically) --
# never the real test set, so the choice isn't just fit to these exact
# 380 matches.
sample_weight = compute_sample_weight("balanced", y_train)

inner_cutoff = int(len(X_train) * 0.85)
X_inner_train, X_inner_val = X_train.iloc[:inner_cutoff], X_train.iloc[inner_cutoff:]
y_inner_train, y_inner_val = y_train[:inner_cutoff], y_train[inner_cutoff:]
inner_sample_weight = compute_sample_weight("balanced", y_inner_train)


def choose_weighting(model):
    """
    True if this model does better balanced, False if it does better
    unweighted -- measured only on the internal validation slice.
    """

    balanced_model = model.__class__(**model.get_params())
    balanced_model.fit(X_inner_train, y_inner_train, sample_weight=inner_sample_weight)
    balanced_accuracy = accuracy_score(
        y_inner_val, np.ravel(balanced_model.predict(X_inner_val))
    )

    unweighted_model = model.__class__(**model.get_params())
    unweighted_model.fit(X_inner_train, y_inner_train)
    unweighted_accuracy = accuracy_score(
        y_inner_val, np.ravel(unweighted_model.predict(X_inner_val))
    )

    return balanced_accuracy >= unweighted_accuracy


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
model_weighting_choice = {}

for ax, (name, model) in zip(axes, models.items()):

    use_balancing = choose_weighting(model)
    model_weighting_choice[name] = use_balancing
    weight = sample_weight if use_balancing else None

    print(
        f"\n{name}: using "
        f"{'calibrated (balanced)' if use_balancing else 'confident (unweighted)'} "
        f"mode (chosen via internal validation)"
    )

    model.fit(X_train, y_train, sample_weight=weight)
    predictions = np.ravel(model.predict(X_test))   # CatBoost returns (n, 1), not (n,)

    accuracy = accuracy_score(y_test, predictions)

    results.append((name, accuracy))
    fitted_models[name] = model

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
# Ensemble: soft-vote across all 5 already-fitted models — average
# each one's predicted probabilities per class, take whichever class
# comes out highest.
#
# Built manually instead of sklearn's VotingClassifier: that class
# clones and refits every sub-estimator with one shared sample_weight,
# which would silently throw away each model's own chosen weighting
# from above. Reusing the models already fitted in the loop preserves
# that per-model choice correctly.
# --------------------------------------------------

ensemble_probabilities = np.mean(
    [fitted_models[name].predict_proba(X_test) for name in models],
    axis=0
)
ensemble_predictions = np.argmax(ensemble_probabilities, axis=1)

ensemble_accuracy = accuracy_score(y_test, ensemble_predictions)
results.append(("Ensemble (all 5, soft vote)", ensemble_accuracy))

print(f"\n{'=' * 60}")
print(f"Ensemble (all 5 models) — Accuracy: {ensemble_accuracy:.2%}")
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

axes[5].set_title(f"Ensemble (all 5)\n{ensemble_accuracy:.1%} accuracy")

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

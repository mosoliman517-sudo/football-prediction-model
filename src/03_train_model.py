import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import joblib

from sklearn.ensemble import (
    RandomForestClassifier,
    GradientBoostingClassifier,
    VotingClassifier
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

# Two honest, different philosophies -- pick one, not a bug either way:
#
# True (calibrated): predicted proportions match real-world rates as
# closely as possible (Home ~47%, Away ~30%, Draw ~22%). Home and Away
# recall come out close to each other (~60-65% each), because that's
# what "not over-guessing the favorite" actually looks like.
#
# False (confident): no correction for Home Win being the most common
# outcome. Home recall climbs back to ~75-81% -- but only because the
# model calls Home Win far more than its real ~47% rate (as high as
# 62.5% of predictions), which is the exact miscalibration this
# project spent real effort finding and fixing. Higher Home recall
# here isn't better judgment, it's a more aggressive guess.
USE_CLASS_BALANCING = False

sample_weight = (
    compute_sample_weight("balanced", y_train) if USE_CLASS_BALANCING
    else None
)

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

for ax, (name, model) in zip(axes, models.items()):

    model.fit(X_train, y_train, sample_weight=sample_weight)
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
# Ensemble: soft-vote across all 5 models — average
# every model's predicted probabilities per class,
# take whichever class comes out highest
# --------------------------------------------------

ensemble = VotingClassifier(
    estimators=list(models.items()),
    voting="soft"
)

ensemble.fit(X_train, y_train, sample_weight=sample_weight)
ensemble_predictions = ensemble.predict(X_test)

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
# Save the best individual model (not the ensemble —
# VotingClassifier pickles fine too, but the whole
# point of comparing is to see if the ensemble is
# actually worth the extra complexity over the best
# single model, not to assume it always is)
# --------------------------------------------------

best_name, best_accuracy = max(results[:len(models)], key=lambda r: r[1])

joblib.dump(fitted_models[best_name], "football_model.pkl")

print(
    f"\nBest individual model ({best_name}, {best_accuracy:.2%}) "
    f"saved as football_model.pkl"
)

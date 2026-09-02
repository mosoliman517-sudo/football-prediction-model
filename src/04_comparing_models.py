import pandas as pd
import numpy as np

from sklearn.ensemble import (
    RandomForestClassifier,
    GradientBoostingClassifier
)
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import accuracy_score, f1_score

from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from catboost import CatBoostClassifier

from config import TRAIN_TEST_SPLIT_DATE


# ----------------------------
# Load dataset
# ----------------------------

df = pd.read_csv("02_processed_data/E0_model.csv")
df["Date"] = pd.to_datetime(df["Date"], format="mixed")


# ----------------------------
# Split by season
# ----------------------------

train = df[df["Date"] < TRAIN_TEST_SPLIT_DATE]
test = df[df["Date"] >= TRAIN_TEST_SPLIT_DATE]


# ----------------------------
# Create X and y
# ----------------------------

X_train = train.drop(columns=["FTR"])
y_train = train["FTR"]

X_test = test.drop(columns=["FTR"])
y_test = test["FTR"]

# Encode match results into numbers
encoder = LabelEncoder()

y_train = encoder.fit_transform(y_train)
y_test = encoder.transform(y_test)
# Make column names compatible with XGBoost
X_train.columns = (
    X_train.columns
    .str.replace("[", "", regex=False)
    .str.replace("]", "", regex=False)
    .str.replace("<", "lt_", regex=False)
    .str.replace(">", "gt_", regex=False)
)

X_test.columns = X_train.columns
# ----------------------------
# Remove non-numeric columns
# ----------------------------

columns_to_remove = [
    "Div",
    "Date",
    "HomeTeam",
    "AwayTeam"
]

X_train = X_train.drop(columns=columns_to_remove)
X_test = X_test.drop(columns=columns_to_remove)
X_train = X_train.fillna(0)
X_test = X_test.fillna(0)

# Class-balanced weighting is not a universal win -- confirmed
# directly: it helps CatBoost and Random Forest, but actively hurts
# Gradient Boosting and roughly wipes out for XGBoost/LightGBM. Each
# model picks its own weighting here, decided on an internal
# validation slice (last 15% of training data) -- never the real test
# set, so the choice isn't just fit to these exact test matches.
sample_weight = compute_sample_weight("balanced", y_train)

inner_cutoff = int(len(X_train) * 0.85)
X_inner_train, X_inner_val = X_train.iloc[:inner_cutoff], X_train.iloc[inner_cutoff:]
y_inner_train, y_inner_val = y_train[:inner_cutoff], y_train[inner_cutoff:]
inner_sample_weight = compute_sample_weight("balanced", y_inner_train)


def choose_weighting(model):
    # Scored on f1_macro, not accuracy -- see 03_train_model.py for why
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
    # Home penalty + Draw boost, searched jointly -- every model
    # over-calls Home Win relative to its real ~42% share, and even
    # after correcting that, Draw recall stays low unless boosted
    # separately. See 03_train_model.py for the full explanation. Both
    # are scalar multipliers on predict_proba(), chosen to maximize
    # f1_macro, averaged across 3 chronological folds (not one single
    # slice, which overfit badly on an early single-parameter attempt).
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
                adjusted[:, home_index] *= hf
                adjusted[:, draw_index] *= df
                pred = np.argmax(adjusted, axis=1)
                fold_f1[(hf, df)].append(f1_score(fold_y_val, pred, average="macro"))

    best_factors, best_f1 = (1.0, 1.0), np.mean(baseline_fold_f1)

    for (hf, df), scores in fold_f1.items():
        avg_f1 = np.mean(scores)
        if avg_f1 > best_f1:
            best_f1, best_factors = avg_f1, (hf, df)

    return best_factors


draw_index = list(encoder.classes_).index("D")
home_index = list(encoder.classes_).index("H")

# ----------------------------
# Models
# ----------------------------

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


# ----------------------------
# Compare models
# ----------------------------

print("\nModel Comparison\n")

results = []

for name, model in models.items():

    use_balancing = choose_weighting(model)
    weight = sample_weight if use_balancing else None

    model.fit(X_train, y_train, sample_weight=weight)

    home_penalty, draw_boost = choose_probability_adjustments(model, use_balancing)
    probabilities = model.predict_proba(X_test)
    probabilities[:, home_index] *= home_penalty
    probabilities[:, draw_index] *= draw_boost
    predictions = np.argmax(probabilities, axis=1)

    accuracy = accuracy_score(y_test, predictions)
    draw_f1 = f1_score(y_test, predictions, labels=[draw_index], average="macro")

    results.append([name, accuracy, draw_f1])

results = pd.DataFrame(
    results,
    columns=["Model", "Accuracy", "Draw F1"]
)

results = results.sort_values(
    by="Accuracy",
    ascending=False
)

results["Accuracy"] = results["Accuracy"].map(lambda x: f"{x:.2%}")
results["Draw F1"] = results["Draw F1"].map(lambda x: f"{x:.2f}")

print(results.to_string(index=False))


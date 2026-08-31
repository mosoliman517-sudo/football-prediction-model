import pandas as pd
import numpy as np

from sklearn.ensemble import (
    RandomForestClassifier,
    GradientBoostingClassifier
)
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_sample_weight
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
# directly on the 2025-26 test season: it helps CatBoost and Random
# Forest, but actively hurts Gradient Boosting (40.79% balanced vs
# 46.58% unweighted) and roughly wipes out for XGBoost/LightGBM. Each
# model picks its own weighting here, decided on an internal
# validation slice (last 15% of training data) -- never the real test
# set, so the choice isn't just fit to these exact 380 matches.
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


draw_index = list(encoder.classes_).index("D")

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

    predictions = np.ravel(model.predict(X_test))

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

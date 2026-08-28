import pandas as pd

from sklearn.ensemble import (
    RandomForestClassifier,
    GradientBoostingClassifier
)
from sklearn.metrics import accuracy_score

from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from catboost import CatBoostClassifier


# ----------------------------
# Load dataset
# ----------------------------

df = pd.read_csv("02_processed_data/E0_model.csv")
df["Date"] = pd.to_datetime(df["Date"], dayfirst=True)


# ----------------------------
# Split by season
# ----------------------------

train = df[df["Date"] < "2023-08-01"]
test = df[df["Date"] >= "2023-08-01"]


# ----------------------------
# Create X and y
# ----------------------------

X_train = train.drop(columns=["FTR"])
y_train = train["FTR"]

X_test = test.drop(columns=["FTR"])
y_test = test["FTR"]

# Encode match results into numbers
from sklearn.preprocessing import LabelEncoder

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

# ----------------------------
# Models
# ----------------------------

models = {

    "Random Forest": RandomForestClassifier(
        n_estimators=500,
        max_depth=15,
        min_samples_leaf=2,
        class_weight="balanced",
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

    model.fit(X_train, y_train)

    predictions = model.predict(X_test)

    accuracy = accuracy_score(y_test, predictions)

    results.append([name, accuracy])

results = pd.DataFrame(
    results,
    columns=["Model", "Accuracy"]
)

results = results.sort_values(
    by="Accuracy",
    ascending=False
)

results["Accuracy"] = results["Accuracy"].map(
    lambda x: f"{x:.2%}"
)

print(results.to_string(index=False))
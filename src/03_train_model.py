import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import joblib

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    ConfusionMatrixDisplay,
    classification_report
)

# --------------------------------------------------
# Load Dataset
# --------------------------------------------------

df = pd.read_csv("processed_data/E0_model.csv")
df["Date"] = pd.to_datetime(df["Date"], dayfirst=True)

# --------------------------------------------------
# Split Dataset
# --------------------------------------------------

train = df[df["Date"] < "2023-08-01"]
test = df[df["Date"] >= "2023-08-01"]

X_train = train.drop(columns=["FTR"])
y_train = train["FTR"]

X_test = test.drop(columns=["FTR"])
y_test = test["FTR"]

# Remove columns that cannot be used by the model

columns_to_remove = [
    "Div",
    "Date",
    "HomeTeam",
    "AwayTeam"
]

X_train = X_train.drop(columns=columns_to_remove)
X_test = X_test.drop(columns=columns_to_remove)

print(f"Training matches: {X_train.shape}")
print(f"Testing matches: {X_test.shape}")

# --------------------------------------------------
# Train Model
# --------------------------------------------------

model = RandomForestClassifier(
    n_estimators=500,
    max_depth=15,
    min_samples_split=5,
    min_samples_leaf=2,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1
)

model.fit(X_train, y_train)

# --------------------------------------------------
# Evaluate Model
# --------------------------------------------------

predictions = model.predict(X_test)

accuracy = accuracy_score(y_test, predictions)

print(f"\nOverall Accuracy: {accuracy:.2%}\n")

print(classification_report(
    y_test,
    predictions,
    target_names=["Away Win", "Draw", "Home Win"]
))

# --------------------------------------------------
# Confusion Matrix (%)
# --------------------------------------------------

cm = confusion_matrix(y_test, predictions)

cm_percent = cm.astype(float) / cm.sum(axis=1)[:, np.newaxis] * 100

display = ConfusionMatrixDisplay(
    confusion_matrix=cm_percent,
    display_labels=["Home Win", "Draw", "Away Win"]
)

display.plot(values_format=".1f", cmap="Blues")
plt.title("Confusion Matrix (%)")
plt.show()

# --------------------------------------------------
# Feature Importance
# --------------------------------------------------

importance = pd.DataFrame({
    "Feature": X_train.columns,
    "Importance": model.feature_importances_
})

importance = importance.sort_values(
    by="Importance",
    ascending=False
)

print("\nTop 20 Most Important Features:\n")
print(importance.head(20))

plt.figure(figsize=(10, 8))

top20 = importance.head(20)

plt.barh(top20["Feature"], top20["Importance"])
plt.gca().invert_yaxis()

plt.xlabel("Importance")
plt.title("Top 20 Most Important Features")

plt.tight_layout()
plt.show()

# --------------------------------------------------
# Prediction Confidence
# --------------------------------------------------

probabilities = model.predict_proba(X_test)

print("\nPrediction Probabilities (First 10 Matches):\n")
print(pd.DataFrame(
    probabilities,
    columns=model.classes_
).head(10))

# --------------------------------------------------
# Save Model
# --------------------------------------------------

joblib.dump(model, "football_model.pkl")

print("\nModel saved as football_model.pkl")
import joblib

print("Model saved successfully!")
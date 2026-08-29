# Single source of truth for values that need to match across scripts.
# This is exactly the kind of thing that just silently drifted between
# 03_train_model.py and 04_comparing_models.py (different date parsing,
# different Random Forest settings) — one shared constant instead of
# four copy-pasted ones is how that stops happening again.

TRAIN_TEST_SPLIT_DATE = "2025-08-01"   # test = 2025-26, the most recently
                                         # completed season (~380 matches).
                                         # Train = every season 2014-15
                                         # through 2024-25 (11 seasons).
                                         # Was "2023-08-01" (test = 2023-24)
                                         # before 24-25/25-26 data existed.

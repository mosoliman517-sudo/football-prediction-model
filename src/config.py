# Single source of truth for values that need to match across scripts.
# This is exactly the kind of thing that just silently drifted between
# 03_train_model.py and 04_comparing_models.py (different date parsing,
# different Random Forest settings) — one shared constant instead of
# four copy-pasted ones is how that stops happening again.

TRAIN_TEST_SPLIT_DATE = "2024-08-01"   # test = 2024-25 AND 2025-26, two
                                         # full seasons (~760 matches) instead
                                         # of one -- a single season is a
                                         # small enough sample that one hot
                                         # or cold run can swing the headline
                                         # number more than the underlying
                                         # model actually changed; two seasons
                                         # cuts that variance down.
                                         # Train = every season 2014-15
                                         # through 2023-24 (10 seasons).
                                         # Was "2025-08-01" (test = 2025-26
                                         # only) before this.

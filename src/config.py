# Single source of truth for values that need to match across scripts.
# This is exactly the kind of thing that just silently drifted between
# 03_train_model.py and 04_comparing_models.py (different date parsing,
# different Random Forest settings) — one shared constant instead of
# four copy-pasted ones is how that stops happening again.

TRAIN_TEST_SPLIT_DATE = "2022-08-01"   # test = 2022-23 and 2023-24, two
                                         # full seasons (~760 matches)
                                         # instead of one, so a single
                                         # lucky/unlucky season can't
                                         # swing the whole result

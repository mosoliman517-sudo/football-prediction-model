# Single source of truth for values that need to match across scripts.
# This is exactly the kind of thing that just silently drifted between
# 03_train_model.py and 04_comparing_models.py (different date parsing,
# different Random Forest settings) — one shared constant instead of
# four copy-pasted ones is how that stops happening again.

TRAIN_TEST_SPLIT_DATE = "2023-08-01"   # test = 2023-24 only, one full
                                         # season (~380 matches), so a
                                         # predicted-vs-actual league
                                         # table (06_predict_season_table.py)
                                         # is comparing against one real,
                                         # coherent season rather than two
                                         # spliced together. Was "2022-08-01"
                                         # (2 test seasons) earlier in this
                                         # project for a more robust
                                         # accuracy read -- that's a real
                                         # trade-off, not a free change.

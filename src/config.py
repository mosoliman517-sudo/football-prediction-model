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


LIVE_SEASON_START = "2026-08-01"   # 2026-27 onward is kept in its own files
                                    # (E0_live_*.csv), never mixed into the
                                    # 760-match benchmark above: the benchmark
                                    # stays comparable run to run while the
                                    # live season grows week by week. The
                                    # model never trains on any of it.


ELO_FORMAT = "classic"    # "classic": ONE rating per club, K=15, +40 home edge, 20% reversion each summer, margin multiplier.
                           # Won the 18_test_elo_formats experiment against the older "dual" format (separate home and away
                           # ratings plus a calibrated expectation model), which is still in features/elo.py.
CLASSIC_ELO = {"K": 15, "HA": 40, "REV": 0.2}

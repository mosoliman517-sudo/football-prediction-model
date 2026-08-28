import numpy as np

from sklearn.base import clone
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import f1_score


def tune_draw_margin(
    model, X_train, y_train, draw_index, home_index, away_index, n_splits=5
):
    """
    Finds how close a match's Home/Away probabilities need to be
    before it gets called a Draw.

    An earlier version here forced the Draw-call rate to match
    whatever fraction of training matches happened to be a draw --
    but that's a quota, not a judgment: if one stretch of seasons
    happened to have an unusually high or low Draw rate, the model
    would blindly reproduce that same rate on future matches instead
    of actually assessing each one. That's not what's wanted here --
    the model should go with whatever's genuinely most likely match by
    match, it just shouldn't be *structurally incapable* of ever
    landing on Draw the way plain argmax is.

    So instead: search candidate thresholds and keep whichever one
    scores best on f1_macro (training-only, cross-validated). A
    threshold of 0 (never call Draw) is one of the candidates and
    loses badly on f1_macro because a class stuck at 0% recall drags
    the macro average down hard -- so the search won't collapse to
    zero. But nothing here targets a specific Draw percentage either;
    whatever threshold balances all three classes best is what wins,
    and the resulting Draw rate is just whatever falls out of that,
    not a number this function tries to hit.

    Only matches where the model itself sees Home and Away as close
    get reconsidered as a Draw at all -- a match at Home 65%/Away 10%
    is untouched regardless of the threshold found; only genuinely
    close matches are ever in play.
    """

    oof_indices = []
    oof_probability_batches = []

    for train_idx, val_idx in TimeSeriesSplit(n_splits=n_splits).split(X_train):

        fold_model = clone(model)
        fold_model.fit(X_train.iloc[train_idx], y_train[train_idx])

        oof_probability_batches.append(
            fold_model.predict_proba(X_train.iloc[val_idx])
        )
        oof_indices.append(val_idx)

    oof_indices = np.concatenate(oof_indices)
    oof_probabilities = np.concatenate(oof_probability_batches)
    oof_y = y_train[oof_indices]

    margins = np.abs(
        oof_probabilities[:, home_index] - oof_probabilities[:, away_index]
    )
    home_favored = oof_probabilities[:, home_index] >= oof_probabilities[:, away_index]

    best_threshold = 0.0
    best_f1 = f1_score(oof_y, oof_probabilities.argmax(axis=1), average="macro")

    for threshold in np.linspace(0.0, margins.max(), 60):

        predictions = np.where(
            margins < threshold,
            draw_index,
            np.where(home_favored, home_index, away_index)
        )

        score = f1_score(oof_y, predictions, average="macro")

        if score > best_f1:
            best_f1 = score
            best_threshold = threshold

    resulting_draw_rate = (margins < best_threshold).mean()

    return best_threshold, best_f1, resulting_draw_rate


def apply_draw_margin(probabilities, draw_index, home_index, away_index, threshold):
    margins = np.abs(probabilities[:, home_index] - probabilities[:, away_index])
    home_favored = probabilities[:, home_index] >= probabilities[:, away_index]

    return np.where(
        margins < threshold,
        draw_index,
        np.where(home_favored, home_index, away_index)
    )

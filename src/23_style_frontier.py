"""
What Home / Draw / Away recall combinations can the model reach at all? Sweeps the decision factors
(how much to boost or damp each outcome before picking the top one), tuned on out-of-fold TRAINING
odds and reported on the held-out 760. Shows (1) the closest approach to a 70 / 60 / 40 target and
(2) the best draw and away recall available at each level of home recall.
Run from the project root:  python3 src/23_style_frontier.py
"""
import numpy as np

import oof_blend

z = oof_blend.get()
P_tr, y_tr, P_te, y_te = z["P_tr"], z["y_tr"], z["P_te"], z["y_te"]
TARGET = np.array([0.70, 0.60, 0.40])          # Home, Away, Draw


def rec(P, y, a, d):
    pick = np.argmax(P * np.array([a, d, 1.0]), 1)
    return np.array([(pick[y == 2] == 2).mean(), (pick[y == 0] == 0).mean(), (pick[y == 1] == 1).mean()]), (pick == y).mean()


grid = [(a, d) for a in np.arange(0.5, 2.51, 0.05) for d in np.arange(0.3, 2.61, 0.05)]
tr = {g: rec(P_tr, y_tr, *g) for g in grid}
te = {g: rec(P_te, y_te, *g) for g in grid}
show = lambda r, acc: f"Home {r[0]:.0%}  Away {r[1]:.0%}  Draw {r[2]:.0%}   accuracy {acc:.1%}"

best = max(grid, key=lambda g: np.min(tr[g][0] / TARGET))
print("Closest to Home 70 / Away 60 / Draw 40 (tuned on training out-of-fold, so the held-out line is the honest one):")
print("  training :", show(*tr[best]), f"  (worst target reached: {np.min(tr[best][0] / TARGET):.0%})")
print("  held-out :", show(*te[best]), f"  (worst target reached: {np.min(te[best][0] / TARGET):.0%})   factors away={best[0]:.2f} draw={best[1]:.2f}")
bal = max(grid, key=lambda g: np.min(tr[g][0]))
print("The current idea of balanced (highest worst recall):")
print("  held-out :", show(*te[bal]), f"  factors away={bal[0]:.2f} draw={bal[1]:.2f}")

print("\nHeld-out: best Draw recall and Away recall you can have at each Home recall (found on the held-out grid, so slightly flattering):")
for hmin in (0.50, 0.55, 0.60, 0.65, 0.70, 0.75):
    ok = [g for g in grid if te[g][0][0] >= hmin]
    if not ok: print(f"  Home >= {hmin:.0%}: not reachable"); continue
    b_draw = max(ok, key=lambda g: te[g][0][2]); b_away = max(ok, key=lambda g: te[g][0][1])
    print(f"  Home >= {hmin:.0%}: max Draw -> {show(*te[b_draw])} | max Away -> {show(*te[b_away])}")
print("\nTo find draws you must call them, which takes picks away from Home and Away; the match odds simply do not separate draws from the rest (their ability to flag a draw is barely above a coin flip).")

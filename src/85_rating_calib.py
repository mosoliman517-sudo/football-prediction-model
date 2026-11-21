"""Calibrates the game review's rating estimate on real games: Lichess rated games from January 2024 that carry a
Stockfish evaluation on every move ([%eval] in the PGN), next to both players' ratings. For each player-game the average
centipawn loss (ACPL) is measured exactly as the review does (evaluations clamped to +-8 pawns, mate as 8 pawns, the
first five moves of each side treated as opening book), then the typical rating at each ACPL is tabulated by speed.
Writes 02_processed_data/chess_ratecal.json for src/73_build_chess.py.

Source: 01_data_chess/lichess_2024-01_first250MB.pgn.zst (the first 250 MB of the Lichess open database, CC0).
"""
import io
import json
import re
import statistics
import zstandard
from collections import defaultdict

SRC = "01_data_chess/lichess_2024-01_first250MB.pgn.zst"
BOOK = 5            # moves per side skipped as opening book
MINMOVES = 12       # counted moves per side for a game to be used
CONTEST = 300       # a move counts only if the position before it was within +-3 pawns (decided games stop testing anyone)
EDGES = [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 250, 9999]
EV = re.compile(r"\{ \[%eval ([#\-0-9.]+)\]")
TOK = re.compile(r"(\d+\.(?:\.\.)?)|\{[^}]*\}|([^\s{}]+)")


def cp(e):
    if e.startswith("#"):
        return 800 if not e.startswith("#-") else -800
    return max(-800, min(800, round(float(e) * 100)))


def feats(evals, side):
    """Per-move losses for one side: average loss, and the shares of slips (50-99), mistakes (100-299) and blunders (300+)."""
    L, before = [], 20
    for ply, after in enumerate(evals):
        if ply % 2 == side and ply // 2 >= BOOK and abs(before) < CONTEST:   # only moves made while the game is still in the balance
            sgn = 1 if side == 0 else -1
            L.append(max(0, sgn * before - sgn * after))
        before = after
    if not L:
        return None
    n = len(L)
    return [sum(L) / n, sum(x >= 300 for x in L) / n, sum(100 <= x < 300 for x in L) / n, sum(50 <= x < 100 for x in L) / n, n]


def acpl(evals, side):
    """evals: White-POV centipawns after each ply. side 0 = White, 1 = Black."""
    loss, n, before = 0, 0, 20
    for ply, after in enumerate(evals):
        mover = ply % 2
        if mover == side and ply // 2 >= BOOK:
            sgn = 1 if side == 0 else -1
            loss += max(0, sgn * before - sgn * after); n += 1
        before = after
    return (loss / n, n) if n else (None, 0)


data = defaultdict(list)    # (speed, bin) -> ratings
byr = defaultdict(list)     # (speed, rating band) -> ACPLs
rows = []                   # [speed, rating, acpl, blunder share, mistake share, slip share, moves]
games = used = 0
reader = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(open(SRC, "rb")), encoding="utf-8", errors="ignore")
head, body = {}, []
def flush():
    global used
    if not body or "[%eval" not in "".join(body[:3]):
        return
    ev = [cp(x) for x in EV.findall(" ".join(body))]
    if len(ev) < 2 * (BOOK + MINMOVES):
        return
    tc = head.get("TimeControl", "-"); ev_name = head.get("Event", "")
    if "Rated" not in ev_name or "BOT" in (head.get("WhiteTitle", "") + head.get("BlackTitle", "")):
        return
    try:
        base, inc = (int(x) for x in tc.split("+"))
    except ValueError:
        return
    est = base + 40 * inc
    speed = "Bullet" if est < 180 else "Blitz" if est < 480 else "Rapid" if est < 1500 else "Classical"
    for side, key in ((0, "WhiteElo"), (1, "BlackElo")):
        a, n = acpl(ev, side)
        try:
            r = int(head.get(key, ""))
        except ValueError:
            continue
        if a is None or n < MINMOVES:
            continue
        b = next(k for k in range(len(EDGES) - 1) if a < EDGES[k + 1])
        data[(speed, b)].append(r); byr[(speed, r // 100 * 100)].append(a)
        f = feats(ev, side)
        if f and f[4] >= 6:
            rows.append([speed, r] + f)
    used += 1
for line in reader:
    if line.startswith("[Event "):
        if head:
            games += 1; flush()
        head, body = {}, []
    if line.startswith("["):
        m = re.match(r'\[(\w+) "(.*)"\]', line)
        if m:
            head[m.group(1)] = m.group(2)
    elif line.strip():
        body.append(line)
flush()
out = {}
for (speed, b), rs in sorted(data.items()):
    if len(rs) >= 30:
        out.setdefault(speed, []).append([round((EDGES[b] + min(EDGES[b + 1], 300)) / 2, 1), round(statistics.median(rs)), len(rs), round(statistics.quantiles(rs, n=4)[0]), round(statistics.quantiles(rs, n=4)[2])])
curve = {}
for (speed, rb), xs in sorted(byr.items()):
    if len(xs) >= 60:
        curve.setdefault(speed, []).append([rb + 50, round(statistics.median(xs), 1), len(xs)])
# the estimator: a quality score fitted on these games, then percentile matching (a game that ranks among the best 10%
# of games gets the rating of the top 10% of players), so the estimate keeps the real spread of ratings
import math
import numpy as np
SPEEDS = ["Bullet", "Blitz", "Rapid", "Classical"]
X = np.array([[1, math.log(a + 5), b, m, sl] + [1.0 if sp == q else 0.0 for q in SPEEDS[1:]] for sp, r, a, b, m, sl, n in rows]); y = np.array([r for _, r, *_ in rows], float)
coef, *_ = np.linalg.lstsq(X, y, rcond=None); q = X @ coef
maps = {}
for k, sp in enumerate(SPEEDS):
    idx = [i for i, rw in enumerate(rows) if rw[0] == sp]
    if len(idx) < 300:
        continue
    qs, rs = np.sort(q[idx]), np.sort(y[idx]); P = np.linspace(0, 100, 101)
    maps[sp] = {"q": [round(float(np.percentile(qs, p)), 1) for p in P], "r": [round(float(np.percentile(rs, p))) for p in P]}
print("coefficients", [round(float(c), 2) for c in coef])
def est_of(i):
    sp = rows[i][0]; M = maps.get(sp)
    if not M: return None
    qs, rs = M["q"], M["r"]; qq = q[i]; k = 0
    while k < 99 and qs[k + 1] < qq: k += 1
    pct = 0 if qq <= qs[0] else 100 if qq >= qs[100] else k + max(0, min(1, (qq - qs[k]) / ((qs[k + 1] - qs[k]) or 1)))
    n = rows[i][6]; pct = 50 + (pct - 50) * (n / (n + 8)); j = min(99, int(pct)); return rs[j] + (rs[j + 1] - rs[j]) * (pct - j)
ests = [est_of(i) for i in range(len(rows))]
errs = [abs(e - rows[i][1]) for i, e in enumerate(ests) if e is not None]
# one game says little on its own: an estimate of 1800 comes from real players rated anywhere from ~1350 to ~2250, so the
# page shows the range that holds the middle 80% of real players who produced that estimate, not a fixed +-margin
spread = defaultdict(list)
for i, e in enumerate(ests):
    if e is not None:
        spread[int(e // 100) * 100].append(rows[i][1])
spread = [[b + 50] + [round(float(np.percentile(v, p))) for p in (10, 50, 90)] for b, v in sorted(spread.items()) if len(v) >= 50]
print("estimate -> real rating 10/50/90%:", spread)
print(f"median error {statistics.median(errs):.0f}, within 300: {sum(e <= 300 for e in errs) / len(errs):.0%}, of {len(errs)} player-games")
json.dump({"book": BOOK, "edges": EDGES, "table": out, "curve": curve, "games": used, "coef": [round(float(c), 4) for c in coef], "speeds": SPEEDS, "maps": maps, "spread": spread}, open("02_processed_data/chess_ratecal.json", "w"), separators=(",", ":"))
print(f"{games} games read, {used} with evaluations used")
for sp, cr in curve.items():
    print(sp, [(r[0], r[1], r[2]) for r in cr])

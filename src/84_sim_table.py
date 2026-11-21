"""The match simulator's numbers, from real games: for each time control, average-rating band and rating gap, how often
the higher-rated player scores and how often the game is drawn. Lichess games (02_processed_data/chess_games.csv.gz,
810,453 rated games) cover club level; the elite archive (chess_elite.json: classical events, World Rapid and World Blitz)
covers 2600 and above. Writes 02_processed_data/chess_sim.json for src/73_build_chess.py.

Note: Lichess, chess.com and FIDE ratings are different scales; the simulator treats a number as a number, and says so.
"""
import csv
import gzip
import json
from collections import defaultdict

BANDS = list(range(600, 3000, 200))            # average rating band starts
GAPS = [0, 100, 250, 500, 800]                 # absolute rating gap band starts


def band(avg):
    return max(b for b in BANDS if b <= max(BANDS[0], avg))


def gap(d):
    return max(g for g in GAPS if g <= d)


acc = defaultdict(lambda: [0, 0.0, 0])          # n, higher-rated score, draws
for r in csv.DictReader(gzip.open("02_processed_data/chess_games.csv.gz", "rt", encoding="utf-8")):
    try:
        w, b, s = int(r["welo"]), int(r["belo"]), float(r["res"])
    except ValueError:
        continue
    sp = r["speed"] if r["speed"] in ("Blitz", "Rapid", "Classical", "Bullet") else None
    if not sp or (w + b) / 2 >= 2500:   # above 2500 Lichess is a few accounts (one pair drew 92% of 288 blitz games); the elite archive covers the top
        continue
    hi = s if w >= b else 1 - s
    x = acc[(sp, band((w + b) / 2), gap(abs(w - b)))]
    x[0] += 1; x[1] += hi; x[2] += s == 0.5
for g in json.load(open("02_processed_data/chess_elite.json", encoding="utf-8")):
    w, b = g["we"], g["be"]
    if not w or not b:
        continue
    ev = g["event"].lower()
    sp = "Blitz" if "blitz" in ev else "Rapid" if "rapid" in ev else "Classical"
    if g["kind"] == "World Cup" and sp == "Classical":
        continue   # World Cup tiebreaks are mixed in; leave them out
    s = {"1-0": 1.0, "0-1": 0.0, "1/2-1/2": 0.5}.get(g["result"])
    if s is None:
        continue
    hi = s if w >= b else 1 - s
    x = acc[(sp, band((w + b) / 2), gap(abs(w - b)))]
    x[0] += 1; x[1] += hi; x[2] += s == 0.5
table = {}
for (sp, bd, gp), (n, hi, d) in acc.items():
    if n >= 150:   # thin cells (a handful of elite games) fall back to the nearest band below in the page
        table.setdefault(sp, {}).setdefault(str(bd), {})[str(gp)] = [n, round(hi / n, 4), round(d / n, 4)]
json.dump({"bands": BANDS, "gaps": GAPS, "table": table}, open("02_processed_data/chess_sim.json", "w"), separators=(",", ":"))
for sp in ("Classical", "Rapid", "Blitz"):
    t = table.get(sp, {})
    print(sp, {bd: t[bd].get("0", [0, 0, 0])[2] for bd in sorted(t, key=int)})

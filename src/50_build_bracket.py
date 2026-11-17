"""
Builds the data for the "Bracket buster" game: every Champions League knockout tie from 2012-13 to 2025-26 (round of 16 to the final) with a plain Elo rating
for both clubs just before the tie, into 02_processed_data/bracket.json. The "model" in this game is that Elo rating (every match in games.csv, K=20, home edge 60,
goal-difference bonus); who advanced comes from the next round (so away goals and penalties are handled), the final from its score.
Run from the project root:  python3 src/50_build_bracket.py
"""
import json
import re
import collections

import pandas as pd

D = "01_data_market_value/"


def main():
    g = pd.read_csv(D + "games.csv").sort_values(["date", "game_id"])
    elo, snap = collections.defaultdict(lambda: 1500.0), {}
    cl = g[(g["competition_id"] == "CL")]
    stage = lambda r: "R16" if re.search(r"round of 16|last 16", str(r), re.I) else "QF" if re.search(r"quarter", str(r), re.I) else "SF" if re.search(r"semi", str(r), re.I) else "F" if str(r).lower() == "final" else None
    first = {}
    for r in cl.itertuples():
        s = stage(r.round)
        if s:
            key = (r.season, s, frozenset((r.home_club_id, r.away_club_id)))
            first.setdefault(key, r.game_id)
    firstids = {v: k for k, v in first.items()}
    names = {}
    for r in g.itertuples():
        names[r.home_club_id] = r.home_club_name; names[r.away_club_id] = r.away_club_name
        if r.game_id in firstids:
            snap[firstids[r.game_id]] = (elo[r.home_club_id], elo[r.away_club_id], r.home_club_id, r.away_club_id)
        if pd.isna(r.home_club_goals) or pd.isna(r.away_club_goals):
            continue
        dh = elo[r.home_club_id] + 60 - elo[r.away_club_id]
        e = 1 / (1 + 10 ** (-dh / 400)); s = 1 if r.home_club_goals > r.away_club_goals else 0.5 if r.home_club_goals == r.away_club_goals else 0
        gd = abs(r.home_club_goals - r.away_club_goals); mult = 1 if gd <= 1 else 1.5 if gd == 2 else (11 + gd) / 8
        d = 20 * mult * (s - e); elo[r.home_club_id] += d; elo[r.away_club_id] -= d
    seasons = {}
    for (sn, s, pair), _ in first.items():
        seasons.setdefault(sn, {}).setdefault(s, []).append(pair)
    order = ["R16", "QF", "SF", "F"]; label = {"R16": "Round of 16", "QF": "Quarter-finals", "SF": "Semi-finals", "F": "Final"}
    out = []
    for sn in sorted(seasons):
        st = seasons[sn]
        if not all(k in st for k in order) or len(st["R16"]) != 8:
            continue
        rounds = []
        for i, k in enumerate(order):
            nxt = {c for p in st[order[i + 1]] for c in p} if i < 3 else None
            ties = []
            for pair in st[k]:
                e1, e2, a, b = snap[(sn, k, pair)]
                if nxt is not None:
                    win = a if a in nxt and b not in nxt else b if b in nxt and a not in nxt else None
                else:
                    gm = cl[(cl["season"] == sn) & (cl["round"].astype(str).str.lower() == "final")].iloc[0]
                    win = gm.home_club_id if gm.home_club_goals > gm.away_club_goals else gm.away_club_id
                if win is None:
                    break
                ties.append({"a": names[a], "b": names[b], "ea": round(e1), "eb": round(e2), "w": "a" if win == a else "b"})
            else:
                rounds.append({"name": label[k], "ties": ties})
                continue
            rounds = None
            break
        if rounds:
            out.append({"season": sn, "rounds": rounds})
    json.dump(out, open("02_processed_data/bracket.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    n = sum(1 for s in out for r in s["rounds"] for t in r["ties"] if (t["ea"] >= t["eb"]) == (t["w"] == "a"))
    tot = sum(len(r["ties"]) for s in out for r in s["rounds"])
    print(len(out), "complete bracket seasons;", tot, "ties; the higher Elo advanced in", n, f"({100 * n / tot:.1f}%)")


if __name__ == "__main__":
    main()

"""
Real goals for past league matches: for every Big 5 league match from 2012-13 on that the Transfermarkt match events cover, the minute, scorer, assister and whether it was a penalty,
written to 02_processed_data/real_goals.json for src/30_build_arena.py, which attaches them to each match so the page can show what really happened next to the model's call.
Club names in the match files differ from the arena's, so each arena name is mapped to the match files' name (the ALIAS table in src/34 plus a fuzzy match); matches whose clubs cannot
be mapped, or whose goal list does not add up to the final score (own goals are not marked in the source), are left out rather than guessed. Needs 01_data_market_value/new/game_events.csv.
Run from the project root:  python3 src/53_build_real_goals.py
"""
import difflib
import importlib
import json
import sys

import pandas as pd

sys.path.insert(0, "src")
m34 = importlib.import_module("34_build_quiz_data")
norm, ALIAS = m34.norm, m34.ALIAS
D = "01_data_market_value/"
MANUAL = {"QPR": "Queens Park Rangers", "West Brom": "West Bromwich Albion", "Hertha": "Hertha BSC", "Munich 1860": "TSV 1860 Munich"}
COMP = {"GB1": "E0", "L1": "D1", "ES1": "SP1", "IT1": "I1", "FR1": "F1"}


def main():
    g = pd.read_csv(D + "games.csv")
    g = g[g["competition_id"].isin(COMP) & (g["season"] >= 2012)]
    pl = pd.read_csv(D + "players.csv", usecols=["player_id", "name"]).set_index("player_id")["name"].to_dict()
    mm = pd.read_csv("02_processed_data/multi_league_matches.csv")
    ev = pd.read_csv(D + "new/game_events.csv", usecols=["game_id", "minute", "type", "club_id", "player_id", "description", "player_assist_id"])
    ev = ev[(ev["type"] == "Goals") & ev["game_id"].isin(g["game_id"])]
    by = {k: v for k, v in ev.groupby("game_id")}
    tmnames = {}
    for lg_id, lg in COMP.items():
        names = set(g[g["competition_id"] == lg_id]["home_club_name"]) | set(g[g["competition_id"] == lg_id]["away_club_name"])
        keys = {norm(n): n for n in names}
        mp, miss = {}, []
        for ours in sorted(set(mm[mm["league"] == lg]["home"]) | set(mm[mm["league"] == lg]["away"])):
            cands = [ALIAS.get(ours, ours), ours]
            hit = next((keys[norm(c)] for c in cands if norm(c) in keys), None)
            if not hit:                                         # every word of the arena name appears in exactly one match-file name ("Roma" in "Associazione Sportiva Roma")
                toks = set(norm(ours).split()); cand = [n for k, n in keys.items() if toks and toks <= set(k.split())]
                if len(cand) == 1:
                    hit = cand[0]
            if not hit and ours in MANUAL:
                hit = next((n for n in names if norm(n) == norm(MANUAL[ours])), None)
            if not hit:
                best = difflib.get_close_matches(norm(ours), list(keys), n=1, cutoff=0.8)
                hit = keys[best[0]] if best else None
            if hit:
                mp[ours] = hit
            else:
                miss.append(ours)
        tmnames[lg] = mp
        print(f"{lg}: {len(mp)} clubs mapped, unmapped {miss}")
    rev = {lg: {v: k for k, v in mp.items()} for lg, mp in tmnames.items()}
    out, bad = [], 0
    for r in g.itertuples():
        lg = COMP[r.competition_id]
        h, a = rev[lg].get(r.home_club_name), rev[lg].get(r.away_club_name)
        e = by.get(r.game_id)
        if not h or not a or e is None or pd.isna(r.home_club_goals):
            continue
        hg = int((e["club_id"] == r.home_club_id).sum()); ag = int((e["club_id"] == r.away_club_id).sum())
        if (hg, ag) != (int(r.home_club_goals), int(r.away_club_goals)):
            bad += 1
            continue
        gl = []
        for x in e.sort_values("minute").itertuples():
            nm = pl.get(int(x.player_id)) if pd.notna(x.player_id) else None
            if not nm:
                gl = None
                break
            gl.append([int(x.minute), 0 if x.club_id == r.home_club_id else 1, nm, pl.get(int(x.player_assist_id)) if pd.notna(x.player_assist_id) else None, 1 if "Penalty" in str(x.description) else 0])
        if gl is not None and gl:
            out.append([lg, r.date, h, a, gl])
    json.dump(out, open("02_processed_data/real_goals.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(len(out), "matches with real goals; skipped for a goal list that did not match the score:", bad)


if __name__ == "__main__":
    main()

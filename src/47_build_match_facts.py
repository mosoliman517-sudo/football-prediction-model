"""
Rebuilds the facts the quiz games rely on from real MATCHES instead of from guesses about squads and transfer dates.
Input: the Transfermarkt dataset's per-match files (01_data_market_value/new/appearances.csv and game_lineups.csv, plus games.csv) and quiz_data.json.
Output: 02_processed_data/match_facts.json, which src/34_build_quiz_data.py merges into every player.

  ap   club ids the player made at least one appearance for (2012-13 onward; used on top of the transfer history, which stops being exact once a player has no rows there)
  mg   managers he played at least 3 matches under (the manager on the bench for his club in that match, any competition tracked)
  ti   league titles (Big 5): champion by points, and he made 10 or more league appearances for the champion that season
  hn   cup and Europe wins: he was in the matchday squad (starters and bench, from the lineups) of the final's winner; for 2012-13, which has no lineups, he played in the final
  tm   for the 150 most valuable players: everyone who was in the same match for the same club at least 20 times

Everything covers 2012-13 to 2025-26 (the files start in July 2012); labels in the game say so. Run from the project root:  python3 src/47_build_match_facts.py
"""
import json
import collections

import pandas as pd

BIG = ["GB1", "L1", "ES1", "IT1", "FR1"]
LG = {"GB1": "E0", "L1": "D1", "ES1": "SP1", "IT1": "I1", "FR1": "F1"}
CUPS = {"CL": "UCL", "EL": "UEL", "FAC": "FAC", "CDR": "CDR", "DFB": "DFB", "CIT": "COP"}
D = "01_data_market_value/"


def main():
    qd = json.load(open("02_processed_data/quiz_data.json", encoding="utf-8"))
    ids = {p["id"] for p in qd["players"]}
    peak = {p["id"]: p["peak"] for p in qd["players"]}
    g = pd.read_csv(D + "games.csv")
    a = pd.read_csv(D + "new/appearances.csv", usecols=["game_id", "player_id", "player_club_id", "competition_id", "minutes_played"])
    a = a[a["minutes_played"] > 0].copy()
    # manager of the player's own club in each match
    gm = g.set_index("game_id")
    a = a.join(gm[["home_club_id", "home_club_manager_name", "away_club_manager_name", "season", "competition_type"]], on="game_id")
    a["manager"] = a["home_club_manager_name"].where(a["player_club_id"] == a["home_club_id"], a["away_club_manager_name"])
    mine = a[a["player_id"].isin(ids)]
    out = {pid: {"ap": [], "mg": [], "ti": [], "hn": []} for pid in ids}

    for pid, cl in mine.groupby("player_id")["player_club_id"].unique().items():
        out[pid]["ap"] = [int(c) for c in cl]
    mc = mine.dropna(subset=["manager"]).groupby(["player_id", "manager"]).size()
    for (pid, m), n in mc.items():
        if n >= 3:
            out[pid]["mg"].append(m)

    # league champions by points
    lg = g[(g["competition_type"] == "domestic_league") & g["competition_id"].isin(BIG)]
    pts = collections.defaultdict(float)
    for r in lg.itertuples():
        for cid, gf, ga in ((r.home_club_id, r.home_club_goals, r.away_club_goals), (r.away_club_id, r.away_club_goals, r.home_club_goals)):
            pts[(r.competition_id, r.season, cid)] += 3 if gf > ga else 1 if gf == ga else 0
    champ = {}
    for (comp, sn, cid), v in pts.items():
        if v > champ.get((comp, sn), (None, -1))[1]:
            champ[(comp, sn)] = (cid, v)
    print("champions:", {f"{LG[c]} {s}": champ[(c, s)][0] for (c, s) in sorted(champ) if c == "GB1"})
    la = mine[mine["competition_id"].isin(BIG)].groupby(["player_id", "competition_id", "season", "player_club_id"]).size()
    for (pid, comp, sn, cid), n in la.items():
        if n >= 10 and champ.get((comp, sn), (None,))[0] == cid and LG[comp] not in out[pid]["ti"]:
            out[pid]["ti"].append(LG[comp])

    # cup and Europe finals
    fin = g[g["competition_id"].isin(CUPS) & (g["round"].astype(str).str.lower() == "final")]
    lu = pd.read_csv(D + "new/game_lineups.csv", usecols=["game_id", "player_id", "club_id"])
    lu = lu[lu["game_id"].isin(fin["game_id"]) & lu["player_id"].isin(ids)]
    finals = []
    for r in fin.itertuples():
        win = r.home_club_id if r.home_club_goals > r.away_club_goals else r.away_club_id if r.away_club_goals > r.home_club_goals else None
        if win is None:
            print("  final with no winner on goals, skipped:", r.competition_id, r.season, r.home_club_name, r.away_club_name)
            continue
        squad = set(lu[(lu["game_id"] == r.game_id) & (lu["club_id"] == win)]["player_id"])
        src = "lineup"
        if not squad:
            squad = set(a[(a["game_id"] == r.game_id) & (a["player_club_id"] == win)]["player_id"]); src = "played"
        for pid in squad & ids:
            if CUPS[r.competition_id] not in out[pid]["hn"]:
                out[pid]["hn"].append(CUPS[r.competition_id])
        finals.append((r.competition_id, int(r.season), r.home_club_name if win == r.home_club_id else r.away_club_name, src, len(squad)))
    print("finals used:", len(finals), "; by lineup:", sum(1 for f in finals if f[3] == "lineup"))

    # teammates of the 150 most valuable players who appear in the match files
    appeared = set(a["player_id"])
    stars = sorted([p for p in ids if p in appeared], key=lambda x: -peak[x])[:150]
    pair = a[["game_id", "player_club_id", "player_id"]]
    sr = pair[pair["player_id"].isin(stars)]
    m = sr.merge(pair, on=["game_id", "player_club_id"], suffixes=("_s", "_t"))
    m = m[(m["player_id_s"] != m["player_id_t"]) & m["player_id_t"].isin(ids)]
    cnt = m.groupby(["player_id_t", "player_id_s"]).size()
    tm = collections.defaultdict(list)
    for (t, s), n in cnt.items():
        if n >= 20:
            tm[int(t)].append(int(s))
    res = {"players": {str(k): v for k, v in out.items() if v["ap"]}, "tm": {str(k): v for k, v in tm.items()}, "stars": [int(s) for s in stars],
           "finals": [list(f) for f in finals]}
    json.dump(res, open("02_processed_data/match_facts.json", "w", encoding="utf-8"), separators=(",", ":"))
    print("players with appearances:", len(res["players"]), "; with a manager:", sum(1 for v in out.values() if v["mg"]), "; titles:", sum(1 for v in out.values() if v["ti"]), "; cup wins:", sum(1 for v in out.values() if v["hn"]), "; with teammates:", len(tm))


if __name__ == "__main__":
    main()

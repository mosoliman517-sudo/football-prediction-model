"""
Builds the data for the "Starting XI" game: the starting eleven (name, position, shirt number, captain) of both teams in every Champions League, Europa League,
FA Cup, Copa del Rey, DFB-Pokal and Coppa Italia final from 2013-14 on (the dataset has lineups from July 2013), into 02_processed_data/xi.json.
Needs 01_data_market_value/new/game_lineups.csv (see the README). Run from the project root:  python3 src/49_build_xi.py
"""
import json

import pandas as pd

D = "01_data_market_value/"
COMP = {"CL": "Champions League", "EL": "Europa League", "FAC": "FA Cup", "CDR": "Copa del Rey", "DFB": "DFB-Pokal", "CIT": "Coppa Italia"}


def main():
    g = pd.read_csv(D + "games.csv")
    fin = g[g["competition_id"].isin(COMP) & (g["round"].astype(str).str.lower() == "final")]
    l = pd.read_csv(D + "new/game_lineups.csv", usecols=["game_id", "player_id", "club_id", "player_name", "type", "position", "number", "team_captain"], low_memory=False)
    l = l[(l["type"] == "starting_lineup") & l["game_id"].isin(fin["game_id"])]
    out = []
    for r in fin.sort_values("date").itertuples():
        teams = []
        for cid, name, goals, other in ((r.home_club_id, r.home_club_name, r.home_club_goals, r.away_club_goals), (r.away_club_id, r.away_club_name, r.away_club_goals, r.home_club_goals)):
            xi = l[(l["game_id"] == r.game_id) & (l["club_id"] == cid)]
            if len(xi) != 11:
                teams = []
                break
            teams.append({"club": name, "won": bool(goals > other), "xi": [{"id": int(x.player_id), "n": x.player_name, "pos": x.position, "num": str(x.number), "cap": int(x.team_captain)} for x in xi.itertuples()]})
        if teams:
            out.append({"comp": COMP[r.competition_id], "season": int(r.season), "date": r.date, "hg": int(r.home_club_goals), "ag": int(r.away_club_goals), "teams": teams})
    json.dump(out, open("02_processed_data/xi.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(len(out), "finals with two full lineups")


if __name__ == "__main__":
    main()

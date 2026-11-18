"""
Builds the data for the "Starting XI" game: the starting eleven (name, position, shirt number, captain) of both teams in
  final       every Champions League, Europa League, FA Cup, Copa del Rey, DFB-Pokal and Coppa Italia final
  knockout    every Champions League semi-final and final leg, and quarter-final legs from the 2014-15 season on, and every Europa League semi-final leg
  derby       every league meeting of the main derbies (El Clasico, Der Klassiker, Derby della Madonnina, Le Classique and, in the Premier League, the Manchester, North London and Merseyside derbies)
  big         every league match between two clubs that were both in the top 3 of the table at the time (not already a derby)
from 2013-14 on, because the dataset's lineups start in July 2013 (2012-13 and older finals have no lineups, so they are not here).
Only matches where both teams have a full eleven on record are kept. Output 02_processed_data/xi.json.
Needs 01_data_market_value/new/game_lineups.csv (see the README). Run from the project root:  python3 src/49_build_xi.py
"""
import json

import pandas as pd

D = "01_data_market_value/"
CUPS = {"CL": "Champions League", "EL": "Europa League", "FAC": "FA Cup", "CDR": "Copa del Rey", "DFB": "DFB-Pokal", "CIT": "Coppa Italia"}
LEAGUE = {"GB1": "Premier League", "L1": "Bundesliga", "ES1": "La Liga", "IT1": "Serie A", "FR1": "Ligue 1"}
DERBIES = [  # (name, club A, club B) by Transfermarkt club names: the owner's choice, one per league and three for the Premier League
    ("El Clásico", "Real Madrid", "FC Barcelona"), ("Der Klassiker", "Bayern Munich", "Borussia Dortmund"), ("Derby della Madonnina", "Inter Milan", "AC Milan"),
    ("Le Classique", "Paris Saint-Germain", "Olympique Marseille"), ("Manchester derby", "Manchester United", "Manchester City"),
    ("North London derby", "Arsenal FC", "Tottenham Hotspur"), ("Merseyside derby", "Liverpool FC", "Everton FC"),
]


def main():
    g = pd.read_csv(D + "games.csv")
    g = g[g["season"] >= 2013].copy()
    clubs = pd.read_csv(D + "clubs.csv")
    cid = {r.name: r.club_id for r in clubs.itertuples()}
    l = pd.read_csv(D + "new/game_lineups.csv", usecols=["game_id", "player_id", "club_id", "player_name", "type", "position", "number", "team_captain"], low_memory=False)
    l = l[l["type"] == "starting_lineup"]
    sizes = l.groupby(["game_id", "club_id"]).size()
    full = sizes[sizes == 11].reset_index()["game_id"].value_counts()
    ok = set(full[full == 2].index)

    pick = {}   # game_id -> (kind, title)
    rnd = g["round"].astype(str)
    for r in g[g["competition_id"].isin(CUPS) & (rnd.str.lower() == "final")].itertuples():
        pick[r.game_id] = ("final", f"{CUPS[r.competition_id]} final")
    for r in g[(g["competition_id"] == "CL") & ((rnd.str.contains("Semi", case=False)) | (rnd.str.contains("Quarter", case=False) & (g["season"] >= 2014)))].itertuples():
        pick.setdefault(r.game_id, ("knockout", f"Champions League {str(r.round).replace('1st leg', '').replace('2nd leg', '').replace('1st Leg', '').replace('2nd Leg', '').strip().lower()}, {'1st' if '1st' in str(r.round).lower() else '2nd' if '2nd' in str(r.round).lower() else 'one'} leg".replace(", one leg", "")))
    for r in g[(g["competition_id"] == "EL") & rnd.str.contains("Semi", case=False)].itertuples():
        pick.setdefault(r.game_id, ("knockout", f"Europa League semi-final, {'1st' if '1st' in str(r.round).lower() else '2nd' if '2nd' in str(r.round).lower() else 'one'} leg".replace(", one leg", "")))
    lg = g[g["competition_id"].isin(LEAGUE)]
    for name, a, b in DERBIES:
        if a not in cid or b not in cid:
            print("  derby club not found:", a, b)
            continue
        m = lg[((lg["home_club_id"] == cid[a]) & (lg["away_club_id"] == cid[b])) | ((lg["home_club_id"] == cid[b]) & (lg["away_club_id"] == cid[a]))]
        for r in m.itertuples():
            pick.setdefault(r.game_id, ("derby", name))
    for r in lg[(lg["home_club_position"] <= 3) & (lg["away_club_position"] <= 3)].itertuples():
        pick.setdefault(r.game_id, ("big", f"Top-three clash, {LEAGUE[r.competition_id]}"))

    out = []
    gi = g.set_index("game_id")
    lg_by = {k: v for k, v in l.groupby("game_id")}
    for gid, (kind, title) in pick.items():
        if gid not in ok:
            continue
        r = gi.loc[gid]
        teams = []
        for cidv, name, goals, other in ((r.home_club_id, r.home_club_name, r.home_club_goals, r.away_club_goals), (r.away_club_id, r.away_club_name, r.away_club_goals, r.home_club_goals)):
            xi = lg_by[gid][lg_by[gid]["club_id"] == cidv]
            teams.append({"club": name, "won": bool(goals > other), "xi": [{"id": int(x.player_id), "n": x.player_name, "pos": x.position, "num": str(x.number), "cap": int(x.team_captain)} for x in xi.itertuples()]})
        comp = CUPS.get(r.competition_id) or LEAGUE.get(r.competition_id, r.competition_id)
        out.append({"k": kind, "t": title, "comp": comp, "season": int(r.season), "date": r.date, "hg": int(r.home_club_goals), "ag": int(r.away_club_goals), "teams": teams})
    for x in out:
        x["t"] = x["t"].replace("quarter-finals", "quarter-final").replace("semi-finals", "semi-final")
    out.sort(key=lambda x: (x["date"], x["t"]))
    json.dump(out, open("02_processed_data/xi.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    import collections
    print(len(out), "matches with two full lineups:", dict(collections.Counter(x["k"] for x in out)))


if __name__ == "__main__":
    main()

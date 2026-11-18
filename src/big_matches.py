"""
Which matches are big enough to appear in Starting XI and Who did it (the owner's rule, 18 November):
  final      every Champions League final; every domestic cup final (FA Cup, Copa del Rey, DFB-Pokal, Coppa Italia) with at least one "big club" among the finalists
  knockout   every Champions League semi-final; Champions League quarter-finals of the last five seasons where both clubs are big clubs
  league     La Liga and Premier League matches between two clubs that BOTH finished the season in the top three, and Der Klassiker (Bayern v Dortmund); no other league games
A "big club" is one of the few with the best average points per game in its league since 2012-13 (six in England, five in Italy, three in Spain, two each in Germany and France) (so Real Sociedad v Athletic Bilbao is not a big match, Real Madrid v Osasuna is).
Used by src/49_build_xi.py and src/52_build_highlights.py.
"""
import pandas as pd

D = "01_data_market_value/"
LEAGUES = ["GB1", "L1", "ES1", "IT1", "FR1"]
CUPS = {"FAC": "FA Cup", "CDR": "Copa del Rey", "DFB": "DFB-Pokal", "CIT": "Coppa Italia"}
BIGN = {"GB1": 6, "ES1": 3, "L1": 2, "IT1": 5, "FR1": 2}      # how many "big clubs" per league (the owner wants only clubs everyone knows)
LAST5 = 2021          # season (start year) from which quarter-finals count


def standings(g):
    lg = g[g["competition_id"].isin(LEAGUES) & (g["competition_type"] == "domestic_league") & (g["season"] >= 2012)]
    rows = {}
    for r in lg.itertuples():
        for cid, gf, ga in ((r.home_club_id, r.home_club_goals, r.away_club_goals), (r.away_club_id, r.away_club_goals, r.home_club_goals)):
            k = (r.competition_id, int(r.season), cid)
            v = rows.setdefault(k, [0, 0, 0]); v[0] += 3 if gf > ga else 1 if gf == ga else 0; v[1] += gf - ga; v[2] += 1
    return rows


def build(g):
    st = standings(g)
    top3, ppg = {}, {}
    by = {}
    for (comp, sn, cid), (pts, gd, n) in st.items():
        by.setdefault((comp, sn), []).append((pts, gd, cid, n))
        ppg.setdefault((comp, cid), []).append(pts / max(n, 1))
    for key, lst in by.items():
        lst.sort(reverse=True)
        top3[key] = {x[2] for x in lst[:3]}
    big = set()
    for comp in LEAGUES:
        avg = sorted(((sum(v) / len(v), cid) for (c, cid), v in ppg.items() if c == comp and len(v) >= 3), reverse=True)
        big |= {cid for _, cid in avg[:BIGN[comp]]}
    return top3, big


def selection(g, min_season=2010):
    """game_id -> (kind, title) for every big match from min_season (start year) on."""
    top3, big = build(g)
    names = {}
    pick = {}
    rnd = g["round"].astype(str)
    gg = g[g["season"] >= min_season]
    for r in gg[(gg["competition_id"] == "CL") & (rnd.loc[gg.index].str.lower() == "final")].itertuples():
        pick[r.game_id] = ("final", "Champions League final")
    for r in gg[(gg["competition_id"] == "CL") & rnd.loc[gg.index].str.contains("Semi", case=False)].itertuples():
        pick[r.game_id] = ("knockout", "Champions League semi-final")
    for r in gg[(gg["competition_id"] == "CL") & rnd.loc[gg.index].str.contains("Quarter", case=False) & (gg["season"] >= LAST5)].itertuples():
        if r.home_club_id in big and r.away_club_id in big:
            pick[r.game_id] = ("knockout", "Champions League quarter-final")
    for r in gg[gg["competition_id"].isin(CUPS) & (rnd.loc[gg.index].str.lower() == "final")].itertuples():
        if r.home_club_id in big or r.away_club_id in big:
            pick[r.game_id] = ("final", f"{CUPS[r.competition_id]} final")
    for r in gg[gg["competition_id"].isin(["GB1", "ES1"]) & (gg["competition_type"] == "domestic_league")].itertuples():
        t = top3.get((r.competition_id, int(r.season)), set())
        if r.home_club_id in t and r.away_club_id in t:
            pick[r.game_id] = ("league", "Premier League top-three clash" if r.competition_id == "GB1" else "La Liga top-three clash")
    bay = g[(g["competition_id"] == "L1") & (g["season"] >= min_season) & (((g["home_club_name"] == "Bayern Munich") & (g["away_club_name"] == "Borussia Dortmund")) | ((g["home_club_name"] == "Borussia Dortmund") & (g["away_club_name"] == "Bayern Munich")))]
    for r in bay.itertuples():
        pick[r.game_id] = ("league", "Der Klassiker")
    return pick, big


if __name__ == "__main__":
    g = pd.read_csv(D + "games.csv")
    pick, big = selection(g)
    cl = pd.read_csv(D + "clubs.csv").set_index("club_id")["name"]
    print("big clubs:", sorted(cl.get(c, str(c)) for c in big))
    import collections
    print(collections.Counter(v[1] for v in pick.values()))

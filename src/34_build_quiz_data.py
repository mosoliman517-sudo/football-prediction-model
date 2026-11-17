"""
Builds the data behind the arena's ball-knowledge games (02_processed_data/quiz_data.json), from the Transfermarkt data already in
01_data_market_value/ (Kaggle, CC0): players.csv, transfers.csv, clubs.csv.

  players   current Big 5 players worth 1 million euros or more, plus famous names anywhere (peak value 30 million or more, which brings
            in legends): birth country and city, birth date, position, foot, height, nationality, international caps, current club, market
            value, peak value, contract end, and the ordered list of clubs played for (from transfer histories).
  clubs     facts for every club in the five leagues (stadium, capacity, coach, squad size, average age, squad value), joined by name to the
            club names used everywhere else in the arena, with the join printed so it can be checked by eye.

Photos are NOT used (Transfermarkt's image links belong to it). Data ends in July 2026, so a player who moved after that shows his old club.
Run from the project root:  python3 src/34_build_quiz_data.py
"""
import difflib
import json
import re
import unicodedata

import pandas as pd

BIG = {"GB1": "E0", "L1": "D1", "ES1": "SP1", "IT1": "I1", "FR1": "F1"}
AS_OF = "2026-08-01"
JUNK = re.compile(r"retired|without club|career break|unknown|\bu1[5-9]\b|\bu2[0-3]\b|youth|jugend|juvenil|primavera|reserve|\bii$|\bb$|\bsub-|academy|sin equipo", re.I)


def norm(s):
    s = str(s).translate(str.maketrans({"ø": "o", "Ø": "O", "æ": "ae", "Æ": "AE", "ð": "d", "ł": "l", "Ł": "L", "đ": "d", "ß": "ss"}))
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    stop = {"fc", "afc", "cf", "ac", "as", "ss", "us", "sc", "sv", "vfl", "vfb", "tsg", "club", "calcio", "de", "the", "football", "futbol", "1", "1899", "05", "04", "1846", "bc", "ud", "cd", "rc", "sd", "ssc", "olympique", "real", "1907", "1909", "1913"}
    return " ".join(w for w in s.split() if w not in stop)


ALIAS = {"Man City": "Manchester City", "Man United": "Manchester United", "Newcastle": "Newcastle United", "Nott'm Forest": "Nottingham Forest", "Wolves": "Wolverhampton Wanderers",
         "Tottenham": "Tottenham Hotspur", "West Ham": "West Ham United", "Brighton": "Brighton Hove Albion", "Leeds": "Leeds United", "Leicester": "Leicester City", "Norwich": "Norwich City",
         "Luton": "Luton Town", "Ipswich": "Ipswich Town", "Dortmund": "Borussia Dortmund", "Leverkusen": "Bayer 04 Leverkusen", "Ein Frankfurt": "Eintracht Frankfurt", "M'gladbach": "Borussia Monchengladbach",
         "FC Koln": "FC Koln", "St Pauli": "FC St Pauli", "Union Berlin": "Union Berlin", "Mainz": "1 FSV Mainz 05", "Hoffenheim": "TSG 1899 Hoffenheim", "Hamburg": "Hamburger SV", "Ath Madrid": "Atletico de Madrid",
         "Ath Bilbao": "Athletic Bilbao", "Betis": "Real Betis", "Sociedad": "Real Sociedad", "Vallecano": "Rayo Vallecano", "Celta": "Celta de Vigo", "Espanol": "RCD Espanyol Barcelona", "Alaves": "Deportivo Alaves",
         "Valladolid": "Real Valladolid", "Sp Gijon": "Sporting Gijon", "La Coruna": "Deportivo de La Coruna", "Milan": "AC Milan", "Inter": "Inter Milan", "Verona": "Hellas Verona", "Paris SG": "Paris Saint-Germain",
         "St Etienne": "AS Saint-Etienne", "Marseille": "Olympique Marseille", "Lyon": "Olympique Lyon", "Monaco": "AS Monaco", "Lille": "LOSC Lille", "Nice": "OGC Nice", "Lens": "RC Lens", "Rennes": "Stade Rennais",
         "Brest": "Stade Brestois 29", "Strasbourg": "RC Strasbourg Alsace", "Nantes": "FC Nantes", "Reims": "Stade de Reims", "Hannover": "Hannover 96", "Nurnberg": "1 FC Nurnberg", "Fortuna Dusseldorf": "Fortuna Dusseldorf",
         "Spal": "SPAL", "Chievo": "Chievo Verona", "Eibar": "SD Eibar", "Huesca": "SD Huesca", "Nimes": "Nimes Olympique", "Guingamp": "EA Guingamp", "Bayern Munich": "Bayern Munich", "Real Madrid": "Real Madrid"}


def main():
    p = pd.read_csv("01_data_market_value/players.csv")
    p["dob"] = pd.to_datetime(p["date_of_birth"], errors="coerce")
    cur = p[(p["current_club_domestic_competition_id"].isin(BIG)) & (p["last_season"] >= 2025) & (p["market_value_in_eur"] >= 1e6)]
    famous = p[(p["highest_market_value_in_eur"] >= 30e6) & ~p.index.isin(cur.index)]
    pool = pd.concat([cur, famous]).drop_duplicates("player_id")
    t = pd.read_csv("01_data_market_value/transfers.csv", usecols=["player_id", "transfer_date", "from_club_name", "to_club_name", "from_club_id", "to_club_id"])
    t["d"] = pd.to_datetime(t["transfer_date"], errors="coerce")
    t = t[(t["d"] <= AS_OF) & t["player_id"].isin(pool["player_id"])].sort_values(["player_id", "d"])
    hist = {}
    for pid, g in t.groupby("player_id"):
        seq = []
        for name in [g.iloc[0]["from_club_name"]] + g["to_club_name"].tolist():
            name = str(name).strip()
            if not name or name == "nan" or JUNK.search(name):
                continue
            if not seq or seq[-1] != name:
                seq.append(name)
        hist[pid] = seq
    players = []
    for r in pool.itertuples():
        club = (r.current_club_name or "").strip() if isinstance(r.current_club_name, str) else ""
        h = hist.get(r.player_id, [])
        active = int(r.last_season) >= 2025
        players.append({
            "id": int(r.player_id), "n": r.name, "nat": ({"Turkey": "Türkiye"}.get(r.country_of_citizenship, r.country_of_citizenship)) if isinstance(r.country_of_citizenship, str) else "", "bc": r.country_of_birth if isinstance(r.country_of_birth, str) else "",
            "city": r.city_of_birth if isinstance(r.city_of_birth, str) else "", "dob": r.dob.strftime("%Y-%m-%d") if pd.notna(r.dob) else "", "pos": r.position if isinstance(r.position, str) else "",
            "sub": r.sub_position if isinstance(r.sub_position, str) else "", "foot": r.foot if isinstance(r.foot, str) else "", "h": int(r.height_in_cm) if pd.notna(r.height_in_cm) else 0,
            "caps": int(r.international_caps) if pd.notna(r.international_caps) else 0, "ig": int(r.international_goals) if pd.notna(r.international_goals) else 0,
            "club": club, "comp": r.current_club_domestic_competition_id if isinstance(r.current_club_domestic_competition_id, str) else "", "val": int(r.market_value_in_eur) if pd.notna(r.market_value_in_eur) else 0,
            "peak": int(r.highest_market_value_in_eur) if pd.notna(r.highest_market_value_in_eur) else 0,
            "end": int(str(r.contract_expiration_date)[:4]) if isinstance(r.contract_expiration_date, str) and len(r.contract_expiration_date) >= 4 else 0,
            "hist": h, "active": active,
        })
    # ---- which manager a player played under and which league titles he won (2017-18 to 2025-26), from club stints and match records.
    # A player counts as part of a club's season if the club was his on 1 January of that season: squad membership, not appearances.
    g = pd.read_csv("01_data_market_value/games.csv", usecols=["competition_id", "season", "home_club_id", "away_club_id", "home_club_goals", "away_club_goals", "home_club_manager_name", "away_club_manager_name", "competition_type"])
    g = g[(g["competition_type"] == "domestic_league") & g["competition_id"].isin(BIG) & (g["season"] >= 2017)]
    mg_count, pts = {}, {}
    for r in g.itertuples():
        for side, cid, mgr, gf, ga in (("h", r.home_club_id, r.home_club_manager_name, r.home_club_goals, r.away_club_goals), ("a", r.away_club_id, r.away_club_manager_name, r.away_club_goals, r.home_club_goals)):
            if isinstance(mgr, str):
                mg_count[(cid, r.season, mgr)] = mg_count.get((cid, r.season, mgr), 0) + 1
            pts[(r.competition_id, r.season, cid)] = pts.get((r.competition_id, r.season, cid), 0) + (3 if gf > ga else 1 if gf == ga else 0)
    top_mgr = {}
    for (cid, sn, mgr), n in mg_count.items():
        if n > top_mgr.get((cid, sn), ("", 0))[1]:
            top_mgr[(cid, sn)] = (mgr, n)
    champs = {}
    for (comp, sn, cid), v in pts.items():
        if v > champs.get((comp, sn), (None, -1))[1]:
            champs[(comp, sn)] = (cid, v)
    ta = pd.read_csv("01_data_market_value/transfers.csv", usecols=["player_id", "transfer_date", "from_club_id", "to_club_id"])
    ta["d"] = pd.to_datetime(ta["transfer_date"], errors="coerce"); ta = ta[ta["player_id"].isin(pool["player_id"]) & (ta["d"] <= AS_OF)].sort_values(["player_id", "d"])
    stints = {}
    for pid, gg in ta.groupby("player_id"):
        rows = gg.to_dict("records"); st = []
        for i, rw in enumerate(rows):
            st.append((rows[i - 1]["d"] if i else pd.Timestamp("1900-01-01"), rw["d"], rows[i - 1]["to_club_id"] if i else rw["from_club_id"]))
        st.append((rows[-1]["d"], pd.Timestamp("2100-01-01"), rows[-1]["to_club_id"]))
        stints[pid] = st
    def club_on(pid, day):
        for a, b, cid in stints.get(pid, []):
            if a <= day < b:
                return cid
        return None
    for q in players:
        mgs, titles = [], []
        for sn in range(2017, 2026):
            cid = club_on(q["id"], pd.Timestamp(f"{sn + 1}-01-01"))
            if cid is None:
                continue
            if (cid, sn) in top_mgr and top_mgr[(cid, sn)][0] not in mgs:
                mgs.append(top_mgr[(cid, sn)][0])
            for comp, lg in BIG.items():
                if champs.get((comp, sn), (None,))[0] == cid and lg not in titles:
                    titles.append(lg)
        q["mg"], q["ti"] = mgs, titles
    # cup honours (from src/36_fetch_honours.py): same squad-membership rule as the league titles above
    try:
        hon = json.load(open("02_processed_data/honours.json", encoding="utf-8"))
    except FileNotFoundError:
        hon = []
    allc = pd.read_csv("01_data_market_value/clubs.csv")
    allc["key"] = allc["name"].map(norm)
    def club_id_of(label):
        want = norm(label); best, sc = None, 0
        for r in allc.itertuples():
            v = max(difflib.SequenceMatcher(None, want, r.key).ratio(), 0.95 if want and (want in r.key or r.key in want) and min(len(want), len(r.key)) >= 4 else 0)
            if v > sc:
                best, sc = r.club_id, v
        return int(best) if sc >= 0.8 else None
    cache = {}
    won = {}
    for h in hon:
        cid = cache.setdefault(h["winner"], club_id_of(h["winner"]))
        if cid is None:
            print("  honour winner not matched:", h["winner"]); continue
        won.setdefault((cid, h["season"]), []).append(h["comp"])
    for q in players:
        hn = []
        for sn in range(2016, 2026):
            cid = club_on(q["id"], pd.Timestamp(f"{sn + 1}-01-01"))
            for comp in won.get((cid, sn), []):
                if comp not in hn:
                    hn.append(comp)
        q["hn"] = hn
    # teammates: for the 40 most valuable-ever players, everyone who shared a club with them for at least a year
    stars = sorted(players, key=lambda x: -x["peak"])[:40]
    star_ids = {st["id"] for st in stars}
    def overlap(a, b):
        end = pd.Timestamp(AS_OF)
        return max(0, (min(a[1], b[1], end) - max(a[0], b[0])).days)
    for q in players:
        q["tm"] = []
    for st in stars:
        for q in players:
            if q["id"] == st["id"]:
                continue
            if any(sa[2] == sb[2] and sa[2] == sa[2] and overlap(sa, sb) >= 365 for sa in stints.get(st["id"], []) for sb in stints.get(q["id"], [])):
                q["tm"].append(st["id"])
    print("honours matched:", sum(1 for q in players if q["hn"]), "players; star list:", [x["n"] for x in stars][:12])
    ov = json.load(open("src/quiz_overrides.json", encoding="utf-8"))
    try:                                                # moves found by src/45_fix_stale_transfers.py (Wikidata); hand-written overrides win
        auto = json.load(open("02_processed_data/transfer_fixes.json", encoding="utf-8"))
    except FileNotFoundError:
        auto = {}
    ov = {**auto, **ov}
    cl = pd.read_csv("01_data_market_value/clubs.csv").set_index("club_id")
    for q in players:
        o = ov.get(q["n"])
        if o:
            if o.get("club_id") is not None:
                q["club"] = cl.loc[o["club_id"], "name"]; q["comp"] = cl.loc[o["club_id"], "domestic_competition_id"] if cl.loc[o["club_id"], "domestic_competition_id"] in BIG else "OTH"
            else:
                q["club"] = o["club"]; q["comp"] = "OTH"
            if not q["hist"] or q["hist"][-1] != q["club"]:
                q["hist"].append(q["club"])
    print("transfer fixes applied:", sum(1 for q in players if ov.get(q["n"])))
    try:                                                # facts rebuilt from real matches (src/47_build_match_facts.py) replace the guesses made from squads and transfer dates above
        mf = json.load(open("02_processed_data/match_facts.json", encoding="utf-8"))
    except FileNotFoundError:
        mf = None
    if mf:
        names = {int(k): v for k, v in cl["name"].items()}
        for q in players:
            f = mf["players"].get(str(q["id"]))
            if f:
                q["mg"], q["ti"], q["hn"] = f["mg"], f["ti"], f["hn"]
                q["ap"] = [names[c] for c in f["ap"] if c in names]
            else:
                q["mg"], q["ti"], q["hn"], q["ap"] = [], [], [], []
            q["tm"] = mf["tm"].get(str(q["id"]), [])
        print("match facts applied:", sum(1 for q in players if q["ap"]), "players with appearances")
    players = [q for q in players if q["dob"] and q["pos"]]
    print(f"players: {len(players)} ({sum(q['active'] for q in players)} active); with a club history: {sum(1 for q in players if len(q['hist']) >= 2)}")

    # ---- clubs: facts, joined to the club names used by the arena
    c = pd.read_csv("01_data_market_value/clubs.csv")
    c = c[c["domestic_competition_id"].isin(BIG)].copy()
    c["key"] = c["name"].map(norm)
    # clubs.csv has no squad value, so it is the sum of current market values of players whose last season is 2025 or later
    sq = p[(p["last_season"] >= 2025) & p["market_value_in_eur"].notna()].groupby("current_club_id")["market_value_in_eur"].sum()
    c["total_market_value"] = c["club_id"].map(sq).fillna(0)
    arena = pd.read_csv("02_processed_data/multi_league_matches.csv")
    arena = arena[arena["season"] >= 2017]
    facts, report = {}, []
    for lg, g in arena.groupby("league"):
        sub = c[c["domestic_competition_id"].map(BIG) == lg]
        for club in sorted(set(g["home"]) | set(g["away"])):
            want = norm(ALIAS.get(club, club))
            best, score = None, 0
            for r in sub.itertuples():
                sc = max(difflib.SequenceMatcher(None, want, r.key).ratio(), 0.95 if want and (want in r.key or r.key in want) and min(len(want), len(r.key)) >= 4 else 0)
                if sc > score:
                    best, score = r, sc
            if best is not None and score >= 0.75:
                facts[club] = {"tm": best.name, "stadium": best.stadium_name if isinstance(best.stadium_name, str) else "", "seats": int(best.stadium_seats) if pd.notna(best.stadium_seats) else 0,
                               "coach": best.coach_name if isinstance(best.coach_name, str) else "", "squad": int(best.squad_size) if pd.notna(best.squad_size) else 0,
                               "age": float(best.average_age) if pd.notna(best.average_age) else 0, "value": float(best.total_market_value) if pd.notna(best.total_market_value) else 0,
                               "foreign": float(best.foreigners_percentage) if pd.notna(best.foreigners_percentage) else 0, "lg": lg, "cid": int(best.club_id)}
                report.append((lg, club, best.name, round(score, 2)))
            else:
                report.append((lg, club, "NO MATCH", round(score, 2)))
    for lg, club, tm, sc in report:
        print(f"  {lg:<4}{club:<22}-> {tm:<40}{sc}")
    print(f"clubs joined: {len(facts)} of {len(report)}")
    # transfer files spell clubs differently from clubs.csv ("Chelsea" v "Chelsea Football Club"), so map every spelling seen there to the arena name through the club id
    by_id = {f["cid"]: ours for ours, f in facts.items()}
    tn = pd.read_csv("01_data_market_value/transfers.csv", usecols=["from_club_id", "from_club_name", "to_club_id", "to_club_name"])
    alias = {}
    for idc, nmc in (("from_club_id", "from_club_name"), ("to_club_id", "to_club_name")):
        for cid, nm in tn[[idc, nmc]].dropna().drop_duplicates().itertuples(index=False):
            if int(cid) in by_id:
                alias[str(nm)] = by_id[int(cid)]
    print(f"club spellings mapped: {len(alias)}")
    # club stints for the sticker album: [arena club, first year, last year (0 = still there)] for every club the player has been at that the arena knows.
    # A first stint with no recorded start begins at 17 (the earliest we can say); years come from transfer dates, so they are approximate.
    for q in players:
        cr = []
        by = int(q["dob"][:4]) if q["dob"] else 1990
        for a_, b_, cid in stints.get(q["id"], []):
            try:
                ours = by_id.get(int(cid))
            except (TypeError, ValueError):
                ours = None
            if not ours:
                continue
            y0 = by + 17 if a_.year < 1950 else a_.year
            y1 = 0 if b_.year > 2090 else b_.year
            if y1 and y1 < y0:
                y1 = y0
            if cr and cr[-1][0] == ours and cr[-1][2] in (y0, y0 - 1, 0):
                cr[-1][2] = y1
            else:
                cr.append([ours, y0, y1])
        q["cr"] = cr
    for q in players:                                   # manual corrections (src/quiz_overrides.json) also close the old stint and open the new one
        o = ov.get(q["n"])
        if not o:
            continue
        new = by_id.get(int(o["club_id"])) if o.get("club_id") is not None else None
        if q["cr"] and q["cr"][-1][0] == new:
            continue
        if q["cr"] and q["cr"][-1][2] == 0:
            q["cr"][-1][2] = 2026
        if new:
            q["cr"].append([new, 2026, 0])
    print("players with club stints:", sum(1 for q in players if q.get("cr")), "; stints:", sum(len(q["cr"]) for q in players))
    try:
        photos = json.load(open("02_processed_data/player_photos.json", encoding="utf-8"))
    except FileNotFoundError:
        photos = {}
    for q in players:
        if str(q["id"]) in photos:
            q["im"] = photos[str(q["id"])]
    try:
        tsdb = json.load(open("02_processed_data/player_photos_tsdb.json", encoding="utf-8"))
    except FileNotFoundError:
        tsdb = {}
    for q in players:
        if not q.get("im") and tsdb.get(str(q["id"])):
            q["iu"] = tsdb[str(q["id"])]
    try:
        aw = json.load(open("02_processed_data/awards.json", encoding="utf-8"))
    except FileNotFoundError:
        aw = {}
    for q in players:
        x = aw.get(str(q["id"]))
        if x:
            q["aw"], q["tn"] = x["aw"], [k for k in x["tn"] if k in ("WC14", "WC18", "EU16")]
    print("players with awards:", sum(1 for q in players if q.get("aw")), "; with a tournament:", sum(1 for q in players if q.get("tn")))
    # EA's published player list (src/41): match by birth date and name, then the page shows EA's portrait (the most recent photo we can get)
    try:
        ea = json.load(open("02_processed_data/ea_players.json", encoding="utf-8"))
    except FileNotFoundError:
        ea = []
    by_birth = {}
    for e in ea:
        if e["birth"]:
            by_birth.setdefault(e["birth"], []).append(e)
    def eaname(e):
        return [norm(e["common"]), norm(f"{e['first']} {e['last']}")] if e["common"] else [norm(f"{e['first']} {e['last']}")]
    for q in players:
        cands = by_birth.get(q["dob"], []); want = norm(q["n"]); best, bs = None, 0
        for e in cands:
            for nm in eaname(e):
                sc = difflib.SequenceMatcher(None, want, nm).ratio()
                if want and nm and (want.split()[-1] == nm.split()[-1] or want in nm or nm in want):
                    sc = max(sc, 0.8)
                if sc > bs:
                    best, bs = e, sc
        if best is not None and bs >= 0.75:
            q["ea"] = best["id"]
    try:                                                # newest available portrait per player (src/44_refresh_photos.py)
        ph = json.load(open("docs/data/photos.json", encoding="utf-8"))["p"]
    except (FileNotFoundError, KeyError):
        ph = {}
    for q in players:
        if str(q["id"]) in ph:
            q["ph"], q["pq"], q["pd"] = ph[str(q["id"])]
    print("players with an EA portrait:", sum(1 for q in players if q.get("ea")), "of", len(players))
    print("players with a TheSportsDB photo:", sum(1 for q in players if q.get("iu")))
    print("players with a Commons photo:", sum(1 for q in players if q.get("im")))
    json.dump({"players": players, "clubs": facts, "alias": alias, "asOf": AS_OF}, open("02_processed_data/quiz_data.json", "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    print("Saved 02_processed_data/quiz_data.json")


if __name__ == "__main__":
    main()

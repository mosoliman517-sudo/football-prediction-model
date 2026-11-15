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
    t = pd.read_csv("01_data_market_value/transfers.csv", usecols=["player_id", "transfer_date", "from_club_name", "to_club_name"])
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
            "id": int(r.player_id), "n": r.name, "nat": r.country_of_citizenship if isinstance(r.country_of_citizenship, str) else "", "bc": r.country_of_birth if isinstance(r.country_of_birth, str) else "",
            "city": r.city_of_birth if isinstance(r.city_of_birth, str) else "", "dob": r.dob.strftime("%Y-%m-%d") if pd.notna(r.dob) else "", "pos": r.position if isinstance(r.position, str) else "",
            "sub": r.sub_position if isinstance(r.sub_position, str) else "", "foot": r.foot if isinstance(r.foot, str) else "", "h": int(r.height_in_cm) if pd.notna(r.height_in_cm) else 0,
            "caps": int(r.international_caps) if pd.notna(r.international_caps) else 0, "ig": int(r.international_goals) if pd.notna(r.international_goals) else 0,
            "club": club, "comp": r.current_club_domestic_competition_id if isinstance(r.current_club_domestic_competition_id, str) else "", "val": int(r.market_value_in_eur) if pd.notna(r.market_value_in_eur) else 0,
            "peak": int(r.highest_market_value_in_eur) if pd.notna(r.highest_market_value_in_eur) else 0,
            "end": int(str(r.contract_expiration_date)[:4]) if isinstance(r.contract_expiration_date, str) and len(r.contract_expiration_date) >= 4 else 0,
            "hist": h, "active": active,
        })
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
                               "foreign": float(best.foreigners_percentage) if pd.notna(best.foreigners_percentage) else 0, "lg": lg}
                report.append((lg, club, best.name, round(score, 2)))
            else:
                report.append((lg, club, "NO MATCH", round(score, 2)))
    for lg, club, tm, sc in report:
        print(f"  {lg:<4}{club:<22}-> {tm:<40}{sc}")
    print(f"clubs joined: {len(facts)} of {len(report)}")
    json.dump({"players": players, "clubs": facts, "asOf": AS_OF}, open("02_processed_data/quiz_data.json", "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    print("Saved 02_processed_data/quiz_data.json")


if __name__ == "__main__":
    main()

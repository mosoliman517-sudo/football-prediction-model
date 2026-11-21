"""
A second, current check of every quiz player's club: ESPN's live squad lists for all 96 Big 5 clubs (free, no key).
Wikidata (src/45) is often weeks behind a transfer window; ESPN's squads are what its live match pages use. Elliot Anderson,
for example, was still at Nottingham Forest in our data after joining Manchester City in July 2026.

A player is matched only when both the date of birth and the name agree (name similarity 0.6 or more, or the same surname),
so two players with the same name cannot be confused. When ESPN has him at a different Big 5 club than our data, the move is
written to 02_processed_data/transfer_fixes_espn.json, which src/34 applies after the Wikidata fixes (hand-written overrides in
src/quiz_overrides.json still win). Players on no Big 5 squad are only counted, never changed: they may have left the Big 5,
be out injured, or be missing from ESPN's list.

Run from the project root, then re-run src/34 and src/30:  python3 src/49_espn_current_clubs.py
"""
import difflib
import json
import re
import time
import unicodedata
import subprocess

import pandas as pd

LEAGUES = {"eng.1": "GB1", "esp.1": "ES1", "ita.1": "IT1", "ger.1": "L1", "fra.1": "FR1"}
API = "https://site.api.espn.com/apis/site/v2/sports/soccer"


def get(url):   # curl, like src/45: this machine's Python has no certificate store
    for k in range(3):
        out = subprocess.run(["curl", "-s", "--max-time", "20", "-H", "User-Agent: ballknowledge-quiz-check/1.0", url], capture_output=True, text=True)
        try:
            return json.loads(out.stdout)
        except ValueError:
            time.sleep(1 + k)
    return None


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(fc|afc|cf|ac|as|ssc|sc|sv|vfb|vfl|tsg|rc|ogc|ud|cd|rcd|ca|us|club|de|calcio|football|futbol|1\.|04|05|1899|1846|1907|1913|1909|1910|1900|1904)\b", " ", s)
    return re.sub(r"[^a-z ]", " ", s).split()


def sim(a, b):
    return difflib.SequenceMatcher(None, " ".join(norm(a)), " ".join(norm(b))).ratio()


def club_score(espn, ours):
    """1.0 when every word of ESPN's name is in ours (Lazio / Societa Sportiva Lazio), otherwise plain similarity."""
    e, o = set(norm(espn)), set(norm(ours))
    return 1.0 if e and e <= o else sim(espn, ours)


# Names that the automatic match gets wrong (checked by hand against the printed club list); None: not in clubs.csv
PIN = {"AC Milan": (5, "AC Milan"), "Deportivo": (897, "Deportivo de La Coruña"), "Brest": (3911, "Stade Brestois 29"), "FC Cologne": (3, "1.FC Köln"),
       "Racing Santander": (None, "Racing Santander"), "Coventry City": (None, "Coventry City"), "SV Elversberg": (None, "SV Elversberg"), "Le Mans": (None, "Le Mans FC")}
clubs = pd.read_csv("01_data_market_value/clubs.csv")
squads = []          # (espn name, dob, espn club, competition)
team_map = {}        # espn club -> (club_id, our club name)
for lg, comp in LEAGUES.items():
    d = get(f"{API}/{lg}/teams")
    teams = d["sports"][0]["leagues"][0]["teams"] if d else []
    for t in teams:   # every club in clubs.csv is a candidate: promoted clubs are filed under a lower division there
        tm = t["team"]; nm = tm["displayName"]
        sc = lambda r: (max(club_score(nm, r.name), club_score(tm.get("shortDisplayName", nm), r.name)), r.domestic_competition_id == comp)
        best = max(clubs.itertuples(), key=sc)
        team_map[nm] = (int(best.club_id), best.name, round(sc(best)[0], 2))
        if nm in PIN:
            team_map[nm] = (PIN[nm][0], PIN[nm][1], 1.0)
        r = get(f"{API}/{lg}/teams/{tm['id']}/roster")
        for a in (r or {}).get("athletes", []):
            if a.get("dateOfBirth"):
                squads.append((a.get("fullName") or a["displayName"], a["dateOfBirth"][:10], nm, comp))
        time.sleep(0.15)
print(f"{len(team_map)} clubs, {len(squads)} players on ESPN squads")
for k, v in sorted(team_map.items()):
    print(f"  club {k} -> {v[1]} ({v[2]})")
weak = {k: v for k, v in team_map.items() if v[2] < 0.75}
if weak:
    print("check these club matches:", weak)

Q = json.load(open("02_processed_data/quiz_data.json", encoding="utf-8"))
players = Q["players"]
by_dob = {}
for s in squads:
    by_dob.setdefault(s[1], []).append(s)
fixes, unseen, same = {}, 0, 0
for q in players:
    cands = by_dob.get(q.get("dob") or "", [])
    sur = norm(q["n"])[-1:] if norm(q["n"]) else []
    hit = [s for s in cands if sim(q["n"], s[0]) >= 0.6 or (sur and sur == norm(s[0])[-1:])]
    if len(hit) != 1:
        if q.get("comp") in LEAGUES.values():
            unseen += 1
        continue
    _, _, espn_club, comp = hit[0]; cid, our_name, _ = team_map[espn_club]
    if max(sim(q.get("club", ""), our_name), sim(q.get("club", ""), espn_club), club_score(espn_club, q.get("club", ""))) >= 0.85:
        same += 1
        continue
    fixes[q["n"]] = {"club": our_name, "club_id": cid, "comp": comp, "since": None, "was": q.get("club"), "source": "ESPN squad list"}
json.dump(fixes, open("02_processed_data/transfer_fixes_espn.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"confirmed at the same club: {same}; moved: {len(fixes)}; Big 5 players in our data not on any ESPN squad: {unseen} (left unchanged)")
for n, f in list(fixes.items())[:40]:
    print(f"  {n}: {f['was']} -> {f['club']}")

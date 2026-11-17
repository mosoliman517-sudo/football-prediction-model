"""
Finds players who moved after the Transfermarkt snapshot, using Wikidata (free, no key), and writes 02_processed_data/transfer_fixes.json,
which src/34_build_quiz_data.py applies on top of its data. Without this, a player who changed club in the summer still shows his old club
(Goncalo Ramos was shown at PSG after joining AC Milan), and the Football tic-tac-toe and other quizzes mark correct answers as wrong.

For every player in quiz_data.json it asks Wikidata for the clubs he currently plays for (open-ended "member of sports team" rows),
ignores national teams and youth sides, takes the one that started most recently, and records it when that club is not the one in our data
and the move started on or after SINCE. Clubs are matched to clubs.csv by name; a club outside clubs.csv is kept by its name only.

Run from the project root, then re-run src/34 and src/30:  python3 src/45_fix_stale_transfers.py
"""
import json
import re
import subprocess
import sys
import time
import difflib

import pandas as pd

sys.path.insert(0, "src")
SINCE = "2026-05-15"
UA = "ballknowledge-student-project/1.0 (football quiz data check)"
BAD = re.compile(r"national|under-?\d|\bu-?\d\d\b|olympic|youth|\bb team\b|reserves|\bii\b|women", re.I)


def norm(s):
    import importlib
    m = importlib.import_module("34_build_quiz_data")
    s = str(s).replace(".", "").replace("&", "and")
    s = re.sub(r"jimnastik kul[uü]b[uü]", "JK", s, flags=re.I)
    s = re.sub(r"\b(football club|futbol club|sports club|sporting club|societa sportiva|associazione sportiva|saudi football)\b", " ", s, flags=re.I)
    return m.norm(s)


def sparql(q):
    for attempt in range(4):
        out = subprocess.run(["curl", "-sG", "https://query.wikidata.org/sparql", "-H", f"User-Agent: {UA}", "-H", "Accept: application/sparql-results+json", "--data-urlencode", "query=" + q, "--max-time", "90"], capture_output=True, text=True).stdout
        try:
            return json.loads(out)["results"]["bindings"]
        except Exception:
            time.sleep(5 * (attempt + 1))
    return None


def main():
    qd = json.load(open("02_processed_data/quiz_data.json", encoding="utf-8"))
    players = qd["players"]
    clubs = pd.read_csv("01_data_market_value/clubs.csv")
    cl = {norm(r.name): (int(r.club_id), r.name) for r in clubs.itertuples()}
    big = {"GB1", "L1", "ES1", "IT1", "FR1"}
    cl = {k: v for k, v in cl.items() if v[0] in set(clubs[clubs.domestic_competition_id.isin(big)].club_id)} | {}
    for a, cid in {"lille osc": 1082, "olympique lyonnais": 1041, "ss lazio": 398, "as roma": None, "ssc napoli": None}.items():
        if cid:
            cl[norm(a)] = (cid, clubs[clubs.club_id == cid].name.iloc[0])
    keys = list(cl)
    found = {}
    ids = [str(p["id"]) for p in players]
    for i in range(0, len(ids), 250):
        chunk = ids[i:i + 250]
        q = 'SELECT ?tm ?clubLabel ?start WHERE { VALUES ?tm { %s } ?p wdt:P2446 ?tm . ?p p:P54 ?st . ?st ps:P54 ?club . FILTER NOT EXISTS { ?st pq:P582 ?end } OPTIONAL { ?st pq:P580 ?start } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }' % " ".join(f'"{x}"' for x in chunk)
        rows = sparql(q)
        if rows is None:
            print("batch failed", i)
            continue
        for r in rows:
            nm = r["clubLabel"]["value"]
            if BAD.search(nm):
                continue
            st = r.get("start", {}).get("value", "")[:10]
            found.setdefault(r["tm"]["value"], []).append((st, nm))
        print(f"  {min(i + 250, len(ids))}/{len(ids)}", flush=True)
        time.sleep(1.5)
    try:                                                # keep earlier fixes: quiz_data.json already contains them, so they would not show up as differences again
        fixes = json.load(open("02_processed_data/transfer_fixes.json", encoding="utf-8"))
    except FileNotFoundError:
        fixes = {}
    for p in players:
        c = sorted(found.get(str(p["id"]), []))
        if not c:
            continue
        st, nm = c[-1]
        if st < SINCE:
            continue
        k = norm(nm)
        hit = cl.get(k)
        if not hit:
            m = difflib.get_close_matches(k, keys, n=1, cutoff=0.8)
            hit = cl[m[0]] if m else None
        name = hit[1] if hit else nm
        same = lambda a, b: a == b or difflib.SequenceMatcher(None, a, b).ratio() >= 0.8 or a in b or b in a
        if same(norm(name), norm(p["club"])) or same(norm(nm), norm(p["club"])):
            continue
        fixes[p["n"]] = {"club": name, "club_id": hit[0] if hit else None, "since": st, "was": p["club"]}
    json.dump(fixes, open("02_processed_data/transfer_fixes.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(fixes), "moves found")
    for n, f in sorted(fixes.items(), key=lambda x: x[1]["since"]):
        print(f"  {f['since']}  {n:<26}{f['was']:<26}-> {f['club']}" + ("" if f["club_id"] else "  (club not in clubs.csv)"))


if __name__ == "__main__":
    main()

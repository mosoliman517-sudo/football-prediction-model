"""
Fetches who won each season of the major club cups, from Wikidata (CC0, public SPARQL endpoint), into 02_processed_data/honours.json.
Used by the ball-knowledge games (tic-tac-toe "won the Champions League" and so on). Each row is {comp, season (start year), winner (Wikidata label)}.
Winners are matched to Transfermarkt club ids in src/34_build_quiz_data.py. Run from the project root:  python3 src/36_fetch_honours.py
"""
import json
import re
import time

import requests

COMPS = {"UCL": "Q18756", "UEL": "Q18760", "FAC": "Q11151", "EFL": "Q11152", "CDR": "Q483794", "DFB": "Q150880", "COP": "Q169918", "CDF": "Q212412"}
H = {"User-Agent": "ballknowledge-student-project/1.0 (educational; contact via GitHub)", "Accept": "application/sparql-results+json"}


def main():
    out = []
    for code, qid in COMPS.items():
        q = f'''SELECT ?sl ?wl WHERE {{ ?s wdt:P3450 wd:{qid} . ?s wdt:P1346 ?w .
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". ?s rdfs:label ?sl . ?w rdfs:label ?wl . }} }}'''
        for k in range(3):
            r = requests.get("https://query.wikidata.org/sparql", params={"query": q}, headers=H, timeout=90)
            if r.ok:
                break
            time.sleep(8)
        n = 0
        for b in r.json()["results"]["bindings"] if r.ok else []:
            m = re.search(r"(\d{4})", b["sl"]["value"])
            if m and 2016 <= int(m.group(1)) <= 2025:
                out.append({"comp": code, "season": int(m.group(1)), "winner": b["wl"]["value"]}); n += 1
        print(f"{code}: {n} seasons since 2016")
        time.sleep(2)
    json.dump(out, open("02_processed_data/honours.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print("Saved 02_processed_data/honours.json")


if __name__ == "__main__":
    main()

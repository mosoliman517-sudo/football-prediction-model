"""
Fetches individual awards and national-team tournament participation for players from Wikidata (CC0), matched by Transfermarkt player id
(property P2446), into 02_processed_data/awards.json: {transfermarkt id: {"aw": [award codes], "tn": [tournament codes]}}.
Awards: Ballon d'Or (BDO), European Golden Shoe (GS), Premier League Golden Boot (PLGB), PFA Players' Player of the Year (PFA),
FIFA World Player / The Best (FIFA), UEFA Men's Player of the Year (UEFA). Tournaments a player took part in: World Cups 2014, 2018, 2022 (WC14, WC18, WC22)
and Euros 2016, 2020, 2024 (EU16, EU20, EU24). Winning a tournament is decided in the page from nationality and the winner (see WINNERS in the template).
Run from the project root:  python3 src/39_fetch_awards.py
"""
import json
import time

import requests

H = {"User-Agent": "ballknowledge-student-project/1.0 (educational; contact via GitHub)", "Accept": "application/sparql-results+json"}
AWARDS = {"BDO": ["Q166177", "Q2291862"], "GS": ["Q233454"], "PLGB": ["Q794775"], "PFA": ["Q621867"], "FIFA": ["Q28156245", "Q182529"], "UEFA": ["Q260117"]}
TOURS = {"WC14": "Q79859", "WC18": "Q170645", "WC22": "Q284163", "EU16": "Q189571", "EU20": "Q373501", "EU24": "Q15098367"}


def run(q):
    for k in range(3):
        r = requests.get("https://query.wikidata.org/sparql", params={"query": q}, headers=H, timeout=120)
        if r.ok:
            return r.json()["results"]["bindings"]
        time.sleep(10)
    return []


def main():
    out = {}
    for code, qids in AWARDS.items():
        vals = " ".join(f"wd:{q}" for q in qids)
        rows = run(f"SELECT DISTINCT ?tm WHERE {{ VALUES ?aw {{ {vals} }} ?p wdt:P166 ?aw . ?p wdt:P2446 ?tm . }}")
        for b in rows:
            out.setdefault(b["tm"]["value"], {"aw": [], "tn": []})["aw"].append(code)
        print(f"{code}: {len(rows)} players"); time.sleep(2)
    for code, qid in TOURS.items():
        rows = run(f"SELECT DISTINCT ?tm WHERE {{ ?p wdt:P1344 wd:{qid} . ?p wdt:P2446 ?tm . }}")
        for b in rows:
            out.setdefault(b["tm"]["value"], {"aw": [], "tn": []})["tn"].append(code)
        print(f"{code}: {len(rows)} players"); time.sleep(2)
    json.dump(out, open("02_processed_data/awards.json", "w", encoding="utf-8"), separators=(",", ":"))
    print(f"Saved awards for {len(out)} players")


if __name__ == "__main__":
    main()

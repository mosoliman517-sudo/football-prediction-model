"""
Card details for the star players on the loading screens (overall rating, position, club, nation and the six headline stats), from the player list EA
publishes on its public ratings pages (the same source as src/41). Saves 02_processed_data/hero_cards.json keyed like the portraits in site/logos/players/hero.
Players EA does not list (retired legends) simply get no card. Run from the project root:  python3 src/43_fetch_hero_cards.py
"""
import importlib.util
import json
import re
import time
import unicodedata

import requests

spec = importlib.util.spec_from_file_location("hero35", "src/35_fetch_hero_photos.py"); h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
HEAD = {"User-Agent": "Mozilla/5.0 ballknowledge-student-project"}
norm = h.norm
ALIAS = {"Vinicius Junior": "Vini Jr."}


def main():
    out = {}
    for name in h.NAMES:
        want = norm(ALIAS.get(name, name)); q = ALIAS.get(name, name).split()[-1]
        rows = []
        for term in (q, ALIAS.get(name, name)):
            r = requests.get("https://drop-api.ea.com/rating/ea-sports-fc", params={"locale": "en", "limit": 20, "offset": 0, "search": term}, headers=HEAD, timeout=40)
            if r.status_code == 200:
                rows = [e for e in r.json()["items"] if want in (norm(e.get("commonName") or ""), norm(f"{e.get('firstName', '')} {e.get('lastName', '')}"))]
            if rows:
                break
            time.sleep(0.3)
        if not rows:
            print(f"  {name:<24} not listed"); continue
        e = max(rows, key=lambda x: x["overallRating"] or 0); s = e["stats"]
        out[h.norm(name)] = {"ovr": e["overallRating"], "pos": e["position"]["shortLabel"], "team": e["team"]["label"], "nat": e["nationality"]["label"],
                             **{k: s[k]["value"] for k in ("pac", "sho", "pas", "dri", "def", "phy")}}
        print(f"  {name:<24} {out[h.norm(name)]['ovr']} {out[h.norm(name)]['pos']} {out[h.norm(name)]['team']}")
        time.sleep(0.3)
    json.dump(out, open("02_processed_data/hero_cards.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"Saved {len(out)} cards")


if __name__ == "__main__":
    main()

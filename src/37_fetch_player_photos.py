"""
Looks up a free-licence photo (Wikimedia Commons, via Wikidata) for every player in 02_processed_data/quiz_data.json, matched by Transfermarkt
player id (Wikidata property P2446, image property P18). Saves only the Commons file name per player to 02_processed_data/player_photos.json;
the page loads the thumbnail from Commons when it is shown, so no photographs are stored in this repository or embedded in the page.
Commons photos are licensed by their authors (mostly CC BY or CC BY-SA); the page credits Wikimedia Commons. Run from the project root:
python3 src/37_fetch_player_photos.py
"""
import json
import time
import urllib.parse

import requests

H = {"User-Agent": "ballknowledge-student-project/1.0 (educational; contact via GitHub)", "Accept": "application/sparql-results+json"}


def main():
    ids = [p["id"] for p in json.load(open("02_processed_data/quiz_data.json", encoding="utf-8"))["players"]]
    out = {}
    for i in range(0, len(ids), 200):
        chunk = ids[i:i + 200]
        vals = " ".join(f'"{x}"' for x in chunk)
        q = f"SELECT ?tm ?img WHERE {{ VALUES ?tm {{ {vals} }} ?p wdt:P2446 ?tm . ?p wdt:P18 ?img . }}"
        for k in range(3):
            r = requests.get("https://query.wikidata.org/sparql", params={"query": q}, headers=H, timeout=90)
            if r.ok:
                break
            time.sleep(10)
        for b in r.json()["results"]["bindings"] if r.ok else []:
            name = urllib.parse.unquote(b["img"]["value"].rsplit("/", 1)[-1])
            out.setdefault(b["tm"]["value"], name)
        print(f"{min(i + 200, len(ids))}/{len(ids)} looked up, {len(out)} photos so far")
        time.sleep(1.5)
    json.dump(out, open("02_processed_data/player_photos.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"Saved {len(out)} photos of {len(ids)} players")


if __name__ == "__main__":
    main()

"""
Second photo source for players with no free Commons portrait: TheSportsDB (free developer key "123", about 30 requests a minute).
Only an exact name match for a footballer is kept, and when both sides give a nationality they must agree, so a namesake cannot slip in.
Saves {transfermarkt id: image url} to 02_processed_data/player_photos_tsdb.json (resumable: ids already looked up are skipped). The page loads
the image from TheSportsDB when shown; the pictures belong to their owners and appear only to identify the player, as the badges do.
Run from the project root:  python3 src/38_fetch_player_photos_tsdb.py   (about 30 minutes for ~700 players)
"""
import json
import os
import re
import time
import unicodedata

import requests

API = "https://www.thesportsdb.com/api/v1/json/123"
HEAD = {"User-Agent": "ballknowledge-student-project/1.0"}
OUT = "02_processed_data/player_photos_tsdb.json"
norm = lambda s: re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower())


def get(path):
    for k in range(3):
        try:
            r = requests.get(f"{API}/{path}", headers=HEAD, timeout=30)
            if r.status_code == 200 and r.text.strip().startswith("{"):
                time.sleep(2.3)
                return r.json()
        except requests.RequestException:
            pass
        time.sleep(8 + 6 * k)
    return {}


def main():
    players = json.load(open("02_processed_data/quiz_data.json", encoding="utf-8"))["players"]
    try:
        photos = json.load(open("02_processed_data/player_photos.json", encoding="utf-8"))
    except FileNotFoundError:
        photos = {}
    done = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    todo = [p for p in players if str(p["id"]) not in photos and str(p["id"]) not in done]
    print(f"{len(todo)} players to look up")
    for k, p in enumerate(todo):
        rows = get("searchplayers.php?p=" + requests.utils.quote(p["n"].replace(" ", "_"))).get("player") or []
        url = ""
        for r in rows:
            if r.get("strSport") != "Soccer" or norm(r.get("strPlayer", "")) != norm(p["n"]):
                continue
            nat = norm(r.get("strNationality") or "")
            if nat and p["nat"] and nat not in norm(p["nat"]) and norm(p["nat"]) not in nat:
                continue
            img = r.get("strCutout") or r.get("strThumb")
            if img:
                url = img + ("/small" if img.endswith(".png") else "")
                break
        done[str(p["id"])] = url
        if k % 40 == 39:
            json.dump(done, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
            print(f"{k + 1}/{len(todo)} looked up, {sum(1 for v in done.values() if v)} found")
    json.dump(done, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
    print(f"Done: {sum(1 for v in done.values() if v)} found of {len(done)}")


if __name__ == "__main__":
    main()

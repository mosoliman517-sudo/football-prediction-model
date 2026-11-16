"""
Fetches the player list that EA publishes on its public ratings pages (drop-api.ea.com, the same JSON the ea.com ratings site uses) into
02_processed_data/ea_players.json: id, names, birth date, nationality, club, overall rating. src/34_build_quiz_data.py matches these to the quiz players by
name and birth date, and the page loads each portrait from EA's image host when a player is shown (nothing is stored in the repository).
The portraits belong to EA and appear only to identify players, like the club badges.  Run from the project root:  python3 src/41_fetch_ea_portraits.py
"""
import json
import time

import requests

API = "https://drop-api.ea.com/rating/ea-sports-fc"
HEAD = {"User-Agent": "Mozilla/5.0 ballknowledge-student-project"}


def main():
    out, offset, total = [], 0, None
    while total is None or offset < total:
        for k in range(4):
            r = requests.get(API, params={"locale": "en", "limit": 100, "offset": offset}, headers=HEAD, timeout=40)
            if r.status_code == 200:
                break
            time.sleep(5 + 5 * k)
        else:
            print("giving up at offset", offset); break
        j = r.json(); total = j.get("totalItems", 0)
        for p in j["items"]:
            bd = (p.get("birthdate") or "").split(" ")[0]
            try:
                m, d, y = bd.split("/"); bd = f"{y}-{int(m):02d}-{int(d):02d}"
            except ValueError:
                bd = ""
            out.append({"id": p["id"], "first": p.get("firstName") or "", "last": p.get("lastName") or "", "common": p.get("commonName") or "", "birth": bd,
                        "nat": (p.get("nationality") or {}).get("label", ""), "team": (p.get("team") or {}).get("label", ""), "ovr": p.get("overallRating"),
                        "img": (p.get("avatarUrl") or "").split("?")[0]})
        offset += 100
        if offset % 2000 == 0:
            print(f"{offset}/{total}", flush=True)
        time.sleep(0.35)
    json.dump(out, open("02_processed_data/ea_players.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"Saved {len(out)} players")


if __name__ == "__main__":
    main()

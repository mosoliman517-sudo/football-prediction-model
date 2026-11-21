"""Snapshot of the chess Championships page data: every game of the Total Chess World Championship Tour pilot
(Budapest, November 2026) from the Lichess broadcast API, plus FIDE profiles (federation, title, ratings, photo and its
credit) for every player shown on the page, from Lichess's FIDE player API. Writes 02_processed_data/chess_champ.json,
which src/73_build_chess.py puts into the chess page. Open API, no key.

The pilot is over, so a snapshot is enough; the World Championship match (from 24 November) still loads live in the page.
"""
import json
import re
import time
import urllib.parse

import requests

UA = {"User-Agent": "ballknowledge-build (student project)", "Accept": "application/json"}
TOURS = [("blitz", "Opening blitz", "WbAxpbqH"), ("A", "Group A", "9lqCcStZ"), ("B", "Group B", "h7DnvIHQ"), ("C", "Group C", "UPwHJSZj"),
         ("D", "Group D", "OW6wzikj"), ("semi", "Semifinals", "qEXour3L"), ("final", "Finals", "6PTzCQFL")]
# champions and challengers shown on the page who did not play in the pilot (looked up by name)
EXTRA = ["Gukesh D", "Sindarov, Javokhir", "Ju, Wenjun", "Goryachkina, Aleksandra"]


def get(url, js=True):
    for k in range(4):
        try:
            r = requests.get(url, headers=UA, timeout=30); r.raise_for_status(); r.encoding = "utf-8"
            return r.json() if js else r.text
        except Exception as e:  # Lichess rate limit: wait and retry
            print("  retry", url, e); time.sleep(5 * (k + 1))
    raise SystemExit("failed: " + url)


def parse(pgn):
    out = []
    for g in re.split(r"\n\n(?=\[Event )", pgn.strip()):
        h = dict(re.findall(r'^\[(\w+) "(.*)"\]$', g, re.M))
        body = g.split("\n\n", 1)[1] if "\n\n" in g else ""
        moves = re.sub(r"\{[^}]*\}", "", body)
        moves = re.sub(r"\d+\.\.\.", "", moves)
        moves = " ".join(moves.split())
        tc = h.get("TimeControl", "")
        kind = "classical" if tc.startswith("2700") else "rapid" if tc.startswith("900") else "armageddon" if tc in ("600",) else "blitz"
        out.append({"w": h.get("WhiteFideId"), "b": h.get("BlackFideId"), "wn": h.get("White"), "bn": h.get("Black"), "we": h.get("WhiteElo"), "be": h.get("BlackElo"),
                    "r": h.get("Result", "*"), "rd": h.get("Round", ""), "bd": int(h.get("Board", "0") or 0), "tc": kind, "d": h.get("UTCDate", ""), "url": h.get("GameURL", ""), "m": moves})
    return out


players, stages = {}, []
for sid, name, tid in TOURS:
    games = parse(get(f"https://lichess.org/api/broadcast/{tid}.pgn", js=False))
    stages.append({"id": sid, "name": name, "tour": tid, "games": games})
    print(f"{name}: {len(games)} games")
    for g in games:
        for k in ("w", "b"):
            if g[k]:
                players.setdefault(g[k], None)

ids = list(players)
for i, fid in enumerate(ids):
    players[fid] = get(f"https://lichess.org/api/fide/player/{fid}"); time.sleep(0.4)
for n in EXTRA:
    res = get("https://lichess.org/api/fide/player?q=" + urllib.parse.quote(n))
    hit = next((p for p in res if p["name"] == n), None)
    if hit:
        players[str(hit["id"])] = hit
    else:
        print("  not found:", n)

slim = {fid: {"n": p["name"], "fed": p.get("federation"), "t": p.get("title"), "y": p.get("year"), "std": p.get("standard"), "rap": p.get("rapid"), "blz": p.get("blitz"),
              "g": p.get("gender"), "img": (p.get("photo") or {}).get("medium"), "sm": (p.get("photo") or {}).get("small"), "cr": (p.get("photo") or {}).get("credit")} for fid, p in players.items() if p}

# a few Lichess photos are refused (403); for those, fall back to the Wikidata photo (Wikimedia Commons)
def commons(name):
    h = {"User-Agent": UA["User-Agent"]}
    r = requests.get("https://www.wikidata.org/w/api.php", params={"action": "wbsearchentities", "search": name, "language": "en", "format": "json", "type": "item"}, headers=h, timeout=20).json()
    for hit in r.get("search", [])[:3]:
        c = requests.get("https://www.wikidata.org/w/api.php", params={"action": "wbgetclaims", "entity": hit["id"], "property": "P18", "format": "json"}, headers=h, timeout=20).json()
        if c.get("claims", {}).get("P18"):
            f = c["claims"]["P18"][0]["mainsnak"]["datavalue"]["value"]
            return "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(f)
    return None


for fid, p in slim.items():
    ok = False
    if p["sm"]:
        try:
            ok = requests.get(p["sm"], headers={"User-Agent": UA["User-Agent"]}, timeout=20).status_code == 200
        except Exception:
            ok = False
    if not ok:
        nm = " ".join(reversed(p["n"].split(", "))) if ", " in p["n"] else p["n"]
        u = commons(nm)
        print(f"  photo fallback for {nm}: {'Wikimedia Commons' if u else 'none'}")
        p["img"], p["sm"], p["cr"] = (u + "?width=500", u + "?width=120", "Wikimedia Commons (see the file page for author and licence)") if u else (None, None, None)

# check the group tables against the published standings (3 for a win, 1 for a draw)
for st in stages:
    if len(st["id"]) == 1:
        pts = {}
        for g in st["games"]:
            for k, o in (("w", "1-0"), ("b", "0-1")):
                pts[slim[g[k]]["n"]] = pts.get(slim[g[k]]["n"], 0) + (3 if g["r"] == o else 1 if g["r"] == "1/2-1/2" else 0)
        print(st["name"], sorted(pts.items(), key=lambda x: -x[1]))

json.dump({"asOf": time.strftime("%Y-%m-%d"), "players": slim, "stages": stages}, open("02_processed_data/chess_champ.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(slim)} players, {sum(len(s['games']) for s in stages)} games -> 02_processed_data/chess_champ.json")

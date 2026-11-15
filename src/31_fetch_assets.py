"""
Fetches official artwork for the arena from TheSportsDB (a public sports-data API; the free developer key is "123"):
  - each league's badge                     -> site/logos/<code>.png
  - each club's badge, for every club in the arena data -> site/logos/clubs/<code>/<slug>.png
  - the star player's cutout photo          -> site/logos/players/<code>.png
The artwork belongs to the leagues, clubs and photographers (trademarks and copyright), so site/logos/ is git-ignored: it is
embedded into the page you build locally (src/30_build_arena.py) and never committed. Images are shrunk to keep the page light.
The API allows about 30 requests a minute on the free key; this script waits between calls and can be re-run (it skips files it has).
Prints how every club name in the data was matched to a TheSportsDB team so mistakes can be spotted by eye.

Run from the project root:  python3 src/31_fetch_assets.py
"""
import difflib
import io
import json
import os
import re
import time
import unicodedata

import pandas as pd
import requests
from PIL import Image

KEY = "123"
API = f"https://www.thesportsdb.com/api/v1/json/{KEY}"
HEAD = {"User-Agent": "beat-the-model-student-project/1.0"}
LEAGUE_IDS = {"E0": ("4328", "English Premier League"), "D1": ("4331", "German Bundesliga"), "SP1": ("4335", "Spanish La Liga"),
              "I1": ("4332", "Italian Serie A"), "F1": ("4334", "French Ligue 1")}
STARS = {"E0": "Erling Haaland", "D1": "Harry Kane", "SP1": "Lamine Yamal", "I1": "Nico Paz", "F1": "Ousmane Dembele"}
ALIAS = {   # data name -> a name TheSportsDB is likelier to know
    "Man City": "Manchester City", "Man United": "Manchester United", "Newcastle": "Newcastle United", "Nott'm Forest": "Nottingham Forest",
    "Wolves": "Wolverhampton Wanderers", "Tottenham": "Tottenham Hotspur", "West Ham": "West Ham United", "Brighton": "Brighton & Hove Albion",
    "Leeds": "Leeds United", "Leicester": "Leicester City", "Norwich": "Norwich City", "Luton": "Luton Town", "Ipswich": "Ipswich Town", "Bournemouth": "AFC Bournemouth",
    "Sheffield United": "Sheffield United", "West Brom": "West Bromwich Albion", "Dortmund": "Borussia Dortmund", "Leverkusen": "Bayer Leverkusen",
    "Ein Frankfurt": "Eintracht Frankfurt", "M'gladbach": "Borussia Monchengladbach", "FC Koln": "FC Koln", "St Pauli": "FC St. Pauli",
    "Union Berlin": "Union Berlin", "Mainz": "Mainz 05", "Hoffenheim": "TSG Hoffenheim", "Bayern Munich": "Bayern Munich", "Hamburg": "Hamburger SV",
    "Ath Madrid": "Atletico Madrid", "Ath Bilbao": "Athletic Bilbao", "Betis": "Real Betis", "Sociedad": "Real Sociedad", "Vallecano": "Rayo Vallecano",
    "Celta": "Celta Vigo", "Espanol": "Espanyol", "Alaves": "Deportivo Alaves", "Valladolid": "Real Valladolid", "Sp Gijon": "Sporting Gijon", "La Coruna": "Deportivo La Coruna",
    "Milan": "AC Milan", "Inter": "Inter Milan", "Verona": "Hellas Verona", "Paris SG": "Paris Saint-Germain", "St Etienne": "Saint-Etienne", "Marseille": "Olympique Marseille",
    "Lyon": "Olympique Lyonnais", "Monaco": "AS Monaco", "Lille": "Lille OSC", "Nice": "OGC Nice", "Lens": "RC Lens", "Rennes": "Stade Rennais", "Brest": "Stade Brestois",
    "Strasbourg": "RC Strasbourg", "Nantes": "FC Nantes", "Montpellier": "Montpellier HSC", "Reims": "Stade de Reims", "Toulouse": "Toulouse FC", "Auxerre": "AJ Auxerre",
    "Angers": "Angers SCO", "Le Havre": "Le Havre AC", "Lorient": "FC Lorient", "Metz": "FC Metz", "Paris FC": "Paris FC", "Clermont": "Clermont Foot",
}
slug = lambda n: re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-")


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    stop = {"fc", "afc", "cf", "ac", "as", "ss", "us", "sc", "sv", "vfl", "vfb", "tsg", "club", "calcio", "de", "the", "1", "1899", "05", "04", "1846", "bc"}
    return " ".join(w for w in s.split() if w not in stop)


def get(path, tries=4):
    for k in range(tries):
        try:
            r = requests.get(f"{API}/{path}", headers=HEAD, timeout=30)
            if r.status_code == 200 and r.text.strip().startswith("{"):
                time.sleep(2.2)
                return r.json()
        except requests.RequestException:
            pass
        time.sleep(6 + 6 * k)
    return {}


def save_image(url, path, box):
    if os.path.exists(path):
        return True
    for suffix in ("/small", ""):
        try:
            r = requests.get(url + suffix, headers=HEAD, timeout=40)
            if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image"):
                continue
            im = Image.open(io.BytesIO(r.content)).convert("RGBA")
            im.thumbnail(box, Image.LANCZOS)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            im.save(path, "PNG", optimize=True)
            time.sleep(0.4)
            return True
        except Exception:
            continue
    return False


def club_names():
    d = pd.read_csv("02_processed_data/multi_league_matches.csv")
    d = d[d["season"] >= 2021]
    return {lg: sorted(set(g["home"]) | set(g["away"])) for lg, g in d.groupby("league")}


def main():
    clubs = club_names()
    report = {}
    for code, (lid, lname) in LEAGUE_IDS.items():
        print(f"\n=== {lname} ({code})")
        lg = get(f"lookupleague.php?id={lid}").get("leagues") or []
        if lg and lg[0].get("strBadge"):
            ok = save_image(lg[0]["strBadge"], f"site/logos/{code}.png", (256, 256))
            print(f"league badge: {'saved' if ok else 'FAILED'} ({lg[0].get('strLeague')})")
        pool = {t["strTeam"]: t for t in (get("search_all_teams.php?l=" + lname.replace(" ", "%20")).get("teams") or []) if t.get("strBadge")}
        print(f"{len(pool)} current teams listed by the API")
        report[code] = {}
        for club in clubs[code]:
            path = f"site/logos/clubs/{code}/{slug(club)}.png"
            if os.path.exists(path):
                report[code][club] = ("cached", ""); continue
            want = ALIAS.get(club, club)
            best, score = None, 0
            for name, t in pool.items():
                a, b = norm(want), norm(name)
                sc = max(difflib.SequenceMatcher(None, a, b).ratio(), 0.95 if a and (a in b or b in a) and min(len(a), len(b)) >= 4 else 0)
                if sc > score:
                    best, score = t, sc
            if score < 0.8:                       # not in the current-season list (e.g. a relegated club): ask the search endpoint
                res = get("searchteams.php?t=" + requests.utils.quote(want)).get("teams") or []
                res = [t for t in res if t.get("strSport") == "Soccer" and t.get("strBadge")]
                for t in res:
                    sc = difflib.SequenceMatcher(None, norm(want), norm(t["strTeam"])).ratio()
                    if sc > score:
                        best, score = t, sc
            if best and score >= 0.6 and save_image(best["strBadge"], path, (128, 128)):
                report[code][club] = (best["strTeam"], f"{score:.2f}")
            else:
                report[code][club] = ("MISSING", f"{score:.2f}")
        for club, (name, sc) in report[code].items():
            print(f"  {club:<22} -> {name:<34} {sc}")
        # the star's cutout
        pl = (get("searchplayers.php?p=" + requests.utils.quote(STARS[code].replace(" ", "_"))).get("player") or [])
        pl = [p for p in pl if p.get("strCutout") or p.get("strThumb")]
        if pl:
            url = pl[0].get("strCutout") or pl[0]["strThumb"]
            print(f"star: {pl[0]['strPlayer']} ({pl[0].get('strTeam')}) -> {'saved' if save_image(url, f'site/logos/players/{code}.png', (360, 420)) else 'FAILED'}")
        else:
            print(f"star: {STARS[code]} NOT FOUND")
    json.dump({c: {k: v[0] for k, v in r.items()} for c, r in report.items()}, open("site/logos/clubs/matched.json", "w"), indent=1, ensure_ascii=False)
    miss = [(c, k) for c, r in report.items() for k, v in r.items() if v[0] == "MISSING"]
    print(f"\n{sum(len(r) for r in report.values()) - len(miss)} clubs matched, {len(miss)} missing: {miss}")


if __name__ == "__main__":
    main()

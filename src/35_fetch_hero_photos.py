"""
Fetches cutout photos of about thirty star players for the arena's front-page collage, from TheSportsDB (free developer key "123"),
into site/logos/players/hero/<slug>.png (git-ignored: the photographs belong to their owners and appear only in the built page, as
identification, with credit). A photo is kept only if the API's player name matches the one asked for exactly, so a namesake cannot
slip in. Re-runnable: files already downloaded are skipped. Free key allows about 30 requests a minute.
Run from the project root:  python3 src/35_fetch_hero_photos.py
"""
import io
import os
import re
import time
import unicodedata

import requests
from PIL import Image

API = "https://www.thesportsdb.com/api/v1/json/123"
HEAD = {"User-Agent": "beat-the-model-student-project/1.0"}
NAMES = ["Erling Haaland", "Mohamed Salah", "Bukayo Saka", "Cole Palmer", "Bruno Fernandes", "Declan Rice", "Martin Odegaard", "Virgil van Dijk", "Phil Foden", "Rodri",
         "Harry Kane", "Jamal Musiala", "Michael Olise", "Florian Wirtz", "Lamine Yamal", "Kylian Mbappe", "Vinicius Junior", "Jude Bellingham", "Pedri", "Robert Lewandowski",
         "Raphinha", "Federico Valverde", "Lautaro Martinez", "Rafael Leao", "Nico Paz", "Khvicha Kvaratskhelia", "Ousmane Dembele", "Desire Doue", "Bradley Barcola", "Achraf Hakimi",
         "Victor Osimhen", "Alexander Isak",
         "Lionel Messi", "Cristiano Ronaldo", "Diego Maradona", "Andres Iniesta", "Sergio Aguero", "Sergi Roberto"]      # the last six are the legends used on the loading screens
norm = lambda s: re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", str(s).translate(str.maketrans({"ø": "o", "Ø": "O", "æ": "ae", "ð": "d", "ł": "l", "đ": "d", "ß": "ss"}))).encode("ascii", "ignore").decode().lower())


def get(path):
    for k in range(3):
        try:
            r = requests.get(f"{API}/{path}", headers=HEAD, timeout=30)
            if r.status_code == 200 and r.text.strip().startswith("{"):
                time.sleep(2.4)
                return r.json()
        except requests.RequestException:
            pass
        time.sleep(7 + 6 * k)
    return {}


def ea_portrait(name, path):
    """EA's published portrait (the most recent photo available), from the list saved by src/41_fetch_ea_portraits.py; returns True if saved."""
    import json
    try:
        ea = json.load(open("02_processed_data/ea_players.json", encoding="utf-8"))
    except FileNotFoundError:
        return False
    want = norm({"Vinicius Junior": "Vini Jr."}.get(name, name))
    rows = [e for e in ea if want in (norm(e["common"]), norm(f"{e['first']} {e['last']}"))]
    if not rows:
        return False
    e = max(rows, key=lambda x: x["ovr"] or 0)
    r = requests.get(e["img"], headers=HEAD, timeout=40)
    if r.status_code != 200:
        return False
    im = Image.open(io.BytesIO(r.content)).convert("RGBA"); im = im.crop(im.getbbox()); im.thumbnail((512, 512), Image.LANCZOS); im.save(path, "PNG", optimize=True)
    return True


def main():
    os.makedirs("site/logos/players/hero", exist_ok=True)
    kept = []
    for name in NAMES:
        slug = norm(name)
        path = f"site/logos/players/hero/{slug}.png"
        if ea_portrait(name, path):
            print(f"  {name:<24} EA portrait"); kept.append(name); continue
        if os.path.exists(path) or os.path.exists(path.replace(".png", ".jpg")):
            kept.append(name); continue
        rows = get("searchplayers.php?p=" + requests.utils.quote(name.replace(" ", "_"))).get("player") or []
        rows = [r for r in rows if r.get("strSport") == "Soccer" and r.get("strCutout") and norm(r.get("strPlayer", "")) == slug]
        if not rows:
            print(f"  {name:<24} no exact match with a cutout, skipped"); continue
        url = rows[0]["strCutout"]
        for suffix in ("/small", ""):
            try:
                r = requests.get(url + suffix, headers=HEAD, timeout=40)
                if r.status_code == 200 and r.headers.get("content-type", "").startswith("image"):
                    im = Image.open(io.BytesIO(r.content)).convert("RGBA"); im.thumbnail((300, 360), Image.LANCZOS); im.save(path, "PNG", optimize=True)
                    print(f"  {name:<24} saved ({rows[0].get('strTeam')})"); kept.append(name); break
            except Exception:
                continue
        time.sleep(0.4)
    print(f"\n{len(kept)} of {len(NAMES)} photos kept")


if __name__ == "__main__":
    main()

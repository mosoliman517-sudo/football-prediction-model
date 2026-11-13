"""
Downloads each club's official badge from the Premier League's public badge
host into site/crests/ (one SVG per club). The crests are the clubs' and the
league's trademarked artwork, so site/crests/ is git-ignored: they are embedded
into the page you build locally (08_build_wrapped.py) but never committed to
the public repo. A club with no badge on the host simply shows as a text chip.

Run from the project root:
    python3 src/13_fetch_crests.py
"""

import json
import os
import re
import time

import requests

OUT_DIR = "site/crests"
URL = "https://resources.premierleague.com/premierleague/badges/t{code}.svg"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}

# Project club name -> the Premier League's team code
CODES = {
    "Arsenal": 3, "Aston Villa": 7, "Bournemouth": 91, "Brentford": 94, "Brighton": 36, "Burnley": 90,
    "Cardiff": 97, "Chelsea": 8, "Coventry": 32, "Crystal Palace": 31, "Everton": 11, "Fulham": 54,
    "Huddersfield": 38, "Hull": 88, "Ipswich": 40, "Leeds": 2, "Leicester": 13, "Liverpool": 14,
    "Luton": 102, "Man City": 43, "Man United": 1, "Middlesbrough": 25, "Newcastle": 4, "Norwich": 45,
    "Nott'm Forest": 17, "QPR": 52, "Sheffield United": 49, "Southampton": 20, "Stoke": 110,
    "Sunderland": 56, "Swansea": 80, "Tottenham": 6, "Watford": 57, "West Brom": 35, "West Ham": 21,
    "Wolves": 39,
}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


os.makedirs(OUT_DIR, exist_ok=True)
got, missing = [], []
for club, code in CODES.items():
    path = f"{OUT_DIR}/{slug(club)}.svg"
    if os.path.exists(path) and os.path.getsize(path) > 200:
        got.append(club)
        continue
    r = requests.get(URL.format(code=code), headers=HEADERS, timeout=20)
    ok = r.status_code == 200 and b"<svg" in r.content[:4000]
    if ok:
        with open(path, "wb") as f:
            f.write(r.content)
        got.append(club)
    else:
        missing.append((club, r.status_code))
    time.sleep(0.3)

with open(f"{OUT_DIR}/index.json", "w") as f:
    json.dump({club: f"{slug(club)}.svg" for club in got}, f, indent=1)
print(f"Saved {len(got)} badges to {OUT_DIR}/")
if missing:
    print("No badge on the host for (these will show as text):", ", ".join(f"{c} ({code})" for c, code in missing))

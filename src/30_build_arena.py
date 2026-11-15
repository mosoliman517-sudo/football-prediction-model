"""
Builds site/arena.html: the multi-league "Beat the Model" front door (league lobby, per-league themes, games).

Data: 02_processed_data/multi_league_matches.csv (src/29: every match predicted only from earlier seasons, pooled Big 5 model),
and multi_league_summary.json (the nine-season walk-forward accuracy table).

The two playing styles are tuned the same way as the Premier League page: decision factors multiply the model's
probabilities before the top one is picked. They are tuned on seasons up to 2023-24 and reported on 2024-25 and 2025-26,
pooled over all five leagues:
  Balanced      the factors that make the lowest of the Home / Draw / Away recalls as high as possible
  Max Accuracy  the factors that get the most results right overall

Run from the project root:  python3 src/30_build_arena.py     (env WRAPPED_OUT overrides the output path)
"""
import base64
import io
import json
import os
import re

import numpy as np
import pandas as pd
from PIL import Image

SRC = "02_processed_data/multi_league_matches.csv"
TEMPLATE = "site/arena_template.html"
OUT = os.environ.get("ARENA_OUT", "site/arena.html")
KEEP_FROM = 2023          # seasons shipped to the page: the last three finished (2023-24 on) plus the live one; older seasons are only in the summary table
META = {
    "E0": ("Premier League", "England", "Twenty clubs, the loudest league on earth."),
    "D1": ("Bundesliga", "Germany", "Goals, standing terraces and a title that usually has an owner."),
    "SP1": ("La Liga", "Spain", "Late kickoffs, long evenings and a lot of skill on the ball."),
    "I1": ("Serie A", "Italy", "Tactics, patience and the occasional glorious chaos."),
    "F1": ("Ligue 1", "France", "Fast, young and never quite predictable."),
}
# One star player per league: name, the club exactly as written in the match data, and position. Clubs checked against
# news reports in November 2026 (players move; keep this list in step with the transfer window).
STARS = {
    "E0": ("Erling Haaland", "Man City", "Striker"),
    "D1": ("Harry Kane", "Bayern Munich", "Striker"),
    "SP1": ("Lamine Yamal", "Barcelona", "Winger"),
    "I1": ("Nico Paz", "Como", "Attacking midfielder"),
    "F1": ("Ousmane Dembélé", "Paris SG", "Forward"),
}
LOGO_DIR = "site/logos"      # optional: drop E0 / D1 / SP1 / I1 / F1 .svg|.png|.webp files here to use official logos (git-ignored)

d = pd.read_csv(SRC)
d["season_lab"] = d["season"].map(lambda s: f"{s}-{str(s + 1)[2:]}")
P = d[["p_a", "p_d", "p_h"]].to_numpy()
y = d["res"].map({"A": 0, "D": 1, "H": 2}).to_numpy()


def recalls(pick, yy):
    return [float((pick[yy == c] == c).mean()) for c in (2, 1, 0)] + [float((pick == yy).mean())]


tune = (d["season"] <= 2023).to_numpy()
bench = d["season"].isin([2024, 2025]).to_numpy()
grid_a, grid_d = np.arange(0.8, 1.81, 0.05), np.arange(0.3, 2.61, 0.05)


def search(objective):
    best, bf = -1, None
    for a in grid_a:
        for dr in grid_d:
            r = recalls(np.argmax(P[tune] * np.array([a, dr, 1.0]), 1), y[tune])
            sc = objective(r)
            if sc > best:
                best, bf = sc, (a, dr)
    return bf


profiles = {}
for name, obj in (("balanced", lambda r: min(r[0], r[1], r[2])), ("accuracy", lambda r: r[3])):
    a, dr = search(obj)
    r = recalls(np.argmax(P[bench] * np.array([a, dr, 1.0]), 1), y[bench])
    profiles[name] = {"h": 1.0, "a": round(float(a), 3), "d": round(float(dr), 3), "bench": {"H": round(r[0], 4), "D": round(r[1], 4), "A": round(r[2], 4), "acc": round(r[3], 4)}}
    print(f"{name:<9} away x{a:.2f} draw x{dr:.2f} -> Home {r[0]:.0%} Draw {r[1]:.0%} Away {r[2]:.0%} accuracy {r[3]:.1%} (2024-26, all five leagues)")

def webp_uri(path, max_px):
    """Official artwork (git-ignored, from src/31_fetch_assets.py) as a small WebP data URI; None if the file is absent."""
    if not os.path.exists(path):
        return None
    im = Image.open(path).convert("RGBA")
    im.thumbnail((max_px, max_px), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=88, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


slug = lambda n: re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-")
race = json.load(open("02_processed_data/title_race.json")) if os.path.exists("02_processed_data/title_race.json") else {}
summary = json.load(open("02_processed_data/multi_league_summary.json"))
leagues = {}
for lg, g in d[d["season"] >= KEEP_FROM].groupby("league"):
    seasons = {}
    for lab, s in g.groupby("season_lab"):
        s = s.sort_values(["date", "home"])
        ms = []
        for r in s.itertuples():
            mk = [r.mk_a, r.mk_d, r.mk_h] if not np.isnan(r.mk_a) else [r.p_a, r.p_d, r.p_h]
            ms.append([r.date, r.home, r.away, int(r.hg), int(r.ag), r.res, round(r.p_a, 3), round(r.p_d, 3), round(r.p_h, 3), round(r.lam_h, 2), round(r.lam_a, 2), *[round(float(v), 3) for v in mk]])
        seasons[lab] = {"live": bool(s["season"].iloc[0] == 2026), "matches": ms}
    name, country, tag = META[lg]
    star = dict(zip(("name", "club", "role"), STARS[lg]))
    star["face"] = webp_uri(f"{LOGO_DIR}/players/{lg}.png", 300)
    logo = webp_uri(f"{LOGO_DIR}/{lg}.png", 200)
    clubs = sorted({m[1] for s_ in seasons.values() for m in s_["matches"]} | {m[2] for s_ in seasons.values() for m in s_["matches"]})
    def crest(c):
        u = webp_uri(f"{LOGO_DIR}/clubs/{lg}/{slug(c)}.png", 96)
        if u is None and lg == "E0" and os.path.exists(f"site/crests/{slug(c)}.svg"):      # the Premier League's own badge files from src/13
            u = "data:image/svg+xml;base64," + base64.b64encode(open(f"site/crests/{slug(c)}.svg", "rb").read()).decode()
        return u
    crests = {c: u for c in clubs if (u := crest(c))}
    print(f"   logo {'yes' if logo else 'no'}, face {'yes' if star['face'] else 'no'}, crests {len(crests)}/{len(clubs)}" + (f"  missing: {[c for c in clubs if c not in crests]}" if len(crests) < len(clubs) else ""))
    leagues[lg] = {"name": name, "country": country, "tag": tag, "star": star, "logo": logo, "crests": crests, "race": race.get(lg), "seasons": seasons}
    print(f"{name:<15} " + ", ".join(f"{k}:{len(v['matches'])}" for k, v in seasons.items()))

sm = {k: {kk: round(vv, 4) if isinstance(vv, float) else vv for kk, vv in v.items()} for k, v in summary.items() if k != "ALL"}
data = {"leagues": leagues, "profiles": profiles, "summary": sm}
html = open(TEMPLATE).read().replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":")))
open(OUT, "w").write(html)
print(f"Wrote {OUT} ({len(html) / 1e6:.2f} MB)")

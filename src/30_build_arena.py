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
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from PIL import Image

SRC = "02_processed_data/multi_league_matches.csv"
TEMPLATE = "site/arena_template.html"
PUBLIC = "--public" in sys.argv         # public build: a standalone page in docs/ for GitHub Pages
ARTWORK = "--no-artwork" not in sys.argv   # the official badges, logos and photos from site/logos/ are included unless --no-artwork is given
OUT = os.environ.get("ARENA_OUT", "docs/index.html" if PUBLIC else "site/arena.html")
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
    if not ARTWORK or not os.path.exists(path):
        return None
    im = Image.open(path).convert("RGBA")
    im.thumbnail((max_px, max_px), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=88, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


slug = lambda n: re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-")
race = json.load(open("02_processed_data/title_race.json")) if os.path.exists("02_processed_data/title_race.json") else {}
summary = json.load(open("02_processed_data/multi_league_summary.json"))
# match statistics: the model's forecast and the real numbers (shots, on target, corners, fouls, yellows; home then away), joined to each match
stats = pd.read_csv("02_processed_data/multi_league_stats.csv")
ST_ORDER = ["HS", "AS", "HST", "AST", "HC", "AC", "HF", "AF", "HY", "AY"]
stat_lookup = {(r["League"], r["Date"], r["HomeTeam"], r["AwayTeam"]): ([round(float(r[f"e_{c}"]), 1) for c in ST_ORDER], [None if pd.isna(r[f"r_{c}"]) else int(r[f"r_{c}"]) for c in ST_ORDER])
               for r in stats[stats["Season"] >= KEEP_FROM].to_dict("records")}
statsval = json.load(open("02_processed_data/multi_league_stats_validation.json"))
scorers_all = json.load(open("02_processed_data/scorers.json")) if os.path.exists("02_processed_data/scorers.json") else {}

def final_tables(lg):
    """Final table of every finished season (2017-18 on) with the model's expected points from its pre-match probabilities."""
    out = {}
    for sn, g in d[(d["league"] == lg) & (d["season"] < 2026)].groupby("season"):
        T = {}
        for r in g.itertuples():
            for t in (r.home, r.away):
                T.setdefault(t, [0, 0, 0, 0, 0, 0, 0.0])           # pts, gf, ga, w, d, l, xpts
            h, a = T[r.home], T[r.away]
            h[1] += r.hg; h[2] += r.ag; a[1] += r.ag; a[2] += r.hg
            if r.hg > r.ag: h[0] += 3; h[3] += 1; a[5] += 1
            elif r.hg < r.ag: a[0] += 3; a[3] += 1; h[5] += 1
            else: h[0] += 1; a[0] += 1; h[4] += 1; a[4] += 1
            h[6] += 3 * r.p_h + r.p_d; a[6] += 3 * r.p_a + r.p_d
        rows = sorted(T.items(), key=lambda kv: (-kv[1][0], -(kv[1][1] - kv[1][2]), -kv[1][1]))
        out[f"{sn}-{str(sn + 1)[2:]}"] = [[t, v[0], v[1], v[2], v[3], v[4], v[5], round(v[6], 1)] for t, v in rows]
    return out
leagues = {}
for lg, g in d[d["season"] >= KEEP_FROM].groupby("league"):
    seasons = {}
    for lab, s in g.groupby("season_lab"):
        s = s.sort_values(["date", "home"])
        ms = []
        for r in s.itertuples():
            mk = [r.mk_a, r.mk_d, r.mk_h] if not np.isnan(r.mk_a) else [r.p_a, r.p_d, r.p_h]
            exp, real = stat_lookup.get((lg, r.date, r.home, r.away), (None, None))
            ms.append([r.date, r.home, r.away, int(r.hg), int(r.ag), r.res, round(r.p_a, 3), round(r.p_d, 3), round(r.p_h, 3), round(r.lam_h, 2), round(r.lam_a, 2), *[round(float(v), 3) for v in mk], exp, real])
        seasons[lab] = {"live": bool(s["season"].iloc[0] == 2026), "matches": ms}
    name, country, tag = META[lg]
    star = dict(zip(("name", "club", "role"), STARS[lg]))
    star["face"] = webp_uri(f"{LOGO_DIR}/players/{lg}.png", 300)
    logo = webp_uri(f"{LOGO_DIR}/{lg}.png", 200)
    clubs = sorted({m[1] for s_ in seasons.values() for m in s_["matches"]} | {m[2] for s_ in seasons.values() for m in s_["matches"]})
    def crest(c):
        u = webp_uri(f"{LOGO_DIR}/clubs/{lg}/{slug(c)}.png", 96)
        if u is None and ARTWORK and lg == "E0" and os.path.exists(f"site/crests/{slug(c)}.svg"):      # the Premier League's own badge files from src/13
            u = "data:image/svg+xml;base64," + base64.b64encode(open(f"site/crests/{slug(c)}.svg", "rb").read()).decode()
        return u
    crests = {c: u for c in clubs if (u := crest(c))}
    print(f"   logo {'yes' if logo else 'no'}, face {'yes' if star['face'] else 'no'}, crests {len(crests)}/{len(clubs)}" + (f"  missing: {[c for c in clubs if c not in crests]}" if len(crests) < len(clubs) else ""))
    leagues[lg] = {"name": name, "country": country, "tag": tag, "star": star, "logo": logo, "crests": crests, "race": race.get(lg), "tables": final_tables(lg), "scorers": ({sn: {c: sorted(pl, key=lambda q: -q[2])[:8] for c, pl in cl.items()} for sn, cl in scorers_all.items()} if lg == "E0" else None), "seasons": seasons}
    print(f"{name:<15} " + ", ".join(f"{k}:{len(v['matches'])}" for k, v in seasons.items()))

sm = {k: {kk: round(vv, 4) if isinstance(vv, float) else vv for kk, vv in v.items()} for k, v in summary.items() if k != "ALL"}
data = {"leagues": leagues, "profiles": profiles, "summary": sm, "statsval": statsval}
html = open(TEMPLATE).read().replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":")))
CREDIT = " Results and odds come from football-data.co.uk."
latest = max(m[0] for lg_ in leagues.values() for sn_ in lg_["seasons"].values() for m in sn_["matches"])
STAMP = f'Build {datetime.now(timezone.utc):%d %b %Y %H:%M} UTC · {"public" if PUBLIC else "private"} · results through {latest}'
assert html.count('<div class="foot">') == 1
html = html.replace('<div class="foot">', f'<div class="foot"><span class="num" id="buildStamp">{STAMP}</span>')
if PUBLIC:
    old_foot = "<span>League and club badges and player photos are the property of their owners and appear here only to identify them. This is an independent student project, not affiliated with any league, club or player.</span>"
    assert old_foot in html
    if ARTWORK:
        foot = ("<span>League logos, club badges and player photographs are the property of their respective owners and appear here only to identify the leagues, clubs and players. "
                "This is an independent, non-commercial student project, not affiliated with or endorsed by any league, club or player. If you are a rights holder and would like something removed, "
                "please open an issue on the project's GitHub page and it will be taken down promptly. Artwork via TheSportsDB; the Paris SG, Monaco, Montpellier and Saint-Etienne badges via football-data.org; the Nott'm Forest badge from the Premier League." + CREDIT + "</span>")
    else:
        foot = ("<span>Club and league names belong to their owners. The coloured discs and emblems are original drawings, not official crests or logos, and no third-party artwork or photographs are used. "
                "This is an independent student project, not affiliated with any league, club or player." + CREDIT + "</span>")
    html = html.replace(old_foot, foot)
    html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' + html + "</html>"
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w").write(html)
print(f"Wrote {OUT} ({len(html) / 1e6:.2f} MB)")

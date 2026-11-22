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
OUT = os.environ.get("ARENA_OUT", "docs/football/index.html" if PUBLIC else "site/arena.html")   # docs/index.html is the sport picker (src/64_build_picker.py)
KEEP_FROM = 2001          # seasons shown in the arena (2001-02 on; the model needs one season of history first)
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
# the older football-data files are incomplete for some seasons (for example Ligue 1 2002-03 has 191 of 380 matches), and a partial season would give
# wrong tables, so a season is kept only if it has at least 97% of its fixtures (the live season is always kept)
_n = d.groupby(["league", "season"]).size()
_t = d.groupby(["league", "season"]).apply(lambda x: len(set(x["home"]) | set(x["away"])), include_groups=False)
_live = d["season"].max()
_full = {k for k, n in _n.items() if k[1] == _live or n >= 0.97 * _t[k] * (_t[k] - 1)}
_dropped = sorted(k for k in _n.index if k not in _full)
d = d[[(a, b) in _full for a, b in zip(d["league"], d["season"])]]
print("incomplete seasons left out:", ", ".join(f"{a} {b}-{str(b + 1)[2:]}" for a, b in _dropped) or "none")
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

def crest_colours(path):
    """Two dominant colours of a badge (skipping white, black and greys), for the 'site recolours to your team' option."""
    if not os.path.exists(path):
        return None
    im = Image.open(path).convert("RGBA"); im.thumbnail((48, 48))
    counts = {}
    for r, g, b, a in im.getdata():
        if a < 200 or (r > 222 and g > 222 and b > 222) or (r < 40 and g < 40 and b < 40) or max(r, g, b) - min(r, g, b) < 40:
            continue
        k = (r // 32 * 32 + 16, g // 32 * 32 + 16, b // 32 * 32 + 16); counts[k] = counts.get(k, 0) + 1
    top = sorted(counts, key=lambda k: -counts[k])[:2]
    return ["#%02x%02x%02x" % c for c in top] if top else None


HEAD_CROPPED = []


def head_crop(im, name=""):
    """Cut-outs come from different sources: some are tight face crops (Doue, Barcola), others show the head and a lot of torso (Foden, Haaland). Where the silhouette widens a lot below the head
    (a torso is there), crop to the head and a little neck and shoulder: a box 1.35 times the head's width and about as tall as wide, centred on the head, so heads fill a similar share of the frame and almost none of the shirt (which may be an old kit) shows.
    Images that are already tight faces are left alone."""
    import numpy as np
    a = np.array(im.getchannel("A")) > 24
    ys = np.where(a.any(axis=1))[0]
    if not len(ys):
        return im
    y0, y1 = int(ys[0]), int(ys[-1]); h = y1 - y0 + 1
    rows = a.sum(axis=1)[y0:y1 + 1]
    head_w = int(rows[: max(2, int(0.3 * h))].max())
    if rows[int(0.6 * h):].max() < 1.5 * head_w:
        return im
    top = a[y0: y0 + max(2, int(0.3 * h))]
    cx = int(np.where(top.any(axis=0))[0].mean())
    cw = int(head_w * 1.35); ch = int(cw * 1.05)
    HEAD_CROPPED.append(name)
    return im.crop((max(0, cx - cw // 2), max(0, y0 - 3), min(im.width, cx + cw // 2), min(im.height, y0 + ch)))


def webp_uri(path, max_px, head=False):
    """Official artwork (git-ignored, from src/31_fetch_assets.py) as a small WebP data URI; None if the file is absent."""
    if not ARTWORK or not os.path.exists(path):
        return None
    im = Image.open(path).convert("RGBA")
    if head:
        im = head_crop(im, os.path.basename(path))
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
colours = {}
REAL = {}
GN, GNI = [], {}
def gname(n):
    if n not in GNI:
        GNI[n] = len(GN); GN.append(n)
    return GNI[n]
if os.path.exists("02_processed_data/real_goals.json"):
    for lg_, dt_, h_, a_, gl_ in json.load(open("02_processed_data/real_goals.json", encoding="utf-8")):
        REAL[(lg_, dt_, h_, a_)] = gl_
# Real matchdays from the Transfermarkt games file ("1. Matchday" ...), Big 5 leagues 2012-13 to 2025-26: matched to each
# game by league, date (or a day either side) and score, with club-name similarity as the tie-break.
import difflib
_TMC = {"E0": "GB1", "D1": "L1", "SP1": "ES1", "I1": "IT1", "F1": "FR1"}
TMR = {}
if os.path.exists("01_data_market_value/games.csv"):
    _g = pd.read_csv("01_data_market_value/games.csv", usecols=["competition_id", "round", "date", "home_club_name", "away_club_name", "home_club_goals", "away_club_goals"])
    _g = _g[_g["competition_id"].isin(list(_TMC.values())) & _g["round"].astype(str).str.contains("Matchday")]
    for r in _g.itertuples():
        TMR.setdefault((r.competition_id, r.date, int(r.home_club_goals), int(r.away_club_goals)), []).append((int(str(r.round).split(".")[0]), str(r.home_club_name), str(r.away_club_name)))


def real_round(lg, m):
    code = _TMC.get(lg)
    if not code or not TMR:
        return None
    day = pd.Timestamp(m[0])
    cands = [c for dd in (0, -1, 1) for c in TMR.get((code, (day + pd.Timedelta(days=dd)).strftime("%Y-%m-%d"), m[3], m[4]), [])]
    if not cands:
        return None
    sim = lambda x, y: difflib.SequenceMatcher(None, x.lower(), y.lower()).ratio()
    best = max(cands, key=lambda c: sim(m[1], c[1]) + sim(m[2], c[2]))
    return best[0] if sim(m[1], best[1]) + sim(m[2], best[2]) > 0.6 else None


def by_real_rounds(lg, ms):
    """Group a season by its real matchdays when (nearly) every game is matched and no club plays twice in a round."""
    rr = [real_round(lg, m) for m in ms]
    if sum(r is not None for r in rr) < 0.97 * len(ms):
        return None
    clubs = {x for m in ms for x in (m[1], m[2])}
    rounds = {}
    for i, r in enumerate(rr):
        if r is not None:
            rounds.setdefault(r, []).append(i)
    for r, ix in rounds.items():
        if len({x for i in ix for x in (ms[i][1], ms[i][2])}) != 2 * len(ix):
            return None
    for i, r in enumerate(rr):   # the odd unmatched game goes into the round that is missing both clubs
        if r is None:
            k = next((k for k in sorted(rounds) if len(rounds[k]) < len(clubs) // 2 and not {ms[i][1], ms[i][2]} & {x for j in rounds[k] for x in (ms[j][1], ms[j][2])}), None)
            if k is None:
                return None
            rounds[k].append(i)
    groups = [sorted(rounds[k], key=lambda j: (ms[j][0], ms[j][1])) for k in sorted(rounds)]
    ends, n = [], 0
    for g in groups:
        n += len(g); ends.append(n)
    return [ms[i] for g in groups for i in g], ends


def fold_postponed(ms, rb):
    """Date gaps alone split a season into more matchdays than it has (a postponed game played midweek became its own
    "matchday": 43 in a 38-round Premier League season). Each small group's games go back into the nearest incomplete round
    that is missing both clubs, earlier rounds first, which is where a postponed game belongs. Groups stay in date order."""
    clubs = {x for m in ms for x in (m[1], m[2])}
    full, rounds = len(clubs) // 2, 2 * (len(clubs) - 1)
    groups = [list(range(a, b)) for a, b in zip([0] + rb[:-1], rb)]
    teams = lambda gi: {x for i in groups[gi] for x in (ms[i][1], ms[i][2])}
    changed = True
    while changed and len(groups) > rounds:
        changed = False
        for gi in sorted(range(len(groups)), key=lambda k: len(groups[k])):
            if len(groups[gi]) >= full:
                break
            moves = {}
            for i in groups[gi]:
                a, b = ms[i][1], ms[i][2]
                cand = [k for k in range(len(groups)) if k != gi and len(groups[k]) + sum(1 for v in moves.values() if v == k) < full
                        and a not in teams(k) and b not in teams(k) and not any(ms[j][1] in (a, b) or ms[j][2] in (a, b) for j, v in moves.items() if v == k)]
                if not cand:
                    moves = None; break
                moves[i] = min(cand, key=lambda k: (k > gi, abs(k - gi)))
            if moves:
                for i, k in moves.items():
                    groups[k].append(i)
                groups.pop(gi); changed = True
                break
    if len(groups) != rounds:   # second method: each game, in date order, into the earliest round that is missing both clubs
        g2, seen2 = [], []
        for i in range(len(ms)):
            a, b = ms[i][1], ms[i][2]
            k = next((k for k in range(len(g2)) if len(g2[k]) < full and a not in seen2[k] and b not in seen2[k]), None)
            if k is None:
                g2.append([]); seen2.append(set()); k = len(g2) - 1
            g2[k].append(i); seen2[k].update((a, b))
        if abs(len(g2) - rounds) < abs(len(groups) - rounds):
            groups = g2
    def fits(i, k, skip=()):
        a, b = ms[i][1], ms[i][2]
        return len(groups[k]) < full and not any(j not in skip and (ms[j][1] in (a, b) or ms[j][2] in (a, b)) for j in groups[k])
    def rehome(i, avoid):   # a free round for game i, or one game moved out of the way (one step)
        for k in range(len(groups)):
            if k not in avoid and fits(i, k):
                return [(i, k)]
        for k in range(len(groups)):
            if k in avoid or len(groups[k]) >= full:
                continue
            c = [j for j in groups[k] if {ms[j][1], ms[j][2]} & {ms[i][1], ms[i][2]}]
            if len(c) == 1:
                for k2 in range(len(groups)):
                    if k2 not in avoid and k2 != k and fits(c[0], k2):
                        return [(c[0], k2), (i, k)]
            if len(c) == 2:   # both clubs already play in round k: move both of those games, each to its own free round
                for k2 in range(len(groups)):
                    if k2 in avoid or k2 == k or not fits(c[0], k2):
                        continue
                    for k3 in range(len(groups)):
                        if k3 not in avoid and k3 != k and k3 != k2 and fits(c[1], k3):
                            return [(c[0], k2), (c[1], k3), (i, k)]
        return None
    progress = True
    while progress and len(groups) > rounds:
        progress = False
        for gi in sorted(range(len(groups)), key=lambda k: len(groups[k])):
            if len(groups[gi]) >= full:
                break
            plan, ok = [], True
            saved = [list(g) for g in groups]
            for i in list(groups[gi]):
                mv = rehome(i, {gi})
                if not mv:
                    ok = False; break
                for j, k in mv:
                    for g in groups:
                        if j in g: g.remove(j)
                    groups[k].append(j)
            if ok and not groups[gi]:
                groups.pop(gi); progress = True; break
            groups[:] = saved
    if os.environ.get("MDDEBUG"): print("matchdays", len(groups), "of", rounds, "groups", len(rb), ms[0][0][:4], sorted(clubs)[:2], sorted(len(g) for g in groups)[:4], {x: sum(1 for m in ms if x in (m[1], m[2])) for x in list(clubs)[:1]})
    order = [i for g in groups for i in sorted(g, key=lambda j: (ms[j][0], ms[j][1]))]
    ends, n = [], 0
    for g in groups:
        n += len(g); ends.append(n)
    return [ms[i] for i in order], ends


for lg, g in d[d["season"] >= KEEP_FROM].groupby("league"):
    seasons = {}
    for lab, s in g.groupby("season_lab"):
        s = s.sort_values(["date", "home"])
        ms = []
        for r in s.itertuples():
            mk = [r.mk_a, r.mk_d, r.mk_h] if not np.isnan(r.mk_a) else [r.p_a, r.p_d, r.p_h]
            exp, real = stat_lookup.get((lg, r.date, r.home, r.away), (None, None))
            ms.append([r.date, r.home, r.away, int(r.hg), int(r.ag), r.res, round(r.p_a, 3), round(r.p_d, 3), round(r.p_h, 3), round(r.lam_h, 2), round(r.lam_a, 2), *[round(float(v), 3) for v in mk], exp, real])
            rg = REAL.get((lg, r.date, r.home, r.away))
            if rg:                                          # real goals (src/53): [minute, side, scorer, assister or -1, penalty], names in a shared table
                ms[-1].append([[g_[0], g_[1], gname(g_[2]), gname(g_[3]) if g_[3] else -1, g_[4]] for g_ in rg])
        rb, seen, last = [], set(), None                      # matchday groups: a new group starts after a 2-day gap or when a club would play twice
        for i, mm in enumerate(ms):
            dd = pd.Timestamp(mm[0])
            if i and ((dd - last).days > 2 or mm[1] in seen or mm[2] in seen):
                rb.append(i); seen = set()
            seen.update((mm[1], mm[2])); last = dd
        rb.append(len(ms))
        real = by_real_rounds(lg, ms)
        ms, rb = real if real else fold_postponed(ms, rb)
        if os.environ.get("MDDEBUG"): print("source", "real" if real else "dates", lab, lg, len(rb))
        seasons[lab] = {"live": bool(s["season"].iloc[0] == 2026), "matches": ms, "rb": rb}
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
    for c in clubs:
        cc = crest_colours(f"{LOGO_DIR}/clubs/{lg}/{slug(c)}.png") if ARTWORK else None
        if cc:
            colours[c] = cc
    print(f"   logo {'yes' if logo else 'no'}, face {'yes' if star['face'] else 'no'}, crests {len(crests)}/{len(clubs)}" + (f"  missing: {[c for c in clubs if c not in crests]}" if len(crests) < len(clubs) else ""))
    # real season totals per team from the match stats (src/33): yellow cards, fouls, corners, shots, shots on target. They have little to do with how good a team is, which makes better Higher-or-lower questions.
    tstats = {}
    st_lg = stats[(stats["League"] == lg) & (stats["Season"] >= 2017)]
    for (sn_, team_), x in pd.concat([st_lg.assign(T=st_lg["HomeTeam"], Y=st_lg["r_HY"], F=st_lg["r_HF"], C=st_lg["r_HC"], S=st_lg["r_HS"], O=st_lg["r_HST"]),
                                      st_lg.assign(T=st_lg["AwayTeam"], Y=st_lg["r_AY"], F=st_lg["r_AF"], C=st_lg["r_AC"], S=st_lg["r_AS"], O=st_lg["r_AST"])]).groupby(["Season", "T"]):
        if x[["Y", "F", "C", "S", "O"]].notna().all(axis=1).sum() < 30: continue
        tstats.setdefault(f"{int(sn_)}-{str(int(sn_) + 1)[2:]}", {})[team_] = [int(x["Y"].sum()), int(x["F"].sum()), int(x["C"].sum()), int(x["S"].sum()), int(x["O"].sum())]
    leagues[lg] = {"tstats": tstats, "name": name, "country": country, "tag": tag, "star": star, "logo": logo, "crests": crests, "race": race.get(lg), "tables": final_tables(lg), "scorers": ({sn: {c: sorted(pl, key=lambda q: -q[2])[:8] for c, pl in cl.items()} for sn, cl in scorers_all.items()} if lg == "E0" else None), "seasons": seasons}
    print(f"{name:<15} " + ", ".join(f"{k}:{len(v['matches'])}" for k, v in seasons.items()))

sm = {k: {kk: round(vv, 4) if isinstance(vv, float) else vv for kk, vv in v.items()} for k, v in summary.items()}
board = None          # online database (Supabase) settings: site/board_config.json = {"url": "...", "key": "<anon public key>"}; env BOARD_URL / BOARD_KEY override (for tests)
if os.environ.get("BOARD_URL") and os.environ.get("BOARD_KEY"):
    board = {"url": os.environ["BOARD_URL"].rstrip("/"), "key": os.environ["BOARD_KEY"]}
elif os.path.exists("site/board_config.json"):
    board = json.load(open("site/board_config.json")); board["url"] = board["url"].rstrip("/")
import importlib.util
_spec = importlib.util.spec_from_file_location("hero35", "src/35_fetch_hero_photos.py"); _h = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_h)
_cards = json.load(open("02_processed_data/hero_cards.json", encoding="utf-8")) if os.path.exists("02_processed_data/hero_cards.json") else {}
hero = []
for nm in _h.NAMES:
    uri = webp_uri(f"{LOGO_DIR}/players/hero/{_h.norm(nm)}.png", 520, head=True)
    photo = False
    if uri is None:                                     # retired legends that EA does not list use a Wikimedia Commons photo (a rectangle, not a cut-out)
        uri = webp_uri(f"{LOGO_DIR}/players/hero/{_h.norm(nm)}.jpg", 700); photo = bool(uri)
    if uri:
        hero.append({"n": nm, "img": uri, "photo": photo, "card": _cards.get(_h.norm(nm))})
quiz = json.load(open("02_processed_data/quiz_data.json", encoding="utf-8")) if os.path.exists("02_processed_data/quiz_data.json") else None


def collapse_loan_backs(h):
    """A, B, A, B -> A, B: a move to B, a loan back to A, then B again (Pulisic: Dortmund, Chelsea, Dortmund, Chelsea).
    Transfermarkt lists the loan-back as two extra moves; to a reader it looks like a mistake. No club is ever dropped."""
    h, changed = list(h), True
    while changed:
        changed = False
        for i in range(len(h) - 3):
            if h[i] == h[i + 2] and h[i + 1] == h[i + 3] and h[i] != h[i + 1]:
                del h[i + 1:i + 3]; changed = True; break
    return h


if quiz:
    _n = 0
    for _p in quiz["players"]:
        if _p.get("hist"):
            _c = collapse_loan_backs(_p["hist"]); _n += _c != _p["hist"]; _p["hist"] = _c
    print(f"career paths tidied (loan-backs collapsed): {_n}")
if PUBLIC:   # public build: the photos become files that load when shown, instead of 2.8 MB of text in the game code
    os.makedirs("docs/football/hero", exist_ok=True)
    for _x in hero:
        if str(_x["img"]).startswith("data:image/"):
            _ext = _x["img"][11:_x["img"].index(";")]; _fn = f"hero/{_h.norm(_x['n'])}.{_ext}"
            open(f"docs/football/{_fn}", "wb").write(base64.b64decode(_x["img"].split(",", 1)[1])); _x["img"] = _fn
print(f"front page photos: {len(hero)} ({len(HEAD_CROPPED)} cut down to head and shoulders: {sorted(HEAD_CROPPED)}); quiz players: {len(quiz['players']) if quiz else 0}")
data = {"leagues": leagues, "profiles": profiles, "summary": sm, "statsval": statsval, "board": board, "hero": hero, "colors": colours, "baselines": (json.load(open("02_processed_data/baselines.json")) if os.path.exists("02_processed_data/baselines.json") else None), "quiz": quiz, "gn": GN, "highlights": (json.load(open("02_processed_data/highlights.json", encoding="utf-8")) if os.path.exists("02_processed_data/highlights.json") else []), "about": (json.load(open("site/about.json", encoding="utf-8")) if os.path.exists("site/about.json") else {}), "audit": (json.load(open("02_processed_data/audit.json")) if os.path.exists("02_processed_data/audit.json") else None), "bracket": (json.load(open("02_processed_data/bracket.json", encoding="utf-8")) if os.path.exists("02_processed_data/bracket.json") else []), "xi": ((json.load(open("02_processed_data/xi.json", encoding="utf-8")) if os.path.exists("02_processed_data/xi.json") else []) + (json.load(open("02_processed_data/xi_old.json", encoding="utf-8")) if os.path.exists("02_processed_data/xi_old.json") else []))}
html = open(TEMPLATE).read().replace("/*__SHARED__*/", open("site/shared_names.js", encoding="utf-8").read()).replace("/*__USAGE__*/", open("site/usage.js", encoding="utf-8").read() + open("site/voice.js", encoding="utf-8").read() + open("site/name_sync.js", encoding="utf-8").read() + open("site/mascot_lines.js", encoding="utf-8").read() + open("site/mascots.js", encoding="utf-8").read() + open("site/settings_ui.js", encoding="utf-8").read()).replace('const ASSET_BASE = "";', 'const ASSET_BASE = "../";' if PUBLIC else 'const ASSET_BASE = "";').replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":")))
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
    pwa = ('<link rel="manifest" href="../manifest.webmanifest"><meta name="theme-color" content="#0b1033"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><link rel="apple-touch-icon" href="../apple-touch-icon.png">' if PUBLIC else "")
    html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' + pwa + html + "</html>"
    if PUBLIC:
        html = html.replace("</html>", '<script>if ("serviceWorker" in navigator && location.protocol === "https:") addEventListener("load", () => navigator.serviceWorker.register("../sw.js").catch(() => {}));</script></html>')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    from split_loader import split_main_script     # splash first, game code in app.<hash>.js
    html = split_main_script(html, os.path.dirname(OUT))
open(OUT, "w", encoding="utf-8").write(html)
print(f"Wrote {OUT} ({len(html) / 1e6:.2f} MB)")

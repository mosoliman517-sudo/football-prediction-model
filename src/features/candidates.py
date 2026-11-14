"""
Candidate new signals, built walk-forward (every value for a match uses only
information that existed before that match). They are NOT part of the model
until src/14_test_new_signals.py shows a real, repeatable improvement.

Groups:
  manager  - how unstable a club's dugout has been (changes, interim spells)
  referee  - the referee's record so far
  schedule - derby, days since an international break, travel distance
  stakes   - how much a match still matters (gaps to title / top four / drop)
  weather  - rain, wind, temperature on match day (Open-Meteo archive)
  lineup   - how much of a club's usual team is missing (Fantasy Premier League)
"""

import glob
import json
import math
import os

import numpy as np
import pandas as pd

from features.manager_tenure import _manager_timeline
from features.team_names import TEAM_NAME_MAP

KEY = ["Date", "HomeTeam", "AwayTeam"]

COORDS = {
    "Arsenal": (51.555, -0.108), "Aston Villa": (52.509, -1.885), "Bournemouth": (50.735, -1.838),
    "Brentford": (51.491, -0.289), "Brighton": (50.862, -0.083), "Burnley": (53.789, -2.230),
    "Cardiff": (51.473, -3.203), "Chelsea": (51.482, -0.191), "Coventry": (52.448, -1.496),
    "Crystal Palace": (51.398, -0.086), "Everton": (53.439, -2.966), "Fulham": (51.475, -0.222),
    "Huddersfield": (53.654, -1.768), "Hull": (53.746, -0.368), "Ipswich": (52.055, 1.145),
    "Leeds": (53.778, -1.572), "Leicester": (52.620, -1.142), "Liverpool": (53.431, -2.961),
    "Luton": (51.884, -0.432), "Man City": (53.483, -2.200), "Man United": (53.463, -2.291),
    "Middlesbrough": (54.578, -1.217), "Newcastle": (54.976, -1.622), "Norwich": (52.622, 1.309),
    "Nott'm Forest": (52.940, -1.133), "QPR": (51.509, -0.232), "Sheffield United": (53.370, -1.471),
    "Southampton": (50.906, -1.391), "Stoke": (52.989, -2.175), "Sunderland": (54.915, -1.388),
    "Swansea": (51.643, -3.935), "Tottenham": (51.604, -0.066), "Watford": (51.650, -0.402),
    "West Brom": (52.509, -1.964), "West Ham": (51.539, -0.017), "Wolves": (52.590, -2.130),
}

DERBIES = {frozenset(p) for p in [
    ("Arsenal", "Tottenham"), ("Liverpool", "Everton"), ("Man City", "Man United"), ("Arsenal", "Chelsea"),
    ("Chelsea", "Tottenham"), ("Newcastle", "Sunderland"), ("Aston Villa", "West Brom"), ("Aston Villa", "Wolves"),
    ("West Brom", "Wolves"), ("Crystal Palace", "Brighton"), ("Arsenal", "West Ham"), ("Chelsea", "Fulham"),
    ("Chelsea", "West Ham"), ("Tottenham", "West Ham"), ("Man United", "Liverpool"), ("Leeds", "Man United"),
    ("Southampton", "Bournemouth"), ("Crystal Palace", "Chelsea"), ("Crystal Palace", "Fulham"), ("Brentford", "Fulham"),
    ("Brentford", "Chelsea"), ("Brentford", "Arsenal"), ("Stoke", "West Brom"), ("Leicester", "Nott'm Forest"),
    ("Norwich", "Ipswich"), ("Swansea", "Cardiff"), ("Sheffield United", "Leeds"), ("Hull", "Middlesbrough"),
    ("Burnley", "Man United"),
]}


def _season_of(dates):
    """Season id per row: a new season starts after a gap of more than 45 days (robust to the 2019-20 summer finish)."""
    d = pd.to_datetime(dates).reset_index(drop=True)
    order = np.argsort(d.values, kind="stable")
    ids = np.zeros(len(d), dtype=int)
    gap = d.values[order][1:] - d.values[order][:-1]
    ids[order] = np.concatenate([[0], np.cumsum(gap > np.timedelta64(45, "D"))])
    return ids


# ------------------------------------------------------------------ manager
def manager_signals(base):
    tl = _manager_timeline()
    out = {c: [] for c in ["MgrChanges730", "MgrChangeLast70d", "MgrInterimRecent", "MgrTenureLog"]}
    for side in ("Home", "Away"):
        rows = {k: [] for k in out}
        for d, team in zip(pd.to_datetime(base["Date"]), base[f"{side}Team"]):
            ent = [e for e in tl.get(team, []) if e[0] <= d]
            if not ent:
                rows["MgrChanges730"].append(0); rows["MgrChangeLast70d"].append(0)
                rows["MgrInterimRecent"].append(0); rows["MgrTenureLog"].append(math.log1p(730)); continue
            idx = len(ent) - 1
            since = (d - ent[idx][0]).days if idx >= 1 else 730
            rows["MgrTenureLog"].append(math.log1p(since))
            rows["MgrChangeLast70d"].append(int(idx >= 1 and since <= 70))
            rows["MgrChanges730"].append(sum(1 for i in range(1, len(ent)) if (d - ent[i][0]).days <= 730))
            interim = 0
            for i in range(1, len(ent) - 1):             # a finished spell shorter than 90 days
                if (ent[i + 1][0] - ent[i][0]).days < 90 and (d - ent[i + 1][0]).days <= 540:
                    interim += 1
            rows["MgrInterimRecent"].append(interim)
        for k, v in rows.items():
            base[f"{side}{k}"] = v
    return base


# ------------------------------------------------------------------ referee
def referee_signals(base):
    raw = pd.concat([pd.read_csv(f, usecols=lambda c: c in ["Date", "HomeTeam", "AwayTeam", "Referee"]) for f in sorted(glob.glob("01_data/E0_*.csv"))])
    raw["Date"] = pd.to_datetime(raw["Date"], format="mixed", dayfirst=True)
    raw = raw.drop_duplicates(KEY)
    b = base[KEY].copy(); b["Date"] = pd.to_datetime(b["Date"])
    ref = b.merge(raw, on=KEY, how="left")["Referee"].fillna("unknown").values
    home_win = (base["FTR"] == "H").astype(float).values
    goals = (base["FTHG"] + base["FTAG"]).astype(float).values
    cards = (base["HY"] + base["AY"] + 2 * (base["HR"] + base["AR"])).astype(float).values
    g_home, g_goals, g_cards = home_win.mean(), goals.mean(), np.nanmean(cards)
    K = 25.0
    n, sh, sg, sc = {}, {}, {}, {}
    out = np.zeros((len(base), 4))
    order = np.argsort(pd.to_datetime(base["Date"]).values, kind="stable")
    for i in order:
        r = ref[i]
        c = n.get(r, 0)
        out[i, 0] = c
        out[i, 1] = (sh.get(r, 0.0) + K * g_home) / (c + K) - g_home
        out[i, 2] = (sg.get(r, 0.0) + K * g_goals) / (c + K) - g_goals
        out[i, 3] = (sc.get(r, 0.0) + K * g_cards) / (c + K) - g_cards
        n[r] = c + 1; sh[r] = sh.get(r, 0.0) + home_win[i]; sg[r] = sg.get(r, 0.0) + goals[i]
        sc[r] = sc.get(r, 0.0) + (cards[i] if not np.isnan(cards[i]) else g_cards)
    base["RefMatches"], base["RefHomeEdge"], base["RefGoalsEdge"], base["RefCardsEdge"] = out.T
    return base


# ----------------------------------------------------------------- schedule
def _km(a, b):
    (la1, lo1), (la2, lo2) = COORDS[a], COORDS[b]
    p = math.pi / 180
    h = math.sin((la2 - la1) * p / 2) ** 2 + math.cos(la1 * p) * math.cos(la2 * p) * math.sin((lo2 - lo1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def schedule_signals(base):
    d = pd.to_datetime(base["Date"])
    base["IsDerby"] = [int(frozenset((h, a)) in DERBIES) for h, a in zip(base["HomeTeam"], base["AwayTeam"])]
    base["TravelKm"] = [_km(h, a) if h in COORDS and a in COORDS else 200.0 for h, a in zip(base["HomeTeam"], base["AwayTeam"])]
    days = np.array(sorted(d.dt.normalize().unique()))
    ends = [days[i] for i in range(1, len(days)) if (days[i] - days[i - 1]).days >= 13 and (days[i] - days[i - 1]).days < 60]
    ends = np.array(ends, dtype="datetime64[ns]")
    since = []
    for x in d.values:
        prior = ends[ends <= x]
        since.append(min(70, (x - prior[-1]).astype("timedelta64[D]").astype(int)) if len(prior) else 70)
    base["DaysSinceBreak"] = since
    base["JustAfterBreak"] = (np.array(since) <= 4).astype(int)
    return base


# ------------------------------------------------------------------- stakes
def stakes_signals(base):
    d = pd.to_datetime(base["Date"])
    season = _season_of(d)
    cols = {k: np.zeros(len(base)) for k in ["HomeRemaining", "AwayRemaining", "HomeTitleGap", "AwayTitleGap",
                                              "HomeTop4Gap", "AwayTop4Gap", "HomeSafetyGap", "AwaySafetyGap"]}
    order = np.argsort(d.values, kind="stable")
    cur_season, pts, played = None, {}, {}
    for i in order:
        if season[i] != cur_season:
            cur_season, pts, played = season[i], {}, {}
        ranked = sorted(pts.values(), reverse=True)
        top = ranked[0] if len(ranked) >= 1 else 0
        t4 = ranked[3] if len(ranked) >= 4 else 0
        s18 = ranked[17] if len(ranked) >= 18 else 0
        for side in ("Home", "Away"):
            t = base[f"{side}Team"].iloc[i]
            p = pts.get(t, 0)
            cols[f"{side}Remaining"][i] = max(0, 38 - played.get(t, 0))
            cols[f"{side}TitleGap"][i] = p - top
            cols[f"{side}Top4Gap"][i] = p - t4
            cols[f"{side}SafetyGap"][i] = p - s18
        h, a, hg, ag = base["HomeTeam"].iloc[i], base["AwayTeam"].iloc[i], base["FTHG"].iloc[i], base["FTAG"].iloc[i]
        pts[h] = pts.get(h, 0) + (3 if hg > ag else 1 if hg == ag else 0)
        pts[a] = pts.get(a, 0) + (3 if ag > hg else 1 if hg == ag else 0)
        played[h] = played.get(h, 0) + 1; played[a] = played.get(a, 0) + 1
    for k, v in cols.items():
        base[k] = v
    for side in ("Home", "Away"):
        rem = base[f"{side}Remaining"] + 1
        base[f"{side}TitleGapPerGame"] = base[f"{side}TitleGap"] / rem
        base[f"{side}Top4GapPerGame"] = base[f"{side}Top4Gap"] / rem
        base[f"{side}SafetyGapPerGame"] = base[f"{side}SafetyGap"] / rem
    return base


# ------------------------------------------------------------------ weather
def weather_signals(base, cache="01_data_weather/weather.json"):
    if not os.path.exists(cache):
        return base
    w = json.load(open(cache))
    d = pd.to_datetime(base["Date"]).dt.strftime("%Y-%m-%d")
    rain, wind, temp = [], [], []
    for day, team in zip(d, base["HomeTeam"]):
        rec = w.get(team, {}).get(day)
        rain.append(rec[0] if rec else np.nan); wind.append(rec[1] if rec else np.nan); temp.append(rec[2] if rec else np.nan)
    base["WxRain"], base["WxWind"], base["WxTemp"] = rain, wind, temp
    return base


# ------------------------------------------------------------------- lineup
FPL_TEAM = {"Man Utd": "Man United", "Spurs": "Tottenham", "Sheffield Utd": "Sheffield United", "Nott'm Forest": "Nott'm Forest",
            "Man City": "Man City", "Newcastle": "Newcastle", "Wolves": "Wolves"}


def lineup_signals(base, folder="01_data_fpl"):
    frames = []
    for f in sorted(glob.glob(f"{folder}/gw_20*.csv")):
        d = pd.read_csv(f, low_memory=False, encoding="latin-1")
        if "team" not in d.columns:
            continue
        d["season"] = os.path.basename(f)[3:10]
        frames.append(d[["season", "team", "element", "minutes", "value", "kickoff_time", "was_home", "fixture", "position"]])
    fpl = pd.concat(frames, ignore_index=True)
    fpl["team"] = fpl["team"].map(lambda t: FPL_TEAM.get(t, t))
    fpl["date"] = pd.to_datetime(fpl["kickoff_time"]).dt.tz_localize(None).dt.normalize()

    ours = {}
    bd = pd.to_datetime(base["Date"]).dt.normalize()
    for i, (dt, h, a) in enumerate(zip(bd, base["HomeTeam"], base["AwayTeam"])):
        ours[(h, dt)] = (i, "Home"); ours[(a, dt)] = (i, "Away")

    names = ["AbsentMinShare", "AbsentValueShare", "NumAbsent", "GKAbsent"]
    res = {f"{s}{n}": np.full(len(base), np.nan) for s in ("Home", "Away") for n in names}
    for (season, team), g in fpl.groupby(["season", "team"]):
        fixtures = g.groupby("fixture")["date"].first().sort_values()
        prior_min = {}                                   # element -> minutes in this team's earlier fixtures (this season)
        done = []
        for fx, dt in fixtures.items():
            rows = g[g["fixture"] == fx]
            if len(done) >= 3:
                tot = sum(prior_min.values())
                reg = {e: m for e, m in prior_min.items() if m >= 0.5 * 90 * len(done)}
                played = set(rows.loc[rows["minutes"] > 0, "element"])
                val = rows.set_index("element")["value"].to_dict()
                pos = rows.set_index("element")["position"].to_dict()
                reg_min = sum(reg.values()) or 1
                absent = [e for e in reg if e not in played]
                abs_min = sum(reg[e] for e in absent)
                abs_val = sum(val.get(e, 0) * reg[e] for e in absent)
                all_val = sum(val.get(e, 0) * reg[e] for e in reg) or 1
                key = None
                for delta in (0, 1, -1):
                    key = ours.get((team, dt + pd.Timedelta(days=delta)))
                    if key:
                        break
                if key:
                    i, side = key
                    res[f"{side}AbsentMinShare"][i] = abs_min / reg_min
                    res[f"{side}AbsentValueShare"][i] = abs_val / all_val
                    res[f"{side}NumAbsent"][i] = len(absent)
                    res[f"{side}GKAbsent"][i] = int(any(pos.get(e) == "GK" for e in absent))
            for _, r in rows.iterrows():
                prior_min[r["element"]] = prior_min.get(r["element"], 0) + r["minutes"]
            done.append(fx)
    for k, v in res.items():
        base[k] = v
    return base



# ------------------------------------------------------------ long-run strength
def longrun_signals(base, window=38):
    """Points and goal difference per game over each club's previous `window` league matches
    (a full season's worth, across season boundaries) - the club's real points distribution."""
    log = {}
    cols = {k: np.full(len(base), np.nan) for k in ["HomePPG38", "AwayPPG38", "HomeGD38", "AwayGD38"]}
    order = np.argsort(pd.to_datetime(base["Date"]).values, kind="stable")
    for i in order:
        h, a = base["HomeTeam"].iloc[i], base["AwayTeam"].iloc[i]
        for side, t in (("Home", h), ("Away", a)):
            g = log.get(t, [])[-window:]
            if len(g) >= 10:
                cols[f"{side}PPG38"][i] = np.mean([x[0] for x in g]); cols[f"{side}GD38"][i] = np.mean([x[1] for x in g])
        hg, ag = base["FTHG"].iloc[i], base["FTAG"].iloc[i]
        log.setdefault(h, []).append((3 if hg > ag else 1 if hg == ag else 0, hg - ag))
        log.setdefault(a, []).append((3 if ag > hg else 1 if hg == ag else 0, ag - hg))
    for k, v in cols.items():
        base[k] = v
    return base

def build_all(base):
    base = base.copy()
    for fn in (manager_signals, referee_signals, schedule_signals, stakes_signals, weather_signals, lineup_signals, longrun_signals):
        base = fn(base)
    return base

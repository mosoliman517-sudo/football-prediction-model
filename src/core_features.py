"""
A compact, walk-forward feature set that can be computed for ANY season from the raw results
(no Understat, Transfermarkt or manager data), used to test whether older seasons help and as the
"long-history" model in the blend. Every value uses only matches played before the one it describes.
"""
from collections import defaultdict, deque

import numpy as np
import pandas as pd


def mm(gd):
    d = abs(gd)
    return 1.0 if d <= 1 else 1.5 if d == 2 else (11 + d) / 8


def season_of(date):
    return date.year if date.month >= 8 else date.year - 1


def build(df):
    """df: Date, HomeTeam, AwayTeam, FTHG, FTAG, HS, AS, HST, AST sorted by date. Returns a feature DataFrame (same index)."""
    n = len(df)
    H, A = df["HomeTeam"].tolist(), df["AwayTeam"].tolist()
    D = pd.to_datetime(df["Date"]).tolist()
    GH, GA = df["FTHG"].to_numpy(float), df["FTAG"].to_numpy(float)
    HS, AS_ = df["HS"].to_numpy(float), df["AS"].to_numpy(float)
    HT, AT = df["HST"].to_numpy(float), df["AST"].to_numpy(float)
    el_m, el_c = defaultdict(lambda: 1500.0), defaultdict(lambda: 1500.0)       # margin Elo, classic Elo
    log = defaultdict(lambda: deque(maxlen=38))     # per team: (pts, gf, ga, shots, sot, shots_against, venue, date)
    last_date = {}
    season_pts, season_gp, season_gf, season_ga = defaultdict(float), defaultdict(int), defaultdict(float), defaultdict(float)
    h2h = defaultdict(lambda: deque(maxlen=6))
    cols = defaultdict(list)
    prev_season = None
    for i in range(n):
        s = season_of(D[i])
        if prev_season is not None and s != prev_season:
            for t in list(el_m):
                el_m[t] += 0.2 * (1500 - el_m[t]); el_c[t] += 0.2 * (1500 - el_c[t])
            season_pts.clear(); season_gp.clear(); season_gf.clear(); season_ga.clear()
        prev_season = s
        h, a = H[i], A[i]
        cols["EloMargin"].append(el_m[h] - el_m[a]); cols["EloClassic"].append(el_c[h] - el_c[a])
        for side, t in (("Home", h), ("Away", a)):
            g = list(log[t]); l5 = g[-5:]
            cols[f"{side}Pts5"].append(sum(x[0] for x in l5) if l5 else np.nan)
            cols[f"{side}GF5"].append(np.mean([x[1] for x in l5]) if l5 else np.nan)
            cols[f"{side}GA5"].append(np.mean([x[2] for x in l5]) if l5 else np.nan)
            cols[f"{side}Shots5"].append(np.nanmean([x[3] for x in l5]) if l5 else np.nan)
            cols[f"{side}SoT5"].append(np.nanmean([x[4] for x in l5]) if l5 else np.nan)
            cols[f"{side}ShotsAg5"].append(np.nanmean([x[5] for x in l5]) if l5 else np.nan)
            venue = [x for x in g if x[6] == side[0]][-5:]
            cols[f"{side}VenuePts5"].append(sum(x[0] for x in venue) if venue else np.nan)
            cols[f"{side}PPG38"].append(np.mean([x[0] for x in g]) if len(g) >= 10 else np.nan)
            cols[f"{side}GD38"].append(np.mean([x[1] - x[2] for x in g]) if len(g) >= 10 else np.nan)
            cols[f"{side}Rest"].append(min(14, (D[i] - last_date[t]).days) if t in last_date else np.nan)
            gp = season_gp[t]
            cols[f"{side}SeasonPPG"].append(season_pts[t] / gp if gp else np.nan)
            cols[f"{side}SeasonGDPG"].append((season_gf[t] - season_ga[t]) / gp if gp else np.nan)
        meet = list(h2h[frozenset((h, a))])
        cols["H2HHomeWins"].append(np.mean([1.0 if m_[0] == h else 0.0 for m_ in meet if m_[0] is not None]) if meet else np.nan)
        cols["H2HDraws"].append(np.mean([1.0 if m_[0] is None else 0.0 for m_ in meet]) if meet else np.nan)
        # ---- update after the result (a fixture with no result yet, used to forecast the rest of a season, changes nothing)
        gh, ga = GH[i], GA[i]
        if np.isnan(gh) or np.isnan(ga):
            continue
        res = 1.0 if gh > ga else 0.5 if gh == ga else 0.0
        E = 1 / (1 + 10 ** (-(el_c[h] - el_c[a] + 40) / 400))
        d = 15 * mm(gh - ga) * (res - E); el_c[h] += d; el_c[a] -= d
        egd = (el_m[h] - el_m[a]) / 300 + 0.4
        d = 10 * ((gh - ga) - egd); el_m[h] += d; el_m[a] -= d
        ph, pa = (3 if gh > ga else 1 if gh == ga else 0), (3 if ga > gh else 1 if gh == ga else 0)
        log[h].append((ph, gh, ga, HS[i], HT[i], AS_[i], "H")); log[a].append((pa, ga, gh, AS_[i], AT[i], HS[i], "A"))
        for t, p_, gf, gg in ((h, ph, gh, ga), (a, pa, ga, gh)):
            season_pts[t] += p_; season_gp[t] += 1; season_gf[t] += gf; season_ga[t] += gg; last_date[t] = D[i]
        h2h[frozenset((h, a))].append((h if gh > ga else a if ga > gh else None,))
    out = pd.DataFrame(cols, index=df.index)
    return out

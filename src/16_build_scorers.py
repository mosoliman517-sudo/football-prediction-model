"""
Builds 02_processed_data/scorers.json: for each season the page can show and each
club in it, the players who could score or assist in the minute-by-minute match,
weighted by that season's goals and expected goals and assists and expected assists
(Fantasy Premier League archive in 01_data_fpl/). Used only to name scorers in a
simulation, never to predict anything. Past seasons use the squad that actually
played for the club that season; the live season also counts last season's numbers.

Run from the project root:  python3 src/16_build_scorers.py
"""
import json

import pandas as pd

LIVE, SEASONS = "2026-27", ["2024-25", "2025-26", "2026-27"]
RENAME = {"Man Utd": "Man United", "Spurs": "Tottenham", "Coventry City": "Coventry", "Hull City": "Hull",
          "Ipswich Town": "Ipswich", "Sheffield Utd": "Sheffield United", "Leicester City": "Leicester",
          "Luton Town": "Luton", "Norwich City": "Norwich", "Leeds United": "Leeds"}
POS_PRIOR = {"FWD": 0.8, "MID": 0.4, "DEF": 0.15, "GK": 0.0, "GKP": 0.0}


def load(season):
    d = pd.read_csv(f"01_data_fpl/gw_{season}.csv", low_memory=False, encoding="utf-8")
    d["team"] = d["team"].map(lambda t: RENAME.get(t, t))
    return d


def squads(season, extra=None):
    cur = load(season)
    web = pd.read_csv(f"01_data_fpl/players_{season}.csv", low_memory=False, encoding="utf-8")
    short_by_id = dict(zip(web["id"], web["web_name"]))
    ids = cur.drop_duplicates("name").set_index("name")["element"]
    latest = cur.sort_values("GW").groupby("name").tail(1).set_index("name")["team"]
    both = pd.concat([extra, cur]) if extra is not None else cur
    agg = both.groupby("name").agg(goals=("goals_scored", "sum"), xg=("expected_goals", "sum"), assists=("assists", "sum"),
                                   xa=("expected_assists", "sum"), minutes=("minutes", "sum"), position=("position", "last"))
    cur_min = cur.groupby("name")["minutes"].sum()
    agg["team"] = latest
    agg = agg.dropna(subset=["team"])
    agg = agg[cur_min.reindex(agg.index).fillna(0) >= 180]            # played at least 180 minutes for the club this season
    agg["goalW"] = agg["goals"] + 0.5 * agg["xg"] + agg["position"].map(POS_PRIOR).fillna(0.2)
    agg["assistW"] = agg["assists"] + 0.5 * agg["xa"] + 0.3
    out = {}
    for team, g in agg.groupby("team"):
        g = g.sort_values("minutes", ascending=False).head(16)
        out[team] = [[short_by_id.get(ids.get(n), n), "GK" if r.position == "GKP" else r.position, round(float(r.goalW), 2), round(float(r.assistW), 2)] for n, r in g.iterrows()]
    return out


result = {}
for s in SEASONS:
    prev = load("2025-26") if s == LIVE else None
    result[s] = squads(s, prev)
    thin = [c for c, p in result[s].items() if len(p) < 11]
    print(s, len(result[s]), "clubs", f"(thin squads: {thin})" if thin else "")
json.dump(result, open("02_processed_data/scorers.json", "w"), ensure_ascii=False, separators=(",", ":"))
print({c: [p[0] for p in sorted(pl, key=lambda p: -p[2])[:3]] for c, pl in list(result["2024-25"].items())[:3]})

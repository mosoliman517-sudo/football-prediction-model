"""
Builds 02_processed_data/scorers.json: for each club in the live season, the
players who could score or assist in the page's minute-by-minute match, with
weights from last season's and this season's goals and expected goals
(Fantasy Premier League archive in 01_data_fpl/). Only used to name scorers in
a simulation, not to predict anything.

Run from the project root:  python3 src/16_build_scorers.py
"""
import json

import pandas as pd

LIVE, PREV = "2026-27", "2025-26"
RENAME = {"Man Utd": "Man United", "Spurs": "Tottenham", "Coventry City": "Coventry", "Hull City": "Hull",
          "Ipswich Town": "Ipswich", "Sheffield Utd": "Sheffield United"}


def load(season):
    d = pd.read_csv(f"01_data_fpl/gw_{season}.csv", low_memory=False, encoding="utf-8")
    d["team"] = d["team"].map(lambda t: RENAME.get(t, t))
    return d


live, prev = load(LIVE), load(PREV)
# short display names (web_name, e.g. "Saka", "Bruno G.") from this season's player file
web = pd.read_csv(f"01_data_fpl/players_{LIVE}.csv", low_memory=False, encoding="utf-8")
short = dict(zip(web["first_name"].str.strip() + " " + web["second_name"].str.strip(), web["web_name"]))
live_ids = live.drop_duplicates("name").set_index("name")["element"]
short_by_id = dict(zip(web["id"], web["web_name"]))
# the club a player is with NOW is the one in the newest rows
latest = live.sort_values("GW").groupby("name").tail(1).set_index("name")["team"]
both = pd.concat([prev, live])
agg = both.groupby("name").agg(goals=("goals_scored", "sum"), xg=("expected_goals", "sum"), assists=("assists", "sum"),
                               xa=("expected_assists", "sum"), minutes=("minutes", "sum"), position=("position", "last"))
agg["team"] = latest
agg = agg.dropna(subset=["team"])
agg = agg[agg["minutes"] >= 180]
agg["goalW"] = agg["goals"] + 0.5 * agg["xg"] + agg["position"].map({"FWD": 0.8, "MID": 0.4, "DEF": 0.15, "GK": 0.0, "GKP": 0.0}).fillna(0.2)
agg["assistW"] = agg["assists"] + 0.5 * agg["xa"] + 0.3

teams = pd.read_csv("02_processed_data/E0_grid_model.csv")["HomeTeam"].unique().tolist()
out = {}
for t in teams:
    g = agg[agg["team"] == t].sort_values("minutes", ascending=False).head(16)
    out[t] = [[short_by_id.get(live_ids.get(n), n), r.position if r.position != "GKP" else "GK", round(float(r.goalW), 2), round(float(r.assistW), 2)] for n, r in g.iterrows()]
    if len(out[t]) < 11:
        print("WARNING: only", len(out[t]), "players for", t)
json.dump(out, open("02_processed_data/scorers.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("clubs:", len(out), "| e.g.", {t: [p[0] for p in sorted(out[t], key=lambda p: -p[2])[:3]] for t in list(out)[:3]})

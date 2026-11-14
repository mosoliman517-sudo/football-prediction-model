"""
Saves one compact snapshot of the Fantasy Premier League public API: every player's availability
(status, chance of playing, news text and when it was added), form, minutes, ownership and price,
plus the fixture list. Run daily; the snapshots are the injury and team-news history nobody archives,
so after a season they can be turned into a "who is missing" feature and tested honestly like every
other signal (src/14_test_new_signals.py). Run from the project root:  python3 src/22_snapshot_fpl.py
"""
import gzip
import json
import os
import time

import requests

BASE = "https://fantasy.premierleague.com/api"
OUT = "01_data_snapshots"
HEADERS = {"User-Agent": "beat-the-model-snapshot/1.0 (personal research project)"}


def get(path):
    r = requests.get(f"{BASE}/{path}", headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


os.makedirs(OUT, exist_ok=True)
boot = get("bootstrap-static/")
fixtures = get("fixtures/")
keep = ["id", "web_name", "first_name", "second_name", "team", "element_type", "status", "chance_of_playing_this_round",
        "chance_of_playing_next_round", "news", "news_added", "minutes", "form", "selected_by_percent", "now_cost",
        "transfers_in_event", "transfers_out_event", "ep_next", "ep_this", "total_points", "goals_scored", "assists", "starts"]
snap = {
    "taken_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    "teams": [{k: t[k] for k in ("id", "name", "short_name", "strength") if k in t} for t in boot["teams"]],
    "events": [{k: e.get(k) for k in ("id", "deadline_time", "is_current", "is_next", "finished")} for e in boot["events"]],
    "players": [{k: p.get(k) for k in keep} for p in boot["elements"]],
    "fixtures": [{k: f.get(k) for k in ("id", "event", "team_h", "team_a", "kickoff_time", "finished", "team_h_score", "team_a_score")} for f in fixtures],
}
path = f"{OUT}/fpl_{time.strftime('%Y-%m-%d_%H%M')}.json.gz"
with gzip.open(path, "wt", encoding="utf-8") as f:
    json.dump(snap, f, separators=(",", ":"))
flagged = sum(1 for p in snap["players"] if p["status"] != "a")
print(f"saved {path}: {len(snap['players'])} players ({flagged} flagged as not fully available), {len(snap['fixtures'])} fixtures, {os.path.getsize(path) // 1024} KB")

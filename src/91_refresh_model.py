"""One command to bring the football model up to date, run twice a week by a scheduled task on the owner's Mac.

1. Downloads the current season's results for the five leagues from football-data.co.uk (src/40's refresh_results).
2. Stops if there is nothing new: the newest result is no later than what the model already has.
3. Otherwise re-runs the walk-forward model (src/29, about 10 minutes), the match stats (src/33), the title race (src/32),
   the weekly tournament's forecast file (src/40, no database secrets needed), and both football builds (src/30).
4. Commits and pushes the results (data files and docs/football), with a dated message.

Run from the project root:  python3 src/91_refresh_model.py
"""
import importlib.util
import os
import subprocess
import sys
from datetime import date

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def run(*cmd):
    print("$", " ".join(cmd), flush=True)
    r = subprocess.run(cmd, capture_output=True, text=True)
    tail = (r.stdout + r.stderr).strip().splitlines()[-3:]
    print("\n".join("  " + x for x in tail), flush=True)
    if r.returncode:
        sys.exit(f"failed: {' '.join(cmd)}")


def newest_result():
    best = None
    for f in ["01_data/E0_2627.csv"] + [f"01_data_leagues/{lg}_2627.csv" for lg in ("D1", "SP1", "I1", "F1")]:
        if os.path.exists(f):
            d = pd.read_csv(f, encoding="latin-1", on_bad_lines="skip")
            d = d[d["FTR"].notna()] if "FTR" in d else d
            if len(d):
                x = pd.to_datetime(d["Date"], dayfirst=True, format="mixed").max()
                best = x if best is None or x > best else best
    return best


spec = importlib.util.spec_from_file_location("sync", "src/40_sync_fixtures.py"); sys.argv = [sys.argv[0], "--dry"]
sync = importlib.util.module_from_spec(spec); spec.loader.exec_module(sync)
sync.refresh_results(sync.season_start())
have = pd.to_datetime(pd.read_csv("02_processed_data/multi_league_matches.csv", usecols=["date"])["date"]).max()
new = newest_result()
print(f"model has results to {have:%Y-%m-%d}; newest published result {new:%Y-%m-%d}" if new is not None else "no results file found")
if new is None or new <= have:
    print("Nothing new to add. The model is already up to date.")
    sys.exit(0)

run("python3", "src/29_multi_league_walkforward.py")
run("python3", "src/33_match_stats_leagues.py")
run("python3", "src/32_title_race.py")
run("python3", "src/40_sync_fixtures.py")
run("python3", "src/30_build_arena.py")
run("python3", "src/30_build_arena.py", "--public")
run("git", "add", "-A", "01_data", "01_data_leagues", "02_processed_data", "docs/football")
if subprocess.run(["git", "diff", "--cached", "--quiet"]).returncode:
    run("git", "commit", "-q", "-m", f"Model refresh {date.today():%Y-%m-%d}: results to {new:%Y-%m-%d}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>")
    run("git", "pull", "-q", "--rebase")
    run("git", "push", "-q")
    print(f"Refreshed and pushed: results now run to {new:%Y-%m-%d}.")
else:
    print("Rebuilt, but nothing changed.")

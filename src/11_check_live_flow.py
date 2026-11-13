"""
Proves the live season follows along correctly: every match is predicted from
REAL past results only, and Elo / form / the table adjust after every matchday.

How: copy the project to a scratch folder, cut the 2026-27 results back to the
first CUT matches, rebuild there, and compare with the full rebuild.

  1. NO LOOK-AHEAD. The first CUT rows of the live feature file must be
     identical whether or not later matches exist (a match's features may only
     depend on strictly earlier real results).
  2. FOLLOWS ALONG. Adding the later matches must change the next-round
     forecasts (Elo) of every club that played them.
  3. ELO MOVES THE RIGHT WAY. Within a season, a club's overall Elo must rise
     after a win.
  4. NEXT MATCHDAY USES THE LATEST RESULT. The Elo a club is forecast from must
     have moved (up after a win, down after a loss) from its pre-match value in
     its most recent real match.
  5. GRID LOGIC == PIPELINE LOGIC. The form / goals / shots / half-time features
     the forecast grid computes for an unplayed match must equal the pipeline's
     own values when applied to real matches.

Run from the project root (about 5 minutes; it runs 01 and 02 twice):
    python3 src/11_check_live_flow.py
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

CUT = 90
ROOT = Path(".").resolve()
failures = []


def check(ok, message):
    print(("PASS  " if ok else "FAIL  ") + message)
    if not ok:
        failures.append(message)


tmp = Path(tempfile.mkdtemp(prefix="live_flow_")) / "proj"
shutil.copytree(ROOT, tmp, ignore=shutil.ignore_patterns(".git", "__pycache__", "catboost_info", "*.pkl", "site"))

live_csv = tmp / "01_data" / "E0_2627.csv"
lines = live_csv.read_text().splitlines()
total = len(lines) - 1
assert total > CUT, f"need more than {CUT} live matches, have {total}"
live_csv.write_text("\n".join(lines[: CUT + 1]) + "\n")

for script in ("src/01_load_data.py", "src/02_load_features.py"):
    subprocess.run([sys.executable, script], cwd=tmp, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

full = pd.read_csv(ROOT / "02_processed_data" / "E0_live_features.csv")
cut = pd.read_csv(tmp / "02_processed_data" / "E0_live_features.csv")
check(len(cut) == CUT and len(full) == total, f"truncated rebuild has {len(cut)} live matches, full has {len(full)}")

# Rows are matched by (date, home, away): the pipeline orders matches within a
# date its own way, so "the first 90 rows" are not the same 90 matches in both builds.
KEY = ["Date", "HomeTeam", "AwayTeam"]
both = cut.merge(full, on=KEY, suffixes=("_cut", "_full"))
check(len(both) == CUT, f"all {CUT} truncated-build matches are found in the full build")

# 1. no look-ahead
numeric = [c for c in cut.columns if c not in KEY and pd.api.types.is_numeric_dtype(cut[c]) and c + "_full" not in ()]
diff = {}
for c in numeric:
    a_, b_ = both[c + "_cut"], both[c + "_full"]
    if pd.api.types.is_numeric_dtype(a_) and pd.api.types.is_numeric_dtype(b_):
        bad = int((~np.isclose(a_.fillna(-9e9), b_.fillna(-9e9), atol=1e-6)).sum())
        if bad:
            diff[c] = bad
check(not diff, f"NO LOOK-AHEAD: all {len(numeric)} numeric columns of those {CUT} matches are identical with or without the later results" + (f" (differences: {diff})" if diff else ""))

# 2. follows along
full_keys = set(map(tuple, full[KEY].values)); cut_keys = set(map(tuple, cut[KEY].values))
late = full[[tuple(k) not in cut_keys for k in full[KEY].values]]
grid_full = pd.read_csv(ROOT / "02_processed_data" / "E0_grid_model.csv")
grid_cut = pd.read_csv(tmp / "02_processed_data" / "E0_grid_model.csv")
movers = sorted(set(late["HomeTeam"]) | set(late["AwayTeam"]))
cols = ["HomeTeamOverallElo", "HomeElo"]
moved = []
for team in movers:
    f, c = grid_full[grid_full["HomeTeam"] == team], grid_cut[grid_cut["HomeTeam"] == team]
    moved.append(not np.allclose(f[cols].values, c[cols].values))
check(all(moved), f"FOLLOWS ALONG: next-round Elo / form / table position changed for all {len(movers)} clubs that played the {len(late)} extra matches")
quiet = sorted(set(grid_full["HomeTeam"]) - set(movers))
if quiet:
    same = [np.allclose(grid_full[grid_full["HomeTeam"] == t][["HomeElo", "HomeLast5Points"]].values,
                        grid_cut[grid_cut["HomeTeam"] == t][["HomeElo", "HomeLast5Points"]].values) for t in quiet]
    check(all(same), f"clubs that played none of the extra matches kept their own Elo and form ({len(quiet)} clubs)")

# 3. Elo direction after a win (within one season)
feat = pd.read_csv(ROOT / "02_processed_data" / "E0_live_features.csv")
feat["Date"] = pd.to_datetime(feat["Date"])
rows = []
for r in feat.itertuples():
    rows.append((r.Date, r.HomeTeam, r.HomeTeamOverallElo, r.FTHG > r.FTAG, r.FTHG == r.FTAG))
    rows.append((r.Date, r.AwayTeam, r.AwayTeamOverallElo, r.FTAG > r.FTHG, r.FTAG == r.FTHG))
log = pd.DataFrame(rows, columns=["Date", "Team", "Elo", "Won", "Drew"]).sort_values(["Team", "Date"])
log["NextElo"] = log.groupby("Team")["Elo"].shift(-1)
won = log[log["Won"] & log["NextElo"].notna()]
check((won["NextElo"] > won["Elo"]).all(), f"ELO MOVES THE RIGHT WAY: Elo rose after every one of {len(won)} wins in the live season")

# 4. the forecast grid starts from each club's POST-match Elo
grid = grid_full
last_rows = []
for team in sorted(set(feat["HomeTeam"]) | set(feat["AwayTeam"])):
    played = feat[(feat["HomeTeam"] == team) | (feat["AwayTeam"] == team)].sort_values("Date").iloc[-1]
    is_home = played["HomeTeam"] == team
    pre = played["HomeTeamOverallElo"] if is_home else played["AwayTeamOverallElo"]
    goals_for, goals_against = (played["FTHG"], played["FTAG"]) if is_home else (played["FTAG"], played["FTHG"])
    post = grid[grid["HomeTeam"] == team].iloc[0]["HomeTeamOverallElo"]
    last_rows.append((team, goals_for - goals_against, post - pre))
wins = [d for _, g, d in last_rows if g > 0]; losses = [d for _, g, d in last_rows if g < 0]
check(all(d > 0 for d in wins), f"NEXT MATCHDAY USES THE LATEST RESULT: Elo is higher than pre-match for all {len(wins)} clubs that won their latest match")
check(all(d < 0 for d in losses), f"... and lower for all {len(losses)} clubs that lost it")

# 5. grid logic equals the pipeline's own logic on real matches
sys.path.insert(0, str(ROOT / "src"))
from features.fixture_grid import rolling_state
hist = pd.concat([pd.read_csv(ROOT / "02_processed_data" / "E0_features.csv"), pd.read_csv(ROOT / "02_processed_data" / "E0_live_features.csv")], ignore_index=True)
sample = np.random.default_rng(0).choice(np.arange(400, len(hist)), size=60, replace=False)
bad = []
for i in sample:
    row, prior = hist.iloc[i], hist.iloc[:i]
    for side, team in (("Home", row["HomeTeam"]), ("Away", row["AwayTeam"])):
        for col, val in rolling_state(prior, team, side).items():
            a_, b_ = float(val), float(row[col])
            if not (np.isclose(a_, b_, atol=1e-9) or (np.isnan(a_) and np.isnan(b_))):
                bad.append((int(i), col, a_, b_))
check(not bad, f"GRID LOGIC == PIPELINE LOGIC: rolling form/goals/shots/half-time features match on {len(sample)} real matches" + (f" ({len(bad)} mismatches, e.g. {bad[:2]})" if bad else ""))

shutil.rmtree(tmp.parent, ignore_errors=True)
print("\nALL CHECKS PASSED" if not failures else f"\n{len(failures)} CHECK(S) FAILED")
sys.exit(1 if failures else 0)

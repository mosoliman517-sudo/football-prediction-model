#!/usr/bin/env bash
# One-command refresh of the live season (2026-27).
#
#   ./refresh.sh                 download the latest results, rebuild everything, verify
#   ./refresh.sh --no-download   rebuild from the results file already in 01_data/
#   ./refresh.sh --check         also run the live-flow proof (11_check_live_flow.py, +5 min)
#
# Takes about 10 minutes (03_train_model.py retrains five models). When it
# finishes, republish site/season_wrapped.html (ask Claude to "republish the
# page", or re-upload it) so the Match lab can score your saved calls.
set -euo pipefail
cd "$(dirname "$0")"
export MPLBACKEND=Agg

LIVE_FILE="01_data/E0_2627.csv"
LIVE_URL="https://www.football-data.co.uk/mmz4281/2627/E0.csv"

step() { printf '\n== %s\n' "$1"; }

if [[ " $* " != *" --no-download "* ]]; then
  step "Downloading the latest 2026-27 results"
  tmp="$(mktemp)"
  curl -fsSL -o "$tmp" "$LIVE_URL"
  head -1 "$tmp" | grep -q "HomeTeam" || { echo "Downloaded file does not look like a results file; keeping the old one."; exit 1; }
  new_rows=$(($(wc -l < "$tmp") - 1)); old_rows=$(($(wc -l < "$LIVE_FILE") - 1))
  if (( new_rows < old_rows )); then echo "New file has fewer matches ($new_rows) than the current one ($old_rows); keeping the old one."; exit 1; fi
  cp "$tmp" "$LIVE_FILE"; rm -f "$tmp"
  echo "Results file: $old_rows -> $new_rows matches"
fi

step "1/8 Features";            python3 src/01_load_data.py | grep -E "Saved|Error" || true
step "2/8 Model files + fixtures"; python3 src/02_load_features.py
step "3/8 Train models (slow)";  python3 src/03_train_model.py | grep -A8 "Final comparison"
step "4/8 Goal model";           python3 src/05_predict_scoreline.py 2>&1 | grep -E "Derived Win|Saved"
step "5/8 Blend + hybrid profiles";       python3 src/10_tune_blend_profiles.py | grep -v Warn
step "6/8 Validation";           python3 src/09_validate_simulation.py 2>&1 | grep -E "Blend of both|REST-OF-SEASON|inside the simulated"
step "7/8 Blind rest of season"; python3 src/12_blind_rest_of_season.py --backtest 2>&1 | grep -E "Arsenal|backtest|coverage|position_mae"
[[ -f site/crests/index.json ]] || { step "Fetching club badges (first run only)"; python3 src/13_fetch_crests.py; }
step "8/8 Build the page";       python3 src/08_build_wrapped.py | tail -3

step "Checks"
python3 -m pyflakes src/*.py src/features/*.py && echo "pyflakes clean"
python3 - <<'PY'
import pandas as pd
live = pd.read_csv("02_processed_data/E0_live_features.csv")
bench = pd.read_csv("02_processed_data/E0_features.csv")
print(f"benchmark matches: {len(bench)} (should stay 4560)  |  live matches: {len(live)}  |  latest: {live['Date'].max()}")
assert len(bench) == 4560, "the benchmark changed size, something is wrong"
PY

if [[ " $* " == *" --check "* ]]; then step "Live-flow proof"; python3 src/11_check_live_flow.py; fi

echo
echo "Done. Next: republish site/season_wrapped.html so saved calls get scored."
git status -s | head -20

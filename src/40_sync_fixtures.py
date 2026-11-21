"""
Live predictions: publishes the upcoming fixtures of the five leagues with the model's forecast, and records the results of finished ones.

  1. downloads the current season's results and the upcoming fixtures from football-data.co.uk,
  2. builds the walk-forward features for every completed match plus the fixtures (results unknown, so they change nothing),
  3. trains the pooled model on all completed matches and forecasts the fixtures (same model as src/29),
  4. writes the new fixtures to Supabase (their forecast is frozen the first time they are published, so it cannot be changed after
     players have seen it) and fills in the results of fixtures that have been played.

Needs two environment variables (the service key is a secret: keep it in GitHub Actions secrets or your shell, never in the page or the repo):
  SUPABASE_URL           e.g. https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY   the project's secret / service role key
Options:  --dry       print what would be written, change nothing online
          --simulate N  treat the last N played matches of the live season as upcoming fixtures (to test the pipeline)
Run from the project root:  python3 src/40_sync_fixtures.py
"""
import importlib.util
import os
import re
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import requests

sys.path.insert(0, "src")
spec = importlib.util.spec_from_file_location("wf", "src/29_multi_league_walkforward.py")
wf = importlib.util.module_from_spec(spec); spec.loader.exec_module(wf)
import core_features  # noqa: E402

DRY = "--dry" in sys.argv or bool(os.environ.get("DRY"))
SIM = int(sys.argv[sys.argv.index("--simulate") + 1]) if "--simulate" in sys.argv else 0
BASE = "https://football-data.co.uk"
HEAD = {"User-Agent": "ballknowledge-student-project/1.0 (educational)"}
slug = lambda s: re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")


def season_start(today=None):
    t = today or datetime.now(); return t.year if t.month >= 8 else t.year - 1


def refresh_results(yr):
    code = f"{yr % 100:02d}{(yr + 1) % 100:02d}"
    for lg in wf.LEAGUES:
        r = requests.get(f"{BASE}/mmz4281/{code}/{lg}.csv", headers=HEAD, timeout=60)
        if r.status_code == 200 and len(r.content) > 1000:
            path = f"01_data/E0_{code}.csv" if lg == "E0" else f"01_data_leagues/{lg}_{code}.csv"
            open(path, "wb").write(r.content)
    print("current season results refreshed")


def read_fixtures():
    r = requests.get(f"{BASE}/fixtures.csv", headers=HEAD, timeout=60); r.raise_for_status()
    d = pd.read_csv(pd.io.common.BytesIO(r.content), encoding="latin-1", on_bad_lines="skip")
    d.columns = [c.strip().lstrip("﻿").lstrip("ï»¿") for c in d.columns]
    d = d[d["Div"].isin(wf.LEAGUES)].dropna(subset=["HomeTeam", "AwayTeam", "Date"]).copy()
    d["Date"] = pd.to_datetime(d["Date"], dayfirst=True, format="mixed")
    tm = d.get("Time", pd.Series(["15:00"] * len(d), index=d.index)).fillna("15:00").astype(str)
    d["kick"] = [pd.Timestamp(f"{a:%Y-%m-%d} {b}").tz_localize(ZoneInfo("Europe/London")).tz_convert("UTC") for a, b in zip(d["Date"], tm)]
    return d


def main():
    yr = season_start()
    if not SIM:
        refresh_results(yr)
    frames, fix_rows = [], []
    for lg in wf.LEAGUES:
        files = sorted(__import__("glob").glob("01_data/E0_*.csv")) if lg == "E0" else sorted(__import__("glob").glob(f"01_data_leagues/{lg}_*.csv"))
        d = pd.concat([wf.read(f) for f in files], ignore_index=True)
        if SIM:
            tail = d.sort_values("Date").tail(SIM).copy(); d = d.drop(tail.index)
            tail["kick"] = pd.Timestamp.now(tz="UTC") + pd.Timedelta(days=2); tail["Div"] = lg
            for c in ("FTHG", "FTAG", "FTR"):
                tail[c] = np.nan
            fx = tail
        else:
            fx = None
        d["Div"] = lg; d["kick"] = pd.NaT
        frames.append((lg, d, fx))
    if not SIM:
        fixtures = read_fixtures()
        print(f"{len(fixtures)} upcoming fixtures in the five leagues")
        frames = [(lg, d, fixtures[fixtures["Div"] == lg].copy()) for lg, d, _ in frames]
    parts = []
    for lg, d, fx in frames:
        if fx is not None and len(fx):
            fx = fx.copy()
            for c in wf.COLS:
                if c not in fx.columns:
                    fx[c] = np.nan
            for c in ("FTHG", "FTAG", "FTR"):
                fx[c] = np.nan
            fx["fixture"] = True; d = d.assign(fixture=False)
            both = pd.concat([d, fx[list(set(d.columns) & set(fx.columns))]], ignore_index=True)
        else:
            both = d.assign(fixture=False)
        both = both.sort_values("Date", kind="stable").reset_index(drop=True)
        feat = core_features.build(both[wf.COLS + []] if False else both)
        both = pd.concat([both, feat], axis=1); both["League"] = lg
        both["Season"] = np.where(both["Date"].dt.month >= 8, both["Date"].dt.year, both["Date"].dt.year - 1)
        parts.append(both)
    d = pd.concat(parts, ignore_index=True)
    fixture = d["fixture"].fillna(False).astype(bool).to_numpy()
    if not fixture.any():
        print("No upcoming fixtures to forecast right now."); results_only(d); return
    feats = [c for c in d.columns if c not in wf.COLS and c not in ("League", "Season", "Div", "kick", "fixture")]
    X = d[feats].copy()
    for lg in wf.LEAGUES:
        X[f"lg_{lg}"] = (d["League"] == lg).astype(float)
    y = d["FTR"].map(wf.CODE)
    tr = np.where(~fixture & y.notna())[0]; te = np.where(fixture)[0]
    P, lh, la = wf.fit_predict(X.iloc[tr], y.iloc[tr].astype(int).to_numpy(), d["FTHG"].to_numpy()[tr], d["FTAG"].to_numpy()[tr], X.iloc[te])
    rows = []
    for j, i in enumerate(te):
        r = d.iloc[i]; pa, pdr, ph = [float(round(v, 4)) for v in P[j]]
        pick = "HDA"[int(np.argmax([ph, pdr, pa]))]; mh, ma = exact_score(float(lh[j]), float(la[j]), pick)
        rows.append({"id": f"{r['League']}-{r['Date']:%Y%m%d}-{slug(r['HomeTeam'])}-{slug(r['AwayTeam'])}", "league": r["League"], "kickoff": r["kick"].isoformat(), "home": r["HomeTeam"], "away": r["AwayTeam"],
                     "p_h": ph, "p_d": pdr, "p_a": pa, "model_pick": pick, "xg_h": round(float(lh[j]), 2), "xg_a": round(float(la[j]), 2), "model_hg": mh, "model_ag": ma})
    write_weekly(rows)
    print(f"forecast {len(rows)} fixtures; first rows:"); [print("  ", x["league"], x["home"], "v", x["away"], x["p_h"], x["p_d"], x["p_a"], x["model_pick"]) for x in rows[:6]]
    if DRY or SIM:
        print("dry run: nothing written to the database"); return
    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_KEY"):
        print("SUPABASE_URL / SUPABASE_SERVICE_KEY not set: the weekly forecast file is written, the database is skipped"); return
    rows = [{k: v for k, v in x.items() if k not in ("xg_h", "xg_a", "model_hg", "model_ag")} for x in rows]   # the database table keeps its original columns
    sb_post("fixtures", rows, "resolution=ignore-duplicates,return=minimal")     # forecasts are frozen the first time a fixture is published
    results_only(d)


def sb_headers(prefer=None):
    k = os.environ["SUPABASE_SERVICE_KEY"]
    h = {"apikey": k, "Authorization": f"Bearer {k}", "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    return h


def sb_post(table, rows, prefer):
    if not rows:
        return
    r = requests.post(f"{os.environ['SUPABASE_URL']}/rest/v1/{table}", headers=sb_headers(prefer), json=rows, timeout=60)
    print(f"wrote {len(rows)} rows to {table}: {r.status_code}" + ("" if r.ok else " " + r.text[:200]))


def exact_score(lh, la, pick):
    """The model's exact score: the most likely scoreline (independent Poisson goals from its expected goals) that agrees with its pick."""
    from math import exp, factorial
    pg = lambda lam, k: exp(-lam) * lam ** k / factorial(k)
    best = max(((h, a) for h in range(7) for a in range(7) if ("H" if h > a else "A" if a > h else "D") == pick), key=lambda x: pg(lh, x[0]) * pg(la, x[1]))
    return int(best[0]), int(best[1])


def write_weekly(rows, path="docs/football/weekly.json"):
    """The weekly tournament's model card, published with the site: every forecast is frozen the first time a fixture appears
    (later runs never change it), and fixtures more than two weeks old drop out. Results come from ESPN in the page."""
    import json
    try:
        old = {f["id"]: f for f in json.load(open(path, encoding="utf-8"))["fixtures"]}
    except (FileNotFoundError, ValueError, KeyError):
        old = {}
    now = pd.Timestamp.now(tz="UTC").isoformat(timespec="minutes")
    for x in rows:
        old.setdefault(x["id"], {**x, "made": now})   # when the forecast was made: it only scores if that was before kickoff
    cut = pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=14)
    keep = sorted((f for f in old.values() if pd.Timestamp(f["kickoff"]) >= cut), key=lambda f: (f["kickoff"], f["home"]))
    json.dump({"updated": pd.Timestamp.now(tz="UTC").isoformat(timespec="minutes"), "fixtures": keep}, open(path, "w", encoding="utf-8"), separators=(",", ":"))
    print(f"wrote {path}: {len(keep)} fixtures")


def results_only(d):
    """Fill in the result of every published fixture that has now been played."""
    if DRY or SIM or not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_KEY"):
        return
    url = os.environ["SUPABASE_URL"]
    r = requests.get(f"{url}/rest/v1/fixtures?select=id,league,home,away,kickoff&res=is.null&kickoff=lt.{pd.Timestamp.now(tz='UTC').isoformat()}", headers=sb_headers(), timeout=60)
    todo = r.json() if r.ok else []
    done = d[(~d["fixture"].fillna(False).astype(bool)) & d["FTR"].notna()]
    n = 0
    for f in todo:
        day = pd.Timestamp(f["kickoff"]).tz_convert("Europe/London").normalize().tz_localize(None)
        m = done[(done["League"] == f["league"]) & (done["HomeTeam"] == f["home"]) & (done["AwayTeam"] == f["away"]) & ((done["Date"] - day).abs() <= pd.Timedelta(days=1))]
        if len(m):
            x = m.iloc[0]
            requests.patch(f"{url}/rest/v1/fixtures?id=eq.{f['id']}", headers=sb_headers("return=minimal"), json={"res": x["FTR"], "hg": int(x["FTHG"]), "ag": int(x["FTAG"])}, timeout=60); n += 1
    print(f"filled in {n} results")


if __name__ == "__main__":
    main()

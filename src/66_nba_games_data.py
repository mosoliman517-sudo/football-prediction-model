"""NBA game data from the box scores: starting fives of big games, and standout stat lines for 'Who dropped it?'.
Output: 02_processed_data/nba_xi.json, nba_perf.json. Only real box-score facts."""
import json, glob, collections, pathlib
import pandas as pd
nd = json.load(open("02_processed_data/nba_data.json")); teams = {int(k): v for k, v in nd["teams"].items()}
COLS = ["game_id", "season", "season_type", "game_date", "athlete_id", "athlete_display_name", "team_id", "opponent_team_id", "minutes", "points", "rebounds", "assists", "steals", "blocks",
        "field_goals_made", "field_goals_attempted", "three_point_field_goals_made", "three_point_field_goals_attempted", "starter", "did_not_play", "team_score", "opponent_team_score", "home_away", "athlete_position_abbreviation", "team_winner"]
pb = pd.concat([pd.read_csv(f, low_memory=False, usecols=lambda c: c in COLS) for f in sorted(glob.glob("01_data_nba/player_box_*.csv"))], ignore_index=True)
pb = pb[pb.season_type.isin([2, 3]) & (pb.team_id <= 30) & (pb.opponent_team_id <= 30) & (pb.did_not_play == False) & (pb.minutes.fillna(0) > 0)].drop_duplicates(["game_id", "athlete_id"])
lab = lambda y: f"{y-1}-{str(y)[2:]}"
# ---- big games: clinchers of conference finals and Finals, and every Game 7 ----
po = pb[pb.season_type == 3].drop_duplicates(["game_id", "team_id"])[["game_id", "season", "game_date", "team_id", "opponent_team_id", "team_score", "opponent_team_score", "team_winner", "home_away"]]
want = {}   # game_id -> label
for s, lst in nd["series"].items():
    for x in lst:
        a, b = x["a"], x["b"]; g = po[(po.season == int(s)) & (((po.team_id == a) & (po.opponent_team_id == b)) | ((po.team_id == b) & (po.opponent_team_id == a)))].sort_values("game_date")
        gids = list(dict.fromkeys(g.game_id))
        if not gids: continue
        rname = {1: "First round", 2: "Second round", 3: "Conference finals", 4: "NBA Finals"}[x["round"]]
        if x["wa"] + x["wb"] == 7 and min(x["wa"], x["wb"]) == 3: want[gids[-1]] = f"{rname}, Game 7"
        elif x["round"] >= 3: want[gids[-1]] = f"{rname}, clinching game"
xi = []
for gid, label in want.items():
    g = pb[pb.game_id == gid]
    if g.empty: continue
    row = {"id": int(gid), "date": g.game_date.iloc[0], "season": lab(int(g.season.iloc[0])), "label": label, "teams": []}
    ok = True
    for tid, tg in g.groupby("team_id"):
        st = tg[tg.starter == True]
        if len(st) != 5: ok = False; break
        t = tg.iloc[0]
        row["teams"].append({"team": teams[int(tid)]["short"], "side": t.home_away, "score": int(t.team_score), "won": bool(t.team_winner),
                             "starters": [{"id": int(r.athlete_id), "n": r.athlete_display_name, "pos": r.athlete_position_abbreviation if isinstance(r.athlete_position_abbreviation, str) else ""} for r in st.sort_values("minutes", ascending=False).itertuples()]})
    if ok and len(row["teams"]) == 2: xi.append(row)
xi.sort(key=lambda r: r["date"])
pathlib.Path("02_processed_data/nba_xi.json").write_text(json.dumps(xi, ensure_ascii=False, separators=(",", ":")))
print("starting-five games:", len(xi))
# ---- standout stat lines ----
q = pb[(pb.points >= 45) | ((pb.points >= 30) & (pb.rebounds >= 10) & (pb.assists >= 10)) | (pb.rebounds >= 24) | (pb.assists >= 20) | (pb.blocks >= 8) | (pb.steals >= 7) | ((pb.points >= 25) & (pb.rebounds >= 10) & (pb.assists >= 10))]
perf = []
for r in q.itertuples():
    perf.append({"pid": int(r.athlete_id), "date": r.game_date, "season": lab(int(r.season)), "po": int(r.season_type) == 3, "team": teams[int(r.team_id)]["short"], "opp": teams[int(r.opponent_team_id)]["short"], "home": r.home_away == "home",
                 "won": bool(r.team_winner), "score": [int(r.team_score), int(r.opponent_team_score)], "min": int(r.minutes), "pts": int(r.points), "reb": int(r.rebounds), "ast": int(r.assists), "stl": int(r.steals), "blk": int(r.blocks),
                 "fg": [int(r.field_goals_made), int(r.field_goals_attempted)], "tp": [int(r.three_point_field_goals_made), int(r.three_point_field_goals_attempted)]})
pathlib.Path("02_processed_data/nba_perf.json").write_text(json.dumps(perf, separators=(",", ":")))
print("stat lines:", len(perf))

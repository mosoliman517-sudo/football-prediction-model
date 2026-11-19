"""NBA step 2: build the quiz / game data from ESPN box scores (2001-02 -> now) + Wikidata bios.
Output: 02_processed_data/nba_data.json  {players, teams, seasons, series, asOf, first}
Rules (same as football): nothing invented. A player with no bio keeps only the clues we truly have.
Coverage starts with the 2001-02 season, so careers that began earlier are flagged `partial` and kept out of Career path."""
import json, glob, collections, datetime, pathlib
import pandas as pd
ROOT = pathlib.Path("."); RAW = ROOT / "01_data_nba"; OUT = ROOT / "02_processed_data" / "nba_data.json"
lab = lambda y: f"{y-1}-{str(y)[2:]}"
COLS = ["game_id", "season", "season_type", "game_date", "athlete_id", "athlete_display_name", "team_id", "team_name", "team_location", "team_display_name",
        "team_abbreviation", "team_color", "team_alternate_color", "team_logo", "minutes", "points", "rebounds", "assists", "steals", "blocks", "did_not_play",
        "athlete_position_name", "athlete_position_abbreviation", "athlete_headshot_href", "starter", "team_winner", "opponent_team_id", "team_score", "opponent_team_score", "home_away"]
frames = []
for f in sorted(glob.glob(str(RAW / "player_box_*.csv"))):
    d = pd.read_csv(f, low_memory=False, usecols=lambda c: c in COLS)
    frames.append(d)
pb = pd.concat(frames, ignore_index=True)
pb = pb[pb.season_type.isin([2, 3]) & (pb.team_id <= 30) & (pb.opponent_team_id <= 30)]   # real franchises only: no All-Star / exhibition sides
pb["minutes"] = pb["minutes"].fillna(0)
pb = pb[(pb.did_not_play == False) & (pb.minutes > 0)].copy()
pb = pb.drop_duplicates(["game_id", "athlete_id"])
LATEST = int(pb.season.max()); print("rows", len(pb), "players", pb.athlete_id.nunique(), "latest season", LATEST)

# ---- teams (franchises keyed by ESPN team id) ----
teams = {}
for tid, g in pb.sort_values("game_date").groupby("team_id"):
    last = g.iloc[-1]
    names = sorted({" ".join(str(n).split()) for n in g.team_display_name})
    teams[int(tid)] = {"id": int(tid), "name": last.team_display_name, "short": last.team_name, "loc": last.team_location, "abbr": last.team_abbreviation,
                       "col": "#" + str(last.team_color), "col2": "#" + str(last.team_alternate_color), "logo": last.team_logo, "old": [n for n in names if n != last.team_display_name]}
CUR = {t["name"] for t in teams.values()}
for t in teams.values(): t["old"] = [n for n in t["old"] if n not in CUR and "/" not in n]
print("teams", len(teams))

# ---- games / seasons / series from box scores (one row per team per game) ----
tg = pb.drop_duplicates(["game_id", "team_id"])[["game_id", "season", "season_type", "game_date", "team_id", "opponent_team_id", "team_score", "opponent_team_score", "team_winner", "home_away"]]
seasons = {}
for (s, tid), g in tg.groupby(["season", "team_id"]):
    r = g[g.season_type == 2]; po = g[g.season_type == 3]
    seasons.setdefault(int(s), {})[int(tid)] = {"w": int(r.team_winner.sum()), "l": int(len(r) - r.team_winner.sum()), "pf": float(r.team_score.mean()) if len(r) else None, "pa": float(r.opponent_team_score.mean()) if len(r) else None, "po": int(len(po))}
series = {}; champs = {}
for s, g in tg[tg.season_type == 3].groupby("season"):
    ser = {}
    for _, r in g.iterrows():
        key = tuple(sorted((int(r.team_id), int(r.opponent_team_id))))
        e = ser.setdefault(key, {"first": r.game_date, "last": r.game_date, "w": collections.Counter(), "n": 0}); e["first"] = min(e["first"], r.game_date); e["last"] = max(e["last"], r.game_date)
        if r.team_winner: e["w"][int(r.team_id)] += 1
    order = sorted(ser.items(), key=lambda kv: (kv[1]["first"], kv[1]["last"]))
    n = len(order)
    if n != 15: print("WARNING season", s, "has", n, "series (expect 15)"); 
    if n != 15: continue
    # a series ends when one side reaches 4 wins; rounds: 8 / 4 / 2 / 1 ordered by series END date inside each round is unreliable, so use start order
    rounds = [1] * 8 + [2] * 4 + [3] * 2 + [4]
    # fix: later-round series cannot start before their feeder ends; sort by last game date for rounds 2+ is safer
    by_end = sorted(ser.items(), key=lambda kv: kv[1]["last"])
    fin = by_end[-1]; conf = by_end[-3:-1]; semis = by_end[-7:-3]; first = by_end[:-7]
    lst = []
    for rnd, grp in ((1, first), (2, semis), (3, conf), (4, [fin])):
        for key, e in grp:
            win = max(e["w"], key=e["w"].get) if e["w"] else None
            lst.append({"s": int(s), "round": rnd, "a": key[0], "b": key[1], "win": win, "wa": e["w"].get(key[0], 0), "wb": e["w"].get(key[1], 0)})
    series[int(s)] = lst
    champs[int(s)] = lst[-1]["win"]
    for x in lst:
        for t in (x["a"], x["b"]):
            rec = seasons[int(s)][t]; rec["rd"] = max(rec.get("rd", 0), x["round"])
        if x["round"] == 4 and x["win"]:
            seasons[int(s)][x["win"]]["champ"] = True
print("champions", {lab(k): teams[v]["short"] for k, v in champs.items() if v})

# ---- players ----
wd = json.load(open(ROOT / "02_processed_data" / "nba_wikidata.json"))
POSG = {"PG": "Guard", "SG": "Guard", "G": "Guard", "SF": "Forward", "PF": "Forward", "F": "Forward", "C": "Center"}
players = []
for pid, g in pb.sort_values(["game_date", "game_id"]).groupby("athlete_id"):
    g = g.copy(); pid = int(pid)
    sp = []   # spells: consecutive games with same team
    for tid, s in zip(g.team_id.astype(int), g.season.astype(int)):
        if sp and sp[-1][0] == tid: sp[-1][2] = s
        else: sp.append([tid, s, s])
    hist = [teams[t]["short"] for t, _, _ in sp]
    reg = g[g.season_type == 2]; po = g[g.season_type == 3]
    # per-season averages (min 20 games)
    best = {}
    for s, x in reg.groupby("season"):
        if len(x) >= 20:
            best[int(s)] = {"gp": len(x), "pts": x.points.mean(), "reb": x.rebounds.mean(), "ast": x.assists.mean(), "stl": x.steals.mean(), "blk": x.blocks.mean()}
    def top(k):
        if not best: return None
        s = max(best, key=lambda z: best[z][k]); return {"season": lab(s), "avg": round(float(best[s][k]), 1), "team": teams[int(reg[reg.season == s].team_id.iloc[-1])]["short"]}
    ssn = {lab(k): [v["gp"], round(float(v["pts"]), 1), round(float(v["reb"]), 1), round(float(v["ast"]), 1), round(float(v["stl"]), 1), round(float(v["blk"]), 1)] for k, v in best.items()}   # every season with 20+ games: gp, pts, reb, ast, stl, blk a game
    titles = []
    for s, x in po.groupby("season"):
        if champs.get(int(s)) and champs[int(s)] in set(x.team_id.astype(int)):
            titles.append({"season": lab(int(s)), "team": teams[champs[int(s)]]["short"]})
    last = g.iloc[-1]
    pos = collections.Counter(g.athlete_position_abbreviation.dropna()).most_common(1)
    posn = collections.Counter(g.athlete_position_name.dropna()).most_common(1)
    w = wd.get(str(pid), {})
    first_season = int(g.season.min())
    ph = collections.Counter(g.athlete_headshot_href.dropna()).most_common(1)
    rec = {"id": pid, "n": g.athlete_display_name.iloc[-1], "pos": POSG.get(pos[0][0]) if pos else None, "posn": posn[0][0] if posn else None, "pa": pos[0][0] if pos else None,
           "club": teams[int(last.team_id)]["short"], "tid": int(last.team_id), "active": bool(LATEST in set(g.season) and int(last.season) == LATEST),
           "hist": hist, "cr": [[teams[t]["short"], lab(a), lab(b)] for t, a, b in sp], "first": lab(first_season), "last": lab(int(last.season)),
           "partial": first_season == 2002, "gp": int(len(reg)), "min": int(g.minutes.sum()), "pts": int(g.points.sum()), "reb": int(g.rebounds.sum()), "ast": int(g.assists.sum()),
           "ss": ssn, "bp": top("pts"), "br": top("reb"), "ba": top("ast"), "bs": top("stl"), "bb": top("blk"), "ti": titles, "photo": ph[0][0] if ph else None,
           "dob": w.get("dob"), "h": w.get("h"), "bpl": w.get("bp"), "bc": w.get("bc"), "nat": w.get("nat"), "aw": sorted(set(w.get("awards", []))) or None, "wd": w.get("wd")}
    players.append(rec)
players.sort(key=lambda p: -p["min"])
for i, p in enumerate(players): p["rk"] = i + 1

# ---- teammates: players who shared a team in a season with 30+ games each (stars only are stored, to keep the file small) ----
tmx = pb[pb.season_type == 2].groupby(["season", "team_id", "athlete_id"]).size().reset_index(name="g")
tmx = tmx[tmx.g >= 30]
mates = collections.defaultdict(set)
for (s, t), g in tmx.groupby(["season", "team_id"]):
    ids = list(g.athlete_id.astype(int))
    for a in ids:
        for b in ids:
            if a != b: mates[a].add(b)
star_ids = {p["id"] for p in players[:140]}
for p in players: p["tm"] = sorted(mates.get(p["id"], set()) & star_ids)
print("players", len(players), "with dob", sum(1 for p in players if p["dob"]), "partial", sum(1 for p in players if p["partial"]))
OUT.write_text(json.dumps({"players": players, "teams": teams, "seasons": {str(k): {str(t): v for t, v in d.items()} for k, d in seasons.items()}, "series": {str(k): v for k, v in series.items()},
                           "champs": {str(k): v for k, v in champs.items()}, "latest": LATEST, "asOf": datetime.date.today().isoformat(), "first": 2002}, ensure_ascii=False))
print("wrote", OUT, OUT.stat().st_size // 1024, "KB")

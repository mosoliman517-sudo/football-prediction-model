"""Builds the chess site: site/chess.html (private) or docs/chess/index.html (--public) from site/chess_template.html + the chess data files."""
import json, sys, os, re, csv, gzip, collections, datetime
PUBLIC = "--public" in sys.argv; OUT = "docs/chess/index.html" if PUBLIC else "site/chess.html"
cnt = collections.Counter()
with gzip.open("02_processed_data/chess_games.csv.gz", "rt", encoding="utf-8") as f:
    for r in csv.DictReader(f): cnt[r["opening"]] += 1
openings = []
for r in csv.DictReader(open("01_data_chess/openings.tsv", encoding="utf-8"), delimiter="\t"):
    n = cnt.get(r["name"], 0); plies = len(re.findall(r"\d+\.", r["pgn"]))
    if n >= 400 and 2 <= plies <= 8: openings.append({"eco": r["eco"], "name": r["name"], "pgn": r["pgn"], "n": n})
print("openings in the quiz:", len(openings))
model = json.load(open("02_processed_data/chess_model.json")); players = json.load(open("02_processed_data/chess_players.json"))
import random, collections as _c
def _key(n): return " ".join(sorted(re.sub(r"[^a-z ]", " ", re.sub(r"\(.*?\)", "", (n or "")).lower().replace(",", " ")).split()))
_allraw = json.load(open("02_processed_data/chess_elite.json")); _cnt = _c.Counter(); [_cnt.update([g["white"], g["black"]]) for g in _allraw]
_pref = {}
for n_, c_ in _cnt.most_common():
    k_ = _key(n_)
    if k_ not in _pref or ("(" in _pref[k_] and "(" not in n_): _pref[k_] = n_
fixn = lambda n: _pref.get(_key(n), n)                         # one spelling per player: "Carlsen, Magnus" and "Carlsen Magnus (NOR)" are the same person
em = json.load(open("02_processed_data/chess_elite_model.json"))
_bigk = ("World Championship", "Candidates", "Norway Chess", "Tata Steel"); random.seed(21)
_keep = {id(g) for g in em["games"] if len(g["moves"]) >= 44 and g["kind"] in _bigk} | {id(g) for g in random.sample([g for g in em["games"] if len(g["moves"]) >= 44 and g["kind"] not in _bigk and min(g["we"], g["be"]) >= 2450], 380)}
for g in em["games"]:
    g["white"] = fixn(g["white"]); g["black"] = fixn(g["black"]); g["plies"] = len(g["moves"])
    if id(g) in _keep: g["moves"] = g["moves"][:90]          # watchable games the model never trained on
    else: g.pop("moves", None)       # the prediction game needs only how long the game was
allg = json.load(open("02_processed_data/chess_elite.json")); random.seed(4)
for g in allg: g["white"] = fixn(g["white"]); g["black"] = fixn(g["black"])
big = [g for g in allg if g["kind"] in ("World Championship", "Candidates", "Norway Chess", "Tata Steel")]
rest = random.sample([g for g in allg if g["kind"] not in ("World Championship", "Candidates", "Norway Chess", "Tata Steel") and min(g["we"], g["be"]) >= 2550], 350)
elite_moves = [{"kind": g["kind"], "event": g["event"], "date": g["date"], "white": g["white"], "black": g["black"], "result": g["result"], "moves": g["moves"][:90]} for g in big + rest]
evals = json.load(open("02_processed_data/chess_evals.json"))
for e in evals: e["moves"] = [re.sub(r"[?!]+", "", m) for m in e["moves"]]; e["san"] = re.sub(r"[?!]+", "", e["san"])      # Lichess marks bad moves with ? in the text, which would give the answer away
puzzles = json.load(open("02_processed_data/chess_puzzles.json"))
print("elite games for the model:", len(em["games"]), "| with moves:", len(elite_moves), "| graded moves:", len(evals), "| puzzles:", len(puzzles))
# lookup tables: every elite game in a compact form, so the page can build any player's or tournament's history
evs = sorted({g["event"] for g in allg}); evi = {e: i for i, e in enumerate(evs)}
names = sorted({g["white"] for g in allg} | {g["black"] for g in allg}); ni = {n: i for i, n in enumerate(names)}
kinds = {g["event"]: g["kind"] for g in allg}
EXP = json.load(open("02_processed_data/chess_exp.json"))     # held-out expected White score per game (src/75)
lookup = {"events": [{"n": e, "kind": kinds[e]} for e in evs], "players": names,
          "games": [[evi[g["event"]], g["date"] if re.match(r"\d{4}-\d\d-\d\d", g["date"]) else "", ni[g["white"]], ni[g["black"]], {"1-0": 1, "0-1": 0, "1/2-1/2": 2}[g["result"]], g["we"], g["be"], str(g["round"]).split(".")[0], len(g["moves"]) // 2, int(round(EXP[k] * 1000))] for k, g in enumerate(allg)]}
print("lookup:", len(evs), "events,", len(names), "players,", len(lookup["games"]), "games")
data = {"lookup": lookup, "model": model, "openings": openings, "players": players, "elite": em, "eliteMoves": elite_moves, "evals": evals, "puzzles": puzzles}
import base64, glob
pcss = "".join(f".pc-{os.path.basename(f)[:2].lower()}{{background-image:url(data:image/svg+xml;base64,{base64.b64encode(open(f,'rb').read()).decode()})}}" for f in sorted(glob.glob("01_data_chess/pieces/*.svg")))
import subprocess as _sp; _sp.run([sys.executable, "src/95_site_index.py"], check=True, capture_output=True)   # search index for all three sports
html = open("site/chess_template.html", encoding="utf-8").read().replace("/*__PIECES__*/", pcss).replace("/*__USAGE__*/", open("site/usage.js", encoding="utf-8").read() + open("site/voice.js", encoding="utf-8").read() + open("site/name_sync.js", encoding="utf-8").read() + open("site/coach_lines.js", encoding="utf-8").read() + open("site/opening_stories.js", encoding="utf-8").read() + open("site/install.js", encoding="utf-8").read() + open("site/site_index.js", encoding="utf-8").read() + open("site/sitesearch.js", encoding="utf-8").read())
import os
data["board"] = json.load(open("site/board_config.json")) if os.path.exists("site/board_config.json") else None
data["champ"] = json.load(open("02_processed_data/chess_champ.json", encoding="utf-8")) if os.path.exists("02_processed_data/chess_champ.json") else None   # src/78: Total Chess games + FIDE profiles
data["ratings"] = json.load(open("02_processed_data/chess_ratings.json", encoding="utf-8")) if os.path.exists("02_processed_data/chess_ratings.json") else None   # src/79: FIDE top 100 lists + rating history
data["events"] = json.load(open("02_processed_data/chess_events.json", encoding="utf-8")) if os.path.exists("02_processed_data/chess_events.json") else None   # src/81: 2026 tournaments
data["sim"] = json.load(open("02_processed_data/chess_sim.json")) if os.path.exists("02_processed_data/chess_sim.json") else None   # src/84: draw rates by level, speed and gap
data["openstats"] = json.load(open("02_processed_data/chess_openstats.json")) if os.path.exists("02_processed_data/chess_openstats.json") else None   # club results by opening family
_rc = json.load(open("02_processed_data/chess_ratecal.json")) if os.path.exists("02_processed_data/chess_ratecal.json") else None
data["ratecal"] = {k: _rc[k] for k in ("book", "coef", "speeds", "maps", "curve", "spread") if k in _rc} if _rc else None   # src/85: game-rating calibration
_a = open("site/arena_template.html").read(); _i = _a.index("function mqttConnect("); _j = _a.index("const BROKERS", _i)
html = html.replace("/*__MQTT__*/", _a[_i:_j])
html = html.replace("/*__EXTRAS__*/", open("site/chess_extras.js", encoding="utf-8").read() + open("site/chess_home.js", encoding="utf-8").read() + open("site/chess_more.js", encoding="utf-8").read() + open("site/chess_wcc.js", encoding="utf-8").read() + open("site/bot_lines.js", encoding="utf-8").read() + open("site/chess_bots.js", encoding="utf-8").read() + open("site/chess_brain.js", encoding="utf-8").read() + open("site/chess_endcard.js", encoding="utf-8").read() + open("site/chess_talk.js", encoding="utf-8").read() + open("site/chess_settings.js", encoding="utf-8").read())   # more lessons, endgame trainer, guess the famous game
if PUBLIC and data["events"]:   # the tournaments (the largest part) in their own file, loaded after the page opens
    import hashlib
    _blob = ("window.__BK_EV=" + json.dumps(data["events"], separators=(",", ":"), ensure_ascii=False) + ";").encode("utf-8"); _ev = f"events.{hashlib.sha1(_blob).hexdigest()[:10]}.js"
    os.makedirs("docs/chess", exist_ok=True)
    for _f in glob.glob("docs/chess/events.*.js"):
        if os.path.basename(_f) != _ev: os.remove(_f)
    open("docs/chess/" + _ev, "wb").write(_blob); data["events"] = None; data["eventsFile"] = _ev
html = html.replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":"), ensure_ascii=False))
if PUBLIC:   # installable like the other sports: manifest, icons, and the shared offline service worker
    pwa = '<link rel="manifest" href="../manifest.webmanifest"><meta name="theme-color" content="#0b1033"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><link rel="apple-touch-icon" href="../apple-touch-icon.png">'
    html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' + pwa + html + '<script>if ("serviceWorker" in navigator && location.protocol === "https:") addEventListener("load", () => navigator.serviceWorker.register("../sw.js").catch(() => {}));</script></html>'
os.makedirs(os.path.dirname(OUT), exist_ok=True)
if PUBLIC:
    sys.path.insert(0, "src"); from split_loader import split_main_script     # splash first, game code in app.<hash>.js
    html = split_main_script(html, os.path.dirname(OUT))
open(OUT, "w", encoding="utf-8").write(html); print("wrote", OUT, f"{len(html)/1e6:.2f} MB")

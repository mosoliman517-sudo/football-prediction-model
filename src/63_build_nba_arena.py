"""Builds the basketball site: site/nba.html (private) or docs/basketball/index.html (--public) from site/nba_template.html + 02_processed_data/nba_data.json.
Data shape follows the football build (players with hist / cr, clubs, leagues.tables) so the shared game engines run, with NBA-specific fields added."""
import json, os, sys, re, datetime
PUBLIC = "--public" in sys.argv
OUT = os.environ.get("NBA_OUT", "docs/basketball/index.html" if PUBLIC else "site/nba.html")
nd = json.load(open("02_processed_data/nba_data.json"))
teams = {int(k): v for k, v in nd["teams"].items()}
lab = lambda y: f"{y-1}-{str(y)[2:]}"
short = {t["id"]: t["short"] for t in teams.values()}

# ---- players: keep real careers only (a birth date for age clues, and enough games to be a fair question) ----
AWD = json.load(open("02_processed_data/nba_awards.json")); AW = {}      # src/67: complete winner lists from Wikipedia, 2001-02 on
for k_, d_ in AWD.items():
    for s_, n_ in d_.items(): AW.setdefault(n_, []).append([k_, s_])
def small(u, w=160, h=116):
    """ESPN serves resized copies (about 20 KB instead of 200 KB): far less to download and decode, which matters most on phones."""
    m = re.search(r"https?://a\.espncdn\.com(/i/[^?]+)", u or "")
    return f"https://a.espncdn.com/combiner/i?img={m.group(1)}&w={w}&h={h}" if m else u
P = []
for p in nd["players"]:
    if not p["dob"] or p["gp"] < 100: continue
    q = dict(p)
    q.update({"comp": "NBA", "nat": p["bc"] or p["nat"] or "", "bc": p["bc"], "city": (p["bpl"] or ""), "sub": p["posn"], "val": p["pts"], "peak": p["pts"]})
    q["end"] = None; q["aw"] = AW.get(p["n"]) or None
    q["ph"] = small(p["photo"] or f"https://a.espncdn.com/i/headshots/nba/players/full/{p['id']}.png")
    P.append(q)
print("quiz players", len(P), "active", sum(p["active"] for p in P), "career-path eligible", sum(1 for p in P if not p["partial"] and len(p["hist"]) >= 3))

# ---- teams / seasons ----
clubs = {}
wins = {}
for s, d in nd["seasons"].items():
    for t, r in d.items(): wins[int(t)] = wins.get(int(t), 0) + r["w"]
titles = {}
for s, t in nd["champs"].items():
    if t: titles[t] = titles.get(t, 0) + 1
for t in teams.values():
    clubs[t["short"]] = {"tm": t["short"], "full": t["name"], "loc": t["loc"], "abbr": t["abbr"], "stadium": None, "seats": None, "coach": None, "squad": None, "age": None, "value": wins.get(t["id"], 0), "titles": titles.get(t["id"], 0), "lg": "NBA", "cid": t["id"], "old": t["old"]}
alias = {}
for t in teams.values():
    for n in t["old"]: alias[n] = t["short"]
tables = {}
for s, d in sorted(nd["seasons"].items()):
    rows = []
    for t, r in d.items():
        if r["w"] + r["l"] < 60: continue
        rows.append([short[int(t)], r["w"], round(r["pf"] or 0, 1), round(r["pa"] or 0, 1), r["w"], 0, r["l"], r.get("rd", 0) + (1 if r.get("champ") else 0) if r.get("po") else 0])
    if len(rows) >= 28:
        rows.sort(key=lambda x: (-x[1], -(x[2] - x[3])))
        tables[lab(int(s))] = rows
crests = {t["short"]: small(t["logo"], 128, 128) for t in teams.values()}
colours = {t["short"]: [t["col"], t["col2"]] for t in teams.values()}
league = {"name": "NBA", "country": "United States", "tag": "Thirty franchises, 25 seasons of box scores.", "star": None, "logo": None, "crests": crests, "race": None, "tables": tables, "scorers": None,
          "seasons": {k: {"live": False, "matches": [], "rb": [0]} for k in tables}}
LEG = ["Kobe Bryant", "Dirk Nowitzki", "Tim Duncan", "Kevin Garnett", "Dwyane Wade", "Vince Carter", "Paul Pierce", "Ray Allen", "Jason Kidd", "Steve Nash", "Manu Ginobili", "Tony Parker", "Carmelo Anthony", "Pau Gasol", "Allen Iverson", "Shaquille O'Neal", "Chris Bosh", "Dwight Howard"]
nm = lambda s: re.sub(r"[^a-z]", "", __import__("unicodedata").normalize("NFD", s).lower())
legs = [p for p in P if any(nm(p["n"]) == nm(l) for l in LEG)]
print("legends found", sorted(p["n"] for p in legs))
hero = [{"n": p["n"], "img": p["ph"]} for p in sorted([x for x in P if x["active"]], key=lambda z: -z["min"])[:44]] + [{"n": p["n"], "img": p["ph"]} for p in legs]
import requests
def alive(u):
    try: return requests.head(u, timeout=8, allow_redirects=True).status_code == 200
    except Exception: return False
before = len(hero); hero = [h for h in hero if alive(h["img"])]; print("hero photos reachable:", len(hero), "of", before)
data = {"sport": "nba", "leagues": {"NBA": league}, "profiles": {}, "summary": {"ALL": {"n": 0, "pooled_acc": 0, "market_acc": 0}}, "statsval": {}, "board": None, "hero": hero, "colors": colours,
        "baselines": {}, "quiz": {"players": P, "clubs": clubs, "alias": alias, "asOf": nd["asOf"]}, "xi": [], "bracket": [], "highlights": [], "about": (json.load(open("site/about.json")) if os.path.exists("site/about.json") else {}), "audit": None, "gn": []}
nm = json.load(open("02_processed_data/nba_model.json"))
data["nbaModel"] = {"games": nm["games"], "summary": nm["summary"], "quarters": nm["quarters"], "elo": nm["elo_final"], "po_elo": nm["po_elo"], "series": nd["series"]}
ids = {p["id"] for p in P}
data["nbaXI"] = json.load(open("02_processed_data/nba_xi.json"))
data["nbaPerf"] = [x for x in json.load(open("02_processed_data/nba_perf.json")) if x["pid"] in ids]
cfg = "site/board_config.json"
if os.path.exists(cfg): data["board"] = json.load(open(cfg))
if os.environ.get("BOARD_URL") and os.environ.get("BOARD_KEY"): data["board"] = {"url": os.environ["BOARD_URL"].rstrip("/"), "key": os.environ["BOARD_KEY"]}
overlay = open("site/nba_overlay.js", encoding="utf-8").read() if os.path.exists("site/nba_overlay.js") else ""
html = open("site/nba_template.html", encoding="utf-8").read().replace("/*__NBA_OVERLAY__*/", overlay).replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":"), ensure_ascii=False))
STAMP = f'Build {datetime.datetime.now(datetime.timezone.utc):%d %b %Y %H:%M} UTC · {"public" if PUBLIC else "private"} · box scores through {max(p["last"] for p in nd["players"])}'
html = html.replace('<div class="foot">', f'<div class="foot"><span class="num" id="buildStamp">{STAMP}</span>', 1)
if PUBLIC:
    pwa = '<link rel="manifest" href="../manifest.webmanifest"><meta name="theme-color" content="#0b1033"><meta name="apple-mobile-web-app-capable" content="yes"><link rel="apple-touch-icon" href="../apple-touch-icon.png">'
    html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' + pwa + html + "</html>"
if PUBLIC:
    html = html + '<script>if ("serviceWorker" in navigator && location.protocol === "https:") addEventListener("load", () => navigator.serviceWorker.register("../sw.js").catch(() => {}));</script></html>'
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w", encoding="utf-8").write(html)
print("wrote", OUT, f"{len(html)/1e6:.2f} MB")

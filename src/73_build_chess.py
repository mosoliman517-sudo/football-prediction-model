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
import random
em = json.load(open("02_processed_data/chess_elite_model.json"))
for g in em["games"]: g["plies"] = len(g["moves"]); g.pop("moves", None)       # the prediction game needs only how long the game was
allg = json.load(open("02_processed_data/chess_elite.json")); random.seed(4)
big = [g for g in allg if g["kind"] in ("World Championship", "Candidates", "Norway Chess", "Tata Steel")]
rest = random.sample([g for g in allg if g["kind"] not in ("World Championship", "Candidates", "Norway Chess", "Tata Steel") and min(g["we"], g["be"]) >= 2550], 350)
elite_moves = [{"kind": g["kind"], "event": g["event"], "date": g["date"], "white": g["white"], "black": g["black"], "result": g["result"], "moves": g["moves"][:90]} for g in big + rest]
evals = json.load(open("02_processed_data/chess_evals.json"))
for e in evals: e["moves"] = [re.sub(r"[?!]+", "", m) for m in e["moves"]]; e["san"] = re.sub(r"[?!]+", "", e["san"])      # Lichess marks bad moves with ? in the text, which would give the answer away
puzzles = json.load(open("02_processed_data/chess_puzzles.json"))
print("elite games for the model:", len(em["games"]), "| with moves:", len(elite_moves), "| graded moves:", len(evals), "| puzzles:", len(puzzles))
data = {"model": model, "openings": openings, "players": players, "elite": em, "eliteMoves": elite_moves, "evals": evals, "puzzles": puzzles}
html = open("site/chess_template.html", encoding="utf-8").read().replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":"), ensure_ascii=False))
if PUBLIC: html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' + html + "</html>"
os.makedirs(os.path.dirname(OUT), exist_ok=True); open(OUT, "w", encoding="utf-8").write(html); print("wrote", OUT, f"{len(html)/1e6:.2f} MB")

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
data = {"model": model, "openings": openings, "players": players}
html = open("site/chess_template.html", encoding="utf-8").read().replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":"), ensure_ascii=False))
if PUBLIC: html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' + html + "</html>"
os.makedirs(os.path.dirname(OUT), exist_ok=True); open(OUT, "w", encoding="utf-8").write(html); print("wrote", OUT, f"{len(html)/1e6:.2f} MB")

"""Chess step 6: puzzles from the Lichess puzzle database (CC0), first 60 MB of the file. Each puzzle: position (FEN), the solution moves, rating, themes.
In a Lichess puzzle the first move is the opponent's; the player then finds the rest. Output: chess_puzzles.json (a sample spread over every rating band)."""
import io, csv, zstandard, json, random, collections
rows = []
with open("01_data_chess/puzzles_first60MB.csv.zst", "rb") as fh, zstandard.ZstdDecompressor().stream_reader(fh) as rd:
    text = io.TextIOWrapper(rd, encoding="utf-8", errors="replace")
    try:
        for r in csv.DictReader(text): rows.append(r)
    except Exception as e: print("cut at", str(e)[:50])
print("puzzles read", len(rows))
random.seed(5); out = []; band = collections.defaultdict(list)
for r in rows:
    try: rt = int(r["Rating"]); pop = int(r["Popularity"]); dev = int(r["RatingDeviation"]); n = int(r["NbPlays"])
    except Exception: continue
    if pop >= 85 and dev <= 90 and n >= 500: band[rt // 100].append({"fen": r["FEN"], "moves": r["Moves"].split(), "rating": rt, "themes": r["Themes"].split()})
for b in sorted(band):
    random.shuffle(band[b]); out += band[b][:120]
mates = [p for p in out if any(t.startswith("mateIn") for t in p["themes"])]
json.dump(out, open("02_processed_data/chess_puzzles.json", "w"), separators=(",", ":"))
print("sample", len(out), "ratings", min(p["rating"] for p in out), "-", max(p["rating"] for p in out), "mate puzzles", len(mates), collections.Counter(t for p in out for t in p["themes"] if t.startswith("mateIn")))

"""Chess step 1: read the Lichess sample (first 250 MB of the January 2024 rated-games file) and keep what the model and quizzes need.
Output: 02_processed_data/chess_games.csv.gz  (white_elo, black_elo, result [1 / .5 / 0 for white], base, inc, speed, termination, plies, eco, opening)
Nothing is invented: games without both ratings (e.g. against the engine) are dropped."""
import io, re, sys, gzip, csv, zstandard, pathlib, collections
SRC = "01_data_chess/lichess_2024-01_first250MB.pgn.zst"
H = re.compile(r'^\[(\w+) "(.*)"\]$')
out = []; n = 0; cur = {}; moves = ""
def flush():
    global cur, moves
    if cur.get("Result") in ("1-0", "0-1", "1/2-1/2") and cur.get("WhiteElo", "?").isdigit() and cur.get("BlackElo", "?").isdigit() and cur.get("TimeControl", "-") != "-":
        tc = cur["TimeControl"].split("+")
        try: base, inc = int(tc[0]), int(tc[1]) if len(tc) > 1 else 0
        except ValueError: base = None
        if base is not None:
            ev = cur.get("Event", ""); speed = next((s for s in ("Bullet", "Blitz", "Rapid", "Classical", "Correspondence") if s in ev), "")
            plies = len(re.findall(r"\b\d+\.\s", moves)) * 2
            out.append((int(cur["WhiteElo"]), int(cur["BlackElo"]), {"1-0": 1, "0-1": 0, "1/2-1/2": 0.5}[cur["Result"]], base, inc, speed, cur.get("Termination", ""), plies, cur.get("ECO", ""), cur.get("Opening", "")))
    cur = {}; moves = ""
dctx = zstandard.ZstdDecompressor()
with open(SRC, "rb") as fh, dctx.stream_reader(fh) as rd:
    text = io.TextIOWrapper(rd, encoding="utf-8", errors="replace"); buf = ""
    try:
        for line in text:
            line = line.rstrip("\n")
            m = H.match(line)
            if m:
                if moves: flush(); n += 1
                cur[m.group(1)] = m.group(2)
            elif line and line[0] not in "[":
                moves = moves + " " + line if len(moves) < 400 else moves
    except Exception as e:                                  # the file was cut at 250 MB: the last game is simply dropped
        print("stopped at the cut:", str(e)[:60])
print("games read", n, "kept", len(out))
with gzip.open("02_processed_data/chess_games.csv.gz", "wt", newline="", encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(["welo", "belo", "res", "base", "inc", "speed", "term", "plies", "eco", "opening"]); w.writerows(out)
print(collections.Counter(o[5] for o in out).most_common(), collections.Counter(o[2] for o in out))

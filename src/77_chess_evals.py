"""Chess step 7: moves with REAL engine evaluations. About 5% of Lichess games carry Stockfish evals in their comments ([%eval 0.17]); I use those
(no evaluation is made up). Each move is classed by how much the mover's evaluation fell: blunder >= 300 centipawns, mistake 150-300, inaccuracy 70-150, fine < 25.
'Brilliant' moves are NOT included: they need multi-line engine analysis this data does not have. Output: chess_evals.json."""
import io, re, json, random, zstandard, collections
H = re.compile(r'^\[(\w+) "(.*)"\]$'); MV = re.compile(r"(\d+)\.(\.\.)?\s*([^\s{]+)\s*(?:\{([^}]*)\})?")
EV = re.compile(r"\[%eval (#?-?\d+\.?\d*)\]")
cand = collections.defaultdict(list); n_games = n_ev = 0; cur = {}; mv = []
def cp(v):
    if v.startswith("#"): return None
    return max(-1000, min(1000, int(round(float(v) * 100))))
def flush():
    global n_games, n_ev
    t = " ".join(mv)
    if "[%eval" not in t or not (cur.get("WhiteElo", "").isdigit() and cur.get("BlackElo", "").isdigit()): return
    n_ev += 1; sans = []; evs = []
    for m in MV.finditer(t):
        sans.append(m.group(3)); e = EV.search(m.group(4) or ""); evs.append(cp(e.group(1)) if e else None)
    if len(sans) < 24 or len(sans) > 140: return
    for i in range(12, min(len(sans), 100)):
        if evs[i] is None or evs[i - 1] is None: continue
        sign = 1 if i % 2 == 0 else -1                        # ply i is white's move when i is even (0-based)
        before, after = evs[i - 1] * sign, evs[i] * sign; loss = before - after
        if abs(before) > 600 or abs(after) > 900: continue
        cls = "blunder" if loss >= 300 else "mistake" if 150 <= loss < 300 else "inaccuracy" if 70 <= loss < 150 else "fine" if loss < 25 else None
        if cls: cand[cls].append({"moves": sans[:i + 1], "san": sans[i], "loss": int(loss), "cls": cls, "elo": (int(cur["WhiteElo"]) + int(cur["BlackElo"])) // 2})
with open("01_data_chess/lichess_2024-01_first250MB.pgn.zst", "rb") as fh, zstandard.ZstdDecompressor().stream_reader(fh) as rd:
    try:
        for line in io.TextIOWrapper(rd, encoding="utf-8", errors="replace"):
            line = line.rstrip("\n"); m = H.match(line)
            if m:
                if mv: flush(); cur = {}; mv = []; n_games += 1
                cur[m.group(1)] = m.group(2)
            elif line and line[0] != "[": mv.append(line)
    except Exception as e: print("cut", str(e)[:40])
print("games", n_games, "with evals", n_ev, {k: len(v) for k, v in cand.items()})
random.seed(9); out = []
for k, v in cand.items():
    random.shuffle(v); out += v[:500]
random.shuffle(out)
json.dump(out, open("02_processed_data/chess_evals.json", "w"), separators=(",", ":"))
print("shipped", len(out))

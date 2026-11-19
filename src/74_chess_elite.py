"""Chess step 4: elite games from Lichess broadcasts (official tournament feeds, CC0). Keeps only the biggest events:
World Championship matches, the Candidates, Tata Steel, Norway Chess, FIDE World Rapid and Blitz, and the Chess World Cup.
Output: 02_processed_data/chess_elite.json  [{event, round, date, white, black, we, be, result, moves(SAN list)}]"""
import io, re, glob, json, zstandard, collections, sys
KEYS = [("World Championship", re.compile(r"world (chess )?championship|fide world championship|wch\b", re.I)), ("Candidates", re.compile(r"candidates", re.I)), ("Tata Steel", re.compile(r"tata steel", re.I)), ("Norway Chess", re.compile(r"norway chess", re.I)),
        ("World Rapid & Blitz", re.compile(r"world (rapid|blitz)|rapid (and|&) blitz", re.I)), ("World Cup", re.compile(r"world cup", re.I))]
EXCL = re.compile(r"norway chess open|qualifier|toptienkamp|weekend|women|girls|junior|youth|u\d\d|senior|kids|team|olympiad|amateur|challengers|open [a-z]\b|rapid chess cup|speed chess|titled|\bfreestyle\b|fischer random|960", re.I)
H = re.compile(r'^\[(\w+) "(.*)"\]$'); games = []; names = collections.Counter()
def kind(ev):
    if re.search(r"norway chess open|qualifier|toptienkamp|weekend|team|knockout matche", ev, re.I): return None
    if EXCL.search(ev) and not re.search(r"candidates|world championship|world (rapid|blitz|cup)", ev, re.I): return None
    if re.search(r"women|girls|junior|youth", ev, re.I): return None
    for k, rx in KEYS:
        if rx.search(ev): return k
    return None
for f in sorted(glob.glob("01_data_chess/broadcast/*.pgn.zst")):
    cur = {}; mv = []
    def flush():
        global cur, mv
        k = kind(cur.get("Event", "") + " " + cur.get("StudyName", "") + " " + cur.get("ChapterName", ""))
        res = cur.get("Result")
        if k and res in ("1-0", "0-1", "1/2-1/2") and cur.get("WhiteElo", "").isdigit() and cur.get("BlackElo", "").isdigit():
            txt = " ".join(mv); txt = re.sub(r"\{[^}]*\}", " ", txt); txt = re.sub(r"\([^)]*\)", " ", txt); txt = re.sub(r"\$\d+", " ", txt); txt = re.sub(r"\d+\.(\.\.)?", " ", txt)
            sans = [t for t in txt.split() if t not in ("1-0", "0-1", "1/2-1/2", "*")]
            if len(sans) >= 20:
                games.append({"kind": k, "event": cur.get("Event", ""), "round": cur.get("Round", ""), "date": cur.get("UTCDate", cur.get("Date", "")).replace(".", "-"), "white": cur.get("White"), "black": cur.get("Black"), "we": int(cur["WhiteElo"]), "be": int(cur["BlackElo"]), "result": res, "moves": sans})
                names[(k, cur.get("Event", ""))] += 1
        cur = {}; mv = []
    with open(f, "rb") as fh, zstandard.ZstdDecompressor().stream_reader(fh) as rd:
        for line in io.TextIOWrapper(rd, encoding="utf-8", errors="replace"):
            line = line.rstrip("\n"); m = H.match(line)
            if m:
                if mv: flush()
                cur[m.group(1)] = m.group(2)
            elif line: mv.append(line)
        if mv: flush()
for (k, e), n in sorted(names.items()): print(f"{k:22s} {n:4d}  {e}")
# a game that appears in two months is kept once
seen = set(); out = []
for g in games:
    key = (g["white"], g["black"], g["date"], g["event"], g["round"])
    if key not in seen: seen.add(key); out.append(g)
json.dump(out, open("02_processed_data/chess_elite.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("elite games", len(out), "players", len({g["white"] for g in out} | {g["black"] for g in out}))

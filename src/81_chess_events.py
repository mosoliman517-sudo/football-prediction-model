"""Major 2026 tournaments for the chess Championships page: every game (with moves) from the Lichess broadcast API,
standings computed from the games with each event's own scoring, and FIDE profiles (photo, federation, title) for
players not already in src/79's ratings file. Writes 02_processed_data/chess_events.json for src/73_build_chess.py.

Scoring: "std" 1 / ½ / 0. "norway" (Norway Chess): a classical win is 3, a classical draw goes to Armageddon, whose
winner gets 1.5 and loser 1 (a drawn Armageddon counts as a Black win). Standings are by points only; official
tiebreaks are not applied, so equal points are shown as shared.
"""
import json
import os
import re
import time

import requests

H = {"User-Agent": "ballknowledge-build (student project)", "Accept": "application/json"}
EVENTS = [
    {"id": "cand26", "rounds": 14, "sec": "open", "name": "Candidates 2026", "short": "Candidates", "tours": ["BLA70Vds"], "scoring": "std", "fmt": "8-player double round robin. The winner plays for the world title."},
    {"id": "cand26w", "rounds": 14, "sec": "women", "name": "Women's Candidates 2026", "short": "Women's Candidates", "tours": ["xj4qM8Nw"], "scoring": "std", "fmt": "8-player double round robin. The winner plays for the women's world title."},
    {"id": "norway26", "rounds": 10, "sec": "open", "name": "Norway Chess 2026", "short": "Norway Chess", "tours": ["kDQUxYbE"], "scoring": "norway", "fmt": "6-player double round robin. Classical win 3 points; a draw goes to Armageddon (1.5 for its winner, 1 for the loser)."},
    {"id": "norway26w", "rounds": 10, "sec": "women", "name": "Norway Chess Women 2026", "short": "Norway Chess Women", "tours": ["NjcX8cBn"], "scoring": "norway", "fmt": "6-player double round robin. Classical win 3 points; a draw goes to Armageddon (1.5 for its winner, 1 for the loser)."},
    {"id": "tata26", "rounds": 13, "sec": "open", "name": "Tata Steel Masters 2026", "short": "Tata Steel", "tours": ["3COxSfdj"], "scoring": "std", "fmt": "14-player round robin in Wijk aan Zee."},
    {"id": "sinq26", "rounds": 9, "sec": "open", "name": "Sinquefield Cup 2026", "short": "Sinquefield Cup", "tours": ["2sMqschv"], "scoring": "std", "fmt": "10-player round robin, Grand Chess Tour."},
    {"id": "stlr26", "rounds": 9, "sec": "open", "name": "Saint Louis Rapid 2026", "short": "Saint Louis Rapid", "tours": ["sM3C0X6U"], "scoring": "std", "tc": "rapid", "fmt": "10-player rapid round robin, Grand Chess Tour. Shown 1 point a win here; the official combined table counts rapid double."},
    {"id": "stlb26", "rounds": 18, "sec": "open", "name": "Saint Louis Blitz 2026", "short": "Saint Louis Blitz", "tours": ["d63PvEma"], "scoring": "std", "tc": "blitz", "fmt": "10-player blitz double round robin, Grand Chess Tour."},
    {"id": "gs25", "sec": "open", "name": "Grand Swiss 2025", "short": "Grand Swiss", "tours": ["vSyxclHS"], "scoring": "std", "rounds": 11, "fmt": "11-round Swiss in Samarkand. The top two qualify for the Candidates."},
    {"id": "gs25w", "sec": "women", "name": "Women's Grand Swiss 2025", "short": "Women's Grand Swiss", "tours": ["NPYDsod4"], "scoring": "std", "rounds": 11, "fmt": "11-round Swiss in Samarkand. The top two qualify for the Women's Candidates."},
    {"id": "wc25", "sec": "open", "name": "World Cup 2025", "short": "World Cup", "tours": ["zb9ruNEJ", "4Zfj97D4", "25zoKzpI", "DqmmnYSq"], "scoring": "ko", "koWin": True, "fmt": "206-player knockout. Shown from the last 16: two classical games a round, then rapid and blitz tiebreaks if level."},
    {"id": "wc25w", "sec": "women", "name": "Women's World Cup 2025", "short": "Women's World Cup", "tours": ["wC1tDyqU", "ckxYpvoV", "D8vMwkm8", "OX9co2G6"], "scoring": "ko", "koWin": True, "fmt": "107-player knockout. Shown from the last 16: two classical games a round, then rapid and blitz tiebreaks if level."},
    {"id": "gctf26", "sec": "open", "name": "Grand Chess Tour Finals 2026", "short": "GCT Finals", "tours": ["8gvkBl7u", "e5GlrSdz"], "scoring": "ko", "fmt": "The tour's top four in knockout matches: semifinals, then the final."},
]


def get(url, js=True):
    for k in range(4):
        try:
            r = requests.get(url, headers=H, timeout=40); r.raise_for_status(); r.encoding = "utf-8"
            return r.json() if js else r.text
        except Exception as e:
            print("  retry", url, e); time.sleep(5 * (k + 1))
    raise SystemExit("failed: " + url)


def tc_kind(tc, default):
    """Time control as written by the broadcast: "40/7200:0+10", "600+0", free text in minutes, or nothing."""
    t = (tc or "").lower()
    if not t or t == "-":
        return default
    if t.startswith("600+0"):
        return "armageddon"
    m = re.search(r"(\d+)\s*min", t)
    secs = int(m.group(1)) * 60 if m else int((re.findall(r"(\d+)", t.split(":")[-1].split("/")[-1]) or [0])[0])
    if not m and 0 < secs < 180:   # "25+10", "5+2": minutes, not seconds
        secs *= 60
    return "classical" if "/" in t or secs >= 3600 else "rapid" if secs >= 600 else "blitz"


def parse(pgn, stage, default="classical"):
    out = []
    for g in re.split(r"\n\n(?=\[Event )", pgn.strip()):
        h = dict(re.findall(r'^\[(\w+) "(.*)"\]$', g, re.M))
        if not h.get("WhiteFideId") or not h.get("BlackFideId"):
            continue
        body = g.split("\n\n", 1)[1] if "\n\n" in g else ""
        moves = " ".join(re.sub(r"\d+\.\.\.", "", re.sub(r"\{[^}]*\}", "", body)).split())
        kind = "armageddon" if "armageddon" in (h.get("Round", "") + h.get("Event", "")).lower() else tc_kind(h.get("TimeControl", ""), default)
        out.append({"w": h["WhiteFideId"], "b": h["BlackFideId"], "we": int(h.get("WhiteElo") or 0), "be": int(h.get("BlackElo") or 0), "r": h.get("Result", "*"),
                    "rd": h.get("Round", "").split(".")[0], "bd": int(h.get("Board", "0") or 0), "tc": kind, "d": h.get("UTCDate", "").replace(".", "-"), "site": h.get("Site", ""), "st": stage, "m": moves})
    return out


def standings(games, scoring):
    pts, rec = {}, {}
    def add(p, v, r):
        pts[p] = pts.get(p, 0) + v
        x = rec.setdefault(p, {"W": 0, "D": 0, "L": 0}); x[r] += 1
    if scoring == "norway":
        arm = {(g["rd"], frozenset((g["w"], g["b"]))): g for g in games if g["tc"] == "armageddon"}
        for g in games:
            if g["tc"] != "classical" or g["r"] == "*" or g["st"] == "Playoff":
                continue
            if g["r"] == "1-0": add(g["w"], 3, "W"); add(g["b"], 0, "L")
            elif g["r"] == "0-1": add(g["b"], 3, "W"); add(g["w"], 0, "L")
            else:
                add(g["w"], 0, "D"); add(g["b"], 0, "D")
                a = arm.get((g["rd"], frozenset((g["w"], g["b"]))))
                if a and a["r"] != "*":
                    win = a["w"] if a["r"] == "1-0" else a["b"]
                    pts[win] += 1.5; pts[a["b"] if win == a["w"] else a["w"]] += 1
    else:
        main = max({g["tc"] for g in games}, key=lambda k: sum(g["tc"] == k for g in games))   # the event's own time control; playoffs in another one do not count
        for g in games:
            if g["r"] == "*" or g["tc"] != main or g["st"] == "Playoff":
                continue
            if g["r"] == "1/2-1/2": add(g["w"], 0.5, "D"); add(g["b"], 0.5, "D")
            else:
                win, lose = (g["w"], g["b"]) if g["r"] == "1-0" else (g["b"], g["w"])
                add(win, 1, "W"); add(lose, 0, "L")
    return sorted(([p, pts[p], rec[p]["W"], rec[p]["D"], rec[p]["L"]] for p in pts), key=lambda x: -x[1])


known = json.load(open("02_processed_data/chess_ratings.json", encoding="utf-8"))["players"] if os.path.exists("02_processed_data/chess_ratings.json") else {}
known.update(json.load(open("02_processed_data/chess_champ.json", encoding="utf-8"))["players"] if os.path.exists("02_processed_data/chess_champ.json") else {})
players, out = {}, []
for ev in EVENTS:
    games, dates = [], []
    for k, tid in enumerate(ev["tours"]):
        info = get(f"https://lichess.org/api/broadcast/{tid}")
        dates += [d for d in (info["tour"].get("dates") or []) if d]
        stage = info["tour"]["name"].split("|")[-1].strip() if len(ev["tours"]) > 1 else ""
        # one request per broadcast round: the round's name ("Round 4 | Armageddon", "Playoff") is the reliable label;
        # the PGN's own Round and TimeControl headers are sometimes the broadcast index or missing
        for rnd in info.get("rounds", []):
            nm = rnd["name"]; low = nm.lower()
            gs = parse(get(f"https://lichess.org/api/broadcast/round/{rnd['id']}.pgn", js=False), stage, ev.get("tc", "classical"))
            num = re.search(r"(\d+)", nm)
            for g in gs:
                if "armageddon" in low:
                    g["tc"] = "armageddon"
                elif "blitz" in low or "rapid" in low or "classical" in low:
                    g["tc"] = "blitz" if "blitz" in low else "rapid" if "rapid" in low else "classical"
                g["rd"] = num.group(1) if num else nm
                if any(w in low for w in ("playoff", "tiebreak", "tie-break", "tie break")) or (ev.get("rounds") and num and int(num.group(1)) > ev["rounds"]):
                    if ev["scoring"] == "ko":
                        g["rd"] = nm.split("|")[-1].strip()   # a knockout's tiebreaks stay with their own stage
                    else:
                        g["st"] = "Playoff"; g["rd"] = nm.split("|")[-1].strip()
            games += gs
            time.sleep(0.5)
    played = [g for g in games if g["r"] != "*"]
    table = standings(games, ev["scoring"]) if ev["scoring"] != "ko" else []
    site = next((g["site"] for g in games if g["site"]), "")
    gd = sorted(time.strftime("%Y-%m-%d", time.gmtime(d / 1000)) for d in dates) or sorted(g["d"] for g in games if g["d"])   # the broadcast's own dates; some games carry no date
    for g in games:
        g.pop("site", None)
    ev2 = {**ev, "site": site, "from": gd[0] if gd else None, "to": gd[-1] if gd else None, "done": bool(games) and len(played) == len(games), "games": games, "table": table}
    out.append(ev2)
    for g in games:
        for p in (g["w"], g["b"]):
            players.setdefault(p, None)
    lead = table[0] if table else None
    print(f"{ev['name']}: {len(games)} games ({len(played)} finished), {site}, {ev2['from']}..{ev2['to']}" + (f", top: {lead[0]} {lead[1]}" if lead else ""))

need = [p for p in players if p not in known]
print(len(players), "players,", len(need), "new profiles to fetch")
for fid in need:
    p = get(f"https://lichess.org/api/fide/player/{fid}"); time.sleep(0.4)
    ph = p.get("photo") or {}
    players[fid] = {"n": p.get("name"), "fed": p.get("federation"), "t": p.get("title"), "y": p.get("year"), "g": p.get("gender"), "std": p.get("standard"), "rap": p.get("rapid"), "blz": p.get("blitz"),
                    "img": ph.get("medium"), "sm": ph.get("small"), "cr": ph.get("credit")}
json.dump({"asOf": time.strftime("%Y-%m-%d"), "events": out, "players": {k: v for k, v in players.items() if v}}, open("02_processed_data/chess_events.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("-> 02_processed_data/chess_events.json")

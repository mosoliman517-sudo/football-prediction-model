"""
Fetches the starting elevens of the European Cup / Champions League finals from 2000 to 2013 from Wikipedia (the lineup tables on each final's page, which cite
UEFA's own match sheets; Wikipedia text is CC BY-SA), because the Transfermarkt lineup files only start in July 2013. Output: 02_processed_data/xi_old.json, same shape as
xi.json (player id is null because these players are not matched to Transfermarkt).
A final is kept ONLY if both teams parse to exactly eleven starters with positions we recognise; everything else is skipped and printed, never filled in by hand.
Run from the project root:  python3 src/51_fetch_old_finals.py
"""
import json
import re
import subprocess
import time

POS = {"GK": "Goalkeeper", "RB": "Right-Back", "RWB": "Right-Back", "LB": "Left-Back", "LWB": "Left-Back", "CB": "Centre-Back", "DF": "Centre-Back", "SW": "Centre-Back", "RCB": "Centre-Back",
       "LCB": "Centre-Back", "DM": "Defensive Midfield", "CDM": "Defensive Midfield", "CM": "Central Midfield", "MF": "Central Midfield", "RCM": "Central Midfield", "LCM": "Central Midfield",
       "RM": "Right Midfield", "LM": "Left Midfield", "AM": "Attacking Midfield", "CAM": "Attacking Midfield", "RW": "Right Winger", "LW": "Left Winger", "CF": "Centre-Forward",
       "FW": "Centre-Forward", "ST": "Centre-Forward", "RF": "Centre-Forward", "LF": "Centre-Forward", "SS": "Second Striker"}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
ROW = re.compile(r"^\|\s*([A-Z]{1,3})\s*\|\|\s*'''\s*(\d+)\s*'''\s*\|\|(.*)$")


def wiki(title):
    import os
    cache = f"/tmp/wp_cache/{title}.txt"
    if os.path.exists(cache):
        return open(cache, encoding="utf-8").read()
    for attempt in range(6):
        out = subprocess.run(["curl", "-s", "-m", "60", "-H", "User-Agent: ballknowledge-student-project/1.0 (educational)", f"https://en.wikipedia.org/w/api.php?action=parse&page={title}&prop=wikitext&format=json&formatversion=2"], capture_output=True, text=True).stdout
        try:
            t = json.loads(out)["parse"]["wikitext"]
            os.makedirs("/tmp/wp_cache", exist_ok=True)
            open(cache, "w", encoding="utf-8").write(t)
            time.sleep(1.5)
            return t
        except Exception:
            if "too many requests" in out.lower():
                time.sleep(40 * (attempt + 1))
            else:
                return None
    return None


def name_of(cell):
    m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", cell)
    if not m:
        return None
    return re.sub(r"\s*\(.*\)$", "", (m.group(2) or m.group(1))).strip()


def label(s):
    m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", s)
    return re.sub(r"\s*\(.*\)$", "", (m.group(2) or m.group(1))).strip() if m else None


def parse(t):
    low = t.lower()
    starts = sorted(m.start() for m in re.finditer(r"\{\{(football box|infobox football match)", low))
    for st in starts:
        r = parse_at(t, st)
        if r:
            return r
    return None


def parse_at(t, i):
    box = t[i:i + 6000]
    f = lambda k: (re.search(r"\|\s*" + k + r"\s*=\s*(.*)", box) or [None, ""])[1].strip()
    d = re.search(r"\{\{Start date\|(\d{4})\|(\d+)\|(\d+)", box)
    if not d:                                          # older pages write the date as plain text, "23 May 1990"
        dm = re.search(r"\|\s*date\s*=\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", box)
        if dm and dm.group(2)[:3].title() in MONTHS:
            d = type("D", (), {"group": lambda self, k, g=(dm.group(3), str(MONTHS.index(dm.group(2)[:3].title()) + 1), dm.group(1)): g[k - 1]})()
    sc = re.search(r"(\d+)\s*[–-]\s*(\d+)", f("score"))
    if not d or not sc:
        return None
    ps = re.search(r"(\d+)\s*[–-]\s*(\d+)", f("penaltyscore"))
    hg, ag = int(sc.group(1)), int(sc.group(2))
    teams = [label(f("team1")), label(f("team2"))]
    rows = [[], []]
    side, subs = 0, False
    for ln in t[i:].splitlines():
        m = ROW.match(ln)
        if m and not subs:
            rows[side].append((m.group(1), m.group(2), name_of(m.group(3)), "(c)" in m.group(3) or "|c]]" in m.group(3)))
            if len(rows[side]) == 11:
                subs = True                              # the eleven are complete; later rows are substitutes
        if subs and (("Manager" in ln) or (side == 0 and ("valign" in ln or "{|" in ln))):   # end of a team's table, or the start of the second one
            if side == 0:
                side, subs = 1, False
            else:
                break
    if any(len(r) != 11 for r in rows) or any(p[0] not in POS or not p[2] for r in rows for p in r) or not all(teams):
        return None
    return {"date": f"{d.group(1)}-{int(d.group(2)):02d}-{int(d.group(3)):02d}", "hg": hg, "ag": ag, "pens": [int(ps.group(1)), int(ps.group(2))] if ps else None, "teams": teams, "rows": rows}


def main():
    out, skipped = [], []
    for y in range(2000, 2014):                          # the owner wants nothing older than 2000
        title = f"{y}_European_Cup_final" if y < 1993 else f"{y}_UEFA_Champions_League_final"
        t = wiki(title)
        r = parse(t) if t else None
        if not r:
            skipped.append(y)
            continue
        if int(r["date"][:4]) != y:                    # the date must fall in the final's own year, otherwise we parsed the wrong match box
            skipped.append(y)
            continue
        win = 0 if r["hg"] > r["ag"] else 1 if r["ag"] > r["hg"] else (0 if r["pens"] and r["pens"][0] > r["pens"][1] else 1 if r["pens"] else None)
        if win is None:                                    # a drawn final settled in a replay (1974): the replay's lineups are not parsed, so skip it
            skipped.append(y)
            continue
        out.append({"k": "final", "t": "European Cup final" if y < 1993 else "Champions League final", "comp": "European Cup" if y < 1993 else "Champions League", "season": y - 1 if True else y, "date": r["date"], "hg": r["hg"], "ag": r["ag"], "src": "Wikipedia",
                    "teams": [{"club": r["teams"][s], "won": win == s, "xi": [{"id": None, "n": p[2], "pos": POS[p[0]], "num": p[1], "cap": 1 if p[3] else 0} for p in r["rows"][s]]} for s in (0, 1)]})
    json.dump(out, open("02_processed_data/xi_old.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(len(out), "finals parsed; skipped (no clean eleven per side):", skipped)


if __name__ == "__main__":
    main()

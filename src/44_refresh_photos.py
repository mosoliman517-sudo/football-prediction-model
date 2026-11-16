"""
Picks the newest available portrait for every quiz player and writes docs/data/photos.json (the page loads this file when it opens, so photos can be
refreshed without rebuilding the site; .github/workflows/weekly_refresh.yml runs this every week).

Sources, newest first:
  fpl   the Premier League's official photo from the fantasy game feed (current season; Premier League players only)
  cm    Wikimedia Commons photo, dated by the date in its file name (only when the name carries one)
  tm    Transfermarkt's portrait, dated by the timestamp inside its file name (the 'big' 300 x 390 size)
  ea    EA SPORTS FC portrait (FC25, about July 2024), from src/41
Wikimedia Commons / TheSportsDB photos (src/37, src/38) are older still and stay as last-resort fallbacks inside the page.
Output: {"v": date, "p": {transfermarkt id: [url, source, "YYYY-MM"]}}.   Run from the project root:  python3 src/44_refresh_photos.py
"""
import json
import re
import unicodedata
from datetime import datetime, timezone

import pandas as pd
import requests

HEAD = {"User-Agent": "Mozilla/5.0 ballknowledge-student-project"}


def norm(s):
    s = str(s).translate(str.maketrans({"ø": "o", "Ø": "O", "æ": "ae", "ð": "d", "ł": "l", "đ": "d", "ß": "ss"}))
    return re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower())


def main():
    q = json.load(open("02_processed_data/quiz_data.json", encoding="utf-8"))["players"]
    tm = pd.read_csv("01_data_market_value/players.csv", usecols=["player_id", "image_url"]).set_index("player_id")["image_url"].to_dict()
    now = datetime.now(timezone.utc)
    cand = {p["id"]: [] for p in q}
    for p in q:                                                            # EA (FC25)
        if p.get("ea"):
            cand[p["id"]].append((datetime(2024, 7, 1, tzinfo=timezone.utc), "ea", f"https://ratings-images-prod.pulse.ea.com/FC25/full/player-portraits/p{p['ea']}.png"))
    for p in q:                                                            # Transfermarkt, dated by the timestamp in the file name
        u = tm.get(p["id"])
        m = re.search(r"/portrait/\w+/(\d+)-(\d{9,10})\.", u or "")
        if m:
            cand[p["id"]].append((datetime.fromtimestamp(int(m.group(2)), timezone.utc), "tm", u.replace("/portrait/header/", "/portrait/big/")))
    months = {m: i + 1 for i, m in enumerate("January February March April May June July August September October November December".split())}
    for p in q:                                                            # Wikimedia Commons, dated by the date in the file name (many recent national-team photos are named that way)
        fn = p.get("im")
        if not fn:
            continue
        m = re.search(r"(\d{1,2})\s+(" + "|".join(months) + r")\s+(20\d\d)", fn) or re.search(r"(20\d\d)", fn)
        if not m:
            continue
        yr = int(m.group(m.lastindex if m.lastindex == 3 else 1)); mo = months[m.group(2)] if m.lastindex == 3 else 6
        cand[p["id"]].append((datetime(yr, mo, 15, tzinfo=timezone.utc), "cm", "https://commons.wikimedia.org/wiki/Special:FilePath/" + requests.utils.quote(fn) + "?width=500"))
    try:                                                                   # Premier League official photos (current season)
        d = requests.get("https://fantasy.premierleague.com/api/bootstrap-static/", headers=HEAD, timeout=60).json()
        teams = {t["id"]: norm(t["name"]) for t in d["teams"]}
        pl = {}
        for e in d["elements"]:
            for nm in (norm(f"{e['first_name']} {e['second_name']}"), norm(e["web_name"])):
                pl.setdefault(nm, []).append(e)
        n = 0
        for p in q:
            if p.get("comp") != "GB1" and not any(c in ("E0",) for c in []):
                pass
            rows = pl.get(norm(p["n"])) or []
            if len(rows) > 1:
                rows = [e for e in rows if teams[e["team"]] in norm(p.get("club", "")) or norm(p.get("club", "")) in teams[e["team"]]] or rows[:1]
            if rows and rows[0].get("photo"):
                code = rows[0]["photo"].split(".")[0]
                cand[p["id"]].append((now, "fpl", f"https://resources.premierleague.com/premierleague/photos/players/250x250/p{code}.png")); n += 1
        print(f"Premier League official photos matched: {n}")
    except (requests.RequestException, KeyError, ValueError) as err:
        print("fantasy feed unavailable:", err)
    out, stats = {}, {}
    for pid, c in cand.items():
        if c:
            dt, src, url = max(c, key=lambda x: x[0]); out[str(pid)] = [url, src, dt.strftime("%Y-%m")]; stats[src] = stats.get(src, 0) + 1
    json.dump({"v": now.strftime("%Y-%m-%d"), "p": out}, open("docs/data/photos.json", "w", encoding="utf-8"), separators=(",", ":"))
    print("chosen sources:", stats, "of", len(q), "players")


if __name__ == "__main__":
    main()

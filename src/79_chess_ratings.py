"""World rankings for the chess page: the official FIDE top-100 lists (open and women; classical, rapid and blitz),
each listed player's FIDE rating history (standard, rapid, blitz by month) and world rank, plus their photo, title and
federation from Lichess's FIDE player API. Writes 02_processed_data/chess_ratings.json for src/73_build_chess.py.

Sources: ratings.fide.com (top lists and the rating-history chart data behind each FIDE profile) and lichess.org/api/fide.
Both are public; requests are spaced out. Re-run monthly when FIDE publishes a new list.
"""
import json
import re
import time

import requests

H = {"User-Agent": "Mozilla/5.0 (ballknowledge build; student project)"}
LISTS = {"open": "open", "women": "women", "open_rapid": "open_rapid", "open_blitz": "open_blitz", "women_rapid": "women_rapid", "women_blitz": "women_blitz"}


def get(url, post=False, js=False):
    for k in range(4):
        try:
            r = (requests.post if post else requests.get)(url, headers={**H, "X-Requested-With": "XMLHttpRequest"} if post else H, timeout=30)
            if r.status_code == 404:
                return None
            r.raise_for_status(); r.encoding = "utf-8"
            return json.loads(r.text.lstrip("﻿")) if js else r.text
        except Exception as e:
            print("  retry", url, e); time.sleep(4 * (k + 1))
    return None


lists, title = {}, ""
for key, l in LISTS.items():
    t = get("https://ratings.fide.com/a_top.php?list=" + l)
    if not t:
        print("no list", l); continue
    title = title or re.search(r"Top 100 [^<]*?(\w+ \d{4})", t).group(1)
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S):
        m = re.search(r"profile/(\d+)", tr)
        cells = [re.sub(r"<[^>]+>|&nbsp;", " ", c).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if m and len(cells) >= 5:
            rows.append({"id": m.group(1), "rk": int(cells[0]), "n": cells[1], "fed": cells[2], "r": int(cells[3]), "y": int(cells[4]) if cells[4].isdigit() else None})
    lists[key] = rows
    print(f"{key}: {len(rows)} players, #1 {rows[0]['n']} {rows[0]['r']}")
    time.sleep(1)

ids = list(dict.fromkeys(r["id"] for rows in lists.values() for r in rows))
print(len(ids), "players in all lists")
players = {}
for i, fid in enumerate(ids):
    p = get(f"https://lichess.org/api/fide/player/{fid}", js=True) or {}
    time.sleep(0.35)
    hist = get(f"https://ratings.fide.com/a_chart_data.phtml?event={fid}&period=0", post=True, js=True) or []
    time.sleep(0.6)
    # months as "YYYY-MM"; keep every month of the last 3 years and every 3rd month before, to keep the page small
    mon = {m: k for k, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
    pts = []
    for h in hist:
        y, m = h["date_2"].split("-"); d = f"{y}-{mon[m]:02d}"
        num = lambda v: int(v) if v and str(v).isdigit() and int(v) > 0 else None
        pts.append([d, num(h.get("rating")), num(h.get("rapid_rtng")), num(h.get("blitz_rtng"))])
    pts.sort()
    keep = [x for k, x in enumerate(pts) if x[0] >= "2023-11" or k % 3 == 0 or k == len(pts) - 1]
    std = [x for x in pts if x[1]]
    peak = max(std, key=lambda x: x[1]) if std else None
    row = next((r for rows in lists.values() for r in rows if r["id"] == fid), {})
    photo = p.get("photo") or {}
    players[fid] = {"n": p.get("name") or row.get("n"), "fed": p.get("federation") or row.get("fed"), "t": p.get("title"), "y": p.get("year") or row.get("y"), "g": p.get("gender"),
                    "std": p.get("standard"), "rap": p.get("rapid"), "blz": p.get("blitz"), "img": photo.get("medium"), "sm": photo.get("small"), "cr": photo.get("credit"),
                    "peak": peak[1] if peak else None, "peakAt": peak[0] if peak else None, "h": keep}
    if i % 25 == 0:
        print(f"  {i + 1}/{len(ids)} {players[fid]['n']}: {len(pts)} months, peak {players[fid]['peak']}")

out = {"list": title, "asOf": time.strftime("%Y-%m-%d"), "lists": {k: [[r["rk"], r["id"], r["r"]] for r in v] for k, v in lists.items()}, "players": players}
json.dump(out, open("02_processed_data/chess_ratings.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"FIDE {title}: {len(players)} players -> 02_processed_data/chess_ratings.json")

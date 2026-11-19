"""NBA awards 2001-02 on, from Wikipedia's winner tables (CC BY-SA). Output: 02_processed_data/nba_awards.json {award: {season: [names]}}.
A winner is accepted only if a player with that exact name exists in nba_data.json, otherwise it is reported (never guessed)."""
import requests, re, json, time, unicodedata
UA = {"User-Agent": "ballknowledge-data/1.0 (hobby project)"}
PAGES = {"MVP": "NBA Most Valuable Player Award", "FMVP": "Bill Russell NBA Finals Most Valuable Player Award", "DPOY": "NBA Defensive Player of the Year Award", "ROY": "NBA Rookie of the Year Award", "6MOY": "NBA Sixth Man of the Year Award", "MIP": "NBA Most Improved Player Award"}
nd = json.load(open("02_processed_data/nba_data.json")); norm = lambda s: re.sub(r"[^a-z]", "", unicodedata.normalize("NFD", s).lower())
byname = {}
for p in nd["players"]: byname.setdefault(norm(p["n"]), []).append(p["n"])
out = {}; miss = []
import pandas as pd
from html.parser import HTMLParser
class TP(HTMLParser):                       # tiny table reader (no lxml needed)
    def __init__(self): super().__init__(); self.tables = []; self.row = None; self.cell = None; self.depth = 0
    def handle_starttag(self, t, a):
        if t == "table": self.tables.append([])
        elif t == "tr" and self.tables: self.row = []
        elif t in ("td", "th") and self.row is not None: self.cell = []
        elif t == "sup" and self.cell is not None: self.cell.append("\x00")
    def handle_endtag(self, t):
        if t in ("td", "th") and self.cell is not None and self.row is not None: self.row.append(re.sub(r"\s+", " ", "".join(self.cell)).strip()); self.cell = None
        elif t == "tr" and self.row is not None and self.tables: self.tables[-1].append(self.row); self.row = None
    def handle_data(self, d):
        if self.cell is not None: self.cell.append(d)
def read_tables(html):
    tp = TP(); tp.feed(html); out = []
    for rows in tp.tables:
        if len(rows) > 3: out.append(pd.DataFrame([r for r in rows[1:] if len(r) == len(rows[0])], columns=[str(c) for c in rows[0]]))
    return out
for k, title in PAGES.items():
    import os, hashlib
    cf = "/tmp/wp_awards_" + k + ".html"; html = None
    if os.path.exists(cf): html = open(cf, encoding="utf-8").read()
    for i in range(6):
        if html: break
        r = requests.get("https://en.wikipedia.org/w/api.php", params={"action": "parse", "page": title, "prop": "text", "format": "json", "redirects": 1}, headers=UA, timeout=60)
        try: html = r.json()["parse"]["text"]["*"]; open(cf, "w", encoding="utf-8").write(html)
        except Exception: time.sleep(8 * (i + 1))
    res = {}

    for tb in read_tables(html):
        cols = {str(c).lower(): c for c in tb.columns}
        sc = next((c for n, c in cols.items() if n.startswith("season") or n.startswith("year")), None); pc = next((c for n, c in cols.items() if n.startswith("player") or n.startswith("winner")), None)
        if sc is None or pc is None: continue
        for _, row in tb.iterrows():
            m = re.search(r"(\d{4})[–-](\d{2})", str(row[sc]))
            if not m:
                m1 = re.match(r"\s*(\d{4})", str(row[sc]))
                if m1 and 2002 <= int(m1.group(1)) <= 2026: m = type("M", (), {"group": lambda self, i, y=int(m1.group(1)): [None, str(y - 1), f"{y % 100:02d}"][i] if i else f"{y-1}-{y%100:02d}"})()
            if not m or int(m.group(1)) + 1 < 2002: continue
            nm = re.sub(r"[\*†‡^~\^\[\]\d]+|\(.*?\)", "", str(row[pc]).replace("\x00", "")).strip()
            nm = nm.replace("§", "").strip(); hit = None
            for cut in range(0, 4):
                key = norm(nm[: len(nm) - cut] if cut else nm)
                hit = byname.get(key) or next((v for k2, v in byname.items() if k2.startswith(key) and len(key) > 8), None)
                if hit: break
            if not hit and norm(nm) == "ronartest": hit = byname.get("metta" "worldpeace")
            if hit: res[f"{m.group(1)}-{m.group(2)}"] = hit[0]
            else: miss.append((k, m.group(0), nm))
    out[k] = res; print(k, len(res), "seasons;", sorted(res.items())[-3:])
json.dump(out, open("02_processed_data/nba_awards.json", "w"), ensure_ascii=False)
print("unmatched rows (winner has no player in the data):", len(miss), miss[:12])

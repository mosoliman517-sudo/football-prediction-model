"""
Checks the quiz data (02_processed_data/quiz_data.json) against facts that are certain, so a wrong category answer in Football tic-tac-toe is caught
before it ships. Each line is (player, field, expectation). Run from the project root:  python3 src/46_audit_quiz_data.py
Exit code 1 if anything fails. Add a line whenever a bad answer is reported.
"""
import json
import sys
import unicodedata


def n(s):
    return "".join(c for c in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(c)).lower()


Q = json.load(open("02_processed_data/quiz_data.json", encoding="utf-8"))
P = {n(p["n"]): p for p in Q["players"]}
ID = {p["id"]: p for p in Q["players"]}

# (player, kind, value, should_be_true)
FACTS = [
    ("Erling Haaland", "nat", "Norway", 1), ("Kylian Mbappé", "nat", "France", 1), ("Mohamed Salah", "nat", "Egypt", 1), ("Harry Kane", "nat", "England", 1),
    ("Robert Lewandowski", "nat", "Poland", 1), ("Luka Modrić", "nat", "Croatia", 1), ("Kevin De Bruyne", "nat", "Belgium", 1), ("Gonçalo Ramos", "nat", "Portugal", 1),
    ("Gonçalo Ramos", "club", "Milan", 1), ("Gonçalo Ramos", "played", "Benfica", 1), ("Gonçalo Ramos", "played", "PSG", 1), ("Gonçalo Ramos", "played", "Arsenal", 0),
    ("Erling Haaland", "played", "Dortmund", 1), ("Erling Haaland", "played", "Salzburg", 1), ("Erling Haaland", "played", "Man City", 1), ("Erling Haaland", "played", "Liverpool", 0),
    ("Mohamed Salah", "played", "Chelsea", 1), ("Mohamed Salah", "played", "Roma", 1), ("Mohamed Salah", "played", "Fiorentina", 1), ("Mohamed Salah", "played", "Arsenal", 0),
    ("Harry Kane", "played", "Tottenham", 1), ("Harry Kane", "played", "Bayern", 1), ("Harry Kane", "played", "Arsenal", 0),
    ("Kylian Mbappé", "played", "Monaco", 1), ("Kylian Mbappé", "played", "PSG", 1), ("Kylian Mbappé", "played", "Real Madrid", 1), ("Kylian Mbappé", "played", "Barcelona", 0),
    ("Robert Lewandowski", "played", "Dortmund", 1), ("Robert Lewandowski", "played", "Bayern", 1), ("Robert Lewandowski", "played", "Barcelona", 1), ("Robert Lewandowski", "played", "Real Madrid", 0),
    ("Cristiano Ronaldo", "played", "Sporting", 1), ("Cristiano Ronaldo", "played", "Man Utd", 1), ("Cristiano Ronaldo", "played", "Real Madrid", 1), ("Cristiano Ronaldo", "played", "Juventus", 1), ("Cristiano Ronaldo", "played", "Barcelona", 0),
    ("Lionel Messi", "played", "Barcelona", 1), ("Lionel Messi", "played", "PSG", 1), ("Lionel Messi", "played", "Real Madrid", 0),
    ("Neymar", "played", "Barcelona", 1), ("Neymar", "played", "PSG", 1), ("Neymar", "played", "Santos", 1),
    # league titles (2017-18 on)
    ("Erling Haaland", "ti", "E0", 1), ("Harry Kane", "ti", "D1", 1), ("Harry Kane", "ti", "E0", 0), ("Mohamed Salah", "ti", "E0", 1), ("Kylian Mbappé", "ti", "F1", 1),
    ("Robert Lewandowski", "ti", "D1", 1), ("Robert Lewandowski", "ti", "SP1", 1), ("Cristiano Ronaldo", "ti", "I1", 1), ("Lionel Messi", "ti", "F1", 1), ("Neymar", "ti", "F1", 1),
    ("Vinicius Junior", "ti", "SP1", 1), ("Vinicius Junior", "ti", "E0", 0),
    # cups and Europe (2016-17 on)
    ("Mohamed Salah", "hn", "UCL", 1), ("Mohamed Salah", "hn", "FAC", 1), ("Mohamed Salah", "hn", "EFL", 1), ("Erling Haaland", "hn", "UCL", 1), ("Kevin De Bruyne", "hn", "UCL", 1),
    ("Luka Modrić", "hn", "UCL", 1), ("Harry Kane", "hn", "UCL", 0), ("Kylian Mbappé", "hn", "UCL", 0), ("Harry Kane", "hn", "FAC", 0),
    # awards (all time) and tournaments
    ("Lionel Messi", "aw", "BDO", 1), ("Luka Modrić", "aw", "BDO", 1), ("Cristiano Ronaldo", "aw", "BDO", 1), ("Karim Benzema", "aw", "BDO", 1), ("Rodri", "aw", "BDO", 1),
    ("Kylian Mbappé", "aw", "BDO", 0), ("Erling Haaland", "aw", "BDO", 0), ("Mohamed Salah", "aw", "PFA", 1),
    ("Robert Lewandowski", "aw", "GS", 1),
    ("Kylian Mbappé", "tn", "WC18", 1), ("Luka Modrić", "tn", "WC18", 1), ("Harry Kane", "tn", "WC18", 1), ("Erling Haaland", "tn", "WC18", 0), ("Cristiano Ronaldo", "tn", "EU16", 1),
    ("Lionel Messi", "tn", "EU16", 0), 
 ("Erling Haaland", "mate", "Kevin De Bruyne", 1), ("Erling Haaland", "mate", "Mohamed Salah", 0),
    ("Kylian Mbappé", "mate", "Erling Haaland", 0), ("Mohamed Salah", "mate", "Sadio Mané", 1),
    # body and position
    ("Erling Haaland", "pos", "Attack", 1), ("Kevin De Bruyne", "pos", "Midfield", 1), ("Thibaut Courtois", "pos", "Goalkeeper", 1), ("Virgil van Dijk", "pos", "Defender", 1),
    ("Lionel Messi", "foot", "left", 1), ("Erling Haaland", "foot", "left", 1), ("Cristiano Ronaldo", "foot", "right", 1),
]


def played(p, club):
    k = n(club)
    return any(k in n(h) for h in p["hist"] + [p["club"]])


bad, missing = [], set()
for name, kind, val, want in FACTS:
    p = P.get(n(name))
    if not p:
        missing.add(name)
        continue
    if kind == "nat":
        got = p["nat"] == val
    elif kind == "club":
        got = n(val) in n(p["club"])
    elif kind == "played":
        got = played(p, val)
    elif kind in ("ti", "hn", "aw", "tn"):
        got = val in (p.get(kind) or [])
    elif kind == "mg":
        got = any(n(val) in n(m) for m in (p.get("mg") or []))
    elif kind == "mate":
        o = P.get(n(val))
        got = bool(o) and o["id"] in (p.get("tm") or [])
        if not o:
            missing.add(val)
            continue
    elif kind == "pos":
        got = p["pos"] == val
    elif kind == "foot":
        got = p["foot"] == val
    if bool(got) != bool(want):
        bad.append((name, kind, val, "should be " + ("true" if want else "false")))
print(f"{len(FACTS)} facts, {len(missing)} players not in the data ({', '.join(sorted(missing))})")
for b in bad:
    print("  WRONG:", *b)
print("all good" if not bad else f"{len(bad)} wrong")
sys.exit(1 if bad else 0)

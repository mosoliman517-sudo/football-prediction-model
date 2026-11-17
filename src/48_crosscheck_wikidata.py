"""
Independent check of the club histories in quiz_data.json against Wikidata (a different source from Transfermarkt), for a random sample of players.
For every sampled player it compares the set of Big 5 clubs he played for in our data (transfers plus match appearances) with the Big 5 clubs Wikidata lists
(any "member of sports team" row, past or present). Prints how often they agree, and the disagreements: "only Wikidata" are possible missing clubs on our side
(a correct answer we would reject), "only ours" are clubs Wikidata lacks or we have wrong. Run:  python3 src/48_crosscheck_wikidata.py [sample size] [seed]
"""
import importlib
import json
import random
import sys
import difflib

import pandas as pd

sys.path.insert(0, "src")
m34 = importlib.import_module("34_build_quiz_data")
m45 = importlib.import_module("45_fix_stale_transfers")
norm = m45.norm
BIG = {"GB1", "L1", "ES1", "IT1", "FR1"}


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 400
    random.seed(int(sys.argv[2]) if len(sys.argv) > 2 else 1)
    qd = json.load(open("02_processed_data/quiz_data.json", encoding="utf-8"))
    ok = [p for p in qd["players"] if len(p["hist"]) >= 2]
    sample = random.sample(ok, min(n, len(ok)))
    facts = qd["clubs"]; alias = qd["alias"]
    keys = {norm(f["tm"]): ours for ours, f in facts.items()}
    keys.update({norm(k): v for k, v in alias.items()})
    keys.update({norm(k): k for k in facts})
    for a_, b_ in {"lille osc": "Lille", "olympique lyonnais": "Lyon", "ss lazio": "Lazio"}.items():
        if b_ in facts:
            keys[norm(a_)] = b_
    def big(label):
        k = norm(label)
        if k in keys:
            return keys[k]
        c = difflib.get_close_matches(k, list(keys), n=1, cutoff=0.82)
        return keys[c[0]] if c else None
    wd = {}
    ids = [str(p["id"]) for p in sample]
    for i in range(0, len(ids), 200):
        q = 'SELECT ?tm ?clubLabel WHERE { VALUES ?tm { %s } ?p wdt:P2446 ?tm . ?p wdt:P54 ?club . SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }' % " ".join(f'"{x}"' for x in ids[i:i + 200])
        for r in m45.sparql(q) or []:
            wd.setdefault(r["tm"]["value"], set()).add(r["clubLabel"]["value"])
    agree = onlyw = onlyo = known = 0
    ex_w, ex_o = [], []
    for p in sample:
        if str(p["id"]) not in wd:
            continue
        known += 1
        ours = {big(h) for h in p["hist"] + p.get("ap", []) + [p["club"]]} - {None}
        theirs = {big(h) for h in wd[str(p["id"])]} - {None}
        agree += len(ours & theirs); onlyw += len(theirs - ours); onlyo += len(ours - theirs)
        for c in theirs - ours:
            ex_w.append((p["n"], c))
        for c in ours - theirs:
            ex_o.append((p["n"], c))
    tot = agree + onlyw + onlyo
    print(f"{known} of {len(sample)} sampled players found on Wikidata; Big 5 club links: {agree} agree, {onlyw} only on Wikidata, {onlyo} only in our data")
    print(f"agreement {100 * agree / max(tot, 1):.1f}%; our data misses {100 * onlyw / max(agree + onlyw, 1):.1f}% of what Wikidata has")
    print("only Wikidata (possible gaps in ours):", ex_w[:25])
    print("only ours:", ex_o[:25])


if __name__ == "__main__":
    main()

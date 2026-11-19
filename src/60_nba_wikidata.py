"""NBA step 1: biographical facts from Wikidata, matched on ESPN's NBA player id (P3685).
Output: 02_processed_data/nba_wikidata.json   {espn_id: {dob, bp, bc, nat, h, awards:[...], draft_year, draft_pick, wd}}
Nothing is guessed: a player with no Wikidata match simply has no bio fields."""
import json, time, pathlib, requests
OUT = pathlib.Path("02_processed_data/nba_wikidata.json")
UA = {"User-Agent": "ballknowledge-data/1.0 (hobby project)", "Accept": "application/sparql-results+json"}
def q(sparql):
    for k in range(5):
        try:
            r = requests.get('https://query.wikidata.org/sparql', params={'query': sparql}, headers=UA, timeout=120); r.raise_for_status()
            return r.json()['results']['bindings']
        except Exception as e:
            print("retry", k, str(e)[:80]); time.sleep(5 * (k + 1))
    raise SystemExit("wikidata failed")
v = lambda b, k: b[k]["value"] if k in b else None
players = {}
# 1. basics (one row per player: first value of each)
for b in q("""SELECT ?p ?id (SAMPLE(?dob) AS ?d) (SAMPLE(?h) AS ?hh) (SAMPLE(?bpl) AS ?bp) (SAMPLE(?cty) AS ?bc) (GROUP_CONCAT(DISTINCT ?nat; separator="|") AS ?nats) WHERE {
  ?p wdt:P3685 ?id .
  OPTIONAL { ?p wdt:P569 ?dob } OPTIONAL { ?p wdt:P2048 ?h }
  OPTIONAL { ?p wdt:P19 ?pl . ?pl rdfs:label ?bpl FILTER(lang(?bpl)='en') OPTIONAL { ?pl wdt:P17 ?c . ?c rdfs:label ?cty FILTER(lang(?cty)='en') } }
  OPTIONAL { ?p wdt:P27 ?n . ?n rdfs:label ?nat FILTER(lang(?nat)='en') }
} GROUP BY ?p ?id"""):
    pid = v(b, "id")
    players[pid] = {"wd": v(b, "p").rsplit("/", 1)[1], "dob": (v(b, "d") or "")[:10] or None, "h": float(v(b, "hh")) if v(b, "hh") else None,
                    "bp": v(b, "bp"), "bc": v(b, "bc"), "nat": (v(b, "nats") or "").split("|")[0] or None}
print("players", len(players))
# 2. awards (NBA-specific ones by label)
for b in q("""SELECT ?id ?al WHERE { ?p wdt:P3685 ?id ; wdt:P166 ?a . ?a rdfs:label ?al FILTER(lang(?al)='en')
  FILTER(REGEX(STR(?al), 'NBA (Most Valuable Player|Finals Most Valuable Player|Defensive Player of the Year|Rookie of the Year|Sixth Man|Most Improved|Scoring Champion)|All-Star Game Most Valuable|Naismith Memorial|Olympic', 'i')) }"""):
    pl = players.get(v(b, "id"))
    if pl: pl.setdefault("awards", []).append(v(b, "al"))
# 3. draft
for b in q("""SELECT ?id (SAMPLE(?y) AS ?yr) (SAMPLE(?pk) AS ?pick) WHERE { ?p wdt:P3685 ?id ; p:P647 ?s . ?s ps:P647 ?dr . OPTIONAL { ?s pq:P1352 ?pk } OPTIONAL { ?dr wdt:P577 ?dt BIND(YEAR(?dt) AS ?y) } } GROUP BY ?id"""):
    pl = players.get(v(b, "id"))
    if pl: pl["draft_year"] = int(float(v(b, "yr"))) if v(b, "yr") else None; pl["draft_pick"] = int(float(v(b, "pick"))) if v(b, "pick") else None
OUT.write_text(json.dumps(players, ensure_ascii=False))
print("saved", len(players), "with dob", sum(1 for p in players.values() if p["dob"]), "awards", sum(1 for p in players.values() if p.get("awards")), "draft", sum(1 for p in players.values() if p.get("draft_year")))

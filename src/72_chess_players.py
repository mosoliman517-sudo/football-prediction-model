"""Chess step 3: strong chess players from Wikidata (FIDE id P1440, peak Elo P1087 >= 2600) for 'Who is this player?'. Only facts Wikidata holds."""
import requests, json, time
UA = {"User-Agent": "ballknowledge-data/1.0 (hobby project)", "Accept": "application/sparql-results+json"}
def q(s):
    for k in range(5):
        try:
            r = requests.get("https://query.wikidata.org/sparql", params={"query": s}, headers=UA, timeout=120); r.raise_for_status(); return r.json()["results"]["bindings"]
        except Exception as e: print("retry", str(e)[:60]); time.sleep(6 * (k + 1))
    raise SystemExit("failed")
v = lambda b, k: b[k]["value"] if k in b else None
rows = q("""SELECT ?p ?pLabel (MAX(?elo) AS ?peak) (SAMPLE(?dob) AS ?d) (SAMPLE(?dod) AS ?dd) (SAMPLE(?cl) AS ?country) (SAMPLE(?img) AS ?im) WHERE {
  ?p wdt:P1087 ?elo . FILTER(?elo >= 2600) ?p wdt:P569 ?dob .
  OPTIONAL { ?p wdt:P570 ?dod } OPTIONAL { ?p wdt:P18 ?img } OPTIONAL { ?p wdt:P27 ?c . ?c rdfs:label ?cl . FILTER(lang(?cl) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} GROUP BY ?p ?pLabel""")
champs = {v(b, "p") for b in q("SELECT ?p WHERE { ?p wdt:P166 wd:Q10290970 . }")}      # holders of the "world chess champion" title
out = []
for b in rows:
    d = v(b, "d"); 
    if not d: continue
    out.append({"n": v(b, "pLabel"), "peak": int(float(v(b, "peak"))), "born": int(d[:4]), "died": int(v(b, "dd")[:4]) if v(b, "dd") else None, "country": v(b, "country"), "birth": None, "img": v(b, "im"), "champ": v(b, "p") in champs})
out.sort(key=lambda x: -x["peak"])
json.dump(out, open("02_processed_data/chess_players.json", "w"), ensure_ascii=False)
print("players", len(out), "world champions", sum(x["champ"] for x in out), "with photo", sum(1 for x in out if x["img"]), [x["n"] for x in out[:6]])

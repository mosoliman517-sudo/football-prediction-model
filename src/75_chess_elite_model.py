"""Chess step 5: a result model for elite games (World Championship, Candidates, Tata Steel, Norway Chess, World Rapid/Blitz, World Cup).
Features: rating gap, average rating, classical vs fast. 80% train / 20% test, scored on games the model never saw. Output: chess_elite_model.json."""
import json, numpy as np
from sklearn.linear_model import LogisticRegression
g = json.load(open("02_processed_data/chess_elite.json"))
FAST = {"World Rapid & Blitz"}
def feat(x): return [(x["we"] - x["be"]) / 100.0, (x["we"] + x["be"]) / 2000.0, 1.0 if x["kind"] in FAST else 0.0, abs(x["we"] - x["be"]) / 100.0]
X = np.array([feat(x) for x in g]); y = np.array([2 if x["result"] == "1-0" else 0 if x["result"] == "0-1" else 1 for x in g])
rng = np.random.default_rng(11); idx = rng.permutation(len(g)); cut = int(.8 * len(g)); tr, te = idx[:cut], idx[cut:]
m = LogisticRegression(max_iter=400).fit(X[tr], y[tr]); P = m.predict_proba(X[te])
acc = float((P.argmax(1) == y[te]).mean()); white = float((y[te] == 2).mean()); draw = float((y[te] == 1).mean())
d = np.array([x["we"] - x["be"] for x in g])[te]; higher = float((((d >= 0) & (y[te] == 2)) | ((d < 0) & (y[te] == 0))).mean())
by = {}
for k in sorted({x["kind"] for x in g}):
    mk = np.array([g[i]["kind"] == k for i in te])
    if mk.sum() >= 15: by[k] = {"n": int(mk.sum()), "acc": round(float((P[mk].argmax(1) == y[te][mk]).mean()), 3), "draw": round(float((y[te][mk] == 1).mean()), 3)}
print(f"test {len(te)}: model {acc:.3f}; always white {white:.3f}; draws are {draw:.3f} of results; higher-rated side wins {higher:.3f}; by event {by}")
pool = []
for j, i in enumerate(te):
    x = g[i]; pool.append({**x, "p": [round(float(P[j][2]), 3), round(float(P[j][1]), 3), round(float(P[j][0]), 3)]})   # white, draw, black
pool.sort(key=lambda r: ({"World Championship": 0, "Candidates": 1, "Norway Chess": 2, "Tata Steel": 3}.get(r["kind"], 4), -(r["we"] + r["be"])))
json.dump({"summary": {"n": len(te), "train": len(tr), "acc": round(acc, 4), "white": round(white, 4), "draw": round(draw, 4), "higher": round(higher, 4), "byEvent": by, "events": sorted({x["event"] for x in g})}, "games": pool}, open("02_processed_data/chess_elite_model.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("pool", len(pool))

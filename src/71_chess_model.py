"""Chess step 2: a model that predicts a game's result (white win / draw / black win) and its length from the two ratings and the time control.
Trained on 80% of the sample, scored on the other 20% it never saw. Output: 02_processed_data/chess_model.json (accuracy table + a pool of test games for the site)."""
import json, numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
d = pd.read_csv("02_processed_data/chess_games.csv.gz")
d = d[d.speed.isin(["Bullet", "Blitz", "Rapid", "Classical"]) & d.welo.between(800, 3000) & d.belo.between(800, 3000)].reset_index(drop=True)
d["diff"] = (d.welo - d.belo) / 100.0; d["avg"] = (d.welo + d.belo) / 2000.0
for s in ("Bullet", "Blitz", "Rapid"): d["s_" + s] = (d.speed == s).astype(float)
d["ady"] = d["diff"].abs()
X = d[["diff", "avg", "s_Bullet", "s_Blitz", "s_Rapid", "ady"]].values
y = np.where(d.res == 1, 2, np.where(d.res == 0, 0, 1))                      # 2 white wins, 1 draw, 0 black wins
rng = np.random.default_rng(7); idx = rng.permutation(len(d)); cut = int(0.8 * len(d)); tr, te = idx[:cut], idx[cut:]
m = LogisticRegression(max_iter=300).fit(X[tr], y[tr]); P = m.predict_proba(X[te])
acc = float((P.argmax(1) == y[te]).mean()); base_w = float((y[te] == 2).mean()); higher = float((((d.welo.values[te] >= d.belo.values[te]) & (y[te] == 2)) | ((d.welo.values[te] < d.belo.values[te]) & (y[te] == 0))).mean())
ll = float(-np.log(P[np.arange(len(te)), y[te]] + 1e-9).mean())
# length: short (<30 moves), medium (30-50), long (50+), by plies
L = np.where(d.plies < 60, 0, np.where(d.plies < 100, 1, 2)); ml = LogisticRegression(max_iter=300).fit(X[tr], L[tr]); PL = ml.predict_proba(X[te]); lacc = float((PL.argmax(1) == L[te]).mean()); lbase = float(np.bincount(L[te]).max() / len(te))
by = {}
for s in ("Bullet", "Blitz", "Rapid", "Classical"):
    k = (d.speed.values[te] == s)
    if k.sum() >= 200: by[s] = {"n": int(k.sum()), "acc": round(float((P[k].argmax(1) == y[te][k]).mean()), 4), "higher": round(float((((d.welo.values[te][k] >= d.belo.values[te][k]) & (y[te][k] == 2)) | ((d.welo.values[te][k] < d.belo.values[te][k]) & (y[te][k] == 0))).mean()), 4)}
print(f"test games {len(te)}; model picks the result right {acc:.3f}; always 'white wins' {base_w:.3f}; higher-rated side wins {higher:.3f}; log-loss {ll:.3f}; length bucket {lacc:.3f} (guess the commonest {lbase:.3f}); by speed {by}")
# a pool of unseen games for the site (balanced across speeds and rating bands)
pool = []
sub = d.iloc[te].copy(); sub["pw"] = P[:, 2]; sub["pd"] = P[:, 1]; sub["pb"] = P[:, 0]; sub["pl0"] = PL[:, 0]; sub["pl1"] = PL[:, 1]; sub["pl2"] = PL[:, 2]
sub = sub[sub.speed != "Bullet"].sample(4000, random_state=3) if (sub.speed != "Bullet").sum() > 4000 else sub
for r in sub.itertuples():
    pool.append([int(r.welo), int(r.belo), float(r.res), int(r.base), int(r.inc), r.speed, int(r.plies), r.eco, r.opening, round(r.pw, 3), round(r.pd, 3), round(r.pb, 3), [round(r.pl0, 3), round(r.pl1, 3), round(r.pl2, 3)], r.term])
out = {"summary": {"n": len(te), "acc": round(acc, 4), "white": round(base_w, 4), "higher": round(higher, 4), "logloss": round(ll, 3), "len_acc": round(lacc, 4), "len_base": round(lbase, 4), "bySpeed": by, "source": "Lichess rated games, January 2024 (first 250 MB), standard chess"}, "games": pool}
json.dump(out, open("02_processed_data/chess_model.json", "w"), separators=(",", ":"))
print("pool", len(pool))

"""
Title race, Champions League places and the drop, with odds, for every league.

LIVE SEASON (2026-27). Every pairing still to be played is predicted from the league's CURRENT state (Elo, form, season
table) by the same pooled Big 5 model as the arena, then the rest of the season is simulated 20,000 times. Each match's
outcome is drawn from the model's probabilities and its score from the model's goal rates (given that outcome), so goal
difference breaks ties. Which matches remain is exact (every ordered pairing is played once); kickoff dates are not needed
because the forecast does not update during the simulated run (every match is predicted from today's state).

PAST SEASONS (the last three finished). The same simulation, started after matchday 10, 19 and 28, with the model's real
pre-match probabilities for the matches that were still to come. That is optimistic (those probabilities used form that
had not happened yet at the checkpoint), and it is labelled that way on the page.

Ties on points are broken by goal difference then goals scored (La Liga's head-to-head rule is not applied).
Run from the project root:  python3 src/32_title_race.py        Writes 02_processed_data/title_race.json
"""
import importlib.util
import json

import numpy as np
import pandas as pd

import core_features

spec = importlib.util.spec_from_file_location("ml29", "src/29_multi_league_walkforward.py")
ml = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ml)

N_SIMS = 20000
LIVE = 2026
CHECKS = (10, 19, 28)          # matchdays for the past-season checkpoints
RULES = {"E0": (4, 7, 3), "D1": (4, 6, 2), "SP1": (4, 7, 3), "I1": (4, 6, 3), "F1": (3, 5, 2)}      # (Champions League places, Europe places, relegated)
rng = np.random.default_rng(2026)
GOALS = np.arange(8)


def pmf(l):
    from math import exp, factorial
    return np.array([exp(-l) * l ** k / factorial(k) for k in GOALS])


def cond_scores(lh, la):
    """Probability of each score (home goals 0-7 x away goals 0-7), split by outcome A, D, H; each normalised."""
    g = np.outer(pmf(lh), pmf(la))
    i, j = np.meshgrid(GOALS, GOALS, indexing="ij")
    out = []
    for mask in (i < j, i == j, i > j):
        w = np.where(mask, g, 0).ravel()
        out.append(w / w.sum())
    return out


def simulate(teams, cur, fixtures, n=N_SIMS):
    """cur: {team: (pts, gd, gf)}; fixtures: [(home, away, pA, pD, pH, lamH, lamA)]. Returns pts, final positions (n x T)."""
    ix = {t: k for k, t in enumerate(teams)}
    T = len(teams)
    pts = np.tile(np.array([cur[t][0] for t in teams], float), (n, 1))
    gd = np.tile(np.array([cur[t][1] for t in teams], float), (n, 1))
    gf = np.tile(np.array([cur[t][2] for t in teams], float), (n, 1))
    for h, a, pa, pdw, ph, lh, la in fixtures:
        hi, ai = ix[h], ix[a]
        tot = pa + pdw + ph
        u = rng.random(n)
        o = np.where(u < pa / tot, 0, np.where(u < (pa + pdw) / tot, 1, 2))
        hg = np.zeros(n, int); ag = np.zeros(n, int)
        for k, cond in enumerate(cond_scores(lh, la)):
            m = np.where(o == k)[0]
            if len(m):
                cell = rng.choice(64, size=len(m), p=cond)
                hg[m], ag[m] = cell // 8, cell % 8
        pts[:, hi] += 3 * (o == 2) + (o == 1)
        pts[:, ai] += 3 * (o == 0) + (o == 1)
        gd[:, hi] += hg - ag; gd[:, ai] += ag - hg
        gf[:, hi] += hg; gf[:, ai] += ag
    key = pts * 1e6 + gd * 1e3 + gf + rng.random((n, T)) * 0.5
    order = np.argsort(-key, axis=1)
    pos = np.empty_like(order)
    pos[np.arange(n)[:, None], order] = np.arange(T)[None, :]
    return pts, pos


def summarize(lg, teams, cur, pts, pos, played):
    cl, eu, rel = RULES[lg]
    T = len(teams)
    rows = []
    for k, t in enumerate(teams):
        p = pts[:, k]
        dist = [round(float((pos[:, k] == r).mean()), 4) for r in range(T)]
        rows.append({"team": t, "pts": int(cur[t][0]), "played": int(played[t]), "mean": round(float(p.mean()), 1), "p10": int(np.percentile(p, 10)), "p90": int(np.percentile(p, 90)),
                     "title": round(float((pos[:, k] == 0).mean()), 4), "cl": round(float((pos[:, k] < cl).mean()), 4), "eu": round(float((pos[:, k] < eu).mean()), 4),
                     "drop": round(float((pos[:, k] >= T - rel).mean()), 4), "dist": dist})
    table = sorted(teams, key=lambda t: (-cur[t][0], -cur[t][1], -cur[t][2]))
    now = {t: i + 1 for i, t in enumerate(table)}
    for r in rows:
        r["now"] = now[r["team"]]
    rows.sort(key=lambda r: (-r["mean"], r["now"]))
    return rows


def standings(ms):
    cur, played = {}, {}
    for _, m in ms.iterrows():
        for t in (m["home"], m["away"]):
            cur.setdefault(t, [0, 0, 0]); played[t] = played.get(t, 0) + 1
        h, a, hg, ag = m["home"], m["away"], int(m["hg"]), int(m["ag"])
        cur[h][0] += 3 if hg > ag else 1 if hg == ag else 0; cur[a][0] += 3 if ag > hg else 1 if hg == ag else 0
        cur[h][1] += hg - ag; cur[a][1] += ag - hg; cur[h][2] += hg; cur[a][2] += ag
    return {t: tuple(v) for t, v in cur.items()}, played


def main():
    print("Building features with the unplayed fixtures of the live season included:")
    frames, hyp_rows = [], {}
    for lg in ml.LEAGUES:
        import glob
        files = sorted(glob.glob("01_data/E0_*.csv")) if lg == "E0" else sorted(glob.glob(f"01_data_leagues/{lg}_*.csv"))
        d = pd.concat([ml.read(f) for f in files], ignore_index=True).sort_values("Date", kind="stable").reset_index(drop=True)
        d["Season"] = np.where(d["Date"].dt.month >= 8, d["Date"].dt.year, d["Date"].dt.year - 1)
        live = d[d["Season"] == LIVE]
        teams = sorted(set(live["HomeTeam"]) | set(live["AwayTeam"]))
        played_pairs = set(zip(live["HomeTeam"], live["AwayTeam"]))
        todo = [(h, a) for h in teams for a in teams if h != a and (h, a) not in played_pairs]
        stamp = d["Date"].max() + pd.Timedelta(days=7)
        hyp = pd.DataFrame({"Date": stamp, "HomeTeam": [h for h, a in todo], "AwayTeam": [a for h, a in todo]})
        for c in ml.COLS:
            if c not in hyp.columns:
                hyp[c] = np.nan
        full = pd.concat([d, hyp[d.columns.intersection(hyp.columns)]], ignore_index=True)
        full["Season"] = full["Season"].fillna(LIVE)
        feat = core_features.build(full[ml.COLS].copy())
        full = pd.concat([full.reset_index(drop=True), feat], axis=1)
        full["League"] = lg
        frames.append(full)
        hyp_rows[lg] = (teams, todo, len(d))
        print(f"  {ml.LEAGUES[lg]:<15} {len(d)} played, {len(live)} this season, {len(todo)} still to play, {len(teams)} clubs", flush=True)
    d = pd.concat(frames, ignore_index=True)
    feats = [c for c in d.columns if c not in ml.COLS and c not in ("League", "Season")]
    X = d[feats].copy()
    for lg in ml.LEAGUES:
        X[f"lg_{lg}"] = (d["League"] == lg).astype(float)
    y = d["FTR"].map(ml.CODE)
    done = np.where(y.notna())[0]
    todo_idx = np.where(y.isna())[0]
    print(f"\nTraining on {len(done)} finished matches, predicting {len(todo_idx)} fixtures", flush=True)
    P, LH, LA = ml.fit_predict(X.iloc[done], y.iloc[done].astype(int).to_numpy(), d["FTHG"].to_numpy()[done], d["FTAG"].to_numpy()[done], X.iloc[todo_idx])
    pred = pd.DataFrame({"i": todo_idx, "lg": d["League"].to_numpy()[todo_idx], "home": d["HomeTeam"].to_numpy()[todo_idx], "away": d["AwayTeam"].to_numpy()[todo_idx],
                         "pa": P[:, 0], "pd": P[:, 1], "ph": P[:, 2], "lh": LH, "la": LA})

    per = pd.read_csv("02_processed_data/multi_league_matches.csv")
    out = {}
    for lg in ml.LEAGUES:
        print(f"\n{ml.LEAGUES[lg]}", flush=True)
        # ---- live season
        pl = per[(per["league"] == lg) & (per["season"] == LIVE)].sort_values(["date", "home"])
        cur, played = standings(pl)
        teams = sorted(cur)
        fx = [(r.home, r.away, r.pa, r.pd, r.ph, max(0.2, r.lh), max(0.2, r.la)) for r in pred[pred["lg"] == lg].itertuples()]
        pts, pos = simulate(teams, cur, fx)
        rows = summarize(lg, teams, cur, pts, pos, played)
        out[lg] = {"live": {"season": f"{LIVE}-{str(LIVE + 1)[2:]}", "as_of": pl["date"].max(), "played": len(pl), "remaining": len(fx), "n_sims": N_SIMS, "rows": rows, "rules": RULES[lg]}, "past": {}}
        print("  live favourite:", rows[0]["team"], f"title {rows[0]['title']:.0%}")
        # ---- last three finished seasons
        for S in (LIVE - 3, LIVE - 2, LIVE - 1):
            ps = per[(per["league"] == lg) & (per["season"] == S)].sort_values(["date", "home"]).reset_index(drop=True)
            tms = sorted(set(ps["home"]) | set(ps["away"]))
            perround = len(tms) // 2
            final, _ = standings(ps)
            fin_rank = {t: i + 1 for i, t in enumerate(sorted(tms, key=lambda t: (-final[t][0], -final[t][1], -final[t][2])))}
            cps = {}
            for r in CHECKS:
                n_played = r * perround
                cur, played = standings(ps.iloc[:n_played])
                fx = [(x.home, x.away, x.p_a, x.p_d, x.p_h, max(0.2, x.lam_h), max(0.2, x.lam_a)) for x in ps.iloc[n_played:].itertuples()]
                pts, pos = simulate(tms, cur, fx)
                cps[str(r)] = summarize(lg, tms, cur, pts, pos, played)
            out[lg]["past"][f"{S}-{str(S + 1)[2:]}"] = {"final": fin_rank, "final_pts": {t: int(final[t][0]) for t in tms}, "checkpoints": cps, "rounds": len(ps) // perround}
            top = max(cps["19"], key=lambda r: r["title"])
            print(f"  {S}-{str(S + 1)[2:]}: after matchday 19 the model's title favourite was {top['team']} ({top['title']:.0%}); champions: {min(fin_rank, key=fin_rank.get)}", flush=True)
    json.dump(out, open("02_processed_data/title_race.json", "w"), separators=(",", ":"))
    print("\nSaved 02_processed_data/title_race.json")


if __name__ == "__main__":
    main()

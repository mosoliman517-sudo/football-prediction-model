"""
Builds the data for the "Who did it" game (formerly Iconic matches; selection rule in src/big_matches.py): for famous matches, the real goals (minute, scorer, assister, penalty or not) and red cards, from the Transfermarkt dataset's match events
(01_data_market_value/new/game_events.csv; see the README for where it comes from), into 02_processed_data/highlights.json.
Matches: every match in xi.json (finals, Champions League and Europa League semi-finals and later quarter-finals, the main derbies, top-three clashes), plus Champions League and Europa League
quarter-finals, semi-finals and finals from 2010-11 on, cup finals from 2010-11 on, and World Cup and European Championship semi-finals and finals.
Minutes are the dataset's whole minutes (a goal in added time is 90+3 on TV but is stored as 93). A match is kept only if its goals add up to its score; own goals are not
flagged in the source, so a match whose goal list does not match its score is skipped rather than patched. Run from the project root:  python3 src/52_build_highlights.py
"""
import json
import sys

import pandas as pd

D = "01_data_market_value/"
COMP = {"CL": "Champions League", "EL": "Europa League", "FAC": "FA Cup", "CDR": "Copa del Rey", "DFB": "DFB-Pokal", "CIT": "Coppa Italia", "GB1": "Premier League", "L1": "Bundesliga",
        "ES1": "La Liga", "IT1": "Serie A", "FR1": "Ligue 1"}


def main():
    g = pd.read_csv(D + "games.csv")
    pl = pd.read_csv(D + "players.csv", usecols=["player_id", "name"]).set_index("player_id")["name"].to_dict()
    sys.path.insert(0, "src")
    from big_matches import selection
    chosen = {}
    sel, _ = selection(g, 2010)
    for gid, (kind, title) in sel.items():
        chosen[gid] = title
    rnd = g["round"].astype(str)
    nat = g[g["competition_id"].isin(["EURO", "FIWC"]) & rnd.str.contains(r"^(?:Final|Semi)", case=False)]
    for r in nat.itertuples():
        chosen.setdefault(r.game_id, f"{'World Cup' if r.competition_id == 'FIWC' else 'European Championship'} {'final' if str(r.round).lower() == 'final' else 'semi-final'} {r.date[:4]}")
    ev = pd.read_csv(D + "new/game_events.csv", usecols=["game_id", "minute", "type", "club_id", "player_id", "description", "player_assist_id"])
    ev = ev[ev["game_id"].isin(chosen) & ev["type"].isin(["Goals", "Cards"])]
    by = {k: v for k, v in ev.groupby("game_id")}
    gi = g.set_index("game_id")
    out, skipped = [], 0
    for gid, title in chosen.items():
        r = gi.loc[gid]
        e = by.get(gid)
        if e is None or pd.isna(r.home_club_goals):
            skipped += 1
            continue
        goals = e[e["type"] == "Goals"]
        hg = int((goals["club_id"] == r.home_club_id).sum()); ag = int((goals["club_id"] == r.away_club_id).sum())
        if (hg, ag) != (int(r.home_club_goals), int(r.away_club_goals)):
            skipped += 1                                        # own goals or shootouts make the list disagree with the score; skip rather than guess
            continue
        evs = []
        for x in e.sort_values("minute").itertuples():
            nm = pl.get(int(x.player_id)) if pd.notna(x.player_id) else None
            if not nm:
                continue
            side = "h" if x.club_id == r.home_club_id else "a"
            if x.type == "Goals":
                d = str(x.description or "")
                evs.append({"m": int(x.minute), "k": "goal", "s": side, "p": nm, "a": (pl.get(int(x.player_assist_id)) if pd.notna(x.player_assist_id) and "Penalty" not in d else None), "pen": "Penalty" in d, "how": "header" if "Header" in d else "free kick" if "free kick" in d.lower() else "left foot" if "Left-footed" in d else "right foot" if "Right-footed" in d else None})
            else:
                d = str(x.description or "")
                if d.startswith("Red") or d.startswith("Second yellow"):
                    evs.append({"m": int(x.minute), "k": "red", "s": side, "p": nm, "why": "second yellow" if d.startswith("Second") else "straight red"})
        if not any(v["k"] == "goal" for v in evs):
            skipped += 1
            continue
        out.append({"t": title, "comp": {"EURO": "European Championship", "FIWC": "World Cup"}.get(r.competition_id) or COMP.get(r.competition_id, str(r.competition_id)), "season": int(r.date[:4]) if r.competition_id in ("EURO", "FIWC") else int(r.season), "date": r.date, "h": r.home_club_name, "a": r.away_club_name, "hg": int(r.home_club_goals), "ag": int(r.away_club_goals), "ev": evs})
    out.sort(key=lambda x: x["date"])
    json.dump(out, open("02_processed_data/highlights.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(len(out), "matches kept,", skipped, "skipped; goals:", sum(1 for m in out for v in m["ev"] if v["k"] == "goal"), "penalties:", sum(1 for m in out for v in m["ev"] if v["k"] == "goal" and v["pen"]), "red cards:", sum(1 for m in out for v in m["ev"] if v["k"] == "red"))


if __name__ == "__main__":
    main()

"""
Pulls team-level match xG data from Understat for every Premier League
season this project covers (2014-15 through 2025-26). Understat isn't
behind a login, but its data endpoint 404s on a bare request -- it
needs a session established the same way a real browser gets one:
visit the matching season page first, then request its data endpoint
with the resulting cookies. No login, no scraping tricks beyond that.

Genuinely new information for this project -- xG measures shot
quality, not just volume, which nothing in 01_data/ currently captures
at all.

Output: one CSV per season in 01_data_xg/, one row per team per match.
Not wired into the main pipeline yet -- this only fetches and saves
the raw data; turning it into pre-match rolling features (the same
walk-forward, no-leakage way every other feature in this project is
built) is a separate next step.
"""

import os
import time

import requests
import pandas as pd

SEASONS = range(2014, 2026)   # 2014 = 2014-15 season, ... 2025 = 2025-26
OUTPUT_DIR = "01_data_xg"

# Understat uses fuller/different team names than 01_data/'s files --
# confirmed by diffing every team name across all 12 seasons on both
# sides, this is the complete list of mismatches, nothing missed.
# Normalizing here means the saved CSVs are immediately joinable on
# Date/Team without any cleanup step later.
TEAM_NAME_MAP = {
    "Manchester City": "Man City",
    "Manchester United": "Man United",
    "Newcastle United": "Newcastle",
    "Nottingham Forest": "Nott'm Forest",
    "Queens Park Rangers": "QPR",
    "West Bromwich Albion": "West Brom",
    "Wolverhampton Wanderers": "Wolves",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
}


def fetch_season(session, season):

    page_url = f"https://understat.com/league/EPL/{season}"
    data_url = f"https://understat.com/getLeagueData/EPL/{season}"

    # A fresh visit to the matching season page first -- the data
    # endpoint 404s without a session established this way
    session.get(page_url, timeout=20)

    response = session.get(
        data_url,
        headers={"Referer": page_url, "X-Requested-With": "XMLHttpRequest"},
        timeout=20
    )
    response.raise_for_status()

    return response.json()


def flatten_season(season, data):

    rows = []

    for team in data["teams"].values():

        team_name = TEAM_NAME_MAP.get(team["title"], team["title"])

        for match in team["history"]:

            ppda = match["ppda"]
            ppda_allowed = match["ppda_allowed"]

            rows.append({
                "Season": season,
                "Team": team_name,
                "Date": match["date"],
                "Venue": "Home" if match["h_a"] == "h" else "Away",
                "xG": match["xG"],
                "xGA": match["xGA"],
                "npxG": match["npxG"],           # non-penalty xG -- strips out penalty
                "npxGA": match["npxGA"],          # goals, which inflate xG without reflecting open-play quality
                "PPDA": ppda["att"] / ppda["def"] if ppda["def"] else None,
                "PPDA_Allowed": (
                    ppda_allowed["att"] / ppda_allowed["def"]
                    if ppda_allowed["def"] else None
                ),
                "DeepCompletions": match["deep"],           # passes completed within 20m of goal
                "DeepCompletionsAllowed": match["deep_allowed"],
                "GoalsScored": match["scored"],
                "GoalsConceded": match["missed"],
                "Result": match["result"],
                "Points": match["pts"],
                "ExpectedPoints": match["xpts"],   # Understat's own xG-based points estimate
            })

    return pd.DataFrame(rows)


def main():

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    session = requests.Session()
    session.headers.update(HEADERS)

    for season in SEASONS:

        label = f"{season}-{str(season + 1)[-2:]}"
        print(f"Fetching {label} season...")

        data = fetch_season(session, season)
        df = flatten_season(season, data)

        out_path = f"{OUTPUT_DIR}/EPL_xg_{season}.csv"
        df.to_csv(out_path, index=False)

        print(f"  saved {len(df)} rows to {out_path}")

        time.sleep(2)   # be a reasonable guest, not hammering the site


if __name__ == "__main__":
    main()

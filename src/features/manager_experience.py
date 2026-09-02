import pandas as pd

from features.manager_tenure import _manager_timeline

GAMES_PATH = "01_data_market_value/games.csv"


def _manager_experience_timeline():
    """
    Every Premier League manager's CAREER match count, walk-forward --
    not tenure at one specific club (manager_tenure.py already covers
    that), but how many top-flight matches this person has managed in
    total, at any club, before this date. A manager who's been through
    500 Premier League matches brings something a first-timer doesn't,
    independent of how long they've been at THIS specific club.

    Extends back to 2012 (before this project's own data starts, same
    reasoning as manager_tenure.py) so a manager who arrived in the
    league just before the 2014-15 season still gets real career
    experience credit rather than starting at zero.
    """

    games = pd.read_csv(GAMES_PATH)
    games = games[games["competition_id"] == "GB1"].copy()
    games["date"] = pd.to_datetime(games["date"])

    appearances = pd.concat([
        games[["date", "home_club_manager_name"]].rename(
            columns={"home_club_manager_name": "Manager"}
        ),
        games[["date", "away_club_manager_name"]].rename(
            columns={"away_club_manager_name": "Manager"}
        ),
    ]).dropna(subset=["Manager"]).sort_values("date")

    # For every (manager, date) appearance, how many EPL matches had
    # this manager already taken charge of strictly before this one.
    appearances["ExperienceMatches"] = appearances.groupby("Manager").cumcount()

    return appearances


def add_manager_experience_features(df):
    """
    Adds HomeManagerExperience / AwayManagerExperience -- the current
    manager's career Premier League match count as of this match,
    resolved via the same manager-identity timeline manager_tenure.py
    already builds (who's actually in charge of this team right now).
    """

    changes = _manager_timeline()
    experience = _manager_experience_timeline()

    # For each manager, a sorted list of (date, cumulative_experience)
    # -- looked up per match via the most recent entry on or before
    # that date, same walk-forward pattern as everywhere else here.
    experience_by_manager = {
        name: group[["date", "ExperienceMatches"]].sort_values("date").values
        for name, group in experience.groupby("Manager")
    }

    def current_manager(team, match_date):
        timeline = changes.get(team, [])
        appointed_manager = None
        for date_appointed, manager_name in timeline:
            if date_appointed < match_date:
                appointed_manager = manager_name
            else:
                break
        return appointed_manager

    def experience_as_of(manager_name, match_date):
        if manager_name is None:
            return 0
        rows = experience_by_manager.get(manager_name)
        if rows is None:
            return 0
        best = 0
        for date_val, exp_val in rows:
            if date_val < match_date:
                best = exp_val
            else:
                break
        return best

    df = df.copy()

    def row_experience(row, team_col):
        manager_name = current_manager(row[team_col], row["Date"])
        return experience_as_of(manager_name, row["Date"])

    df["HomeManagerExperience"] = df.apply(
        lambda row: row_experience(row, "HomeTeam"), axis=1
    )
    df["AwayManagerExperience"] = df.apply(
        lambda row: row_experience(row, "AwayTeam"), axis=1
    )

    return df

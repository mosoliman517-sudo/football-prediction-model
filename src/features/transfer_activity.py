import pandas as pd

TRANSFERS_PATH = "01_data_market_value/transfers.csv"
CLUBS_PATH = "01_data_market_value/clubs.csv"

# Same Transfermarkt -> project naming as market_value.py
TEAM_NAME_MAP = {
    "AFC Bournemouth": "Bournemouth", "Arsenal FC": "Arsenal", "Aston Villa": "Aston Villa",
    "Brentford FC": "Brentford", "Brighton & Hove Albion": "Brighton", "Burnley FC": "Burnley",
    "Cardiff City": "Cardiff", "Chelsea FC": "Chelsea", "Crystal Palace": "Crystal Palace",
    "Everton FC": "Everton", "Fulham FC": "Fulham", "Huddersfield Town": "Huddersfield",
    "Hull City": "Hull", "Ipswich Town": "Ipswich", "Leeds United": "Leeds",
    "Leicester City": "Leicester", "Liverpool FC": "Liverpool", "Luton Town": "Luton",
    "Manchester City": "Man City", "Manchester United": "Man United", "Middlesbrough FC": "Middlesbrough",
    "Newcastle United": "Newcastle", "Norwich City": "Norwich", "Nottingham Forest": "Nott'm Forest",
    "Queens Park Rangers": "QPR", "Sheffield United": "Sheffield United", "Southampton FC": "Southampton",
    "Stoke City": "Stoke", "Sunderland AFC": "Sunderland", "Swansea City": "Swansea",
    "Tottenham Hotspur": "Tottenham", "Watford FC": "Watford", "West Bromwich Albion": "West Brom",
    "West Ham United": "West Ham", "Wolverhampton Wanderers": "Wolves",
}


def _transfer_activity_by_season(df):
    """
    One summer-transfer-window snapshot per team per season -- how
    much the squad actually changed hands before this season started.
    Window: June 1 to the season's own August 1 start, the core summer
    transfer window. Genuinely pre-match/pre-season information, same
    category as market_value.py's squad snapshot -- known before a
    ball is kicked, doesn't require rolling/walk-forward logic.
    """

    clubs = pd.read_csv(CLUBS_PATH)
    transfers = pd.read_csv(TRANSFERS_PATH)
    transfers["transfer_date"] = pd.to_datetime(transfers["transfer_date"])
    transfers["transfer_fee"] = transfers["transfer_fee"].fillna(0.0)

    epl_clubs = clubs[clubs["domestic_competition_id"] == "GB1"].copy()
    epl_clubs["ProjectName"] = epl_clubs["name"].map(TEAM_NAME_MAP)
    club_id_to_name = dict(zip(epl_clubs["club_id"], epl_clubs["ProjectName"]))
    epl_club_ids = set(club_id_to_name.keys())

    season_years = sorted(df["Date"].apply(
        lambda d: d.year if d.month >= 7 else d.year - 1
    ).unique())

    rows = []

    for season_year in season_years:

        window_start = pd.Timestamp(f"{season_year}-06-01")
        window_end = pd.Timestamp(f"{season_year}-08-01")

        window = transfers[
            (transfers["transfer_date"] >= window_start)
            & (transfers["transfer_date"] < window_end)
        ]

        incoming = window[window["to_club_id"].isin(epl_club_ids)]
        outgoing = window[window["from_club_id"].isin(epl_club_ids)]

        in_counts = incoming.groupby("to_club_id").size()
        out_counts = outgoing.groupby("from_club_id").size()
        in_spend = incoming.groupby("to_club_id")["transfer_fee"].sum()
        out_spend = outgoing.groupby("from_club_id")["transfer_fee"].sum()

        for club_id, team in club_id_to_name.items():
            if pd.isna(team):
                continue
            rows.append({
                "SeasonYear": season_year,
                "Team": team,
                "TransfersIn": in_counts.get(club_id, 0),
                "TransfersOut": out_counts.get(club_id, 0),
                "NetTransferSpendEur": in_spend.get(club_id, 0.0) - out_spend.get(club_id, 0.0),
            })

    return pd.DataFrame(rows)


def add_transfer_activity_features(df):
    """
    Adds HomeTransfersIn/Out, AwayTransfersIn/Out and
    Home/AwayNetTransferSpendEur -- how much a team's squad turned
    over in the summer window before this season, as a proxy for the
    kind of season-to-season shift (rebuild, new manager's overhaul,
    a big-spending push) nothing else here captures. A high turnover
    count says "this team's actual squad this season may look very
    different from what its market value or Elo carried over implies."
    """

    df = df.copy()
    df["SeasonYear"] = df["Date"].apply(
        lambda d: d.year if d.month >= 7 else d.year - 1
    )

    activity = _transfer_activity_by_season(df)

    home_activity = activity.rename(columns={
        "Team": "HomeTeam",
        "TransfersIn": "HomeTransfersIn",
        "TransfersOut": "HomeTransfersOut",
        "NetTransferSpendEur": "HomeNetTransferSpendEur",
    })
    away_activity = activity.rename(columns={
        "Team": "AwayTeam",
        "TransfersIn": "AwayTransfersIn",
        "TransfersOut": "AwayTransfersOut",
        "NetTransferSpendEur": "AwayNetTransferSpendEur",
    })

    df = df.merge(home_activity, on=["SeasonYear", "HomeTeam"], how="left")
    df = df.merge(away_activity, on=["SeasonYear", "AwayTeam"], how="left")

    for col in [
        "HomeTransfersIn", "HomeTransfersOut", "HomeNetTransferSpendEur",
        "AwayTransfersIn", "AwayTransfersOut", "AwayNetTransferSpendEur",
    ]:
        df[col] = df[col].fillna(0.0)

    df = df.drop(columns=["SeasonYear"])

    return df

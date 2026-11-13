# Transfermarkt (Kaggle) club names -> the names this project uses
# (football-data.co.uk's spelling). One shared copy: it used to be pasted
# into five feature files, so adding a promoted club meant five identical
# edits. A club missing here (or missing from Transfermarkt's own club
# list, like Coventry's data) resolves to no team and gets the feature's
# documented "no data" default.
TEAM_NAME_MAP = {
    "AFC Bournemouth": "Bournemouth",
    "Arsenal FC": "Arsenal",
    "Aston Villa": "Aston Villa",
    "Brentford FC": "Brentford",
    "Brighton & Hove Albion": "Brighton",
    "Burnley FC": "Burnley",
    "Cardiff City": "Cardiff",
    "Chelsea FC": "Chelsea",
    "Coventry City": "Coventry",
    "Crystal Palace": "Crystal Palace",
    "Everton FC": "Everton",
    "Fulham FC": "Fulham",
    "Huddersfield Town": "Huddersfield",
    "Hull City": "Hull",
    "Ipswich Town": "Ipswich",
    "Leeds United": "Leeds",
    "Leicester City": "Leicester",
    "Liverpool FC": "Liverpool",
    "Luton Town": "Luton",
    "Manchester City": "Man City",
    "Manchester United": "Man United",
    "Middlesbrough FC": "Middlesbrough",
    "Newcastle United": "Newcastle",
    "Norwich City": "Norwich",
    "Nottingham Forest": "Nott'm Forest",
    "Queens Park Rangers": "QPR",
    "Sheffield United": "Sheffield United",
    "Southampton FC": "Southampton",
    "Stoke City": "Stoke",
    "Sunderland AFC": "Sunderland",
    "Swansea City": "Swansea",
    "Tottenham Hotspur": "Tottenham",
    "Watford FC": "Watford",
    "West Bromwich Albion": "West Brom",
    "West Ham United": "West Ham",
    "Wolverhampton Wanderers": "Wolves",
}

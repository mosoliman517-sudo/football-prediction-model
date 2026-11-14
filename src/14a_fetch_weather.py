"""
Downloads match-day weather (rain, max wind, mean temperature) for every club's
home ground from the free Open-Meteo archive, 2014-08 to 2026-11, into
01_data_weather/weather.json ({club: {date: [rain_mm, wind_kmh, temp_c]}}).
Only stadium coordinates are sent. Run from the project root.
"""
import json
import os
import sys
import time

import requests

sys.path.insert(0, "src")
from features.candidates import COORDS

os.makedirs("01_data_weather", exist_ok=True)
out = json.load(open("01_data_weather/weather.json")) if os.path.exists("01_data_weather/weather.json") else {}
for club, (lat, lon) in COORDS.items():
    if club in out:
        continue
    r = requests.get("https://archive-api.open-meteo.com/v1/archive", timeout=60, params={
        "latitude": lat, "longitude": lon, "start_date": "2014-08-01", "end_date": "2026-11-13",
        "daily": "precipitation_sum,wind_speed_10m_max,temperature_2m_mean", "timezone": "UTC"})
    if r.status_code == 429:                       # per-minute limit: wait it out, then retry once
        time.sleep(65)
        r = requests.get(r.request.url, timeout=60)
    if r.status_code != 200:
        print("failed", club, r.status_code, r.text[:120]); continue
    d = r.json()["daily"]
    out[club] = {t: [p, w, m] for t, p, w, m in zip(d["time"], d["precipitation_sum"], d["wind_speed_10m_max"], d["temperature_2m_mean"])}
    print("ok", club, len(out[club])); time.sleep(4)
json.dump(out, open("01_data_weather/weather.json", "w"))
print("saved", len(out), "clubs")

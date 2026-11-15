"""
Field Shift - evaporation demand, water balance and heavy rain, year by year
Downloads 35 years of NASA POWER daily data for the climate point and works out:
  - reference evapotranspiration (ET0): how much water the air pulls from a
    well-watered grass surface each day (FAO-56 Penman-Monteith method)
  - very hot days and heavy-rain days (POWER model rain)
for every month of every year. The page uses this for the water balance chart
and the 35-year stress test.

No login needed.

  pip install requests
  python scripts/get_water_balance.py        (run from the repo root)

Output: data/water_balance.json   (raw download cached in data/raw/)

AI disclosure: this script was written with help from Claude (Anthropic).
"""
import json
import math
from pathlib import Path

import requests

# ---------------- settings (change these) ----------------
SITE_ID = "fallon_nv"
LAT, LON = 39.47, -118.78
START_YEAR, END_YEAR = 1991, 2025
PAST = (1991, 2015)
RECENT = (2016, 2025)
HEAT_C = 35.0            # "very hot day" threshold, same as get_power.py
HEAVY_RAIN_MM = 12.7     # "heavy rain day" = half an inch or more in a day
OUT = Path("data")
RAW = OUT / "raw" / f"power_daily_et0_{SITE_ID}.json"
# (GPM IMERG satellite rain is not requested: on 2026-11-15 the POWER API returned
# only missing values for IMERG_PRECTOT. Satellite rain normals stay in power_summary.json.)
PARAMS = ["T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "PRECTOTCORR"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
# ---------------------------------------------------------


def download():
    if RAW.exists():
        print(f"[water] using cached {RAW}")
        return json.loads(RAW.read_text())
    print("[water] downloading NASA POWER daily data (35 years)...")
    r = requests.get(
        "https://power.larc.nasa.gov/api/temporal/daily/point",
        params={"parameters": ",".join(PARAMS), "community": "AG", "latitude": LAT, "longitude": LON,
                "start": f"{START_YEAR}0101", "end": f"{END_YEAR}1231", "format": "JSON"},
        timeout=600,
    )
    r.raise_for_status()
    data = r.json()
    RAW.parent.mkdir(parents=True, exist_ok=True)
    RAW.write_text(json.dumps(data))
    return data


def ok(v):
    return v is not None and v > -900     # POWER uses -999 for missing


def svp(t):
    """Saturation vapour pressure (kPa) at air temperature t (C). FAO-56 eq. 11."""
    return 0.6108 * math.exp(17.27 * t / (t + 237.3))


def et0_fao56(tmax, tmin, rh, u2, rs, doy, lat_deg, elev_m):
    """Daily reference evapotranspiration in mm (FAO-56 Penman-Monteith, eq. 6)."""
    tmean = (tmax + tmin) / 2
    p = 101.3 * ((293 - 0.0065 * elev_m) / 293) ** 5.26          # air pressure, kPa
    gamma = 0.000665 * p                                          # psychrometric constant
    delta = 4098 * svp(tmean) / (tmean + 237.3) ** 2              # slope of vapour pressure curve
    es = (svp(tmax) + svp(tmin)) / 2
    ea = es * rh / 100                                            # from mean relative humidity (eq. 19)
    # extraterrestrial radiation Ra (eq. 21) and clear-sky radiation Rso (eq. 37)
    phi = math.radians(lat_deg)
    dr = 1 + 0.033 * math.cos(2 * math.pi * doy / 365)
    dec = 0.409 * math.sin(2 * math.pi * doy / 365 - 1.39)
    ws = math.acos(-math.tan(phi) * math.tan(dec))
    ra = (24 * 60 / math.pi) * 0.0820 * dr * (ws * math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.sin(ws))
    rso = (0.75 + 2e-5 * elev_m) * ra
    rns = 0.77 * rs                                               # net shortwave (albedo 0.23)
    ratio = min(max(rs / rso, 0.3), 1.0) if rso > 0 else 0.3
    sigma = 4.903e-9
    rnl = sigma * ((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2 * (0.34 - 0.14 * math.sqrt(max(ea, 0))) * (1.35 * ratio - 0.35)
    rn = rns - rnl
    num = 0.408 * delta * rn + gamma * (900 / (tmean + 273)) * u2 * (es - ea)
    return max(num / (delta + gamma * (1 + 0.34 * u2)), 0.0)


def trend(xs, ys):
    """Least-squares slope per decade and Pearson r."""
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    if sxx == 0 or syy == 0:
        return {"per_decade": 0.0, "r": 0.0, "n_years": n}
    return {"per_decade": round(10 * sxy / sxx, 2), "r": round(sxy / math.sqrt(sxx * syy), 2), "n_years": n}


def main():
    data = download()
    p = data["properties"]["parameter"]
    elev = data["geometry"]["coordinates"][2]
    days = sorted(p["T2M_MAX"].keys())

    # year -> month -> totals
    years = {}
    missing_et0 = 0
    for d in days:
        y, m, dd = int(d[:4]), int(d[4:6]), int(d[6:])
        doy = (__import__("datetime").date(y, m, dd) - __import__("datetime").date(y, 1, 1)).days + 1
        rec = years.setdefault(y, {mm: {"et0_mm": 0.0, "rain_model_mm": 0.0,
                                        "heat_days": 0, "heavy_rain_days": 0, "days": 0, "et0_days": 0} for mm in range(1, 13)})[m]
        tmax, tmin, rh, u2, rs = (p[k].get(d) for k in ("T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN"))
        rain = p["PRECTOTCORR"].get(d)
        rec["days"] += 1
        if ok(tmax) and tmax >= HEAT_C:
            rec["heat_days"] += 1
        if ok(rain):
            rec["rain_model_mm"] += rain
            if rain >= HEAVY_RAIN_MM:
                rec["heavy_rain_days"] += 1
        if all(ok(v) for v in (tmax, tmin, rh, u2, rs)):
            rec["et0_mm"] += et0_fao56(tmax, tmin, rh, u2, rs, doy, LAT, elev)
            rec["et0_days"] += 1
        else:
            missing_et0 += 1

    yearly = []
    for y in sorted(years):
        months = []
        for m in range(1, 13):
            r = years[y][m]
            # fill the few days with missing inputs using the month's daily average
            et0 = r["et0_mm"] * r["days"] / r["et0_days"] if r["et0_days"] else None
            months.append({
                "month": m,
                "et0_mm": None if et0 is None else round(et0, 1),
                "rain_model_mm": round(r["rain_model_mm"], 1),
                "heat_days": r["heat_days"],
                "heavy_rain_days": r["heavy_rain_days"],
            })
        yearly.append({
            "year": y,
            "et0_mm": round(sum(x["et0_mm"] or 0 for x in months), 1),
            "rain_model_mm": round(sum(x["rain_model_mm"] for x in months), 1),
            "heat_days": sum(x["heat_days"] for x in months),
            "heavy_rain_days": sum(x["heavy_rain_days"] for x in months),
            "months": months,
        })

    def normals(lo, hi):
        sel = [y for y in yearly if lo <= y["year"] <= hi]
        out = []
        for m in range(1, 13):
            ms = [y["months"][m - 1] for y in sel]
            out.append({
                "month": m, "name": MONTHS[m - 1],
                "et0_mm": round(sum(x["et0_mm"] for x in ms) / len(ms), 1),
                "heat_days": round(sum(x["heat_days"] for x in ms) / len(ms), 1),
            })
        return out

    def mean(key, lo, hi):
        sel = [y for y in yearly if lo <= y["year"] <= hi]
        return round(sum(y[key] for y in sel) / len(sel), 2) if sel else None

    def change(key):
        a, b = mean(key, *PAST), mean(key, *RECENT)
        return {"past": a, "recent": b, "change": None if a is None or b is None else round(b - a, 2)}

    xs = [y["year"] for y in yearly]
    out = {
        "site": {"id": SITE_ID, "lat": LAT, "lon": LON, "grid_elevation_m": elev},
        "source": "NASA POWER daily, Agroclimatology community (power.larc.nasa.gov)",
        "downloaded": __import__("datetime").date.today().isoformat(),
        "method": "Reference evapotranspiration (ET0) by FAO-56 Penman-Monteith from POWER T2M_MAX, T2M_MIN, RH2M, WS2M and ALLSKY_SFC_SW_DWN.",
        "thresholds": {"heat_c": HEAT_C, "heavy_rain_mm": HEAVY_RAIN_MM},
        "years": {"all": [START_YEAR, END_YEAR], "past": list(PAST), "recent": list(RECENT)},
        "monthly_normals": normals(START_YEAR, END_YEAR),
        "monthly_past": normals(*PAST),
        "monthly_recent": normals(*RECENT),
        "recent_vs_past": {
            "et0_mm": change("et0_mm"),
            "heavy_rain_days": change("heavy_rain_days"),
            "heat_days": change("heat_days"),
        },
        "trends_per_decade": {
            "et0_mm": trend(xs, [y["et0_mm"] for y in yearly]),
            "heavy_rain_days": trend(xs, [y["heavy_rain_days"] for y in yearly]),
        },
        "yearly": yearly,
        "data_notes": [
            "ET0 is what a well-watered, clipped grass surface would use. A real crop uses more or less than this depending on the crop and its growth stage.",
            "ET0 here is calculated from NASA POWER's ~50 km grid weather, not measured on a farm. Irrigated valleys are a little cooler and more humid than the grid average, so true ET0 in the fields may be somewhat lower.",
            "Heavy-rain days (half an inch or more in a day) use POWER's model rain, which reads wetter than the satellite and the Fallon station. The true count is probably lower.",
            "This file comes from a fresh NASA POWER download. Its daily temperatures run about 0.4 C cooler than the earlier download behind power_summary.json, so it counts about 3 fewer very hot days a year. The rise over time is the same (about +17 days a year).",
        ],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "water_balance.json").write_text(json.dumps(out, indent=1))
    print(f"[water] ET0 {mean('et0_mm', *PAST)} -> {mean('et0_mm', *RECENT)} mm/yr; days with missing inputs: {missing_et0}")
    print(f"[water] saved {OUT / 'water_balance.json'}")


if __name__ == "__main__":
    main()

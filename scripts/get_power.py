"""
Field Shift - NASA POWER: download + summarize
-----------------------------------------------
Pulls ~35 years of daily NASA POWER data for one location and turns it into
farmer-friendly numbers: monthly normals, frost dates, heat-stress days,
growing degree days, soil wetness, rain (model + GPM IMERG satellite), and
how the last 10 years compare to before.

Setup:  pip install requests
Run:    python get_power.py                    (downloads from the POWER API)
   or:  python get_power.py my_download.csv    (uses a CSV from the POWER website)
        It also auto-finds any POWER_Point_Daily*.csv in this folder or data/raw/.

Outputs:
  data/raw/power_daily_<site>.csv    clean daily data (open in Excel)
  data/power_summary.json            what the app loads

No login needed for NASA POWER.
POWER weather is on a ~50 km grid, so town coordinates are fine here.

AI disclosure: written with help from Claude (Anthropic).
"""
import csv
import json
import re
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from statistics import mean

import requests

# ---------------- settings ----------------
SITE_ID = "fallon_nv"
SITE_NAME = "Fallon, Nevada"
LAT, LON = 39.47, -118.78
START_YEAR, END_YEAR = 1991, 2025    # full years only
RECENT_YEARS = 10                    # "recent" = last 10 yrs, "past" = everything before

FROST_C = 0.0        # daily min temp at/below this = frost day
HEAT_C = 35.0        # daily max temp at/above this = heat-stress day (~95 F)
GDD_BASES = (5, 10)  # growing degree day base temps (C): 5 = alfalfa/small grains, 10 = corn/sorghum

RAW = Path("data/raw")
OUT = Path("data")
# ------------------------------------------

# Internal name -> POWER codes to look for (first one found wins).
# The website calls rain PRECTOT; older API versions call it PRECTOTCORR.
SOURCES = {
    "tmax": ["T2M_MAX"],
    "tmin": ["T2M_MIN"],
    "rain": ["PRECTOT", "PRECTOTCORR"],
    "rain_sat": ["IMERG_PRECTOT"],      # GPM IMERG satellite rain (optional, starts mid-2000)
    "soil": ["GWETROOT"],
}
REQUIRED = ["tmax", "tmin", "rain", "soil"]
API_TRIES = [
    ["T2M_MAX", "T2M_MIN", "PRECTOT", "IMERG_PRECTOT", "GWETROOT"],
    ["T2M_MAX", "T2M_MIN", "PRECTOTCORR", "GWETROOT"],   # fallback if the API rejects the first set
]

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
RAW_JSON = RAW / f"power_daily_{SITE_ID}.json"
CLEAN_CSV = RAW / f"power_daily_{SITE_ID}.csv"


# ---------------- loading ----------------
def num(v):
    if v in (None, ""):
        return None
    v = float(v)
    return None if v <= -990 else v      # -999 = missing


def pick_codes(available):
    """Map internal names to whichever POWER codes are actually present."""
    used = {}
    for key, codes in SOURCES.items():
        for c in codes:
            if c in available:
                used[key] = c
                break
    missing = [k for k in REQUIRED if k not in used]
    if missing:
        need = [SOURCES[k][0] for k in missing]
        sys.exit(f"[POWER] missing required data: {need}. Re-download with those parameters checked.")
    if "rain_sat" not in used:
        print("[POWER] note: no IMERG_PRECTOT (satellite rain) - skipping that part")
    print(f"[POWER] using: {used}")
    return used


def download():
    if RAW_JSON.exists():
        print(f"[POWER] using cached {RAW_JSON} (delete it to re-download)")
        return json.loads(RAW_JSON.read_text())

    print(f"[POWER] downloading {START_YEAR}-{END_YEAR} daily data... (can take ~30s)")
    last_err = None
    for params in API_TRIES:
        r = requests.get(
            "https://power.larc.nasa.gov/api/temporal/daily/point",
            params={
                "parameters": ",".join(params),
                "community": "AG",
                "latitude": LAT,
                "longitude": LON,
                "start": f"{START_YEAR}0101",
                "end": f"{END_YEAR}1231",
                "format": "JSON",
            },
            timeout=600,
        )
        if r.ok:
            RAW_JSON.write_text(r.text)
            return r.json()
        last_err = f"{r.status_code}: {r.text[:300]}"
        print(f"[POWER] request with {params} failed ({r.status_code}), trying fallback...")
    sys.exit(f"[POWER] download failed. Last error {last_err}")


def parse_api(js):
    p = js["properties"]["parameter"]
    used = pick_codes(p.keys())
    days = []
    for k in sorted(p[used["tmax"]]):
        rec = {"date": date(int(k[:4]), int(k[4:6]), int(k[6:8]))}
        for key in SOURCES:
            rec[key] = num(p[used[key]].get(k)) if key in used else None
        days.append(rec)
    coords = js.get("geometry", {}).get("coordinates", [None, None, None])
    meta = {"lat": coords[1], "lon": coords[0],
            "elevation_m": coords[2] if len(coords) > 2 else None}
    return days, used, meta


def parse_website_csv(path):
    lines = Path(path).read_text().splitlines()
    stripped = [l.strip() for l in lines]
    meta = {"lat": None, "lon": None, "elevation_m": None}
    if "-END HEADER-" in stripped:
        header = "\n".join(lines[:stripped.index("-END HEADER-")])
        m = re.search(r"latitude\s+(-?[\d.]+)\s+longitude\s+(-?[\d.]+)", header, re.I)
        if m:
            meta["lat"], meta["lon"] = float(m.group(1)), float(m.group(2))
        e = re.search(r"=\s*(-?[\d.]+)\s*meters", header)
        if e:
            meta["elevation_m"] = float(e.group(1))
        lines = lines[stripped.index("-END HEADER-") + 1:]
    rows = list(csv.DictReader(lines))
    if not rows:
        sys.exit(f"[POWER] no data rows in {path}")
    used = pick_codes(rows[0].keys())

    days = []
    for row in rows:
        y = int(row["YEAR"])
        if "MO" in row and "DY" in row:
            d = date(y, int(row["MO"]), int(row["DY"]))
        else:
            d = date(y, 1, 1) + timedelta(days=int(row["DOY"]) - 1)
        rec = {"date": d}
        for key in SOURCES:
            rec[key] = num(row.get(used[key])) if key in used else None
        days.append(rec)
    print(f"[POWER] read {len(days)} days from {path}")
    return days, used, meta


def find_website_csv():
    if len(sys.argv) > 1:
        return sys.argv[1]
    hits = sorted(Path(".").glob("POWER_Point_Daily*.csv")) + sorted(RAW.glob("POWER_Point_Daily*.csv"))
    return str(hits[-1]) if hits else None


def write_clean_csv(days):
    cols = list(SOURCES)
    with open(CLEAN_CSV, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date"] + cols)
        for r in days:
            w.writerow([r["date"].isoformat()] + ["" if r[k] is None else r[k] for k in cols])


# ---------------- helpers ----------------
def vals(rows, key):
    return [r[key] for r in rows if r[key] is not None]


def avg(xs, nd=2):
    xs = [x for x in xs if x is not None]
    return round(mean(xs), nd) if xs else None


def total(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs), 1) if xs else None


def is_frost(r):
    return r["tmin"] is not None and r["tmin"] <= FROST_C


def is_heat(r):
    return r["tmax"] is not None and r["tmax"] >= HEAT_C


def gdd(r, base):
    if r["tmax"] is None or r["tmin"] is None:
        return 0.0
    return max(0.0, (r["tmax"] + r["tmin"]) / 2 - base)


def doy(d):
    return d.timetuple().tm_yday if d else None


def doy_label(n):
    if n is None:
        return None
    return (date(2001, 1, 1) + timedelta(days=round(n) - 1)).strftime("%b %d")


def trend(xs, ys):
    """Least-squares slope per decade + correlation r (AP Stats style)."""
    pts = [(x, y) for x, y in zip(xs, ys) if y is not None]
    if len(pts) < 5:
        return None
    mx = mean(p[0] for p in pts)
    my = mean(p[1] for p in pts)
    sxy = sum((x - mx) * (y - my) for x, y in pts)
    sxx = sum((x - mx) ** 2 for x, _ in pts)
    syy = sum((y - my) ** 2 for _, y in pts)
    slope = sxy / sxx
    r = sxy / (sxx * syy) ** 0.5 if syy > 0 else 0.0
    return {"per_decade": round(slope * 10, 2), "r": round(r, 2), "n_years": len(pts)}


# ---------------- stats ----------------
MONTH_FIELDS = ["tmax_c", "tmin_c", "precip_mm", "precip_sat_mm",
                "frost_days", "heat_days", "soil_wetness"]


def month_stats(rows):
    sat = vals(rows, "rain_sat")
    return {
        "tmax_c": avg(vals(rows, "tmax")),
        "tmin_c": avg(vals(rows, "tmin")),
        "precip_mm": total(vals(rows, "rain")),
        "precip_sat_mm": total(sat) if len(sat) >= len(rows) - 2 else None,  # skip partial months
        "frost_days": sum(is_frost(r) for r in rows),
        "heat_days": sum(is_heat(r) for r in rows),
        "soil_wetness": avg(vals(rows, "soil"), 3),
    }


def climatology(by_ym, years):
    out = []
    for m in range(1, 13):
        stats = [month_stats(by_ym[(y, m)]) for y in years if by_ym.get((y, m))]
        row = {"month": m, "name": MONTHS[m - 1]}
        for k in MONTH_FIELDS:
            row[k] = avg([s[k] for s in stats], 3 if k == "soil_wetness" else 1)
        out.append(row)
    return out


def year_stats(y, rows):
    tmean = [(r["tmax"] + r["tmin"]) / 2 for r in rows
             if r["tmax"] is not None and r["tmin"] is not None]
    spring = [r["date"] for r in rows if r["date"].month < 7 and is_frost(r)]
    fall = [r["date"] for r in rows if r["date"].month >= 7 and is_frost(r)]
    last_spring = max(spring) if spring else None
    first_fall = min(fall) if fall else None
    gs = [r for r in rows if 4 <= r["date"].month <= 9]  # Apr-Sep growing season
    sat = vals(rows, "rain_sat")

    s = {
        "year": y,
        "mean_temp_c": round(mean(tmean), 2) if tmean else None,
        "precip_mm": total(vals(rows, "rain")),
        "precip_sat_mm": total(sat) if len(sat) >= 360 else None,  # full years only
        "growing_season_precip_mm": total(vals(gs, "rain")),
        "frost_days": sum(is_frost(r) for r in rows),
        "heat_days": sum(is_heat(r) for r in rows),
        "last_spring_frost": last_spring.isoformat() if last_spring else None,
        "first_fall_frost": first_fall.isoformat() if first_fall else None,
        "last_spring_frost_doy": doy(last_spring),
        "first_fall_frost_doy": doy(first_fall),
        "frost_free_days": (first_fall - last_spring).days - 1 if last_spring and first_fall else None,
        "growing_season_soil_wetness": avg(vals(gs, "soil"), 3),
    }
    for b in GDD_BASES:
        s[f"gdd_base{b}"] = round(sum(gdd(r, b) for r in rows))
    return s


TREND_FIELDS = ["mean_temp_c", "precip_mm", "precip_sat_mm", "growing_season_precip_mm",
                "heat_days", "frost_days", "frost_free_days", "last_spring_frost_doy",
                "first_fall_frost_doy", "growing_season_soil_wetness"] + \
               [f"gdd_base{b}" for b in GDD_BASES]


# ---------------- main ----------------
def main():
    RAW.mkdir(parents=True, exist_ok=True)
    web_csv = find_website_csv()
    days, used, meta = parse_website_csv(web_csv) if web_csv else parse_api(download())
    write_clean_csv(days)

    lat = meta["lat"] if meta["lat"] is not None else LAT
    lon = meta["lon"] if meta["lon"] is not None else LON
    name = SITE_NAME
    if abs(lat - LAT) > 0.3 or abs(lon - LON) > 0.3:
        name = f"Point {lat:.2f}, {lon:.2f}"
        print(f"\n[POWER] WARNING: this data is for ({lat:.2f}, {lon:.2f}), NOT {SITE_NAME} ({LAT}, {LON}).")
        print("         Re-download with the right lat/lon, or update SITE_NAME/LAT/LON at the top.\n")

    by_year = defaultdict(list)
    by_ym = defaultdict(list)
    for r in days:
        by_year[r["date"].year].append(r)
        by_ym[(r["date"].year, r["date"].month)].append(r)

    years = [y for y in sorted(by_year) if len(by_year[y]) >= 360]  # full years only
    if len(years) <= RECENT_YEARS:
        sys.exit(f"[POWER] only {len(years)} full years - download more years (need > {RECENT_YEARS}).")
    recent = years[-RECENT_YEARS:]
    past = years[:-RECENT_YEARS]

    yearly = [year_stats(y, by_year[y]) for y in years]
    yr_past = [s for s in yearly if s["year"] in past]
    yr_recent = [s for s in yearly if s["year"] in recent]

    trends = {k: trend([s["year"] for s in yearly], [s[k] for s in yearly]) for k in TREND_FIELDS}
    compare = {}
    for k in TREND_FIELDS:
        a = avg([s[k] for s in yr_past], 3)
        b = avg([s[k] for s in yr_recent], 3)
        compare[k] = {"past": a, "recent": b,
                      "change": round(b - a, 3) if a is not None and b is not None else None}

    ff = compare["frost_free_days"]["recent"]
    summary = {
        "site": {"id": SITE_ID, "name": name, "lat": lat, "lon": lon,
                 "grid_elevation_m": meta["elevation_m"]},
        "source": "NASA POWER daily, Agroclimatology community (power.larc.nasa.gov)",
        "power_codes_used": used,
        "fields": {
            "tmax_c / tmin_c": "daily max / min air temp at 2 m (C)",
            "precip_mm": "rain + snow water (mm), POWER model-based",
            "precip_sat_mm": "rain from GPM IMERG satellite (mm), 2001+ only",
            "soil_wetness": "root-zone soil wetness, 0 = bone dry, 1 = saturated",
        },
        "years": {"all": [years[0], years[-1]],
                  "past": [past[0], past[-1]],
                  "recent": [recent[0], recent[-1]]},
        "thresholds": {"frost_c": FROST_C, "heat_c": HEAT_C, "gdd_bases_c": list(GDD_BASES)},
        "monthly_normals": climatology(by_ym, years),
        "monthly_past": climatology(by_ym, past),
        "monthly_recent": climatology(by_ym, recent),
        "frost_season_recent": {
            "avg_last_spring_frost": doy_label(compare["last_spring_frost_doy"]["recent"]),
            "avg_first_fall_frost": doy_label(compare["first_fall_frost_doy"]["recent"]),
            "avg_frost_free_days": round(ff) if ff is not None else None,
        },
        "recent_vs_past": compare,
        "trends_per_decade": trends,
        "yearly": yearly,
        "data_notes": [
            "POWER is a ~50 km grid (0.5 x 0.625 deg), not field-level. Good for regional climate, not one field.",
            "GWETROOT is modeled natural soil wetness. It does NOT include irrigation, so irrigated fields are wetter than this.",
            "Model rain (PRECTOT) and satellite rain (GPM IMERG) can disagree; comparing them shows the uncertainty.",
            "Trends use simple linear regression; r near 0 = weak/no trend. Treat trends as signals to check, not facts.",
        ],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "power_summary.json").write_text(json.dumps(summary, indent=2))

    # ---------------- readable summary ----------------
    def f(v):
        return "-" if v is None else v

    elev = f" | grid elev {meta['elevation_m']:.0f} m" if meta["elevation_m"] else ""
    print(f"\n=== {name} ({lat}, {lon}){elev} | NASA POWER {years[0]}-{years[-1]} ===\n")
    print(f"{'Month':<6}{'Tmax C':>8}{'Tmin C':>8}{'Rain mm':>9}{'Sat rain':>10}"
          f"{'Frost d':>9}{'Heat d':>8}{'Soil wet':>10}")
    for m in summary["monthly_normals"]:
        print(f"{m['name']:<6}{f(m['tmax_c']):>8}{f(m['tmin_c']):>8}{f(m['precip_mm']):>9}"
              f"{f(m['precip_sat_mm']):>10}{f(m['frost_days']):>9}{f(m['heat_days']):>8}"
              f"{f(m['soil_wetness']):>10}")

    fs = summary["frost_season_recent"]
    print(f"\nFrost-free season (last {RECENT_YEARS} yrs): ~{fs['avg_frost_free_days']} days "
          f"(last spring frost ~{fs['avg_last_spring_frost']}, first fall frost ~{fs['avg_first_fall_frost']})")

    labels = {
        "mean_temp_c": "Mean temp (C)", "precip_mm": "Yearly rain (mm)",
        "heat_days": f"Heat days (>= {HEAT_C:g} C)", "frost_days": "Frost days",
        "frost_free_days": "Frost-free days", "growing_season_soil_wetness": "Apr-Sep soil wetness",
        "gdd_base10": "GDD (base 10 C)",
    }
    print(f"\nLast {RECENT_YEARS} yrs vs {past[0]}-{past[-1]}:")
    for k, lab in labels.items():
        c = compare[k]
        if c["change"] is None:
            continue
        sign = "+" if c["change"] >= 0 else ""
        print(f"  {lab:<24} {round(c['past'], 2):>9} -> {round(c['recent'], 2):<9} "
              f"({sign}{round(c['change'], 2)})")

    print("\nTrend per decade (r = how consistent):")
    for k, lab in labels.items():
        t = trends[k]
        if t:
            print(f"  {lab:<24} {t['per_decade']:>+8} /decade   r = {t['r']}")

    print(f"\nSaved: {OUT / 'power_summary.json'}  and  {CLEAN_CSV}")


if __name__ == "__main__":
    main()

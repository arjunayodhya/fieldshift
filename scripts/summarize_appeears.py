"""
Field Shift - summarize AppEEARS downloads for the web page
Reads the point-sample CSVs that scripts/get_data.py saves in data/raw/:
  - MODIS MOD13Q1 NDVI (crop greenness, 250 m pixel, every 16 days)
  - SMAP SPL3SMP_E soil moisture (top ~5 cm of soil, ~9 km grid, daily)
and writes one small file the page loads: data/field_summary.json

  python scripts/summarize_appeears.py        (run from the repo root)

Optional arguments (used for testing): raw folder, output folder
  python scripts/summarize_appeears.py some/raw some/out

AI disclosure: this script was written with help from Claude (Anthropic).
"""
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

RAW = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/raw")
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data")
POWER_SUMMARY = Path("data/power_summary.json")
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MIN_OBS_PER_YEAR = 6      # skip a year's summer value if it has almost no data


def find_csv(*needles):
    for p in sorted(RAW.glob("*.csv")):
        if all(n.lower() in p.name.lower() for n in needles):
            return p
    return None


def find_col(header, *needles, exclude=()):
    """First column whose name contains every needle (case-insensitive)."""
    for h in header:
        low = h.lower()
        if all(n.lower() in low for n in needles) and not any(x.lower() in low for x in exclude):
            return h
    return None


def parse_date(s):
    y, m, d = s.strip()[:10].split("-")
    return int(y), int(m), int(d)


def avg(vals, nd=3):
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), nd) if vals else None


def pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        return None
    return round(sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sxx * syy) ** 0.5, 2)


def read_series(path, value_needles, lo, hi, quality=None):
    """Return [(year, month, value)] keeping only values inside (lo, hi)."""
    rows, kept, dropped = [], 0, 0
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames or []
        col = find_col(header, *value_needles, exclude=("quality", "reliability", "bitmask", "description", "modland", "_qa"))
        if not col:
            sys.exit(f"[summarize] no column like {value_needles} in {path.name}. Columns: {header}")
        qcol = find_col(header, *quality[0]) if quality else None
        for r in reader:
            try:
                v = float(r[col])
                y, m, _ = parse_date(r["Date"])
            except (ValueError, KeyError, TypeError):
                dropped += 1
                continue
            ok = lo < v < hi
            if ok and qcol and r.get(qcol, "") != "":
                try:
                    ok = float(r[qcol]) in quality[1]
                except ValueError:
                    pass
            if ok:
                rows.append((y, m, v))
                kept += 1
            else:
                dropped += 1
    print(f"[summarize] {path.name}: column '{col}', kept {kept}, dropped {dropped}")
    return rows, col, kept, dropped


def monthly_and_yearly(rows, summer=(7, 8), season=(4, 5, 6, 7, 8, 9, 10)):
    by_month = defaultdict(list)
    by_year = defaultdict(lambda: defaultdict(list))
    for y, m, v in rows:
        by_month[m].append(v)
        by_year[y][m].append(v)
    monthly = [{"month": m, "name": MONTHS[m - 1], "value": avg(by_month[m]), "n": len(by_month[m])} for m in range(1, 13)]
    yearly = []
    for y in sorted(by_year):
        mm = by_year[y]
        n = sum(len(v) for v in mm.values())
        if n < MIN_OBS_PER_YEAR:
            continue
        yearly.append({
            "year": y,
            "n": n,
            "peak_summer": avg([v for m in summer for v in mm.get(m, [])]),
            "june": avg(mm.get(6, [])),
            "growing_season": avg([v for m in season for v in mm.get(m, [])]),
        })
    return monthly, yearly


def main():
    out = {
        "source": "NASA AppEEARS point sample (appeears.earthdatacloud.nasa.gov)",
        "data_notes": [],
    }
    power_years = {}
    if POWER_SUMMARY.exists():
        ps = json.loads(POWER_SUMMARY.read_text())
        out["site"] = ps.get("site")
        power_years = {y["year"]: y for y in ps.get("yearly", [])}

    # ---------- MODIS NDVI ----------
    ndvi_csv = find_csv("MOD13Q1")
    if ndvi_csv:
        # AppEEARS applies the scale factor, so NDVI is -0.2..1 (fill value becomes -0.3).
        # pixel_reliability: 0 = good, 1 = marginal, 2 = snow/ice, 3 = cloudy
        rows, col, kept, dropped = read_series(
            ndvi_csv, ("ndvi",), -0.2, 1.0001, quality=(("pixel_reliability",), (0.0, 1.0)))
        monthly, yearly = monthly_and_yearly(rows)
        peak_month = max((m for m in monthly if m["value"] is not None), key=lambda m: m["value"], default=None)
        pairs = [(power_years[y["year"]]["heat_days"], y["peak_summer"]) for y in yearly
                 if y["year"] in power_years and y["peak_summer"] is not None]
        out["ndvi"] = {
            "product": col.split("__")[0] if "__" in col else "MOD13Q1",
            "what": "NDVI crop greenness, 0 = bare soil, about 0.8+ = dense green crop. One 250 m pixel at the site point, every 16 days.",
            "years": [yearly[0]["year"], yearly[-1]["year"]] if yearly else None,
            "observations_used": kept,
            "observations_dropped": dropped,
            "monthly": monthly,
            "yearly": yearly,
            "peak_month": peak_month["name"] if peak_month else None,
            "june_avg": monthly[5]["value"],
            "jul_aug_avg": avg([monthly[6]["value"], monthly[7]["value"]]),
            "heat_vs_summer_greenness": {
                "r": pearson([p[0] for p in pairs], [p[1] for p in pairs]) if pairs else None,
                "n_years": len(pairs),
                "note": "Correlation between very hot days in a year (NASA POWER) and Jul-Aug NDVI. Few years, so treat as a hint only.",
            },
        }
        out["data_notes"].append(
            "NDVI is from one 250 m MODIS pixel at the site point. It may cover parts of several fields, roads or bare ground, so it shows the area's pattern, not one field's yield.")
        out["data_notes"].append(
            "Alfalfa is cut several times a summer, and each cutting drops NDVI for a couple of weeks. A summer dip can be cuttings, heat stress, or both.")
    else:
        print(f"[summarize] no MOD13Q1 csv in {RAW} (is the AppEEARS job finished?)")

    # ---------- SMAP soil moisture ----------
    smap_csv = find_csv("SPL3SMP")
    if smap_csv:
        # volumetric soil moisture, m3/m3; fill value is -9999
        rows, col, kept, dropped = read_series(smap_csv, ("soil_moisture",), 0.0, 0.9)
        monthly, yearly = monthly_and_yearly(rows, summer=(7, 8), season=(4, 5, 6, 7, 8, 9, 10))
        out["smap"] = {
            "product": "SPL3SMP_E",
            "what": "Soil moisture in the top ~5 cm, as a fraction of soil volume (m3/m3). About 9 km grid, so it mixes irrigated fields and dry desert.",
            "years": [yearly[0]["year"], yearly[-1]["year"]] if yearly else None,
            "observations_used": kept,
            "observations_dropped": dropped,
            "monthly": monthly,
            "yearly": yearly,
            "driest_month": min((m for m in monthly if m["value"] is not None), key=lambda m: m["value"], default={}).get("name"),
            "wettest_month": max((m for m in monthly if m["value"] is not None), key=lambda m: m["value"], default={}).get("name"),
        }
        out["data_notes"].append(
            "SMAP sees only the top ~5 cm of soil over a ~9 km area. It does not show root-zone water or any single field.")
    else:
        print(f"[summarize] no SPL3SMP csv in {RAW} (is the AppEEARS job finished?)")

    if "ndvi" not in out and "smap" not in out:
        sys.exit("[summarize] nothing to summarize yet")

    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / "field_summary.json"
    dest.write_text(json.dumps(out, indent=2))
    print(f"[summarize] saved {dest}")


if __name__ == "__main__":
    main()

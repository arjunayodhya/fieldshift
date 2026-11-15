"""
Field Shift - crop history for the study field
Asks the USDA NASS Cropland Data Layer (CropScape) what crop was mapped at the
field point each year, and how much of the surrounding 250 m is the same crop.
This tells us (1) the point really is an alfalfa field and (2) which years of
satellite greenness (NDVI) are alfalfa years.

No login needed.

  pip install requests
  python scripts/get_crop_history.py        (run from the repo root)

Output: data/field.json

How the field was chosen: we scanned a ~1 km grid around Fallon in the 2024
Cropland Data Layer, then picked the alfalfa point nearest the climate site
with the longest alfalfa history and alfalfa on all sides (so the 250 m MODIS
pixel sits inside one field).

AI disclosure: this script was written with help from Claude (Anthropic).
"""
import json
import math
import re
from pathlib import Path

import requests

# ---------------- settings (change these) ----------------
FIELD_LAT, FIELD_LON = 39.45, -118.80      # middle of the study field
YEARS = range(2015, 2026)
NEIGHBOUR_YEAR = 2024                      # year used to check the field's size
OUT = Path("data")
CDL = "https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue"
# ---------------------------------------------------------

# CropScape wants x/y in USA Contiguous Albers Equal Area (EPSG:5070), NAD83.
_A, _F = 6378137.0, 1 / 298.257222101
_E2 = 2 * _F - _F * _F
_E = math.sqrt(_E2)


def _q(phi):
    s = math.sin(phi)
    return (1 - _E2) * (s / (1 - _E2 * s * s) - (1 / (2 * _E)) * math.log((1 - _E * s) / (1 + _E * s)))


def _m(phi):
    return math.cos(phi) / math.sqrt(1 - _E2 * math.sin(phi) ** 2)


_P1, _P2, _P0, _L0 = (math.radians(x) for x in (29.5, 45.5, 23.0, -96.0))
_N = (_m(_P1) ** 2 - _m(_P2) ** 2) / (_q(_P2) - _q(_P1))
_C = _m(_P1) ** 2 + _N * _q(_P1)
_RHO0 = _A * math.sqrt(_C - _N * _q(_P0)) / _N


def albers(lat, lon):
    rho = _A * math.sqrt(_C - _N * _q(math.radians(lat))) / _N
    theta = _N * (math.radians(lon) - _L0)
    return rho * math.sin(theta), _RHO0 - rho * math.cos(theta)


def crop_at(year, lat, lon):
    x, y = albers(lat, lon)
    for attempt in range(3):
        try:
            r = requests.get(CDL, params={"year": year, "x": round(x, 1), "y": round(y, 1)}, timeout=60)
            m = re.search(r'category: "([^"]*)"', r.text)
            if m:
                return m.group(1)
        except requests.RequestException:
            pass
    return None


def main():
    history = {}
    for y in YEARS:
        history[str(y)] = crop_at(y, FIELD_LAT, FIELD_LON)
        print(f"[crop] {y}: {history[str(y)]}")

    # same crop 125 m and 250 m away in 8 directions?
    d_lat = 125 / 111320
    d_lon = 125 / (111320 * math.cos(math.radians(FIELD_LAT)))
    dirs = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]
    centre = history.get(str(NEIGHBOUR_YEAR))
    same = {}
    for k, label in ((1, "125m"), (2, "250m")):
        hits = sum(crop_at(NEIGHBOUR_YEAR, FIELD_LAT + a * k * d_lat, FIELD_LON + b * k * d_lon) == centre for a, b in dirs)
        same[label] = hits
        print(f"[crop] {label} away: {hits}/8 points are also {centre}")

    alfalfa_years = [int(y) for y, c in history.items() if c == "Alfalfa"]
    out = {
        "lat": FIELD_LAT,
        "lon": FIELD_LON,
        "source": "USDA NASS Cropland Data Layer (CropScape), nassgeodata.gmu.edu/CropScape",
        "crop_history": history,
        "alfalfa_years": alfalfa_years,
        "field_size_check": {
            "year": NEIGHBOUR_YEAR,
            "crop": centre,
            "same_crop_125m": same["125m"],
            "same_crop_250m": same["250m"],
            "of": 8,
        },
        "data_notes": [
            "The Cropland Data Layer is a satellite-based map with 30 m squares. It is usually right for major crops like alfalfa but can be wrong in any one year.",
            "This field was picked from the map to study how alfalfa looks from space. It is an example field, not a specific farmer's field.",
        ],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "field.json").write_text(json.dumps(out, indent=2))
    print(f"[crop] alfalfa years: {alfalfa_years} -> {OUT / 'field.json'}")


if __name__ == "__main__":
    main()

"""
Field Shift - local soil lookup
Asks the USDA NRCS Soil Data Access service (SSURGO soil survey) which soil is
mapped at the farm point, and saves a small summary the web page can load.

No login needed.

  pip install requests
  python scripts/get_soil.py        (run from the repo root)

Output: data/soil.json

AI disclosure: this script was written with help from Claude (Anthropic).
"""
import json
import sys
from pathlib import Path

import requests

# ---------------- settings (change these) ----------------
SITE_ID = "fallon_nv"
LAT, LON = 39.47, -118.78
OUT = Path("data")
SDA = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest"
ROOT_ZONE_CM = 100   # depth used for the root-zone averages
# ---------------------------------------------------------

QUERY = f"""
SELECT mu.mukey, mu.musym, mu.muname, c.compname, c.comppct_r, c.taxclname,
       c.drainagecl, ch.hzdept_r, ch.hzdepb_r, ch.sandtotal_r, ch.silttotal_r,
       ch.claytotal_r, ch.om_r, ch.ec_r, ch.sar_r, ch.ph1to1h2o_r, ch.awc_r
FROM mapunit mu
JOIN component c ON c.mukey = mu.mukey
JOIN chorizon ch ON ch.cokey = c.cokey
WHERE mu.mukey IN (
  SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point({LON} {LAT})'))
  AND c.majcompflag = 'Yes'
ORDER BY c.comppct_r DESC, ch.hzdept_r
"""


def num(x):
    return None if x in (None, "") else float(x)


def texture_class(sand, clay):
    """Very rough plain-language texture from sand and clay percent."""
    if sand is None or clay is None:
        return "unknown"
    if sand >= 70 and clay < 15:
        return "sandy"
    if clay >= 35:
        return "clay"
    return "loam"


def main():
    r = requests.post(SDA, json={"format": "JSON+COLUMNNAME", "query": QUERY}, timeout=90)
    r.raise_for_status()
    table = r.json().get("Table", [])
    if len(table) < 2:
        sys.exit("[soil] no soil survey data at this point")
    cols, rows = table[0], [dict(zip(table[0], row)) for row in table[1:]]

    # keep the main (largest) soil component only
    main_comp = rows[0]["compname"]
    rows = [x for x in rows if x["compname"] == main_comp]

    horizons = []
    for x in rows:
        horizons.append({
            "top_cm": num(x["hzdept_r"]), "bottom_cm": num(x["hzdepb_r"]),
            "sand_pct": num(x["sandtotal_r"]), "silt_pct": num(x["silttotal_r"]),
            "clay_pct": num(x["claytotal_r"]), "organic_matter_pct": num(x["om_r"]),
            "ec_dsm": num(x["ec_r"]), "sar": num(x["sar_r"]),
            "ph": num(x["ph1to1h2o_r"]), "awc_cm_per_cm": num(x["awc_r"]),
        })

    def root_zone(field, mode="avg"):
        """Thickness-weighted average (or max) over the top ROOT_ZONE_CM."""
        tot, wsum, vals = 0.0, 0.0, []
        for h in horizons:
            thick = min(h["bottom_cm"], ROOT_ZONE_CM) - h["top_cm"]
            if thick <= 0 or h[field] is None:
                continue
            tot += thick
            wsum += thick * h[field]
            vals.append(h[field])
        if not vals:
            return None
        return max(vals) if mode == "max" else round(wsum / tot, 2)

    top = horizons[0]
    awc = root_zone("awc_cm_per_cm")
    summary = {
        "site": {"id": SITE_ID, "lat": LAT, "lon": LON},
        "source": "USDA NRCS Soil Data Access (SSURGO soil survey), sdmdataaccess.sc.egov.usda.gov",
        "map_unit": rows[0]["muname"],
        "map_unit_key": rows[0]["mukey"],
        "soil_name": main_comp,
        "share_of_map_unit_pct": num(rows[0]["comppct_r"]),
        "classification": rows[0]["taxclname"],
        "drainage": rows[0]["drainagecl"],
        "texture": texture_class(top["sand_pct"], top["clay_pct"]),
        "topsoil": {k: top[k] for k in ("sand_pct", "silt_pct", "clay_pct", "organic_matter_pct", "ph")},
        "root_zone_cm": ROOT_ZONE_CM,
        "root_zone": {
            "ec_dsm_max": root_zone("ec_dsm", "max"),
            "sar_max": root_zone("sar", "max"),
            "ph_max": root_zone("ph", "max"),
            "awc_cm_per_cm": awc,
            "water_held_in": None if awc is None else round(awc * ROOT_ZONE_CM / 2.54, 1),
        },
        "horizons": horizons,
        "data_notes": [
            "This is the soil the USDA survey maps at the site point. Soil can change within one field, so a lab test of your own soil is better.",
            "Survey values are typical ('representative') values for this soil type, not measurements from this farm.",
            "Salt levels on irrigated desert fields change with irrigation water and drainage. The survey value may be out of date.",
        ],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "soil.json").write_text(json.dumps(summary, indent=2))
    print(f"[soil] {summary['map_unit']}: {summary['texture']}, "
          f"EC {summary['root_zone']['ec_dsm_max']} dS/m -> {OUT / 'soil.json'}")


if __name__ == "__main__":
    main()

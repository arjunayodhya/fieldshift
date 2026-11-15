"""
Field Shift - data downloader
Pulls, for one farm point:
  - NASA POWER daily: max/min temp, rain, root-zone soil moisture (no login needed)
  - AppEEARS point sample: MODIS NDVI + SMAP soil moisture (needs Earthdata login)

Setup:
  pip install requests

  Put your Earthdata token in an environment variable (NEVER paste it into code / GitHub):
    mac/linux:          export EARTHDATA_TOKEN="paste_token_here"
    windows powershell: $env:EARTHDATA_TOKEN="paste_token_here"

  python get_data.py

AppEEARS jobs can take minutes to hours. If you stop the script, just re-run it:
it remembers the job id and picks up where it left off.

Output: data/raw/*.csv

AI disclosure: this script was written with help from Claude (Anthropic).
"""
import csv
import getpass
import os
import sys
import time
from pathlib import Path

import requests

# ---------------- settings (change these) ----------------
SITE_ID = "fallon_nv"
LAT, LON = 39.47, -118.78          # farm location
START = "2015-01-01"               # SMAP starts ~April 2015
END = "2026-10-31"
OUT = Path("data/raw")
POLL_SECONDS = 30

POWER_PARAMS = ["T2M_MAX", "T2M_MIN", "PRECTOTCORR", "GWETROOT"]
APPEEARS = "https://appeears.earthdatacloud.nasa.gov/api/"
TASK_FILE = OUT / f"appeears_task_{SITE_ID}.txt"
# ---------------------------------------------------------


# ===================== NASA POWER =====================
def get_power():
    out = OUT / f"power_daily_{SITE_ID}.csv"
    if out.exists():
        print(f"[POWER] already have {out}, skipping")
        return

    print("[POWER] downloading daily data...")
    r = requests.get(
        "https://power.larc.nasa.gov/api/temporal/daily/point",
        params={
            "parameters": ",".join(POWER_PARAMS),
            "community": "AG",
            "latitude": LAT,
            "longitude": LON,
            "start": START.replace("-", ""),
            "end": END.replace("-", ""),
            "format": "JSON",
        },
        timeout=300,
    )
    r.raise_for_status()
    p = r.json()["properties"]["parameter"]
    dates = sorted(p[POWER_PARAMS[0]].keys())

    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date"] + POWER_PARAMS)
        for d in dates:
            row = [f"{d[:4]}-{d[4:6]}-{d[6:]}"]
            for k in POWER_PARAMS:
                v = p[k].get(d)
                row.append("" if v is None or v <= -999 else v)  # -999 = missing
            w.writerow(row)

    print(f"[POWER] saved {len(dates)} days -> {out}")


# ===================== AppEEARS =====================
def appeears_headers():
    tok = os.environ.get("EARTHDATA_TOKEN", "").strip()
    if tok:
        h = {"Authorization": f"Bearer {tok}"}
        r = requests.get(APPEEARS + "task", headers=h, timeout=60)
        if r.ok:
            print("[AppEEARS] token OK")
            return h
        print(f"[AppEEARS] token rejected ({r.status_code}), using username/password instead")
    else:
        print("[AppEEARS] no EARTHDATA_TOKEN set, using username/password")

    user = input("Earthdata username: ").strip()
    pw = getpass.getpass("Earthdata password: ")
    r = requests.post(APPEEARS + "login", auth=(user, pw), timeout=60)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def latest_product(prefix):
    prods = requests.get(APPEEARS + "product", timeout=60).json()
    matches = sorted(
        p["ProductAndVersion"] for p in prods
        if p["ProductAndVersion"].startswith(prefix + ".")
    )
    if not matches:
        sys.exit(f"[AppEEARS] product {prefix} not found")
    return matches[-1]


def pick_layer(product, want):
    names = list(requests.get(APPEEARS + f"product/{product}", timeout=60).json().keys())
    for n in names:
        if n.endswith(want):
            return n
    for n in names:
        if want.lower() in n.lower():
            return n
    sys.exit(f"[AppEEARS] no layer like '{want}' in {product}. Layers: {names}")


def mdy(iso):
    y, m, d = iso.split("-")
    return f"{m}-{d}-{y}"  # AppEEARS wants MM-DD-YYYY


def submit_task(h):
    ndvi_prod = latest_product("MOD13Q1")
    smap_prod = latest_product("SPL3SMP_E")
    ndvi_layer = pick_layer(ndvi_prod, "_250m_16_days_NDVI")
    smap_layer = pick_layer(smap_prod, "AM_soil_moisture")
    print(f"[AppEEARS] layers: {ndvi_prod}/{ndvi_layer}, {smap_prod}/{smap_layer}")

    task = {
        "task_type": "point",
        "task_name": f"fieldshift_{SITE_ID}",
        "params": {
            "dates": [{"startDate": mdy(START), "endDate": mdy(END)}],
            "layers": [
                {"product": ndvi_prod, "layer": ndvi_layer},
                {"product": smap_prod, "layer": smap_layer},
            ],
            "coordinates": [
                {"id": SITE_ID, "category": "farm", "latitude": LAT, "longitude": LON}
            ],
        },
    }
    r = requests.post(APPEEARS + "task", json=task, headers=h, timeout=60)
    if not r.ok:
        sys.exit(f"[AppEEARS] submit failed ({r.status_code}): {r.text}")
    task_id = r.json()["task_id"]
    TASK_FILE.write_text(task_id)
    print(f"[AppEEARS] submitted task {task_id}")
    return task_id


def wait_for(task_id, h):
    while True:
        r = requests.get(APPEEARS + f"task/{task_id}", headers=h, timeout=60)
        r.raise_for_status()
        status = r.json().get("status")
        print(f"[AppEEARS] {time.strftime('%H:%M:%S')} status: {status}")
        if status == "done":
            return
        if status in ("error", "expired", "deleted"):
            TASK_FILE.unlink(missing_ok=True)
            sys.exit(f"[AppEEARS] task {status}. Re-run to submit a new one.")
        time.sleep(POLL_SECONDS)


def download(task_id, h):
    bundle = requests.get(APPEEARS + f"bundle/{task_id}", headers=h, timeout=60).json()
    got = 0
    for f in bundle["files"]:
        name = Path(f["file_name"]).name
        if not name.endswith(".csv"):
            continue
        dest = OUT / name
        with requests.get(
            APPEEARS + f"bundle/{task_id}/{f['file_id']}",
            headers=h, stream=True, allow_redirects=True, timeout=300,
        ) as r:
            r.raise_for_status()
            with open(dest, "wb") as fh:
                for chunk in r.iter_content(1 << 20):
                    fh.write(chunk)
        print(f"[AppEEARS] saved {dest}")
        got += 1
    if got == 0:
        print("[AppEEARS] no CSVs in bundle?? check the AppEEARS website")


def get_appeears():
    h = appeears_headers()
    if TASK_FILE.exists():
        task_id = TASK_FILE.read_text().strip()
        print(f"[AppEEARS] resuming task {task_id}")
    else:
        task_id = submit_task(h)
    wait_for(task_id, h)
    download(task_id, h)


# ===================== main =====================
if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    get_power()
    get_appeears()
    print(f"\nDone. Files are in {OUT.resolve()}")

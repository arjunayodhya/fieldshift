# Field Shift: Adapting Farms with NASA Data

NASA Space Apps Challenge 2026 project. A decision-support web page that helps a farmer see how the climate
has changed on their land and find a crop rotation that fits their soil, their water and their own priorities.

**Site:** alfalfa farm area near Fallon, Nevada.

- **Climate point:** 39.47° N, 118.78° W (the NASA POWER grid cell, about 50 km across, covers the whole valley).
- **Study field:** 39.45° N, 118.80° W, about 3 km away. The climate point itself sits in the town of Fallon, so soil and
  crop greenness are taken at a real field instead. The USDA Cropland Data Layer maps this field as alfalfa every year
  from 2017 to 2024, with alfalfa on all sides out to 250 m. It is an example field picked from the map, not a
  specific farmer's field.

## How it answers the challenge

| The challenge asks for | Where it is in the tool |
|---|---|
| NASA Earth observations | NASA POWER (35 years of temperature, frost, heat, soil wetness), GPM IMERG satellite rain, and, once downloaded, MODIS NDVI and SMAP soil moisture |
| Local soil information | USDA soil survey (SSURGO) for the study field: texture, salt, organic matter, water-holding capacity, drainage |
| Crop characteristics | Crop traits table with linked sources |
| Farmer priorities | Five sliders (water, heat, soil health, known buyers, ease of change) that re-rank the rotations |
| Rotation strategies | Five multi-year rotations, including break-crop years |
| Strengthen soil health | A soil health score for each rotation, built on the USDA NRCS soil health principles |
| Adapt to changing conditions | "What's changed" cards and evidence tying each rotation to the Jul–Aug heat |

## What the page shows

1. **Month by month.** Very hot days (≥ 35 °C / 95 °F), frost days, and rain/snow for each month,
   with Jul–Aug (peak heat stress) shaded. You can switch between the last 10 years, 1991–2015, and all 35 years.
2. **What satellites see on the ground.** MODIS crop greenness (NDVI) and SMAP topsoil moisture by month.
   This section appears only when `data/field_summary.json` exists.
3. **What's changed.** Cards comparing 2016–2025 with 1991–2015, with a "How sure?" rating from the 35-year trend.
4. **Your soil.** What the USDA soil survey maps at the site, and what it means for crop choice.
5. **Find a rotation that fits your farm.**
   - *What matters most to you?* Five sliders. The ranking and the default comparison update as they move, and the
     settings are remembered in the browser.
   - *All options at a glance.* Field calendars for each phase of the rotation, average water per year, Jul–Aug water,
     very hot days while irrigating, soil health score, and effort to switch.
   - *Look closer.* The current plan next to one option: **why, evidence from NASA data, soil health, notes for
     your soil, benefits, risks, and data gaps**.
6. **Crop traits.** Season, base temperature, heat and frost tolerance, water use, salt tolerance, market, and sources.
7. **Data limits.** Plain-language caveats, taken from `data_notes` in the data file.

The rotations compared:

| Rotation | Idea |
|---|---|
| Alfalfa every year, full water | The current plan (baseline) |
| Alfalfa every year, skip water in Jul–Aug | Stop irrigating in the peak heat months |
| 4 years alfalfa, then 1 year winter triticale (teff too if water allows) | A cool-season break year that also fixes alfalfa-after-alfalfa problems |
| 4 years alfalfa, then 1 year sorghum-sudangrass | A heat-loving break crop |
| No alfalfa: winter triticale every year, teff in good water years | The most flexible in drought years |

### How the scores work

Scores run 0–100 and are a simple index our team defined to compare options. **They are not predictions of yield or profit.**
The full wording is in `scoring_notes` in `data/crops.json` and under "How the scores work" on the page.

| Score | Based on |
|---|---|
| Water | Middle of the rotation's yearly water range (from sources). 0 in = 100, 60 in or more = 0 |
| Heat | Share of the year's very hot days (NASA POWER) that fall in irrigated months, weighted by each crop's heat sensitivity (our rating) |
| Soil | Average of: months the ground has a crop on it, how seldom it is replanted, number of different crops, share of years with a legume, and salt fit with the soil survey |
| Market | Our rating of how established the buyers are |
| Ease | Our rating of how big the change is |

The fit score is the average of these, weighted by the farmer's sliders. Where teff is grown "only in good water years",
scores assume one year in two. "Our rating" values are team judgment and are labelled that way on the page.

Key findings for this site:
- Very hot days rose from about **36 to 54 per year**. Average temperature is up **0.84 °C (1.5 °F)**.
- **Jul–Aug** is the peak stress window.
- Summer rain is close to zero, so **irrigation drives crop water use**.
- At a nearby alfalfa field, satellite greenness in Jul–Aug was **lower in hotter summers** (r = −0.70 over 8 years; small sample).
- The POWER model rain (`PRECTOTCORR`) reads too wet (~8 in/yr). GPM IMERG satellite rain (~5–6 in/yr)
  matches the Fallon station (~5 in/yr) better.

### What the MODIS and SMAP downloads showed (2026-11-15)

- **NDVI at the study field (MODIS MOD13Q1, alfalfa years 2017–2024, 175 readings):** greenness peaks at 0.88 and
  shows the saw-tooth of alfalfa cuttings, so this is a real crop signal.
  - On average, Jul–Aug greenness (0.67) is about the same as June (0.69). There is no steady summer dip.
  - Across the eight alfalfa years, hotter summers had lower Jul–Aug greenness (r = −0.70). Coolest summer
    (2023, 31 very hot days): 0.75. Hottest (2021, 70 days): 0.46.
  - Limits: eight years, one field, greenness is not yield, cutting dates shift the readings, and hot years are
    often short-water years, so heat and irrigation supply cannot be separated. Treat it as a sign worth checking.
- **First attempt (town point):** the first download sampled 39.47, −118.78, which the USDA crop map classes as
  developed land. NDVI there never rose above 0.32. That file is kept in `data/raw/` but no longer used.
- **Soil moisture (SMAP SPL3SMP_E, 2015–2026):** topsoil is driest in Jun–Sep (0.11) and wettest in winter (0.14).
  SMAP marks every reading used here as below its recommended quality, and 2,425 of 4,148 days had no usable reading.
  SMAP was sampled at the town point; its grid is about 9 km, so it covers the study field too.

## Data

| File | Made by | What it is |
|---|---|---|
| `data/power_summary.json` | `scripts/get_power.py` | 35 years (1991–2025) of NASA POWER daily data, summarized: monthly normals, frost season, heat days, GDD, recent-vs-past, trends, `data_notes` |
| `data/field.json` | `scripts/get_crop_history.py` | USDA NASS Cropland Data Layer: crop mapped at the study field each year 2015–2025, and a check that the field is big enough for a 250 m pixel. No login needed |
| `data/soil.json` | `scripts/get_soil.py` | USDA NRCS soil survey (SSURGO) for the study field: texture, salt (EC), organic matter, pH, water-holding capacity, drainage. No login needed |
| `data/crops.json` | hand-written (AI-assisted) | Crop traits, multi-year rotations, scoring notes, linked sources. **Not NASA data** (see source check below) |
| `data/raw/` | `scripts/get_data.py` | AppEEARS downloads (MODIS NDVI + SMAP soil moisture). Not committed |
| `data/field_summary.json` | `scripts/summarize_appeears.py` | Monthly and yearly NDVI and SMAP summaries from the files in `data/raw/`. Optional: the page hides that section until this file exists |

Sources: [NASA POWER](https://power.larc.nasa.gov) (Agroclimatology community), GPM IMERG via POWER,
[AppEEARS](https://appeears.earthdatacloud.nasa.gov) for MODIS and SMAP, 
[USDA NRCS Soil Data Access](https://sdmdataaccess.sc.egov.usda.gov/) for the soil survey, and the
[USDA NASS Cropland Data Layer](https://nassgeodata.gmu.edu/CropScape/) for crop history.

### How the rotation evidence is built

- **From NASA data (computed live in `compare.js`):** very hot days and satellite rain during each option's irrigated
  months, the share of very hot days that fall in Jul–Aug, and cool-season vs. summer rain. Text in `crops.json`
  can use placeholders such as `{peak_pct}`, `{year_heat}`, `{heat_was}`, `{summer_rain}`, `{winter_rain}`, and `{frost_last}`,
  which are filled in from `power_summary.json`.
- **From `crops.json` (not NASA data):** water use ranges, base temperatures, heat/frost/salt tolerance, markets,
  benefits, and risks, each tied to a listed source.

### Crop numbers: source check (2026-11-14)

The crop numbers in `data/crops.json` were checked against published sources, with AI help. Each crop lists its
`sources` (with links), a `verified` value (`true` or `"partly"`), and a `check_note` saying what was found.
The page shows all of this in the crop table.

What the check changed:

| Item | Before | After | Source |
|---|---|---|---|
| Alfalfa water | 42–54 in | 38–48 in (crop needs 3.2 ft at Fallon; 3.5–4.0 acre-ft normally applied) | NV ET report; UNR FS-05-28 |
| Teff water | 18–26 in | 32–44 in (2.7–3.7 acre-ft applied in Nevada fields) | UNR FS-07-29, FS-05-28 |
| Triticale water | 14–20 in | "up to 25 in" (winter wheat to grain, 2.1 ft at Fallon; no forage figure found) | NV ET report |
| Sorghum-sudangrass water | 24–32 in | 16–33 in (high end in hot, dry climates) | USU, Nebraska Extension |
| Skipping Jul–Aug water | "about a third" saved | 6–18 in saved; 0.3–1.4 tons/acre lost; no stand effect next year | Orloff et al. 2005 (UC) |
| Sorghum-sudangrass salt | 6.8 dS/m | sudangrass 2.8, grain sorghum 6.8 | FAO Table A1.1 |

Confirmed unchanged: alfalfa salt threshold 2.0 dS/m, triticale 6.1 dS/m, base temperatures 41 / 32 / 50 °F,
teff timing, cuttings and horse-hay market, and the horse and prussic-acid warnings for sorghum-sudangrass.

**The teff correction changed a conclusion:** triticale plus teff uses as much water as alfalfa or more. That option
is now presented as a flexibility tool (triticale only in short water years), not a water saver.

Still open (marked "Partly" on the page):
- Water use of triticale cut for forage at Fallon.
- Teff base temperature and salt tolerance.
- A Fallon water-use figure for sorghum-sudangrass.
- Our assumed calendars (irrigation months, triticale harvest in late May).

Sources with `"read": "summary"` in `crops.json` were checked from a search summary only, not the full page.
A team member should open those links and confirm before submission. The deficit-irrigation trials were in northern
California and Oregon, not Nevada.

### Regenerating the data

```bash
python scripts/get_power.py
```

`get_data.py` needs a NASA Earthdata token in an environment variable. **Never put the token in code or commit it.**

```powershell
$env:EARTHDATA_TOKEN="paste_token_here"   # Windows PowerShell
python scripts/get_data.py
```

```bash
export EARTHDATA_TOKEN="paste_token_here" # macOS / Linux
python scripts/get_data.py
```

When the AppEEARS job has finished and the CSVs are in `data/raw/`, build the summary the page loads:

```bash
python scripts/summarize_appeears.py
```

The soil and crop-history lookups need no login:

```bash
python scripts/get_soil.py
```

```bash
python scripts/get_crop_history.py
```

Run all scripts from the repo root so output goes to `data/`. They need `pip install requests`.

## Running locally

The page loads its JSON with `fetch`, so opening `index.html` straight from disk won't work. Start a local server from the repo root:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. With Node instead of Python: `npx http-server -p 8000`.

## Deploying (GitHub Pages)

It's a static site with no build step. Push to GitHub, then go to **Settings → Pages → Deploy from branch** and choose `main` / root.
Chart.js 4.4.1 loads from cdnjs.

## Files

```
index.html      page layout
styles.css      styles (light + dark mode)
app.js          loads the JSON, draws climate charts, satellite section, cards, and limits
compare.js      soil card, priorities, ranking and scores, rotation comparison, crop traits
data/           power_summary.json (NASA climate), soil.json (USDA soil), crops.json (crops, rotations),
                field_summary.json (NDVI + SMAP, optional)
scripts/        Python data pipeline (POWER, AppEEARS, soil survey, AppEEARS summary)
```

## Roadmap

- Spot-check the summary-only sources and fill the open items in the crop source check (see above).
- Add local data: field water allocation, a lab soil test, hay prices.
- Let the farmer pick their own location (rerun the scripts for a new point) and build their own rotation.
- Have a local agronomist review the heat-sensitivity and market ratings used in the scores.

## AI-use note

As required by NASA Space Apps, we disclose our AI use:

- **What:** An AI coding assistant (Claude by Anthropic, via Claude Code) helped draft the web page code
  (`index.html`, `styles.css`, `app.js`, `compare.js`) and this README.
- **Crop content:** The AI also drafted `data/crops.json`: crop traits, the rotation options, and their benefits,
  risks, and data gaps. It then checked those numbers against published sources (listed with links in the file and
  on the page) and corrected several. These are **not** NASA data. Items without a local source are marked "Partly".
- **Scores:** The AI proposed the scoring method (see "How the scores work"), including the heat-sensitivity,
  market and ease ratings. These are judgment values, labelled "our rating", and need review by the team.
- **Data scripts:** The AI also wrote `scripts/get_soil.py`, `scripts/get_crop_history.py` and
  `scripts/summarize_appeears.py`, and chose the study field by scanning the USDA crop map (method in
  `get_crop_history.py`).
- **What it did not do:** It did not create or change any NASA data. Every climate number on the page is read from
  `data/power_summary.json`, which our Python scripts produce from NASA POWER downloads.
- **Human review:** Our team reviewed and edited all AI-assisted code and text, checked the numbers shown
  against the JSON, and wrote or approved the plain-language "why it matters" explanations.
- Each AI-assisted source file includes a comment saying so.

# Field Shift: Adapting Farms with NASA Data

NASA Space Apps Challenge 2026 project. A decision-support web page that helps a farmer see how the climate
has changed on their land and find a crop rotation that fits their soil, their water and their own priorities.

**Site:** alfalfa farm area near Fallon, Nevada.

- **Climate point:** 39.47° N, 118.78° W (the NASA POWER grid cell, about 50 km across, covers the whole valley).
- **Study field:** 39.45° N, 118.80° W, about 3 km away. The climate point itself sits in the town of Fallon, so soil and
  crop greenness are taken at a real field instead. The USDA Cropland Data Layer maps this field as alfalfa every year
  from 2017 to 2024, with alfalfa on all sides out to 250 m. It is an example field picked from the map, not a
  specific farmer's field.

## What makes it different: the 35-year stress test

Most tools built on NASA POWER show averages. Averages hide the bad years, and bad years are what break a farm.
This tool **replays every real year since 1991** against each rotation and against the water the farmer says they
can count on, and shows a scorecard: one square per year, per rotation, marked enough / short / very short.

With 42 in of water (3.5 acre-feet), the current alfalfa plan would have run short in **23 of the last 35 years**.
Skipping Jul–Aug irrigation would have run short in **none**. The farmer moves the water slider and clicks any year
to see what that summer would have done to each rotation.

How it works: each rotation's normal water need (middle of its sourced range) is scaled by how much evaporation
demand (ET0, calculated from NASA POWER with the FAO-56 Penman-Monteith method) differed from normal that year, in
the months that rotation is irrigated. Limits, also stated on the page: the water supply is held the same every
year (real droughts cut supply when demand is highest), rain is ignored, and it is a simple stated model, not a forecast.

Check on the ET0 calculation: it gives 53–54 in a year at Fallon; the Nevada state report (Huntington & Allen 2010)
gives 49 in (4.1 ft) from station data.

## How it answers the challenge

| The challenge asks for | Where it is in the tool |
|---|---|
| NASA Earth observations | NASA POWER (temperature, frost, heat, humidity, wind, sunlight, soil wetness), GPM IMERG rain, MODIS NDVI, SMAP soil moisture, NASA GIBS map imagery |
| Local soil information | USDA soil survey (SSURGO) for the study field: texture, salt, organic matter, water-holding capacity, drainage |
| Crop characteristics | Crop traits table with linked sources |
| Farmer priorities | Five priority sliders, a "water I can count on" slider, and an "I sell to horse owners" market constraint |
| Rotation strategies | Five multi-year rotations including the current one, each with why, evidence, benefits, risks to check locally, and data gaps |
| Strengthen soil health | Soil health score per rotation (USDA NRCS principles), bare-field months, and what each rotation does for the soil |
| Adapt to changing conditions | "What's changed" cards, Jul–Aug heat evidence, and the 35-year stress test |

Optional items the challenge lists, and where they are:

| Challenge item | Status |
|---|---|
| Temperature, heat stress, frost risk | Month-by-month chart and cards (NASA POWER) |
| Rainfall and extreme precipitation | Rain chart (GPM IMERG) and a heavy-rain-days card |
| Evaporation and water balance | "Water the air takes vs water the sky gives" chart; ET0 card |
| Soil moisture | SMAP chart and POWER root-zone wetness |
| Vegetation stress | MODIS NDVI at the study field, compared with hot and cool summers |
| Times when fields are bare | "Months the field is bare" row for each rotation |
| When current crops are most vulnerable | Jul–Aug highlighted throughout |
| Pest cycles, water demand, soil benefits | "What it does for the soil" row; break-year rotations |
| Explain scientific terms | "What the words mean" glossary |
| Satellite vs ground measurements | Explainer with three examples from this site |
| Datasets with different resolutions | Table of pixel size, time step and how each is fitted to site and month |
| Interactive map over time | NASA MODIS greenness map with year and month controls |
| Scenario sliders | Stress test water slider and year picker |
| Farmer constraints | Water supply and market constraint |
| Uncertainty and need for local review | "How sure?" ratings, data gaps, "Partly" flags, closing reminder |
| Supports, does not replace, judgment | Stated at the top of the rotation section and at the end of the page |

Not included: long-term groundwater trends (GRACE), land-surface temperature (ECOSTRESS), elevation (SRTM), and
field-level maps of erosion or frost zones. The challenge lists these as optional.

## What the page shows

1. **Month by month.** Very hot days (≥ 35 °C / 95 °F), frost days, rain/snow, and evaporation demand against rain for each month,
   with Jul–Aug (peak heat stress) shaded. You can switch between the last 10 years, 1991–2015, and all 35 years.
2. **What satellites see on the ground.** MODIS crop greenness (NDVI) and SMAP topsoil moisture by month.
   This section appears only when `data/field_summary.json` exists.
3. **See the valley from space.** A map of NASA MODIS greenness for any month since 2001, with the climate point and study field marked.
4. **What's changed.** Eight cards comparing 2016–2025 with 1991–2015, with a "How sure?" rating from the 35-year trend.
5. **Your soil.** What the USDA soil survey maps at the site, and what it means for crop choice.
6. **Find a rotation that fits your farm.**
   - *What matters most to you?* Five sliders. The ranking and the default comparison update as they move, and the
     settings are remembered in the browser.
   - *Stress test.* The 35-year scorecard described above.
   - *All options at a glance.* Field calendars for each phase of the rotation, average water per year, Jul–Aug water,
     very hot days while irrigating, soil health score, and effort to switch.
   - *Look closer.* The current plan next to one option: **why, evidence from NASA data, soil health, notes for
     your soil, benefits, risks, and data gaps**.
7. **Crop traits.** Season, base temperature, heat and frost tolerance, water use, salt tolerance, market, and sources.
8. **Understand the data.** Glossary, satellite vs ground measurements, and how sources with different pixel sizes are fitted together.
9. **Data limits.** Plain-language caveats, taken from `data_notes` in the data file.

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
| `data/water_balance.json` | `scripts/get_water_balance.py` | NASA POWER daily data 1991–2025 turned into evaporation demand (ET0), very hot days and heavy-rain days for every month of every year. Feeds the water balance chart and the stress test. No login needed |
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

### Two NASA POWER downloads that differ slightly

`data/power_summary.json` (our first download) and `data/water_balance.json` (downloaded 2026-11-15) do not match exactly:

- Daily temperatures in the newer download run about 0.4 °C cooler. It counts about 33 → 50 very hot days a year
  where the first file has 36 → 54. The rise is the same in both (about +17 days a year).
- On 2026-11-15 the POWER API returned only missing values for GPM IMERG rain (`IMERG_PRECTOT`), so the satellite
  rain on the page still comes from the first file.

We kept the first file for the headline numbers and the rain, and use the newer one only for evaporation demand and
the stress test. We have not found the cause (possibly a different time standard or a POWER update). Do not re-run
`get_power.py` without checking that satellite rain comes back, or the rain chart will lose its satellite bars.

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

The soil, crop-history and water-balance scripts need no login:

```bash
python scripts/get_soil.py
```

```bash
python scripts/get_crop_history.py
```

```bash
python scripts/get_water_balance.py
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
Chart.js 4.4.1 and Leaflet 1.9.4 load from cdnjs. Map imagery loads from NASA GIBS.

## Files

```
index.html      page layout
styles.css      styles (light + dark mode)
app.js          loads the JSON, draws climate charts, satellite section, cards, and limits
compare.js      soil card, priorities, ranking and scores, rotation comparison, crop traits
extras.js       water balance chart, 35-year stress test, NASA satellite map
data/           power_summary.json (NASA climate), soil.json (USDA soil), crops.json (crops, rotations),
                field_summary.json (NDVI + SMAP, optional)
scripts/        Python data pipeline (POWER, AppEEARS, soil survey, AppEEARS summary)
```

## Roadmap

- Spot-check the summary-only sources and fill the open items in the crop source check (see above).
- Add local data: field water allocation, a lab soil test, hay prices.
- Let the farmer pick their own location (rerun the scripts for a new point) and build their own rotation.
- Have a local agronomist review the heat-sensitivity and market ratings used in the scores.

## Who did what, and our AI use

As required by NASA Space Apps, we disclose our AI use. We used an AI coding assistant (Claude by Anthropic, via
Claude Code). This section says what our team did and what the AI did.

### What our team did

- **Chose the problem and the site:** the Field Shift challenge, an alfalfa farm area near Fallon, Nevada.
- **Found the NASA data:** NASA POWER, GPM IMERG satellite rain, and MODIS NDVI and SMAP soil moisture through NASA AppEEARS.
- **Downloaded the NASA data:** ran the NASA POWER download that produced `data/power_summary.json`, and ran both
  AppEEARS requests (MODIS and SMAP) with our own NASA Earthdata account.
- **Found the first key results:** very hot days rising from about 36 to 54 a year, the 0.84 °C warming, Jul–Aug as the
  peak stress window, and that the POWER model rain reads too wet while GPM IMERG matches the Fallon station.
- **Proposed the website design:** a simple, farmer-friendly static page with a monthly chart of heat days, rain and
  frost with Jul–Aug highlighted, "what's changed" cards, a data-limits box, a crop trait table, and a comparison of
  the current rotation with alternatives, each with why, evidence, benefits, data gaps and risks.
- **Directed the build:** asked for each part of the challenge brief to be covered and for one feature that sets the
  tool apart, decided which numbers to keep when two downloads disagreed, and published the site on GitHub Pages.

### What the AI did

- **Wrote the code** for the page to that design: `index.html`, `styles.css`, `app.js`, `compare.js`, `extras.js`,
  and this README. Our two download scripts, `scripts/get_power.py` and `scripts/get_data.py`, were also written with AI help.
- **Added the non-NASA sources:** found and queried the USDA soil survey and the USDA Cropland Data Layer
  (`scripts/get_soil.py`, `scripts/get_crop_history.py`), and found the extension and agency publications behind the crop numbers.
- **Chose the study field** by scanning the USDA crop map, after the first NDVI point turned out to be in town.
- **Processed the downloads:** summarized the MODIS and SMAP files (`scripts/summarize_appeears.py`) and calculated
  evaporation demand from a further NASA POWER download (`scripts/get_water_balance.py`).
- **Drafted the crop content** in `data/crops.json`: crop traits, the rotation options, and their benefits, risks and
  data gaps. It then checked those numbers against published sources (linked in the file and on the page) and corrected
  several. These are **not** NASA data. Items without a local source are marked "Partly".
- **Proposed the scoring method** (see "How the scores work"), including the heat-sensitivity, market and ease
  ratings. These are judgment values, labelled "our rating".
- **Proposed and built the 35-year stress test**, the map, and the glossary and explainer text. The stress test's
  assumptions are listed on the page and above.

### What the AI did not do

It did not create or change any NASA or USDA data. Every climate, satellite and soil number on the page is read from
the files in `data/`, which the scripts produce from NASA and USDA downloads.

### Human review

Our team reviewed and edited the AI-assisted code and text, checked the numbers shown against the data files, and
approved the plain-language explanations. Each AI-assisted source file includes a comment saying so.

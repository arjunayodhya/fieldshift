# Field Shift: Adapting Farms with NASA Data

NASA Space Apps Challenge 2026 project. A simple decision-support web page that helps a farmer
see how the climate has changed on their land and, in a later version, compare crop rotations.

**Site:** alfalfa farm area near Fallon, Nevada (39.47° N, 118.78° W).

## What the page shows (v1)

1. **Month by month.** Very hot days (≥ 35 °C / 95 °F), frost days, and rain/snow for each month,
   with Jul–Aug (peak heat stress) shaded. You can switch between the last 10 years, 1991–2015, and all 35 years.
2. **What's changed.** Cards comparing 2016–2025 with 1991–2015, with a "How sure?" rating from the 35-year trend.
3. **Compare crop rotations.** The current plan (alfalfa, full water) next to three options:
   - Alfalfa with no irrigation in Jul–Aug (summer deficit irrigation)
   - Winter triticale, then teff only in years with enough water
   - Sorghum-sudangrass, summer only

   An "at a glance" table shows a 12-month field calendar, water use, whether the option needs water in Jul–Aug,
   very hot days while irrigating, and rain while irrigating. A side-by-side view covers **why, evidence from NASA data,
   benefits, risks, and data gaps** for the current plan and the chosen option.
4. **Crop traits.** Season, base temperature, heat and frost tolerance, water use, salt tolerance, market, and sources to check.
5. **Data limits.** Plain-language caveats, taken from `data_notes` in the data file.

Key findings for this site:
- Very hot days rose from about **36 to 54 per year**. Average temperature is up **0.84 °C (1.5 °F)**.
- **Jul–Aug** is the peak stress window.
- Summer rain is close to zero, so **irrigation drives crop water use**.
- The POWER model rain (`PRECTOTCORR`) reads too wet (~8 in/yr). GPM IMERG satellite rain (~5–6 in/yr)
  matches the Fallon station (~5 in/yr) better.

## Data

| File | Made by | What it is |
|---|---|---|
| `data/power_summary.json` | `scripts/get_power.py` | 35 years (1991–2025) of NASA POWER daily data, summarized: monthly normals, frost season, heat days, GDD, recent-vs-past, trends, `data_notes` |
| `data/crops.json` | hand-written (AI-assisted) | Crop traits + rotation options with linked sources. **Not NASA data** (see source check below) |
| `data/raw/` | `scripts/get_data.py` | AppEEARS downloads (MODIS NDVI + SMAP soil moisture). Not used by the page yet. |

Sources: [NASA POWER](https://power.larc.nasa.gov) (Agroclimatology community), GPM IMERG via POWER,
and [AppEEARS](https://appeears.earthdatacloud.nasa.gov) for MODIS and SMAP.

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

Run both scripts from the repo root so output goes to `data/`.

## Running locally

The page loads its JSON with `fetch`, so opening `index.html` straight from disk won't work. Start a local server from the repo root:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Deploying (GitHub Pages)

It's a static site with no build step. Push to GitHub, then go to **Settings → Pages → Deploy from branch** and choose `main` / root.
Chart.js 4.4.1 loads from cdnjs.

## Files

```
index.html      page layout
styles.css      styles (light + dark mode)
app.js          loads the JSON, draws charts, cards, and limits
compare.js      crop trait table + rotation comparison
data/           power_summary.json (NASA climate) + crops.json (crop traits, rotations)
scripts/        Python data pipeline (POWER, AppEEARS)
```

## Roadmap

- Spot-check the summary-only sources and fill the open items in the crop source check (see above).
- Add local data: field water allocation, soil salinity, hay prices.
- Add MODIS NDVI (crop greenness) and SMAP soil moisture from `get_data.py`.

## AI-use note

As required by NASA Space Apps, we disclose our AI use:

- **What:** An AI coding assistant (Claude by Anthropic, via Claude Code) helped draft the web page code
  (`index.html`, `styles.css`, `app.js`, `compare.js`) and this README.
- **Crop content:** The AI also drafted `data/crops.json`: crop traits, the rotation options, and their benefits,
  risks, and data gaps. It then checked those numbers against published sources (listed with links in the file and
  on the page) and corrected several. These are **not** NASA data. Items without a local source are marked "Partly".
- **What it did not do:** It did not create or change any NASA data. Every climate number on the page is read from
  `data/power_summary.json`, which our Python scripts produce from NASA POWER downloads.
- **Human review:** Our team reviewed and edited all AI-assisted code and text, checked the numbers shown
  against the JSON, and wrote or approved the plain-language "why it matters" explanations.
- Each AI-assisted source file includes a comment saying so.

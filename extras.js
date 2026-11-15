/*
 * Field Shift: extras.js
 *   1. Water balance chart (evaporation demand vs rain) and two extra "what's changed" cards
 *   2. 35-year stress test: replay every real year since 1991 against each rotation
 *      and the farmer's own water supply
 *   3. NASA satellite map of the valley with a month/year control (NASA GIBS imagery)
 *
 * Inputs: data/water_balance.json (scripts/get_water_balance.py), plus state from app.js
 * and rotation helpers from compare.js (both loaded first).
 *
 * AI-use note (NASA Space Apps rule): drafted with help from an AI coding
 * assistant (Claude by Anthropic) and reviewed/edited by our team. The stress
 * test is a simple, stated model (see STRESS_NOTES), not a forecast.
 */

const IN_PER_ACRE_FOOT = 12;
const STRESS_KEY = "fieldshift.stress";
const STRESS_NOTES = [
  "The water slider starts at 42 in (3.5 acre-feet per acre), the low end of what is normally applied to alfalfa around Fallon (UNR Extension). Set it to your own supply.",
  "Each rotation's normal water need (middle of its range) is scaled up or down by how much evaporation demand (ET0) that year differed from normal in the months it is irrigated. This follows the standard crop-coefficient idea: crop water use rises and falls with ET0.",
  "Your water supply is held the same every year. In real droughts the supply is usually cut in the same years demand is highest, so real shortfalls would be worse than shown.",
  "Rain is ignored. It adds only about 2 to 3 in during the irrigated months here.",
  "\"Short\" means the rotation needed more water than you set. \"Very short\" means more than 15% over.",
  "Very hot day counts here come from a fresh NASA POWER download and run about 3 a year lower than the cards at the top of the page. The pattern across years is the same.",
];

const mmToIn = (mm) => mm / 25.4;
const waterLabel = (inches) =>
  isUS() ? `${Math.round(inches)} in` : `${Math.round((inches * 25.4) / 10) * 10} mm`;

// ---------- 1. water balance chart + cards ----------
function drawWaterBalance() {
  const fig = document.getElementById("wb-figure");
  const w = state.water;
  if (state.charts.wb) { state.charts.wb.destroy(); delete state.charts.wb; }
  if (!w) { fig.hidden = true; return; }
  fig.hidden = false;
  const key = PERIODS[state.period].key;            // monthly_recent / monthly_past / monthly_normals
  const et = w[key], rain = state.data[key];
  const t = tokens();
  const unit = rainUnit();
  const conv = (mm) => (mm == null ? null : rainVal(mm));
  const etYear = et.reduce((a, m) => a + m.et0_mm, 0);
  const rainYear = rain.reduce((a, m) => a + (m.precip_sat_mm || 0), 0);

  document.getElementById("wb-sub").textContent =
    `Average per month, ${PERIODS[state.period].label}, in ${unit}. Evaporation demand (ET0) = water a well-watered grass field would use.`;
  document.getElementById("wb-note").innerHTML =
    `Over a year the air asks for about <strong>${rainFmt(etYear, isUS() ? 0 : 0)}</strong> and rain and snow give about <strong>${rainFmt(rainYear, isUS() ? 1 : 0)}</strong>. ` +
    `The gap between the bars is what irrigation has to supply, and it is widest in Jun–Aug.`;

  const opts = baseOptions(t, `${unit} per month`);
  opts.plugins.peakBand.label = "";
  opts.plugins.tooltip.callbacks = { label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(isUS() ? 1 : 0)} ${unit}` };
  state.charts.wb = new Chart(document.getElementById("wb-chart"), {
    type: "bar",
    data: {
      labels: et.map((m) => m.name),
      datasets: [
        { label: "Evaporation demand (ET0)", data: et.map((m) => conv(m.et0_mm)), ...barStyle(t.et0) },
        { label: "Rain + snow (satellite)", data: rain.map((m) => conv(m.precip_sat_mm)), ...barStyle(t.rainSat) },
      ],
    },
    options: opts,
    plugins: [peakBand],
  });
}

// Two extra "what's changed" cards, appended after app.js draws its six.
function drawWaterCards() {
  const w = state.water;
  if (!w) return;
  const rvp = w.recent_vs_past, tr = w.trends_per_decade;
  const card = (label, big, delta, from, r, n, why) => `
    <article class="card change">
      <span class="label">${label}</span>
      <span class="big">${big}</span>
      <span class="delta">${delta}</span>
      <span class="from">${from}</span>
      <span class="sure" title="35-yr trend r = ${r} (${n} years of data)">How sure? <b>${sureness(r)}</b></span>
      <p class="why">${why}</p>
    </article>`;
  const e = rvp.et0_mm, h = rvp.heavy_rain_days;
  const arrow = (x) => (x > 0 ? "▲" : x < 0 ? "▼" : "■");
  document.getElementById("change-cards").insertAdjacentHTML("beforeend",
    card("Evaporation demand (ET0)", `${rainFmt(e.recent, 0)}/yr`.replace(" /", "/"),
      `${arrow(e.change)} ${signed(rainFmt(e.change, isUS() ? 1 : 0))}`, `was ${rainFmt(e.past, 0)} (1991–2015)`,
      tr.et0_mm.r, tr.et0_mm.n_years,
      "The air pulls a little more water out of crops and soil than it used to, so the same crop needs a little more irrigation.") +
    card(`Heavy rain days (${isUS() ? "0.5 in" : "13 mm"}+ in a day)`, `${h.recent.toFixed(1)} days/yr`,
      `${arrow(h.change)} ${signed(h.change.toFixed(1))} days/yr`, `was ${h.past.toFixed(1)} days/yr (1991–2015)`,
      tr.heavy_rain_days.r, tr.heavy_rain_days.n_years,
      "Heavy rain is rare here and shows no trend. Heat and water supply are the bigger risks. (Model rain, which reads too wet.)"));
}

// ---------- 2. 35-year stress test ----------
function loadStress() {
  const s = { water: 42, year: null };
  try {
    const saved = JSON.parse(localStorage.getItem(STRESS_KEY) || "{}");
    if (Number.isFinite(saved.water) && saved.water >= 15 && saved.water <= 60) s.water = saved.water;
  } catch (e) { /* storage unavailable */ }
  return s;
}

// How one rotation would have fared in one real year, given `avail` inches of water.
function stressCalc(rot, year, avail) {
  const w = state.water;
  const yr = w.yearly.find((y) => y.year === year);
  const norm = w.monthly_normals;
  const phases = expandPhases(rot);
  const T = phases.reduce((a, p) => a + p.years, 0);
  let need = 0, heat = 0;
  for (const p of phases) {
    const [lo, hi] = phaseWater(p);
    const irr = phaseIrrigated(p);
    const eY = irr.reduce((a, m) => a + yr.months[m - 1].et0_mm, 0);
    const eN = irr.reduce((a, m) => a + norm[m - 1].et0_mm, 0);
    need += ((lo + hi) / 2) * (eN ? eY / eN : 1) * p.years;
    heat += irr.reduce((a, m) => a + yr.months[m - 1].heat_days, 0) * p.years;
  }
  need /= T; heat /= T;
  return { need, heat, gap: need - avail, level: need <= avail ? 0 : need <= avail * 1.15 ? 1 : 2 };
}

// Used by the ranking in compare.js
function stressShortYears(rot) {
  if (!state.water) return null;
  if (!state.stress) state.stress = loadStress();
  const years = state.water.yearly.map((y) => y.year);
  return { short: years.filter((y) => stressCalc(rot, y, state.stress.water).level > 0).length, of: years.length };
}

function drawStress() {
  const sec = document.getElementById("stress-section");
  const w = state.water;
  if (!w || !state.crops) { sec.hidden = true; return; }
  sec.hidden = false;
  if (!state.stress) state.stress = loadStress();
  const years = w.yearly.map((y) => y.year);
  const byHeat = [...w.yearly].sort((a, b) => a.heat_days - b.heat_days);
  const coolest = byHeat[0].year, hottest = byHeat[byHeat.length - 1].year;
  if (!state.stress.year) state.stress.year = hottest;
  const S = state.stress;
  const rots = state.crops.rotations;

  // controls
  const slider = document.getElementById("stress-water");
  slider.value = S.water;
  document.getElementById("stress-water-val").innerHTML =
    `<b>${waterLabel(S.water)}</b> ` + (isUS() ? `per acre a year (${(S.water / IN_PER_ACRE_FOOT).toFixed(1)} acre-feet)` : "a year");
  document.getElementById("stress-presets").innerHTML = [
    [hottest, `Hottest: ${hottest}`], [coolest, `Coolest: ${coolest}`], [years[years.length - 1], `Latest: ${years[years.length - 1]}`],
  ].map(([y, label]) => `<button type="button" data-year="${y}" aria-pressed="${y === S.year}">${label}</button>`).join("");

  // scorecard: one row per rotation, one cell per real year
  const res = rots.map((r) => years.map((y) => stressCalc(r, y, S.water)));
  const word = ["enough water", "short", "very short"];
  document.getElementById("stress-grid").innerHTML = `
    <div class="sg-row sg-head"><span class="sg-name"></span><div class="sg-cells">${years.map((y) =>
      `<span class="sg-year ${y === S.year ? "sel" : ""}">${y % 5 === 0 ? y : ""}</span>`).join("")}</div><span class="sg-sum">Short in</span></div>
    ${rots.map((r, i) => {
      const n = res[i].filter((x) => x.level > 0).length;
      return `<div class="sg-row"><span class="sg-name">${r.is_current ? '<span class="tag now">NOW</span> ' : ""}${r.short_name}</span>
        <div class="sg-cells">${years.map((y, k) => {
          const x = res[i][k];
          const tip = `${y}: ${r.short_name}: needed ${waterLabel(x.need)}, ${word[x.level]}`;
          return `<button type="button" class="sg-cell l${x.level} ${y === S.year ? "sel" : ""}" data-year="${y}" title="${tip}" aria-label="${tip}"></button>`;
        }).join("")}</div>
        <span class="sg-sum"><b>${n}</b> of ${years.length} yrs</span></div>`;
    }).join("")}`;

  // headline sentence
  const cur = rots.findIndex((r) => r.is_current);
  const counts = res.map((row) => row.filter((x) => x.level > 0).length);
  const bestAlt = counts.map((n, i) => ({ n, i })).filter((x) => x.i !== cur).sort((a, b) => a.n - b.n)[0];
  document.getElementById("stress-headline").innerHTML =
    `With <strong>${waterLabel(S.water)}</strong> of water, your current plan would have run short in ` +
    `<strong>${counts[cur]} of the last ${years.length} years</strong>. ` +
    (bestAlt.n < counts[cur]
      ? `"${rots[bestAlt.i].short_name}" would have run short in <strong>${bestAlt.n}</strong>.`
      : `None of the other rotations would have done better on water.`);

  // selected-year detail
  const yr = w.yearly.find((y) => y.year === S.year);
  const etNorm = w.monthly_normals.reduce((a, m) => a + m.et0_mm, 0);
  const etPct = Math.round((yr.et0_mm / etNorm - 1) * 100);
  document.getElementById("stress-year-title").textContent = `How each rotation would have done in ${S.year}`;
  document.getElementById("stress-year-sub").textContent =
    `${S.year} had ${yr.heat_days} very hot days. Evaporation demand was ${etPct === 0 ? "about normal" : `${Math.abs(etPct)}% ${etPct > 0 ? "above" : "below"} normal`}.`;
  document.getElementById("stress-table").innerHTML = `
    <thead><tr><th scope="col">Rotation</th><th scope="col">Water needed</th><th scope="col">Result with ${waterLabel(S.water)}</th><th scope="col">Very hot days while irrigating</th></tr></thead>
    <tbody>${rots.map((r, i) => {
      const x = res[i][years.indexOf(S.year)];
      const gap = Math.abs(x.gap);
      const result = x.level === 0
        ? `Covered, ${waterLabel(gap)} to spare`
        : `<b>${x.level === 2 ? "Very short" : "Short"} by ${waterLabel(gap)}</b> (${Math.round((x.gap / x.need) * 100)}% of its need)`;
      return `<tr><th scope="row">${r.is_current ? '<span class="tag now">NOW</span> ' : ""}${r.short_name}</th>
        <td>${waterLabel(x.need)}</td><td><i class="sg-cell l${x.level} inline"></i> ${result}</td><td>${Math.round(x.heat)}</td></tr>`;
    }).join("")}</tbody>`;
  document.getElementById("stress-notes").innerHTML = STRESS_NOTES.map((n) => `<li>${n}</li>`).join("");

  if (!sec.dataset.wired) {
    sec.dataset.wired = "1";
    slider.addEventListener("input", () => {
      state.stress.water = Number(slider.value);
      try { localStorage.setItem(STRESS_KEY, JSON.stringify({ water: state.stress.water })); } catch (e) { /* ignore */ }
      drawStress();
      if (typeof drawRanking === "function") drawRanking();   // "short in N years" chips
    });
    sec.addEventListener("click", (e) => {
      const b = e.target.closest("[data-year]");
      if (!b) return;
      state.stress.year = Number(b.dataset.year);
      drawStress();
    });
  }
}

// ---------- 3. NASA satellite map ----------
// Imagery: NASA GIBS (Global Imagery Browse Services), no key needed.
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
const mapState = { map: null, ndvi: null, year: 2024, month: 7 };

function ndviUrl() {
  const d = `${mapState.year}-${String(mapState.month).padStart(2, "0")}-15`;
  return `${GIBS}/MODIS_Terra_L3_NDVI_16Day/default/${d}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`;
}

function drawMap() {
  const sec = document.getElementById("map-section");
  if (typeof L === "undefined" || !state.data) { sec.hidden = true; return; }   // map library did not load
  sec.hidden = false;
  const label = document.getElementById("map-date");
  const setLabel = () => { label.textContent = `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mapState.month - 1]} ${mapState.year}`; };
  if (mapState.map) { setLabel(); return; }

  const site = state.data.site;
  const field = state.soil ? state.soil.site : null;
  const map = L.map("map", { center: [site.lat, site.lon], zoom: 10, minZoom: 7, maxZoom: 12, scrollWheelZoom: false });
  L.tileLayer(`${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`,
    { maxNativeZoom: 8, attribution: "Imagery: NASA GIBS / EOSDIS" }).addTo(map);
  mapState.ndvi = L.tileLayer(ndviUrl(), { maxNativeZoom: 9, opacity: 0.85 }).addTo(map);
  L.tileLayer(`${GIBS}/Reference_Features_15m/default/2024-01-01/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png`,
    { maxNativeZoom: 13, opacity: 0.7 }).addTo(map);
  L.circleMarker([site.lat, site.lon], { radius: 7, color: "#fff", weight: 2, fillColor: "#0b0b0b", fillOpacity: 1 })
    .addTo(map).bindTooltip("Fallon (climate point)", { permanent: true, direction: "right", offset: [8, 0] });
  if (field) {
    L.circleMarker([field.lat, field.lon], { radius: 7, color: "#fff", weight: 2, fillColor: "#eb6834", fillOpacity: 1 })
      .addTo(map).bindTooltip("Study alfalfa field", { permanent: true, direction: "left", offset: [-8, 0] });
  }
  mapState.map = map;

  const yearSel = document.getElementById("map-year");
  const last = state.data.years.all[1];
  yearSel.innerHTML = Array.from({ length: last - 2001 + 1 }, (_, i) => last - i).map((y) => `<option value="${y}">${y}</option>`).join("");
  mapState.year = Math.min(mapState.year, last);
  yearSel.value = mapState.year;
  const monthSl = document.getElementById("map-month");
  monthSl.value = mapState.month;
  const update = () => { mapState.ndvi.setUrl(ndviUrl()); setLabel(); };
  yearSel.addEventListener("change", () => { mapState.year = Number(yearSel.value); update(); });
  monthSl.addEventListener("input", () => { mapState.month = Number(monthSl.value); update(); });
  setLabel();
}

// Called from app.js render(), after the cards are drawn
function drawExtras() {
  drawWaterCards();
  drawStress();
  drawMap();
}

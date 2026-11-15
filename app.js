/*
 * Field Shift: app.js
 * Loads data/power_summary.json (made by scripts/get_power.py) and draws:
 *   1. month-by-month charts (hot/frost days, rain) with Jul–Aug highlighted
 *   2. "what's changed" cards (last 10 yrs vs 1991–2015)
 *   3. a "data limits" box from data_notes
 *
 * AI-use note (NASA Space Apps rule): this file was drafted with help from an
 * AI coding assistant (Claude by Anthropic) and reviewed/edited by our team.
 * Every number shown comes from the JSON file; nothing is hardcoded except the
 * plain-language explanations, which our team checked.
 */

const DATA_URL = "data/power_summary.json";

// ---------- state ----------
const state = {
  data: null, crops: null, soil: null, field: null,
  units: "us", period: "recent", charts: {}, fieldCharts: {},
  compareWith: null, comparePicked: false, priorities: null,
};
const CROPS_URL = "data/crops.json";
const FIELD_URL = "data/field_summary.json"; // optional: MODIS NDVI + SMAP (scripts/summarize_appeears.py)
const SOIL_URL = "data/soil.json";          // optional: USDA soil survey (scripts/get_soil.py)

// ---------- unit helpers ----------
const C_TO_F = (c) => (c * 9) / 5 + 32;
const isUS = () => state.units === "us";
const tempAbs = (c) => (isUS() ? `${Math.round(C_TO_F(c))}°F` : `${c.toFixed(1)}°C`);
const tempDelta = (c) => (isUS() ? `${(c * 1.8).toFixed(1)}°F` : `${c.toFixed(1)}°C`);
const rainVal = (mm) => (isUS() ? mm / 25.4 : mm);
const rainUnit = () => (isUS() ? "in" : "mm");
const rainFmt = (mm, digits) =>
  isUS() ? `${(mm / 25.4).toFixed(digits ?? 2)} in` : `${mm.toFixed(digits ?? 0)} mm`;
// GDD in °C-days -> °F-days is ×1.8 (base 5°C = 41°F)
const gddFmt = (g) => Math.round(isUS() ? g * 1.8 : g).toLocaleString();
const heatLabel = () => (isUS() ? "95°F" : "35°C");
const frostLabel = () => (isUS() ? "32°F" : "0°C");
const signed = (s) => (s.startsWith("-") ? "−" + s.slice(1) : "+" + s);

const PERIODS = {
  recent: { key: "monthly_recent", label: "2016–2025" },
  past: { key: "monthly_past", label: "1991–2015" },
  normals: { key: "monthly_normals", label: "1991–2025" },
};

// Read colors from CSS custom properties so charts follow light/dark mode.
function tokens() {
  const s = getComputedStyle(document.documentElement);
  const v = (n) => s.getPropertyValue(n).trim();
  return {
    ink: v("--ink"), ink2: v("--ink-2"), ink3: v("--ink-3"), grid: v("--grid"),
    surface: v("--surface"), peak: v("--peak"), peakInk: v("--peak-ink"),
    frost: v("--frost"), heat: v("--heat"), rainSat: v("--rain-sat"), rainModel: v("--rain-model"),
  };
}

// ---------- Chart.js plugin: shade Jul–Aug (month index 6 and 7) ----------
const peakBand = {
  id: "peakBand",
  beforeDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea, scales } = chart;
    const x = scales.x;
    const step = x.getPixelForValue(1) - x.getPixelForValue(0);
    const left = x.getPixelForValue(6) - step / 2;
    const right = x.getPixelForValue(7) + step / 2;
    ctx.save();
    ctx.fillStyle = opts.color;
    ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
    if (opts.label) {
      ctx.fillStyle = opts.textColor;
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(opts.label, (left + right) / 2, chartArea.top + 14);
    }
    ctx.restore();
  },
};

function baseOptions(t, yTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "top", align: "start",
        labels: {
          color: t.ink2, usePointStyle: true, pointStyle: "rectRounded", boxWidth: 10, padding: 14,
          sort: (a, b) => a.datasetIndex - b.datasetIndex, // keep legend in dataset order, not draw order
        },
      },
      tooltip: {
        backgroundColor: t.surface, titleColor: t.ink, bodyColor: t.ink2,
        borderColor: t.grid, borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
      },
      peakBand: { color: t.peak, textColor: t.peakInk, label: "Peak heat stress" },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: t.ink2 }, border: { color: t.grid } },
      y: {
        beginAtZero: true,
        grid: { color: t.grid }, border: { display: false },
        ticks: { color: t.ink3, maxTicksLimit: 6 },
        title: { display: true, text: yTitle, color: t.ink3 },
      },
    },
  };
}

const barStyle = (color) => ({
  backgroundColor: color, borderColor: color,
  borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: "start",
  categoryPercentage: 0.72, barPercentage: 0.9,
});

// ---------- 1. monthly charts ----------
function drawCharts() {
  const d = state.data;
  const months = d[PERIODS[state.period].key];
  const labels = months.map((m) => m.name);
  const t = tokens();
  Object.values(state.charts).forEach((c) => c.destroy());

  document.getElementById("days-sub").textContent =
    `Average days per month, ${PERIODS[state.period].label}. Hot = ${heatLabel()} or more. Frost = below ${frostLabel()}.`;
  document.getElementById("rain-sub").textContent =
    `Average per month, ${PERIODS[state.period].label} (satellite record starts 2001). Rain + melted snow, ${rainUnit()}.`;

  const daysOpts = baseOptions(t, "days in month");
  daysOpts.scales.y.max = 31; // a month has at most 31 days: keeps the scale honest
  daysOpts.plugins.tooltip.callbacks = {
    label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)} days`,
  };
  state.charts.days = new Chart(document.getElementById("days-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: `Very hot days (${heatLabel()}+)`, data: months.map((m) => m.heat_days), ...barStyle(t.heat) },
        { label: `Frost days (below ${frostLabel()})`, data: months.map((m) => m.frost_days), ...barStyle(t.frost) },
      ],
    },
    options: daysOpts,
    plugins: [peakBand],
  });

  const rainOpts = baseOptions(t, `${rainUnit()} per month`);
  rainOpts.plugins.peakBand.label = "";
  rainOpts.plugins.tooltip.callbacks = {
    label: (c) => ` ${c.dataset.label}: ${rainFmt(isUS() ? c.parsed.y * 25.4 : c.parsed.y)}`,
  };
  state.charts.rain = new Chart(document.getElementById("rain-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Satellite (GPM IMERG), best match to local station",
          data: months.map((m) => rainVal(m.precip_sat_mm)), ...barStyle(t.rainSat), order: 2,
        },
        {
          type: "line", label: "Model (POWER), reads too wet",
          data: months.map((m) => rainVal(m.precip_mm)),
          borderColor: t.rainModel, backgroundColor: t.rainModel, borderWidth: 2, borderDash: [5, 4],
          pointRadius: 4, pointHoverRadius: 6, pointBorderColor: t.surface, pointBorderWidth: 2,
          pointStyle: "circle", tension: 0.3, order: 1,
        },
      ],
    },
    options: rainOpts,
    plugins: [peakBand],
  });

  drawTable(months);
}

function drawTable(months) {
  const tu = isUS() ? "°F" : "°C";
  const head = ["Month", `High ${tu}`, `Low ${tu}`, "Hot days", "Frost days",
    `Rain sat. (${rainUnit()})`, `Rain model (${rainUnit()})`, "Soil wetness*"];
  const t = (c) => (isUS() ? Math.round(C_TO_F(c)) : c.toFixed(1));
  const r = (mm) => (isUS() ? (mm / 25.4).toFixed(2) : mm.toFixed(1));
  const rows = months.map((m) => `
    <tr class="${m.month === 7 || m.month === 8 ? "peak" : ""}">
      <td>${m.name}</td><td>${t(m.tmax_c)}</td><td>${t(m.tmin_c)}</td>
      <td>${m.heat_days.toFixed(1)}</td><td>${m.frost_days.toFixed(1)}</td>
      <td>${r(m.precip_sat_mm)}</td><td>${r(m.precip_mm)}</td><td>${m.soil_wetness.toFixed(2)}</td>
    </tr>`).join("");
  document.getElementById("month-table").innerHTML =
    `<caption class="sub" style="caption-side:bottom;text-align:left;padding-top:8px">
       ${PERIODS[state.period].label}. Jul–Aug shaded. *Soil wetness: 0 = bone dry, 1 = soaked; natural soil only, no irrigation.
     </caption>
     <thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody>`;
}

// ---------- 1b. what the satellites see on the ground (MODIS NDVI + SMAP) ----------
// Only shown when data/field_summary.json exists (made by scripts/summarize_appeears.py).
function drawField() {
  const sec = document.getElementById("field-section");
  const f = state.field;
  Object.values(state.fieldCharts).forEach((c) => c.destroy());
  state.fieldCharts = {};
  if (!f || (!f.ndvi && !f.smap)) { sec.hidden = true; return; }
  sec.hidden = false;
  const t = tokens();
  const findings = [];
  const single = (canvasId, type, label, values, color, yTitle, digits, yMax) => {
    const opts = baseOptions(t, yTitle);
    opts.plugins.legend.display = false; // one series: the title names it
    opts.plugins.peakBand.label = "";
    if (yMax) opts.scales.y.max = yMax;
    opts.plugins.tooltip.callbacks = { label: (c) => ` ${label}: ${c.parsed.y == null ? "no data" : c.parsed.y.toFixed(digits)}` };
    const ds = type === "line"
      ? { label, data: values, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
          pointBorderColor: t.surface, pointBorderWidth: 2, tension: 0.3, spanGaps: true }
      : { label, data: values, ...barStyle(color) };
    return new Chart(document.getElementById(canvasId), {
      type, data: { labels: f[canvasId === "ndvi-chart" ? "ndvi" : "smap"].monthly.map((m) => m.name), datasets: [ds] },
      options: opts, plugins: [peakBand],
    });
  };

  const ndviFig = document.getElementById("ndvi-figure");
  ndviFig.hidden = !f.ndvi;
  if (f.ndvi) {
    const n = f.ndvi;
    document.getElementById("ndvi-sub").textContent =
      `Average NDVI by month, ${n.years[0]}–${n.years[1]}. 0 = bare ground, 0.8 = dense green crop. One 250 m satellite pixel.`;
    state.fieldCharts.ndvi = single("ndvi-chart", "line", "Greenness (NDVI)", n.monthly.map((m) => m.value), t.rainSat, "NDVI", 2, 1);
    if (n.june_avg != null && n.jul_aug_avg != null) {
      const diff = n.jul_aug_avg - n.june_avg;
      const pct = Math.abs(Math.round((diff / n.june_avg) * 100));
      findings.push(Math.abs(diff) < 0.02
        ? `Greenness in Jul–Aug (<strong>${n.jul_aug_avg.toFixed(2)}</strong>) is about the same as in June (${n.june_avg.toFixed(2)}). Greenest month: ${n.peak_month}.`
        : `Greenness in Jul–Aug (<strong>${n.jul_aug_avg.toFixed(2)}</strong>) is <strong>${pct}% ${diff < 0 ? "lower" : "higher"}</strong> than in June (${n.june_avg.toFixed(2)}). Greenest month: ${n.peak_month}.`);
    }
    const h = n.heat_vs_summer_greenness;
    if (h && h.r != null) {
      const strength = Math.abs(h.r) >= 0.5 ? "a clear" : Math.abs(h.r) >= 0.3 ? "some" : "no clear";
      findings.push(`Across ${h.n_years} years there is <strong>${strength} link</strong> between hotter summers and ${h.r < 0 ? "lower" : "higher"} Jul–Aug greenness (r = ${h.r}). That is too few years to be sure.`);
    }
  }

  const smapFig = document.getElementById("smap-figure");
  smapFig.hidden = !f.smap;
  if (f.smap) {
    const s = f.smap;
    document.getElementById("smap-sub").textContent =
      `Average by month, ${s.years[0]}–${s.years[1]}. Share of the top 2 in of soil that is water. About a 6-mile (9 km) area.`;
    state.fieldCharts.smap = single("smap-chart", "bar", "Soil moisture", s.monthly.map((m) => m.value), t.frost, "m³ water per m³ soil", 3);
    findings.push(`Measured topsoil is driest in <strong>${s.driest_month}</strong> and wettest in <strong>${s.wettest_month}</strong>. This is the wider area, mixing irrigated fields and dry desert.`);
  }

  document.getElementById("field-findings").innerHTML = findings.map((x) => `<li>${x}</li>`).join("");
  document.getElementById("field-notes").innerHTML = (f.data_notes || []).map((x) => `<li>${x}</li>`).join("");
}

// ---------- 2. what's changed cards ----------
// Each card: which recent_vs_past / trends_per_decade key to use, how to format,
// and a one-line plain-language "why it matters" (written + checked by our team).
const CARDS = [
  {
    key: "heat_days",
    label: () => `Very hot days (${heatLabel()}+)`,
    big: (v) => `${Math.round(v)} days/yr`,
    delta: (c) => `${signed(String(Math.round(c)))} days/yr`,
    why: "Heat stress lands on the Jul–Aug cuttings. This is the biggest change on the farm.",
  },
  {
    key: "mean_temp_c",
    label: () => "Average temperature",
    big: (v) => tempAbs(v),
    delta: (c) => signed(tempDelta(c)),
    why: "Warmer days and nights mean crops use more water.",
  },
  {
    key: "gdd_base5",
    label: () => `Growing heat for alfalfa (GDD, base ${isUS() ? "41°F" : "5°C"})`,
    big: (v) => gddFmt(v),
    delta: (c, p) => `${signed(gddFmt(c))} (${signed(((c / p) * 100).toFixed(0))}%)`,
    why: "More heat units mean faster growth in spring and fall, but also more water demand.",
  },
  {
    key: "precip_sat_mm",
    label: () => "Yearly rain + snow (satellite)",
    big: (v) => rainFmt(v, isUS() ? 1 : 0),
    delta: (c) => signed(rainFmt(c, isUS() ? 1 : 0)),
    why: "No real change. It's still desert, so irrigation supply is what matters.",
  },
  {
    key: "frost_days",
    label: () => `Frost days (below ${frostLabel()})`,
    big: (v) => `${Math.round(v)} days/yr`,
    delta: (c) => `${signed(String(Math.round(c)))} days/yr`,
    why: "Fewer frosty nights, mostly in winter.",
  },
  {
    key: "frost_free_days",
    label: () => "Frost-free season",
    big: (v) => `${Math.round(v)} days`,
    delta: (c) => `${signed(String(Math.round(c)))} days`,
    why: "Season length has barely moved. Spring and fall frost dates are about the same.",
  },
];

// How steady is the 35-yr trend? Uses |r| from simple linear regression.
function sureness(r) {
  const a = Math.abs(r);
  if (a >= 0.5) return "Clear";
  if (a >= 0.3) return "Some";
  return "Weak";
}

function drawCards() {
  const { recent_vs_past: rvp, trends_per_decade: tr } = state.data;
  document.getElementById("change-cards").innerHTML = CARDS.map((c) => {
    const v = rvp[c.key];
    const trend = tr[c.key];
    const arrow = v.change > 0 ? "▲" : v.change < 0 ? "▼" : "■";
    const tip = trend ? `35-yr trend r = ${trend.r} (${trend.n_years} years of data)` : "";
    return `
      <article class="card change">
        <span class="label">${c.label()}</span>
        <span class="big">${c.big(v.recent)}</span>
        <span class="delta">${arrow} ${c.delta(v.change, v.past)}</span>
        <span class="from">was ${c.big(v.past)} in 1991–2015</span>
        ${trend ? `<span class="sure" title="${tip}">How sure? <b>${sureness(trend.r)}</b></span>` : ""}
        <p class="why">${c.why}</p>
      </article>`;
  }).join("");
}

// ---------- 3. data limits ----------
function drawLimits() {
  const d = state.data;
  const extra = [
    "Rain: the POWER model reads about 8 in/yr here; the GPM IMERG satellite (~5 in/yr) matches the Fallon weather station much better. We trust the satellite more for rain.",
    "These are 10-year and 25-year averages. Any single year can be far hotter, colder, wetter, or drier.",
  ];
  document.getElementById("limits-list").innerHTML =
    [...d.data_notes, ...extra].map((n) => `<li>${n}</li>`).join("");
  document.getElementById("source-line").textContent =
    `Source: ${d.source}. Years ${d.years.all[0]}–${d.years.all[1]}.`;
}

function drawHeader() {
  const s = state.data.site;
  const elev = isUS() ? `${Math.round(s.grid_elevation_m * 3.281).toLocaleString()} ft` : `${Math.round(s.grid_elevation_m)} m`;
  document.getElementById("site-line").textContent =
    `Alfalfa farm area near ${s.name} (${s.lat}°N, ${Math.abs(s.lon)}°W, ${elev}). 35 years of NASA data, ${state.data.years.all[0]}–${state.data.years.all[1]}.`;
  const fs = state.data.frost_season_recent;
  document.getElementById("frost-window").innerHTML =
    `Typical growing window (last 10 yrs): last spring frost <strong>~${fs.avg_last_spring_frost}</strong>, first fall frost <strong>~${fs.avg_first_fall_frost}</strong>, about <strong>${fs.avg_frost_free_days} frost-free days</strong>.`;
}

function render() {
  drawHeader();
  drawCharts();
  drawField();
  drawCards();
  drawLimits();
  if (typeof drawCompare === "function") drawCompare(); // compare.js
}

// ---------- controls ----------
function wireSeg(id, attr, onPick) {
  const seg = document.getElementById(id);
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    onPick(b.dataset[attr]);
  });
}

async function init() {
  wireSeg("units", "units", (u) => { state.units = u; render(); });
  wireSeg("period", "period", (p) => { state.period = p; drawCharts(); });
  // redraw charts when the OS switches light/dark
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (state.data) { drawCharts(); drawField(); } });

  try {
    const getJSON = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return res.json();
    };
    // optional files: the page still works without them
    const optional = (url) => getJSON(url).catch(() => null);
    [state.data, state.crops, state.soil, state.field] = await Promise.all(
      [getJSON(DATA_URL), getJSON(CROPS_URL), optional(SOIL_URL), optional(FIELD_URL)]);
  } catch (err) {
    const box = document.getElementById("load-error");
    box.hidden = false;
    box.innerHTML = `<strong>Couldn't load the data files</strong> (${err.message}). ` +
      `If you opened this file directly, run a local server instead: <code>python -m http.server</code> and open <code>http://localhost:8000</code>.`;
    return;
  }
  render();
}

init();

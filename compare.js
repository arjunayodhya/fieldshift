/*
 * Field Shift: compare.js
 * Crop trait table + "compare rotations" section.
 * Reads data/crops.json (crop traits + rotation options) and links each option
 * to NASA climate numbers computed from data/power_summary.json.
 * Uses helpers and `state` from app.js (loaded first).
 *
 * AI-use note (NASA Space Apps rule): drafted with help from an AI coding
 * assistant (Claude by Anthropic) and reviewed/edited by our team. Climate
 * numbers are computed from NASA data; crop/agronomy numbers come from
 * crops.json and are flagged "not yet checked" until the team verifies them.
 */

const MONTH_ABBR = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAME = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PEAK = [7, 8]; // Jul–Aug

// ---------- climate facts from NASA data ----------
// rain: 1 decimal in inches, whole mm in metric
const rainShort = (mm) => rainFmt(mm, isUS() ? 1 : 0);
const daysWord = (n) => (n === 1 ? "day" : "days");

const sumMonths = (monthly, field, months) => months.reduce((a, m) => a + monthly[m - 1][field], 0);
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function climateFacts() {
  const d = state.data;
  const rec = d.monthly_recent, past = d.monthly_past;
  const yearHeat = sumMonths(rec, "heat_days", ALL_MONTHS);
  const peakHeat = sumMonths(rec, "heat_days", PEAK);
  return {
    year_heat: Math.round(yearHeat),
    heat_was: Math.round(sumMonths(past, "heat_days", ALL_MONTHS)),
    peak_heat: Math.round(peakHeat),
    peak_pct: `${Math.round((peakHeat / yearHeat) * 100)}%`,
    // satellite rain (GPM IMERG): it matches the Fallon station better than the model
    summer_rain: rainShort(sumMonths(rec, "precip_sat_mm", [6, 7, 8, 9])),
    winter_rain: rainShort(sumMonths(rec, "precip_sat_mm", [10, 11, 12, 1, 2, 3, 4, 5])),
    frost_last: d.frost_season_recent.avg_last_spring_frost,
    frost_first: d.frost_season_recent.avg_first_fall_frost,
  };
}

// Replace {placeholders} in crops.json text with live NASA numbers.
function fill(text, facts) {
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in facts ? `<strong>${facts[k]}</strong>` : m));
}

// ---------- rotation helpers ----------
// skipOptional = leave out crops listed in rot.optional (e.g. teff in a short water year)
function irrigatedMonths(rot, skipOptional = false) {
  return Object.entries(rot.calendar)
    .filter(([id]) => !(skipOptional && (rot.optional || []).includes(id)))
    .flatMap(([, c]) => c.irrigated).sort((a, b) => a - b);
}

function monthCell(rot, m) {
  for (const [cropId, c] of Object.entries(rot.calendar)) {
    const crop = state.crops.crops.find((x) => x.id === cropId);
    if (c.irrigated.includes(m)) return { kind: "irr", crop };
    if (c.dry.includes(m)) return { kind: "dry", crop };
  }
  return { kind: "empty", crop: null };
}

function rotationMetrics(rot) {
  const months = irrigatedMonths(rot);
  const d = state.data;
  const cropIds = Object.keys(rot.calendar);
  const crops = cropIds.map((id) => state.crops.crops.find((c) => c.id === id));
  // "core" = without optional crops; only differs when rot.optional is set
  const core = irrigatedMonths(rot, true);
  const optionalNames = (rot.optional || []).map((id) => state.crops.crops.find((c) => c.id === id).name.toLowerCase());
  return {
    months,
    optionalNames,
    hasOptional: optionalNames.length > 0,
    coreHeat: Math.round(sumMonths(d.monthly_recent, "heat_days", core)),
    corePeakWater: PEAK.some((m) => core.includes(m)),
    heatRecent: Math.round(sumMonths(d.monthly_recent, "heat_days", months)),
    heatPast: Math.round(sumMonths(d.monthly_past, "heat_days", months)),
    rain: sumMonths(d.monthly_recent, "precip_sat_mm", months),
    peakWater: PEAK.some((m) => months.includes(m)),
    crops,
    allVerified: crops.every((c) => c.verified === true),
  };
}

// [lo, hi] in inches; lo = null means only an upper limit is known
const waterOne = (x) => (isUS() ? `${x} in` : `${Math.round((x * 25.4) / 10) * 10} mm`);
const waterFmt = ([lo, hi]) =>
  lo == null ? `up to ${waterOne(hi)}`
    : isUS() ? `${lo}–${hi} in` : `${Math.round((lo * 25.4) / 10) * 10}–${Math.round((hi * 25.4) / 10) * 10} mm`;
const srcTag = (key, src) =>
  `<a class="src" href="${src[key].url}" target="_blank" rel="noopener" title="${src[key].name}">${key}</a>`;

const monthRange = (months) => {
  // e.g. [4,5,6,9,10] -> "Apr–Jun, Sep–Oct"
  const runs = [];
  months.forEach((m) => {
    const last = runs[runs.length - 1];
    if (last && m === last[1] + 1) last[1] = m; else runs.push([m, m]);
  });
  return runs.map(([a, b]) => (a === b ? MONTH_NAME[a - 1] : `${MONTH_NAME[a - 1]}–${MONTH_NAME[b - 1]}`)).join(", ");
};

function calendarStrip(rot) {
  const cells = ALL_MONTHS.map((m) => {
    const c = monthCell(rot, m);
    const peak = PEAK.includes(m) ? " peak" : "";
    const title = `${MONTH_NAME[m - 1]}: ${c.crop ? c.crop.name + (c.kind === "irr" ? ", irrigated" : ", not irrigated") : "empty field"}`;
    return `<span class="cal-cell ${c.kind}${peak}" title="${title}">
              <span class="cal-crop">${c.crop ? c.crop.short : ""}</span>
              <span class="cal-m">${MONTH_ABBR[m - 1]}</span></span>`;
  }).join("");
  return `<div class="cal" role="img" aria-label="${calendarText(rot)}">${cells}</div>`;
}

function calendarText(rot) {
  return Object.entries(rot.calendar).map(([id, c]) => {
    const crop = state.crops.crops.find((x) => x.id === id);
    const parts = [];
    if (c.irrigated.length) parts.push(`irrigated ${monthRange(c.irrigated)}`);
    if (c.dry.length) parts.push(`not irrigated ${monthRange([...c.dry].sort((a, b) => a - b))}`);
    return `${crop.name}: ${parts.join("; ")}`;
  }).join(". ");
}

// ---------- crop trait table ----------
function drawCrops() {
  const crops = state.crops.crops;
  const src = state.crops.sources;
  const baseT = (c) => (c == null ? "unknown" : isUS() ? `${Math.round(C_TO_F(c))}°F` : `${c}°C`);
  const rows = [
    ["Type", (c) => c.type],
    ["When it grows", (c) => c.months],
    ["Base temp for growth (GDD)", (c) => baseT(c.base_temp_c)],
    ["Heat tolerance", (c) => c.heat],
    ["Frost tolerance", (c) => c.frost],
    ["Irrigation water per season", (c) => `<b>${waterFmt(c.water_in)}</b><span class="row-sub">${c.water_basis}</span>`],
    ["Salt tolerance", (c) => c.salt],
    ["Who buys it", (c) => c.use],
    ["Checked against sources?", (c) => `${c.verified === true ? "<b>✓ Yes</b>" : `<span class="unverified">Partly</span>`}<span class="row-sub">${c.check_note}</span>`],
    ["Sources", (c) => c.sources.map((s) => srcTag(s, src)).join(" ")],
  ];
  document.getElementById("crop-table").innerHTML = `
    <thead><tr><th scope="col">Trait</th>${crops.map((c) => `<th scope="col">${c.name} <span class="tag">${c.short}</span></th>`).join("")}</tr></thead>
    <tbody>${rows.map(([label, f]) => `<tr><th scope="row">${label}</th>${crops.map((c) => `<td>${f(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;

  document.getElementById("check-date").textContent = state.crops.source_check_date || "";
  document.getElementById("source-list").innerHTML =
    Object.keys(src).map((k) =>
      `<li>${srcTag(k, src)} ${src[k].name}${src[k].read === "summary" ? " <em>(only a search summary was read; open the link to confirm)</em>" : ""}</li>`).join("");
}

// ---------- rotation overview (all options) ----------
function drawRotationOverview() {
  const rots = state.crops.rotations;
  const ms = rots.map(rotationMetrics);
  const row = (label, f, sub) =>
    `<tr><th scope="row">${label}${sub ? `<span class="row-sub">${sub}</span>` : ""}</th>${rots.map((r, i) => `<td>${f(r, ms[i])}</td>`).join("")}</tr>`;
  document.getElementById("rotation-table").innerHTML = `
    <thead><tr><th scope="col"></th>${rots.map((r) => `<th scope="col">${r.is_current ? '<span class="tag now">NOW</span> ' : ""}${r.name.replace(/^Current: /, "")}</th>`).join("")}</tr></thead>
    <tbody>
      ${row("Field calendar", (r) => calendarStrip(r), "Jul–Aug outlined")}
      ${row("Irrigation water", (r) => `<b>${waterFmt(r.water_in)}</b>${r.water_note ? `<span class="row-sub">${r.water_note}</span>` : ""}`, "per year, from sources in the crop table")}
      ${row("Needs water in Jul–Aug?", (r, m) =>
        !m.peakWater ? "<b>No</b>" : m.corePeakWater ? "Yes" : `<b>Only if you grow ${m.optionalNames.join(", ")}</b>`)}
      ${row(`Very hot days (${heatLabel()}+) while irrigating`, (r, m) =>
        `<b>${m.heatRecent}</b> <span class="row-sub">was ${m.heatPast} in 1991–2015</span>` +
        (m.hasOptional && m.coreHeat !== m.heatRecent ? `<span class="row-sub"><b>${m.coreHeat}</b> without ${m.optionalNames.join(", ")}</span>` : ""),
        "NASA POWER, last 10 yrs")}
      ${row("Crop heat tolerance", (r, m) => m.crops.map((c) => `${c.short}: ${c.heat_short}`).join("<br>"))}
      ${row("Rain while irrigating", (r, m) => rainShort(m.rain), "GPM IMERG satellite")}
      ${row("Effort to switch", (r) => r.switch_effort.split(":")[0])}
    </tbody>`;
}

// ---------- side-by-side detail ----------
function rotationDetail(rot, facts) {
  const m = rotationMetrics(rot);
  const list = (items) => `<ul>${items.map((x) => `<li>${fill(x, facts)}</li>`).join("")}</ul>`;
  const evidence = [
    `You irrigate in <strong>${monthRange(m.months)}</strong>.`,
    `<strong>${m.heatRecent}</strong> very hot days a year fall in those months (was ${m.heatPast} in 1991–2015).`,
    `Rain in those months is only <strong>${rainShort(m.rain)}</strong>, so almost all the water is irrigation.`,
    !m.peakWater ? "<strong>No irrigation in Jul–Aug</strong>, the peak heat and water-demand months."
      : m.corePeakWater ? "Needs water during the Jul–Aug peak."
      : `Needs Jul–Aug water <strong>only if you grow ${m.optionalNames.join(", ")}</strong>. Without it: ${m.coreHeat} very hot ${daysWord(m.coreHeat)} while irrigating.`,
    `Water use: <strong>${waterFmt(rot.water_in)}</strong> per year${rot.water_note ? ` (${rot.water_note.toLowerCase()})` : ""}. From the sources in the crop table, not NASA data.`,
  ];
  return `
    <article class="card detail ${rot.is_current ? "is-current" : ""}">
      <p class="eyebrow">${rot.is_current ? "What you do now" : "Option"}</p>
      <h3>${rot.name.replace(/^Current: /, "")}</h3>
      ${calendarStrip(rot)}
      <h4>Why consider it</h4><p>${fill(rot.why, facts)}</p>
      <h4>Evidence from NASA data</h4><ul class="evidence">${evidence.map((e) => `<li>${e}</li>`).join("")}</ul>
      <h4>Benefits</h4>${list(rot.benefits)}
      <h4>Risks</h4>${list(rot.risks)}
      <h4>Data gaps</h4>${list(rot.data_gaps)}
      ${m.allVerified ? "" : `<p class="unverified-note">Some crop numbers for this option are only <span class="unverified">partly</span> backed by sources. See the crop table.</p>`}
    </article>`;
}

function drawRotationDetail() {
  const facts = climateFacts();
  const rots = state.crops.rotations;
  const current = rots.find((r) => r.is_current);
  const pick = rots.find((r) => r.id === state.compareWith) || rots.find((r) => !r.is_current);
  document.getElementById("compare-detail").innerHTML = rotationDetail(current, facts) + rotationDetail(pick, facts);
}

function drawCompareControls() {
  const seg = document.getElementById("compare-with");
  const alts = state.crops.rotations.filter((r) => !r.is_current);
  if (!state.compareWith) state.compareWith = alts[0].id;
  seg.innerHTML = alts.map((r) =>
    `<button type="button" data-rot="${r.id}" aria-pressed="${r.id === state.compareWith}">${r.name}</button>`).join("");
  if (!seg.dataset.wired) {
    seg.dataset.wired = "1";
    wireSeg("compare-with", "rot", (id) => { state.compareWith = id; drawRotationDetail(); });
  }
}

// Called from app.js render()
function drawCompare() {
  if (!state.crops) return;
  drawCrops();
  drawRotationOverview();
  drawCompareControls();
  drawRotationDetail();
}

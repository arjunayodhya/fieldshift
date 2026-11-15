/*
 * Field Shift: compare.js
 * Soil card, farmer priorities, rotation ranking, rotation comparison, crop traits.
 *
 * Inputs:
 *   data/power_summary.json  NASA POWER + GPM IMERG climate (state.data)
 *   data/soil.json           USDA soil survey for the site point (state.soil, optional)
 *   data/crops.json          crop traits + multi-year rotation options (state.crops)
 * Uses helpers and `state` from app.js (loaded first).
 *
 * AI-use note (NASA Space Apps rule): drafted with help from an AI coding
 * assistant (Claude by Anthropic) and reviewed/edited by our team. Climate
 * numbers are computed from NASA data. Crop numbers come from crops.json with
 * linked sources. Scores are a simple index our team defined (see
 * scoring_notes in crops.json), not predictions.
 */

const MONTH_ABBR = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAME = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PEAK = [7, 8]; // Jul–Aug
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// rain: 1 decimal in inches, whole mm in metric
const rainShort = (mm) => rainFmt(mm, isUS() ? 1 : 0);
const sumMonths = (monthly, field, months) => months.reduce((a, m) => a + monthly[m - 1][field], 0);
const clamp = (x) => Math.max(0, Math.min(100, x));
const cropById = (id) => state.crops.crops.find((c) => c.id === id);
const uniq = (arr) => [...new Set(arr)];

// ---------- farmer priorities ----------
const CRITERIA = [
  { key: "water", label: "Use less water", short: "Water" },
  { key: "heat", label: "Avoid summer heat stress", short: "Heat" },
  { key: "soil", label: "Build soil health", short: "Soil" },
  { key: "market", label: "Sell to known buyers", short: "Market" },
  { key: "ease", label: "Keep the change easy", short: "Ease" },
];
const LEVELS = ["Not important", "A little", "Important", "Most important"];
const PRIORITY_KEY = "fieldshift.priorities";

function loadPriorities() {
  const p = Object.fromEntries(CRITERIA.map((c) => [c.key, 2]));
  try {
    const saved = JSON.parse(localStorage.getItem(PRIORITY_KEY) || "{}");
    CRITERIA.forEach((c) => { if (Number.isInteger(saved[c.key]) && saved[c.key] >= 0 && saved[c.key] <= 3) p[c.key] = saved[c.key]; });
  } catch (e) { /* storage unavailable: use defaults */ }
  return p;
}
function savePriorities() {
  try { localStorage.setItem(PRIORITY_KEY, JSON.stringify(state.priorities)); } catch (e) { /* ignore */ }
}

// ---------- climate facts from NASA data ----------
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

// ---------- water formatting ----------
// [lo, hi] in inches; lo = null means only an upper limit is known
const waterOne = (x) => (isUS() ? `${Math.round(x)} in` : `${Math.round((x * 25.4) / 10) * 10} mm`);
const waterFmt = ([lo, hi]) =>
  lo == null ? `up to ${waterOne(hi)}`
    : isUS() ? `${Math.round(lo)}–${Math.round(hi)} in`
      : `${Math.round((lo * 25.4) / 10) * 10}–${Math.round((hi * 25.4) / 10) * 10} mm`;
const srcTag = (key, src) =>
  `<a class="src" href="${src[key].url}" target="_blank" rel="noopener" title="${src[key].name}">${key}</a>`;

const monthRange = (months) => {
  // e.g. [4,5,6,9,10] -> "Apr–Jun, Sep–Oct"
  const runs = [];
  [...months].sort((a, b) => a - b).forEach((m) => {
    const last = runs[runs.length - 1];
    if (last && m === last[1] + 1) last[1] = m; else runs.push([m, m]);
  });
  return runs.map(([a, b]) => (a === b ? MONTH_NAME[a - 1] : `${MONTH_NAME[a - 1]}–${MONTH_NAME[b - 1]}`)).join(", ");
};

// ---------- rotation maths ----------
// A rotation is a list of phases, e.g. 4 years alfalfa then 1 year triticale.
// A phase can have an optional crop grown in only a share of years (teff in
// good water years): split it into "without" and "with" sub-phases.
function expandPhases(rot) {
  const out = [];
  for (const p of rot.phases) {
    if (p.optional) {
      const s = p.optional.share;
      out.push({ ...p, years: p.years * (1 - s), variant: "without" });
      out.push({ ...p, years: p.years * s, calendar: { ...p.calendar, ...p.optional.calendar }, variant: "with" });
    } else out.push(p);
  }
  return out;
}

// Yearly irrigation water for one phase, [lo, hi] inches. Where a crop only
// has an upper limit (lo = null), the upper limit is used for both.
function phaseWater(p) {
  if (p.water_in) return p.water_in;
  let lo = 0, hi = 0;
  for (const id of Object.keys(p.calendar)) {
    const [l, h] = cropById(id).water_in;
    lo += l == null ? h : l;
    hi += h;
  }
  return [lo, hi];
}
const phaseIrrigated = (p) => uniq(Object.values(p.calendar).flatMap((c) => c.irrigated));
const phaseCovered = (p) => uniq(Object.values(p.calendar).flatMap((c) => [...c.irrigated, ...c.dry]));

function saltRetention(crop, ec) {
  if (ec == null || crop.salt_threshold_dsm == null) return null;
  return clamp(100 - crop.salt_slope_pct * Math.max(0, ec - crop.salt_threshold_dsm));
}

function metrics(rot) {
  const d = state.data, rec = d.monthly_recent, past = d.monthly_past;
  const yearHeat = sumMonths(rec, "heat_days", ALL_MONTHS);
  const phases = expandPhases(rot);
  const T = phases.reduce((a, p) => a + p.years, 0);
  let lo = 0, hi = 0, heatR = 0, heatP = 0, expo = 0, rain = 0, peakYears = 0, cover = 0, plantings = 0, legYears = 0;
  const cropIds = [];

  for (const p of phases) {
    const [l, h] = phaseWater(p);
    lo += l * p.years; hi += h * p.years;
    const irr = phaseIrrigated(p);
    heatR += sumMonths(rec, "heat_days", irr) * p.years;
    heatP += sumMonths(past, "heat_days", irr) * p.years;
    rain += sumMonths(rec, "precip_sat_mm", irr) * p.years;
    cover += phaseCovered(p).length * p.years;
    if (PEAK.some((m) => irr.includes(m))) peakYears += p.years;
    let legume = false;
    for (const [id, c] of Object.entries(p.calendar)) {
      const crop = cropById(id);
      cropIds.push(id);
      expo += sumMonths(rec, "heat_days", c.irrigated) * crop.heat_sensitivity * p.years;
      // a perennial is planted once per stand; an annual every year it is grown
      plantings += crop.perennial ? (p.variant === "with" ? 0 : 1) : p.years;
      if (crop.legume) legume = true;
    }
    if (legume) legYears += p.years;
  }

  const crops = uniq(cropIds).map(cropById);
  const ec = state.soil ? state.soil.root_zone.ec_dsm_max : null;
  const salts = crops.map((c) => saltRetention(c, ec)).filter((x) => x != null);

  // soil health parts (0–100), after the USDA NRCS soil health principles
  const soilParts = {
    cover: { label: "Ground has a crop on it", score: clamp((cover / (12 * T)) * 100), detail: `${(cover / T).toFixed(1)} of 12 months` },
    disturb: { label: "Seldom replanted", score: clamp(100 * (1 - Math.min(plantings / T, 2) / 2)), detail: `${(plantings / T).toFixed(1)} plantings a year` },
    diversity: { label: "Different crops", score: [0, 25, 60, 85, 100][Math.min(crops.length, 4)], detail: `${crops.length} crop${crops.length === 1 ? "" : "s"}` },
    legume: { label: "Legume in the rotation", score: clamp((legYears / T) * 100), detail: `${Math.round((legYears / T) * 100)}% of years` },
  };
  if (salts.length) {
    soilParts.salt = { label: "Crops fit your soil's salt level", score: salts.reduce((a, b) => a + b, 0) / salts.length, detail: `survey: ${ec} dS/m` };
  }
  const partScores = Object.values(soilParts).map((p) => p.score);

  const water = [lo / T, hi / T];
  const scores = {
    water: clamp(100 * (1 - (water[0] + water[1]) / 2 / 60)),
    heat: clamp(100 * (1 - expo / (T * yearHeat))),
    soil: partScores.reduce((a, b) => a + b, 0) / partScores.length,
    market: rot.market_score,
    ease: rot.ease_score,
  };
  // farmer constraint: sells to horse owners, and this rotation grows a crop horses cannot eat
  const horseConflict = !!(state.constraints && state.constraints.horse) && crops.some((x) => x.not_for_horses);
  if (horseConflict) scores.market = Math.round(scores.market * 0.4);
  const wsum = CRITERIA.reduce((a, c) => a + state.priorities[c.key], 0);
  const total = wsum === 0
    ? CRITERIA.reduce((a, c) => a + scores[c.key], 0) / CRITERIA.length
    : CRITERIA.reduce((a, c) => a + scores[c.key] * state.priorities[c.key], 0) / wsum;

  return {
    years: T, water, heatRecent: heatR / T, heatPast: heatP / T, rain: rain / T,
    peakShare: peakYears / T, crops, soilParts, scores, total,
    allVerified: crops.every((c) => c.verified === true),
    hasDeficit: rot.phases.some((p) => p.deficit),
    horseConflict, bareMonths: 12 - cover / T, legumeShare: legYears / T,
  };
}

// months with no crop on the field, per phase (before any optional crop)
function bareText(rot) {
  const parts = rot.phases.map((p) => {
    const empty = ALL_MONTHS.filter((m) => !phaseCovered(p).includes(m));
    if (!empty.length) return null;
    const opt = p.optional ? ` (unless ${cropById(p.optional.crop).name.toLowerCase()} is grown)` : "";
    return `${rot.phases.length > 1 ? p.label + ": " : ""}${monthRange(empty)}${opt}`;
  }).filter(Boolean);
  return parts.length ? parts.join("; ") : "None: covered all year";
}

// what the rotation does for the soil, from crop traits
function soilBenefits(m) {
  const out = [];
  if (m.legumeShare > 0) out.push("Fixes its own nitrogen (legume)");
  if (m.crops.some((x) => x.deep_rooted)) out.push("Deep roots open up the soil");
  if (m.crops.length > 1 && m.crops.some((x) => x.id === "alfalfa")) out.push("Break year interrupts the alfalfa pest and disease cycle");
  if (m.crops.length > 1) out.push("Mix of crop types feeds different soil life");
  if (m.bareMonths < 0.05) out.push("Ground covered all year (less wind erosion)");
  if (m.crops.some((x) => x.heat_sensitivity < 0.5)) out.push("Includes a heat-tolerant crop");
  return out;
}

const peakText = (share) =>
  share === 0 ? "<b>No</b>" : share === 1 ? "Yes, every year" : `About ${Math.round(share * 10)} years in 10`;

// ---------- field calendar ----------
function phaseCells(p) {
  return ALL_MONTHS.map((m) => {
    let kind = "empty", crop = null;
    for (const [id, c] of Object.entries(p.calendar)) {
      if (c.irrigated.includes(m)) { kind = "irr"; crop = cropById(id); break; }
      if (c.dry.includes(m)) { kind = "dry"; crop = cropById(id); }
    }
    if (kind === "empty" && p.optional) {
      const oc = p.optional.calendar[p.optional.crop];
      if (oc.irrigated.includes(m) || oc.dry.includes(m)) { kind = "opt"; crop = cropById(p.optional.crop); }
    }
    const what = !crop ? "empty field"
      : kind === "opt" ? `${crop.name}, only in good water years`
        : `${crop.name}, ${kind === "irr" ? "irrigated" : "not irrigated"}`;
    return `<span class="cal-cell ${kind}${PEAK.includes(m) ? " peak" : ""}" title="${MONTH_NAME[m - 1]}: ${what}">
              <span class="cal-crop">${crop ? crop.short : ""}</span>
              <span class="cal-m">${MONTH_ABBR[m - 1]}</span></span>`;
  }).join("");
}

function phaseText(p) {
  const parts = Object.entries(p.calendar).map(([id, c]) => {
    const bits = [];
    if (c.irrigated.length) bits.push(`irrigated ${monthRange(c.irrigated)}`);
    if (c.dry.length) bits.push(`not irrigated ${monthRange(c.dry)}`);
    return `${cropById(id).name} ${bits.join(", ")}`;
  });
  if (p.optional) parts.push(`${cropById(p.optional.crop).name} only in good water years`);
  return `${p.label}: ${parts.join("; ")}`;
}

function calendarBlock(rot) {
  const label = rot.phases.map(phaseText).join(". ");
  return `<div class="cal-block" role="img" aria-label="${label}">${rot.phases.map((p) => `
      <div class="cal-row"><span class="cal-label">${p.label}</span><div class="cal">${phaseCells(p)}</div></div>`).join("")}
    </div>`;
}

// ---------- soil card ----------
function drawSoil() {
  const box = document.getElementById("soil-card");
  const s = state.soil;
  if (!s) {
    box.innerHTML = `<p class="sub">No local soil file found (data/soil.json). Run <code>python scripts/get_soil.py</code> to add it.</p>`;
    return;
  }
  const held = isUS() ? `${s.root_zone.water_held_in} in` : `${Math.round(s.root_zone.water_held_in * 25.4)} mm`;
  const depth = isUS() ? `${Math.round(s.root_zone_cm / 2.54)} in` : `${s.root_zone_cm} cm`;
  const ec = s.root_zone.ec_dsm_max;
  const limits = state.crops.crops.filter((c) => c.salt_threshold_dsm != null);
  const over = limits.filter((c) => ec > c.salt_threshold_dsm);
  const means = [];
  if (s.texture === "sandy") {
    means.push(`<strong>Sandy soil holds little water</strong> (about ${held} in the top ${depth}). It needs lighter, more frequent irrigation, and crops feel a missed irrigation sooner.`);
  } else if (s.texture === "loam") {
    means.push(`<strong>Loam topsoil holds a fair amount of water</strong> (about ${held} in the top ${depth}), so crops can ride out a few days between irrigations.`);
  } else if (s.texture === "clay") {
    means.push(`<strong>Clay soil holds a lot of water</strong> (about ${held} in the top ${depth}) but takes it in slowly.`);
  }
  const deepSand = s.horizons.find((h) => h.top_cm >= 30 && h.sand_pct >= 85);
  if (deepSand && s.texture !== "sandy") {
    const at = isUS() ? `${Math.round(deepSand.top_cm / 2.54)} in` : `${Math.round(deepSand.top_cm)} cm`;
    means.push(`<strong>There is a sand layer from about ${at} down</strong>. Water that gets past the topsoil drains away fast, so deep-rooted alfalfa finds less stored water down there.`);
  }
  means.push(over.length
    ? `<strong>Salt may limit ${over.map((c) => c.name.toLowerCase()).join(", ")}</strong>: the survey's ${ec} dS/m is above their limit.`
    : `<strong>Salt is not a limit here, per the survey</strong>: ${ec} dS/m is below the limit for every crop compared (alfalfa is the most sensitive at 2.0).`);
  if (s.topsoil.organic_matter_pct < 1) {
    means.push(`<strong>Organic matter is low</strong> (${s.topsoil.organic_matter_pct}%), so keeping the ground covered and tilling less matters more on this soil.`);
  }
  if (/poorly/i.test(s.drainage)) {
    means.push(`<strong>Drainage is "${s.drainage.toLowerCase()}"</strong>: water can sit in the root zone, and salt can build up over time. Worth a soil test.`);
  }
  const stat = (label, value, sub) => `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span>${sub ? `<span class="row-sub">${sub}</span>` : ""}</div>`;
  box.innerHTML = `
    <p class="eyebrow">USDA soil survey at the study field (${s.site.lat}°N, ${Math.abs(s.site.lon)}°W)</p>
    <h3>${s.map_unit}</h3>
    <div class="stats">
      ${stat("Texture", `${Math.round(s.topsoil.sand_pct)}% sand`, `${Math.round(s.topsoil.silt_pct)}% silt, ${Math.round(s.topsoil.clay_pct)}% clay`)}
      ${stat("Water it can hold", held, `top ${depth}`)}
      ${stat("Salt (EC)", `${ec} dS/m`, "highest in root zone")}
      ${stat("Organic matter", `${s.topsoil.organic_matter_pct}%`, "topsoil")}
      ${stat("pH", `${s.topsoil.ph}–${s.root_zone.ph_max}`, "top to root zone")}
      ${stat("Drainage", s.drainage.replace(/ drained$/i, ""), "")}
    </div>
    <h4>What this means for your choices</h4>
    <ul>${means.map((m) => `<li>${m}</li>`).join("")}</ul>
    <p class="sub">${s.data_notes[0]} Source: ${s.source}.</p>`;
}

function soilCautions(rot, m) {
  const s = state.soil;
  if (!s) return [];
  const out = [];
  if (m.hasDeficit && s.texture === "sandy") {
    out.push(`Your soil is sandy (${Math.round(s.topsoil.sand_pct)}% sand). In the UC trials, hay losses from cutting water were bigger on lighter soils, so expect the high end of the loss range.`);
  } else if (m.hasDeficit && s.texture === "loam") {
    out.push("Your soil is loam. In the UC trials, hay losses from cutting water were bigger on loam and sandy loam than on the organic soils at Tulelake, so don't count on the low end of the loss range.");
  }
  const ec = s.root_zone.ec_dsm_max;
  m.crops.filter((c) => c.salt_threshold_dsm != null && ec > c.salt_threshold_dsm)
    .forEach((c) => out.push(`${c.name} starts losing yield above ${c.salt_threshold_dsm} dS/m; your soil survey shows ${ec}.`));
  m.crops.filter((c) => c.salt_threshold_dsm == null)
    .forEach((c) => out.push(`${c.name} has no published salt limit, so its fit with your soil is unknown.`));
  return out;
}

// ---------- priorities + ranking ----------
function drawPriorities() {
  const box = document.getElementById("priority-controls");
  box.innerHTML = CRITERIA.map((c) => `
    <label class="prio" for="prio-${c.key}">
      <span class="prio-label">${c.label}</span>
      <input type="range" id="prio-${c.key}" data-key="${c.key}" min="0" max="3" step="1" value="${state.priorities[c.key]}"
             aria-valuetext="${LEVELS[state.priorities[c.key]]}">
      <span class="prio-value" id="prio-val-${c.key}">${LEVELS[state.priorities[c.key]]}</span>
    </label>`).join("");
  const horse = document.getElementById("con-horse");
  horse.checked = state.constraints.horse;
  if (!box.dataset.wired) {
    horse.addEventListener("change", () => {
      state.constraints.horse = horse.checked;
      state.comparePicked = false;
      drawRanking(); drawCompareControls(); drawRotationDetail();
    });
  }
  if (!box.dataset.wired) {
    box.dataset.wired = "1";
    box.addEventListener("input", (e) => {
      const el = e.target.closest("input[type=range]");
      if (!el) return;
      const v = Number(el.value);
      state.priorities[el.dataset.key] = v;
      el.setAttribute("aria-valuetext", LEVELS[v]);
      document.getElementById(`prio-val-${el.dataset.key}`).textContent = LEVELS[v];
      savePriorities();
      state.comparePicked = false; // follow the new best fit
      drawRanking();
      drawCompareControls();
      drawRotationDetail();
    });
  }
}

function ranked() {
  return state.crops.rotations
    .map((r) => ({ rot: r, m: metrics(r) }))
    .sort((a, b) => b.m.total - a.m.total);
}

// extra lines under a ranked rotation: water stress test result and constraint conflicts
function rankFlags(rot, m) {
  const out = [];
  const st = typeof stressShortYears === "function" ? stressShortYears(rot) : null;
  if (st) out.push(`Stress test: short on water in <b>${st.short} of ${st.of}</b> past years with ${waterLabel(state.stress.water)}`);
  if (m.horseConflict) out.push("<b>Not for horse buyers:</b> includes sorghum-sudangrass, which horses cannot eat");
  return out.length ? `<div class="rank-flags">${out.map((x) => `<span>${x}</span>`).join("")}</div>` : "";
}

function drawRanking() {
  const list = ranked();
  const notes = state.crops.scoring_notes;
  const noneSet = CRITERIA.every((c) => state.priorities[c.key] === 0);
  document.getElementById("ranking").innerHTML = list.map(({ rot, m }, i) => `
    <li class="rank ${i === 0 ? "best" : ""}">
      <div class="rank-head">
        <span class="rank-n">${i + 1}</span>
        <span class="rank-name">${rot.name}
          ${rot.is_current ? '<span class="tag now">NOW</span>' : ""}${i === 0 ? '<span class="tag fit">Best fit</span>' : ""}</span>
        <span class="rank-total">${Math.round(m.total)}<span class="rank-of">/100</span></span>
      </div>
      <div class="bar" aria-hidden="true"><span style="width:${m.total.toFixed(1)}%"></span></div>
      <div class="chips">${CRITERIA.map((c) => `
        <span class="chip ${state.priorities[c.key] === 0 ? "off" : ""}" title="${notes[c.key]}">
          ${c.short} <b>${Math.round(m.scores[c.key])}</b><i class="mini"><i style="width:${m.scores[c.key].toFixed(0)}%"></i></i></span>`).join("")}
      </div>
      ${rankFlags(rot, m)}
    </li>`).join("");
  document.getElementById("ranking-note").textContent = noneSet
    ? "Everything is set to \"Not important\", so all five are weighted equally."
    : "Move the sliders and the order updates. Greyed-out scores are ones you set to \"Not important\".";
  document.getElementById("scoring-notes").innerHTML =
    [notes.about, ...CRITERIA.map((c) => `<strong>${c.short}:</strong> ${notes[c.key]}`), notes.optional_share]
      .map((n) => `<li>${n}</li>`).join("");
}

// ---------- rotation overview (all options) ----------
function drawRotationOverview() {
  const rots = state.crops.rotations;
  const ms = rots.map(metrics);
  const row = (label, f, sub) =>
    `<tr><th scope="row">${label}${sub ? `<span class="row-sub">${sub}</span>` : ""}</th>${rots.map((r, i) => `<td>${f(r, ms[i])}</td>`).join("")}</tr>`;
  document.getElementById("rotation-table").innerHTML = `
    <thead><tr><th scope="col"></th>${rots.map((r) => `<th scope="col">${r.is_current ? '<span class="tag now">NOW</span> ' : ""}${r.short_name}</th>`).join("")}</tr></thead>
    <tbody>
      ${row("Field calendar", (r) => calendarBlock(r), "Jul–Aug outlined")}
      ${row("Irrigation water", (r, m) => `<b>${waterFmt(m.water)}</b>`, "average per year over the rotation")}
      ${row("Needs water in Jul–Aug?", (r, m) => peakText(m.peakShare))}
      ${row(`Very hot days (${heatLabel()}+) while irrigating`, (r, m) =>
        `<b>${Math.round(m.heatRecent)}</b> <span class="row-sub">was ${Math.round(m.heatPast)} in 1991–2015</span>`, "NASA POWER, last 10 yrs, per year")}
      ${row("Crop heat tolerance", (r, m) => m.crops.map((c) => `${c.short}: ${c.heat_short}`).join("<br>"))}
      ${row("Soil health score", (r, m) => `<b>${Math.round(m.scores.soil)}</b>/100` +
        `<span class="row-sub">${m.soilParts.cover.detail} covered; ${m.soilParts.disturb.detail}; ${m.soilParts.diversity.detail}</span>`, "from USDA soil health principles")}
      ${row("Months the field is bare", (r, m) => `<b>${m.bareMonths.toFixed(1)}</b> a year<span class="row-sub">${bareText(r)}</span>`, "bare ground can blow away and loses organic matter")}
      ${row("What it does for the soil", (r, m) => soilBenefits(m).map((x) => `<span class="benefit">${x}</span>`).join("") || "—")}
      ${row("Rain while irrigating", (r, m) => rainShort(m.rain), "GPM IMERG satellite, per year")}
      ${row("Effort to switch", (r) => r.switch_effort.split(":")[0])}
    </tbody>`;
}

// ---------- side-by-side detail ----------
function rotationDetail(rot, facts) {
  const m = metrics(rot);
  const list = (items) => `<ul>${items.map((x) => `<li>${fill(x, facts)}</li>`).join("")}</ul>`;
  const evidence = [
    `<strong>${Math.round(m.heatRecent)}</strong> very hot days a year fall in the months you irrigate (was ${Math.round(m.heatPast)} in 1991–2015).`,
    `Rain in those months is only <strong>${rainShort(m.rain)}</strong>, so almost all the water is irrigation.`,
    m.peakShare === 0 ? "<strong>No irrigation in Jul–Aug</strong>, the peak heat and water-demand months."
      : m.peakShare === 1 ? "Needs water during the Jul–Aug peak every year."
        : `Needs Jul–Aug water in about <strong>${Math.round(m.peakShare * 10)} years in 10</strong>.`,
    `Water use: <strong>${waterFmt(m.water)}</strong> a year on average. From the sources in the crop table, not NASA data.`,
  ];
  // MODIS greenness at the study field (only if it is a real alfalfa field)
  const nd = state.field && state.field.ndvi;
  if (nd && nd.on_study_field && nd.heat_vs_summer_greenness && nd.heat_vs_summer_greenness.r != null && m.crops.some((x) => x.id === "alfalfa") && m.peakShare > 0) {
    const hv = nd.heat_vs_summer_greenness;
    const word = Math.abs(hv.r) >= 0.5 ? "was" : Math.abs(hv.r) >= 0.3 ? "tended to be" : null;
    evidence.push(word && hv.r < 0
      ? `At the study alfalfa field, Jul–Aug greenness (MODIS) <strong>${word} lower in hotter summers</strong> (r = ${hv.r}, ${hv.n_years} years). Small sample, and hot years are often short-water years too.`
      : `At the study alfalfa field, MODIS greenness shows no clear link between hotter summers and Jul–Aug greenness (r = ${hv.r}, ${hv.n_years} years).`);
  }
  const cautions = soilCautions(rot, m);
  return `
    <article class="card detail ${rot.is_current ? "is-current" : ""}">
      <p class="eyebrow">${rot.is_current ? "What you do now" : "Option"} · fit score ${Math.round(m.total)}/100</p>
      <h3>${rot.name}</h3>
      ${calendarBlock(rot)}
      <h4>Why consider it</h4><p>${fill(rot.why, facts)}</p>
      <h4>Evidence from NASA data</h4><ul class="evidence">${evidence.map((e) => `<li>${e}</li>`).join("")}</ul>
      <h4>Soil health: ${Math.round(m.scores.soil)}/100</h4>
      <ul class="parts">${Object.values(m.soilParts).map((p) =>
        `<li><span>${p.label}</span><span class="part-detail">${p.detail}</span><b>${Math.round(p.score)}</b></li>`).join("")}</ul>
      ${cautions.length ? `<h4>For your soil</h4>${list(cautions)}` : ""}
      <h4>Benefits</h4>${list(rot.benefits)}
      <h4>Risks to check with a local expert</h4>${list(rot.risks)}
      <h4>Data gaps</h4>${list(rot.data_gaps)}
      <p class="unverified-note">Market: ${rot.market_note} (our rating).
        ${m.allVerified ? "" : `Some crop numbers for this option are only <span class="unverified">partly</span> backed by sources. See the crop table.`}</p>
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
  // until the farmer picks one, show the best-fitting alternative
  if (!state.comparePicked) state.compareWith = ranked().find((x) => !x.rot.is_current).rot.id;
  seg.innerHTML = alts.map((r) =>
    `<button type="button" data-rot="${r.id}" aria-pressed="${r.id === state.compareWith}">${r.short_name}</button>`).join("");
  if (!seg.dataset.wired) {
    seg.dataset.wired = "1";
    wireSeg("compare-with", "rot", (id) => { state.compareWith = id; state.comparePicked = true; drawRotationDetail(); });
  }
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

// Called from app.js render()
function drawCompare() {
  if (!state.crops) return;
  if (!state.priorities) state.priorities = loadPriorities();
  drawSoil();
  drawPriorities();
  drawRanking();
  drawRotationOverview();
  drawCompareControls();
  drawRotationDetail();
  drawCrops();
}

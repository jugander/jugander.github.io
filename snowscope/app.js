const statusEl = document.getElementById("status");
const formEl = document.getElementById("query-form");
const metaEl = document.getElementById("meta");
const summaryEl = document.getElementById("summary");
const stationCheckEl = document.getElementById("station-check");
const viewModeBannerEl = document.getElementById("view-mode-banner");
const eventsListEl = document.getElementById("events-list");
const latInputEl = document.getElementById("lat-input");
const lonInputEl = document.getElementById("lon-input");
const shortcutEls = document.querySelectorAll(".location-shortcut");
const chartCardEls = document.querySelectorAll("[data-chart-card]");
const ruleHelpModalEl = document.getElementById("rule-help-modal");
const ruleHelpTitleEl = document.getElementById("rule-help-title");
const ruleHelpBodyEl = document.getElementById("rule-help-body");
const ruleHelpCloseEl = document.getElementById("rule-help-close");
const mapPickerOpenEl = document.getElementById("map-picker-open");
const mapPickerModalEl = document.getElementById("map-picker-modal");
const mapPickerCloseEl = document.getElementById("map-picker-close");
const mapPickerPickEl = document.getElementById("map-picker-pick");
const mapPickerCoordsEl = document.getElementById("map-picker-coords");
const mapPickerCanvasEl = document.getElementById("map-picker-canvas");

const FREEZE_F = 32;
const DEFAULT_LAT = 37.783687;
const DEFAULT_LON = -119.516807;
const NWS_API_ROOT = "https://api.weather.gov";

const THRESHOLDS = {
  minSnowpackForSurfaceEffectsIn: 2,
  rainOnSnowIn: 0.1,
  slabWindMph: 25,
  windRecentSnowDays: 7,
  slabSnowfallIn: 2,
  strongSunBakeIndex: 55
};

const RULE_HELP = {
  freeze: {
    title: "Freeze-Thaw Rule",
    body:
      `A day qualifies when all are true:\n` +
      `- Active snowpack exists (>= ${THRESHOLDS.minSnowpackForSurfaceEffectsIn} in depth, previous day had that depth, or >= ${THRESHOLDS.slabSnowfallIn} in snowfall)\n` +
      `- Daily minimum temperature <= 31F\n` +
      `- Daily maximum temperature >= 33F`
  },
  rain: {
    title: "Rain-on-Snow Rule",
    body:
      `A day qualifies when all are true:\n` +
      `- Active snowpack exists (same active-snowpack test as freeze-thaw)\n` +
      `- Phase-estimated rain >= ${THRESHOLDS.rainOnSnowIn} in liquid water equivalent`
  },
  wind: {
    title: "Wind Slab Risk Rule",
    body:
      `A day qualifies when all are true:\n` +
      `- Daily max wind >= ${THRESHOLDS.slabWindMph} mph\n` +
      `- And there has been any snowfall (> 0 in/day) within the last ${THRESHOLDS.windRecentSnowDays} days (including the current day)`
  },
  sun: {
    title: "Strong Sun-Bake Rule",
    body:
      `A day qualifies when all are true:\n` +
      `- Active snowpack exists (same active-snowpack test as freeze-thaw)\n` +
      `- Sun-bake index >= ${THRESHOLDS.strongSunBakeIndex}\n` +
      `Sun-bake index combines daily shortwave total, max temperature, and thaw hours.`
  },
  powder: {
    title: "Powder Score Logic",
    body:
      `Powder Score is a daily heuristic from 0 to 100.\n` +
      `Higher score means better expected soft-snow quality.\n\n` +
      `Main positive signal:\n` +
      `- Recent snowfall (weighted to favor the latest day)\n` +
      `- A quality bonus for fresh + cold + dry + lower-density snow with lower sun/wind stress\n\n` +
      `Main penalties:\n` +
      `- Snow age (days since fresh snow)\n` +
      `- Thaw/warmth (max temp and thaw hours)\n` +
      `- Rain amount\n` +
      `- Sun exposure (shortwave, stronger when warm)\n` +
      `- Wind loading/scouring potential\n` +
      `- New-snow density (water per inch of snow; heavier snow gets penalized)\n` +
      `- Thin snowpack coverage\n\n` +
      `This is for quick comparison across days, not a formal stability or avalanche forecast.`
  }
};

const EVENT_TIMELINE_META = {
  freeze: { label: "Freeze-Thaw", color: "#4a7ad1" },
  rain: { label: "Rain-on-Snow", color: "#8a3131" },
  wind: { label: "Wind Slab", color: "#476a3b" },
  sun: { label: "Sun-Bake", color: "#9d720d" }
};

const PLOT_LEFT_MARGIN = 96;

// Intentionally excludes forecast-chart so forward outlook hover remains isolated.
const LINKED_CHART_IDS = [
  "events-timeline-chart",
  "temperature-chart",
  "freezing-level-chart",
  "precip-chart",
  "powder-chart",
  "snowpack-chart",
  "wind-chart",
  "sun-chart"
];
const DAILY_X_CHART_IDS = new Set([
  "events-timeline-chart",
  "precip-chart",
  "powder-chart",
  "snowpack-chart",
  "wind-chart",
  "sun-chart"
]);
const CHART_IDS_WITH_SOURCE = [
  "events-timeline-chart",
  "temperature-chart",
  "freezing-level-chart",
  "precip-chart",
  "powder-chart",
  "snowpack-chart",
  "wind-chart",
  "sun-chart",
  "forecast-chart"
];
const CHART_SOURCE_METRICS = {
  "events-timeline-chart": ["temperature", "wind", "snowfall", "rain", "snow_depth", "shortwave"],
  "temperature-chart": ["temperature"],
  "freezing-level-chart": ["freezing_level"],
  "precip-chart": ["snowfall", "rain"],
  "powder-chart": ["temperature", "wind", "snowfall", "rain", "snow_depth", "shortwave"],
  "snowpack-chart": ["snow_depth"],
  "wind-chart": ["wind"],
  "sun-chart": ["shortwave"],
  "forecast-chart": []
};
const CHART_SOURCE_LABELS = {
  model: "Model",
  station: "Station",
  mixed: "Station+Model"
};
const METRIC_SOURCE_LABELS = {
  temperature: "Temperature",
  snowfall: "Snowfall",
  rain: "Rain",
  precip: "Precipitation",
  wind: "Wind",
  shortwave: "Shortwave Radiation",
  snow_depth: "Snow Depth",
  freezing_level: "Freezing Elevation"
};
const chartBaseShapes = {};
let sharedHoverDayKey = null;
let clearHoverTimer = null;
let expandedChartCardEl = null;
let activeLoadToken = 0;
let activeLoadController = null;
let activeChartSources = {};
let activeMetricSourceStats = null;
let activeDataMode = "model";
const tzHourFormatterCache = new Map();
let mapPickerMap = null;
let mapPickerMarker = null;
let mapPickerLatLon = null;

const EXPAND_MODEBAR_ICON = {
  width: 1000,
  height: 1000,
  path: "M180 380V180h200v80H260v120h-80zm640 0V260H700v-80h200v200h-80zM260 820h120v80H180V700h80v120zm440 80v-80h120V700h80v200H700z"
};

function fmtDateLocal(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTzHourFormatter(timezone) {
  const tzKey = typeof timezone === "string" && timezone && timezone !== "auto" ? timezone : "UTC";
  if (tzHourFormatterCache.has(tzKey)) {
    return tzHourFormatterCache.get(tzKey);
  }
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tzKey,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23"
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23"
    });
  }
  tzHourFormatterCache.set(tzKey, formatter);
  return formatter;
}

function formatHourKeyInTimezone(timestampIso, timezone) {
  if (typeof timestampIso !== "string" || !timestampIso) {
    return null;
  }
  const dateObj = new Date(timestampIso);
  if (!Number.isFinite(dateObj.getTime())) {
    return null;
  }
  const formatter = getTzHourFormatter(timezone);
  const parts = formatter.formatToParts(dateObj);
  const byType = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      byType[part.type] = part.value;
    }
  }
  if (!byType.year || !byType.month || !byType.day || !byType.hour) {
    return null;
  }
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:00`;
}

function getSeasonStart(today = new Date()) {
  const currentYear = today.getFullYear();
  const currentSeasonAnchor = new Date(currentYear, 10, 1);
  const seasonYear = today >= currentSeasonAnchor ? currentYear : currentYear - 1;
  return `${seasonYear}-11-01`;
}

function toNum(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function isAbortError(err) {
  return err instanceof DOMException ? err.name === "AbortError" : err instanceof Error && err.name === "AbortError";
}

function setStatus(text) {
  statusEl.textContent = text;
}

function getChartCardById(chartId) {
  return document.querySelector(`[data-chart-card][data-chart-id="${chartId}"]`);
}

function ensureChartSourceBadge(cardEl) {
  if (!cardEl) {
    return null;
  }
  let badgeEl = cardEl.querySelector(".chart-source-badge");
  if (badgeEl) {
    return badgeEl;
  }

  const headEl = cardEl.querySelector(".chart-card-head");
  if (!headEl) {
    return null;
  }

  badgeEl = document.createElement("button");
  badgeEl.type = "button";
  badgeEl.dataset.chartSourceHelp = "1";
  badgeEl.className = "chart-source-badge model";
  badgeEl.textContent = CHART_SOURCE_LABELS.model;
  badgeEl.title = "Click for data-source details";
  const closeBtn = headEl.querySelector(".chart-close");
  if (closeBtn) {
    closeBtn.insertAdjacentElement("beforebegin", badgeEl);
  } else {
    headEl.append(badgeEl);
  }

  return badgeEl;
}

function setChartCardSource(chartId, source) {
  const cardEl = getChartCardById(chartId);
  if (!cardEl) {
    return;
  }
  const safeSource = source === "station" || source === "mixed" ? source : "model";
  cardEl.classList.remove("source-station", "source-model", "source-mixed");
  cardEl.classList.add(`source-${safeSource}`);
  cardEl.dataset.chartSource = safeSource;

  const badgeEl = ensureChartSourceBadge(cardEl);
  if (!badgeEl) {
    return;
  }
  badgeEl.classList.remove("station", "model", "mixed");
  badgeEl.classList.add(safeSource);
  badgeEl.textContent = CHART_SOURCE_LABELS[safeSource];
  badgeEl.dataset.chartId = chartId;
  badgeEl.dataset.chartSourceType = safeSource;
  const chartTitle = cardEl.querySelector("h2")?.textContent?.trim() || chartId;
  badgeEl.setAttribute("aria-label", `Explain ${CHART_SOURCE_LABELS[safeSource]} source for ${chartTitle}`);
  badgeEl.title = `Click for data-source details (${CHART_SOURCE_LABELS[safeSource]})`;
}

function applyChartSources(sourceByChart = {}) {
  activeChartSources = { ...sourceByChart };
  for (const chartId of CHART_IDS_WITH_SOURCE) {
    const source = sourceByChart[chartId] || "model";
    setChartCardSource(chartId, source);
  }
}

function summarizeMetricSourceForChart(chartId) {
  const metricKeys = CHART_SOURCE_METRICS[chartId] || [];
  if (activeDataMode !== "station" || !metricKeys.length || !activeMetricSourceStats) {
    return "";
  }
  const lines = [];
  for (const key of metricKeys) {
    const stats = activeMetricSourceStats[key];
    if (!stats) {
      continue;
    }
    const stationCount = stats.station || 0;
    const modelCount = stats.model || 0;
    const total = stationCount + modelCount;
    if (total <= 0) {
      lines.push(`- ${METRIC_SOURCE_LABELS[key] || key}: no usable samples`);
      continue;
    }
    const stationPct = Math.round((stationCount / total) * 100);
    lines.push(
      `- ${METRIC_SOURCE_LABELS[key] || key}: ${stationCount} station / ${modelCount} model (${stationPct}% station)`
    );
  }
  return lines.join("\n");
}

function openChartSourceHelpModal(chartId) {
  if (!ruleHelpModalEl || !ruleHelpTitleEl || !ruleHelpBodyEl) {
    return;
  }
  const source = activeChartSources[chartId] || "model";
  const cardEl = getChartCardById(chartId);
  const chartTitle = cardEl?.querySelector("h2")?.textContent?.trim() || chartId;
  const metricBreakdown = summarizeMetricSourceForChart(chartId);

  const explanationLines = [
    `${CHART_SOURCE_LABELS.station}: all plotted values for this chart came from station observations.`,
    `${CHART_SOURCE_LABELS.mixed}: station observations are used where available, with model fallback for missing metrics/hours.`,
    `${CHART_SOURCE_LABELS.model}: chart is fully model-driven (including all forward-forecast panels).`
  ];

  const modeLine =
    activeDataMode === "station"
      ? "Station-data mode is active."
      : "Model-data mode is active, so charts are model-only until you switch to station-data mode.";

  const breakdownLine = metricBreakdown ? `\n\nCurrent source breakdown:\n${metricBreakdown}` : "";
  ruleHelpTitleEl.textContent = `${chartTitle}: ${CHART_SOURCE_LABELS[source]}`;
  ruleHelpBodyEl.textContent = `${modeLine}\n\n${explanationLines.join("\n")}${breakdownLine}`;
  ruleHelpModalEl.hidden = false;
}

function initChartSourceBadgeHelp() {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const badgeBtn = target.closest("[data-chart-source-help='1']");
    if (!(badgeBtn instanceof HTMLElement)) {
      return;
    }
    const chartId = badgeBtn.dataset.chartId;
    if (!chartId) {
      return;
    }
    event.preventDefault();
    openChartSourceHelpModal(chartId);
  });
}

function closeExpandedChart() {
  if (!expandedChartCardEl) {
    return;
  }
  const chartId = expandedChartCardEl.dataset.chartId;
  expandedChartCardEl.classList.remove("expanded");
  expandedChartCardEl = null;
  document.body.classList.remove("chart-expanded-open");

  if (chartId) {
    const chartEl = document.getElementById(chartId);
    if (chartEl) {
      Plotly.Plots.resize(chartEl);
    }
  }
}

function openExpandedChartById(chartId) {
  const cardEl = getChartCardById(chartId);
  if (!cardEl) {
    return;
  }

  if (expandedChartCardEl && expandedChartCardEl !== cardEl) {
    closeExpandedChart();
  }

  expandedChartCardEl = cardEl;
  cardEl.classList.add("expanded");
  document.body.classList.add("chart-expanded-open");

  const chartEl = document.getElementById(chartId);
  if (chartEl) {
    Plotly.Plots.resize(chartEl);
  }
}

function toggleExpandedChartById(chartId) {
  const cardEl = getChartCardById(chartId);
  if (!cardEl) {
    return;
  }
  if (expandedChartCardEl === cardEl) {
    closeExpandedChart();
  } else {
    openExpandedChartById(chartId);
  }
}

function getPlotConfig() {
  return {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["select2d", "lasso2d"],
    modeBarButtonsToAdd: [
      {
        name: "Expand Chart",
        icon: EXPAND_MODEBAR_ICON,
        click: (gd) => {
          const chartId = gd?.id;
          if (chartId) {
            toggleExpandedChartById(chartId);
          }
        }
      }
    ]
  };
}

function initChartExpansionControls() {
  for (const card of chartCardEls) {
    const closeBtn = card.querySelector(".chart-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => closeExpandedChart());
    }
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && expandedChartCardEl) {
      closeExpandedChart();
    }
  });
}

function closeRuleHelpModal() {
  if (!ruleHelpModalEl) {
    return;
  }
  ruleHelpModalEl.hidden = true;
}

function openRuleHelpModal(ruleId) {
  if (!ruleHelpModalEl || !ruleHelpTitleEl || !ruleHelpBodyEl) {
    return;
  }
  const content = RULE_HELP[ruleId];
  if (!content) {
    return;
  }
  ruleHelpTitleEl.textContent = content.title;
  ruleHelpBodyEl.textContent = content.body;
  ruleHelpModalEl.hidden = false;
}

function initRuleHelpModal() {
  if (!ruleHelpModalEl) {
    return;
  }

  if (ruleHelpCloseEl) {
    ruleHelpCloseEl.addEventListener("click", closeRuleHelpModal);
  }

  ruleHelpModalEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeRuleHelp !== undefined) {
      closeRuleHelpModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !ruleHelpModalEl.hidden) {
      closeRuleHelpModal();
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const helpBtn = target.closest("[data-rule-help]");
    if (!(helpBtn instanceof HTMLElement)) {
      return;
    }
    const ruleId = helpBtn.dataset.ruleHelp;
    if (ruleId) {
      openRuleHelpModal(ruleId);
    }
  });
}

function closeMapPickerModal() {
  if (!mapPickerModalEl) {
    return;
  }
  mapPickerModalEl.hidden = true;
}

function updateMapPickerCoordsText() {
  if (!mapPickerCoordsEl) {
    return;
  }
  if (!mapPickerLatLon) {
    mapPickerCoordsEl.textContent = "Selected: none";
    return;
  }
  mapPickerCoordsEl.textContent = `Selected: ${mapPickerLatLon.lat.toFixed(6)}, ${mapPickerLatLon.lon.toFixed(6)}`;
}

function setMapPickerMarker(lat, lon, options = {}) {
  if (!mapPickerMap || !window.L) {
    return;
  }
  const recenter = options.recenter !== false;
  const zoom = Number.isFinite(options.zoom) ? options.zoom : mapPickerMap.getZoom();
  mapPickerLatLon = { lat, lon };

  if (!mapPickerMarker) {
    mapPickerMarker = window.L.marker([lat, lon], { draggable: true }).addTo(mapPickerMap);
    mapPickerMarker.on("dragend", () => {
      const pos = mapPickerMarker.getLatLng();
      mapPickerLatLon = { lat: pos.lat, lon: pos.lng };
      updateMapPickerCoordsText();
    });
  } else {
    mapPickerMarker.setLatLng([lat, lon]);
  }

  if (recenter) {
    mapPickerMap.setView([lat, lon], zoom);
  }
  updateMapPickerCoordsText();
}

function parseCurrentInputLatLon() {
  const lat = Number(latInputEl?.value);
  const lon = Number(lonInputEl?.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}

function ensureMapPickerMap() {
  if (mapPickerMap) {
    return;
  }
  if (!mapPickerCanvasEl) {
    throw new Error("Map canvas is unavailable.");
  }
  if (!window.L) {
    throw new Error("Map library failed to load.");
  }

  mapPickerMap = window.L.map(mapPickerCanvasEl, {
    zoomControl: true,
    minZoom: 2
  });
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(mapPickerMap);
  mapPickerMap.on("click", (event) => {
    const { lat, lng } = event.latlng;
    setMapPickerMarker(lat, lng, { recenter: false });
  });
}

function openMapPickerModal() {
  if (!mapPickerModalEl) {
    return;
  }
  try {
    ensureMapPickerMap();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Unable to open map picker.");
    return;
  }

  const preferred = parseCurrentInputLatLon() || mapPickerLatLon || { lat: DEFAULT_LAT, lon: DEFAULT_LON };
  mapPickerModalEl.hidden = false;

  const currentZoom = mapPickerMap ? mapPickerMap.getZoom() : 10;
  const zoom = Number.isFinite(currentZoom) && currentZoom >= 2 ? currentZoom : 10;
  setMapPickerMarker(preferred.lat, preferred.lon, { recenter: true, zoom });
  requestAnimationFrame(() => {
    if (mapPickerMap) {
      mapPickerMap.invalidateSize();
    }
  });
}

function initMapPickerModal() {
  if (!mapPickerModalEl || !mapPickerOpenEl || !mapPickerPickEl) {
    return;
  }

  mapPickerOpenEl.addEventListener("click", () => openMapPickerModal());
  if (mapPickerCloseEl) {
    mapPickerCloseEl.addEventListener("click", closeMapPickerModal);
  }

  mapPickerModalEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeMapPicker !== undefined) {
      closeMapPickerModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mapPickerModalEl && !mapPickerModalEl.hidden) {
      closeMapPickerModal();
    }
  });

  mapPickerPickEl.addEventListener("click", async () => {
    if (!mapPickerLatLon) {
      setStatus("Place a map pin before picking a location.");
      return;
    }
    latInputEl.value = mapPickerLatLon.lat.toFixed(6);
    lonInputEl.value = mapPickerLatLon.lon.toFixed(6);
    setStatus(`Picked map location: ${mapPickerLatLon.lat.toFixed(6)}, ${mapPickerLatLon.lon.toFixed(6)}. Loading season...`);
    closeMapPickerModal();
    try {
      await loadSeason(mapPickerLatLon.lat, mapPickerLatLon.lon);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      setStatus(err instanceof Error ? err.message : "Failed to load picked map location.");
    }
  });
}

function cloneShapes(shapes) {
  return JSON.parse(JSON.stringify(shapes || []));
}

function setBaseShapes(chartId, shapes) {
  chartBaseShapes[chartId] = cloneShapes(shapes);
}

function getBaseShapes(chartId) {
  return cloneShapes(chartBaseShapes[chartId] || []);
}

function parseDayKey(dayKey) {
  const d = new Date(`${dayKey}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function addDaysToDayKey(dayKey, days) {
  const d = parseDayKey(dayKey);
  if (!d) {
    return dayKey;
  }
  d.setDate(d.getDate() + days);
  return fmtDateLocal(d);
}

function dayKeyFromXValue(xVal) {
  if (typeof xVal === "string" && xVal.length >= 10) {
    return xVal.slice(0, 10);
  }
  if (xVal instanceof Date) {
    return fmtDateLocal(xVal);
  }
  if (typeof xVal === "number") {
    const d = new Date(xVal);
    if (Number.isFinite(d.getTime())) {
      return fmtDateLocal(d);
    }
  }
  return null;
}

function buildDayHighlightShape(chartId, dayKey) {
  let x0;
  let x1;

  if (DAILY_X_CHART_IDS.has(chartId)) {
    const center = parseDayKey(dayKey);
    if (center) {
      const start = new Date(center.getTime() - 12 * 60 * 60 * 1000);
      const end = new Date(center.getTime() + 12 * 60 * 60 * 1000);
      x0 = fmtDateTimeLocal(start);
      x1 = fmtDateTimeLocal(end);
    } else {
      const nextDay = addDaysToDayKey(dayKey, 1);
      x0 = dayKey;
      x1 = nextDay;
    }
  } else {
    const nextDay = addDaysToDayKey(dayKey, 1);
    x0 = `${dayKey}T00:00`;
    x1 = `${nextDay}T00:00`;
  }

  return {
    type: "rect",
    xref: "x",
    yref: "paper",
    x0,
    x1,
    y0: 0,
    y1: 1,
    line: { width: 0 },
    fillcolor: "rgba(254, 198, 92, 0.22)",
    layer: "below"
  };
}

function applyLinkedHoverDay(dayKey) {
  if (!dayKey || dayKey === sharedHoverDayKey) {
    return;
  }

  sharedHoverDayKey = dayKey;
  for (const chartId of LINKED_CHART_IDS) {
    const chartEl = document.getElementById(chartId);
    if (!chartEl || !chartEl.layout) {
      continue;
    }
    const highlightShape = buildDayHighlightShape(chartId, dayKey);
    const nextShapes = [...getBaseShapes(chartId), highlightShape];
    Plotly.relayout(chartEl, { shapes: nextShapes });
  }
}

function clearLinkedHoverDay() {
  sharedHoverDayKey = null;
  for (const chartId of LINKED_CHART_IDS) {
    const chartEl = document.getElementById(chartId);
    if (!chartEl || !chartEl.layout) {
      continue;
    }
    Plotly.relayout(chartEl, { shapes: getBaseShapes(chartId) });
  }
}

function setupLinkedHoverHandlers() {
  for (const chartId of LINKED_CHART_IDS) {
    const chartEl = document.getElementById(chartId);
    if (!chartEl || chartEl.dataset.linkedHoverBound === "1") {
      continue;
    }

    chartEl.on("plotly_hover", (event) => {
      if (clearHoverTimer) {
        clearTimeout(clearHoverTimer);
        clearHoverTimer = null;
      }

      const xVal = event?.points?.[0]?.x;
      const dayKey = dayKeyFromXValue(xVal);
      applyLinkedHoverDay(dayKey);
    });

    chartEl.on("plotly_unhover", () => {
      if (clearHoverTimer) {
        clearTimeout(clearHoverTimer);
      }
      clearHoverTimer = setTimeout(() => {
        clearLinkedHoverDay();
      }, 90);
    });

    chartEl.dataset.linkedHoverBound = "1";
  }
}

function buildHistoryUrl(baseUrl, lat, lon, startDate, endDate, hourlyFields, options = {}) {
  const includeUnits = options.includeUnits ?? true;
  const includeTimezone = options.includeTimezone ?? true;

  const base = new URL(baseUrl);
  base.searchParams.set("latitude", String(lat));
  base.searchParams.set("longitude", String(lon));
  base.searchParams.set("start_date", startDate);
  base.searchParams.set("end_date", endDate);
  base.searchParams.set("hourly", hourlyFields.join(","));

  if (includeUnits) {
    base.searchParams.set("temperature_unit", "fahrenheit");
    base.searchParams.set("wind_speed_unit", "mph");
    base.searchParams.set("precipitation_unit", "inch");
  }

  if (includeTimezone) {
    base.searchParams.set("timezone", "auto");
  }

  return base.toString();
}

function buildTodayUrl(lat, lon) {
  const base = new URL("https://api.open-meteo.com/v1/forecast");
  base.searchParams.set("latitude", String(lat));
  base.searchParams.set("longitude", String(lon));
  base.searchParams.set("past_days", "2");
  base.searchParams.set("forecast_days", "1");
  base.searchParams.set(
    "hourly",
    [
      "temperature_2m",
      "snowfall",
      "rain",
      "precipitation",
      "wind_speed_10m",
      "shortwave_radiation",
      "freezing_level_height",
      "snow_depth"
    ].join(",")
  );
  base.searchParams.set("temperature_unit", "fahrenheit");
  base.searchParams.set("wind_speed_unit", "mph");
  base.searchParams.set("precipitation_unit", "inch");
  base.searchParams.set("timezone", "auto");
  return base.toString();
}

function buildForward7dUrl(lat, lon) {
  const base = new URL("https://api.open-meteo.com/v1/forecast");
  base.searchParams.set("latitude", String(lat));
  base.searchParams.set("longitude", String(lon));
  base.searchParams.set("forecast_days", "8");
  base.searchParams.set("hourly", ["temperature_2m", "snowfall", "rain", "precipitation", "wind_speed_10m"].join(","));
  base.searchParams.set("current", ["temperature_2m", "snowfall", "rain", "precipitation", "wind_speed_10m"].join(","));
  base.searchParams.set("temperature_unit", "fahrenheit");
  base.searchParams.set("wind_speed_unit", "mph");
  base.searchParams.set("precipitation_unit", "inch");
  base.searchParams.set("timezone", "auto");
  return base.toString();
}

function buildArchiveSnowHistoryUrl(lat, lon, startDate, endDate) {
  const base = new URL("https://archive-api.open-meteo.com/v1/archive");
  base.searchParams.set("latitude", String(lat));
  base.searchParams.set("longitude", String(lon));
  base.searchParams.set("start_date", startDate);
  base.searchParams.set("end_date", endDate);
  base.searchParams.set("daily", "snowfall_sum");
  base.searchParams.set("hourly", "snowfall");
  base.searchParams.set("precipitation_unit", "inch");
  base.searchParams.set("timezone", "auto");
  return base.toString();
}

function pickHistoryCandidates(lat, lon, startDate, endDate) {
  const coreFields = [
    "temperature_2m",
    "snowfall",
    "rain",
    "precipitation",
    "wind_speed_10m",
    "shortwave_radiation",
    "freezing_level_height"
  ];
  const withSnowDepth = [...coreFields, "snow_depth"];

  return [
    {
      source: "historical-forecast",
      url: buildHistoryUrl(
        "https://historical-forecast-api.open-meteo.com/v1/forecast",
        lat,
        lon,
        startDate,
        endDate,
        withSnowDepth
      ),
      includesSnowDepth: true
    },
    {
      source: "historical-forecast",
      url: buildHistoryUrl(
        "https://historical-forecast-api.open-meteo.com/v1/forecast",
        lat,
        lon,
        startDate,
        endDate,
        coreFields
      ),
      includesSnowDepth: false
    },
    {
      source: "archive",
      url: buildHistoryUrl("https://archive-api.open-meteo.com/v1/archive", lat, lon, startDate, endDate, withSnowDepth),
      includesSnowDepth: true
    },
    {
      source: "archive",
      url: buildHistoryUrl("https://archive-api.open-meteo.com/v1/archive", lat, lon, startDate, endDate, coreFields),
      includesSnowDepth: false
    },
    {
      source: "historical-forecast-minimal",
      url: buildHistoryUrl(
        "https://historical-forecast-api.open-meteo.com/v1/forecast",
        lat,
        lon,
        startDate,
        endDate,
        coreFields,
        { includeUnits: true, includeTimezone: false }
      ),
      includesSnowDepth: false
    },
    {
      source: "archive-minimal",
      url: buildHistoryUrl(
        "https://archive-api.open-meteo.com/v1/archive",
        lat,
        lon,
        startDate,
        endDate,
        coreFields,
        { includeUnits: true, includeTimezone: false }
      ),
      includesSnowDepth: false
    }
  ];
}

async function readErrorTextSafe(res) {
  try {
    const text = await res.text();
    return text || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function fetchSeasonHistory(lat, lon, startDate, endDate, signal) {
  const candidates = pickHistoryCandidates(lat, lon, startDate, endDate);
  const failures = [];

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate.url, { signal });
      if (!res.ok) {
        const body = await readErrorTextSafe(res);
        failures.push(`${candidate.source}: ${res.status} ${body}`);
        continue;
      }

      const json = await res.json();
      if (!json?.hourly?.time?.length) {
        failures.push(`${candidate.source}: empty hourly payload`);
        continue;
      }

      return {
        json,
        source: candidate.source,
        includesSnowDepth: candidate.includesSnowDepth
      };
    } catch (err) {
      if (isAbortError(err)) {
        throw err;
      }
      failures.push(`${candidate.source}: ${err instanceof Error ? err.message : "request failure"}`);
    }
  }

  const tail = failures.slice(-4).join(" | ");
  throw new Error(`History request failed. ${tail}`);
}

async function fetchArchiveSnowHistory(lat, lon, startDate, endDate, signal) {
  const url = buildArchiveSnowHistoryUrl(lat, lon, startDate, endDate);
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      const body = await readErrorTextSafe(res);
      throw new Error(`Archive snowfall request failed. ${res.status} ${body}`);
    }
    const json = await res.json();
    if (!json?.daily?.time?.length && !json?.hourly?.time?.length) {
      throw new Error("Archive snowfall request failed. Empty payload.");
    }
    return mapArchiveSnowHistoryPayload(json);
  } catch (err) {
    if (isAbortError(err)) {
      throw err;
    }
    throw err instanceof Error ? err : new Error("Archive snowfall request failed.");
  }
}

function normalizeUnit(unit) {
  return typeof unit === "string" ? unit.trim().toLowerCase() : "";
}

function convertTemperatureToF(value, unitRaw) {
  if (value === null) {
    return null;
  }

  const unit = normalizeUnit(unitRaw);
  if (unit.includes("f")) {
    return value;
  }
  if (unit.includes("c")) {
    return value * (9 / 5) + 32;
  }
  return value;
}

function convertLengthToIn(value, unitRaw) {
  if (value === null) {
    return null;
  }

  const unit = normalizeUnit(unitRaw);
  if (!unit || unit === "in" || unit.includes("inch")) {
    return value;
  }
  if (unit === "mm" || unit.includes("millimeter")) {
    return value / 25.4;
  }
  if (unit === "cm" || unit.includes("centimeter")) {
    return value / 2.54;
  }
  if (unit === "m" || unit === "meter" || unit === "metre") {
    return value * 39.37007874;
  }
  if (unit === "ft" || unit.includes("foot") || unit.includes("feet")) {
    return value * 12;
  }
  return value;
}

function convertLengthToFt(value, unitRaw) {
  if (value === null) {
    return null;
  }

  const unit = normalizeUnit(unitRaw);
  // Open-Meteo freezing_level_height is typically meters; some archive responses omit unit metadata.
  if (!unit) {
    return value * 3.280839895;
  }
  if (unit === "ft" || unit.includes("foot") || unit.includes("feet")) {
    return value;
  }
  if (unit === "m" || unit === "meter" || unit === "metre") {
    return value * 3.280839895;
  }
  if (unit === "cm" || unit.includes("centimeter")) {
    return value / 30.48;
  }
  if (unit === "mm" || unit.includes("millimeter")) {
    return value / 304.8;
  }
  if (unit === "in" || unit.includes("inch")) {
    return value / 12;
  }
  return value;
}

function convertSpeedToMph(value, unitRaw) {
  if (value === null) {
    return null;
  }

  const unit = normalizeUnit(unitRaw);
  if (!unit || unit.includes("mph") || unit.includes("mp/h")) {
    return value;
  }
  if (unit.includes("km/h") || unit.includes("kmh")) {
    return value * 0.621371192;
  }
  if (unit.includes("m/s")) {
    return value * 2.23693629;
  }
  if (unit === "kn" || unit.includes("knot")) {
    return value * 1.15077945;
  }
  if (unit.includes("ft/s")) {
    return value * 0.681818182;
  }
  return value;
}

function mapHourlyPayload(hourly, hourlyUnits = {}) {
  if (!hourly || !Array.isArray(hourly.time)) {
    return [];
  }

  const tempUnit = hourlyUnits.temperature_2m;
  const precipUnit = hourlyUnits.precipitation;
  const snowfallUnit = hourlyUnits.snowfall || precipUnit;
  const rainUnit = hourlyUnits.rain || precipUnit;
  const windUnit = hourlyUnits.wind_speed_10m;
  const gustUnit = hourlyUnits.wind_gusts_10m || windUnit;
  const snowDepthUnit = hourlyUnits.snow_depth;
  const freezingLevelUnit = hourlyUnits.freezing_level_height;

  return hourly.time.map((time, idx) => ({
    time,
    temperature_f: convertTemperatureToF(toNum(hourly.temperature_2m?.[idx]), tempUnit),
    snowfall_in: convertLengthToIn(toNum(hourly.snowfall?.[idx]), snowfallUnit),
    rain_in: convertLengthToIn(toNum(hourly.rain?.[idx]), rainUnit),
    precip_lwe_in: convertLengthToIn(toNum(hourly.precipitation?.[idx]), precipUnit),
    wind_mph: convertSpeedToMph(toNum(hourly.wind_speed_10m?.[idx]), windUnit),
    gust_mph: convertSpeedToMph(toNum(hourly.wind_gusts_10m?.[idx]), gustUnit),
    shortwave_wm2: toNum(hourly.shortwave_radiation?.[idx]),
    snow_depth_in: convertLengthToIn(toNum(hourly.snow_depth?.[idx]), snowDepthUnit),
    freezing_level_ft: convertLengthToFt(toNum(hourly.freezing_level_height?.[idx]), freezingLevelUnit)
  }));
}

function mapArchiveSnowHistoryPayload(payload) {
  const dailySnowByDay = new Map();
  const dailyTime = payload?.daily?.time;
  const dailyValues = payload?.daily?.snowfall_sum;
  const dailyUnit = payload?.daily_units?.snowfall_sum || payload?.hourly_units?.snowfall || "unknown";
  const hourlyUnit = payload?.hourly_units?.snowfall || payload?.daily_units?.snowfall_sum || "unknown";

  if (Array.isArray(dailyTime)) {
    for (let idx = 0; idx < dailyTime.length; idx += 1) {
      const day = dailyTime[idx];
      const snowIn = convertLengthToIn(toNum(dailyValues?.[idx]), dailyUnit);
      if (typeof day === "string" && snowIn !== null) {
        dailySnowByDay.set(day, snowIn);
      }
    }
  }

  const hourlySnowRecords = [];
  const hourlyTime = payload?.hourly?.time;
  const hourlySnow = payload?.hourly?.snowfall;
  if (Array.isArray(hourlyTime)) {
    for (let idx = 0; idx < hourlyTime.length; idx += 1) {
      const time = hourlyTime[idx];
      if (typeof time !== "string") {
        continue;
      }
      hourlySnowRecords.push({
        time,
        snowfall_in: convertLengthToIn(toNum(hourlySnow?.[idx]), hourlyUnit)
      });
    }
  }

  const lastDailyDate =
    Array.isArray(dailyTime) && dailyTime.length ? dailyTime[dailyTime.length - 1] : null;
  const lastHourlyTime =
    Array.isArray(hourlyTime) && hourlyTime.length ? hourlyTime[hourlyTime.length - 1] : null;

  return {
    dailySnowByDay,
    hourlySnowRecords,
    dailyUnit,
    hourlyUnit,
    lastDailyDate,
    lastHourlyTime
  };
}

function mapCurrentPayload(current, currentUnits = {}) {
  if (!current || typeof current !== "object") {
    return null;
  }

  const precipUnit = currentUnits.precipitation;
  const snowfallUnit = currentUnits.snowfall || precipUnit;
  const rainUnit = currentUnits.rain || precipUnit;
  const windUnit = currentUnits.wind_speed_10m;
  const tempUnit = currentUnits.temperature_2m;

  return {
    time: typeof current.time === "string" ? current.time : null,
    temperature_f: convertTemperatureToF(toNum(current.temperature_2m), tempUnit),
    wind_mph: convertSpeedToMph(toNum(current.wind_speed_10m), windUnit),
    rain_in: convertLengthToIn(toNum(current.rain), rainUnit),
    snowfall_in: convertLengthToIn(toNum(current.snowfall), snowfallUnit),
    precip_lwe_in: convertLengthToIn(toNum(current.precipitation), precipUnit)
  };
}

function deriveForward7dWindow(forecastJson) {
  const hourlyRecords = mapHourlyPayload(forecastJson?.hourly, forecastJson?.hourly_units);
  if (!hourlyRecords.length) {
    return { hourlyRecords: [], modelNow: null };
  }

  const modelNow = mapCurrentPayload(forecastJson?.current, forecastJson?.current_units);
  const fallbackStart = hourlyRecords[0]?.time || null;
  const startTime = modelNow?.time || fallbackStart;

  const filtered = startTime ? hourlyRecords.filter((r) => r.time >= startTime) : [...hourlyRecords];
  const windowRecords = filtered.slice(0, 168);

  const modelNowFallback = windowRecords[0]
    ? {
        time: windowRecords[0].time,
        temperature_f: windowRecords[0].temperature_f,
        wind_mph: windowRecords[0].wind_mph,
        rain_in: windowRecords[0].rain_in,
        snowfall_in: windowRecords[0].snowfall_in,
        precip_lwe_in: windowRecords[0].precip_lwe_in
      }
    : null;

  return {
    hourlyRecords: windowRecords,
    modelNow: modelNow || modelNowFallback
  };
}

function summarizeForwardWindow(forwardHourlyRecords) {
  if (!Array.isArray(forwardHourlyRecords) || !forwardHourlyRecords.length) {
    return null;
  }

  let snowTotal = 0;
  let rainTotal = 0;
  let freezeHours = 0;
  let maxWind = null;
  let maxTemp = null;
  let minTemp = null;

  for (const r of forwardHourlyRecords) {
    snowTotal += Math.max(0, r.snowfall_in ?? 0);
    rainTotal += Math.max(0, r.rain_in ?? 0);

    if (r.temperature_f !== null) {
      maxTemp = maxTemp === null ? r.temperature_f : Math.max(maxTemp, r.temperature_f);
      minTemp = minTemp === null ? r.temperature_f : Math.min(minTemp, r.temperature_f);
      if (r.temperature_f <= FREEZE_F) {
        freezeHours += 1;
      }
    }

    if (r.wind_mph !== null) {
      maxWind = maxWind === null ? r.wind_mph : Math.max(maxWind, r.wind_mph);
    }
  }

  const startTime = forwardHourlyRecords[0]?.time || null;
  const endTime = forwardHourlyRecords[forwardHourlyRecords.length - 1]?.time || null;

  return {
    snow_total_in: Number(snowTotal.toFixed(2)),
    rain_total_in: Number(rainTotal.toFixed(2)),
    freeze_hours: freezeHours,
    max_wind_mph: maxWind === null ? null : Number(maxWind.toFixed(1)),
    max_temp_f: maxTemp === null ? null : Number(maxTemp.toFixed(1)),
    min_temp_f: minTemp === null ? null : Number(minTemp.toFixed(1)),
    start_time: startTime,
    end_time: endTime
  };
}

function findLatestHourlySnapshot(hourlyRecords, maxAgeHours = 6) {
  if (!Array.isArray(hourlyRecords)) {
    return null;
  }

  const nowMs = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  for (let i = hourlyRecords.length - 1; i >= 0; i -= 1) {
    const r = hourlyRecords[i];
    if (!r || typeof r.time !== "string") {
      continue;
    }
    const timeMs = new Date(r.time).getTime();
    if (Number.isFinite(timeMs) && timeMs < nowMs - maxAgeMs) {
      break;
    }
    if (Number.isFinite(timeMs) && timeMs > nowMs + 2 * 60 * 60 * 1000) {
      continue;
    }
    if (r.temperature_f === null && r.wind_mph === null && r.rain_in === null && r.snowfall_in === null) {
      continue;
    }
    return {
      time: r.time,
      temperature_f: r.temperature_f,
      wind_mph: r.wind_mph,
      rain_in: r.rain_in,
      snowfall_in: r.snowfall_in,
      precip_lwe_in: r.precip_lwe_in
    };
  }

  return null;
}

function clipRecordsThroughHour(records, maxHourKey) {
  if (!Array.isArray(records)) {
    return [];
  }
  if (typeof maxHourKey !== "string" || !maxHourKey) {
    return [...records];
  }
  return records.filter((record) => typeof record?.time === "string" && record.time <= maxHourKey);
}

function mergeHourlyRecords(archiveRecords, todayRecords, todayDate, maxHourKey = null) {
  const merged = new Map();

  for (const record of archiveRecords) {
    merged.set(record.time, record);
  }

  for (const record of todayRecords) {
    if (
      record.time.slice(0, 10) === todayDate &&
      (typeof maxHourKey !== "string" || !maxHourKey || record.time <= maxHourKey)
    ) {
      merged.set(record.time, record);
    }
  }

  return [...merged.values()].sort((a, b) => a.time.localeCompare(b.time));
}

function applyArchiveSnowDailyToRecords(dailyRecords, archiveSnowHistory, currentHourKey) {
  if (!Array.isArray(dailyRecords)) {
    return {
      dailyRecords: [],
      todaySnowSumIn: null,
      todaySnowThroughTime: null,
      todaySnowDay: null
    };
  }

  const dailySnowByDay = archiveSnowHistory?.dailySnowByDay instanceof Map ? archiveSnowHistory.dailySnowByDay : new Map();
  const hourlySnowRecords = Array.isArray(archiveSnowHistory?.hourlySnowRecords)
    ? archiveSnowHistory.hourlySnowRecords
    : [];
  const todaySnowDay = typeof currentHourKey === "string" && currentHourKey.length >= 10 ? currentHourKey.slice(0, 10) : null;

  let todaySnowSumIn = null;
  let todaySnowThroughTime = null;
  if (todaySnowDay && typeof currentHourKey === "string" && currentHourKey) {
    let sum = 0;
    let hasTodaySamples = false;
    for (const hourly of hourlySnowRecords) {
      if (typeof hourly?.time !== "string") {
        continue;
      }
      if (!hourly.time.startsWith(todaySnowDay) || hourly.time > currentHourKey) {
        continue;
      }
      sum += Math.max(0, hourly.snowfall_in ?? 0);
      todaySnowThroughTime = hourly.time;
      hasTodaySamples = true;
    }
    if (hasTodaySamples) {
      todaySnowSumIn = Number(sum.toFixed(3));
    }
  }

  const nextDaily = dailyRecords.map((d) => {
    let snowfallIn = dailySnowByDay.get(d.date);
    if (todaySnowDay && d.date === todaySnowDay) {
      snowfallIn = todaySnowSumIn === null ? 0 : todaySnowSumIn;
    }
    if (!Number.isFinite(snowfallIn)) {
      snowfallIn = d.snowfall_in_sum;
    }
    return {
      ...d,
      snowfall_in_sum: Number(snowfallIn.toFixed(3))
    };
  });

  return {
    dailyRecords: nextDaily,
    todaySnowSumIn,
    todaySnowThroughTime,
    todaySnowDay
  };
}

function computeSunBakeIndex(shortwaveMjM2Sum, tempMaxF, thawHours) {
  if (tempMaxF === null) {
    return 0;
  }

  const sunFactor = clamp(shortwaveMjM2Sum / 18, 0, 1);
  const tempFactor = clamp((tempMaxF - 28) / 12, 0, 1);
  const thawFactor = clamp(thawHours / 8, 0, 1);
  return Math.round(100 * sunFactor * (0.65 * tempFactor + 0.35 * thawFactor));
}

function splitHourlyPrecipPhase(record) {
  const precip = Math.max(0, record.precip_lwe_in ?? record.rain_in ?? 0);
  if (precip <= 0) {
    return { rain_lwe_in: 0, snow_lwe_in: 0 };
  }

  const snowfallDepth = Math.max(0, record.snowfall_in ?? 0);
  let snowLwe = clamp(snowfallDepth / 7, 0, precip);

  // Preserve cold-storm behavior when snowfall depth is underreported.
  if (record.temperature_f !== null && record.temperature_f <= 30 && snowLwe < precip * 0.25) {
    snowLwe = precip;
  }

  // Preserve warm-rain behavior when snowfall depth is near zero.
  if (record.temperature_f !== null && record.temperature_f >= 36 && snowfallDepth < 0.02) {
    snowLwe = 0;
  }

  const rainLwe = clamp(precip - snowLwe, 0, precip);
  return { rain_lwe_in: rainLwe, snow_lwe_in: precip - rainLwe };
}

function aggregateDaily(hourlyRecords) {
  const byDay = new Map();

  for (const r of hourlyRecords) {
    const day = r.time.slice(0, 10);
    if (!byDay.has(day)) {
      byDay.set(day, {
        date: day,
        snowfall_in_sum: 0,
        rain_raw_in_sum: 0,
        rain_in_sum: 0,
        snow_lwe_in_sum: 0,
        lwe_in_sum: 0,
        wind_sum: 0,
        wind_count: 0,
        wind_max_mph: null,
        temp_min_f: null,
        temp_max_f: null,
        freeze_hours: 0,
        thaw_hours: 0,
        shortwave_mj_m2_sum: 0,
        snow_depth_end_in: null,
        snow_depth_max_in: null
      });
    }

    const d = byDay.get(day);

    if (r.snowfall_in !== null) d.snowfall_in_sum += r.snowfall_in;
    if (r.rain_in !== null) d.rain_raw_in_sum += r.rain_in;

    const phase = splitHourlyPrecipPhase(r);
    d.rain_in_sum += phase.rain_lwe_in;
    d.snow_lwe_in_sum += phase.snow_lwe_in;
    d.lwe_in_sum += phase.rain_lwe_in + phase.snow_lwe_in;

    if (r.wind_mph !== null) {
      d.wind_sum += r.wind_mph;
      d.wind_count += 1;
      d.wind_max_mph = d.wind_max_mph === null ? r.wind_mph : Math.max(d.wind_max_mph, r.wind_mph);
    }

    if (r.temperature_f !== null) {
      d.temp_min_f = d.temp_min_f === null ? r.temperature_f : Math.min(d.temp_min_f, r.temperature_f);
      d.temp_max_f = d.temp_max_f === null ? r.temperature_f : Math.max(d.temp_max_f, r.temperature_f);
      if (r.temperature_f <= FREEZE_F) {
        d.freeze_hours += 1;
      } else {
        d.thaw_hours += 1;
      }
    }

    if (r.shortwave_wm2 !== null) {
      d.shortwave_mj_m2_sum += r.shortwave_wm2 * 0.0036;
    }

    if (r.snow_depth_in !== null) {
      d.snow_depth_end_in = r.snow_depth_in;
      d.snow_depth_max_in = d.snow_depth_max_in === null ? r.snow_depth_in : Math.max(d.snow_depth_max_in, r.snow_depth_in);
    }
  }

  return [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const sunBakeIndex = computeSunBakeIndex(d.shortwave_mj_m2_sum, d.temp_max_f, d.thaw_hours);

      return {
        date: d.date,
        snowfall_in_sum: Number(d.snowfall_in_sum.toFixed(3)),
        rain_raw_in_sum: Number(d.rain_raw_in_sum.toFixed(3)),
        rain_in_sum: Number(d.rain_in_sum.toFixed(3)),
        snow_lwe_in_sum: Number(d.snow_lwe_in_sum.toFixed(3)),
        lwe_in_sum: Number(d.lwe_in_sum.toFixed(3)),
        wind_avg_mph: d.wind_count ? Number((d.wind_sum / d.wind_count).toFixed(2)) : null,
        wind_max_mph: d.wind_max_mph === null ? null : Number(d.wind_max_mph.toFixed(2)),
        temp_min_f: d.temp_min_f === null ? null : Number(d.temp_min_f.toFixed(1)),
        temp_max_f: d.temp_max_f === null ? null : Number(d.temp_max_f.toFixed(1)),
        freeze_hours: d.freeze_hours,
        thaw_hours: d.thaw_hours,
        shortwave_mj_m2_sum: Number(d.shortwave_mj_m2_sum.toFixed(2)),
        snow_depth_end_in: d.snow_depth_end_in === null ? null : Number(d.snow_depth_end_in.toFixed(2)),
        snow_depth_max_in: d.snow_depth_max_in === null ? null : Number(d.snow_depth_max_in.toFixed(2)),
        sun_bake_index: sunBakeIndex
      };
    });
}

function derivePowderScores(dailyRecords) {
  let lastSnowIdx = null;
  return dailyRecords.map((d, idx) => {
    const snow0 = Math.max(0, d.snowfall_in_sum || 0);
    const snow1 = idx > 0 ? Math.max(0, dailyRecords[idx - 1].snowfall_in_sum || 0) : 0;
    const snow2 = idx > 1 ? Math.max(0, dailyRecords[idx - 2].snowfall_in_sum || 0) : 0;
    const snow3 = idx > 2 ? Math.max(0, dailyRecords[idx - 3].snowfall_in_sum || 0) : 0;
    const snowLwe0 = Math.max(0, d.snow_lwe_in_sum || 0);
    const snowLwe1 = idx > 0 ? Math.max(0, dailyRecords[idx - 1].snow_lwe_in_sum || 0) : 0;
    const snowLwe2 = idx > 1 ? Math.max(0, dailyRecords[idx - 2].snow_lwe_in_sum || 0) : 0;
    const snowLwe3 = idx > 2 ? Math.max(0, dailyRecords[idx - 3].snow_lwe_in_sum || 0) : 0;

    if (snow0 >= 0.1) {
      lastSnowIdx = idx;
    }
    const daysSinceSnow = lastSnowIdx === null ? 30 : idx - lastSnowIdx;
    const recentSnowWeighted = snow0 + snow1 * 0.65 + snow2 * 0.4 + snow3 * 0.2;
    const recentSnowLweWeighted = snowLwe0 + snowLwe1 * 0.65 + snowLwe2 * 0.4 + snowLwe3 * 0.2;
    const freshBoost = clamp(recentSnowWeighted / 9, 0, 1) * 60;

    const tempMax = d.temp_max_f === null ? 28 : d.temp_max_f;
    const thawHours = d.thaw_hours || 0;
    const tempWarmFactor = clamp((tempMax - 32) / 14, 0, 1);
    const thawFactor = clamp(thawHours / 10, 0, 1);
    const thawPenalty = (0.55 * tempWarmFactor + 0.45 * thawFactor) * 24;

    const rainIn = Math.max(0, d.rain_raw_in_sum || 0);
    const rainPenalty = clamp(rainIn / 0.35, 0, 1) * 56;

    const sunMj = Math.max(0, d.shortwave_mj_m2_sum || 0);
    const sunFactor = clamp(sunMj / 22, 0, 1);
    const sunTempFactor = clamp((tempMax - 30) / 10, 0, 1);
    const sunPenalty = sunFactor * (0.4 + 0.6 * sunTempFactor) * 18;

    const windMax = Math.max(0, d.wind_max_mph || 0);
    const windBasePenalty = clamp((windMax - 15) / 35, 0, 1) * 14;
    const windPenalty = recentSnowWeighted > 2 ? windBasePenalty * 1.25 : windBasePenalty;

    const densityLwePerIn =
      recentSnowWeighted >= 0.25 && recentSnowLweWeighted > 0 ? recentSnowLweWeighted / recentSnowWeighted : null;
    const densityPenalty =
      densityLwePerIn === null
        ? 0
        : densityLwePerIn <= 0.04
        ? clamp((0.04 - densityLwePerIn) / 0.02, 0, 1) * 4
        : densityLwePerIn <= 0.09
        ? 0
        : densityLwePerIn <= 0.14
        ? clamp((densityLwePerIn - 0.09) / 0.05, 0, 1) * 12
        : 12 + clamp((densityLwePerIn - 0.14) / 0.08, 0, 1) * 12;

    const agePenalty = clamp((daysSinceSnow - 1) / 6, 0, 1) * 22;

    const coldFactor = clamp((35 - tempMax) / 10, 0, 1);
    const dryFactor = clamp(1 - rainIn / 0.08, 0, 1);
    const lowSunFactor = clamp(1 - sunMj / 16, 0, 1);
    const lightWindFactor = clamp(1 - Math.max(0, windMax - 10) / 25, 0, 1);
    const lowDensityFactor = densityLwePerIn === null ? 0.5 : clamp((0.11 - densityLwePerIn) / 0.07, 0, 1);
    const freshFactor = clamp(recentSnowWeighted / 8, 0, 1);
    const qualityBonus =
      recentSnowWeighted < 0.5
        ? 0
        : (0.34 * freshFactor +
            0.24 * coldFactor +
            0.16 * dryFactor +
            0.1 * lowSunFactor +
            0.08 * lightWindFactor +
            0.08 * lowDensityFactor) *
          14;

    const snowDepth = d.snow_depth_end_in ?? d.snow_depth_max_in ?? 0;
    const coveragePenalty = snowDepth >= 8 ? 0 : snowDepth >= 4 ? 8 : snowDepth >= 2 ? 16 : 24;

    const rawScore =
      32 +
      freshBoost +
      qualityBonus -
      agePenalty -
      thawPenalty -
      rainPenalty -
      sunPenalty -
      windPenalty -
      densityPenalty -
      coveragePenalty;
    const powderScore = Math.round(clamp(rawScore, 0, 100));

    return {
      ...d,
      powder_score: powderScore,
      powder_recent_snow_in: Number(recentSnowWeighted.toFixed(2)),
      powder_days_since_snow: daysSinceSnow,
      powder_thaw_penalty: Number(thawPenalty.toFixed(1)),
      powder_rain_penalty: Number(rainPenalty.toFixed(1)),
      powder_sun_penalty: Number(sunPenalty.toFixed(1)),
      powder_wind_penalty: Number(windPenalty.toFixed(1)),
      powder_density_lwe_per_in: densityLwePerIn === null ? null : Number(densityLwePerIn.toFixed(3)),
      powder_density_penalty: Number(densityPenalty.toFixed(1)),
      powder_quality_bonus: Number(qualityBonus.toFixed(1))
    };
  });
}

function analyzeDailyRules(dailyRecords) {
  const events = [];
  const ruleMatches = {
    freeze: [],
    rain: [],
    wind: [],
    sun: []
  };

  for (let i = 0; i < dailyRecords.length; i += 1) {
    const d = dailyRecords[i];
    const prev = i > 0 ? dailyRecords[i - 1] : null;

    const activeSnowpack =
      (d.snow_depth_end_in != null && d.snow_depth_end_in >= THRESHOLDS.minSnowpackForSurfaceEffectsIn) ||
      (prev?.snow_depth_end_in != null && prev.snow_depth_end_in >= THRESHOLDS.minSnowpackForSurfaceEffectsIn) ||
      d.snowfall_in_sum >= THRESHOLDS.slabSnowfallIn;

    const freezeThaw =
      activeSnowpack &&
      d.temp_min_f !== null &&
      d.temp_max_f !== null &&
      d.temp_min_f <= 31 &&
      d.temp_max_f >= 33;

    if (freezeThaw) {
      ruleMatches.freeze.push(d.date);
      events.push({
        date: d.date,
        type: "freeze",
        title: "Freeze-thaw cycle",
        detail: `Min ${d.temp_min_f}F, max ${d.temp_max_f}F, thaw hours ${d.thaw_hours}.`
      });
    }

    if (activeSnowpack && d.rain_in_sum >= THRESHOLDS.rainOnSnowIn) {
      const crustPotential = d.temp_max_f !== null && d.temp_max_f > 34;
      ruleMatches.rain.push(d.date);
      events.push({
        date: d.date,
        type: "rain",
        title: crustPotential ? "Rain-on-snow with crust potential" : "Rain-on-snow",
        detail: `Phase-estimated rain ${d.rain_in_sum} in, total water ${d.lwe_in_sum} in.`
      });
    }

    const windWindowStart = Math.max(0, i - (THRESHOLDS.windRecentSnowDays - 1));
    const recentWindow = dailyRecords.slice(windWindowStart, i + 1);
    const recentSnowfallTotal = recentWindow.reduce((acc, day) => acc + Math.max(0, day.snowfall_in_sum || 0), 0);
    const hasRecentSnowfall = recentSnowfallTotal > 0;
    const windSlab =
      d.wind_max_mph !== null && d.wind_max_mph >= THRESHOLDS.slabWindMph && hasRecentSnowfall;

    if (windSlab) {
      ruleMatches.wind.push(d.date);
      events.push({
        date: d.date,
        type: "wind",
        title: "Wind slab risk window",
        detail: `Max wind ${d.wind_max_mph} mph with ${Number(recentSnowfallTotal.toFixed(1))} in snowfall in the last ${THRESHOLDS.windRecentSnowDays} days.`
      });
    }

    if (activeSnowpack && d.sun_bake_index >= THRESHOLDS.strongSunBakeIndex) {
      ruleMatches.sun.push(d.date);
      events.push({
        date: d.date,
        type: "sun",
        title: "Strong sun-bake signal",
        detail: `Sun-bake index ${d.sun_bake_index}, shortwave ${d.shortwave_mj_m2_sum} MJ/m^2.`
      });
    }
  }

  return { events, ruleMatches };
}

function getLastQualifiedDate(ruleMatches, ruleKey) {
  const matches = ruleMatches?.[ruleKey];
  if (!Array.isArray(matches) || !matches.length) {
    return null;
  }
  return matches[matches.length - 1];
}

function findLatestSnowDepth(hourlyRecords) {
  for (let i = hourlyRecords.length - 1; i >= 0; i -= 1) {
    const d = hourlyRecords[i].snow_depth_in;
    if (d !== null) {
      return Number(d.toFixed(2));
    }
  }
  return null;
}

function findPeakSnowDepth(dailyRecords) {
  let peak = null;
  for (const d of dailyRecords) {
    if (d.snow_depth_max_in === null) {
      continue;
    }
    if (peak === null || d.snow_depth_max_in > peak.depth) {
      peak = { depth: d.snow_depth_max_in, date: d.date };
    }
  }
  return peak;
}

function findSnowDepthChange7d(dailyRecords) {
  const valid = dailyRecords.filter((d) => d.snow_depth_end_in !== null);
  if (valid.length < 2) {
    return null;
  }

  const latest = valid[valid.length - 1];
  let anchor = null;
  for (let i = valid.length - 2; i >= 0; i -= 1) {
    const dayDiffMs = new Date(latest.date).getTime() - new Date(valid[i].date).getTime();
    const dayDiff = dayDiffMs / 86400000;
    if (dayDiff >= 7) {
      anchor = valid[i];
      break;
    }
  }

  if (!anchor) {
    return null;
  }

  return Number((latest.snow_depth_end_in - anchor.snow_depth_end_in).toFixed(2));
}

function sumSnowLast24h(hourlyRecords) {
  if (!Array.isArray(hourlyRecords) || !hourlyRecords.length) {
    return null;
  }
  const last = hourlyRecords[hourlyRecords.length - 1];
  const endMs = new Date(last.time).getTime();
  if (!Number.isFinite(endMs)) {
    return null;
  }
  const startMs = endMs - 24 * 60 * 60 * 1000;
  let sum = 0;
  let seen = 0;

  for (const r of hourlyRecords) {
    if (typeof r?.time !== "string") {
      continue;
    }
    const t = new Date(r.time).getTime();
    if (!Number.isFinite(t) || t <= startMs || t > endMs) {
      continue;
    }
    if (Number.isFinite(r.snowfall_in)) {
      sum += Math.max(0, r.snowfall_in);
      seen += 1;
    }
  }
  if (!seen) {
    return null;
  }
  return Number(sum.toFixed(2));
}

function toHttps(urlRaw) {
  if (typeof urlRaw !== "string" || !urlRaw) {
    return null;
  }
  return urlRaw.startsWith("http://") ? `https://${urlRaw.slice(7)}` : urlRaw;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readQuantityValue(q) {
  return toNum(q?.value);
}

function parseQuantityUnit(q) {
  return normalizeUnit(q?.unitCode || "");
}

function convertQuantityToF(q) {
  const value = readQuantityValue(q);
  if (value === null) {
    return null;
  }

  const unit = parseQuantityUnit(q);
  if (unit.includes("degf") || unit.includes("fahrenheit")) {
    return value;
  }
  if (unit.includes("degc") || unit.includes("celsius")) {
    return value * (9 / 5) + 32;
  }
  if (unit.includes("kelvin")) {
    return (value - 273.15) * (9 / 5) + 32;
  }
  return value;
}

function convertQuantityToMph(q) {
  const value = readQuantityValue(q);
  if (value === null) {
    return null;
  }

  const unit = parseQuantityUnit(q);
  if (unit.includes("m_s-1") || unit.includes("m/s")) {
    return value * 2.23693629;
  }
  if (unit.includes("km_h-1") || unit.includes("km/h")) {
    return value * 0.621371192;
  }
  if (unit.includes("knot")) {
    return value * 1.15077945;
  }
  if (unit.includes("mph")) {
    return value;
  }
  return value;
}

function convertQuantityToIn(q) {
  const value = readQuantityValue(q);
  if (value === null) {
    return null;
  }

  const unit = parseQuantityUnit(q);
  if (unit.includes("mm")) {
    return value / 25.4;
  }
  if (unit.includes("cm")) {
    return value / 2.54;
  }
  if (unit.includes("m")) {
    return value * 39.37007874;
  }
  if (unit.includes("in")) {
    return value;
  }
  return value;
}

function convertQuantityToFt(q) {
  const value = readQuantityValue(q);
  if (value === null) {
    return null;
  }

  const unit = parseQuantityUnit(q);
  if (unit.includes("m")) {
    return value * 3.280839895;
  }
  if (unit.includes("ft") || unit.includes("foot")) {
    return value;
  }
  return value;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const earthRadiusMiles = 3958.7613;
  return earthRadiusMiles * c;
}

function classifyConfidence(score) {
  if (!Number.isFinite(score)) {
    return { label: "Unknown", className: "medium" };
  }
  if (score >= 78) {
    return { label: "High", className: "high" };
  }
  if (score >= 58) {
    return { label: "Medium", className: "medium" };
  }
  return { label: "Low", className: "low" };
}

function formatValue(value, digits = 1, suffix = "", fallback = "n/a") {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return `${value.toFixed(digits)}${suffix}`;
}

function formatSigned(value, digits = 1, suffix = "", fallback = "n/a") {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${suffix}`;
}

function formatAgeMins(ageMins) {
  if (!Number.isFinite(ageMins) || ageMins < 0) {
    return "n/a";
  }
  if (ageMins < 90) {
    return `${Math.round(ageMins)} min`;
  }
  const hours = ageMins / 60;
  if (hours < 48) {
    return `${hours.toFixed(1)} h`;
  }
  return `${(hours / 24).toFixed(1)} d`;
}

function renderViewModeBanner(modeInfo, stationObs = null) {
  if (!viewModeBannerEl) {
    return;
  }

  const mode = modeInfo?.viewMode === "station" ? "station" : "location";
  const dataMode = modeInfo?.dataMode === "station" ? "station-data" : "model-data";
  viewModeBannerEl.className = `view-mode-banner ${mode} ${dataMode}`;
  const dataSuffix =
    modeInfo?.dataMode === "station"
      ? " Data mode: station observations where available, model fallback for missing fields."
      : " Data mode: model gridpoint only.";

  if (mode === "station") {
    const stationName = modeInfo?.stationName || stationObs?.station_name || "Selected Station";
    const stationId = modeInfo?.stationId || stationObs?.station_id || "";
    const idSuffix = stationId ? ` (${stationId})` : "";
    viewModeBannerEl.textContent = `Station-Pinned View: all charts are for ${stationName}${idSuffix}.${dataSuffix}`;
    return;
  }

  if (stationObs) {
    const stationName = stationObs.station_name || "nearest station";
    const stationId = stationObs.station_id ? ` (${stationObs.station_id})` : "";
    const distanceTxt = Number.isFinite(stationObs.distance_mi) ? `${stationObs.distance_mi.toFixed(1)} mi` : "n/a";
    viewModeBannerEl.textContent = `Location View: charts are for your chosen point; station cross-check uses ${stationName}${stationId}, ${distanceTxt} away.${dataSuffix}`;
    return;
  }

  viewModeBannerEl.textContent = `Location View: charts are for your chosen point; nearest weather station cross-check is loading.${dataSuffix}`;
}

async function fetchJsonOrThrow(url, signal) {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/geo+json, application/ld+json, application/json" }
  });
  if (!res.ok) {
    const body = await readErrorTextSafe(res);
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

function stationBaseUrlFromFeature(feature) {
  const idUrl =
    toHttps(feature?.id) ||
    toHttps(feature?.properties?.["@id"]) ||
    (typeof feature?.properties?.stationIdentifier === "string"
      ? `${NWS_API_ROOT}/stations/${feature.properties.stationIdentifier}`
      : null);
  return idUrl ? idUrl.replace(/\/+$/, "") : null;
}

function buildStationConfidencePayload(stationObs, modelNow, modelElevationM) {
  const modelElevationFt = modelElevationM === null ? null : modelElevationM * 3.280839895;
  const tempDelta =
    stationObs.temperature_f !== null && modelNow?.temperature_f !== null
      ? modelNow.temperature_f - stationObs.temperature_f
      : null;
  const windDelta =
    stationObs.wind_mph !== null && modelNow?.wind_mph !== null ? modelNow.wind_mph - stationObs.wind_mph : null;
  const precipModel = modelNow?.precip_lwe_in ?? null;
  const precipDelta =
    stationObs.precip_in !== null && precipModel !== null ? precipModel - stationObs.precip_in : null;
  const elevationDeltaFt =
    stationObs.elevation_ft !== null && modelElevationFt !== null ? modelElevationFt - stationObs.elevation_ft : null;

  const parts = [];

  const distanceScore =
    stationObs.distance_mi === null
      ? null
      : stationObs.distance_mi <= 5
      ? 100
      : stationObs.distance_mi <= 15
      ? 88
      : stationObs.distance_mi <= 30
      ? 72
      : stationObs.distance_mi <= 50
      ? 55
      : stationObs.distance_mi <= 80
      ? 38
      : 22;
  parts.push({ score: distanceScore, weight: 1.4 });

  const elevAbs = elevationDeltaFt === null ? null : Math.abs(elevationDeltaFt);
  const elevScore =
    elevAbs === null
      ? null
      : elevAbs <= 500
      ? 95
      : elevAbs <= 1000
      ? 82
      : elevAbs <= 2000
      ? 65
      : elevAbs <= 3000
      ? 45
      : 30;
  parts.push({ score: elevScore, weight: 1.0 });

  const ageScore =
    stationObs.obs_age_min === null
      ? null
      : stationObs.obs_age_min <= 30
      ? 100
      : stationObs.obs_age_min <= 90
      ? 85
      : stationObs.obs_age_min <= 180
      ? 68
      : stationObs.obs_age_min <= 360
      ? 52
      : stationObs.obs_age_min <= 720
      ? 32
      : 18;
  parts.push({ score: ageScore, weight: 1.2 });

  const tempAbs = tempDelta === null ? null : Math.abs(tempDelta);
  const tempScore =
    tempAbs === null
      ? null
      : tempAbs <= 2
      ? 100
      : tempAbs <= 4
      ? 86
      : tempAbs <= 7
      ? 68
      : tempAbs <= 10
      ? 48
      : 28;
  parts.push({ score: tempScore, weight: 1.2 });

  const windAbs = windDelta === null ? null : Math.abs(windDelta);
  const windScore =
    windAbs === null
      ? null
      : windAbs <= 3
      ? 100
      : windAbs <= 6
      ? 84
      : windAbs <= 10
      ? 66
      : windAbs <= 15
      ? 46
      : 25;
  parts.push({ score: windScore, weight: 0.9 });

  const precipAbs = precipDelta === null ? null : Math.abs(precipDelta);
  const precipScore =
    precipAbs === null
      ? null
      : precipAbs <= 0.03
      ? 100
      : precipAbs <= 0.08
      ? 80
      : precipAbs <= 0.15
      ? 60
      : precipAbs <= 0.25
      ? 40
      : 25;
  parts.push({ score: precipScore, weight: 0.6 });

  const validParts = parts.filter((p) => Number.isFinite(p.score) && Number.isFinite(p.weight));
  const weightedScore = validParts.reduce((acc, p) => acc + p.score * p.weight, 0);
  const weightTotal = validParts.reduce((acc, p) => acc + p.weight, 0);
  const confidenceScore = weightTotal > 0 ? Math.round(weightedScore / weightTotal) : null;
  const confidence = classifyConfidence(confidenceScore ?? NaN);

  return {
    stationObs,
    confidenceScore,
    confidenceLabel: confidence.label,
    confidenceClassName: confidence.className,
    tempDelta,
    windDelta,
    precipDelta,
    elevationDeltaFt
  };
}

async function fetchStationCrossCheck(lat, lon, modelNow, modelElevationM, signal) {
  try {
    const points = await fetchJsonOrThrow(`${NWS_API_ROOT}/points/${lat},${lon}`, signal);
    const stationsUrlRaw = toHttps(points?.properties?.observationStations);
    if (!stationsUrlRaw) {
      return { message: "NWS station lookup was unavailable for this point." };
    }

    const stationsUrl = new URL(stationsUrlRaw);
    stationsUrl.searchParams.set("limit", "8");
    const stationsGeo = await fetchJsonOrThrow(stationsUrl.toString(), signal);
    const features = Array.isArray(stationsGeo?.features) ? stationsGeo.features : [];
    if (!features.length) {
      return { message: "No nearby NWS observation stations were returned." };
    }

    const modelElevationFt =
      modelElevationM !== null && Number.isFinite(modelElevationM)
        ? modelElevationM * 3.28084
        : null;

    const candidates = features
      .map((feature) => {
        const coords = feature?.geometry?.coordinates;
        const stationLon = toNum(Array.isArray(coords) ? coords[0] : null);
        const stationLat = toNum(Array.isArray(coords) ? coords[1] : null);
        const stationElevFt = convertQuantityToFt(feature?.properties?.elevation);
        const distanceMi =
          stationLat === null || stationLon === null ? null : haversineMiles(lat, lon, stationLat, stationLon);
        const horizontalFt = distanceMi === null ? Number.POSITIVE_INFINITY : distanceMi * 5280;
        const verticalFt =
          modelElevationFt !== null && Number.isFinite(stationElevFt) ? Math.abs(stationElevFt - modelElevationFt) : 0;
        const selectionScoreFt = Number.isFinite(horizontalFt)
          ? Math.hypot(horizontalFt, verticalFt)
          : Number.POSITIVE_INFINITY;
        return {
          feature,
          stationLat,
          stationLon,
          distanceMi,
          stationElevFt,
          selectionScoreFt
        };
      })
      .sort((a, b) => {
        return a.selectionScoreFt - b.selectionScoreFt || (a.distanceMi ?? 1e9) - (b.distanceMi ?? 1e9);
      });

    const obsSettled = await Promise.allSettled(
      candidates.map(async (candidate) => {
        const stationUrl = stationBaseUrlFromFeature(candidate.feature);
        if (!stationUrl) {
          return null;
        }

        const stationId = candidate.feature?.properties?.stationIdentifier || stationUrl.split("/").pop() || "station";
        const stationName = candidate.feature?.properties?.name || stationId;
        const stationElevFt = Number.isFinite(candidate.stationElevFt)
          ? candidate.stationElevFt
          : convertQuantityToFt(candidate.feature?.properties?.elevation);
        const latest = await fetchJsonOrThrow(`${stationUrl}/observations/latest`, signal);
        const p = latest?.properties || {};

        const timestamp = typeof p.timestamp === "string" ? p.timestamp : null;
        const obsAgeMinRaw = timestamp ? (Date.now() - new Date(timestamp).getTime()) / 60000 : null;
        const obsAgeMin = obsAgeMinRaw === null || !Number.isFinite(obsAgeMinRaw) ? null : Math.max(0, obsAgeMinRaw);
        const stationPoint = latest?.geometry?.coordinates;
        const obsLon = toNum(Array.isArray(stationPoint) ? stationPoint[0] : null);
        const obsLat = toNum(Array.isArray(stationPoint) ? stationPoint[1] : null);
        const distanceMi =
          obsLat !== null && obsLon !== null
            ? haversineMiles(lat, lon, obsLat, obsLon)
            : candidate.distanceMi === null
            ? null
            : candidate.distanceMi;

        return {
          station_id: stationId,
          station_name: stationName,
          station_url: stationUrl,
          station_lat: obsLat,
          station_lon: obsLon,
          distance_mi: distanceMi === null ? null : Number(distanceMi.toFixed(2)),
          elevation_ft: stationElevFt === null ? null : Number(stationElevFt.toFixed(0)),
          temperature_f: convertQuantityToF(p.temperature),
          wind_mph: convertQuantityToMph(p.windSpeed),
          precip_in: convertQuantityToIn(p.precipitationLastHour) ?? convertQuantityToIn(p.quantitativePrecipitation),
          obs_time_iso: timestamp,
          obs_age_min: obsAgeMin === null ? null : Number(obsAgeMin.toFixed(1)),
          text_description: typeof p.textDescription === "string" ? p.textDescription : ""
        };
      })
    );

    const observations = obsSettled
      .filter((s) => s.status === "fulfilled" && s.value)
      .map((s) => s.value)
      .filter((o) => o && (o.temperature_f !== null || o.wind_mph !== null || o.precip_in !== null));

    if (!observations.length) {
      return { message: "Nearby stations did not report recent usable observations." };
    }

    observations.sort((a, b) => {
      const aDistanceMi = a.distance_mi ?? Number.POSITIVE_INFINITY;
      const bDistanceMi = b.distance_mi ?? Number.POSITIVE_INFINITY;
      const aHorizontalFt = Number.isFinite(aDistanceMi) ? aDistanceMi * 5280 : Number.POSITIVE_INFINITY;
      const bHorizontalFt = Number.isFinite(bDistanceMi) ? bDistanceMi * 5280 : Number.POSITIVE_INFINITY;
      const aVerticalFt =
        modelElevationFt !== null && Number.isFinite(a.elevation_ft) ? Math.abs(a.elevation_ft - modelElevationFt) : 0;
      const bVerticalFt =
        modelElevationFt !== null && Number.isFinite(b.elevation_ft) ? Math.abs(b.elevation_ft - modelElevationFt) : 0;
      const aScoreFt = Number.isFinite(aHorizontalFt)
        ? Math.hypot(aHorizontalFt, aVerticalFt)
        : Number.POSITIVE_INFINITY;
      const bScoreFt = Number.isFinite(bHorizontalFt)
        ? Math.hypot(bHorizontalFt, bVerticalFt)
        : Number.POSITIVE_INFINITY;
      return aScoreFt - bScoreFt || aDistanceMi - bDistanceMi || aVerticalFt - bVerticalFt;
    });

    const best = observations[0];
    return buildStationConfidencePayload(best, modelNow, modelElevationM);
  } catch (err) {
    if (isAbortError(err)) {
      throw err;
    }
    return { message: `Station cross-check failed: ${err instanceof Error ? err.message : "request failure"}` };
  }
}

function createEmptyMetricSourceStats() {
  return {
    temperature: { station: 0, model: 0 },
    snowfall: { station: 0, model: 0 },
    rain: { station: 0, model: 0 },
    precip: { station: 0, model: 0 },
    wind: { station: 0, model: 0 },
    shortwave: { station: 0, model: 0 },
    snow_depth: { station: 0, model: 0 },
    freezing_level: { station: 0, model: 0 }
  };
}

function chooseMetricValue(metricStats, metricKey, stationValue, modelValue) {
  const stats = metricStats?.[metricKey];
  if (stationValue !== null && stationValue !== undefined) {
    if (stats) {
      stats.station += 1;
    }
    return stationValue;
  }
  if (modelValue !== null && modelValue !== undefined) {
    if (stats) {
      stats.model += 1;
    }
    return modelValue;
  }
  return null;
}

function mergeModelAndStationHourly(modelHourlyRecords, stationHourlyRecords) {
  const metricSourceStats = createEmptyMetricSourceStats();
  const stationByHour = new Map();
  for (const r of stationHourlyRecords || []) {
    if (r?.time) {
      stationByHour.set(r.time, r);
    }
  }

  const merged = (modelHourlyRecords || []).map((modelRecord) => {
    const stationRecord = stationByHour.get(modelRecord.time);
    const temperatureF = chooseMetricValue(metricSourceStats, "temperature", stationRecord?.temperature_f, modelRecord.temperature_f);
    const snowfallIn = chooseMetricValue(metricSourceStats, "snowfall", stationRecord?.snowfall_in, modelRecord.snowfall_in);
    const rainIn = chooseMetricValue(metricSourceStats, "rain", stationRecord?.rain_in, modelRecord.rain_in);
    const precipLweIn = chooseMetricValue(
      metricSourceStats,
      "precip",
      stationRecord?.precip_lwe_in,
      modelRecord.precip_lwe_in
    );
    const windMph = chooseMetricValue(metricSourceStats, "wind", stationRecord?.wind_mph, modelRecord.wind_mph);
    const shortwaveWm2 = chooseMetricValue(metricSourceStats, "shortwave", stationRecord?.shortwave_wm2, modelRecord.shortwave_wm2);
    const snowDepthIn = chooseMetricValue(
      metricSourceStats,
      "snow_depth",
      stationRecord?.snow_depth_in,
      modelRecord.snow_depth_in
    );
    const freezingLevelFt = chooseMetricValue(
      metricSourceStats,
      "freezing_level",
      stationRecord?.freezing_level_ft,
      modelRecord.freezing_level_ft
    );

    return {
      time: modelRecord.time,
      temperature_f: temperatureF,
      snowfall_in: snowfallIn,
      rain_in: rainIn,
      precip_lwe_in: precipLweIn,
      wind_mph: windMph,
      gust_mph: stationRecord?.gust_mph ?? modelRecord.gust_mph,
      shortwave_wm2: shortwaveWm2,
      snow_depth_in: snowDepthIn,
      freezing_level_ft: freezingLevelFt
    };
  });

  return { hourlyRecords: merged, metricSourceStats };
}

function getChartSourceFromMetrics(metricSourceStats, chartId) {
  const metricKeys = CHART_SOURCE_METRICS[chartId] || [];
  if (!metricKeys.length) {
    return "model";
  }
  let stationCount = 0;
  let modelCount = 0;
  for (const metricKey of metricKeys) {
    const stats = metricSourceStats?.[metricKey];
    if (!stats) {
      continue;
    }
    stationCount += stats.station || 0;
    modelCount += stats.model || 0;
  }
  if (stationCount <= 0) {
    return "model";
  }
  if (modelCount <= 0) {
    return "station";
  }
  return "mixed";
}

function deriveChartSources(dataMode, metricSourceStats) {
  const sourceByChart = {};
  for (const chartId of CHART_IDS_WITH_SOURCE) {
    sourceByChart[chartId] = dataMode === "station" ? getChartSourceFromMetrics(metricSourceStats, chartId) : "model";
  }
  sourceByChart["forecast-chart"] = "model";
  return sourceByChart;
}

function stringContainsAny(haystack, needles) {
  if (!haystack) {
    return false;
  }
  for (const needle of needles) {
    if (haystack.includes(needle)) {
      return true;
    }
  }
  return false;
}

function extractObservationWeatherText(presentWeather, textDescription) {
  const chunks = [];
  if (Array.isArray(presentWeather)) {
    for (const item of presentWeather) {
      if (!item || typeof item !== "object") {
        continue;
      }
      for (const key of ["weather", "rawString", "intensity", "modifier", "coverage"]) {
        const raw = item[key];
        if (typeof raw === "string" && raw) {
          chunks.push(raw.toLowerCase());
        }
      }
    }
  }
  if (typeof textDescription === "string" && textDescription) {
    chunks.push(textDescription.toLowerCase());
  }
  return chunks.join(" ");
}

function isObservationRainCertain(presentWeather, textDescription) {
  const weatherText = extractObservationWeatherText(presentWeather, textDescription);
  if (!weatherText) {
    return false;
  }
  const hasSnowSignal = stringContainsAny(weatherText, ["snow", "flurr", "sleet", "ice pellet", "graupel"]);
  if (hasSnowSignal) {
    return false;
  }
  return stringContainsAny(weatherText, ["rain", "drizzle", "showers", "shower"]);
}

function scoreStationRecord(record) {
  if (!record || typeof record !== "object") {
    return 0;
  }
  const keys = [
    "temperature_f",
    "snowfall_in",
    "rain_in",
    "precip_lwe_in",
    "wind_mph",
    "gust_mph",
    "snow_depth_in"
  ];
  let score = 0;
  for (const key of keys) {
    if (record[key] !== null && record[key] !== undefined) {
      score += 1;
    }
  }
  return score;
}

function mapStationObservationsToHourly(features, timezone) {
  const byHour = new Map();

  for (const feature of features || []) {
    const p = feature?.properties || {};
    const timestamp = typeof p.timestamp === "string" ? p.timestamp : null;
    const hourKey = formatHourKeyInTimezone(timestamp, timezone);
    if (!hourKey) {
      continue;
    }

    const precipIn = convertQuantityToIn(p.precipitationLastHour) ?? convertQuantityToIn(p.quantitativePrecipitation);
    const rainCertain = isObservationRainCertain(p.presentWeather, p.textDescription);
    const record = {
      time: hourKey,
      temperature_f: convertQuantityToF(p.temperature),
      snowfall_in: convertQuantityToIn(p.snowfallLastHour),
      rain_in: rainCertain && precipIn !== null ? precipIn : null,
      precip_lwe_in: precipIn,
      wind_mph: convertQuantityToMph(p.windSpeed),
      gust_mph: convertQuantityToMph(p.windGust),
      shortwave_wm2: null,
      snow_depth_in: convertQuantityToIn(p.snowDepth),
      freezing_level_ft: null,
      obs_timestamp_ms: timestamp ? new Date(timestamp).getTime() : null
    };

    const prev = byHour.get(hourKey);
    if (!prev) {
      byHour.set(hourKey, record);
      continue;
    }

    const prevScore = scoreStationRecord(prev);
    const nextScore = scoreStationRecord(record);
    const prevTs = prev.obs_timestamp_ms ?? -Infinity;
    const nextTs = record.obs_timestamp_ms ?? -Infinity;
    if (nextScore > prevScore || (nextScore === prevScore && nextTs > prevTs)) {
      byHour.set(hourKey, record);
    }
  }

  return [...byHour.values()]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((r) => ({
      time: r.time,
      temperature_f: r.temperature_f,
      snowfall_in: r.snowfall_in,
      rain_in: r.rain_in,
      precip_lwe_in: r.precip_lwe_in,
      wind_mph: r.wind_mph,
      gust_mph: r.gust_mph,
      shortwave_wm2: r.shortwave_wm2,
      snow_depth_in: r.snow_depth_in,
      freezing_level_ft: r.freezing_level_ft
    }));
}

function readNextPageUrl(payload) {
  const raw =
    payload?.pagination?.next ||
    payload?.pagination?.nextPage ||
    payload?.next ||
    payload?.links?.next?.href ||
    payload?.links?.next;
  return toHttps(typeof raw === "string" ? raw : null);
}

async function fetchStationHourlyHistory(stationObs, seasonStart, historyEndDate, timezone, signal) {
  const stationUrlRaw = toHttps(stationObs?.station_url);
  if (!stationUrlRaw) {
    throw new Error("Station URL unavailable for station history fetch.");
  }
  const stationUrl = stationUrlRaw.replace(/\/+$/, "");
  const endExclusive = addDaysToDayKey(historyEndDate, 1);
  const url = new URL(`${stationUrl}/observations`);
  url.searchParams.set("start", `${seasonStart}T00:00:00Z`);
  url.searchParams.set("end", `${endExclusive}T00:00:00Z`);
  url.searchParams.set("limit", "500");

  const features = [];
  const seen = new Set();
  let nextUrl = url.toString();
  let pageCount = 0;
  while (nextUrl && !seen.has(nextUrl) && pageCount < 40) {
    seen.add(nextUrl);
    const pageJson = await fetchJsonOrThrow(nextUrl, signal);
    const pageFeatures = Array.isArray(pageJson?.features) ? pageJson.features : [];
    features.push(...pageFeatures);
    nextUrl = readNextPageUrl(pageJson);
    pageCount += 1;
  }

  return {
    hourlyRecords: mapStationObservationsToHourly(features, timezone),
    observationCount: features.length,
    pageCount
  };
}

function renderStationCrossCheck(payload, modeInfo = {}) {
  if (!stationCheckEl) {
    return;
  }

  if (!payload) {
    stationCheckEl.innerHTML = '<p class="station-empty">Station cross-check unavailable for this load.</p>';
    return;
  }

  if (payload.message) {
    stationCheckEl.innerHTML = `<p class="station-empty">${escapeHtml(payload.message)}</p>`;
    return;
  }

  const { stationObs, confidenceScore, confidenceLabel, confidenceClassName, tempDelta, windDelta, precipDelta, elevationDeltaFt } =
    payload;
  const obsAgeTxt = formatAgeMins(stationObs.obs_age_min);
  const stationIdTxt = stationObs.station_id ? `(${stationObs.station_id})` : "";
  const stationLabel = stationObs.station_name || stationObs.station_id || "station";
  const obsTimeTxt = stationObs.obs_time_iso
    ? new Date(stationObs.obs_time_iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })
    : "n/a";
  const activeLat = toNum(modeInfo.activeLat);
  const activeLon = toNum(modeInfo.activeLon);
  const stationLat = toNum(stationObs.station_lat);
  const stationLon = toNum(stationObs.station_lon);
  const hasStationCoords = stationLat !== null && stationLon !== null;
  const stationSeparationMi =
    hasStationCoords && activeLat !== null && activeLon !== null
      ? haversineMiles(activeLat, activeLon, stationLat, stationLon)
      : null;
  const alreadyPinned = modeInfo?.viewMode === "station" && stationSeparationMi !== null && stationSeparationMi < 0.05;
  const stationDataActive = modeInfo?.dataMode === "station";
  const stationIdNorm = typeof stationObs.station_id === "string" ? stationObs.station_id.trim().toUpperCase() : "";
  const modeStationIdNorm = typeof modeInfo?.stationId === "string" ? modeInfo.stationId.trim().toUpperCase() : "";
  const stationDataForThisStation = stationDataActive && stationIdNorm && modeStationIdNorm === stationIdNorm;
  const stationUrl = toHttps(stationObs.station_url || "");
  const canSwitchStationData = hasStationCoords && Boolean(stationUrl);
  const switchLat = hasStationCoords ? stationLat : activeLat;
  const switchLon = hasStationCoords ? stationLon : activeLon;
  const safeSwitchLat = switchLat === null ? 0 : switchLat;
  const safeSwitchLon = switchLon === null ? 0 : switchLon;

  const metrics = [
    { k: "Distance", v: formatValue(stationObs.distance_mi, 1, " mi") },
    { k: "Elevation Delta", v: formatSigned(elevationDeltaFt, 0, " ft") },
    { k: "Obs Age", v: obsAgeTxt },
    { k: "Temp Delta", v: formatSigned(tempDelta, 1, " F") },
    { k: "Wind Delta", v: formatSigned(windDelta, 1, " mph") },
    { k: "Precip Delta", v: formatSigned(precipDelta, 2, " in/hr") }
  ];
  const modelSwitchHtml = stationDataActive
    ? `<p class="station-switch-line">
         <button
           type="button"
           class="station-switch-link"
           data-station-model-switch="1"
           data-station-lat="${escapeHtml(safeSwitchLat.toFixed(6))}"
           data-station-lon="${escapeHtml(safeSwitchLon.toFixed(6))}"
           data-station-name="${escapeHtml(stationObs.station_name || "")}"
           data-station-id="${escapeHtml(stationObs.station_id || "")}"
           data-station-url="${escapeHtml(stationUrl || "")}"
         >
           Use model-only data at this location
         </button>
       </p>`
    : "";
  const locationSwitchHtml = hasStationCoords
    ? alreadyPinned
      ? `<p class="station-switch-note">Dashboard is pinned to ${escapeHtml(stationLabel)} location.</p>`
      : `<p class="station-switch-line">
           <button
             type="button"
             class="station-switch-link"
             data-station-switch="1"
             data-station-lat="${escapeHtml(stationLat.toFixed(6))}"
             data-station-lon="${escapeHtml(stationLon.toFixed(6))}"
             data-station-name="${escapeHtml(stationObs.station_name || "")}"
             data-station-id="${escapeHtml(stationObs.station_id || "")}"
             data-station-url="${escapeHtml(stationUrl || "")}"
           >
             Use ${escapeHtml(stationLabel)} location for all charts
           </button>
         </p>`
    : `<p class="station-switch-note">Station coordinates unavailable for location switch.</p>`;
  const stationDataSwitchHtml = canSwitchStationData
    ? stationDataForThisStation
      ? `<p class="station-switch-note">Station data mode is active for ${escapeHtml(stationLabel)}.</p>`
      : `<p class="station-switch-line">
           <button
             type="button"
             class="station-switch-link station-switch-link-station"
             data-station-data-switch="1"
             data-station-lat="${escapeHtml(stationLat.toFixed(6))}"
             data-station-lon="${escapeHtml(stationLon.toFixed(6))}"
             data-station-name="${escapeHtml(stationObs.station_name || "")}"
             data-station-id="${escapeHtml(stationObs.station_id || "")}"
             data-station-url="${escapeHtml(stationUrl || "")}"
           >
             Switch to Station Data (obs + model fallback)
           </button>
         </p>`
    : `<p class="station-switch-note">Station history endpoint unavailable for station-data mode.</p>`;
  const switchActionHtml = `${locationSwitchHtml}${stationDataSwitchHtml}${modelSwitchHtml}`;

  stationCheckEl.innerHTML = `
    <div class="station-head">
      <span class="confidence-pill ${escapeHtml(confidenceClassName)}">
        ${escapeHtml(confidenceLabel)} confidence (${Number.isFinite(confidenceScore) ? confidenceScore : "n/a"}/100)
      </span>
      <span class="station-head-main">${escapeHtml(stationObs.station_name)} ${escapeHtml(stationIdTxt)}</span>
      <span class="station-head-sub">Latest obs: ${escapeHtml(obsTimeTxt)} (${escapeHtml(obsAgeTxt)} ago)</span>
    </div>
    <div class="station-grid">
      ${metrics
        .map(
          (m) => `
          <article class="station-metric">
            <p class="station-k">${escapeHtml(m.k)}</p>
            <p class="station-v">${escapeHtml(m.v)}</p>
          </article>
        `
        )
        .join("")}
    </div>
    ${switchActionHtml}
    <p class="station-note">
      Station weather: ${escapeHtml(stationObs.text_description || "No text description")}.
    </p>
  `;
}

function renderSummary(hourlyRecords, dailyRecords, ruleMatches, forwardSummary) {
  const latestDepth = findLatestSnowDepth(hourlyRecords);
  const peakDepth = findPeakSnowDepth(dailyRecords);
  const delta7d = findSnowDepthChange7d(dailyRecords);
  const snow24h = sumSnowLast24h(hourlyRecords);
  const latestPowder = dailyRecords.length ? dailyRecords[dailyRecords.length - 1] : null;
  const latestPowderScore = latestPowder?.powder_score;
  const latestPowderBand = powderBand(latestPowderScore);
  const latestPowderDate = latestPowder?.date || null;

  const lastFreezeDate = getLastQualifiedDate(ruleMatches, "freeze");
  const lastRainDate = getLastQualifiedDate(ruleMatches, "rain");
  const lastWindDate = getLastQualifiedDate(ruleMatches, "wind");
  const lastSunDate = getLastQualifiedDate(ruleMatches, "sun");

  const forwardCards = forwardSummary
    ? [
        {
          label: "Next 7d Snow",
          value: `${forwardSummary.snow_total_in.toFixed(1)} in`,
          sub:
            forwardSummary.start_time && forwardSummary.end_time
              ? `${forwardSummary.start_time} to ${forwardSummary.end_time}`
              : "Forward forecast window"
        },
        {
          label: "Next 7d Rain",
          value: `${forwardSummary.rain_total_in.toFixed(1)} in`,
          sub: `Freeze hours: ${forwardSummary.freeze_hours}`
        },
        {
          label: "Next 7d Max Wind",
          value: forwardSummary.max_wind_mph === null ? "n/a" : `${forwardSummary.max_wind_mph} mph`,
          sub:
            forwardSummary.min_temp_f === null || forwardSummary.max_temp_f === null
              ? "Temperature range unavailable"
              : `Temp range: ${forwardSummary.min_temp_f}F to ${forwardSummary.max_temp_f}F`
        }
      ]
    : [];

  const cards = [
    {
      label: "Current Snowpack",
      value: latestDepth === null ? "n/a" : `${latestDepth} in`,
      sub: delta7d === null ? "7-day change unavailable" : `7-day change: ${delta7d >= 0 ? "+" : ""}${delta7d} in`
    },
    {
      label: "Peak Snowpack",
      value: peakDepth ? `${peakDepth.depth} in` : "n/a",
      sub: peakDepth ? `Peak date: ${peakDepth.date}` : "No peak depth in this dataset"
    },
    {
      label: "Powder Score",
      value: Number.isFinite(latestPowderScore) ? `${latestPowderScore}/100` : "n/a",
      sub:
        Number.isFinite(latestPowderScore) && latestPowderDate
          ? `${latestPowderBand} on ${latestPowderDate}`
          : "Latest daily powder score unavailable",
      helpRule: "powder"
    },
    {
      label: "Last 24h Snow",
      value: snow24h === null ? "n/a" : `${snow24h.toFixed(1)} in`,
      sub:
        typeof hourlyRecords?.[hourlyRecords.length - 1]?.time === "string"
          ? `Rolling 24h ending ${hourlyRecords[hourlyRecords.length - 1].time}`
          : "Rolling 24h window unavailable"
    },
    ...forwardCards,
    {
      label: "Freeze-Thaw Last Day",
      value: lastFreezeDate || "No day",
      sub: lastFreezeDate ? "Most recent freeze-thaw qualification" : "No qualifying day in this period",
      helpRule: "freeze"
    },
    {
      label: "Rain-on-Snow Last Day",
      value: lastRainDate || "No day",
      sub: lastRainDate ? "Most recent rain-on-snow qualification" : "No qualifying day in this period",
      helpRule: "rain"
    },
    {
      label: "Wind Slab Last Day",
      value: lastWindDate || "No day",
      sub: lastWindDate ? "Most recent wind slab risk window" : "No qualifying day in this period",
      helpRule: "wind"
    },
    {
      label: "Strong Sun-Bake Last Day",
      value: lastSunDate || "No day",
      sub: lastSunDate ? "Most recent sun-bake qualification" : "No qualifying day in this period",
      helpRule: "sun"
    }
  ];

  summaryEl.innerHTML = cards
    .map(
      (c) => `
      <article class="summary-card">
        <p class="summary-label-row">
          <span class="summary-label">${c.label}</span>
          ${
            c.helpRule
              ? `<button class="summary-help" type="button" data-rule-help="${c.helpRule}" aria-label="Explain ${c.label}" title="Explain rule logic">?</button>`
              : ""
          }
        </p>
        <p class="summary-value">${c.value}</p>
        <p class="summary-sub">${c.sub}</p>
      </article>
    `
    )
    .join("");
}

function renderEvents(events) {
  if (!events.length) {
    eventsListEl.innerHTML = '<p class="empty-events">No event windows were flagged in this period.</p>';
    return;
  }

  const recent = events.slice(-50).reverse();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;

  eventsListEl.innerHTML = recent
    .map((e) => {
      const eventDate = parseDayKey(e.date);
      const ageDays = eventDate ? (today.getTime() - eventDate.getTime()) / msPerDay : 0;
      const isStale = Number.isFinite(ageDays) && ageDays > 7;
      return `
      <article class="event-row${isStale ? " stale" : ""}">
        <div class="event-head">
          <span class="event-date">${e.date}</span>
          <span class="event-type ${e.type}">${e.title}</span>
        </div>
        <p class="event-body">${e.detail}</p>
      </article>
    `
    })
    .join("");
}

function renderEventsTimeline(events, xRange) {
  const traces = [];
  const categoryOrder = [];

  for (const [eventType, meta] of Object.entries(EVENT_TIMELINE_META)) {
    categoryOrder.push(meta.label);
    const subset = events.filter((e) => e.type === eventType);
    if (!subset.length) {
      continue;
    }

    traces.push({
      x: subset.map((e) => e.date),
      y: subset.map(() => meta.label),
      type: "scatter",
      mode: "markers",
      marker: { size: 9, color: meta.color, symbol: "circle" },
      name: meta.label,
      customdata: subset.map((e) => [e.title, e.detail]),
      hovertemplate: "Date %{x}<br>%{customdata[0]}<br>%{customdata[1]}<extra></extra>"
    });
  }

  const layout = {
    margin: { l: PLOT_LEFT_MARGIN, r: 16, t: 8, b: 28 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: {
      range: xRange,
      showgrid: true,
      gridcolor: "#e4ebf2",
      title: "Date"
    },
    yaxis: {
      type: "category",
      categoryorder: "array",
      categoryarray: categoryOrder,
      showgrid: true,
      gridcolor: "#edf2f7"
    },
    showlegend: false,
    annotations: traces.length
      ? []
      : [
          {
            x: 0.5,
            y: 0.5,
            xref: "paper",
            yref: "paper",
            text: "No event windows flagged for this date range.",
            showarrow: false,
            font: { size: 12, color: "#617484" }
          }
        ]
  };

  setBaseShapes("events-timeline-chart", []);
  Plotly.react("events-timeline-chart", traces, layout, getPlotConfig());
}

function fmtDateTimeLocal(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  const hh = String(dateObj.getHours()).padStart(2, "0");
  const mm = String(dateObj.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function interpolateCrossingTime(startIso, endIso, fraction) {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return startIso;
  }

  const clamped = clamp(fraction, 0, 1);
  const crossMs = startMs + (endMs - startMs) * clamped;
  return fmtDateTimeLocal(new Date(crossMs));
}

function appendSplitSegment(series, x0, y0, x1, y1) {
  if (!Number.isFinite(y0) || !Number.isFinite(y1)) {
    return;
  }
  if (x0 === x1 && y0 === y1) {
    return;
  }

  series.x.push(x0, x1, null);
  series.y.push(y0, y1, null);
}

function buildSplitSeriesByThreshold(hourlyRecords, valueAccessor, threshold) {
  const blue = { x: [], y: [] };
  const red = { x: [], y: [] };

  for (let i = 0; i < hourlyRecords.length - 1; i += 1) {
    const current = hourlyRecords[i];
    const next = hourlyRecords[i + 1];
    const y0 = valueAccessor(current);
    const y1 = valueAccessor(next);

    if (y0 === null || y1 === null) {
      continue;
    }

    const x0 = current.time;
    const x1 = next.time;
    const below0 = y0 <= threshold;
    const below1 = y1 <= threshold;

    if (below0 === below1) {
      appendSplitSegment(below0 ? blue : red, x0, y0, x1, y1);
      continue;
    }

    const fraction = (threshold - y0) / (y1 - y0);
    const crossX = interpolateCrossingTime(x0, x1, fraction);

    if (below0) {
      appendSplitSegment(blue, x0, y0, crossX, threshold);
      appendSplitSegment(red, crossX, threshold, x1, y1);
    } else {
      appendSplitSegment(red, x0, y0, crossX, threshold);
      appendSplitSegment(blue, crossX, threshold, x1, y1);
    }
  }

  return { blue, red };
}

function buildSplitTemperatureSeries(hourlyRecords) {
  return buildSplitSeriesByThreshold(hourlyRecords, (r) => r.temperature_f, FREEZE_F);
}

function buildSplitFreezingLevelSeries(hourlyRecords, locationElevationFt) {
  return buildSplitSeriesByThreshold(hourlyRecords, (r) => r.freezing_level_ft, locationElevationFt);
}

function renderTemperatureChart(hourlyRecords, xRange) {
  const split = buildSplitTemperatureSeries(hourlyRecords);
  const freezeLineShape = {
    type: "line",
    xref: "x",
    yref: "y",
    x0: xRange[0],
    x1: xRange[1],
    y0: FREEZE_F,
    y1: FREEZE_F,
    line: { color: "#62717d", width: 1, dash: "dot" }
  };

  const data = [
    {
      x: split.blue.x,
      y: split.blue.y,
      mode: "lines",
      line: { color: "#2f86eb", width: 1.5 },
      name: "<= 32F"
    },
    {
      x: split.red.x,
      y: split.red.y,
      mode: "lines",
      line: { color: "#d94b45", width: 1.5 },
      name: "> 32F"
    }
  ];

  const layout = {
    margin: { l: PLOT_LEFT_MARGIN, r: 16, t: 10, b: 36 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: {
      range: xRange,
      showgrid: true,
      gridcolor: "#e4ebf2",
      title: "Time"
    },
    yaxis: {
      title: "Temperature (F)",
      showgrid: true,
      gridcolor: "#e4ebf2"
    },
    shapes: [freezeLineShape],
    legend: { orientation: "h", y: 1.1, x: 0 }
  };

  setBaseShapes("temperature-chart", [freezeLineShape]);
  Plotly.react("temperature-chart", data, layout, getPlotConfig());
}

function renderFreezingLevelChart(hourlyRecords, xRange, locationElevationFt) {
  const validElevation = Number.isFinite(locationElevationFt) ? locationElevationFt : null;
  const split =
    validElevation === null ? { blue: { x: [], y: [] }, red: { x: [], y: [] } } : buildSplitFreezingLevelSeries(hourlyRecords, validElevation);

  const x = hourlyRecords.map((r) => r.time);
  const y = hourlyRecords.map((r) => r.freezing_level_ft);
  const hasData = y.some((v) => Number.isFinite(v));
  const shapes = [];

  if (validElevation !== null) {
    shapes.push({
      type: "line",
      xref: "x",
      yref: "y",
      x0: xRange[0],
      x1: xRange[1],
      y0: validElevation,
      y1: validElevation,
      line: { color: "#62717d", width: 1, dash: "dot" }
    });
  }

  const data =
    validElevation === null
      ? [
          {
            x,
            y,
            mode: "lines",
            line: { color: "#597a95", width: 1.4 },
            name: "Freezing Elev. (ft)",
            hovertemplate: "Time %{x}<br>Freezing elev %{y:.0f} ft<extra></extra>"
          }
        ]
      : [
          {
            x: split.blue.x,
            y: split.blue.y,
            mode: "lines",
            line: { color: "#2f86eb", width: 1.5 },
            name: "Below site elev",
            hovertemplate: "Time %{x}<br>Freezing elev %{y:.0f} ft<extra></extra>"
          },
          {
            x: split.red.x,
            y: split.red.y,
            mode: "lines",
            line: { color: "#d94b45", width: 1.5 },
            name: "Above site elev",
            hovertemplate: "Time %{x}<br>Freezing elev %{y:.0f} ft<extra></extra>"
          }
        ];

  const layout = {
    margin: { l: PLOT_LEFT_MARGIN, r: 16, t: 10, b: 36 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: {
      range: xRange,
      showgrid: true,
      gridcolor: "#e4ebf2",
      title: "Time"
    },
    yaxis: {
      title: "Freezing Elevation (ft)",
      showgrid: true,
      gridcolor: "#e4ebf2",
      rangemode: "tozero"
    },
    shapes,
    annotations: hasData
      ? []
      : [
          {
            x: 0.5,
            y: 0.5,
            xref: "paper",
            yref: "paper",
            text: "Freezing elevation unavailable for this range.",
            showarrow: false,
            font: { size: 12, color: "#617484" }
          }
        ],
    legend: { orientation: "h", y: 1.1, x: 0 }
  };

  setBaseShapes("freezing-level-chart", shapes);
  Plotly.react("freezing-level-chart", data, layout, getPlotConfig());
}

function renderPrecipChart(dailyRecords, xRange) {
  const x = dailyRecords.map((d) => d.date);
  const snowDepth = dailyRecords.map((d) => d.snowfall_in_sum);
  const rainDepth = dailyRecords.map((d) => d.rain_raw_in_sum);

  const data = [
    {
      x,
      y: snowDepth,
      type: "bar",
      yaxis: "y1",
      marker: { color: "rgba(52, 136, 243, 0.9)" },
      name: "Snow (in/day)",
      hovertemplate: "Date %{x}<br>Snow %{y:.1f} in/day<extra></extra>"
    },
    {
      x,
      y: rainDepth,
      type: "bar",
      yaxis: "y1",
      marker: { color: "rgba(119, 26, 30, 0.92)" },
      name: "Rain (in/day)",
      hovertemplate: "Date %{x}<br>Rain %{y:.1f} in/day<extra></extra>"
    }
  ];

  const layout = {
    barmode: "group",
    margin: { l: PLOT_LEFT_MARGIN, r: 16, t: 10, b: 36 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: {
      range: xRange,
      showgrid: true,
      gridcolor: "#e4ebf2",
      title: "Date"
    },
    yaxis: {
      title: "Snow/Rain Depth (in/day)",
      rangemode: "tozero",
      showgrid: true,
      gridcolor: "#e4ebf2"
    },
    legend: { orientation: "h", y: 1.1, x: 0 }
  };

  setBaseShapes("precip-chart", []);
  Plotly.react("precip-chart", data, layout, getPlotConfig());
}

function powderBand(score) {
  if (!Number.isFinite(score)) {
    return "n/a";
  }
  if (score >= 80) {
    return "Excellent";
  }
  if (score >= 60) {
    return "Good";
  }
  if (score >= 40) {
    return "Variable";
  }
  if (score >= 20) {
    return "Poor";
  }
  return "Very Poor";
}

function renderPowderChart(dailyRecords, xRange) {
  const x = dailyRecords.map((d) => d.date);
  const score = dailyRecords.map((d) => d.powder_score);
  const recentSnow = dailyRecords.map((d) => d.powder_recent_snow_in);
  const daysSinceSnow = dailyRecords.map((d) => d.powder_days_since_snow);
  const rainPenalty = dailyRecords.map((d) => d.powder_rain_penalty);
  const thawPenalty = dailyRecords.map((d) => d.powder_thaw_penalty);
  const sunPenalty = dailyRecords.map((d) => d.powder_sun_penalty);
  const windPenalty = dailyRecords.map((d) => d.powder_wind_penalty);
  const densityPenalty = dailyRecords.map((d) => d.powder_density_penalty);
  const densityLwePerIn = dailyRecords.map((d) => d.powder_density_lwe_per_in);
  const qualityBonus = dailyRecords.map((d) => d.powder_quality_bonus);
  const bands = score.map((s) => powderBand(s));
  const hoverRows = dailyRecords.map((d, i) => {
    const windTxt = Number.isFinite(d.wind_max_mph) ? d.wind_max_mph.toFixed(1) : "n/a";
    const thawHrs = Number.isFinite(d.thaw_hours) ? String(d.thaw_hours) : "0";
    const rainTxt = Number.isFinite(d.rain_raw_in_sum) ? d.rain_raw_in_sum.toFixed(1) : "0.0";
    const sunTxt = Number.isFinite(d.shortwave_mj_m2_sum) ? d.shortwave_mj_m2_sum.toFixed(1) : "0.0";
    const densityTxt = Number.isFinite(densityLwePerIn[i]) ? densityLwePerIn[i].toFixed(3) : "n/a";
    return [
      bands[i],
      recentSnow[i].toFixed(1),
      String(daysSinceSnow[i]),
      thawHrs,
      rainTxt,
      sunTxt,
      windTxt,
      densityTxt,
      thawPenalty[i].toFixed(1),
      rainPenalty[i].toFixed(1),
      sunPenalty[i].toFixed(1),
      windPenalty[i].toFixed(1),
      densityPenalty[i].toFixed(1),
      qualityBonus[i].toFixed(1)
    ];
  });

  const data = [
    {
      x,
      y: score,
      type: "scatter",
      mode: "lines+markers",
      line: { color: "#285f4a", width: 2.1 },
      marker: {
        size: 6.5,
        color: score,
        cmin: 0,
        cmax: 100,
        colorscale: [
          [0, "#8b2d2b"],
          [0.35, "#b96a2e"],
          [0.6, "#b59437"],
          [0.8, "#4f8a4f"],
          [1, "#2f6f43"]
        ]
      },
      customdata: hoverRows,
      hovertemplate:
        "Date %{x}<br>" +
        "Powder score %{y}/100 (%{customdata[0]})<br>" +
        "Recent snow (weighted) %{customdata[1]} in<br>" +
        "Days since fresh snow %{customdata[2]}<br>" +
        "Thaw hours %{customdata[3]}<br>" +
        "Rain %{customdata[4]} in/day<br>" +
        "Sun %{customdata[5]} MJ/m^2/day<br>" +
        "Max wind %{customdata[6]} mph<br>" +
        "Snow density (LWE/in snow) %{customdata[7]}<br>" +
        "Penalties T/R/S/W/D %{customdata[8]}/%{customdata[9]}/%{customdata[10]}/%{customdata[11]}/%{customdata[12]}<br>" +
        "Quality bonus +%{customdata[13]}<extra></extra>",
      name: "Powder Score"
    }
  ];

  const refShape50 = {
    type: "line",
    xref: "x",
    yref: "y",
    x0: xRange[0],
    x1: xRange[1],
    y0: 50,
    y1: 50,
    line: { color: "#8d8f7c", width: 1, dash: "dot" }
  };
  const refShape80 = {
    type: "line",
    xref: "x",
    yref: "y",
    x0: xRange[0],
    x1: xRange[1],
    y0: 80,
    y1: 80,
    line: { color: "#4f8754", width: 1, dash: "dot" }
  };

  const layout = {
    margin: { l: PLOT_LEFT_MARGIN, r: 16, t: 10, b: 36 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: {
      range: xRange,
      showgrid: true,
      gridcolor: "#e4ebf2",
      title: "Date"
    },
    yaxis: {
      title: "Powder Score (0-100)",
      range: [0, 100],
      showgrid: true,
      gridcolor: "#e4ebf2"
    },
    shapes: [refShape50, refShape80],
    showlegend: false
  };

  setBaseShapes("powder-chart", [refShape50, refShape80]);
  Plotly.react("powder-chart", data, layout, getPlotConfig());
}

function renderSnowpackChart(dailyRecords, xRange) {
  const x = dailyRecords.map((d) => d.date);
  const depth = dailyRecords.map((d) => d.snow_depth_end_in);
  const depthMax = dailyRecords.map((d) => d.snow_depth_max_in);
  const finiteDepths = [...depth, ...depthMax].filter((v) => Number.isFinite(v));
  const depthPeak = finiteDepths.length ? Math.max(...finiteDepths) : 0;
  const yAxisMax = depthPeak > 0 ? Number((depthPeak * 1.08 + 0.1).toFixed(2)) : 1;

  const data = [
    {
      x,
      y: depth,
      type: "scatter",
      mode: "lines",
      line: { color: "#255db3", width: 2.2 },
      fill: "tozeroy",
      fillcolor: "rgba(37,93,179,0.18)",
      name: "End-of-day snow depth"
    },
    {
      x,
      y: depthMax,
      type: "scatter",
      mode: "lines",
      line: { color: "#5f89c9", width: 1.3, dash: "dot" },
      name: "Daily max snow depth"
    }
  ];

  const layout = {
    margin: { l: PLOT_LEFT_MARGIN, r: 16, t: 10, b: 36 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: {
      range: xRange,
      showgrid: true,
      gridcolor: "#e4ebf2",
      title: "Date"
    },
    yaxis: {
      title: "Snow depth (in)",
      range: [0, yAxisMax],
      showgrid: true,
      gridcolor: "#e4ebf2"
    },
    legend: { orientation: "h", y: 1.1, x: 0 }
  };

  setBaseShapes("snowpack-chart", []);
  Plotly.react("snowpack-chart", data, layout, getPlotConfig());
}

function renderWindChart(dailyRecords, xRange) {
  const x = dailyRecords.map((d) => d.date);
  const avgWind = dailyRecords.map((d) => d.wind_avg_mph);
  const maxWind = dailyRecords.map((d) => d.wind_max_mph);

  const data = [
    {
      x,
      y: avgWind,
      type: "scatter",
      mode: "lines",
      line: { color: "#267356", width: 2 },
      name: "Avg Wind"
    },
    {
      x,
      y: maxWind,
      type: "scatter",
      mode: "lines",
      line: { color: "#66a96f", width: 2 },
      name: "Max Wind"
    }
  ];

  const layout = {
    margin: { l: PLOT_LEFT_MARGIN, r: 16, t: 10, b: 36 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: {
      range: xRange,
      showgrid: true,
      gridcolor: "#e4ebf2",
      title: "Date"
    },
    yaxis: {
      title: "Wind (mph)",
      rangemode: "tozero",
      showgrid: true,
      gridcolor: "#e4ebf2"
    },
    legend: { orientation: "h", y: 1.1, x: 0 }
  };

  setBaseShapes("wind-chart", []);
  Plotly.react("wind-chart", data, layout, getPlotConfig());
}

function renderSunChart(dailyRecords, xRange) {
  const x = dailyRecords.map((d) => d.date);
  const sun = dailyRecords.map((d) => d.shortwave_mj_m2_sum);
  const sunIndex = dailyRecords.map((d) => d.sun_bake_index);

  const data = [
    {
      x,
      y: sun,
      type: "scatter",
      mode: "lines",
      line: { color: "#e59d17", width: 2 },
      fill: "tozeroy",
      fillcolor: "rgba(229,157,23,0.2)",
      name: "Shortwave MJ/m^2/day"
    },
    {
      x,
      y: sunIndex,
      yaxis: "y2",
      type: "scatter",
      mode: "lines",
      line: { color: "#8a5a0f", width: 1.5, dash: "dot" },
      name: "Sun-bake index (0-100)"
    }
  ];

  const layout = {
    margin: { l: PLOT_LEFT_MARGIN, r: 58, t: 10, b: 36 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: {
      range: xRange,
      showgrid: true,
      gridcolor: "#e4ebf2",
      title: "Date"
    },
    yaxis: {
      title: "Shortwave (MJ/m^2/day)",
      rangemode: "tozero",
      showgrid: true,
      gridcolor: "#e4ebf2"
    },
    yaxis2: {
      title: "Sun-bake index",
      overlaying: "y",
      side: "right",
      range: [0, 100]
    },
    legend: { orientation: "h", y: 1.15, x: 0 }
  };

  setBaseShapes("sun-chart", []);
  Plotly.react("sun-chart", data, layout, getPlotConfig());
}

function renderForwardChart(forwardHourlyRecords) {
  const emptyLayout = {
    margin: { l: PLOT_LEFT_MARGIN, r: 88, t: 10, b: 36 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: {
      showgrid: true,
      gridcolor: "#e4ebf2",
      title: "Time"
    },
    yaxis: {
      title: "Temperature (F)",
      showgrid: true,
      gridcolor: "#e4ebf2"
    },
    annotations: [
      {
        x: 0.5,
        y: 0.5,
        xref: "paper",
        yref: "paper",
        text: "Forward 7d forecast unavailable.",
        showarrow: false,
        font: { size: 12, color: "#617484" }
      }
    ]
  };

  if (!Array.isArray(forwardHourlyRecords) || !forwardHourlyRecords.length) {
    setBaseShapes("forecast-chart", []);
    Plotly.react("forecast-chart", [], emptyLayout, getPlotConfig());
    return;
  }

  const split = buildSplitTemperatureSeries(forwardHourlyRecords);
  const x = forwardHourlyRecords.map((r) => r.time);
  const snow = forwardHourlyRecords.map((r) => Math.max(0, r.snowfall_in ?? 0));
  const rain = forwardHourlyRecords.map((r) => Math.max(0, r.rain_in ?? 0));
  const wind = forwardHourlyRecords.map((r) => r.wind_mph);
  const tempVals = forwardHourlyRecords.map((r) => r.temperature_f).filter((v) => Number.isFinite(v));
  const xRange = [x[0], x[x.length - 1]];

  const tempMin = tempVals.length ? Math.min(...tempVals) : FREEZE_F - 6;
  const tempMax = tempVals.length ? Math.max(...tempVals) : FREEZE_F + 6;
  const tempSpread = Math.max(6, tempMax - tempMin);
  const tempPad = Math.max(2.5, tempSpread * 0.12);
  const tempRange = [Math.min(tempMin - tempPad, FREEZE_F - 1), Math.max(tempMax + tempPad, FREEZE_F + 1)];

  const precipMax = Math.max(0, ...snow, ...rain);
  const precipPad = Math.max(0.03, precipMax * 0.14);
  const precipRange = [0, precipMax > 0 ? precipMax + precipPad : 0.2];

  const windVals = wind.filter((v) => Number.isFinite(v));
  const windMax = windVals.length ? Math.max(...windVals) : 0;
  const windPad = Math.max(2, windMax * 0.12);
  const windRange = [0, windMax > 0 ? windMax + windPad : 8];

  const freezeLineShape = {
    type: "line",
    xref: "x",
    yref: "y",
    x0: xRange[0],
    x1: xRange[1],
    y0: FREEZE_F,
    y1: FREEZE_F,
    line: { color: "#62717d", width: 1, dash: "dot" }
  };

  const data = [
    {
      x,
      y: snow,
      type: "bar",
      yaxis: "y2",
      marker: { color: "rgba(52, 136, 243, 0.85)" },
      name: "Snow (in/hr)",
      hovertemplate: "Time %{x}<br>Snow %{y:.2f} in/hr<extra></extra>"
    },
    {
      x,
      y: rain,
      type: "bar",
      yaxis: "y2",
      marker: { color: "rgba(130, 36, 40, 0.86)" },
      name: "Rain (in/hr)",
      hovertemplate: "Time %{x}<br>Rain %{y:.2f} in/hr<extra></extra>"
    },
    {
      x: split.blue.x,
      y: split.blue.y,
      type: "scatter",
      mode: "lines",
      line: { color: "#2f86eb", width: 1.8 },
      yaxis: "y",
      name: "Temp <= 32F"
    },
    {
      x: split.red.x,
      y: split.red.y,
      type: "scatter",
      mode: "lines",
      line: { color: "#d94b45", width: 1.8 },
      yaxis: "y",
      name: "Temp > 32F"
    },
    {
      x,
      y: wind,
      type: "scatter",
      mode: "lines",
      line: { color: "#35765b", width: 1.4, dash: "dot" },
      yaxis: "y3",
      name: "Wind (mph)",
      hovertemplate: "Time %{x}<br>Wind %{y:.1f} mph<extra></extra>"
    }
  ];

  const layout = {
    barmode: "group",
    margin: { l: PLOT_LEFT_MARGIN, r: 88, t: 10, b: 36 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    xaxis: {
      range: xRange,
      showgrid: true,
      gridcolor: "#e4ebf2",
      title: "Time"
    },
    yaxis: {
      title: "Temperature (F)",
      range: tempRange,
      showgrid: true,
      gridcolor: "#e4ebf2"
    },
    yaxis2: {
      title: "Rain/Snow (in/hr)",
      overlaying: "y",
      side: "right",
      range: precipRange,
      showgrid: false
    },
    yaxis3: {
      title: "Wind (mph)",
      overlaying: "y",
      side: "right",
      anchor: "free",
      position: 0.9,
      range: windRange,
      showgrid: false
    },
    shapes: [freezeLineShape],
    legend: { orientation: "h", y: 1.12, x: 0 }
  };

  setBaseShapes("forecast-chart", [freezeLineShape]);
  Plotly.react("forecast-chart", data, layout, getPlotConfig());
}

async function loadSeason(lat, lon, options = {}) {
  const loadToken = ++activeLoadToken;
  if (activeLoadController) {
    activeLoadController.abort();
  }
  const loadController = new AbortController();
  activeLoadController = loadController;
  const { signal } = loadController;
  const isStale = () => signal.aborted || loadToken !== activeLoadToken;
  const optionStationUrl = toHttps(typeof options.stationUrl === "string" ? options.stationUrl : "") || "";
  const modeInfo = {
    viewMode: options.viewMode === "station" ? "station" : "location",
    dataMode: options.dataMode === "station" ? "station" : "model",
    stationName: typeof options.stationName === "string" ? options.stationName : "",
    stationId: typeof options.stationId === "string" ? options.stationId : "",
    stationUrl: optionStationUrl,
    activeLat: lat,
    activeLon: lon
  };
  activeDataMode = modeInfo.dataMode;
  activeMetricSourceStats = null;
  document.body.classList.toggle("station-view", modeInfo.viewMode === "station");
  document.body.classList.toggle("station-data-view", modeInfo.dataMode === "station");

  const seasonStart = getSeasonStart();
  const todayDate = fmtDateLocal(new Date());
  const yesterdayDate = fmtDateLocal(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const historyEndDate = yesterdayDate < seasonStart ? seasonStart : yesterdayDate;

  setStatus(
    modeInfo.dataMode === "station"
      ? "Fetching season history, archive snowfall, forecast, station checks, and station history..."
      : "Fetching season history, archive snowfall, forecast, and station checks..."
  );
  if (clearHoverTimer) {
    clearTimeout(clearHoverTimer);
    clearHoverTimer = null;
  }
  clearLinkedHoverDay();
  applyChartSources();
  metaEl.textContent = "";
  summaryEl.innerHTML = "";
  eventsListEl.innerHTML = "";
  if (stationCheckEl) {
    stationCheckEl.innerHTML = '<p class="station-empty">Fetching nearby station observations...</p>';
  }
  renderViewModeBanner(modeInfo);

  const todayUrl = buildTodayUrl(lat, lon);
  const forwardUrl = buildForward7dUrl(lat, lon);

  const [historyResult, todayResult, forwardResult, archiveSnowResult] = await Promise.allSettled([
    fetchSeasonHistory(lat, lon, seasonStart, historyEndDate, signal),
    fetch(todayUrl, { signal }),
    fetch(forwardUrl, { signal }),
    fetchArchiveSnowHistory(lat, lon, seasonStart, todayDate, signal)
  ]);
  if (isStale()) {
    return;
  }

  if (historyResult.status !== "fulfilled") {
    if (isAbortError(historyResult.reason)) {
      throw historyResult.reason;
    }
    throw new Error(historyResult.reason instanceof Error ? historyResult.reason.message : "History request failed.");
  }
  if (archiveSnowResult.status !== "fulfilled") {
    if (isAbortError(archiveSnowResult.reason)) {
      throw archiveSnowResult.reason;
    }
    throw new Error(
      archiveSnowResult.reason instanceof Error
        ? archiveSnowResult.reason.message
        : "Archive snowfall request failed."
    );
  }

  const historyJson = historyResult.value.json;
  const historySource = historyResult.value.source;
  const archiveSnowHistory = archiveSnowResult.value;
  const timezone = historyJson.timezone || "auto";
  const currentHourKey = formatHourKeyInTimezone(new Date().toISOString(), timezone);
  const snowfallUnit =
    archiveSnowHistory?.dailyUnit ||
    historyJson?.hourly_units?.snowfall ||
    historyJson?.hourly_units?.precipitation ||
    "unknown";
  if (!historyJson?.hourly?.time?.length) {
    throw new Error("No hourly data returned for that point.");
  }

  const archiveHourly = mapHourlyPayload(historyJson.hourly, historyJson.hourly_units);
  let todayHourly = [];
  if (todayResult.status === "fulfilled" && todayResult.value.ok) {
    const todayJson = await todayResult.value.json();
    todayHourly = mapHourlyPayload(todayJson.hourly, todayJson.hourly_units);
    todayHourly = clipRecordsThroughHour(todayHourly, currentHourKey);
  }
  if (isStale()) {
    return;
  }

  let forwardHourlyRecords = [];
  let forwardSummary = null;
  let modelNow = null;
  if (forwardResult.status === "fulfilled" && forwardResult.value.ok) {
    const forwardJson = await forwardResult.value.json();
    const forwardWindow = deriveForward7dWindow(forwardJson);
    forwardHourlyRecords = forwardWindow.hourlyRecords;
    modelNow = forwardWindow.modelNow;
    forwardSummary = summarizeForwardWindow(forwardHourlyRecords);
  }
  if (isStale()) {
    return;
  }

  const modelTodayDate =
    typeof currentHourKey === "string" && currentHourKey.length >= 10 ? currentHourKey.slice(0, 10) : todayDate;
  const modelHourlyRecords = mergeHourlyRecords(archiveHourly, todayHourly, modelTodayDate, currentHourKey);

  if (!modelNow) {
    modelNow = findLatestHourlySnapshot(todayHourly.length ? todayHourly : modelHourlyRecords, 6);
  }

  const elevationM = toNum(historyJson.elevation);
  const elevationFt = elevationM === null ? null : elevationM * 3.28084;
  const elevationTxt =
    elevationM === null ? "n/a" : `${elevationM.toFixed(0)} m (${elevationFt.toFixed(0)} ft)`;
  const stationCrossCheckPromise = fetchStationCrossCheck(lat, lon, modelNow, elevationM, signal);

  let stationCrossCheckResolved = null;
  let stationHistoryNote = modeInfo.dataMode === "station" ? "pending" : "off";
  let stationHourlyRecords = [];

  if (modeInfo.dataMode === "station") {
    setStatus("Fetching station observations for station-data mode...");
    let stationTarget =
      modeInfo.stationUrl || modeInfo.stationId
        ? {
            station_id: modeInfo.stationId,
            station_name: modeInfo.stationName,
            station_url: modeInfo.stationUrl || `${NWS_API_ROOT}/stations/${modeInfo.stationId}`
          }
        : null;

    if (!stationTarget) {
      try {
        stationCrossCheckResolved = await stationCrossCheckPromise;
      } catch (err) {
        if (isAbortError(err)) {
          throw err;
        }
        stationCrossCheckResolved = {
          message: `Station cross-check failed: ${err instanceof Error ? err.message : "request failure"}`
        };
      }
      if (isStale()) {
        return;
      }
      if (stationCrossCheckResolved?.stationObs) {
        stationTarget = stationCrossCheckResolved.stationObs;
      } else {
        stationHistoryNote = stationCrossCheckResolved?.message
          ? `fallback to model (${stationCrossCheckResolved.message})`
          : "fallback to model (no station target)";
      }
    }

    if (stationTarget?.station_url) {
      if (!modeInfo.stationId && stationTarget.station_id) {
        modeInfo.stationId = stationTarget.station_id;
      }
      if (!modeInfo.stationName && stationTarget.station_name) {
        modeInfo.stationName = stationTarget.station_name;
      }
      if (!modeInfo.stationUrl && stationTarget.station_url) {
        modeInfo.stationUrl = toHttps(stationTarget.station_url) || "";
      }
      renderViewModeBanner(modeInfo, stationCrossCheckResolved?.stationObs || stationTarget);
      try {
        const stationHistory = await fetchStationHourlyHistory(stationTarget, seasonStart, historyEndDate, timezone, signal);
        if (isStale()) {
          return;
        }
        stationHourlyRecords = stationHistory.hourlyRecords;
        stationHistoryNote = stationHourlyRecords.length
          ? `${stationHistory.hourlyRecords.length} station hourly bins from ${stationHistory.observationCount} obs`
          : `0 usable station observations from ${stationHistory.observationCount} obs (model fallback)`;
      } catch (err) {
        if (isAbortError(err)) {
          throw err;
        }
        stationHistoryNote = `fallback to model (${err instanceof Error ? err.message : "station history failure"})`;
      }
    }
  }

  const mergedForDisplay = mergeModelAndStationHourly(modelHourlyRecords, stationHourlyRecords);
  const displayHourlyRecords = modeInfo.dataMode === "station" ? mergedForDisplay.hourlyRecords : modelHourlyRecords;
  const metricSourceStats = modeInfo.dataMode === "station" ? mergedForDisplay.metricSourceStats : createEmptyMetricSourceStats();
  if (metricSourceStats?.snowfall) {
    const snowfallTotal = (metricSourceStats.snowfall.station || 0) + (metricSourceStats.snowfall.model || 0);
    metricSourceStats.snowfall.station = 0;
    metricSourceStats.snowfall.model = Math.max(snowfallTotal, 1);
  }
  activeDataMode = modeInfo.dataMode;
  activeMetricSourceStats = metricSourceStats;

  const archiveSnowApplied = applyArchiveSnowDailyToRecords(
    aggregateDaily(displayHourlyRecords),
    archiveSnowHistory,
    currentHourKey
  );
  const dailyRecords = derivePowderScores(archiveSnowApplied.dailyRecords);
  const analysis = analyzeDailyRules(dailyRecords);
  const events = analysis.events;
  if (!dailyRecords.length) {
    throw new Error("No daily records were generated.");
  }

  const firstSnowRecord = dailyRecords.find((d) => d.snowfall_in_sum > 0);
  const displayStartDay = firstSnowRecord ? addDaysToDayKey(firstSnowRecord.date, -1) : seasonStart;
  const xRangeHourly = [`${displayStartDay}T00:00`, displayHourlyRecords[displayHourlyRecords.length - 1].time];
  const xRangeDaily = [displayStartDay, dailyRecords[dailyRecords.length - 1].date];
  const dataThroughTime = displayHourlyRecords[displayHourlyRecords.length - 1]?.time || null;
  const snowDataThroughTime =
    archiveSnowApplied.todaySnowThroughTime ||
    archiveSnowHistory?.lastHourlyTime ||
    (archiveSnowHistory?.lastDailyDate ? `${archiveSnowHistory.lastDailyDate}T23:00` : null);
  const chartSources = deriveChartSources(modeInfo.dataMode, metricSourceStats);
  const stationBackedCharts = Object.entries(chartSources).filter(
    ([chartId, source]) => chartId !== "forecast-chart" && source !== "model"
  ).length;

  const buildMetaText = (stationConfidenceText) =>
    `Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)} | ` +
    `Season: ${seasonStart} to ${todayDate} (history through ${historyEndDate}) | ` +
    `Display start: ${displayStartDay} | ` +
    `History source: ${historySource} | ` +
    `Snow source: archive daily (today from archive hourly) | ` +
    `Snowfall unit: ${snowfallUnit} | ` +
    `Timezone: ${timezone} | ` +
    `Data through: ${dataThroughTime ? `${dataThroughTime} ${timezone}` : "n/a"} | ` +
    `Snow data through: ${snowDataThroughTime ? `${snowDataThroughTime} ${timezone}` : "n/a"} | ` +
    `Elevation: ${elevationTxt} | ` +
    `Forward horizon: ${forwardHourlyRecords.length} h | ` +
    `Station confidence: ${stationConfidenceText} | ` +
    `Data mode: ${modeInfo.dataMode} | ` +
    `Station history: ${stationHistoryNote} | ` +
    `Station-backed charts: ${stationBackedCharts} | ` +
    `Events flagged: ${events.length}`;

  renderEventsTimeline(events, xRangeDaily);
  renderTemperatureChart(displayHourlyRecords, xRangeHourly);
  renderFreezingLevelChart(displayHourlyRecords, xRangeHourly, elevationFt);
  renderPrecipChart(dailyRecords, xRangeDaily);
  renderPowderChart(dailyRecords, xRangeDaily);
  renderSnowpackChart(dailyRecords, xRangeDaily);
  renderWindChart(dailyRecords, xRangeDaily);
  renderSunChart(dailyRecords, xRangeDaily);
  renderForwardChart(forwardHourlyRecords);
  applyChartSources(chartSources);
  setupLinkedHoverHandlers();
  renderSummary(displayHourlyRecords, dailyRecords, analysis.ruleMatches, forwardSummary);
  renderEvents(events);
  metaEl.textContent = buildMetaText("pending");

  const finalizeWithStationPayload = (stationCrossCheck) => {
    if (isStale()) {
      return;
    }
    if (stationCrossCheck?.stationObs?.station_id && !modeInfo.stationId) {
      modeInfo.stationId = stationCrossCheck.stationObs.station_id;
    }
    if (stationCrossCheck?.stationObs?.station_name && !modeInfo.stationName) {
      modeInfo.stationName = stationCrossCheck.stationObs.station_name;
    }
    if (stationCrossCheck?.stationObs?.station_url && !modeInfo.stationUrl) {
      modeInfo.stationUrl = toHttps(stationCrossCheck.stationObs.station_url) || "";
    }
    renderStationCrossCheck(stationCrossCheck, modeInfo);
    renderViewModeBanner(modeInfo, stationCrossCheck?.stationObs || null);
    const stationConfidenceText =
      stationCrossCheck?.confidenceScore !== undefined && stationCrossCheck?.confidenceScore !== null
        ? `${stationCrossCheck.confidenceLabel} (${stationCrossCheck.confidenceScore}/100)`
        : "n/a";
    metaEl.textContent = buildMetaText(stationConfidenceText);
    setStatus("Loaded.");
    if (loadToken === activeLoadToken) {
      activeLoadController = null;
    }
  };

  if (stationCrossCheckResolved) {
    finalizeWithStationPayload(stationCrossCheckResolved);
    return;
  }

  if (isStale()) {
    return;
  }
  setStatus("Loaded. Station check pending...");

  stationCrossCheckPromise
    .then((stationCrossCheck) => {
      finalizeWithStationPayload(stationCrossCheck);
    })
    .catch((err) => {
      if (isAbortError(err) || isStale()) {
        return;
      }
      const fallbackPayload = {
        message: `Station cross-check failed: ${err instanceof Error ? err.message : "request failure"}`
      };
      renderStationCrossCheck(fallbackPayload, modeInfo);
      renderViewModeBanner(modeInfo);
      metaEl.textContent = buildMetaText("n/a");
      setStatus("Loaded (station check unavailable).");
      if (loadToken === activeLoadToken) {
        activeLoadController = null;
      }
    });
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const lat = Number(latInputEl.value);
  const lon = Number(lonInputEl.value);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    setStatus("Enter valid numeric latitude and longitude.");
    return;
  }

  try {
    await loadSeason(lat, lon);
  } catch (err) {
    if (isAbortError(err)) {
      return;
    }
    setStatus(err instanceof Error ? err.message : "Failed to load data.");
  }
});

for (const shortcut of shortcutEls) {
  shortcut.addEventListener("click", async (event) => {
    event.preventDefault();

    const lat = Number(shortcut.dataset.lat);
    const lon = Number(shortcut.dataset.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    latInputEl.value = String(lat);
    lonInputEl.value = String(lon);

    try {
      await loadSeason(lat, lon);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      setStatus(err instanceof Error ? err.message : "Failed to load shortcut location.");
    }
  });
}

if (stationCheckEl) {
  stationCheckEl.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const locationSwitchBtn = target.closest("[data-station-switch='1']");
    const stationDataSwitchBtn = target.closest("[data-station-data-switch='1']");
    const stationModelSwitchBtn = target.closest("[data-station-model-switch='1']");
    const switchBtn = stationDataSwitchBtn || stationModelSwitchBtn || locationSwitchBtn;
    if (!(switchBtn instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();

    const stationLat = Number(switchBtn.dataset.stationLat);
    const stationLon = Number(switchBtn.dataset.stationLon);
    const stationName = switchBtn.dataset.stationName || "";
    const stationId = switchBtn.dataset.stationId || "";
    const stationUrl = toHttps(switchBtn.dataset.stationUrl || "") || "";
    if (!Number.isFinite(stationLat) || !Number.isFinite(stationLon)) {
      setStatus("Station coordinates are unavailable for this switch.");
      return;
    }

    latInputEl.value = String(stationLat);
    lonInputEl.value = String(stationLon);

    try {
      await loadSeason(stationLat, stationLon, {
        viewMode: "station",
        dataMode: stationDataSwitchBtn ? "station" : "model",
        stationName,
        stationId,
        stationUrl
      });
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      setStatus(err instanceof Error ? err.message : "Failed to switch station mode.");
    }
  });
}

initRuleHelpModal();
initChartSourceBadgeHelp();
initMapPickerModal();
initChartExpansionControls();

function initDefaults() {
  latInputEl.value = String(DEFAULT_LAT);
  lonInputEl.value = String(DEFAULT_LON);
  loadSeason(DEFAULT_LAT, DEFAULT_LON).catch((err) => {
    if (isAbortError(err)) {
      return;
    }
    setStatus(err instanceof Error ? err.message : "Failed to load default location.");
  });
}

window.addEventListener("load", initDefaults);

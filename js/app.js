import {
  loadHeroes,
  loadPlayerMatchesFiltered,
} from "./api.js";
import {
  buildMatchListCacheKey,
  clearMatchCache,
  getCachedMatchList,
  getCachedMatches,
  getMatchCacheCount,
  setCachedMatchList,
} from "./match-cache.js";
import {
  initSavedAccounts,
  rememberAccountFromApi,
} from "./saved-accounts.js";
import {
  createLoadStats,
  formatLoadStats,
  createRateLimitWaitHandler,
  loadMatchDetailsBatch,
} from "./match-loader.js";
import { initMultiActivityLog } from "./multi-activity-log.js";
import { clampParseConcurrency } from "./parse-concurrency.js";
import { formatRateLimitWaitMessage } from "./rate-limit.js";
import {
  loadPatches,
  patchLabel,
  selectablePatches,
} from "./patches.js";
import {
  renderLaneChart,
  renderLaneVsGameChart,
  renderWinrateChart,
} from "./charts.js";
import {
  analyzeMatches,
  rollingLaneVsGame,
  rollingWinRate,
  trendDirection,
} from "./stats.js";
import { formatCi, formatPct } from "./wilson.js";
import { APP_VERSION } from "./version.js";
import { initFieldTooltips } from "./field-help.js";
import {
  applyUrlParams,
  copyShareLink,
  syncUrlFromForm,
} from "./share.js";
import {
  initSavedConfigs,
  persistSessionConfig,
  recordConfigIngestion,
  restoreSessionConfigToForm,
} from "./saved-configs.js";
import { initMainTabs } from "./tabs.js";
import { initTools } from "./tools.js";
import { initConfigUi, getParallelConcurrency } from "./config-ui.js";
import { readStratzSettingsFromDom, initStratzTokenPersistence } from "./stratz-token.js";
import { parseFailureLabel } from "./parse-failures.js";
import { createHeroPicker } from "./hero-picker.js";
import {
  applyLaneFiltersToDom,
  formatLaneFilterSummary,
  hasActiveLaneFilters,
  populateLaneFilterSelects,
  readLaneFiltersFromDom,
} from "./lane-filters.js";

const form = document.getElementById("stats-form");
const heroSearch = document.getElementById("hero-search");
const heroIdInput = document.getElementById("hero-id");
const heroPicker = createHeroPicker({
  input: heroSearch,
  hiddenInput: heroIdInput,
  suggestionsEl: document.getElementById("hero-suggestions"),
});
const progressEl = document.getElementById("progress");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");
const errorBanner = document.getElementById("error-banner");
const resultsEl = document.getElementById("results");
const summaryCards = document.getElementById("summary-cards");
const matchupTableBody = document.querySelector("#matchup-table tbody");
const matchupHeaders = document.querySelectorAll("#matchup-table th[data-sort]");
const laneTable = document.getElementById("lane-table");
const laneVsGameStats = document.getElementById("lane-vs-game-stats");
const exportBtn = document.getElementById("export-btn");
const fetchBtn = document.getElementById("fetch-btn");
const patchFilter = document.getElementById("patch-filter");
const patchBreakdown = document.getElementById("patch-breakdown");
const patchTableBody = document.querySelector("#patch-table tbody");
const shareBtn = document.getElementById("share-btn");
const shareToast = document.getElementById("share-toast");
const requestParseCheckbox = document.getElementById("request-parse");
const parseMaxInput = document.getElementById("parse-max");
const parseParallelismInput = document.getElementById("parse-parallelism");
const parseParallelEnabledCheckbox = document.getElementById("parse-parallel-enabled");
const parseRetryCheckbox = document.getElementById("parse-retry");
const parseMaxRetriesInput = document.getElementById("parse-max-retries");
const clearCacheBtn = document.getElementById("clear-cache-btn");

const ACCOUNT_ID_HINT =
  "Check your Account ID on OpenDota: search your Steam name, open your profile, and copy the number from the URL (opendota.com/players/123456789). Use that ID, not Steam ID64.";
let patches = [];
let heroes = [];
let lastMatchupRows = [];
let sortState = { key: "games", dir: "desc" };
let abortController = null;
let progressContext = { pct: 0, task: "" };
let analyzeMultiLog = null;
let cachedAnalysisSession = null;

function renderAnalysisResults(analysis, meta) {
  const {
    heroName,
    rollingWindow,
    selectedPatchLabel,
    loadStats,
    laneFilters,
  } = meta;

  const rolling = rollingWinRate(analysis.timeline, rollingWindow);
  const laneVsGameRolling = rollingLaneVsGame(analysis.timeline, rollingWindow);
  const trend = trendDirection(rolling);

  renderSummary(analysis, heroName, trend, rollingWindow, selectedPatchLabel, loadStats, laneFilters);
  renderParseStatusPanel(loadStats, meta.requestParse);
  renderMatchupFilterNote(laneFilters);
  renderLaneVsGameStats(analysis);
  renderLaneVsGameChart(
    document.getElementById("lane-vs-game-chart"),
    laneVsGameRolling,
    analysis.overallLaneWinrate,
    analysis.overallWinrate
  );
  renderWinrateChart(
    document.getElementById("winrate-chart"),
    rolling,
    analysis.overallWinrate
  );
  renderLaneChart(document.getElementById("lane-chart"), analysis.laneRows);
  renderLaneTable(analysis.laneRows);
  renderLaneDataNote(analysis, loadStats);

  const showPatchBreakdown = analysis.patchRows.length > 0;
  patchBreakdown.classList.toggle("hidden", !showPatchBreakdown);
  if (showPatchBreakdown) {
    renderPatchTable(analysis.patchRows);
  }

  sortState = { key: "games", dir: "desc" };
  updateSortHeaders();
  renderMatchupTable(analysis.matchupRows);

  resultsEl.classList.remove("hidden");
  resultsEl.querySelectorAll(".motion-rise, .motion-stagger > *").forEach((el) => {
    el.style.animation = "none";
    void el.offsetHeight;
    el.style.animation = "";
  });
  exportBtn.disabled = false;
}

function refilterCachedAnalysis() {
  if (!cachedAnalysisSession) return;

  const laneFilters = readLaneFiltersFromDom();
  syncUrlFromForm();

  const analysis = analyzeMatches(
    cachedAnalysisSession.detailsList,
    cachedAnalysisSession.accountId,
    cachedAnalysisSession.heroMap,
    cachedAnalysisSession.confidence,
    {
      turboSkippedList: cachedAnalysisSession.turboSkippedList,
      laneFilters,
    }
  );

  renderAnalysisResults(analysis, { ...cachedAnalysisSession, laneFilters });

  const summary = formatLaneFilterSummary(laneFilters);
  analyzeMultiLog?.info(summary ? `Filters updated — ${summary}` : "Filters cleared — showing all games");
}

function initLaneFilterListeners() {
  for (const id of [
    "my-lane-filter",
    "my-role-filter",
    "enemy-lane-filter",
    "enemy-role-filter",
  ]) {
    document.getElementById(id)?.addEventListener("change", refilterCachedAnalysis);
  }
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.remove("hidden");
}

function hideError() {
  errorBanner.classList.add("hidden");
}

function setProgress(visible, pct = 0, text = "") {
  progressEl.classList.toggle("hidden", !visible);
  progressFill.style.width = `${pct}%`;
  progressText.textContent = text;
}

function populateHeroes(list) {
  heroes = list;
  heroPicker.setHeroes(list);
  fetchBtn.disabled = false;
}

function resolveHeroId() {
  return heroPicker.resolveHeroId({ fuzzy: true });
}

function populatePatches(list) {
  patches = list;
  const options = selectablePatches(list)
    .map(
      (p) =>
        `<option value="${p.id}">${p.name}</option>`
    )
    .join("");
  patchFilter.innerHTML = `<option value="">All patches</option>${options}`;
}

function renderSummary(analysis, heroName, trend, rollingWindow, selectedPatchLabel, loadStats, laneFilters) {
  const trendLabels = {
    improving: "Trending up",
    declining: "Trending down",
    stable: "Holding steady",
    insufficient: "Need more matches",
  };

  const trendClass =
    trend === "improving" ? "positive" : trend === "declining" ? "negative" : "";

  const laneDataNote =
    analysis.parsedReplayCount > 0
      ? `${analysis.parsedReplayCount}/${analysis.totalGames} parsed replays · ${analysis.laneDecided} lane outcomes`
      : "No parsed replays (lane win % needs OpenDota replay parse)";

  const lanePositionNote =
    analysis.lanePositionUnknown > 0
      ? `${analysis.lanePositionKnown}/${analysis.totalGames} with lane position`
      : `${analysis.lanePositionKnown} matches with lane position`;

  const patchNote = selectedPatchLabel
    ? `Filtered to ${selectedPatchLabel}`
    : `${analysis.patchRows.length} patch(es) in sample`;

  const loadNote = loadStats ? formatLoadStats(loadStats) : "";
  const laneFilterNote = hasActiveLaneFilters(laneFilters)
    ? formatLaneFilterSummary(laneFilters)
    : "";
  const laneSkipNote =
    analysis.laneFilterSkipped > 0
      ? `${analysis.laneFilterSkipped} excluded by lane/role filter`
      : "";

  summaryCards.innerHTML = `
    <div class="summary-card">
      <div class="summary-card__label">Game win rate</div>
      <div class="summary-card__value ${analysis.overallWinrate >= 50 ? "positive" : "negative"}">${formatPct(analysis.overallWinrate)}</div>
      <div class="summary-card__sub">Wilson ${formatCi(analysis.overallCi.lower, analysis.overallCi.upper)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">Lane win rate</div>
      <div class="summary-card__value ${analysis.overallLaneWinrate >= 50 ? "positive" : "negative"}">${analysis.laneDecided ? formatPct(analysis.overallLaneWinrate) : "N/A"}</div>
      <div class="summary-card__sub">${analysis.laneDecided ? `Wilson ${formatCi(analysis.overallLaneCi.lower, analysis.overallLaneCi.upper)} · ${lanePositionNote}` : laneDataNote}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">Record</div>
      <div class="summary-card__value">${analysis.totalWins}W / ${analysis.totalLosses}L</div>
      <div class="summary-card__sub">${analysis.totalGames} matches · ${patchNote}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">Hero</div>
      <div class="summary-card__value" style="font-size:1.35rem">${heroName}</div>
      <div class="summary-card__sub">${analysis.processed} processed · ${analysis.skipped} skipped${analysis.turboSkipped ? ` · ${analysis.turboSkipped} turbo excluded` : ""}${laneSkipNote ? ` · ${laneSkipNote}` : ""}${laneFilterNote ? ` · ${laneFilterNote}` : ""}${loadNote ? ` · ${loadNote}` : ""}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">Recent trend</div>
      <div class="summary-card__value ${trendClass}">${trendLabels[trend]}</div>
      <div class="summary-card__sub">${rollingWindow}-match rolling window</div>
    </div>
  `;
}

function renderMatchupFilterNote(laneFilters) {
  const el = document.getElementById("matchup-filter-note");
  if (!el) return;
  if (!hasActiveLaneFilters(laneFilters)) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.textContent = `Matchups filtered: ${formatLaneFilterSummary(laneFilters)}. Enemy lane/role filters only affect the table below. Change filters anytime after analysis — no re-fetch needed.`;
  el.classList.remove("hidden");
}

function winrateClass(value) {
  if (value >= 55) return "winrate-good";
  if (value <= 45) return "winrate-bad";
  return "";
}

function formatLaneWld(row) {
  if (!row.laneGames) return "—";
  return `<span class="lane-wld"><span class="lane-wld__w">${row.laneWon}</span>-<span class="lane-wld__l">${row.laneLost}</span>-<span class="lane-wld__d">${row.laneDraw}</span></span>`;
}

function renderMatchupTable(rows) {
  lastMatchupRows = rows;
  matchupTableBody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${row.hero}</td>
        <td>${row.games}</td>
        <td>${row.wins}</td>
        <td>${row.losses}</td>
        <td class="winrate-cell ${winrateClass(row.winrate)}">${formatPct(row.winrate)}</td>
        <td>${row.laneGames ?? 0}</td>
        <td>${formatLaneWld(row)}</td>
        <td class="winrate-cell ${row.laneWinrate != null ? winrateClass(row.laneWinrate) : ""}">${row.laneWinrate != null ? formatPct(row.laneWinrate) : "—"}</td>
        <td>${formatPct(row.wilsonLower)}</td>
        <td>${formatPct(row.wilsonUpper)}</td>
        <td>${row.avgDuration.toFixed(1)} min</td>
        <td>${row.avgKills.toFixed(1)}</td>
        <td>${row.avgDeaths.toFixed(1)}</td>
      </tr>
    `
    )
    .join("");
}

function sortRows(rows, key, dir) {
  const sorted = [...rows];
  const factor = dir === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string") return factor * av.localeCompare(bv);
    return factor * (av - bv);
  });

  return sorted;
}

function updateSortHeaders() {
  matchupHeaders.forEach((th) => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.dataset.sort === sortState.key) {
      th.classList.add(sortState.dir === "asc" ? "sorted-asc" : "sorted-desc");
    }
  });
}

matchupHeaders.forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (sortState.key === key) {
      sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
    } else {
      sortState.key = key;
      sortState.dir = key === "hero" ? "asc" : "desc";
    }
    updateSortHeaders();
    renderMatchupTable(sortRows(lastMatchupRows, sortState.key, sortState.dir));
  });
});

function renderLaneVsGameStats(analysis) {
  const fmt = (v) => (v == null ? "N/A" : formatPct(v));

  laneVsGameStats.innerHTML = `
    <div class="compare-stat">
      <span class="compare-stat__label">Lane win %</span>
      <span class="compare-stat__value compare-stat__value--lane">${analysis.laneDecided ? formatPct(analysis.overallLaneWinrate) : "N/A"}</span>
      <span class="compare-stat__sub">${analysis.laneWon}W · ${analysis.laneLost}L · ${analysis.laneDraw}D</span>
    </div>
    <div class="compare-stat">
      <span class="compare-stat__label">Game win %</span>
      <span class="compare-stat__value compare-stat__value--game">${formatPct(analysis.overallWinrate)}</span>
      <span class="compare-stat__sub">${analysis.totalWins}W · ${analysis.totalLosses}L</span>
    </div>
    <div class="compare-stat">
      <span class="compare-stat__label">Game WR when lane won</span>
      <span class="compare-stat__value positive">${fmt(analysis.gameWinWhenLaneWon)}</span>
      <span class="compare-stat__sub">Convert laning lead to wins</span>
    </div>
    <div class="compare-stat">
      <span class="compare-stat__label">Game WR when lane lost</span>
      <span class="compare-stat__value negative">${fmt(analysis.gameWinWhenLaneLost)}</span>
      <span class="compare-stat__sub">Comeback rate from behind</span>
    </div>
  `;
}

function renderPatchTable(patchRows) {
  patchTableBody.innerHTML = patchRows
    .map(
      (row) => `
      <tr>
        <td>${patchLabel(patches, row.patchId)}</td>
        <td>${row.games}</td>
        <td>${row.wins}</td>
        <td>${row.losses}</td>
        <td class="winrate-cell ${winrateClass(row.winrate)}">${formatPct(row.winrate)}</td>
        <td>${formatPct(row.wilsonLower)}</td>
        <td>${formatPct(row.wilsonUpper)}</td>
      </tr>
    `
    )
    .join("");
}

function renderParseStatusPanel(loadStats, requestParse) {
  const panel = document.getElementById("parse-status-panel");
  const desc = document.getElementById("parse-status-desc");
  const body = document.getElementById("parse-status-body");
  if (!panel || !body) return;

  const excluded = loadStats?.excludedMatches ?? [];
  const incomplete = loadStats?.incompleteMatches ?? [];
  const hasContent = requestParse && (excluded.length > 0 || incomplete.length > 0);

  panel.classList.toggle("hidden", !hasContent);
  if (!hasContent) return;

  const parts = [];
  if (incomplete.length > 0) {
    parts.push(
      `${incomplete.length} match(es) timed out without lane data — game stats are included, lane win % shows N/A for those games.`
    );
  }
  if (excluded.length > 0) {
    parts.push(
      `${excluded.length} match(es) dropped after max retries — listed below. Retry from the Tools tab.`
    );
  }
  if (desc) desc.textContent = parts.join(" ");

  const rows = [
    ...incomplete.map(
      (row) =>
        `<tr class="parse-status-row--incomplete">
          <td><a href="https://www.opendota.com/matches/${row.matchId}" target="_blank" rel="noopener">${row.matchId}</a></td>
          <td>${parseFailureLabel(row.reason)}</td>
          <td>—</td>
        </tr>`
    ),
    ...excluded.map(
      (row) =>
        `<tr>
          <td><a href="https://www.opendota.com/matches/${row.matchId}" target="_blank" rel="noopener">${row.matchId}</a></td>
          <td>${parseFailureLabel(row.reason)}</td>
          <td>${row.attempts}</td>
        </tr>`
    ),
  ];

  body.innerHTML = `<div class="table-wrap"><table class="data-table data-table--compact">
      <thead><tr><th>Match ID</th><th>Reason</th><th>Attempts</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table></div>`;
}

function renderLaneDataNote(analysis, loadStats) {
  const el = document.getElementById("lane-data-note");
  if (!el) return;

  const unknownPct = analysis.totalGames
    ? Math.round((analysis.lanePositionUnknown / analysis.totalGames) * 100)
    : 0;

  const cacheHint = loadStats
    ? " Parsed matches are saved in your browser — re-run later to parse more without redoing finished games."
    : "";

  el.textContent =
    `Lane position and lane win % need OpenDota parsed replays (lane, gold at 10 min). ` +
    `${analysis.parsedReplayCount} of ${analysis.totalGames} matches in this sample are fully parsed.` +
    cacheHint +
    (loadStats?.parseIncomplete
      ? ` ${loadStats.parseIncomplete} match(es) have game data only (parse timed out — lane stats N/A).`
      : "") +
    (loadStats?.parseExcluded
      ? ` ${loadStats.parseExcluded} match(es) excluded after max retries (see Parse status).`
      : "") +
    (analysis.lanePositionUnknown > 0
      ? ` ${analysis.lanePositionUnknown} (${unknownPct}%) have no lane assignment; those show as Unknown.`
      : " All matches in this sample have lane data.");
}

function renderLaneTable(laneRows) {
  laneTable.innerHTML = laneRows
    .filter((r) => r.games > 0)
    .map(
      (row) => `
      <div class="lane-row lane-row--dual">
        <span class="lane-row__label">${row.label}</span>
        <div class="lane-row__bars">
          <div class="lane-row__metric">
            <span class="lane-row__tag">Lane</span>
            <div class="lane-bar"><div class="lane-bar__fill lane-bar__fill--lane" style="width:${row.laneWinrate}%"></div></div>
            <span>${row.laneKnown ? formatPct(row.laneWinrate) : "N/A"}</span>
          </div>
          <div class="lane-row__metric">
            <span class="lane-row__tag">Game</span>
            <div class="lane-bar"><div class="lane-bar__fill lane-bar__fill--game" style="width:${row.gameWinrate}%"></div></div>
            <span>${formatPct(row.gameWinrate)}</span>
          </div>
        </div>
        <span class="lane-row__games">${row.games}g</span>
      </div>
    `
    )
    .join("");
}

function exportCsv(rows) {
  const headers = [
    "hero",
    "games",
    "wins",
    "losses",
    "winrate",
    "lane_games",
    "lane_wld",
    "lane_winrate",
    "wilson_lower",
    "wilson_upper",
    "avg_duration_min",
    "avg_kills",
    "avg_deaths",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        `"${r.hero.replace(/"/g, '""')}"`,
        r.games,
        r.wins,
        r.losses,
        r.winrate.toFixed(2),
        r.laneGames ?? 0,
        r.laneGames ? `${r.laneWon}-${r.laneLost}-${r.laneDraw}` : "",
        r.laneWinrate != null ? r.laneWinrate.toFixed(2) : "",
        r.wilsonLower.toFixed(2),
        r.wilsonUpper.toFixed(2),
        r.avgDuration.toFixed(2),
        r.avgKills.toFixed(2),
        r.avgDeaths.toFixed(2),
      ].join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "dota2_matchups.csv";
  link.click();
  URL.revokeObjectURL(url);
}

exportBtn.addEventListener("click", () => {
  if (lastMatchupRows.length) exportCsv(lastMatchupRows);
});

let shareToastTimer = null;

function showShareToast(message) {
  shareToast.textContent = message;
  shareToast.classList.remove("hidden");
  if (shareToastTimer) clearTimeout(shareToastTimer);
  shareToastTimer = setTimeout(() => {
    shareToast.classList.add("hidden");
  }, 2800);
}

shareBtn.addEventListener("click", async () => {
  if (!resolveHeroId() && heroSearch.value.trim()) {
    showShareToast("Pick a valid hero before sharing.");
    return;
  }

  try {
    await copyShareLink();
    showShareToast("Share link copied to clipboard.");
    shareBtn.textContent = "Copied!";
    setTimeout(() => {
      shareBtn.textContent = "Copy share link";
    }, 2000);
  } catch {
    showShareToast("Could not copy link. Copy the URL from your browser bar.");
  }
});

clearCacheBtn.addEventListener("click", async () => {
  try {
    await clearMatchCache();
    showShareToast("Local match cache cleared.");
  } catch {
    showShareToast("Could not clear match cache.");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();

  if (abortController) abortController.abort();
  abortController = new AbortController();
  const { signal } = abortController;

  const accountId = Number(document.getElementById("account-id").value);
  const heroId = resolveHeroId();
  const limit = Number(document.getElementById("match-limit").value);
  const significant = document.getElementById("significant-only").checked;
  const excludeTurbo = document.getElementById("exclude-turbo").checked;
  const requestParse = requestParseCheckbox.checked;
  const parseMaxRaw = Number(parseMaxInput.value);
  const parseParallelism = clampParseConcurrency(parseParallelismInput?.value);
  const parseParallelEnabled = parseParallelEnabledCheckbox?.checked ?? false;
  const parseRetry = parseRetryCheckbox?.checked ?? false;
  const parseMaxRetries = Math.max(0, Number(parseMaxRetriesInput?.value) || 0);
  const parseBudget = {
    remaining:
      requestParse && parseMaxRaw === 0
        ? Infinity
        : requestParse
          ? Math.max(0, parseMaxRaw)
          : 0,
  };
  const confidence = Number(document.getElementById("confidence-level").value);
  const rollingWindow = Number(document.getElementById("rolling-window").value);
  const patchValue = patchFilter.value;
  const patchId = patchValue === "" ? null : Number(patchValue);
  const selectedPatchLabel = patchId != null ? patchLabel(patches, patchId) : null;
  const laneFilters = readLaneFiltersFromDom();
  const { enabled: useStratzFallback, token: stratzToken } = readStratzSettingsFromDom();

  if (!accountId || accountId < 1) {
    showError("Enter a valid account ID.");
    return;
  }

  if (!heroId) {
    showError(
      heroes.length
        ? "Pick a hero from the list."
        : "Hero list still loading — wait a moment and try again."
    );
    return;
  }

  if (useStratzFallback && !stratzToken) {
    showError(
      "STRATZ fallback is on but no API token was found. Paste your token from stratz.com/api in Parameters (it is saved in this browser only)."
    );
    return;
  }

  const heroName = heroSearch.value.trim();
  syncUrlFromForm();
  persistSessionConfig();
  cachedAnalysisSession = null;
  fetchBtn.disabled = true;
  exportBtn.disabled = true;
  resultsEl.classList.add("hidden");
  analyzeMultiLog = analyzeMultiLog ?? initMultiActivityLog("activity-log-panel");
  analyzeMultiLog?.clear();
  analyzeMultiLog?.show();
  analyzeMultiLog?.info(`Analysis started (v${APP_VERSION})`);
  setProgress(true, 0, "Loading match list…");
  progressContext = { pct: 0, task: "loading match list" };

  try {
    const heroMap = new Map(heroes.map((h) => [h.id, h.name]));
    const loadStats = createLoadStats();
    const onRateLimitWait = (info) => {
      createRateLimitWaitHandler(loadStats, analyzeMultiLog?.overview())(info);
      const suffix = progressContext.task ? ` · ${progressContext.task}` : "";
      setProgress(true, progressContext.pct, `${formatRateLimitWaitMessage(info)}${suffix}`);
    };

    const matchListKey = buildMatchListCacheKey({
      accountId,
      heroId,
      limit,
      significant,
      patchId,
      excludeTurbo,
    });

    let matchList;
    let turboSkipped;
    const cachedList = await getCachedMatchList(matchListKey);

    if (cachedList) {
      matchList = cachedList.matches;
      turboSkipped = cachedList.turboSkipped;
      loadStats.matchListFromCache = true;
      analyzeMultiLog?.cache(`Match list from cache (${matchList.length} games)`);
      setProgress(true, 2, `Match list loaded from cache (${matchList.length} games)…`);
    } else {
      analyzeMultiLog?.fetch(`Fetching match list from OpenDota (limit ${limit})`);
      const result = await loadPlayerMatchesFiltered(
        accountId,
        heroId,
        limit,
        significant,
        patchId,
        { excludeTurbo, signal, onRateLimitWait }
      );
      matchList = result.matches;
      turboSkipped = result.turboSkipped;
      await setCachedMatchList(matchListKey, { matches: matchList, turboSkipped });
    }

    if (!matchList.length) {
      const patchMsg = selectedPatchLabel ? ` on ${selectedPatchLabel}` : "";
      showError(
        `No matches found for that account, hero, and filters${patchMsg}. ${ACCOUNT_ID_HINT}`
      );
      setProgress(false);
      fetchBtn.disabled = false;
      return;
    }

    rememberAccountFromApi(accountId, { signal }).catch(() => {});

    const total = matchList.length;
    const matchIds = matchList.map((m) => m.match_id);
    const cachedDetailsMap = await getCachedMatches(matchIds);
    const cachedCount = cachedDetailsMap.size;

    if (cachedCount > 0) {
      analyzeMultiLog?.cache(`${cachedCount}/${total} match details already cached locally`);
      setProgress(
        true,
        4,
        `${cachedCount}/${total} match details in local cache — skipping OpenDota for those…`
      );
    }

    const concurrency = requestParse
      ? getParallelConcurrency(parseParallelEnabled, parseParallelismInput, parseParallelism)
      : getParallelConcurrency(parseParallelEnabled, parseParallelismInput, 3);

    const detailsList = await loadMatchDetailsBatch({
      matchList,
      accountId,
      requestParse,
      parseBudget,
      parseRetry,
      parseMaxRetries,
      concurrency,
      signal,
      cachedDetailsMap,
      multiLog: analyzeMultiLog,
      loadStats,
      patchId,
      useStratzFallback,
      stratzToken,
      onProgress: ({ completed, total: matchTotal, matchId, hasCachedEntry, workerId }) => {
        const pct = (completed / matchTotal) * 100;
        const laneSuffix =
          concurrency > 1 && requestParse && parseParallelEnabled
            ? ` · lane ${workerId + 1}`
            : "";
        progressContext = { pct, task: `match ${completed}/${matchTotal} (ID ${matchId})` };
        setProgress(
          true,
          pct,
          hasCachedEntry
            ? `Using cache ${completed}/${matchTotal} (ID ${matchId})${laneSuffix}…`
            : `Loading ${completed}/${matchTotal} (ID ${matchId})${laneSuffix}…`
        );
      },
    });

    if (loadStats.rateLimited) {
      showError(
        "OpenDota rejected some requests (429). The app paces to 60/min automatically — wait a minute and retry."
      );
    }

    cachedAnalysisSession = {
      detailsList,
      accountId,
      heroMap,
      confidence,
      turboSkippedList: turboSkipped,
      heroName,
      rollingWindow,
      selectedPatchLabel,
      loadStats,
      requestParse,
    };

    const analysis = analyzeMatches(detailsList, accountId, heroMap, confidence, {
      turboSkippedList: turboSkipped,
      laneFilters,
    });

    renderAnalysisResults(analysis, { ...cachedAnalysisSession, laneFilters });

    analyzeMultiLog?.info(
      `Analysis complete — ${analysis.totalGames} games, ${loadStats.cacheHits} cache hits, ${loadStats.fetched} API fetches`
    );
    recordConfigIngestion();
    setProgress(false);
  } catch (error) {
    if (error.name !== "AbortError") {
      analyzeMultiLog?.warn(error.message || "Something went wrong while fetching data.");
      showError(error.message || "Something went wrong while fetching data.");
      setProgress(false);
    }
  } finally {
    fetchBtn.disabled = false;
  }
});

async function init() {
  document.getElementById("app-version").textContent = `v${APP_VERSION}`;
  initFieldTooltips();
  initMainTabs();
  initStratzTokenPersistence();
  initConfigUi();
  populateLaneFilterSelects();
  initLaneFilterListeners();
  analyzeMultiLog = initMultiActivityLog("activity-log-panel");
  initTools({
    getAnalyzeAbortSignal: () =>
      abortController && !abortController.signal.aborted ? abortController.signal : null,
  });
  initSavedAccounts({ onSelect: () => syncUrlFromForm() });

  try {
    const count = await getMatchCacheCount();
    if (count > 0) {
      clearCacheBtn.title = `${count} match(es) cached locally`;
    }
  } catch {
    // IndexedDB unavailable (private mode, etc.)
  }

  try {
    const [list, patchList] = await Promise.all([loadHeroes(), loadPatches()]);
    populateHeroes(list);
    populatePatches(patchList);

    const { hasParams, shouldAutoRun } = applyUrlParams(list);
    heroPicker.resolveHeroId({ fuzzy: true });

    const configCtx = { heroes: list, heroPicker };
    if (!hasParams) {
      const restored = restoreSessionConfigToForm(configCtx);
      heroPicker.resolveHeroId({ fuzzy: true });
      if (!restored && !document.getElementById("hero-id").value) {
        const kez = list.find((h) => h.name === "Kez");
        if (kez) heroPicker.setHeroById(kez.id);
      }
    } else if (!document.getElementById("hero-id").value) {
      const kez = list.find((h) => h.name === "Kez");
      if (kez) heroPicker.setHeroById(kez.id);
    }

    initSavedConfigs(configCtx);
    persistSessionConfig();

    const accountFromUrl = document.getElementById("account-id").value;
    if (accountFromUrl) {
      rememberAccountFromApi(Number(accountFromUrl)).catch(() => {});
    }

    if (shouldAutoRun && document.getElementById("account-id").value && resolveHeroId()) {
      form.requestSubmit();
    }
  } catch (error) {
    showError(`Could not load hero list: ${error.message}`);
    fetchBtn.disabled = true;
  }
}

init();

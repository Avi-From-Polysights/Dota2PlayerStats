import {
  loadHeroes,
  loadMatchDetails,
  loadPlayerMatchesFiltered,
} from "./api.js";
import {
  buildMatchListCacheKey,
  clearMatchCache,
  getCachedMatchList,
  getCachedMatches,
  getMatchCacheCount,
  setCachedMatch,
  setCachedMatchList,
} from "./match-cache.js";
import {
  initSavedAccounts,
  rememberAccountFromApi,
} from "./saved-accounts.js";
import { ensureMatchParsed, isMatchParsedForPlayer } from "./parse.js";
import { initActivityLog } from "./activity-log.js";
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

const form = document.getElementById("stats-form");
const heroSearch = document.getElementById("hero-search");
const heroIdInput = document.getElementById("hero-id");
const heroList = document.getElementById("hero-list");
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
const clearCacheBtn = document.getElementById("clear-cache-btn");

const ACCOUNT_ID_HINT =
  "Check your Account ID on OpenDota: search your Steam name, open your profile, and copy the number from the URL (opendota.com/players/123456789). Use that ID, not Steam ID64.";
let patches = [];
let heroes = [];
let heroByName = new Map();
let lastMatchupRows = [];
let sortState = { key: "games", dir: "desc" };
let abortController = null;
let progressContext = { pct: 0, task: "" };
let activityLog = null;

function formatParseProgress(matchIndex, total, matchId, meta = {}) {
  const label = `${matchIndex + 1}/${total}`;
  const elapsed = meta.elapsedSec ?? Math.round((meta.elapsedMs ?? 0) / 1000);

  switch (meta.phase) {
    case "initial-wait":
      return `OpenDota processing replay ${label} (${elapsed}s, first check soon)…`;
    case "poll-wait":
      return `Waiting for parse ${label} — ${elapsed}s elapsed (ID ${matchId})…`;
    case "poll-error":
      return `Parse check failed ${label} (${elapsed}s) — retrying…`;
    case "done":
      return `Parse complete ${label} in ${elapsed}s (ID ${matchId})`;
    case "timeout":
      return `Parse timed out ${label} after ${elapsed}s (ID ${matchId})`;
    default:
      return `Waiting for OpenDota parse ${label} — ${elapsed}s (ID ${matchId})…`;
  }
}

function createRateLimitWaitHandler(loadStats, log) {
  return (info) => {
    loadStats.throttlePauses += 1;
    const msg = formatRateLimitWaitMessage(info);
    log?.wait(msg);
    const suffix = progressContext.task ? ` · ${progressContext.task}` : "";
    setProgress(true, progressContext.pct, `${msg}${suffix}`);
  };
}

async function resolveMatchDetails(
  matchId,
  accountId,
  {
    signal,
    requestParse,
    parseBudget,
    loadStats,
    matchIndex,
    total,
    setProgressText,
    onRateLimitWait,
    cachedDetails = null,
    hasCachedEntry = false,
    log,
  }
) {
  let details = hasCachedEntry ? cachedDetails : null;
  let usedNetwork = false;

  if (hasCachedEntry) {
    loadStats.cacheHits += 1;
    log?.cache(`Match ${matchId} loaded from local cache`);
  } else {
    log?.fetch(`Fetching match ${matchId} from OpenDota`);
    details = await loadMatchDetails(matchId, signal, { onRateLimitWait });
    loadStats.fetched += 1;
    usedNetwork = true;
  }

  const alreadyParsed = details && isMatchParsedForPlayer(details, accountId);
  const shouldParse =
    requestParse &&
    details &&
    !alreadyParsed &&
    (parseBudget.remaining === Infinity || parseBudget.remaining > 0);

  if (shouldParse) {
    loadStats.parseQueued += 1;
    if (parseBudget.remaining !== Infinity) parseBudget.remaining -= 1;
    usedNetwork = true;

    setProgressText(
      `Parsing match ${matchIndex + 1} of ${total} (ID ${matchId}) — OpenDota queue…`
    );
    log?.parse(`Starting parse for match ${matchId} (${matchIndex + 1}/${total})`);

    try {
      details = await ensureMatchParsed(matchId, accountId, {
        signal,
        initialDetails: details,
        onRateLimitWait,
        onLog: (message) => log?.parse(message),
        onPoll: (_details, meta) => {
          setProgressText(
            formatParseProgress(matchIndex, total, matchId, meta)
          );
        },
      });

      if (isMatchParsedForPlayer(details, accountId)) loadStats.newlyParsed += 1;
      else loadStats.parseTimedOut += 1;
    } catch (error) {
      loadStats.parseFailed += 1;
      if (error?.rateLimited) loadStats.rateLimited += 1;
    }
  } else if (details && !alreadyParsed) {
    loadStats.unparsed += 1;
  }

  if (details) {
    await setCachedMatch(matchId, details);
  }

  return { details, usedNetwork };
}

function formatLoadStats(loadStats) {
  const parts = [];
  if (loadStats.matchListFromCache) parts.push("match list from cache");
  if (loadStats.cacheHits) parts.push(`${loadStats.cacheHits} from cache`);
  if (loadStats.fetched) parts.push(`${loadStats.fetched} from OpenDota`);
  if (loadStats.newlyParsed) parts.push(`${loadStats.newlyParsed} newly parsed`);
  if (loadStats.parseFailed) parts.push(`${loadStats.parseFailed} parse failed`);
  if (loadStats.throttlePauses) {
    parts.push(`${loadStats.throttlePauses} rate-limit pause(s)`);
  }
  if (loadStats.rateLimited) parts.push("some requests rejected (429)");
  if (loadStats.unparsed) parts.push(`${loadStats.unparsed} still unparsed`);
  return parts.length ? parts.join(" · ") : "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  heroByName = new Map(list.map((h) => [h.name.toLowerCase(), h]));
  heroList.innerHTML = list.map((h) => `<option value="${h.name}"></option>`).join("");
}

function resolveHeroId() {
  const query = heroSearch.value.trim().toLowerCase();
  const hero = heroByName.get(query);
  if (hero) {
    heroIdInput.value = String(hero.id);
    return hero.id;
  }
  return null;
}

heroSearch.addEventListener("input", resolveHeroId);

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

function renderSummary(analysis, heroName, trend, rollingWindow, selectedPatchLabel, loadStats) {
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
      <div class="summary-card__sub">${analysis.processed} processed · ${analysis.skipped} skipped${analysis.turboSkipped ? ` · ${analysis.turboSkipped} turbo excluded` : ""}${loadNote ? ` · ${loadNote}` : ""}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">Recent trend</div>
      <div class="summary-card__value ${trendClass}">${trendLabels[trend]}</div>
      <div class="summary-card__sub">${rollingWindow}-match rolling window</div>
    </div>
  `;
}

function winrateClass(value) {
  if (value >= 55) return "winrate-good";
  if (value <= 45) return "winrate-bad";
  return "";
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
  const delayMs = Number(document.getElementById("request-delay").value);
  const significant = document.getElementById("significant-only").checked;
  const excludeTurbo = document.getElementById("exclude-turbo").checked;
  const requestParse = requestParseCheckbox.checked;
  const parseMaxRaw = Number(parseMaxInput.value);
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

  if (!accountId || accountId < 1) {
    showError("Enter a valid account ID.");
    return;
  }

  if (!heroId) {
    showError("Pick a hero from the list.");
    return;
  }

  const heroName = heroSearch.value.trim();
  syncUrlFromForm();
  fetchBtn.disabled = true;
  exportBtn.disabled = true;
  resultsEl.classList.add("hidden");
  activityLog = initActivityLog();
  activityLog?.clear();
  activityLog?.show();
  activityLog?.info(`Analysis started (v${APP_VERSION})`);
  setProgress(true, 0, "Loading match list…");
  progressContext = { pct: 0, task: "loading match list" };

  try {
    const heroMap = new Map(heroes.map((h) => [h.id, h.name]));
    const loadStats = {
      cacheHits: 0,
      fetched: 0,
      parseQueued: 0,
      newlyParsed: 0,
      parseTimedOut: 0,
      parseFailed: 0,
      rateLimited: 0,
      throttlePauses: 0,
      unparsed: 0,
      matchListFromCache: false,
    };
    const onRateLimitWait = createRateLimitWaitHandler(loadStats, activityLog);

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
      activityLog?.cache(`Match list from cache (${matchList.length} games)`);
      setProgress(true, 2, `Match list loaded from cache (${matchList.length} games)…`);
    } else {
      activityLog?.fetch(`Fetching match list from OpenDota (limit ${limit})`);
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

    const detailsList = [];
    const total = matchList.length;
    const matchIds = matchList.map((m) => m.match_id);
    const cachedDetailsMap = await getCachedMatches(matchIds);
    const cachedCount = cachedDetailsMap.size;

    if (cachedCount > 0) {
      activityLog?.cache(`${cachedCount}/${total} match details already cached locally`);
      setProgress(
        true,
        4,
        `${cachedCount}/${total} match details in local cache — skipping OpenDota for those…`
      );
    }

    for (let i = 0; i < total; i += 1) {
      if (signal.aborted) return;

      const matchId = matchList[i].match_id;
      const numericId = Number(matchId);
      const hasCachedEntry = cachedDetailsMap.has(numericId);
      const pct = ((i + 1) / total) * 100;
      progressContext = {
        pct,
        task: `match ${i + 1}/${total} (ID ${matchId})`,
      };
      setProgress(
        true,
        pct,
        hasCachedEntry
          ? `Using cache ${i + 1}/${total} (ID ${matchId})…`
          : `Fetching from OpenDota ${i + 1}/${total} (ID ${matchId})…`
      );

      try {
        const { details, usedNetwork } = await resolveMatchDetails(matchId, accountId, {
          signal,
          requestParse,
          parseBudget,
          loadStats,
          matchIndex: i,
          total,
          onRateLimitWait,
          cachedDetails: cachedDetailsMap.get(numericId) ?? null,
          hasCachedEntry,
          log: activityLog,
          setProgressText: (text) => {
            progressContext.task = `match ${i + 1}/${total} (ID ${matchId})`;
            setProgress(true, pct, text);
          },
        });

        if (patchId != null && details?.patch != null && details.patch !== patchId) {
          detailsList.push(null);
        } else {
          detailsList.push(details);
        }

        if (usedNetwork && delayMs > 0 && i < total - 1) {
          await sleep(requestParse ? Math.max(delayMs, 400) : delayMs);
        }
      } catch (error) {
        if (error?.rateLimited) loadStats.rateLimited += 1;
        detailsList.push(null);
      }
    }

    if (loadStats.rateLimited) {
      showError(
        "OpenDota rejected some requests (429). The app paces to 60/min automatically — wait a minute and retry."
      );
    }

    const analysis = analyzeMatches(detailsList, accountId, heroMap, confidence, {
      turboSkippedList: turboSkipped,
    });
    const rolling = rollingWinRate(analysis.timeline, rollingWindow);
    const laneVsGameRolling = rollingLaneVsGame(analysis.timeline, rollingWindow);
    const trend = trendDirection(rolling);

    renderSummary(analysis, heroName, trend, rollingWindow, selectedPatchLabel, loadStats);
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
    activityLog?.info(
      `Analysis complete — ${analysis.totalGames} games, ${loadStats.cacheHits} cache hits, ${loadStats.fetched} API fetches`
    );
    exportBtn.disabled = false;
    setProgress(false);
  } catch (error) {
    if (error.name !== "AbortError") {
      activityLog?.warn(error.message || "Something went wrong while fetching data.");
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
    const accountFromUrl = document.getElementById("account-id").value;
    if (accountFromUrl) {
      rememberAccountFromApi(Number(accountFromUrl)).catch(() => {});
    }

    if (!hasParams) {
      const kez = list.find((h) => h.name === "Kez");
      if (kez) {
        heroSearch.value = kez.name;
        heroIdInput.value = String(kez.id);
      }
    }

    if (shouldAutoRun && document.getElementById("account-id").value && resolveHeroId()) {
      form.requestSubmit();
    }
  } catch (error) {
    showError(`Could not load hero list: ${error.message}`);
  }
}

init();

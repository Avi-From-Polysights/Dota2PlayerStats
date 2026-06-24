import {
  loadHeroes,
  loadMatchDetails,
  loadPlayerMatches,
} from "./api.js";
import {
  loadPatches,
  patchLabel,
  recentPatches,
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

const ACCOUNT_ID_HINT =
  "Check your Account ID on OpenDota: search your Steam name, open your profile, and copy the number from the URL (opendota.com/players/123456789). Use that ID, not Steam ID64.";
let patches = [];
let heroByName = new Map();
let lastMatchupRows = [];
let sortState = { key: "games", dir: "desc" };
let abortController = null;

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
  const options = recentPatches(list)
    .map(
      (p) =>
        `<option value="${p.id}">${p.name}</option>`
    )
    .join("");
  patchFilter.innerHTML = `<option value="">All patches</option>${options}`;
}

function renderSummary(analysis, heroName, trend, rollingWindow, selectedPatchLabel) {
  const trendLabels = {
    improving: "Trending up",
    declining: "Trending down",
    stable: "Holding steady",
    insufficient: "Need more matches",
  };

  const trendClass =
    trend === "improving" ? "positive" : trend === "declining" ? "negative" : "";

  const laneDataNote =
    analysis.laneDecided > 0
      ? `${analysis.laneDecided} with lane data · ${analysis.laneUnknown} unknown`
      : "No parsed replay lane data";

  const patchNote = selectedPatchLabel
    ? `Filtered to ${selectedPatchLabel}`
    : `${analysis.patchRows.length} patch(es) in sample`;

  summaryCards.innerHTML = `
    <div class="summary-card">
      <div class="summary-card__label">Game win rate</div>
      <div class="summary-card__value ${analysis.overallWinrate >= 50 ? "positive" : "negative"}">${formatPct(analysis.overallWinrate)}</div>
      <div class="summary-card__sub">Wilson ${formatCi(analysis.overallCi.lower, analysis.overallCi.upper)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">Lane win rate</div>
      <div class="summary-card__value ${analysis.overallLaneWinrate >= 50 ? "positive" : "negative"}">${analysis.laneDecided ? formatPct(analysis.overallLaneWinrate) : "N/A"}</div>
      <div class="summary-card__sub">${analysis.laneDecided ? `Wilson ${formatCi(analysis.overallLaneCi.lower, analysis.overallLaneCi.upper)}` : laneDataNote}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">Record</div>
      <div class="summary-card__value">${analysis.totalWins}W / ${analysis.totalLosses}L</div>
      <div class="summary-card__sub">${analysis.totalGames} matches · ${patchNote}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">Hero</div>
      <div class="summary-card__value" style="font-size:1.35rem">${heroName}</div>
      <div class="summary-card__sub">${analysis.processed} processed · ${analysis.skipped} skipped</div>
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
  fetchBtn.disabled = true;
  exportBtn.disabled = true;
  resultsEl.classList.add("hidden");
  setProgress(true, 0, "Loading match list…");

  try {
    const heroMap = new Map(heroes.map((h) => [h.id, h.name]));
    const matchList = await loadPlayerMatches(
      accountId,
      heroId,
      limit,
      significant,
      patchId
    );

    if (!matchList.length) {
      const patchMsg = selectedPatchLabel ? ` on ${selectedPatchLabel}` : "";
      showError(
        `No matches found for that account, hero, and filters${patchMsg}. ${ACCOUNT_ID_HINT}`
      );
      setProgress(false);
      fetchBtn.disabled = false;
      return;
    }

    const detailsList = [];
    const total = matchList.length;

    for (let i = 0; i < total; i += 1) {
      if (signal.aborted) return;

      const matchId = matchList[i].match_id;
      setProgress(
        true,
        ((i + 1) / total) * 100,
        `Fetching match ${i + 1} of ${total} (ID ${matchId})…`
      );

      try {
        const details = await loadMatchDetails(matchId, signal);
        if (patchId != null && details?.patch != null && details.patch !== patchId) {
          detailsList.push(null);
        } else {
          detailsList.push(details);
        }
      } catch {
        detailsList.push(null);
      }

      if (delayMs > 0 && i < total - 1) await sleep(delayMs);
    }

    const analysis = analyzeMatches(detailsList, accountId, heroMap, confidence);
    const rolling = rollingWinRate(analysis.timeline, rollingWindow);
    const laneVsGameRolling = rollingLaneVsGame(analysis.timeline, rollingWindow);
    const trend = trendDirection(rolling);

    renderSummary(analysis, heroName, trend, rollingWindow, selectedPatchLabel);
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

    const showPatchBreakdown =
      !selectedPatchLabel && analysis.patchRows.length > 0;
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
    setProgress(false);
  } catch (error) {
    if (error.name !== "AbortError") {
      showError(error.message || "Something went wrong while fetching data.");
      setProgress(false);
    }
  } finally {
    fetchBtn.disabled = false;
  }
});

async function init() {
  try {
    const [list, patchList] = await Promise.all([loadHeroes(), loadPatches()]);
    populateHeroes(list);
    populatePatches(patchList);

    const kez = list.find((h) => h.name === "Kez");
    if (kez) {
      heroSearch.value = kez.name;
      heroIdInput.value = String(kez.id);
    }
  } catch (error) {
    showError(`Could not load hero list: ${error.message}`);
  }
}

init();

import { aggregateAllHeroStats, filterHeroRows } from "./all-heroes-stats.js";
import { renderAllHeroesBarChart, renderAllHeroesCompareChart } from "./charts.js";
import { getCachedMatchesForAccount } from "./match-cache.js";
import { formatPct } from "./wilson.js";

function winrateClass(value) {
  if (value >= 55) return "winrate-good";
  if (value <= 45) return "winrate-bad";
  return "";
}

function sortHeroRows(rows, key, dir) {
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

function exportHeroCsv(rows) {
  const header = [
    "Hero",
    "Games",
    "Wins",
    "Losses",
    "Win %",
    "Lane W-L-D",
    "Lane win %",
    "Wilson low",
    "Wilson high",
    "Avg K",
    "Avg D",
    "Avg duration min",
  ];
  const lines = rows.map((r) =>
    [
      r.hero,
      r.games,
      r.wins,
      r.losses,
      r.winrate.toFixed(1),
      r.laneRecord,
      r.laneWinrate != null ? r.laneWinrate.toFixed(1) : "",
      r.wilsonLower.toFixed(1),
      r.wilsonUpper.toFixed(1),
      r.avgKills.toFixed(1),
      r.avgDeaths.toFixed(1),
      r.avgDuration.toFixed(1),
    ].join(",")
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "all-heroes-stats.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {{ heroes: { id: number, name: string }[], getDefaultAccountId?: () => string | number | null }} ctx
 */
export function initAllHeroes(ctx) {
  const form = document.getElementById("all-heroes-form");
  const accountInput = document.getElementById("all-heroes-account-id");
  const loadBtn = document.getElementById("all-heroes-load");
  const exportBtn = document.getElementById("all-heroes-export");
  const statusEl = document.getElementById("all-heroes-status");
  const summaryEl = document.getElementById("all-heroes-summary");
  const resultsEl = document.getElementById("all-heroes-results");
  const tableBody = document.querySelector("#all-heroes-table tbody");
  const tableHeaders = document.querySelectorAll("#all-heroes-table th[data-sort]");
  const barCanvas = document.getElementById("all-heroes-bar-chart");
  const compareCanvas = document.getElementById("all-heroes-compare-chart");
  const chartMetric = document.getElementById("all-heroes-chart-metric");
  const chartLimit = document.getElementById("all-heroes-chart-limit");

  if (!form || !accountInput || !loadBtn) return;

  const heroNames = new Map(ctx.heroes.map((h) => [h.id, h.name]));

  let rawRows = [];
  let filteredRows = [];
  let lastMeta = null;
  let sortState = { key: "winrate", dir: "desc" };
  let loaded = false;

  const readFilters = () => ({
    accountId: Number(accountInput.value),
    excludeTurbo: document.getElementById("all-heroes-exclude-turbo")?.checked ?? true,
    rankedOnly: document.getElementById("all-heroes-ranked-only")?.checked ?? false,
    minGames: Number(document.getElementById("all-heroes-min-games")?.value) || 1,
    confidence: Number(document.getElementById("all-heroes-confidence")?.value) || 0.95,
    chartMetric: chartMetric?.value ?? "winrate",
    chartLimit: Number(chartLimit?.value) || 15,
  });

  const setStatus = (text, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle("all-heroes-status--error", isError);
  };

  const renderSummary = (agg, visible) => {
    if (!summaryEl) return;
    const bestWin = [...visible].sort((a, b) => b.winrate - a.winrate)[0];
    const bestLane = [...visible]
      .filter((r) => r.laneWinrate != null)
      .sort((a, b) => (b.laneWinrate ?? 0) - (a.laneWinrate ?? 0))[0];
    const mostPlayed = [...visible].sort((a, b) => b.games - a.games)[0];
    const overallWinrate = agg.totalGames ? (agg.totalWins / agg.totalGames) * 100 : 0;

    summaryEl.innerHTML = `
      <div class="summary-card">
        <div class="summary-card__label">Heroes in cache</div>
        <div class="summary-card__value">${agg.heroCount}</div>
        <div class="summary-card__sub">${agg.scanned} cached matches scanned</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label">Total games</div>
        <div class="summary-card__value">${agg.totalGames}</div>
        <div class="summary-card__sub">${formatPct(overallWinrate)} overall win rate</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label">Best win rate</div>
        <div class="summary-card__value ${bestWin && bestWin.winrate >= 50 ? "positive" : ""}">${bestWin ? formatPct(bestWin.winrate) : "—"}</div>
        <div class="summary-card__sub">${bestWin ? `${bestWin.hero} · ${bestWin.games} games` : "Need data"}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label">Best lane rate</div>
        <div class="summary-card__value ${bestLane && bestLane.laneWinrate >= 50 ? "positive" : ""}">${bestLane ? formatPct(bestLane.laneWinrate) : "—"}</div>
        <div class="summary-card__sub">${bestLane ? `${bestLane.hero} · ${bestLane.laneDecided} lane outcomes` : "Need parsed lane data"}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label">Most played</div>
        <div class="summary-card__value" style="font-size:1.2rem">${mostPlayed?.hero ?? "—"}</div>
        <div class="summary-card__sub">${mostPlayed ? `${mostPlayed.games} games · ${mostPlayed.wins}W-${mostPlayed.losses}L` : ""}</div>
      </div>
    `;
  };

  const renderTable = (rows) => {
    if (!tableBody) return;
    tableBody.innerHTML = rows
      .map(
        (row) => `
      <tr>
        <td>${row.hero}</td>
        <td>${row.games}</td>
        <td>${row.wins}</td>
        <td>${row.losses}</td>
        <td class="winrate-cell ${winrateClass(row.winrate)}">${formatPct(row.winrate)}</td>
        <td>${row.laneRecord}</td>
        <td class="winrate-cell ${row.laneWinrate != null ? winrateClass(row.laneWinrate) : ""}">${row.laneWinrate != null ? formatPct(row.laneWinrate) : "—"}</td>
        <td>${formatPct(row.wilsonLower)}</td>
        <td>${formatPct(row.wilsonUpper)}</td>
        <td>${row.parsedReplayCount}/${row.games}</td>
        <td>${row.avgKills.toFixed(1)}</td>
        <td>${row.avgDeaths.toFixed(1)}</td>
      </tr>
    `
      )
      .join("");

    tableHeaders.forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.sort === sortState.key) {
        th.classList.add(sortState.dir === "asc" ? "sorted-asc" : "sorted-desc");
      }
    });
  };

  const renderCharts = (rows, filters) => {
    if (barCanvas) {
      renderAllHeroesBarChart(barCanvas, rows, {
        metric: filters.chartMetric,
        limit: filters.chartLimit,
      });
    }
    if (compareCanvas) {
      renderAllHeroesCompareChart(compareCanvas, rows, { limit: filters.chartLimit });
    }
  };

  const applyFilters = () => {
    if (!loaded || !lastMeta) return;
    const filters = readFilters();
    filteredRows = filterHeroRows(rawRows, { minGames: filters.minGames });
    filteredRows = sortHeroRows(filteredRows, sortState.key, sortState.dir);
    renderSummary(lastMeta, filteredRows);
    renderTable(filteredRows);
    renderCharts(filteredRows, filters);
    exportBtn.disabled = filteredRows.length === 0;

    const skipNotes = [
      lastMeta.turboSkipped ? `${lastMeta.turboSkipped} turbo skipped` : "",
      lastMeta.rankedSkipped ? `${lastMeta.rankedSkipped} non-ranked skipped` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    setStatus(
      `${filteredRows.length} hero(es) with ≥${filters.minGames} game(s)${skipNotes ? ` · ${skipNotes}` : ""}`
    );
    resultsEl?.classList.remove("hidden");
  };

  const loadFromCache = async () => {
    const filters = readFilters();
    if (!filters.accountId) {
      setStatus("Enter a valid account ID.", true);
      return;
    }

    loadBtn.disabled = true;
    setStatus("Loading cached matches…");

    try {
      const matches = await getCachedMatchesForAccount(filters.accountId);
      if (!matches.length) {
        rawRows = [];
        lastMeta = null;
        loaded = false;
        resultsEl?.classList.add("hidden");
        exportBtn.disabled = true;
        setStatus(
          "No cached matches for this account. Run Analyze or Parse-all on other tabs first.",
          true
        );
        return;
      }

      const agg = aggregateAllHeroStats(
        matches,
        filters.accountId,
        heroNames,
        filters.confidence,
        { excludeTurbo: filters.excludeTurbo, rankedOnly: filters.rankedOnly }
      );

      rawRows = agg.rows;
      lastMeta = agg;
      loaded = true;
      applyFilters();
    } catch (error) {
      setStatus(error.message || "Could not read match cache.", true);
    } finally {
      loadBtn.disabled = false;
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    loadFromCache();
  });

  for (const id of [
    "all-heroes-exclude-turbo",
    "all-heroes-ranked-only",
    "all-heroes-min-games",
    "all-heroes-confidence",
    "all-heroes-chart-metric",
    "all-heroes-chart-limit",
  ]) {
    document.getElementById(id)?.addEventListener("change", () => {
      if (!loaded) return;
      const filters = readFilters();
      if (id === "all-heroes-confidence" || id.startsWith("all-heroes-exclude") || id.includes("ranked")) {
        loadFromCache();
      } else {
        applyFilters();
      }
    });
  }

  tableHeaders.forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (sortState.key === key) {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      } else {
        sortState.key = key;
        sortState.dir = key === "hero" ? "asc" : "desc";
      }
      applyFilters();
    });
  });

  exportBtn?.addEventListener("click", () => exportHeroCsv(filteredRows));

  const defaultAccount = ctx.getDefaultAccountId?.();
  if (defaultAccount && !accountInput.value) {
    accountInput.value = String(defaultAccount);
  }

  document.querySelector('.main-tabs__tab[data-tab="all-heroes"]')?.addEventListener("click", () => {
    const fromAnalyze = document.getElementById("account-id")?.value;
    if (fromAnalyze && !accountInput.value) {
      accountInput.value = fromAnalyze;
    }
  });
}

const CHART = {
  muted: "#7d7d7d",
  tertiary: "#9a9a9a",
  grid: "rgba(255, 255, 255, 0.06)",
  primary: "#42d68c",
  accent: "#155dfc",
  destructive: "#ff6467",
  popover: "#212121",
};

let winrateChart = null;
let laneChart = null;
let laneVsGameChart = null;
let allHeroesBarChart = null;
let allHeroesCompareChart = null;

function destroyChart(chart) {
  if (chart) chart.destroy();
}

function chartFont() {
  return {
    family: "Inter, system-ui, sans-serif",
    size: 11,
    weight: "432",
  };
}

function baseScaleOptions() {
  return {
    x: {
      ticks: {
        color: CHART.muted,
        maxTicksLimit: 12,
        font: chartFont(),
      },
      grid: { color: CHART.grid },
      border: { display: false },
    },
    y: {
      min: 0,
      max: 100,
      ticks: {
        color: CHART.muted,
        callback: (v) => `${v}%`,
        font: chartFont(),
      },
      grid: { color: CHART.grid },
      border: { display: false },
    },
  };
}

function baseLegend() {
  return {
    labels: {
      color: CHART.tertiary,
      boxWidth: 10,
      boxHeight: 2,
      padding: 14,
      font: chartFont(),
    },
  };
}

function baseTooltip() {
  return {
    backgroundColor: CHART.popover,
    titleColor: "#ffffff",
    bodyColor: CHART.tertiary,
    borderColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    padding: 10,
    cornerRadius: 4,
    titleFont: { ...chartFont(), weight: "600" },
    bodyFont: chartFont(),
  };
}

export function renderWinrateChart(canvas, points, overallWinrate) {
  destroyChart(winrateChart);

  winrateChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: points.map((p) =>
        p.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      ),
      datasets: [
        {
          label: "Rolling game win %",
          data: points.map((p) => p.winrate),
          borderColor: CHART.accent,
          backgroundColor: "rgba(21, 93, 252, 0.1)",
          fill: true,
          tension: 0.35,
          pointRadius: points.length > 80 ? 0 : 2,
          pointHoverRadius: 4,
          borderWidth: 2,
        },
        {
          label: "Overall game win %",
          data: points.map(() => overallWinrate),
          borderColor: CHART.tertiary,
          borderDash: [5, 4],
          pointRadius: 0,
          fill: false,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: baseLegend(),
        tooltip: {
          ...baseTooltip(),
          callbacks: {
            afterTitle(items) {
              const idx = items[0]?.dataIndex;
              if (idx == null) return "";
              const p = points[idx];
              return `Match #${p.index} · window ${p.windowSize}`;
            },
          },
        },
      },
      scales: baseScaleOptions(),
    },
  });

  return winrateChart;
}

export function renderLaneVsGameChart(canvas, points, overallLane, overallGame) {
  destroyChart(laneVsGameChart);

  laneVsGameChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: points.map((p) =>
        p.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      ),
      datasets: [
        {
          label: "Rolling lane win %",
          data: points.map((p) => p.laneWinrate),
          borderColor: CHART.primary,
          backgroundColor: "rgba(66, 214, 140, 0.1)",
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: points.length > 60 ? 0 : 2,
          pointHoverRadius: 4,
          borderWidth: 2,
        },
        {
          label: "Rolling game win %",
          data: points.map((p) => p.gameWinrate),
          borderColor: CHART.accent,
          backgroundColor: "transparent",
          fill: false,
          tension: 0.35,
          pointRadius: points.length > 60 ? 0 : 2,
          pointHoverRadius: 4,
          borderWidth: 2,
        },
        {
          label: "Overall lane win %",
          data: points.map(() => overallLane),
          borderColor: CHART.primary,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          borderWidth: 1,
        },
        {
          label: "Overall game win %",
          data: points.map(() => overallGame),
          borderColor: CHART.tertiary,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: baseLegend(),
        tooltip: {
          ...baseTooltip(),
          callbacks: {
            afterTitle(items) {
              const idx = items[0]?.dataIndex;
              if (idx == null) return "";
              const p = points[idx];
              return `Match #${p.index} · lane data in ${p.laneSample}/${p.windowSize} matches`;
            },
          },
        },
      },
      scales: baseScaleOptions(),
    },
  });

  return laneVsGameChart;
}

export function renderLaneChart(canvas, laneRows) {
  destroyChart(laneChart);

  const filtered = laneRows.filter(
    (r) => r.games > 0 && r.laneKnown > 0 && r.lane !== 0
  );

  laneChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: filtered.map((r) => r.label),
      datasets: [
        {
          label: "Lane win %",
          data: filtered.map((r) => r.laneWinrate),
          backgroundColor: "rgba(66, 214, 140, 0.85)",
          borderRadius: 3,
          barThickness: 10,
        },
        {
          label: "Game win %",
          data: filtered.map((r) => r.gameWinrate),
          backgroundColor: "rgba(21, 93, 252, 0.85)",
          borderRadius: 3,
          barThickness: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: baseLegend(),
        tooltip: {
          ...baseTooltip(),
          callbacks: {
            afterBody(ctx) {
              const row = filtered[ctx[0].dataIndex];
              return [
                `Lane: ${row.laneWon}W / ${row.laneLost}L / ${row.laneDraw}D`,
                `Game: ${row.wins}W / ${row.losses}L`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: CHART.muted,
            font: chartFont(),
          },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color: CHART.muted,
            callback: (v) => `${v}%`,
            font: chartFont(),
          },
          grid: { color: CHART.grid },
          border: { display: false },
        },
      },
    },
  });

  return laneChart;
}

function horizontalBarScale() {
  return {
    x: {
      min: 0,
      max: 100,
      ticks: {
        color: CHART.muted,
        callback: (v) => `${v}%`,
        font: chartFont(),
      },
      grid: { color: CHART.grid },
      border: { display: false },
    },
    y: {
      ticks: {
        color: CHART.muted,
        font: chartFont(),
      },
      grid: { display: false },
      border: { display: false },
    },
  };
}

/**
 * Horizontal bar chart for top heroes by win rate, lane rate, or games.
 * @param {HTMLCanvasElement} canvas
 * @param {object[]} rows filtered hero rows
 * @param {{ metric?: 'winrate' | 'laneWinrate' | 'games', limit?: number }} [options]
 */
export function renderAllHeroesBarChart(canvas, rows, { metric = "winrate", limit = 15 } = {}) {
  destroyChart(allHeroesBarChart);

  let sorted = [...rows];
  if (metric === "games") {
    sorted.sort((a, b) => b.games - a.games);
  } else if (metric === "laneWinrate") {
    sorted = sorted.filter((r) => r.laneWinrate != null);
    sorted.sort((a, b) => (b.laneWinrate ?? 0) - (a.laneWinrate ?? 0));
  } else {
    sorted.sort((a, b) => b.winrate - a.winrate);
  }

  const top = sorted.slice(0, Math.max(1, limit)).reverse();
  const labels = top.map((r) => r.hero);
  const isGames = metric === "games";
  const data = top.map((r) => {
    if (metric === "games") return r.games;
    if (metric === "laneWinrate") return r.laneWinrate;
    return r.winrate;
  });

  const label =
    metric === "games" ? "Games played" : metric === "laneWinrate" ? "Lane win %" : "Game win %";

  allHeroesBarChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label,
          data,
          backgroundColor:
            metric === "laneWinrate"
              ? "rgba(66, 214, 140, 0.85)"
              : metric === "games"
                ? "rgba(154, 154, 154, 0.85)"
                : "rgba(21, 93, 252, 0.85)",
          borderRadius: 3,
          barThickness: 14,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...baseTooltip(),
          callbacks: {
            label(ctx) {
              const row = top[ctx.dataIndex];
              if (metric === "games") return `${row.games} games · ${row.wins}W-${row.losses}L`;
              if (metric === "laneWinrate") {
                return `${row.laneWinrate?.toFixed(1)}% lane (${row.laneRecord})`;
              }
              return `${row.winrate.toFixed(1)}% game (${row.wins}W-${row.losses}L)`;
            },
          },
        },
      },
      scales: isGames
        ? {
            x: {
              min: 0,
              ticks: { color: CHART.muted, font: chartFont() },
              grid: { color: CHART.grid },
              border: { display: false },
            },
            y: {
              ticks: { color: CHART.muted, font: chartFont() },
              grid: { display: false },
              border: { display: false },
            },
          }
        : horizontalBarScale(),
    },
  });

  return allHeroesBarChart;
}

/** Grouped bar chart comparing game vs lane win % per hero. */
export function renderAllHeroesCompareChart(canvas, rows, { limit = 12 } = {}) {
  destroyChart(allHeroesCompareChart);

  const eligible = rows
    .filter((r) => r.laneWinrate != null && r.laneDecided >= 3)
    .sort((a, b) => b.games - a.games)
    .slice(0, Math.max(1, limit));

  allHeroesCompareChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: eligible.map((r) => r.hero),
      datasets: [
        {
          label: "Game win %",
          data: eligible.map((r) => r.winrate),
          backgroundColor: "rgba(21, 93, 252, 0.85)",
          borderRadius: 3,
          barThickness: 10,
        },
        {
          label: "Lane win %",
          data: eligible.map((r) => r.laneWinrate),
          backgroundColor: "rgba(66, 214, 140, 0.85)",
          borderRadius: 3,
          barThickness: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: baseLegend(),
        tooltip: {
          ...baseTooltip(),
          callbacks: {
            afterBody(ctx) {
              const row = eligible[ctx[0].dataIndex];
              return [`${row.games} games · lane ${row.laneRecord}`];
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: CHART.muted,
            font: chartFont(),
            maxRotation: 45,
            minRotation: 45,
          },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color: CHART.muted,
            callback: (v) => `${v}%`,
            font: chartFont(),
          },
          grid: { color: CHART.grid },
          border: { display: false },
        },
      },
    },
  });

  return allHeroesCompareChart;
}

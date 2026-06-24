const CHART_DEFAULTS = {
  color: "#8b9bb0",
  grid: "rgba(255,255,255,0.06)",
  radiant: "#7cb342",
  dire: "#e53935",
  accent: "#3d8fd1",
  gold: "#d4a843",
  lane: "#26a69a",
};

let winrateChart = null;
let laneChart = null;
let laneVsGameChart = null;

function destroyChart(chart) {
  if (chart) chart.destroy();
}

function baseScaleOptions() {
  return {
    x: {
      ticks: {
        color: CHART_DEFAULTS.color,
        maxTicksLimit: 12,
      },
      grid: { color: CHART_DEFAULTS.grid },
    },
    y: {
      min: 0,
      max: 100,
      ticks: {
        color: CHART_DEFAULTS.color,
        callback: (v) => `${v}%`,
      },
      grid: { color: CHART_DEFAULTS.grid },
    },
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
          borderColor: CHART_DEFAULTS.accent,
          backgroundColor: "rgba(61, 143, 209, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: points.length > 80 ? 0 : 2,
          pointHoverRadius: 4,
        },
        {
          label: "Overall game win %",
          data: points.map(() => overallWinrate),
          borderColor: CHART_DEFAULTS.gold,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: CHART_DEFAULTS.color } },
        tooltip: {
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
          borderColor: CHART_DEFAULTS.lane,
          backgroundColor: "rgba(38, 166, 154, 0.15)",
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: points.length > 60 ? 0 : 2,
          pointHoverRadius: 4,
          borderWidth: 2.5,
        },
        {
          label: "Rolling game win %",
          data: points.map((p) => p.gameWinrate),
          borderColor: CHART_DEFAULTS.accent,
          backgroundColor: "rgba(61, 143, 209, 0.08)",
          fill: false,
          tension: 0.35,
          pointRadius: points.length > 60 ? 0 : 2,
          pointHoverRadius: 4,
          borderWidth: 2.5,
        },
        {
          label: "Overall lane win %",
          data: points.map(() => overallLane),
          borderColor: CHART_DEFAULTS.lane,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          borderWidth: 1,
        },
        {
          label: "Overall game win %",
          data: points.map(() => overallGame),
          borderColor: CHART_DEFAULTS.gold,
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
        legend: {
          labels: {
            color: CHART_DEFAULTS.color,
            boxWidth: 12,
            font: { size: 11 },
          },
        },
        tooltip: {
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

  const filtered = laneRows.filter((r) => r.games > 0 && r.laneKnown > 0);

  laneChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: filtered.map((r) => r.label),
      datasets: [
        {
          label: "Lane win %",
          data: filtered.map((r) => r.laneWinrate),
          backgroundColor: "rgba(38, 166, 154, 0.8)",
          borderRadius: 4,
        },
        {
          label: "Game win %",
          data: filtered.map((r) => r.gameWinrate),
          backgroundColor: "rgba(61, 143, 209, 0.8)",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: CHART_DEFAULTS.color, boxWidth: 12 },
        },
        tooltip: {
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
          ticks: { color: CHART_DEFAULTS.color },
          grid: { display: false },
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color: CHART_DEFAULTS.color,
            callback: (v) => `${v}%`,
          },
          grid: { color: CHART_DEFAULTS.grid },
        },
      },
    },
  });

  return laneChart;
}

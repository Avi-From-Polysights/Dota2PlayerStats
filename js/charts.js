const CHART_DEFAULTS = {
  color: "#8b9bb0",
  grid: "rgba(255,255,255,0.06)",
  radiant: "#7cb342",
  accent: "#3d8fd1",
  gold: "#d4a843",
};

let winrateChart = null;
let laneChart = null;

function destroyChart(chart) {
  if (chart) chart.destroy();
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
          label: "Rolling win %",
          data: points.map((p) => p.winrate),
          borderColor: CHART_DEFAULTS.accent,
          backgroundColor: "rgba(61, 143, 209, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: points.length > 80 ? 0 : 2,
          pointHoverRadius: 4,
        },
        {
          label: "Overall win %",
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
        legend: {
          labels: { color: CHART_DEFAULTS.color },
        },
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
      scales: {
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
      },
    },
  });

  return winrateChart;
}

export function renderLaneChart(canvas, laneRows) {
  destroyChart(laneChart);

  const filtered = laneRows.filter((r) => r.games > 0);

  laneChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: filtered.map((r) => r.label),
      datasets: [
        {
          label: "Win %",
          data: filtered.map((r) => r.winrate),
          backgroundColor: filtered.map((r) =>
            r.winrate >= 50 ? "rgba(124, 179, 66, 0.75)" : "rgba(229, 57, 53, 0.75)"
          ),
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel(ctx) {
              const row = filtered[ctx.dataIndex];
              return `${row.wins}W / ${row.losses}L · CI ${row.wilsonLower.toFixed(1)}–${row.wilsonUpper.toFixed(1)}%`;
            },
          },
        },
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          ticks: {
            color: CHART_DEFAULTS.color,
            callback: (v) => `${v}%`,
          },
          grid: { color: CHART_DEFAULTS.grid },
        },
        y: {
          ticks: { color: CHART_DEFAULTS.color },
          grid: { display: false },
        },
      },
    },
  });

  return laneChart;
}

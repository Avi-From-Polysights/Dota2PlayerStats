/**
 * CSV helpers for Analyze exports (matchup table + raw match rows).
 */

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(filename, headers, rows) {
  const lines = [
    headers.join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportMatchupCsv(rows) {
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

  const data = rows.map((r) => [
    r.hero,
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
  ]);

  downloadCsv("dota2_matchups.csv", headers, data);
}

/** Per-match rows from analyzeMatches timeline (the raw sample behind the table). */
export function exportRawMatchesCsv(timeline) {
  const headers = [
    "match_id",
    "start_time_unix",
    "start_time_iso",
    "win",
    "hero_id",
    "hero",
    "kills",
    "deaths",
    "assists",
    "duration_min",
    "game_mode",
    "game_mode_label",
    "lobby_type",
    "lobby_label",
    "patch",
    "lane",
    "lane_label",
    "lane_source",
    "lane_outcome",
    "gold_at_10",
    "enemy_heroes",
  ];

  const data = (timeline ?? []).map((m) => {
    const iso =
      m.startTime != null ? new Date(m.startTime * 1000).toISOString() : "";
    return [
      m.matchId,
      m.startTime ?? "",
      iso,
      m.win ? 1 : 0,
      m.heroId ?? "",
      m.heroName ?? "",
      m.kills ?? "",
      m.deaths ?? "",
      m.assists ?? "",
      m.durationMin != null ? Number(m.durationMin).toFixed(2) : "",
      m.gameMode ?? "",
      m.gameModeLabel ?? "",
      m.lobbyType ?? "",
      m.lobbyLabel ?? "",
      m.patch ?? "",
      m.lane ?? "",
      m.laneLabel ?? "",
      m.laneSource ?? "",
      m.laneOutcome ?? "",
      m.goldAt10 ?? "",
      m.enemyHeroes ?? "",
    ];
  });

  downloadCsv("dota2_matches.csv", headers, data);
}

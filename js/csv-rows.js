/**
 * Pure CSV row builders shared by the browser download wrappers (export-csv.js)
 * and the Home Assistant app's file exports. No DOM, no Blob.
 */

export function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsvText(headers, rows) {
  return [headers.join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
}

function fixed(value, digits = 2) {
  return value == null || Number.isNaN(Number(value)) ? "" : Number(value).toFixed(digits);
}

export const MATCHUP_HEADERS = [
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

export function matchupCsvRows(rows) {
  return (rows ?? []).map((r) => [
    r.hero,
    r.games,
    r.wins,
    r.losses,
    fixed(r.winrate),
    r.laneGames ?? 0,
    r.laneGames ? `${r.laneWon}-${r.laneLost}-${r.laneDraw}` : "",
    r.laneWinrate != null ? fixed(r.laneWinrate) : "",
    fixed(r.wilsonLower),
    fixed(r.wilsonUpper),
    fixed(r.avgDuration),
    fixed(r.avgKills),
    fixed(r.avgDeaths),
  ]);
}

export const RAW_MATCH_HEADERS = [
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

export function rawMatchCsvRows(timeline) {
  return (timeline ?? []).map((m) => {
    const iso = m.startTime != null ? new Date(m.startTime * 1000).toISOString() : "";
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
      m.durationMin != null ? fixed(m.durationMin) : "",
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
}

export const HERO_HEADERS = [
  "hero_id",
  "hero",
  "games",
  "wins",
  "losses",
  "winrate",
  "wilson_lower",
  "wilson_upper",
  "lane_wld",
  "lane_decided",
  "lane_winrate",
  "parsed_replays",
  "avg_kills",
  "avg_deaths",
  "avg_duration_min",
];

export function heroCsvRows(rows) {
  return (rows ?? []).map((r) => [
    r.heroId,
    r.hero,
    r.games,
    r.wins,
    r.losses,
    fixed(r.winrate),
    fixed(r.wilsonLower),
    fixed(r.wilsonUpper),
    r.laneRecord ?? "",
    r.laneDecided ?? 0,
    r.laneWinrate != null ? fixed(r.laneWinrate) : "",
    r.parsedReplayCount ?? 0,
    fixed(r.avgKills),
    fixed(r.avgDeaths),
    fixed(r.avgDuration),
  ]);
}

export const LANE_HEADERS = [
  "lane",
  "lane_label",
  "games",
  "wins",
  "losses",
  "game_winrate",
  "game_wilson_lower",
  "game_wilson_upper",
  "lane_won",
  "lane_lost",
  "lane_draw",
  "lane_known",
  "lane_winrate",
  "lane_wilson_lower",
  "lane_wilson_upper",
];

export function laneCsvRows(rows) {
  return (rows ?? []).map((r) => [
    r.lane,
    r.label,
    r.games,
    r.wins,
    r.losses,
    fixed(r.gameWinrate),
    fixed(r.gameWilsonLower),
    fixed(r.gameWilsonUpper),
    r.laneWon,
    r.laneLost,
    r.laneDraw,
    r.laneKnown,
    fixed(r.laneWinrate),
    fixed(r.laneWilsonLower),
    fixed(r.laneWilsonUpper),
  ]);
}

export const ACCOUNT_SUMMARY_HEADERS = [
  "account",
  "account_id",
  "games",
  "wins",
  "losses",
  "winrate",
  "wilson_lower",
  "wilson_upper",
  "lane_won",
  "lane_lost",
  "lane_draw",
  "lane_winrate",
  "lane_wilson_lower",
  "lane_wilson_upper",
  "win_pct_when_lane_won",
  "win_pct_when_lane_lost",
  "win_pct_when_lane_draw",
  "parsed_replays",
  "lane_coverage_pct",
  "days",
  "generated_at",
];

/** One row per account for the combined multi-account export. */
export function accountSummaryRow(analysis, { name, accountId, days, generatedAt }) {
  const coverage = analysis.totalGames
    ? (analysis.parsedReplayCount / analysis.totalGames) * 100
    : 0;

  return [
    name,
    accountId,
    analysis.totalGames,
    analysis.totalWins,
    analysis.totalLosses,
    fixed(analysis.overallWinrate),
    fixed(analysis.overallCi?.lower),
    fixed(analysis.overallCi?.upper),
    analysis.laneWon,
    analysis.laneLost,
    analysis.laneDraw,
    fixed(analysis.overallLaneWinrate),
    fixed(analysis.overallLaneCi?.lower),
    fixed(analysis.overallLaneCi?.upper),
    analysis.gameWinWhenLaneWon != null ? fixed(analysis.gameWinWhenLaneWon) : "",
    analysis.gameWinWhenLaneLost != null ? fixed(analysis.gameWinWhenLaneLost) : "",
    analysis.gameWinWhenLaneDraw != null ? fixed(analysis.gameWinWhenLaneDraw) : "",
    analysis.parsedReplayCount,
    fixed(coverage),
    days,
    generatedAt,
  ];
}

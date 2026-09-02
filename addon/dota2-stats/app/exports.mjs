/**
 * Write per-account and combined exports. Column definitions come from
 * js/csv-rows.js, so these files match the website's downloads exactly.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  ACCOUNT_SUMMARY_HEADERS,
  HERO_HEADERS,
  LANE_HEADERS,
  MATCHUP_HEADERS,
  RAW_MATCH_HEADERS,
  accountSummaryRow,
  heroCsvRows,
  laneCsvRows,
  matchupCsvRows,
  rawMatchCsvRows,
  toCsvText,
} from "../../../js/csv-rows.js";

export const ACCOUNT_FILES = [
  "matches.csv",
  "matchups.csv",
  "heroes.csv",
  "lanes.csv",
  "summary.json",
];

export function accountDir(options, account) {
  return path.join(options.exportDir, account.slug);
}

async function writeFile(dir, name, contents) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), contents, "utf8");
}

function buildSummary(result, options) {
  const { account, analysis, heroes, loadStats } = result;

  return {
    account: { id: account.accountId, name: account.name, slug: account.slug },
    window: {
      days: options.days,
      since: new Date(result.startedAt - options.days * 86400_000).toISOString(),
      generatedAt: new Date(result.finishedAt ?? Date.now()).toISOString(),
      durationSec: Math.round(((result.finishedAt ?? Date.now()) - result.startedAt) / 1000),
    },
    filters: { ...options.filters, significant: options.significant },
    totals: {
      games: analysis.totalGames,
      wins: analysis.totalWins,
      losses: analysis.totalLosses,
      winrate: analysis.overallWinrate,
      winrateCi: analysis.overallCi,
      laneWon: analysis.laneWon,
      laneLost: analysis.laneLost,
      laneDraw: analysis.laneDraw,
      laneUnknown: analysis.laneUnknown,
      laneWinrate: analysis.overallLaneWinrate,
      laneWinrateCi: analysis.overallLaneCi,
      winPctWhenLaneWon: analysis.gameWinWhenLaneWon,
      winPctWhenLaneLost: analysis.gameWinWhenLaneLost,
      winPctWhenLaneDraw: analysis.gameWinWhenLaneDraw,
      parsedReplays: analysis.parsedReplayCount,
      laneCoveragePct: analysis.totalGames
        ? (analysis.parsedReplayCount / analysis.totalGames) * 100
        : 0,
    },
    lanes: analysis.laneRows,
    topMatchups: analysis.matchupRows.slice(0, 40),
    heroes: heroes?.rows?.slice(0, 40) ?? [],
    load: loadStats
      ? {
          cacheHits: loadStats.cacheHits,
          fetched: loadStats.fetched,
          newlyParsed: loadStats.newlyParsed,
          parseIncomplete: loadStats.parseIncomplete,
          parseExcluded: loadStats.parseExcluded,
          parseSkippedTooOld: loadStats.parseSkippedTooOld,
          throttlePauses: loadStats.throttlePauses,
          rateLimited: loadStats.rateLimited,
        }
      : null,
  };
}

export async function writeAccountExports(result, options) {
  const { account, analysis, heroes } = result;
  const dir = accountDir(options, account);

  const files = {
    "matches.csv": toCsvText(RAW_MATCH_HEADERS, rawMatchCsvRows(analysis.timeline)),
    "matchups.csv": toCsvText(MATCHUP_HEADERS, matchupCsvRows(analysis.matchupRows)),
    "heroes.csv": toCsvText(HERO_HEADERS, heroCsvRows(heroes?.rows ?? [])),
    "lanes.csv": toCsvText(LANE_HEADERS, laneCsvRows(analysis.laneRows)),
    "summary.json": JSON.stringify(buildSummary(result, options), null, 2),
  };

  for (const [name, contents] of Object.entries(files)) {
    await writeFile(dir, name, contents);
  }

  // Keep a dated copy so week-over-week history survives the next overwrite.
  const stamp = new Date(result.finishedAt ?? Date.now()).toISOString().slice(0, 10);
  const historyDir = path.join(dir, "history", stamp);
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(historyDir, name, contents);
  }

  return dir;
}

export async function writeCombinedExports(results, options) {
  const generatedAt = new Date().toISOString();

  const summaryRows = results.map((result) =>
    accountSummaryRow(result.analysis, {
      name: result.account.name,
      accountId: result.account.accountId,
      days: options.days,
      generatedAt,
    })
  );

  const matchHeaders = ["account", "account_id", ...RAW_MATCH_HEADERS];
  const matchRows = results.flatMap((result) =>
    rawMatchCsvRows(result.analysis.timeline).map((row) => [
      result.account.name,
      result.account.accountId,
      ...row,
    ])
  );

  await writeFile(
    options.exportDir,
    "combined-summary.csv",
    toCsvText(ACCOUNT_SUMMARY_HEADERS, summaryRows)
  );
  await writeFile(
    options.exportDir,
    "combined-matches.csv",
    toCsvText(matchHeaders, matchRows)
  );
}

/**
 * Browser download wrappers for Analyze exports.
 * Column definitions live in csv-rows.js and are shared with the Home Assistant app.
 */
import {
  MATCHUP_HEADERS,
  RAW_MATCH_HEADERS,
  matchupCsvRows,
  rawMatchCsvRows,
  toCsvText,
} from "./csv-rows.js";

function downloadCsv(filename, headers, rows) {
  const blob = new Blob([toCsvText(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportMatchupCsv(rows) {
  downloadCsv("dota2_matchups.csv", MATCHUP_HEADERS, matchupCsvRows(rows));
}

/** Per-match rows from analyzeMatches timeline (the raw sample behind the table). */
export function exportRawMatchesCsv(timeline) {
  downloadCsv("dota2_matches.csv", RAW_MATCH_HEADERS, rawMatchCsvRows(timeline));
}

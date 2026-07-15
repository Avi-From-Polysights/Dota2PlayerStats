/**
 * Shared match / lobby filters used when scanning match lists and analyzing details.
 */
import { GAMEMODE_TURBO, isStandardGameMode } from "./game-modes.js";
import {
  isBotLobby,
  isPracticeOrTutorialLobby,
  isRankedLobby,
  looksLikeBotMatch,
} from "./lobby-types.js";

export function readMatchFiltersFromDom() {
  return {
    excludeTurbo: document.getElementById("exclude-turbo")?.checked ?? true,
    rankedOnly: document.getElementById("ranked-only")?.checked ?? false,
    excludeBots: document.getElementById("exclude-bots")?.checked ?? true,
    excludePractice: document.getElementById("exclude-practice")?.checked ?? true,
    standardModesOnly: document.getElementById("standard-modes-only")?.checked ?? false,
  };
}

export function applyMatchFiltersToDom(filters = {}) {
  const set = (id, checked) => {
    const el = document.getElementById(id);
    if (!(el instanceof HTMLInputElement)) return;
    el.checked = Boolean(checked);
  };
  if (filters.excludeTurbo != null) set("exclude-turbo", filters.excludeTurbo);
  if (filters.rankedOnly != null) set("ranked-only", filters.rankedOnly);
  if (filters.excludeBots != null) set("exclude-bots", filters.excludeBots);
  if (filters.excludePractice != null) set("exclude-practice", filters.excludePractice);
  if (filters.standardModesOnly != null) set("standard-modes-only", filters.standardModesOnly);
}

/**
 * Filter a match-list row (OpenDota /players/.../matches summary — has lobby_type & game_mode).
 * Returns { keep, reason }.
 */
export function classifyMatchSummary(match, options = {}) {
  const {
    excludeTurbo = true,
    rankedOnly = false,
    excludeBots = true,
    excludePractice = true,
    standardModesOnly = false,
  } = options;

  if (excludeTurbo && match.game_mode === GAMEMODE_TURBO) {
    return { keep: false, reason: "turbo" };
  }
  if (rankedOnly && !isRankedLobby(match.lobby_type)) {
    return { keep: false, reason: "ranked" };
  }
  if (excludeBots && isBotLobby(match.lobby_type)) {
    return { keep: false, reason: "bots" };
  }
  if (excludePractice && isPracticeOrTutorialLobby(match.lobby_type)) {
    return { keep: false, reason: "practice" };
  }
  if (standardModesOnly && match.game_mode != null && !isStandardGameMode(match.game_mode)) {
    return { keep: false, reason: "mode" };
  }
  return { keep: true, reason: null };
}

/**
 * Filter full match details during analysis. Bot heuristic needs player list.
 */
export function classifyMatchDetails(details, accountId, options = {}) {
  const summary = classifyMatchSummary(details, options);
  if (!summary.keep) return summary;

  if (options.excludeBots && looksLikeBotMatch(details, accountId)) {
    return { keep: false, reason: "bots" };
  }
  return { keep: true, reason: null };
}

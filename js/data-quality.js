/** Wilson interval width (pp) above which we warn on game win rate. */
export const GAME_CI_WARN_WIDTH = 25;

/** Minimum games before we warn about wide Wilson intervals. */
export const MIN_GAMES_FOR_CI_WARN = 5;

/** Lane position known in fewer than this fraction → lane filter warning. */
export const LANE_POSITION_WARN_FRACTION = 0.5;

/** Parsed replays below this fraction → lane stats warning. */
export const PARSED_REPLAY_WARN_FRACTION = 0.5;

/**
 * Warnings when results are unlikely to be reliable for the current sample and settings.
 * @returns {{ warnings: Array<{ severity: string, text: string }> }}
 */
export function assessAnalysisQuality(analysis, loadStats = {}, options = {}) {
  const warnings = [];
  const total = analysis?.totalGames ?? 0;
  if (total === 0) return { warnings };

  const {
    requestParse = true,
    useStratzFallback = false,
    hasLaneFilters = false,
  } = options;

  const parsed = analysis.parsedReplayCount ?? 0;
  const stratzEnriched = loadStats.stratzEnriched ?? 0;
  const laneDecided = analysis.laneDecided ?? 0;
  const lanePosKnown = analysis.lanePositionKnown ?? 0;
  const lanePosUnknown = analysis.lanePositionUnknown ?? 0;

  const parsedFraction = parsed / total;
  const laneDecidedFraction = laneDecided / total;
  const lanePosFraction = lanePosKnown / total;

  if (!requestParse && !useStratzFallback) {
    warnings.push({
      severity: "high",
      text: "OpenDota parse and STRATZ fallback are both off — lane win %, lane/role filters, and position inference have no replay gold or heatmap data and are unreliable.",
    });
  } else if (!requestParse && useStratzFallback && stratzEnriched < total * PARSED_REPLAY_WARN_FRACTION) {
    warnings.push({
      severity: "high",
      text: `STRATZ enriched only ${stratzEnriched}/${total} matches — most games lack lane series; lane stats and filters may not match OpenDota.`,
    });
  } else if (requestParse && parsedFraction < PARSED_REPLAY_WARN_FRACTION) {
    const incomplete = loadStats.parseIncomplete ?? 0;
    const suffix = incomplete ? ` (${incomplete} parse timeout(s))` : "";
    warnings.push({
      severity: "high",
      text: `Only ${parsed}/${total} matches have parsed lane gold@10${suffix} — lane win % and opponent lane filters may not represent this sample.`,
    });
  }

  if (hasLaneFilters && lanePosFraction < LANE_POSITION_WARN_FRACTION) {
    warnings.push({
      severity: "high",
      text: `Lane/role filters are active but only ${lanePosKnown}/${total} matches have lane assignment — most games are excluded or misclassified.`,
    });
  } else if (lanePosUnknown > total * LANE_POSITION_WARN_FRACTION) {
    warnings.push({
      severity: "medium",
      text: `${lanePosUnknown}/${total} matches have no lane assignment — lane breakdown and filters may skew toward parsed games only.`,
    });
  }

  if (laneDecided > 0 && laneDecidedFraction < PARSED_REPLAY_WARN_FRACTION && requestParse) {
    warnings.push({
      severity: "medium",
      text: `Lane won/lost could only be decided for ${laneDecided}/${total} games — overall lane win rate uses a small subset.`,
    });
  }

  if (total < 20) {
    warnings.push({
      severity: "medium",
      text: `Only ${total} games in sample — win rates and confidence intervals stay very uncertain.`,
    });
  }

  const ciWidth = (analysis.overallCi?.upper ?? 0) - (analysis.overallCi?.lower ?? 0);
  if (total >= MIN_GAMES_FOR_CI_WARN && ciWidth > GAME_CI_WARN_WIDTH) {
    warnings.push({
      severity: "medium",
      text: `Game win rate Wilson interval spans ${ciWidth.toFixed(0)} percentage points — add more games or narrow filters for tighter estimates.`,
    });
  }

  if (laneDecided >= 5) {
    const laneCiWidth =
      (analysis.overallLaneCi?.upper ?? 0) - (analysis.overallLaneCi?.lower ?? 0);
    if (laneCiWidth > 30 && laneDecided < 30) {
      warnings.push({
        severity: "medium",
        text: `Lane win rate uses ${laneDecided} decided lanes with a ${laneCiWidth.toFixed(0)} pp Wilson span — treat as directional only.`,
      });
    }
  }

  const thinLaneMatchups = (analysis.matchupRows ?? []).filter(
    (row) => row.games >= 3 && row.laneGames > 0 && row.laneGames < row.games * 0.3
  );
  if (thinLaneMatchups.length > 0) {
    warnings.push({
      severity: "low",
      text: `${thinLaneMatchups.length} hero matchup(s) have lane W-L from under 30% of games — per-hero lane win % may mislead.`,
    });
  }

  return { warnings };
}

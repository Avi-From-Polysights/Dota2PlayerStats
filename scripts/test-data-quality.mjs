import { assessAnalysisQuality } from "../js/data-quality.js";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

const baseAnalysis = {
  totalGames: 100,
  totalWins: 52,
  totalLosses: 48,
  parsedReplayCount: 90,
  laneDecided: 85,
  lanePositionKnown: 95,
  lanePositionUnknown: 5,
  overallCi: { lower: 42, upper: 62 },
  overallLaneCi: { lower: 48, upper: 58 },
  matchupRows: [],
};

assert(
  "no parse or stratz warns high",
  assessAnalysisQuality(baseAnalysis, {}, { requestParse: false, useStratzFallback: false })
    .warnings.some((w) => w.severity === "high")
);

assert(
  "low parsed warns",
  assessAnalysisQuality(
    { ...baseAnalysis, parsedReplayCount: 10, laneDecided: 8 },
    { parseIncomplete: 5 },
    { requestParse: true }
  ).warnings.some((w) => w.text.includes("Only 10/100"))
);

assert(
  "lane filters with missing lanes warns",
  assessAnalysisQuality(
    { ...baseAnalysis, lanePositionKnown: 20, lanePositionUnknown: 80 },
    {},
    { hasLaneFilters: true }
  ).warnings.some((w) => w.severity === "high")
);

assert(
  "healthy sample quiet",
  assessAnalysisQuality(baseAnalysis, {}, { requestParse: true }).warnings.length === 0
);

if (!ok) process.exit(1);
console.log("Data quality tests passed");

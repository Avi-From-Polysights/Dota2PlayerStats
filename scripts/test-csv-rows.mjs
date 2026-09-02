import {
  ACCOUNT_SUMMARY_HEADERS,
  HERO_HEADERS,
  LANE_HEADERS,
  MATCHUP_HEADERS,
  RAW_MATCH_HEADERS,
  accountSummaryRow,
  csvEscape,
  heroCsvRows,
  laneCsvRows,
  matchupCsvRows,
  rawMatchCsvRows,
  toCsvText,
} from "../js/csv-rows.js";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

assert("plain values are not quoted", csvEscape("Pudge") === "Pudge");
assert("commas are quoted", csvEscape("a,b") === '"a,b"');
assert("quotes are doubled", csvEscape('say "hi"') === '"say ""hi"""');
assert("newlines are quoted", csvEscape("a\nb") === '"a\nb"');
assert("null becomes empty", csvEscape(null) === "");

const matchup = {
  hero: "Axe",
  games: 5,
  wins: 3,
  losses: 2,
  winrate: 60,
  laneGames: 4,
  laneWon: 2,
  laneLost: 1,
  laneDraw: 1,
  laneWinrate: 66.666,
  wilsonLower: 23.1,
  wilsonUpper: 88.2,
  avgDuration: 38.5,
  avgKills: 6.2,
  avgDeaths: 4.4,
};

const [matchupRow] = matchupCsvRows([matchup]);
assert("matchup row width matches headers", matchupRow.length === MATCHUP_HEADERS.length);
assert("matchup lane record is W-L-D", matchupRow[6] === "2-1-1");
assert("matchup winrate is 2dp", matchupRow[4] === "60.00");

const emptyLane = matchupCsvRows([{ ...matchup, laneGames: 0, laneWinrate: null }])[0];
assert("no lane games leaves record blank", emptyLane[6] === "");
assert("no lane games leaves winrate blank", emptyLane[7] === "");

const [rawRow] = rawMatchCsvRows([
  {
    matchId: 123,
    startTime: 1_700_000_000,
    win: true,
    heroId: 14,
    heroName: "Pudge",
    kills: 7,
    deaths: 3,
    assists: 9,
    durationMin: 41.234,
    gameMode: 22,
    gameModeLabel: "All Pick",
    lobbyType: 7,
    lobbyLabel: "Ranked",
    patch: 57,
    lane: 2,
    laneLabel: "Mid Lane",
    laneSource: "lane_role",
    laneOutcome: "won",
    goldAt10: 3100,
    enemyHeroes: "Axe; Lina",
  },
]);
assert("raw row width matches headers", rawRow.length === RAW_MATCH_HEADERS.length);
assert("win is written as 1", rawRow[3] === 1);
assert("iso timestamp is derived", rawRow[2] === new Date(1_700_000_000 * 1000).toISOString());
assert("duration is 2dp", rawRow[9] === "41.23");

const [heroRow] = heroCsvRows([
  {
    heroId: 14,
    hero: "Pudge",
    games: 10,
    wins: 6,
    losses: 4,
    winrate: 60,
    wilsonLower: 31.2,
    wilsonUpper: 83.2,
    laneRecord: "5-3-2",
    laneDecided: 8,
    laneWinrate: 62.5,
    parsedReplayCount: 9,
    avgKills: 5,
    avgDeaths: 6,
    avgDuration: 40,
  },
]);
assert("hero row width matches headers", heroRow.length === HERO_HEADERS.length);

const [laneRow] = laneCsvRows([
  {
    lane: 2,
    label: "Mid Lane",
    games: 12,
    wins: 7,
    losses: 5,
    gameWinrate: 58.3,
    gameWilsonLower: 30,
    gameWilsonUpper: 80,
    laneWon: 6,
    laneLost: 4,
    laneDraw: 2,
    laneKnown: 12,
    laneWinrate: 60,
    laneWilsonLower: 31,
    laneWilsonUpper: 83,
  },
]);
assert("lane row width matches headers", laneRow.length === LANE_HEADERS.length);

const analysis = {
  totalGames: 20,
  totalWins: 12,
  totalLosses: 8,
  overallWinrate: 60,
  overallCi: { lower: 38.7, upper: 78.1 },
  laneWon: 9,
  laneLost: 7,
  laneDraw: 2,
  overallLaneWinrate: 56.25,
  overallLaneCi: { lower: 33, upper: 77 },
  gameWinWhenLaneWon: 77.7,
  gameWinWhenLaneLost: 28.5,
  gameWinWhenLaneDraw: null,
  parsedReplayCount: 18,
};

const summaryRow = accountSummaryRow(analysis, {
  name: "Rare",
  accountId: 42,
  days: 31,
  generatedAt: "2026-09-01T00:00:00.000Z",
});
assert("summary row width matches headers", summaryRow.length === ACCOUNT_SUMMARY_HEADERS.length);
assert("null lane-draw win% is blank", summaryRow[16] === "");
assert("lane coverage is computed", summaryRow[18] === "90.00");

const csv = toCsvText(["a", "b"], [[1, "x,y"]]);
assert("csv text joins header and rows", csv === 'a,b\n1,"x,y"');

if (!ok) process.exit(1);
console.log("\nAll CSV row tests passed.");

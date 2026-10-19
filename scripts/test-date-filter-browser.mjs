/**
 * Browser test for date filtering (requires Playwright): the pre-analysis
 * date range, and picking a range on the charts to filter enemy matchups.
 * OpenDota is mocked, so no network or API quota is used for match data.
 * Run: npx playwright install chromium && node scripts/test-date-filter-browser.mjs
 * Pass --shots <dir> to save screenshots of the chart selection.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ONBOARDING_STORAGE_KEY } from "../js/onboarding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = 8766;
const shotsArg = process.argv.indexOf("--shots");
const SHOTS_DIR = shotsArg > 0 ? process.argv[shotsArg + 1] : null;

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath.replace(/^\//, ""));
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath);
      let body = fs.readFileSync(filePath);
      if (ext === ".html") {
        body = Buffer.from(body.toString("utf8").replaceAll("__VERSION__", "test"));
      }
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(body);
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

const ACCOUNT_ID = 42;
const DAYS = 40;
const HEROES = {
  1: "Kez",
  2: "Axe",
  3: "Lina",
  4: "Pudge",
  5: "Zeus",
  6: "Lion",
  7: "Sniper",
};

/** Noon local time, `daysAgo` days back: one match per day, newest first. */
function noonDaysAgo(daysAgo) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return Math.floor(d.getTime() / 1000);
}

function dayInput(daysAgo) {
  const d = new Date(noonDaysAgo(daysAgo) * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The older half is played against Axe, the newer half against Lina.
const MATCHES = Array.from({ length: DAYS }, (_, i) => {
  const eraHero = i >= DAYS / 2 ? 2 : 3;
  const enemies = [eraHero, 4, 5, 6, 7];
  return {
    match_id: 8_000_000 + DAYS - i,
    start_time: noonDaysAgo(i),
    radiant_win: i % 3 !== 0,
    duration: 2100,
    game_mode: 22,
    lobby_type: 7,
    patch: 58,
    players: [
      { account_id: ACCOUNT_ID, player_slot: 0, hero_id: 1, kills: 6, deaths: 3, assists: 8 },
      ...enemies.map((heroId, n) => ({
        account_id: 1000 + n,
        player_slot: 128 + n,
        hero_id: heroId,
        kills: 2,
        deaths: 4,
        assists: 5,
      })),
    ],
  };
});

function summaryOf(match) {
  return {
    match_id: match.match_id,
    start_time: match.start_time,
    radiant_win: match.radiant_win,
    duration: match.duration,
    game_mode: match.game_mode,
    lobby_type: match.lobby_type,
    hero_id: 1,
    player_slot: 0,
  };
}

async function mockNetwork(page) {
  await page.route("https://raw.githubusercontent.com/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("/heroes.json")) {
      const body = Object.fromEntries(
        Object.entries(HEROES).map(([id, name]) => [id, { id: Number(id), localized_name: name }])
      );
      return route.fulfill({ json: body });
    }
    if (url.endsWith("/patch.json")) {
      return route.fulfill({ json: [{ id: 58, name: "7.39", date: "2025-05-22T00:00:00Z" }] });
    }
    return route.fulfill({ status: 404, body: "" });
  });

  await page.route("https://api.opendota.com/**", (route) => {
    const url = new URL(route.request().url());
    const listMatch = url.pathname.match(/\/players\/\d+\/matches$/);
    if (listMatch) {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 100);
      return route.fulfill({ json: MATCHES.slice(offset, offset + limit).map(summaryOf) });
    }
    const detail = url.pathname.match(/\/matches\/(\d+)$/);
    if (detail) {
      const match = MATCHES.find((m) => m.match_id === Number(detail[1]));
      return match ? route.fulfill({ json: match }) : route.fulfill({ status: 404, body: "" });
    }
    if (/\/players\/\d+$/.test(url.pathname)) {
      return route.fulfill({ json: { profile: { personaname: "Date Tester" } } });
    }
    return route.fulfill({ json: [] });
  });
}

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

async function matchupHeroes(page) {
  return page.$$eval("#matchup-table tbody tr td:first-child", (cells) =>
    cells.map((c) => c.textContent.trim())
  );
}

async function chartRange(page, id) {
  return page.evaluate((canvasId) => {
    const chart = Chart.getChart(document.getElementById(canvasId));
    return chart?.$rangeSelect?.range ?? null;
  }, id);
}

/** Viewport point at fraction `fx` across the plot area, mid-height. */
async function plotPoint(page, id, fx) {
  const canvas = page.locator(`#${id}`);
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const area = await page.evaluate(
    (canvasId) => Chart.getChart(document.getElementById(canvasId)).chartArea,
    id
  );
  return {
    x: box.x + area.left + fx * (area.right - area.left),
    y: box.y + (area.top + area.bottom) / 2,
  };
}

async function analyze(page) {
  await page.locator("#fetch-btn").click();
  await page.locator("#results").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll("#matchup-table tbody tr").length > 0);
  // Let the chart entry animations settle before measuring.
  await page.waitForTimeout(900);
}

async function prepareForm(page) {
  await page.waitForFunction(() => !document.getElementById("fetch-btn").disabled, null, {
    timeout: 60000,
  });
  await page.fill("#account-id", String(ACCOUNT_ID));
  await page.fill("#hero-search", "Kez");
  await page.evaluate(() => {
    document.getElementById("hero-id").value = "1";
    const parse = document.getElementById("request-parse");
    parse.checked = false;
    parse.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.log("SKIP: playwright not installed (npx playwright install chromium)");
    process.exit(0);
  }

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript((key) => localStorage.setItem(key, "1"), ONBOARDING_STORAGE_KEY);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await mockNetwork(page);

  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 60000 });
    await prepareForm(page);

    // --- inverted pre-analysis range is rejected --------------------------
    await page.fill("#date-from", dayInput(2));
    await page.fill("#date-to", dayInput(10));
    await page.locator("#fetch-btn").click();
    const error = await page.locator("#error-banner").textContent();
    assert("inverted From/To is rejected", /From date is after the To date/.test(error));
    await page.fill("#date-from", "");
    await page.fill("#date-to", "");

    // --- full analysis, then select on the charts --------------------------
    await analyze(page);
    const allHeroes = await matchupHeroes(page);
    assert("full sample faces both eras", allHeroes.includes("Axe") && allHeroes.includes("Lina"));
    assert("no chart selection to start", (await chartRange(page, "winrate-chart")) === null);
    assert("chart selection status hidden", await page.locator("[data-chart-selection]").first().isHidden());

    // Drag across the newest quarter of the win-rate chart.
    const from = await plotPoint(page, "winrate-chart", 0.72);
    const to = await plotPoint(page, "winrate-chart", 0.999);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, from.y, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();

    const dragRange = await chartRange(page, "winrate-chart");
    assert("drag selects a range", dragRange && dragRange.end === DAYS - 1 && dragRange.start > DAYS / 2);
    assert(
      "range mirrors onto the lane chart",
      JSON.stringify(await chartRange(page, "lane-vs-game-chart")) === JSON.stringify(dragRange)
    );
    assert("drag fills the From date", (await page.inputValue("#matchup-date-from")) !== "");
    assert("drag fills the To date", (await page.inputValue("#matchup-date-to")) === dayInput(0));
    const recentHeroes = await matchupHeroes(page);
    assert("recent range drops the older era", recentHeroes.includes("Lina") && !recentHeroes.includes("Axe"));
    const lina = await page.$eval("#matchup-table tbody", (tbody) => {
      const row = [...tbody.rows].find((r) => r.cells[0].textContent.trim() === "Lina");
      return Number(row.cells[1].textContent);
    });
    assert("matchup games match the selected points", lina === dragRange.end - dragRange.start + 1);
    const status = page.locator("[data-chart-selection]").first();
    assert("selection status shown under the chart", await status.isVisible());
    assert("selection status counts games", /\d+ of 40 games/.test(await status.textContent()));
    assert("summary still covers every game", /40 matches/.test(await page.locator("#summary-cards").textContent()));
    assert("matchup note mentions dates", /dates:/.test(await page.locator("#matchup-filter-note").textContent()));
    assert("clear dates enabled", await page.locator("#matchup-date-clear").isEnabled());

    if (SHOTS_DIR) {
      fs.mkdirSync(SHOTS_DIR, { recursive: true });
      await page.locator("#winrate-chart").locator("xpath=ancestor::article").screenshot({
        path: path.join(SHOTS_DIR, "winrate-drag.png"),
      });
      await page.locator(".lane-vs-game-panel").screenshot({ path: path.join(SHOTS_DIR, "lane-vs-game.png") });
      await page.locator("#matchup-table").locator("xpath=ancestor::article").screenshot({
        path: path.join(SHOTS_DIR, "matchup-filters.png"),
      });
    }

    // Click two points on the lane chart: the oldest era.
    const first = await plotPoint(page, "lane-vs-game-chart", 0.001);
    const second = await plotPoint(page, "lane-vs-game-chart", 0.3);
    await page.mouse.click(first.x, first.y);
    const pending = await page.evaluate(
      () => Chart.getChart(document.getElementById("lane-vs-game-chart")).$rangeSelect.anchor
    );
    assert("first click sets an anchor", pending === 0);
    if (SHOTS_DIR) {
      await page.locator(".lane-vs-game-panel").screenshot({ path: path.join(SHOTS_DIR, "lane-anchor.png") });
    }
    await page.mouse.click(second.x, second.y);
    const clickRange = await chartRange(page, "lane-vs-game-chart");
    assert("second click completes the range", clickRange?.start === 0 && clickRange.end > 0);
    assert("click range starts on the oldest day", (await page.inputValue("#matchup-date-from")) === dayInput(DAYS - 1));
    const oldHeroes = await matchupHeroes(page);
    assert("old range drops the newer era", oldHeroes.includes("Axe") && !oldHeroes.includes("Lina"));

    // Typing dates moves the band.
    await page.fill("#matchup-date-from", dayInput(5));
    await page.fill("#matchup-date-to", dayInput(3));
    await page.locator("#matchup-date-to").dispatchEvent("change");
    const typedRange = await chartRange(page, "winrate-chart");
    assert(
      "typed dates move the chart band",
      typedRange?.start === DAYS - 1 - 5 && typedRange?.end === DAYS - 1 - 3
    );

    // A range with no games empties the table but keeps the charts.
    await page.fill("#matchup-date-from", "2001-01-01");
    await page.fill("#matchup-date-to", "2001-01-02");
    await page.locator("#matchup-date-to").dispatchEvent("change");
    assert("empty range shows an empty-state row", /No games match/.test(await page.locator("#matchup-table tbody").textContent()));
    assert("empty range clears the band", (await chartRange(page, "winrate-chart")) === null);

    // Clear from the chart status button.
    await page.locator("[data-chart-selection-clear]").first().click();
    assert("clear empties the inputs", (await page.inputValue("#matchup-date-from")) === "");
    assert("clear restores every matchup", (await matchupHeroes(page)).length === allHeroes.length);
    assert("clear hides the status", await page.locator("[data-chart-selection]").first().isHidden());

    // --- pre-analysis date range -----------------------------------------
    await page.fill("#date-from", dayInput(9));
    await page.fill("#date-to", "");
    await analyze(page);
    const summary = await page.locator("#summary-cards").textContent();
    assert("pre-analysis range limits the sample", /10 matches/.test(summary));
    assert("summary names the range", /since /.test(summary));
    assert("share URL carries the range", new URL(page.url()).searchParams.get("from") === dayInput(9));
    assert("new analysis resets the matchup range", (await page.inputValue("#matchup-date-from")) === "");
    const timelineLength = await page.evaluate(
      () => Chart.getChart(document.getElementById("winrate-chart")).data.labels.length
    );
    assert("charts only plot the sample", timelineLength === 10);

    if (SHOTS_DIR) {
      await page.locator("#match-scope-section").screenshot({ path: path.join(SHOTS_DIR, "sample-filters.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      // Re-render at phone width (served from cache), as a phone would.
      await analyze(page);
      await page.locator("#match-scope-section").screenshot({
        path: path.join(SHOTS_DIR, "sample-filters-mobile.png"),
      });
      await page.locator(".lane-filter-block--matchup").screenshot({
        path: path.join(SHOTS_DIR, "matchup-filters-mobile.png"),
      });
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      assert(
        `no horizontal scroll at phone width (page ${scrollWidth}px, viewport ${clientWidth}px)`,
        scrollWidth <= clientWidth
      );
    }

    assert(`no page errors (${pageErrors.join(" | ")})`, pageErrors.length === 0);
  } finally {
    await browser.close();
    server.close();
  }

  if (!ok) process.exit(1);
  console.log("Browser date filter test passed.");
}

main().catch((err) => {
  console.error("Browser test FAILED:", err.message);
  process.exit(1);
});

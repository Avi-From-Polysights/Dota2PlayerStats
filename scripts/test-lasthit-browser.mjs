/**
 * Browser smoke test for the Last Hit Trainer tab (requires Playwright).
 * Run: npx playwright install chromium && node scripts/test-lasthit-browser.mjs
 *
 * Covers the wiring the headless sim test cannot: the tab renders, the canvas
 * paints, a right-click actually reaches the sim as an attack order, and the
 * drill scorecard writes a run into history.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ONBOARDING_STORAGE_KEY } from "../js/onboarding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = 8767;

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
      let filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath.replace(/^\//, ""));
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      if (!fs.existsSync(filePath)) {
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
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
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

  // Uncaught exceptions are always a failure. Console errors are not: on a bare
  // checkout the app legitimately 404s on un-bundled /data files and is blocked
  // by CORS calling dota2.com directly, and it is built to fall back from both.
  const uncaught = [];
  const consoleErrors = [];
  const EXPECTED_NOISE = [
    /Failed to load resource/i,
    /blocked by CORS policy/i,
    /net::ERR_FAILED/i,
    /dota2\.com/i,
  ];
  page.on("pageerror", (err) => uncaught.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (EXPECTED_NOISE.some((re) => re.test(text))) return;
    consoleErrors.push(text);
  });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.evaluate((key) => localStorage.setItem(key, "1"), ONBOARDING_STORAGE_KEY);
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });

    // --- Tab wiring -------------------------------------------------------
    await page.locator('.main-tabs__tab[data-tab="lasthit"]').click();
    await page.locator("#lasthit-canvas").waitFor({ state: "visible", timeout: 15000 });
    assert(
      page.url().includes("#lasthit"),
      `expected the URL hash to become #lasthit, got ${page.url()}`
    );

    // The idle overlay explains the controls before anything starts.
    await page.locator("#lasthit-overlay").waitFor({ state: "visible", timeout: 10000 });
    const overlayText = await page.locator("#lasthit-overlay-body").textContent();
    assert(
      overlayText?.includes("Anti-Mage") && overlayText.includes("level 1"),
      `idle overlay should describe the hero, got "${overlayText?.slice(0, 80)}"`
    );

    // The canvas must actually paint, not sit blank.
    const painted = await page.evaluate(() => {
      const canvas = document.getElementById("lasthit-canvas");
      if (!canvas || !canvas.width || !canvas.height) return false;
      const ctx = canvas.getContext("2d");
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const seen = new Set();
      for (let i = 0; i < data.length; i += 4 * 997) {
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return seen.size > 1;
    });
    assert(painted, "the trainer canvas should render more than a flat colour");

    // Without a bundled data/creeps.json the trainer must fall back cleanly to
    // its built-in stat table rather than fail to start.
    const sourceLabel = await page.locator("#lasthit-source").textContent();
    assert(
      Boolean(sourceLabel?.trim()),
      "the trainer should always report which stat source it is using"
    );

    // --- Start an endless run so the test does not wait out a 5 minute drill --
    // The radio inputs are visually hidden, so click the styled label instead.
    await page.locator('.lasthit-mode:has(input[value="endless"]) span').click();
    const endlessChecked = await page
      .locator('input[name="lasthit-mode"][value="endless"]')
      .isChecked();
    assert(endlessChecked, "clicking the Endless label should select that mode");

    await page.locator("#lasthit-start").click();
    await page.locator("#lasthit-overlay").waitFor({ state: "hidden", timeout: 10000 });

    // The clock must advance, proving the loop is stepping.
    await page.waitForFunction(
      () => (document.getElementById("lasthit-time")?.textContent ?? "0:00") !== "0:00",
      null,
      { timeout: 15000 }
    );
    const waveText = await page.locator("#lasthit-wave").textContent();
    assert(waveText?.trim() === "1", `expected wave 1 shortly after start, got "${waveText}"`);

    // --- Right-click must reach the sim as an attack order -----------------
    // Drive it through the real canvas listener: find an enemy creep, convert
    // its world position to a client point, and right-click there.
    const attackOrdered = await page.evaluate(async () => {
      const canvas = document.getElementById("lasthit-canvas");
      const trainer = window.__lasthitTrainer;
      const sim = await import("/js/lasthit/sim.js");
      const state = trainer?.getState?.();
      if (!state) return { ok: false, reason: "no sim state exposed" };

      const hero = sim.getHero(state);
      const enemy = sim
        .livingCreeps(state)
        .filter((c) => c.team === "dire")
        .sort(
          (a, b) =>
            Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y)
        )[0];
      if (!enemy) return { ok: false, reason: "no enemy creep alive" };

      const point = trainer.worldToScreen(enemy.x, enemy.y);
      canvas.dispatchEvent(
        new MouseEvent("mousedown", {
          button: 2,
          clientX: point.x,
          clientY: point.y,
          bubbles: true,
        })
      );

      return {
        ok: hero.order?.type === "attack" && hero.order.targetId === enemy.id,
        orderType: hero.order?.type ?? "none",
      };
    });

    assert(
      attackOrdered.ok,
      `right-clicking an enemy creep should issue an attack order (${attackOrdered.reason ?? attackOrdered.orderType})`
    );

    // --- Stop the run and confirm it is scored and persisted ---------------
    // Wait for the waves to actually meet and trade kills, so the run has
    // something real to score. Creeps need roughly 15s to walk into lane.
    await page.waitForFunction(
      () => {
        const state = window.__lasthitTrainer?.getState?.();
        return Boolean(state && state.score.enemyDeaths + state.score.allyDeaths > 0);
      },
      null,
      // The waves need ~15s to walk into lane and ~36s before the first creep
      // dies, so this must comfortably clear Playwright's 30s default.
      { timeout: 120000, polling: 500 }
    );

    await page.locator("#lasthit-stop").click();
    await page.locator("#lasthit-overlay").waitFor({ state: "visible", timeout: 10000 });
    const scoreText = await page.locator("#lasthit-overlay-body").textContent();
    assert(
      scoreText?.includes("Last hits") && scoreText.includes("Denies"),
      `the scorecard should report both metrics, got "${scoreText?.slice(0, 120)}"`
    );

    const storedRuns = await page.evaluate(async () => {
      const { loadRuns } = await import("/js/lasthit/history.js");
      return (await loadRuns()).length;
    });
    assert(storedRuns >= 1, `the finished run should be saved to history, found ${storedRuns}`);

    assert(uncaught.length === 0, `uncaught page exceptions: ${uncaught.join(" | ")}`);
    assert(
      consoleErrors.length === 0,
      `unexpected console errors: ${consoleErrors.join(" | ")}`
    );
    console.log("test-lasthit-browser: all assertions passed");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error("test-lasthit-browser FAILED:", error.stack || error.message);
  process.exit(1);
});

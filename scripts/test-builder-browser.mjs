/**
 * Browser smoke test for the Hero Builder tab (requires Playwright + network access
 * to raw.githubusercontent.com and api.opendota.com for live hero/item data).
 * Run: npx playwright install chromium && node scripts/test-builder-browser.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ONBOARDING_STORAGE_KEY } from "../js/onboarding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = 8766;

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
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));

  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.evaluate((key) => localStorage.setItem(key, "1"), ONBOARDING_STORAGE_KEY);
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });

    await page.locator('.main-tabs__tab[data-tab="builder"]').click();
    await page.locator("#builder-hero-search").waitFor({ state: "visible" });

    await page.waitForFunction(
      () => !document.getElementById("builder-hero-search")?.disabled &&
        !document.getElementById("builder-status")?.textContent?.includes("Loading"),
      { timeout: 30000 }
    );

    await page.locator("#builder-hero-search").fill("Anti-Mage");
    await page.locator('#builder-hero-suggestions [data-hero-id]').first().click();

    await page.waitForFunction(
      () =>
        document.getElementById("builder-status")?.textContent?.includes("Hero data: live") ||
        document.getElementById("builder-status")?.textContent?.includes("Building"),
      { timeout: 45000 }
    );

    await page.locator("#builder-workspace").waitFor({ state: "visible", timeout: 15000 });
    await page.locator(".builder-skill-row__label").first().waitFor({ state: "visible" });

    const rowCount = await page.locator(".builder-skill-row__label").count();
    if (rowCount < 4) throw new Error(`Expected at least 4 skill rows, got ${rowCount}`);

    // Assign level 1 by clicking the first available cell.
    const availableCell = page.locator(".builder-skill-cell--available").first();
    await availableCell.waitFor({ state: "visible", timeout: 10000 });
    await availableCell.click();

    const levelBadgeText = await page.locator("#builder-level-badge").textContent();
    if (!levelBadgeText?.includes("Level 1")) {
      throw new Error(`Expected Level 1 after first pick, got "${levelBadgeText}"`);
    }

    const filledCount = await page.locator(".builder-skill-cell--filled, .builder-skill-cell--ultimate-filled").count();
    if (filledCount !== 1) throw new Error(`Expected exactly 1 filled skill cell, got ${filledCount}`);

    // Open the item picker for the first inventory slot and equip an item.
    await page.locator("#builder-item-slots [data-slot-index='0']").click();
    await page.locator("#builder-item-picker").waitFor({ state: "visible" });
    await page.locator('.builder-item-tab[data-qual="component"]').click();
    await page.locator(".builder-item-card").first().waitFor({ state: "visible", timeout: 10000 });
    await page.locator(".builder-item-card").first().click();
    await page.locator("#builder-item-picker").waitFor({ state: "hidden" });

    const slotFilled = await page.locator("#builder-item-slots [data-slot-index='0']").evaluate(
      (el) => el.classList.contains("builder-item-slot--filled")
    );
    if (!slotFilled) throw new Error("Item slot did not show as filled after equipping an item");

    const statCards = await page.locator("#builder-stats-grid .summary-card").count();
    if (statCards < 10) throw new Error(`Expected computed stat cards, got ${statCards}`);

    // Save the build and confirm it round-trips through IndexedDB after reload.
    await page.locator("#builder-build-name").fill("AM Farming Build");
    await page.locator("#builder-save-btn").click();
    await page.waitForFunction(
      () => document.getElementById("builder-status")?.textContent?.includes("Saved"),
      { timeout: 10000 }
    );

    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator('.main-tabs__tab[data-tab="builder"]').click();
    await page.waitForFunction(
      () => document.getElementById("builder-saved-select")?.options?.length > 1,
      { timeout: 20000 }
    );

    const savedOptionText = await page.locator("#builder-saved-select option").nth(1).textContent();
    if (!savedOptionText?.includes("AM Farming Build")) {
      throw new Error(`Expected saved build in dropdown, got "${savedOptionText}"`);
    }

    await page.selectOption("#builder-saved-select", { index: 1 });
    await page.locator("#builder-workspace").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(
      () => document.getElementById("builder-build-name")?.value === "AM Farming Build",
      { timeout: 10000 }
    );

    const restoredFilled = await page.locator(".builder-skill-cell--filled, .builder-skill-cell--ultimate-filled").count();
    if (restoredFilled !== 1) throw new Error(`Expected restored build to keep 1 skill pick, got ${restoredFilled}`);

    console.log("Browser builder smoke test passed.");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("Browser test FAILED:", err.message);
  process.exit(1);
});

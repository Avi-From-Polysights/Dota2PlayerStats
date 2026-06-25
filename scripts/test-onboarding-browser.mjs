/**
 * Browser smoke test for guided tour (requires Playwright).
 * Run: npx playwright install chromium && node scripts/test-onboarding-browser.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ONBOARDING_STORAGE_KEY } from "../js/onboarding.js";
import { TUTORIAL_STEPS } from "../js/onboarding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = 8765;

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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle", timeout: 60000 });

    await page.evaluate((key) => localStorage.removeItem(key), ONBOARDING_STORAGE_KEY);
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });

    const tour = page.locator("#tutorial-root");
    await tour.waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(
      () => document.getElementById("fetch-btn") && !document.getElementById("fetch-btn").disabled,
      { timeout: 60000 }
    );

    for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
      await page.locator(".tutorial__title").waitFor({ state: "visible" });
      const title = await page.locator(".tutorial__title").textContent();
      if (!title?.trim()) throw new Error(`Empty title at step ${i + 1}`);
      const next = page.locator('[data-tutorial-action="next"]');
      await next.click();
    }

    await tour.waitFor({ state: "hidden", timeout: 5000 });
    const complete = await page.evaluate(
      (key) => localStorage.getItem(key) === "1",
      ONBOARDING_STORAGE_KEY
    );
    if (!complete) throw new Error("Tour did not mark onboarding complete");

    await page.locator('.main-tabs__tab[data-tab="tools"]').click();
    await page.locator("#tutorial-restart-btn").click();
    await tour.waitFor({ state: "visible", timeout: 5000 });
    await page.locator('[data-tutorial-action="skip"]').click();
    await tour.waitFor({ state: "hidden", timeout: 5000 });

    console.log("Browser onboarding smoke test passed.");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("Browser test FAILED:", err.message);
  process.exit(1);
});

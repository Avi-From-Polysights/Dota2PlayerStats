import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ONBOARDING_STORAGE_KEY } from "../js/onboarding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = 8777;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath.replace(/^\//, ""));
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("404");
        return;
      }
      let body = fs.readFileSync(filePath);
      if (filePath.endsWith(".html")) {
        body = Buffer.from(body.toString("utf8").replaceAll("__VERSION__", "test"));
      }
      const ext = path.extname(filePath);
      res.writeHead(200, {
        "Content-Type": ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : "text/html",
      });
      res.end(body);
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  const { chromium } = await import("playwright");
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.evaluate((key) => localStorage.setItem(key, "1"), ONBOARDING_STORAGE_KEY);
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator('.main-tabs__tab[data-tab="builder"]').click();
    await page.locator("#builder-hero-search").fill("Lone Druid");
    await page.locator('#builder-hero-suggestions [data-hero-id]').first().waitFor({ state: "visible", timeout: 30000 });
    await page.locator('#builder-hero-suggestions [data-hero-id]').first().click();
    await page.waitForFunction(
      () =>
        document.getElementById("builder-workspace") &&
        !document.getElementById("builder-workspace").classList.contains("hidden") &&
        !document.getElementById("builder-status")?.textContent?.includes("Loading live data"),
      { timeout: 60000 }
    );
    await page.waitForFunction(
      () => !document.getElementById("builder-bear-group")?.classList.contains("hidden"),
      { timeout: 15000 }
    );

    const result = await page.evaluate(() => ({
      bearHidden: document.getElementById("builder-bear-group")?.classList.contains("hidden"),
      bearInSkillPanel: Boolean(
        document.querySelector(".builder-skill-panel #builder-bear-group")
      ),
      bearSkillCount: document.querySelectorAll("#builder-bear-skills .builder-bear-skill").length,
      towerVisible: !document.getElementById("builder-tower-panel")?.classList.contains("hidden"),
      towerRowCount: document.querySelectorAll("#builder-tower-body tr").length,
      noteHidden: document.getElementById("builder-hero-note")?.classList.contains("hidden"),
      bearSlotCount: document.querySelectorAll("#builder-bear-slots .builder-item-slot").length,
      status: document.getElementById("builder-status")?.textContent ?? "",
    }));

    console.log(result);
    if (result.bearHidden) throw new Error("Spirit Bear panel is hidden for Lone Druid");
    if (!result.bearInSkillPanel) throw new Error("Spirit Bear panel should live in the skill build card");
    if (result.bearSkillCount < 3) throw new Error(`Expected bear skill rows, got ${result.bearSkillCount}`);
    if (!result.towerVisible || result.towerRowCount < 5) {
      throw new Error(`Expected tower damage table, visible=${result.towerVisible} rows=${result.towerRowCount}`);
    }
    if (result.bearSlotCount !== 6) throw new Error(`Expected 6 bear slots, got ${result.bearSlotCount}`);
    console.log("Lone Druid bear inventory test passed.");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});

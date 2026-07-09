/**
 * Fetch Valve datafeed JSON at build time (Node — no CORS).
 * Output is served as same-origin static files on GitHub Pages.
 *
 * Usage: node scripts/bundle-valve-data.mjs --out _site/data
 */
import fs from "node:fs";
import path from "node:path";
import { bundleBuildingData } from "./bundle-building-data.mjs";

const VALVE_BASE = "https://www.dota2.com/datafeed";
const PATCH_FLOOR = "7.41";
const HERO_DELAY_MS = 80;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs() {
  const outIdx = process.argv.indexOf("--out");
  const outDir = outIdx === -1 ? "data" : process.argv[outIdx + 1];
  if (!outDir) throw new Error("Missing --out directory");
  return { outDir: path.resolve(outDir) };
}

async function valveFetch(pathName, params = {}) {
  const url = new URL(`${VALVE_BASE}/${pathName}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function main() {
  const { outDir } = parseArgs();
  fs.mkdirSync(path.join(outDir, "heroes"), { recursive: true });

  console.log("Fetching patch list…");
  const patchListRaw = await valveFetch("patchnoteslist", { language: "english" });
  const patches = patchListRaw.patches ?? patchListRaw.result?.data?.patches ?? [];
  const patchVersions = patches
    .map((p) => p.patch_name ?? p.patch_number)
    .filter(Boolean);
  const floorIdx = patchVersions.findIndex((n) => n === PATCH_FLOOR || n.startsWith(PATCH_FLOOR));
  const versions = floorIdx === -1 ? patchVersions.slice(-5) : patchVersions.slice(floorIdx);
  const latestPatch = versions[versions.length - 1] ?? PATCH_FLOOR;

  console.log(`Fetching patch notes (${versions.length} versions)…`);
  const patchNotes = {};
  for (const version of versions) {
    try {
      patchNotes[version] = await valveFetch("patchnotes", { language: "english", version });
      console.log(`  ${version}`);
    } catch (error) {
      console.warn(`  skip ${version}: ${error.message}`);
    }
    await sleep(100);
  }

  console.log("Fetching hero list…");
  const heroListRaw = await valveFetch("herolist", { language: "english" });
  const heroes = heroListRaw.result?.data?.heroes ?? [];

  console.log(`Fetching ${heroes.length} hero sheets…`);
  let fetched = 0;
  for (const entry of heroes) {
    try {
      const raw = await valveFetch("herodata", { language: "english", hero_id: entry.id });
      const hero = raw.result?.data?.heroes?.[0];
      if (hero) {
        fs.writeFileSync(
          path.join(outDir, "heroes", `${entry.id}.json`),
          JSON.stringify(hero)
        );
        fetched += 1;
      }
    } catch (error) {
      console.warn(`  skip hero ${entry.id}: ${error.message}`);
    }
    if (fetched % 20 === 0) process.stdout.write(".");
    await sleep(HERO_DELAY_MS);
  }
  console.log(`\nWrote ${fetched} hero files.`);

  const meta = {
    latestPatch,
    patchVersions: versions,
    heroCount: fetched,
    bundledAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(outDir, "patch-meta.json"), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(outDir, "patch-notes.json"), JSON.stringify(patchNotes));
  fs.writeFileSync(path.join(outDir, "herolist.json"), JSON.stringify(heroListRaw));

  console.log("Bundling building / tower stats from VPK…");
  await bundleBuildingData({ outDir });

  console.log(`Bundled game data → ${outDir} (patch ${latestPatch})`);
}

main().catch((error) => {
  console.error("bundle-valve-data FAILED:", error.message);
  process.exit(1);
});

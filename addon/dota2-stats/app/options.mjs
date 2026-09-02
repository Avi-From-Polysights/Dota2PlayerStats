/**
 * Read and normalise the Home Assistant app options (/data/options.json).
 *
 * Local dev overrides:
 *   D2PS_OPTIONS     path to an options JSON file
 *   D2PS_DATA        persistent data dir (cache lives here)
 *   D2PS_EXPORT_DIR  where CSV/JSON exports are written
 *   D2PS_PORT        HTTP port (default 8099)
 */
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULTS = {
  accounts: [],
  opendota_api_key: "",
  days: 31,
  cron: "0 5 * * 1",
  run_on_start: false,
  request_parse: true,
  parse_concurrency: 6,
  parse_retries: 2,
  significant_only: false,
  exclude_turbo: true,
  exclude_bots: true,
  exclude_practice: true,
  ranked_only: false,
  standard_modes_only: false,
  confidence: 0.95,
  cache_retention_days: 120,
  export_dir: "/share/dota2stats",
};

export function slugifyName(name, accountId) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${accountId}-${slug}` : String(accountId);
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normaliseAccounts(raw) {
  if (!Array.isArray(raw)) return [];

  const seen = new Set();
  const accounts = [];

  for (const entry of raw) {
    const accountId = Number(entry?.account_id ?? entry?.accountId);
    if (!Number.isFinite(accountId) || accountId < 1) continue;
    if (seen.has(accountId)) continue;
    seen.add(accountId);

    const name = String(entry?.name ?? "").trim() || `Player ${accountId}`;
    accounts.push({ accountId, name, slug: slugifyName(name, accountId) });
  }

  return accounts;
}

export async function loadOptions() {
  const optionsPath = process.env.D2PS_OPTIONS ?? "/data/options.json";

  let raw = {};
  try {
    raw = JSON.parse(await fs.readFile(optionsPath, "utf8"));
  } catch (error) {
    console.warn(`[options] could not read ${optionsPath} (${error.message}) — using defaults`);
  }

  const merged = { ...DEFAULTS, ...raw };
  const accounts = normaliseAccounts(merged.accounts);

  return {
    optionsPath,
    accounts,
    openDotaApiKey: String(merged.opendota_api_key ?? "").trim(),
    days: clamp(merged.days, 1, 365, DEFAULTS.days),
    cron: String(merged.cron ?? DEFAULTS.cron).trim() || DEFAULTS.cron,
    runOnStart: Boolean(merged.run_on_start),
    requestParse: merged.request_parse !== false,
    parseConcurrency: clamp(merged.parse_concurrency, 1, 6, DEFAULTS.parse_concurrency),
    parseRetries: clamp(merged.parse_retries, 0, 5, DEFAULTS.parse_retries),
    confidence: clamp(merged.confidence, 0.5, 0.999, DEFAULTS.confidence),
    cacheRetentionDays: clamp(merged.cache_retention_days, 0, 3650, DEFAULTS.cache_retention_days),
    significant: Boolean(merged.significant_only),
    filters: {
      excludeTurbo: Boolean(merged.exclude_turbo),
      excludeBots: Boolean(merged.exclude_bots),
      excludePractice: Boolean(merged.exclude_practice),
      rankedOnly: Boolean(merged.ranked_only),
      standardModesOnly: Boolean(merged.standard_modes_only),
    },
    dataDir: path.resolve(process.env.D2PS_DATA ?? "/data"),
    exportDir: path.resolve(
      process.env.D2PS_EXPORT_DIR ?? merged.export_dir ?? DEFAULTS.export_dir
    ),
    port: Number(process.env.D2PS_PORT ?? 8099),
  };
}

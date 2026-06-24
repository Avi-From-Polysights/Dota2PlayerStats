import { loadPlayerMatchesAll } from "../api.js";
import { getCachedMatches } from "../match-cache.js";
import { isMatchParsedForPlayer } from "../parse.js";
import {
  createLoadStats,
  formatLoadStats,
  loadMatchDetailsBatch,
} from "../match-loader.js";
import { rememberAccountFromApi } from "../saved-accounts.js";
import { DEFAULT_PARSE_CONCURRENCY } from "../parse-concurrency.js";
import { getParallelConcurrency } from "../config-ui.js";
import { APP_VERSION } from "../version.js";
import { initMultiActivityLog } from "../multi-activity-log.js";

function setProgress(progressEl, fillEl, textEl, visible, pct = 0, text = "") {
  progressEl.classList.toggle("hidden", !visible);
  fillEl.style.width = `${pct}%`;
  textEl.textContent = text;
}

function showToolError(banner, message) {
  banner.textContent = message;
  banner.classList.remove("hidden");
}

function hideToolError(banner) {
  banner.classList.add("hidden");
}

/**
 * Overnight batch: fetch match history across all heroes and parse unparsed replays.
 */
export async function runParseAllTool({
  accountId,
  maxMatches,
  excludeTurbo,
  significant,
  signal,
  multiLog,
  progressEl,
  progressFill,
  progressText,
  errorBanner,
  startBtn,
  stopBtn,
}) {
  hideToolError(errorBanner);
  const parallelEnabled = document.getElementById("tool-parse-parallel-enabled")?.checked ?? true;
  const slots = getParallelConcurrency(
    parallelEnabled,
    document.getElementById("tool-parse-concurrency"),
    DEFAULT_PARSE_CONCURRENCY
  );
  const scanLimit = maxMatches > 0 ? maxMatches : 10_000;

  multiLog?.clear();
  multiLog?.show();
  multiLog?.configureWorkers(slots);
  multiLog?.info(`Parse-all started (v${APP_VERSION}) — up to ${scanLimit} matches, ${slots} lanes`);

  startBtn.disabled = true;
  stopBtn.disabled = false;
  progressEl.classList.remove("hidden");
  setProgress(progressEl, progressFill, progressText, true, 0, "Fetching match history…");

  const loadStats = createLoadStats();
  rememberAccountFromApi(accountId, { signal }).catch(() => {});

  try {
    multiLog?.info(`Scanning OpenDota for matches (all heroes, limit ${scanLimit})…`);

    const { matches, turboSkipped } = await loadPlayerMatchesAll(accountId, scanLimit, {
      excludeTurbo,
      significant,
      signal,
      onRateLimitWait: (info) => {
        loadStats.throttlePauses += 1;
        multiLog?.wait(
          `OpenDota limit — waiting ${Math.ceil(info.waitMs / 1000)}s before next match-list page…`
        );
      },
      onBatch: ({ offset, collected }) => {
        setProgress(
          progressEl,
          progressFill,
          progressText,
          true,
          Math.min(8, (collected / scanLimit) * 8),
          `Fetching match list… ${collected} collected (offset ${offset})`
        );
      },
    });

    if (!matches.length) {
      showToolError(errorBanner, "No matches found for that account and filters.");
      multiLog?.warn("No matches found.");
      setProgress(progressEl, progressFill, progressText, false);
      return;
    }

    multiLog?.info(
      `Found ${matches.length} matches${turboSkipped ? ` (${turboSkipped} turbo skipped)` : ""}. Checking cache…`
    );

    const matchIds = matches.map((m) => m.match_id);
    const cachedDetailsMap = await getCachedMatches(matchIds);

    const needsParse = [];
    let alreadyParsed = 0;

    for (const match of matches) {
      const id = Number(match.match_id);
      const cached = cachedDetailsMap.get(id);
      if (cached && isMatchParsedForPlayer(cached, accountId)) {
        alreadyParsed += 1;
      } else {
        needsParse.push(match);
      }
    }

    multiLog?.info(
      `${alreadyParsed} already parsed in cache · ${needsParse.length} need fetch/parse`
    );

    if (!needsParse.length) {
      setProgress(progressEl, progressFill, progressText, true, 100, "All matches already parsed.");
      multiLog?.info("Nothing to do — every match in range is already parsed locally.");
      return;
    }

    const parseBudget = { remaining: Infinity };

    await loadMatchDetailsBatch({
      matchList: needsParse,
      accountId,
      requestParse: true,
      parseBudget,
      parseRetry: document.getElementById("tool-parse-retry")?.checked ?? true,
      parseMaxRetries: Number(document.getElementById("tool-parse-max-retries")?.value) || 2,
      concurrency: slots,
      signal,
      cachedDetailsMap,
      multiLog,
      loadStats,
      onProgress: ({ completed, total, matchId, hasCachedEntry, workerId }) => {
        const pct = 10 + (completed / total) * 90;
        const lane = slots > 1 ? ` · lane ${workerId + 1}` : "";
        setProgress(
          progressEl,
          progressFill,
          progressText,
          true,
          pct,
          hasCachedEntry
            ? `Cached ${completed}/${total} (ID ${matchId})${lane}…`
            : `Parsing ${completed}/${total} (ID ${matchId})${lane}…`
        );
      },
    });

    const summary = formatLoadStats(loadStats);
    multiLog?.info(`Parse-all complete — ${summary || "done"}`);
    setProgress(
      progressEl,
      progressFill,
      progressText,
      true,
      100,
      `Done — ${loadStats.newlyParsed} newly parsed, ${loadStats.unparsed} still unparsed`
    );

    if (loadStats.rateLimited) {
      showToolError(
        errorBanner,
        "OpenDota rejected some requests (429). Wait a minute and run again — finished parses are cached."
      );
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      multiLog?.warn(error.message || "Parse-all failed.");
      showToolError(errorBanner, error.message || "Parse-all failed.");
      setProgress(progressEl, progressFill, progressText, false);
    }
  } finally {
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

export function initParseAllTool({ getAnalyzeAbortSignal }) {
  const form = document.getElementById("tool-parse-all-form");
  if (!form) return;

  const multiLog = initMultiActivityLog("tools-activity-log-panel");

  const progressEl = document.getElementById("tools-progress");
  const progressFill = document.getElementById("tools-progress-fill");
  const progressText = document.getElementById("tools-progress-text");
  const errorBanner = document.getElementById("tools-error-banner");
  const startBtn = document.getElementById("tool-parse-all-start");
  const stopBtn = document.getElementById("tool-parse-all-stop");
  const accountInput = document.getElementById("tool-account-id");

  let abortController = null;

  const syncAccountFromAnalyze = () => {
    const analyzeAccount = document.getElementById("account-id");
    if (analyzeAccount?.value && !accountInput.value) {
      accountInput.value = analyzeAccount.value;
    }
  };

  document.querySelector('[data-tab="tools"]')?.addEventListener("click", syncAccountFromAnalyze);

  stopBtn.addEventListener("click", () => {
    abortController?.abort();
    stopBtn.disabled = true;
    progressText.textContent = "Stopping…";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideToolError(errorBanner);

    const analyzeSignal = getAnalyzeAbortSignal?.();
    if (analyzeSignal && !analyzeSignal.aborted) {
      showToolError(errorBanner, "Stop the running analysis first, then start parse-all.");
      return;
    }

    const accountId = Number(accountInput.value);
    if (!accountId || accountId < 1) {
      showToolError(errorBanner, "Enter a valid account ID.");
      return;
    }

    if (abortController) abortController.abort();
    abortController = new AbortController();

    await runParseAllTool({
      accountId,
      maxMatches: Number(document.getElementById("tool-max-matches").value),
      excludeTurbo: document.getElementById("tool-exclude-turbo").checked,
      significant: document.getElementById("tool-significant-only").checked,
      signal: abortController.signal,
      multiLog,
      progressEl,
      progressFill,
      progressText,
      errorBanner,
      startBtn,
      stopBtn,
    });
  });
}

import { loadPlayerMatchesAll } from "../api.js";
import { getCachedMatches } from "../match-cache.js";
import { isMatchParsedForPlayer } from "../parse.js";
import { isMatchEligibleForParse, PARSE_MAX_AGE_DAYS } from "../parse-age.js";
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
import { readStratzSettingsFromDom } from "../stratz-token.js";

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
 * Batch fetch + parse across match history (optionally ignoring OpenDota age limit).
 */
export async function runBatchParseTool({
  accountId,
  maxMatches,
  excludeTurbo,
  significant,
  parseIgnoreAgeLimit = false,
  toolLabel = "Parse-all",
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
  multiLog?.info(
    `${toolLabel} started (v${APP_VERSION}) — up to ${scanLimit} matches, ${slots} lanes` +
      (parseIgnoreAgeLimit ? " · all ages" : ` · ≤${PARSE_MAX_AGE_DAYS} days only`)
  );

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
    let skippedTooOld = 0;

    for (const match of matches) {
      const id = Number(match.match_id);
      const cached = cachedDetailsMap.get(id);
      if (cached && isMatchParsedForPlayer(cached, accountId)) {
        alreadyParsed += 1;
        continue;
      }

      if (!parseIgnoreAgeLimit && !isMatchEligibleForParse(match)) {
        skippedTooOld += 1;
        continue;
      }

      needsParse.push(match);
    }

    if (skippedTooOld > 0) {
      multiLog?.info(
        `${skippedTooOld} match(es) older than ${PARSE_MAX_AGE_DAYS} days skipped (not queued for parse)`
      );
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
    const { enabled: useStratzFallback, token: stratzToken } = readStratzSettingsFromDom();

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
      parseIgnoreAgeLimit,
      useStratzFallback,
      stratzToken,
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

    loadStats.parseSkippedTooOld += skippedTooOld;

    const summary = formatLoadStats(loadStats);
    multiLog?.info(`${toolLabel} complete — ${summary || "done"}`);
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
      multiLog?.warn(error.message || `${toolLabel} failed.`);
      showToolError(errorBanner, error.message || `${toolLabel} failed.`);
      setProgress(progressEl, progressFill, progressText, false);
    }
  } finally {
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

/** @deprecated alias */
export const runParseAllTool = (opts) =>
  runBatchParseTool({ ...opts, toolLabel: "Parse-all", parseIgnoreAgeLimit: false });

function bindBatchParseForm({
  formId,
  startBtnId,
  stopBtnId,
  accountInputId,
  maxMatchesInputId,
  parseIgnoreAgeLimit,
  toolLabel,
  getAnalyzeAbortSignal,
  multiLog,
  progressEl,
  progressFill,
  progressText,
  errorBanner,
}) {
  const form = document.getElementById(formId);
  if (!form) return;

  const startBtn = document.getElementById(startBtnId);
  const stopBtn = document.getElementById(stopBtnId);
  const accountInput = document.getElementById(accountInputId);

  let abortController = null;

  stopBtn?.addEventListener("click", () => {
    abortController?.abort();
    if (stopBtn) stopBtn.disabled = true;
    if (progressText) progressText.textContent = "Stopping…";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideToolError(errorBanner);

    const analyzeSignal = getAnalyzeAbortSignal?.();
    if (analyzeSignal && !analyzeSignal.aborted) {
      showToolError(errorBanner, "Stop the running analysis first, then start this tool.");
      return;
    }

    const accountId = Number(accountInput?.value);
    if (!accountId || accountId < 1) {
      showToolError(errorBanner, "Enter a valid account ID.");
      return;
    }

    if (abortController) abortController.abort();
    abortController = new AbortController();

    await runBatchParseTool({
      accountId,
      maxMatches: Number(document.getElementById(maxMatchesInputId)?.value),
      excludeTurbo: document.getElementById("tool-exclude-turbo")?.checked ?? true,
      significant: document.getElementById("tool-significant-only")?.checked ?? false,
      parseIgnoreAgeLimit,
      toolLabel,
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

export function initParseAllTool({ getAnalyzeAbortSignal }) {
  const multiLog = initMultiActivityLog("tools-activity-log-panel");
  const progressEl = document.getElementById("tools-progress");
  const progressFill = document.getElementById("tools-progress-fill");
  const progressText = document.getElementById("tools-progress-text");
  const errorBanner = document.getElementById("tools-error-banner");
  const accountInput = document.getElementById("tool-account-id");

  const syncAccountFromAnalyze = () => {
    const analyzeAccount = document.getElementById("account-id");
    if (analyzeAccount?.value && accountInput && !accountInput.value) {
      accountInput.value = analyzeAccount.value;
    }
  };

  document.querySelector('[data-tab="tools"]')?.addEventListener("click", syncAccountFromAnalyze);

  bindBatchParseForm({
    formId: "tool-parse-all-form",
    startBtnId: "tool-parse-all-start",
    stopBtnId: "tool-parse-all-stop",
    accountInputId: "tool-account-id",
    maxMatchesInputId: "tool-max-matches",
    parseIgnoreAgeLimit: false,
    toolLabel: "Parse-all",
    getAnalyzeAbortSignal,
    multiLog,
    progressEl,
    progressFill,
    progressText,
    errorBanner,
  });
}

export function initFullHistoryParseTool({ getAnalyzeAbortSignal }) {
  const multiLog = initMultiActivityLog("tools-full-history-log-panel");
  const progressEl = document.getElementById("tools-full-history-progress");
  const progressFill = document.getElementById("tools-full-history-progress-fill");
  const progressText = document.getElementById("tools-full-history-progress-text");
  const errorBanner = document.getElementById("tools-error-banner");
  const accountInput = document.getElementById("tool-full-history-account-id");

  const syncAccountFromAnalyze = () => {
    const analyzeAccount = document.getElementById("account-id");
    if (analyzeAccount?.value && accountInput && !accountInput.value) {
      accountInput.value = analyzeAccount.value;
    }
  };

  document.querySelector('[data-tab="tools"]')?.addEventListener("click", syncAccountFromAnalyze);

  bindBatchParseForm({
    formId: "tool-full-history-form",
    startBtnId: "tool-full-history-start",
    stopBtnId: "tool-full-history-stop",
    accountInputId: "tool-full-history-account-id",
    maxMatchesInputId: "tool-full-history-max-matches",
    parseIgnoreAgeLimit: true,
    toolLabel: "Full history parse",
    getAnalyzeAbortSignal,
    multiLog,
    progressEl,
    progressFill,
    progressText,
    errorBanner,
  });
}

import { getCachedMatch } from "../match-cache.js";
import { isMatchParsedForPlayer } from "../parse.js";
import {
  clearParseFailure,
  listParseFailures,
  parseFailureLabel,
} from "../parse-failures.js";
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

export async function runRetryFailedTool({
  accountId,
  parseMaxRetries,
  signal,
  multiLog,
  progressEl,
  progressFill,
  progressText,
  errorBanner,
  startBtn,
  stopBtn,
  statusEl,
}) {
  hideToolError(errorBanner);
  const parallelEnabled = document.getElementById("tool-retry-parallel-enabled")?.checked ?? true;
  const slots = getParallelConcurrency(
    parallelEnabled,
    document.getElementById("tool-retry-concurrency"),
    DEFAULT_PARSE_CONCURRENCY
  );

  multiLog?.clear();
  multiLog?.show();
  multiLog?.configureWorkers(slots);

  const failures = await listParseFailures(accountId);

  if (statusEl) {
    statusEl.textContent = failures.length
      ? `${failures.length} failed parse(s) on record for this account.`
      : "No failed parses on record for this account.";
  }

  if (!failures.length) {
    multiLog?.info("No failed parses to retry.");
    return;
  }

  multiLog?.info(
    `Retry-failed started (v${APP_VERSION}) — ${failures.length} match(es), ${slots} lanes`
  );

  startBtn.disabled = true;
  stopBtn.disabled = false;
  progressEl.classList.remove("hidden");
  setProgress(progressEl, progressFill, progressText, true, 0, "Preparing retry list…");

  rememberAccountFromApi(accountId, { signal }).catch(() => {});
  const loadStats = createLoadStats();

  try {
    const matchList = failures.map((row) => ({ match_id: row.matchId }));
    const cachedDetailsMap = new Map();

    for (const row of failures) {
      const cached = await getCachedMatch(row.matchId);
      if (cached) cachedDetailsMap.set(row.matchId, cached);
    }

    multiLog?.info(`Retrying ${matchList.length} previously failed match(es)…`);

    await loadMatchDetailsBatch({
      matchList,
      accountId,
      requestParse: true,
      parseBudget: { remaining: Infinity },
      parseRetry: true,
      parseMaxRetries,
      concurrency: slots,
      signal,
      cachedDetailsMap,
      multiLog,
      loadStats,
      onProgress: ({ completed, total, matchId, workerId }) => {
        const pct = (completed / total) * 100;
        setProgress(
          progressEl,
          progressFill,
          progressText,
          true,
          pct,
          `Retrying ${completed}/${total} (ID ${matchId}) · lane ${workerId + 1}…`
        );
      },
    });

    let recovered = 0;
    for (const row of failures) {
      const cached = await getCachedMatch(row.matchId);
      if (cached && isMatchParsedForPlayer(cached, accountId)) {
        recovered += 1;
        await clearParseFailure(accountId, row.matchId);
      }
    }

    const remaining = (await listParseFailures(accountId)).length;

    if (statusEl) {
      statusEl.textContent =
        remaining === 0
          ? "All failed parses recovered."
          : `${remaining} failed parse(s) still on record.`;
    }

    multiLog?.info(
      `Retry-failed complete — ${recovered} recovered, ${remaining} still failed · ${formatLoadStats(loadStats)}`
    );
    setProgress(
      progressEl,
      progressFill,
      progressText,
      true,
      100,
      `Done — ${recovered} recovered, ${remaining} still failed`
    );
  } catch (error) {
    if (error.name !== "AbortError") {
      multiLog?.warn(error.message || "Retry-failed run failed.");
      showToolError(errorBanner, error.message || "Retry-failed run failed.");
      setProgress(progressEl, progressFill, progressText, false);
    }
  } finally {
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

export async function refreshRetryFailedStatus(accountId, statusEl) {
  if (!statusEl || !accountId) return;
  const failures = await listParseFailures(accountId);
  if (!failures.length) {
    statusEl.textContent = "No failed parses on record for this account.";
    return;
  }

  const preview = failures
    .slice(0, 3)
    .map((row) => `${row.matchId} (${parseFailureLabel(row.reason)})`)
    .join(", ");

  statusEl.textContent =
    failures.length > 3
      ? `${failures.length} failed: ${preview}, …`
      : `${failures.length} failed: ${preview}`;
}

export function initRetryFailedTool({ getAnalyzeAbortSignal }) {
  const form = document.getElementById("tool-retry-failed-form");
  if (!form) return;

  const multiLog = initMultiActivityLog("tools-retry-log-panel");
  const progressEl = document.getElementById("tools-retry-progress");
  const progressFill = document.getElementById("tools-retry-progress-fill");
  const progressText = document.getElementById("tools-retry-progress-text");
  const errorBanner = document.getElementById("tools-error-banner");
  const startBtn = document.getElementById("tool-retry-failed-start");
  const stopBtn = document.getElementById("tool-retry-failed-stop");
  const accountInput = document.getElementById("tool-retry-account-id");
  const statusEl = document.getElementById("tool-retry-failed-status");

  let abortController = null;

  const syncAccount = () => {
    const analyzeAccount = document.getElementById("account-id");
    if (analyzeAccount?.value && !accountInput.value) {
      accountInput.value = analyzeAccount.value;
    }
    const id = Number(accountInput.value || analyzeAccount?.value);
    if (id) refreshRetryFailedStatus(id, statusEl).catch(() => {});
  };

  document.querySelector('[data-tab="tools"]')?.addEventListener("click", syncAccount);
  accountInput?.addEventListener("change", syncAccount);

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
      showToolError(errorBanner, "Stop the running analysis first.");
      return;
    }

    const accountId = Number(accountInput.value);
    if (!accountId || accountId < 1) {
      showToolError(errorBanner, "Enter a valid account ID.");
      return;
    }

    if (abortController) abortController.abort();
    abortController = new AbortController();

    await runRetryFailedTool({
      accountId,
      parseMaxRetries: Number(document.getElementById("tool-retry-max-retries").value) || 2,
      signal: abortController.signal,
      multiLog,
      progressEl,
      progressFill,
      progressText,
      errorBanner,
      startBtn,
      stopBtn,
      statusEl,
    });
  });
}

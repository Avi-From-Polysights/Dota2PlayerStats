/** Toggle dependent form fields for parse / parallel / retry sections. */
export function initConfigUi() {
  const requestParse = document.getElementById("request-parse");
  const parseSection = document.getElementById("parse-options");
  const parseParallelEnabled = document.getElementById("parse-parallel-enabled");
  const parseParallelism = document.getElementById("parse-parallelism");
  const parseRetry = document.getElementById("parse-retry");
  const parseMaxRetries = document.getElementById("parse-max-retries");
  const parseFields = parseSection?.querySelectorAll("[data-parse-field]") ?? [];

  const syncParseSection = () => {
    const on = requestParse?.checked ?? false;
    parseSection?.classList.toggle("config-section--muted", !on);
    parseFields.forEach((el) => {
      if (el === parseParallelEnabled || el === requestParse) return;
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        el.disabled = !on;
      }
    });
    syncParallelFields();
    syncParseRetryFields();
  };

  const syncParallelFields = () => {
    const parseOn = requestParse?.checked ?? false;
    const parallelOn = parseParallelEnabled?.checked ?? false;
    if (parseParallelism) {
      parseParallelism.disabled = !parseOn || !parallelOn;
    }
    parseParallelEnabled?.closest(".field")?.classList.toggle(
      "field--disabled",
      !parseOn
    );
    if (parseParallelEnabled instanceof HTMLInputElement) {
      parseParallelEnabled.disabled = !parseOn;
    }
  };

  const syncParseRetryFields = () => {
    const parseOn = requestParse?.checked ?? false;
    const retryOn = parseRetry?.checked ?? false;
    if (parseMaxRetries) {
      parseMaxRetries.disabled = !parseOn || !retryOn;
    }
    if (parseRetry instanceof HTMLInputElement) {
      parseRetry.disabled = !parseOn;
    }
  };

  requestParse?.addEventListener("change", () => {
    syncParseSection();
    if (requestParse.checked) {
      parseSection?.setAttribute("open", "");
    }
  });
  parseParallelEnabled?.addEventListener("change", syncParallelFields);
  parseRetry?.addEventListener("change", syncParseRetryFields);

  const stratzFallback = document.getElementById("stratz-fallback");
  const stratzToken = document.getElementById("stratz-api-token");

  const syncStratzFields = () => {
    const on = stratzFallback?.checked ?? false;
    if (stratzToken instanceof HTMLInputElement) {
      stratzToken.disabled = !on;
    }
    stratzToken?.closest(".field")?.classList.toggle("field--disabled", !on);
  };

  stratzFallback?.addEventListener("change", syncStratzFields);
  syncStratzFields();

  syncParseSection();

  initToolParallelToggles();
}

function initToolParallelToggles() {
  for (const { toggleId, inputId } of [
    { toggleId: "tool-parse-parallel-enabled", inputId: "tool-parse-concurrency" },
    { toggleId: "tool-retry-parallel-enabled", inputId: "tool-retry-concurrency" },
  ]) {
    const toggle = document.getElementById(toggleId);
    const input = document.getElementById(inputId);
    if (!toggle || !input) continue;

    const sync = () => {
      input.disabled = !toggle.checked;
      toggle.closest(".field")?.classList.toggle("field--disabled", false);
    };
    toggle.addEventListener("change", sync);
    sync();
  }
}

export function getParallelConcurrency(enabled, lanesInput, fallback = 6) {
  if (!enabled) return 1;
  const n = Number(lanesInput?.value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(6, Math.max(1, Math.round(n)));
}

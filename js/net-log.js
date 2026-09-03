/**
 * Optional network event sink. Lets a host (the Home Assistant app) surface
 * request attempts, retries and rate-limit backoff that would otherwise be
 * invisible while api.js quietly retries.
 *
 * The browser registers no sink, so this is a no-op there.
 */

let sink = null;

export function setNetworkLogger(fn) {
  sink = typeof fn === "function" ? fn : null;
}

/**
 * @param {{phase: "request"|"retry"|"giveup"|"done", label?: string, url?: string,
 *          status?: number, attempt?: number, attempts?: number, waitMs?: number,
 *          error?: string}} event
 */
export function netLog(event) {
  if (!sink) return;
  try {
    sink(event);
  } catch {
    // logging must never break a request
  }
}

import {
  loadMatchDetails,
  loadParseJobStatus,
  requestMatchParse,
} from "./api.js";

/** Lane stats need gold at minute 10 from a parsed replay. */
export function isMatchParsedForPlayer(details, accountId) {
  const me = details?.players?.find((p) => p.account_id === accountId);
  return Array.isArray(me?.gold_t) && me.gold_t.length > 10;
}

/** Replay processed on OpenDota (version set) but lane times may still be indexing. */
export function isReplayVersionReady(details) {
  return details?.version != null && details.version !== "";
}

export const PARSE_INITIAL_WAIT_MS = 18_000;
export const PARSE_MAX_WAIT_MS = 75_000;
export const PARSE_POLL_MIN_MS = 5_000;
export const PARSE_POLL_MAX_MS = 12_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sleepWithProgress(ms, { signal, onTick, tickMs = 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onTick?.(Date.now() - start, ms);
    const remaining = ms - (Date.now() - start);
    await sleep(Math.min(tickMs, remaining));
  }
}

/**
 * Queue an OpenDota parse and poll until lane data appears or timeout.
 * Waits before polling so we do not burn API quota while the replay is still processing.
 */
export async function ensureMatchParsed(
  matchId,
  accountId,
  {
    signal,
    onPoll,
    onRateLimitWait,
    onLog,
    initialDetails = null,
  } = {}
) {
  let details =
    initialDetails ??
    (await loadMatchDetails(matchId, signal, { onRateLimitWait }));

  if (isMatchParsedForPlayer(details, accountId)) {
    onLog?.(`Match ${matchId} already has lane data`);
    return details;
  }

  const parseResponse = await requestMatchParse(matchId, signal, { onRateLimitWait });
  const jobId = parseResponse?.job?.jobId;
  onLog?.(
    jobId
      ? `Parse queued for match ${matchId} (job ${jobId}) — OpenDota typically needs 30–90s`
      : `Parse queued for match ${matchId} — OpenDota typically needs 30–90s`
  );

  await sleepWithProgress(PARSE_INITIAL_WAIT_MS, {
    signal,
    tickMs: 2000,
    onTick: (elapsed) => {
      const secs = Math.round(elapsed / 1000);
      onPoll?.(details, {
        phase: "initial-wait",
        elapsedMs: elapsed,
        initialWaitMs: PARSE_INITIAL_WAIT_MS,
      });
      if (secs % 6 === 0 && secs > 0) {
        onLog?.(`Replay processing… ${secs}s before first status check`);
      }
    },
  });

  const deadline = Date.now() + PARSE_MAX_WAIT_MS;
  let pollInterval = PARSE_POLL_MIN_MS;
  let pollCount = 0;
  const parseStarted = Date.now();

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    pollCount += 1;
    const elapsedSec = Math.round((Date.now() - parseStarted) / 1000);

    if (jobId) {
      try {
        const job = await loadParseJobStatus(jobId, signal, { onRateLimitWait });
        if (job?.job?.status) {
          onLog?.(`Parse job ${jobId}: ${job.job.status} (${elapsedSec}s)`);
        }
      } catch {
        // Job endpoint often returns null when complete — fall through to match check.
      }
    }

    try {
      details = await loadMatchDetails(matchId, signal, { onRateLimitWait });
    } catch (error) {
      if (error?.rateLimited) throw error;
      onLog?.(`Poll ${pollCount} failed (${elapsedSec}s) — will retry`);
      onPoll?.(details, { phase: "poll-error", elapsedSec, pollCount });
      await sleepWithProgress(pollInterval, { signal, tickMs: pollInterval });
      pollInterval = Math.min(PARSE_POLL_MAX_MS, pollInterval + 2000);
      continue;
    }

    if (isMatchParsedForPlayer(details, accountId)) {
      onLog?.(`Lane data ready for match ${matchId} after ${elapsedSec}s (${pollCount} checks)`);
      onPoll?.(details, { phase: "done", elapsedSec, pollCount });
      return details;
    }

    if (isReplayVersionReady(details)) {
      onLog?.(`Replay parsed (${elapsedSec}s) — waiting for lane gold timeline…`);
    } else {
      onLog?.(`Poll ${pollCount}: replay not ready yet (${elapsedSec}s elapsed)`);
    }

    onPoll?.(details, { phase: "poll", elapsedSec, pollCount });

    await sleepWithProgress(pollInterval, {
      signal,
      tickMs: Math.min(2000, pollInterval),
      onTick: (waited) => {
        onPoll?.(details, {
          phase: "poll-wait",
          elapsedSec: elapsedSec + Math.round(waited / 1000),
          pollCount,
          waitMs: pollInterval,
        });
      },
    });
    pollInterval = Math.min(PARSE_POLL_MAX_MS, pollInterval + 1500);
  }

  const totalSec = Math.round((Date.now() - parseStarted) / 1000);
  onLog?.(
    `Parse timed out for match ${matchId} after ${totalSec}s — continuing without lane data`
  );
  onPoll?.(details, { phase: "timeout", elapsedSec: totalSec, pollCount });
  return details;
}

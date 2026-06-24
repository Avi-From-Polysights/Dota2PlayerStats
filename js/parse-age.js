/** OpenDota typically cannot parse replays much older than ~31 days. */
export const PARSE_MAX_AGE_DAYS = 31;
export const PARSE_MAX_AGE_MS = PARSE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export function matchStartTimeSec(matchOrDetails) {
  const t = matchOrDetails?.start_time;
  return typeof t === "number" ? t : null;
}

export function isMatchEligibleForParse(
  matchOrDetails,
  { ignoreAgeLimit = false, now = Date.now() } = {}
) {
  if (ignoreAgeLimit) return true;

  const startSec = matchStartTimeSec(matchOrDetails);
  if (startSec == null) return true;

  return now - startSec * 1000 <= PARSE_MAX_AGE_MS;
}

export function parseAgeSkipMessage(matchId, startSec) {
  if (startSec == null) {
    return `Skipping parse for match ${matchId} — replay likely too old (OpenDota ~${PARSE_MAX_AGE_DAYS} day limit)`;
  }
  const ageDays = Math.floor((Date.now() - startSec * 1000) / (24 * 60 * 60 * 1000));
  return `Skipping parse for match ${matchId} — ${ageDays} days old (limit ${PARSE_MAX_AGE_DAYS}d)`;
}

/**
 * Day ranges for the date filters. Ranges are "YYYY-MM-DD" strings (what
 * <input type="date"> holds) read in local time, so a day means the player's
 * calendar day rather than a UTC one.
 */

const DAY_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(value) {
  const match = DAY_INPUT.exec(String(value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  // Reject rollovers such as 2026-02-31.
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Unix seconds at local midnight starting the day, or null. */
export function dayStartUnix(value) {
  const date = parseDay(value);
  return date ? Math.floor(date.getTime() / 1000) : null;
}

/** Unix seconds at the last second of the day, or null. */
export function dayEndUnix(value) {
  const date = parseDay(value);
  if (!date) return null;
  // Next midnight minus one second stays correct across DST changes.
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return Math.floor(next.getTime() / 1000) - 1;
}

/** The local calendar day of a unix timestamp, as "YYYY-MM-DD". */
export function toDayInput(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function readDayRangeFromDom(fromId, toId) {
  return {
    from: document.getElementById(fromId)?.value?.trim() ?? "",
    to: document.getElementById(toId)?.value?.trim() ?? "",
  };
}

/** Both ends set and the start after the end. */
export function isInvertedDayRange({ from = "", to = "" } = {}) {
  return Boolean(parseDay(from) && parseDay(to) && from.trim() > to.trim());
}

/** Drop values that are not real days and put the two ends in order. */
export function normalizeDayRange({ from = "", to = "" } = {}) {
  let start = parseDay(from) ? from.trim() : "";
  let end = parseDay(to) ? to.trim() : "";
  // YYYY-MM-DD sorts the same as the dates it names.
  if (start && end && start > end) [start, end] = [end, start];
  return { from: start, to: end };
}

export function hasDayRange(range) {
  const { from, to } = normalizeDayRange(range);
  return Boolean(from || to);
}

/**
 * Inclusive unix-second bounds for a day range, or null when neither end is
 * set. A missing end leaves that side open.
 */
export function dayRangeBounds(range) {
  const { from, to } = normalizeDayRange(range);
  if (!from && !to) return null;
  return {
    fromUnix: from ? dayStartUnix(from) : null,
    toUnix: to ? dayEndUnix(to) : null,
  };
}

/** Whether a match start time falls inside the bounds (null bounds keep everything). */
export function isWithinBounds(unixSeconds, bounds) {
  if (!bounds) return true;
  if (typeof unixSeconds !== "number") return false;
  if (bounds.fromUnix != null && unixSeconds < bounds.fromUnix) return false;
  if (bounds.toUnix != null && unixSeconds > bounds.toUnix) return false;
  return true;
}

/**
 * First and last index of the ascending `times` that fall inside the bounds,
 * or null when no bounds are set or nothing falls inside them.
 */
export function indexRangeForBounds(times, bounds) {
  if (!bounds) return null;
  let start = -1;
  let end = -1;
  times.forEach((time, i) => {
    if (!isWithinBounds(time, bounds)) return;
    if (start < 0) start = i;
    end = i;
  });
  return start < 0 ? null : { start, end };
}

function formatDay(value) {
  return parseDay(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Sep 1, 2026 – Sep 20, 2026", "since Sep 1, 2026", "until …", or "" when unset. */
export function formatDayRange(range) {
  const { from, to } = normalizeDayRange(range);
  if (from && to) return from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`;
  if (from) return `since ${formatDay(from)}`;
  if (to) return `until ${formatDay(to)}`;
  return "";
}

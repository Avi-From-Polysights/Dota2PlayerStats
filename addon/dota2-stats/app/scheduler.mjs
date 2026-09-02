/**
 * Minimal 5-field cron scheduler (minute hour day-of-month month day-of-week).
 * Supports *, lists, ranges and steps — enough for "every Monday at 05:00"
 * without pulling in a dependency.
 */
import fs from "node:fs/promises";
import path from "node:path";

const FIELD_RANGES = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday)
];

const TICK_MS = 30_000;
const MAX_LOOKAHEAD_MINUTES = 366 * 24 * 60;

function parseField(spec, [min, max]) {
  const allowed = new Set();

  for (const part of String(spec).split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Invalid cron step in "${part}"`);
    }

    let start = min;
    let end = max;

    if (rangePart !== "*") {
      const bounds = rangePart.split("-");
      start = Number(bounds[0]);
      end = bounds.length > 1 ? Number(bounds[1]) : start;
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error(`Invalid cron range in "${part}"`);
      }
      if (start < min || end > max || start > end) {
        throw new Error(`Cron value out of range in "${part}"`);
      }
      if (bounds.length === 1 && !stepPart) {
        allowed.add(start);
        continue;
      }
    }

    for (let value = start; value <= end; value += step) allowed.add(value);
  }

  if (!allowed.size) throw new Error(`Empty cron field "${spec}"`);
  return allowed;
}

export function parseCron(expression) {
  const fields = String(expression).trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Cron needs 5 fields (got ${fields.length}): "${expression}"`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields.map((spec, i) =>
    parseField(spec, FIELD_RANGES[i])
  );

  return {
    expression,
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
    domRestricted: fields[2] !== "*",
    dowRestricted: fields[4] !== "*",
  };
}

export function cronMatches(cron, date) {
  if (!cron.minute.has(date.getMinutes())) return false;
  if (!cron.hour.has(date.getHours())) return false;
  if (!cron.month.has(date.getMonth() + 1)) return false;

  const domHit = cron.dayOfMonth.has(date.getDate());
  const dowHit = cron.dayOfWeek.has(date.getDay());

  // Standard cron: when both day fields are restricted, either one matching wins.
  if (cron.domRestricted && cron.dowRestricted) return domHit || dowHit;
  if (cron.domRestricted) return domHit;
  if (cron.dowRestricted) return dowHit;
  return true;
}

export function nextCronRun(cron, from = new Date()) {
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  for (let i = 0; i < MAX_LOOKAHEAD_MINUTES; i += 1) {
    if (cronMatches(cron, cursor)) return new Date(cursor.getTime());
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}

export function createStateStore(dataDir) {
  const file = path.join(path.resolve(dataDir), "state.json");
  let cache = null;

  return {
    async read() {
      if (cache) return cache;
      try {
        cache = JSON.parse(await fs.readFile(file, "utf8"));
      } catch {
        cache = {};
      }
      return cache;
    },
    async write(patch) {
      const current = await this.read();
      cache = { ...current, ...patch };
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(cache, null, 2), "utf8");
      return cache;
    },
  };
}

export function createScheduler({ expression, onFire, log }) {
  let cron = null;
  let timer = null;
  let nextAt = null;

  try {
    cron = parseCron(expression);
  } catch (error) {
    log?.warn(`Invalid schedule "${expression}": ${error.message} — scheduled runs disabled`);
  }

  function reschedule(from = new Date()) {
    if (!cron) return null;
    const next = nextCronRun(cron, from);
    nextAt = next;
    return next;
  }

  async function tick() {
    if (!cron) return;

    if (nextAt && Date.now() >= nextAt.getTime()) {
      reschedule(new Date());
      try {
        await onFire();
      } catch (error) {
        if (error?.name !== "AbortError") {
          log?.warn(`Scheduled run failed: ${error.message ?? error}`);
        }
      }
    }
  }

  return {
    start() {
      if (!cron) return;
      reschedule();
      log?.info(`Schedule "${expression}" — next run ${nextAt?.toISOString() ?? "never"}`);
      timer = setInterval(() => {
        tick().catch(() => {});
      }, TICK_MS);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    nextRunAt() {
      return nextAt;
    },
    valid() {
      return Boolean(cron);
    },
  };
}

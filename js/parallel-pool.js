/**
 * Run async work over items with a fixed number of concurrent worker slots.
 * Each slot gets a stable workerId (0 .. concurrency-1) for logging.
 */
export async function runPool(items, workerFn, { concurrency = 1, signal } = {}) {
  if (!items.length) return [];

  const slots = Math.min(Math.max(1, concurrency), items.length);
  const results = new Array(items.length);
  let nextIndex = 0;
  let rejectError = null;

  const runSlot = async (workerId) => {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (rejectError) throw rejectError;

      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      try {
        results[index] = await workerFn(items[index], index, workerId);
      } catch (error) {
        rejectError = error;
        throw error;
      }
    }
  };

  await Promise.all(Array.from({ length: slots }, (_, workerId) => runSlot(workerId)));
  return results;
}

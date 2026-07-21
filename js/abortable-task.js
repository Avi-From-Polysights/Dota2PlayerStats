/**
 * Tracks one abortable operation without leaving a completed operation marked active.
 */
export function createAbortableTask() {
  let controller = null;

  return {
    start() {
      controller?.abort();
      controller = new AbortController();
      return controller.signal;
    },

    finish(signal) {
      if (controller?.signal === signal) controller = null;
    },

    activeSignal() {
      return controller && !controller.signal.aborted ? controller.signal : null;
    },

    abort() {
      controller?.abort();
      controller = null;
    },
  };
}

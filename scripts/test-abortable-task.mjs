import { createAbortableTask } from "../js/abortable-task.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const task = createAbortableTask();
assert(task.activeSignal() === null, "new task should be inactive");

const first = task.start();
assert(task.activeSignal() === first, "started task should expose its active signal");

const second = task.start();
assert(first.aborted, "starting a replacement should abort the previous task");
assert(task.activeSignal() === second, "replacement task should be active");

task.finish(first);
assert(
  task.activeSignal() === second,
  "finishing a stale task must not clear the current operation"
);

task.finish(second);
assert(
  task.activeSignal() === null,
  "completed analysis must release the parser-tool lock"
);

console.log("abortable-task tests passed.");

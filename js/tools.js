import { initParseAllTool, initFullHistoryParseTool } from "./tools/parse-all.js";
import { initRetryFailedTool } from "./tools/retry-failed.js";

export function initTools({ getAnalyzeAbortSignal }) {
  initParseAllTool({ getAnalyzeAbortSignal });
  initFullHistoryParseTool({ getAnalyzeAbortSignal });
  initRetryFailedTool({ getAnalyzeAbortSignal });
}

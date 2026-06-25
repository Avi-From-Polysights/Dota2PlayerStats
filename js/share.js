import { applyLaneFiltersToDom } from "./lane-filters.js";
import { captureFormConfig, FORM_DEFAULTS } from "./form-config.js";

export { FORM_DEFAULTS as DEFAULTS };

export function readFormParams() {
  return captureFormConfig();
}

export function buildShareUrl(params, { autoRun = false } = {}) {
  const base = window.location.href.split("?")[0].split("#")[0];
  const url = new URL(base);

  if (params.account) url.searchParams.set("account", params.account);
  if (params.hero) url.searchParams.set("hero", params.hero);

  if (params.limit && params.limit !== FORM_DEFAULTS.limit) {
    url.searchParams.set("limit", params.limit);
  }
  if (params.delay && params.delay !== FORM_DEFAULTS.delay) {
    url.searchParams.set("delay", params.delay);
  }
  if (params.sig === "1") url.searchParams.set("sig", "1");
  if (params.conf && params.conf !== FORM_DEFAULTS.conf) {
    url.searchParams.set("conf", params.conf);
  }
  if (params.patch) url.searchParams.set("patch", params.patch);
  if (params.window && params.window !== FORM_DEFAULTS.window) {
    url.searchParams.set("window", params.window);
  }
  if (params.turbo === "1") url.searchParams.set("turbo", "1");
  if (params.parse === "0") url.searchParams.set("parse", "0");
  if (params.parsemax && params.parsemax !== FORM_DEFAULTS.parsemax) {
    url.searchParams.set("parsemax", params.parsemax);
  }
  if (params.parseparallel === "1") url.searchParams.set("parseparallel", "1");
  if (params.parseparallelism && params.parseparallelism !== FORM_DEFAULTS.parseparallelism) {
    url.searchParams.set("parselanes", params.parseparallelism);
  }
  if (params.parseretry === "1") url.searchParams.set("parseretry", "1");
  if (params.parsemaxretries && params.parsemaxretries !== FORM_DEFAULTS.parsemaxretries) {
    url.searchParams.set("parsemaxretries", params.parsemaxretries);
  }
  if (params.mylane) url.searchParams.set("mylane", params.mylane);
  if (params.myrole) url.searchParams.set("myrole", params.myrole);
  if (params.enemylane) url.searchParams.set("enemylane", params.enemylane);
  if (params.enemyrole) url.searchParams.set("enemyrole", params.enemyrole);
  if (params.stratz === "1") url.searchParams.set("stratz", "1");
  if (autoRun) url.searchParams.set("run", "1");

  return url.toString();
}

export function applyUrlParams(heroes) {
  const params = new URLSearchParams(window.location.search);
  if (!params.toString()) return { shouldAutoRun: false, hasParams: false };

  const heroById = new Map(heroes.map((h) => [String(h.id), h]));
  let hasParams = false;

  if (params.has("account")) {
    document.getElementById("account-id").value = params.get("account");
    hasParams = true;
  }

  if (params.has("hero")) {
    const heroId = params.get("hero");
    const hero = heroById.get(heroId);
    document.getElementById("hero-id").value = heroId;
    if (hero) {
      document.getElementById("hero-search").value = hero.name;
    }
    hasParams = true;
  }

  if (params.has("limit")) {
    document.getElementById("match-limit").value = params.get("limit");
    hasParams = true;
  }
  if (params.has("delay")) {
    document.getElementById("request-delay").value = params.get("delay");
    hasParams = true;
  }
  if (params.has("sig")) {
    document.getElementById("significant-only").checked = params.get("sig") === "1";
    hasParams = true;
  }
  if (params.has("conf")) {
    document.getElementById("confidence-level").value = params.get("conf");
    hasParams = true;
  }
  if (params.has("patch")) {
    document.getElementById("patch-filter").value = params.get("patch");
    hasParams = true;
  }
  if (params.has("window")) {
    document.getElementById("rolling-window").value = params.get("window");
    hasParams = true;
  }
  if (params.has("turbo")) {
    document.getElementById("exclude-turbo").checked = params.get("turbo") !== "1";
    hasParams = true;
  }
  if (params.has("parse")) {
    document.getElementById("request-parse").checked = params.get("parse") !== "0";
    document.getElementById("request-parse")?.dispatchEvent(new Event("change"));
    hasParams = true;
  }
  if (params.has("parsemax")) {
    document.getElementById("parse-max").value = params.get("parsemax");
    hasParams = true;
  }
  if (params.has("parseparallel")) {
    const el = document.getElementById("parse-parallel-enabled");
    el.checked = params.get("parseparallel") === "1";
    el?.dispatchEvent(new Event("change"));
    hasParams = true;
  }
  if (params.has("parselanes")) {
    document.getElementById("parse-parallelism").value = params.get("parselanes");
    hasParams = true;
  }
  if (params.has("parseretry")) {
    const el = document.getElementById("parse-retry");
    el.checked = params.get("parseretry") === "1";
    el?.dispatchEvent(new Event("change"));
    hasParams = true;
  }
  if (params.has("parsemaxretries")) {
    document.getElementById("parse-max-retries").value = params.get("parsemaxretries");
    hasParams = true;
  }
  if (params.has("stratz")) {
    const el = document.getElementById("stratz-fallback");
    el.checked = params.get("stratz") === "1";
    el?.dispatchEvent(new Event("change"));
    hasParams = true;
  }

  const laneFromUrl = {
    myLane: params.get("mylane") ?? "",
    myRole: params.get("myrole") ?? "",
    enemyLane: params.get("enemylane") ?? "",
    enemyRole: params.get("enemyrole") ?? "",
  };
  if (params.has("mylane") || params.has("myrole") || params.has("enemylane") || params.has("enemyrole")) {
    applyLaneFiltersToDom(laneFromUrl);
    hasParams = true;
  }

  return {
    hasParams,
    shouldAutoRun: params.get("run") === "1",
  };
}

export function syncUrlFromForm() {
  const url = buildShareUrl(readFormParams());
  window.history.replaceState(null, "", url);
}

export async function copyShareLink() {
  const url = buildShareUrl(readFormParams());
  await navigator.clipboard.writeText(url);
  syncUrlFromForm();
  return url;
}

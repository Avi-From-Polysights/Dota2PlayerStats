import { readLaneFiltersFromDom, applyLaneFiltersToDom } from "./lane-filters.js";

const DEFAULTS = {
  limit: "100",
  delay: "150",
  conf: "0.95",
  window: "20",
  sig: "0",
  patch: "",
  turbo: "0",
  parse: "0",
  parsemax: "0",
};

export function readFormParams() {
  const laneFilters = readLaneFiltersFromDom();
  return {
    account: document.getElementById("account-id").value.trim(),
    hero: document.getElementById("hero-id").value.trim(),
    limit: document.getElementById("match-limit").value,
    delay: document.getElementById("request-delay").value,
    sig: document.getElementById("significant-only").checked ? "1" : "0",
    conf: document.getElementById("confidence-level").value,
    patch: document.getElementById("patch-filter").value,
    window: document.getElementById("rolling-window").value,
    turbo: document.getElementById("exclude-turbo").checked ? "0" : "1",
    parse: document.getElementById("request-parse").checked ? "1" : "0",
    parsemax: document.getElementById("parse-max").value,
    mylane: laneFilters.myLane,
    myrole: laneFilters.myRole,
    enemylane: laneFilters.enemyLane,
    enemyrole: laneFilters.enemyRole,
  };
}

export function buildShareUrl(params, { autoRun = false } = {}) {
  const base = window.location.href.split("?")[0].split("#")[0];
  const url = new URL(base);

  if (params.account) url.searchParams.set("account", params.account);
  if (params.hero) url.searchParams.set("hero", params.hero);

  if (params.limit && params.limit !== DEFAULTS.limit) {
    url.searchParams.set("limit", params.limit);
  }
  if (params.delay && params.delay !== DEFAULTS.delay) {
    url.searchParams.set("delay", params.delay);
  }
  if (params.sig === "1") url.searchParams.set("sig", "1");
  if (params.conf && params.conf !== DEFAULTS.conf) {
    url.searchParams.set("conf", params.conf);
  }
  if (params.patch) url.searchParams.set("patch", params.patch);
  if (params.window && params.window !== DEFAULTS.window) {
    url.searchParams.set("window", params.window);
  }
  if (params.turbo === "1") url.searchParams.set("turbo", "1");
  if (params.parse === "1") url.searchParams.set("parse", "1");
  if (params.parsemax && params.parsemax !== DEFAULTS.parsemax) {
    url.searchParams.set("parsemax", params.parsemax);
  }
  if (params.mylane) url.searchParams.set("mylane", params.mylane);
  if (params.myrole) url.searchParams.set("myrole", params.myrole);
  if (params.enemylane) url.searchParams.set("enemylane", params.enemylane);
  if (params.enemyrole) url.searchParams.set("enemyrole", params.enemyrole);
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
    document.getElementById("request-parse").checked = params.get("parse") === "1";
    hasParams = true;
  }
  if (params.has("parsemax")) {
    document.getElementById("parse-max").value = params.get("parsemax");
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

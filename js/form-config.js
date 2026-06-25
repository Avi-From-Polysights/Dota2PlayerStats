import { applyLaneFiltersToDom, readLaneFiltersFromDom } from "./lane-filters.js";

export const FORM_DEFAULTS = {
  limit: "250",
  delay: "150",
  conf: "0.95",
  window: "20",
  sig: "0",
  patch: "",
  turbo: "0",
  parse: "1",
  parsemax: "0",
  parseparallel: "0",
  parseparallelism: "6",
  parseretry: "0",
  parsemaxretries: "2",
  stratz: "0",
};

export function captureFormConfig() {
  const laneFilters = readLaneFiltersFromDom();
  return {
    account: document.getElementById("account-id")?.value?.trim() ?? "",
    hero: document.getElementById("hero-id")?.value?.trim() ?? "",
    heroName: document.getElementById("hero-search")?.value?.trim() ?? "",
    limit: document.getElementById("match-limit")?.value ?? FORM_DEFAULTS.limit,
    delay: document.getElementById("request-delay")?.value ?? FORM_DEFAULTS.delay,
    sig: document.getElementById("significant-only")?.checked ? "1" : "0",
    conf: document.getElementById("confidence-level")?.value ?? FORM_DEFAULTS.conf,
    patch: document.getElementById("patch-filter")?.value ?? "",
    window: document.getElementById("rolling-window")?.value ?? FORM_DEFAULTS.window,
    turbo: document.getElementById("exclude-turbo")?.checked ? "0" : "1",
    parse: document.getElementById("request-parse")?.checked ? "1" : "0",
    parsemax: document.getElementById("parse-max")?.value ?? FORM_DEFAULTS.parsemax,
    parseparallel: document.getElementById("parse-parallel-enabled")?.checked ? "1" : "0",
    parseparallelism: document.getElementById("parse-parallelism")?.value ?? FORM_DEFAULTS.parseparallelism,
    parseretry: document.getElementById("parse-retry")?.checked ? "1" : "0",
    parsemaxretries: document.getElementById("parse-max-retries")?.value ?? FORM_DEFAULTS.parsemaxretries,
    stratz: document.getElementById("stratz-fallback")?.checked ? "1" : "0",
    mylane: laneFilters.myLane,
    myrole: laneFilters.myRole,
    enemylane: laneFilters.enemyLane,
    enemyrole: laneFilters.enemyRole,
  };
}

function setCheckbox(id, checked) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) return;
  el.checked = checked;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
    el.value = value ?? "";
  }
}

/** @returns {boolean} whether any field was applied */
export function applyFormConfig(values, { heroes = [], heroPicker = null } = {}) {
  if (!values || typeof values !== "object") return false;

  if (values.account != null) setValue("account-id", values.account);

  if (values.limit != null) setValue("match-limit", values.limit);
  if (values.delay != null) setValue("request-delay", values.delay);
  if (values.conf != null) setValue("confidence-level", values.conf);
  if (values.patch != null) setValue("patch-filter", values.patch);
  if (values.window != null) setValue("rolling-window", values.window);
  if (values.parsemax != null) setValue("parse-max", values.parsemax);
  if (values.parseparallelism != null) setValue("parse-parallelism", values.parseparallelism);
  if (values.parsemaxretries != null) setValue("parse-max-retries", values.parsemaxretries);

  if (values.turbo != null) setCheckbox("exclude-turbo", values.turbo !== "1");
  if (values.sig != null) setCheckbox("significant-only", values.sig === "1");
  if (values.parse != null) setCheckbox("request-parse", values.parse === "1");
  if (values.parseparallel != null) {
    setCheckbox("parse-parallel-enabled", values.parseparallel === "1");
  }
  if (values.parseretry != null) setCheckbox("parse-retry", values.parseretry === "1");
  if (values.stratz != null) setCheckbox("stratz-fallback", values.stratz === "1");

  applyLaneFiltersToDom({
    myLane: values.mylane ?? "",
    myRole: values.myrole ?? "",
    enemyLane: values.enemylane ?? "",
    enemyRole: values.enemyrole ?? "",
  });

  if (values.hero) {
    setValue("hero-id", values.hero);
    const hero = heroes.find((h) => String(h.id) === String(values.hero));
    if (hero) {
      setValue("hero-search", hero.name);
    } else if (values.heroName) {
      setValue("hero-search", values.heroName);
    }
    heroPicker?.resolveHeroId?.({ fuzzy: true });
  }

  return true;
}

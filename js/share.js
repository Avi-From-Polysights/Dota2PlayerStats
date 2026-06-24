const DEFAULTS = {
  limit: "100",
  delay: "150",
  conf: "0.95",
  window: "20",
  sig: "0",
  patch: "",
};

export function readFormParams() {
  return {
    account: document.getElementById("account-id").value.trim(),
    hero: document.getElementById("hero-id").value.trim(),
    limit: document.getElementById("match-limit").value,
    delay: document.getElementById("request-delay").value,
    sig: document.getElementById("significant-only").checked ? "1" : "0",
    conf: document.getElementById("confidence-level").value,
    patch: document.getElementById("patch-filter").value,
    window: document.getElementById("rolling-window").value,
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

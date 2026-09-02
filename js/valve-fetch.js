/**
 * Same-origin bundled Valve data (built at deploy) + optional direct fetch for local dev.
 */

let bundledLoader = null;

/**
 * Override how bundled JSON is read (Node reads it off disk; the browser fetches
 * it same-origin from /data). Pass null to restore the default.
 */
export function setBundledDataLoader(loader) {
  bundledLoader = typeof loader === "function" ? loader : null;
}

export function bundledDataUrl(relativePath) {
  if (typeof window === "undefined") return null;
  const page = window.location.href.split("#")[0];
  const base = page.endsWith("/") ? page : `${page.replace(/\/[^/]*$/, "")}/`;
  return new URL(relativePath, base).href;
}

/** Load JSON from /data/ on this site (no CORS). Returns null if missing. */
export async function fetchBundledJson(relativePath, { signal } = {}) {
  if (bundledLoader) {
    try {
      return (await bundledLoader(relativePath)) ?? null;
    } catch {
      return null;
    }
  }

  try {
    const url = bundledDataUrl(`data/${relativePath}`);
    if (!url) return null;
    const response = await fetch(url, { signal, cache: "default" });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export function valveDatafeedUrl(path, params = {}) {
  const url = new URL(`https://www.dota2.com/datafeed/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/** Direct Valve fetch — works in Node/tests; usually blocked in browser. */
export async function fetchValveJson(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

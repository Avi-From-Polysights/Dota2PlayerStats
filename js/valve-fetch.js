/**
 * Fetch JSON from Valve's datafeed in the browser (CORS-safe via proxy fallback).
 */
const PROXY_URL = (target) =>
  `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;

export async function fetchValveJson(url, { signal } = {}) {
  try {
    const response = await fetch(url, { signal });
    if (response.ok) return response.json();
  } catch {
    // direct fetch blocked (typical on GitHub Pages — no ACAO header)
  }

  const response = await fetch(PROXY_URL(url), { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status} for Valve data`);
  return response.json();
}

export function valveDatafeedUrl(path, params = {}) {
  const url = new URL(`https://www.dota2.com/datafeed/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

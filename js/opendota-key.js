/**
 * Optional OpenDota API key. Without one the free tier allows 60 weighted
 * requests/min; a key raises that to 1200/min, which is the difference between
 * ~5 and ~120 replay parses per minute.
 */
import { OPENDOTA_KEYED_LIMIT, OPENDOTA_LIMIT, setOpenDotaLimit } from "./rate-limit.js";

let apiKey = "";

export function setOpenDotaApiKey(key) {
  apiKey = typeof key === "string" ? key.trim() : "";
  setOpenDotaLimit(apiKey ? OPENDOTA_KEYED_LIMIT : OPENDOTA_LIMIT);
  return Boolean(apiKey);
}

export function hasOpenDotaApiKey() {
  return Boolean(apiKey);
}

/** Append api_key to an OpenDota URL (no-op when unset). */
export function withOpenDotaKey(url) {
  if (!apiKey) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}api_key=${encodeURIComponent(apiKey)}`;
}

const STORAGE_KEY = "d2ps-stratz-token";

export function readStratzTokenFromStorage() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeStratzTokenToStorage(token) {
  try {
    const value = token?.trim() ?? "";
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode / blocked storage
  }
}

/** Prefer typed value, then localStorage (survives reload / share links). */
export function resolveStratzToken(tokenInput = document.getElementById("stratz-api-token")) {
  const fromInput = tokenInput?.value?.trim() ?? "";
  if (fromInput) return fromInput;
  return readStratzTokenFromStorage().trim();
}

export function syncStratzTokenToInput() {
  const tokenInput = document.getElementById("stratz-api-token");
  if (!(tokenInput instanceof HTMLInputElement)) return;
  const stored = readStratzTokenFromStorage().trim();
  if (stored && !tokenInput.value.trim()) {
    tokenInput.value = stored;
  }
}

export function readStratzSettingsFromDom() {
  const enabled = document.getElementById("stratz-fallback")?.checked ?? false;
  return { enabled, token: resolveStratzToken() };
}

export function initStratzTokenPersistence() {
  const tokenInput = document.getElementById("stratz-api-token");
  const checkbox = document.getElementById("stratz-fallback");
  if (!(tokenInput instanceof HTMLInputElement)) return;

  syncStratzTokenToInput();

  const persist = () => writeStratzTokenToStorage(tokenInput.value);
  tokenInput.addEventListener("input", persist);
  tokenInput.addEventListener("change", persist);
  tokenInput.addEventListener("blur", persist);
  checkbox?.addEventListener("change", () => {
    if (checkbox.checked) {
      syncStratzTokenToInput();
      persist();
    }
  });
}

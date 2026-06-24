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

export function readStratzSettingsFromDom() {
  const enabled = document.getElementById("stratz-fallback")?.checked ?? false;
  const tokenInput = document.getElementById("stratz-api-token");
  const token = tokenInput?.value?.trim() || readStratzTokenFromStorage();
  return { enabled, token };
}

export function initStratzTokenPersistence() {
  const tokenInput = document.getElementById("stratz-api-token");
  const checkbox = document.getElementById("stratz-fallback");
  if (!tokenInput) return;

  const saved = readStratzTokenFromStorage();
  if (saved) tokenInput.value = saved;

  tokenInput.addEventListener("change", () => writeStratzTokenToStorage(tokenInput.value));
  tokenInput.addEventListener("blur", () => writeStratzTokenToStorage(tokenInput.value));
  checkbox?.addEventListener("change", () => {
    if (checkbox.checked) writeStratzTokenToStorage(tokenInput.value);
  });
}

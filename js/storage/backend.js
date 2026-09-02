/**
 * Pluggable cache backend so the analytics core runs in the browser (IndexedDB)
 * and in Node (filesystem, Home Assistant app) without changing callers.
 *
 * The IndexedDB backend is loaded lazily via dynamic import so Node never pulls
 * db.js into the module graph.
 */

let backend = null;
let resolving = null;

/** Inject a backend (Node app calls this at boot). */
export function setStorageBackend(next) {
  backend = next;
  resolving = null;
}

export function getStorageBackendSync() {
  return backend;
}

export async function getStorageBackend() {
  if (backend) return backend;

  if (!resolving) {
    if (typeof indexedDB === "undefined") {
      throw new Error(
        "No storage backend registered — call setStorageBackend() before using the cache."
      );
    }
    resolving = import("./indexeddb-backend.js").then((mod) => {
      backend = mod.createIndexedDbBackend();
      return backend;
    });
  }

  return resolving;
}

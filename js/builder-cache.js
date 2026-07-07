import { HERO_BUILDS_STORE, openDb } from "./db.js";

export async function listBuilds() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HERO_BUILDS_STORE, "readonly");
    const request = tx.objectStore(HERO_BUILDS_STORE).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const rows = request.result ?? [];
      rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      resolve(rows);
    };
  });
}

export async function getBuild(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HERO_BUILDS_STORE, "readonly");
    const request = tx.objectStore(HERO_BUILDS_STORE).get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? null);
  });
}

export async function saveBuild(build) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(HERO_BUILDS_STORE, "readwrite");
    tx.objectStore(HERO_BUILDS_STORE).put(build);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return build;
}

export async function deleteBuild(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(HERO_BUILDS_STORE, "readwrite");
    tx.objectStore(HERO_BUILDS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listBuildsForHero(heroId) {
  const all = await listBuilds();
  return all.filter((b) => b.heroId === Number(heroId));
}

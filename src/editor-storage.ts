import { parseWorld, type WorldDefinition } from './world-data';
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('little-world-editor', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('drafts');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveLocal(d: WorldDefinition): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(d, 'main');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function loadLocal(): Promise<WorldDefinition | null> {
  const db = await openDb();
  try {
    const v = await new Promise<unknown>((resolve, reject) => {
      const r = db
        .transaction('drafts', 'readonly')
        .objectStore('drafts')
        .get('main');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return v ? parseWorld(v) : null;
  } finally {
    db.close();
  }
}

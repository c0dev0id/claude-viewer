const DB_NAME = 'jasnl-viewer';
const DB_VERSION = 1;
const STORE = 'sessions';
const KEY = 'current';

const dbReady = new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = e => {
    e.target.result.createObjectStore(STORE, { keyPath: 'id' });
  };
  req.onsuccess = e => resolve(e.target.result);
  req.onerror = e => reject(e.target.error);
}).catch(() => null);

export async function saveSession(rawText) {
  const db = await dbReady;
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id: KEY, text: rawText });
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

export async function loadSession() {
  const db = await dbReady;
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = e => resolve(e.target.result?.text ?? null);
    req.onerror = e => reject(e.target.error);
  });
}

export async function clearSession() {
  const db = await dbReady;
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

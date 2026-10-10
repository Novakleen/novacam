/**
 * Capture session persistence. Blobs live in IndexedDB.
 * Data URLs are never written to localStorage.
 */

const DB_NAME = 'novacam-photo-session';
const STORE = 'photos';
const LEGACY_LOCAL_KEY = 'novakleen_capture_session';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTx(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const result = run(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('IndexedDB aborted'));
      })
  );
}

export function clearLegacyCaptureLocalStorage() {
  try {
    localStorage.removeItem(LEGACY_LOCAL_KEY);
  } catch {
    /* private mode */
  }
}

export async function saveCaptureRecord(record) {
  await runTx('readwrite', (store) => store.put(record));
}

export async function deleteCaptureRecord(id) {
  await runTx('readwrite', (store) => store.delete(id));
}

export async function listCaptureRecords() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function clearCaptureRecords() {
  await runTx('readwrite', (store) => store.clear());
}

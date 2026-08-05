const DB_NAME = 'tratamiento-frio-offline';
const DB_VERSION = 1;
const STORES = ['evaluations', 'chambers', 'protocolos_sag', 'sync_queue'];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORES.forEach(name => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  return dbPromise;
}

function run(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    fn(tx.objectStore(storeName));
  }));
}

function read(storeName, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = fn(tx.objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export async function upsert(storeName, data) {
  await run(storeName, 'readwrite', store => store.put(data));
}

export async function remove(storeName, id) {
  await run(storeName, 'readwrite', store => store.delete(id));
}

export async function clear(storeName) {
  await run(storeName, 'readwrite', store => store.clear());
}

export async function get(storeName, id) {
  return read(storeName, store => store.get(id));
}

export async function getAll(storeName) {
  return read(storeName, store => store.getAll());
}

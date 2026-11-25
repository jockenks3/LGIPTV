// IndexedDB schema shared by the main thread and the parser Web Worker.
// NOTE: IDBObjectStore.getAll() is IndexedDB 2.0 (Chrome 48) and is NOT used;
// everything is cursor based so it works on Chromium 38.

export const DB_NAME = "streamplayer";
export const DB_VERSION = 1;

export function openDb(): Promise<IDBDatabase> {
  return new Promise(function (resolve, reject) {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function () {
      const db = req.result;
      const items = db.createObjectStore("items", { keyPath: "id", autoIncrement: true });
      items.createIndex("byPl", "pid");
      items.createIndex("byKind", ["pid", "kind"]);
      items.createIndex("byGroup", ["pid", "kind", "group"]);
      items.createIndex("byAdult", ["pid", "kind", "adult"]);
      const groups = db.createObjectStore("groups", { keyPath: "key" });
      groups.createIndex("byKind", ["pid", "kind"]);
      db.createObjectStore("playlists", { keyPath: "id" });
      const epg = db.createObjectStore("epg", { keyPath: "id", autoIncrement: true });
      epg.createIndex("byCh", ["ch", "start"]);
      epg.createIndex("byStop", "stop");
      db.createObjectStore("favs", { keyPath: "uid" });
    };
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      reject(req.error || new Error("IndexedDB unavailable"));
    };
    req.onblocked = function () {
      reject(new Error("IndexedDB blocked"));
    };
  });
}

/** Batch insert (one transaction per call, ~500 records per batch). */
export function putAll(db: IDBDatabase, store: string, records: any[]): Promise<void> {
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    for (let i = 0; i < records.length; i++) os.put(records[i]);
    tx.oncomplete = function () {
      resolve();
    };
    tx.onerror = function () {
      reject(tx.error);
    };
    tx.onabort = function () {
      reject(tx.error || new Error("Transaction aborted"));
    };
  });
}

export function clearStore(db: IDBDatabase, store: string): Promise<void> {
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = function () {
      resolve();
    };
    tx.onerror = function () {
      reject(tx.error);
    };
  });
}

/** Removes all items + groups of one playlist using cursors. */
export function clearPlaylistData(db: IDBDatabase, pid: string): Promise<void> {
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(["items", "groups"], "readwrite");
    const req = tx.objectStore("items").index("byPl").openCursor(IDBKeyRange.only(pid));
    req.onsuccess = function () {
      const c = req.result;
      if (c) {
        c.delete();
        c.continue();
      }
    };
    tx.objectStore("groups").delete(IDBKeyRange.bound(pid + "|", pid + "|\uffff"));
    tx.oncomplete = function () {
      resolve();
    };
    tx.onerror = function () {
      reject(tx.error);
    };
    tx.onabort = function () {
      reject(tx.error || new Error("Transaction aborted"));
    };
  });
}

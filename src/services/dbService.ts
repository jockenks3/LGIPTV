// Main-thread IndexedDB access. All reads are cursor based (no getAll) and
// designed for windowed access: ListSource.getRange(offset, limit).
import { clearPlaylistData, clearStore, openDb, putAll } from "./dbSchema";
import type { Counts, Group, Item, Kind, ListSource, Playlist, Programme } from "../types";

let dbp: Promise<IDBDatabase> | null = null;
export function db(): Promise<IDBDatabase> {
  if (!dbp) dbp = openDb();
  return dbp;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise(function (resolve, reject) {
    r.onsuccess = function () {
      resolve(r.result);
    };
    r.onerror = function () {
      reject(r.error);
    };
  });
}

function readRange<T>(
  src: IDBObjectStore | IDBIndex,
  range: IDBKeyRange | undefined,
  offset: number,
  limit: number,
  filter?: (v: T) => boolean
): Promise<T[]> {
  return new Promise(function (resolve, reject) {
    const out: T[] = [];
    const r = src.openCursor(range);
    let skipped = offset === 0;
    r.onsuccess = function () {
      const c = r.result;
      if (!c) return resolve(out);
      if (!skipped) {
        skipped = true;
        c.advance(offset);
        return;
      }
      if (!filter || filter(c.value)) out.push(c.value);
      if (out.length >= limit) return resolve(out);
      c.continue();
    };
    r.onerror = function () {
      reject(r.error);
    };
  });
}

// ------------------------------------------------------------ playlists ----

export async function listPlaylists(): Promise<Playlist[]> {
  const d = await db();
  const list = await readRange<Playlist>(d.transaction("playlists").objectStore("playlists"), undefined, 0, 1000);
  return list.sort(function (a, b) {
    return a.createdAt - b.createdAt;
  });
}

export async function putPlaylist(p: Playlist): Promise<void> {
  await putAll(await db(), "playlists", [p]);
}

export async function deletePlaylist(id: string): Promise<void> {
  const d = await db();
  await clearPlaylistData(d, id);
  const tx = d.transaction("playlists", "readwrite");
  tx.objectStore("playlists").delete(id);
  await new Promise<void>(function (res) {
    tx.oncomplete = function () {
      res();
    };
  });
}

export async function countKinds(pid: string): Promise<Counts> {
  const d = await db();
  const idx = d.transaction("items").objectStore("items").index("byKind");
  const kinds: Kind[] = ["live", "movie", "series"];
  const r = await Promise.all(
    kinds.map(function (k) {
      return req(idx.count(IDBKeyRange.only([pid, k])));
    })
  );
  return { live: r[0], movie: r[1], series: r[2] };
}

export async function listGroups(pid: string, kind: Kind): Promise<Group[]> {
  const d = await db();
  const idx = d.transaction("groups").objectStore("groups").index("byKind");
  const list = await readRange<Group>(idx, IDBKeyRange.only([pid, kind]), 0, 100000);
  return list.sort(function (a, b) {
    return a.ord - b.ord;
  });
}

// ---------------------------------------------------------------- items ----

export interface ItemQuery {
  pid: string;
  kind: Kind;
  group?: string | null;
  hideAdult?: boolean;
  search?: string;
}

export const emptySource: ListSource<any> = {
  total: 0,
  key: "empty",
  getRange: function () {
    return Promise.resolve([]);
  },
};

export function arraySource<T>(arr: T[], key: string): ListSource<T> {
  return {
    total: arr.length,
    key: key,
    getRange: function (o, l) {
      return Promise.resolve(arr.slice(o, o + l));
    },
  };
}

export async function itemQuery(o: ItemQuery): Promise<ListSource<Item>> {
  const d = await db();
  let indexName = "byKind";
  let range = IDBKeyRange.only([o.pid, o.kind]);
  if (o.group) {
    indexName = "byGroup";
    range = IDBKeyRange.only([o.pid, o.kind, o.group]);
  } else if (o.hideAdult) {
    indexName = "byAdult";
    range = IDBKeyRange.only([o.pid, o.kind, 0]);
  }
  const key = JSON.stringify(o);
  const index = function (): IDBIndex {
    return d.transaction("items").objectStore("items").index(indexName);
  };
  const term = (o.search || "").trim().toLowerCase();

  if (!term) {
    const total = await req(index().count(range));
    return {
      total: total,
      key: key,
      getRange: function (offset, limit) {
        return readRange<Item>(index(), range, offset, limit);
      },
    };
  }

  // Search: scan once collecting only ids (cheap), then fetch visible windows.
  const ids: number[] = await new Promise<number[]>(function (resolve, reject) {
    const out: number[] = [];
    const r = index().openCursor(range);
    r.onsuccess = function () {
      const c = r.result;
      if (!c || out.length >= 5000) return resolve(out);
      const it = c.value as Item;
      if (it.name.toLowerCase().indexOf(term) >= 0 && (!o.hideAdult || !it.adult)) out.push(it.id as number);
      c.continue();
    };
    r.onerror = function () {
      reject(r.error);
    };
  });
  return {
    total: ids.length,
    key: key,
    getRange: function (offset, limit) {
      const slice = ids.slice(offset, offset + limit);
      const store = d.transaction("items").objectStore("items");
      return Promise.all(
        slice.map(function (id) {
          return req(store.get(id));
        })
      ) as Promise<Item[]>;
    },
  };
}

// ------------------------------------------------------------ favorites ----

export async function listFavs(): Promise<Item[]> {
  const d = await db();
  return readRange<Item>(d.transaction("favs").objectStore("favs"), undefined, 0, 100000);
}

export async function addFav(item: Item): Promise<void> {
  await putAll(await db(), "favs", [item]);
}

export async function removeFav(uid: string): Promise<void> {
  const d = await db();
  const tx = d.transaction("favs", "readwrite");
  tx.objectStore("favs").delete(uid);
  await new Promise<void>(function (res) {
    tx.oncomplete = function () {
      res();
    };
  });
}

// ------------------------------------------------------------------ EPG ----

export async function getSchedule(ch: string, from: number, to: number): Promise<Programme[]> {
  if (!ch) return [];
  const d = await db();
  const idx = d.transaction("epg").objectStore("epg").index("byCh");
  const list = await readRange<Programme>(idx, IDBKeyRange.bound([ch, from - 8 * 3600000], [ch, to]), 0, 400);
  return list.filter(function (p) {
    return p.stop > from;
  });
}

export async function epgCount(): Promise<number> {
  const d = await db();
  return req(d.transaction("epg").objectStore("epg").count());
}

export async function purgeOldEpg(): Promise<void> {
  const d = await db();
  const tx = d.transaction("epg", "readwrite");
  const r = tx.objectStore("epg").index("byStop").openCursor(IDBKeyRange.upperBound(Date.now() - 24 * 3600000));
  r.onsuccess = function () {
    const c = r.result;
    if (c) {
      c.delete();
      c.continue();
    }
  };
}

export async function clearEpg(): Promise<void> {
  await clearStore(await db(), "epg");
}

export async function clearAllData(): Promise<void> {
  const d = await db();
  for (const s of ["items", "groups", "playlists", "epg", "favs"]) await clearStore(d, s);
}

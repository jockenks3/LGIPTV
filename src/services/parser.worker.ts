// Web Worker: streams + parses M3U/M3U8, Xtream Codes catalogues and XMLTV
// guides and batch-inserts them (500 records / transaction) into IndexedDB,
// keeping main-thread memory flat and the UI responsive.
import "core-js/stable";
import "regenerator-runtime/runtime";
import { clearPlaylistData, clearStore, openDb, putAll } from "./dbSchema";
import { streamText } from "./http";
import { GroupTracker, M3uParser, XmltvParser, hashStr, isAdultName } from "./parserCore";
import * as X from "./xtreamApi";
import type { Counts, ImportJob, Item, Kind, WorkerOut } from "../types";

const ctx: any = self;

function post(m: WorkerOut) {
  ctx.postMessage(m);
}

class Writer {
  private chain: Promise<void> = Promise.resolve();
  private failure: any = null;
  written = 0;
  constructor(private db: IDBDatabase, private store: string) {}
  add(records: any[]) {
    const self_ = this;
    this.chain = this.chain
      .then(function () {
        if (self_.failure) return;
        return putAll(self_.db, self_.store, records).then(function () {
          self_.written += records.length;
        });
      })
      .catch(function (e) {
        self_.failure = e;
      });
  }
  finish(): Promise<void> {
    const self_ = this;
    return this.chain.then(function () {
      if (self_.failure) throw self_.failure;
    });
  }
}

function emptyCounts(): Counts {
  return { live: 0, movie: 0, series: 0 };
}

async function importM3u(job: ImportJob) {
  const db = await openDb();
  await clearPlaylistData(db, job.pid);
  const writer = new Writer(db, "items");
  const counts = emptyCounts();
  const parser = new M3uParser(job.pid, function (items) {
    for (let i = 0; i < items.length; i++) counts[items[i].kind]++;
    writer.add(items);
    post({ type: "progress", stage: "Parsing playlist", count: parser.total });
  });
  if (job.text != null) {
    const text = job.text;
    for (let i = 0; i < text.length; i += 524288) {
      parser.push(text.substring(i, i + 524288));
      await new Promise<void>(function (r) {
        setTimeout(r, 0);
      });
    }
  } else {
    post({ type: "progress", stage: "Downloading playlist", count: 0 });
    await streamText(job.url as string, function (c) {
      parser.push(c);
    });
  }
  parser.end();
  await writer.finish();
  if (parser.total === 0) throw new Error("No playable entries found. Is this a valid M3U/M3U8 playlist?");
  await putAll(db, "groups", parser.groups.records());
  db.close();
  post({ type: "done", counts: counts, epgUrl: parser.epgUrl });
}

function catMap(list: any[], tracker: GroupTracker, kind: Kind): { [id: string]: string } {
  const map: { [id: string]: string } = {};
  for (let i = 0; i < (list || []).length; i++) {
    const c = list[i];
    const name = String(c.category_name || "Uncategorized");
    map[String(c.category_id)] = name;
    tracker.declare_(kind, name);
  }
  return map;
}

async function importXtream(job: ImportJob) {
  const c: X.XtreamCreds = { host: job.host as string, username: job.username as string, password: job.password as string };
  post({ type: "progress", stage: "Signing in", count: 0 });
  const auth = await X.authenticate(c);
  const db = await openDb();
  await clearPlaylistData(db, job.pid);
  const writer = new Writer(db, "items");
  const tracker = new GroupTracker(job.pid);
  const counts = emptyCounts();
  let total = 0;

  async function ingest(
    kind: Kind,
    stage: string,
    cats: () => Promise<any[]>,
    streams: () => Promise<any[]>,
    map: (s: any, group: string) => Item
  ) {
    post({ type: "progress", stage: stage, count: total });
    let categories: any[] = [];
    try {
      categories = await cats();
    } catch (e) {
      categories = [];
    }
    const names = catMap(categories, tracker, kind);
    let list: any[] = [];
    try {
      list = await streams();
    } catch (e) {
      if (kind === "live") throw e;
      list = [];
    }
    if (!(list instanceof Array)) list = [];
    let batch: Item[] = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const group = names[String(s.category_id)] || "Uncategorized";
      const item = map(s, group);
      tracker.add(kind, group);
      counts[kind]++;
      total++;
      batch.push(item);
      if (batch.length >= 500) {
        writer.add(batch);
        batch = [];
        post({ type: "progress", stage: stage, count: total });
      }
    }
    if (batch.length) writer.add(batch);
    list = [];
  }

  await ingest("live", "Loading live channels", () => X.getLiveCategories(c), () => X.getLiveStreams(c), function (s, g) {
    return {
      pid: job.pid, kind: "live", group: g, adult: isAdultName(g), name: String(s.name || ""),
      logo: s.stream_icon || "", tvg: s.epg_channel_id || "", url: "", sid: Number(s.stream_id),
      uid: "l" + hashStr(job.pid + ":" + s.stream_id),
    };
  });
  await ingest("movie", "Loading movies", () => X.getVodCategories(c), () => X.getVodStreams(c), function (s, g) {
    return {
      pid: job.pid, kind: "movie", group: g, adult: isAdultName(g), name: String(s.name || ""),
      logo: s.stream_icon || "", tvg: "", url: "", sid: Number(s.stream_id),
      ext: s.container_extension || "mp4", rating: s.rating ? String(s.rating) : "",
      year: s.year ? String(s.year) : "", uid: "m" + hashStr(job.pid + ":" + s.stream_id),
    };
  });
  await ingest("series", "Loading series", () => X.getSeriesCategories(c), () => X.getSeriesList(c), function (s, g) {
    return {
      pid: job.pid, kind: "series", group: g, adult: isAdultName(g), name: String(s.name || ""),
      logo: s.cover || "", tvg: "", url: "", ser: Number(s.series_id),
      rating: s.rating ? String(s.rating) : "", year: s.releaseDate ? String(s.releaseDate).substring(0, 4) : "",
      plot: s.plot ? String(s.plot).substring(0, 500) : "", uid: "s" + hashStr(job.pid + ":" + s.series_id),
    };
  });

  await writer.finish();
  if (total === 0) throw new Error("Logged in, but the account has no channels or VOD content.");
  await putAll(db, "groups", tracker.records());
  db.close();
  const ui = auth.user_info || {};
  post({
    type: "done",
    counts: counts,
    epgUrl: X.xmltvUrl(c),
    info: {
      exp: ui.exp_date ? new Date(parseInt(ui.exp_date, 10) * 1000).toISOString().substring(0, 10) : "",
      status: ui.status || "",
      maxConn: ui.max_connections || "",
    },
  });
}

async function importEpg(job: ImportJob) {
  const db = await openDb();
  await clearStore(db, "epg");
  const now = Date.now();
  const writer = new Writer(db, "epg");
  const parser = new XmltvParser(now - 24 * 3600000, now + 48 * 3600000, function (b) {
    writer.add(b);
    post({ type: "progress", stage: "Reading guide", count: parser.kept });
  });
  post({ type: "progress", stage: "Downloading guide", count: 0 });
  await streamText(job.url as string, function (c) {
    parser.push(c);
  });
  parser.end();
  await writer.finish();
  db.close();
  if (parser.seen === 0) throw new Error("No <programme> entries found. The EPG must be plain XMLTV (not .gz).");
  post({ type: "done", programmes: parser.kept });
}

ctx.onmessage = function (e: MessageEvent) {
  const job = e.data as ImportJob;
  let p: Promise<void>;
  if (job.cmd === "m3u") p = importM3u(job);
  else if (job.cmd === "xtream") p = importXtream(job);
  else p = importEpg(job);
  p.catch(function (err) {
    post({ type: "error", message: (err && err.message) || String(err) });
  });
};

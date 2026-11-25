export type Kind = "live" | "movie" | "series";

export interface Item {
  id?: number;
  pid: string;
  kind: Kind;
  group: string;
  adult: number; // 0 | 1 (numbers are valid IndexedDB keys, booleans are not)
  name: string;
  logo: string;
  tvg: string; // tvg-id / epg_channel_id
  url: string; // empty for Xtream items (resolved at play time)
  uid: string;
  sid?: number; // xtream stream id
  ser?: number; // xtream series id
  ext?: string; // container extension
  rating?: string;
  year?: string;
  plot?: string;
  sub?: string; // optional external subtitle URL (SRT / VTT)
}

export interface Group {
  key: string;
  pid: string;
  kind: Kind;
  name: string;
  count: number;
  adult: number;
  ord: number;
}

export interface Counts {
  live: number;
  movie: number;
  series: number;
}

export interface Playlist {
  id: string;
  name: string;
  type: "m3u" | "xtream";
  url?: string;
  host?: string;
  username?: string;
  password?: string;
  epgUrl?: string;
  createdAt: number;
  updatedAt: number;
  counts: Counts;
  info?: { exp?: string; status?: string; maxConn?: string };
}

export interface Programme {
  id?: number;
  ch: string;
  start: number;
  stop: number;
  title: string;
  desc: string;
}

export interface ListSource<T> {
  total: number;
  key: string;
  getRange(offset: number, limit: number): Promise<T[]>;
}

export interface ImportJob {
  cmd: "m3u" | "xtream" | "epg";
  pid: string;
  url?: string;
  text?: string;
  host?: string;
  username?: string;
  password?: string;
}

export type WorkerOut =
  | { type: "progress"; stage: string; count: number }
  | {
      type: "done";
      counts?: Counts;
      epgUrl?: string;
      programmes?: number;
      info?: { exp?: string; status?: string; maxConn?: string };
    }
  | { type: "error"; message: string };

export interface Settings {
  playerMode: "auto" | "native" | "hls";
  buffer: "low" | "medium" | "high";
  liveFormat: "m3u8" | "ts";
  subSize: "s" | "m" | "l";
  pin: string;
  companionUrl: string;
  posters: boolean;
  autoEpg: boolean;
}

export interface TrackInfo {
  index: number;
  label: string;
}

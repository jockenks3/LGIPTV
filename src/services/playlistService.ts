import { runJob } from "./importService";
import { countKinds, deletePlaylist, putPlaylist, clearAllData } from "./dbService";
import { episodeUrl, liveUrl, normalizeHost, vodUrl, xmltvUrl } from "./xtreamApi";
import type { XtreamCreds } from "./xtreamApi";
import { activePlaylist, getState, setActive, setState } from "../store/appStore";
import type { Item, Playlist, Settings } from "../types";

export function credsOf(pl: Playlist): XtreamCreds {
  return { host: pl.host || "", username: pl.username || "", password: pl.password || "" };
}

export function resolveItemUrl(item: Item, pl: Playlist | null, s: Settings): string {
  if (item.url) return item.url;
  if (!pl || pl.type !== "xtream") return "";
  const c = credsOf(pl);
  if (item.kind === "live" && item.sid) return liveUrl(c, item.sid, s.liveFormat);
  if (item.kind === "movie" && item.sid) return vodUrl(c, item.sid, item.ext || "mp4");
  return "";
}

export function xtreamEpisodeUrl(pl: Playlist, id: string | number, ext: string): string {
  return episodeUrl(credsOf(pl), id, ext);
}

export interface NewPlaylist {
  name: string;
  type: "m3u" | "xtream";
  url?: string;
  text?: string;
  host?: string;
  username?: string;
  password?: string;
  epgUrl?: string;
}

type Progress = (stage: string, count: number) => void;

export async function addPlaylist(def: NewPlaylist, onProgress: Progress): Promise<Playlist> {
  const id = "p" + Date.now().toString(36);
  const host = def.type === "xtream" ? normalizeHost(def.host || "") : undefined;
  const res =
    def.type === "xtream"
      ? await runJob({ cmd: "xtream", pid: id, host: host, username: def.username, password: def.password }, onProgress)
      : await runJob({ cmd: "m3u", pid: id, url: def.url, text: def.text }, onProgress);
  const counts = res.counts || (await countKinds(id));
  const now = Date.now();
  const pl: Playlist = {
    id: id,
    name: def.name || (def.type === "xtream" ? (host || "Xtream").replace(/^https?:\/\//, "") : "My Playlist"),
    type: def.type,
    url: def.url,
    host: host,
    username: def.username,
    password: def.password,
    epgUrl: def.epgUrl || res.epgUrl || "",
    createdAt: now,
    updatedAt: now,
    counts: counts,
    info: res.info,
  };
  await putPlaylist(pl);
  const st = getState();
  setState({ playlists: st.playlists.concat([pl]) });
  setActive(id);
  if (st.settings.autoEpg && pl.epgUrl) {
    importEpg(pl).catch(function () {
      /* shown in epgStatus */
    });
  }
  return pl;
}

export async function refreshPlaylist(pl: Playlist, onProgress: Progress): Promise<Playlist> {
  if (pl.type === "m3u" && !pl.url) throw new Error("This playlist was uploaded from a file and has no URL to refresh from.");
  const res =
    pl.type === "xtream"
      ? await runJob({ cmd: "xtream", pid: pl.id, host: pl.host, username: pl.username, password: pl.password }, onProgress)
      : await runJob({ cmd: "m3u", pid: pl.id, url: pl.url }, onProgress);
  const next: Playlist = Object.assign({}, pl, {
    updatedAt: Date.now(),
    counts: res.counts || pl.counts,
    info: res.info || pl.info,
    epgUrl: pl.epgUrl || res.epgUrl || "",
  });
  await putPlaylist(next);
  replacePlaylist(next);
  return next;
}

export function replacePlaylist(next: Playlist) {
  const st = getState();
  setState({
    playlists: st.playlists.map(function (p) {
      return p.id === next.id ? next : p;
    }),
  });
}

export async function savePlaylistEpgUrl(pl: Playlist, url: string) {
  const next = Object.assign({}, pl, { epgUrl: url.trim() });
  await putPlaylist(next);
  replacePlaylist(next);
}

export async function importEpg(pl: Playlist): Promise<number> {
  const url = pl.epgUrl || (pl.type === "xtream" ? xmltvUrl(credsOf(pl)) : "");
  if (!url) throw new Error("No EPG (XMLTV) URL configured for this playlist");
  setState({ epgStatus: "Downloading guide…" });
  try {
    const r = await runJob({ cmd: "epg", pid: pl.id, url: url }, function (stage, count) {
      setState({ epgStatus: stage + " (" + count + " programmes)" });
    });
    setState({ epgStatus: "Guide ready: " + (r.programmes || 0) + " programmes" });
    return r.programmes || 0;
  } catch (e: any) {
    setState({ epgStatus: "Guide failed: " + ((e && e.message) || "error") });
    throw e;
  }
}

export async function removePlaylist(id: string) {
  await deletePlaylist(id);
  const st = getState();
  const left = st.playlists.filter(function (p) {
    return p.id !== id;
  });
  setState({ playlists: left });
  if (st.activeId === id) setActive(left.length ? left[0].id : null);
}

export async function resetEverything() {
  await clearAllData();
  setState({ playlists: [], favs: {}, screen: "onboarding", epgStatus: "" });
  setActive(null);
}

export function currentPlaylist(): Playlist | null {
  return activePlaylist();
}

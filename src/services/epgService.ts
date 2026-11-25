import { getSchedule } from "./dbService";
import { getShortEpg } from "./xtreamApi";
import { credsOf } from "./playlistService";
import type { Item, Playlist, Programme } from "../types";

/** Upcoming programmes for a channel (XMLTV from IndexedDB, else Xtream short EPG). */
export async function loadEpg(item: Item, pl: Playlist | null): Promise<Programme[]> {
  const now = Date.now();
  try {
    if (item.tvg) {
      const s = await getSchedule(item.tvg, now, now + 48 * 3600000);
      if (s.length) return s;
    }
    if (pl && pl.type === "xtream" && item.sid) {
      const list = await getShortEpg(credsOf(pl), item.sid, 10);
      return list.filter(function (p) {
        return p.stop > now;
      });
    }
  } catch (e) {
    /* EPG is optional */
  }
  return [];
}

export function currentIndex(list: Programme[], now: number): number {
  for (let i = 0; i < list.length; i++) if (list[i].start <= now && list[i].stop > now) return i;
  return -1;
}

const titleCache: { [ch: string]: { t: number; title: string } } = {};
const pending: { [ch: string]: Promise<string> | undefined } = {};

/** Title of the programme currently airing on a channel (cached per minute). */
export function nowTitle(tvg: string): Promise<string> {
  if (!tvg) return Promise.resolve("");
  const now = Date.now();
  const c = titleCache[tvg];
  if (c && now - c.t < 60000) return Promise.resolve(c.title);
  const pp = pending[tvg];
  if (pp) return pp;
  const p = getSchedule(tvg, now, now + 60000)
    .then(function (list) {
      const i = currentIndex(list, now);
      const title = i >= 0 ? list[i].title : "";
      titleCache[tvg] = { t: now, title: title };
      delete pending[tvg];
      return title;
    })
    .catch(function () {
      delete pending[tvg];
      return "";
    });
  pending[tvg] = p;
  return p;
}

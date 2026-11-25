// Xtream Codes API client (player_api.php). Usable from window AND worker.
import { httpJson } from "./http";
import type { Programme } from "../types";

export interface XtreamCreds {
  host: string;
  username: string;
  password: string;
}

export function normalizeHost(h: string): string {
  let s = (h || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  s = s.replace(/\/player_api\.php.*$/i, "").replace(/\/+$/, "");
  return s;
}

function q(c: XtreamCreds, action?: string, extra?: string): string {
  return (
    normalizeHost(c.host) +
    "/player_api.php?username=" +
    encodeURIComponent(c.username) +
    "&password=" +
    encodeURIComponent(c.password) +
    (action ? "&action=" + action : "") +
    (extra ? "&" + extra : "")
  );
}

export interface XtreamAuth {
  user_info?: { auth?: number | string; status?: string; exp_date?: string; max_connections?: string };
  server_info?: any;
}

export function authenticate(c: XtreamCreds): Promise<XtreamAuth> {
  return httpJson<XtreamAuth>(q(c), 30000).then(function (r) {
    if (!r || !r.user_info || String(r.user_info.auth) !== "1") {
      throw new Error("Login failed: check server address, username and password");
    }
    return r;
  });
}

export const getLiveCategories = (c: XtreamCreds) => httpJson<any[]>(q(c, "get_live_categories"), 120000);
export const getLiveStreams = (c: XtreamCreds) => httpJson<any[]>(q(c, "get_live_streams"), 600000);
export const getVodCategories = (c: XtreamCreds) => httpJson<any[]>(q(c, "get_vod_categories"), 120000);
export const getVodStreams = (c: XtreamCreds) => httpJson<any[]>(q(c, "get_vod_streams"), 600000);
export const getSeriesCategories = (c: XtreamCreds) => httpJson<any[]>(q(c, "get_series_categories"), 120000);
export const getSeriesList = (c: XtreamCreds) => httpJson<any[]>(q(c, "get_series"), 600000);
export const getSeriesInfo = (c: XtreamCreds, id: number) =>
  httpJson<any>(q(c, "get_series_info", "series_id=" + id), 60000);
export const getVodInfo = (c: XtreamCreds, id: number) =>
  httpJson<any>(q(c, "get_vod_info", "vod_id=" + id), 60000);

export function b64decode(s: string): string {
  if (!s) return "";
  try {
    const bin = atob(s);
    let out = "";
    for (let i = 0; i < bin.length; i++) out += "%" + ("00" + bin.charCodeAt(i).toString(16)).slice(-2);
    return decodeURIComponent(out);
  } catch (e) {
    return s;
  }
}

/** Short EPG for one live stream (titles/descriptions are base64 encoded). */
export function getShortEpg(c: XtreamCreds, streamId: number, limit: number): Promise<Programme[]> {
  return httpJson<any>(q(c, "get_short_epg", "stream_id=" + streamId + "&limit=" + limit), 20000).then(
    function (r) {
      const list: any[] = (r && r.epg_listings) || [];
      return list.map(function (e) {
        return {
          ch: "x" + streamId,
          start: parseInt(e.start_timestamp, 10) * 1000,
          stop: parseInt(e.stop_timestamp, 10) * 1000,
          title: b64decode(e.title),
          desc: b64decode(e.description),
        } as Programme;
      });
    }
  );
}

export function liveUrl(c: XtreamCreds, id: number, ext: string): string {
  return normalizeHost(c.host) + "/live/" + encodeURIComponent(c.username) + "/" + encodeURIComponent(c.password) + "/" + id + "." + ext;
}
export function vodUrl(c: XtreamCreds, id: number, ext: string): string {
  return normalizeHost(c.host) + "/movie/" + encodeURIComponent(c.username) + "/" + encodeURIComponent(c.password) + "/" + id + "." + (ext || "mp4");
}
export function episodeUrl(c: XtreamCreds, id: string | number, ext: string): string {
  return normalizeHost(c.host) + "/series/" + encodeURIComponent(c.username) + "/" + encodeURIComponent(c.password) + "/" + id + "." + (ext || "mp4");
}
export function xmltvUrl(c: XtreamCreds): string {
  return (
    normalizeHost(c.host) +
    "/xmltv.php?username=" +
    encodeURIComponent(c.username) +
    "&password=" +
    encodeURIComponent(c.password)
  );
}

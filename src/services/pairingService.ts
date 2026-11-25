// Client for the Companion Server (server/companion-server.mjs).
// The TV shows a 6-digit code; the user opens the companion website on a
// phone/PC, enters the code and submits a playlist (file upload, URL or Xtream).
import { httpGet, httpPostJson } from "./http";

export function normalizeServerUrl(u: string): string {
  let s = (u || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  return s.replace(/\/+$/, "");
}

export function generateCode(): string {
  let c = "";
  for (let i = 0; i < 6; i++) c += Math.floor(Math.random() * 10);
  return c;
}

export function registerCode(server: string, code: string): Promise<void> {
  return httpPostJson(server + "/api/register", { code: code }, 8000).then(function () {});
}

export interface PairPayload {
  type: "m3u" | "xtream";
  name?: string;
  url?: string;
  epgUrl?: string;
  host?: string;
  username?: string;
  password?: string;
}

export interface PollResult {
  status: "waiting" | "ready" | "unknown";
  payload?: PairPayload;
}

export function pollCode(server: string, code: string): Promise<PollResult> {
  return httpGet(server + "/api/poll?code=" + code, 8000).then(function (t) {
    return JSON.parse(t) as PollResult;
  });
}

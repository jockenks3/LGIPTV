// Pure, DOM-free parsers for M3U/M3U8 and XMLTV. They are fed text in chunks
// so that memory use stays flat for very large playlists / guides.
import type { Group, Item, Kind, Programme } from "../types";

export function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const ADULT_RE = /adult|xxx|porn|18\+|\bsex|erotic|hentai|nsfw/i;
export function isAdultName(name: string): number {
  return ADULT_RE.test(name) ? 1 : 0;
}

const VIDEO_EXT_RE = /\.(mp4|mkv|avi|mov|wmv|flv|mpg|mpeg|m4v)(\?|$)/i;

export function guessKind(url: string, group: string): Kind {
  if (/\/series\//i.test(url)) return "series";
  if (/\/movie\//i.test(url)) return "movie";
  if (VIDEO_EXT_RE.test(url)) {
    if (/series|episode|season|\bs\d{1,2}\s?e\d{1,3}/i.test(group)) return "series";
    return "movie";
  }
  return "live";
}

export class GroupTracker {
  private map: { [k: string]: Group } = {};
  private order = 0;
  constructor(private pid: string) {}

  declare_(kind: Kind, name: string) {
    this.touch(kind, name, 0);
  }

  add(kind: Kind, name: string) {
    this.touch(kind, name, 1);
  }

  private touch(kind: Kind, name: string, inc: number) {
    const key = this.pid + "|" + kind + "|" + name;
    let g = this.map[key];
    if (!g) {
      g = this.map[key] = {
        key: key,
        pid: this.pid,
        kind: kind,
        name: name,
        count: 0,
        adult: isAdultName(name),
        ord: this.order++,
      };
    }
    g.count += inc;
  }

  records(): Group[] {
    const out: Group[] = [];
    for (const k in this.map) if (this.map[k].count > 0) out.push(this.map[k]);
    return out;
  }
}

interface ExtInf {
  name: string;
  attrs: { [k: string]: string };
}

function parseExtinf(l: string): ExtInf {
  const attrs: { [k: string]: string } = {};
  const re = /([\w-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(l))) attrs[m[1].toLowerCase()] = m[2];
  const q = l.lastIndexOf('"');
  const c = l.indexOf(",", q >= 0 ? q : 0);
  let name = c >= 0 ? l.substring(c + 1).trim() : "";
  if (!name) name = attrs["tvg-name"] || "";
  return { name: name, attrs: attrs };
}

export class M3uParser {
  epgUrl = "";
  total = 0;
  groups: GroupTracker;
  private buf = "";
  private cur: ExtInf | null = null;
  private grp = "";
  private batch: Item[] = [];

  constructor(
    private pid: string,
    private onBatch: (items: Item[]) => void,
    private batchSize: number = 500
  ) {
    this.groups = new GroupTracker(pid);
  }

  push(chunk: string) {
    this.buf += chunk;
    let start = 0;
    for (;;) {
      const nl = this.buf.indexOf("\n", start);
      if (nl < 0) break;
      this.line(this.buf.substring(start, nl));
      start = nl + 1;
    }
    this.buf = this.buf.substring(start);
  }

  end() {
    if (this.buf) this.line(this.buf);
    this.buf = "";
    this.flush();
  }

  private flush() {
    if (this.batch.length) {
      const b = this.batch;
      this.batch = [];
      this.onBatch(b);
    }
  }

  private line(raw: string) {
    const l = raw.replace(/^\uFEFF/, "").trim();
    if (!l) return;
    if (l.charCodeAt(0) === 35) {
      if (l.indexOf("#EXTM3U") === 0) {
        const m = /(?:url-tvg|x-tvg-url)="([^"]+)"/i.exec(l);
        if (m) this.epgUrl = m[1].split(",")[0];
      } else if (l.indexOf("#EXTINF") === 0) {
        this.cur = parseExtinf(l);
      } else if (l.indexOf("#EXTGRP:") === 0) {
        this.grp = l.substring(8).trim();
      }
      return;
    }
    const info = this.cur || { name: "", attrs: {} };
    const group = info.attrs["group-title"] || this.grp || "Uncategorized";
    const kind = guessKind(l, group);
    const name = info.name || l;
    const item: Item = {
      pid: this.pid,
      kind: kind,
      group: group,
      adult: isAdultName(group),
      name: name,
      logo: info.attrs["tvg-logo"] || "",
      tvg: info.attrs["tvg-id"] || info.attrs["tvg-name"] || "",
      url: l,
      uid: kind.charAt(0) + hashStr(l + "|" + name),
    };
    this.cur = null;
    this.grp = "";
    this.total++;
    this.groups.add(kind, group);
    this.batch.push(item);
    if (this.batch.length >= this.batchSize) this.flush();
  }
}

// ---------------------------------------------------------------- XMLTV ----

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (_m, n) {
      return String.fromCharCode(parseInt(n, 10));
    })
    .replace(/&amp;/g, "&")
    .trim();
}

/** Parses "20240131203000 +0100" into epoch milliseconds. */
export function parseXmltvTime(s: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?\s*([+-]\d{4})?/.exec(s || "");
  if (!m) return NaN;
  let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  if (m[7]) {
    const sign = m[7].charAt(0) === "-" ? -1 : 1;
    const off = parseInt(m[7].substr(1, 2), 10) * 60 + parseInt(m[7].substr(3, 2), 10);
    t -= sign * off * 60000;
  }
  return t;
}

function attr(tag: string, name: string): string {
  const m = new RegExp("\\b" + name + '="([^"]*)"').exec(tag);
  return m ? decodeXml(m[1]) : "";
}

/**
 * Stream parser for XMLTV. Keeps only programmes inside [from, to]
 * (default: now-24h .. now+48h) to save IndexedDB space.
 */
export class XmltvParser {
  channels = 0;
  kept = 0;
  seen = 0;
  private buf = "";
  private batch: Programme[] = [];

  constructor(
    private from: number,
    private to: number,
    private onBatch: (p: Programme[]) => void,
    private batchSize: number = 500
  ) {}

  push(chunk: string) {
    this.buf += chunk;
    let pos = 0;
    for (;;) {
      const s = this.buf.indexOf("<programme", pos);
      if (s < 0) {
        // count channels in the consumed region (cheap)
        this.countChannels(this.buf.substring(pos));
        pos = Math.max(pos, this.buf.length - 12);
        break;
      }
      if (s > pos) this.countChannels(this.buf.substring(pos, s));
      const e = this.buf.indexOf("</programme>", s);
      if (e < 0) {
        pos = s;
        break;
      }
      this.programme(this.buf.substring(s, e + 12));
      pos = e + 12;
    }
    this.buf = this.buf.substring(pos);
  }

  end() {
    this.flush();
  }

  private countChannels(text: string) {
    const m = text.match(/<channel\b/g);
    if (m) this.channels += m.length;
  }

  private flush() {
    if (this.batch.length) {
      const b = this.batch;
      this.batch = [];
      this.onBatch(b);
    }
  }

  private programme(block: string) {
    this.seen++;
    const gt = block.indexOf(">");
    const tag = block.substring(0, gt);
    const start = parseXmltvTime(attr(tag, "start"));
    const stop = parseXmltvTime(attr(tag, "stop"));
    if (isNaN(start) || isNaN(stop)) return;
    if (stop < this.from || start > this.to) return;
    const ch = attr(tag, "channel");
    if (!ch) return;
    const t = /<title[^>]*>([\s\S]*?)<\/title>/.exec(block);
    const d = /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(block);
    this.batch.push({
      ch: ch,
      start: start,
      stop: stop,
      title: t ? decodeXml(t[1]) : "",
      desc: d ? decodeXml(d[1]).substring(0, 400) : "",
    });
    this.kept++;
    if (this.batch.length >= this.batchSize) this.flush();
  }
}

// SRT / WebVTT parser. Subtitles are rendered as custom HTML overlay divs
// (reliable positioning + font sizing on webOS 3.x instead of native cues).
export interface Cue {
  start: number;
  end: number;
  text: string;
}

function toSeconds(s: string): number {
  const m = /(?:(\d+):)?(\d+):(\d+)[.,](\d+)/.exec(s);
  if (!m) return NaN;
  return +(m[1] || 0) * 3600 + +m[2] * 60 + +m[3] + +("0." + m[4]);
}

export function parseSubtitles(text: string): Cue[] {
  const blocks = text.replace(/\r/g, "").replace(/^\uFEFF/, "").split(/\n\n+/);
  const cues: Cue[] = [];
  for (let b = 0; b < blocks.length; b++) {
    const lines = blocks[b].split("\n");
    for (let i = 0; i < lines.length; i++) {
      const at = lines[i].indexOf("-->");
      if (at < 0) continue;
      const start = toSeconds(lines[i].substring(0, at));
      const end = toSeconds(lines[i].substring(at + 3).trim());
      if (isNaN(start) || isNaN(end)) break;
      const body = lines
        .slice(i + 1)
        .join("\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\{\\[^}]*\}/g, "")
        .trim();
      if (body) cues.push({ start: start, end: end, text: body });
      break;
    }
  }
  cues.sort(function (a, c) {
    return a.start - c.start;
  });
  return cues;
}

export function findCue(cues: Cue[], t: number): Cue | null {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (t < c.start) hi = mid - 1;
    else if (t > c.end) lo = mid + 1;
    else return c;
  }
  return null;
}

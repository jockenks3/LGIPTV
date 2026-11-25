function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

export function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (h > 0 ? h + ":" + pad(m) : String(m)) + ":" + pad(s % 60);
}

export function fmtHM(ts: number): string {
  const d = new Date(ts);
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function fmtDay(ts: number): string {
  const d = new Date(ts);
  const t = new Date();
  if (d.toDateString() === t.toDateString()) return "Today";
  return DAYS[d.getDay()];
}

export function fmtNum(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function closestAttr(el: Element | null, attr: string): HTMLElement | null {
  let e: Element | null = el;
  while (e && e.nodeType === 1) {
    if (e.hasAttribute(attr)) return e as HTMLElement;
    e = e.parentElement;
  }
  return null;
}

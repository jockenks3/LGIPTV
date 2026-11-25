import { setState } from "../store/appStore";

/** Runs a long task while showing the global progress overlay (with error + close). */
export async function withBusy<T>(
  title: string,
  fn: (progress: (stage: string, count: number) => void) => Promise<T>
): Promise<T | undefined> {
  setState({ busy: { title: title, stage: "Starting…", count: 0 } });
  try {
    const r = await fn(function (stage, count) {
      setState({ busy: { title: title, stage: stage, count: count } });
    });
    setState({ busy: null });
    return r;
  } catch (e: any) {
    setState({ busy: { title: title, stage: "", count: 0, error: (e && e.message) || "Unknown error" } });
    return undefined;
  }
}

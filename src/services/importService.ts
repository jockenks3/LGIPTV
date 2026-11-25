import ParserWorker from "./parser.worker?worker&inline";
import type { ImportJob, WorkerOut } from "../types";

export type DoneMessage = Extract<WorkerOut, { type: "done" }>;

/** Runs one import job in a fresh Web Worker and terminates it afterwards. */
export function runJob(job: ImportJob, onProgress: (stage: string, count: number) => void): Promise<DoneMessage> {
  return new Promise(function (resolve, reject) {
    let w: Worker;
    try {
      w = new ParserWorker();
    } catch (e) {
      reject(new Error("Web Workers are not available on this device"));
      return;
    }
    w.onmessage = function (e: MessageEvent) {
      const m = e.data as WorkerOut;
      if (m.type === "progress") {
        onProgress(m.stage, m.count);
        return;
      }
      w.terminate();
      if (m.type === "done") resolve(m);
      else reject(new Error(m.message));
    };
    w.onerror = function (e: ErrorEvent) {
      w.terminate();
      reject(new Error("Import worker failed: " + (e.message || "unknown error")));
    };
    w.postMessage(job);
  });
}

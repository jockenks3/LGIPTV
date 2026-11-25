// Minimal XHR helpers (XMLHttpRequest exists in both window and Web Worker
// scopes on Chromium 38, unlike fetch which arrived in Chrome 40/42).

export function httpGet(url: string, timeout?: number): Promise<string> {
  return new Promise(function (resolve, reject) {
    const x = new XMLHttpRequest();
    x.open("GET", url, true);
    x.timeout = timeout || 60000;
    x.onload = function () {
      if (x.status >= 200 && x.status < 300) resolve(x.responseText);
      else reject(new Error("HTTP " + x.status));
    };
    x.onerror = function () {
      reject(new Error("Network error"));
    };
    x.ontimeout = function () {
      reject(new Error("Request timed out"));
    };
    x.send();
  });
}

export function httpJson<T = any>(url: string, timeout?: number): Promise<T> {
  return httpGet(url, timeout).then(function (t) {
    try {
      return JSON.parse(t) as T;
    } catch (e) {
      throw new Error("Invalid JSON response");
    }
  });
}

export function httpPostJson<T = any>(url: string, body: any, timeout?: number): Promise<T> {
  return new Promise(function (resolve, reject) {
    const x = new XMLHttpRequest();
    x.open("POST", url, true);
    x.timeout = timeout || 20000;
    x.setRequestHeader("Content-Type", "application/json");
    x.onload = function () {
      if (x.status >= 200 && x.status < 300) {
        try {
          resolve(JSON.parse(x.responseText));
        } catch (e) {
          resolve({} as T);
        }
      } else reject(new Error("HTTP " + x.status));
    };
    x.onerror = function () {
      reject(new Error("Network error"));
    };
    x.ontimeout = function () {
      reject(new Error("Request timed out"));
    };
    x.send(JSON.stringify(body));
  });
}

/**
 * Streams a (potentially huge) text document: onChunk is called with every new
 * slice of text as it arrives, so callers can parse incrementally.
 */
export function streamText(url: string, onChunk: (text: string) => void): Promise<void> {
  return new Promise(function (resolve, reject) {
    const x = new XMLHttpRequest();
    let offset = 0;
    x.open("GET", url, true);
    x.responseType = "text";
    x.timeout = 15 * 60 * 1000;
    function flush() {
      const t = x.responseText;
      if (t && t.length > offset) {
        const chunk = t.substring(offset);
        offset = t.length;
        onChunk(chunk);
      }
    }
    x.onprogress = function () {
      if (x.status >= 200 && x.status < 300) flush();
    };
    x.onload = function () {
      if (x.status >= 200 && x.status < 300) {
        try {
          flush();
          resolve();
        } catch (e) {
          reject(e);
        }
      } else reject(new Error("HTTP " + x.status + " while downloading"));
    };
    x.onerror = function () {
      reject(new Error("Network error while downloading"));
    };
    x.ontimeout = function () {
      reject(new Error("Download timed out"));
    };
    x.send();
  });
}

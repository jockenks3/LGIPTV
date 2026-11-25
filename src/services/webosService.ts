// Thin wrapper around LG webOSTV.js (window.webOS). Everything degrades
// gracefully when running in a desktop browser.
export const APP_ID = "com.example.iptvplayer";

declare global {
  interface Window {
    webOS?: any;
    PalmServiceBridge?: any;
  }
}

export const isWebOS: boolean =
  typeof navigator !== "undefined" &&
  (/web0s|webos|netcast/i.test(navigator.userAgent) || typeof window.PalmServiceBridge !== "undefined");

function luna(uri: string, method: string, parameters: any, onSuccess?: (r: any) => void, onFailure?: (e: any) => void): any {
  try {
    if (window.webOS && window.webOS.service) {
      return window.webOS.service.request(uri, {
        method: method,
        parameters: parameters || {},
        onSuccess: onSuccess || function () {},
        onFailure: onFailure || function () {},
      });
    }
  } catch (e) {
    /* ignore: service unavailable */
  }
  return null;
}

export interface DeviceInfo {
  modelName: string;
  version: string;
  sdkVersion: string;
  screen: string;
}

export function getDeviceInfo(): Promise<DeviceInfo> {
  return new Promise(function (resolve) {
    const fallback: DeviceInfo = {
      modelName: isWebOS ? "LG webOS TV" : "Desktop browser",
      version: "-",
      sdkVersion: "-",
      screen: window.innerWidth + "x" + window.innerHeight,
    };
    if (!window.webOS || typeof window.webOS.deviceInfo !== "function") return resolve(fallback);
    const timer = setTimeout(function () {
      resolve(fallback);
    }, 1500);
    try {
      window.webOS.deviceInfo(function (d: any) {
        clearTimeout(timer);
        resolve({
          modelName: d.modelName || fallback.modelName,
          version: d.version || "-",
          sdkVersion: d.sdkVersion || "-",
          screen: (d.screenWidth || window.innerWidth) + "x" + (d.screenHeight || window.innerHeight),
        });
      });
    } catch (e) {
      clearTimeout(timer);
      resolve(fallback);
    }
  });
}

let screensaverReq: any = null;

/**
 * Keeps the TV screensaver away while video is playing. Best effort:
 * the <video> element itself normally suppresses it, and we additionally
 * register with the tvpower service and ack its screensaver requests.
 */
export function keepScreenOn(on: boolean) {
  if (!isWebOS) return;
  if (on && !screensaverReq) {
    screensaverReq = luna(
      "luna://com.webos.service.tvpower",
      "power/registerScreenSaverRequest",
      { subscribe: true, clientName: APP_ID, priority: 0 },
      function (res: any) {
        if (res && res.timestamp && screensaverReq) {
          luna("luna://com.webos.service.tvpower", "power/responseScreenSaverRequest", {
            clientName: APP_ID,
            ack: false,
            timestamp: res.timestamp,
          });
        }
      }
    );
  } else if (!on && screensaverReq) {
    try {
      if (screensaverReq.cancel) screensaverReq.cancel();
    } catch (e) {
      /* ignore */
    }
    screensaverReq = null;
  }
}

export function exitApp() {
  try {
    if (window.webOS && typeof window.webOS.platformBack === "function") {
      window.webOS.platformBack();
      return;
    }
  } catch (e) {
    /* fall through */
  }
  window.close();
}

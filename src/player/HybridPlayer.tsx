// Hybrid playback engine.
//  1. Native HTML5 <video> first (hardware decoder on the TV) for .ts/.mp4/.mkv/.m3u8
//  2. Automatic fallback to hls.js (MSE) when native playback errors / stalls on an
//     HLS manifest, or when the user selects the "Software (hls.js)" player.
//  3. Audio track switching + subtitles rendered as styled HTML overlay divs.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { TrackInfo } from "../types";
import { findCue, parseSubtitles } from "../utils/subtitles";
import type { Cue } from "../utils/subtitles";
import { httpGet } from "../services/http";

export interface PlayerStatus {
  state: "idle" | "loading" | "buffering" | "playing" | "paused" | "ended" | "error";
  time: number;
  duration: number;
  engine: "native" | "hls";
  error: string;
  audio: TrackInfo[];
  audioIdx: number;
  subs: TrackInfo[];
  subIdx: number;
}

export interface PlayerHandle {
  play(): void;
  pause(): void;
  toggle(): void;
  seekBy(delta: number): void;
  seekTo(t: number): void;
  setAudio(i: number): void;
  setSub(i: number): void;
}

interface Props {
  url: string;
  live: boolean;
  mode: "auto" | "native" | "hls";
  buffer: "low" | "medium" | "high";
  subSize: "s" | "m" | "l";
  subUrl?: string;
  startAt?: number;
  reload?: number;
  onStatus: (s: PlayerStatus) => void;
  onEnded?: () => void;
}

const BUFFER_PROFILES = {
  low: { maxBufferLength: 10, maxMaxBufferLength: 20, maxBufferSize: 12 * 1000 * 1000 },
  medium: { maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000 },
  high: { maxBufferLength: 60, maxMaxBufferLength: 120, maxBufferSize: 60 * 1000 * 1000 },
};

function chromeMajor(): number {
  const m = /Chrome\/(\d+)/.exec(navigator.userAgent);
  return m ? parseInt(m[1], 10) : 100;
}

function looksLikeHls(url: string): boolean {
  if (/\.m3u8(\?|$)/i.test(url)) return true;
  return !/\.(ts|mp4|mkv|avi|mov|mpg|mpeg|flv|m4v|wmv)(\?|$)/i.test(url);
}

interface SubEntry {
  label: string;
  kind: "ext" | "text";
  ti: number;
}

export const HybridPlayer = forwardRef<PlayerHandle, Props>(function HybridPlayer(props, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const cb = useRef(props);
  cb.current = props;
  const st = useRef<PlayerStatus>({
    state: "idle",
    time: 0,
    duration: 0,
    engine: "native",
    error: "",
    audio: [],
    audioIdx: 0,
    subs: [],
    subIdx: -1,
  });
  const cues = useRef<Cue[]>([]);
  const subList = useRef<SubEntry[]>([]);
  const subSel = useRef(-1);
  const readTracksRef = useRef<() => void>(function () {});
  const [subText, setSubText] = useState("");

  function emit(patch: Partial<PlayerStatus>) {
    st.current = Object.assign({}, st.current, patch);
    cb.current.onStatus(st.current);
  }

  function applySub(i: number) {
    const video = videoRef.current as any;
    subSel.current = i;
    setSubText("");
    if (video && video.textTracks) {
      for (let k = 0; k < video.textTracks.length; k++) video.textTracks[k].mode = "disabled";
    }
    const entry = subList.current[i];
    if (entry && entry.kind === "text" && video && video.textTracks[entry.ti]) {
      video.textTracks[entry.ti].mode = "hidden";
      if (hlsRef.current) hlsRef.current.subtitleTrack = entry.ti;
    } else if (hlsRef.current) {
      hlsRef.current.subtitleTrack = -1;
    }
    emit({ subIdx: i });
  }

  useImperativeHandle(ref, function () {
    return {
      play: function () {
        const v = videoRef.current;
        if (v) {
          const p: any = v.play();
          if (p && p.catch) p.catch(function () {});
        }
      },
      pause: function () {
        if (videoRef.current) videoRef.current.pause();
      },
      toggle: function () {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) {
          const p: any = v.play();
          if (p && p.catch) p.catch(function () {});
        } else v.pause();
      },
      seekBy: function (d: number) {
        const v = videoRef.current;
        if (!v || !isFinite(v.duration)) return;
        v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + d));
      },
      seekTo: function (t: number) {
        const v = videoRef.current;
        if (v && isFinite(v.duration)) v.currentTime = t;
      },
      setAudio: function (i: number) {
        const v = videoRef.current as any;
        if (hlsRef.current) hlsRef.current.audioTrack = i;
        else if (v && v.audioTracks) for (let k = 0; k < v.audioTracks.length; k++) v.audioTracks[k].enabled = k === i;
        emit({ audioIdx: i });
      },
      setSub: applySub,
    };
  });

  // External subtitle file (SRT / VTT) -> custom overlay cues.
  useEffect(
    function () {
      cues.current = [];
      let dead = false;
      if (props.subUrl) {
        httpGet(props.subUrl, 20000).then(
          function (t) {
            if (dead) return;
            cues.current = parseSubtitles(t);
            readTracksRef.current();
          },
          function () {}
        );
      }
      return function () {
        dead = true;
      };
    },
    [props.subUrl]
  );

  useEffect(
    function () {
      const video = videoRef.current as any;
      if (!video || !props.url) return;
      const url = props.url;
      const mode = props.mode;
      let disposed = false;
      let fellBack = false;
      let retries = 0;
      let watchdog: any = 0;
      let lastSec = -1;
      let startApplied = false;
      subSel.current = -1;
      setSubText("");

      function readTracks() {
        const audio: TrackInfo[] = [];
        let ai = 0;
        const h = hlsRef.current;
        if (h) {
          const at = h.audioTracks || [];
          for (let i = 0; i < at.length; i++) audio.push({ index: i, label: at[i].name || at[i].lang || "Audio " + (i + 1) });
          ai = h.audioTrack >= 0 ? h.audioTrack : 0;
        } else if (video.audioTracks && video.audioTracks.length > 1) {
          for (let i = 0; i < video.audioTracks.length; i++) {
            const t = video.audioTracks[i];
            audio.push({ index: i, label: t.label || t.language || "Audio " + (i + 1) });
            if (t.enabled) ai = i;
          }
        }
        const list: SubEntry[] = [];
        if (cues.current.length) list.push({ label: "External subtitles", kind: "ext", ti: -1 });
        if (video.textTracks) {
          for (let i = 0; i < video.textTracks.length; i++) {
            const t = video.textTracks[i];
            if (t.kind === "subtitles" || t.kind === "captions") {
              list.push({ label: t.label || t.language || "Subtitle " + (i + 1), kind: "text", ti: i });
              if (!t.__sp) {
                t.__sp = true;
                t.addEventListener("cuechange", onCueChange);
              }
            }
          }
        }
        subList.current = list;
        emit({
          audio: audio,
          audioIdx: ai,
          subs: list.map(function (s, i) {
            return { index: i, label: s.label };
          }),
        });
      }
      readTracksRef.current = readTracks;

      function onCueChange() {
        const e = subList.current[subSel.current];
        if (!e || e.kind !== "text") return;
        const t = video.textTracks[e.ti];
        const act = t && t.activeCues;
        let txt = "";
        if (act) for (let i = 0; i < act.length; i++) txt += (i ? "\n" : "") + String(act[i].text).replace(/<[^>]+>/g, "");
        setSubText(txt);
      }

      function fail(msg: string) {
        if (disposed) return;
        clearTimeout(watchdog);
        emit({ state: "error", error: msg });
      }

      function fallback(reason: string) {
        if (disposed) return;
        if (fellBack || mode === "native" || !looksLikeHls(url)) {
          fail(reason);
          return;
        }
        fellBack = true;
        clearTimeout(watchdog);
        try {
          video.removeAttribute("src");
          video.load();
        } catch (e) {
          /* ignore */
        }
        startHls();
      }

      function startNative() {
        emit({ engine: "native" });
        video.src = url;
        const p = video.play();
        if (p && p.catch) p.catch(function () {});
        if (mode === "auto") {
          watchdog = setTimeout(function () {
            if (!disposed && (st.current.state === "loading" || st.current.state === "buffering") && !video.currentTime) {
              fallback("Native player timed out");
            }
          }, 20000);
        }
      }

      function startHls() {
        emit({ engine: "hls", state: "loading", error: "" });
        import("hls.js").then(
          function (mod: any) {
            if (disposed) return;
            const Hls = mod.default || mod;
            if (!Hls.isSupported()) {
              fail("This device cannot play the stream with the software player");
              return;
            }
            const prof = BUFFER_PROFILES[cb.current.buffer] || BUFFER_PROFILES.medium;
            const hls = new Hls({
              enableWorker: chromeMajor() >= 60,
              subtitleDisplay: false,
              backBufferLength: 20,
              maxBufferLength: prof.maxBufferLength,
              maxMaxBufferLength: prof.maxMaxBufferLength,
              maxBufferSize: prof.maxBufferSize,
              manifestLoadingTimeOut: 15000,
              fragLoadingTimeOut: 25000,
            });
            hlsRef.current = hls;
            hls.on(Hls.Events.MANIFEST_PARSED, function () {
              const p = video.play();
              if (p && p.catch) p.catch(function () {});
            });
            hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, readTracks);
            hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, function () {
              setTimeout(readTracks, 200);
            });
            hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, readTracks);
            hls.on(Hls.Events.ERROR, function (_e: any, data: any) {
              if (!data || !data.fatal) return;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retries < 3) {
                retries++;
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retries < 3) {
                retries++;
                hls.recoverMediaError();
              } else fail("Stream error (" + (data.details || "fatal") + ")");
            });
            hls.loadSource(url);
            hls.attachMedia(video);
          },
          function () {
            fail("Could not load the software player");
          }
        );
      }

      const on = function (n: string, f: () => void) {
        video.addEventListener(n, f);
        return function () {
          video.removeEventListener(n, f);
        };
      };
      const offs: Array<() => void> = [
        on("playing", function () {
          clearTimeout(watchdog);
          emit({ state: "playing", error: "" });
        }),
        on("canplay", function () {
          if (!video.paused && st.current.state !== "playing") emit({ state: "playing" });
        }),
        on("pause", function () {
          if (!video.ended) emit({ state: "paused" });
        }),
        on("waiting", function () {
          emit({ state: "buffering" });
        }),
        on("ended", function () {
          emit({ state: "ended" });
          if (cb.current.onEnded) cb.current.onEnded();
        }),
        on("loadedmetadata", function () {
          const d = video.duration;
          emit({ duration: isFinite(d) ? d : 0 });
          const sa = cb.current.startAt || 0;
          if (!startApplied && sa > 0 && isFinite(d) && sa < d - 30) {
            startApplied = true;
            try {
              video.currentTime = sa;
            } catch (e) {
              /* ignore */
            }
          }
          readTracks();
        }),
        on("durationchange", function () {
          const d = video.duration;
          emit({ duration: isFinite(d) ? d : 0 });
        }),
        on("timeupdate", function () {
          const t = video.currentTime;
          if (subSel.current >= 0 && subList.current[subSel.current] && subList.current[subSel.current].kind === "ext") {
            const c = findCue(cues.current, t);
            setSubText(c ? c.text : "");
          }
          const sec = Math.floor(t);
          if (sec !== lastSec) {
            lastSec = sec;
            emit({ time: t });
          }
        }),
        on("error", function () {
          const code = video.error ? video.error.code : 0;
          if (st.current.engine === "native") fallback(code === 4 ? "Format not supported by the native player" : "Playback error");
          else if (!hlsRef.current) fail("Playback error");
        }),
      ];

      emit({ state: "loading", time: 0, duration: 0, error: "", audio: [], audioIdx: 0, subs: [], subIdx: -1, engine: "native" });
      if (mode === "hls") startHls();
      else startNative();

      return function () {
        disposed = true;
        clearTimeout(watchdog);
        for (let i = 0; i < offs.length; i++) offs[i]();
        if (hlsRef.current) {
          try {
            hlsRef.current.destroy();
          } catch (e) {
            /* ignore */
          }
          hlsRef.current = null;
        }
        try {
          video.pause();
          video.removeAttribute("src");
          video.load();
        } catch (e) {
          /* ignore */
        }
      };
    },
    [props.url, props.mode, props.reload]
  );

  const lines = subText ? subText.split("\n") : [];
  return (
    <div className="hp">
      <video ref={videoRef} className="hp-video" autoPlay playsInline />
      {lines.length > 0 && (
        <div className={"hp-subs hp-subs-" + props.subSize}>
          <span>
            {lines.map(function (l, i) {
              return (
                <span key={i}>
                  {i > 0 && <br />}
                  {l}
                </span>
              );
            })}
          </span>
        </div>
      )}
    </div>
  );
});

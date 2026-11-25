// Player container: HybridPlayer + OSD + remote-key handling. The same DOM element
// switches between a mini preview (Live TV right column) and full screen, so the
// stream keeps playing without a restart when entering/leaving full screen.
import { useEffect, useMemo, useRef, useState } from "react";
import { HybridPlayer } from "./HybridPlayer";
import type { PlayerHandle, PlayerStatus } from "./HybridPlayer";
import { PlayerOverlay } from "./PlayerOverlay";
import type { Menu } from "./PlayerOverlay";
import { Spinner } from "../components/ui";
import { KEY, isBackKey } from "../config/keyCodes";
import { useKeyHandler } from "../navigation/SpatialNav";
import { toggleFav, useStore } from "../store/appStore";
import { resolveItemUrl } from "../services/playlistService";
import { currentIndex, loadEpg } from "../services/epgService";
import { keepScreenOn } from "../services/webosService";
import type { Item, Playlist, Programme } from "../types";

interface Props {
  item: Item;
  playlist: Playlist | null;
  fullscreen: boolean;
  subtitle?: string;
  hasPrev?: boolean;
  hasNext?: boolean;
  onExit: () => void;
  onFullscreen: () => void;
  onStep?: (d: number) => void;
  onEnded?: () => void;
}

const INITIAL: PlayerStatus = {
  state: "idle",
  time: 0,
  duration: 0,
  engine: "native",
  error: "",
  audio: [],
  audioIdx: 0,
  subs: [],
  subIdx: -1,
};

function posKey(uid: string) {
  return "sp_pos_" + uid;
}

export function PlayerView(p: Props) {
  const settings = useStore((s) => s.settings);
  const favs = useStore((s) => s.favs);
  const item = p.item;
  const live = item.kind === "live";
  const url = resolveItemUrl(item, p.playlist, settings);
  const handle = useRef<PlayerHandle>(null);
  const [status, setStatus] = useState<PlayerStatus>(INITIAL);
  const [override, setOverride] = useState<{ uid: string; mode: "auto" | "native" | "hls" } | null>(null);
  const [reload, setReload] = useState(0);
  const [ovl, setOvl] = useState(true);
  const [menu, setMenu] = useState<Menu>(null);
  const [epg, setEpg] = useState<Programme[]>([]);
  const [, setTick] = useState(0);
  const hideTimer = useRef<any>(0);
  const lastShow = useRef(0);
  const live_ = useRef({ state: status.state, menu: menu, ovl: ovl });
  live_.current = { state: status.state, menu: menu, ovl: ovl };

  const mode = override && override.uid === item.uid ? override.mode : settings.playerMode;

  const startAt = useMemo(
    function () {
      if (live) return 0;
      try {
        return parseFloat(localStorage.getItem(posKey(item.uid)) || "0") || 0;
      } catch (e) {
        return 0;
      }
    },
    [item.uid, live]
  );

  function show() {
    lastShow.current = Date.now();
    setOvl(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(function () {
      if (live_.current.state === "playing" && !live_.current.menu) setOvl(false);
    }, 6000);
  }

  useEffect(
    function () {
      if (p.fullscreen) show();
      else {
        clearTimeout(hideTimer.current);
        setMenu(null);
      }
      return function () {
        clearTimeout(hideTimer.current);
      };
    },
    // eslint-disable-next-line
    [p.fullscreen, item.uid]
  );

  // EPG for live channels (XMLTV in IndexedDB, else Xtream short EPG).
  useEffect(
    function () {
      setEpg([]);
      if (!live) return;
      let dead = false;
      loadEpg(item, p.playlist).then(function (l) {
        if (!dead) setEpg(l);
      });
      const id = setInterval(function () {
        setTick(function (t) {
          return t + 1;
        });
      }, 30000);
      return function () {
        dead = true;
        clearInterval(id);
      };
    },
    // eslint-disable-next-line
    [item.uid]
  );

  // Keep the TV awake while video is active.
  useEffect(
    function () {
      keepScreenOn(status.state === "playing" || status.state === "buffering");
    },
    [status.state]
  );
  useEffect(function () {
    return function () {
      keepScreenOn(false);
    };
  }, []);

  // Resume position for VOD.
  const savedBucket = Math.floor(status.time / 10);
  useEffect(
    function () {
      if (live || status.time < 15) return;
      try {
        if (status.duration > 0 && status.time > status.duration - 45) localStorage.removeItem(posKey(item.uid));
        else localStorage.setItem(posKey(item.uid), String(Math.floor(status.time)));
      } catch (e) {
        /* ignore */
      }
    },
    // eslint-disable-next-line
    [savedBucket]
  );

  const now = Date.now();
  const ci = currentIndex(epg, now);
  let nowP: Programme | null = ci >= 0 ? epg[ci] : null;
  let nextP: Programme | null = null;
  if (ci >= 0) nextP = epg[ci + 1] || null;
  else {
    for (let i = 0; i < epg.length; i++)
      if (epg[i].start > now) {
        nextP = epg[i];
        break;
      }
  }
  if (!live) nowP = null;

  function step(d: number) {
    if (p.onStep) p.onStep(d);
  }

  function toggleEngine() {
    const target = status.engine === "hls" ? "native" : "hls";
    setOverride({ uid: item.uid, mode: target });
  }

  useKeyHandler(
    function (code) {
      const wasVisible = live_.current.ovl;
      const h = handle.current;
      show();
      if (isBackKey(code)) {
        if (live_.current.menu) {
          setMenu(null);
          return true;
        }
        p.onExit();
        return true;
      }
      switch (code) {
        case KEY.PLAY:
          if (h) h.play();
          return true;
        case KEY.PAUSE:
          if (h) h.pause();
          return true;
        case KEY.PLAY_PAUSE:
        case KEY.SPACE:
          if (h) h.toggle();
          return true;
        case KEY.STOP:
          p.onExit();
          return true;
        case KEY.REWIND:
          if (h && !live) h.seekBy(-30);
          return true;
        case KEY.FAST_FORWARD:
          if (h && !live) h.seekBy(30);
          return true;
        case KEY.CH_UP:
        case KEY.PAGE_UP:
          step(1);
          return true;
        case KEY.CH_DOWN:
        case KEY.PAGE_DOWN:
          step(-1);
          return true;
        case KEY.YELLOW:
          toggleFav(item);
          return true;
        case KEY.INFO:
          return true;
      }
      if (!wasVisible && live_.current.state !== "error") {
        if (!live && code === KEY.LEFT) {
          if (h) h.seekBy(-10);
          return true;
        }
        if (!live && code === KEY.RIGHT) {
          if (h) h.seekBy(10);
          return true;
        }
        if (code === KEY.ENTER || (code >= 37 && code <= 40)) return true;
      }
      return "default";
    },
    { priority: 50, active: p.fullscreen }
  );

  const busy = status.state === "loading" || status.state === "buffering";
  const showOverlay = p.fullscreen && (ovl || status.state === "error");

  return (
    <div
      className={"pv " + (p.fullscreen ? "pv-full" : "pv-mini")}
      onMouseMove={function () {
        if (p.fullscreen && Date.now() - lastShow.current > 400) show();
      }}
    >
      <HybridPlayer
        ref={handle}
        url={url}
        live={live}
        mode={mode}
        buffer={settings.buffer}
        subSize={settings.subSize}
        subUrl={item.sub}
        startAt={startAt}
        reload={reload}
        onStatus={setStatus}
        onEnded={p.onEnded}
      />
      {busy && (
        <div className="pv-msg">
          <Spinner />
        </div>
      )}
      {status.state === "error" && !p.fullscreen && (
        <div className="pv-msg pv-msg-err">
          <div>Can't play this stream</div>
          <div className="pv-msg-sub">{status.error}</div>
        </div>
      )}
      {!p.fullscreen && (
        <div className="pv-focus nv" data-nav="" tabIndex={-1} onClick={p.onFullscreen}>
          <span className="pv-hint">OK · Full screen</span>
        </div>
      )}
      {showOverlay && (
        <PlayerOverlay
          title={item.name}
          subtitle={p.subtitle || (live ? item.group : "")}
          live={live}
          status={status}
          now={nowP}
          next={nextP}
          menu={menu}
          engineLabel={status.engine === "hls" ? "Player: Software" : "Player: Native"}
          fav={!!favs[item.uid]}
          hasPrev={!!p.hasPrev}
          hasNext={!!p.hasNext}
          onMenu={setMenu}
          onToggle={() => {
            if (handle.current) handle.current.toggle();
            show();
          }}
          onSeek={(d) => {
            if (handle.current) handle.current.seekBy(d);
            show();
          }}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onAudio={(i) => handle.current && handle.current.setAudio(i)}
          onSub={(i) => handle.current && handle.current.setSub(i)}
          onEngine={toggleEngine}
          onRetry={() => setReload(reload + 1)}
          onFav={() => toggleFav(item)}
          onClose={p.onExit}
        />
      )}
    </div>
  );
}

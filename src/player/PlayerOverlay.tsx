// On-screen display (OSD): transport controls, audio/subtitle track menus,
// player-engine toggle and EPG now/next information.
import { Btn } from "../navigation/SpatialNav";
import { Clock, Icon } from "../components/ui";
import type { PlayerStatus } from "./HybridPlayer";
import type { Programme } from "../types";
import { fmtDuration, fmtHM } from "../utils/format";

export type Menu = null | "audio" | "subs";

interface Props {
  title: string;
  subtitle?: string;
  live: boolean;
  status: PlayerStatus;
  now?: Programme | null;
  next?: Programme | null;
  menu: Menu;
  engineLabel: string;
  fav: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onMenu: (m: Menu) => void;
  onToggle: () => void;
  onSeek: (d: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onAudio: (i: number) => void;
  onSub: (i: number) => void;
  onEngine: () => void;
  onRetry: () => void;
  onFav: () => void;
  onClose: () => void;
}

export function PlayerOverlay(p: Props) {
  const s = p.status;
  const playing = s.state === "playing" || s.state === "buffering" || s.state === "loading";
  let pct = 0;
  let leftLabel = "";
  let rightLabel = "";
  if (p.live) {
    if (p.now) {
      const t = Date.now();
      pct = Math.max(0, Math.min(100, ((t - p.now.start) / (p.now.stop - p.now.start)) * 100));
      leftLabel = fmtHM(p.now.start);
      rightLabel = fmtHM(p.now.stop);
    }
  } else if (s.duration > 0) {
    pct = Math.max(0, Math.min(100, (s.time / s.duration) * 100));
    leftLabel = fmtDuration(s.time);
    rightLabel = fmtDuration(s.duration);
  }

  return (
    <div className="ov" data-nav-modal="">
      <div className="ov-top">
        <div className="ov-title">
          <div className="ov-name">{p.title}</div>
          {p.subtitle && <div className="ov-sub">{p.subtitle}</div>}
        </div>
        <div className="ov-badge">{s.engine === "hls" ? "Software (hls.js)" : "Native"}</div>
        <Clock />
      </div>

      {p.menu && (
        <div className="ov-menu">
          <div className="ov-menu-title">{p.menu === "audio" ? "Audio track" : "Subtitles"}</div>
          {p.menu === "subs" && (
            <Btn className="ov-menu-item" autoFocus selected={s.subIdx < 0} onClick={() => p.onSub(-1)}>
              Off
            </Btn>
          )}
          {(p.menu === "audio" ? s.audio : s.subs).map(function (t, i) {
            const sel = p.menu === "audio" ? s.audioIdx === t.index : s.subIdx === t.index;
            return (
              <Btn
                key={t.index}
                className="ov-menu-item"
                autoFocus={p.menu === "audio" && i === 0}
                selected={sel}
                onClick={() => (p.menu === "audio" ? p.onAudio(t.index) : p.onSub(t.index))}
              >
                {t.label}
              </Btn>
            );
          })}
          {(p.menu === "audio" ? s.audio : s.subs).length === 0 && (
            <div className="ov-menu-empty">{p.menu === "audio" ? "Only one audio track available" : "No subtitles available"}</div>
          )}
          <Btn className="ov-menu-item ov-menu-close" onClick={() => p.onMenu(null)}>
            Close
          </Btn>
        </div>
      )}

      {s.state === "error" && (
        <div className="ov-error">
          <div className="ov-error-title">Playback problem</div>
          <div className="ov-error-text">{s.error || "The stream could not be played."}</div>
        </div>
      )}

      <div className="ov-bottom">
        {p.live && (
          <div className="ov-epg">
            <div className="ov-epg-now">{p.now ? p.now.title : "No programme information"}</div>
            {p.next && (
              <div className="ov-epg-next">
                Next {fmtHM(p.next.start)} · {p.next.title}
              </div>
            )}
          </div>
        )}
        <div className="ov-bar-row">
          <span className="ov-time">{leftLabel}</span>
          <div className="ov-bar">
            <div className="ov-bar-fill" style={{ width: pct + "%" }} />
          </div>
          <span className="ov-time ov-time-r">{p.live && !p.now ? "LIVE" : rightLabel}</span>
        </div>
        <div className="ov-ctrls">
          <Btn className="ov-btn" disabled={!p.hasPrev} onClick={p.onPrev} title="Previous">
            <Icon name="prev" size={40} />
          </Btn>
          {!p.live && (
            <Btn className="ov-btn" onClick={() => p.onSeek(-30)} title="Rewind 30s">
              <Icon name="rew" size={40} />
            </Btn>
          )}
          <Btn className="ov-btn ov-btn-main" autoFocus={!p.menu} onClick={p.onToggle} title="Play / Pause">
            <Icon name={playing ? "pause" : "play"} size={52} />
          </Btn>
          {!p.live && (
            <Btn className="ov-btn" onClick={() => p.onSeek(30)} title="Forward 30s">
              <Icon name="ff" size={40} />
            </Btn>
          )}
          <Btn className="ov-btn" disabled={!p.hasNext} onClick={p.onNext} title="Next">
            <Icon name="next" size={40} />
          </Btn>
          <div className="ov-sep" />
          <Btn className="ov-btn ov-btn-text" onClick={() => p.onMenu("audio")}>
            <Icon name="audio" size={32} />
            <span>Audio</span>
          </Btn>
          <Btn className="ov-btn ov-btn-text" onClick={() => p.onMenu("subs")}>
            <Icon name="cc" size={32} />
            <span>Subtitles</span>
          </Btn>
          <Btn className="ov-btn ov-btn-text" onClick={p.onEngine}>
            <Icon name="gear" size={32} />
            <span>{p.engineLabel}</span>
          </Btn>
          {s.state === "error" && (
            <Btn className="ov-btn ov-btn-text" onClick={p.onRetry}>
              <span>Retry</span>
            </Btn>
          )}
          <Btn className={"ov-btn ov-btn-text" + (p.fav ? " ov-fav" : "")} onClick={p.onFav}>
            <Icon name="star" size={32} />
            <span>{p.fav ? "Favorited" : "Favorite"}</span>
          </Btn>
          <Btn className="ov-btn ov-btn-text" onClick={p.onClose}>
            <Icon name="back" size={32} />
            <span>Back</span>
          </Btn>
        </div>
      </div>
    </div>
  );
}

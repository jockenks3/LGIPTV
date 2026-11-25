import { useEffect, useMemo, useState } from "react";
import { Btn, Field, Modal, useBack } from "../navigation/SpatialNav";
import { VirtualList } from "../navigation/VirtualList";
import { Header, PinModal } from "../components/ui";
import { activePlaylist, getState, go, setActive, setState, updateSettings, useStore } from "../store/appStore";
import { arraySource, clearEpg, epgCount } from "../services/dbService";
import { importEpg, refreshPlaylist, removePlaylist, resetEverything, savePlaylistEpgUrl } from "../services/playlistService";
import { withBusy } from "../services/busy";
import { getDeviceInfo } from "../services/webosService";
import type { DeviceInfo } from "../services/webosService";
import { fmtNum } from "../utils/format";
import type { Playlist, Settings } from "../types";

type Section = "playback" | "parental" | "playlists" | "epg" | "storage" | "about";

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: "playback", label: "Playback" },
  { id: "parental", label: "Parental PIN" },
  { id: "playlists", label: "Playlist manager" },
  { id: "epg", label: "Program guide (EPG)" },
  { id: "storage", label: "Storage & cache" },
  { id: "about", label: "About & legal" },
];

function Opt(p: { label: string; desc?: string; value: string; onClick: () => void; autoFocus?: boolean }) {
  return (
    <div className="opt">
      <div className="opt-text">
        <div className="opt-label">{p.label}</div>
        {p.desc && <div className="opt-desc">{p.desc}</div>}
      </div>
      <Btn className="btn opt-btn" autoFocus={p.autoFocus} onClick={p.onClick}>
        {p.value} ▸
      </Btn>
    </div>
  );
}

function cycle<T>(list: T[], cur: T): T {
  return list[(list.indexOf(cur) + 1) % list.length];
}

function Confirm(p: { title: string; text: string; action: string; onYes: () => void; onNo: () => void }) {
  return (
    <Modal onClose={p.onNo} className="modal-sm">
      <div className="modal-title">{p.title}</div>
      <div className="modal-text">{p.text}</div>
      <div className="modal-actions">
        <Btn className="btn btn-danger" onClick={p.onYes}>
          {p.action}
        </Btn>
        <Btn className="btn" autoFocus onClick={p.onNo}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}

function PlaybackPanel() {
  const s = useStore((x) => x.settings);
  const modeLabel: { [k: string]: string } = { auto: "Auto (native → hls.js)", native: "Native only", hls: "Software (hls.js)" };
  const bufLabel: { [k: string]: string } = { low: "Low (10 s)", medium: "Medium (30 s)", high: "High (60 s)" };
  const sizeLabel: { [k: string]: string } = { s: "Small", m: "Medium", l: "Large" };
  return (
    <div>
      <Opt
        autoFocus
        label="Video player"
        desc="Native uses the TV's hardware decoder. Auto falls back to hls.js if a stream fails."
        value={modeLabel[s.playerMode]}
        onClick={() => updateSettings({ playerMode: cycle<Settings["playerMode"]>(["auto", "native", "hls"], s.playerMode) })}
      />
      <Opt
        label="Buffer size (hls.js)"
        desc="Higher values smooth out weak networks but use more of the TV's memory."
        value={bufLabel[s.buffer]}
        onClick={() => updateSettings({ buffer: cycle<Settings["buffer"]>(["low", "medium", "high"], s.buffer) })}
      />
      <Opt
        label="Xtream live format"
        desc="HLS (.m3u8) is the most compatible. MPEG-TS has lower latency."
        value={s.liveFormat === "m3u8" ? "HLS (.m3u8)" : "MPEG-TS (.ts)"}
        onClick={() => updateSettings({ liveFormat: s.liveFormat === "m3u8" ? "ts" : "m3u8" })}
      />
      <Opt
        label="Subtitle size"
        value={sizeLabel[s.subSize]}
        onClick={() => updateSettings({ subSize: cycle<Settings["subSize"]>(["s", "m", "l"], s.subSize) })}
      />
      <Opt
        label="Show posters & logos"
        desc="Turn off on older TVs if the app becomes slow (low-memory mode)."
        value={s.posters ? "On" : "Off"}
        onClick={() => updateSettings({ posters: !s.posters })}
      />
    </div>
  );
}

interface Flow {
  step: "verify" | "new" | "confirm";
  then: "set" | "change" | "remove";
  first: string;
  error: string;
  n: number;
}

function ParentalPanel() {
  const pin = useStore((x) => x.settings.pin);
  const unlocked = useStore((x) => x.unlocked);
  const [flow, setFlow] = useState<Flow | null>(null);

  function begin(then: Flow["then"]) {
    setFlow({ step: then === "set" ? "new" : "verify", then: then, first: "", error: "", n: 0 });
  }

  function onDone(entered: string) {
    if (!flow) return;
    if (flow.step === "verify") {
      if (entered !== pin) return setFlow({ ...flow, error: "Wrong PIN", n: flow.n + 1 });
      if (flow.then === "remove") {
        updateSettings({ pin: "" });
        setState({ unlocked: false });
        setFlow(null);
      } else setFlow({ ...flow, step: "new", error: "", n: flow.n + 1 });
    } else if (flow.step === "new") {
      setFlow({ ...flow, step: "confirm", first: entered, error: "", n: flow.n + 1 });
    } else {
      if (entered !== flow.first) return setFlow({ ...flow, step: "new", first: "", error: "PINs did not match", n: flow.n + 1 });
      updateSettings({ pin: entered });
      setState({ unlocked: false });
      setFlow(null);
    }
  }

  const title = flow
    ? flow.step === "verify"
      ? "Enter current PIN"
      : flow.step === "new"
        ? "Enter new PIN"
        : "Confirm new PIN"
    : "";

  return (
    <div>
      <div className="panel-note">
        When a PIN is set, categories whose names contain adult keywords (e.g. “adult”, “xxx”, “18+”) are hidden from “All” lists and require the PIN to open.
      </div>
      {!pin ? (
        <Opt autoFocus label="Parental PIN" desc="No PIN set" value="Set PIN" onClick={() => begin("set")} />
      ) : (
        <>
          <Opt autoFocus label="Change PIN" desc="PIN protection is active" value="Change" onClick={() => begin("change")} />
          <Opt label="Remove PIN" desc="Disable parental protection" value="Remove" onClick={() => begin("remove")} />
          <Opt
            label="Adult categories"
            desc={unlocked ? "Unlocked for this session" : "Locked"}
            value={unlocked ? "Lock now" : "Locked"}
            onClick={() => setState({ unlocked: false })}
          />
        </>
      )}
      {flow && <PinModal key={flow.n} title={title} error={flow.error} onCancel={() => setFlow(null)} onDone={onDone} />}
    </div>
  );
}

function PlaylistsPanel() {
  const playlists = useStore((x) => x.playlists);
  const activeId = useStore((x) => x.activeId);
  const [sel, setSel] = useState<Playlist | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const source = useMemo(
    function () {
      return arraySource(playlists, "pl" + playlists.map((p) => p.id + p.updatedAt).join(","));
    },
    [playlists]
  );

  function refresh(p: Playlist) {
    setSel(null);
    withBusy("Refreshing playlist", (progress) => refreshPlaylist(p, progress));
  }

  return (
    <div>
      <div className="pl-bar">
        <Btn className="btn btn-primary" autoFocus onClick={() => go("onboarding")}>
          + Add playlist
        </Btn>
      </div>
      <VirtualList<Playlist>
        key={source.key}
        source={source}
        width={1280}
        height={620}
        itemHeight={96}
        rowClassName="cat-row"
        empty={<div className="list-empty">No playlists</div>}
        renderItem={(p) =>
          p ? (
            <div className={"plrow" + (p.id === activeId ? " plrow-active" : "")}>
              <div className="plrow-main">
                <div className="plrow-name">
                  {p.name} {p.id === activeId && <span className="pill">ACTIVE</span>}
                </div>
                <div className="plrow-sub">
                  {p.type === "xtream" ? "Xtream Codes" : "M3U"} · {fmtNum(p.counts.live)} live · {fmtNum(p.counts.movie)} movies · {fmtNum(p.counts.series)} series
                  {p.info && p.info.exp ? " · expires " + p.info.exp : ""}
                </div>
              </div>
            </div>
          ) : (
            <div className="plrow" />
          )
        }
        onSelect={(p) => {
          setConfirmDel(false);
          setSel(p);
        }}
      />
      {sel && !confirmDel && (
        <Modal onClose={() => setSel(null)} className="modal-sm">
          <div className="modal-title">{sel.name}</div>
          <div className="modal-actions modal-col">
            <Btn
              className="btn btn-primary"
              autoFocus
              onClick={() => {
                setActive(sel.id);
                setSel(null);
              }}
            >
              Use this playlist
            </Btn>
            <Btn className="btn" onClick={() => refresh(sel)}>
              Refresh content
            </Btn>
            <Btn className="btn btn-danger" onClick={() => setConfirmDel(true)}>
              Delete
            </Btn>
            <Btn className="btn" onClick={() => setSel(null)}>
              Close
            </Btn>
          </div>
        </Modal>
      )}
      {sel && confirmDel && (
        <Confirm
          title="Delete playlist?"
          text={"“" + sel.name + "” and all of its cached channels will be removed from this device."}
          action="Delete"
          onNo={() => setConfirmDel(false)}
          onYes={() => {
            const id = sel.id;
            setSel(null);
            setConfirmDel(false);
            withBusy("Deleting playlist", () => removePlaylist(id)).then(() => {
              if (getState().playlists.length === 0) go("onboarding");
            });
          }}
        />
      )}
    </div>
  );
}


function EpgPanel() {
  const pl = useStore((x) => activePlaylist(x));
  const status = useStore((x) => x.epgStatus);
  const auto = useStore((x) => x.settings.autoEpg);
  const [url, setUrl] = useState(pl ? pl.epgUrl || "" : "");
  const [count, setCount] = useState(0);
  useEffect(
    function () {
      epgCount().then(setCount, function () {});
    },
    [status]
  );
  if (!pl) return <div className="panel-note">No active playlist.</div>;
  return (
    <div>
      <div className="panel-note">
        Guide data: <b>{fmtNum(count)}</b> programmes stored (window: −24 h … +48 h). {status && <span>· {status}</span>}
      </div>
      <Field label="XMLTV EPG URL (plain .xml)" value={url} onChange={setUrl} placeholder="http://example.com/guide.xml" autoFocus />
      <div className="form-actions">
        <Btn
          className="btn btn-primary"
          onClick={() => {
            savePlaylistEpgUrl(pl, url).then(() => {
              const next = { ...pl, epgUrl: url.trim() };
              withBusy("Updating guide", () => importEpg(next));
            });
          }}
        >
          Save &amp; update guide
        </Btn>
      </div>
      <Opt label="Update guide after playlist import" value={auto ? "On" : "Off"} onClick={() => updateSettings({ autoEpg: !auto })} />
    </div>
  );
}

function StoragePanel() {
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div>
      <Opt
        autoFocus
        label="Clear cache"
        desc="Removes downloaded guide (EPG) data and resume positions. Playlists are kept."
        value="Clear"
        onClick={() => {
          clearEpg().then(() => {
            try {
              const rm: string[] = [];
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i) as string;
                if (k.indexOf("sp_pos_") === 0) rm.push(k);
              }
              rm.forEach((k) => localStorage.removeItem(k));
            } catch (e) {
              /* ignore */
            }
            setState({ epgStatus: "" });
            setMsg("Cache cleared");
          });
        }}
      />
      <Opt label="Reset app" desc="Deletes all playlists, favorites and cached data." value="Reset…" onClick={() => setConfirm(true)} />
      {msg && <div className="panel-note">{msg}</div>}
      {confirm && (
        <Confirm
          title="Reset StreamPlayer?"
          text="All playlists, favorites and cached content will be deleted from this device."
          action="Delete everything"
          onNo={() => setConfirm(false)}
          onYes={() => {
            setConfirm(false);
            withBusy("Resetting", () => resetEverything());
          }}
        />
      )}
    </div>
  );
}

function AboutPanel() {
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const server = useStore((x) => x.settings.companionUrl);
  useEffect(function () {
    getDeviceInfo().then(setInfo);
  }, []);
  return (
    <div>
      <div className="panel-note">
        <b>StreamPlayer 1.0.0</b>
        <br />
        Device: {info ? info.modelName + " · webOS " + info.version + " · " + info.screen : "…"}
      </div>
      <Field label="Companion server address (for playlist upload)" value={server} onChange={(v) => updateSettings({ companionUrl: v })} placeholder="192.168.1.20:8787" autoFocus />
      <div className="disclaimer disclaimer-flat">
        <div className="disclaimer-title">Legal</div>
        StreamPlayer is a media player only. It ships without any channels, playlists, streams or logos. You are solely responsible for the content you load and for
        ensuring that you hold the rights to view it.
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const [section, setSection] = useState<Section>("playback");
  useBack(function () {
    go("home");
  });
  return (
    <div className="screen">
      <Header title="Settings" icon="gear" />
      <div className="set-cols">
        <div className="set-menu">
          {SECTIONS.map(function (s) {
            return (
              <Btn key={s.id} className="set-item" selected={section === s.id} onClick={() => setSection(s.id)}>
                {s.label}
              </Btn>
            );
          })}
        </div>
        <div className="set-panel" key={section}>
          {section === "playback" && <PlaybackPanel />}
          {section === "parental" && <ParentalPanel />}
          {section === "playlists" && <PlaylistsPanel />}
          {section === "epg" && <EpgPanel />}
          {section === "storage" && <StoragePanel />}
          {section === "about" && <AboutPanel />}
        </div>
      </div>
      <div className="foot-bar">
        <span>OK: change / open</span>
        <span className="foot-sep">BACK: home</span>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Btn, Field, useBack } from "../navigation/SpatialNav";
import { Icon } from "../components/ui";
import { go, updateSettings, useStore } from "../store/appStore";
import { addPlaylist } from "../services/playlistService";
import type { NewPlaylist } from "../services/playlistService";
import { withBusy } from "../services/busy";
import { generateCode, normalizeServerUrl, pollCode, registerCode } from "../services/pairingService";
import type { PairPayload } from "../services/pairingService";
import { isWebOS } from "../services/webosService";

type Tab = "pair" | "m3u" | "xtream" | "file";

function importPlaylist(def: NewPlaylist) {
  return withBusy("Importing playlist", function (progress) {
    return addPlaylist(def, progress);
  }).then(function (pl) {
    if (pl) go("home");
  });
}

function PairPanel() {
  const settings = useStore((s) => s.settings);
  const [server, setServer] = useState(settings.companionUrl);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "waiting" | "error">("idle");
  const [msg, setMsg] = useState("");
  const serverUrl = useRef("");

  function start() {
    const url = normalizeServerUrl(server);
    if (!url) {
      setStatus("error");
      setMsg("Enter the address of the companion server, e.g. 192.168.1.20:8787");
      return;
    }
    serverUrl.current = url;
    updateSettings({ companionUrl: url });
    const c = generateCode();
    setStatus("connecting");
    setMsg("");
    registerCode(url, c).then(
      function () {
        setCode(c);
        setStatus("waiting");
      },
      function () {
        setStatus("error");
        setMsg("Cannot reach " + url + ". Start the companion server on a PC/phone in the same network and check the address.");
      }
    );
  }

  useEffect(function () {
    if (settings.companionUrl) start();
    // eslint-disable-next-line
  }, []);

  useEffect(
    function () {
      if (status !== "waiting") return;
      let dead = false;
      const id = setInterval(function () {
        pollCode(serverUrl.current, code).then(
          function (r) {
            if (dead) return;
            if (r.status === "ready" && r.payload) {
              dead = true;
              clearInterval(id);
              receive(r.payload);
            } else if (r.status === "unknown") {
              registerCode(serverUrl.current, code).catch(function () {});
            }
          },
          function () {}
        );
      }, 2500);
      return function () {
        dead = true;
        clearInterval(id);
      };
    },
    [status, code]
  );

  function receive(p: PairPayload) {
    setStatus("idle");
    importPlaylist({
      name: p.name || "",
      type: p.type === "xtream" ? "xtream" : "m3u",
      url: p.url,
      epgUrl: p.epgUrl,
      host: p.host,
      username: p.username,
      password: p.password,
    });
  }

  return (
    <div className="tab-body">
      <div className="tab-help">
        Upload your playlist from a phone or PC. Run the <b>companion server</b> on a device in your network, then enter its address here.
      </div>
      <Field label="Companion server address" value={server} onChange={setServer} placeholder="192.168.1.20:8787" autoFocus onEnter={start} />
      {status === "waiting" ? (
        <div className="pair-box">
          <div className="pair-label">Open the companion website and enter this code</div>
          <div className="pair-code">{code.substring(0, 3) + " " + code.substring(3)}</div>
          <div className="pair-url">{serverUrl.current}</div>
          <div className="pair-wait">Waiting for playlist…</div>
        </div>
      ) : (
        <div className="pair-box pair-idle">{status === "connecting" ? "Connecting…" : "Press Connect to get a 6-digit pairing code"}</div>
      )}
      {msg && <div className="form-error">{msg}</div>}
      <div className="form-actions">
        <Btn className="btn btn-primary" onClick={start}>
          {status === "waiting" ? "New code" : "Connect"}
        </Btn>
      </div>
    </div>
  );
}

function M3uPanel() {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [epg, setEpg] = useState("");
  const [err, setErr] = useState("");
  function submit() {
    if (!/^https?:\/\//i.test(url.trim())) {
      setErr("Enter a valid http:// or https:// playlist URL");
      return;
    }
    setErr("");
    importPlaylist({ type: "m3u", name: name.trim(), url: url.trim(), epgUrl: epg.trim() });
  }
  return (
    <div className="tab-body">
      <Field label="Playlist name (optional)" value={name} onChange={setName} placeholder="My playlist" />
      <Field label="M3U / M3U8 URL" value={url} onChange={setUrl} placeholder="http://example.com/playlist.m3u" autoFocus />
      <Field label="XMLTV EPG URL (optional)" value={epg} onChange={setEpg} placeholder="http://example.com/guide.xml" />
      {err && <div className="form-error">{err}</div>}
      <div className="form-actions">
        <Btn className="btn btn-primary" onClick={submit}>
          Load playlist
        </Btn>
      </div>
    </div>
  );
}

function XtreamPanel() {
  const [host, setHost] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  function submit() {
    if (!host.trim() || !user.trim() || !pass.trim()) {
      setErr("Server, username and password are required");
      return;
    }
    setErr("");
    importPlaylist({ type: "xtream", name: "", host: host.trim(), username: user.trim(), password: pass.trim() });
  }
  return (
    <div className="tab-body">
      <Field label="Server URL" value={host} onChange={setHost} placeholder="http://provider.example:8080" autoFocus />
      <Field label="Username" value={user} onChange={setUser} />
      <Field label="Password" value={pass} onChange={setPass} type="password" />
      {err && <div className="form-error">{err}</div>}
      <div className="form-actions">
        <Btn className="btn btn-primary" onClick={submit}>
          Log in
        </Btn>
      </div>
    </div>
  );
}

function FilePanel() {
  const input = useRef<HTMLInputElement>(null);
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = function () {
      importPlaylist({ type: "m3u", name: f.name.replace(/\.[^.]+$/, ""), text: String(r.result || "") });
    };
    r.readAsText(f);
    e.target.value = "";
  }
  return (
    <div className="tab-body">
      <div className="tab-help">Choose an .m3u / .m3u8 file from this computer (browser only — TVs have no file picker; use Pair Device instead).</div>
      <input ref={input} type="file" accept=".m3u,.m3u8,.txt,audio/x-mpegurl" style={{ display: "none" }} onChange={onFile} />
      <div className="form-actions">
        <Btn className="btn btn-primary" autoFocus onClick={() => input.current && input.current.click()}>
          Choose file…
        </Btn>
      </div>
    </div>
  );
}

export function OnboardingScreen() {
  const hasPlaylists = useStore((s) => s.playlists.length > 0);
  const [tab, setTab] = useState<Tab>("pair");
  useBack(function () {
    go("settings");
  }, hasPlaylists);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "pair", label: "Pair Device" },
    { id: "m3u", label: "M3U URL" },
    { id: "xtream", label: "Xtream Login" },
  ];
  if (!isWebOS) tabs.push({ id: "file", label: "Upload File" });

  return (
    <div className="screen onb">
      <div className="onb-left">
        <div className="brand">
          <div className="brand-logo">
            <Icon name="play" size={40} />
          </div>
          <div>
            <div className="brand-name">StreamPlayer</div>
            <div className="brand-sub">IPTV media player</div>
          </div>
        </div>
        <div className="onb-title">Set up your playlist</div>
        <div className="onb-text">
          StreamPlayer is an empty media player. It does <b>not</b> include any channels, playlists, streams or logos.
        </div>
        <div className="disclaimer">
          <div className="disclaimer-title">Important notice</div>
          You must supply your own playlist or subscription and you are responsible for making sure you have the legal right to
          access and view that content. The developers do not provide, host or endorse any media.
        </div>
        {!isWebOS && (
          <Btn className="btn onb-dl" onClick={() => go("downloads")}>
            <Icon name="download" size={28} />
            <span>Download TV app (.ipk) &amp; companion website</span>
          </Btn>
        )}
        {hasPlaylists && (
          <Btn className="btn onb-dl" onClick={() => go("settings")}>
            <Icon name="back" size={28} />
            <span>Back to settings</span>
          </Btn>
        )}
      </div>

      <div className="onb-right">
        <div className="tabs">
          {tabs.map(function (t) {
            return (
              <Btn key={t.id} className="tab" selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </Btn>
            );
          })}
        </div>
        {tab === "pair" && <PairPanel key="pair" />}
        {tab === "m3u" && <M3uPanel key="m3u" />}
        {tab === "xtream" && <XtreamPanel key="xtream" />}
        {tab === "file" && <FilePanel key="file" />}
      </div>
    </div>
  );
}

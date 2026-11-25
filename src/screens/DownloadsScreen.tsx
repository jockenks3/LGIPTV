// Shown only outside the TV (desktop browser): download the webOS .ipk and the
// companion server used to upload playlists to the TV.
import { Btn, useBack } from "../navigation/SpatialNav";
import { Header, Icon } from "../components/ui";
import { go } from "../store/appStore";
import { IPK_BASE64, IPK_NAME, SERVER_NAME, SERVER_SOURCE } from "../generated/downloads";

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}

function downloadIpk() {
  const bin = atob(IPK_BASE64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  save(new Blob([arr], { type: "application/octet-stream" }), IPK_NAME);
}

function downloadServer() {
  save(new Blob([SERVER_SOURCE], { type: "text/javascript" }), SERVER_NAME);
}

export function DownloadsScreen() {
  useBack(function () {
    go("onboarding");
  });
  const haveIpk = IPK_BASE64.length > 0;
  return (
    <div className="screen">
      <Header title="Downloads" icon="download" />
      <div className="dl-cols">
        <div className="dl-card">
          <div className="dl-card-title">1 · LG webOS app (.ipk)</div>
          <div className="dl-text">
            ES5 build for webOS 3.0+ (Chromium 38). Sideload with the LG webOS CLI after enabling the <b>Developer Mode</b> app on your TV.
          </div>
          <Btn className="btn btn-primary" autoFocus disabled={!haveIpk} onClick={downloadIpk}>
            <Icon name="download" size={28} />
            <span>{haveIpk ? "Download " + IPK_NAME : "IPK not built yet"}</span>
          </Btn>
          <pre className="dl-code">
{`ares-setup-device            # add your TV as "tv"
ares-install -d tv ${IPK_NAME || "com.example.iptvplayer_1.0.0_all.ipk"}
ares-launch  -d tv com.example.iptvplayer`}
          </pre>
        </div>
        <div className="dl-card">
          <div className="dl-card-title">2 · Companion website (playlist upload)</div>
          <div className="dl-text">
            A tiny local web server (Node.js 14+, no dependencies). Run it on a PC in the same network, open its address on your phone or computer
            and upload an M3U file, paste a URL or enter Xtream credentials. Then type the 6-digit code that the TV shows.
          </div>
          <Btn className="btn btn-primary" disabled={!SERVER_SOURCE} onClick={downloadServer}>
            <Icon name="download" size={28} />
            <span>Download {SERVER_NAME}</span>
          </Btn>
          <pre className="dl-code">
{`node ${SERVER_NAME}
# → open http://<pc-ip>:8787 on your phone
# → on the TV: Pair Device → enter that address`}
          </pre>
        </div>
      </div>
      <div className="dl-foot">
        <Btn className="btn" onClick={() => go("onboarding")}>
          <Icon name="back" size={28} />
          <span>Back</span>
        </Btn>
        <span className="dl-note">No content is bundled. You must supply your own authorised playlist.</span>
      </div>
    </div>
  );
}

#!/usr/bin/env node
/**
 * StreamPlayer Companion Server  —  local website for uploading a playlist to your TV.
 *
 *   node companion-server.mjs            (default port 8787, or PORT=9000 node companion-server.mjs)
 *
 * How it works
 *   1. On the TV open  StreamPlayer → Pair Device  and enter this computer's address.
 *      The TV registers a random 6-digit code with this server and starts polling.
 *   2. Open the website printed below on any phone / PC in the same network,
 *      type the 6-digit code and upload an M3U file (+ optional XMLTV guide),
 *      paste an M3U URL, or enter Xtream Codes credentials.
 *   3. The TV picks the submission up and imports it. Nothing leaves your network.
 *
 * Requirements: Node.js 14+. No dependencies. No content is bundled or hosted.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT) || 8787;
const TTL = 30 * 60 * 1000;
const MAX_UPLOAD = 1024 * 1024 * 1024; // 1 GB
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "streamplayer-"));

/** code -> { created, payload, delivered } */
const sessions = new Map();
/** id -> { file, name, created } */
const uploads = new Map();

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function json(res, status, body) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const validCode = (c) => typeof c === "string" && /^\d{6}$/.test(c);
const isHttp = (u) => typeof u === "string" && /^https?:\/\//i.test(u.trim());

function cleanup() {
  const now = Date.now();
  for (const [code, s] of sessions) if (now - s.created > TTL) sessions.delete(code);
  for (const [id, u] of uploads) {
    if (now - u.created > TTL * 2) {
      fs.unlink(u.file, () => {});
      uploads.delete(id);
    }
  }
}
setInterval(cleanup, 60 * 1000).unref();

async function handle(req, res) {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const p = url.pathname;

  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && (p === "/" || p === "/index.html")) {
    cors(res);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(PAGE);
  }

  if (req.method === "GET" && p === "/api/info") {
    return json(res, 200, { name: "StreamPlayer Companion", version: "1.0.0" });
  }

  // TV registers its pairing code.
  if (req.method === "POST" && p === "/api/register") {
    const body = JSON.parse((await readBody(req, 4096)) || "{}");
    if (!validCode(body.code)) return json(res, 400, { error: "Invalid code" });
    const existing = sessions.get(body.code);
    sessions.set(body.code, { created: Date.now(), payload: existing ? existing.payload : null, delivered: false });
    return json(res, 200, { ok: true });
  }

  // Website asks whether a code belongs to a connected TV.
  if (req.method === "GET" && p === "/api/status") {
    const s = sessions.get(url.searchParams.get("code") || "");
    return json(res, 200, { registered: !!s, delivered: !!(s && s.delivered) });
  }

  // TV polls for the submission.
  if (req.method === "GET" && p === "/api/poll") {
    const s = sessions.get(url.searchParams.get("code") || "");
    if (!s) return json(res, 200, { status: "unknown" });
    if (s.payload) {
      const payload = s.payload;
      s.payload = null;
      s.delivered = true;
      s.created = Date.now();
      return json(res, 200, { status: "ready", payload });
    }
    return json(res, 200, { status: "waiting" });
  }

  // Website uploads a playlist / guide file (raw body) for a given code.
  if (req.method === "POST" && p === "/api/upload") {
    const code = url.searchParams.get("code") || "";
    if (!sessions.has(code)) return json(res, 404, { error: "Unknown pairing code" });
    const id = crypto.randomBytes(8).toString("hex");
    const file = path.join(TMP, id);
    const out = fs.createWriteStream(file);
    let size = 0;
    let failed = false;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_UPLOAD && !failed) {
        failed = true;
        out.destroy();
        req.destroy();
      }
    });
    req.pipe(out);
    out.on("finish", () => {
      if (failed) return;
      uploads.set(id, { file, name: url.searchParams.get("name") || "playlist", created: Date.now() });
      json(res, 200, { id, url: "http://" + req.headers.host + "/files/" + id, size });
    });
    out.on("error", () => json(res, 500, { error: "Upload failed" }));
    return;
  }

  // Serves an uploaded file to the TV (plain text so the TV worker can stream-parse it).
  if (req.method === "GET" && p.indexOf("/files/") === 0) {
    const u = uploads.get(p.substring(7));
    if (!u) return json(res, 404, { error: "Not found" });
    cors(res);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": fs.statSync(u.file).size });
    return fs.createReadStream(u.file).pipe(res);
  }

  // Website submits the final playlist definition.
  if (req.method === "POST" && p === "/api/submit") {
    const body = JSON.parse((await readBody(req, 1024 * 1024)) || "{}");
    const s = sessions.get(body.code);
    if (!s) return json(res, 404, { error: "Unknown pairing code. Check the code shown on your TV." });
    const d = body.payload || {};
    let payload;
    if (d.type === "xtream") {
      if (!d.host || !d.username || !d.password) return json(res, 400, { error: "Server, username and password are required" });
      payload = { type: "xtream", name: String(d.name || ""), host: String(d.host), username: String(d.username), password: String(d.password) };
    } else if (d.type === "m3u") {
      if (!isHttp(d.url)) return json(res, 400, { error: "A valid playlist URL is required" });
      payload = { type: "m3u", name: String(d.name || ""), url: String(d.url).trim() };
      if (d.epgUrl) {
        if (!isHttp(d.epgUrl)) return json(res, 400, { error: "EPG URL must start with http:// or https://" });
        payload.epgUrl = String(d.epgUrl).trim();
      }
    } else return json(res, 400, { error: "Unknown payload type" });
    s.payload = payload;
    s.delivered = false;
    s.created = Date.now();
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: "Not found" });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    try {
      json(res, 400, { error: e && e.message ? e.message : "Bad request" });
    } catch (_) {
      /* ignore */
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("\nStreamPlayer Companion Server is running.\n");
  console.log("  Open on your phone / PC:");
  const nets = os.networkInterfaces();
  let any = false;
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === "IPv4" && !n.internal) {
        any = true;
        console.log("    http://" + n.address + ":" + PORT);
      }
    }
  }
  if (!any) console.log("    http://localhost:" + PORT);
  console.log("\n  On the TV:  StreamPlayer → Pair Device → enter the address above (e.g. 192.168.1.20:" + PORT + ")");
  console.log("  Press Ctrl+C to stop.\n");
});

const shutdown = () => {
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ---------------------------------------------------------------- website ----
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>StreamPlayer · Send playlist to TV</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0a1022;color:#fff;min-height:100vh;
background:linear-gradient(135deg,#0b1430,#0a0f22 55%,#140b2e)}
.wrap{max-width:720px;margin:0 auto;padding:28px 18px 60px}
h1{font-size:28px;margin:6px 0 4px}p.sub{opacity:.7;margin:0 0 22px}
.card{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:22px;margin-bottom:18px}
.step{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6fb1ff;font-weight:700;margin-bottom:10px}
label{display:block;font-size:14px;opacity:.75;margin:14px 0 6px}
input[type=text],input[type=password],input[type=url]{width:100%;padding:14px;border-radius:10px;border:2px solid #34406b;background:#11182c;color:#fff;font-size:16px}
input:focus{outline:none;border-color:#6fb1ff}
input[type=file]{width:100%;padding:12px;border-radius:10px;border:2px dashed #34406b;background:#11182c;color:#cbd5ff}
#code{font-size:34px;letter-spacing:10px;text-align:center;font-weight:700}
.tabs{display:flex;margin-bottom:6px}.tab{flex:1;padding:12px 6px;text-align:center;background:rgba(255,255,255,.07);cursor:pointer;font-weight:600;border:0;color:#fff;font-size:15px}
.tab:first-child{border-radius:10px 0 0 10px}.tab:last-child{border-radius:0 10px 10px 0}.tab.on{background:#2f7bff}
button.go{width:100%;margin-top:20px;padding:16px;border:0;border-radius:12px;background:#2f7bff;color:#fff;font-size:18px;font-weight:700;cursor:pointer}
button.go:disabled{opacity:.45;cursor:default}
.st{margin-top:10px;font-size:14px;min-height:20px}.ok{color:#6ee7a0}.bad{color:#ff8a8a}
.bar{height:8px;border-radius:4px;background:rgba(255,255,255,.15);margin-top:12px;overflow:hidden;display:none}.bar i{display:block;height:100%;width:0;background:#2f7bff}
.note{font-size:13px;opacity:.65;line-height:1.5;margin-top:18px}
.hide{display:none}
</style></head><body><div class="wrap">
<h1>Send a playlist to your TV</h1><p class="sub">StreamPlayer companion · everything stays inside your local network</p>

<div class="card"><div class="step">Step 1 · Pairing code</div>
<label for="code">Enter the 6-digit code shown on your TV (StreamPlayer → Pair Device)</label>
<input id="code" type="text" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="off">
<div id="codeSt" class="st"></div></div>

<div class="card"><div class="step">Step 2 · Your playlist</div>
<div class="tabs"><button class="tab on" data-t="file">M3U file</button><button class="tab" data-t="url">M3U URL</button><button class="tab" data-t="xt">Xtream login</button></div>
<label for="name">Playlist name (optional)</label><input id="name" type="text" placeholder="My playlist">

<div id="t-file"><label>Playlist file (.m3u / .m3u8)</label><input id="fPl" type="file" accept=".m3u,.m3u8,.txt">
<label>XMLTV guide (optional, plain .xml)</label><input id="fEpg" type="file" accept=".xml"></div>

<div id="t-url" class="hide"><label for="uPl">Playlist URL</label><input id="uPl" type="url" placeholder="http://example.com/playlist.m3u">
<label for="uEpg">XMLTV guide URL (optional)</label><input id="uEpg" type="url" placeholder="http://example.com/guide.xml"></div>

<div id="t-xt" class="hide"><label for="xH">Server URL</label><input id="xH" type="text" placeholder="http://provider.example:8080">
<label for="xU">Username</label><input id="xU" type="text" autocomplete="off"><label for="xP">Password</label><input id="xP" type="password" autocomplete="off"></div>

<div class="bar" id="bar"><i id="barI"></i></div>
<button class="go" id="send" disabled>Send to TV</button><div id="sendSt" class="st"></div></div>

<div class="note">You must supply your own playlist or subscription and are responsible for having the legal right to access that content.
This tool only relays what you enter to your own TV; it does not provide, host or index any media.</div>
</div>
<script>
(function(){
var $=function(i){return document.getElementById(i)};var tab='file',okCode=false;
function setSt(el,msg,cls){el.textContent=msg;el.className='st '+(cls||'')}
var tabs=document.querySelectorAll('.tab');
for(var i=0;i<tabs.length;i++)tabs[i].onclick=function(){tab=this.getAttribute('data-t');
 for(var j=0;j<tabs.length;j++)tabs[j].className='tab'+(tabs[j]===this?' on':'');
 $('t-file').className=tab==='file'?'':'hide';$('t-url').className=tab==='url'?'':'hide';$('t-xt').className=tab==='xt'?'':'hide'};
function refresh(){$('send').disabled=!okCode}
$('code').oninput=function(){var v=this.value.replace(/\\D/g,'').substring(0,6);this.value=v;okCode=false;refresh();
 if(v.length<6){setSt($('codeSt'),'');return}
 fetch('/api/status?code='+v).then(function(r){return r.json()}).then(function(s){okCode=!!s.registered;
  setSt($('codeSt'),s.registered?'✓ TV found. Ready to send.':'Code not found. Check the TV screen and that the TV is connected to this server.',s.registered?'ok':'bad');refresh()})
 .catch(function(){setSt($('codeSt'),'Cannot reach server','bad')})};
function upload(file,kind,code){return new Promise(function(res,rej){var x=new XMLHttpRequest();
 x.open('POST','/api/upload?code='+code+'&kind='+kind+'&name='+encodeURIComponent(file.name));
 $('bar').style.display='block';
 x.upload.onprogress=function(e){if(e.lengthComputable)$('barI').style.width=Math.round(e.loaded/e.total*100)+'%'};
 x.onload=function(){if(x.status===200)res(JSON.parse(x.responseText));else rej(new Error('Upload failed ('+x.status+')'))};
 x.onerror=function(){rej(new Error('Network error'))};x.send(file)})}
function post(payload){return fetch('/api/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:$('code').value,payload:payload})})
 .then(function(r){return r.json().then(function(b){if(!r.ok)throw new Error(b.error||'Failed');return b})})}
$('send').onclick=function(){var code=$('code').value,name=$('name').value.trim();setSt($('sendSt'),'Sending…');$('send').disabled=true;var p;
 if(tab==='file'){var f=$('fPl').files[0];if(!f){setSt($('sendSt'),'Choose a playlist file first','bad');refresh();return}
  p=upload(f,'playlist',code).then(function(r){var pl={type:'m3u',name:name||f.name.replace(/\\.[^.]+$/,''),url:r.url};
   var e=$('fEpg').files[0];if(!e)return pl;return upload(e,'epg',code).then(function(er){pl.epgUrl=er.url;return pl})})}
 else if(tab==='url'){p=Promise.resolve({type:'m3u',name:name,url:$('uPl').value.trim(),epgUrl:$('uEpg').value.trim()})}
 else{p=Promise.resolve({type:'xtream',name:name,host:$('xH').value.trim(),username:$('xU').value.trim(),password:$('xP').value})}
 p.then(post).then(function(){setSt($('sendSt'),'✓ Sent! Your TV is importing the playlist now. You can close this page.','ok');$('bar').style.display='none';refresh()})
 .catch(function(e){setSt($('sendSt'),e.message||'Failed','bad');refresh()})};
})();
</script></body></html>`;

# StreamPlayer — IPTV player for LG webOS 3.x+

Empty-by-design IPTV player (no playlists, streams or logos are bundled). Full HD 1920×1080 UI with TV-safe
overscan, D-pad + Magic Remote navigation, virtualized lists, hybrid native/hls.js playback.

## Deliverables

| What | Where |
| --- | --- |
| **Installable .ipk** (ES5, Chromium 38) | `release/com.example.iptvplayer_1.0.0_all.ipk` (also downloadable from the web build: *Download TV app* button on the setup screen) |
| **Local website for uploading playlists** | `server/companion-server.mjs` (`node companion-server.mjs`, Node 14+, zero dependencies) |

## Install on the TV

1. Enable the *Developer Mode* app on the TV and note its IP / passphrase.
2. `ares-setup-device` (add the TV, e.g. as `tv`)
3. `ares-install -d tv release/com.example.iptvplayer_1.0.0_all.ipk`
4. `ares-launch -d tv com.example.iptvplayer`

## Uploading a playlist (companion website)

1. On a PC in the same network: `node server/companion-server.mjs` → it prints `http://<ip>:8787`.
2. On the TV: *Pair Device* → enter `<ip>:8787` → press *Connect* → a 6-digit code appears.
3. On your phone/PC open the printed address, enter the code, then upload an `.m3u/.m3u8` file (+ optional XMLTV),
   paste a URL, or enter Xtream Codes credentials. The TV imports it automatically.

Other ways in: M3U URL, Xtream login (typed with the on-screen keyboard), or file upload in a desktop browser.

## Build

```
node scripts/build-webos.mjs   # esbuild → Babel (chrome 38, ES5, acorn-verified) → ares-package → release/*.ipk
npm run build                  # single-file web build (dist/index.html) used for browser preview/downloads
```

## Architecture (src/)

- `polyfills.ts` core-js + regenerator-runtime + whatwg-fetch (loaded first)
- `config/keyCodes.ts` webOS remote keys (Back 461, Play 415, Pause 19, Stop 413, Rew 412, FF 417, CH± 427/428, colours)
- `services/` `webosService` (platformBack, device info, screensaver), `dbService` + `dbSchema` (IndexedDB, cursor
  windows, no getAll), `parser.worker.ts` + `parserCore.ts` (chunked M3U / XMLTV −24h…+48h, 500 rows per tx),
  `xtreamApi` (player_api.php, short EPG), `pairingService`
- `player/` `HybridPlayer` (native `<video>` → hls.js fallback / manual toggle, audio tracks, HTML subtitle overlay),
  `PlayerOverlay` (OSD), `PlayerView`
- `navigation/` `SpatialNav` (geometry-based D-pad focus, Magic Remote hover sync, key-handler stack, Exit dialog),
  `VirtualList` (windowed list/grid, ~15–35 DOM nodes)
- `screens/` Onboarding, Home, LiveTv (3 columns), Vod (poster grid + details/series modal), Settings, Downloads

CSS is Flexbox-only (no Grid, custom properties, `gap`, `:is()`, `:has()`), checked automatically by the build script.
`webpack.config.js` is an alternative reference pipeline.

## Notes

- EPG must be plain XMLTV (not `.gz`). Parental PIN hides/locks categories with adult keywords.
- Screensaver suppression is best-effort (tvpower service + active `<video>`); webOS versions differ.
- You are responsible for having the rights to any content you load.

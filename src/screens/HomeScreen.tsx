import { useEffect } from "react";
import { Btn } from "../navigation/SpatialNav";
import { Clock, Icon } from "../components/ui";
import { activePlaylist, go, useStore } from "../store/appStore";
import type { Screen } from "../store/appStore";
import { fmtNum } from "../utils/format";

let lastTile = 0;

interface Tile {
  screen: Screen;
  title: string;
  icon: string;
  cls: string;
}

const TILES: Tile[] = [
  { screen: "live", title: "Live TV", icon: "tv", cls: "tile-live" },
  { screen: "movie", title: "Movies", icon: "film", cls: "tile-movie" },
  { screen: "series", title: "Series", icon: "series", cls: "tile-series" },
  { screen: "favorites", title: "Favorites", icon: "star", cls: "tile-fav" },
  { screen: "settings", title: "Settings", icon: "gear", cls: "tile-set" },
];

export function HomeScreen() {
  const pl = useStore((s) => activePlaylist(s));
  const favCount = useStore((s) => Object.keys(s.favs).length);
  const epg = useStore((s) => s.epgStatus);

  useEffect(
    function () {
      if (!pl) go("onboarding");
    },
    [pl]
  );

  function sub(t: Tile): string {
    if (!pl) return "";
    if (t.screen === "live") return fmtNum(pl.counts.live) + " channels";
    if (t.screen === "movie") return fmtNum(pl.counts.movie) + " titles";
    if (t.screen === "series") return fmtNum(pl.counts.series) + " shows";
    if (t.screen === "favorites") return fmtNum(favCount) + " saved";
    return "Playlists, player, parental";
  }

  return (
    <div className="screen">
      <div className="home-top">
        <div className="brand">
          <div className="brand-logo">
            <Icon name="play" size={40} />
          </div>
          <div>
            <div className="brand-name">StreamPlayer</div>
            <div className="brand-sub">{pl ? pl.name : "No playlist"}</div>
          </div>
        </div>
        <Clock />
      </div>

      <div className="home-tiles">
        {TILES.map(function (t, i) {
          return (
            <Btn
              key={t.screen}
              className={"tile " + t.cls}
              autoFocus={i === lastTile}
              onClick={() => {
                lastTile = i;
                go(t.screen);
              }}
            >
              <div className="tile-icon">
                <Icon name={t.icon} size={96} />
              </div>
              <div className="tile-title">{t.title}</div>
              <div className="tile-sub">{sub(t)}</div>
            </Btn>
          );
        })}
      </div>

      <div className="home-foot">
        <div>
          {pl && (
            <span>
              Playlist: <b>{pl.name}</b> ({pl.type === "xtream" ? "Xtream Codes" : "M3U"})
            </span>
          )}
          {pl && pl.info && pl.info.exp && <span className="foot-sep">Expires {pl.info.exp}</span>}
          {epg && <span className="foot-sep">EPG: {epg}</span>}
        </div>
        <div className="foot-hint">Use ◀ ▲ ▼ ▶ and OK · BACK to exit</div>
      </div>
    </div>
  );
}

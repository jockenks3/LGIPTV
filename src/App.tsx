import { useEffect, useState } from "react";
import { SpatialNavProvider } from "./navigation/SpatialNav";
import { BusyOverlay } from "./components/BusyOverlay";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LiveTvScreen } from "./screens/LiveTvScreen";
import { VodScreen } from "./screens/VodScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { DownloadsScreen } from "./screens/DownloadsScreen";
import { getState, setActive, setState, useStore } from "./store/appStore";
import { listFavs, listPlaylists, purgeOldEpg } from "./services/dbService";

const W = 1920;
const H = 1080;

function useStageScale() {
  const calc = function () {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    return { s: s, x: (window.innerWidth - W * s) / 2, y: (window.innerHeight - H * s) / 2 };
  };
  const [v, setV] = useState(calc());
  useEffect(function () {
    const on = function () {
      setV(calc());
    };
    window.addEventListener("resize", on);
    return function () {
      window.removeEventListener("resize", on);
    };
  }, []);
  return v;
}

async function bootstrap() {
  try {
    const playlists = await listPlaylists();
    const favList = await listFavs();
    const favs: { [uid: string]: number } = {};
    for (let i = 0; i < favList.length; i++) favs[favList[i].uid] = 1;
    let active: string | null = null;
    try {
      active = localStorage.getItem("sp_active");
    } catch (e) {
      /* ignore */
    }
    const valid = playlists.some(function (p) {
      return p.id === active;
    });
    if (!valid) active = playlists.length ? playlists[0].id : null;
    setState({ playlists: playlists, favs: favs, ready: true, screen: playlists.length ? "home" : "onboarding" });
    setActive(active);
    purgeOldEpg();
  } catch (e) {
    setState({ ready: true, screen: "onboarding" });
  }
}

export default function App() {
  const ready = useStore((s) => s.ready);
  const screen = useStore((s) => s.screen);
  const sc = useStageScale();

  useEffect(function () {
    if (!getState().ready) bootstrap();
  }, []);

  let body = null;
  if (ready) {
    if (screen === "onboarding") body = <OnboardingScreen />;
    else if (screen === "home") body = <HomeScreen />;
    else if (screen === "live") body = <LiveTvScreen />;
    else if (screen === "movie") body = <VodScreen mode="movie" />;
    else if (screen === "series") body = <VodScreen mode="series" />;
    else if (screen === "favorites") body = <VodScreen mode="favorites" />;
    else if (screen === "settings") body = <SettingsScreen />;
    else if (screen === "downloads") body = <DownloadsScreen />;
  }

  return (
    <div className="stage-wrap">
      <div
        className="stage"
        style={{
          transform: "scale(" + sc.s + ")",
          WebkitTransform: "scale(" + sc.s + ")",
          left: sc.x,
          top: sc.y,
        }}
      >
        <SpatialNavProvider>
          {body}
          <BusyOverlay />
        </SpatialNavProvider>
      </div>
    </div>
  );
}

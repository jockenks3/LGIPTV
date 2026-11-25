// Tiny external store (React Context + reducer would work as well; this is
// lighter and keeps the bundle small for 2016 hardware).
import { useSyncExternalStore } from "react";
import type { Item, Playlist, Settings } from "../types";
import { addFav, removeFav } from "../services/dbService";

export type Screen =
  | "onboarding"
  | "home"
  | "live"
  | "movie"
  | "series"
  | "favorites"
  | "settings"
  | "downloads";

export interface Busy {
  title: string;
  stage: string;
  count: number;
  error?: string;
}

export interface State {
  ready: boolean;
  screen: Screen;
  returnTo: Screen;
  playlists: Playlist[];
  activeId: string | null;
  settings: Settings;
  favs: { [uid: string]: number };
  unlocked: boolean;
  busy: Busy | null;
  epgStatus: string;
}

export const DEFAULT_SETTINGS: Settings = {
  playerMode: "auto",
  buffer: "medium",
  liveFormat: "m3u8",
  subSize: "m",
  pin: "",
  companionUrl: "",
  posters: true,
  autoEpg: true,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem("sp_settings");
    if (raw) return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
  } catch (e) {
    /* ignore */
  }
  return Object.assign({}, DEFAULT_SETTINGS);
}

let state: State = {
  ready: false,
  screen: "home",
  returnTo: "home",
  playlists: [],
  activeId: null,
  settings: loadSettings(),
  favs: {},
  unlocked: false,
  busy: null,
  epgStatus: "",
};

const listeners: Array<() => void> = [];

export function getState(): State {
  return state;
}

export function setState(patch: Partial<State>) {
  state = Object.assign({}, state, patch);
  for (let i = 0; i < listeners.length; i++) listeners[i]();
}

function subscribe(l: () => void) {
  listeners.push(l);
  return function () {
    const i = listeners.indexOf(l);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, function () {
    return sel(state);
  });
}

export function go(screen: Screen) {
  setState({ screen: screen });
}

export function activePlaylist(s?: State): Playlist | null {
  const st = s || state;
  for (let i = 0; i < st.playlists.length; i++) if (st.playlists[i].id === st.activeId) return st.playlists[i];
  return null;
}

export function updateSettings(patch: Partial<Settings>) {
  const next = Object.assign({}, state.settings, patch);
  try {
    localStorage.setItem("sp_settings", JSON.stringify(next));
  } catch (e) {
    /* ignore */
  }
  setState({ settings: next });
}

export function setActive(id: string | null) {
  try {
    if (id) localStorage.setItem("sp_active", id);
    else localStorage.removeItem("sp_active");
  } catch (e) {
    /* ignore */
  }
  setState({ activeId: id, unlocked: false });
}

export function isFav(uid: string): boolean {
  return !!state.favs[uid];
}

export function toggleFav(item: Item) {
  const favs = Object.assign({}, state.favs);
  if (favs[item.uid]) {
    delete favs[item.uid];
    removeFav(item.uid);
  } else {
    favs[item.uid] = 1;
    addFav(item);
  }
  setState({ favs: favs });
}

// Movies / Series / Favorites: virtualized poster grid + details modal.
import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Field, Modal, useBack } from "../navigation/SpatialNav";
import { VirtualList } from "../navigation/VirtualList";
import { Header, Icon, Img, PinModal, Spinner } from "../components/ui";
import { PlayerView } from "../player/PlayerView";
import { activePlaylist, go, setState, toggleFav, useStore } from "../store/appStore";
import { arraySource, itemQuery, listFavs, listGroups } from "../services/dbService";
import { credsOf, xtreamEpisodeUrl } from "../services/playlistService";
import { getSeriesInfo, getVodInfo } from "../services/xtreamApi";
import { fmtNum } from "../utils/format";
import type { Item, Kind, ListSource, Playlist } from "../types";

interface Cat {
  key: string;
  name: string;
  count: number;
  kind: Kind | "";
  adult: number;
}

const lastCat: { [mode: string]: number } = {};

function PosterCard(p: { item?: Item; posters: boolean }) {
  const fav = useStore((s) => (p.item ? !!s.favs[p.item.uid] : false));
  const it = p.item;
  if (!it) return <div className="pc pc-skel" />;
  return (
    <div className="pc">
      <div className={"pc-img" + (it.kind === "live" ? " pc-img-live" : "")}>
        <div className="pc-ph">{it.name.substring(0, 1).toUpperCase()}</div>
        {p.posters && <Img src={it.logo} className="pc-pic" />}
        {it.rating && parseFloat(it.rating) > 0 && <div className="pc-rate">★ {parseFloat(it.rating).toFixed(1)}</div>}
        {fav && (
          <div className="pc-fav">
            <Icon name="star" size={26} />
          </div>
        )}
      </div>
      <div className="pc-title">{it.name}</div>
      <div className="pc-sub">{it.year || it.group}</div>
    </div>
  );
}

// ------------------------------------------------------------- details ----

interface Details {
  plot: string;
  genre: string;
  duration: string;
  cast: string;
  director: string;
  year: string;
  rating: string;
  image: string;
}

function MovieModal(p: { item: Item; playlist: Playlist | null; onPlay: () => void; onClose: () => void }) {
  const favs = useStore((s) => s.favs);
  const posters = useStore((s) => s.settings.posters);
  const [d, setD] = useState<Details | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(function () {
    const pl = p.playlist;
    if (!pl || pl.type !== "xtream" || !p.item.sid || p.item.kind !== "movie") return;
    let dead = false;
    setLoading(true);
    getVodInfo(credsOf(pl), p.item.sid).then(
      function (r) {
        if (dead) return;
        const i = (r && r.info) || {};
        setD({
          plot: i.plot || i.description || "",
          genre: i.genre || "",
          duration: i.duration || "",
          cast: i.cast || i.actors || "",
          director: i.director || "",
          year: (i.releasedate || i.releaseDate || "").substring(0, 4),
          rating: i.rating ? String(i.rating) : "",
          image: i.movie_image || "",
        });
        setLoading(false);
      },
      function () {
        if (!dead) setLoading(false);
      }
    );
    return function () {
      dead = true;
    };
    // eslint-disable-next-line
  }, []);
  const it = p.item;
  const plot = (d && d.plot) || it.plot || "";
  const meta = [d && d.year ? d.year : it.year, d && d.duration, d && d.genre, (d && d.rating) || it.rating ? "★ " + ((d && d.rating) || it.rating) : ""]
    .filter(Boolean)
    .join("  ·  ");
  return (
    <Modal onClose={p.onClose} className="modal-wide">
      <div className="det">
        <div className="det-poster">
          <div className="pc-ph">{it.name.substring(0, 1).toUpperCase()}</div>
          {posters && <Img src={(d && d.image) || it.logo} className="pc-pic" />}
        </div>
        <div className="det-main">
          <div className="det-title">{it.name}</div>
          <div className="det-meta">{meta || it.group}</div>
          <div className="det-plot">{loading ? <Spinner /> : plot || "No description available."}</div>
          {d && d.cast && <div className="det-line"><b>Cast:</b> {d.cast}</div>}
          {d && d.director && <div className="det-line"><b>Director:</b> {d.director}</div>}
          <div className="det-actions">
            <Btn className="btn btn-primary" autoFocus onClick={p.onPlay}>
              <Icon name="play" size={28} />
              <span>Play</span>
            </Btn>
            <Btn className="btn" onClick={() => toggleFav(it)}>
              <Icon name="star" size={28} />
              <span>{favs[it.uid] ? "Remove favorite" : "Add favorite"}</span>
            </Btn>
            <Btn className="btn" onClick={p.onClose}>
              <span>Close</span>
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface Episode {
  item: Item;
  label: string;
  plot: string;
  duration: string;
}

function SeriesModal(p: { item: Item; playlist: Playlist; onPlay: (list: Item[], idx: number) => void; onClose: () => void }) {
  const favs = useStore((s) => s.favs);
  const [state, setState_] = useState<"loading" | "error" | "ready">("loading");
  const [seasons, setSeasons] = useState<string[]>([]);
  const [eps, setEps] = useState<{ [s: string]: Episode[] }>({});
  const [season, setSeason] = useState("");
  const [plot, setPlot] = useState(p.item.plot || "");

  useEffect(function () {
    let dead = false;
    getSeriesInfo(credsOf(p.playlist), p.item.ser as number).then(
      function (r) {
        if (dead) return;
        const info = (r && r.info) || {};
        if (info.plot) setPlot(info.plot);
        const raw = (r && r.episodes) || {};
        const keys = Object.keys(raw).sort(function (a, b) {
          return parseInt(a, 10) - parseInt(b, 10);
        });
        const map: { [s: string]: Episode[] } = {};
        keys.forEach(function (k) {
          map[k] = (raw[k] as any[]).map(function (e) {
            const num = e.episode_num || "";
            const label = "S" + k + " E" + num + (e.title ? " · " + e.title : "");
            return {
              label: label,
              plot: (e.info && e.info.plot) || "",
              duration: (e.info && e.info.duration) || "",
              item: {
                pid: p.playlist.id,
                kind: "series",
                group: p.item.name,
                adult: 0,
                name: p.item.name + " — " + label,
                logo: (e.info && e.info.movie_image) || p.item.logo,
                tvg: "",
                url: xtreamEpisodeUrl(p.playlist, e.id, e.container_extension || "mp4"),
                uid: "e" + e.id,
              } as Item,
            };
          });
        });
        if (!keys.length) {
          setState_("error");
          return;
        }
        setSeasons(keys);
        setEps(map);
        setSeason(keys[0]);
        setState_("ready");
      },
      function () {
        if (!dead) setState_("error");
      }
    );
    return function () {
      dead = true;
    };
    // eslint-disable-next-line
  }, []);

  const seasonSource = useMemo(
    function () {
      return arraySource(seasons, "seasons" + seasons.length);
    },
    [seasons]
  );
  const episodes = eps[season] || [];
  const epSource = useMemo(
    function () {
      return arraySource(episodes, "eps" + season + episodes.length);
    },
    // eslint-disable-next-line
    [eps, season]
  );

  return (
    <Modal onClose={p.onClose} className="modal-xl">
      <div className="ser-head">
        <div className="det-title">{p.item.name}</div>
        <div className="det-plot ser-plot">{plot}</div>
      </div>
      {state === "loading" && (
        <div className="ser-center">
          <Spinner />
        </div>
      )}
      {state === "error" && <div className="ser-center">Could not load episodes for this series.</div>}
      {state === "ready" && (
        <div className="ser-body">
          <div className="ser-seasons">
            <VirtualList<string>
              source={seasonSource}
              width={240}
              height={520}
              itemHeight={64}
              autoFocus
              selectedIndex={seasons.indexOf(season)}
              rowClassName="cat-row"
              renderItem={(s, _i, sel) => <div className={"cat" + (sel ? " cat-sel" : "")}>{s ? "Season " + s : ""}</div>}
              onSelect={(s) => setSeason(s)}
            />
          </div>
          <div className="ser-eps">
            <VirtualList<Episode>
              key={epSource.key}
              source={epSource}
              width={1000}
              height={520}
              itemHeight={82}
              rowClassName="cat-row"
              renderItem={(e) =>
                e ? (
                  <div className="ep">
                    <div className="ep-icon">
                      <Icon name="play" size={30} />
                    </div>
                    <div className="ep-main">
                      <div className="ep-title">{e.label}</div>
                      <div className="ep-sub">{e.duration || e.plot}</div>
                    </div>
                  </div>
                ) : (
                  <div className="ep" />
                )
              }
              onSelect={(_e, i) => p.onPlay(episodes.map((x) => x.item), i)}
            />
          </div>
        </div>
      )}
      <div className="det-actions">
        <Btn className="btn" onClick={() => toggleFav(p.item)}>
          <Icon name="star" size={28} />
          <span>{favs[p.item.uid] ? "Remove favorite" : "Add favorite"}</span>
        </Btn>
        <Btn className="btn" onClick={p.onClose}>
          <span>Close</span>
        </Btn>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------- screen ----

export function VodScreen(p: { mode: "movie" | "series" | "favorites" }) {
  const mode = p.mode;
  const pl = useStore((s) => activePlaylist(s));
  const settings = useStore((s) => s.settings);
  const unlocked = useStore((s) => s.unlocked);
  const favs = useStore((s) => s.favs);
  const favCount = Object.keys(favs).length;
  const hideAdult = !!settings.pin && !unlocked;
  const pid = pl ? pl.id : "";

  const [cats, setCats] = useState<Cat[]>([]);
  const [catIdx, setCatIdx] = useState(lastCat[mode] || 0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<ListSource<Item> | null>(null);
  const [detail, setDetail] = useState<Item | null>(null);
  const [playing, setPlaying] = useState<{ item: Item; list: Item[] | null; idx: number } | null>(null);
  const [pinFor, setPinFor] = useState<{ idx: number; error: string; n: number } | null>(null);
  const gridRef = useRef<any>(null);

  const kind: Kind = mode === "series" ? "series" : "movie";
  const title = mode === "movie" ? "Movies" : mode === "series" ? "Series" : "Favorites";

  useEffect(
    function () {
      if (!pid) return;
      let dead = false;
      if (mode === "favorites") {
        setCats([
          { key: "k:live", name: "Live TV", count: 0, kind: "live", adult: 0 },
          { key: "k:movie", name: "Movies", count: 0, kind: "movie", adult: 0 },
          { key: "k:series", name: "Series", count: 0, kind: "series", adult: 0 },
        ]);
        return;
      }
      listGroups(pid, kind).then(function (groups) {
        if (dead) return;
        const total = pl ? pl.counts[kind] : 0;
        const list: Cat[] = [{ key: "all", name: "All", count: total, kind: "", adult: 0 }];
        for (let i = 0; i < groups.length; i++)
          list.push({ key: "g:" + groups[i].name, name: groups[i].name, count: groups[i].count, kind: "", adult: groups[i].adult });
        setCats(list);
        if ((lastCat[mode] || 0) >= list.length) setCatIdx(0);
      });
      return function () {
        dead = true;
      };
    },
    // eslint-disable-next-line
    [pid, mode]
  );

  useEffect(
    function () {
      const id = setTimeout(function () {
        setQuery(search);
      }, 450);
      return function () {
        clearTimeout(id);
      };
    },
    [search]
  );

  const cat = cats[catIdx];
  useEffect(
    function () {
      if (!pid || !cat) return;
      let dead = false;
      setSource(null);
      if (mode === "favorites") {
        listFavs().then(function (all) {
          if (dead) return;
          const mine = all.filter(function (f) {
            return f.pid === pid && f.kind === cat.kind && (!query || f.name.toLowerCase().indexOf(query.toLowerCase()) >= 0);
          });
          setSource(arraySource(mine, "fav:" + cat.kind + ":" + favCount + ":" + query));
        });
      } else {
        itemQuery({
          pid: pid,
          kind: kind,
          group: cat.key === "all" ? null : cat.name,
          hideAdult: hideAdult,
          search: query,
        }).then(function (s) {
          if (!dead) setSource(s);
        });
      }
      return function () {
        dead = true;
      };
    },
    // eslint-disable-next-line
    [pid, mode, cat && cat.key, query, hideAdult, mode === "favorites" ? favCount : -1]
  );

  const catSource = useMemo(
    function () {
      return cats.length ? arraySource(cats, "cats" + mode + cats.length) : null;
    },
    [cats, mode]
  );

  useBack(function () {
    go("home");
  }, !playing);

  function selectCat(c: Cat, i: number) {
    if (c.adult && settings.pin && !unlocked) {
      setPinFor({ idx: i, error: "", n: 0 });
      return;
    }
    lastCat[mode] = i;
    setCatIdx(i);
  }

  function open(item: Item) {
    if (item.kind === "live") setPlaying({ item: item, list: null, idx: 0 });
    else if (item.kind === "series" && item.ser) setDetail(item);
    else if (item.kind === "series" && item.url) setPlaying({ item: item, list: null, idx: 0 });
    else setDetail(item);
  }

  function stepPlay(d: number) {
    if (!playing || !playing.list) return;
    const ni = playing.idx + d;
    if (ni < 0 || ni >= playing.list.length) return;
    setPlaying({ item: playing.list[ni], list: playing.list, idx: ni });
  }

  const hasList = !!playing && !!playing.list;

  return (
    <div className="screen">
      <Header
        title={title}
        icon={mode === "movie" ? "film" : mode === "series" ? "series" : "star"}
        right={
          <div className="search-wrap">
            <Icon name="search" size={26} />
            <Field label="" value={search} onChange={setSearch} placeholder={"Search " + title.toLowerCase()} />
          </div>
        }
      />
      <div className="cols">
        <div className="col-cats">
          <VirtualList<Cat>
            key={"cats" + mode + cats.length}
            source={catSource}
            width={340}
            height={904}
            itemHeight={64}
            initialIndex={catIdx}
            autoFocus
            selectedIndex={catIdx}
            rowClassName="cat-row"
            renderItem={(c, _i, sel) =>
              c ? (
                <div className={"cat" + (sel ? " cat-sel" : "")}>
                  <span className="cat-name">{c.name}</span>
                  {c.adult && hideAdult ? (
                    <span className="cat-lock">
                      <Icon name="lock" size={22} />
                    </span>
                  ) : (
                    <span className="cat-count">{c.kind && mode === "favorites" ? "" : fmtNum(c.count)}</span>
                  )}
                </div>
              ) : (
                <div className="cat" />
              )
            }
            onSelect={selectCat}
          />
        </div>
        <div className="col-grid">
          <VirtualList<Item>
            key={source ? source.key : "loading"}
            ref={gridRef}
            source={source}
            columns={6}
            itemWidth={242}
            width={1452}
            height={904}
            itemHeight={392}
            overscan={0}
            rowClassName="pc-rowwrap"
            empty={
              <div className="list-empty">
                {source === null ? "Loading…" : mode === "favorites" ? "Nothing here yet. Add favorites from the details screen or player." : "No titles found"}
              </div>
            }
            renderItem={(item) => <PosterCard item={item} posters={settings.posters} />}
            onSelect={open}
          />
        </div>
      </div>
      <div className="foot-bar">
        <span>OK: open</span>
        <span className="foot-sep">BACK: home</span>
        {settings.posters ? null : <span className="foot-sep">Posters disabled (low-memory mode)</span>}
      </div>

      {detail && !playing && detail.kind === "series" && detail.ser && pl && (
        <SeriesModal
          item={detail}
          playlist={pl}
          onClose={() => setDetail(null)}
          onPlay={(list, idx) => setPlaying({ item: list[idx], list: list, idx: idx })}
        />
      )}
      {detail && !playing && !(detail.kind === "series" && detail.ser) && (
        <MovieModal item={detail} playlist={pl} onClose={() => setDetail(null)} onPlay={() => setPlaying({ item: detail, list: null, idx: 0 })} />
      )}

      {playing && (
        <PlayerView
          key={playing.item.uid}
          item={playing.item}
          playlist={pl}
          fullscreen
          subtitle={playing.item.kind === "live" ? playing.item.group : undefined}
          hasPrev={hasList && playing.idx > 0}
          hasNext={hasList && !!playing.list && playing.idx < playing.list.length - 1}
          onStep={stepPlay}
          onEnded={() => stepPlay(1)}
          onExit={() => setPlaying(null)}
          onFullscreen={() => {}}
        />
      )}

      {pinFor && (
        <PinModal
          key={pinFor.n}
          title="Adult category locked"
          error={pinFor.error}
          onCancel={() => setPinFor(null)}
          onDone={(pin) => {
            if (pin === settings.pin) {
              setState({ unlocked: true });
              lastCat[mode] = pinFor.idx;
              setCatIdx(pinFor.idx);
              setPinFor(null);
            } else setPinFor({ idx: pinFor.idx, error: "Wrong PIN", n: pinFor.n + 1 });
          }}
        />
      )}
    </div>
  );
}

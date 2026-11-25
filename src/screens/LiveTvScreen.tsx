// Live TV: 3 columns — Categories | Virtualized channels | Mini-player + EPG.
import { useEffect, useMemo, useRef, useState } from "react";
import { Field, useBack, useKeyHandler } from "../navigation/SpatialNav";
import { VirtualList } from "../navigation/VirtualList";
import type { VirtualListHandle } from "../navigation/VirtualList";
import { Header, Icon, Img, PinModal } from "../components/ui";
import { PlayerView } from "../player/PlayerView";
import { activePlaylist, go, setState, toggleFav, useStore } from "../store/appStore";
import { arraySource, itemQuery, listFavs, listGroups } from "../services/dbService";
import { currentIndex, loadEpg, nowTitle } from "../services/epgService";
import { KEY } from "../config/keyCodes";
import { fmtDay, fmtHM, fmtNum } from "../utils/format";
import type { Group, Item, ListSource, Programme } from "../types";

interface Cat {
  key: string;
  name: string;
  count: number;
  type: "all" | "fav" | "group";
  adult: number;
}

let lastCat = 0;

function NowTitle(p: { tvg: string }) {
  const [t, setT] = useState("");
  useEffect(
    function () {
      let dead = false;
      nowTitle(p.tvg).then(function (x) {
        if (!dead) setT(x);
      });
      return function () {
        dead = true;
      };
    },
    [p.tvg]
  );
  return <div className="ch-now">{t}</div>;
}

function ChannelRow(p: { item?: Item; index: number; playing: boolean }) {
  const fav = useStore((s) => (p.item ? !!s.favs[p.item.uid] : false));
  if (!p.item) return <div className="ch ch-skel" />;
  return (
    <div className={"ch" + (p.playing ? " ch-playing" : "")}>
      <div className="ch-num">{p.index + 1}</div>
      <div className="ch-logo">
        <Img src={p.item.logo} className="ch-logo-img" />
      </div>
      <div className="ch-main">
        <div className="ch-name">{p.item.name}</div>
        {p.item.tvg ? <NowTitle tvg={p.item.tvg} /> : <div className="ch-now">{p.item.group}</div>}
      </div>
      {fav && (
        <div className="ch-fav">
          <Icon name="star" size={26} />
        </div>
      )}
      {p.playing && <div className="ch-eq">▶</div>}
    </div>
  );
}

export function LiveTvScreen() {
  const pl = useStore((s) => activePlaylist(s));
  const settings = useStore((s) => s.settings);
  const unlocked = useStore((s) => s.unlocked);
  const favs = useStore((s) => s.favs);
  const hideAdult = !!settings.pin && !unlocked;

  const [cats, setCats] = useState<Cat[]>([]);
  const [catIdx, setCatIdx] = useState(lastCat);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<ListSource<Item> | null>(null);
  const [playing, setPlaying] = useState<{ item: Item; index: number; source: ListSource<Item> } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [preview, setPreview] = useState<Item | null>(null);
  const [schedule, setSchedule] = useState<Programme[]>([]);
  const [pinFor, setPinFor] = useState<{ idx: number; error: string; n: number } | null>(null);
  const chList = useRef<VirtualListHandle>(null);
  const focusTimer = useRef<any>(0);
  const sourceRef = useRef<ListSource<Item> | null>(null);
  sourceRef.current = source;

  const pid = pl ? pl.id : "";
  const cat = cats[catIdx];
  const favCount = Object.keys(favs).length;

  // Categories (groups) from IndexedDB.
  useEffect(
    function () {
      let dead = false;
      if (!pid) return;
      listGroups(pid, "live").then(function (groups: Group[]) {
        if (dead) return;
        const total = pl ? pl.counts.live : 0;
        const list: Cat[] = [
          { key: "all", name: "All channels", count: total, type: "all", adult: 0 },
          { key: "fav", name: "Favorites", count: 0, type: "fav", adult: 0 },
        ];
        for (let i = 0; i < groups.length; i++)
          list.push({ key: "g:" + groups[i].name, name: groups[i].name, count: groups[i].count, type: "group", adult: groups[i].adult });
        setCats(list);
        if (lastCat >= list.length) setCatIdx(0);
      });
      return function () {
        dead = true;
      };
    },
    // eslint-disable-next-line
    [pid]
  );

  // Debounced search.
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

  // Channel list source for the selected category.
  const favDep = cat && cat.type === "fav" ? favCount : -1;
  useEffect(
    function () {
      if (!pid || !cat) return;
      let dead = false;
      setSource(null);
      if (cat.type === "fav") {
        listFavs().then(function (all) {
          if (dead) return;
          const mine = all.filter(function (f) {
            return f.pid === pid && f.kind === "live" && (!query || f.name.toLowerCase().indexOf(query.toLowerCase()) >= 0);
          });
          setSource(arraySource(mine, "fav:" + favDep + ":" + query));
        });
      } else {
        itemQuery({
          pid: pid,
          kind: "live",
          group: cat.type === "group" ? cat.name : null,
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
    [pid, cat && cat.key, query, hideAdult, favDep]
  );

  // EPG preview for the focused channel (debounced).
  function onFocusChannel(i: number) {
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(function () {
      const s = sourceRef.current;
      if (!s) return;
      s.getRange(i, 1).then(function (r) {
        if (r[0]) setPreview(r[0]);
      });
    }, 250);
  }
  useEffect(function () {
    return function () {
      clearTimeout(focusTimer.current);
    };
  }, []);

  const shown = preview || (playing ? playing.item : null);
  useEffect(
    function () {
      setSchedule([]);
      if (!shown) return;
      let dead = false;
      loadEpg(shown, pl).then(function (l) {
        if (!dead) setSchedule(l);
      });
      return function () {
        dead = true;
      };
    },
    // eslint-disable-next-line
    [shown && shown.uid]
  );
  const catSource = useMemo(
    function () {
      return cats.length ? arraySource(cats, "cats" + cats.length) : null;
    },
    [cats]
  );
  const scheduleSource = useMemo(
    function () {
      return arraySource(schedule, "sch:" + (shown ? shown.uid : "") + ":" + schedule.length);
    },
    [schedule, shown]
  );

  function selectCat(c: Cat, i: number) {
    if (c.adult && settings.pin && !unlocked) {
      setPinFor({ idx: i, error: "", n: 0 });
      return;
    }
    lastCat = i;
    setCatIdx(i);
  }

  function onSelectChannel(item: Item, i: number) {
    if (!source) return;
    if (playing && playing.item.uid === item.uid) {
      setFullscreen(true);
      return;
    }
    setPlaying({ item: item, index: i, source: source });
  }

  function step(d: number) {
    if (!playing) return;
    const ni = playing.index + d;
    if (ni < 0 || ni >= playing.source.total) return;
    const src = playing.source;
    src.getRange(ni, 1).then(function (r) {
      if (r[0]) setPlaying({ item: r[0], index: ni, source: src });
    });
  }

  function exitFullscreen() {
    setFullscreen(false);
    const idx = playing && playing.source === source ? playing.index : -1;
    setTimeout(function () {
      if (idx >= 0 && chList.current) chList.current.focusIndex(idx);
    }, 30);
  }

  useBack(function () {
    go("home");
  }, !fullscreen);

  useKeyHandler(
    function (code) {
      if (code === KEY.YELLOW && preview) {
        toggleFav(preview);
        return true;
      }
    },
    { active: !fullscreen }
  );

  const nowIdx = currentIndex(schedule, Date.now());
  const playingIndexInList = playing && source && playing.source === source ? playing.index : -1;
  const locked = hideAdult;

  return (
    <div className="screen screen-abs">
      <Header
        title="Live TV"
        icon="tv"
        right={
          <div className="search-wrap">
            <Icon name="search" size={26} />
            <Field label="" value={search} onChange={setSearch} placeholder="Search channels" />
          </div>
        }
      />
      <div className="cols">
        <div className="col-cats">
          <VirtualList<Cat>
            key={"cats" + cats.length}
            source={catSource}
            width={340}
            height={904}
            itemHeight={64}
            initialIndex={catIdx}
            autoFocus
            selectedIndex={catIdx}
            rowClassName="cat-row"
            renderItem={function (c, _i, sel) {
              if (!c) return <div className="cat" />;
              const n = c.type === "fav" ? favCount : c.count;
              return (
                <div className={"cat" + (sel ? " cat-sel" : "")}>
                  <span className="cat-name">{c.name}</span>
                  {c.adult && locked ? (
                    <span className="cat-lock">
                      <Icon name="lock" size={22} />
                    </span>
                  ) : (
                    <span className="cat-count">{fmtNum(n)}</span>
                  )}
                </div>
              );
            }}
            onSelect={selectCat}
          />
        </div>

        <div className="col-ch">
          <VirtualList<Item>
            key={source ? source.key : "loading"}
            ref={chList}
            source={source}
            width={620}
            height={904}
            itemHeight={84}
            rowClassName="ch-rowwrap"
            selectedIndex={playingIndexInList}
            empty={
              <div className="list-empty">
                {source === null ? "Loading…" : cat && cat.type === "fav" ? "No favorite channels yet. Press the yellow key on a channel." : "No channels found"}
              </div>
            }
            renderItem={(item, i) => <ChannelRow item={item} index={i} playing={!!playing && !!item && playing.item.uid === item.uid} />}
            onSelect={onSelectChannel}
            onFocusIndex={onFocusChannel}
          />
        </div>

        <div className="col-right">
          <div className="mini-wrap">
            {playing ? (
              <PlayerView
                item={playing.item}
                playlist={pl}
                fullscreen={fullscreen}
                hasPrev={playing.index > 0}
                hasNext={playing.index < playing.source.total - 1}
                onStep={step}
                onExit={exitFullscreen}
                onFullscreen={() => setFullscreen(true)}
              />
            ) : (
              <div className="mini-empty">
                <Icon name="tv" size={80} />
                <div>Select a channel and press OK</div>
              </div>
            )}
          </div>
          <div className="info">
            <div className="info-name">{shown ? shown.name : "—"}</div>
            <div className="info-group">{shown ? shown.group : ""}</div>
            <div className="sched">
              <VirtualList<Programme>
                key={scheduleSource.key}
                source={scheduleSource}
                width={804}
                height={290}
                itemHeight={58}
                initialIndex={Math.max(0, nowIdx)}
                rowClassName="sch-rowwrap"
                empty={<div className="list-empty">No programme guide for this channel</div>}
                renderItem={(pr, i) => {
                  if (!pr) return <div className="sch-row" />;
                  const live = i === nowIdx;
                  return (
                    <div className={"sch-row" + (live ? " sch-now" : "")}>
                      <div className="sch-time">
                        {fmtHM(pr.start)}
                        <span className="sch-day">{fmtDay(pr.start)}</span>
                      </div>
                      <div className="sch-title">{pr.title}</div>
                      {live && <div className="sch-badge">NOW</div>}
                    </div>
                  );
                }}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="foot-bar">
        <span>OK: play / full screen</span>
        <span className="foot-sep">CH ▲▼: switch channel</span>
        <span className="foot-sep">
          <i className="dot dot-yellow" /> Favorite
        </span>
        <span className="foot-sep">BACK: home</span>
      </div>

      {pinFor && (
        <PinModal
          key={pinFor.n}
          title="Adult category locked"
          error={pinFor.error}
          onCancel={() => setPinFor(null)}
          onDone={(pin) => {
            if (pin === settings.pin) {
              setState({ unlocked: true });
              lastCat = pinFor.idx;
              setCatIdx(pinFor.idx);
              setPinFor(null);
            } else setPinFor({ idx: pinFor.idx, error: "Wrong PIN", n: pinFor.n + 1 });
          }}
        />
      )}
    </div>
  );
}

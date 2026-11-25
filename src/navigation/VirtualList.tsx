// Windowed list / grid. Only the rows inside the viewport (+1 overscan row) are
// in the DOM (~15-35 nodes) no matter how many thousands of entries exist.
// Data is pulled lazily from a ListSource (IndexedDB cursor windows).
import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode, Ref } from "react";
import { KEY } from "../config/keyCodes";
import type { ListSource } from "../types";
import { safeFocus } from "./SpatialNav";

const PAGE = 40;

export interface VirtualListHandle {
  focusIndex(i: number): void;
}

interface Props<T> {
  source: ListSource<T> | null;
  itemHeight: number;
  itemWidth?: number;
  columns?: number;
  width: number;
  height: number;
  overscan?: number;
  initialIndex?: number;
  autoFocus?: boolean;
  selectedIndex?: number;
  className?: string;
  rowClassName?: string;
  empty?: ReactNode;
  renderItem: (item: T | undefined, index: number, selected: boolean) => ReactNode;
  onSelect?: (item: T, index: number) => void;
  onFocusIndex?: (index: number) => void;
}

function VirtualListInner<T>(props: Props<T>, ref: Ref<VirtualListHandle>) {
  const columns = props.columns || 1;
  const itemHeight = props.itemHeight;
  const height = props.height;
  const itemWidth = props.itemWidth || props.width;
  const overscan = props.overscan === undefined ? 1 : props.overscan;
  const source = props.source;
  const total = source ? source.total : 0;
  const rowsTotal = Math.ceil(total / columns);
  const contentH = rowsTotal * itemHeight;
  const maxScroll = Math.max(0, contentH - height);

  const root = useRef<HTMLDivElement>(null);
  const cache = useRef<{ [i: number]: T }>({});
  const pages = useRef<{ [p: number]: number }>({});
  const srcRef = useRef<ListSource<T> | null>(source);
  const alive = useRef(true);
  const pending = useRef(-1);
  const initial = Math.max(0, Math.min(props.initialIndex || 0, Math.max(0, total - 1)));
  const active = useRef(initial);

  const [scrollTop, setScrollTop] = useState(function () {
    const row = Math.floor(initial / columns);
    const t = row * itemHeight - Math.floor((height - itemHeight) / 2);
    return Math.max(0, Math.min(t, maxScroll));
  });
  const [, setVersion] = useState(0);

  if (srcRef.current !== source) {
    srcRef.current = source;
    cache.current = {};
    pages.current = {};
  }

  const firstRow = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const lastRow = Math.min(rowsTotal - 1, Math.ceil((scrollTop + height) / itemHeight) - 1 + overscan);
  const startIdx = firstRow * columns;
  const endIdx = Math.min(total - 1, (lastRow + 1) * columns - 1);

  useEffect(function () {
    alive.current = true;
    return function () {
      alive.current = false;
    };
  }, []);

  // Lazy page loading for the visible window.
  useEffect(
    function () {
      if (!source || total === 0) return;
      const p0 = Math.floor(startIdx / PAGE);
      const p1 = Math.floor(endIdx / PAGE);
      for (let p = p0; p <= p1; p++) {
        if (pages.current[p]) continue;
        pages.current[p] = 1;
        (function (page: number) {
          source.getRange(page * PAGE, PAGE).then(
            function (items) {
              if (!alive.current || srcRef.current !== source) return;
              for (let i = 0; i < items.length; i++) cache.current[page * PAGE + i] = items[i];
              pages.current[page] = 2;
              // Evict far-away entries to keep memory flat.
              const keys = Object.keys(cache.current);
              if (keys.length > 400) {
                for (let k = 0; k < keys.length; k++) {
                  const idx = +keys[k];
                  if (idx < startIdx - 120 || idx > endIdx + 120) {
                    delete cache.current[idx];
                    pages.current[Math.floor(idx / PAGE)] = 0;
                  }
                }
              }
              setVersion(function (v) {
                return v + 1;
              });
            },
            function () {
              pages.current[page] = 0;
            }
          );
        })(p);
      }
    },
    [source, startIdx, endIdx, total]
  );

  function rowEl(i: number): HTMLElement | null {
    return root.current ? (root.current.querySelector('[data-idx="' + i + '"]') as HTMLElement | null) : null;
  }

  function moveTo(i: number) {
    active.current = i;
    const row = Math.floor(i / columns);
    const top = row * itemHeight;
    const fullyVisible = top >= scrollTop && top + itemHeight <= scrollTop + height;
    const el = rowEl(i);
    if (el && fullyVisible) {
      safeFocus(el);
      return;
    }
    pending.current = i;
    let next = scrollTop;
    if (top < scrollTop) next = top;
    else if (top + itemHeight > scrollTop + height) next = Math.min(maxScroll, top + itemHeight - height);
    if (next === scrollTop) {
      setVersion(function (v) {
        return v + 1;
      });
    } else setScrollTop(next);
  }

  useLayoutEffect(function () {
    if (pending.current >= 0) {
      const el = rowEl(pending.current);
      if (el) {
        pending.current = -1;
        safeFocus(el);
      }
    }
  });

  useImperativeHandle(ref, function () {
    return {
      focusIndex: function (i: number) {
        moveTo(Math.max(0, Math.min(total - 1, i)));
      },
    };
  });

  useEffect(
    function () {
      if (props.autoFocus && total > 0) moveTo(active.current);
    },
    // eslint-disable-next-line
    [total > 0]
  );

  function onKeyDown(e: React.KeyboardEvent) {
    const code = e.keyCode;
    if (code < 37 || code > 40) return;
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const cur = active.current;
    let next = -1;
    if (code === KEY.DOWN) {
      if (Math.floor(cur / columns) < rowsTotal - 1) next = Math.min(total - 1, cur + columns);
    } else if (code === KEY.UP) {
      if (cur >= columns) next = cur - columns;
    } else if (code === KEY.LEFT) {
      if (cur % columns > 0) next = cur - 1;
    } else if (cur % columns < columns - 1 && cur + 1 < total) next = cur + 1;
    if (next >= 0) {
      e.preventDefault();
      moveTo(next);
    }
  }

  function onWheel(e: React.WheelEvent) {
    const d = e.deltaY > 0 ? itemHeight : -itemHeight;
    setScrollTop(function (s) {
      return Math.max(0, Math.min(maxScroll, s + d));
    });
  }

  const rows: ReactElement[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const item = cache.current[i];
    rows.push(
      <div
        key={i}
        data-nav=""
        data-idx={i}
        tabIndex={-1}
        className={"vl-row nv " + (props.rowClassName || "")}
        style={{ left: col * itemWidth, top: row * itemHeight - scrollTop, width: itemWidth, height: itemHeight }}
        onFocus={function () {
          active.current = i;
          if (props.onFocusIndex) props.onFocusIndex(i);
        }}
        onClick={function () {
          if (item !== undefined && props.onSelect) props.onSelect(item, i);
        }}
      >
        {props.renderItem(item, i, i === props.selectedIndex)}
      </div>
    );
  }

  const thumbH = contentH > height ? Math.max(40, Math.round((height * height) / contentH)) : 0;
  const thumbTop = maxScroll > 0 ? Math.round((scrollTop / maxScroll) * (height - thumbH)) : 0;

  return (
    <div
      ref={root}
      data-clip=""
      className={"vl " + (props.className || "")}
      style={{ width: props.width, height: height }}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      onScroll={function (e) {
        const t = e.currentTarget;
        t.scrollTop = 0;
        t.scrollLeft = 0;
      }}
    >
      {total === 0 && props.empty}
      {rows}
      {thumbH > 0 && <div className="vl-thumb" style={{ height: thumbH, top: thumbTop }} />}
    </div>
  );
}

export const VirtualList = forwardRef(VirtualListInner) as <T>(
  p: Props<T> & { ref?: Ref<VirtualListHandle> }
) => ReactElement;

// Dual-mode spatial navigation: 5-way D-pad AND Magic Remote pointer.
//  - Every focusable element carries `data-nav` and uses real DOM focus.
//  - Arrow keys move focus using element geometry (works across columns).
//  - Magic Remote pointer: mouseover syncs DOM focus (only on real pointer movement).
//  - Key handlers form a priority stack (modals > player > screens).
//  - Back (461) with no handler on the root screens opens the "Exit app?" dialog.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { KEY, isArrowKey, isBackKey } from "../config/keyCodes";
import { closestAttr } from "../utils/format";
import { exitApp } from "../services/webosService";

export type KeyResult = boolean | "default" | void;
export type KeyHandler = (code: number, e: KeyboardEvent) => KeyResult;

interface Entry {
  ref: { current: KeyHandler };
  priority: number;
  seq: number;
}

const stack: Entry[] = [];
let seq = 0;

/** Register a key handler. `true` = handled, "default" = stop propagation but allow focus movement. */
export function useKeyHandler(fn: KeyHandler, opts?: { priority?: number; active?: boolean }) {
  const ref = useRef(fn);
  ref.current = fn;
  const priority = (opts && opts.priority) || 0;
  const active = !opts || opts.active !== false;
  useEffect(
    function () {
      if (!active) return;
      const entry: Entry = { ref: ref, priority: priority, seq: ++seq };
      stack.push(entry);
      return function () {
        const i = stack.indexOf(entry);
        if (i >= 0) stack.splice(i, 1);
      };
    },
    [active, priority]
  );
}

/** Convenience: handle only the Back key. */
export function useBack(fn: () => void, active?: boolean) {
  useKeyHandler(
    function (code) {
      if (isBackKey(code)) {
        fn();
        return true;
      }
    },
    { active: active }
  );
}

function dispatch(code: number, e: KeyboardEvent): KeyResult {
  const sorted = stack.slice().sort(function (a, b) {
    return b.priority - a.priority || b.seq - a.seq;
  });
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i].ref.current(code, e);
    if (r === true) return true;
    if (r === "default") return "default";
  }
  return false;
}

export function safeFocus(el: HTMLElement) {
  try {
    el.focus({ preventScroll: true } as any);
  } catch (e) {
    el.focus();
  }
}

function getScope(): HTMLElement {
  const modals = document.querySelectorAll("[data-nav-modal]");
  return (modals.length ? modals[modals.length - 1] : document.body) as HTMLElement;
}

function navElements(scope: HTMLElement): HTMLElement[] {
  const nodes = scope.querySelectorAll("[data-nav]");
  const out: HTMLElement[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i] as HTMLElement;
    if (el.getAttribute("data-disabled")) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const clip = closestAttr(el.parentElement, "data-clip");
    if (clip) {
      const cr = clip.getBoundingClientRect();
      const cy = (r.top + r.bottom) / 2;
      const cx = (r.left + r.right) / 2;
      if (cy < cr.top || cy > cr.bottom || cx < cr.left || cx > cr.right) continue;
    }
    out.push(el);
  }
  return out;
}

function focusBest(els: HTMLElement[]) {
  for (let i = 0; i < els.length; i++) {
    if (els[i].hasAttribute("data-autofocus")) {
      safeFocus(els[i]);
      return;
    }
  }
  if (els.length) safeFocus(els[0]);
}

function move(code: number) {
  const scope = getScope();
  const els = navElements(scope);
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !cur.hasAttribute || !cur.hasAttribute("data-nav") || !scope.contains(cur) || els.indexOf(cur) < 0) {
    focusBest(els);
    return;
  }
  const r = cur.getBoundingClientRect();
  const cx = (r.left + r.right) / 2;
  const cy = (r.top + r.bottom) / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (el === cur) continue;
    const e = el.getBoundingClientRect();
    const ex = (e.left + e.right) / 2;
    const ey = (e.top + e.bottom) / 2;
    let primary: number;
    let secondary: number;
    let center: number;
    if (code === KEY.RIGHT) {
      if (e.left < r.right - 2 && ex <= cx) continue;
      primary = Math.max(0, e.left - r.right);
      secondary = Math.max(0, e.top - r.bottom, r.top - e.bottom);
      center = Math.abs(ey - cy);
    } else if (code === KEY.LEFT) {
      if (e.right > r.left + 2 && ex >= cx) continue;
      primary = Math.max(0, r.left - e.right);
      secondary = Math.max(0, e.top - r.bottom, r.top - e.bottom);
      center = Math.abs(ey - cy);
    } else if (code === KEY.DOWN) {
      if (e.top < r.bottom - 2 && ey <= cy) continue;
      primary = Math.max(0, e.top - r.bottom);
      secondary = Math.max(0, e.left - r.right, r.left - e.right);
      center = Math.abs(ex - cx);
    } else {
      if (e.bottom > r.top + 2 && ey >= cy) continue;
      primary = Math.max(0, r.top - e.bottom);
      secondary = Math.max(0, e.left - r.right, r.left - e.right);
      center = Math.abs(ex - cx);
    }
    const score = primary + secondary * 4 + center * 0.35;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) safeFocus(best);
}

export function SpatialNavProvider(props: { children?: ReactNode }) {
  const [exitOpen, setExitOpen] = useState(false);
  const lastMove = useRef(0);

  useEffect(function () {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      const code = e.keyCode;
      const r = dispatch(code, e);
      if (r === true) {
        e.preventDefault();
        return;
      }
      if (r !== "default" && isBackKey(code)) {
        e.preventDefault();
        setExitOpen(true);
        return;
      }
      const t = e.target as HTMLElement;
      const isInput = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
      if (isArrowKey(code)) {
        if (isInput && (code === KEY.LEFT || code === KEY.RIGHT)) {
          const inp = t as HTMLInputElement;
          let atStart = true;
          let atEnd = true;
          try {
            atStart = inp.selectionStart === 0 && inp.selectionEnd === 0;
            atEnd = inp.selectionStart === inp.value.length;
          } catch (err) {
            /* input types without selection */
          }
          if (code === KEY.LEFT && !atStart) return;
          if (code === KEY.RIGHT && !atEnd) return;
        }
        e.preventDefault();
        move(code);
        return;
      }
      if (code === KEY.ENTER && !isInput) {
        const a = document.activeElement as HTMLElement | null;
        if (a && a.hasAttribute && a.hasAttribute("data-nav")) {
          e.preventDefault();
          a.click();
        }
      }
    }
    function onMouseMove() {
      lastMove.current = Date.now();
    }
    function onMouseOver(e: MouseEvent) {
      // Only react to real pointer movement (not rows scrolling under a still cursor).
      if (Date.now() - lastMove.current > 200) return;
      const el = closestAttr(e.target as Element, "data-nav");
      if (!el || el === document.activeElement || el.tagName === "INPUT") return;
      if (el.getAttribute("data-disabled")) return;
      if (!getScope().contains(el)) return;
      safeFocus(el);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseover", onMouseOver);
    return function () {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseover", onMouseOver);
    };
  }, []);

  return (
    <>
      {props.children}
      {exitOpen && (
        <Modal onClose={() => setExitOpen(false)} className="modal-sm">
          <div className="modal-title">Exit StreamPlayer?</div>
          <div className="modal-text">Press Exit to close the app, or Cancel to keep watching.</div>
          <div className="modal-actions">
            <Btn className="btn btn-primary" autoFocus onClick={exitApp}>
              Exit
            </Btn>
            <Btn className="btn" onClick={() => setExitOpen(false)}>
              Cancel
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}

// ------------------------------------------------------------- widgets ----

interface BtnProps {
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
  selected?: boolean;
  children?: ReactNode;
  title?: string;
}

/** A focusable "button" (div based so it behaves identically on every webOS version). */
export function Btn(p: BtnProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(function () {
    if (p.autoFocus && ref.current) safeFocus(ref.current);
    // eslint-disable-next-line
  }, []);
  return (
    <div
      ref={ref}
      role="button"
      title={p.title}
      tabIndex={-1}
      data-nav=""
      data-disabled={p.disabled ? "1" : undefined}
      data-autofocus={p.autoFocus ? "1" : undefined}
      className={"nv " + (p.className || "") + (p.selected ? " sel" : "") + (p.disabled ? " dis" : "")}
      style={p.style}
      onClick={p.disabled ? undefined : p.onClick}
    >
      {p.children}
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}

/** Labelled text input. On webOS, pressing OK on a focused input opens the on-screen keyboard. */
export function Field(p: FieldProps) {
  return (
    <div className="field">
      <div className="field-label">{p.label}</div>
      <input
        data-nav=""
        data-autofocus={p.autoFocus ? "1" : undefined}
        className="nv nv-input"
        type={p.type || "text"}
        value={p.value}
        placeholder={p.placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(e) => p.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.keyCode === KEY.ENTER && p.onEnter) p.onEnter();
        }}
      />
    </div>
  );
}

interface ModalProps {
  onClose: () => void;
  children?: ReactNode;
  className?: string;
}

export function Modal(p: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<Element | null | undefined>(undefined);
  if (prev.current === undefined) prev.current = document.activeElement;
  useEffect(function () {
    const root = ref.current;
    if (root) {
      const first = (root.querySelector("[data-autofocus]") || root.querySelector("[data-nav]")) as HTMLElement | null;
      if (first) safeFocus(first);
    }
    return function () {
      const pv = prev.current as HTMLElement | null;
      if (pv && document.body.contains(pv)) safeFocus(pv);
    };
  }, []);
  useKeyHandler(
    function (code) {
      if (isBackKey(code)) {
        p.onClose();
        return true;
      }
      return "default";
    },
    { priority: 100 }
  );
  return (
    <div className="modal-back" data-nav-modal="" ref={ref}>
      <div className={"modal " + (p.className || "")}>{p.children}</div>
    </div>
  );
}

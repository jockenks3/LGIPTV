import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Btn, Modal, useKeyHandler } from "../navigation/SpatialNav";
import { digitFromKey } from "../config/keyCodes";

const PATHS: { [k: string]: string } = {
  play: "M8 5v14l11-7z",
  pause: "M6 5h4v14H6zM14 5h4v14h-4z",
  rew: "M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z",
  ff: "M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z",
  prev: "M6 6h2v12H6zm3.5 6l8.5 6V6z",
  next: "M6 18l8.5-6L6 6v12zM16 6v12h2V6z",
  audio: "M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8v8a4.5 4.5 0 002.5-4z",
  cc: "M19 4H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM11 11H9.5v-.5h-2v3h2V13H11v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-4a1 1 0 011-1h3a1 1 0 011 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 01-1 1h-3a1 1 0 01-1-1v-4a1 1 0 011-1h3a1 1 0 011 1v1z",
  star: "M12 17.3l6.2 3.7-1.6-7L22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2l5.4 4.8-1.6 7z",
  close: "M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z",
  tv: "M21 3H3a2 2 0 00-2 2v12a2 2 0 002 2h5v2h8v-2h5a2 2 0 002-2V5a2 2 0 00-2-2zm0 14H3V5h18v12z",
  film: "M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V4h-4z",
  series: "M4 6H2v14a2 2 0 002 2h14v-2H4V6zm16-4H8a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2zm-9 12V5l7 4.5L11 14z",
  gear: "M19.4 13a7.5 7.5 0 000-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 00-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 000 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5L19.4 13zM13 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z",
  search: "M15.5 14h-.8l-.3-.3A6.5 6.5 0 109.5 16a6.5 6.5 0 004.2-1.6l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 110-9 4.5 4.5 0 010 9z",
  lock: "M18 8h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zM9 6a3 3 0 016 0v2H9V6z",
  back: "M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z",
  download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  phone: "M17 1H7a2 2 0 00-2 2v18a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2zM7 18V4h10v14H7z",
  check: "M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z",
};

export function Icon(p: { name: string; size?: number; className?: string }) {
  const s = p.size || 28;
  return (
    <svg className={p.className} width={s} height={s} viewBox="0 0 24 24" style={{ fill: "currentColor", display: "block" }}>
      <path d={PATHS[p.name] || PATHS.play} />
    </svg>
  );
}

function pad(n: number) {
  return n < 10 ? "0" + n : String(n);
}

export function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(function () {
    const id = setInterval(function () {
      setT(new Date());
    }, 15000);
    return function () {
      clearInterval(id);
    };
  }, []);
  return <span className="clock">{pad(t.getHours()) + ":" + pad(t.getMinutes())}</span>;
}

export function Img(p: { src?: string; className?: string }) {
  const [bad, setBad] = useState(false);
  useEffect(
    function () {
      setBad(false);
    },
    [p.src]
  );
  if (!p.src || bad) return null;
  return <img className={p.className} src={p.src} alt="" onError={() => setBad(true)} />;
}

export function Spinner() {
  return <div className="spin" />;
}

export function Header(p: { title: string; icon: string; right?: ReactNode }) {
  return (
    <div className="hdr">
      <div className="hdr-icon">
        <Icon name={p.icon} size={36} />
      </div>
      <div className="hdr-title">{p.title}</div>
      <div className="hdr-right">{p.right}</div>
      <Clock />
    </div>
  );
}

interface PinProps {
  title: string;
  message?: string;
  error?: string;
  onDone: (pin: string) => void;
  onCancel: () => void;
}

/** 4-digit PIN pad (parental control). Works with D-pad focus, pointer and number keys. */
export function PinModal(p: PinProps) {
  const [pin, setPin] = useState("");
  function press(d: number) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      setTimeout(function () {
        p.onDone(next);
      }, 120);
    }
  }
  useKeyHandler(
    function (code) {
      const d = digitFromKey(code);
      if (d >= 0) {
        press(d);
        return true;
      }
      if (code === 8) {
        setPin(pin.slice(0, -1));
        return true;
      }
    },
    { priority: 110 }
  );
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <Modal onClose={p.onCancel} className="modal-sm">
      <div className="modal-title">{p.title}</div>
      <div className="modal-text">{p.message || "Enter your 4-digit PIN"}</div>
      <div className="pin-dots">
        {[0, 1, 2, 3].map(function (i) {
          return <span key={i} className={"pin-dot" + (i < pin.length ? " on" : "")} />;
        })}
      </div>
      <div className="pin-err">{p.error || "\u00a0"}</div>
      <div className="pin-pad">
        {[0, 1, 2].map(function (r) {
          return (
            <div className="pin-row" key={r}>
              {keys.slice(r * 3, r * 3 + 3).map(function (k) {
                return (
                  <Btn key={k} className="pin-key" autoFocus={k === 5} onClick={() => press(k)}>
                    {k}
                  </Btn>
                );
              })}
            </div>
          );
        })}
        <div className="pin-row">
          <Btn className="pin-key pin-small" onClick={() => setPin(pin.slice(0, -1))}>
            Del
          </Btn>
          <Btn className="pin-key" onClick={() => press(0)}>
            0
          </Btn>
          <Btn className="pin-key pin-small" onClick={p.onCancel}>
            Cancel
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

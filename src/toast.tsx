import { useEffect, useState } from "react";
import Icon from "./Icon";

type ToastKind = "ok" | "err" | "info";
interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
}

let nextId = 1;
let listeners: ((item: ToastItem) => void)[] = [];

export function toast(msg: string, kind: ToastKind = "ok") {
  const item: ToastItem = { id: nextId++, msg, kind };
  listeners.forEach((l) => l(item));
}

const GLYPH: Record<ToastKind, "warn" | "info" | "check"> = {
  err: "warn",
  info: "info",
  ok: "check",
};

export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (item: ToastItem) => {
      setItems((prev) => [...prev, item]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== item.id)), 3600);
    };
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  return (
    <div className="toasts">
      {items.map((item) => (
        <div key={item.id} className={`toast ${item.kind}`}>
          <Icon name={GLYPH[item.kind]} />
          <span>{item.msg}</span>
          <button
            className="close"
            aria-label="Dismiss"
            onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
          >
            <Icon name="x" />
          </button>
        </div>
      ))}
    </div>
  );
}

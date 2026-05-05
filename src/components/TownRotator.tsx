"use client";

import { useEffect, useRef, useState } from "react";

const TOWNS = ["Wallaroo's", "Kadina's", "Moonta's"];

export default function TownRotator() {
  const [active, setActive] = useState(0);
  const [exiting, setExiting] = useState<number | null>(null);
  const activeRef = useRef(0);
  activeRef.current = active;

  // Single interval that ticks every 2500ms (matches prototype). The 600ms
  // exit overlap is owned by a setTimeout fired off the interval tick.
  useEffect(() => {
    const interval = setInterval(() => {
      const current = activeRef.current;
      setExiting(current);
      setTimeout(() => {
        setActive((cur) => (cur + 1) % TOWNS.length);
        setExiting(null);
      }, 600);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="town-rotate" aria-live="polite">
      {TOWNS.map((t, i) => {
        const cls =
          i === exiting ? "town exit"
          : i === active ? "town active"
          : "town";
        return <span key={t} className={cls}>{t}</span>;
      })}
    </span>
  );
}

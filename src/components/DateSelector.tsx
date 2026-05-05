"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { addDaysISO, fmtDayShort, todayISO } from "@/lib/dates";

type Props = {
  current: string;       // YYYY-MM-DD
  span?: number;         // how many days to render (default 7)
  paramName?: string;    // URL search param to drive (default "date")
};

// 7-day pill row. Tapping a pill updates the `date` URL param and reloads
// the server component. The pills always centre on the selected date.
export default function DateSelector({ current, span = 7, paramName = "date" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const half = Math.floor(span / 2);
  const dates = Array.from({ length: span }, (_, i) => addDaysISO(current, i - half));
  const today = todayISO();

  function go(date: string) {
    const next = new URLSearchParams(params);
    next.set(paramName, date);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div style={containerStyle}>
      <button type="button" onClick={() => go(addDaysISO(current, -7))} style={navBtn} aria-label="Previous week">‹</button>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1, scrollbarWidth: "none" }}>
        {dates.map((d) => {
          const active = d === current;
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              onClick={() => go(d)}
              style={{
                ...pillBase,
                background: active ? "var(--navy)" : "white",
                color: active ? "white" : "var(--navy)",
                borderColor: active ? "var(--navy)" : isToday ? "var(--lime)" : "var(--gray-light)",
              }}
            >
              <div style={{ fontSize: 10, opacity: 0.7, textTransform: "uppercase", letterSpacing: "1px" }}>
                {isToday ? "Today" : fmtDayShort(d).split(" ")[0]}
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1, marginTop: 2 }}>
                {Number(d.slice(8))}
              </div>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => go(addDaysISO(current, 7))} style={navBtn} aria-label="Next week">›</button>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex", alignItems: "stretch", gap: 6,
  background: "white", padding: 8, borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.06)",
  marginBottom: 16,
};
const pillBase: React.CSSProperties = {
  flex: "0 0 auto",
  width: 56, minHeight: 56,
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
  borderRadius: 10, border: "1.5px solid",
  cursor: "pointer", fontWeight: 700,
  padding: 6,
};
const navBtn: React.CSSProperties = {
  background: "var(--off)", border: "none",
  borderRadius: 10, cursor: "pointer",
  fontSize: 18, fontWeight: 800, color: "var(--navy)",
  width: 36, minHeight: 56,
};

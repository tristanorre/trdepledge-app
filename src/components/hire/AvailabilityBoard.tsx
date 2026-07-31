"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  BLOCK_REASONS,
  addMonths,
  checkBlockRange,
  eachDay,
  fmtHireDate,
  fmtHireMonth,
  monthCalendar,
  startOfMonth,
  type AvailabilityContext,
  type Equipment,
  type Hold,
  type ISODate,
} from "@/lib/hire";
import * as s from "./adminStyles";

export type BlockEntry = {
  id: string;
  startsOn: ISODate;
  endsOn: ISODate;
  reason: string | null;
};

export type BoardEntry = {
  equipment: Equipment;
  holds: Hold[];
  blocks: BlockEntry[];
};

/**
 * Thomas's side of the calendar: block dates out, and release them again.
 *
 * Day states come from the same engine the public calendar uses, so what he
 * sees as taken is exactly what a customer sees as taken. The one difference
 * is which days he may *select*: a customer can't collect on a weekend, but
 * Thomas's own job doesn't stop for the counter being shut, so weekends are
 * selectable here. That distinction lives in `checkBlockRange`, not in this
 * component.
 */
export default function AvailabilityBoard({
  entries,
  today,
}: {
  entries: BoardEntry[];
  today: ISODate;
}) {
  const router = useRouter();

  const [slug, setSlug] = useState(entries[0]?.equipment.slug ?? "");
  const [month, setMonth] = useState<ISODate>(startOfMonth(today));
  const [start, setStart] = useState<ISODate | null>(null);
  const [end, setEnd] = useState<ISODate | null>(null);
  const [reason, setReason] = useState<string>(BLOCK_REASONS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => entries.find((e) => e.equipment.slug === slug) ?? entries[0],
    [entries, slug],
  );

  const ctx: AvailabilityContext | null = selected
    ? { today, holds: selected.holds, changeoverDays: selected.equipment.changeoverDays }
    : null;

  const calendar = useMemo(() => (ctx ? monthCalendar(month, ctx) : null), [ctx, month]);

  // Which held days are Thomas's own blocks — those are the releasable ones.
  const blockedDays = useMemo(() => {
    const set = new Set<string>();
    for (const b of selected?.blocks ?? []) {
      for (const d of eachDay(b.startsOn, b.endsOn)) set.add(d);
    }
    return set;
  }, [selected]);

  if (!selected || !ctx || !calendar) {
    return <div style={s.empty}>No equipment on the books yet — add some first.</div>;
  }

  function reset() {
    setStart(null);
    setEnd(null);
    setError(null);
  }

  function onDayClick(date: ISODate) {
    setError(null);

    // Clicking a blocked day offers to release it — the spec's "click a
    // blocked day to release it".
    if (blockedDays.has(date)) {
      const block = selected!.blocks.find((b) => date >= b.startsOn && date <= b.endsOn);
      if (block) void releaseBlock(block);
      return;
    }

    if (!start || (start && end) || date < start) {
      setStart(date);
      setEnd(null);
      return;
    }
    if (date === start) {
      setEnd(null);
      return;
    }

    const check = checkBlockRange(start, date, ctx!);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setEnd(date);
  }

  async function save() {
    if (!start) return;
    const check = checkBlockRange(start, end ?? start, ctx!);
    if (!check.ok) {
      setError(check.message);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/hire/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selected!.equipment.slug,
          startsOn: start,
          endsOn: end ?? start,
          reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "That didn't save. Try again.");
        return;
      }
      reset();
      router.refresh();
    } catch {
      setError("That didn't save — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function releaseBlock(block: BlockEntry) {
    const span =
      block.startsOn === block.endsOn
        ? fmtHireDate(block.startsOn)
        : `${fmtHireDate(block.startsOn)} – ${fmtHireDate(block.endsOn)}`;
    if (!window.confirm(`Free these dates up?\n${span} — ${block.reason ?? "blocked"}`)) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hire/blocks/${block.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "That didn't save. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("That didn't save — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div style={s.card}>
        <label htmlFor="block-tool" style={{ ...s.tileLabel, display: "block", marginBottom: 6 }}>
          Tool
        </label>
        <select
          id="block-tool"
          className="form-select"
          value={selected.equipment.slug}
          onChange={(e) => {
            setSlug(e.target.value);
            reset();
            setMonth(startOfMonth(today));
          }}
          style={{ maxWidth: 360 }}
        >
          {entries.map(({ equipment }) => (
            <option key={equipment.id} value={equipment.slug}>
              {equipment.name}
              {equipment.isPublished ? "" : " (unpublished)"}
            </option>
          ))}
        </select>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            margin: "18px 0 10px",
          }}
        >
          <button
            type="button"
            style={s.actionButton("quiet")}
            disabled={month <= startOfMonth(today)}
            onClick={() => setMonth(addMonths(month, -1))}
            aria-label="Previous month"
          >
            ←
          </button>
          <strong style={{ fontSize: 16 }} aria-live="polite">
            {fmtHireMonth(month)}
          </strong>
          <button
            type="button"
            style={s.actionButton("quiet")}
            onClick={() => setMonth(addMonths(month, 1))}
            aria-label="Next month"
          >
            →
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span
              key={d}
              style={{ ...s.tileLabel, fontSize: 10, textAlign: "center", padding: "4px 0" }}
            >
              {d}
            </span>
          ))}
          {Array.from({ length: calendar.leadingBlanks }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {calendar.days.map((day) => {
            const isBlock = blockedDays.has(day.date);
            const isStart = day.date === start;
            const isEnd = day.date === end;
            const inSpan = !!start && !!end && day.date > start && day.date < end;
            // Thomas may select any day from today that isn't already held —
            // including weekends, unlike a customer.
            const selectable = day.state !== "past" && !day.held;

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => onDayClick(day.date)}
                disabled={busy || (!selectable && !isBlock)}
                aria-label={`${fmtHireDate(day.date)}${
                  isBlock ? " — blocked, tap to release" : day.held ? " — booked" : ""
                }`}
                style={dayStyle({
                  state: day.state,
                  held: day.held,
                  isBlock,
                  picked: isStart || isEnd,
                  inSpan,
                  isToday: day.isToday,
                  selectable,
                })}
              >
                {Number(day.date.slice(8, 10))}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14, fontSize: 12 }}>
          <Key colour="#FFFFFF" border="#D1D5DB" label="Free" />
          <Key colour="#FEE2E2" border="#FCA5A5" label="Customer hire" />
          <Key colour="#E0E7FF" border="#A5B4FC" label="Your block" />
          <Key colour="#F3F4F6" border="#E5E7EB" label="Weekend" />
          <Key colour="#FDE68A" border="#F59E0B" label="Selected" />
        </div>
      </div>

      <div style={s.card}>
        <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>
          {start
            ? end && end !== start
              ? `Block ${fmtHireDate(start)} – ${fmtHireDate(end)}`
              : `Block ${fmtHireDate(start)}`
            : "Pick the first day to block"}
        </h3>
        <p style={{ ...s.muted, margin: "0 0 12px" }}>
          Tap a start day then the last day. Tap a blue day to free it up again.
        </p>

        <label htmlFor="block-reason" style={{ ...s.tileLabel, display: "block", marginBottom: 6 }}>
          Reason
        </label>
        <select
          id="block-reason"
          className="form-select"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ maxWidth: 360, marginBottom: 14 }}
        >
          {BLOCK_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            style={{ ...s.actionButton("primary"), opacity: !start || busy ? 0.6 : 1 }}
            disabled={!start || busy}
            onClick={save}
          >
            {busy ? "Saving…" : "Block these dates"}
          </button>
          {start && (
            <button type="button" style={s.actionButton("quiet")} onClick={reset} disabled={busy}>
              Clear
            </button>
          )}
        </div>

        {error && (
          <p style={s.errorText} role="alert">
            {error}
          </p>
        )}
      </div>

      <div>
        <h3 style={s.sectionHead}>Blocked out — {selected.equipment.name}</h3>
        {selected.blocks.length === 0 ? (
          <div style={s.empty}>Nothing blocked. The diary is clear.</div>
        ) : (
          <div style={s.list}>
            {selected.blocks.map((b) => (
              <div key={b.id} style={s.row}>
                <div style={s.rowMain}>
                  <div style={s.rowTitle}>
                    {b.startsOn === b.endsOn
                      ? fmtHireDate(b.startsOn)
                      : `${fmtHireDate(b.startsOn)} – ${fmtHireDate(b.endsOn)}`}
                  </div>
                  <div style={s.rowMeta}>{b.reason ?? "Blocked"}</div>
                </div>
                <button
                  type="button"
                  style={s.actionButton("quiet")}
                  disabled={busy}
                  onClick={() => releaseBlock(b)}
                >
                  Free it up
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Key({ colour, border, label }: { colour: string; border: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#6B7280" }}>
      <i
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          background: colour,
          border: `1.5px solid ${border}`,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

function dayStyle(o: {
  state: string;
  held: boolean;
  isBlock: boolean;
  picked: boolean;
  inSpan: boolean;
  isToday: boolean;
  selectable: boolean;
}) {
  const base = {
    minHeight: 44,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: o.selectable || o.isBlock ? "pointer" : "not-allowed",
    border: "1.5px solid #E5E7EB",
    background: "white",
    color: "#111827",
    padding: 0,
    outline: o.isToday ? "2px solid var(--navy)" : undefined,
    outlineOffset: o.isToday ? -2 : undefined,
  };

  if (o.picked) return { ...base, background: "#FDE68A", borderColor: "#F59E0B" };
  if (o.inSpan) return { ...base, background: "#FEF3C7", borderColor: "#FCD34D" };
  // Thomas's own blocks read differently from a customer's hire — he can
  // release one and must not think he can release the other.
  if (o.isBlock) return { ...base, background: "#E0E7FF", borderColor: "#A5B4FC", color: "#3730A3" };
  if (o.held) return { ...base, background: "#FEE2E2", borderColor: "#FCA5A5", color: "#B91C1C" };
  if (o.state === "past") return { ...base, background: "#F9FAFB", color: "#D1D5DB" };
  if (o.state === "closed") return { ...base, background: "#F3F4F6", color: "#9CA3AF" };
  return base;
}

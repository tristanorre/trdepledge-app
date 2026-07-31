"use client";

// The interactive half of /hire: the catalogue (filter chips, cards, flyer
// lightbox) and the booking module (tool picker, calendar, running total).
//
// These two sections share one piece of state — which tool you're looking
// at — so they live in one client component. "Check availability" on a card
// selects the tool and scrolls to the calendar; changing the tool in the
// calendar's dropdown clears the dates.
//
// AVAILABILITY IS NOT RE-IMPLEMENTED HERE. Every day state, the charged-day
// count and the range validation come from `@/lib/hire`, the same pure
// functions the server uses and that the admin console and Doug will use.
// The browser is given the holds (dates only, no customer details) and runs
// the identical rules over them, so the calendar can respond instantly
// without a round trip and still agree with the server exactly.
//
// Import from "@/lib/hire" (the barrel) is safe here: it deliberately does
// not re-export ./repo, so no Supabase client reaches the browser bundle.

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CUTOUT_PHOTO_SLUGS,
  HIRE_PHONE,
  HIRE_PHONE_TEL,
  addMonths,
  chargedDays,
  checkHireRange,
  fmtHireDate,
  fmtHireDateLong,
  fmtHireMonth,
  fmtHireMoney,
  monthCalendar,
  startOfMonth,
  type AvailabilityContext,
  type Equipment,
  type Hold,
  type ISODate,
} from "@/lib/hire";

export type HireEntry = {
  equipment: Equipment;
  holds: Hold[];
  nextFree: ISODate | null;
};

type Props = {
  /** Today in Adelaide, resolved on the server. */
  today: ISODate;
  /** Furthest date holds were loaded for — bounds how far the calendar pages. */
  horizon: ISODate;
  entries: HireEntry[];
};

const ALL = "All";

export default function HireApp({ today, horizon, entries }: Props) {
  const [filter, setFilter] = useState<string>(ALL);
  const [slug, setSlug] = useState<string>(entries[0]?.equipment.slug ?? "");
  const [start, setStart] = useState<ISODate | null>(null);
  const [end, setEnd] = useState<ISODate | null>(null);
  const [month, setMonth] = useState<ISODate>(startOfMonth(today));
  const [flyer, setFlyer] = useState<HireEntry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const bookingRef = useRef<HTMLElement | null>(null);

  const categories = useMemo(
    () => [ALL, ...Array.from(new Set(entries.map((e) => e.equipment.category)))],
    [entries],
  );

  const visible = useMemo(
    () => (filter === ALL ? entries : entries.filter((e) => e.equipment.category === filter)),
    [entries, filter],
  );

  const selected = useMemo(
    () => entries.find((e) => e.equipment.slug === slug) ?? entries[0],
    [entries, slug],
  );

  const ctx: AvailabilityContext | null = useMemo(
    () =>
      selected
        ? { today, holds: selected.holds, changeoverDays: selected.equipment.changeoverDays }
        : null,
    [selected, today],
  );

  const calendar = useMemo(() => (ctx ? monthCalendar(month, ctx) : null), [ctx, month]);

  /** Switching tool clears the dates — they were checked against a different diary. */
  const pickTool = useCallback(
    (nextSlug: string) => {
      setSlug(nextSlug);
      setStart(null);
      setEnd(null);
      setNotice(null);
      setMonth(startOfMonth(today));
    },
    [today],
  );

  const checkAvailability = useCallback(
    (nextSlug: string) => {
      pickTool(nextSlug);
      bookingRef.current?.scrollIntoView({ block: "start" });
    },
    [pickTool],
  );

  const onDayClick = useCallback(
    (date: ISODate) => {
      if (!ctx) return;
      setNotice(null);

      // Fresh selection: no start yet, a complete range already picked, or a
      // day earlier than the current start (treat it as a new start).
      if (!start || (start && end) || date < start) {
        setStart(date);
        setEnd(null);
        return;
      }
      if (date === start) {
        setEnd(null);
        return;
      }

      const check = checkHireRange(start, date, ctx);
      if (!check.ok) {
        setNotice(check.message);
        return;
      }
      setEnd(date);
    },
    [ctx, start, end],
  );

  const canGoBack = month > startOfMonth(today);
  const canGoForward = month < startOfMonth(horizon);

  const days = start ? chargedDays(start, end ?? start) : 0;
  const hireCents = selected ? days * selected.equipment.dailyRateCents : 0;
  const bondCents = selected?.equipment.bondCents ?? 0;
  const totalCents = hireCents + bondCents;

  if (entries.length === 0) {
    return (
      <section className="cat" id="gear">
        <div className="wrap">
          <p className="eyebrow">The yard</p>
          <h2>What&rsquo;s on the floor</h2>
          <div className="empty" style={{ marginTop: 22 }}>
            <b>Nothing on the floor just yet</b>
            <p style={{ margin: 0 }}>
              The gear is being listed. Give Thomas a call on{" "}
              <a href={`tel:${HIRE_PHONE_TEL}`}>{HIRE_PHONE}</a> and he&rsquo;ll tell you
              what&rsquo;s available.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* ---------- catalogue ---------- */}
      <section className="cat" id="gear">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <p className="eyebrow">The yard</p>
              <h2>What&rsquo;s on the floor</h2>
            </div>
            <div className="chips" role="group" aria-label="Filter by job type">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  aria-pressed={c === filter}
                  onClick={() => setFilter(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid">
            {visible.map((entry) => (
              <KitCard
                key={entry.equipment.id}
                entry={entry}
                today={today}
                onCheck={() => checkAvailability(entry.equipment.slug)}
                onFlyer={() => setFlyer(entry)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ---------- booking ---------- */}
      <section
        className="book"
        id="booking"
        ref={bookingRef as React.RefObject<HTMLElement>}
      >
        <div className="wrap">
          <p className="eyebrow">Availability &amp; booking</p>
          <h2>Check a date, book it in</h2>

          <div className="book-grid">
            <div className="card">
              <h3>Pick your dates</h3>
              <p className="hint">
                Tap the first day you want it, then the day you&rsquo;ll bring it back. Return
                day isn&rsquo;t charged.
              </p>

              <div className="pickrow">
                <div className={thumbClass(selected.equipment)}>
                  <ToolImage equipment={selected.equipment} sizes="64px" />
                </div>
                <div>
                  <label htmlFor="tool">Tool</label>
                  <select
                    id="tool"
                    value={selected.equipment.slug}
                    onChange={(e) => pickTool(e.target.value)}
                  >
                    {entries.map(({ equipment }) => (
                      <option key={equipment.id} value={equipment.slug}>
                        {equipment.name} — {fmtHireMoney(equipment.dailyRateCents)}/day
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="cal-head">
                <button
                  type="button"
                  className="nudge"
                  aria-label="Previous month"
                  disabled={!canGoBack}
                  onClick={() => setMonth(addMonths(month, -1))}
                >
                  &#8592;
                </button>
                <strong aria-live="polite">{fmtHireMonth(month)}</strong>
                <button
                  type="button"
                  className="nudge"
                  aria-label="Next month"
                  disabled={!canGoForward}
                  onClick={() => setMonth(addMonths(month, 1))}
                >
                  &#8594;
                </button>
              </div>

              <div className="dow" aria-hidden="true">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>

              <div className="days">
                {calendar &&
                  Array.from({ length: calendar.leadingBlanks }, (_, i) => (
                    <span key={`pad-${i}`} className="day pad" aria-hidden="true" />
                  ))}
                {calendar?.days.map((day) => {
                  const isStart = day.date === start;
                  const isEnd = day.date === end;
                  const inSpan = !!start && !!end && day.date > start && day.date < end;
                  const classes = ["day", day.state];
                  if (day.isToday) classes.push("today");
                  if (isStart || isEnd) classes.push("pick");
                  if (inSpan) classes.push("span");

                  return (
                    <button
                      key={day.date}
                      type="button"
                      className={classes.join(" ")}
                      disabled={!day.selectable}
                      aria-pressed={isStart || isEnd}
                      aria-label={`${fmtHireDateLong(day.date)} — ${stateLabel(day.state)}`}
                      onClick={() => onDayClick(day.date)}
                    >
                      {Number(day.date.slice(8, 10))}
                    </button>
                  );
                })}
              </div>

              <div className="key">
                <span>
                  <i className="k-free" />
                  Free to hire
                </span>
                <span>
                  <i className="k-out" />
                  Out on hire
                </span>
                <span>
                  <i className="k-shut" />
                  Closed
                </span>
                <span>
                  <i className="k-pick" />
                  Your dates
                </span>
              </div>
            </div>

            {/* ---------- running total ---------- */}
            <div className="card dock">
              <div className="dock-top">
                <div className={thumbClass(selected.equipment)}>
                  <ToolImage equipment={selected.equipment} sizes="64px" />
                </div>
                <div>
                  <span>Your hire</span>
                  <b>{selected.equipment.name}</b>
                </div>
              </div>

              <p className="hint" role="status" aria-live="polite">
                {notice ??
                  (!start
                    ? "Pick a start date on the calendar."
                    : !end
                      ? "Now pick the day you'll bring it back."
                      : "Looks good — those dates are free.")}
              </p>

              {!start ? (
                <div>
                  <div className="dock-line">
                    <span>Daily rate</span>
                    <b>{fmtHireMoney(selected.equipment.dailyRateCents)}</b>
                  </div>
                  <div className="dock-line">
                    <span>Refundable bond</span>
                    <b>{fmtHireMoney(bondCents)}</b>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="dock-line">
                    <span>Collect</span>
                    <b>{fmtHireDate(start)}</b>
                  </div>
                  <div className="dock-line">
                    <span>Return by</span>
                    <b>{end ? fmtHireDate(end) : "—"}</b>
                  </div>
                  <div className="dock-line">
                    <span>Charged days</span>
                    <b>
                      {days} @ {fmtHireMoney(selected.equipment.dailyRateCents)}
                    </b>
                  </div>
                  <div className="dock-line">
                    <span>Hire</span>
                    <b>{fmtHireMoney(hireCents)}</b>
                  </div>
                  <div className="dock-line">
                    <span>Refundable bond</span>
                    <b>{fmtHireMoney(bondCents)}</b>
                  </div>
                </div>
              )}

              <div className="dock-total">
                <span>Due at pickup</span>
                <b>{fmtHireMoney(start ? totalCents : 0)}</b>
              </div>
              <small>Bond is refunded when the tool comes back clean and undamaged.</small>

              {/* Phase 4 replaces this with the booking form. Until the form
                  exists, the page says plainly how to actually book rather
                  than showing a button that does nothing. */}
              <div className="notice">
                Online booking is opening shortly. To lock these dates in now, call Thomas on{" "}
                <a href={`tel:${HIRE_PHONE_TEL}`}>{HIRE_PHONE}</a>.
              </div>
              <a className="btn wide" href={`tel:${HIRE_PHONE_TEL}`}>
                Call to book
              </a>
            </div>
          </div>
        </div>
      </section>

      {flyer && <FlyerLightbox entry={flyer} onClose={() => setFlyer(null)} />}
    </>
  );
}

/* ---------------------------------------------------------------- */

function stateLabel(state: string): string {
  switch (state) {
    case "out":
      return "out on hire";
    case "blocked":
      return "not available";
    case "closed":
      return "closed";
    case "past":
      return "unavailable";
    default:
      return "free";
  }
}

function isCutout(equipment: Equipment): boolean {
  return CUTOUT_PHOTO_SLUGS.includes(equipment.slug);
}

function thumbClass(equipment: Equipment): string {
  return isCutout(equipment) ? "thumb cutout" : "thumb";
}

/** Equipment photo, filling a sized container. Cut-outs contain rather than crop. */
function ToolImage({ equipment, sizes }: { equipment: Equipment; sizes: string }) {
  if (!equipment.photoPath) return null;
  return (
    <Image
      src={equipment.photoPath}
      alt={`${equipment.name} available for hire`}
      fill
      sizes={sizes}
      style={
        isCutout(equipment)
          ? { objectFit: "contain", padding: 4 }
          : { objectFit: "cover" }
      }
    />
  );
}

function KitCard({
  entry,
  today,
  onCheck,
  onFlyer,
}: {
  entry: HireEntry;
  today: ISODate;
  onCheck: () => void;
  onFlyer: () => void;
}) {
  const { equipment, nextFree } = entry;
  const freeToday = nextFree === today;

  return (
    <article className="kit">
      <div className={isCutout(equipment) ? "kit-art cutout" : "kit-art"}>
        <ToolImage equipment={equipment} sizes="(max-width: 600px) 100vw, (max-width: 940px) 50vw, 33vw" />
        <span className="tag">{equipment.category}</span>
        <span className="rate">
          <b>{fmtHireMoney(equipment.dailyRateCents)}</b>
          <span>per day</span>
        </span>
      </div>

      <div className="kit-body">
        <h3>{equipment.name}</h3>
        {equipment.blurb && <p>{equipment.blurb}</p>}
        {equipment.specs.length > 0 && (
          <ul className="spec">
            {equipment.specs.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}

        <div className="kit-foot">
          <div className="foot-row">
            <span className={freeToday ? "avail-note" : "avail-note busy"}>
              {!nextFree ? (
                "Ask us about dates"
              ) : freeToday ? (
                <>
                  Free from <b>today</b>
                </>
              ) : (
                <>
                  Next free <b>{fmtHireDate(nextFree)}</b>
                </>
              )}
            </span>
            {equipment.flyerPath && (
              <button type="button" className="linkish" onClick={onFlyer}>
                View the flyer
              </button>
            )}
          </div>
          <button type="button" className="btn" onClick={onCheck}>
            Check availability
          </button>
        </div>
      </div>
    </article>
  );
}

/** Flyer spec sheet. Escape and backdrop close; focus is trapped to the close button. */
function FlyerLightbox({ entry, onClose }: { entry: HireEntry; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    closeRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      (returnFocusRef.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="lb"
      role="dialog"
      aria-modal="true"
      aria-label={`${entry.equipment.name} hire flyer`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="lb-inner">
        <button type="button" className="btn ghost lb-x" ref={closeRef} onClick={onClose}>
          Close
        </button>
        <Image
          src={entry.equipment.flyerPath!}
          alt={`${entry.equipment.name} hire flyer with rate and specifications`}
          width={640}
          height={960}
          sizes="(max-width: 600px) 92vw, 560px"
          // The flyers differ in height (904–960px). Letting the browser use
          // the natural ratio avoids distorting whichever one isn't 640×960.
          style={{ width: "auto", height: "auto", maxHeight: "82vh", maxWidth: "100%" }}
        />
      </div>
    </div>
  );
}

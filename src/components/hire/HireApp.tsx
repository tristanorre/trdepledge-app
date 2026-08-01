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

import { hirePhotoUrl } from "@/lib/storage";
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
  validateBooking,
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
  /**
   * False when the server couldn't reach the database at all.
   *
   * Distinct from "no items", which looks identical on screen and is a
   * completely different problem. Without this the offline case reads as
   * an empty yard, and the only way to tell them apart is to go and query
   * the database by hand — which is exactly what happened once.
   */
  catalogueLoaded?: boolean;
};

const ALL = "All";

export default function HireApp({ today, horizon, entries, catalogueLoaded = true }: Props) {
  const [filter, setFilter] = useState<string>(ALL);
  const [slug, setSlug] = useState<string>(entries[0]?.equipment.slug ?? "");
  const [start, setStart] = useState<ISODate | null>(null);
  const [end, setEnd] = useState<ISODate | null>(null);
  const [month, setMonth] = useState<ISODate>(startOfMonth(today));
  const [flyer, setFlyer] = useState<HireEntry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const bookingRef = useRef<HTMLElement | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

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

  /**
   * Doug filling the form in.
   *
   * The widget lives in a shadow root and can't touch this component, so
   * it dispatches an event and we act on it. The server has already
   * checked the tool is published and the dates are free — we check again
   * against the holds this page was rendered with, because the two could
   * disagree if the page has been open a while, and the visitor should
   * hear that from the calendar rather than from a failed submit.
   *
   * Nothing here submits anything. It selects a tool, sets two dates, and
   * scrolls — exactly what the visitor would have done by hand.
   */
  useEffect(() => {
    function onPrefill(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { slug?: string; startsOn?: string; endsOn?: string }
        | undefined;
      if (!detail?.slug || !detail.startsOn || !detail.endsOn) return;

      const entry = entries.find((x) => x.equipment.slug === detail.slug);
      if (!entry) return;

      const entryCtx: AvailabilityContext = {
        today,
        holds: entry.holds,
        changeoverDays: entry.equipment.changeoverDays,
      };
      const check = checkHireRange(detail.startsOn, detail.endsOn, entryCtx);

      setSlug(entry.equipment.slug);
      setMonth(startOfMonth(detail.startsOn));

      if (!check.ok) {
        setStart(null);
        setEnd(null);
        setNotice(check.message);
      } else {
        setStart(detail.startsOn);
        setEnd(detail.endsOn);
        setNotice(null);
      }

      // Two frames, not one: React has to commit the new dates before the
      // form is worth scrolling to, or we'd land on a summary that still
      // reads "choose a tool and dates above".
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          formRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
          if (check.ok) nameRef.current?.focus({ preventScroll: true });
        });
      });
    }

    window.addEventListener("doug:hire-prefill", onPrefill);
    return () => window.removeEventListener("doug:hire-prefill", onPrefill);
  }, [entries, today]);

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
          {/* Two different failures that look the same to a visitor. Both
              send them to the phone, because that always works — but the
              wording has to tell us apart which one we're looking at. */}
          <div className="empty" style={{ marginTop: 22 }}>
            {catalogueLoaded ? (
              <>
                <b>Nothing on the floor just yet</b>
                <p style={{ margin: 0 }}>
                  The gear is being listed. Give Thomas a call on{" "}
                  <a href={`tel:${HIRE_PHONE_TEL}`}>{HIRE_PHONE}</a> and he&rsquo;ll tell you
                  what&rsquo;s available.
                </p>
              </>
            ) : (
              <>
                <b>Can&rsquo;t load the yard right now</b>
                <p style={{ margin: 0 }}>
                  The gear list isn&rsquo;t loading — it&rsquo;s us, not you. Give Thomas a call
                  on <a href={`tel:${HIRE_PHONE_TEL}`}>{HIRE_PHONE}</a> and he&rsquo;ll sort you
                  out.
                </p>
              </>
            )}
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

              <button
                type="button"
                className="btn wide"
                disabled={!start || !end}
                onClick={() => {
                  formRef.current?.scrollIntoView({ block: "center" });
                  nameRef.current?.focus();
                }}
              >
                Continue to details
              </button>
            </div>
          </div>

          <BookingForm
            formRef={formRef}
            nameRef={nameRef}
            equipment={selected.equipment}
            startsOn={start}
            endsOn={end}
            quote={{ days, hireCents, bondCents, totalCents }}
            onBooked={() => {
              setStart(null);
              setEnd(null);
            }}
          />
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
  // photo_path is either a file in public/ (the original seed) or a key in
  // the hire-photos bucket (uploaded by Thomas). Both resolve here.
  const src = hirePhotoUrl(equipment.photoPath);
  if (!src) return null;
  return (
    <Image
      src={src}
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

/**
 * The booking request form.
 *
 * Validation runs through `validateBooking` from @/lib/hire — the same
 * module the API route uses — so the browser and the server can't disagree
 * about what a valid mobile is, and the customer sees the same wording
 * either way. The server validates again regardless; this pass exists to
 * answer instantly, not to be trusted.
 *
 * Sending creates a PENDING request. It is not a confirmed booking, and the
 * copy is careful about that distinction.
 */
function BookingForm({
  formRef,
  nameRef,
  equipment,
  startsOn,
  endsOn,
  quote,
  onBooked,
}: {
  formRef: React.RefObject<HTMLDivElement>;
  nameRef: React.RefObject<HTMLInputElement>;
  equipment: Equipment;
  startsOn: ISODate | null;
  endsOn: ISODate | null;
  quote: { days: number; hireCents: number; bondCents: number; totalCents: number };
  onBooked: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [jobNotes, setJobNotes] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot — real people leave this empty
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<BookingConfirmation | null>(null);

  if (done) {
    return (
      <div className="card done-card" ref={formRef}>
        <div className="done">
          <h3>Booking request sent</h3>
          <p className="done-intro">
            Thanks {done.firstName}. Your dates are held while Thomas confirms — you&rsquo;ll get
            a text on {done.phone}, usually the same day.
          </p>
          <p className="eyebrow">Your reference</p>
          <p className="ref">{done.reference}</p>
          <div className="done-lines">
            <div className="dock-line">
              <span>Tool</span>
              <b>{done.equipmentName}</b>
            </div>
            <div className="dock-line">
              <span>Collect</span>
              <b>{fmtHireDate(done.startsOn)}</b>
            </div>
            <div className="dock-line">
              <span>Return by</span>
              <b>{fmtHireDate(done.endsOn)}</b>
            </div>
            <div className="dock-line">
              <span>Due at pickup</span>
              <b>{fmtHireMoney(done.totalDueAtPickupCents)}</b>
            </div>
          </div>
          <p className="done-foot">
            Need to change something? Call <a href={`tel:${HIRE_PHONE_TEL}`}>{HIRE_PHONE}</a>.
          </p>
        </div>
      </div>
    );
  }

  const submit = async () => {
    setError(null);

    const check = validateBooking({
      slug: equipment.slug,
      startsOn: startsOn ?? "",
      endsOn: endsOn ?? "",
      name,
      phone,
      email,
      jobNotes,
      acceptedTerms: accepted,
    });
    if (!check.ok) {
      setError(check.message);
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/hire/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: equipment.slug,
          startsOn,
          endsOn,
          name,
          phone,
          email,
          jobNotes,
          acceptedTerms: accepted,
          website,
          // Note: no total is sent. The server prices from the equipment
          // row, so there is nothing here worth tampering with.
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(
          data?.error ??
            `That didn't send. Try again, or call Thomas on ${HIRE_PHONE}.`,
        );
        return;
      }

      setDone({
        reference: data.reference,
        firstName: name.trim().split(/\s+/)[0],
        phone: phone.trim(),
        equipmentName: data.equipment?.name ?? equipment.name,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        totalDueAtPickupCents: data.totalDueAtPickupCents,
      });
      onBooked();
    } catch {
      setError(`That didn't send — check your connection, or call Thomas on ${HIRE_PHONE}.`);
    } finally {
      setSending(false);
    }
  };

  const ready = !!startsOn && !!endsOn;

  return (
    <div className="card form-card" ref={formRef}>
      <h3>Your details</h3>
      <p className="hint">
        Sending this holds the dates while Thomas confirms. No payment is taken here.
      </p>

      <div className="notice">
        {ready ? (
          <>
            <b>{equipment.name}</b> — collect {fmtHireDate(startsOn!)}, return{" "}
            {fmtHireDate(endsOn!)}. {quote.days} day{quote.days > 1 ? "s" : ""} at{" "}
            {fmtHireMoney(equipment.dailyRateCents)} plus {fmtHireMoney(quote.bondCents)} bond ={" "}
            <b>{fmtHireMoney(quote.totalCents)}</b> at pickup.
          </>
        ) : (
          "Choose a tool and dates above and they'll show up here."
        )}
      </div>

      <div className="form-grid">
        <div>
          <label htmlFor="fname">Name</label>
          <input
            id="fname"
            ref={nameRef}
            autoComplete="name"
            placeholder="Jane Citizen"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="fphone">Mobile</label>
          <input
            id="fphone"
            type="tel"
            autoComplete="tel"
            placeholder="0400 000 000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="full">
          <label htmlFor="femail">Email</label>
          <input
            id="femail"
            type="email"
            autoComplete="email"
            placeholder="jane@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="full">
          <label htmlFor="fjob">
            What are you using it for?{" "}
            <span className="opt">(optional — helps us send the right attachment)</span>
          </label>
          <textarea
            id="fjob"
            placeholder="Laying pavers down the side of the house, about 12m."
            value={jobNotes}
            onChange={(e) => setJobNotes(e.target.value)}
          />
        </div>

        {/* Honeypot. Hidden from people and from screen readers; bots fill it. */}
        <div className="hp" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <div className="full tick">
          <input
            type="checkbox"
            id="fok"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <label htmlFor="fok">
            I&rsquo;m 18 or over, I&rsquo;ll bring photo ID, and I&rsquo;ve read the hire terms
            below.
          </label>
        </div>

        <div className="full">
          <p className={error ? "err on" : "err"} role="alert">
            {error}
          </p>
          <button type="button" className="btn wide" onClick={submit} disabled={sending}>
            {sending ? "Sending…" : "Send booking request"}
          </button>
        </div>
      </div>
    </div>
  );
}

type BookingConfirmation = {
  reference: string;
  firstName: string;
  phone: string;
  equipmentName: string;
  startsOn: ISODate;
  endsOn: ISODate;
  totalDueAtPickupCents: number;
};

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
          // Through hirePhotoUrl for the cache-busting version, the same as
          // the card photos — a replaced flyer is stale otherwise.
          src={hirePhotoUrl(entry.equipment.flyerPath)!}
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

import Link from "next/link";

import BookingActions from "@/components/hire/BookingActions";
import { HireStatusPill, OverduePill } from "@/components/StatusPill";
import * as s from "@/components/hire/adminStyles";
import { STATUS_LABELS, fmtHireDate, fmtHireMoney, isOverdue, today } from "@/lib/hire";
import type { ReservationStatus } from "@/lib/hire";
import { listAdminReservations, releaseExpiredHolds, type AdminReservation } from "@/lib/hire/repo";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Every booking, filterable. The Today screen answers "what needs me now";
// this one answers "what's the story with that hire last week".

type Filter = "attention" | "all" | ReservationStatus;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "attention", label: "Needs attention" },
  { key: "all", label: "All" },
  { key: "pending", label: STATUS_LABELS.pending },
  { key: "confirmed", label: STATUS_LABELS.confirmed },
  { key: "out", label: STATUS_LABELS.out },
  { key: "returned", label: STATUS_LABELS.returned },
  { key: "declined", label: STATUS_LABELS.declined },
  { key: "cancelled", label: STATUS_LABELS.cancelled },
];

function statusesFor(filter: Filter): ReservationStatus[] | undefined {
  // "Needs attention" is the default view: anything still live. A returned
  // hire is history; a pending one is someone waiting on a text.
  if (filter === "attention") return ["pending", "confirmed", "out"];
  if (filter === "all") return undefined;
  return [filter];
}

export default async function AdminHireBookingsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();

  const filter: Filter = FILTERS.some((f) => f.key === searchParams.filter)
    ? (searchParams.filter as Filter)
    : "attention";

  if (!supabase) {
    return (
      <div style={s.page}>
        <h1 style={s.h1}>Bookings</h1>
        <div style={s.empty}>The database isn&rsquo;t configured, so bookings can&rsquo;t load.</div>
      </div>
    );
  }

  await releaseExpiredHolds(supabase);

  const rows = await listAdminReservations(supabase, { statuses: statusesFor(filter) });
  const now = today();

  // Soonest-first is right for live hires, but for history the most recent
  // is the one being looked up.
  const ordered =
    filter === "attention" ? rows : [...rows].sort((a, b) => b.startsOn.localeCompare(a.startsOn));

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Bookings</h1>
      <p style={s.lede}>
        <Link href="/admin/hire" style={s.linkish}>
          ← Back to today
        </Link>
      </p>

      <div style={s.filterBar}>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/hire/bookings?filter=${f.key}`}
            style={s.filterChip(f.key === filter)}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {ordered.length === 0 ? (
        <div style={s.empty}>
          {filter === "attention"
            ? "Nothing needs attention. All caught up."
            : "No bookings match that filter yet."}
        </div>
      ) : (
        <div style={s.list}>
          {ordered.map((r) => (
            <BookingCard key={r.id} r={r} today={now} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One booking.
 *
 * Rendered as a card rather than a table row on purpose — the columns the
 * spec asks for (customer with phone and reference, equipment, collect,
 * return, charge, status, actions) don't fit a phone screen as a table, and
 * this console gets used in a ute. The same information, stacked.
 */
function BookingCard({ r, today: now }: { r: AdminReservation; today: string }) {
  const overdue = isOverdue(r.status, r.endsOn, now);

  return (
    <div
      style={{
        ...s.card,
        borderColor: overdue ? "#FCA5A5" : "#E5E7EB",
        background: overdue ? "#FEF2F2" : "white",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={s.rowTitle}>{r.customerName ?? "—"}</div>
          <div style={s.rowMeta}>
            {r.reference && <strong>{r.reference}</strong>}
            {r.customerPhone && (
              <>
                {r.reference ? " · " : ""}
                <a href={`tel:${r.customerPhone.replace(/\s+/g, "")}`} style={s.linkish}>
                  {r.customerPhone}
                </a>
              </>
            )}
          </div>
          {r.customerEmail && <div style={s.rowMeta}>{r.customerEmail}</div>}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {overdue && <OverduePill />}
          <HireStatusPill status={r.status} />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 10,
          margin: "14px 0",
          paddingTop: 12,
          borderTop: "1px solid #F3F4F6",
        }}
      >
        <Field label="Equipment" value={r.equipmentName} />
        <Field label="Collect" value={fmtHireDate(r.startsOn)} />
        <Field label="Return" value={fmtHireDate(r.endsOn)} />
        <Field
          label="Charge"
          value={`${fmtHireMoney(r.hireTotalCents)} + ${fmtHireMoney(r.bondTotalCents)} bond`}
        />
      </div>

      {r.jobNotes && (
        <p style={{ ...s.muted, margin: "0 0 12px", fontStyle: "italic" }}>
          &ldquo;{r.jobNotes}&rdquo;
        </p>
      )}

      <BookingActions reservationId={r.id} status={r.status} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ ...s.tileLabel, fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 14, color: "#111827", marginTop: 2 }}>{value}</div>
    </div>
  );
}

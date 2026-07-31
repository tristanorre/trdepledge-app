import Link from "next/link";

import BookingActions from "@/components/hire/BookingActions";
import { HireStatusPill, OverduePill } from "@/components/StatusPill";
import * as s from "@/components/hire/adminStyles";
import { fmtHireDate, fmtHireMoney, isOverdue, today } from "@/lib/hire";
import { loadAdminToday, releaseExpiredHolds, type AdminReservation } from "@/lib/hire/repo";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// The DIY Hire "Today" screen — what needs Thomas right now, not the whole
// diary. He opens this on his phone between jobs, so it's ordered by
// urgency and readable one-handed.
export default async function AdminHireTodayPage() {
  await requireAdmin();
  const supabase = getServiceClient();

  if (!supabase) {
    return (
      <div style={s.page}>
        <h1 style={s.h1}>DIY Hire</h1>
        <div style={s.empty}>The database isn&rsquo;t configured, so bookings can&rsquo;t load.</div>
      </div>
    );
  }

  // Sweep lapsed holds before reading, so a request that quietly expired
  // isn't still sitting in "needs answering" asking to be confirmed.
  await releaseExpiredHolds(supabase);

  const data = await loadAdminToday(supabase);
  const now = today();

  return (
    <div style={s.page}>
      <h1 style={s.h1}>DIY Hire</h1>
      <p style={s.lede}>{fmtHireDate(now)} — what needs you today.</p>

      <div style={s.tileGrid}>
        <Tile n={data.tiles.requestsToAnswer} label="Requests to answer" urgent />
        <Tile n={data.tiles.outOnHire} label="Out on hire" />
        <Tile n={data.tiles.dueBack} label="Due back" />
        <Tile n={data.tiles.onTheFloor} label="On the floor" />
      </div>

      <div style={{ ...s.filterBar, marginTop: 20 }}>
        <Link href="/admin/hire/bookings" style={s.filterChip(false)}>
          All bookings
        </Link>
        <Link href="/admin/hire/equipment" style={s.filterChip(false)}>
          Equipment
        </Link>
        <Link href="/admin/hire/availability" style={s.filterChip(false)}>
          Block dates
        </Link>
      </div>

      <h2 style={s.sectionHead}>Waiting on you</h2>
      {data.needsAnswer.length === 0 ? (
        <div style={s.empty}>Nothing waiting. All caught up.</div>
      ) : (
        <div style={s.list}>
          {data.needsAnswer.map((r) => (
            <BookingRow key={r.id} r={r} today={now} showActions />
          ))}
        </div>
      )}

      <h2 style={s.sectionHead}>Going out today</h2>
      {data.goingOut.length === 0 ? (
        <div style={s.empty}>Nothing due for collection today.</div>
      ) : (
        <div style={s.list}>
          {data.goingOut.map((r) => (
            <BookingRow key={r.id} r={r} today={now} showActions />
          ))}
        </div>
      )}

      <h2 style={s.sectionHead}>Coming back</h2>
      {data.comingBack.length === 0 ? (
        <div style={s.empty}>Nothing due back today.</div>
      ) : (
        <div style={s.list}>
          {data.comingBack.map((r) => (
            <BookingRow key={r.id} r={r} today={now} showActions />
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ n, label, urgent }: { n: number; label: string; urgent?: boolean }) {
  const highlight = urgent && n > 0;
  return (
    <div
      style={{
        ...s.tile,
        borderColor: highlight ? "#FCD34D" : "#E5E7EB",
        background: highlight ? "#FFFBEB" : "white",
      }}
    >
      <span style={s.tileNumber}>{n}</span>
      <span style={s.tileLabel}>{label}</span>
    </div>
  );
}

/**
 * One booking, as a row.
 *
 * Overdue returns are flagged red — the single thing on this screen Thomas
 * most needs to see at a glance.
 */
function BookingRow({
  r,
  today: now,
  showActions,
}: {
  r: AdminReservation;
  today: string;
  showActions?: boolean;
}) {
  const overdue = isOverdue(r.status, r.endsOn, now);
  return (
    <div
      style={{
        ...s.row,
        borderColor: overdue ? "#FCA5A5" : "#E5E7EB",
        background: overdue ? "#FEF2F2" : "white",
      }}
    >
      <div style={s.rowMain}>
        <div style={s.rowTitle}>
          {r.customerName ?? "—"}{" "}
          <span style={{ fontWeight: 500, color: "#6B7280" }}>· {r.equipmentName}</span>
        </div>
        <div style={s.rowMeta}>
          {fmtHireDate(r.startsOn)} → {fmtHireDate(r.endsOn)}
          {r.chargedDays != null && ` · ${r.chargedDays} day${r.chargedDays > 1 ? "s" : ""}`}
          {" · "}
          {fmtHireMoney(r.hireTotalCents + r.bondTotalCents)} at pickup
        </div>
        <div style={{ ...s.rowMeta, marginTop: 4 }}>
          {r.reference && <strong>{r.reference}</strong>}
          {r.customerPhone && (
            <>
              {" · "}
              <a href={`tel:${r.customerPhone.replace(/\s+/g, "")}`} style={s.linkish}>
                {r.customerPhone}
              </a>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {overdue && <OverduePill />}
        <HireStatusPill status={r.status} />
      </div>

      {showActions && <BookingActions reservationId={r.id} status={r.status} compact />}
    </div>
  );
}

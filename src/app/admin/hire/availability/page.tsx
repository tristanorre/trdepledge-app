import Link from "next/link";

import AvailabilityBoard, { type BoardEntry } from "@/components/hire/AvailabilityBoard";
import * as s from "@/components/hire/adminStyles";
import { addMonths, today } from "@/lib/hire";
import { listAllEquipment, listBlocks, listHolds, releaseExpiredHolds } from "@/lib/hire/repo";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Block dates out for Thomas's own jobs, servicing, or a tool lent to a mate.
//
// Unpublished gear is included: it's off the public floor but still his to
// schedule, and hiding it here would make a tool he's servicing invisible on
// the one screen about tools being unavailable.
export default async function AdminHireAvailabilityPage() {
  await requireAdmin();
  const supabase = getServiceClient();

  if (!supabase) {
    return (
      <div style={s.page}>
        <h1 style={s.h1}>Block dates</h1>
        <div style={s.empty}>The database isn&rsquo;t configured, so the calendar can&rsquo;t load.</div>
      </div>
    );
  }

  await releaseExpiredHolds(supabase);

  const from = today();
  const horizon = addMonths(from, 12);
  const equipment = await listAllEquipment(supabase);

  const entries: BoardEntry[] = await Promise.all(
    equipment.map(async (eq) => {
      const [holds, blocks] = await Promise.all([
        listHolds(supabase, eq.id, { from, to: horizon }),
        listBlocks(supabase, eq.id),
      ]);
      return {
        equipment: eq,
        holds,
        blocks: blocks.map((b) => ({
          id: b.id,
          startsOn: b.startsOn,
          endsOn: b.endsOn,
          reason: b.blockReason,
        })),
      };
    }),
  );

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Block dates</h1>
      <p style={s.lede}>
        <Link href="/admin/hire" style={s.linkish}>
          ← Back to today
        </Link>
      </p>

      <div style={{ ...s.card, background: "#F9FAFB", marginBottom: 20 }}>
        <p style={{ ...s.muted, margin: 0 }}>
          Blocked dates disappear from the public calendar straight away. Dates a customer already
          holds can&rsquo;t be blocked here — if you need a tool back off someone, give them a call.
        </p>
      </div>

      <AvailabilityBoard entries={entries} today={from} />
    </div>
  );
}

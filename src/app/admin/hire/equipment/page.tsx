import Link from "next/link";

import EquipmentManager from "@/components/hire/EquipmentManager";
import * as s from "@/components/hire/adminStyles";
import { listAllEquipment } from "@/lib/hire/repo";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// The hire floor: add, edit, publish and remove equipment.
export default async function AdminHireEquipmentPage() {
  await requireAdmin();
  const supabase = getServiceClient();

  if (!supabase) {
    return (
      <div style={s.page}>
        <h1 style={s.h1}>Equipment</h1>
        <div style={s.empty}>The database isn&rsquo;t configured, so equipment can&rsquo;t load.</div>
      </div>
    );
  }

  // Published and unpublished both — this is the management view, and an
  // unpublished tool is precisely the one Thomas is most likely to be here
  // to put back on the page.
  const equipment = await listAllEquipment(supabase);

  // The category datalist is built from what's actually in use, so it grows
  // as he adds gear rather than needing a code change.
  const categories = [...new Set(equipment.map((e) => e.category))].sort();

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Equipment</h1>
      <p style={s.lede}>
        <Link href="/admin/hire" style={s.linkish}>
          ← Back to today
        </Link>
      </p>

      <div style={{ ...s.card, background: "#F9FAFB", marginBottom: 18 }}>
        <p style={{ ...s.muted, margin: 0 }}>
          A tool with a request, a confirmed booking or a hire out can&rsquo;t be removed —
          unpublish it instead and it comes off the public page while existing bookings stand.
        </p>
      </div>

      <EquipmentManager equipment={equipment} categories={categories} />
    </div>
  );
}

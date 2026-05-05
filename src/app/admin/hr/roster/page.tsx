import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import RosterEditor from "@/components/RosterEditor";
import { mondayOfWeek, todayISO } from "@/lib/dates";
import type { WorkerListEntry } from "@/lib/types";
import type { RosterRow } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function AdminRosterPage({
  searchParams,
}: {
  searchParams: { week_start?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();

  const weekStart = mondayOfWeek(
    /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week_start ?? "") ? searchParams.week_start! : todayISO()
  );

  let workers: WorkerListEntry[] = [];
  let rows: RosterRow[] = [];

  if (supabase) {
    const [w, r] = await Promise.all([
      supabase.from("users").select("id, name, colour").eq("role", "worker").eq("active", true).order("name"),
      supabase.from("roster").select("id, worker_id, week_start, days, start_time, end_time").eq("week_start", weekStart),
    ]);
    workers = (w.data ?? []) as WorkerListEntry[];
    rows = (r.data ?? []) as RosterRow[];
  }

  return (
    <div>
      <Link href="/admin/hr" style={backLinkStyle}>← HR</Link>
      <h1 style={titleStyle}>Roster</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20 }}>
        Set working days and hours per worker. Approved leave automatically blocks roster slots.
      </p>

      <RosterEditor
        weekStart={weekStart}
        workers={workers}
        initialRows={rows}
      />
    </div>
  );
}

const backLinkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};

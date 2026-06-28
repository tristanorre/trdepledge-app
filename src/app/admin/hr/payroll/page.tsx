import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { mondayOfWeek, addDaysISO, todayISO, fmtWeekRange, weekDates } from "@/lib/dates";
import PayrollHoursEditor from "@/components/PayrollHoursEditor";

export const dynamic = "force-dynamic";

type Worker = { id: string; name: string };

// Payroll review screen. Source of truth: `worker_paid_hours` table —
// populated by the roster editor and overridable here. Clock-in/out
// time is NOT used for pay; it only affects what the client is
// charged via the cost engine.
export default async function PayrollPage({
  searchParams,
}: {
  searchParams: { week_start?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();

  const weekStart = mondayOfWeek(
    /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week_start ?? "") ? searchParams.week_start! : todayISO()
  );
  const dates = weekDates(weekStart);
  const weekEndISO = dates[6];

  let workers: Worker[] = [];
  let hoursLookup: Record<string, string> = {};

  if (supabase) {
    const [{ data: ws }, { data: hs }] = await Promise.all([
      supabase.from("users")
        .select("id, name")
        .or("role.eq.worker,field_worker.eq.true")
        .eq("active", true)
        .order("name"),
      supabase.from("worker_paid_hours")
        .select("worker_id, work_date, hours")
        .gte("work_date", dates[0])
        .lte("work_date", weekEndISO),
    ]);
    workers = (ws ?? []) as Worker[];
    const rawHours = (hs ?? []) as Array<{ worker_id: string; work_date: string; hours: number }>;
    for (const r of rawHours) {
      hoursLookup[`${r.worker_id}|${r.work_date}`] = String(r.hours);
    }
  }

  return (
    <div>
      <Link href="/admin/hr" style={backLinkStyle}>← HR</Link>
      <h1 style={titleStyle}>Payroll</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
        Paid hours per worker × day. Pre-filled from the <Link href={`/admin/hr/roster?week_start=${weekStart}`} style={{ color: "var(--navy)", fontWeight: 700 }}>Roster</Link> —
        override any cell here before exporting to Xero. Clock-in/out doesn&apos;t affect these numbers
        (it only drives what the client is charged).
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--navy)" }}>
          Week of {fmtWeekRange(weekStart)}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link href={`/admin/hr/payroll?week_start=${addDaysISO(weekStart, -7)}`} style={navBtn}>‹ Week</Link>
          <Link href={`/admin/hr/payroll?week_start=${addDaysISO(weekStart,  7)}`} style={navBtn}>Week ›</Link>
        </div>
      </div>

      <PayrollHoursEditor
        workers={workers}
        weekDates={dates}
        initialHours={hoursLookup}
      />

      <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <a
          href={`/api/admin/payroll?week_start=${weekStart}&format=csv`}
          style={primaryBtn}
        >
          ⬇ Export CSV
        </a>
        <button type="button" disabled style={comingSoonBtn} title="Direct Xero Payroll push needs employee linking — coming next">
          Push to Xero Payroll · soon
        </button>
      </div>

      <div style={{ marginTop: 16, padding: 12, background: "rgba(255, 229, 0, 0.16)", borderRadius: 10, fontSize: 12, color: "#5C4F00", lineHeight: 1.5 }}>
        <strong>Direct Xero Payroll push</strong> needs each worker mapped to their Xero employee record (TFN, super,
        leave types). The CSV is the bridge until that mapping is set up — paste it into Xero&apos;s Timesheet bulk-import.
      </div>
    </div>
  );
}

const backLinkStyle: React.CSSProperties = { fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block" };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)", lineHeight: 1.1, marginBottom: 4 };
const navBtn: React.CSSProperties = {
  background: "var(--off)", color: "var(--navy)",
  border: "none", borderRadius: 8,
  padding: "8px 12px", fontSize: 13, fontWeight: 700,
  minHeight: 36, display: "inline-flex", alignItems: "center",
};
const primaryBtn: React.CSSProperties = {
  background: "var(--navy)", color: "white",
  padding: "12px 20px", borderRadius: 10,
  fontSize: 14, fontWeight: 800,
  display: "inline-flex", alignItems: "center", gap: 6,
  textDecoration: "none", minHeight: 44,
};
const comingSoonBtn: React.CSSProperties = {
  background: "var(--off)", color: "var(--gray)",
  border: "none", borderRadius: 10,
  padding: "12px 20px", fontSize: 14, fontWeight: 700,
  cursor: "not-allowed", minHeight: 44,
};

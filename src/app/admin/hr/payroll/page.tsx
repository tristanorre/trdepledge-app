import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { mondayOfWeek, addDaysISO, todayISO, fmtWeekRange, fmtDayShort } from "@/lib/dates";
import { hoursFromTimeLog } from "@/lib/cost";
import type { Job } from "@/lib/types";

export const dynamic = "force-dynamic";

type WorkerRow = { id: string; name: string };

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
  const weekEnd = addDaysISO(weekStart, 6);

  let totals: Array<{ worker_id: string; name: string; hours: number; jobs: number }> = [];
  let workers: WorkerRow[] = [];
  let jobs: Job[] = [];

  if (supabase) {
    const [{ data: ws }, { data: js }] = await Promise.all([
      supabase.from("users").select("id, name").eq("role", "worker").eq("active", true).order("name"),
      supabase.from("jobs").select("*")
        .gte("date", weekStart).lte("date", weekEnd)
        .eq("status", "completed"),
    ]);
    workers = (ws ?? []) as WorkerRow[];
    jobs = (js ?? []) as Job[];

    const workerName = new Map(workers.map((w) => [w.id, w.name]));
    const map = new Map<string, { worker_id: string; name: string; hours: number; jobs: number }>();
    for (const j of jobs) {
      const h = hoursFromTimeLog(j.time_log as { start?: string; end?: string });
      if (h <= 0 || !j.date) continue;
      for (const wid of j.assigned_worker_ids ?? []) {
        const name = workerName.get(wid);
        if (!name) continue;
        const cur = map.get(wid) ?? { worker_id: wid, name, hours: 0, jobs: 0 };
        cur.hours = Math.round((cur.hours + h) * 1000) / 1000;
        cur.jobs += 1;
        map.set(wid, cur);
      }
    }
    totals = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <div>
      <Link href="/admin/hr" style={backLinkStyle}>← HR</Link>
      <h1 style={titleStyle}>Payroll</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20 }}>
        Hours from <strong>completed</strong> jobs only — clock in/out drives this. Export the CSV for Xero or your accountant&apos;s spreadsheet.
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

      {totals.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⏱</div>
          <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>No completed jobs this week.</div>
          <div style={{ color: "var(--gray)", fontSize: 14 }}>
            Hours appear once workers clock in and out on jobs scheduled in this date range.
          </div>
        </div>
      ) : (
        <>
          <h2 style={sectionHeader}>Totals</h2>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {totals.map((t) => (
              <li key={t.worker_id} style={totalRow}>
                <div>
                  <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: 15 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>
                    {t.jobs} job{t.jobs === 1 ? "" : "s"}
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--navy)" }}>
                  {t.hours.toFixed(2)}h
                </div>
              </li>
            ))}
          </ul>

          <h2 style={sectionHeader}>Detail</h2>
          <div style={{ background: "white", borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)", overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Worker</th>
                  <th style={th}>Date</th>
                  <th style={th}>Client</th>
                  <th style={{ ...th, textAlign: "right" }}>Hours</th>
                </tr>
              </thead>
              <tbody>
                {jobs.flatMap((j) => {
                  const h = hoursFromTimeLog(j.time_log as { start?: string; end?: string });
                  if (h <= 0 || !j.date) return [];
                  return (j.assigned_worker_ids ?? []).map((wid) => {
                    const name = workers.find((w) => w.id === wid)?.name;
                    if (!name) return null;
                    return (
                      <tr key={`${j.id}-${wid}`}>
                        <td style={td}>{name}</td>
                        <td style={td}>{fmtDayShort(j.date!)}</td>
                        <td style={td}>{j.client_name}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{h.toFixed(2)}</td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

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

      <div style={{ marginTop: 16, padding: 12, background: "rgba(255, 229, 0, 0.16)", borderRadius: 10, fontSize: 12, color: "#5C4F00" }}>
        <strong>Direct Xero Payroll push</strong> needs each worker mapped to their Xero employee record (incl. TFN, super, leave types). The CSV is the bridge until that mapping is set up — paste it into Xero&apos;s Timesheet bulk-import.
      </div>
    </div>
  );
}

const backLinkStyle: React.CSSProperties = { fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block" };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)", lineHeight: 1.1, marginBottom: 4 };
const sectionHeader: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--gray)", marginBottom: 10 };
const totalRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
  background: "white", borderRadius: 12, padding: 14,
  border: "1px solid rgba(0,0,0,0.06)",
};
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 480 };
const th: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase",
  color: "var(--gray)", padding: "12px 14px", textAlign: "left",
  borderBottom: "1px solid var(--gray-light)", background: "var(--off)",
};
const td: React.CSSProperties = { padding: "10px 14px", borderBottom: "1px solid var(--gray-light)", fontSize: 14 };
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
const emptyStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: 32,
  textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};

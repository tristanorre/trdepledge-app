import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { mondayOfWeek, addDaysISO, fmtDayShort } from "@/lib/dates";
import { hoursFromTimeLog } from "@/lib/cost";
import type { Job } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/payroll?week_start=YYYY-MM-DD&format=json|csv
//
// Compiles per-worker hours for a given week from completed jobs'
// time_log. The CSV format is admin-friendly: one row per (worker, day,
// job) so Thomas can paste it directly into Xero's payroll bulk-import
// or his accountant's spreadsheet.
export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const url = new URL(req.url);
  const reqWeek = url.searchParams.get("week_start") ?? "";
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reqWeek)) {
    return NextResponse.json({ error: "week_start (YYYY-MM-DD) required" }, { status: 400 });
  }
  const week_start = mondayOfWeek(reqWeek);
  const week_end = addDaysISO(week_start, 6);

  const [{ data: workers }, { data: jobs }] = await Promise.all([
    supabase.from("users").select("id, name").eq("role", "worker").eq("active", true).order("name"),
    supabase.from("jobs").select("*")
      .gte("date", week_start).lte("date", week_end)
      .eq("status", "completed"),
  ]);

  type Row = {
    worker_id: string;
    worker_name: string;
    date: string;
    job_id: string;
    client_name: string;
    hours: number;
  };
  const rows: Row[] = [];
  const workerName = new Map((workers ?? []).map((w) => [w.id, w.name]));

  for (const j of (jobs ?? []) as Job[]) {
    const hours = hoursFromTimeLog(j.time_log as { start?: string; end?: string });
    if (hours <= 0 || !j.date) continue;
    for (const wid of j.assigned_worker_ids ?? []) {
      const name = workerName.get(wid);
      if (!name) continue; // worker no longer active or removed
      rows.push({
        worker_id: wid,
        worker_name: name,
        date: j.date,
        job_id: j.id,
        client_name: j.client_name,
        hours: round3(hours),
      });
    }
  }

  if (format === "csv") {
    const header = ["Worker", "Date", "Day", "Client", "Job ref", "Hours"];
    const body = rows.map((r) => [
      r.worker_name,
      r.date,
      fmtDayShort(r.date),
      r.client_name,
      r.job_id.slice(0, 8),
      r.hours.toFixed(3),
    ]);
    const csv = [header, ...body].map(toCsvRow).join("\r\n") + "\r\n";
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payroll-${week_start}.csv"`,
      },
    });
  }

  // Default JSON: also pre-aggregate per-worker totals for the page UI.
  const totals = new Map<string, { name: string; hours: number; jobs: number }>();
  for (const r of rows) {
    const t = totals.get(r.worker_id) ?? { name: r.worker_name, hours: 0, jobs: 0 };
    t.hours = round3(t.hours + r.hours);
    t.jobs += 1;
    totals.set(r.worker_id, t);
  }
  return NextResponse.json({
    week_start,
    week_end,
    rows,
    totals: Array.from(totals.entries()).map(([worker_id, t]) => ({ worker_id, ...t })),
  });
}

function round3(n: number): number { return Math.round(n * 1000) / 1000; }

function toCsvRow(cells: Array<string | number>): string {
  return cells.map((c) => {
    const s = String(c);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

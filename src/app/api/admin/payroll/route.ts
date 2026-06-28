import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { mondayOfWeek, addDaysISO, fmtDayShort } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/payroll?week_start=YYYY-MM-DD&format=json|csv
//
// Returns Thomas's payroll figures for the week — sourced from
// `worker_paid_hours` (set on the Roster page, overridable on the
// Payroll page). Clock-in/out time is NOT used here; that data
// drives client invoicing only.
//
// CSV format is admin-friendly: one row per (worker, day) where the
// worker has hours > 0 for that day. Designed for paste into Xero's
// Timesheet bulk-import or an accountant's spreadsheet.
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

  const [{ data: workers }, { data: rawHours }] = await Promise.all([
    supabase.from("users").select("id, name").or("role.eq.worker,field_worker.eq.true").eq("active", true).order("name"),
    supabase.from("worker_paid_hours")
      .select("worker_id, work_date, hours, source")
      .gte("work_date", week_start)
      .lte("work_date", week_end)
      .gt("hours", 0)
      .order("work_date", { ascending: true }),
  ]);

  type Row = {
    worker_id: string;
    worker_name: string;
    work_date: string;
    hours: number;
    source: string;
  };
  const rows: Row[] = [];
  const workerName = new Map((workers ?? []).map((w) => [w.id, w.name]));

  for (const h of (rawHours ?? [])) {
    const name = workerName.get(h.worker_id);
    if (!name) continue; // worker no longer active or removed
    rows.push({
      worker_id: h.worker_id,
      worker_name: name,
      work_date: h.work_date,
      hours: Number(h.hours),
      source: h.source ?? "manual",
    });
  }

  if (format === "csv") {
    const header = ["Worker", "Date", "Day", "Hours", "Source"];
    const body = rows.map((r) => [
      r.worker_name,
      r.work_date,
      fmtDayShort(r.work_date),
      r.hours.toFixed(2),
      r.source,
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
  const totals = new Map<string, { name: string; hours: number; days: number }>();
  for (const r of rows) {
    const t = totals.get(r.worker_id) ?? { name: r.worker_name, hours: 0, days: 0 };
    t.hours = Math.round((t.hours + r.hours) * 100) / 100;
    t.days += 1;
    totals.set(r.worker_id, t);
  }
  return NextResponse.json({
    week_start,
    week_end,
    rows,
    totals: Array.from(totals.entries()).map(([worker_id, t]) => ({ worker_id, ...t })),
  });
}

function toCsvRow(cells: Array<string | number>): string {
  return cells.map((c) => {
    const s = String(c);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";

// PATCH /api/admin/paid-hours
//   Body: {
//     worker_id: uuid,
//     cells: Array<{ work_date: YYYY-MM-DD, hours: number }>
//   }
//
// Used by the payroll review screen for per-worker, per-week saves
// after Thomas tweaks daily hours. Each cell is either:
//   * hours > 0 → upsert with source='manual' (sticks across roster
//                  re-saves)
//   * hours = 0 → delete the row (regardless of source — Thomas is
//                  explicitly zeroing a day on the payroll screen,
//                  so erase it even if it was previously rostered)
//
// Per-cell granularity means the save call only touches the worker
// Thomas just edited, not the whole grid.
export async function PATCH(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { worker_id?: unknown; cells?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const worker_id = String(body.worker_id ?? "").trim();
  if (!worker_id) {
    return NextResponse.json({ error: "worker_id required" }, { status: 400 });
  }
  if (!Array.isArray(body.cells)) {
    return NextResponse.json({ error: "cells must be an array" }, { status: 400 });
  }

  type ParsedCell = { work_date: string; hours: number };
  const toUpsert: ParsedCell[] = [];
  const toDelete: string[] = [];

  for (const raw of body.cells) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const work_date = String(c.work_date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(work_date)) continue;
    const n = typeof c.hours === "number" ? c.hours : parseFloat(String(c.hours ?? ""));
    if (!Number.isFinite(n) || n <= 0) {
      toDelete.push(work_date);
      continue;
    }
    // Clamp to 24h to satisfy the CHECK constraint, and round to 2dp.
    toUpsert.push({
      work_date,
      hours: Math.min(24, Math.round(n * 100) / 100),
    });
  }

  if (toUpsert.length > 0) {
    const rows = toUpsert.map((c) => ({
      worker_id,
      work_date: c.work_date,
      hours: c.hours,
      source: "manual",
      updated_by: session.user.id,
    }));
    const { error } = await supabase
      .from("worker_paid_hours")
      .upsert(rows, { onConflict: "worker_id,work_date" });
    if (error) {
      console.error("[paid-hours PATCH upsert]", error);
      return NextResponse.json({ error: "Could not save hours" }, { status: 500 });
    }
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("worker_paid_hours")
      .delete()
      .eq("worker_id", worker_id)
      .in("work_date", toDelete);
    if (error) {
      console.error("[paid-hours PATCH delete]", error);
      return NextResponse.json({ error: "Could not clear hours" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

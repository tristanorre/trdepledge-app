import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { sendPush } from "@/lib/onesignal";

export const runtime = "nodejs";

// PATCH approve/decline a leave request.
//   Body: { status: "approved" | "declined" }
//
// On approval, increment the relevant leave_balances counter so the
// worker's remaining days reflect the time off. We use the request's
// from_date year as the bucket (a Dec→Jan straddle is rare for our
// team; if it happens we'd want to split — not handled here).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { status?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const status = body.status;
  if (status !== "approved" && status !== "declined") {
    return NextResponse.json({ error: "status must be 'approved' or 'declined'" }, { status: 400 });
  }

  const { data: request, error: readErr } = await supabase
    .from("leave_requests")
    .select("id, worker_id, type, from_date, to_date, status")
    .eq("id", params.id)
    .maybeSingle();

  if (readErr || !request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: "Request already actioned" }, { status: 409 });
  }

  const { error: updateErr } = await supabase
    .from("leave_requests")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.user.id,
    })
    .eq("id", params.id);

  if (updateErr) {
    console.error("[admin/leave PATCH]", updateErr);
    return NextResponse.json({ error: "Could not update" }, { status: 500 });
  }

  // Update the running tally on approval. Work-day counting (skip
  // weekends/public holidays) is more involved than we need here —
  // the simple inclusive day count is what the spec implies and
  // matches how small businesses usually run leave.
  if (status === "approved") {
    const days = daysBetweenInclusive(request.from_date, request.to_date);
    const year = new Date(request.from_date).getFullYear();
    const balanceCol =
      request.type === "Annual Leave"   ? "annual_used"
    : request.type === "Sick Leave"     ? "sick_used"
    : request.type === "Personal Leave" ? "personal_used"
    : null; // Unpaid leave doesn't draw down a counter

    if (balanceCol) {
      // Read-modify-write — race-free enough for a single admin
      // approving sequentially. If concurrency becomes a concern,
      // we'd push this into a server-side RPC.
      const { data: bal } = await supabase
        .from("leave_balances")
        .select(`id, ${balanceCol}`)
        .eq("worker_id", request.worker_id)
        .eq("year", year)
        .maybeSingle();

      if (bal) {
        const current = Number((bal as Record<string, unknown>)[balanceCol] ?? 0);
        await supabase
          .from("leave_balances")
          .update({ [balanceCol]: current + days })
          .eq("id", (bal as { id: string }).id);
      } else {
        // No balance row yet — create one with sensible defaults from
        // the spec, pre-applying the just-approved days.
        await supabase.from("leave_balances").insert({
          worker_id: request.worker_id,
          year,
          [balanceCol]: days,
        });
      }
    }
  }

  // Push the worker so they see the decision without polling the app.
  void sendPush({
    user_ids: [request.worker_id],
    title: status === "approved" ? "Leave approved" : "Leave declined",
    message: `${request.type} · ${request.from_date} → ${request.to_date}`,
    deep_link: "/worker/leave",
  }, supabase);

  return NextResponse.json({ ok: true });
}

function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

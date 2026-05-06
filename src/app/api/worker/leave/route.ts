import { NextResponse } from "next/server";
import { requireApiWorker, requireSupabase } from "@/lib/api-auth";
import { sendPush } from "@/lib/onesignal";
import { after } from "@/lib/after";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = ["Annual Leave", "Sick Leave", "Personal Leave", "Unpaid"] as const;

// GET — own leave requests + this year's balance.
export async function GET() {
  const auth = await requireApiWorker();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const year = new Date().getFullYear();

  const [{ data: requests }, { data: balance }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id, type, from_date, to_date, reason, status, submitted_at, reviewed_at")
      .eq("worker_id", session.user.id)
      .order("submitted_at", { ascending: false })
      .limit(50),
    supabase
      .from("leave_balances")
      .select("annual_total, annual_used, sick_total, sick_used, personal_total, personal_used")
      .eq("worker_id", session.user.id)
      .eq("year", year)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    requests: requests ?? [],
    balance: balance ?? {
      annual_total: 20, annual_used: 0,
      sick_total: 10, sick_used: 0,
      personal_total: 2, personal_used: 0,
    },
    year,
  });
}

// POST — submit a new leave request.
//   Body: { type, from_date, to_date, reason? }
export async function POST(req: Request) {
  const auth = await requireApiWorker();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { type?: unknown; from_date?: unknown; to_date?: unknown; reason?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const type = String(body.type ?? "");
  const from_date = String(body.from_date ?? "");
  const to_date = String(body.to_date ?? "");
  const reason = body.reason ? String(body.reason).trim() : null;

  if (!(TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "type invalid" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from_date) || !/^\d{4}-\d{2}-\d{2}$/.test(to_date)) {
    return NextResponse.json({ error: "from_date / to_date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (to_date < from_date) {
    return NextResponse.json({ error: "to_date must be on or after from_date" }, { status: 400 });
  }
  // Sanity bounds. Without these, a typo like "2105" instead of "2025"
  // sails through (string comparison says it's a valid range), and you
  // end up with a leave_requests row 80 years in the future that breaks
  // every yearly balance roll-up. Also block requests >12 months out
  // (anything legitimate that far ahead can be re-submitted closer to
  // the date) and any from_date in the past — workers can't request
  // backdated leave through the form; admins do that manually.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const horizon = new Date(today); horizon.setMonth(horizon.getMonth() + 12);
  const horizonISO = `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, "0")}-${String(horizon.getDate()).padStart(2, "0")}`;
  if (from_date < todayISO) {
    return NextResponse.json({ error: "from_date can't be in the past" }, { status: 400 });
  }
  if (to_date > horizonISO) {
    return NextResponse.json({ error: "to_date can't be more than 12 months from today" }, { status: 400 });
  }

  const { error } = await supabase.from("leave_requests").insert({
    worker_id: session.user.id,
    type,
    from_date,
    to_date,
    reason,
    status: "pending",
  });

  if (error) {
    console.error("[worker/leave POST]", error);
    return NextResponse.json({ error: "Could not submit" }, { status: 500 });
  }

  // Push to admins so Thomas sees a pending request without polling the app.
  // Registered via `after()` so a slow OneSignal response doesn't block
  // the worker's UI and a function-shutdown doesn't drop the push.
  after((async () => {
    const { data: admins } = await supabase
      .from("users")
      .select("id")
      .eq("role", "admin")
      .eq("active", true);
    const ids = (admins ?? []).map((a) => a.id);
    if (ids.length === 0) return;
    await sendPush({
      user_ids: ids,
      title: "Leave request submitted",
      message: `${session.user.name} · ${type} · ${from_date} → ${to_date}`,
      deep_link: "/admin/hr/leave",
    }, supabase);
  })());

  return NextResponse.json({ ok: true }, { status: 201 });
}

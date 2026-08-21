import { NextResponse } from "next/server";

import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { runAndReport } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  /api/admin/health   — last stored results (fast, no network)
// POST /api/admin/health   — re-run every probe now
//
// GET reads the stored table rather than re-probing so opening the page is
// instant and does not hammer four third-party APIs on every refresh. The
// daily cron is what keeps it current; POST is for "I just fixed
// something, tell me if it worked" — which is exactly the loop that was
// missing when the OneSignal key took three attempts to get right.

export async function GET() {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { data, error } = await supabase
    .from("health_checks")
    .select("key, status, detail, since, checked_at")
    .order("status", { ascending: true });  // 'fail' < 'ok' < 'warn' alphabetically; UI sorts properly

  if (error) {
    console.error("[admin/health GET]", error);
    return NextResponse.json({ error: "Could not load health" }, { status: 500 });
  }
  return NextResponse.json({ checks: data ?? [] });
}

export async function POST() {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  // notify:false — an admin watching the page is already aware. Pushing a
  // notification at someone who is looking at the answer is how monitors
  // become noise, and noisy monitors get muted.
  const results = await runAndReport(supabase, { notify: false });
  return NextResponse.json({ checks: results });
}

import { NextResponse } from "next/server";

import { releaseExpiredHolds } from "@/lib/hire/repo";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron entry point — releases pending hire requests whose 24 hours
// are up (schedule in vercel.json).
//
// The public page promises "your dates are held while Thomas confirms", so
// pending reservations genuinely occupy the calendar. Without this sweep,
// one abandoned form would hold a tool forever.
//
// Note this is a safety net rather than the only path: the booking endpoint
// also sweeps before it inserts, and the availability engine already ignores
// expired pendings when drawing a calendar. This exists so a tool that
// nobody tries to book still comes free on its own.
//
// NO cron_runs DEDUPE HERE, deliberately. The other crons send SMS and push,
// where a retry means a customer gets texted twice, so they claim a row
// first. This one runs a single idempotent UPDATE — running it again just
// matches zero rows. Adding a once-per-day claim would actively hurt: the
// sweep wants to run often, and a retry after a transient 5xx must not be
// swallowed.
//
// Auth: Vercel Cron sets `Authorization: Bearer <CRON_SECRET>`, compared
// against the env var so this can't be triggered from the open internet.
export async function GET(req: Request) {
  if (!isAuthorisedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  try {
    const released = await releaseExpiredHolds(supabase);
    if (released > 0) {
      console.info(`[cron hire-expiry] released ${released} expired pending request(s)`);
    }
    return NextResponse.json({ ok: true, released });
  } catch (err) {
    console.error("[cron hire-expiry] failed", err);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}

function isAuthorisedCron(req: Request): boolean {
  // Hard-fail if no secret is configured, matching the other crons — soft
  // failing to "any authorization header works" would leave this open.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET not set — refusing to run");
    return false;
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

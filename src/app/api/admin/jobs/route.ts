import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { sendPush } from "@/lib/onesignal";
import { after } from "@/lib/after";
import type { ClientType, JobStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUS: readonly JobStatus[] =
  ["scheduled", "in_progress", "completed", "cancelled", "pending_review"];
const VALID_CLIENT_TYPES: readonly ClientType[] = ["Private", "NDIS", "Aged Care"];

// GET /api/admin/jobs
//   ?status=...     one of VALID_STATUS
//   ?type=...       one of VALID_CLIENT_TYPES
//   ?date=YYYY-MM-DD  exact date
//   ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD  range
//   ?worker=<uuid>  job has this worker in assigned_worker_ids
//   ?limit=N        default 100, max 500
export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const date = url.searchParams.get("date");
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");
  const worker = url.searchParams.get("worker");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  let q = supabase
    .from("jobs")
    .select("*")
    .order("date", { ascending: true, nullsFirst: false })
    .order("scheduled_time", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (status && (VALID_STATUS as readonly string[]).includes(status)) q = q.eq("status", status);
  if (type && (VALID_CLIENT_TYPES as readonly string[]).includes(type)) q = q.eq("client_type", type);
  if (date) q = q.eq("date", date);
  if (dateFrom) q = q.gte("date", dateFrom);
  if (dateTo) q = q.lte("date", dateTo);
  if (worker) q = q.contains("assigned_worker_ids", [worker]);

  const { data, error } = await q;
  if (error) {
    console.error("[admin/jobs GET]", error);
    return NextResponse.json({ error: "Could not load jobs" }, { status: 500 });
  }
  return NextResponse.json({ jobs: data ?? [] });
}

// POST /api/admin/jobs — create a job.
export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const clientName = String(body.client_name ?? "").trim();
  const clientType = String(body.client_type ?? "");
  if (!clientName) return NextResponse.json({ error: "client_name is required" }, { status: 400 });
  if (!(VALID_CLIENT_TYPES as readonly string[]).includes(clientType)) {
    return NextResponse.json({ error: "client_type must be Private | NDIS | Aged Care" }, { status: 400 });
  }

  const insert = {
    client_id: body.client_id ? String(body.client_id) : null,
    client_name: clientName,
    client_type: clientType as ClientType,
    address: body.address ? String(body.address).trim() : null,
    suburb: body.suburb ? String(body.suburb).trim() : null,
    postcode: body.postcode ? String(body.postcode).trim() : null,
    date: body.date ? String(body.date) : null,
    scheduled_time: body.scheduled_time ? String(body.scheduled_time) : null,
    description: body.description ? String(body.description).trim() : null,
    status: (VALID_STATUS as readonly string[]).includes(String(body.status))
      ? (body.status as JobStatus)
      : "scheduled",
    assigned_worker_ids: Array.isArray(body.assigned_worker_ids)
      ? body.assigned_worker_ids.filter((v) => typeof v === "string")
      : [],
  };

  const { data, error } = await supabase
    .from("jobs")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    console.error("[admin/jobs POST]", error);
    return NextResponse.json({ error: "Could not create job" }, { status: 500 });
  }

  // Push to assigned workers — registered via `after()` so the
  // serverless function instance keeps running long enough for the
  // OneSignal call to complete after we've returned 201.
  if (insert.assigned_worker_ids.length > 0) {
    after(sendPush({
      user_ids: insert.assigned_worker_ids as string[],
      title: "New job assigned",
      message: `${data.client_name}${data.suburb ? ` · ${data.suburb}` : ""}${data.scheduled_time ? ` · ${data.scheduled_time.slice(0, 5)}` : ""}`,
      deep_link: `/worker/jobs/${data.id}`,
    }, supabase));
  }

  return NextResponse.json({ job: data }, { status: 201 });
}

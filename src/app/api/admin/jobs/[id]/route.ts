import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { sendPush } from "@/lib/onesignal";
import { after as runAfter } from "@/lib/after";
import type { ClientType, JobStatus } from "@/lib/types";
import { rollForwardRecurringJob, justCompleted } from "@/lib/recurring-jobs";

export const runtime = "nodejs";

const VALID_STATUS: readonly JobStatus[] =
  ["scheduled", "in_progress", "completed", "cancelled", "pending_review"];
const VALID_CLIENT_TYPES: readonly ClientType[] = ["Private", "NDIS", "Aged Care"];

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    console.error("[admin/jobs/:id GET]", error);
    return NextResponse.json({ error: "Could not load job" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job: data });
}

// PATCH — partial update. Only listed fields can change here; notes go
// through the dedicated /notes endpoint to keep history intact.
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};

  if ("client_name" in body) patch.client_name = String(body.client_name ?? "").trim();
  if ("client_type" in body) {
    if (!(VALID_CLIENT_TYPES as readonly string[]).includes(String(body.client_type))) {
      return NextResponse.json({ error: "client_type invalid" }, { status: 400 });
    }
    patch.client_type = body.client_type;
  }
  if ("address" in body) patch.address = body.address ? String(body.address).trim() : null;
  if ("suburb" in body) patch.suburb = body.suburb ? String(body.suburb).trim() : null;
  if ("postcode" in body) patch.postcode = body.postcode ? String(body.postcode).trim() : null;
  if ("date" in body) patch.date = body.date ? String(body.date) : null;
  if ("scheduled_time" in body) patch.scheduled_time = body.scheduled_time ? String(body.scheduled_time) : null;
  if ("description" in body) patch.description = body.description ? String(body.description).trim() : null;
  if ("status" in body) {
    if (!(VALID_STATUS as readonly string[]).includes(String(body.status))) {
      return NextResponse.json({ error: "status invalid" }, { status: 400 });
    }
    patch.status = body.status;
  }
  if ("assigned_worker_ids" in body) {
    if (!Array.isArray(body.assigned_worker_ids)) {
      return NextResponse.json({ error: "assigned_worker_ids must be array" }, { status: 400 });
    }
    patch.assigned_worker_ids = body.assigned_worker_ids.filter((v) => typeof v === "string");
  }
  if ("waiting_time_minutes" in body) {
    const n = Number(body.waiting_time_minutes);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "waiting_time_minutes invalid" }, { status: 400 });
    }
    patch.waiting_time_minutes = Math.round(n);
  }
  if ("invoice_sent" in body) patch.invoice_sent = Boolean(body.invoice_sent);
  if ("xero_invoice_id" in body) patch.xero_invoice_id = body.xero_invoice_id ? String(body.xero_invoice_id) : null;

  // Quote estimate fields (migration 0022). Validate both — DB check
  // constraint also rejects non-positive values, but failing fast in
  // the API gives a friendlier error.
  if ("quote_hours_per_worker" in body) {
    const raw = body.quote_hours_per_worker;
    if (raw == null || raw === "") {
      patch.quote_hours_per_worker = null;
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: "quote_hours_per_worker must be > 0" }, { status: 400 });
      }
      patch.quote_hours_per_worker = n;
    }
  }
  if ("quote_worker_count" in body) {
    const raw = body.quote_worker_count;
    if (raw == null || raw === "") {
      patch.quote_worker_count = null;
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        return NextResponse.json({ error: "quote_worker_count must be a positive integer" }, { status: 400 });
      }
      patch.quote_worker_count = n;
    }
  }
  if ("xero_quote_id" in body) patch.xero_quote_id = body.xero_quote_id ? String(body.xero_quote_id) : null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Read previous state for assignment diff (so we only push to
  // newly-added workers, not everyone on the job again) and status
  // transition detection (to fire the recurring-client roll-forward
  // when this PATCH is the one that flipped the job to completed).
  const { data: prev } = await supabase
    .from("jobs")
    .select("assigned_worker_ids, scheduled_time, date, status")
    .eq("id", params.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("jobs")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    console.error("[admin/jobs/:id PATCH]", error);
    return NextResponse.json({ error: "Could not update job" }, { status: 500 });
  }

  if (prev && Array.isArray(patch.assigned_worker_ids)) {
    const before = new Set<string>(prev.assigned_worker_ids ?? []);
    const added = (patch.assigned_worker_ids as string[]).filter((id) => !before.has(id));
    if (added.length > 0) {
      runAfter(sendPush({
        user_ids: added,
        title: "New job assigned",
        message: `${data.client_name}${data.suburb ? ` · ${data.suburb}` : ""}${data.scheduled_time ? ` · ${String(data.scheduled_time).slice(0, 5)}` : ""}`,
        deep_link: `/worker/jobs/${data.id}`,
      }, supabase));
    }
  }

  // Notify when scheduled time/date moves and there are workers on it.
  const timeChanged = prev && (
    ("date" in patch && patch.date !== prev.date) ||
    ("scheduled_time" in patch && patch.scheduled_time !== prev.scheduled_time)
  );
  if (timeChanged && Array.isArray(data.assigned_worker_ids) && data.assigned_worker_ids.length > 0) {
    runAfter(sendPush({
      user_ids: data.assigned_worker_ids,
      title: "Job time updated",
      message: `${data.client_name} · ${data.date ?? "no date"}${data.scheduled_time ? ` · ${String(data.scheduled_time).slice(0, 5)}` : ""}`,
      deep_link: `/worker/jobs/${data.id}`,
    }, supabase));
  }

  // Recurring-client roll-forward: when Thomas flips a recurring
  // client's job to "completed" via the Edit form, queue the next
  // visit at the next cadence. Best-effort — never blocks the PATCH.
  if (prev && justCompleted(prev.status, data.status)) {
    await rollForwardRecurringJob(supabase, params.id);
  }

  // Bust the App Router cache so the next visit to the detail page or
  // jobs list shows the updated data instead of the cached RSC payload.
  revalidatePath(`/admin/jobs/${params.id}`);
  revalidatePath("/admin/jobs");

  return NextResponse.json({ job: data });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { error } = await supabase
    .from("jobs")
    .delete()
    .eq("id", params.id);

  if (error) {
    console.error("[admin/jobs/:id DELETE]", error);
    return NextResponse.json({ error: "Could not delete job" }, { status: 500 });
  }
  revalidatePath("/admin/jobs");
  return NextResponse.json({ ok: true });
}

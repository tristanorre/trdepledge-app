import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO } from "@/lib/dates";

// Shared shape — just the fields needed to roll a client forward into
// a scheduled job. Both POST and PATCH client handlers pass this in.
type ClientLite = {
  id: string;
  name: string;
  type: "Private" | "NDIS" | "Aged Care" | "Commercial";
  address: string | null;
  suburb: string | null;
  postcode: string | null;
  service_frequency_days: number | null;
  next_service_due: string | null;
};

// Auto-create a scheduled job for a recurring client when Thomas
// sets a "next service due" date on the client page. Idempotent:
// if a job already exists for this client + date, returns the
// existing job's id instead of creating a duplicate. Safe to call
// after every client save — it no-ops when the client isn't
// recurring or doesn't have a date set.
//
// Notes on the mapping:
//   * `jobs.client_type` only accepts Private / NDIS / Aged Care
//     (see migration 0003). Commercial clients fall back to Private
//     so the constraint isn't violated; Thomas can fix the job type
//     in the edit form if needed.
//   * `assigned_worker_ids` is left empty — Thomas allocates workers
//     after the job appears on the schedule.
//   * `scheduled_time` is left null. Thomas sets a time in the edit
//     form once he knows when the crew can attend.
export async function ensureRecurringJobForClient(
  supabase: SupabaseClient,
  client: ClientLite,
): Promise<{ created: boolean; jobId: string | null }> {
  if (!client.next_service_due || !client.service_frequency_days) {
    return { created: false, jobId: null };
  }

  // De-dupe: same client + same date = same job, never create a
  // second one. Status filter excludes cancelled jobs so a previously
  // cancelled visit doesn't block the next one.
  const { data: existing, error: lookupErr } = await supabase
    .from("jobs")
    .select("id")
    .eq("client_id", client.id)
    .eq("date", client.next_service_due)
    .neq("status", "cancelled")
    .limit(1);

  if (lookupErr) {
    console.error("[recurring-jobs] lookup", lookupErr);
    return { created: false, jobId: null };
  }
  if (existing && existing.length > 0) {
    return { created: false, jobId: existing[0].id };
  }

  // jobs.client_type doesn't allow Commercial — fall back to Private.
  const jobType = client.type === "Commercial" ? "Private" : client.type;

  const description =
    `Recurring service (every ${client.service_frequency_days} day${client.service_frequency_days === 1 ? "" : "s"})`;

  const { data: created, error: insertErr } = await supabase
    .from("jobs")
    .insert({
      client_id: client.id,
      client_name: client.name,
      client_type: jobType,
      address: client.address,
      suburb: client.suburb,
      postcode: client.postcode,
      date: client.next_service_due,
      description,
      status: "scheduled",
      assigned_worker_ids: [],
    })
    .select("id")
    .single();

  if (insertErr || !created) {
    console.error("[recurring-jobs] insert", insertErr);
    return { created: false, jobId: null };
  }

  return { created: true, jobId: created.id };
}

// ── Roll-forward on completion ──────────────────────────────────────
//
// When a recurring client's job is marked completed, this helper:
//   1. Advances clients.next_service_due to (just-completed date +
//      service_frequency_days). Skips if the client is no longer
//      flagged recurring (Thomas may have ended the arrangement).
//   2. Creates the next scheduled job at that new date, COPYING the
//      previous job's assigned_worker_ids, scheduled_time, and
//      description so the same crew rolls forward at the same time
//      of day. Thomas can still tweak before the visit lands.
//
// Idempotent: if a non-cancelled job already exists for the client at
// the new date, returns its id without creating a duplicate. Safe to
// call from every code path that can flip a job to completed (worker
// clock-out, admin time edit, admin status PATCH).
//
// Best-effort: logs and returns on error rather than throwing — never
// blocks the calling completion flow.
export async function rollForwardRecurringJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ rolled: boolean; nextJobId: string | null; nextDate: string | null }> {
  try {
    // Pull the just-completed job plus its client in one read.
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select(`
        id, client_id, date, scheduled_time, description, assigned_worker_ids,
        client:client_id ( id, name, type, address, suburb, postcode,
                           service_frequency_days, next_service_due )
      `)
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr || !job) {
      if (jobErr) console.error("[recurring-jobs] roll-forward read", jobErr);
      return { rolled: false, nextJobId: null, nextDate: null };
    }
    if (!job.client_id || !job.date) {
      return { rolled: false, nextJobId: null, nextDate: null };
    }

    // Supabase typings return joined rows as either a single object or
    // array; treat defensively.
    const clientRaw = (Array.isArray((job as { client: unknown }).client)
      ? ((job as unknown as { client: unknown[] }).client[0])
      : (job as unknown as { client: unknown }).client) as ClientLite | null;
    if (!clientRaw?.service_frequency_days) {
      // Not a recurring client (Thomas may have cleared the frequency
      // mid-cycle). Nothing to do.
      return { rolled: false, nextJobId: null, nextDate: null };
    }

    const nextDate = addDaysISO(job.date, clientRaw.service_frequency_days);

    // Always bump next_service_due forward, even if the new job is a
    // dupe (won't get inserted) — keeps the client row's "next due"
    // hint accurate for the schedule view.
    const { error: clientErr } = await supabase
      .from("clients")
      .update({ next_service_due: nextDate })
      .eq("id", clientRaw.id);
    if (clientErr) {
      console.error("[recurring-jobs] update client next_due", clientErr);
      // Continue anyway — the next-job insert is what really matters.
    }

    // De-dupe: same client + same date + non-cancelled = already there.
    const { data: existing } = await supabase
      .from("jobs")
      .select("id")
      .eq("client_id", clientRaw.id)
      .eq("date", nextDate)
      .neq("status", "cancelled")
      .limit(1);
    if (existing && existing.length > 0) {
      return { rolled: false, nextJobId: existing[0].id, nextDate };
    }

    // jobs.client_type only allows Private/NDIS/Aged Care (constraint
    // from migration 0003). Commercial clients fall back to Private,
    // matching ensureRecurringJobForClient() above.
    const jobType = clientRaw.type === "Commercial" ? "Private" : clientRaw.type;

    const description = job.description
      ?? `Recurring service (every ${clientRaw.service_frequency_days} day${clientRaw.service_frequency_days === 1 ? "" : "s"})`;

    const { data: created, error: insertErr } = await supabase
      .from("jobs")
      .insert({
        client_id: clientRaw.id,
        client_name: clientRaw.name,
        client_type: jobType,
        // Use the LATEST client address/suburb so address changes
        // since the last visit are picked up automatically.
        address: clientRaw.address,
        suburb: clientRaw.suburb,
        postcode: clientRaw.postcode,
        date: nextDate,
        // Copy the previous visit's time slot — same crew tends to
        // run the same time of day; Thomas can shift it later.
        scheduled_time: job.scheduled_time ?? null,
        description,
        status: "scheduled",
        // Same workers carry forward. If Thomas removed a worker
        // from the team since, the array still references them by
        // uuid and the assignment shows as "unknown worker" until
        // he edits — preferable to silently dropping the slot.
        assigned_worker_ids: Array.isArray(job.assigned_worker_ids)
          ? job.assigned_worker_ids
          : [],
      })
      .select("id")
      .single();

    if (insertErr || !created) {
      console.error("[recurring-jobs] roll-forward insert", insertErr);
      return { rolled: false, nextJobId: null, nextDate };
    }
    return { rolled: true, nextJobId: created.id, nextDate };
  } catch (err) {
    console.error("[recurring-jobs] roll-forward failed", err);
    return { rolled: false, nextJobId: null, nextDate: null };
  }
}

// Helper: was a job JUST completed by this update? Pattern used by
// every completion path (worker clock-out, admin time edit, admin
// status PATCH) to decide whether to call rollForwardRecurringJob.
//
// Returns true when prevStatus !== 'completed' AND nextStatus ===
// 'completed' — i.e. this very transition is the completion.
export function justCompleted(prevStatus: string | undefined, nextStatus: string | undefined): boolean {
  return prevStatus !== "completed" && nextStatus === "completed";
}

import type { SupabaseClient } from "@supabase/supabase-js";

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

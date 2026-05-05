import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import type { ClientType, JobNote } from "@/lib/types";

export const runtime = "nodejs";

// One-tap convert: turn an enquiry into a draft job and mark the
// enquiry converted. The job lands as `pending_review` with whatever
// fields we can pre-fill; admin then opens the edit form to add date,
// time, address, and worker assignments.
//
// We don't yet auto-create a `clients` row — that comes when Xero contact
// sync ships in Slice 7. For now the job carries denormalised name+type.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  // Fetch the enquiry. Reject if already converted — caller should
  // re-open the existing job rather than create a duplicate.
  const { data: enquiry, error: readErr } = await supabase
    .from("enquiries")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (readErr) {
    console.error("[enquiries convert] read", readErr);
    return NextResponse.json({ error: "Could not load enquiry" }, { status: 500 });
  }
  if (!enquiry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (enquiry.status === "converted" && enquiry.converted_to_job_id) {
    return NextResponse.json({
      error: "Enquiry already converted",
      converted_to_job_id: enquiry.converted_to_job_id,
    }, { status: 409 });
  }

  // Map enquiry.client_type ("Private Client" / "NDIS Participant" / ...)
  // to the job's stricter client_type union.
  const clientType: ClientType =
    /ndis/i.test(enquiry.client_type ?? "") ? "NDIS"
    : /aged/i.test(enquiry.client_type ?? "") ? "Aged Care"
    : "Private";

  const description = [enquiry.service_type, enquiry.message]
    .filter(Boolean).join(" — ") || null;

  const conversionNote: JobNote = {
    author_id: session.user.id,
    author_name: session.user.name,
    text: `Converted from website enquiry (${enquiry.email}${enquiry.phone ? `, ${enquiry.phone}` : ""}).`,
    timestamp: new Date().toISOString(),
  };

  const { data: job, error: insertErr } = await supabase
    .from("jobs")
    .insert({
      client_name: `${enquiry.first_name} ${enquiry.last_name}`.trim(),
      client_type: clientType,
      suburb: enquiry.suburb,
      description,
      status: "pending_review",
      assigned_worker_ids: [],
      notes: [conversionNote],
    })
    .select("id")
    .single();

  if (insertErr || !job) {
    console.error("[enquiries convert] insert", insertErr);
    return NextResponse.json({ error: "Could not create job" }, { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from("enquiries")
    .update({
      status: "converted",
      converted_to_job_id: job.id,
    })
    .eq("id", params.id);

  if (updateErr) {
    // Job is already created; surface a warning but don't fail the flow.
    console.error("[enquiries convert] mark-converted", updateErr);
  }

  return NextResponse.json({ ok: true, job_id: job.id }, { status: 201 });
}

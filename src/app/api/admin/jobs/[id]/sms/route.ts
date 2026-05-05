import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { sendSms, normaliseAuPhone } from "@/lib/twilio";
import { sms, type ManualTemplateKey } from "@/lib/sms-templates";

export const runtime = "nodejs";

// POST /api/admin/jobs/[id]/sms
//   Body: { template: "onOurWay" | "jobComplete" | "quoteFollowUp" | "ndisAgreement" | "custom", custom_message?: string }
//
// Looks up the job's client phone, renders the template, fires Twilio,
// records the result in sms_log (the helper does that for us).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { template?: unknown; custom_message?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const template = String(body.template ?? "") as ManualTemplateKey;
  if (!["onOurWay", "jobComplete", "quoteFollowUp", "ndisAgreement", "custom"].includes(template)) {
    return NextResponse.json({ error: "Unknown template" }, { status: 400 });
  }

  // We need: client name + phone. Phone comes from clients table if linked,
  // or as a fallback from the job's notes (not standard) — for now we
  // require a linked client OR a phone passed in via custom_phone, but
  // the spec contract says "client SMS" so a linked client is the path.
  // Until clients table is populated by Slice 7+ work, look up enquiry
  // by client name as a best-effort fallback.
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, client_id, client_name, client_type")
    .eq("id", params.id)
    .maybeSingle();

  if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  let phone: string | null = null;
  let clientName: string = job.client_name;

  if (job.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("phone, name")
      .eq("id", job.client_id)
      .maybeSingle();
    if (client?.phone) phone = client.phone;
    if (client?.name) clientName = client.name;
  }

  // Fallback: most jobs created via enquiry conversion don't have a
  // clients row yet — pull the phone from the matching enquiry by name.
  if (!phone) {
    const { data: enq } = await supabase
      .from("enquiries")
      .select("phone, first_name, last_name")
      .ilike("first_name", clientName.split(" ")[0] ?? "")
      .ilike("last_name", clientName.split(" ").slice(1).join(" ") || "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (enq?.phone) {
      phone = enq.phone;
      clientName = `${enq.first_name} ${enq.last_name}`.trim();
    }
  }

  if (!phone) {
    return NextResponse.json({
      error: "No client phone on file — link this job to a client record with a phone number first.",
    }, { status: 400 });
  }

  const firstName = clientName.split(" ")[0] || "there";

  const message = template === "custom"
    ? String(body.custom_message ?? "").trim()
    : sms[template](firstName);

  if (!message) return NextResponse.json({ error: "Empty message" }, { status: 400 });
  if (message.length > 1500) return NextResponse.json({ error: "Message too long" }, { status: 400 });

  const result = await sendSms(
    normaliseAuPhone(phone),
    message,
    {
      trigger_type: "manual",
      recipient_name: clientName,
      job_id: job.id,
      client_id: job.client_id ?? null,
    },
    supabase,
  );

  return NextResponse.json({
    ok: !!result.sid,
    delivery_status: result.delivery_status,
    sid: result.sid,
    message,
  });
}

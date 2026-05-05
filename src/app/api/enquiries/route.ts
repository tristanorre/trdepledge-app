import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { sendSms, normaliseAuPhone } from "@/lib/twilio";
import { sendPush } from "@/lib/onesignal";
import { sms } from "@/lib/sms-templates";

export const runtime = "nodejs";

const REQUIRED_FIELDS = [
  "first_name", "last_name", "email", "suburb", "service_type",
] as const;

type Payload = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  suburb: string;
  service_type: string;
  client_type?: string;
  message?: string;
};

export async function POST(req: Request) {
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  const data: Payload = {
    first_name:   String(body.first_name ?? "").trim(),
    last_name:    String(body.last_name  ?? "").trim(),
    email:        String(body.email      ?? "").trim().toLowerCase(),
    phone:        String(body.phone      ?? "").trim() || undefined,
    suburb:       String(body.suburb     ?? "").trim(),
    service_type: String(body.service_type ?? "").trim(),
    client_type:  String(body.client_type  ?? "").trim() || undefined,
    message:      String(body.message ?? "").trim() || undefined,
  };

  for (const f of REQUIRED_FIELDS) {
    if (!data[f]) {
      return NextResponse.json({ error: `Missing field: ${f}` }, { status: 400 });
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const supabase = getServiceClient();

  if (!supabase) {
    console.warn(
      "[enquiries] Supabase not configured — enquiry accepted but not persisted:",
      JSON.stringify({ ...data, message: data.message?.slice(0, 200) })
    );
    return NextResponse.json({ ok: true, persisted: false });
  }

  const { data: inserted, error } = await supabase
    .from("enquiries")
    .insert({
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone ?? null,
      suburb: data.suburb,
      service_type: data.service_type,
      client_type: data.client_type ?? null,
      message: data.message ?? null,
      status: "new",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[enquiries] Supabase insert failed:", error);
    return NextResponse.json({ error: "Could not save enquiry" }, { status: 500 });
  }

  // Fire-and-forget side effects. Each helper is graceful: missing
  // credentials log a warning and become a no-op. We don't await
  // serially — concurrent dispatch shaves latency on the user's POST.
  const sideEffects: Promise<unknown>[] = [];

  // 1) Auto-reply SMS to the client (only if they gave us a phone).
  if (data.phone) {
    const message = sms.enquiryReceived(data.first_name);
    sideEffects.push(
      sendSms(
        normaliseAuPhone(data.phone),
        message,
        {
          trigger_type: "auto",
          recipient_name: `${data.first_name} ${data.last_name}`.trim(),
        },
        supabase,
      ).then(async (result) => {
        if (result.sid) {
          await supabase
            .from("enquiries")
            .update({ sms_sent: true, sms_sent_at: new Date().toISOString() })
            .eq("id", inserted.id);
        }
      })
    );
  }

  // 2) Push to admins ("New enquiry from … — service — suburb").
  sideEffects.push((async () => {
    const { data: admins } = await supabase
      .from("users")
      .select("id")
      .eq("role", "admin")
      .eq("active", true);
    const adminIds = (admins ?? []).map((u) => u.id);
    if (adminIds.length === 0) return;
    await sendPush(
      {
        user_ids: adminIds,
        title: "New website enquiry",
        message: `${data.first_name} ${data.last_name} · ${data.service_type} · ${data.suburb}`,
        deep_link: `/admin/enquiries/${inserted.id}`,
      },
      supabase,
    );
  })());

  await Promise.allSettled(sideEffects);

  return NextResponse.json({ ok: true, persisted: true, id: inserted.id });
}

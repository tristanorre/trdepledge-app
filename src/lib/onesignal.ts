import type { SupabaseClient } from "@supabase/supabase-js";
import { onesignalConfigured } from "@/lib/integrations";

// Server-side OneSignal push sender. We address users by their internal
// user UUID via OneSignal's "external_user_id" alias — set on the client
// when a worker logs in (see OneSignalRegister.tsx). This keeps player
// IDs out of our database and survives device changes for the same user.

const ONESIGNAL_API = "https://onesignal.com/api/v1/notifications";

type Payload = {
  user_ids: string[];   // app user UUIDs (mapped to external_user_id)
  title: string;
  message: string;
  deep_link?: string;
};

export async function sendPush(
  payload: Payload,
  supabase: SupabaseClient | null,
): Promise<{ ok: boolean; recipients?: number; reason?: string }> {
  // Always record the notification in our own table so Thomas can see
  // history even if OneSignal itself is offline. The DB row is the
  // app's own "you got told this", regardless of delivery success.
  if (supabase && payload.user_ids.length > 0) {
    const rows = payload.user_ids.map((uid) => ({
      user_id: uid,
      title: payload.title,
      message: payload.message,
      deep_link: payload.deep_link ?? null,
    }));
    await supabase.from("notifications").insert(rows).then(({ error }) => {
      if (error) console.error("[onesignal] notifications insert", error);
    });
  }

  if (!onesignalConfigured()) {
    console.warn("[onesignal] not configured — skipping push to", payload.user_ids);
    return { ok: false, reason: "not_configured" };
  }
  if (payload.user_ids.length === 0) {
    return { ok: true, recipients: 0 };
  }

  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY!;

  const body: Record<string, unknown> = {
    app_id: appId,
    include_external_user_ids: payload.user_ids,
    headings: { en: payload.title },
    contents: { en: payload.message },
  };
  if (payload.deep_link) body.url = payload.deep_link;

  try {
    const res = await fetch(ONESIGNAL_API, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${apiKey}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[onesignal] send failed", { status: res.status, data });
      return { ok: false, reason: `error_${res.status}` };
    }
    return { ok: true, recipients: typeof data.recipients === "number" ? data.recipients : undefined };
  } catch (err) {
    console.error("[onesignal] network error", err);
    return { ok: false, reason: "network_error" };
  }
}

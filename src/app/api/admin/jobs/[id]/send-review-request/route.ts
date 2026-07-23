import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { sendReviewRequestForJob } from "@/lib/reviews";

export const runtime = "nodejs";

// Manual send / resend. Used by the "Send review request" button on
// the admin job detail. Auto-send fires on every status transition to
// 'completed'; this endpoint lets Thomas trigger one-offs (client
// deleted the SMS, missed the email, etc.).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const result = await sendReviewRequestForJob(supabase, params.id);
  if (!result.ok) {
    const status =
      result.reason === "no_contact" ? 409 :
      result.reason === "already_responded" ? 409 :
      500;
    return NextResponse.json({ error: reasonMessage(result.reason) }, { status });
  }

  revalidatePath(`/admin/jobs/${params.id}`);
  return NextResponse.json({
    ok: true,
    sms_sid: result.sms_sid ?? null,
    email_id: result.email_id ?? null,
  });
}

function reasonMessage(reason: string | undefined): string {
  switch (reason) {
    case "no_contact":         return "This client has no phone or email on file.";
    case "already_responded":  return "The client has already responded to a review request for this job.";
    default:                   return "Could not send review request.";
  }
}

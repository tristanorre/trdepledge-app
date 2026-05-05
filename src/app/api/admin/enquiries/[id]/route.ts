import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import type { EnquiryStatus } from "@/lib/types";

export const runtime = "nodejs";

const VALID_STATUS: readonly EnquiryStatus[] = ["new", "contacted", "converted", "closed"];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { data, error } = await supabase
    .from("enquiries")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    console.error("[admin/enquiries/:id GET]", error);
    return NextResponse.json({ error: "Could not load enquiry" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ enquiry: data });
}

// PATCH — update status and/or notes. Status 'converted' is set
// automatically by the /convert endpoint; setting it here is allowed but
// won't link a job — use /convert if you want a job to be created.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if ("status" in body) {
    if (!(VALID_STATUS as readonly string[]).includes(String(body.status))) {
      return NextResponse.json({ error: "status invalid" }, { status: 400 });
    }
    patch.status = body.status;
  }
  if ("notes" in body) {
    patch.notes = body.notes ? String(body.notes).trim() : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("enquiries")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    console.error("[admin/enquiries/:id PATCH]", error);
    return NextResponse.json({ error: "Could not update enquiry" }, { status: 500 });
  }
  return NextResponse.json({ enquiry: data });
}

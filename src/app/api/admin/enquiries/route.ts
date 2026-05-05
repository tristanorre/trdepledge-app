import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import type { EnquiryStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUS: readonly EnquiryStatus[] = ["new", "contacted", "converted", "closed"];

// GET /api/admin/enquiries
//   ?status=new|contacted|converted|closed   (default: all)
//   ?limit=N                                 (default 100)
export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  let q = supabase
    .from("enquiries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && (VALID_STATUS as readonly string[]).includes(status)) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    console.error("[admin/enquiries GET]", error);
    return NextResponse.json({ error: "Could not load enquiries" }, { status: 500 });
  }
  return NextResponse.json({ enquiries: data ?? [] });
}

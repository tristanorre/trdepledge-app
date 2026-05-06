import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { writeAuditEntry } from "@/lib/audit";
import { sanitiseLikeText } from "@/lib/sanitise";
import {
  ASSET_CATEGORIES, ASSET_CONDITIONS,
  type AssetCategory, type AssetCondition,
} from "@/lib/types-inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/inventory
//   ?category=...   one of ASSET_CATEGORIES
//   ?condition=...  one of ASSET_CONDITIONS
//   ?worker=<uuid>  filter to assets assigned to this worker
//   ?worker=pool    unassigned items only
//   ?q=<text>       search name + identifier
export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const condition = url.searchParams.get("condition");
  const worker = url.searchParams.get("worker");
  const q = url.searchParams.get("q")?.trim();

  let query = supabase
    .from("assets")
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true })
    .limit(500);

  if (category && (ASSET_CATEGORIES as readonly string[]).includes(category)) {
    query = query.eq("category", category);
  }
  if (condition && (ASSET_CONDITIONS as readonly string[]).includes(condition)) {
    query = query.eq("condition", condition);
  }
  if (worker === "pool") query = query.is("assigned_to", null);
  else if (worker) query = query.eq("assigned_to", worker);

  if (q) {
    // Match name OR identifier. PostgREST's `or` requires comma-separated
    // conditions; ilike for case-insensitive substring.
    const safe = sanitiseLikeText(q);
    if (safe) query = query.or(`name.ilike.%${safe}%,identifier.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin/inventory GET]", error);
    return NextResponse.json({ error: "Could not load inventory" }, { status: 500 });
  }
  return NextResponse.json({ assets: data ?? [] });
}

// POST /api/admin/inventory — create a new asset.
// Writes an `asset.created` audit entry on success.
export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = String(body.name ?? "").trim();
  const category = String(body.category ?? "");
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!(ASSET_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: "category invalid" }, { status: 400 });
  }
  const condition = (ASSET_CONDITIONS as readonly string[]).includes(String(body.condition))
    ? (body.condition as AssetCondition)
    : "Good";
  const assigned_to = body.assigned_to ? String(body.assigned_to) : null;

  const insert = {
    name,
    category: category as AssetCategory,
    identifier: body.identifier ? String(body.identifier).trim() : null,
    icon: body.icon ? String(body.icon).slice(0, 8) : null,
    condition,
    assigned_to,
    notes: body.notes ? String(body.notes).trim() : null,
  };

  const { data, error } = await supabase
    .from("assets")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    console.error("[admin/inventory POST]", error);
    return NextResponse.json({ error: "Could not create asset" }, { status: 500 });
  }

  await writeAuditEntry(supabase, {
    action: "asset.created",
    item_id: data.id,
    item_name: data.name,
    to_worker_id: assigned_to,
    performed_by: session.user.id,
    note: assigned_to ? "Created and assigned" : "Created (in pool)",
  });

  return NextResponse.json({ asset: data }, { status: 201 });
}

import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { writeAuditEntry } from "@/lib/audit";
import {
  ASSET_CONDITIONS,
  type Asset, type AssetCondition,
} from "@/lib/types-inventory";

export const runtime = "nodejs";

// GET single asset — used by the detail page.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    console.error("[admin/inventory/:id GET]", error);
    return NextResponse.json({ error: "Could not load asset" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ asset: data });
}

// PATCH — apply changes and write the right audit entry per change.
//
// Multiple fields can change in one PATCH; we emit one audit entry per
// semantic change (assignment vs condition vs notes), so the audit log
// reads naturally even when a single user action moves several fields.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { data: before, error: readErr } = await supabase
    .from("assets")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (readErr || !before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const prev = before as Asset;

  const patch: Record<string, unknown> = {};
  if ("name" in body)        patch.name = String(body.name ?? "").trim() || prev.name;
  if ("identifier" in body)  patch.identifier = body.identifier ? String(body.identifier).trim() : null;
  if ("icon" in body)        patch.icon = body.icon ? String(body.icon).slice(0, 8) : null;

  if ("condition" in body) {
    if (!(ASSET_CONDITIONS as readonly string[]).includes(String(body.condition))) {
      return NextResponse.json({ error: "condition invalid" }, { status: 400 });
    }
    patch.condition = body.condition;
  }

  // assigned_to: null = return to pool. Strings are worker UUIDs.
  let assignedToProvided = false;
  let nextAssignedTo: string | null = prev.assigned_to;
  if ("assigned_to" in body) {
    assignedToProvided = true;
    nextAssignedTo = body.assigned_to ? String(body.assigned_to) : null;
    patch.assigned_to = nextAssignedTo;
  }

  if ("notes" in body) patch.notes = body.notes ? String(body.notes).trim() : null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: after, error: updateErr } = await supabase
    .from("assets")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (updateErr) {
    console.error("[admin/inventory/:id PATCH]", updateErr);
    return NextResponse.json({ error: "Could not update asset" }, { status: 500 });
  }

  // Audit log: emit per-semantic-change entries.
  const tasks: Promise<unknown>[] = [];

  if (assignedToProvided && prev.assigned_to !== nextAssignedTo) {
    if (!prev.assigned_to && nextAssignedTo) {
      tasks.push(writeAuditEntry(supabase, {
        action: "asset.assigned",
        item_id: prev.id, item_name: prev.name,
        from_worker_id: null, to_worker_id: nextAssignedTo,
        performed_by: session.user.id,
      }));
    } else if (prev.assigned_to && !nextAssignedTo) {
      tasks.push(writeAuditEntry(supabase, {
        action: "asset.returned",
        item_id: prev.id, item_name: prev.name,
        from_worker_id: prev.assigned_to, to_worker_id: null,
        performed_by: session.user.id,
        note: "Returned to pool",
      }));
    } else {
      tasks.push(writeAuditEntry(supabase, {
        action: "asset.reassigned",
        item_id: prev.id, item_name: prev.name,
        from_worker_id: prev.assigned_to, to_worker_id: nextAssignedTo,
        performed_by: session.user.id,
      }));
    }
  }

  if ("condition" in patch && prev.condition !== (patch.condition as AssetCondition)) {
    tasks.push(writeAuditEntry(supabase, {
      action: "asset.condition_changed",
      item_id: prev.id, item_name: prev.name,
      performed_by: session.user.id,
      note: `${prev.condition} → ${patch.condition as string}`,
    }));
  }

  if ("notes" in patch && prev.notes !== (patch.notes as string | null)) {
    tasks.push(writeAuditEntry(supabase, {
      action: "asset.notes_changed",
      item_id: prev.id, item_name: prev.name,
      performed_by: session.user.id,
      // Don't echo the full new note — just signal the change.
      note: patch.notes ? "Notes updated" : "Notes cleared",
    }));
  }

  await Promise.all(tasks);

  return NextResponse.json({ asset: after });
}

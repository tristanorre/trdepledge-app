import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";

// GET — list the job's material line items, joined with catalogue data
//       so the UI / cost helper get name + unit + base price in one call.
// POST — add a line. Body: { material_id, qty, markup_percent? }
//        Default markup is taken from config.default_markup_percent.

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const { data, error } = await supabase
    .from("job_materials")
    .select(`
      id, job_id, material_id, qty, markup_percent,
      materials_catalogue:material_id ( name, unit, base_price_cents )
    `)
    .eq("job_id", params.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[admin job materials GET]", error);
    return NextResponse.json({ error: "Could not load materials" }, { status: 500 });
  }

  // Flatten the join so the response is a flat list — the catalogue join
  // is a one-to-one and the nested shape is awkward to consume.
  const flat = (data ?? []).map((row: any) => ({
    id: row.id,
    job_id: row.job_id,
    material_id: row.material_id,
    qty: Number(row.qty),
    markup_percent: row.markup_percent,
    name: row.materials_catalogue?.name ?? "(unknown)",
    unit: row.materials_catalogue?.unit ?? "",
    base_price_cents: row.materials_catalogue?.base_price_cents ?? 0,
  }));
  return NextResponse.json({ lines: flat });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { material_id?: unknown; qty?: unknown; markup_percent?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const material_id = String(body.material_id ?? "");
  const qty = Number(body.qty);
  if (!material_id) return NextResponse.json({ error: "material_id required" }, { status: 400 });
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "qty must be > 0" }, { status: 400 });
  }

  // Markup default comes from config — load if not supplied.
  let markup = Number(body.markup_percent);
  if (!Number.isFinite(markup) || markup < 0) {
    const { data: cfg } = await supabase
      .from("config")
      .select("value")
      .eq("key", "default_markup_percent")
      .maybeSingle();
    markup = cfg ? Number(cfg.value) : 20;
  }

  const { data, error } = await supabase
    .from("job_materials")
    .insert({
      job_id: params.id,
      material_id,
      qty,
      markup_percent: Math.round(markup),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[admin job materials POST]", error);
    return NextResponse.json({ error: "Could not add material" }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}

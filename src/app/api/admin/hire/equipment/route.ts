import { NextResponse } from "next/server";

import { slugify, toDbAmount, validateEquipment } from "@/lib/hire";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNIQUE_VIOLATION = "23505";

// Add a piece of equipment to the floor.
export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const check = validateEquipment(body as never);
  if (!check.ok) {
    return NextResponse.json({ error: check.message, problems: check.problems }, { status: 400 });
  }
  const v = check.value;

  // The slug is derived, not supplied — it's the public URL key and the
  // handle Doug's tools use, so it shouldn't be free text from a form.
  const base = slugify(v.name);
  if (!base) {
    return NextResponse.json(
      { error: "That name doesn't make a usable web address. Try plainer wording." },
      { status: 400 },
    );
  }

  try {
    // A duplicate name is a realistic mistake (two mixers), so suffix rather
    // than reject: "cement-mixer", "cement-mixer-2", …
    for (let attempt = 0; attempt < 20; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;

      const { data, error } = await supabase
        .from("equipment")
        .insert({
          slug,
          name: v.name,
          category: v.category,
          blurb: v.blurb,
          specs: v.specs,
          daily_rate: toDbAmount(v.dailyRateCents),
          bond: toDbAmount(v.bondCents),
          photo_path: v.photoPath,
          flyer_path: v.flyerPath,
          is_published: v.isPublished,
          sort_order: v.sortOrder,
          changeover_days: v.changeoverDays,
        })
        .select("id, slug")
        .single();

      if (!error) return NextResponse.json({ ok: true, id: data.id, slug: data.slug });

      if ((error as { code?: string }).code === UNIQUE_VIOLATION) continue;

      console.error("[admin/hire/equipment] insert failed", error);
      return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
    }

    return NextResponse.json(
      { error: "There are already a lot of items with that name. Give this one something distinct." },
      { status: 409 },
    );
  } catch (err) {
    console.error("[admin/hire/equipment] unexpected failure", err);
    return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
  }
}

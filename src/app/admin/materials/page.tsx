import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import MaterialsCatalogueTable from "@/components/MaterialsCatalogueTable";
import type { MaterialCatalogueRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminMaterialsPage() {
  await requireAdmin();
  const supabase = getServiceClient();

  let materials: MaterialCatalogueRow[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("materials_catalogue")
      .select("id, name, unit, base_price_cents, category, active, quantity_on_hand")
      .order("category", { ascending: true, nullsFirst: true })
      .order("name");
    materials = (data ?? []) as MaterialCatalogueRow[];
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)", margin: 0 }}>
          Materials
        </h1>
      </div>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
        Catalogue of materials you bill for. Same list feeds the &quot;Add line&quot; picker on every job.
        Quantity on hand is for your own stock tracking — it doesn&apos;t deduct automatically when a
        line is added to a job (you adjust it here).
      </p>

      <MaterialsCatalogueTable initial={materials} />
    </div>
  );
}

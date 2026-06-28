import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import ConditionPill from "@/components/ConditionPill";
import AssetManagePanel from "@/components/AssetManagePanel";
import AssetImageUploader from "@/components/AssetImageUploader";
import { signAssetImageUrl } from "@/lib/storage";
import type { Asset } from "@/lib/types-inventory";
import type { WorkerListEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = getServiceClient();
  if (!supabase) return <p>Database not configured.</p>;

  const [{ data: assetData }, { data: workersData }] = await Promise.all([
    supabase.from("assets").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("users").select("id, name, colour")
      .or("role.eq.worker,field_worker.eq.true").eq("active", true).order("name"),
  ]);

  if (!assetData) notFound();
  const asset = assetData as Asset;
  const workers = (workersData ?? []) as WorkerListEntry[];
  const owner = asset.assigned_to ? workers.find((w) => w.id === asset.assigned_to) : null;

  // Sign the image URL server-side so the page renders with the
  // image visible immediately — no client-side fetch round-trip.
  const imageUrl = await signAssetImageUrl(supabase, asset.image_path);

  return (
    <div>
      <Link href="/admin/inventory" style={backLinkStyle}>← Inventory</Link>

      <div style={headerStyle}>
        {/* Header thumbnail: uploaded image when present, emoji
            fallback otherwise. The full-size image + uploader sit
            in the Image card below. */}
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={asset.name}
            style={{
              width: 56, height: 56, objectFit: "cover",
              borderRadius: 10, flex: "0 0 auto",
            }}
          />
        ) : (
          <div style={{ fontSize: 36, lineHeight: 1, width: 48, textAlign: "center" }}>
            {asset.icon ?? "📦"}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={titleStyle}>{asset.name}</h1>
          <div style={{ color: "var(--gray)", fontSize: 13, marginTop: 4 }}>
            {asset.category}
            {asset.identifier && <span> · {asset.identifier}</span>}
          </div>
        </div>
        <ConditionPill condition={asset.condition} />
      </div>

      {/* Quick state summary */}
      <div style={summaryStyle}>
        <Row label="Assigned to" value={
          owner ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: owner.colour }} />
              {owner.name}
            </span>
          ) : <span style={{ color: "var(--gray)" }}>Equipment Pool (unassigned)</span>
        } />
        <Row label="Last updated" value={new Date(asset.updated_at).toLocaleString("en-AU", {
          day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
        })} />
      </div>

      <div style={{ marginTop: 20 }}>
        <AssetImageUploader
          assetId={asset.id}
          initialUrl={imageUrl}
          emojiFallback={asset.icon}
        />
      </div>

      <AssetManagePanel asset={asset} workers={workers} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "120px 1fr", gap: 12,
      padding: "12px 0", borderBottom: "1px solid var(--gray-light)",
      fontSize: 14,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--gray)" }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

const backLinkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block",
};
const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 16,
  background: "white", borderRadius: 14, padding: 16,
  border: "1px solid rgba(0,0,0,0.06)",
  marginBottom: 12,
  flexWrap: "wrap",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 24, color: "var(--navy)",
  lineHeight: 1.1, margin: 0,
};
const summaryStyle: React.CSSProperties = {
  background: "white", borderRadius: 14, padding: 16,
  border: "1px solid rgba(0,0,0,0.06)",
  marginBottom: 16,
};

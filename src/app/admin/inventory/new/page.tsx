import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import AssetForm from "@/components/AssetForm";
import type { WorkerListEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewAssetPage() {
  await requireAdmin();
  const supabase = getServiceClient();

  let workers: WorkerListEntry[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("users").select("id, name, colour")
      .eq("role", "worker").eq("active", true).order("name");
    workers = (data ?? []) as WorkerListEntry[];
  }

  return (
    <div>
      <Link href="/admin/inventory" style={backLinkStyle}>← Inventory</Link>
      <h1 style={titleStyle}>New asset</h1>
      <AssetForm
        workers={workers}
        submitUrl="/api/admin/inventory"
        submitMethod="POST"
      />
    </div>
  );
}

const backLinkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 20,
};

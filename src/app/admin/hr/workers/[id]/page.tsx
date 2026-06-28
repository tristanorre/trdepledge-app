import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { signAssetImageUrls } from "@/lib/storage";
import ConditionPill from "@/components/ConditionPill";
import type { Asset } from "@/lib/types-inventory";

export const dynamic = "force-dynamic";

type WorkerProfile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  field_worker: boolean;
  colour: string | null;
  employment_start_date: string | null;
  police_check_complete: boolean;
  police_check_date: string | null;
  notes: string | null;
};

type AuditRow = {
  timestamp: string;
  item_id: string | null;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default async function WorkerProfilePage({
  params,
}: { params: { id: string } }) {
  await requireAdmin();
  const supabase = getServiceClient();
  if (!supabase) return <p>Database not configured.</p>;

  // 1. Load the worker — must be an active worker or a field_worker admin.
  const { data: w, error: wErr } = await supabase
    .from("users")
    .select("id, name, email, phone, role, field_worker, colour, employment_start_date, police_check_complete, police_check_date, notes")
    .eq("id", params.id)
    .eq("active", true)
    .or("role.eq.worker,field_worker.eq.true")
    .maybeSingle();
  if (wErr) console.error("[worker profile]", wErr);
  if (!w) notFound();
  const worker = w as WorkerProfile;

  // 2. Load the assets currently allocated to them.
  const { data: assetsRaw } = await supabase
    .from("assets")
    .select("*")
    .eq("assigned_to", worker.id)
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  const assets = (assetsRaw ?? []) as Asset[];

  // 3. Pull the audit log of `asset.assigned` events that handed each
  //    of those assets to this worker, so we can show "allocated on".
  //    We grab them all in one query and pick the most recent per
  //    item_id in JS — usually only a handful per worker.
  let dateByAssetId = new Map<string, string>();
  if (assets.length > 0) {
    const { data: events } = await supabase
      .from("audit_log")
      .select("timestamp, item_id")
      .eq("action", "asset.assigned")
      .eq("to_worker_id", worker.id)
      .in("item_id", assets.map((a) => a.id))
      .order("timestamp", { ascending: false });
    for (const ev of (events ?? []) as AuditRow[]) {
      if (ev.item_id && !dateByAssetId.has(ev.item_id)) {
        // Order is timestamp desc, so the first hit per asset is the
        // most recent assignment to this worker.
        dateByAssetId.set(ev.item_id, ev.timestamp);
      }
    }
  }

  // 4. Sign images so the row thumbnails render. Same helper the
  //    inventory list uses.
  const imageUrlByPath = await signAssetImageUrls(
    supabase,
    assets.map((a) => a.image_path),
  );

  const isFieldAdmin = worker.role === "admin" && worker.field_worker;

  return (
    <div>
      <Link href="/admin/hr/workers" style={backLinkStyle}>← Workers</Link>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{
          width: 18, height: 18, borderRadius: "50%",
          background: worker.colour ?? "#A8D818", flexShrink: 0,
        }} />
        <h1 style={titleStyle}>{worker.name}</h1>
        {isFieldAdmin && <span style={ceoPillStyle}>CEO + field</span>}
        {!isFieldAdmin && worker.role === "admin" && <span style={ceoPillStyle}>Admin</span>}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--gray)", marginBottom: 10 }}>
          Profile
        </div>
        <Row label="Email" value={worker.email ?? "—"} />
        <Row label="Phone" value={worker.phone ?? "—"} />
        <Row label="Started" value={fmtDate(worker.employment_start_date)} />
        <Row
          label="Police check"
          value={
            worker.police_check_complete
              ? `Complete · ${fmtDate(worker.police_check_date)}`
              : "Not complete"
          }
        />
        {worker.notes && <Row label="Notes" value={worker.notes} />}
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          gap: 12, marginBottom: 10, flexWrap: "wrap",
        }}>
          <h2 style={sectionTitleStyle}>
            Allocated inventory <span style={{ color: "var(--gray)", fontWeight: 500 }}>· {assets.length}</span>
          </h2>
          <Link
            href={`/admin/inventory?view=by-worker&worker=${worker.id}`}
            style={inventoryLinkStyle}
          >
            Open in Inventory →
          </Link>
        </div>

        {assets.length === 0 ? (
          <div style={emptyStyle}>
            No inventory currently allocated to {worker.name.split(" ")[0]}.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {assets.map((a) => {
              const allocatedAt = dateByAssetId.get(a.id);
              const imageUrl = a.image_path ? imageUrlByPath.get(a.image_path) ?? null : null;
              return (
                <Link key={a.id} href={`/admin/inventory/${a.id}`} style={assetRowStyle}>
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt=""
                      style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ fontSize: 24, lineHeight: 1, width: 32, textAlign: "center", flexShrink: 0 }}>
                      {a.icon ?? "📦"}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: 14 }}>
                      {a.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>
                      {a.category}
                      {a.identifier && <> · {a.identifier}</>}
                      <> · </>
                      <span style={{ fontWeight: 700, color: "var(--navy)" }}>
                        Allocated {allocatedAt ? fmtDate(allocatedAt) : "(date unknown)"}
                      </span>
                    </div>
                  </div>
                  <ConditionPill condition={a.condition} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "120px 1fr", gap: 12,
      padding: "10px 0", borderBottom: "1px solid var(--gray-light)",
      fontSize: 14,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--gray)" }}>
        {label}
      </div>
      <div style={{ color: "var(--black)" }}>{value}</div>
    </div>
  );
}

const backLinkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1,
};
const ceoPillStyle: React.CSSProperties = {
  background: "var(--lime)", color: "var(--navy)",
  fontSize: 11, fontWeight: 800, letterSpacing: "0.5px",
  textTransform: "uppercase",
  padding: "3px 10px", borderRadius: 999,
};
const cardStyle: React.CSSProperties = {
  background: "white", borderRadius: 14,
  padding: 16, border: "1px solid rgba(0,0,0,0.06)",
  marginTop: 12,
};
const sectionTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 20, color: "var(--navy)",
  lineHeight: 1.1, margin: 0,
};
const inventoryLinkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--navy)", fontWeight: 700,
  textDecoration: "underline", textUnderlineOffset: "3px",
};
const assetRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  background: "white", borderRadius: 12, padding: 12,
  border: "1px solid rgba(0,0,0,0.06)",
  color: "var(--black)",
};
const emptyStyle: React.CSSProperties = {
  background: "white", borderRadius: 12, padding: 24,
  textAlign: "center", color: "var(--gray)", fontSize: 14,
  border: "1px solid rgba(0,0,0,0.06)",
};

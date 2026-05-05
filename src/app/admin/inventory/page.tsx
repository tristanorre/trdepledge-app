import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import ConditionPill from "@/components/ConditionPill";
import {
  ASSET_CATEGORIES, ASSET_CONDITIONS,
  type Asset, type AssetCategory,
} from "@/lib/types-inventory";
import type { WorkerListEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = {
  view?: string;        // "all" (default) | "by-worker"
  category?: string;
  condition?: string;
  worker?: string;
  q?: string;
};

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const supabase = getServiceClient();

  const view = searchParams.view === "by-worker" ? "by-worker" : "all";

  let assets: Asset[] = [];
  let workers: WorkerListEntry[] = [];
  let dbConfigured = !!supabase;
  const q = (searchParams.q ?? "").trim();

  if (supabase) {
    let assetsQuery = supabase
      .from("assets")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);

    if (searchParams.category && (ASSET_CATEGORIES as readonly string[]).includes(searchParams.category)) {
      assetsQuery = assetsQuery.eq("category", searchParams.category);
    }
    if (searchParams.condition && (ASSET_CONDITIONS as readonly string[]).includes(searchParams.condition)) {
      assetsQuery = assetsQuery.eq("condition", searchParams.condition);
    }
    if (searchParams.worker === "pool") assetsQuery = assetsQuery.is("assigned_to", null);
    else if (searchParams.worker)       assetsQuery = assetsQuery.eq("assigned_to", searchParams.worker);

    if (q) {
      const escaped = q.replace(/[,()]/g, " ");
      assetsQuery = assetsQuery.or(`name.ilike.%${escaped}%,identifier.ilike.%${escaped}%`);
    }

    const [{ data: a }, { data: w }] = await Promise.all([
      assetsQuery,
      supabase.from("users").select("id, name, colour").eq("role", "worker").eq("active", true).order("name"),
    ]);
    assets = (a ?? []) as Asset[];
    workers = (w ?? []) as WorkerListEntry[];
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <h1 style={titleStyle}>Inventory</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/inventory/audit" style={secondaryBtn}>Audit log</Link>
          <Link href="/admin/inventory/new" style={primaryBtn}>+ New asset</Link>
        </div>
      </div>

      {/* View toggle */}
      <div style={tabRow}>
        <Tab href={`/admin/inventory?${queryFor(searchParams, { view: "all" })}`} active={view === "all"}>All assets</Tab>
        <Tab href={`/admin/inventory?${queryFor(searchParams, { view: "by-worker" })}`} active={view === "by-worker"}>By worker</Tab>
      </div>

      <form method="GET" style={filterFormStyle}>
        <input type="hidden" name="view" value={view} />
        <input
          type="search" name="q" defaultValue={q}
          placeholder="Search name or identifier…"
          className="form-input"
          style={{ flex: "1 1 200px", minWidth: 0 }}
        />
        <select name="category" defaultValue={searchParams.category ?? ""} className="form-select" style={selectStyle}>
          <option value="">All categories</option>
          {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="condition" defaultValue={searchParams.condition ?? ""} className="form-select" style={selectStyle}>
          <option value="">All conditions</option>
          {ASSET_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="submit" style={applyBtnStyle}>Apply</button>
      </form>

      {!dbConfigured && (
        <Banner>Supabase not configured — set <code>SUPABASE_SERVICE_ROLE_KEY</code> in <code>.env.local</code>.</Banner>
      )}

      {view === "all"
        ? <AllAssetsView assets={assets} workersById={mapById(workers)} />
        : <ByWorkerView assets={assets} workers={workers} />}
    </div>
  );
}

// ── Views ────────────────────────────────────────────────────────────

function AllAssetsView({ assets, workersById }: {
  assets: Asset[];
  workersById: Map<string, WorkerListEntry>;
}) {
  if (assets.length === 0) {
    return <Empty>No assets match these filters.</Empty>;
  }

  // Group by category for visual breathing room.
  const byCat = new Map<AssetCategory, Asset[]>();
  for (const a of assets) {
    if (!byCat.has(a.category)) byCat.set(a.category, []);
    byCat.get(a.category)!.push(a);
  }

  return (
    <>
      {ASSET_CATEGORIES.filter((c) => byCat.has(c)).map((cat) => (
        <section key={cat} style={{ marginBottom: 24 }}>
          <h2 style={categoryHeaderStyle}>{cat} <span style={{ color: "var(--gray)" }}>· {byCat.get(cat)!.length}</span></h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byCat.get(cat)!.map((a) => <AssetRow key={a.id} asset={a} workersById={workersById} />)}
          </div>
        </section>
      ))}
    </>
  );
}

function ByWorkerView({ assets, workers }: { assets: Asset[]; workers: WorkerListEntry[] }) {
  const pool = assets.filter((a) => !a.assigned_to);
  const byWorker = new Map<string, Asset[]>();
  for (const a of assets) {
    if (a.assigned_to) {
      if (!byWorker.has(a.assigned_to)) byWorker.set(a.assigned_to, []);
      byWorker.get(a.assigned_to)!.push(a);
    }
  }

  return (
    <>
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ ...categoryHeaderStyle, color: "var(--lime-dark)" }}>
          Equipment Pool <span style={{ color: "var(--gray)" }}>· {pool.length}</span>
        </h2>
        {pool.length === 0 ? (
          <div style={{ color: "var(--gray)", fontSize: 13, padding: 8 }}>Pool empty — every asset is assigned.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pool.map((a) => <AssetRow key={a.id} asset={a} workersById={new Map()} />)}
          </div>
        )}
      </section>

      {workers.map((w) => {
        const list = byWorker.get(w.id) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={w.id} style={{ marginBottom: 24 }}>
            <h2 style={categoryHeaderStyle}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: w.colour }} />
                {w.name}
              </span>
              <span style={{ color: "var(--gray)" }}> · {list.length}</span>
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {list.map((a) => <AssetRow key={a.id} asset={a} workersById={new Map([[w.id, w]])} />)}
            </div>
          </section>
        );
      })}
    </>
  );
}

function AssetRow({ asset, workersById }: { asset: Asset; workersById: Map<string, WorkerListEntry> }) {
  const owner = asset.assigned_to ? workersById.get(asset.assigned_to) : null;
  return (
    <Link href={`/admin/inventory/${asset.id}`} style={rowStyle}>
      <div style={{ fontSize: 22, lineHeight: 1, width: 28, textAlign: "center", flexShrink: 0 }}>
        {asset.icon ?? "📦"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {asset.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>
          {asset.identifier ?? <em style={{ opacity: 0.7 }}>no identifier</em>}
          {owner && (
            <>
              <span> · </span>
              <span style={{ color: "var(--navy)" }}>
                <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: owner.colour, marginRight: 6, verticalAlign: "middle" }} />
                {owner.name}
              </span>
            </>
          )}
          {!owner && asset.assigned_to && <span> · assigned</span>}
        </div>
      </div>
      <ConditionPill condition={asset.condition} />
    </Link>
  );
}

// ── Tiny helpers ─────────────────────────────────────────────────────

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        background: active ? "var(--navy)" : "transparent",
        color: active ? "white" : "var(--navy)",
        border: "none", padding: "10px 16px",
        borderRadius: 10, fontSize: 13, fontWeight: 700,
        minHeight: 40, display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {children}
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "white", borderRadius: 16, padding: 32,
      textAlign: "center", color: "var(--gray)", fontSize: 14,
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>{children}</div>
  );
}
function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{
      background: "rgba(255, 229, 0, 0.18)",
      border: "1px solid rgba(133, 114, 0, 0.3)",
      color: "#857200", padding: "12px 16px", borderRadius: 10,
      fontSize: 14, marginBottom: 16,
    }}>{children}</div>
  );
}

function mapById(workers: WorkerListEntry[]): Map<string, WorkerListEntry> {
  return new Map(workers.map((w) => [w.id, w]));
}

function queryFor(current: SearchParams, override: Record<string, string>): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...override })) {
    if (v) next.set(k, String(v));
  }
  return next.toString();
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1,
};
const tabRow: React.CSSProperties = {
  display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap",
  background: "var(--off)", padding: 4, borderRadius: 12, alignSelf: "start",
};
const filterFormStyle: React.CSSProperties = {
  display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap",
  background: "white", padding: 12, borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.06)",
};
const selectStyle: React.CSSProperties = { flex: "1 1 140px", minWidth: 0 };
const applyBtnStyle: React.CSSProperties = {
  background: "var(--navy)", color: "white",
  border: "none", borderRadius: 8,
  padding: "10px 16px", fontSize: 13, fontWeight: 700,
  cursor: "pointer", minHeight: 40,
};
const primaryBtn: React.CSSProperties = {
  background: "var(--lime)", color: "var(--navy)",
  padding: "10px 16px", borderRadius: 8,
  fontSize: 13, fontWeight: 800,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minHeight: 40,
};
const secondaryBtn: React.CSSProperties = {
  background: "transparent", color: "var(--navy)",
  border: "1.5px solid var(--navy)",
  padding: "8px 14px", borderRadius: 8,
  fontSize: 13, fontWeight: 700,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minHeight: 40,
};
const categoryHeaderStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, letterSpacing: "1.5px",
  textTransform: "uppercase", color: "var(--navy)",
  marginBottom: 10,
};
const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  background: "white", borderRadius: 12, padding: 12,
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  color: "var(--black)",
};

import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { AUDIT_ACTIONS, type AuditAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

type EntryRow = {
  id: string;
  timestamp: string;
  action: string;
  item_id: string | null;
  item_name: string;
  note: string | null;
  from_worker: { name: string; colour: string } | null;
  to_worker:   { name: string; colour: string } | null;
  performer:   { name: string } | null;
};

const ACTION_META: Record<AuditAction, { label: string; bg: string; fg: string; icon: string }> = {
  "asset.created":           { label: "Created",           bg: "rgba(168,216,24,0.18)", fg: "#3F5C00", icon: "✨" },
  "asset.assigned":          { label: "Assigned",          bg: "rgba(26,79,181,0.14)",  fg: "#1A4FB5", icon: "→" },
  "asset.reassigned":        { label: "Reassigned",        bg: "rgba(26,79,181,0.14)",  fg: "#1A4FB5", icon: "⇄" },
  "asset.returned":          { label: "Returned to pool", bg: "rgba(107,114,128,0.18)",fg: "#4B5563", icon: "↩" },
  "asset.condition_changed": { label: "Condition changed", bg: "rgba(217,119,6,0.16)",  fg: "#B45309", icon: "⚙" },
  "asset.notes_changed":     { label: "Notes updated",     bg: "rgba(107,114,128,0.18)",fg: "#4B5563", icon: "✎" },
};

const ACTION_FILTERS: Array<{ value: string; label: string }> = [
  { value: "",      label: "All actions" },
  ...AUDIT_ACTIONS.map((a) => ({
    value: a,
    label: ACTION_META[a].label,
  })),
];

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  });
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { action?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();

  let entries: EntryRow[] = [];
  let dbConfigured = !!supabase;

  if (supabase) {
    let q = supabase
      .from("audit_log")
      .select(`
        id, timestamp, action, item_id, item_name, note,
        from_worker:from_worker_id ( name, colour ),
        to_worker:to_worker_id     ( name, colour ),
        performer:performed_by     ( name )
      `)
      .order("timestamp", { ascending: false })
      .limit(200);

    if (searchParams.action && (AUDIT_ACTIONS as readonly string[]).includes(searchParams.action)) {
      q = q.eq("action", searchParams.action);
    }

    const { data, error } = await q;
    if (error) console.error("[audit-log page]", error);
    entries = ((data ?? []) as unknown) as EntryRow[];
  }

  return (
    <div>
      <Link href="/admin/inventory" style={backLinkStyle}>← Inventory</Link>
      <h1 style={titleStyle}>Audit log</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
        Append-only history of every inventory change. Database triggers prevent
        edits and deletes — entries cannot be modified once written.
      </p>

      <form method="GET" style={filterFormStyle}>
        <select name="action" defaultValue={searchParams.action ?? ""} className="form-select" style={{ flex: "1 1 200px" }}>
          {ACTION_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="submit" style={applyBtnStyle}>Apply</button>
      </form>

      {!dbConfigured && (
        <Banner>Supabase not configured.</Banner>
      )}

      {dbConfigured && entries.length === 0 && (
        <div style={{ color: "var(--gray)", fontSize: 14, padding: 32, textAlign: "center", background: "white", borderRadius: 14 }}>
          No entries yet — every inventory change will land here.
        </div>
      )}

      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {entries.map((e) => {
          const meta = ACTION_META[e.action as AuditAction] ?? {
            label: e.action, bg: "var(--off)", fg: "var(--gray)", icon: "•",
          };
          return (
            <li key={e.id} style={{
              display: "flex", gap: 12,
              background: "white", borderRadius: 12, padding: 14,
              border: "1px solid rgba(0,0,0,0.06)",
            }}>
              <div style={{
                flexShrink: 0,
                width: 36, height: 36,
                background: meta.bg, color: meta.fg,
                borderRadius: 999,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 800,
              }}>{meta.icon}</div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.5px", color: meta.fg, textTransform: "uppercase" }}>
                    {meta.label}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--gray)" }}>{fmtTimestamp(e.timestamp)}</div>
                </div>

                <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: 14, marginTop: 4 }}>
                  {e.item_id ? (
                    <Link href={`/admin/inventory/${e.item_id}`} style={{ color: "var(--navy)" }}>{e.item_name}</Link>
                  ) : (
                    e.item_name
                  )}
                </div>

                {(e.from_worker || e.to_worker) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 13, color: "var(--gray)", flexWrap: "wrap" }}>
                    {e.from_worker ? <WorkerChip w={e.from_worker} /> : <span>Pool</span>}
                    <span>→</span>
                    {e.to_worker ? <WorkerChip w={e.to_worker} /> : <span>Pool</span>}
                  </div>
                )}

                {e.note && (
                  <div style={{ fontSize: 13, color: "#444", marginTop: 6, lineHeight: 1.5 }}>{e.note}</div>
                )}

                {e.performer && (
                  <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 6 }}>
                    by {e.performer.name}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WorkerChip({ w }: { w: { name: string; colour: string } }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--navy)", fontWeight: 600 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: w.colour }} />
      {w.name}
    </span>
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

const backLinkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};
const filterFormStyle: React.CSSProperties = {
  display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap",
  background: "white", padding: 12, borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.06)",
};
const applyBtnStyle: React.CSSProperties = {
  background: "var(--navy)", color: "white",
  border: "none", borderRadius: 8,
  padding: "10px 16px", fontSize: 13, fontWeight: 700,
  cursor: "pointer", minHeight: 40,
};

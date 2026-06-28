import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import LeaveActions from "@/components/LeaveActions";
import { fmtDayShort } from "@/lib/dates";

export const dynamic = "force-dynamic";

type LeaveRow = {
  id: string;
  worker_id: string;
  type: string;
  from_date: string;
  to_date: string;
  reason: string | null;
  status: "pending" | "approved" | "declined";
  submitted_at: string;
  reviewed_at: string | null;
  worker: { name: string; colour: string } | null;
};

type Balance = {
  worker_id: string;
  annual_total: number; annual_used: number;
  sick_total: number;   sick_used: number;
  personal_total: number; personal_used: number;
};

const STATUS_OPTIONS = [
  { v: "pending",  label: "Pending"  },
  { v: "approved", label: "Approved" },
  { v: "declined", label: "Declined" },
  { v: "all",      label: "All"      },
];

export default async function AdminLeavePage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();
  const status = searchParams.status ?? "pending";

  let requests: LeaveRow[] = [];
  let balances = new Map<string, Balance>();
  let workersById = new Map<string, { name: string; colour: string }>();

  if (supabase) {
    let q = supabase
      .from("leave_requests")
      .select(`
        id, worker_id, type, from_date, to_date, reason,
        status, submitted_at, reviewed_at,
        worker:worker_id ( name, colour )
      `)
      .order("submitted_at", { ascending: false })
      .limit(100);
    if (status !== "all") q = q.eq("status", status);
    const { data: reqs } = await q;
    requests = ((reqs ?? []) as unknown) as LeaveRow[];

    const year = new Date().getFullYear();
    const [{ data: bal }, { data: ws }] = await Promise.all([
      supabase
        .from("leave_balances")
        .select("worker_id, annual_total, annual_used, sick_total, sick_used, personal_total, personal_used")
        .eq("year", year),
      supabase.from("users").select("id, name, colour").or("role.eq.worker,field_worker.eq.true").eq("active", true).order("name"),
    ]);
    if (bal) balances = new Map(bal.map((b) => [b.worker_id, b as Balance]));
    if (ws)  workersById = new Map(ws.map((w) => [w.id, { name: w.name, colour: w.colour }]));
  }

  return (
    <div>
      <Link href="/admin/hr" style={backLinkStyle}>← HR</Link>
      <h1 style={titleStyle}>Leave requests</h1>

      <form method="GET" style={filterFormStyle}>
        <select name="status" defaultValue={status} className="form-select" style={{ flex: "1 1 200px" }}>
          {STATUS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <button type="submit" style={applyBtnStyle}>Apply</button>
      </form>

      {/* Balances panel */}
      <h2 style={sectionHeader}>Balances · this year</h2>
      <div style={balancesGrid}>
        {Array.from(workersById.entries()).map(([id, w]) => {
          const b = balances.get(id);
          return (
            <div key={id} style={balanceCardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: w.colour }} />
                <span style={{ fontWeight: 800, color: "var(--navy)", fontSize: 14 }}>{w.name}</span>
              </div>
              <BalRow label="Annual"   used={b?.annual_used ?? 0}   total={b?.annual_total ?? 20} />
              <BalRow label="Sick"     used={b?.sick_used ?? 0}     total={b?.sick_total ?? 10} />
              <BalRow label="Personal" used={b?.personal_used ?? 0} total={b?.personal_total ?? 2} />
            </div>
          );
        })}
        {workersById.size === 0 && (
          <div style={{ color: "var(--gray)", fontSize: 13 }}>No active workers.</div>
        )}
      </div>

      {/* Requests list */}
      <h2 style={{ ...sectionHeader, marginTop: 28 }}>
        Requests · {status === "all" ? "all" : status}
      </h2>
      {requests.length === 0 ? (
        <div style={{ color: "var(--gray)", fontSize: 14, padding: 24, textAlign: "center", background: "white", borderRadius: 14 }}>
          No requests in this view.
        </div>
      ) : (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {requests.map((r) => (
            <li key={r.id} style={requestCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {r.worker?.colour && <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.worker.colour }} />}
                    <span style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>{r.worker?.name ?? "(unknown)"}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--gray)", marginTop: 4 }}>
                    {r.type} · {fmtDayShort(r.from_date)} → {fmtDayShort(r.to_date)}
                  </div>
                </div>
                <StatusPill s={r.status} />
              </div>
              {r.reason && (
                <div style={{ fontSize: 13, color: "#444", marginBottom: 10, lineHeight: 1.5 }}>
                  {r.reason}
                </div>
              )}
              {r.status === "pending" ? (
                <LeaveActions requestId={r.id} />
              ) : (
                <div style={{ fontSize: 12, color: "var(--gray)" }}>
                  {r.status === "approved" ? "Approved" : "Declined"}
                  {r.reviewed_at && ` ${new Date(r.reviewed_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BalRow({ label, used, total }: { label: string; used: number; total: number }) {
  const remaining = Math.max(0, total - used);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: "var(--gray)" }}>{label}</span>
        <span style={{ color: "var(--navy)", fontWeight: 700 }}>{remaining} / {total} d</span>
      </div>
      <div style={{ height: 4, background: "var(--gray-light)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: pct > 80 ? "#DC2626" : "var(--lime)" }} />
      </div>
    </div>
  );
}

function StatusPill({ s }: { s: "pending" | "approved" | "declined" }) {
  const m = {
    pending:  { bg: "rgba(255,229,0,0.20)", fg: "#857200", label: "Pending" },
    approved: { bg: "rgba(34,134,58,0.14)", fg: "#15803D", label: "Approved" },
    declined: { bg: "rgba(220,38,38,0.14)", fg: "#B91C1C", label: "Declined" },
  }[s];
  return (
    <span style={{
      background: m.bg, color: m.fg,
      fontSize: 11, fontWeight: 800, letterSpacing: "0.5px",
      textTransform: "uppercase", padding: "4px 10px", borderRadius: 999,
    }}>{m.label}</span>
  );
}

const backLinkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 8,
};
const filterFormStyle: React.CSSProperties = {
  display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap",
  background: "white", padding: 12, borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.06)",
};
const applyBtnStyle: React.CSSProperties = {
  background: "var(--navy)", color: "white",
  border: "none", borderRadius: 8,
  padding: "10px 16px", fontSize: 13, fontWeight: 700,
  cursor: "pointer", minHeight: 40,
};
const sectionHeader: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, letterSpacing: "1.5px",
  textTransform: "uppercase", color: "var(--gray)", marginBottom: 10,
};
const balancesGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};
const balanceCardStyle: React.CSSProperties = {
  background: "white", borderRadius: 12, padding: 14,
  border: "1px solid rgba(0,0,0,0.06)",
};
const requestCardStyle: React.CSSProperties = {
  background: "white", borderRadius: 14, padding: 16,
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};

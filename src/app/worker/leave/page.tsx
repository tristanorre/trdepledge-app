import { requireWorker } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import LeaveRequestForm from "@/components/LeaveRequestForm";
import { fmtDayShort } from "@/lib/dates";

export const dynamic = "force-dynamic";

type LeaveRow = {
  id: string;
  type: string;
  from_date: string;
  to_date: string;
  reason: string | null;
  status: "pending" | "approved" | "declined";
  submitted_at: string;
  reviewed_at: string | null;
};

type Balance = {
  annual_total: number; annual_used: number;
  sick_total: number;   sick_used: number;
  personal_total: number; personal_used: number;
};

const DEFAULT_BALANCE: Balance = {
  annual_total: 20, annual_used: 0,
  sick_total: 10, sick_used: 0,
  personal_total: 2, personal_used: 0,
};

export default async function WorkerLeavePage() {
  const session = await requireWorker();
  const supabase = getServiceClient();

  let requests: LeaveRow[] = [];
  let balance: Balance = DEFAULT_BALANCE;
  const year = new Date().getFullYear();

  if (supabase) {
    const [{ data: reqs }, { data: bal }] = await Promise.all([
      supabase
        .from("leave_requests")
        .select("id, type, from_date, to_date, reason, status, submitted_at, reviewed_at")
        .eq("worker_id", session.user.id)
        .order("submitted_at", { ascending: false })
        .limit(50),
      supabase
        .from("leave_balances")
        .select("annual_total, annual_used, sick_total, sick_used, personal_total, personal_used")
        .eq("worker_id", session.user.id)
        .eq("year", year)
        .maybeSingle(),
    ]);
    requests = (reqs ?? []) as LeaveRow[];
    if (bal) balance = bal as Balance;
  }

  return (
    <div>
      <h1 style={titleStyle}>Leave</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20 }}>
        Your balance for {year}, plus a form to submit new requests.
      </p>

      <div style={balanceGridStyle}>
        <BalanceCard label="Annual"   used={balance.annual_used}   total={balance.annual_total} />
        <BalanceCard label="Sick"     used={balance.sick_used}     total={balance.sick_total} />
        <BalanceCard label="Personal" used={balance.personal_used} total={balance.personal_total} />
      </div>

      <h2 style={sectionHeader}>Submit a request</h2>
      <div style={cardStyle}>
        <LeaveRequestForm />
      </div>

      <h2 style={sectionHeader}>Your requests</h2>
      {requests.length === 0 ? (
        <div style={{ color: "var(--gray)", fontSize: 13, padding: 24, textAlign: "center", background: "white", borderRadius: 14 }}>
          No requests submitted yet.
        </div>
      ) : (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {requests.map((r) => (
            <li key={r.id} style={requestRow}>
              <div>
                <div style={{ fontWeight: 800, color: "var(--navy)" }}>{r.type}</div>
                <div style={{ fontSize: 13, color: "var(--gray)", marginTop: 2 }}>
                  {fmtDayShort(r.from_date)} → {fmtDayShort(r.to_date)}
                </div>
                {r.reason && (
                  <div style={{ fontSize: 13, color: "#444", marginTop: 6 }}>{r.reason}</div>
                )}
              </div>
              <StatusPill s={r.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BalanceCard({ label, used, total }: { label: string; used: number; total: number }) {
  const remaining = Math.max(0, total - used);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--gray)", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)", lineHeight: 1 }}>
        {remaining}<span style={{ fontSize: 14, color: "var(--gray)" }}> / {total}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>days remaining</div>
      <div style={{ height: 4, background: "var(--gray-light)", borderRadius: 999, overflow: "hidden", marginTop: 8 }}>
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
      background: m.bg, color: m.fg, alignSelf: "start",
      fontSize: 11, fontWeight: 800, letterSpacing: "0.5px",
      textTransform: "uppercase", padding: "4px 10px", borderRadius: 999,
    }}>{m.label}</span>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};
const sectionHeader: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, letterSpacing: "1.5px",
  textTransform: "uppercase", color: "var(--gray)", margin: "24px 0 10px",
};
const balanceGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
};
const cardStyle: React.CSSProperties = {
  background: "white", borderRadius: 14, padding: 16,
  border: "1px solid rgba(0,0,0,0.06)",
};
const requestRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12,
  background: "white", borderRadius: 12, padding: 14,
  border: "1px solid rgba(0,0,0,0.06)",
};

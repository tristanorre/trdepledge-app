import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminHrLandingPage() {
  await requireAdmin();
  const supabase = getServiceClient();

  let pendingLeave = 0;
  let workerCount = 0;

  if (supabase) {
    const [pl, wc] = await Promise.all([
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "worker").eq("active", true),
    ]);
    pendingLeave = pl.count ?? 0;
    workerCount = wc.count ?? 0;
  }

  return (
    <div>
      <h1 style={titleStyle}>HR &amp; Rostering</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20 }}>
        Manage the team, set the weekly roster, action leave requests.
      </p>

      <div style={cardsGrid}>
        <Card
          href="/admin/hr/roster"
          title="Roster"
          desc="Set working days and hours for each worker, week by week."
          stat={`${workerCount} active worker${workerCount === 1 ? "" : "s"}`}
        />
        <Card
          href="/admin/hr/leave"
          title="Leave requests"
          desc="Approve or decline submitted leave; view balances per worker."
          stat={pendingLeave > 0 ? `${pendingLeave} pending` : "All actioned"}
          badge={pendingLeave > 0}
        />
        <Card
          href="/admin/hr/payroll"
          title="Payroll"
          desc="Hours from completed jobs, exportable as CSV for Xero."
          stat="View this week →"
        />
      </div>
    </div>
  );
}

function Card({
  href, title, desc, stat, badge,
}: { href: string; title: string; desc: string; stat: string; badge?: boolean }) {
  return (
    <Link href={href} style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--navy)", lineHeight: 1.1 }}>
          {title}
        </h2>
        {badge && (
          <span style={{
            background: "var(--lime)", color: "var(--navy)",
            fontSize: 10, fontWeight: 800, padding: "3px 8px",
            borderRadius: 999, letterSpacing: "0.5px", textTransform: "uppercase",
          }}>New</span>
        )}
      </div>
      <p style={{ color: "var(--gray)", fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{desc}</p>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>{stat} →</div>
    </Link>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};
const cardsGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};
const cardStyle: React.CSSProperties = {
  display: "block", background: "white", borderRadius: 14,
  padding: 20, border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  color: "var(--black)",
};

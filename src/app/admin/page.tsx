import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { todayISO } from "@/lib/dates";

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await requireAdmin();
  const supabase = getServiceClient();
  const today = todayISO();
  const todayLabel = new Date().toLocaleDateString("en-AU", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Cheap parallel counts. Even at scale these are millisecond-level.
  let todayJobs = 0;
  let pendingReview = 0;
  let newEnquiries = 0;
  let needsAttention = 0;

  if (supabase) {
    const [today1, pending1, enq1, atten1] = await Promise.all([
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("date", today),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
      supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
      supabase.from("assets").select("id", { count: "exact", head: true }).in("condition", ["Needs Service", "Damaged"]),
    ]);
    todayJobs      = today1.count ?? 0;
    pendingReview  = pending1.count ?? 0;
    newEnquiries   = enq1.count ?? 0;
    needsAttention = atten1.count ?? 0;
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, color: "var(--navy)", lineHeight: 1.1 }}>
          {greeting()}, {session.user.name.split(" ")[0]}
        </h1>
        <div style={{ color: "var(--gray)", fontSize: 14, marginTop: 4 }}>{todayLabel}</div>
      </div>

      <div style={statsGridStyle}>
        <Stat href="/admin/jobs?date=today" label="Today's jobs"      value={todayJobs} accent="var(--lime)" todayLink={today} />
        <Stat href="/admin/jobs?status=pending_review" label="Pending review" value={pendingReview} accent="#FFE500" />
        <Stat href="/admin/enquiries?status=new" label="New enquiries"  value={newEnquiries}  accent="#1A4FB5" />
        <Stat href="/admin/inventory" label="Items needing attention" value={needsAttention} accent="#DC2626" />
      </div>

      <div style={{ marginTop: 28 }}>
        <h2 style={sectionTitleStyle}>Quick actions</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Action href="/admin/jobs/new" label="+ New job" primary />
          <Action href="/admin/jobs"     label="View jobs" />
          <Action href="/admin/enquiries" label="View enquiries" />
        </div>
      </div>

      <div style={{ marginTop: 28, ...emptyCardStyle }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
        <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>Activity feed coming in Slice 9</div>
        <div style={{ color: "var(--gray)", fontSize: 14, lineHeight: 1.6, maxWidth: 460, margin: "0 auto" }}>
          Recent jobs, enquiries, leave actions, asset moves, and SMS sent will land here once the supporting modules are wired up.
        </div>
      </div>
    </div>
  );
}

function Stat({
  href, label, value, accent, todayLink,
}: { href: string; label: string; value: number; accent: string; todayLink?: string }) {
  // The `?date=today` shortcut is a UX nicety — translate to actual ISO.
  const realHref = todayLink ? href.replace("today", todayLink) : href;
  return (
    <Link href={realHref} style={statCardStyle}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--gray)" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 36, color: "var(--navy)", lineHeight: 1, marginTop: 6 }}>
        {value}
      </div>
      <div style={{ marginTop: 10, height: 3, borderRadius: 2, background: accent }} />
    </Link>
  );
}

function Action({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      style={{
        background: primary ? "var(--lime)" : "transparent",
        color: "var(--navy)",
        border: primary ? "none" : "1.5px solid var(--navy)",
        padding: "12px 20px", borderRadius: 10,
        fontSize: 14, fontWeight: 800,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minHeight: 44,
      }}
    >
      {label}
    </Link>
  );
}

const statsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};
const statCardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 14,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  display: "block",
  color: "var(--black)",
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, letterSpacing: "1.5px",
  textTransform: "uppercase", color: "var(--gray)", marginBottom: 10,
};
const emptyCardStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: 32,
  textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};

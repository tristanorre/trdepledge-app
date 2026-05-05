import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { EnquiryStatusPill } from "@/components/StatusPill";
import type { Enquiry, EnquiryStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: { value: EnquiryStatus | ""; label: string }[] = [
  { value: "",          label: "All" },
  { value: "new",       label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "converted", label: "Converted" },
  { value: "closed",    label: "Closed" },
];

function fmtAge(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export default async function AdminEnquiriesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();

  let enquiries: Enquiry[] = [];
  let dbConfigured = !!supabase;

  if (supabase) {
    let q = supabase
      .from("enquiries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (searchParams.status) q = q.eq("status", searchParams.status);
    const { data, error } = await q;
    if (error) console.error("[admin/enquiries page]", error);
    enquiries = (data ?? []) as Enquiry[];
  }

  return (
    <div>
      <h1 style={titleStyle}>Enquiries</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20 }}>
        Submissions from the public website contact form. Tap an enquiry to view, mark as contacted, or convert into a job.
      </p>

      <form method="GET" style={filterFormStyle}>
        <select name="status" defaultValue={searchParams.status ?? ""} className="form-select" style={{ flex: "1 1 160px" }}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="submit" style={applyBtnStyle}>Apply</button>
      </form>

      {!dbConfigured && (
        <Banner>Supabase not configured — set <code>SUPABASE_SERVICE_ROLE_KEY</code> in <code>.env.local</code>.</Banner>
      )}

      {dbConfigured && enquiries.length === 0 && (
        <div style={emptyStyle}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
          <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>No enquiries yet.</div>
          <div style={{ color: "var(--gray)", fontSize: 14 }}>
            Submissions from the website&apos;s contact form land here.
          </div>
        </div>
      )}

      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
        {enquiries.map((e) => (
          <li key={e.id}>
            <Link href={`/admin/enquiries/${e.id}`} style={enquiryCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 6 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>
                    {e.first_name} {e.last_name}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--gray)", marginTop: 2 }}>
                    {e.suburb} · {e.service_type}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <EnquiryStatusPill status={e.status} />
                  <span style={{ fontSize: 11, color: "var(--gray)" }}>{fmtAge(e.created_at)}</span>
                </div>
              </div>
              {e.message && (
                <div style={{
                  fontSize: 13, color: "#444", lineHeight: 1.5,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                  marginBottom: 6,
                }}>
                  {e.message}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--gray)" }}>
                <span>{e.email}</span>
                {e.phone ? <span>· {e.phone}</span> : <span style={{ color: "#B91C1C" }}>· No phone — email only</span>}
                {e.client_type && <span>· {e.client_type}</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{
      background: "rgba(255, 229, 0, 0.18)",
      border: "1px solid rgba(133, 114, 0, 0.3)",
      color: "#857200",
      padding: "12px 16px", borderRadius: 10,
      fontSize: 14, marginBottom: 20,
    }}>
      {children}
    </div>
  );
}

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
const emptyStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: 40,
  textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};
const enquiryCardStyle: React.CSSProperties = {
  display: "block",
  background: "white", borderRadius: 14, padding: 16,
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  color: "var(--black)",
};

import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import JobCard from "@/components/JobCard";
import type { Job, JobStatus, ClientType } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: { value: JobStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "pending_review", label: "Pending review" },
  { value: "cancelled", label: "Cancelled" },
];
const TYPE_OPTIONS: { value: ClientType | ""; label: string }[] = [
  { value: "", label: "All types" },
  { value: "Private", label: "Private" },
  { value: "NDIS", label: "NDIS" },
  { value: "Aged Care", label: "Aged Care" },
];

type SearchParams = { status?: string; type?: string; date?: string };

export default async function AdminJobsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const supabase = getServiceClient();
  let jobs: Job[] = [];
  let dbConfigured = !!supabase;

  if (supabase) {
    let q = supabase
      .from("jobs")
      .select("*")
      .order("date", { ascending: true, nullsFirst: false })
      .order("scheduled_time", { ascending: true, nullsFirst: false })
      .limit(200);

    if (searchParams.status) q = q.eq("status", searchParams.status);
    if (searchParams.type) q = q.eq("client_type", searchParams.type);
    if (searchParams.date) q = q.eq("date", searchParams.date);

    const { data, error } = await q;
    if (error) console.error("[admin/jobs page]", error);
    jobs = (data ?? []) as Job[];
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)", lineHeight: 1.1 }}>
          Jobs
        </h1>
        <Link
          href="/admin/jobs/new"
          style={{
            background: "var(--lime)", color: "var(--navy)",
            padding: "10px 18px", borderRadius: 8,
            fontSize: 14, fontWeight: 800,
            display: "inline-flex", alignItems: "center", gap: 6,
            minHeight: 40,
          }}
        >
          + New job
        </Link>
      </div>

      <form method="GET" style={filterFormStyle}>
        <select name="status" defaultValue={searchParams.status ?? ""} className="form-select" style={selectStyle}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select name="type" defaultValue={searchParams.type ?? ""} className="form-select" style={selectStyle}>
          {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          type="date"
          name="date"
          defaultValue={searchParams.date ?? ""}
          className="form-input"
          style={selectStyle}
        />
        <button type="submit" style={applyBtnStyle}>Apply</button>
      </form>

      {!dbConfigured && (
        <Banner kind="warning">
          Supabase not configured — set <code>SUPABASE_SERVICE_ROLE_KEY</code> in <code>.env.local</code>.
        </Banner>
      )}

      {dbConfigured && jobs.length === 0 && (
        <div style={emptyStyle}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>No jobs match these filters.</div>
          <div style={{ color: "var(--gray)", fontSize: 14 }}>Tap <strong>+ New job</strong> to create one.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {jobs.map((j) => (
          <JobCard key={j.id} job={j} href={`/admin/jobs/${j.id}`} showWorkerCount />
        ))}
      </div>
    </div>
  );
}

function Banner({ kind, children }: { kind: "warning"; children: React.ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        background: "rgba(255, 229, 0, 0.18)",
        border: "1px solid rgba(133, 114, 0, 0.3)",
        color: "#857200",
        padding: "12px 16px",
        borderRadius: 10,
        fontSize: 14,
        marginBottom: 20,
      }}
    >
      {children}
    </div>
  );
}

const filterFormStyle: React.CSSProperties = {
  display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap",
  background: "white", padding: 12, borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.06)",
};
const selectStyle: React.CSSProperties = {
  flex: "1 1 120px",
  minWidth: 0,
};
const applyBtnStyle: React.CSSProperties = {
  background: "var(--navy)", color: "white",
  border: "none", borderRadius: 8,
  padding: "10px 16px", fontSize: 13, fontWeight: 700,
  cursor: "pointer", minHeight: 40,
};
const emptyStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  padding: 40,
  textAlign: "center",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};

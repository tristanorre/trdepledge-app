import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import JobCard from "@/components/JobCard";
import type { Job, ClientType, WorkerListEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

// Status buttons — Thomas wanted these in place of a status dropdown.
// "Pending allocation" and "Scheduled" are both *virtual* filters
// across the same DB status='scheduled':
//   pending_allocation  → status='scheduled' AND no workers assigned
//   scheduled           → status='scheduled' AND workers assigned
// That keeps them mutually exclusive so a job only ever shows in one
// of the two buckets. Everything else maps 1:1 to the DB status enum.
type StatusKey =
  | "pending_allocation"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "pending_review"
  | "cancelled"
  | "all";

const STATUS_BUTTONS: { key: StatusKey; label: string }[] = [
  { key: "pending_allocation", label: "Pending allocation" },
  { key: "scheduled",          label: "Scheduled" },
  { key: "in_progress",        label: "In progress" },
  { key: "completed",          label: "Completed" },
  { key: "pending_review",     label: "For review" },
  { key: "cancelled",          label: "Cancelled" },
  { key: "all",                label: "All statuses" },
];

const TYPE_OPTIONS: { value: ClientType | ""; label: string }[] = [
  { value: "", label: "All types" },
  { value: "Private", label: "Private" },
  { value: "NDIS", label: "NDIS" },
  { value: "Aged Care", label: "Aged Care" },
];

type SearchParams = { status?: string; type?: string; date?: string; worker?: string };

function resolveStatus(raw: string | undefined): StatusKey {
  const allowed: StatusKey[] = [
    "pending_allocation", "scheduled", "in_progress",
    "completed", "pending_review", "cancelled", "all",
  ];
  if (raw && (allowed as string[]).includes(raw)) return raw as StatusKey;
  // No status param = default to "Pending allocation" — Thomas's
  // most actionable list (jobs needing workers picked).
  return "pending_allocation";
}

// Preserve any non-status filters when building a button's href, so
// clicking a status button doesn't blow away the type/worker/date
// already in the URL.
function buildHref(key: StatusKey, params: SearchParams): string {
  const sp = new URLSearchParams();
  sp.set("status", key);
  if (params.type)   sp.set("type", params.type);
  if (params.worker) sp.set("worker", params.worker);
  if (params.date)   sp.set("date", params.date);
  return `/admin/jobs?${sp.toString()}`;
}

export default async function AdminJobsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const activeStatus = resolveStatus(searchParams.status);
  const supabase = getServiceClient();
  let jobs: Job[] = [];
  let workers: WorkerListEntry[] = [];
  const dbConfigured = !!supabase;

  if (supabase) {
    let q = supabase
      .from("jobs")
      .select("*")
      .order("date", { ascending: true, nullsFirst: false })
      .order("scheduled_time", { ascending: true, nullsFirst: false })
      .limit(200);

    // Status filter — virtual or literal.
    switch (activeStatus) {
      case "pending_allocation":
        // Postgres uuid array literal — '{}' is the empty-array form,
        // accepted by PostgREST as the comparison value.
        q = q.eq("status", "scheduled").eq("assigned_worker_ids", "{}");
        break;
      case "scheduled":
        q = q.eq("status", "scheduled").neq("assigned_worker_ids", "{}");
        break;
      case "all":
        // No status constraint.
        break;
      default:
        q = q.eq("status", activeStatus);
    }

    if (searchParams.type) q = q.eq("client_type", searchParams.type);
    if (searchParams.date) q = q.eq("date", searchParams.date);
    if (searchParams.worker) q = q.contains("assigned_worker_ids", [searchParams.worker]);

    const [{ data: js, error }, { data: ws }] = await Promise.all([
      q,
      // Admins included so Thomas appears in the worker filter dropdown
      // alongside the field crew.
      supabase.from("users").select("id, name, colour")
        .in("role", ["worker", "admin"]).eq("active", true).order("name"),
    ]);
    if (error) console.error("[admin/jobs page]", error);
    jobs = (js ?? []) as Job[];
    workers = (ws ?? []) as WorkerListEntry[];
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)", lineHeight: 1.1 }}>
          Jobs
        </h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href="/admin/jobs/new?status=pending_review"
            // For phone / on-site enquiries that need a quote first.
            // Lands the job in `pending_review` so the Quote estimate
            // panel shows on the detail page.
            style={newQuoteBtnStyle}
            title="For phone / on-site enquiries that need a quote before scheduling"
          >
            + New quote
          </Link>
          <Link
            href="/admin/jobs/new"
            style={newJobBtnStyle}
          >
            + New job
          </Link>
        </div>
      </div>

      {/* Status filter — buttons replace the previous dropdown.
          Default landing (no ?status= in the URL) is Pending allocation. */}
      <div style={statusBtnRowStyle} role="tablist" aria-label="Filter by status">
        {STATUS_BUTTONS.map((b) => {
          const isActive = b.key === activeStatus;
          return (
            <Link
              key={b.key}
              href={buildHref(b.key, searchParams)}
              role="tab"
              aria-selected={isActive}
              style={isActive ? statusBtnActiveStyle : statusBtnStyle}
            >
              {b.label}
            </Link>
          );
        })}
      </div>

      <form method="GET" style={filterFormStyle}>
        {/* Preserve the active status when applying the secondary
            filters (otherwise hitting Apply with no hidden field
            would drop us back to Pending allocation). */}
        <input type="hidden" name="status" value={activeStatus} />
        <select name="type" defaultValue={searchParams.type ?? ""} className="form-select" style={selectStyle}>
          {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select name="worker" defaultValue={searchParams.worker ?? ""} className="form-select" style={selectStyle}>
          <option value="">All workers</option>
          {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
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
          <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>
            No jobs match this view.
          </div>
          <div style={{ color: "var(--gray)", fontSize: 14 }}>
            Switch status above or tap <strong>+ New job</strong> to create one.
          </div>
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

const statusBtnRowStyle: React.CSSProperties = {
  display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap",
};
const statusBtnStyle: React.CSSProperties = {
  background: "white",
  color: "var(--navy)",
  border: "1.5px solid rgba(0,0,0,0.12)",
  borderRadius: 999,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  minHeight: 36,
  transition: "all 0.15s ease",
};
const statusBtnActiveStyle: React.CSSProperties = {
  ...statusBtnStyle,
  background: "var(--navy)",
  color: "white",
  borderColor: "var(--navy)",
};
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
const newJobBtnStyle: React.CSSProperties = {
  background: "var(--lime)", color: "var(--navy)",
  padding: "10px 18px", borderRadius: 8,
  fontSize: 14, fontWeight: 800,
  display: "inline-flex", alignItems: "center", gap: 6,
  minHeight: 40,
};
const newQuoteBtnStyle: React.CSSProperties = {
  background: "white", color: "var(--navy)",
  border: "1.5px solid var(--navy)",
  padding: "10px 18px", borderRadius: 8,
  fontSize: 14, fontWeight: 800,
  display: "inline-flex", alignItems: "center", gap: 6,
  minHeight: 40,
};

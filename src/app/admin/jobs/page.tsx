import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import JobCard from "@/components/JobCard";
import type { Job, ClientType, WorkerListEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

// Status buttons — a row replacing the previous status dropdown.
// Three virtual filters split the underlying status='scheduled' rows
// by how far through the planning workflow each job is:
//
//   pending_allocation  status='scheduled' AND date IS NULL
//                       (job exists but hasn't been allocated to a
//                        day on the calendar — Thomas's queue)
//
//   staff_allocation    status='scheduled' AND date IS NOT NULL
//                                          AND assigned_worker_ids='{}'
//                       (on the calendar but no workers picked yet —
//                        ready for crew assignment)
//
//   scheduled           status='scheduled' AND date IS NOT NULL
//                                          AND assigned_worker_ids<>'{}'
//                       (date + crew assigned — fully ready to run)
//
// Mutually exclusive — a job lives in exactly one of the three. Other
// buttons map 1:1 to the DB status enum. "All statuses" skips the
// filter entirely.
type StatusKey =
  | "pending_allocation"
  | "staff_allocation"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "pending_review"
  | "cancelled"
  | "all";

const STATUS_BUTTONS: { key: StatusKey; label: string }[] = [
  { key: "pending_allocation", label: "Pending allocation" },
  { key: "staff_allocation",   label: "Staff allocation" },
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
    "pending_allocation", "staff_allocation", "scheduled", "in_progress",
    "completed", "pending_review", "cancelled", "all",
  ];
  if (raw && (allowed as string[]).includes(raw)) return raw as StatusKey;
  // No status param = default to "Pending allocation" — Thomas's
  // most actionable list (jobs without a calendar date yet).
  return "pending_allocation";
}

// Preserve any non-status filters when building a button's href, so
// clicking a status button doesn't blow away type/worker/date already
// in the URL.
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
  // Counts shown on each button. Always present (filled with zeros
  // when the DB isn't configured) so the UI layout is stable.
  const counts: Record<StatusKey, number> = {
    pending_allocation: 0,
    staff_allocation: 0,
    scheduled: 0,
    in_progress: 0,
    completed: 0,
    pending_review: 0,
    cancelled: 0,
    all: 0,
  };

  if (supabase) {
    let q = supabase
      .from("jobs")
      .select("*")
      .order("date", { ascending: true, nullsFirst: false })
      .order("scheduled_time", { ascending: true, nullsFirst: false })
      .limit(200);

    switch (activeStatus) {
      case "pending_allocation":
        q = q.eq("status", "scheduled").is("date", null);
        break;
      case "staff_allocation":
        // Scheduled on the calendar but no workers picked yet.
        q = q.eq("status", "scheduled").not("date", "is", null).eq("assigned_worker_ids", "{}");
        break;
      case "scheduled":
        // Calendar date + at least one worker assigned. Fully ready.
        q = q.eq("status", "scheduled").not("date", "is", null).neq("assigned_worker_ids", "{}");
        break;
      case "all":
        break;
      default:
        q = q.eq("status", activeStatus);
    }

    if (searchParams.type) q = q.eq("client_type", searchParams.type);
    if (searchParams.date) q = q.eq("date", searchParams.date);
    if (searchParams.worker) q = q.contains("assigned_worker_ids", [searchParams.worker]);

    // Per-button counts — eight parallel head-only count queries.
    // Cheap (each is a single index scan) and keeps the UI honest
    // about how big each bucket is without polling later.
    const headCount = () => supabase.from("jobs").select("id", { count: "exact", head: true });

    const [
      { data: js, error },
      { data: ws },
      cPending, cStaff, cSched, cInProg, cDone, cReview, cCanc, cAll,
    ] = await Promise.all([
      q,
      supabase.from("users").select("id, name, colour")
        .in("role", ["worker", "admin"]).eq("active", true).order("name"),
      headCount().eq("status", "scheduled").is("date", null),
      headCount().eq("status", "scheduled").not("date", "is", null).eq("assigned_worker_ids", "{}"),
      headCount().eq("status", "scheduled").not("date", "is", null).neq("assigned_worker_ids", "{}"),
      headCount().eq("status", "in_progress"),
      headCount().eq("status", "completed"),
      headCount().eq("status", "pending_review"),
      headCount().eq("status", "cancelled"),
      headCount(),
    ]);
    if (error) console.error("[admin/jobs page]", error);
    jobs = (js ?? []) as Job[];
    workers = (ws ?? []) as WorkerListEntry[];

    counts.pending_allocation = cPending.count ?? 0;
    counts.staff_allocation   = cStaff.count   ?? 0;
    counts.scheduled          = cSched.count   ?? 0;
    counts.in_progress        = cInProg.count  ?? 0;
    counts.completed          = cDone.count    ?? 0;
    counts.pending_review     = cReview.count  ?? 0;
    counts.cancelled          = cCanc.count    ?? 0;
    counts.all                = cAll.count     ?? 0;
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

      {/* Status filter — each button shows a live count of jobs in
          that bucket. Default landing (no ?status= in the URL) is
          Pending allocation. */}
      <div style={statusBtnRowStyle} role="tablist" aria-label="Filter by status">
        {STATUS_BUTTONS.map((b) => {
          const isActive = b.key === activeStatus;
          const count = counts[b.key];
          return (
            <Link
              key={b.key}
              href={buildHref(b.key, searchParams)}
              role="tab"
              aria-selected={isActive}
              style={isActive ? statusBtnActiveStyle : statusBtnStyle}
            >
              <span>{b.label}</span>
              <span style={isActive ? countBadgeActiveStyle : countBadgeStyle}>
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      <form method="GET" style={filterFormStyle}>
        {/* Preserve the active status when applying the secondary
            filters (otherwise hitting Apply would default the page
            back to Pending allocation). */}
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
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minHeight: 36,
  transition: "all 0.15s ease",
};
const statusBtnActiveStyle: React.CSSProperties = {
  ...statusBtnStyle,
  background: "var(--navy)",
  color: "white",
  borderColor: "var(--navy)",
};
const countBadgeStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.06)",
  color: "var(--navy)",
  borderRadius: 999,
  padding: "2px 9px",
  fontSize: 12,
  fontWeight: 800,
  minWidth: 22,
  textAlign: "center",
  lineHeight: 1.4,
};
const countBadgeActiveStyle: React.CSSProperties = {
  ...countBadgeStyle,
  background: "var(--lime)",
  color: "var(--navy)",
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

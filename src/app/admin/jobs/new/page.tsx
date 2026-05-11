import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import JobForm from "@/components/JobForm";
import type { Job, JobStatus, WorkerListEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

// Optional prefill via query string — used by:
//   - Time Allocation Board "tap a free slot":
//       /admin/jobs/new?date=2026-05-06&time=09:00&worker=<uuid>
//   - "New quote" button on /admin/jobs:
//       /admin/jobs/new?status=pending_review
//     Phone / on-site enquiries land here. Creating the job in
//     `pending_review` makes the Quote estimate panel appear straight
//     away on the detail page, so Thomas can work up labour + materials
//     and push it to Xero without a separate enquiry record.
export default async function NewJobPage({
  searchParams,
}: {
  searchParams: { date?: string; time?: string; worker?: string; status?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();

  let workers: WorkerListEntry[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("users")
      .select("id, name, colour")
      // Include admins too so Thomas can self-assign to a job. Other
      // worker-driven views (HR, payroll, roster, /worker login) keep
      // their stricter role='worker' filter.
      .in("role", ["worker", "admin"])
      .eq("active", true)
      .order("name");
    workers = (data ?? []) as WorkerListEntry[];
  }

  // Validate query params before threading them into the form. If a
  // bogus worker UUID lands in the URL we just drop it; the form would
  // catch it on submit anyway.
  const initial: Partial<Job> = {};
  if (searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)) {
    initial.date = searchParams.date;
  }
  if (searchParams.time && /^\d{2}:\d{2}$/.test(searchParams.time)) {
    initial.scheduled_time = `${searchParams.time}:00`;
  }
  if (searchParams.worker && workers.some((w) => w.id === searchParams.worker)) {
    initial.assigned_worker_ids = [searchParams.worker];
  }
  // Only `scheduled` and `pending_review` are valid creation-time statuses.
  // The others (in_progress / completed / cancelled) are state-machine
  // transitions that happen later via the Edit form or worker actions.
  const allowedCreateStatuses: JobStatus[] = ["scheduled", "pending_review"];
  const requestedStatus = searchParams.status as JobStatus | undefined;
  const isQuoteFlow = requestedStatus === "pending_review";
  if (requestedStatus && allowedCreateStatuses.includes(requestedStatus)) {
    initial.status = requestedStatus;
  }

  return (
    <div>
      <Link href="/admin/jobs" style={backLinkStyle}>← All jobs</Link>
      <h1 style={titleStyle}>{isQuoteFlow ? "New quote" : "New job"}</h1>
      {isQuoteFlow && (
        <p style={hintStyle}>
          For phone or on-site enquiries. Fill in what you have now — date,
          time and workers can wait until the customer accepts. After saving
          you&apos;ll land on the job page where you can work up the cost
          estimate and push a draft quote to Xero.
        </p>
      )}
      <JobForm
        initial={initial}
        workers={workers}
        submitUrl="/api/admin/jobs"
        submitMethod="POST"
        // Show the status selector during creation so Thomas can switch
        // between "Scheduled" and "Pending review" if he changes his mind
        // before saving. Defaults to whatever the query param set
        // (or "scheduled" if nothing was passed).
        showStatus
      />
    </div>
  );
}

const backLinkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 20,
};
const hintStyle: React.CSSProperties = {
  fontSize: 14, color: "var(--gray)", lineHeight: 1.6,
  marginTop: -8, marginBottom: 20,
  padding: "12px 14px",
  background: "rgba(26,79,181,0.06)",
  border: "1px solid rgba(26,79,181,0.18)",
  borderRadius: 10,
};

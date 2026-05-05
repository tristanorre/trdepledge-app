import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import JobForm from "@/components/JobForm";
import type { Job, WorkerListEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

// Optional prefill via query string — used by the Time Allocation Board's
// "tap a free slot" flow:
//   /admin/jobs/new?date=2026-05-06&time=09:00&worker=<uuid>
export default async function NewJobPage({
  searchParams,
}: {
  searchParams: { date?: string; time?: string; worker?: string };
}) {
  await requireAdmin();
  const supabase = getServiceClient();

  let workers: WorkerListEntry[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("users")
      .select("id, name, colour")
      .eq("role", "worker")
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

  return (
    <div>
      <Link href="/admin/jobs" style={backLinkStyle}>← All jobs</Link>
      <h1 style={titleStyle}>New job</h1>
      <JobForm
        initial={initial}
        workers={workers}
        submitUrl="/api/admin/jobs"
        submitMethod="POST"
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

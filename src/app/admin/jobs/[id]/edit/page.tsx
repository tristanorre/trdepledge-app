import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import JobForm from "@/components/JobForm";
import type { Job, WorkerListEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditJobPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = getServiceClient();
  if (!supabase) return <p>Database not configured.</p>;

  const [{ data: jobData }, { data: workersData }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("users").select("id, name, colour").eq("role", "worker").eq("active", true).order("name"),
  ]);

  if (!jobData) notFound();
  const job = jobData as Job;
  const workers = (workersData ?? []) as WorkerListEntry[];

  return (
    <div>
      <Link href={`/admin/jobs/${job.id}`} style={backLinkStyle}>← Back to job</Link>
      <h1 style={titleStyle}>Edit job</h1>
      <JobForm
        initial={job}
        workers={workers}
        submitUrl={`/api/admin/jobs/${job.id}`}
        submitMethod="PATCH"
        showStatus
        showDelete
        deleteUrl={`/api/admin/jobs/${job.id}`}
        redirectAfter={(j) => `/admin/jobs/${j.id}`}
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

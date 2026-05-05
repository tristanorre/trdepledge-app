import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import JobForm from "@/components/JobForm";
import type { WorkerListEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
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

  return (
    <div>
      <Link href="/admin/jobs" style={backLinkStyle}>← All jobs</Link>
      <h1 style={titleStyle}>New job</h1>
      <JobForm
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

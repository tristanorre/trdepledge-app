import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import ClientForm from "@/components/ClientForm";
import JobCard from "@/components/JobCard";
import type { Job } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = getServiceClient();
  if (!supabase) return <p>Database not configured.</p>;

  const [{ data: client }, { data: jobs }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("jobs").select("*").eq("client_id", params.id)
      .order("date", { ascending: false, nullsFirst: false })
      .limit(20),
  ]);

  if (!client) notFound();

  return (
    <div>
      <Link href="/admin/clients" style={{ fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block" }}>← Clients</Link>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)", lineHeight: 1.1, marginBottom: 4 }}>
        {client.name}
      </h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20 }}>
        {client.type}
        {client.xero_contact_id && <> · linked to Xero</>}
      </p>

      <ClientForm
        initial={client}
        submitUrl={`/api/admin/clients/${client.id}`}
        submitMethod="PATCH"
        showDelete
        deleteUrl={`/api/admin/clients/${client.id}`}
      />

      {(jobs ?? []).length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--gray)", marginBottom: 10 }}>
            Recent jobs
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {((jobs ?? []) as Job[]).map((j) => (
              <JobCard key={j.id} job={j} href={`/admin/jobs/${j.id}`} showWorkerCount />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

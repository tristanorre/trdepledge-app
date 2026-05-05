import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import ClientForm from "@/components/ClientForm";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  await requireAdmin();
  return (
    <div>
      <Link href="/admin/clients" style={{ fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block" }}>← Clients</Link>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)", lineHeight: 1.1, marginBottom: 20 }}>
        New client
      </h1>
      <ClientForm submitUrl="/api/admin/clients" submitMethod="POST" />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";
import { EnquiryStatusPill } from "@/components/StatusPill";
import EnquiryActions from "@/components/EnquiryActions";
import type { Enquiry } from "@/lib/types";

export const dynamic = "force-dynamic";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  });
}

export default async function EnquiryDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = getServiceClient();
  if (!supabase) return <p>Database not configured.</p>;

  const { data, error } = await supabase
    .from("enquiries")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) console.error("[admin/enquiries/:id page]", error);
  if (!data) notFound();
  const e = data as Enquiry;

  return (
    <div>
      <Link href="/admin/enquiries" style={backLinkStyle}>← All enquiries</Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <h1 style={titleStyle}>{e.first_name} {e.last_name}</h1>
        <EnquiryStatusPill status={e.status} />
      </div>
      <div style={{ color: "var(--gray)", fontSize: 13, marginBottom: 20 }}>
        Received {fmt(e.created_at)}
      </div>

      <div style={cardStyle}>
        <Row label="Email" value={
          <a href={`mailto:${e.email}`} style={linkStyle}>{e.email}</a>
        } />
        <Row label="Phone" value={
          e.phone
            ? <a href={`tel:${e.phone.replace(/\s+/g, "")}`} style={linkStyle}>{e.phone}</a>
            : <span style={{ color: "#B91C1C", fontWeight: 600 }}>No phone — email only</span>
        } />
        <Row label="Suburb"      value={e.suburb} />
        <Row label="Service"     value={e.service_type} />
        <Row label="Client type" value={e.client_type ?? "—"} />
        <Row label="Message"     value={
          e.message
            ? <div style={{ whiteSpace: "pre-wrap" }}>{e.message}</div>
            : <em style={{ color: "var(--gray)" }}>No message</em>
        } />
      </div>

      <div style={{ marginTop: 20 }}>
        <EnquiryActions
          enquiryId={e.id}
          status={e.status}
          convertedToJobId={e.converted_to_job_id}
        />
      </div>

      {e.status === "converted" && e.converted_to_job_id && (
        <div style={{ marginTop: 16, fontSize: 13, color: "var(--gray)" }}>
          This enquiry was converted to a job already.
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "120px 1fr", gap: 12,
      padding: "12px 0", borderBottom: "1px solid var(--gray-light)",
      fontSize: 14,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--gray)" }}>{label}</div>
      <div style={{ color: "var(--black)" }}>{value}</div>
    </div>
  );
}

const backLinkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1,
};
const cardStyle: React.CSSProperties = {
  background: "white", borderRadius: 14, padding: 16,
  border: "1px solid rgba(0,0,0,0.06)",
};
const linkStyle: React.CSSProperties = {
  color: "var(--navy)", textDecoration: "underline", textUnderlineOffset: "3px",
};
